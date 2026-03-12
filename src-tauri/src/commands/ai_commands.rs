use crate::services::ai_service::AIService;
use crate::services::ai_providers::{ChatMessage, ModelConfig, ChatChunk};
use crate::services::document_analysis::{DocumentAnalysisService, AnalysisType};
use crate::services::tool_definitions::get_tool_definitions;
use crate::services::tool_service::{ToolService, ToolCall};
use crate::services::file_watcher::FileWatcherService;
use crate::services::conversation_manager::ConversationManager;
use crate::services::streaming_response_handler::StreamingResponseHandler;
use crate::services::tool_call_handler::ToolCallHandler;
use crate::services::context_manager::{ContextManager, ContextInfo, EditorState as ContextEditorState, ReferenceInfo, ReferenceType};
use crate::services::exception_handler::{ExceptionHandler, ConversationError, ErrorContext};
use crate::services::loop_detector::LoopDetector;
use crate::services::reply_completeness_checker::ReplyCompletenessChecker;
use crate::services::confirmation_manager::ConfirmationManager;
use crate::services::task_progress_analyzer::TaskProgressAnalyzer;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::collections::HashMap;
use tauri::{State, Emitter};
use tokio::sync::oneshot;
use once_cell::sync::Lazy;

// 全局取消通道存储：tab_id -> cancel_tx
static CANCEL_CHANNELS: Lazy<Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

// ⚠️ 关键修复：全局取消标志映射：tab_id -> cancel_flag
// 用于在继续对话时检测取消信号
static CANCEL_FLAGS: Lazy<Arc<Mutex<HashMap<String, Arc<Mutex<bool>>>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 安全地截取字符串，确保在字符边界处截取
fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // 找到最后一个完整的字符边界
    let mut end = max_bytes;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    &s[..end]
}

// 注意：analyze_task_progress 函数已废弃，统一使用 TaskProgressAnalyzer::analyze
// 这样可以避免重复控制逻辑，确保新的优化能够全面生效

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
    
    // ⚠️ 关键修复：处理字符串值中的未转义换行符
    repaired = repair_json_string_escapes(&repaired);
    
    serde_json::from_str(&repaired).map_err(|_| ())
}

/// 修复 JSON 字符串中的转义问题（处理未转义的换行符等）
fn repair_json_string_escapes(json: &str) -> String {
    let mut result = String::new();
    let mut in_string = false;
    let mut escaped = false;
    let mut chars = json.chars().peekable();
    
    while let Some(ch) = chars.next() {
        if escaped {
            result.push(ch);
            escaped = false;
            continue;
        }
        
        if ch == '\\' {
            result.push(ch);
            escaped = true;
            continue;
        }
        
        if ch == '"' {
            in_string = !in_string;
            result.push(ch);
            continue;
        }
        
        if in_string {
            match ch {
                '\n' => {
                    // 在字符串值内部，将未转义的换行符替换为 \n
                    result.push_str("\\n");
                }
                '\r' => {
                    // 处理 \r\n 或单独的 \r
                    if chars.peek() == Some(&'\n') {
                        chars.next(); // 跳过 \n
                        result.push_str("\\n");
                    } else {
                        result.push_str("\\n");
                    }
                }
                '\t' => {
                    // 将制表符转义
                    result.push_str("\\t");
                }
                _ => {
                    result.push(ch);
                }
            }
        } else {
            result.push(ch);
        }
    }
    
    result
}

// AI 服务状态（全局单例）
type AIServiceState = Arc<Mutex<AIService>>;

#[derive(serde::Deserialize)]
pub struct EditorState {
    pub node_type: String,
    pub heading_level: Option<u32>,
    pub list_type: Option<String>,
    pub list_level: Option<u32>,
    pub block_type: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub entity_name: String,
    pub content: String,
    pub entity_type: String,
}

#[derive(serde::Deserialize)]
pub struct DocumentOverview {
    pub document_start: String,
    pub document_end: String,
    pub document_structure: String,
    pub document_length: usize,
    pub current_section: String,
    pub previous_paragraph: String,
    pub next_paragraph: String,
}

