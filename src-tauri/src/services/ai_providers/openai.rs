use async_trait::async_trait;
use crate::services::ai_error::AIError;
use crate::services::ai_providers::{AIProvider, ChatMessage, ModelConfig};
use serde::{Deserialize, Serialize};
use tokio_stream::{Stream, StreamExt};
use std::pin::Pin;

pub struct OpenAIProvider {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.openai.com/v1".to_string(),
            client: reqwest::Client::new(),
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
    top_p: f64,
    max_tokens: usize,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct ChatMessageRequest {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Option<Delta>,
    message: Option<Message>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Message {
    content: String,
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    async fn autocomplete(&self, context: &str, max_length: usize) -> Result<String, AIError> {
        // 使用 GPT-3.5-turbo 或 GPT-4o-mini 进行自动补全
        let model = "gpt-4o-mini".to_string();
        
        let prompt = format!(
            "继续完成以下文本，只生成 {} 个字符以内的续写内容，不要换行：\n\n{}",
            max_length,
            context
        );
        
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }];
        
        let model_config = ModelConfig {
            model: model.clone(),
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: (max_length / 2).max(10).min(50), // 估算 token 数
        };
        
        // 使用非流式请求
        let url = format!("{}/chat/completions", self.base_url);
        let request_body = ChatRequest {
            model: model_config.model.clone(),
            messages: messages.iter().map(|m| ChatMessageRequest {
                role: m.role.clone(),
                content: m.content.clone(),
            }).collect(),
            temperature: model_config.temperature,
            top_p: model_config.top_p,
            max_tokens: model_config.max_tokens,
            stream: false,
        };
        
        let response = self.client
            .post(&url)
            .headers(self.build_headers())
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;
        
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(60);
            return Err(AIError::RateLimit { retry_after });
        }
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Unknown(format!("API 错误: {}", error_text)));
        }
        
        let chat_response: ChatResponse = response
            .json()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;
        
        let content = chat_response
            .choices
            .first()
            .and_then(|c| c.message.as_ref())
            .map(|m| m.content.clone())
            .unwrap_or_default();
        
        // 限制长度
        let result = content.chars().take(max_length).collect::<String>();
        Ok(result)
    }

    async fn inline_assist(&self, instruction: &str, text: &str, context: &str) -> Result<String, AIError> {
        // 使用 GPT-4o 或 GPT-4-turbo 进行 Inline Assist
        let model = "gpt-4o".to_string();
        
        let prompt = format!(
            "请根据以下指令修改文本：\n\n指令：{}\n\n原文本：{}\n\n上下文：{}\n\n只返回修改后的文本，不要包含其他说明。",
            instruction,
            text,
            context.chars().take(1000).collect::<String>() // 限制上下文长度
        );
        
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }];
        
        let model_config = ModelConfig {
            model: model.clone(),
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 500,
        };
        
        let url = format!("{}/chat/completions", self.base_url);
        let request_body = ChatRequest {
            model: model_config.model.clone(),
            messages: messages.iter().map(|m| ChatMessageRequest {
                role: m.role.clone(),
                content: m.content.clone(),
            }).collect(),
            temperature: model_config.temperature,
            top_p: model_config.top_p,
            max_tokens: model_config.max_tokens,
            stream: false,
        };
        
        let response = self.client
            .post(&url)
            .headers(self.build_headers())
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;
        
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(60);
            return Err(AIError::RateLimit { retry_after });
        }
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Unknown(format!("API 错误: {}", error_text)));
        }
        
        let chat_response: ChatResponse = response
            .json()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;
        
        let content = chat_response
            .choices
            .first()
            .and_then(|c| c.message.as_ref())
            .map(|m| m.content.clone())
            .unwrap_or_default();
        
        Ok(content)
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model_config: &ModelConfig,
        _cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
    ) -> Result<Box<dyn tokio_stream::Stream<Item = Result<String, AIError>> + Send + Unpin>, AIError> {
        let url = format!("{}/chat/completions", self.base_url);
        let request_body = ChatRequest {
            model: model_config.model.clone(),
            messages: messages.iter().map(|m| ChatMessageRequest {
                role: m.role.clone(),
                content: m.content.clone(),
            }).collect(),
            temperature: model_config.temperature,
            top_p: model_config.top_p,
            max_tokens: model_config.max_tokens,
            stream: true,
        };
        
        let response = self.client
            .post(&url)
            .headers(self.build_headers())
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;
        
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(60);
            return Err(AIError::RateLimit { retry_after });
        }
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Unknown(format!("API 错误: {}", error_text)));
        }
        
        // 创建流式响应处理
        let stream = response.bytes_stream();
        let stream = stream.map(|result| {
            match result {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    // 解析 SSE 格式：data: {...}\n\n
                    let lines: Vec<&str> = text.lines().collect();
                    for line in lines {
                        if line.starts_with("data: ") {
                            let json_str = &line[6..];
                            if json_str == "[DONE]" {
                                return Ok(String::new());
                            }
                            match serde_json::from_str::<ChatResponse>(json_str) {
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
