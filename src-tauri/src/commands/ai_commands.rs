use crate::services::ai_service::AIService;
use crate::services::ai_providers::{ChatMessage, ModelConfig, ChatChunk};
use crate::services::document_analysis::{DocumentAnalysisService, AnalysisType};
use crate::services::tool_definitions::get_tool_definitions;
use crate::services::tool_service::{ToolService, ToolCall};
use crate::services::file_watcher::FileWatcherService;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use tauri::{State, Emitter};

/// 验证和规范化工具调用参数
fn validate_and_normalize_arguments(tool_name: &str, args: &serde_json::Value) -> serde_json::Value {
    let mut normalized = args.clone();
    
    // 根据工具类型验证必需参数
    match tool_name {
        "create_file" | "update_file" => {
            // 确保 path 和 content 存在且为字符串
            if let Some(path) = normalized.get("path") {
                if !path.is_string() {
                    if let Some(path_str) = path.as_str() {
                        normalized["path"] = serde_json::json!(path_str);
                    }
                }
            }
            if let Some(content) = normalized.get("content") {
                if !content.is_string() {
                    if let Some(content_str) = content.as_str() {
                        normalized["content"] = serde_json::json!(content_str);
                    }
                }
            }
        }
        "read_file" | "delete_file" | "create_folder" => {
            if let Some(path) = normalized.get("path") {
                if !path.is_string() {
                    if let Some(path_str) = path.as_str() {
                        normalized["path"] = serde_json::json!(path_str);
                    }
                }
            }
        }
        _ => {}
    }
    
    normalized
}

