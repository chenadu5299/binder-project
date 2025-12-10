use async_trait::async_trait;
use crate::services::ai_error::AIError;
use crate::services::ai_providers::{AIProvider, ChatMessage, ModelConfig, ChatChunk, ToolDefinition};
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;
use std::sync::{Arc, Mutex};

pub struct DeepSeekProvider {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl DeepSeekProvider {
    pub fn new(api_key: String) -> Self {
        // 创建带超时配置的 HTTP 客户端
        // ⚠️ 关键修复：优化网络连接配置，提高稳定性
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120)) // 增加请求超时到 120 秒
            .connect_timeout(std::time::Duration::from_secs(30)) // 增加连接超时到 30 秒
            .tcp_keepalive(std::time::Duration::from_secs(30)) // 保持 TCP 连接
            .pool_idle_timeout(std::time::Duration::from_secs(60)) // 连接池空闲超时
            .pool_max_idle_per_host(6) // 每个主机的最大空闲连接数
            .http1_only() // 强制使用 HTTP/1.1，避免 HTTP/2 连接错误
            .user_agent("Binder/1.0") // 添加 User-Agent
            .danger_accept_invalid_certs(false) // 确保 SSL 证书验证
            .build()
            .expect("Failed to create HTTP client");
        
        Self {
            api_key,
            base_url: "https://api.deepseek.com/v1".to_string(),
            client,
        }
    }

    fn build_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", self.api_key).parse().unwrap(),
        );
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
        headers
    }
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessageRequest>,
    temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    frequency_penalty: Option<f64>, // 频率惩罚，防止重复。0 = 不惩罚，正数 = 抑制重复
    #[serde(skip_serializing_if = "Option::is_none")]
    presence_penalty: Option<f64>, // 存在惩罚，鼓励新话题。0 = 不惩罚，正数 = 鼓励新话题
    max_tokens: Option<u32>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ToolDefinitionRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<String>,
}

#[derive(Debug, Serialize)]
struct ToolDefinitionRequest {
    #[serde(rename = "type")]
    tool_type: String,
    function: FunctionDefinition,
}

