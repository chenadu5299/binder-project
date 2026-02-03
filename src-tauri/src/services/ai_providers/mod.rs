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

// 编辑器状态（用于提示词构建）
#[derive(Debug, Clone)]
pub struct EditorState {
    pub node_type: String,
    pub heading_level: Option<u32>,
    pub list_type: Option<String>,
    pub list_level: Option<u32>,
    pub block_type: Option<String>,
}

// 记忆库项（用于提示词构建）
#[derive(Debug, Clone)]
pub struct MemoryItem {
    pub id: String,
    pub entity_name: String,
    pub content: String,
    pub entity_type: String,
}

// 文档概览（用于全文视角）
#[derive(Debug, Clone)]
pub struct DocumentOverview {
    pub document_start: String,
    pub document_end: String,
    pub document_structure: String,
    pub document_length: usize,
    pub current_section: String,
    pub previous_paragraph: String,
    pub next_paragraph: String,
}

#[async_trait]
pub trait AIProvider: Send + Sync {
    /// 自动补全（使用快速模型，旧版本，保持兼容）
    async fn autocomplete(&self, context: &str, max_length: usize) -> Result<String, AIError>;
    
    /// 自动补全（增强版本，支持下文、编辑器状态、记忆库、文档概览）
    async fn autocomplete_enhanced(
        &self,
        context_before: &str,
        context_after: Option<&str>,
        editor_state: Option<&EditorState>,
        memory_items: Option<&[MemoryItem]>,
        document_format: &str,
        document_overview: Option<&DocumentOverview>,
        max_length: usize,
    ) -> Result<String, AIError> {
        // 默认实现：调用旧版本（向后兼容）
        self.autocomplete(context_before, max_length).await
    }
    
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