/// 简单的 JSON 修复尝试（后端版本）
fn repair_json_arguments(broken: &str) -> Result<serde_json::Value, ()> {
    let mut repaired = broken.trim().to_string();
    
    // 确保以 { 开头
    if !repaired.starts_with('{') {
        repaired = format!("{{{repaired}");
    }
    
    // 修复键名缺少引号（简单版本，不使用 regex）
    // 查找 pattern: {key: 或 ,key:
    let mut chars: Vec<char> = repaired.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if (chars[i] == '{' || chars[i] == ',') && i + 1 < chars.len() {
            // 跳过空格
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            // 检查是否是键名（字母或下划线开头）
            if j < chars.len() && (chars[j].is_alphabetic() || chars[j] == '_') {
                // 查找冒号
                let mut k = j;
                while k < chars.len() && chars[k] != ':' && !chars[k].is_whitespace() {
                    k += 1;
                }
                // 如果键名没有引号，添加引号
                if chars[j] != '"' && k < chars.len() && chars[k] == ':' {
                    chars.insert(j, '"');
                    chars.insert(k + 1, '"');
                    i = k + 2;
                    continue;
                }
            }
        }
        i += 1;
    }
    repaired = chars.into_iter().collect();
    
    // 修复缺失的结束括号
    if repaired.starts_with('{') && !repaired.ends_with('}') {
        let open = repaired.matches('{').count();
        let close = repaired.matches('}').count();
        let missing = open - close;
        repaired = repaired.trim_end_matches(',').to_string();
        for _ in 0..missing {
            repaired.push('}');
        }
    }
    
    serde_json::from_str(&repaired).map_err(|_| ())
}

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
    tab_id: String, // 注意：前端发送的是 tabId (camelCase)，Tauri 会自动转换为 tab_id (snake_case)
    messages: Vec<ChatMessage>,
    model_config: ModelConfig,
    enable_tools: Option<bool>, // 是否启用工具调用（Agent 模式为 true，Chat 模式为 false）
    app: tauri::AppHandle,
    service: State<'_, AIServiceState>,
    watcher: State<'_, Mutex<FileWatcherService>>,
) -> Result<(), String> {
    // ⚠️ 关键修复：记录 tab_id 以便调试
    eprintln!("📥 收到流式聊天请求: tab_id={}, messages_count={}", tab_id, messages.len());
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
    
    // 根据 enable_tools 参数决定是否获取工具定义（默认为 true，保持向后兼容）
    let enable_tools = enable_tools.unwrap_or(true);
    let tool_definitions = if enable_tools {
        Some(get_tool_definitions())
    } else {
        None
    };
    
    // 构建增强的消息列表，添加系统提示词规范 JSON 格式（仅在启用工具时）
    let mut enhanced_messages = messages.clone();
    
    if enable_tools {
        // 如果没有系统消息，添加一个系统提示词来规范工具调用的 JSON 格式
        let has_system_message = enhanced_messages.iter().any(|m| m.role == "system");
        if !has_system_message {
            enhanced_messages.insert(0, ChatMessage {
                role: "system".to_string(),
                content: "你是一个专业的编程助手。当你调用工具时，必须严格遵守 JSON 格式规范：\n1. 所有键名必须用双引号包裹，例如 \"path\" 而不是 path\n2. 所有字符串值必须用双引号包裹，例如 \"test.md\" 而不是 test.md\n3. JSON 必须完整闭合，以 } 结尾\n4. 不要省略任何引号或括号\n5. 确保 JSON 格式完全正确，可以被 JSON.parse() 解析\n\n示例正确格式：{\"path\":\"test.md\",\"content\":\"# Hello\"}\n错误格式：{path:test.md,content:# Hello} 或 {\"path\":test.md}".to_string(),
            });
        } else {
            // 如果有系统消息，在开头添加 JSON 格式要求
            if let Some(first_msg) = enhanced_messages.first_mut() {
                if first_msg.role == "system" {
                    first_msg.content = format!("{}\n\n重要：调用工具时，必须严格遵守 JSON 格式规范。所有键名和字符串值必须用双引号包裹，JSON 必须完整闭合。", first_msg.content);
                }
            }
        }
    }
    
    // 获取工作区路径（优先从文件监听器获取，否则使用当前目录）
    let workspace_path: PathBuf = {
        let watcher_guard = watcher.lock().unwrap();
        watcher_guard.get_workspace_path()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
    };
    
    // 调用流式聊天（根据模式决定是否传递工具定义）
    match provider.chat_stream(&enhanced_messages, &model_config, &mut cancel_rx, tool_definitions.as_deref()).await {
        Ok(mut stream) => {
            // 在后台任务中处理流式响应
            let app_handle = app.clone();
            let workspace_path = workspace_path.clone();
            let tool_service = ToolService::new();
            
            tokio::spawn(async move {
                use tokio_stream::StreamExt;
                
                // ⚠️ 关键修复：记录 tab_id 以便调试
                let tab_id_clone = tab_id.clone();
                eprintln!("🚀 开始处理流式响应: tab_id={}", tab_id_clone);
                
                // 使用 HashMap 来累积多个工具调用的参数
                use std::collections::HashMap;
                let mut tool_calls: HashMap<String, (String, String)> = HashMap::new(); // (id -> (name, arguments))
                let mut accumulated_text = String::new();
                
                while let Some(result) = stream.next().await {
                    match result {
                        Ok(chunk) => {
                            match chunk {
                                ChatChunk::Text(text) => {
                                    // 按照文档实现：二次去重检测
                                    if text.is_empty() {
                                        continue;
                                    }
                                    
                                    // 检查是否与累积文本重复
                                    if accumulated_text.ends_with(&text) {
                                        eprintln!("⚠️ [ai_commands] 二次检测到重复文本，跳过: '{}'", 
                                            if text.len() > 50 { &text[..50] } else { &text });
                                        continue;
                                    }
                                    
                                    // 更新累积文本
                                    accumulated_text.push_str(&text);
                                    
                                    // 发送给前端
                                    let payload = serde_json::json!({
                                        "tab_id": tab_id,
                                        "chunk": text,
                                        "done": false,
                                    });
                                    if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                        eprintln!("发送事件失败: {}", e);
                                    }
                                }
                                ChatChunk::ToolCall { id, name, arguments, is_complete } => {
                                    // 参考 void 的实现：只处理完整的工具调用
                                    // 不完整的工具调用在 deepseek.rs 中已经被过滤，不会到达这里
                                    if !is_complete {
                                        eprintln!("⚠️ 收到不完整的工具调用，跳过: id={}, name={}", id, name);
                                        // 保存状态，等待完成
                                        let entry = tool_calls.entry(id.clone()).or_insert_with(|| (name.clone(), String::new()));
                                        entry.1 = arguments.clone();
                                        continue;
                                    }
                                    
                                    eprintln!("🔧 收到完整的工具调用 chunk: id={}, name={}, arguments_len={}, arguments_preview={}", 
                                        id, name, arguments.len(), 
                                        if arguments.len() > 100 { &arguments[..100] } else { &arguments });
                                    
                                    eprintln!("✅ 工具调用完成，开始处理: id={}, name={}, arguments={}", id, name, arguments);
                                    
                                    // 解析工具调用参数
                                        let parsed_arguments = match serde_json::from_str::<serde_json::Value>(&arguments) {
                                            Ok(args) => {
                                                eprintln!("✅ 成功解析工具调用参数: {}", serde_json::to_string(&args).unwrap_or_default());
                                                args
                                            }
                                            Err(e) => {
                                                eprintln!("⚠️ 工具调用参数 JSON 解析失败: {}, arguments: {}", e, arguments);
                                                
                                                // 尝试修复 JSON
                                                let mut repaired = arguments.clone();
                                                
                                                // 1. 如果缺少闭合括号，添加它
                                                if repaired.starts_with('{') && !repaired.ends_with('}') {
                                                    // 移除末尾的逗号（如果有）
                                                    repaired = repaired.trim_end_matches(',').trim().to_string();
                                                    // 添加闭合括号
                                                    repaired.push('}');
                                                    eprintln!("🔧 尝试修复 JSON（添加闭合括号）: {}", repaired);
                                                    
                                                    // 再次尝试解析
                                                    match serde_json::from_str::<serde_json::Value>(&repaired) {
                                                        Ok(args) => {
                                                            eprintln!("✅ JSON 修复成功");
                                                            args
                                                        }
                                                        Err(_) => {
                                                            eprintln!("❌ JSON 修复失败，使用空对象（工具调用将失败）");
                                                            serde_json::json!({})
                                                        }
                                                    }
                                                } else {
                                                    eprintln!("❌ 无法修复 JSON，使用空对象（工具调用将失败）");
                                                    serde_json::json!({})
                                                }
                                            }
                                    };
                                    
                                    // 发送工具调用事件到前端（使用解析后的 arguments）
                                    let payload = serde_json::json!({
                                        "tab_id": tab_id,
                                        "chunk": "",
                                        "done": false,
                                        "tool_call": {
                                            "id": id.clone(),
                                            "name": name.clone(),
                                            "arguments": parsed_arguments.clone(), // 使用解析后的 JSON 对象
                                            "status": "executing",
                                        },
                                    });
                                    if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                        eprintln!("发送工具调用事件失败: {}", e);
                                    }
                                    
                                    // 执行工具调用
                                    let tool_call = ToolCall {
                                        id: id.clone(),
                                        name: name.clone(),
                                        arguments: parsed_arguments,
                                    };
                                    
                                    eprintln!("🚀 开始执行工具调用: {}", name);
                                    match tool_service.execute_tool(&tool_call, &workspace_path).await {
                                        Ok(tool_result) => {
                                            eprintln!("✅ 工具执行成功: {}", name);
                                            
                                            // 如果是文件操作工具，且执行成功，手动触发文件树刷新事件
                                            let file_operation_tools = [
                                                "create_file",
                                                "create_folder",
                                                "delete_file",
                                                "rename_file",
                                                "move_file",
                                                "update_file",
                                            ];
                                            
                                            if file_operation_tools.contains(&name.as_str()) && tool_result.success {
                                                let workspace_path_str = workspace_path.to_string_lossy().to_string();
                                                eprintln!("🔄 文件操作成功，触发文件树刷新: workspace={}", workspace_path_str);
                                                if let Err(e) = app_handle.emit("file-tree-changed", workspace_path_str) {
                                                    eprintln!("⚠️ 触发文件树刷新事件失败: {}", e);
                                                }
                                            }
                                            
                                            // 将工具结果添加到消息中，继续对话
                                            let tool_result_message = format!(
                                                "\n\n[工具调用: {}]\n结果: {}",
                                                name,
                                                serde_json::to_string_pretty(&tool_result).unwrap_or_default()
                                            );
                                            
                                            // 发送工具调用结果到前端
                                            let payload = serde_json::json!({
                                                "tab_id": tab_id,
                                                "chunk": tool_result_message,
                                                "done": false,
                                                "tool_call": {
                                                    "id": id,
                                                    "name": name,
                                                    "arguments": arguments,
                                                    "result": tool_result,
                                                    "status": "completed",
                                                },
                                            });
                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                eprintln!("发送工具调用结果失败: {}", e);
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("❌ 工具执行失败: {} - {}", name, e);
                                            // 工具执行失败
                                            let error_message = format!("\n\n[工具调用失败: {}]\n错误: {}", name, e);
                                            let payload = serde_json::json!({
                                                "tab_id": tab_id,
                                                "chunk": error_message,
                                                "done": false,
                                                "tool_call": {
                                                    "id": id,
                                                    "name": name,
                                                    "arguments": arguments,
                                                    "error": e,
                                                    "status": "failed",
                                                },
                                            });
                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                eprintln!("发送工具调用错误失败: {}", e);
                                            }
                                        }
                                    }
                                    
                                    // 移除已完成的工具调用
                                    tool_calls.remove(&id);
                                }
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
                
                // 流结束时，检查是否有未完成的工具调用
                if !tool_calls.is_empty() {
                    eprintln!("🔧 流结束，发现 {} 个未完成的工具调用", tool_calls.len());
                    for (id, (name, arguments)) in tool_calls.iter() {
                        eprintln!("🔧 流结束，处理未完成的工具调用: id={}, name={}, arguments_len={}", id, name, arguments.len());
                        eprintln!("🔧 工具调用 arguments 内容: {}", arguments);
                        
                        // 解析工具调用参数
                        let parsed_arguments = match serde_json::from_str::<serde_json::Value>(arguments) {
                            Ok(args) => {
                                eprintln!("✅ 成功解析工具调用参数");
                                args
                            }
                            Err(e) => {
                                eprintln!("⚠️ 工具调用参数 JSON 解析失败: {}, arguments: {}", e, arguments);
                                // 尝试修复不完整的 JSON
                                let fixed_json = arguments.trim();
                                if fixed_json.starts_with("{") && !fixed_json.ends_with("}") {
                                    // 尝试补全 JSON
                                    let mut fixed = fixed_json.to_string();
                                    // 移除末尾的逗号（如果有）
                                    if fixed.ends_with(",") {
                                        fixed.pop();
                                    }
                                    fixed.push('}');
                                    match serde_json::from_str::<serde_json::Value>(&fixed) {
                                        Ok(args) => {
                                            eprintln!("✅ 修复后成功解析工具调用参数");
                                            args
                                        }
                                        Err(e2) => {
                                            eprintln!("❌ 修复后仍然解析失败: {}", e2);
                                            serde_json::json!({})
                                        }
                                    }
                                } else {
                                    serde_json::json!({})
                                }
                            }
                        };
                        
                        // 发送工具调用事件到前端
                        let payload = serde_json::json!({
                            "tab_id": tab_id,
                            "chunk": "",
                            "done": false,
                            "tool_call": {
                                "id": id.clone(),
                                "name": name.clone(),
                                "arguments": arguments.clone(),
                                "status": "executing",
                            },
                        });
                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                            eprintln!("发送工具调用事件失败: {}", e);
                        }
                        
                        // 执行累积的工具调用
                        let tool_call = ToolCall {
                            id: id.clone(),
                            name: name.clone(),
                            arguments: parsed_arguments,
                        };
                        
                        eprintln!("🚀 开始执行工具调用: {}", name);
                        
                        // 执行工具调用
                        match tool_service.execute_tool(&tool_call, &workspace_path).await {
                            Ok(tool_result) => {
                                eprintln!("✅ 工具执行成功: {}", name);
                                
                                // 如果是文件操作工具，且执行成功，手动触发文件树刷新事件
                                let file_operation_tools = [
                                    "create_file",
                                    "create_folder",
                                    "delete_file",
                                    "rename_file",
                                    "move_file",
                                    "update_file",
                                ];
                                
                                if file_operation_tools.contains(&name.as_str()) && tool_result.success {
                                    let workspace_path_str = workspace_path.to_string_lossy().to_string();
                                    eprintln!("🔄 文件操作成功，触发文件树刷新: workspace={}", workspace_path_str);
                                    if let Err(e) = app_handle.emit("file-tree-changed", workspace_path_str) {
                                        eprintln!("⚠️ 触发文件树刷新事件失败: {}", e);
                                    }
                                }
                                
                                // 将工具结果添加到消息中
                                let tool_result_message = format!(
                                    "\n\n[工具调用: {}]\n结果: {}",
                                    name,
                                    serde_json::to_string_pretty(&tool_result).unwrap_or_default()
                                );
                                
                                // 发送工具调用结果到前端
                                let payload = serde_json::json!({
                                    "tab_id": tab_id,
                                    "chunk": tool_result_message,
                                    "done": false,
                                    "tool_call": {
                                        "id": id.clone(),
                                        "name": name.clone(),
                                        "arguments": arguments.clone(),
                                        "result": tool_result,
                                        "status": "completed",
                                    },
                                });
                                if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                    eprintln!("发送工具调用结果失败: {}", e);
                                }
                            }
                            Err(e) => {
                                eprintln!("❌ 工具执行失败: {} - {}", name, e);
                                // 工具执行失败
                                let error_message = format!("\n\n[工具调用失败: {}]\n错误: {}", name, e);
                                let payload = serde_json::json!({
                                    "tab_id": tab_id,
                                    "chunk": error_message,
                                    "done": false,
                                    "tool_call": {
                                        "id": id.clone(),
                                        "name": name.clone(),
                                        "arguments": arguments.clone(),
                                        "error": e,
                                        "status": "failed",
                                    },
                                });
                                if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                    eprintln!("发送工具调用错误失败: {}", e);
                                }
                            }
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

/// AI 文档分析命令
/// 
/// # 参数
/// - `content`: 文档内容
/// - `analysis_type`: 分析类型 ("summarize", "keywords", "references", "entities")
/// - `service`: AI 服务状态
/// 
/// # 返回
/// 分析结果的 JSON 字符串
#[tauri::command]
pub async fn ai_analyze_document(
    content: String,
    analysis_type: String,
    service: State<'_, AIServiceState>,
) -> Result<String, String> {
    // 解析分析类型
    let analysis_type_enum = match analysis_type.as_str() {
        "summarize" => AnalysisType::Summarize,
        "keywords" => AnalysisType::ExtractKeywords,
        "references" => AnalysisType::FindReferences,
        "entities" => AnalysisType::ExtractEntities,
        _ => return Err(format!("不支持的分析类型: {}", analysis_type)),
    };
    
    // 构建分析提示词
    let prompt = DocumentAnalysisService::build_analysis_prompt(&content, &analysis_type_enum);
    
    // 获取 AI provider（优先 DeepSeek，然后是 OpenAI）
    let provider = {
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        service_guard.get_provider("deepseek")
            .or_else(|| service_guard.get_provider("openai"))
    };
    
    let provider = provider.ok_or_else(|| {
        "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string()
    })?;
    
    // 构建消息
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];
    
    // 使用默认模型配置
    let model_config = ModelConfig::default();
    
    // 创建取消令牌（暂时不使用）
    let (_, mut cancel_rx) = tokio::sync::oneshot::channel();
    
    // 调用流式聊天并收集响应
    let mut stream = provider.chat_stream(&messages, &model_config, &mut cancel_rx, None).await
        .map_err(|e| format!("AI 分析失败: {}", e))?;
    
    // 收集响应
    let mut response = String::new();
    use tokio_stream::StreamExt;
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                match chunk {
                    ChatChunk::Text(text) => response.push_str(&text),
                    ChatChunk::ToolCall { .. } => {
                        // 工具调用在文档分析中不需要处理
                        continue;
                    }
                }
            }
            Err(e) => return Err(format!("AI 流式响应错误: {}", e)),
        }
    }
    
    Ok(response)
}
