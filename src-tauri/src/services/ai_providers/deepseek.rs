use async_trait::async_trait;
use crate::services::ai_error::AIError;
use crate::services::ai_providers::{AIProvider, ChatMessage, ModelConfig};
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

pub struct DeepSeekProvider {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl DeepSeekProvider {
    pub fn new(api_key: String) -> Self {
        // 创建带超时配置的 HTTP 客户端
        // ⚠️ 关键修复：移除 HTTP/2，使用 HTTP/1.1（DeepSeek API 可能不支持 HTTP/2）
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90)) // 增加请求超时到 90 秒
            .connect_timeout(std::time::Duration::from_secs(15)) // 增加连接超时到 15 秒
            .tcp_keepalive(std::time::Duration::from_secs(60)) // 保持 TCP 连接
            .pool_idle_timeout(std::time::Duration::from_secs(90)) // 连接池空闲超时
            .http1_only() // 强制使用 HTTP/1.1，避免 HTTP/2 连接错误
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
    max_tokens: Option<u32>,
    stream: bool,
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
            max_tokens: Some(max_length as u32),
            stream: false,
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
            max_tokens: Some(2000),
            stream: false,
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
    ) -> Result<Box<dyn tokio_stream::Stream<Item = Result<String, AIError>> + Send + Unpin>, AIError> {
        let request = ChatRequest {
            model: model_config.model.clone(),
            messages: messages.iter().map(|m| ChatMessageRequest {
                role: m.role.clone(),
                content: m.content.clone(),
            }).collect(),
            temperature: model_config.temperature,
            max_tokens: Some(model_config.max_tokens as u32),
            stream: true,
        };
        
        let response = self.client
            .post(&format!("{}/chat/completions", self.base_url))
            .headers(self.build_headers())
            .json(&request)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(format!("请求失败: {}", e)))?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Unknown(format!("API 错误 ({}): {}", status, error_text)));
        }
        
        // 创建流式响应处理（参考 OpenAI 提供商）
        let stream = response.bytes_stream();
        let stream = stream.map(|result| {
            match result {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    let lines: Vec<&str> = text.lines().collect();
                    for line in lines {
                        if line.starts_with("data: ") {
                            let json_str = &line[6..];
                            if json_str == "[DONE]" {
                                return Ok(String::new());
                            }
                            match serde_json::from_str::<ChatCompletionResponse>(json_str) {
                                Ok(chat_response) => {
                                    if let Some(choice) = chat_response.choices.first() {
                                        if let Some(delta) = &choice.delta {
                                            if let Some(content) = &delta.content {
                                                return Ok(content.clone());
                                            }
                                        }
                                    }
                                }
                                Err(_) => continue,
                            }
                        }
                    }
                    Ok(String::new())
                }
                Err(e) => Err(AIError::NetworkError(e.to_string())),
            }
        });
        
        // 包装为 Box<dyn Stream>
        let boxed_stream: Box<dyn tokio_stream::Stream<Item = Result<String, AIError>> + Send + Unpin> = 
            Box::new(stream);
        
        Ok(boxed_stream)
    }
}
