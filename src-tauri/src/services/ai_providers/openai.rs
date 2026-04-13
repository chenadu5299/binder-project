use crate::services::ai_error::AIError;
use crate::services::ai_providers::{
  AIProvider, ChatChunk, ChatMessage, ModelConfig, ToolDefinition,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio_stream::StreamExt;

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
  #[serde(skip_serializing_if = "Option::is_none")]
  content: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  tool_call_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  tool_calls: Option<Vec<serde_json::Value>>,
}

impl ChatMessageRequest {
  fn simple(role: impl Into<String>, content: impl Into<String>) -> Self {
    Self {
      role: role.into(),
      content: Some(content.into()),
      tool_call_id: None,
      name: None,
      tool_calls: None,
    }
  }

  fn from_chat_message(m: &ChatMessage) -> Self {
    // API：assistant(tool_calls) 不得带 content；tool 必须带正文。
    let content = if m.role == "assistant" && m.tool_calls.is_some() {
      None
    } else if m.role == "tool" {
      Some(m.content.clone().unwrap_or_default())
    } else {
      m.content.clone()
    };
    Self {
      role: m.role.clone(),
      content,
      tool_call_id: m.tool_call_id.clone(),
      name: m.name.clone(),
      tool_calls: m.tool_calls.clone(),
    }
  }
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
  choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
  delta: Option<Delta>,
  message: Option<Message>,
  finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
  content: Option<String>,
  #[serde(default)]
  tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct Message {
  #[serde(default)]
  content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
  #[serde(rename = "index")]
  _index: Option<u32>,
  id: Option<String>,
  #[serde(rename = "type")]
  _tool_type: Option<String>,
  function: Option<FunctionCallDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionCallDelta {
  name: Option<String>,
  arguments: Option<String>,
}

#[async_trait]
impl AIProvider for OpenAIProvider {
  async fn autocomplete(&self, context: &str, max_length: usize) -> Result<String, AIError> {
    // 使用 GPT-3.5-turbo 或 GPT-4o-mini 进行自动补全
    let model = "gpt-4o-mini".to_string();

    let prompt = format!(
      "继续完成以下文本，只生成 {} 个字符以内的续写内容，不要换行：\n\n{}",
      max_length, context
    );

    let messages = vec![ChatMessage {
      role: "user".to_string(),
      content: Some(prompt),
      tool_call_id: None,
      name: None,
      tool_calls: None,
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
      messages: messages
        .iter()
        .map(ChatMessageRequest::from_chat_message)
        .collect(),
      temperature: model_config.temperature,
      top_p: model_config.top_p,
      max_tokens: model_config.max_tokens,
      stream: false,
      tools: None,
      tool_choice: None,
    };

    let response = self
      .client
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
      .and_then(|m| m.content.clone())
      .unwrap_or_default();

    // 限制长度
    let result = content.chars().take(max_length).collect::<String>();
    Ok(result)
  }

  async fn inline_assist(
    &self,
    instruction: &str,
    text: &str,
    context: &str,
  ) -> Result<String, AIError> {
    // 使用 GPT-4o 进行 Inline Assist，多用途：改写 / 生成 / 分析 / 分类
    let model = "gpt-4o".to_string();

    let system_prompt = r#"你是一个专业的文档和内容处理助手，可以根据用户指令执行多种操作：
- 文本修改：改写、润色、翻译、格式转换等
- 内容生成：续写、补充、生成摘要等
- 分析讨论：分析文本、讨论观点、解释概念等
- 分类匹配：对内容进行分类、匹配或结构化输出

请严格遵守用户指令中的格式和输出要求。"#;

    let user_prompt = format!(
            "[用户指令]\n{}\n\n[选中文本]\n{}\n\n[上下文内容]\n{}\n\n[任务要求]\n- 请先理解用户指令意图（如修改/生成/分析/分类等）。\n- 如果给出了选中文本且指令是改写/润色/翻译等，请在不改变原意的前提下，输出修改后的完整文本。\n- 如果选中文本为空或指令要求生成新内容，请根据指令和上下文生成可直接插入文档的文本。\n- 如果指令要求分析、分类或结构化输出（如要求返回 JSON），请严格按照指令中的格式要求输出结果。\n\n[输出格式要求]\n你必须以 JSON 格式返回结果，格式如下：\n{{\n  \"kind\": \"edit\" 或 \"reply\",\n  \"text\": \"你的回复内容\"\n}}\n- 如果指令是修改/改写/润色/翻译等，且给出了选中文本，kind 应为 \"edit\"，text 为修改后的文本。\n- 如果指令是分析/解释/讨论/总结等，或没有选中文本，kind 应为 \"reply\"，text 为分析或说明内容。\n- 只返回 JSON，不要添加其他文字。",
            instruction,
            text,
            context.chars().take(1000).collect::<String>(), // 限制上下文长度
        );

    let messages = vec![
      ChatMessage {
        role: "system".to_string(),
        content: Some(system_prompt.to_string()),
        tool_call_id: None,
        name: None,
        tool_calls: None,
      },
      ChatMessage {
        role: "user".to_string(),
        content: Some(user_prompt),
        tool_call_id: None,
        name: None,
        tool_calls: None,
      },
    ];

    let model_config = ModelConfig {
      model: model.clone(),
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 500,
    };

    let url = format!("{}/chat/completions", self.base_url);
    let request_body = ChatRequest {
      model: model_config.model.clone(),
      messages: messages
        .iter()
        .map(ChatMessageRequest::from_chat_message)
        .collect(),
      temperature: model_config.temperature,
      top_p: model_config.top_p,
      max_tokens: model_config.max_tokens,
      stream: false,
      tools: None,
      tool_choice: None,
    };

    let response = self
      .client
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
      .and_then(|m| m.content.clone())
      .unwrap_or_default();

    Ok(content)
  }

  async fn chat_stream(
    &self,
    messages: &[ChatMessage],
    model_config: &ModelConfig,
    _cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
    tools: Option<&[ToolDefinition]>,
  ) -> Result<
    Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin>,
    AIError,
  > {
    let tool_requests = tools
      .filter(|defs| !defs.is_empty())
      .map(|defs| {
        defs
          .iter()
          .map(|tool| ToolDefinitionRequest {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
              name: tool.name.clone(),
              description: tool.description.clone(),
              parameters: tool.parameters.clone(),
            },
          })
          .collect::<Vec<_>>()
      })
      .filter(|defs| !defs.is_empty());
    let enable_tools = tool_requests.is_some();

    let url = format!("{}/chat/completions", self.base_url);
    let request_body = ChatRequest {
      model: model_config.model.clone(),
      messages: messages
        .iter()
        .map(ChatMessageRequest::from_chat_message)
        .collect(),
      temperature: model_config.temperature,
      top_p: model_config.top_p,
      max_tokens: model_config.max_tokens,
      stream: true,
      tools: tool_requests,
      tool_choice: if enable_tools {
        Some("auto".to_string())
      } else {
        None
      },
    };

    let response = self
      .client
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

    let tool_call_state = Arc::new(Mutex::new((
      Option::<String>::None, // tool_call_id
      Option::<String>::None, // tool_call_name
      String::new(),          // tool_call_arguments
    )));
    let buffer = Arc::new(Mutex::new(String::new()));

    // 创建流式响应处理（支持 content + tool_calls）
    let stream = response.bytes_stream();
    let stream = stream.map(move |result| {
      let state = tool_call_state.clone();
      let buf = buffer.clone();
      match result {
        Ok(bytes) => {
          let mut buf_guard = buf.lock().unwrap();
          match String::from_utf8(bytes.to_vec()) {
            Ok(text) => buf_guard.push_str(&text),
            Err(_) => {
              let lossy = String::from_utf8_lossy(&bytes);
              buf_guard.push_str(&lossy);
            }
          }

          let lines: Vec<&str> = buf_guard.lines().collect();
          let mut new_buffer = String::new();
          if !buf_guard.ends_with('\n') && !buf_guard.ends_with('\r') {
            if let Some(last_line) = lines.last() {
              new_buffer = (*last_line).to_string();
            }
          }

          let mut merged_text = String::new();
          let mut completed_tool_call: Option<ChatChunk> = None;

          for line in lines.iter() {
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data: ") {
              continue;
            }
            let json_str = &line[6..];
            if json_str == "[DONE]" {
              let mut state_guard = state.lock().unwrap();
              if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                if !state_guard.2.trim().is_empty() {
                  completed_tool_call = Some(ChatChunk::ToolCall {
                    id: id.clone(),
                    name: name.clone(),
                    arguments: state_guard.2.clone(),
                    is_complete: true,
                  });
                  *state_guard = (None, None, String::new());
                  break;
                }
              }
              completed_tool_call = Some(ChatChunk::Text(String::new()));
              break;
            }

            let chat_response = match serde_json::from_str::<ChatResponse>(json_str) {
              Ok(v) => v,
              Err(_) => continue,
            };
            let Some(choice) = chat_response.choices.first() else {
              continue;
            };

            if let Some(delta) = &choice.delta {
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
                      state_guard.2.push_str(arguments);
                    }
                  }
                }

                if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                  if !state_guard.2.trim().is_empty()
                    && serde_json::from_str::<serde_json::Value>(&state_guard.2).is_ok()
                  {
                    completed_tool_call = Some(ChatChunk::ToolCall {
                      id: id.clone(),
                      name: name.clone(),
                      arguments: state_guard.2.clone(),
                      is_complete: true,
                    });
                    *state_guard = (None, None, String::new());
                  }
                }
              }

              if completed_tool_call.is_none() {
                if let Some(content) = &delta.content {
                  if !content.is_empty() {
                    merged_text.push_str(content);
                  }
                }
              }
            }

            if completed_tool_call.is_none()
              && choice.finish_reason.as_deref() == Some("tool_calls")
            {
              let mut state_guard = state.lock().unwrap();
              if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                if !state_guard.2.trim().is_empty() {
                  completed_tool_call = Some(ChatChunk::ToolCall {
                    id: id.clone(),
                    name: name.clone(),
                    arguments: state_guard.2.clone(),
                    is_complete: true,
                  });
                  *state_guard = (None, None, String::new());
                }
              }
            }

            if completed_tool_call.is_some() {
              break;
            }
          }

          *buf_guard = new_buffer;
          if let Some(chunk) = completed_tool_call {
            return Ok(chunk);
          }
          if merged_text.is_empty() {
            Ok(ChatChunk::Text(String::new()))
          } else {
            Ok(ChatChunk::Text(merged_text))
          }
        }
        Err(e) => Err(AIError::NetworkError(e.to_string())),
      }
    });

    // 包装为 Box<dyn Stream>
    let boxed_stream: Box<
      dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin,
    > = Box::new(stream);

    Ok(boxed_stream)
  }
}