#[derive(Debug, Serialize)]
struct FunctionDefinition {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct ChatMessageRequest {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Option<Delta>,
    delta: Option<Delta>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
    index: Option<u32>,
    id: Option<String>,
    #[serde(rename = "type")]
    tool_type: Option<String>,
    function: Option<FunctionCallDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionCallDelta {
    name: Option<String>,
    arguments: Option<String>,
}

#[async_trait]
impl AIProvider for DeepSeekProvider {
    async fn autocomplete(&self, context: &str, max_length: usize) -> Result<String, AIError> {
        let prompt = format!("请继续完成以下文本（只输出续写内容，不要重复原文）：\n{}", context);
        
            let request = ChatRequest {
                model: "deepseek-chat".to_string(),
                messages: vec![
                    ChatMessageRequest {
                        role: "system".to_string(),
                        content: "你是一个文本自动补全助手。".to_string(),
                    },
                    ChatMessageRequest {
                        role: "user".to_string(),
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                top_p: Some(1.0),
                frequency_penalty: Some(0.0), // 默认不惩罚，防止设置为负数导致重复
                presence_penalty: Some(0.0),
                max_tokens: Some(max_length as u32),
                stream: false,
                tools: None,
                tool_choice: None,
            };
        
        // ⚠️ 关键修复：添加重试机制（最多 3 次）
        let mut last_error = None;
        for attempt in 0..3 {
            match self.client
                .post(&format!("{}/chat/completions", self.base_url))
                .headers(self.build_headers())
                .json(&request)
                .send()
                .await
            {
                Ok(response) => {
                    if !response.status().is_success() {
                        let status = response.status();
                        let error_text = response.text().await.unwrap_or_default();
                        // 如果是 4xx 错误（客户端错误），不重试
                        if status.as_u16() >= 400 && status.as_u16() < 500 {
                            return Err(AIError::Unknown(format!("API 错误 ({}): {}", status, error_text)));
                        }
                        // 5xx 错误（服务器错误），继续重试
                        last_error = Some(format!("API 错误 ({}): {}", status, error_text));
                    } else {
                        // 请求成功，解析响应
                        match response.json::<ChatCompletionResponse>().await {
                            Ok(result) => {
                                let content = result.choices
                                    .first()
                                    .and_then(|c| c.message.as_ref().or(c.delta.as_ref()))
                                    .and_then(|d| d.content.as_ref())
                                    .cloned()
                                    .unwrap_or_default();
                                return Ok(content);
                            }
                            Err(e) => {
                                last_error = Some(format!("解析响应失败: {}", e));
                            }
                        }
                    }
                }
                Err(e) => {
                    last_error = Some(format!("请求失败: {}", e));
                }
            }
            
            // 如果不是最后一次尝试，等待后重试（指数退避）
            if attempt < 2 {
                let delay = std::time::Duration::from_millis(500 * (attempt + 1) as u64);
                tokio::time::sleep(delay).await;
            }
        }
        
        // 所有重试都失败，返回错误
        Err(AIError::NetworkError(format!("请求失败（已重试 3 次）: {}", 
            last_error.unwrap_or_else(|| "未知错误".to_string()))))
    }

    async fn inline_assist(&self, instruction: &str, text: &str, context: &str) -> Result<String, AIError> {
        let prompt = format!("请根据以下指令修改文本：\n\n指令：{}\n\n原文：{}\n\n上下文：{}", instruction, text, context);
        
            let request = ChatRequest {
                model: "deepseek-chat".to_string(),
                messages: vec![
                    ChatMessageRequest {
                        role: "system".to_string(),
                        content: "你是一个文本编辑助手，根据用户指令修改文本。".to_string(),
                    },
                    ChatMessageRequest {
                        role: "user".to_string(),
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                top_p: Some(1.0),
                frequency_penalty: Some(0.0), // 默认不惩罚，防止设置为负数导致重复
                presence_penalty: Some(0.0),
                max_tokens: Some(2000),
                stream: false,
                tools: None,
                tool_choice: None,
            };
        
        // ⚠️ 关键修复：添加重试机制（最多 3 次），和 autocomplete 保持一致
        let mut last_error = None;
        for attempt in 0..3 {
            match self.client
                .post(&format!("{}/chat/completions", self.base_url))
                .headers(self.build_headers())
                .json(&request)
                .send()
                .await
            {
                Ok(response) => {
                    if !response.status().is_success() {
                        let status = response.status();
                        let error_text = response.text().await.unwrap_or_default();
                        // 如果是 4xx 错误（客户端错误），不重试
                        if status.as_u16() >= 400 && status.as_u16() < 500 {
                            return Err(AIError::Unknown(format!("API 错误 ({}): {}", status, error_text)));
                        }
                        // 5xx 错误（服务器错误），继续重试
                        last_error = Some(format!("API 错误 ({}): {}", status, error_text));
                    } else {
                        // 请求成功，解析响应
                        match response.json::<ChatCompletionResponse>().await {
                            Ok(result) => {
                                let content = result.choices
                                    .first()
                                    .and_then(|c| c.message.as_ref().or(c.delta.as_ref()))
                                    .and_then(|d| d.content.as_ref())
                                    .cloned()
                                    .unwrap_or_default();
                                return Ok(content);
                            }
                            Err(e) => {
                                last_error = Some(format!("解析响应失败: {}", e));
                            }
                        }
                    }
                }
                Err(e) => {
                    last_error = Some(format!("请求失败: {}", e));
                }
            }
            
            // 如果不是最后一次尝试，等待后重试（指数退避）
            if attempt < 2 {
                let delay = std::time::Duration::from_millis(500 * (attempt + 1) as u64);
                tokio::time::sleep(delay).await;
            }
        }
        
        // 所有重试都失败，返回错误
        Err(AIError::NetworkError(format!("请求失败（已重试 3 次）: {}", 
            last_error.unwrap_or_else(|| "未知错误".to_string()))))
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model_config: &ModelConfig,
        _cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
        tools: Option<&[ToolDefinition]>,
    ) -> Result<Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin>, AIError> {
        // 构建工具定义（OpenAI 格式）
        let tools_json = tools.map(|tools| {
            tools.iter().map(|tool| ToolDefinitionRequest {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            }).collect::<Vec<_>>()
        });

        let request = ChatRequest {
            model: model_config.model.clone(),
            messages: messages.iter().map(|m| ChatMessageRequest {
                role: m.role.clone(),
                content: m.content.clone(),
            }).collect(),
            temperature: model_config.temperature,
            top_p: Some(model_config.top_p),
            frequency_penalty: Some(0.0), // 设置为 0，不惩罚重复（但也不鼓励）。如果需要抑制重复，可以设置为 0.1-0.5
            presence_penalty: Some(0.0), // 设置为 0，不鼓励新话题
            max_tokens: Some(model_config.max_tokens as u32),
            stream: true,
            tools: tools_json,
            tool_choice: if tools.is_some() { Some("auto".to_string()) } else { None },
        };
        
            // 添加重试机制处理网络连接错误
            let mut last_error = None;
            let mut response = None;
            
            for attempt in 0..3 {
                match self.client
                    .post(&format!("{}/chat/completions", self.base_url))
                    .headers(self.build_headers())
                    .json(&request)
                    .send()
                    .await
                {
                    Ok(resp) => {
                        response = Some(resp);
                        break;
                    }
                    Err(e) => {
                        last_error = Some(e);
                        // 如果是连接错误，等待后重试
                        if attempt < 2 {
                            let delay = std::time::Duration::from_millis(500 * (attempt + 1) as u64);
                            tokio::time::sleep(delay).await;
                            eprintln!("⚠️ 网络连接失败，{}ms 后重试 (尝试 {}/3)...", delay.as_millis(), attempt + 2);
                        }
                    }
                }
            }
            
            let response = response.ok_or_else(|| {
                AIError::NetworkError(format!("请求失败（已重试 3 次）: {}", 
                    last_error.map(|e| e.to_string()).unwrap_or_else(|| "未知错误".to_string())))
            })?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Unknown(format!("API 错误 ({}): {}", status, error_text)));
        }
        
            // 创建流式响应处理（参考 OpenAI 提供商）
            // 使用 Arc<Mutex<>> 来在流式处理中保持状态
            let tool_call_state = Arc::new(Mutex::new((
                Option::<String>::None,  // tool_call_id
                Option::<String>::None,  // tool_call_name
                String::new(),            // tool_call_arguments
            )));
            
            // 使用缓冲来处理可能跨 chunk 的 SSE 行
            let buffer = Arc::new(Mutex::new(String::new()));
            
            // 按照文档：使用 Arc<Mutex<>> 在流中保持累积文本状态（用于检测重复）
            let accumulated_text_state = Arc::new(Mutex::new(String::new()));
            
            let stream = response.bytes_stream();
            let stream = stream.map(move |result| {
                let state = tool_call_state.clone();
                let buf = buffer.clone();
                let acc_text = accumulated_text_state.clone();
                
                match result {
                    Ok(bytes) => {
                        // 将 bytes 追加到缓冲区
                        let mut buf_guard = buf.lock().unwrap();
                        match String::from_utf8(bytes.to_vec()) {
                            Ok(text) => {
                                buf_guard.push_str(&text);
                            }
                            Err(e) => {
                                // UTF-8 解码失败，使用 lossy 转换并记录警告
                                eprintln!("⚠️ UTF-8 解码失败，使用 lossy 转换: {}", e);
                                let lossy = String::from_utf8_lossy(&bytes);
                                buf_guard.push_str(&lossy);
                            }
                        }
                        
                        // 处理完整的行（以 \n 结尾的行）
                        let mut processed_any = false;
                        let mut new_buffer = String::new();
                        let lines: Vec<&str> = buf_guard.lines().collect();
                        
                        // 如果最后一行不以换行符结尾，保留在缓冲区中
                        if !buf_guard.ends_with('\n') && !buf_guard.ends_with('\r') {
                            if let Some(last_line) = lines.last() {
                                new_buffer = last_line.to_string();
                            }
                        }
                        
                        let mut finish_reason: Option<String> = None;
                        let mut result_chunks: Vec<ChatChunk> = Vec::new();

                        for line in lines.iter() {
                            let line = line.trim();
                            if line.is_empty() {
                                continue;
                            }
                            
                            if line.starts_with("data: ") {
                                let json_str = &line[6..];
                                if json_str == "[DONE]" {
                                    // 流结束时，如果有累积的工具调用，标记为完成
                                    let mut state_guard = state.lock().unwrap();
                                    if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                                        if !state_guard.2.is_empty() {
                                            let id_clone = id.clone();
                                            let name_clone = name.clone();
                                            let args_clone = state_guard.2.clone();
                                            // 清空状态
                                            *state_guard = (None, None, String::new());
                                            result_chunks.push(ChatChunk::ToolCall {
                                                id: id_clone,
                                                name: name_clone,
                                                arguments: args_clone,
                                                is_complete: true,
                                            });
                                            processed_any = true;
                                            break; // [DONE] 后不再处理其他行
                                        }
                                    }
                                    result_chunks.push(ChatChunk::Text(String::new()));
                                    processed_any = true;
                                    break; // [DONE] 后不再处理其他行
                                }
                                
                                match serde_json::from_str::<ChatCompletionResponse>(json_str) {
                                    Ok(chat_response) => {
                                        if let Some(choice) = chat_response.choices.first() {
                                            // 检查 finish_reason
                                            if let Some(fr) = &choice.finish_reason {
                                                finish_reason = Some(fr.clone());
                                                if fr == "tool_calls" {
                                                    // 工具调用完成，发送累积的工具调用
                                                    let mut state_guard = state.lock().unwrap();
                                                    if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                                                        if !state_guard.2.is_empty() {
                                                            let id_clone = id.clone();
                                                            let name_clone = name.clone();
                                                            let args_clone = state_guard.2.clone();
                                                            // 清空状态
                                                            *state_guard = (None, None, String::new());
                                                            result_chunks.push(ChatChunk::ToolCall {
                                                                id: id_clone,
                                                                name: name_clone,
                                                                arguments: args_clone,
                                                                is_complete: true,
                                                            });
                                                            processed_any = true;
                                                            break; // 工具调用完成后不再处理其他行
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            if let Some(delta) = &choice.delta {
                                                // Handle tool calls
                                                if let Some(tool_calls) = &delta.tool_calls {
                                                    let mut state_guard = state.lock().unwrap();
                                                    for tool_call_delta in tool_calls {
                                                        if let Some(id) = &tool_call_delta.id {
                                                            state_guard.0 = Some(id.clone());
                                                        }
                                                        if let Some(function) = &tool_call_delta.function {
                                                            if let Some(name) = &function.name {
                                                                state_guard.1 = Some(name.clone());
                                                            }
                                                            if let Some(arguments) = &function.arguments {
                                                                eprintln!("📝 累积工具调用 arguments: 当前长度={}, 新增长度={}, 新增内容={}", 
                                                                    state_guard.2.len(), arguments.len(),
                                                                    if arguments.len() > 50 { &arguments[..50] } else { arguments });
                                                                state_guard.2.push_str(arguments);
                                                                eprintln!("📝 累积后总长度={}, 内容预览={}", 
                                                                    state_guard.2.len(),
                                                                    if state_guard.2.len() > 100 { &state_guard.2[..100] } else { &state_guard.2 });
                                                            }
                                                        }
                                                    }
                                                    // 只有在有参数时才返回（避免返回空的工具调用）
                                                    if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                                                        if !state_guard.2.is_empty() {
                                                            // 检查 arguments 是否是完整的 JSON
                                                            let args_str = state_guard.2.clone();
                                                            eprintln!("🔍 检查 JSON 完整性: 长度={}, 内容={}", args_str.len(), 
                                                                if args_str.len() > 200 { format!("{}...", &args_str[..200]) } else { args_str.clone() });
                                                            
                                                            // 如果 arguments 看起来是完整的 JSON（以 } 结尾），标记为完成
                                                            let is_complete = args_str.trim().ends_with('}') && 
                                                                              serde_json::from_str::<serde_json::Value>(&args_str).is_ok();
                                                            
                                                            if is_complete {
                                                                eprintln!("✅ JSON 完整，标记为完成");
                                                            } else {
                                                                eprintln!("⏳ JSON 不完整，继续累积");
                                                            }
                                                            
                                                            if is_complete {
                                                                let id_clone = id.clone();
                                                                let name_clone = name.clone();
                                                                let args_clone = state_guard.2.clone();
                                                                // 清空状态
                                                                *state_guard = (None, None, String::new());
                                                                result_chunks.push(ChatChunk::ToolCall {
                                                                    id: id_clone,
                                                                    name: name_clone,
                                                                    arguments: args_clone,
                                                                    is_complete: true,
                                                                });
                                                                processed_any = true;
                                                                break; // 工具调用完成后不再处理其他行
                                                            } else {
                                                                // 未完成，不返回 chunk，继续累积
                                                                // 参考 void 的实现：只有完整的工具调用才返回
                                                                // 这样可以避免前端收到不完整的 JSON 导致解析失败
                                                            }
                                                        }
                                                    }
                                                }

                                                // Handle content - 按照文档实现：累积文本去重
                                                if let Some(content) = &delta.content {
                                                    if !content.is_empty() {
                                                        let mut acc_guard = acc_text.lock().unwrap();
                                                        
                                                        // 检查是否与累积文本重复
                                                        if acc_guard.ends_with(content) {
                                                            eprintln!("⚠️ [deepseek] 检测到重复 content，跳过: '{}'", 
                                                                if content.len() > 50 { &content[..50] } else { content });
                                                            continue;
                                                        }
                                                        
                                                        // 更新累积文本
                                                        acc_guard.push_str(content);
                                                        drop(acc_guard);
                                                        
                                                        result_chunks.push(ChatChunk::Text(content.clone()));
                                                        processed_any = true;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("⚠️ JSON 解析失败，跳过该行: {}, 内容: {}", e, json_str);
                                        continue; // Ignore malformed JSON lines
                                    }
                                }
                            }
                        }
                        
                        // 更新缓冲区（保留未完成的行）
                        *buf_guard = new_buffer;
                        
                        // 按照文档：合并同一 bytes chunk 中的多个文本 content 为一个，避免丢失
                        // 工具调用单独返回
                        if !result_chunks.is_empty() {
                            // 优先返回工具调用
                            if let Some(tool_call) = result_chunks.iter().find(|c| matches!(c, ChatChunk::ToolCall { .. })) {
                                Ok(tool_call.clone())
                            } else {
                                // 合并所有文本 chunks
                                let merged_text: String = result_chunks.iter()
                                    .filter_map(|c| {
                                        if let ChatChunk::Text(text) = c {
                                            if !text.is_empty() {
                                                Some(text.as_str())
                                            } else {
                                                None
                                            }
                                        } else {
                                            None
                                        }
                                    })
                                    .collect();
                                
                                if !merged_text.is_empty() {
                                    Ok(ChatChunk::Text(merged_text))
                                } else {
                                    Ok(ChatChunk::Text(String::new()))
                                }
                            }
                        } else {
                            Ok(ChatChunk::Text(String::new()))
                        }
                    }
                    Err(e) => Err(AIError::NetworkError(e.to_string())),
                }
            });
        
        // 包装为 Box<dyn Stream>
        let boxed_stream: Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin> =
            Box::new(stream);
        
        Ok(boxed_stream)
    }
}
