pub mod openai;
pub mod deepseek;
// pub mod anthropic;
// pub mod gemini;
// pub mod local;

pub use openai::OpenAIProvider;
pub use deepseek::DeepSeekProvider;

use crate::services::ai_error::AIError;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChatChunk {
    Text(String),
    ToolCall {
        id: String,
        name: String,
        arguments: String,
        is_complete: bool,
    },
}

#[async_trait]
pub trait AIProvider: Send + Sync {
    /// 自动补全（使用快速模型）
    async fn autocomplete(&self, context: &str, max_length: usize) -> Result<String, AIError>;
    
    /// Inline Assist（使用标准模型）
    async fn inline_assist(&self, instruction: &str, text: &str, context: &str) -> Result<String, AIError>;
    
    /// 聊天（流式响应）
    /// 返回一个异步流，每个 item 是一个 chunk 或工具调用
    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model_config: &ModelConfig,
        cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
        tools: Option<&[ToolDefinition]>,
    ) -> Result<Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin>, AIError>;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub role: String,  // "user" or "assistant"
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelConfig {
    pub model: String,
    pub temperature: f64,
    pub top_p: f64,
    pub max_tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            model: "deepseek-chat".to_string(),
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 2000,
        }
    }
}