#[tauri::command]
pub async fn ai_autocomplete(
    context_before: String,
    context_after: Option<String>,
    position: usize,
    max_length: usize,
    editor_state: Option<EditorState>,
    memory_items: Option<Vec<MemoryItem>>,
    document_format: Option<String>,
    document_overview: Option<DocumentOverview>,
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
    
    // 转换编辑器状态和记忆库项为 provider 类型
    let editor_state_provider = editor_state.as_ref().map(|e| crate::services::ai_providers::EditorState {
        node_type: e.node_type.clone(),
        heading_level: e.heading_level,
        list_type: e.list_type.clone(),
        list_level: e.list_level,
        block_type: e.block_type.clone(),
    });
    
    let memory_items_provider: Vec<crate::services::ai_providers::MemoryItem> = memory_items
        .as_ref()
        .map(|items| items.iter().map(|m| crate::services::ai_providers::MemoryItem {
            id: m.id.clone(),
            entity_name: m.entity_name.clone(),
            content: m.content.clone(),
            entity_type: m.entity_type.clone(),
        }).collect())
        .unwrap_or_default();
    
    // 转换文档概览为 provider 类型
    let document_overview_provider = document_overview.as_ref().map(|o| crate::services::ai_providers::DocumentOverview {
        document_start: o.document_start.clone(),
        document_end: o.document_end.clone(),
        document_structure: o.document_structure.clone(),
        document_length: o.document_length,
        current_section: o.current_section.clone(),
        previous_paragraph: o.previous_paragraph.clone(),
        next_paragraph: o.next_paragraph.clone(),
    });
    
    // 调用自动补全（使用增强的提示词）
    match provider.autocomplete_enhanced(
        &context_before,
        context_after.as_deref(),
        editor_state_provider.as_ref(),
        if memory_items_provider.is_empty() { None } else { Some(&memory_items_provider[..]) },
        document_format.as_deref().unwrap_or("txt"),
        document_overview_provider.as_ref(),
        max_length,
    ).await {
        Ok(result) => {
            // 记录结果用于调试
            eprintln!("✅ [ai_autocomplete] 成功返回，内容长度: {} 字符", result.len());
            Ok(Some(result))
        }
        Err(e) => {
            eprintln!("❌ [ai_autocomplete] 错误: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn ai_inline_assist(
    instruction: String,
    text: String,
    context: String,
    service: State<'_, AIServiceState>,
) -> Result<String, String> {
    // 记录请求用于调试（不打印完整正文，避免泄露内容）
    eprintln!(
        "📥 [ai_inline_assist] 收到请求: instruction_len={} text_len={} context_len={}",
        instruction.chars().count(),
        text.chars().count(),
        context.chars().count(),
    );
    
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
        Ok(result) => {
            eprintln!(
                "✅ [ai_inline_assist] 成功返回，结果长度: {} 字符",
                result.chars().count()
            );
            Ok(result)
        }
        Err(e) => {
            eprintln!("❌ [ai_inline_assist] 错误: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn ai_chat_stream(
    tab_id: String, // 注意：前端发送的是 tabId (camelCase)，Tauri 会自动转换为 tab_id (snake_case)
    messages: Vec<ChatMessage>,
    model_config: ModelConfig,
    enable_tools: Option<bool>, // 是否启用工具调用（Agent 模式为 true，Chat 模式为 false）
    current_file: Option<String>, // 当前打开的文档路径（第二层上下文）
    selected_text: Option<String>, // 当前选中的文本（第二层上下文）
    current_editor_content: Option<String>, // 当前编辑器内容（用于文档编辑功能）
    edit_target: Option<serde_json::Value>, // 精确定位：{ anchor: { block_id, start_offset, end_offset } }
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
    
    // 创建取消令牌，并存储到全局映射中
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();
    {
        let mut channels = CANCEL_CHANNELS.lock().unwrap();
        channels.insert(tab_id.clone(), cancel_tx);
    }
    
    // ⚠️ 关键修复：创建取消标志并注册到全局映射
    let cancel_flag = Arc::new(Mutex::new(false));
    let cancel_flag_clone = cancel_flag.clone();
    let cancel_flag_for_stream = cancel_flag.clone();
    {
        let mut flags = CANCEL_FLAGS.lock().unwrap();
        flags.insert(tab_id.clone(), cancel_flag.clone());
        eprintln!("✅ 初始流处理时注册取消标志: tab_id={}", tab_id);
    }
    
    // 根据 enable_tools 参数决定是否获取工具定义（默认为 true，保持向后兼容）
    let enable_tools = enable_tools.unwrap_or(true);
    let tool_definitions = if enable_tools {
        Some(get_tool_definitions())
    } else {
        None
    };
    
    // 获取工作区路径（优先从文件监听器获取，否则使用当前目录）
    let workspace_path: PathBuf = {
        let watcher_guard = watcher.lock().unwrap();
        watcher_guard.get_workspace_path()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
    };
    
    // 使用 ContextManager 统一构建多层提示词（方案A）
    let context_manager = ContextManager::new(model_config.max_tokens);
    
    // 从消息中提取引用信息（第三层）
    let mut references: Vec<ReferenceInfo> = Vec::new();
    if let Some(last_user_msg) = messages.iter().rev().find(|m| m.role == "user") {
        let _content = &last_user_msg.content;
        // 简单的引用检测：查找 @file: 或文件路径模式
        // 这里可以根据实际需求扩展引用检测逻辑
        // 暂时留空，等待前端传递引用信息或扩展检测逻辑
    }
    
    // ⚠️ 关键修复：将当前打开的文件作为引用项添加到引用列表
    let mut final_references = references.clone();
    if let Some(current_file_path) = &current_file {
        // 将绝对路径转换为相对于工作区的路径（与工具调用格式保持一致）
        let normalized_path = if current_file_path.starts_with('/') || current_file_path.contains(':') {
            // 是绝对路径，尝试转换为相对路径
            let file_path_buf = PathBuf::from(current_file_path);
            if let Ok(relative_path) = file_path_buf.strip_prefix(&workspace_path) {
                relative_path.to_string_lossy().to_string()
            } else {
                // 如果无法转换为相对路径，使用文件名
                current_file_path
                    .split('/')
                    .last()
                    .or_else(|| current_file_path.split('\\').last())
                    .unwrap_or(current_file_path)
                    .to_string()
            }
        } else {
            // 已经是相对路径，直接使用
            current_file_path.clone()
        };
        
        // 检查当前文件是否已经在引用列表中（使用规范化后的路径）
        let already_referenced = final_references.iter()
            .any(|r| {
                if let ReferenceType::File = r.ref_type {
                    r.source == normalized_path || r.source == *current_file_path
                } else {
                    false
                }
            });
        
        // 如果当前文件不在引用列表中，添加它
        if !already_referenced {
            final_references.push(ReferenceInfo {
                ref_type: ReferenceType::File,
                source: normalized_path.clone(), // 使用规范化后的路径
                content: String::new(), // 当前文件内容会在需要时通过工具读取，这里留空
            });
        }
    }
    
    // 构建上下文信息
    let context_info = ContextInfo {
        current_file: current_file.clone(),
        selected_text: selected_text.clone(),
        workspace_path: workspace_path.clone(),
        editor_state: ContextEditorState {
            is_editable: true, // 默认可编辑，可根据实际情况调整
            file_type: current_file.as_ref().and_then(|f| {
                std::path::Path::new(f).extension()
                    .and_then(|ext| ext.to_str())
                    .map(|s| s.to_string())
            }),
            file_size: None, // 可根据需要获取文件大小
            is_saved: true, // 默认已保存，可根据实际情况调整
        },
        references: final_references,
    };
    
    // 使用 build_multi_layer_prompt() 统一构建所有层（第一、二、三层）
    let system_prompt = context_manager.build_multi_layer_prompt(&context_info, enable_tools);
    
    // 构建增强的消息列表
    let mut enhanced_messages = messages.clone();
    
    // 检查是否有系统消息，如果没有则添加，如果有则替换
    let has_system_message = enhanced_messages.iter().any(|m| m.role == "system");
    if !has_system_message {
        enhanced_messages.insert(0, ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
        });
    } else {
        // 如果已有系统消息，使用统一构建的提示词替换，确保提示词一致性
        if let Some(first_msg) = enhanced_messages.first_mut() {
            if first_msg.role == "system" {
                first_msg.content = system_prompt;
            }
        }
    }
    
    // 调用流式聊天（根据模式决定是否传递工具定义）
    match provider.chat_stream(&enhanced_messages, &model_config, &mut cancel_rx, tool_definitions.as_deref()).await {
        Ok(mut stream) => {
            // 在后台任务中处理流式响应
            let app_handle = app.clone();
            let workspace_path = workspace_path.clone();
            let tool_service = ToolService::new();
            // 传递必要的参数以便工具调用后继续对话
            let provider_clone = provider.clone();
            let model_config_clone = model_config.clone();
            let mut current_messages = enhanced_messages.clone();
            let tool_definitions_clone = tool_definitions.clone();
            // ⚠️ 保存编辑器信息，以便在继续对话中使用
            let current_file_clone = current_file.clone();
            let current_editor_content_clone = current_editor_content.clone();
            let selected_text_clone = selected_text.clone();
            let edit_target_clone = edit_target.clone();
            
            // ⚠️ 关键修复：使用已注册的取消标志（已在上面创建并注册到 CANCEL_FLAGS）
            // cancel_flag 已经在上面注册到 CANCEL_FLAGS 中，这里直接使用
            let cancel_flag_clone = cancel_flag.clone();
            let cancel_flag_for_stream = cancel_flag.clone();
            
            // 创建一个任务来监听取消信号
            let tab_id_for_cancel = tab_id.clone();
            tokio::spawn(async move {
                // 等待取消信号
                let _ = cancel_rx.await;
                eprintln!("🛑 收到取消信号: tab_id={}", tab_id_for_cancel);
                let mut flag = cancel_flag_clone.lock().unwrap();
                *flag = true;
            });
            
            tokio::spawn(async move {
                // ⚠️ 关键修复：将 cancel_flag 传递到流处理任务中
                let cancel_flag = cancel_flag_for_stream;
                use tokio_stream::StreamExt;
                
                // ⚠️ 关键修复：记录 tab_id 以便调试
                let tab_id_clone = tab_id.clone();
                eprintln!("🚀 开始处理流式响应: tab_id={}", tab_id_clone);
                
                // 初始化管理器
                let mut conversation_manager = ConversationManager::new();
                let mut streaming_handler = StreamingResponseHandler::new();
                let tool_call_handler = ToolCallHandler::new();
                let exception_handler = ExceptionHandler::new();
                let mut loop_detector = LoopDetector::new();
                let reply_checker = ReplyCompletenessChecker::new();
                let confirmation_manager = ConfirmationManager::new();
                let task_analyzer = TaskProgressAnalyzer;
                
                // 初始化对话状态
                let message_id = format!("msg_{}", chrono::Utc::now().timestamp_millis());
                conversation_manager.start_conversation(&tab_id, message_id.clone());
                
                // ⚠️ 关键修复：清空流式响应处理器的累积文本，避免新对话时使用旧的累积文本
                streaming_handler.clear_accumulated(&tab_id);
                
                // 使用 HashMap 来累积多个工具调用的参数和结果
                use std::collections::HashMap;
                let mut tool_calls: HashMap<String, (String, String)> = HashMap::new(); // (id -> (name, arguments))
                let mut tool_results: Vec<(String, String, crate::services::tool_service::ToolResult)> = Vec::new(); // 收集工具调用结果
                let mut has_tool_calls = false; // 标记是否有工具调用
                
                // ⚠️ 关键修复：使用循环处理流，并在每次迭代前检查取消标志
                loop {
                    // 使用 tokio::select! 同时等待流和取消信号
                    // 创建一个定期检查取消标志的 future
                    let cancel_check = {
                        let cancel_flag = cancel_flag.clone();
                        async move {
                            loop {
                                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                let flag = cancel_flag.lock().unwrap();
                                if *flag {
                                    return true;
                                }
                            }
                        }
                    };
                    
                    // 使用 select! 同时等待流和取消检查
                    let result = tokio::select! {
                        result = stream.next() => {
                            match result {
                                Some(r) => Some(r),
                                None => {
                                    // 流结束
                                    break;
                                }
                            }
                        }
                        _ = cancel_check => {
                            // 取消信号已触发
                            eprintln!("🛑 通过 select! 检测到取消标志，停止流式处理: tab_id={}", tab_id);
                            // 发送完成事件，标记为已取消
                            let payload = serde_json::json!({
                                "tab_id": tab_id,
                                "chunk": "",
                                "done": true,
                                "error": "用户取消了请求",
                            });
                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                eprintln!("发送取消事件失败: {}", e);
                            }
                            // ⚠️ 关键修复：清理取消通道和标志
                            {
                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                channels.remove(&tab_id);
                            }
                            {
                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                flags.remove(&tab_id);
                            }
                            return;
                        }
                    };
                    
                    // 处理流数据
                    let result = match result {
                        Some(r) => r,
                        None => break,
                    };
                    match result {
                        Ok(chunk) => {
                            match chunk {
                                ChatChunk::Text(text) => {
                                    // 使用 StreamingResponseHandler 处理文本chunk
                                    if let Some(text_to_send) = streaming_handler.process_text_chunk(&tab_id, &text) {
                                        // 更新对话状态
                                        conversation_manager.start_streaming(&tab_id, message_id.clone());
                                        conversation_manager.update_streaming_text(&tab_id, &text_to_send);
                                        
                                        // 发送给前端
                                        let payload = serde_json::json!({
                                            "tab_id": tab_id,
                                            "chunk": text_to_send,
                                            "done": false,
                                        });
                                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                            eprintln!("发送事件失败: {}", e);
                                        }
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
                                        safe_truncate(&arguments, 100));
                                    
                                    eprintln!("✅ 工具调用完成，开始处理: id={}, name={}, arguments={}", id, name, arguments);
                                    
                                    // 检测工具调用循环
                                    if loop_detector.detect_tool_call_loop(&name, &arguments) {
                                        eprintln!("⚠️ 检测到工具调用循环，跳过: {}", name);
                                        continue;
                                    }
                                    
                                    has_tool_calls = true; // 标记有工具调用
                                    
                                    // 更新对话状态：开始工具调用
                                    conversation_manager.start_tool_call(&tab_id, message_id.clone(), id.clone(), name.clone());
                                    conversation_manager.update_tool_call_status(&tab_id, crate::services::conversation_manager::ToolCallStatus::Pending);
                                    
                                    // 使用 ToolCallHandler 解析工具调用参数
                                    let mut parsed_arguments = ToolCallHandler::parse_tool_arguments(&arguments);
                                    
                                    // ⚠️ 文档编辑功能：如果是 edit_current_editor_document，自动增强参数
                                    if name == "edit_current_editor_document" {
                                        // 自动添加 current_file 和 current_content 参数
                                        if let Some(ref file_path) = current_file {
                                            parsed_arguments["current_file"] = serde_json::Value::String(file_path.clone());
                                        }
                                        if let Some(ref content) = current_editor_content {
                                            parsed_arguments["current_content"] = serde_json::Value::String(content.clone());
                                        }
                                        // 精确定位：若有 edit_target，注入 anchor，优先于 target_content
                                        if let Some(ref et) = edit_target {
                                            parsed_arguments["edit_target"] = et.clone();
                                            eprintln!("📝 已增强 edit_current_editor_document 参数: edit_target (精确定位)");
                                        } else if let Some(ref sel) = selected_text {
                                            // 若有选中文本，作为 target_content 传入（降级）
                                            if !sel.trim().is_empty() && parsed_arguments.get("target_content").is_none() {
                                                parsed_arguments["target_content"] = serde_json::Value::String(sel.trim().to_string());
                                                eprintln!("📝 已增强 edit_current_editor_document 参数: target_content 来自选中文本 (长度: {})", sel.trim().len());
                                            }
                                        }
                                        eprintln!("📝 已增强 edit_current_editor_document 参数: current_file={:?}, current_content_len={}", 
                                            current_file.as_ref().map(|s| s.as_str()), 
                                            current_editor_content.as_ref().map(|s| s.len()).unwrap_or(0));
                                    }
                                    
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
                                    
                                    // 保存解析后的参数，用于后续发送结果事件
                                    let parsed_args_for_result = parsed_arguments.clone();
                                    
                                    // 执行工具调用
                                    let tool_call = ToolCall {
                                        id: id.clone(),
                                        name: name.clone(),
                                        arguments: parsed_arguments,
                                    };
                                    
                                    // ⚠️ 关键修复：在执行工具调用前检查取消标志
                                    {
                                        let flag = cancel_flag.lock().unwrap();
                                        if *flag {
                                            eprintln!("🛑 工具调用执行前检测到取消标志，停止执行: tab_id={}", tab_id);
                                            // 发送取消事件
                                            let payload = serde_json::json!({
                                                "tab_id": tab_id,
                                                "chunk": "",
                                                "done": true,
                                                "error": "用户取消了请求",
                                            });
                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                eprintln!("发送取消事件失败: {}", e);
                                            }
                                            // ⚠️ 关键修复：清理取消通道和标志
                                            {
                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                channels.remove(&tab_id);
                                            }
                                            {
                                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                                flags.remove(&tab_id);
                                            }
                                            return;
                                        }
                                    }
                                    
                                    eprintln!("🚀 开始执行工具调用: {}", name);
                                    
                                    // 更新工具调用状态：执行中
                                    conversation_manager.update_tool_call_status(&tab_id, crate::services::conversation_manager::ToolCallStatus::Executing);
                                    
                                    // 使用 ToolCallHandler 执行工具调用（带重试机制）
                                    let (tool_result, retry_count) = tool_call_handler.execute_tool_with_retry(
                                        &tool_call,
                                        &workspace_path,
                                        3, // max_retries
                                    ).await;
                                    
                                    // ⚠️ 关键修复：在工具调用执行后检查取消标志
                                    {
                                        let flag = cancel_flag.lock().unwrap();
                                        if *flag {
                                            eprintln!("🛑 工具调用执行后检测到取消标志，停止处理: tab_id={}", tab_id);
                                            // 发送取消事件
                                            let payload = serde_json::json!({
                                                "tab_id": tab_id,
                                                "chunk": "",
                                                "done": true,
                                                "error": "用户取消了请求",
                                            });
                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                eprintln!("发送取消事件失败: {}", e);
                                            }
                                            // ⚠️ 关键修复：清理取消通道和标志
                                            {
                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                channels.remove(&tab_id);
                                            }
                                            {
                                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                                flags.remove(&tab_id);
                                            }
                                            return;
                                        }
                                    }
                                    
                                    // 更新工具调用状态：完成或失败
                                    let tool_status = if tool_result.success {
                                        crate::services::conversation_manager::ToolCallStatus::Completed
                                    } else {
                                        crate::services::conversation_manager::ToolCallStatus::Failed
                                    };
                                    conversation_manager.update_tool_call_status(&tab_id, tool_status);
                                    
                                    if tool_result.success {
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
                                            
                                            // 保存工具调用结果，用于后续继续对话
                                            tool_results.push((id.clone(), name.clone(), tool_result.clone()));
                                            
                                            // 将工具结果添加到消息中，继续对话
                                            let tool_result_message = format!(
                                                "\n\n[工具调用: {}]\n结果: {}",
                                                name,
                                                serde_json::to_string_pretty(&tool_result).unwrap_or_default()
                                            );
                                            
                                            // 发送工具调用结果到前端（使用解析后的 arguments）
                                            let payload = serde_json::json!({
                                                "tab_id": tab_id,
                                                "chunk": tool_result_message,
                                                "done": false,
                                                "tool_call": {
                                                    "id": id,
                                                    "name": name,
                                                    "arguments": parsed_args_for_result, // ✅ 使用解析后的 JSON 对象
                                                    "result": tool_result,
                                                    "status": "completed",
                                                },
                                            });
                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                eprintln!("发送工具调用结果失败: {}", e);
                                            }
                                    } else {
                                        // 工具执行失败（工具层面的失败，如文件不存在）
                                        eprintln!("⚠️ 工具执行失败: {} - {}", name, tool_result.error.as_ref().unwrap_or(&"未知错误".to_string()));
                                        
                                        // 保存工具调用结果，用于后续继续对话
                                        tool_results.push((id.clone(), name.clone(), tool_result.clone()));
                                        
                                        // 工具执行失败
                                        let error_message = format!(
                                            "\n\n[工具调用失败: {}]\n错误: {}",
                                            name,
                                            tool_result.error.as_ref().unwrap_or(&"未知错误".to_string())
                                        );
                                        let payload = serde_json::json!({
                                            "tab_id": tab_id,
                                            "chunk": error_message,
                                            "done": false,
                                            "tool_call": {
                                                "id": id,
                                                "name": name,
                                                "arguments": parsed_args_for_result, // ✅ 使用解析后的 JSON 对象
                                                "result": tool_result,
                                                "status": "failed",
                                            },
                                        });
                                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                            eprintln!("发送工具调用错误失败: {}", e);
                                        }
                                    }
                                    
                                    // 移除已完成的工具调用
                                    tool_calls.remove(&id);
                                    eprintln!("✅ 工具调用处理完成，继续处理流式响应");
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
                
                // ⚠️ 关键修复：在流结束后检查取消标志
                {
                    let flag = cancel_flag.lock().unwrap();
                    if *flag {
                        eprintln!("🛑 流结束后检测到取消标志，停止处理: tab_id={}", tab_id);
                        // 发送取消事件
                        let payload = serde_json::json!({
                            "tab_id": tab_id,
                            "chunk": "",
                            "done": true,
                            "error": "用户取消了请求",
                        });
                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                            eprintln!("发送取消事件失败: {}", e);
                        }
                        // ⚠️ 关键修复：清理取消通道和标志
                        {
                            let mut channels = CANCEL_CHANNELS.lock().unwrap();
                            channels.remove(&tab_id);
                        }
                        {
                            let mut flags = CANCEL_FLAGS.lock().unwrap();
                            flags.remove(&tab_id);
                        }
                        return;
                    }
                }
                
                // 流结束时，检查是否有未完成的工具调用
                if !tool_calls.is_empty() {
                    eprintln!("🔧 流结束，发现 {} 个未完成的工具调用", tool_calls.len());
                    has_tool_calls = true; // 标记有工具调用
                    for (id, (name, arguments)) in tool_calls.iter() {
                        eprintln!("🔧 流结束，处理未完成的工具调用: id={}, name={}, arguments_len={}", id, name, arguments.len());
                        eprintln!("🔧 工具调用 arguments 内容: {}", arguments);
                        
                        // 解析工具调用参数（简化修复逻辑）
                        let parsed_arguments = match serde_json::from_str::<serde_json::Value>(arguments) {
                            Ok(args) => {
                                eprintln!("✅ 成功解析工具调用参数");
                                args
                            }
                            Err(e) => {
                                eprintln!("⚠️ 工具调用参数 JSON 解析失败: {}, arguments: {}", e, arguments);
                                // 简化修复：只处理缺少闭合括号的情况
                                let fixed_json = arguments.trim();
                                if fixed_json.starts_with("{") && !fixed_json.ends_with("}") {
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
                                    eprintln!("❌ 无法修复 JSON，使用空对象");
                                    serde_json::json!({})
                                }
                            }
                        };
                        
                        // 保存解析后的参数，用于后续发送结果事件
                        let parsed_args_for_result = parsed_arguments.clone();
                        
                        // 发送工具调用事件到前端（使用解析后的 arguments）
                        let payload = serde_json::json!({
                            "tab_id": tab_id,
                            "chunk": "",
                            "done": false,
                            "tool_call": {
                                "id": id.clone(),
                                "name": name.clone(),
                                "arguments": parsed_arguments.clone(), // ✅ 使用解析后的 JSON 对象
                                "status": "executing",
                            },
                        });
                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                            eprintln!("发送工具调用事件失败: {}", e);
                        }
                        
                        // ⚠️ 关键修复：在执行工具调用前检查取消标志
                        {
                            let flag = cancel_flag.lock().unwrap();
                            if *flag {
                                eprintln!("🛑 流结束后的工具调用执行前检测到取消标志，停止处理: tab_id={}", tab_id);
                                // 发送取消事件
                                let payload = serde_json::json!({
                                    "tab_id": tab_id,
                                    "chunk": "",
                                    "done": true,
                                    "error": "用户取消了请求",
                                });
                                if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                    eprintln!("发送取消事件失败: {}", e);
                                }
                                // ⚠️ 关键修复：清理取消通道和标志
                                {
                                    let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                    channels.remove(&tab_id);
                                }
                                {
                                    let mut flags = CANCEL_FLAGS.lock().unwrap();
                                    flags.remove(&tab_id);
                                }
                                return;
                            }
                        }
                        
                        // 执行累积的工具调用
                        let tool_call = ToolCall {
                            id: id.clone(),
                            name: name.clone(),
                            arguments: parsed_arguments,
                        };
                                
                                eprintln!("🚀 开始执行工具调用: {}", name);
                                
                                // 执行工具调用，带重试机制
                                let mut tool_result = None;
                                let mut last_error = None;
                                let max_retries = 3;
                                
                                for attempt in 1..=max_retries {
                                    match tool_service.execute_tool(&tool_call, &workspace_path).await {
                                        Ok(result) => {
                                            if result.success {
                                                tool_result = Some(result);
                                                if attempt > 1 {
                                                    eprintln!("✅ 工具执行成功（第 {} 次尝试）: {}", attempt, name);
                                                }
                                                break;
                                            } else {
                                                // 工具返回失败，但这是工具层面的失败（如文件不存在），不需要重试
                                                tool_result = Some(result);
                                                break;
                                            }
                                        }
                                        Err(e) => {
                                            last_error = Some(e.clone());
                                            eprintln!("⚠️ 工具执行失败（第 {} 次尝试）: {} - {}", attempt, name, e);
                                            if attempt < max_retries {
                                                // 等待一小段时间后重试（指数退避）
                                                let delay_ms = 100 * attempt;
                                                tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                                                eprintln!("🔄 重试工具调用: {} (尝试 {}/{})", name, attempt + 1, max_retries);
                                            }
                                        }
                                    }
                                }
                                
                                let tool_result = match tool_result {
                                    Some(result) => result,
                                    None => {
                                        // 所有重试都失败了
                                        let error_msg = last_error.unwrap_or_else(|| "未知错误".to_string());
                                        eprintln!("❌ 工具执行最终失败（已重试 {} 次）: {} - {}", max_retries, name, error_msg);
                                        crate::services::tool_service::ToolResult {
                                            success: false,
                                            data: None,
                                            error: Some(format!("执行失败（已重试 {} 次）: {}", max_retries, error_msg)),
                                            message: None,
                                        }
                                    }
                                };
                                
                                if tool_result.success {
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
                                        
                                        // 保存工具调用结果，用于后续继续对话
                                        tool_results.push((id.clone(), name.clone(), tool_result.clone()));
                                        
                                        // 将工具结果添加到消息中
                                        let tool_result_message = format!(
                                            "\n\n[工具调用: {}]\n结果: {}",
                                            name,
                                            serde_json::to_string_pretty(&tool_result).unwrap_or_default()
                                        );
                                        
                                        // 发送工具调用结果到前端（使用解析后的 arguments）
                                        let payload = serde_json::json!({
                                            "tab_id": tab_id,
                                            "chunk": tool_result_message,
                                            "done": false,
                                            "tool_call": {
                                                "id": id.clone(),
                                                "name": name.clone(),
                                                "arguments": parsed_args_for_result.clone(), // ✅ 使用解析后的 JSON 对象
                                                "result": tool_result,
                                                "status": "completed",
                                            },
                                        });
                                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                            eprintln!("发送工具调用结果失败: {}", e);
                                        }
                                } else {
                                    // 工具执行失败（工具层面的失败，如文件不存在）
                                    eprintln!("⚠️ 工具执行失败: {} - {}", name, tool_result.error.as_ref().unwrap_or(&"未知错误".to_string()));
                                    
                                    // 保存工具调用结果，用于后续继续对话
                                    tool_results.push((id.clone(), name.clone(), tool_result.clone()));
                                    
                                    // 工具执行失败
                                    let error_message = format!(
                                        "\n\n[工具调用失败: {}]\n错误: {}",
                                        name,
                                        tool_result.error.as_ref().unwrap_or(&"未知错误".to_string())
                                    );
                                    let payload = serde_json::json!({
                                        "tab_id": tab_id,
                                        "chunk": error_message,
                                        "done": false,
                                        "tool_call": {
                                            "id": id.clone(),
                                            "name": name.clone(),
                                            "arguments": parsed_args_for_result.clone(), // ✅ 使用解析后的 JSON 对象
                                            "result": tool_result,
                                            "status": "failed",
                                        },
                                    });
                                    if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                        eprintln!("发送工具调用错误失败: {}", e);
                                    }
                                }
                    }
                }
                
                // 如果有工具调用，需要继续对话
                if has_tool_calls && !tool_results.is_empty() {
                    eprintln!("🔄 检测到工具调用，准备继续对话: 工具调用数量={}", tool_results.len());
                    
                    // 构建工具调用结果消息
                    // 将 assistant 的回复（包含工具调用）添加到消息历史
                    let accumulated_text = streaming_handler.get_accumulated(&tab_id);
                    if !accumulated_text.is_empty() {
                        current_messages.push(ChatMessage {
                            role: "assistant".to_string(),
                            content: accumulated_text.clone(),
                        });
                    }
                    
                    // 构建工具调用结果消息
                    // 优化格式：直接提供工具调用的数据结果，让 AI 能够清晰理解并继续执行
                    let mut tool_results_content = String::new();
                    for (_tool_id, tool_name, tool_result) in &tool_results {
                        if tool_result.success {
                            if let Some(data) = &tool_result.data {
                                // 直接提供数据内容，让 AI 能够理解并继续操作
                                tool_results_content.push_str(&format!(
                                    "【{}】执行成功，结果数据：\n{}\n\n",
                                    tool_name, serde_json::to_string_pretty(data).unwrap_or_default()
                                ));
                            } else if let Some(message) = &tool_result.message {
                                tool_results_content.push_str(&format!(
                                    "【{}】执行成功：{}\n\n",
                                    tool_name, message
                                ));
                            } else {
                                tool_results_content.push_str(&format!(
                                    "【{}】执行成功\n\n",
                                    tool_name
                                ));
                            }
                        } else {
                            if let Some(error) = &tool_result.error {
                                tool_results_content.push_str(&format!(
                                    "【{}】执行失败：{}\n\n",
                                    tool_name, error
                                ));
                            } else {
                                tool_results_content.push_str(&format!(
                                    "【{}】执行失败\n\n",
                                    tool_name
                                ));
                            }
                        }
                    }
                    
                    // 分析任务完成度，生成任务进度提示
                    let task_progress_info = TaskProgressAnalyzer::analyze(&tool_results);
                    let task_progress = task_progress_info.progress_hint.clone();
                    
                    // 检查任务是否完成（使用结构化的字段）
                    let task_incomplete = task_progress_info.is_incomplete;
                    let task_completed = task_progress_info.is_completed;
                    
                    // 检查是否是"检查所有文件夹"任务未完成
                    let check_folders_incomplete = task_progress_info.task_type == crate::services::task_progress_analyzer::TaskType::RecursiveCheck && task_progress_info.is_incomplete;
                    
                    // 添加工具调用结果到消息历史
                    // 格式：清晰简洁，直接提供结果数据，明确指导 AI 继续执行
                    let continue_instruction = if check_folders_incomplete {
                        // 检查所有文件夹任务未完成，强制要求继续调用list_files工具
                        format!(
                            "{}\n\n任务未完成，必须继续执行：\n\n重要指令：\n1. 必须立即调用 list_files 工具检查所有剩余的文件夹\n2. 不要只回复文本说明，必须调用工具\n3. 不要停止，不要结束回复\n4. 必须检查完所有文件夹才能结束\n5. 立即执行：现在就开始调用 list_files 工具检查下一个文件夹\n\n执行要求：必须调用工具继续检查，不要只回复文本。",
                            task_progress
                        )
                    } else if task_incomplete {
                        // 任务未完成，强制要求继续
                        format!("{}\n\n重要：任务尚未完成！请立即继续调用 move_file 工具处理剩余文件，不要停止或结束回复。必须处理完所有文件才能结束。", 
                            if tool_results.iter().any(|(_, name, _)| name == "list_files" || name == "read_file") {
                                "请基于以上结果继续执行用户的任务。如果任务需要移动文件、创建文件夹等操作，请立即调用相应的工具完成，不要停止或等待。"
                            } else {
                                "请基于以上结果继续执行用户的任务。如果任务还未完成，请继续调用相应的工具完成剩余步骤。"
                            }
                        )
                    } else if task_completed {
                        // 任务已完成，要求AI做总结
                        "任务已完成，请进行工作总结：\n\n请检查你的工作，然后提供一份简洁的总结，包括：\n1. 完成的工作：简要说明你完成了哪些操作（如移动了多少文件、创建了哪些文件夹等）\n2. 执行逻辑：简要说明你是如何组织和执行这些操作的\n3. 执行效果：说明任务完成后的结果和状态\n4. 下一步建议：如果有需要用户注意的事项或后续建议，请说明\n\n请用自然语言回复，不要调用工具。".to_string()
                    } else if tool_results.iter().any(|(_, name, _)| name == "read_file") {
                        // 如果调用了 read_file，检查用户是否要求总结/概述内容
                        let last_user_message = messages.iter().rev().find(|m| m.role == "user");
                        let user_asks_for_summary = last_user_message
                            .map(|m| {
                                let content_lower = m.content.to_lowercase();
                                content_lower.contains("写了什么") || 
                                content_lower.contains("内容是什么") || 
                                content_lower.contains("内容") && (content_lower.contains("总结") || content_lower.contains("概述") || content_lower.contains("介绍")) ||
                                content_lower.contains("总结") || 
                                content_lower.contains("概述") ||
                                content_lower.contains("介绍")
                            })
                            .unwrap_or(false);
                        
                        if user_asks_for_summary {
                            "重要：用户要求了解文件内容。请基于读取的文件内容，提供清晰的总结和概述，说明文件的主要内容、关键信息等。请用自然语言回复，不要调用工具。".to_string()
                        } else {
                            "请基于以上结果继续执行用户的任务。如果用户明确要求移动文件、创建文件夹等操作，请立即调用相应的工具完成，不要停止或等待。".to_string()
                        }
                    } else if tool_results.iter().any(|(_, name, _)| name == "list_files") {
                        // 检查用户是否要求检查/列出文件
                        let last_user_message = messages.iter().rev().find(|m| m.role == "user");
                        let user_asks_to_check_or_list_files = last_user_message
                            .map(|m| {
                                let content_lower = m.content.to_lowercase();
                                content_lower.contains("检查") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                content_lower.contains("列出") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                content_lower.contains("查看") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                content_lower.contains("有哪些") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                (content_lower.contains("所有文件") || content_lower.contains("全部文件")) ||
                                (content_lower.contains("文件") && (content_lower.contains("包括") || content_lower.contains("子文件夹") || content_lower.contains("子目录"))) ||
                                content_lower.contains("每一个") && (content_lower.contains("文件夹") || content_lower.contains("文件"))
                            })
                            .unwrap_or(false);
                        
                        // 检查用户是否要求检查"每一个"文件夹
                        let user_asks_check_every_folder = last_user_message
                            .map(|m| {
                                let content_lower = m.content.to_lowercase();
                                content_lower.contains("每一个") && (content_lower.contains("文件夹") || content_lower.contains("文件")) ||
                                content_lower.contains("每个") && (content_lower.contains("文件夹") || content_lower.contains("文件"))
                            })
                            .unwrap_or(false);
                        
                        if user_asks_check_every_folder {
                            // 用户明确要求检查每一个文件夹，必须强制继续调用list_files工具
                            format!(
                                "任务未完成，必须继续执行：\n\n{}\n\n重要指令：\n1. 必须立即调用 list_files 工具检查所有剩余的文件夹\n2. 不要只回复文本说明，必须调用工具\n3. 不要停止，不要结束回复\n4. 必须检查完所有文件夹才能结束\n5. 立即执行：现在就开始调用 list_files 工具检查下一个文件夹\n\n执行要求：必须调用工具继续检查，不要只回复文本。",
                                if !task_progress.is_empty() { format!("{}\n", task_progress) } else { String::new() }
                            )
                        } else if user_asks_to_check_or_list_files {
                            // 用户要求检查/列出文件，必须要求AI给出完整的文件列表总结
                            format!(
                                "重要：你已经调用了 list_files 工具检查了文件，现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                            )
                        } else {
                            // 用户没有明确要求检查文件，可能是其他任务
                            "请基于以上结果继续执行用户的任务。如果用户明确要求移动文件、创建文件夹等操作，请立即调用相应的工具完成，不要停止或等待。".to_string()
                        }
                    } else {
                        "请基于以上结果继续执行用户的任务。如果任务还未完成，请继续调用相应的工具完成剩余步骤。".to_string()
                    };
                    
                    // 如果有任务进度提示，添加到消息中
                    let final_content = if !task_progress.is_empty() {
                        format!("工具调用执行完成，结果如下：\n\n{}{}\n\n{}", tool_results_content, task_progress, continue_instruction)
                    } else {
                        format!("工具调用执行完成，结果如下：\n\n{}{}", tool_results_content, continue_instruction)
                    };
                    
                    // 如果任务未完成，添加调试日志
                    if task_incomplete {
                        eprintln!("⚠️ 任务未完成，强制要求 AI 继续：{}", task_progress);
                    }
                    
                    current_messages.push(ChatMessage {
                        role: "user".to_string(),
                        content: final_content,
                    });
                    
                    eprintln!("📝 构建新的消息列表，消息数量: {}", current_messages.len());
                    
                    // 估算消息历史长度，如果过长则截断（防止Token超限）
                    // 简单估算：1 token ≈ 4 字符，保留约80%的token预算给响应
                    let total_chars: usize = current_messages.iter().map(|m| m.content.len()).sum();
                    let estimated_tokens = total_chars / 4;
                    let max_context_tokens = (model_config_clone.max_tokens * 10).min(30000); // 假设上下文窗口为32K，保留一些给响应
                    
                    if estimated_tokens > max_context_tokens {
                        eprintln!("⚠️ 消息历史过长（估算 {} tokens），截断以预防Token超限", estimated_tokens);
                        // 保留系统消息（第一条）和最后10条消息
                        if current_messages.len() > 11 {
                            let system_msg = current_messages.remove(0);
                            let recent_count = 10.min(current_messages.len());
                            let recent_msgs: Vec<ChatMessage> = current_messages.drain(current_messages.len().saturating_sub(recent_count)..).collect();
                            current_messages.clear();
                            current_messages.push(system_msg);
                            current_messages.extend(recent_msgs);
                            eprintln!("📝 截断后消息数量: {}", current_messages.len());
                        }
                    }
                    
                    // ⚠️ 关键修复：在继续对话前检查取消标志（使用全局标志映射）
                    {
                        let should_cancel = {
                            let flags = CANCEL_FLAGS.lock().unwrap();
                            if let Some(flag) = flags.get(&tab_id) {
                                let flag_guard = flag.lock().unwrap();
                                *flag_guard
                            } else {
                                false
                            }
                        }; // 这里 flags 和 flag_guard 都会被释放
                        
                        if should_cancel {
                            eprintln!("🛑 继续对话前检测到取消标志，停止处理: tab_id={}", tab_id);
                            // 发送取消事件
                            let payload = serde_json::json!({
                                "tab_id": tab_id,
                                "chunk": "",
                                "done": true,
                                "error": "用户取消了请求",
                            });
                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                eprintln!("发送取消事件失败: {}", e);
                            }
                            // ⚠️ 关键修复：清理取消通道和标志
                            {
                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                channels.remove(&tab_id);
                            }
                            {
                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                flags.remove(&tab_id);
                            }
                            return;
                        }
                    }
                    
                    // 重新调用 chat_stream 继续对话（带Token超限重试机制）
                    // ⚠️ 关键修复：为继续对话创建新的取消通道并注册
                    let (new_cancel_tx, mut new_cancel_rx) = tokio::sync::oneshot::channel();
                    {
                        let mut channels = CANCEL_CHANNELS.lock().unwrap();
                        channels.insert(tab_id.clone(), new_cancel_tx);
                        eprintln!("✅ 继续对话时注册新的取消通道: tab_id={}", tab_id);
                    }
                    
                    // ⚠️ 关键修复：为继续对话创建新的取消标志并注册到全局映射
                    let continue_cancel_flag = Arc::new(Mutex::new(false));
                    let continue_cancel_flag_for_stream = continue_cancel_flag.clone();
                    {
                        let mut flags = CANCEL_FLAGS.lock().unwrap();
                        flags.insert(tab_id.clone(), continue_cancel_flag.clone());
                        eprintln!("✅ 继续对话时注册取消标志: tab_id={}", tab_id);
                    }
                    
                    let mut retry_count = 0;
                    let max_retries = 2;
                    let mut stream_result = loop {
                        // ⚠️ 关键修复：在调用 chat_stream 前检查取消标志
                        {
                            let flag = continue_cancel_flag.lock().unwrap();
                            if *flag {
                                eprintln!("🛑 继续对话前检测到取消标志，停止处理: tab_id={}", tab_id);
                                // 检查 CANCEL_CHANNELS 中是否还有 new_cancel_tx
                                let has_cancel_tx = {
                                    let channels = CANCEL_CHANNELS.lock().unwrap();
                                    channels.contains_key(&tab_id)
                                };
                                if !has_cancel_tx {
                                    // 取消信号已发送，返回错误
                                    break Err(crate::services::ai_error::AIError::Cancelled);
                                }
                            }
                        }
                        
                        match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut new_cancel_rx, tool_definitions_clone.as_deref()).await {
                        Ok(mut new_stream) => {
                            break Ok(new_stream);
                        }
                        Err(e) => {
                            let error_str = e.to_string();
                            // 检测Token超限错误
                            if error_str.contains("Token超限") || error_str.contains("token") || 
                               error_str.contains("length") || error_str.contains("context") ||
                               error_str.contains("maximum") || error_str.contains("exceeded") {
                                if retry_count < max_retries {
                                    retry_count += 1;
                                    eprintln!("⚠️ Token超限，尝试截断消息历史（第 {} 次重试）", retry_count);
                                    // 更激进的截断：只保留系统消息和最后5条消息
                                    if current_messages.len() > 6 {
                                        let system_msg = current_messages.remove(0);
                                        let recent_count = 5.min(current_messages.len());
                                        let recent_msgs: Vec<ChatMessage> = current_messages.drain(current_messages.len().saturating_sub(recent_count)..).collect();
                                        current_messages.clear();
                                        current_messages.push(system_msg);
                                        current_messages.extend(recent_msgs);
                                        eprintln!("📝 截断后消息数量: {}", current_messages.len());
                                    }
                                    // ⚠️ 关键修复：重新创建cancel channel并注册
                                    let (new_cancel_tx2, mut new_cancel_rx2) = tokio::sync::oneshot::channel();
                                    {
                                        let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                        channels.insert(tab_id.clone(), new_cancel_tx2);
                                        eprintln!("✅ Token超限重试时注册新的取消通道: tab_id={}", tab_id);
                                    }
                                    new_cancel_rx = new_cancel_rx2;
                                    continue;
                                } else {
                                    eprintln!("❌ Token超限，已重试 {} 次仍失败", max_retries);
                                    break Err(e);
                                }
                            } else {
                                // 其他错误，直接返回
                                break Err(e);
                            }
                        }
                    }
                    };
                    
                    match stream_result {
                        Ok(mut new_stream) => {
                            eprintln!("✅ 重新调用 chat_stream 成功，继续处理流式响应");
                            streaming_handler.clear_accumulated(&tab_id); // 清空累积文本
                            
                            // 继续处理新的流式响应（支持多轮工具调用）
                            let mut continue_loop = true;
                            let mut new_tool_results: Vec<(String, String, crate::services::tool_service::ToolResult)> = Vec::new();
                            // 使用新的流式响应处理器
                            let mut new_streaming_handler = StreamingResponseHandler::new();
                            
                            // 循环检测：记录上一次的回复内容，防止无限循环
                            let mut last_reply_content: Option<String> = None;
                            let mut continue_reply_retry_count = 0;
                            const MAX_CONTINUE_REPLY_RETRIES: usize = 3; // 最大重试次数
                            
                            // 累积所有工具调用结果（包括第一次的和后续的），用于任务完成度分析
                            let mut all_tool_results = tool_results.clone();
                            
                            // 添加循环检测和重试限制
                            let mut force_continue_count = 0; // 强制继续的次数
                            const MAX_FORCE_CONTINUE_RETRIES: usize = 5; // 最大强制继续重试次数
                            let mut last_force_continue_content: Option<String> = None; // 上次强制继续时的回复内容
                            
                            while continue_loop {
                                continue_loop = false; // 默认不继续循环，除非有工具调用
                                
                                // ⚠️ 关键修复：在继续对话的流处理循环中也使用 select! 检查取消标志
                                loop {
                                    // 使用 tokio::select! 同时等待流和取消信号
                                    let continue_cancel_check = {
                                        let continue_cancel_flag = continue_cancel_flag_for_stream.clone();
                                        async move {
                                            loop {
                                                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                                let flag = continue_cancel_flag.lock().unwrap();
                                                if *flag {
                                                    return true;
                                                }
                                            }
                                        }
                                    };
                                    
                                    let result = tokio::select! {
                                        result = new_stream.next() => {
                                            match result {
                                                Some(r) => Some(r),
                                                None => {
                                                    // 流结束
                                                    break;
                                                }
                                            }
                                        }
                                        _ = continue_cancel_check => {
                                            // 取消信号已触发
                                            eprintln!("🛑 继续对话中通过 select! 检测到取消标志，停止处理: tab_id={}", tab_id);
                                            // 发送取消事件
                                            let payload = serde_json::json!({
                                                "tab_id": tab_id,
                                                "chunk": "",
                                                "done": true,
                                                "error": "用户取消了请求",
                                            });
                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                eprintln!("发送取消事件失败: {}", e);
                                            }
                                            // ⚠️ 关键修复：清理取消通道和标志
                                            {
                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                channels.remove(&tab_id);
                                            }
                                            {
                                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                                flags.remove(&tab_id);
                                            }
                                            return;
                                        }
                                    };
                                    
                                    // 处理流数据
                                    let result = match result {
                                        Some(r) => r,
                                        None => break,
                                    };
                                    
                                    match result {
                                        Ok(chunk) => {
                                            match chunk {
                                                ChatChunk::Text(text) => {
                                                    // 使用 StreamingResponseHandler 处理文本chunk
                                                    if let Some(text_to_send) = new_streaming_handler.process_text_chunk(&tab_id, &text) {
                                                        // 发送给前端
                                                        let payload = serde_json::json!({
                                                            "tab_id": tab_id,
                                                            "chunk": text_to_send,
                                                            "done": false,
                                                        });
                                                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                            eprintln!("发送事件失败: {}", e);
                                                        }
                                                    }
                                                }
                                                ChatChunk::ToolCall { id, name, arguments, is_complete } => {
                                                    if !is_complete {
                                                        continue;
                                                    }
                                                    
                                                    eprintln!("🔧 继续对话中检测到工具调用: id={}, name={}", id, name);
                                                    
                                                    // 使用 ToolCallHandler 解析工具调用参数
                                                    let mut parsed_arguments = ToolCallHandler::parse_tool_arguments(&arguments);
                                                    
                                                    // ⚠️ 文档编辑功能：如果是 edit_current_editor_document，自动增强参数
                                                    if name == "edit_current_editor_document" {
                                                        // 在继续对话中，从保存的原始参数中获取编辑器信息
                                                        if let serde_json::Value::Object(ref mut map) = parsed_arguments {
                                                            // 自动添加 current_file 和 current_content 参数（如果缺少）
                                                            if !map.contains_key("current_file") {
                                                                if let Some(ref file_path) = current_file_clone {
                                                                    map.insert("current_file".to_string(), serde_json::Value::String(file_path.clone()));
                                                                    eprintln!("📝 [继续对话] 已添加 current_file: {}", file_path);
                                                                }
                                                            }
                                                            if !map.contains_key("current_content") {
                                                                if let Some(ref content) = current_editor_content_clone {
                                                                    map.insert("current_content".to_string(), serde_json::Value::String(content.clone()));
                                                                    eprintln!("📝 [继续对话] 已添加 current_content (长度: {})", content.len());
                                                                }
                                                            }
                                                            if !map.contains_key("edit_target") && edit_target_clone.is_some() {
                                                                map.insert("edit_target".to_string(), edit_target_clone.clone().unwrap());
                                                                eprintln!("📝 [继续对话] 已添加 edit_target (精确定位)");
                                                            }
                                                            if !map.contains_key("target_content") && !map.contains_key("edit_target") {
                                                                if let Some(ref sel) = selected_text_clone {
                                                                    if !sel.trim().is_empty() {
                                                                        map.insert("target_content".to_string(), serde_json::Value::String(sel.trim().to_string()));
                                                                        eprintln!("📝 [继续对话] 已添加 target_content 来自选中文本 (长度: {})", sel.trim().len());
                                                                    }
                                                                }
                                                            }
                                                            if map.contains_key("current_file") && map.contains_key("current_content") {
                                                                eprintln!("✅ [继续对话] edit_current_editor_document 参数已完整");
                                                            } else {
                                                                eprintln!("⚠️ [继续对话] edit_current_editor_document 仍然缺少参数");
                                                            }
                                                        }
                                                    }
                                                    
                                                    // 保存解析后的参数，用于后续发送结果事件
                                                    let parsed_args_for_result_continue = parsed_arguments.clone();
                                                    
                                                    // 发送工具调用事件到前端（使用解析后的 arguments）
                                                    let payload = serde_json::json!({
                                                        "tab_id": tab_id,
                                                        "chunk": "",
                                                        "done": false,
                                                        "tool_call": {
                                                            "id": id.clone(),
                                                            "name": name.clone(),
                                                            "arguments": parsed_arguments.clone(), // ✅ 使用解析后的 JSON 对象
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
                                                    
                                                    // ⚠️ 关键修复：在继续对话的工具调用执行前检查取消标志
                                                    {
                                                        let flag = continue_cancel_flag_for_stream.lock().unwrap();
                                                        if *flag {
                                                            eprintln!("🛑 继续对话中工具调用执行前检测到取消标志，停止执行: tab_id={}", tab_id);
                                                            // 发送取消事件
                                                            let payload = serde_json::json!({
                                                                "tab_id": tab_id,
                                                                "chunk": "",
                                                                "done": true,
                                                                "error": "用户取消了请求",
                                                            });
                                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                                eprintln!("发送取消事件失败: {}", e);
                                                            }
                                                            // ⚠️ 关键修复：清理取消通道和标志
                                                            {
                                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                                channels.remove(&tab_id);
                                                            }
                                                            {
                                                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                                                flags.remove(&tab_id);
                                                            }
                                                            return;
                                                        }
                                                    }
                                                    
                                                    eprintln!("🚀 继续对话中执行工具调用: {}", name);
                                                    
                                                    // 执行工具调用，带重试机制
                                                    // ⚠️ 关键修复：在工具调用执行过程中也要检查取消标志
                                                    let mut tool_result = None;
                                                    let mut last_error = None;
                                                    let max_retries = 3;
                                                    
                                                    for attempt in 1..=max_retries {
                                                        match tool_service.execute_tool(&tool_call, &workspace_path).await {
                                                            Ok(result) => {
                                                                if result.success {
                                                                    tool_result = Some(result);
                                                                    if attempt > 1 {
                                                                        eprintln!("✅ 继续对话中工具执行成功（第 {} 次尝试）: {}", attempt, name);
                                                                    }
                                                                    break;
                                                                } else {
                                                                    // 工具返回失败，但这是工具层面的失败（如文件不存在），不需要重试
                                                                    tool_result = Some(result);
                                                                    break;
                                                                }
                                                            }
                                                            Err(e) => {
                                                                last_error = Some(e.clone());
                                                                eprintln!("⚠️ 继续对话中工具执行失败（第 {} 次尝试）: {} - {}", attempt, name, e);
                                                                if attempt < max_retries {
                                                                    // 等待一小段时间后重试（指数退避）
                                                                    let delay_ms = 100 * attempt;
                                                                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                                                                    eprintln!("🔄 重试工具调用: {} (尝试 {}/{})", name, attempt + 1, max_retries);
                                                                }
                                                            }
                                                        }
                                                    }
                                                    
                                                    let tool_result = match tool_result {
                                                        Some(result) => result,
                                                        None => {
                                                            // 所有重试都失败了
                                                            let error_msg = last_error.unwrap_or_else(|| "未知错误".to_string());
                                                            eprintln!("❌ 继续对话中工具执行最终失败（已重试 {} 次）: {} - {}", max_retries, name, error_msg);
                                                            crate::services::tool_service::ToolResult {
                                                                success: false,
                                                                data: None,
                                                                error: Some(format!("执行失败（已重试 {} 次）: {}", max_retries, error_msg)),
                                                                message: None,
                                                            }
                                                        }
                                                    };
                                                    
                                                    // ⚠️ 关键修复：在继续对话的工具调用执行后检查取消标志
                                                    {
                                                        let flag = continue_cancel_flag_for_stream.lock().unwrap();
                                                        if *flag {
                                                            eprintln!("🛑 继续对话中工具调用执行后检测到取消标志，停止处理: tab_id={}", tab_id);
                                                            // 发送取消事件
                                                            let payload = serde_json::json!({
                                                                "tab_id": tab_id,
                                                                "chunk": "",
                                                                "done": true,
                                                                "error": "用户取消了请求",
                                                            });
                                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                                eprintln!("发送取消事件失败: {}", e);
                                                            }
                                                            // ⚠️ 关键修复：清理取消通道和标志
                                                            {
                                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                                channels.remove(&tab_id);
                                                            }
                                                            {
                                                                let mut flags = CANCEL_FLAGS.lock().unwrap();
                                                                flags.remove(&tab_id);
                                                            }
                                                            return;
                                                        }
                                                    }
                                                    
                                                    if tool_result.success {
                                                        eprintln!("✅ 继续对话中工具执行成功: {}", name);
                                                            
                                                            // 保存工具调用结果
                                                            new_tool_results.push((id.clone(), name.clone(), tool_result.clone()));
                                                            
                                                            // 立即更新累积结果，用于任务进度分析
                                                            all_tool_results.push((id.clone(), name.clone(), tool_result.clone()));
                                                            
                                                            // 发送工具调用结果到前端
                                                            let tool_result_message = format!(
                                                                "\n\n[工具调用: {}]\n结果: {}",
                                                                name,
                                                                serde_json::to_string_pretty(&tool_result).unwrap_or_default()
                                                            );
                                                            
                                                            let payload = serde_json::json!({
                                                                "tab_id": tab_id,
                                                                "chunk": tool_result_message,
                                                                "done": false,
                                                                "tool_call": {
                                                                    "id": id,
                                                                    "name": name,
                                                                    "arguments": parsed_args_for_result_continue.clone(), // ✅ 使用解析后的 JSON 对象
                                                                    "result": tool_result,
                                                                    "status": "completed",
                                                                },
                                                            });
                                                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                                eprintln!("发送工具调用结果失败: {}", e);
                                                            }
                                                            
                                                            // 标记需要继续循环
                                                            continue_loop = true;
                                                    } else {
                                                        // 工具执行失败（工具层面的失败，如文件不存在）
                                                        eprintln!("⚠️ 继续对话中工具执行失败: {} - {}", name, tool_result.error.as_ref().unwrap_or(&"未知错误".to_string()));
                                                        
                                                        let error_result = crate::services::tool_service::ToolResult {
                                                            success: false,
                                                            data: None,
                                                            error: tool_result.error.clone(),
                                                            message: None,
                                                        };
                                                        new_tool_results.push((id.clone(), name.clone(), error_result.clone()));
                                                        
                                                        // 立即更新累积结果
                                                        all_tool_results.push((id.clone(), name.clone(), error_result));
                                                        
                                                        let error_message = format!(
                                                            "\n\n[工具调用失败: {}]\n错误: {}",
                                                            name,
                                                            tool_result.error.as_ref().unwrap_or(&"未知错误".to_string())
                                                        );
                                                        let payload = serde_json::json!({
                                                            "tab_id": tab_id,
                                                            "chunk": error_message,
                                                            "done": false,
                                                            "tool_call": {
                                                                "id": id,
                                                                "name": name,
                                                                "arguments": parsed_args_for_result_continue.clone(), // ✅ 使用解析后的 JSON 对象
                                                                "result": tool_result,
                                                                "status": "failed",
                                                            },
                                                        });
                                                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                            eprintln!("发送工具调用错误失败: {}", e);
                                                        }
                                                        
                                                        // 即使失败，也标记需要继续循环（让 AI 知道有错误，可以尝试其他方式）
                                                        continue_loop = true;
                                                    }
                                                    
                                                    // 跳出内层循环，准备继续对话
                                                    break;
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("❌ 继续对话时发生错误: {}", e);
                                            // 检查任务完成度，如果未完成，尝试继续
                                            let task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                                            let task_incomplete = task_progress_info.is_incomplete;
                                            if task_incomplete {
                                                eprintln!("⚠️ 流错误但任务未完成，尝试继续");
                                                // 不设置 continue_loop = false，让外层逻辑处理
                                            } else {
                                                continue_loop = false;
                                            }
                                            break;
                                        }
                                    }
                                }
                                
                                // 如果流正常结束且没有工具调用，但有文本内容，需要保存到消息历史
                                // 但是，如果任务未完成，必须强制继续
                                let new_accumulated_text = new_streaming_handler.get_accumulated(&tab_id);
                                let new_accumulated_text_clone = new_accumulated_text.clone();
                                if !continue_loop && !new_accumulated_text_clone.is_empty() && new_tool_results.is_empty() {
                                    // 使用 TaskProgressAnalyzer 分析任务完成度
                                    let task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                                    let task_progress = task_progress_info.progress_hint.clone();
                                    
                                    // 使用结构化的字段判断任务是否未完成
                                    let task_incomplete = task_progress_info.is_incomplete;
                                    
                                    // 检查用户是否要求递归检查所有文件（使用 TaskProgressAnalyzer 的辅助方法）
                                    let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                    let user_asks_for_all_files_recursive = last_user_message
                                        .map(|m| TaskProgressAnalyzer::user_asks_for_recursive_check(&m.content))
                                        .unwrap_or(false);
                                    
                                    // 如果用户要求递归检查，使用 TaskProgressAnalyzer 的结果判断是否完成
                                    let recursive_check_incomplete = if user_asks_for_all_files_recursive {
                                        task_progress_info.task_type == crate::services::task_progress_analyzer::TaskType::RecursiveCheck && 
                                        task_progress_info.is_incomplete
                                    } else {
                                        false
                                    };
                                    
                                    // 使用 ReplyCompletenessChecker 检查回复是否完整
                                    let reply_complete = reply_checker.is_complete(&new_accumulated_text_clone);
                                    
                                    // 综合判断任务是否未完成
                                    let task_really_incomplete = task_incomplete || recursive_check_incomplete;
                                    
                                    eprintln!("🔍 流结束检查：任务未完成={}, 递归检查未完成={}, 回复完整={}, 文本长度={}", 
                                        task_incomplete, recursive_check_incomplete, reply_complete, new_accumulated_text_clone.len());
                                    
                                    // 使用 ReplyCompletenessChecker 检查回复是否太短
                                    let is_reply_too_short = reply_checker.is_too_short(&new_accumulated_text_clone) && !reply_complete;
                                    if is_reply_too_short && !task_really_incomplete {
                                        eprintln!("⚠️ 警告：回复内容可能不完整（长度={}，未以标点符号结尾），但流已结束，保存当前回复", new_accumulated_text_clone.len());
                                    }
                                    
                                    // 更新任务未完成标志
                                    let task_incomplete = task_really_incomplete;
                                    
                                    if task_incomplete {
                                        // 使用 LoopDetector 检查是否超过最大重试次数
                                        if loop_detector.check_max_force_continue_retries(force_continue_count) {
                                            eprintln!("⚠️ 已达到最大强制继续重试次数（{}），停止继续请求", loop_detector.max_force_continue_retries);
                                            eprintln!("📝 保存当前回复（长度={}）", new_accumulated_text_clone.len());
                                            // 不再继续，保存当前回复
                                            continue_loop = false;
                                        } else {
                                            // 使用 LoopDetector 检测内容重复
                                            // 先检查上次内容，然后检测当前内容
                                            let mut is_same_as_last_force = if let Some(last) = &last_force_continue_content {
                                                let last_trimmed = last.trim();
                                                let current_trimmed = new_accumulated_text_clone.trim();
                                                
                                                // 完全相同的文本
                                                if last_trimmed == current_trimmed {
                                                    true
                                                } else {
                                                    // 检测重复模式
                                                    let repetitive_patterns = [
                                                        "我理解需要提供文件列表总结",
                                                        "让我先删除临时文件",
                                                        "然后再尝试删除整个文件夹",
                                                        "让我先完成用户的主要任务",
                                                    ];
                                                    
                                                    // 检查是否都包含相同的重复模式
                                                    let last_has_pattern = repetitive_patterns.iter().any(|pattern| last_trimmed.contains(pattern));
                                                    let current_has_pattern = repetitive_patterns.iter().any(|pattern| current_trimmed.contains(pattern));
                                                    
                                                    // 如果都包含重复模式，且内容相似度很高，认为是重复
                                                    if last_has_pattern && current_has_pattern {
                                                        // 计算相似度：检查关键短语是否相同
                                                        let last_words: Vec<&str> = last_trimmed.split_whitespace().collect();
                                                        let current_words: Vec<&str> = current_trimmed.split_whitespace().collect();
                                                        
                                                        let common_words = last_words.iter()
                                                            .filter(|word| current_words.contains(word))
                                                            .count();
                                                        let similarity = if last_words.len() > 0 {
                                                            common_words as f64 / last_words.len() as f64
                                                        } else {
                                                            0.0
                                                        };
                                                        
                                                        similarity > 0.6 // 如果相似度超过60%，认为是重复
                                                    } else {
                                                        false
                                                    }
                                                }
                                            } else {
                                                false
                                            };
                                            
                                            // 同时使用 LoopDetector 检测
                                            if !is_same_as_last_force {
                                                is_same_as_last_force = loop_detector.detect_content_repetition(&new_accumulated_text_clone);
                                            }
                                            
                                            if is_same_as_last_force {
                                                eprintln!("⚠️ 检测到循环：回复内容与上次强制继续时相同，停止继续请求");
                                                eprintln!("📝 保存当前回复（长度={}）", new_accumulated_text_clone.len());
                                                // 不再继续，保存当前回复
                                                continue_loop = false;
                                            } else {
                                                force_continue_count += 1;
                                                last_force_continue_content = Some(new_accumulated_text_clone.clone());
                                                
                                                eprintln!("⚠️ 流结束但任务未完成，强制继续对话（第 {} 次）", force_continue_count);
                                                eprintln!("📊 任务进度详情：{}", task_progress);
                                                // 任务未完成，强制继续对话
                                                continue_loop = true;
                                                
                                                // 将 assistant 的回复添加到消息历史
                                                if !new_accumulated_text_clone.is_empty() {
                                                    current_messages.push(ChatMessage {
                                                        role: "assistant".to_string(),
                                                        content: new_accumulated_text_clone.clone(),
                                                    });
                                                }
                                            }
                                        }
                                    } else {
                                        // 任务完成，重置计数器
                                        force_continue_count = 0;
                                        last_force_continue_content = None;
                                    }
                                    
                                    if task_incomplete && continue_loop {
                                        
                                        // 根据任务类型生成不同的强制继续提示
                                        let force_continue_message = if recursive_check_incomplete {
                                            // 递归检查任务未完成
                                            format!(
                                                "{}\n\n任务未完成警告：你还没有完成对所有文件夹的检查。\n\n重要指令：\n1. 必须使用 list_files 工具检查所有子文件夹\n2. 不要停止，不要结束回复\n3. 必须检查完所有文件夹才能结束\n4. 立即调用 list_files 工具检查剩余的文件夹\n\n执行要求：必须调用工具继续检查，不要只回复文本。",
                                                task_progress
                                            )
                                        } else {
                                            // 文件移动任务未完成
                                            format!(
                                                "{}\n\n任务未完成警告：检测到还有文件未处理，请立即继续调用 move_file 工具完成剩余文件的移动。\n\n重要指令：\n1. 不要停止，不要结束回复\n2. 必须处理完所有文件才能结束\n3. 立即调用 move_file 工具，不要等待\n4. 如果回复被截断，请继续调用工具，不要生成文本回复\n\n执行要求：必须调用工具，不要只回复文本。",
                                                task_progress
                                            )
                                        };
                                        
                                        current_messages.push(ChatMessage {
                                            role: "user".to_string(),
                                            content: force_continue_message,
                                        });
                                        
                                        // 清空文本，准备下一轮
                                        new_streaming_handler.clear_accumulated(&tab_id);
                                        
                                        // ⚠️ 关键修复：任务未完成时，必须重新调用 chat_stream 继续对话
                                        eprintln!("🔄 任务未完成，重新调用 chat_stream 继续执行");
                                        // ⚠️ 关键修复：为强制继续创建新的取消通道并注册
                                        let (force_continue_cancel_tx, mut force_continue_cancel_rx) = tokio::sync::oneshot::channel();
                                        {
                                            let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                            channels.insert(tab_id.clone(), force_continue_cancel_tx);
                                            eprintln!("✅ 强制继续时注册新的取消通道: tab_id={}", tab_id);
                                        }
                                        let mut force_retry_count = 0;
                                        let max_force_retries = 2;
                                        let mut force_stream_result = loop {
                                            match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut force_continue_cancel_rx, tool_definitions_clone.as_deref()).await {
                                                Ok(force_stream) => {
                                                    break Ok(force_stream);
                                                }
                                                Err(e) => {
                                                    let error_str = e.to_string();
                                                    // 检测Token超限错误
                                                    if error_str.contains("Token超限") || error_str.contains("token") || 
                                                       error_str.contains("length") || error_str.contains("context") ||
                                                       error_str.contains("maximum") || error_str.contains("exceeded") {
                                                        if force_retry_count < max_force_retries {
                                                            force_retry_count += 1;
                                                            eprintln!("⚠️ Token超限，尝试截断消息历史（第 {} 次重试）", force_retry_count);
                                                            // 更激进的截断：只保留系统消息和最后5条消息
                                                            if current_messages.len() > 6 {
                                                                let system_msg = current_messages.remove(0);
                                                                let recent_count = 5.min(current_messages.len());
                                                                let recent_msgs: Vec<ChatMessage> = current_messages.drain(current_messages.len().saturating_sub(recent_count)..).collect();
                                                                current_messages.clear();
                                                                current_messages.push(system_msg);
                                                                current_messages.extend(recent_msgs);
                                                                eprintln!("📝 截断后消息数量: {}", current_messages.len());
                                                            }
                                                            // ⚠️ 关键修复：重新创建cancel channel并注册
                                                            let (force_continue_cancel_tx2, mut force_continue_cancel_rx2) = tokio::sync::oneshot::channel();
                                                            {
                                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                                channels.insert(tab_id.clone(), force_continue_cancel_tx2);
                                                                eprintln!("✅ Token超限重试时注册新的取消通道（强制继续）: tab_id={}", tab_id);
                                                            }
                                                            force_continue_cancel_rx = force_continue_cancel_rx2;
                                                            continue;
                                                        } else {
                                                            eprintln!("❌ Token超限，已重试 {} 次仍失败", max_force_retries);
                                                            break Err(e);
                                                        }
                                                    } else {
                                                        // 其他错误，直接返回
                                                        break Err(e);
                                                    }
                                                }
                                            }
                                        };
                                        
                                        match force_stream_result {
                                            Ok(force_stream) => {
                                                eprintln!("✅ 强制继续对话，重新调用 chat_stream 成功");
                                                new_stream = force_stream;
                                                // continue_loop 已经是 true，会继续循环
                                            }
                                            Err(e) => {
                                                eprintln!("❌ 强制继续对话失败: {}", e);
                                                continue_loop = false;
                                            }
                                        }
                                    } else {
                                        // 任务已完成，检查是否需要总结
                                        let task_completed = !task_progress.is_empty() && task_progress.contains("任务完成确认");
                                        
                                        // 检查是否调用了 read_file 且用户要求总结内容
                                        let has_read_file = all_tool_results.iter().any(|(_, name, _)| name == "read_file");
                                        let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                        let user_asks_for_summary = last_user_message
                                            .map(|m| {
                                                let content_lower = m.content.to_lowercase();
                                                content_lower.contains("写了什么") || 
                                                content_lower.contains("内容是什么") || 
                                                (content_lower.contains("内容") && (content_lower.contains("总结") || content_lower.contains("概述") || content_lower.contains("介绍"))) ||
                                                content_lower.contains("总结") || 
                                                content_lower.contains("概述") ||
                                                content_lower.contains("介绍")
                                            })
                                            .unwrap_or(false);
                                        
                                        // 如果调用了 read_file 且用户要求总结，但回复很短，可能需要总结
                                        let needs_summary_for_read = has_read_file && user_asks_for_summary && new_accumulated_text_clone.len() < 200;
                                        
                                        let has_summary = reply_checker.has_summary(&new_accumulated_text_clone);
                                        
                                        eprintln!("📝 流正常结束，任务完成={}, 已有总结={}, 需要总结={}, 文本长度={}", task_completed, has_summary, needs_summary_for_read, new_accumulated_text_clone.len());
                                        
                                        if (task_completed || needs_summary_for_read) && !has_summary {
                                            // 任务完成但没有总结，或用户要求总结文件内容，要求AI做总结
                                            if needs_summary_for_read {
                                                eprintln!("📋 用户要求总结文件内容，但回复不完整，要求AI做内容总结");
                                            } else {
                                                eprintln!("📋 任务已完成，要求AI做工作总结");
                                            }
                                            continue_loop = true;
                                            
                                            // 将 assistant 的回复添加到消息历史
                                            if !new_accumulated_text_clone.is_empty() {
                                                current_messages.push(ChatMessage {
                                                    role: "assistant".to_string(),
                                                    content: new_accumulated_text_clone.clone(),
                                                });
                                            }
                                            
                                            // 添加总结要求
                                            let summary_request = if needs_summary_for_read {
                                                // 用户要求总结文件内容
                                                "重要：用户要求了解文件内容。请基于你读取的文件，提供清晰的总结和概述，包括：\n1. 文件主要内容：简要说明文件的核心内容和主题\n2. 关键信息：列出文件中的重要信息点\n3. 文件特点：说明文件的格式、结构或特色\n\n请用自然语言回复，不要调用工具。".to_string()
                                            } else {
                                                // 任务完成总结
                                                format!(
                                                    "{}\n\n任务已完成，请进行工作总结：\n\n请检查你的工作，然后提供一份简洁的总结，包括：\n1. 完成的工作：简要说明你完成了哪些操作（如移动了多少文件、创建了哪些文件夹等）\n2. 执行逻辑：简要说明你是如何组织和执行这些操作的\n3. 执行效果：说明任务完成后的结果和状态\n4. 下一步建议：如果有需要用户注意的事项或后续建议，请说明\n\n请用自然语言回复，不要调用工具。",
                                                    task_progress
                                                )
                                            };
                                            
                                            current_messages.push(ChatMessage {
                                                role: "user".to_string(),
                                                content: summary_request,
                                            });
                                            
                                            // 清空文本，准备下一轮
                                            new_streaming_handler.clear_accumulated(&tab_id);
                                            
                                            // ⚠️ 关键修复：在获取总结前检查取消标志
                                            {
                                                let flag = continue_cancel_flag_for_stream.lock().unwrap();
                                                if *flag {
                                                    eprintln!("🛑 获取总结前检测到取消标志，停止处理: tab_id={}", tab_id);
                                                    // 发送取消事件
                                                    let payload = serde_json::json!({
                                                        "tab_id": tab_id,
                                                        "chunk": "",
                                                        "done": true,
                                                        "error": "用户取消了请求",
                                                    });
                                                    if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                                        eprintln!("发送取消事件失败: {}", e);
                                                    }
                                                    // ⚠️ 关键修复：清理取消通道和标志
                                                    {
                                                        let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                        channels.remove(&tab_id);
                                                    }
                                                    {
                                                        let mut flags = CANCEL_FLAGS.lock().unwrap();
                                                        flags.remove(&tab_id);
                                                    }
                                                    return;
                                                }
                                            }
                                            
                                            // 重新调用 chat_stream 获取总结
                                            eprintln!("🔄 要求AI做工作总结，重新调用 chat_stream");
                                            // ⚠️ 关键修复：为总结创建新的取消通道并注册
                                            let (summary_cancel_tx, mut summary_cancel_rx) = tokio::sync::oneshot::channel();
                                            {
                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                channels.insert(tab_id.clone(), summary_cancel_tx);
                                                eprintln!("✅ 获取总结时注册新的取消通道: tab_id={}", tab_id);
                                            }
                                            let mut summary_retry_count = 0;
                                            let max_summary_retries = 2;
                                            let mut summary_stream_result = loop {
                                                match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut summary_cancel_rx, tool_definitions_clone.as_deref()).await {
                                                    Ok(summary_stream) => {
                                                        break Ok(summary_stream);
                                                    }
                                                    Err(e) => {
                                                        let error_str = e.to_string();
                                                        // 检测Token超限错误
                                                        if error_str.contains("Token超限") || error_str.contains("token") || 
                                                           error_str.contains("length") || error_str.contains("context") ||
                                                           error_str.contains("maximum") || error_str.contains("exceeded") {
                                                            if summary_retry_count < max_summary_retries {
                                                                summary_retry_count += 1;
                                                                eprintln!("⚠️ Token超限，尝试截断消息历史（第 {} 次重试）", summary_retry_count);
                                                                // 更激进的截断：只保留系统消息和最后5条消息
                                                                if current_messages.len() > 6 {
                                                                    let system_msg = current_messages.remove(0);
                                                                    let recent_count = 5.min(current_messages.len());
                                                                    let recent_msgs: Vec<ChatMessage> = current_messages.drain(current_messages.len().saturating_sub(recent_count)..).collect();
                                                                    current_messages.clear();
                                                                    current_messages.push(system_msg);
                                                                    current_messages.extend(recent_msgs);
                                                                    eprintln!("📝 截断后消息数量: {}", current_messages.len());
                                                                }
                                                                // ⚠️ 关键修复：重新创建cancel channel并注册
                                                                let (summary_cancel_tx2, mut summary_cancel_rx2) = tokio::sync::oneshot::channel();
                                                                {
                                                                    let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                                    channels.insert(tab_id.clone(), summary_cancel_tx2);
                                                                    eprintln!("✅ Token超限重试时注册新的取消通道（总结）: tab_id={}", tab_id);
                                                                }
                                                                summary_cancel_rx = summary_cancel_rx2;
                                                                continue;
                                                            } else {
                                                                eprintln!("❌ Token超限，已重试 {} 次仍失败", max_summary_retries);
                                                                break Err(e);
                                                            }
                                                        } else {
                                                            // 其他错误，直接返回
                                                            break Err(e);
                                                        }
                                                    }
                                                }
                                            };
                                            
                                            match summary_stream_result {
                                                Ok(summary_stream) => {
                                                    eprintln!("✅ 获取工作总结，重新调用 chat_stream 成功");
                                                    new_stream = summary_stream;
                                                    // continue_loop 已经是 true，会继续循环
                                                }
                                                Err(e) => {
                                                    eprintln!("❌ 获取工作总结失败: {}", e);
                                                    continue_loop = false;
                                                }
                                            }
                                        } else {
                                            // 任务未完成或已有总结，正常保存
                                            // 检查回复是否完整
                                            // 使用 ReplyCompletenessChecker 检查回复是否完整
                                            let reply_complete = reply_checker.is_complete(&new_accumulated_text_clone);
                                            let is_reply_too_short = reply_checker.is_too_short(&new_accumulated_text_clone) && !reply_complete;
                                            
                                            // 检查是否有工具调用结果但回复不完整（这是关键场景）
                                            let has_tool_results_but_incomplete = !all_tool_results.is_empty() && is_reply_too_short;
                                            
                                            if is_reply_too_short {
                                                // 循环检测：检查是否与上一次回复内容相同或语义重复
                                                let is_same_as_last = last_reply_content.as_ref()
                                                    .map(|last| {
                                                        let last_trimmed = last.trim();
                                                        let current_trimmed = new_accumulated_text_clone.trim();
                                                        
                                                        // 1. 完全相同的文本
                                                        if last_trimmed == current_trimmed {
                                                            return true;
                                                        }
                                                        
                                                        // 2. 语义重复检测：检查是否包含相同的模式
                                                        // 模式1：说明状态但不执行（"我理解"、"需要完成"、"还需要检查"）
                                                        let repetitive_patterns = [
                                                            "我理解您的要求",
                                                            "我需要完成",
                                                            "还需要检查",
                                                            "还需要检查剩余的",
                                                            "目前我只检查了",
                                                            "还需要检查剩余的",
                                                            "让我继续执行计划",
                                                            "让我继续检查",
                                                            "我理解需要提供文件列表总结",
                                                            "让我先删除临时文件",
                                                            "然后再尝试删除整个文件夹",
                                                            "我理解需要提供文件列表总结，但让我先完成用户的主要任务",
                                                            "让我先完成用户的主要任务",
                                                        ];
                                                        
                                                        let last_has_pattern = repetitive_patterns.iter().any(|pattern| last_trimmed.contains(pattern));
                                                        let current_has_pattern = repetitive_patterns.iter().any(|pattern| current_trimmed.contains(pattern));
                                                        
                                                        // 如果都包含重复模式，且内容相似度很高，认为是语义重复
                                                        if last_has_pattern && current_has_pattern {
                                                            // 计算相似度：检查关键短语是否相同
                                                            let last_key_phrases: Vec<&str> = last_trimmed.split_whitespace().collect();
                                                            let current_key_phrases: Vec<&str> = current_trimmed.split_whitespace().collect();
                                                            
                                                            // 如果关键短语有80%以上相同，认为是语义重复
                                                            let common_phrases = last_key_phrases.iter()
                                                                .filter(|phrase| current_key_phrases.contains(phrase))
                                                                .count();
                                                            let similarity = if last_key_phrases.len() > 0 {
                                                                common_phrases as f64 / last_key_phrases.len() as f64
                                                            } else {
                                                                0.0
                                                            };
                                                            
                                                            if similarity > 0.7 {
                                                                return true;
                                                            }
                                                        }
                                                        
                                                        false
                                                    })
                                                    .unwrap_or(false);
                                                
                                                // 检查是否超过最大重试次数
                                                if continue_reply_retry_count >= MAX_CONTINUE_REPLY_RETRIES {
                                                    eprintln!("⚠️ 已达到最大重试次数（{}），停止继续请求AI完成回复", MAX_CONTINUE_REPLY_RETRIES);
                                                    eprintln!("📝 保存当前回复（长度={}）", new_accumulated_text_clone.len());
                                                    // 不再继续，保存当前回复
                                                } else if is_same_as_last {
                                                    eprintln!("⚠️ 检测到循环：回复内容与上一次相同或语义重复，停止继续请求");
                                                    eprintln!("📝 保存当前回复（长度={}）", new_accumulated_text_clone.len());
                                                    // 不再继续，保存当前回复
                                                } else {
                                                    // 根据是否有工具调用结果，生成不同的提示
                                                    if has_tool_results_but_incomplete {
                                                        eprintln!("⚠️ AI已调用工具但回复不完整（长度={}），要求AI总结工具调用结果（第 {} 次）", 
                                                            new_accumulated_text_clone.len(), continue_reply_retry_count + 1);
                                                    } else {
                                                        eprintln!("⚠️ 警告：回复内容可能不完整（长度={}，未以标点符号结尾），请求AI继续完成（第 {} 次）", 
                                                            new_accumulated_text_clone.len(), continue_reply_retry_count + 1);
                                                    }
                                                    
                                                    // 记录当前回复内容
                                                    last_reply_content = Some(new_accumulated_text_clone.clone());
                                                    continue_reply_retry_count += 1;
                                                    
                                                    // 将当前不完整的回复添加到消息历史
                                                    if !new_accumulated_text_clone.is_empty() {
                                                        current_messages.push(ChatMessage {
                                                            role: "assistant".to_string(),
                                                            content: new_accumulated_text_clone.clone(),
                                                        });
                                                    }
                                                    
                                                    // 请求AI继续完成回复（明确告诉AI需要做什么）
                                                    // 检查是否有工具调用结果需要总结
                                                    let has_tool_results = !all_tool_results.is_empty();
                                                    
                                                    // 检查用户是否要求检查/列出文件
                                                    let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                                    let user_asks_to_check_or_list_files = last_user_message
                                                        .map(|m| {
                                                            let content_lower = m.content.to_lowercase();
                                                            content_lower.contains("检查") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            content_lower.contains("列出") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            content_lower.contains("查看") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            content_lower.contains("有哪些") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            (content_lower.contains("所有文件") || content_lower.contains("全部文件")) ||
                                                            (content_lower.contains("文件") && (content_lower.contains("包括") || content_lower.contains("子文件夹") || content_lower.contains("子目录")))
                                                        })
                                                        .unwrap_or(false);
                                                    
                                                    let has_list_files_tool = all_tool_results.iter().any(|(_, name, _)| name == "list_files");
                                                    
                                                    let continue_prompt = if has_tool_results && has_list_files_tool && user_asks_to_check_or_list_files {
                                                        // 用户要求检查文件，且AI已调用list_files工具，必须要求完整列出所有文件
                                                        format!(
                                                            "重要：你的回复不完整。你已经调用了 list_files 工具检查了所有文件夹，现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件（包括文件名、路径等）\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                                                        )
                                                    } else if has_tool_results {
                                                        // 有其他工具调用结果，要求AI总结
                                                        format!(
                                                            "你的回复不完整。你已经调用了工具并获取了结果，现在需要：\n\n1. 完整总结所有工具调用的结果：详细列出你检查到的所有文件和文件夹\n2. 给出清晰的分类：按文件夹组织文件列表\n3. 提供完整的统计信息：总文件数、文件夹数等\n4. 以清晰、易读的格式呈现：使用列表、分类等方式\n\n请基于你的工具调用结果，提供一份完整、详细的文件列表总结。不要只给出简短回复，要完整呈现所有信息。"
                                                        )
                                                    } else {
                                                        // 如果没有工具调用，只是要求继续完成文本回复
                                                        "你的回复似乎不完整，请继续完成你的回答。确保回复完整、清晰，并以适当的标点符号结尾。".to_string()
                                                    };
                                                    
                                                    current_messages.push(ChatMessage {
                                                        role: "user".to_string(),
                                                        content: continue_prompt,
                                                    });
                                                    
                                                    // 清空文本，准备下一轮
                                                    new_streaming_handler.clear_accumulated(&tab_id);
                                                    
                                                    // 重新调用 chat_stream 继续完成回复
                                                    eprintln!("🔄 请求AI继续完成回复");
                                                    // ⚠️ 关键修复：为继续回复创建新的取消通道并注册
                                                    let (continue_reply_cancel_tx, mut continue_reply_cancel_rx) = tokio::sync::oneshot::channel();
                                                    {
                                                        let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                        channels.insert(tab_id.clone(), continue_reply_cancel_tx);
                                                        eprintln!("✅ 继续回复时注册新的取消通道: tab_id={}", tab_id);
                                                    }
                                                    match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut continue_reply_cancel_rx, tool_definitions_clone.as_deref()).await {
                                                        Ok(continue_stream) => {
                                                            eprintln!("✅ 成功请求AI继续完成回复");
                                                            new_stream = continue_stream;
                                                            continue_loop = true;
                                                            // 继续循环处理新的流
                                                            continue;
                                                        }
                                                        Err(e) => {
                                                            eprintln!("❌ 请求AI继续完成回复失败: {}", e);
                                                            // 如果继续失败，至少保存当前不完整的回复
                                                            eprintln!("📝 保存不完整的回复（长度={}）", new_accumulated_text_clone.len());
                                                        }
                                                    }
                                                }
                                            } else {
                                                // 回复完整，重置循环检测
                                                last_reply_content = None;
                                                continue_reply_retry_count = 0;
                                                // 基于第一性原理：分析AI的实际行为，判断任务是否真正完成
                                                // 1. 分析用户意图：是否明确要求递归检查所有文件或检查每一个文件夹
                                                let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                                let user_asks_for_all_files_recursive = last_user_message
                                                    .map(|m| {
                                                        let content_lower = m.content.to_lowercase();
                                                        // 明确要求递归检查的关键词（与流结束检查逻辑保持一致）
                                                        ((content_lower.contains("所有文件") || 
                                                          content_lower.contains("所有文件夹") || 
                                                          content_lower.contains("全部文件") ||
                                                          (content_lower.contains("检查") && content_lower.contains("文件"))) &&
                                                         (content_lower.contains("包括子文件夹") ||
                                                          content_lower.contains("包括子目录") ||
                                                          content_lower.contains("递归") ||
                                                          content_lower.contains("子文件夹") ||
                                                          content_lower.contains("子目录"))) ||
                                                        // 也支持更宽泛的表述：检查文件 + 子文件夹/递归
                                                        ((content_lower.contains("检查") || content_lower.contains("查看")) &&
                                                         (content_lower.contains("文件") || content_lower.contains("文件夹")) &&
                                                         (content_lower.contains("子文件夹") ||
                                                          content_lower.contains("子目录") ||
                                                          content_lower.contains("递归"))) ||
                                                        // 检查每一个文件夹
                                                        content_lower.contains("每一个") && (content_lower.contains("文件夹") || content_lower.contains("文件")) ||
                                                        content_lower.contains("每个") && (content_lower.contains("文件夹") || content_lower.contains("文件"))
                                                    })
                                                    .unwrap_or(false);
                                                
                                                // 2. 分析AI的实际行为：检查了哪些路径
                                                let mut root_list_files_result: Option<(usize, usize)> = None; // (总文件数, 文件夹数)
                                                let mut checked_subdirs = std::collections::HashSet::new();
                                                
                                                for (_id, tool_name, tool_result) in all_tool_results.iter() {
                                                    if tool_name == "list_files" && tool_result.success {
                                                        if let Some(data) = &tool_result.data {
                                                            let path = data.get("path").and_then(|p| p.as_str()).unwrap_or(".");
                                                            if let Some(files) = data.get("files").and_then(|f| f.as_array()) {
                                                                let mut dir_count = 0;
                                                                let mut file_count = 0;
                                                                for f in files {
                                                                    if let Some(is_dir) = f.get("is_directory").and_then(|d| d.as_bool()) {
                                                                        if is_dir {
                                                                            dir_count += 1;
                                                                            if path == "." || path.is_empty() {
                                                                                // 根目录的文件夹，记录名称
                                                                                if let Some(name) = f.get("name").and_then(|n| n.as_str()) {
                                                                                    checked_subdirs.insert(name.to_string());
                                                                                }
                                                                            }
                                                                        } else {
                                                                            file_count += 1;
                                                                        }
                                                                    }
                                                                }
                                                                
                                                                // 记录根目录的结果
                                                                if path == "." || path.is_empty() {
                                                                    root_list_files_result = Some((file_count, dir_count));
                                                                } else {
                                                                    // 记录已检查的子目录
                                                                    let dir_name = path.split('/').last().or_else(|| path.split('\\').last()).unwrap_or(path);
                                                                    checked_subdirs.insert(dir_name.to_string());
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                
                                                // 3. 判断执行完整性（更严格的判断逻辑）
                                                let execution_incomplete = if let Some((_root_files, root_dirs)) = root_list_files_result {
                                                    // 如果用户要求递归检查所有文件，且根目录有文件夹
                                                    if user_asks_for_all_files_recursive && root_dirs > 0 {
                                                        // 检查AI是否检查了所有子文件夹
                                                        // 改进：降低阈值，即使只有1-2个文件夹也要检查
                                                        let list_files_calls = all_tool_results.iter().filter(|(_, name, _)| *name == "list_files").count();
                                                        
                                                        // 更严格的判断：
                                                        // 1. 根目录有文件夹（root_dirs > 0）
                                                        // 2. list_files调用次数应该 >= 根目录文件夹数 + 1（至少检查根目录和每个子文件夹）
                                                        // 3. 如果调用次数不足，认为未完成
                                                        let expected_min_calls = root_dirs + 1; // 至少：1次根目录 + N次子文件夹
                                                        let is_incomplete = list_files_calls < expected_min_calls;
                                                        
                                                        if is_incomplete {
                                                            eprintln!("⚠️ 递归检查不完整：根目录有 {} 个文件夹，期望至少 {} 次 list_files 调用，实际 {} 次", 
                                                                root_dirs, expected_min_calls, list_files_calls);
                                                        }
                                                        
                                                        is_incomplete
                                                    } else {
                                                        false
                                                    }
                                                } else {
                                                    // 如果无法获取根目录信息，但用户要求递归检查，保守地认为可能未完成
                                                    if user_asks_for_all_files_recursive {
                                                        let list_files_calls = all_tool_results.iter().filter(|(_, name, _)| *name == "list_files").count();
                                                        // 如果只调用了1次list_files（可能只检查了根目录），认为可能未完成
                                                        if list_files_calls <= 1 {
                                                            eprintln!("⚠️ 可能未完成递归检查：用户要求递归检查，但只调用了 {} 次 list_files", list_files_calls);
                                                            true
                                                        } else {
                                                            false
                                                        }
                                                    } else {
                                                        false
                                                    }
                                                };
                                                
                                                // 4. 针对性的处理
                                                if execution_incomplete {
                                                    if let Some((_root_files, root_dirs)) = root_list_files_result {
                                                        eprintln!("⚠️ 检测到执行不完整：用户要求递归检查所有文件，根目录有 {} 个文件夹，但AI可能未检查完所有子文件夹", root_dirs);
                                                        
                                                        // 将当前回复添加到消息历史
                                                        if !new_accumulated_text_clone.is_empty() {
                                                            current_messages.push(ChatMessage {
                                                                role: "assistant".to_string(),
                                                                content: new_accumulated_text_clone.clone(),
                                                            });
                                                        }
                                                        
                                                        // 明确提示AI需要继续检查所有子文件夹
                                                        current_messages.push(ChatMessage {
                                                            role: "user".to_string(),
                                                            content: format!(
                                                                "任务未完成警告：你还没有检查完所有子文件夹。\n\n根目录下有 {} 个文件夹，但你只检查了部分文件夹。\n\n重要指令：\n1. 必须使用 list_files 工具检查剩余的每个子文件夹\n2. 不要停止，不要结束回复\n3. 必须检查完所有文件夹才能结束\n4. 立即调用 list_files 工具检查剩余的文件夹\n\n执行要求：必须调用工具继续检查，不要只回复文本。",
                                                                root_dirs
                                                            ),
                                                        });
                                                        
                                                        // 清空文本，准备下一轮
                                                        new_streaming_handler.clear_accumulated(&tab_id);
                                                        
                                                        // 重新调用 chat_stream 继续完成
                                                        eprintln!("🔄 请求AI继续完成所有子文件夹的检查");
                                                        let (_, mut continue_check_cancel_rx) = tokio::sync::oneshot::channel();
                                                        match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut continue_check_cancel_rx, tool_definitions_clone.as_deref()).await {
                                                            Ok(continue_stream) => {
                                                                eprintln!("✅ 成功请求AI继续完成文件检查");
                                                                new_stream = continue_stream;
                                                                continue_loop = true;
                                                                // 继续循环处理新的流
                                                                continue;
                                                            }
                                                            Err(e) => {
                                                                eprintln!("❌ 请求AI继续完成文件检查失败: {}", e);
                                                                // 如果继续失败，至少保存当前回复
                                                                eprintln!("📝 保存当前回复（长度={}）", new_accumulated_text_clone.len());
                                                            }
                                                        }
                                                    } else {
                                                        // 无法获取根目录信息，正常保存
                                                        eprintln!("📝 流正常结束，保存 assistant 回复到消息历史（长度={}，完整={}）", new_accumulated_text_clone.len(), reply_complete);
                                                        current_messages.push(ChatMessage {
                                                            role: "assistant".to_string(),
                                                            content: new_accumulated_text_clone.clone(),
                                                        });
                                                    }
                                                } else {
                                                    // 检查用户是否要求检查/列出文件，且AI是否给出了完整的文件列表
                                                    let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                                    let user_asks_to_check_or_list_files = last_user_message
                                                        .map(|m| {
                                                            let content_lower = m.content.to_lowercase();
                                                            content_lower.contains("检查") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            content_lower.contains("列出") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            content_lower.contains("查看") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            content_lower.contains("有哪些") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                            (content_lower.contains("所有文件") || content_lower.contains("全部文件")) ||
                                                            (content_lower.contains("文件") && (content_lower.contains("包括") || content_lower.contains("子文件夹") || content_lower.contains("子目录"))) ||
                                                            content_lower.contains("每一个") && (content_lower.contains("文件夹") || content_lower.contains("文件")) ||
                                                            content_lower.contains("每个") && (content_lower.contains("文件夹") || content_lower.contains("文件"))
                                                        })
                                                        .unwrap_or(false);
                                                    
                                                    let has_list_files_tool = all_tool_results.iter().any(|(_, name, _)| name == "list_files");
                                                    
                                                    // 检查回复内容质量：是否只是说明状态而没有实际执行
                                                    let reply_is_just_status = new_accumulated_text_clone.contains("我理解") || 
                                                        new_accumulated_text_clone.contains("我需要完成") ||
                                                        new_accumulated_text_clone.contains("还需要检查") ||
                                                        new_accumulated_text_clone.contains("目前我只检查了") ||
                                                        (new_accumulated_text_clone.contains("还需要检查剩余的") && !new_accumulated_text_clone.contains("：") && !new_accumulated_text_clone.contains(":"));
                                                    
                                                    // 如果用户要求检查文件，且AI已调用list_files工具，但回复只是说明状态而没有实际执行，认为任务未完成
                                                    let reply_has_file_list = new_accumulated_text_clone.len() > 200 && (
                                                        new_accumulated_text_clone.contains("文件") && (
                                                            new_accumulated_text_clone.contains("：") || 
                                                            new_accumulated_text_clone.contains(":") ||
                                                            new_accumulated_text_clone.contains("列表") ||
                                                            new_accumulated_text_clone.contains("包括") ||
                                                            new_accumulated_text_clone.matches("文件").count() >= 3 // 至少提到3次"文件"
                                                        )
                                                    ) && !reply_is_just_status;
                                                    
                                                    // 检查任务完成度：如果用户要求检查每一个文件夹，检查是否真的检查了所有文件夹
                                                    let task_progress_check_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                                                    let check_folders_task_incomplete = task_progress_check_info.task_type == crate::services::task_progress_analyzer::TaskType::RecursiveCheck && 
                                                        task_progress_check_info.is_incomplete;
                                                    
                                                    if check_folders_task_incomplete || (user_asks_to_check_or_list_files && has_list_files_tool && !reply_has_file_list) {
                                                        eprintln!("⚠️ 用户要求检查文件，AI已调用工具但回复中没有完整列出文件（长度={}），要求AI给出完整的文件列表", new_accumulated_text_clone.len());
                                                        
                                                        // 将当前回复添加到消息历史
                                                        if !new_accumulated_text_clone.is_empty() {
                                                            current_messages.push(ChatMessage {
                                                                role: "assistant".to_string(),
                                                                content: new_accumulated_text_clone.clone(),
                                                            });
                                                        }
                                                        
                                                        // 明确要求AI给出完整的文件列表总结
                                                        current_messages.push(ChatMessage {
                                                            role: "user".to_string(),
                                                            content: format!(
                                                                "重要：你已经调用了 list_files 工具检查了所有文件夹，但你的回复中没有完整列出所有文件。现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件（包括文件名、路径等）\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                                                            ),
                                                        });
                                                        
                                                        // 清空文本，准备下一轮
                                                        new_streaming_handler.clear_accumulated(&tab_id);
                                                        
                                                        // 重新调用 chat_stream 继续完成
                                                        eprintln!("🔄 要求AI给出完整的文件列表总结");
                                                        let (_, mut file_list_cancel_rx) = tokio::sync::oneshot::channel();
                                                        match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut file_list_cancel_rx, tool_definitions_clone.as_deref()).await {
                                                            Ok(file_list_stream) => {
                                                                eprintln!("✅ 成功要求AI给出完整的文件列表总结");
                                                                new_stream = file_list_stream;
                                                                continue_loop = true;
                                                                // 继续循环处理新的流
                                                                continue;
                                                            }
                                                            Err(e) => {
                                                                eprintln!("❌ 要求AI给出完整的文件列表总结失败: {}", e);
                                                                // 如果继续失败，至少保存当前回复
                                                                eprintln!("📝 保存当前回复（长度={}）", new_accumulated_text_clone.len());
                                                            }
                                                        }
                                                    } else {
                                                        // 正常保存
                                                        eprintln!("📝 流正常结束，保存 assistant 回复到消息历史（长度={}，完整={}）", new_accumulated_text_clone.len(), reply_complete);
                                                        current_messages.push(ChatMessage {
                                                            role: "assistant".to_string(),
                                                            content: new_accumulated_text_clone.clone(),
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // 如果有新的工具调用，需要继续对话
                                if continue_loop && !new_tool_results.is_empty() {
                                    eprintln!("🔄 检测到继续对话中的工具调用，准备再次继续对话: 工具调用数量={}", new_tool_results.len());
                                    
                                    // 将 assistant 的回复添加到消息历史
                                    if !new_accumulated_text_clone.is_empty() {
                                        current_messages.push(ChatMessage {
                                            role: "assistant".to_string(),
                                            content: new_accumulated_text_clone.clone(),
                                        });
                                    }
                                    
                                    // 构建工具调用结果消息
                                    let mut tool_results_content = String::new();
                                    for (_tool_id, tool_name, tool_result) in &new_tool_results {
                                        if tool_result.success {
                                            if let Some(data) = &tool_result.data {
                                                tool_results_content.push_str(&format!(
                                                    "【{}】执行成功，结果数据：\n{}\n\n",
                                                    tool_name, serde_json::to_string_pretty(data).unwrap_or_default()
                                                ));
                                            } else if let Some(message) = &tool_result.message {
                                                tool_results_content.push_str(&format!(
                                                    "【{}】执行成功：{}\n\n",
                                                    tool_name, message
                                                ));
                                            } else {
                                                tool_results_content.push_str(&format!(
                                                    "【{}】执行成功\n\n",
                                                    tool_name
                                                ));
                                            }
                                            
                                            // 为 create_folder 添加明确的下一步操作指导
                                            if tool_name == "create_folder" {
                                                tool_results_content.push_str("下一步操作：文件夹已创建，现在必须立即调用 move_file 工具移动文件到这个文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。\n\n");
                                            }
                                        } else {
                                            if let Some(error) = &tool_result.error {
                                                tool_results_content.push_str(&format!(
                                                    "【{}】执行失败：{}\n\n",
                                                    tool_name, error
                                                ));
                                            } else {
                                                tool_results_content.push_str(&format!(
                                                    "【{}】执行失败\n\n",
                                                    tool_name
                                                ));
                                            }
                                        }
                                    }
                                    
                                    // 累积所有工具调用结果（注意：all_tool_results 已经在工具调用时更新，这里不需要再次 extend）
                                    // all_tool_results.extend(new_tool_results.clone()); // 已在上面的工具调用处理中更新
                                    
                                    // 分析任务完成度，生成任务进度提示（使用所有累积的工具调用结果）
                                    let task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                                    let task_progress = task_progress_info.progress_hint.clone();
                                    
                                    eprintln!("📊 任务进度分析结果：{}", if task_progress.is_empty() { "任务已完成或无需进度检查" } else { &task_progress });
                                    
                                    // 检查任务是否完成（使用结构化的字段）
                                    let task_incomplete = task_progress_info.is_incomplete;
                                    let task_completed = task_progress_info.is_completed;
                                    
                                    // 添加工具调用结果到消息历史
                                    let continue_instruction = if task_incomplete {
                                        // 任务未完成，强制要求继续
                                        format!("{}\n\n重要：任务尚未完成！请立即继续调用 move_file 工具处理剩余文件，不要停止或结束回复。必须处理完所有文件才能结束。", 
                                            // 优先检查 create_folder，明确要求调用 move_file
                                            if new_tool_results.iter().any(|(_, name, _)| name == "create_folder") {
                                                "重要：文件夹已创建完成，现在必须立即调用 move_file 工具移动文件到相应的文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。".to_string()
                                            } else if new_tool_results.iter().any(|(_, name, _)| name == "list_files" || name == "read_file") {
                                                // 检查用户是否要求检查/列出文件
                                                let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                                let user_asks_to_check_or_list_files = last_user_message
                                                    .map(|m| {
                                                        let content_lower = m.content.to_lowercase();
                                                        content_lower.contains("检查") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                        content_lower.contains("列出") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                        content_lower.contains("查看") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                        content_lower.contains("有哪些") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                        (content_lower.contains("所有文件") || content_lower.contains("全部文件")) ||
                                                        (content_lower.contains("文件") && (content_lower.contains("包括") || content_lower.contains("子文件夹") || content_lower.contains("子目录")))
                                                    })
                                                    .unwrap_or(false);
                                                
                                                if user_asks_to_check_or_list_files && new_tool_results.iter().any(|(_, name, _)| name == "list_files") {
                                                    // 用户要求检查/列出文件，必须要求AI给出完整的文件列表总结
                                                    format!(
                                                        "重要：你已经调用了 list_files 工具检查了文件，现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件（包括文件名、路径等）\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                                                    )
                                                } else {
                                                    // 用户没有明确要求检查文件，可能是其他任务
                                                    "请基于以上结果继续执行用户的任务。如果用户明确要求移动文件、创建文件夹等操作，请立即调用相应的工具完成，不要停止或等待。".to_string()
                                                }
                                            } else {
                                                "请基于以上结果继续执行用户的任务。如果任务还未完成，请继续调用相应的工具完成剩余步骤。".to_string()
                                            }
                                        )
                                    } else if task_completed {
                                        // 任务已完成，要求AI做总结
                                        "任务已完成，请进行工作总结：\n\n请检查你的工作，然后提供一份简洁的总结，包括：\n1. 完成的工作：简要说明你完成了哪些操作（如移动了多少文件、创建了哪些文件夹等）\n2. 执行逻辑：简要说明你是如何组织和执行这些操作的\n3. 执行效果：说明任务完成后的结果和状态\n4. 下一步建议：如果有需要用户注意的事项或后续建议，请说明\n\n请用自然语言回复，不要调用工具。".to_string()
                                    } else if new_tool_results.iter().any(|(_, name, _)| name == "create_folder") {
                                        // 即使任务完成，如果刚创建了文件夹，也要提示移动文件
                                        "重要：文件夹已创建完成，现在必须立即调用 move_file 工具移动文件到相应的文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。".to_string()
                                    } else if new_tool_results.iter().any(|(_, name, _)| name == "list_files" || name == "read_file") {
                                        // 检查用户是否要求检查/列出文件
                                        let last_user_message = current_messages.iter().rev().find(|m| m.role == "user");
                                        let user_asks_to_check_or_list_files = last_user_message
                                            .map(|m| {
                                                let content_lower = m.content.to_lowercase();
                                                content_lower.contains("检查") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                content_lower.contains("列出") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                content_lower.contains("查看") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                content_lower.contains("有哪些") && (content_lower.contains("文件") || content_lower.contains("文件夹")) ||
                                                (content_lower.contains("所有文件") || content_lower.contains("全部文件")) ||
                                                (content_lower.contains("文件") && (content_lower.contains("包括") || content_lower.contains("子文件夹") || content_lower.contains("子目录")))
                                            })
                                            .unwrap_or(false);
                                        
                                        if user_asks_to_check_or_list_files && new_tool_results.iter().any(|(_, name, _)| name == "list_files") {
                                            // 用户要求检查/列出文件，必须要求AI给出完整的文件列表总结
                                            format!(
                                                "重要：你已经调用了 list_files 工具检查了文件，现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件（包括文件名、路径等）\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                                            )
                                        } else {
                                            // 用户没有明确要求检查文件，可能是其他任务
                                            "请基于以上结果继续执行用户的任务。如果任务需要移动文件、创建文件夹等操作，请立即调用相应的工具完成，不要停止或等待。".to_string()
                                        }
                                    } else {
                                        "请基于以上结果继续执行用户的任务。如果任务还未完成，请继续调用相应的工具完成剩余步骤。".to_string()
                                    };
                                    
                                    // 如果有任务进度提示，添加到消息中
                                    let final_content = if !task_progress.is_empty() {
                                        format!("工具调用执行完成，结果如下：\n\n{}{}\n\n{}", tool_results_content, task_progress, continue_instruction)
                                    } else {
                                        format!("工具调用执行完成，结果如下：\n\n{}{}", tool_results_content, continue_instruction)
                                    };
                                    
                                    current_messages.push(ChatMessage {
                                        role: "user".to_string(),
                                        content: final_content,
                                    });
                                    
                                    // 清空新的工具结果和文本，准备下一轮（但保留累积结果用于任务分析）
                                    let previous_tool_results = new_tool_results.clone();
                                    new_tool_results.clear();
                                    new_streaming_handler.clear_accumulated(&tab_id);
                                    
                                    // 注意：all_tool_results 已经在上面的 extend 中更新，不需要清空
                                    
                                    // 重新调用 chat_stream 继续对话（带Token超限重试机制）
                                    // ⚠️ 关键修复：为下一轮对话创建新的取消通道并注册
                                    let (next_cancel_tx, mut next_cancel_rx) = tokio::sync::oneshot::channel();
                                    {
                                        let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                        channels.insert(tab_id.clone(), next_cancel_tx);
                                        eprintln!("✅ 下一轮对话时注册新的取消通道: tab_id={}", tab_id);
                                    }
                                    // ⚠️ 关键修复：为下一轮对话创建新的取消标志并注册
                                    let next_cancel_flag = Arc::new(Mutex::new(false));
                                    {
                                        let mut flags = CANCEL_FLAGS.lock().unwrap();
                                        flags.insert(tab_id.clone(), next_cancel_flag.clone());
                                        eprintln!("✅ 下一轮对话时注册新的取消标志: tab_id={}", tab_id);
                                    }
                                    // 更新 continue_cancel_flag_for_stream 为新的标志
                                    let continue_cancel_flag_for_stream = next_cancel_flag.clone();
                                    let mut retry_count_inner = 0;
                                    let max_retries_inner = 2;
                                    let mut next_stream_result = loop {
                                        match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut next_cancel_rx, tool_definitions_clone.as_deref()).await {
                                            Ok(next_stream) => {
                                                break Ok(next_stream);
                                            }
                                            Err(e) => {
                                                let error_str = e.to_string();
                                                // 检测Token超限错误
                                                if error_str.contains("Token超限") || error_str.contains("token") || 
                                                   error_str.contains("length") || error_str.contains("context") ||
                                                   error_str.contains("maximum") || error_str.contains("exceeded") {
                                                    if retry_count_inner < max_retries_inner {
                                                        retry_count_inner += 1;
                                                        eprintln!("⚠️ Token超限，尝试截断消息历史（第 {} 次重试）", retry_count_inner);
                                                        // 更激进的截断：只保留系统消息和最后5条消息
                                                        if current_messages.len() > 6 {
                                                            let system_msg = current_messages.remove(0);
                                                            let recent_count = 5.min(current_messages.len());
                                                            let recent_msgs: Vec<ChatMessage> = current_messages.drain(current_messages.len().saturating_sub(recent_count)..).collect();
                                                            current_messages.clear();
                                                            current_messages.push(system_msg);
                                                            current_messages.extend(recent_msgs);
                                                            eprintln!("📝 截断后消息数量: {}", current_messages.len());
                                                        }
                                                        // 重新创建cancel channel
                                                        // ⚠️ 关键修复：重新创建cancel channel并注册
                                                        let (next_cancel_tx2, mut next_cancel_rx2) = tokio::sync::oneshot::channel();
                                                        {
                                                            let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                            channels.insert(tab_id.clone(), next_cancel_tx2);
                                                            eprintln!("✅ Token超限重试时注册新的取消通道（下一轮）: tab_id={}", tab_id);
                                                        }
                                                        next_cancel_rx = next_cancel_rx2;
                                                        continue;
                                                    } else {
                                                        eprintln!("❌ Token超限，已重试 {} 次仍失败", max_retries_inner);
                                                        break Err(e);
                                                    }
                                                } else {
                                                    // 其他错误，直接返回
                                                    break Err(e);
                                                }
                                            }
                                        }
                                    };
                                    
                                    match next_stream_result {
                                        Ok(next_stream) => {
                                            eprintln!("✅ 再次调用 chat_stream 成功，继续处理流式响应");
                                            new_stream = next_stream;
                                            // continue_loop 已经是 true，会继续循环
                                        }
                                        Err(e) => {
                                            eprintln!("❌ 再次调用 chat_stream 失败: {}", e);
                                            continue_loop = false;
                                        }
                                    }
                                }
                                
                                // ⚠️ 关键修复：在继续对话循环结束前检查取消标志
                                {
                                    let flag = continue_cancel_flag_for_stream.lock().unwrap();
                                    if *flag {
                                        eprintln!("🛑 继续对话循环结束前检测到取消标志，停止处理: tab_id={}", tab_id);
                                        // 发送取消事件
                                        let payload = serde_json::json!({
                                            "tab_id": tab_id,
                                            "chunk": "",
                                            "done": true,
                                            "error": "用户取消了请求",
                                        });
                                        if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                            eprintln!("发送取消事件失败: {}", e);
                                        }
                                        // ⚠️ 关键修复：清理取消通道和标志
                                        {
                                            let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                            channels.remove(&tab_id);
                                        }
                                        {
                                            let mut flags = CANCEL_FLAGS.lock().unwrap();
                                            flags.remove(&tab_id);
                                        }
                                        return;
                                    }
                                }
                                
                                // 检查循环结束后的状态：如果任务完成但没有总结，要求总结
                                if !continue_loop {
                                    let final_task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                                    let final_task_completed = final_task_progress_info.is_completed;
                                    
                                    // 检查最后一条assistant消息是否包含总结
                                    let final_has_summary = current_messages.iter()
                                        .rev()
                                        .find(|m| m.role == "assistant")
                                        .map(|m| {
                                            m.content.len() > 50 && (
                                                m.content.contains("总结") || 
                                                m.content.contains("完成") ||
                                                m.content.contains("已处理") ||
                                                m.content.contains("下一步") ||
                                                m.content.contains("执行逻辑") ||
                                                m.content.contains("执行效果")
                                            )
                                        })
                                        .unwrap_or(false);
                                    
                                    // 也检查当前累积的文本
                                    let current_text_has_summary = reply_checker.has_summary(&new_accumulated_text_clone);
                                    
                                    if final_task_completed && !final_has_summary && !current_text_has_summary {
                                        // 任务完成但没有总结，要求总结
                                        eprintln!("📋 循环结束，任务已完成但无总结，要求AI做工作总结");
                                        
                                        // 如果当前有文本，先保存
                                        if !new_accumulated_text_clone.is_empty() {
                                            current_messages.push(ChatMessage {
                                                role: "assistant".to_string(),
                                                content: new_accumulated_text_clone.clone(),
                                            });
                                        }
                                        
                                        // 添加总结要求
                                        let summary_request = format!(
                                            "{}\n\n任务已完成，请进行工作总结：\n\n请检查你的工作，然后提供一份简洁的总结，包括：\n1. 完成的工作：简要说明你完成了哪些操作（如移动了多少文件、创建了哪些文件夹等）\n2. 执行逻辑：简要说明你是如何组织和执行这些操作的\n3. 执行效果：说明任务完成后的结果和状态\n4. 下一步建议：如果有需要用户注意的事项或后续建议，请说明\n\n请用自然语言回复，不要调用工具。",
                                            final_task_progress_info.progress_hint
                                        );
                                        
                                        current_messages.push(ChatMessage {
                                            role: "user".to_string(),
                                            content: summary_request,
                                        });
                                        
                                        // 重新调用 chat_stream 获取总结
                                        eprintln!("🔄 要求AI做工作总结，重新调用 chat_stream");
                                        // ⚠️ 关键修复：为最终总结创建新的取消通道并注册
                                        let (final_summary_cancel_tx, mut final_summary_cancel_rx) = tokio::sync::oneshot::channel();
                                        {
                                            let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                            channels.insert(tab_id.clone(), final_summary_cancel_tx);
                                            eprintln!("✅ 最终总结时注册新的取消通道: tab_id={}", tab_id);
                                        }
                                        let mut final_summary_retry_count = 0;
                                        let max_final_summary_retries = 2;
                                        let mut final_summary_stream_result = loop {
                                            match provider_clone.chat_stream(&current_messages, &model_config_clone, &mut final_summary_cancel_rx, tool_definitions_clone.as_deref()).await {
                                                Ok(final_summary_stream) => {
                                                    break Ok(final_summary_stream);
                                                }
                                                Err(e) => {
                                                    let error_str = e.to_string();
                                                    // 检测Token超限错误
                                                    if error_str.contains("Token超限") || error_str.contains("token") || 
                                                       error_str.contains("length") || error_str.contains("context") ||
                                                       error_str.contains("maximum") || error_str.contains("exceeded") {
                                                        if final_summary_retry_count < max_final_summary_retries {
                                                            final_summary_retry_count += 1;
                                                            eprintln!("⚠️ Token超限，尝试截断消息历史（第 {} 次重试）", final_summary_retry_count);
                                                            // 更激进的截断：只保留系统消息和最后5条消息
                                                            if current_messages.len() > 6 {
                                                                let system_msg = current_messages.remove(0);
                                                                let recent_count = 5.min(current_messages.len());
                                                                let recent_msgs: Vec<ChatMessage> = current_messages.drain(current_messages.len().saturating_sub(recent_count)..).collect();
                                                                current_messages.clear();
                                                                current_messages.push(system_msg);
                                                                current_messages.extend(recent_msgs);
                                                                eprintln!("📝 截断后消息数量: {}", current_messages.len());
                                                            }
                                                            // 重新创建cancel channel
                                                            // ⚠️ 关键修复：重新创建cancel channel并注册
                                                            let (final_summary_cancel_tx2, mut final_summary_cancel_rx2) = tokio::sync::oneshot::channel();
                                                            {
                                                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                                                channels.insert(tab_id.clone(), final_summary_cancel_tx2);
                                                                eprintln!("✅ Token超限重试时注册新的取消通道（最终总结）: tab_id={}", tab_id);
                                                            }
                                                            final_summary_cancel_rx = final_summary_cancel_rx2;
                                                            continue;
                                                        } else {
                                                            eprintln!("❌ Token超限，已重试 {} 次仍失败", max_final_summary_retries);
                                                            break Err(e);
                                                        }
                                                    } else {
                                                        // 其他错误，直接返回
                                                        break Err(e);
                                                    }
                                                }
                                            }
                                        };
                                        
                                        match final_summary_stream_result {
                                            Ok(mut final_summary_stream) => {
                                                eprintln!("✅ 获取工作总结，重新调用 chat_stream 成功");
                                                // 处理总结流
                                                let mut summary_text = String::new();
                                                while let Some(result) = final_summary_stream.next().await {
                                                    match result {
                                                        Ok(chunk) => {
                                                            match chunk {
                                                                ChatChunk::Text(text) => {
                                                                    if !text.is_empty() {
                                                                        summary_text.push_str(&text);
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
                                                                }
                                                                ChatChunk::ToolCall { .. } => {
                                                                    // 总结阶段不应该有工具调用，忽略
                                                                }
                                                            }
                                                        }
                                                        Err(e) => {
                                                            eprintln!("❌ 获取总结时发生错误: {}", e);
                                                            break;
                                                        }
                                                    }
                                                }
                                                
                                                // 总结完成
                                                eprintln!("✅ 工作总结完成，文本长度: {}", summary_text.len());
                                            }
                                            Err(e) => {
                                                eprintln!("❌ 获取工作总结失败: {}", e);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("❌ 重新调用 chat_stream 失败: {}", e);
                        }
                    }
                }
                
                // ⚠️ 关键修复：检查是否已取消
                let was_cancelled = {
                    let flag = cancel_flag.lock().unwrap();
                    *flag
                };
                
                // 清理取消通道
                {
                    let mut channels = CANCEL_CHANNELS.lock().unwrap();
                    channels.remove(&tab_id_clone);
                    eprintln!("🧹 清理取消通道: tab_id={}", tab_id_clone);
                }
                
                // 只有在未取消时才发送完成信号
                if !was_cancelled {
                    // 发送完成信号
                    let payload = serde_json::json!({
                        "tab_id": tab_id,
                        "chunk": "",
                        "done": true,
                    });
                    if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                        eprintln!("发送事件失败: {}", e);
                    }
                } else {
                    eprintln!("🛑 流已取消，不发送完成信号: tab_id={}", tab_id);
                }
            });
            
            Ok(())
        }
        Err(e) => {
            // ⚠️ 关键修复：当 chat_stream 失败时，清理取消通道和标志，并发送错误事件
            eprintln!("❌ chat_stream 调用失败: {}", e);
            
            // 清理取消通道和标志
            {
                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                channels.remove(&tab_id);
            }
            {
                let mut flags = CANCEL_FLAGS.lock().unwrap();
                flags.remove(&tab_id);
            }
            eprintln!("🧹 清理取消通道和标志（chat_stream 失败）: tab_id={}", tab_id);
            
            // 发送错误事件给前端
            let error_message = format!("AI 请求失败: {}", e);
            let payload = serde_json::json!({
                "tab_id": tab_id,
                "chunk": "",
                "done": true,
                "error": error_message,
            });
            if let Err(emit_err) = app.emit("ai-chat-stream", payload) {
                eprintln!("发送错误事件失败: {}", emit_err);
            }
            
            Err(error_message)
        }
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
    
    // 创建取消令牌（文档分析不需要存储到全局映射，因为它是同步调用）
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

/// 取消正在进行的 AI 聊天流
#[tauri::command]
pub async fn ai_cancel_chat_stream(tab_id: String) -> Result<(), String> {
    eprintln!("🛑 收到取消请求: tab_id={}", tab_id);
    
    // ⚠️ 关键修复：同时设置取消标志和发送取消信号
    // 1. 设置取消标志（用于继续对话的流处理循环）
    {
        let flags = CANCEL_FLAGS.lock().unwrap();
        if let Some(flag) = flags.get(&tab_id) {
            let mut flag_guard = flag.lock().unwrap();
            *flag_guard = true;
            eprintln!("✅ 设置取消标志: tab_id={}", tab_id);
        }
    }
    
    // 2. 发送取消信号（用于初始流的取消）
    let mut channels = CANCEL_CHANNELS.lock().unwrap();
    if let Some(cancel_tx) = channels.remove(&tab_id) {
        // 发送取消信号
        if let Err(_) = cancel_tx.send(()) {
            eprintln!("⚠️ 取消通道已关闭，可能任务已完成");
        } else {
            eprintln!("✅ 成功发送取消信号: tab_id={}", tab_id);
        }
        Ok(())
    } else {
        // 即使没有找到通道，如果找到了标志，也算成功
        let flags = CANCEL_FLAGS.lock().unwrap();
        if flags.contains_key(&tab_id) {
            eprintln!("⚠️ 未找到取消通道，但已设置取消标志: tab_id={}", tab_id);
            Ok(())
        } else {
            eprintln!("⚠️ 未找到对应的取消通道或标志: tab_id={}", tab_id);
            Err(format!("未找到对应的任务: {}", tab_id))
        }
    }
}

