use crate::services::ai_service::AIService;
use crate::services::ai_providers::{ChatMessage, ModelConfig};
use std::sync::{Arc, Mutex};
use tauri::{State, Emitter};

// AI 服务状态（全局单例）
type AIServiceState = Arc<Mutex<AIService>>;

#[tauri::command]
pub async fn ai_autocomplete(
    context: String,
    position: usize,
    max_length: usize,
    service: State<'_, AIServiceState>,
) -> Result<Option<String>, String> {
    // 尝试获取已配置的提供商（优先 DeepSeek，然后是 OpenAI）
    let provider = {
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        // 优先使用 DeepSeek，如果没有则使用 OpenAI
        service_guard.get_provider("deepseek")
            .or_else(|| service_guard.get_provider("openai"))
    };
    
    let provider = provider.ok_or_else(|| {
        "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string()
    })?;
    
    // 调用自动补全
    match provider.autocomplete(&context, max_length).await {
        Ok(result) => Ok(Some(result)),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn ai_inline_assist(
    instruction: String,
    text: String,
    context: String,
    service: State<'_, AIServiceState>,
) -> Result<String, String> {
    // 尝试获取已配置的提供商（优先 DeepSeek，然后是 OpenAI）
    let provider = {
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        // 优先使用 DeepSeek，如果没有则使用 OpenAI
        service_guard.get_provider("deepseek")
            .or_else(|| service_guard.get_provider("openai"))
    };
    
    let provider = provider.ok_or_else(|| {
        "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string()
    })?;
    
    // 调用 Inline Assist
    match provider.inline_assist(&instruction, &text, &context).await {
        Ok(result) => Ok(result),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn ai_chat_stream(
    tab_id: String,
    messages: Vec<ChatMessage>,
    model_config: ModelConfig,
    app: tauri::AppHandle,
    service: State<'_, AIServiceState>,
) -> Result<(), String> {
    // 根据模型选择提供商（优先 DeepSeek）
    let provider_name = if model_config.model.contains("deepseek") {
        "deepseek"
    } else if model_config.model.contains("gpt") {
        "openai"
    } else {
        // 默认优先尝试 DeepSeek，如果没有则使用 OpenAI
        "deepseek"
    };
    
    // 尝试获取提供商（优先选择的，如果没有则尝试另一个）
    let provider = {
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        
        // 优先使用选择的提供商
        if let Some(p) = service_guard.get_provider(provider_name) {
            Some((p, provider_name))
        } else if provider_name == "deepseek" {
            // 如果没有 DeepSeek，尝试 OpenAI
            service_guard.get_provider("openai").map(|p| (p, "openai"))
        } else {
            // 如果没有 OpenAI，尝试 DeepSeek
            service_guard.get_provider("deepseek").map(|p| (p, "deepseek"))
        }
    };
    
    let (provider, _actual_provider_name) = provider.ok_or_else(|| {
        format!("未配置 {} 提供商，请先配置 API key", provider_name)
    })?;
    
    // 创建取消令牌（暂时不使用）
    let (_, mut cancel_rx) = tokio::sync::oneshot::channel();
    
    // 调用流式聊天
    match provider.chat_stream(&messages, &model_config, &mut cancel_rx).await {
        Ok(mut stream) => {
            // 在后台任务中处理流式响应
            let app_handle = app.clone();
            tokio::spawn(async move {
                use tokio_stream::StreamExt;
                
                while let Some(result) = stream.next().await {
                    match result {
                        Ok(chunk) => {
                            // 发送 chunk 到前端
                            let payload = serde_json::json!({
                                "tab_id": tab_id,
                                "chunk": chunk,
                                "done": false,
                            });
                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                eprintln!("发送事件失败: {}", e);
                            }
                        }
                        Err(e) => {
                            // 发送错误
                            let payload = serde_json::json!({
                                "tab_id": tab_id,
                                "chunk": "",
                                "done": true,
                                "error": e.to_string(),
                            });
                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                eprintln!("发送事件失败: {}", e);
                            }
                            break;
                        }
                    }
                }
                
                // 发送完成信号
                let payload = serde_json::json!({
                    "tab_id": tab_id,
                    "chunk": "",
                    "done": true,
                });
                if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                    eprintln!("发送事件失败: {}", e);
                }
            });
            
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn ai_save_api_key(
    provider: String,
    key: String,
    service: State<'_, AIServiceState>,
) -> Result<(), String> {
    let service_guard = service.lock()
        .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
    
    service_guard.save_api_key(&provider, &key)?;
    
    // 重新注册提供商
    if provider == "openai" {
        let openai_provider = Arc::new(
            crate::services::ai_providers::OpenAIProvider::new(key)
        );
        drop(service_guard); // 释放锁
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        service_guard.register_provider("openai".to_string(), openai_provider);
    }
    
    Ok(())
}

#[tauri::command]
pub async fn ai_get_api_key(
    provider: String,
    service: State<'_, AIServiceState>,
) -> Result<Option<String>, String> {
    let service_guard = service.lock()
        .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
    
    match service_guard.get_api_key(&provider) {
        Ok(key) => Ok(Some(key)),
        Err(_) => Ok(None), // 密钥不存在，返回 None
    }
}

#[tauri::command]
pub async fn ai_cancel_request(
    request_id: String,
    service: State<'_, AIServiceState>,
) -> Result<bool, String> {
    let service_guard = service.lock()
        .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
    
    Ok(service_guard.cancel_request(&request_id))
}
