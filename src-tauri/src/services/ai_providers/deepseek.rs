use crate::services::ai_error::AIError;
use crate::services::ai_providers::{
  AIProvider, ChatChunk, ChatMessage, ModelConfig, ToolDefinition,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio_stream::StreamExt;

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

pub struct DeepSeekProvider {
  api_key: String,
  base_url: String,
  client: reqwest::Client,
}

impl DeepSeekProvider {
  pub fn new(api_key: String) -> Self {
    // 创建带超时配置的 HTTP 客户端
    // ⚠️ 关键修复：优化网络连接配置，提高稳定性
    let mut client_builder = reqwest::Client::builder()
      .timeout(std::time::Duration::from_secs(120)) // 增加请求超时到 120 秒
      .connect_timeout(std::time::Duration::from_secs(30)) // 增加连接超时到 30 秒
      .tcp_keepalive(std::time::Duration::from_secs(30)) // 保持 TCP 连接
      .pool_idle_timeout(std::time::Duration::from_secs(60)) // 连接池空闲超时
      .pool_max_idle_per_host(6) // 每个主机的最大空闲连接数
      .http1_only() // 强制使用 HTTP/1.1，避免 HTTP/2 连接错误
      .user_agent("Binder/1.0") // 添加 User-Agent
      .danger_accept_invalid_certs(false); // 确保 SSL 证书验证

    // 支持从环境变量读取代理配置
    // reqwest 默认会从 HTTP_PROXY 和 HTTPS_PROXY 环境变量读取代理
    // 这里显式检查并记录，方便调试
    if let Ok(proxy_url) = std::env::var("HTTPS_PROXY")
      .or_else(|_| std::env::var("https_proxy"))
      .or_else(|_| std::env::var("HTTP_PROXY"))
      .or_else(|_| std::env::var("http_proxy"))
    {
      eprintln!("🌐 检测到代理配置: {}", proxy_url);
      // reqwest 会自动使用环境变量中的代理，无需手动配置
    } else {
      eprintln!("ℹ️ 未检测到代理配置，使用直连");
    }

    let client = client_builder
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
    let prompt = format!(
      "请继续完成以下文本（只输出续写内容，不要重复原文）：\n{}",
      context
    );

    let request = ChatRequest {
      model: "deepseek-chat".to_string(),
      messages: vec![
        ChatMessageRequest::simple("system", "你是一个文本自动补全助手。"),
        ChatMessageRequest::simple("user", prompt),
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
      match self
        .client
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
              return Err(AIError::Unknown(format!(
                "API 错误 ({}): {}",
                status, error_text
              )));
            }
            // 5xx 错误（服务器错误），继续重试
            last_error = Some(format!("API 错误 ({}): {}", status, error_text));
          } else {
            // 请求成功，解析响应
            match response.json::<ChatCompletionResponse>().await {
              Ok(result) => {
                let content = result
                  .choices
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
    Err(AIError::NetworkError(format!(
      "请求失败（已重试 3 次）: {}",
      last_error.unwrap_or_else(|| "未知错误".to_string())
    )))
  }

  async fn autocomplete_enhanced(
    &self,
    context_before: &str,
    context_after: Option<&str>,
    editor_state: Option<&crate::services::ai_providers::EditorState>,
    memory_items: Option<&[crate::services::ai_providers::MemoryItem]>,
    document_format: &str,
    document_overview: Option<&crate::services::ai_providers::DocumentOverview>,
    max_length: usize,
  ) -> Result<String, AIError> {
    // 构建增强的提示词
    let (system_prompt, user_prompt) = build_autocomplete_prompt(
      context_before,
      context_after,
      editor_state,
      memory_items,
      document_format,
      document_overview,
      max_length,
    );

    // 为自动补全创建带短超时的客户端（10秒超时，快速失败）
    let autocomplete_client = reqwest::Client::builder()
      .timeout(std::time::Duration::from_secs(10)) // 自动补全10秒超时
      .connect_timeout(std::time::Duration::from_secs(5))
      .http1_only()
      .user_agent("Binder/1.0")
      .build()
      .map_err(|e| AIError::NetworkError(format!("创建客户端失败: {}", e)))?;

    // 输出完整的提示词用于调试
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!("📝 [自动补全] 完整提示词");
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!("🔧 参数配置:");
    eprintln!("  - 模型: deepseek-chat");
    eprintln!("  - 最大Token: {}", max_length);
    eprintln!("  - 文档格式: {}", document_format);
    eprintln!("  - 温度: 0.7");
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!("💬 系统提示词 (System Prompt):");
    eprintln!("{}", system_prompt);
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!("👤 用户提示词 (User Prompt):");
    eprintln!("{}", user_prompt);
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    eprintln!("📊 提示词统计:");
    eprintln!("  - 系统提示词长度: {} 字符", system_prompt.len());
    eprintln!("  - 用户提示词长度: {} 字符", user_prompt.len());
    eprintln!(
      "  - 总长度: {} 字符",
      system_prompt.len() + user_prompt.len()
    );
    eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let request = ChatRequest {
      model: "deepseek-chat".to_string(),
      messages: vec![
        ChatMessageRequest::simple("system", system_prompt),
        ChatMessageRequest::simple("user", user_prompt),
      ],
      temperature: 0.7,
      top_p: Some(1.0),
      frequency_penalty: Some(0.0),
      presence_penalty: Some(0.0),
      // 3 条建议 × 每条 max_length 字符，预留足够 token（中文约 1 字符≈1-2 token）
      max_tokens: Some((max_length * 3 + 50).min(400) as u32),
      stream: false,
      tools: None,
      tool_choice: None,
    };

    // 自动补全只重试1次（快速失败，避免延迟）
    match autocomplete_client
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
          return Err(AIError::Unknown(format!(
            "API 错误 ({}): {}",
            status, error_text
          )));
        }
        match response.json::<ChatCompletionResponse>().await {
          Ok(result) => {
            let content = result
              .choices
              .first()
              .and_then(|c| c.message.as_ref().or(c.delta.as_ref()))
              .and_then(|d| d.content.as_ref())
              .cloned()
              .unwrap_or_default();

            // 记录响应内容用于调试
            eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            eprintln!("✅ [自动补全] 收到响应");
            eprintln!("  - 内容长度: {} 字符", content.len());
            eprintln!(
              "  - 内容预览: {}",
              if content.len() > 50 {
                format!("{}...", &content.chars().take(50).collect::<String>())
              } else {
                content.clone()
              }
            );
            eprintln!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            // 允许空内容（补全内容允许为空，允许为单独的标点符号）
            Ok(content)
          }
          Err(e) => {
            eprintln!("❌ [自动补全] 解析响应失败: {}", e);
            Err(AIError::NetworkError(format!("解析响应失败: {}", e)))
          }
        }
      }
      Err(e) => {
        eprintln!("❌ [自动补全] 请求失败: {}", e);
        Err(AIError::NetworkError(format!("请求失败: {}", e)))
      }
    }
  }

  async fn inline_assist(
    &self,
    instruction: &str,
    text: &str,
    context: &str,
  ) -> Result<String, AIError> {
    // 统一用于多种场景：Inline Assist（改写/生成/分析）和简易分类等
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
            context,
        );

    let request = ChatRequest {
      model: "deepseek-chat".to_string(),
      messages: vec![
        ChatMessageRequest::simple("system", system_prompt),
        ChatMessageRequest::simple("user", user_prompt),
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
      match self
        .client
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
              return Err(AIError::Unknown(format!(
                "API 错误 ({}): {}",
                status, error_text
              )));
            }
            // 5xx 错误（服务器错误），继续重试
            last_error = Some(format!("API 错误 ({}): {}", status, error_text));
          } else {
            // 请求成功，解析响应
            match response.json::<ChatCompletionResponse>().await {
              Ok(result) => {
                let content = result
                  .choices
                  .first()
                  .and_then(|c| c.message.as_ref().or(c.delta.as_ref()))
                  .and_then(|d| d.content.as_ref())
                  .cloned()
                  .unwrap_or_default();

                // 直接返回原始内容，前端会解析 JSON
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
    Err(AIError::NetworkError(format!(
      "请求失败（已重试 3 次）: {}",
      last_error.unwrap_or_else(|| "未知错误".to_string())
    )))
  }

  async fn chat_stream(
    &self,
    messages: &[ChatMessage],
    model_config: &ModelConfig,
    cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
    tools: Option<&[ToolDefinition]>,
  ) -> Result<
    Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin>,
    AIError,
  > {
    // ⚠️ 关键修复：在开始流处理前检查取消信号
    if cancel_rx.try_recv().is_ok() {
      return Err(AIError::Cancelled);
    }
    // 构建工具定义（OpenAI 格式）
    let tools_json = tools.map(|tools| {
      tools
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
    });

    let request = ChatRequest {
      model: model_config.model.clone(),
      messages: messages
        .iter()
        .map(ChatMessageRequest::from_chat_message)
        .collect(),
      temperature: model_config.temperature,
      top_p: Some(model_config.top_p),
      frequency_penalty: Some(0.0), // 设置为 0，不惩罚重复（但也不鼓励）。如果需要抑制重复，可以设置为 0.1-0.5
      presence_penalty: Some(0.0),  // 设置为 0，不鼓励新话题
      max_tokens: Some(model_config.max_tokens as u32),
      stream: true,
      tools: tools_json,
      tool_choice: if tools.is_some() {
        Some("auto".to_string())
      } else {
        None
      },
    };

    // 添加重试机制处理网络连接错误
    let mut last_error = None;
    let mut response = None;

    for attempt in 0..3 {
      match self
        .client
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
          let error_str = e.to_string();
          last_error = Some(e);
          eprintln!("⚠️ 网络连接失败 (尝试 {}/3): {}", attempt + 1, error_str);

          // 如果是连接错误，等待后重试
          if attempt < 2 {
            let delay = std::time::Duration::from_millis(1000 * (attempt + 1) as u64); // 增加重试延迟：1s, 2s
            tokio::time::sleep(delay).await;
            eprintln!(
              "⏳ {}ms 后重试 (尝试 {}/3)...",
              delay.as_millis(),
              attempt + 2
            );
          } else {
            // 最后一次尝试失败，输出详细错误信息
            eprintln!("❌ 所有重试均失败，最终错误: {}", error_str);
            if error_str.contains("Connection refused") || error_str.contains("tcp connect") {
              eprintln!("💡 提示: Connection refused 通常表示：");
              eprintln!("   1. 网络连接问题（请检查网络连接）");
              eprintln!("   2. 防火墙或代理阻止（检查防火墙设置）");
              eprintln!("   3. 服务器不可达（检查 DNS 解析）");
              eprintln!("   4. 需要配置代理（如果使用代理，请设置 HTTPS_PROXY 环境变量）");
              eprintln!("   5. 检查系统代理设置");

              // 检查环境变量
              let has_proxy = std::env::var("HTTPS_PROXY").is_ok()
                || std::env::var("https_proxy").is_ok()
                || std::env::var("HTTP_PROXY").is_ok()
                || std::env::var("http_proxy").is_ok();

              if !has_proxy {
                eprintln!("   ⚠️ 未检测到代理环境变量，如果使用代理，请设置：");
                eprintln!("      export HTTPS_PROXY=http://proxy.example.com:8080");
              }

              // 尝试 DNS 解析测试
              eprintln!("   🔍 诊断建议：");
              eprintln!("      - 尝试 ping api.deepseek.com");
              eprintln!("      - 检查防火墙是否阻止了连接");
              eprintln!("      - 如果使用代理，确保代理服务器正常运行");
            }
          }
        }
      }
    }

    let response = response.ok_or_else(|| {
      AIError::NetworkError(format!(
        "请求失败（已重试 3 次）: {}",
        last_error
          .map(|e| e.to_string())
          .unwrap_or_else(|| "未知错误".to_string())
      ))
    })?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();

      // 检测Token超限错误
      if status.as_u16() == 400 {
        let error_lower = error_text.to_lowercase();
        if error_lower.contains("token")
          || error_lower.contains("length")
          || error_lower.contains("context")
          || error_lower.contains("maximum")
          || error_lower.contains("exceeded")
          || error_lower.contains("too long")
        {
          eprintln!("⚠️ 检测到Token超限错误: {}", error_text);
          return Err(AIError::Unknown(format!("Token超限: {}", error_text)));
        }
      }

      return Err(AIError::Unknown(format!(
        "API 错误 ({}): {}",
        status, error_text
      )));
    }

    // 创建流式响应处理（参考 OpenAI 提供商）
    // 使用 Arc<Mutex<>> 来在流式处理中保持状态
    let tool_call_state = Arc::new(Mutex::new((
      Option::<String>::None, // tool_call_id
      Option::<String>::None, // tool_call_name
      String::new(),          // tool_call_arguments
    )));

    // 使用缓冲来处理可能跨 chunk 的 SSE 行
    let buffer = Arc::new(Mutex::new(String::new()));

    // 按照文档：使用 Arc<Mutex<>> 在流中保持累积文本状态（用于检测重复）
    let accumulated_text_state = Arc::new(Mutex::new(String::new()));

    // 注意：取消逻辑主要在 ai_commands.rs 的流处理循环中处理
    // 由于 oneshot::Receiver 不能 clone，我们无法在流处理闭包中直接监听取消信号
    // 但是，在 ai_commands.rs 中，我们已经在流处理循环的每次迭代中检查取消标志
    // 所以这里不需要额外的取消检查

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
                                                                    safe_truncate(arguments, 50));
                                                                state_guard.2.push_str(arguments);
                                                                eprintln!("📝 累积后总长度={}, 内容预览={}", 
                                                                    state_guard.2.len(),
                                                                    safe_truncate(&state_guard.2, 100));
                                                            }
                                                        }
                                                    }
                                                    // 只有在有参数时才返回（避免返回空的工具调用）
                                                    if let (Some(ref id), Some(ref name)) = (&state_guard.0, &state_guard.1) {
                                                        if !state_guard.2.is_empty() {
                                                            // 检查 arguments 是否是完整的 JSON
                                                            let args_str = state_guard.2.clone();
                                                            eprintln!("🔍 检查 JSON 完整性: 长度={}, 内容={}", args_str.len(), 
                                                                if args_str.len() > 200 { format!("{}...", safe_truncate(&args_str, 200)) } else { args_str.clone() });
                                                            
                                                            // ⚠️ 增强检查：不仅检查是否以 } 结尾，还要验证 JSON 是否有效
                                                            // 1. 检查括号是否匹配
                                                            let open_braces = args_str.matches('{').count();
                                                            let close_braces = args_str.matches('}').count();
                                                            let braces_match = open_braces == close_braces;
                                                            
                                                            // 2. 检查字符串是否闭合（简单检查：引号数量是否为偶数，考虑转义）
                                                            let quote_count = args_str.matches('"').count();
                                                            // 简单检查：如果引号数量为偶数，可能字符串已闭合（不完美，但可以过滤明显的问题）
                                                            let quotes_even = quote_count % 2 == 0;
                                                            
                                                            // 3. 尝试解析 JSON
                                                            let parse_ok = serde_json::from_str::<serde_json::Value>(&args_str).is_ok();
                                                            
                                                            // 只有当所有检查都通过时，才认为 JSON 完整
                                                            let is_complete = args_str.trim().ends_with('}') && 
                                                                              braces_match && 
                                                                              quotes_even &&
                                                                              parse_ok;
                                                            
                                                            if is_complete {
                                                                eprintln!("✅ JSON 完整，标记为完成");
                                                            } else {
                                                                eprintln!("⏳ JSON 不完整，继续累积 (括号匹配: {}, 引号偶数: {}, 解析: {})", 
                                                                    braces_match, quotes_even, parse_ok);
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
                                                        
                                                        // 检查是否与累积文本重复（优化：减少误判）
                                                        let content_len = content.len();
                                                        if content_len > 0 {
                                                            // 检查1：content是否完全等于累积文本的末尾（这是真正的重复）
                                                            if acc_guard.ends_with(content) {
                                                                // 只在调试模式显示，避免日志过多
                                                                #[cfg(debug_assertions)]
                                                                eprintln!("⚠️ [deepseek] 检测到重复 content（完全重复），跳过: '{}'", 
                                                                    safe_truncate(content, 50));
                                                                continue;
                                                            }
                                                            
                                                            // 检查2：content是否在累积文本的最后部分重复出现（防止部分重复）
                                                            // ⚠️ 增强：检查更大的范围（content_len * 10），防止中文单字符重复
                                                            let check_bytes = std::cmp::min(content_len * 10, acc_guard.len());
                                                            if check_bytes > 0 {
                                                                // 找到字符边界：从目标位置向前找到第一个字符边界
                                                                let start_pos = acc_guard.len().saturating_sub(check_bytes);
                                                                let mut char_boundary = start_pos;
                                                                // 从 start_pos 开始，找到第一个字符边界
                                                                while char_boundary < acc_guard.len() && !acc_guard.is_char_boundary(char_boundary) {
                                                                    char_boundary += 1;
                                                                }
                                                                
                                                                // 如果找到了字符边界，检查重复
                                                                if char_boundary < acc_guard.len() {
                                                                    let last_part = &acc_guard[char_boundary..];
                                                                    // 如果content在最后部分出现了两次或更多，说明是重复的
                                                                    let occurrences = last_part.matches(content).count();
                                                                    if occurrences >= 2 {
                                                                        eprintln!("⚠️ [deepseek] 检测到重复 content（部分重复，出现{}次），跳过: '{}'", 
                                                                            occurrences, safe_truncate(content, 50));
                                                                        continue;
                                                                    }
                                                                }
                                                            }
                                                            
                                                            // 检查3：检查单字符或短字符串的重复模式（针对中文重复问题）
                                                            // 如果content很短（1-3个字符），检查是否在累积文本中形成了重复模式
                                                            if content_len <= 3 && acc_guard.len() >= content_len * 4 {
                                                                let check_length = std::cmp::min(content_len * 20, acc_guard.len());
                                                                let check_start = acc_guard.len().saturating_sub(check_length);
                                                                let mut char_boundary = check_start;
                                                                while char_boundary < acc_guard.len() && !acc_guard.is_char_boundary(char_boundary) {
                                                                    char_boundary += 1;
                                                                }
                                                                
                                                                if char_boundary < acc_guard.len() {
                                                                    let check_part = &acc_guard[char_boundary..];
                                                                    // 检查是否形成了明显的重复模式（连续出现2次或更多）
                                                                    let pattern = format!("{}{}", content, content);
                                                                    if check_part.contains(&pattern) {
                                                                        eprintln!("⚠️ [deepseek] 检测到重复 content（重复模式），跳过: '{}'", 
                                                                            safe_truncate(content, 50));
                                                                        continue;
                                                                    }
                                                                }
                                                            }
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
    let boxed_stream: Box<
      dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin,
    > = Box::new(stream);

    Ok(boxed_stream)
  }
}

// 构建增强的自动补全提示词
fn build_autocomplete_prompt(
  context_before: &str,
  context_after: Option<&str>,
  editor_state: Option<&crate::services::ai_providers::EditorState>,
  memory_items: Option<&[crate::services::ai_providers::MemoryItem]>,
  document_format: &str,
  document_overview: Option<&crate::services::ai_providers::DocumentOverview>,
  max_length: usize,
) -> (String, String) {
  // 构建系统提示词
  let format_requirements = match document_format {
        // 内部仍使用 t-docx 作为 Binder 的伪 docx 标识，但对模型只描述为 Word/DOCX 富文本，避免引入陌生概念
        "t-docx" => "当前文档格式：Word 文档（DOCX 风格的富文本）。续写内容需匹配段落、标题、粗体、斜体、列表等样式，并与上下文保持一致。",
        "md" | "markdown" => "当前文档格式：Markdown。续写内容可使用 Markdown 语法（粗体、斜体、列表、代码块等），但需与上下文风格一致。",
        "html" => "当前文档格式：HTML。续写内容可使用 HTML 标签，但需与上下文风格一致。",
        _ => "当前文档格式：纯文本。续写内容应为普通段落文本，不使用 Markdown 标记、列表符号或代码块。",
    };

  // 构建系统提示词（更简单更稳定的方法，增强全文理解和上下文衔接）
  let mut system_prompt = format!(
        "你是一个专业的写作助手，帮助用户续写内容。\n\n{}\n\n续写规则：\n- 续写长度：1-{}字符（每条建议），以完整句子或完整语义单元结尾\n- **全文理解**：仔细分析文档开头、结尾、结构、当前章节，理解文档的整体主题、风格和情感基调\n- **插入位置**：你的续写将被插入在【上文】和【下文】之间，阅读顺序为：上文 → 你生成的续写 → 下文\n- **时间线约束**：不要修改、重复或提前回答【下文】中的内容，不要生成发生在【下文】之后才会出现的事件或对话\n- **上下文衔接**：\n  * 保持与上文的语义连贯和风格一致\n  * 如果下文有内容，仔细分析下文的语义、风格和情感，确保续写与下文自然衔接，避免割裂\n  * 如果提供了前后段落，分析段落间的逻辑关系，确保续写符合段落间的衔接逻辑\n- 保持文档结构的完整性\n- 保持主题和情感的一致性\n- 保持人物性格和语言风格的一致性（文学创作）\n- 保持术语和概念的一致性（专业文档）\n- 匹配当前文档格式和样式\n- 根据上下文分析续写方向（推进/补充/转折），并自然执行",
        format_requirements,
        max_length
    );

  // 构建用户提示词（根据需求文档优化）
  let mut user_prompt = String::new();

  // 添加文档概览（全文视角）- 更简单更稳定的方法，增强全文理解
  if let Some(overview) = document_overview {
    user_prompt.push_str("[文档概览]\n");
    user_prompt.push_str(&format!("文档长度：{} 字符\n", overview.document_length));
    user_prompt.push_str(&format!("当前章节：{}\n", overview.current_section));
    if !overview.document_structure.is_empty() && overview.document_structure != "无标题结构" {
      user_prompt.push_str(&format!("文档结构：{}\n", overview.document_structure));
    }
    user_prompt.push_str(&format!("文档开头：{}\n", overview.document_start));
    if !overview.document_end.is_empty() {
      user_prompt.push_str(&format!("文档结尾：{}\n", overview.document_end));
    }
    user_prompt.push_str("（请参考文档的整体主题、风格和结构，保持续写与全文的一致性）\n\n");

    // 添加上下段落信息（增强上下文衔接）
    if !overview.previous_paragraph.is_empty() {
      user_prompt.push_str(&format!("[前一段落]\n{}\n\n", overview.previous_paragraph));
    }
    if !overview.next_paragraph.is_empty() {
      user_prompt.push_str(&format!("[后一段落]\n{}\n\n", overview.next_paragraph));
    }
  }

  // 添加上文（限制长度，但保留更多上下文）- 使用字符边界安全的方法
  let context_before_limited = if context_before.chars().count() > 600 {
    // 如果太长，只取最后600字符，但尝试在句子边界截断
    // 使用字符迭代器来安全地截取
    let char_count = context_before.chars().count();
    let start_chars = char_count.saturating_sub(600);
    let truncated: String = context_before.chars().skip(start_chars).collect();

    // 尝试找到第一个句子边界
    if let Some(sentence_start) =
      truncated.find(|c: char| c == '。' || c == '！' || c == '？' || c == '\n')
    {
      // 使用字符迭代器安全地跳过句子边界
      let after_sentence: String = truncated.chars().skip(sentence_start + 1).collect();
      format!("...{}", after_sentence.trim_start())
    } else {
      format!("...{}", truncated)
    }
  } else {
    context_before.to_string()
  };
  user_prompt.push_str(&format!("[上下文内容]\n上文：{}\n", context_before_limited));

  // 添加下文（明确说明是否有下文，增强上下文衔接）- 使用字符边界安全的方法
  if let Some(context_after) = context_after {
    let context_after_limited = if context_after.chars().count() > 400 {
      // 限制400字符（增加），但尝试在句子边界截断
      // 先取前400个字符
      let first_400: String = context_after.chars().take(400).collect();

      // 在400字符内查找最后一个句子边界
      if let Some(sentence_end) =
        first_400.rfind(|c: char| c == '。' || c == '！' || c == '？' || c == '\n')
      {
        // 使用字符迭代器安全地截取到句子边界
        context_after
          .chars()
          .take(sentence_end + 1)
          .collect::<String>()
      } else {
        // 如果没有找到句子边界，直接取前400字符
        first_400
      }
    } else {
      context_after.to_string()
    };
    user_prompt.push_str(&format!("下文：{}\n", context_after_limited));
    user_prompt.push_str("（注意：续写内容需要与下文自然衔接，分析下文的语义和风格，确保续写与下文流畅连接，避免割裂）\n");
  } else {
    user_prompt.push_str("下文：无（文档末尾，续写方向应为推进情节/内容）\n");
  }

  // 添加结构信息
  if let Some(state) = editor_state {
    user_prompt.push_str("\n[结构信息]\n");
    user_prompt.push_str(&format!("当前位置：{}\n", state.node_type));
    if let Some(level) = state.heading_level {
      user_prompt.push_str(&format!("标题层级：H{}\n", level));
    }
    if let Some(list_type) = &state.list_type {
      user_prompt.push_str(&format!("列表类型：{}\n", list_type));
      if let Some(level) = state.list_level {
        user_prompt.push_str(&format!("列表层级：{}\n", level));
      }
    }
    if let Some(block_type) = &state.block_type {
      user_prompt.push_str(&format!("块类型：{}\n", block_type));
    }
  }

  // 添加记忆库信息
  if let Some(memories) = memory_items {
    if !memories.is_empty() {
      user_prompt.push_str("\n[记忆库信息]\n");
      for memory in memories {
        // 限制每条记忆100字符
        let content_short = memory.content.chars().take(100).collect::<String>();
        user_prompt.push_str(&format!(
          "- {}（{}）：{}\n",
          memory.entity_name, memory.entity_type, content_short
        ));
      }
      user_prompt.push_str("（请参考记忆库中的术语和风格偏好，保持一致性）\n");
    }
  }

  user_prompt.push_str("\n[续写要求]\n");
  user_prompt.push_str(
    "你的续写将被插入在【上文】和【下文】之间，阅读顺序为：【上文】→【你的续写】→【下文】。\n",
  );
  user_prompt.push_str("请遵守以下约束：\n");
  user_prompt.push_str("- 不要修改、重复或提前回答【下文】中的内容；\n");
  user_prompt.push_str("- 不要生成发生在【下文】之后才会出现的事件、对话或结局；\n");
  user_prompt.push_str(
    "- 你的内容应被理解为在【下文】出现之前已经发生的动作、心理活动、环境描写或补充说明；\n",
  );
  user_prompt
    .push_str("- 目标是让‘上文 + 你的续写 + 下文’整体读起来自然连贯，而不是重写下文。\n\n");
  // Phase 1a：要求返回 3 条续写建议，用 --- 分隔
  user_prompt.push_str("[输出格式]\n请返回 3 条不同的续写建议，每条一行，用 --- 分隔。例如：\n建议1内容\n---\n建议2内容\n---\n建议3内容\n\n基于以上上下文，续写接下来的内容（3 条，用 --- 分隔）：");

  (system_prompt, user_prompt)
}
