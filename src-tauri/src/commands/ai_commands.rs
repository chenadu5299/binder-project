use crate::services::ai_providers::{ChatChunk, ChatMessage, ModelConfig};
use crate::services::ai_service::AIService;
use crate::services::context_manager::{
  ContextInfo, ContextManager, EditorState as ContextEditorState, KnowledgeRetrievalContext,
  ReferenceInfo, ReferenceType, TruncationStrategy,
};
use crate::services::conversation_manager::ConversationManager;
use crate::services::document_analysis::{AnalysisType, DocumentAnalysisService};
use crate::services::file_watcher::FileWatcherService;
use crate::services::knowledge::{
  KnowledgeInjectionSlice, KnowledgeQueryRequest, KnowledgeService,
};
use crate::services::loop_detector::LoopDetector;
use crate::services::memory_service::{
  format_memory_for_injection, MemorySearchScope, MemoryService, SearchMemoriesParams,
};
use crate::services::reply_completeness_checker::ReplyCompletenessChecker;
use crate::services::stream_state::{
  begin_next_stream_round, finalize_stream, stream_state_label, StreamContext, StreamState,
};
use crate::services::streaming_response_handler::StreamingResponseHandler;
use crate::services::task_progress_analyzer::TaskProgressAnalyzer;
use crate::services::template::TemplateService;
use crate::services::tool_call_handler::ToolCallHandler;
use crate::services::tool_definitions::get_tool_definitions;
use crate::services::tool_policy::TaskExecutionPolicy;
use crate::services::tool_service::{ToolCall, ToolService};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Runtime, State};
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};

// ============================================================================
// AI 命令边界说明（Phase 1）
// - L1：ai_autocomplete
// - L2：ai_inline_assist
// - L3：ai_chat_stream
//
// 当前阶段继续共用同一命令文件，避免大爆破式重写。
// 但后续阶段只允许 L3 承接 Agent 主链状态 / verification / confirmation / artifact。
// L1/L2 保持兼容链，不得反向污染 L3 主链对象。
// ============================================================================

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

/// OpenAI/DeepSeek 兼容：assistant 消息中的 `tool_calls` 数组（元素为 JSON 对象）。
fn build_openai_tool_calls_json(specs: &[(String, String, String)]) -> Vec<serde_json::Value> {
  specs
    .iter()
    .map(|(id, name, args)| {
      serde_json::json!({
          "id": id,
          "type": "function",
          "function": {
              "name": name,
              "arguments": args
          }
      })
    })
    .collect()
}

fn shadow_registry_task_id(tab_id: &str) -> String {
  format!("shadow-tab:{}", tab_id)
}

fn persist_artifact_to_db(
  workspace_path: &std::path::Path,
  task_id: &str,
  kind: &str,
  status: &str,
  summary: &str,
) {
  let artifact_id = format!(
    "{}-{}-{}",
    kind,
    task_id,
    chrono::Utc::now().timestamp_millis()
  );
  let task_id_owned = task_id.to_string();
  let ws = workspace_path.to_path_buf();
  let kind = kind.to_string();
  let status = status.to_string();
  let summary = summary.to_string();
  let artifact_id_clone = artifact_id.clone();
  tokio::spawn(async move {
    if let Ok(db) = crate::workspace::workspace_db::WorkspaceDb::new(&ws) {
      let _ = db.upsert_agent_artifact(
        &artifact_id_clone,
        Some(&task_id_owned),
        &kind,
        &status,
        Some(&summary),
      );
    }
  });
}

fn seed_shadow_artifacts(tab_id: &str, workspace_path: &std::path::Path) {
  let task_id = shadow_registry_task_id(tab_id);
  persist_artifact_to_db(
    workspace_path,
    &task_id,
    "verification",
    "pending",
    "l3_stream_started",
  );
  persist_artifact_to_db(
    workspace_path,
    &task_id,
    "confirmation",
    "pending",
    "awaiting_candidate_or_review",
  );
}

fn mark_shadow_candidate_artifacts(tab_id: &str, workspace_path: &std::path::Path) {
  let task_id = shadow_registry_task_id(tab_id);
  persist_artifact_to_db(
    workspace_path,
    &task_id,
    "verification",
    "passed",
    "candidate_emitted",
  );
  persist_artifact_to_db(
    workspace_path,
    &task_id,
    "confirmation",
    "pending",
    "awaiting_user_review",
  );
}

/// Phase 6: 将 agent task 的 stage 写入 workspace.db 并向前端发送事件。
/// 仅在有真实 task_id（非 shadow-tab:* 代理键）时写入 DB。
fn write_task_stage<R: Runtime>(
  app: &impl Emitter<R>,
  task_id: &str,
  tab_id: &str,
  stage: &str,
  stage_reason: &str,
  workspace_path: &std::path::Path,
) {
  // 仅对真实 task_id 写 DB（过滤掉 shadow 代理键）
  let is_real_task = !task_id.starts_with("shadow-tab:");
  if is_real_task {
    let ws = workspace_path.to_path_buf();
    let tid = task_id.to_string();
    let s = stage.to_string();
    let r = stage_reason.to_string();
    tokio::spawn(async move {
      if let Ok(db) = crate::workspace::workspace_db::WorkspaceDb::new(&ws) {
        let _ = db.update_agent_task_stage(&tid, &s, Some(&r));
      }
    });
  }
  // 发送事件（无论是否真实 task_id，前端都需要感知状态变化）
  let _ = app.emit(
    "ai-agent-stage-changed",
    serde_json::json!({
        "tabId": tab_id,
        "taskId": task_id,
        "stage": stage,
        "stageReason": stage_reason,
    }),
  );
}

fn emit_workflow_execution_runtime<R: Runtime>(
  app: &impl Emitter<R>,
  tab_id: &str,
  task_id: &str,
  runtime: &crate::services::template::WorkflowExecutionRuntime,
) {
  let _ = app.emit(
    "ai-workflow-execution-updated",
    serde_json::json!({
        "tabId": tab_id,
        "taskId": task_id,
        "runtime": runtime,
    }),
  );
}

/// Phase 6: 判断工具结果是否产生了候选（优先读 meta，fallback 到数据字段启发式）
fn tool_results_emit_candidate(
  tool_results: &[(String, String, crate::services::tool_service::ToolResult)],
) -> bool {
  tool_results.iter().any(|(_, name, result)| {
    if !result.success {
      return false;
    }
    // Phase 6: 优先通过 meta.gate.status 判断
    if let Some(ref meta) = result.meta {
      if let Some(ref gate) = meta.gate {
        if gate.status.as_deref() == Some("candidate_ready") {
          return true;
        }
        if gate.status.as_deref() == Some("no_op") {
          return false;
        }
      }
    }
    // Fallback: 旧启发式（向后兼容）
    let Some(data) = result.data.as_ref() else {
      return false;
    };
    if name == "update_file" {
      return data
        .get("pending_diffs")
        .and_then(|v| v.as_array())
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);
    }
    if name == "edit_current_editor_document" {
      let has_diff_area = data
        .get("diff_area_id")
        .map(|v| !v.is_null())
        .unwrap_or(false);
      let has_diffs = data
        .get("diffs")
        .and_then(|v| v.as_array())
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);
      return has_diff_area && has_diffs;
    }
    false
  })
}

/// 单条 `role: "tool"` 消息的 `content`（与原先聚合块中单条工具的格式一致）。
fn emit_ai_chat_stream_done<R: Runtime>(
  app: &impl Emitter<R>,
  tab_id: &str,
  stream_ctx: &StreamContext,
  error: Option<&str>,
) {
  let execution_layer_completed = matches!(
    stream_ctx.state,
    StreamState::Completed | StreamState::Cancelled
  );
  let business_layer_completed = stream_ctx.state == StreamState::Completed && error.is_none();
  let mut v = serde_json::json!({
      "tab_id": tab_id,
      "chunk": "",
      "done": true,
      "stream_state": stream_state_label(stream_ctx.state),
      "completion": {
          "execution_layer_completed": execution_layer_completed,
          "business_layer_completed": business_layer_completed,
      }
  });
  if let Some(e) = error {
    v["error"] = serde_json::Value::String(e.to_string());
  }
  let _ = app.emit("ai-chat-stream", v);
}

/// 强约束：仅当 `state == Completed` 时允许写入 assistant（对话历史），避免取消后仍持久化模型回复。
fn push_chat_message_if_allowed(
  stream_ctx: &StreamContext,
  current_messages: &mut Vec<ChatMessage>,
  msg: ChatMessage,
) {
  if msg.role == "assistant" && stream_ctx.state != StreamState::Completed {
    eprintln!(
      "⚠️ 跳过 assistant 对话历史写入（流状态非 Completed: {:?}）",
      stream_ctx.state
    );
    return;
  }
  current_messages.push(msg);
}

fn is_internal_orchestration_user_message(message: &ChatMessage) -> bool {
  if message.role != "user" {
    return false;
  }

  let content = message.text().trim_start();
  content.starts_with("[NEXT_ACTION]") || content.starts_with("[TOOL_RESULTS]")
}

fn find_last_real_user_message<'a>(messages: &'a [ChatMessage]) -> Option<&'a ChatMessage> {
  messages
    .iter()
    .rev()
    .find(|m| m.role == "user" && !is_internal_orchestration_user_message(m))
}

fn format_single_tool_result_content(
  tool_name: &str,
  tool_result: &crate::services::tool_service::ToolResult,
) -> String {
  if tool_result.success {
    if let Some(data) = &tool_result.data {
      format!(
        "【{}】执行成功，结果数据：\n{}",
        tool_name,
        serde_json::to_string_pretty(data).unwrap_or_default()
      )
    } else if let Some(message) = &tool_result.message {
      format!("【{}】执行成功：{}", tool_name, message)
    } else {
      format!("【{}】执行成功", tool_name)
    }
  } else if let Some(error) = &tool_result.error {
    format!("【{}】执行失败：{}", tool_name, error)
  } else {
    format!("【{}】执行失败", tool_name)
  }
}

fn now_unix_millis() -> u64 {
  match SystemTime::now().duration_since(UNIX_EPOCH) {
    Ok(d) => d.as_millis() as u64,
    Err(_) => 0,
  }
}

fn with_execution_observability(
  mut tool_result: crate::services::tool_service::ToolResult,
  tool_name: &str,
  parsed_arguments: Option<&serde_json::Value>,
  skip_continue: bool,
) -> crate::services::tool_service::ToolResult {
  let mut data_obj = match tool_result.data.take() {
    Some(serde_json::Value::Object(map)) => map,
    Some(other) => {
      let mut map = serde_json::Map::new();
      map.insert("payload".to_string(), other);
      map
    }
    None => serde_json::Map::new(),
  };

  let has_exposure = data_obj.get("execution_exposure").is_some()
    || data_obj
      .get("execution_exposures")
      .and_then(|v| v.as_array())
      .map(|arr| !arr.is_empty())
      .unwrap_or(false);

  if !tool_result.success && !has_exposure {
    let code = data_obj
      .get("error_code")
      .and_then(|v| v.as_str())
      .unwrap_or(crate::services::tool_service::E_REFRESH_FAILED);
    let target_file = data_obj
      .get("file_path")
      .and_then(|v| v.as_str())
      .or_else(|| {
        parsed_arguments
          .and_then(|a| a.get("current_file"))
          .and_then(|v| v.as_str())
      })
      .or_else(|| {
        parsed_arguments
          .and_then(|a| a.get("path"))
          .and_then(|v| v.as_str())
      })
      .unwrap_or("<unknown>");
    let route_source = data_obj
      .get("route_source")
      .and_then(|v| v.as_str())
      .or_else(|| {
        parsed_arguments
          .and_then(|a| a.get("route_source"))
          .and_then(|v| v.as_str())
      });
    let message = tool_result
      .error
      .clone()
      .unwrap_or_else(|| "tool execution failed".to_string());
    let mut exposure = serde_json::json!({
        "exposureId": format!("exp-{}", uuid::Uuid::new_v4()),
        "level": "error",
        "phase": "refresh",
        "code": code,
        "message": message,
        "targetFile": target_file,
        "timestamp": now_unix_millis(),
    });
    if let Some(route) = route_source {
      exposure["routeSource"] = serde_json::json!(route);
    }
    data_obj.insert("error_code".to_string(), serde_json::json!(code));
    data_obj.insert("execution_exposure".to_string(), exposure.clone());
    let mut exposure_list = data_obj
      .get("execution_exposures")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();
    exposure_list.push(exposure);
    data_obj.insert(
      "execution_exposures".to_string(),
      serde_json::Value::Array(exposure_list),
    );
  }

  data_obj.insert(
    "execution_completion".to_string(),
    serde_json::json!({
        "execution_layer_completed": true,
        "business_layer_completed": false,
        "policy": if skip_continue { "skip_and_continue" } else { "normal" },
        "skip_continue": skip_continue,
        "tool_name": tool_name,
    }),
  );
  tool_result.data = Some(serde_json::Value::Object(data_obj));
  tool_result
}

// 注意：analyze_task_progress 函数已废弃，统一使用 TaskProgressAnalyzer::analyze
// 这样可以避免重复控制逻辑，确保新的优化能够全面生效

// AI 服务状态（全局单例）
type AIServiceState = Arc<Mutex<AIService>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatBuildOutlineStepPayload {
  pub id: String,
  pub name: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatBuildOutlinePayload {
  pub title: String,
  pub goal: String,
  pub summary: String,
  pub steps: Vec<ChatBuildOutlineStepPayload>,
}

fn chat_build_provider_name(model: &str) -> &'static str {
  if model.contains("deepseek") {
    "deepseek"
  } else if model.contains("gpt") {
    "openai"
  } else {
    "deepseek"
  }
}

fn extract_json_object_block(text: &str) -> Option<&str> {
  let trimmed = text.trim();
  let fenced = trimmed
    .strip_prefix("```json")
    .or_else(|| trimmed.strip_prefix("```"))
    .unwrap_or(trimmed)
    .trim();
  let fenced = fenced.strip_suffix("```").unwrap_or(fenced).trim();
  let start = fenced.find('{')?;
  let end = fenced.rfind('}')?;
  if end < start {
    return None;
  }
  Some(&fenced[start..=end])
}

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

// ============================================================================
// L1：辅助续写兼容入口
// ============================================================================
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
) -> Result<Option<Vec<String>>, String> {
  // 尝试获取已配置的提供商（优先 DeepSeek，然后是 OpenAI）
  let provider = {
    let service_guard = service
      .lock()
      .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
    // 优先使用 DeepSeek，如果没有则使用 OpenAI
    service_guard
      .get_provider("deepseek")
      .or_else(|| service_guard.get_provider("openai"))
  };

  let provider = provider
    .ok_or_else(|| "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string())?;

  // 转换编辑器状态和记忆库项为 provider 类型
  let editor_state_provider =
    editor_state
      .as_ref()
      .map(|e| crate::services::ai_providers::EditorState {
        node_type: e.node_type.clone(),
        heading_level: e.heading_level,
        list_type: e.list_type.clone(),
        list_level: e.list_level,
        block_type: e.block_type.clone(),
      });

  let memory_items_provider: Vec<crate::services::ai_providers::MemoryItem> = memory_items
    .as_ref()
    .map(|items| {
      items
        .iter()
        .map(|m| crate::services::ai_providers::MemoryItem {
          id: m.id.clone(),
          entity_name: m.entity_name.clone(),
          content: m.content.clone(),
          entity_type: m.entity_type.clone(),
        })
        .collect()
    })
    .unwrap_or_default();

  // 转换文档概览为 provider 类型
  let document_overview_provider =
    document_overview
      .as_ref()
      .map(|o| crate::services::ai_providers::DocumentOverview {
        document_start: o.document_start.clone(),
        document_end: o.document_end.clone(),
        document_structure: o.document_structure.clone(),
        document_length: o.document_length,
        current_section: o.current_section.clone(),
        previous_paragraph: o.previous_paragraph.clone(),
        next_paragraph: o.next_paragraph.clone(),
      });

  // 调用自动补全（使用增强的提示词）
  // Phase 1a：解析 3 条建议（用 --- 分隔），返回 Vec<String>
  match provider
    .autocomplete_enhanced(
      &context_before,
      context_after.as_deref(),
      editor_state_provider.as_ref(),
      if memory_items_provider.is_empty() {
        None
      } else {
        Some(&memory_items_provider[..])
      },
      document_format.as_deref().unwrap_or("txt"),
      document_overview_provider.as_ref(),
      max_length,
    )
    .await
  {
    Ok(result) => {
      let suggestions: Vec<String> = result
        .split("---")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .take(3)
        .collect();
      eprintln!(
        "✅ [ai_autocomplete] 成功返回，{} 条建议",
        suggestions.len()
      );
      Ok(if suggestions.is_empty() {
        None
      } else {
        Some(suggestions)
      })
    }
    Err(e) => {
      eprintln!("❌ [ai_autocomplete] 错误: {}", e);
      Err(e.to_string())
    }
  }
}

/// Phase 0.4：Inline Assist 历史消息
#[derive(serde::Deserialize)]
pub struct InlineAssistMessage {
  role: String,
  text: String,
}

// ============================================================================
// L2：局部修改兼容入口
// ============================================================================
#[tauri::command]
pub async fn ai_inline_assist(
  instruction: String,
  text: String,
  context: String,
  messages: Option<Vec<InlineAssistMessage>>,
  service: State<'_, AIServiceState>,
) -> Result<String, String> {
  // 记录请求用于调试（不打印完整正文，避免泄露内容）
  let messages_len = messages.as_ref().map(|m| m.len()).unwrap_or(0);
  eprintln!(
        "📥 [ai_inline_assist] 收到请求: instruction_len={} text_len={} context_len={} messages_count={}",
        instruction.chars().count(),
        text.chars().count(),
        context.chars().count(),
        messages_len,
    );

  // Phase 0.4：将历史 messages 拼接到 context 前
  let context_with_history = if let Some(ref msgs) = messages {
    if msgs.is_empty() {
      context.clone()
    } else {
      let history: String = msgs
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| format!("{}: {}", m.role, m.text))
        .collect::<Vec<_>>()
        .join("\n");
      format!("【历史对话】\n{}\n\n{}", history, context)
    }
  } else {
    context
  };

  // 尝试获取已配置的提供商（优先 DeepSeek，然后是 OpenAI）
  let provider = {
    let service_guard = service
      .lock()
      .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
    // 优先使用 DeepSeek，如果没有则使用 OpenAI
    service_guard
      .get_provider("deepseek")
      .or_else(|| service_guard.get_provider("openai"))
  };

  let provider = provider
    .ok_or_else(|| "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string())?;

  // 调用 Inline Assist（使用含历史对话的 context）
  match provider
    .inline_assist(&instruction, &text, &context_with_history)
    .await
  {
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

/// 前端引用协议（设计文档 6.1）
/// edit_target 必须为 Option，非 Text 类型引用无此字段，反序列化时避免 panic
#[derive(Debug, Deserialize)]
pub struct ReferenceFromFrontend {
  #[serde(rename = "type")]
  reference_type: String,
  source: String,
  content: String,
  #[serde(rename = "knowledgeBaseId")]
  knowledge_base_id: Option<String>,
  #[serde(rename = "knowledgeEntryId")]
  knowledge_entry_id: Option<String>,
  #[serde(rename = "knowledgeDocumentId")]
  knowledge_document_id: Option<String>,
  #[serde(rename = "knowledgeCitationKey")]
  knowledge_citation_key: Option<String>,
  #[serde(rename = "knowledgeRetrievalMode")]
  _knowledge_retrieval_mode: Option<String>,
  #[serde(rename = "textReference")]
  text_reference: Option<TextReferenceInfo>,
  #[serde(rename = "editTarget")]
  edit_target: Option<EditTargetInfo>,
  #[serde(rename = "templateType")]
  _template_type: Option<WorkflowTemplateReferenceType>,
}

/// TMP-P0 冻结：前端模板引用协议只允许 workflow。
/// 不允许 document / skill / prompt template 借壳回流到执行主链。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum WorkflowTemplateReferenceType {
  Workflow,
}

#[derive(Debug, Deserialize, Clone)]
struct TextReferenceInfo {
  #[serde(rename = "startBlockId")]
  start_block_id: String,
  #[serde(rename = "startOffset")]
  start_offset: u32,
  #[serde(rename = "endBlockId")]
  end_block_id: String,
  #[serde(rename = "endOffset")]
  end_offset: u32,
}

#[derive(Debug, Deserialize, Clone)]
struct EditTargetInfo {
  #[serde(rename = "blockId")]
  block_id: String,
  #[serde(rename = "startOffset")]
  start_offset: u32,
  #[serde(rename = "endOffset")]
  end_offset: u32,
}

#[derive(Debug, Clone)]
struct ReferenceAnchorSelection {
  start_block_id: String,
  start_offset: usize,
  end_block_id: String,
  end_offset: usize,
  source: String,
}

#[derive(Debug, Default, Clone)]
struct ExplicitKnowledgeSuppression {
  has_explicit_reference: bool,
  granular_reference_count: usize,
  entry_ids: HashSet<String>,
  document_ids: HashSet<String>,
  citation_keys: HashSet<String>,
}

fn normalize_path_for_reference_compare(raw: &str, workspace: &std::path::Path) -> String {
  let raw_norm = raw.replace('\\', "/");
  let as_path = std::path::PathBuf::from(&raw_norm);
  let rel = as_path
    .strip_prefix(workspace)
    .map(|p| p.to_string_lossy().replace('\\', "/"))
    .unwrap_or(raw_norm);
  rel.trim_start_matches('/').to_string()
}

fn same_source_file_for_reference(
  source: &str,
  current_file: &Option<String>,
  workspace: &std::path::Path,
) -> bool {
  let Some(current) = current_file.as_ref() else {
    return true;
  };
  let source_norm = normalize_path_for_reference_compare(source, workspace);
  let current_norm = normalize_path_for_reference_compare(current, workspace);
  source_norm == current_norm
    || source_norm.ends_with(&current_norm)
    || current_norm.ends_with(&source_norm)
}

fn extract_reference_anchor_for_zero_search(
  refs: Option<&Vec<ReferenceFromFrontend>>,
  current_file: &Option<String>,
  workspace: &std::path::Path,
) -> Option<ReferenceAnchorSelection> {
  let refs = refs?;
  for r in refs {
    if r.reference_type != "text" {
      continue;
    }
    if !same_source_file_for_reference(&r.source, current_file, workspace) {
      continue;
    }
    if let Some(tr) = &r.text_reference {
      return Some(ReferenceAnchorSelection {
        start_block_id: tr.start_block_id.clone(),
        start_offset: tr.start_offset as usize,
        end_block_id: tr.end_block_id.clone(),
        end_offset: tr.end_offset as usize,
        source: r.source.clone(),
      });
    }
    if let Some(et) = &r.edit_target {
      // 兼容旧字段：单块定位
      return Some(ReferenceAnchorSelection {
        start_block_id: et.block_id.clone(),
        start_offset: et.start_offset as usize,
        end_block_id: et.block_id.clone(),
        end_offset: et.end_offset as usize,
        source: r.source.clone(),
      });
    }
  }
  None
}

fn extract_explicit_knowledge_suppression(
  refs: Option<&Vec<ReferenceFromFrontend>>,
) -> ExplicitKnowledgeSuppression {
  let Some(refs) = refs else {
    return ExplicitKnowledgeSuppression::default();
  };

  let mut suppression = ExplicitKnowledgeSuppression::default();
  for reference in refs {
    if reference.reference_type != "kb" {
      continue;
    }
    suppression.has_explicit_reference = true;
    if let Some(entry_id) = reference
      .knowledge_entry_id
      .as_ref()
      .filter(|value| !value.is_empty())
    {
      suppression.granular_reference_count += 1;
      suppression.entry_ids.insert(entry_id.clone());
    }
    if let Some(document_id) = reference
      .knowledge_document_id
      .as_ref()
      .filter(|value| !value.is_empty())
    {
      suppression.granular_reference_count += 1;
      suppression.document_ids.insert(document_id.clone());
    }
    if let Some(citation_key) = reference
      .knowledge_citation_key
      .as_ref()
      .filter(|value| !value.is_empty())
    {
      suppression.granular_reference_count += 1;
      suppression.citation_keys.insert(citation_key.clone());
    }
  }

  suppression
}

/// 当用户显式 primary_edit_target（工作区相对路径）与当前编辑器文件不一致时，禁止注入当前编辑器内容，避免改错文件。
/// §十三：仅参数契约含编辑器 L/revision 快照的工具在分发前走 IPC 重采（显式白名单扩展）
fn tool_call_needs_editor_snapshot_ipc(tool_name: &str) -> bool {
  matches!(tool_name, "edit_current_editor_document")
}

async fn merge_editor_snapshot_ipc_for_tool(
  app: &tauri::AppHandle,
  tool_name: &str,
  current_file_for_ipc: Option<String>,
  parsed_arguments: &mut serde_json::Value,
) {
  if !tool_call_needs_editor_snapshot_ipc(tool_name) {
    return;
  }
  if let serde_json::Value::Object(ref mut map) = parsed_arguments {
    if let Some(snap) = crate::commands::positioning_snapshot::request_editor_snapshot_ipc(
      app,
      current_file_for_ipc,
      3000,
    )
    .await
    {
      crate::commands::positioning_snapshot::merge_editor_snapshot_into_arguments(map, snap);
    }
  }
}

fn should_skip_edit_current_editor_injection(
  primary_edit_target: &Option<String>,
  current_file: &Option<String>,
  workspace: &std::path::Path,
) -> bool {
  let Some(primary_raw) = primary_edit_target.as_ref() else {
    return false;
  };
  let Some(current_raw) = current_file.as_ref() else {
    return false;
  };
  let primary_norm = primary_raw
    .replace('\\', "/")
    .trim_start_matches('/')
    .to_string();
  if primary_norm.is_empty() {
    return false;
  }
  let current_path = std::path::PathBuf::from(current_raw);
  let current_norm = current_path
    .strip_prefix(workspace)
    .map(|p| p.to_string_lossy().replace('\\', "/"))
    .unwrap_or_else(|_| current_raw.replace('\\', "/"));
  let current_trim = current_norm.trim_start_matches('/').to_string();
  if current_trim.is_empty() {
    return false;
  }
  primary_norm != current_trim
}

fn is_edit_tool_model_protocol_field(key: &str) -> bool {
  matches!(
    key,
    "edit_mode" | "block_index" | "target" | "content" | "occurrence_index"
  )
}

/// 协议白名单固化：
/// - 保留模型协议字段
/// - 丢弃其他未知字段，避免协议漂移
fn sanitize_edit_current_editor_document_arguments(arguments: &mut serde_json::Value) {
  let Some(map) = arguments.as_object_mut() else {
    *arguments = serde_json::json!({});
    return;
  };

  let keys: Vec<String> = map.keys().cloned().collect();
  let mut removed: Vec<String> = Vec::new();
  for key in keys {
    let keep = is_edit_tool_model_protocol_field(&key);
    if !keep {
      map.remove(&key);
      removed.push(key);
    }
  }
  if !removed.is_empty() {
    eprintln!(
      "🧹 [edit_current_editor_document] dropped non-whitelisted fields: {:?}",
      removed
    );
  }
}

fn frontend_ref_to_reference_info(r: &ReferenceFromFrontend) -> Option<ReferenceInfo> {
  let ref_type = match r.reference_type.as_str() {
    "text" => ReferenceType::Text,
    "file" => ReferenceType::File,
    "folder" => ReferenceType::Folder,
    "image" => ReferenceType::Image,
    "table" => ReferenceType::Table,
    "memory" => ReferenceType::Memory,
    "link" => ReferenceType::Link,
    "chat" => ReferenceType::Chat,
    "kb" => ReferenceType::KnowledgeBase,
    // TMP-P3: template 引用不允许直接降级为普通 reference。
    // 必须先走 RuntimeWorkflowPlan 门禁，再以编译后引用内容重新注入。
    "template" => return None,
    _ => return None,
  };
  Some(ReferenceInfo {
    ref_type,
    source: r.source.clone(),
    content: r.content.clone(),
  })
}

fn extract_template_reference_ids(refs: Option<&Vec<ReferenceFromFrontend>>) -> Vec<String> {
  refs
    .map(|items| {
      items
        .iter()
        .filter(|item| item.reference_type == "template")
        .map(|item| item.source.clone())
        .filter(|item| !item.trim().is_empty())
        .collect()
    })
    .unwrap_or_default()
}

fn build_runtime_execution_reference_content(
  template_id: &str,
  runtime: &crate::services::template::WorkflowExecutionRuntime,
) -> String {
  let plan = &runtime.runtime_plan;
  let mut lines = vec![
    "[Compiled Workflow Execution Contract]".to_string(),
    format!("template_id: {}", template_id),
    format!("task_id: {}", plan.task_id),
    format!("execution_stage: {:?}", runtime.execution_state.stage).to_lowercase(),
    format!(
      "waiting_for_user: {}",
      runtime.execution_state.waiting_for_user
    ),
    format!("total_steps: {}", plan.total_steps),
    format!("current_step_index: {}", plan.current_step_index),
  ];

  if let Some(current_step) = plan.steps.get(plan.current_step_index) {
    lines.push(format!("current_phase: {}", current_step.phase_name));
    lines.push(format!("current_step: {}", current_step.name));
    lines.push(format!(
      "current_step_input: {}",
      if current_step.input.is_empty() {
        "-".to_string()
      } else {
        current_step.input.join(", ")
      }
    ));
    lines.push(format!(
      "current_step_output: {}",
      if current_step.output.is_empty() {
        "-".to_string()
      } else {
        current_step.output.join(", ")
      }
    ));
    lines.push(format!(
      "current_step_constraint: {}",
      if current_step.constraint.is_empty() {
        "-".to_string()
      } else {
        current_step.constraint.join(", ")
      }
    ));
  }

  if let Some(next_step) = plan.steps.get(plan.current_step_index + 1) {
    lines.push(format!("next_step: {}", next_step.name));
    lines.push(format!("next_phase: {}", next_step.phase_name));
  } else {
    lines.push("next_step: workflow_complete_after_current_step".to_string());
  }

  let completed = runtime
    .step_states
    .iter()
    .filter(|item| {
      matches!(
        item.status,
        crate::services::template::types::StepExecutionStatus::Completed
      )
    })
    .count();
  lines.push(format!("completed_steps: {}", completed));

  if !runtime.runtime_diagnostics.is_empty() {
    lines.push("runtime_diagnostics:".to_string());
    for diagnostic in &runtime.runtime_diagnostics {
      lines.push(format!(
        "- [{}] {} | phase={} | step={} | message={}",
        match diagnostic.kind {
          crate::services::template::types::WorkflowDiagnosticKind::Fatal => "fatal",
          crate::services::template::types::WorkflowDiagnosticKind::Recoverable => "recoverable",
          crate::services::template::types::WorkflowDiagnosticKind::Runtime => "runtime",
        },
        diagnostic.code,
        diagnostic.phase_name.as_deref().unwrap_or("-"),
        diagnostic.step_name.as_deref().unwrap_or("-"),
        diagnostic.message
      ));
    }
  }

  lines.push("steps:".to_string());
  for step in &plan.steps {
    lines.push(format!(
      "{}. [{}] {} | input: {} | output: {} | constraint: {}",
      step.step_index + 1,
      step.phase_name,
      step.name,
      if step.input.is_empty() {
        "-".to_string()
      } else {
        step.input.join(", ")
      },
      if step.output.is_empty() {
        "-".to_string()
      } else {
        step.output.join(", ")
      },
      if step.constraint.is_empty() {
        "-".to_string()
      } else {
        step.constraint.join(", ")
      },
    ));
  }

  lines.join("\n")
}

/// 为当前 Agent/Template Runtime 注入工作流过程约束。
///
/// 这不是独立构建模式执行链；只是将运行时工作流摘要追加到当前对话上下文。
fn build_runtime_workflow_constraint_content(
  template_id: &str,
  runtime: &crate::services::template::WorkflowExecutionRuntime,
) -> String {
  let current_step = runtime
    .runtime_plan
    .steps
    .get(runtime.execution_state.current_step_index);
  let mut lines = vec![
    "[Runtime Workflow Constraint]".to_string(),
    format!("template_id: {}", template_id),
    format!("task_id: {}", runtime.context.task_id),
  ];
  if let Some(step) = current_step {
    lines.push(format!("current_phase: {}", step.phase_name));
    lines.push(format!("current_step: {}", step.name));
    lines.push(format!(
      "current_constraint: {}",
      if step.constraint.is_empty() {
        "-".to_string()
      } else {
        step.constraint.join(", ")
      }
    ));
  }
  lines.push(
        "workflow_rule: consume this workflow payload only as process constraint input; do not treat it as an executable script."
            .to_string(),
    );
  lines.join("\n")
}

fn maybe_sync_workflow_execution_from_tool_result<R: Runtime>(
  app: &impl Emitter<R>,
  tab_id: &str,
  task_id: &str,
  workspace_path: &std::path::Path,
  tool_name: &str,
  tool_result: &crate::services::tool_service::ToolResult,
) {
  if task_id.starts_with("shadow-tab:") {
    return;
  }

  let service = TemplateService::new();
  if service
    .get_workflow_execution_runtime(workspace_path, task_id)
    .is_err()
  {
    return;
  }

  let detail = if tool_result.success {
    tool_result
      .message
      .as_deref()
      .filter(|value| !value.trim().is_empty())
  } else {
    tool_result
      .display_error
      .as_deref()
      .or(tool_result.error.as_deref())
      .filter(|value| !value.trim().is_empty())
  };

  match service.apply_tool_execution_feedback(
    workspace_path,
    task_id,
    tool_name,
    tool_result.success,
    detail,
  ) {
    Ok(runtime) => emit_workflow_execution_runtime(app, tab_id, task_id, &runtime),
    Err(error) => {
      eprintln!(
        "⚠️ workflow execution feedback sync failed: task_id={} tool={} error={}",
        task_id, tool_name, error
      );
    }
  }
}

fn maybe_build_runtime_workflow_constraint(
  workspace_path: &std::path::Path,
  task_id: &str,
) -> Option<String> {
  if task_id.starts_with("shadow-tab:") {
    return None;
  }
  let service = TemplateService::new();
  let runtime = service
    .get_workflow_execution_runtime(workspace_path, task_id)
    .ok()?;
  Some(build_runtime_workflow_constraint_content(
    &runtime.context.template_id,
    &runtime,
  ))
}

fn maybe_build_runtime_execution_directive(
  workspace_path: &std::path::Path,
  task_id: &str,
) -> Option<String> {
  if task_id.starts_with("shadow-tab:") {
    return None;
  }
  let service = TemplateService::new();
  let runtime = service
    .get_workflow_execution_runtime(workspace_path, task_id)
    .ok()?;
  Some(build_runtime_execution_reference_content(
    &runtime.context.template_id,
    &runtime,
  ))
}

// ============================================================================
// L3：Binder Agent 主链入口
// Phase 1 起，后续状态 / verification / confirmation / artifact 只允许从这里进入主链。
// ============================================================================
#[tauri::command]
pub async fn ai_chat_stream(
  tab_id: String, // 注意：前端发送的是 tabId (camelCase)，Tauri 会自动转换为 tab_id (snake_case)
  messages: Vec<ChatMessage>,
  model_config: ModelConfig,
  enable_tools: Option<bool>, // 是否启用工具调用（Agent 模式为 true，Chat 模式为 false）
  workspace_path: Option<String>, // 绑定工作区路径（优先于 watcher 全局路径）
  current_file: Option<String>, // 当前打开的文档路径（第二层上下文）
  selected_text: Option<String>, // 当前选中的文本（第二层上下文）
  current_editor_content: Option<String>, // 当前编辑器内容（用于文档编辑功能）
  references: Option<Vec<ReferenceFromFrontend>>, // Phase 0：前端引用协议
  primary_edit_target: Option<String>, // 工作区相对路径：与 current_file 不一致时不注入编辑器内容
  document_revision: Option<u64>, // 前端文档版本戳，注入工具参数并回显于 diff 结果（§2.1.1）
  baseline_id: Option<String>, // 前端 RequestContext.baselineId（透传到工具参数）
  // §十三：前端编辑器 tab id，仅日志/可观测；不参与 Rust 注入逻辑
  editor_tab_id: Option<String>,
  // §7.1：选区完整坐标（前端选区场景）
  selection_start_block_id: Option<String>,
  selection_start_offset: Option<usize>,
  selection_end_block_id: Option<String>,
  selection_end_offset: Option<usize>,
  // §7.1：光标所在块（无选区场景）
  cursor_block_id: Option<String>,
  cursor_offset: Option<usize>,
  // Phase 6: 前端 shadow task ID，用于 stage 写入与事件推送
  agent_task_id: Option<String>,
  app: tauri::AppHandle,
  service: State<'_, AIServiceState>,
  watcher: State<'_, Mutex<FileWatcherService>>,
) -> Result<(), String> {
  // ⚠️ 关键修复：记录 tab_id 以便调试
  eprintln!(
    "📥 收到流式聊天请求: tab_id={}, messages_count={}",
    tab_id,
    messages.len()
  );
  if let Some(ref eid) = editor_tab_id {
    eprintln!(
      "📎 RequestContext editor_tab_id={} (frontend positioning bucket)",
      eid
    );
  }
  if let Some(ref bid) = baseline_id {
    eprintln!("📎 RequestContext baseline_id={}", bid);
  }
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
    let service_guard = service
      .lock()
      .map_err(|e| format!("获取 AI 服务失败: {}", e))?;

    // 优先使用选择的提供商
    if let Some(p) = service_guard.get_provider(provider_name) {
      Some((p, provider_name))
    } else if provider_name == "deepseek" {
      // 如果没有 DeepSeek，尝试 OpenAI
      service_guard.get_provider("openai").map(|p| (p, "openai"))
    } else {
      // 如果没有 OpenAI，尝试 DeepSeek
      service_guard
        .get_provider("deepseek")
        .map(|p| (p, "deepseek"))
    }
  };

  let (provider, _actual_provider_name) =
    provider.ok_or_else(|| format!("未配置 {} 提供商，请先配置 API key", provider_name))?;

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

  // 获取工作区路径（优先使用前端 tab 绑定路径，避免跨工作区污染）
  let workspace_path: PathBuf = if let Some(ws) = workspace_path.filter(|w| !w.trim().is_empty()) {
    PathBuf::from(ws)
  } else {
    let watcher_guard = watcher.lock().unwrap();
    watcher_guard
      .get_workspace_path()
      .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
  };

  // 使用 ContextManager 统一构建多层提示词（方案A）
  let context_manager = ContextManager::new(model_config.max_tokens);

  // Phase 0：从前端 references 构建引用列表（设计文档为准）
  let mut final_references: Vec<ReferenceInfo> = if let Some(ref refs) = references {
    refs
      .iter()
      .filter_map(|r| frontend_ref_to_reference_info(r))
      .collect()
  } else {
    Vec::new()
  };
  let mut active_workflow_template_task: Option<(String, String)> = None;

  let template_reference_ids = extract_template_reference_ids(references.as_ref());
  if !template_reference_ids.is_empty() {
    if template_reference_ids.len() > 1 {
      return Err("当前阶段仅支持单个工作流模板引用进入执行链".to_string());
    }

    let task_id = agent_task_id.clone().ok_or_else(|| {
      "模板任务缺少 agent_task_id，不能绕过 RuntimeWorkflowPlan 直接执行".to_string()
    })?;
    let template_id = template_reference_ids[0].clone();
    let template_service = TemplateService::new();
    let _runtime_plan =
      template_service.create_runtime_workflow_plan(&workspace_path, &template_id, &task_id)?;
    let workflow_runtime =
      template_service.get_workflow_execution_runtime(&workspace_path, &task_id)?;
    write_task_stage(
      &app,
      &task_id,
      &tab_id,
      "structured",
      "runtime_workflow_plan_bound",
      &workspace_path,
    );
    persist_artifact_to_db(
      &workspace_path,
      &task_id,
      "plan",
      "active",
      &format!("workflow_template_bound:{}:step_1_ready", template_id),
    );
    emit_workflow_execution_runtime(&app, &tab_id, &task_id, &workflow_runtime);
    active_workflow_template_task = Some((template_id.clone(), task_id.clone()));
  }

  // 若前端 references 为空，仅将 current_file 作为引用；若非空，补充 current_file（不重复）
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
    let already_referenced = final_references.iter().any(|r| {
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
        content: String::new(),          // 当前文件内容会在需要时通过工具读取，这里留空
      });
    }
  }

  // 12.5：无显式选区时，TextReference 四元组作为一级定位输入（reference 零搜索）
  let mut effective_selection_start_block_id = selection_start_block_id.clone();
  let mut effective_selection_start_offset = selection_start_offset;
  let mut effective_selection_end_block_id = selection_end_block_id.clone();
  let mut effective_selection_end_offset = selection_end_offset;
  let mut effective_selected_text = selected_text.clone();
  let mut selection_source = "selection";
  let need_reference_fallback = effective_selection_start_block_id.is_none()
    || effective_selection_start_offset.is_none()
    || effective_selection_end_block_id.is_none()
    || effective_selection_end_offset.is_none();
  if need_reference_fallback {
    if let Some(anchor) =
      extract_reference_anchor_for_zero_search(references.as_ref(), &current_file, &workspace_path)
    {
      effective_selection_start_block_id = Some(anchor.start_block_id);
      effective_selection_start_offset = Some(anchor.start_offset);
      effective_selection_end_block_id = Some(anchor.end_block_id);
      effective_selection_end_offset = Some(anchor.end_offset);
      // 关键：reference 路径强制不注入 _sel_text，Resolver 才会稳定输出 route_source=reference
      effective_selected_text = None;
      selection_source = "reference";
      eprintln!(
        "📎 使用 TextReference 四元组回填零搜索坐标: source={} start=({:?}:{:?}) end=({:?}:{:?})",
        anchor.source,
        effective_selection_start_block_id,
        effective_selection_start_offset,
        effective_selection_end_block_id,
        effective_selection_end_offset
      );
    }
  }
  // 后续流程统一使用“有效选区”变量（显式选区优先，其次引用四元组）
  let selected_text = effective_selected_text;
  let selection_start_block_id = effective_selection_start_block_id;
  let selection_start_offset = effective_selection_start_offset;
  let selection_end_block_id = effective_selection_end_block_id;
  let selection_end_offset = effective_selection_end_offset;
  eprintln!("📌 zero-search selection source={}", selection_source);

  // §7.1：先 clone 选区坐标，再移入 context_info（clone 供后续 spawn 闭包使用）
  let selection_start_block_id_for_spawn = selection_start_block_id.clone();
  let selection_end_block_id_for_spawn = selection_end_block_id.clone();
  let selection_start_offset_for_spawn = selection_start_offset;
  let selection_end_offset_for_spawn = selection_end_offset;
  let cursor_block_id_for_spawn = cursor_block_id.clone();
  let cursor_offset_for_spawn = cursor_offset;

  // 读取当前 chat tab 的 agent task 状态摘要
  let (agent_task_summary, agent_artifacts_summary): (Option<String>, Option<String>) = {
    let db_opt = crate::workspace::workspace_db::WorkspaceDb::new(&workspace_path).ok();
    let tasks = db_opt
      .as_ref()
      .and_then(|db| db.get_agent_tasks_by_chat_tab(&tab_id).ok())
      .unwrap_or_default();

    let task_summary = if tasks.is_empty() {
      None
    } else {
      let lines: Vec<String> = tasks
        .iter()
        .take(3)
        .map(|t| {
          format!(
            "- Task [{}]: goal=\"{}\", lifecycle={}, stage={}, reason={}",
            &t.id[..8.min(t.id.len())],
            t.goal.chars().take(80).collect::<String>(),
            t.lifecycle,
            t.stage,
            t.stage_reason.as_deref().unwrap_or("none"),
          )
        })
        .collect();
      Some(lines.join("\n"))
    };

    // Phase 7: 读取最近活跃任务的 artifacts 摘要
    let artifacts_summary = tasks
      .first()
      .and_then(|active_task| {
        db_opt
          .as_ref()?
          .get_agent_artifacts_by_task(&active_task.id)
          .ok()
      })
      .and_then(|artifacts| {
        if artifacts.is_empty() {
          return None;
        }
        let lines: Vec<String> = artifacts
          .iter()
          .take(5)
          .map(|a| {
            format!(
              "- [{}] kind={} status={} summary={}",
              &a.id[..8.min(a.id.len())],
              a.kind,
              a.status,
              a.summary.as_deref().unwrap_or("—"),
            )
          })
          .collect();
        Some(lines.join("\n"))
      });

    (task_summary, artifacts_summary)
  };

  // ── L6 augmentation：记忆库检索（gating + search + format）──────────────
  let last_user_message = messages
    .iter()
    .rev()
    .find(|m| m.role == "user")
    .and_then(|m| m.content.clone())
    .unwrap_or_default();

  // ExtractionConfig: load once for this request (reads env vars)
  let extraction_cfg = crate::services::memory_service::ExtractionConfig::load();

  // S-01: collect memory IDs already explicitly @-referenced by user (to deduplicate auto-injection)
  let explicitly_referenced_memory_ids: std::collections::HashSet<String> = final_references
    .iter()
    .filter(|r| matches!(r.ref_type, ReferenceType::Memory))
    .map(|r| r.source.clone())
    .collect();

  let memory_context: Option<String> = if extraction_cfg.enabled
    && extraction_cfg.inject_enabled
    && last_user_message.chars().count() >= 5
  {
    let ws_str = workspace_path.to_string_lossy().to_string();
    match MemoryService::new(&workspace_path) {
      Ok(svc) => {
        let params = SearchMemoriesParams {
          query: build_memory_query(
            &last_user_message,
            current_file.as_deref(),
            selected_text.as_deref(),
          ),
          tab_id: Some(tab_id.clone()),
          workspace_path: Some(ws_str),
          scope: MemorySearchScope::All,
          limit: Some(10),
          entity_types: None,
        };
        match svc.search_memories(params).await {
          Ok(resp) if !resp.items.is_empty() => {
            // S-01: exclude items already in user's explicit @-references
            let items_to_inject: Vec<_> = resp
              .items
              .iter()
              .filter(|r| !explicitly_referenced_memory_ids.contains(&r.item.id))
              .cloned()
              .collect();
            if items_to_inject.is_empty() {
              eprintln!(
                "[memory] S-01: all items already explicitly referenced, skipping injection"
              );
              // still log usage for all retrieved items
              let ids: Vec<String> = resp.items.iter().map(|r| r.item.id.clone()).collect();
              let tab_id_log = tab_id.clone();
              tokio::spawn(async move {
                if let Err(e) = svc.record_memory_usage(&ids, &tab_id_log).await {
                  eprintln!("[memory] usage log failed: {:?}", e);
                }
              });
              None
            } else {
              let formatted = format_memory_for_injection(&items_to_inject);
              eprintln!(
                "[memory] MEMORY_INJECT_SUCCESS: injecting {} items (of {} retrieved)",
                items_to_inject.len(),
                resp.items.len()
              );
              // fire-and-forget usage log for all retrieved items
              let ids: Vec<String> = resp.items.iter().map(|r| r.item.id.clone()).collect();
              let tab_id_log = tab_id.clone();
              tokio::spawn(async move {
                if let Err(e) = svc.record_memory_usage(&ids, &tab_id_log).await {
                  eprintln!("[memory] usage log failed: {:?}", e);
                }
              });
              Some(formatted)
            } // end S-01 else
          }
          Ok(_) => None,
          Err(e) => {
            eprintln!("[memory] inject fallback: {:?}", e);
            None
          }
        }
      }
      Err(_) => None, // workspace.db 不存在时静默降级
    }
  } else {
    // memory search skipped: msg too short
    None
  };

  let explicit_knowledge_suppression = extract_explicit_knowledge_suppression(references.as_ref());

  let knowledge_probe_context = ContextInfo {
    current_file: current_file.clone(),
    selected_text: selected_text.clone(),
    workspace_path: workspace_path.clone(),
    editor_state: ContextEditorState {
      is_editable: true,
      file_type: current_file.as_ref().and_then(|f| {
        std::path::Path::new(f)
          .extension()
          .and_then(|ext| ext.to_str())
          .map(|s| s.to_string())
      }),
      file_size: None,
      is_saved: true,
    },
    references: final_references.clone(),
    current_content: current_editor_content.clone(),
    edit_target_present: selection_start_block_id_for_spawn.is_some(),
    selection_start_block_id: selection_start_block_id.clone(),
    selection_start_offset,
    selection_end_block_id: selection_end_block_id.clone(),
    selection_end_offset,
    cursor_block_id: cursor_block_id.clone(),
    cursor_offset,
    baseline_id: baseline_id.clone(),
    document_revision,
    user_message: last_user_message.clone(),
    agent_task_summary: agent_task_summary.clone(),
    agent_artifacts_summary: agent_artifacts_summary.clone(),
    memory_context: memory_context.clone(),
    knowledge_injection_slices: Vec::new(),
  };

  let knowledge_policy_summary = match tokio::task::spawn_blocking({
        let workspace_for_policy = workspace_path.clone();
        move || -> Result<crate::services::knowledge::repository::AutomaticRetrievalPolicySummary, String> {
            let service = KnowledgeService::new(&workspace_for_policy)?;
            service
                .automatic_retrieval_policy_summary()
                .map_err(|error| error.to_string())
        }
    })
    .await
    {
        Ok(Ok(summary)) => summary,
        Ok(Err(error)) => {
            eprintln!("[knowledge] retrieval policy summary failed: {}", error);
            crate::services::knowledge::repository::AutomaticRetrievalPolicySummary {
                active_entry_count: 0,
                policy_allowed_entry_count: 1,
                automatic_entry_count: 1,
            }
        }
        Err(join_error) => {
            eprintln!("[knowledge] retrieval policy summary join failed: {}", join_error);
            crate::services::knowledge::repository::AutomaticRetrievalPolicySummary {
                active_entry_count: 0,
                policy_allowed_entry_count: 1,
                automatic_entry_count: 1,
            }
        }
    };

  let knowledge_retrieval_context = KnowledgeRetrievalContext {
    explicit_reference_count: usize::from(explicit_knowledge_suppression.has_explicit_reference),
    granular_explicit_reference_count: explicit_knowledge_suppression.granular_reference_count,
    automatic_candidate_count: knowledge_policy_summary.automatic_entry_count,
    automatic_policy_blocked: knowledge_policy_summary.active_entry_count > 0
      && knowledge_policy_summary.policy_allowed_entry_count == 0,
  };

  let knowledge_decision = context_manager
    .should_trigger_knowledge_retrieval(&knowledge_probe_context, &knowledge_retrieval_context);
  eprintln!(
        "[knowledge] retrieval decision: should_trigger={} reason={:?} explicit_refs={} granular_refs={} auto_candidates={} policy_blocked={}",
        knowledge_decision.should_trigger,
        knowledge_decision.reason,
        knowledge_retrieval_context.explicit_reference_count,
        knowledge_retrieval_context.granular_explicit_reference_count,
        knowledge_retrieval_context.automatic_candidate_count,
        knowledge_retrieval_context.automatic_policy_blocked
    );

  let mut knowledge_slices_for_event: Vec<KnowledgeInjectionSlice> = Vec::new();
  let mut knowledge_warnings_for_event: Vec<crate::services::knowledge::KnowledgeQueryWarning> =
    Vec::new();
  let mut knowledge_metadata_for_event: Option<crate::services::knowledge::KnowledgeQueryMetadata> =
    None;

  let knowledge_injection_slices: Vec<KnowledgeInjectionSlice> = if knowledge_decision
    .should_trigger
  {
    let workspace_for_query = workspace_path.clone();
    let current_file_for_query = current_file.clone();
    let selected_text_for_query = selected_text.clone();
    let explicit_suppression = explicit_knowledge_suppression.clone();
    let knowledge_query = build_knowledge_query(
      &last_user_message,
      current_file_for_query.as_deref(),
      selected_text_for_query.as_deref(),
    );

    match timeout(
      Duration::from_millis(1500),
      tokio::task::spawn_blocking(
        move || -> Result<crate::services::knowledge::KnowledgeQueryResponse, String> {
          let service = KnowledgeService::new(&workspace_for_query)?;
          service
            .query_knowledge_base(KnowledgeQueryRequest {
              query: Some(knowledge_query),
              limit: Some(8),
              intent: Some(crate::services::knowledge::KnowledgeQueryIntent::Augmentation),
              query_mode: Some(crate::services::knowledge::KnowledgeQueryMode::Content),
              asset_kind_filter: Some(
                crate::services::knowledge::KnowledgeAssetKindFilter::Standard,
              ),
              retrieval_strategy: Some(
                crate::services::knowledge::KnowledgeRetrievalStrategy::HybridWithRerank,
              ),
              ..Default::default()
            })
            .map_err(|e| e.to_string())
        },
      ),
    )
    .await
    {
      Ok(Ok(Ok(mut response))) => {
        for slice in &mut response.injection_slices {
          slice.retrieval_mode = "automatic".to_string();
          if !slice
            .risk_flags
            .iter()
            .any(|flag| flag == "automatic_retrieval")
          {
            slice.risk_flags.push("automatic_retrieval".to_string());
          }
        }

        let mut deduped = KnowledgeService::dedupe_automatic_slices(
          response.injection_slices.clone(),
          &explicit_suppression.entry_ids,
          &explicit_suppression.document_ids,
          &explicit_suppression.citation_keys,
        );
        deduped.truncate(3);
        knowledge_warnings_for_event = response.warnings.clone();
        knowledge_metadata_for_event = Some(response.metadata.clone());
        knowledge_slices_for_event = deduped.clone();

        if !deduped.is_empty() {
          eprintln!(
            "[knowledge] auto retrieval injected {} slices",
            deduped.len()
          );
          deduped
        } else {
          if knowledge_warnings_for_event.is_empty() {
            knowledge_warnings_for_event.push(crate::services::knowledge::KnowledgeQueryWarning {
              code: "automatic_empty".to_string(),
              message: "自动检索未返回可注入的知识片段".to_string(),
            });
          }
          eprintln!("[knowledge] auto retrieval returned no usable slices");
          Vec::new()
        }
      }
      Ok(Ok(Err(error))) => {
        knowledge_warnings_for_event.push(crate::services::knowledge::KnowledgeQueryWarning {
          code: "automatic_failed".to_string(),
          message: error.clone(),
        });
        eprintln!("[knowledge] auto retrieval failed: {}", error);
        Vec::new()
      }
      Ok(Err(join_error)) => {
        knowledge_warnings_for_event.push(crate::services::knowledge::KnowledgeQueryWarning {
          code: "automatic_join_failed".to_string(),
          message: join_error.to_string(),
        });
        eprintln!("[knowledge] auto retrieval join failed: {}", join_error);
        Vec::new()
      }
      Err(_) => {
        knowledge_warnings_for_event.push(crate::services::knowledge::KnowledgeQueryWarning {
          code: "automatic_timeout".to_string(),
          message: "自动检索超时，已降级为无 augmentation".to_string(),
        });
        eprintln!("[knowledge] auto retrieval timeout -> degrade to no augmentation");
        Vec::new()
      }
    }
  } else {
    knowledge_warnings_for_event.push(crate::services::knowledge::KnowledgeQueryWarning {
      code: "automatic_skipped".to_string(),
      message: format!("自动检索未触发: {:?}", knowledge_decision.reason),
    });
    Vec::new()
  };

  if let Some((template_id, task_id)) = active_workflow_template_task.as_ref() {
    let template_service = TemplateService::new();
    let runtime = template_service.evaluate_runtime_step_readiness(
      &workspace_path,
      task_id,
      &last_user_message,
      current_file.as_deref(),
      selected_text.as_deref(),
      current_editor_content
        .as_ref()
        .map(|content| !content.trim().is_empty())
        .unwrap_or(false),
      final_references.len(),
      knowledge_injection_slices.len(),
    )?;
    let persisted_runtime_plan =
      template_service.get_runtime_workflow_plan(&workspace_path, task_id)?;
    emit_workflow_execution_runtime(&app, &tab_id, task_id, &runtime);
    final_references.push(ReferenceInfo {
      ref_type: ReferenceType::Template,
      source: format!("workflow_template:{}#runtime_plan", template_id),
      content: build_runtime_execution_reference_content(
        template_id,
        &crate::services::template::WorkflowExecutionRuntime {
          runtime_plan: persisted_runtime_plan,
          ..runtime.clone()
        },
      ),
    });
  }

  let knowledge_event_payload = serde_json::json!({
      "tab_id": tab_id.clone(),
      "chunk": "",
      "done": false,
      "knowledge_retrieval": {
          "triggered": knowledge_decision.should_trigger,
          "decision_reason": format!("{:?}", knowledge_decision.reason),
          "injection_slices": knowledge_slices_for_event,
          "warnings": knowledge_warnings_for_event,
          "metadata": knowledge_metadata_for_event,
      }
  });
  let _ = app.emit("ai-chat-stream", knowledge_event_payload);

  // 构建上下文信息
  let context_info = ContextInfo {
    current_file: current_file.clone(),
    selected_text: selected_text.clone(),
    workspace_path: workspace_path.clone(),
    editor_state: ContextEditorState {
      is_editable: true, // 默认可编辑，可根据实际情况调整
      file_type: current_file.as_ref().and_then(|f| {
        std::path::Path::new(f)
          .extension()
          .and_then(|ext| ext.to_str())
          .map(|s| s.to_string())
      }),
      file_size: None, // 可根据需要获取文件大小
      is_saved: true,  // 默认已保存，可根据实际情况调整
    },
    references: final_references,
    current_content: current_editor_content.clone(),
    edit_target_present: selection_start_block_id_for_spawn.is_some(),
    selection_start_block_id,
    selection_start_offset,
    selection_end_block_id,
    selection_end_offset,
    cursor_block_id,
    cursor_offset,
    baseline_id: baseline_id.clone(),
    document_revision,
    user_message: messages
      .iter()
      .rev()
      .find(|m| m.role == "user")
      .map(|m| m.content.clone().unwrap_or_default())
      .unwrap_or_default(),
    agent_task_summary,
    agent_artifacts_summary,
    memory_context,
    knowledge_injection_slices,
  };

  // Phase 3: 通过 build_prompt_package 七层结构装配 prompt
  let prompt_package = context_manager.build_prompt_package(&context_info, enable_tools);
  let system_prompt = prompt_package.rendered_prompt.unwrap_or_default();

  // 构建增强的消息列表
  let mut enhanced_messages = messages.clone();

  // 检查是否有系统消息，如果没有则添加，如果有则替换
  let has_system_message = enhanced_messages.iter().any(|m| m.role == "system");
  if !has_system_message {
    enhanced_messages.insert(
      0,
      ChatMessage {
        role: "system".to_string(),
        content: Some(system_prompt),
        tool_call_id: None,
        name: None,
        tool_calls: None,
      },
    );
  } else {
    // 如果已有系统消息，使用统一构建的提示词替换，确保提示词一致性
    if let Some(first_msg) = enhanced_messages.first_mut() {
      if first_msg.role == "system" {
        first_msg.content = Some(system_prompt);
      }
    }
  }

  // 调用流式聊天（根据模式决定是否传递工具定义）
  match provider
    .chat_stream(
      &enhanced_messages,
      &model_config,
      &mut cancel_rx,
      tool_definitions.as_deref(),
    )
    .await
  {
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
      let document_revision_clone = document_revision;
      let baseline_id_clone = baseline_id.clone();
      let selected_text_clone = selected_text.clone();
      let primary_edit_target_clone = primary_edit_target.clone();
      // §7.1：选区坐标（已在 context_info 构建前 clone）
      let selection_start_block_id_clone = selection_start_block_id_for_spawn;
      let selection_start_offset_clone = selection_start_offset_for_spawn;
      let selection_end_block_id_clone = selection_end_block_id_for_spawn;
      let selection_end_offset_clone = selection_end_offset_for_spawn;
      let cursor_block_id_clone = cursor_block_id_for_spawn;
      let cursor_offset_clone = cursor_offset_for_spawn;

      // ⚠️ 关键修复：使用已注册的取消标志（已在上面创建并注册到 CANCEL_FLAGS）
      // cancel_flag 已经在上面注册到 CANCEL_FLAGS 中，这里直接使用
      let cancel_flag_clone = cancel_flag.clone();
      let cancel_flag_for_stream = cancel_flag.clone();
      // Phase 6: 捕获真实 task ID（优先使用前端传入的，fallback 到 shadow 代理键）
      let effective_task_id = agent_task_id
        .clone()
        .unwrap_or_else(|| shadow_registry_task_id(&tab_id));
      let effective_task_id_clone = effective_task_id.clone();

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
        let mut stream_ctx = StreamContext::default();
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
        let mut loop_detector = LoopDetector::new();
        let reply_checker = ReplyCompletenessChecker::new();

        // Phase 6: 在 spawn 内接收 effective_task_id
        let effective_task_id = effective_task_id_clone;
        // 初始化对话状态
        let message_id = format!("msg_{}", chrono::Utc::now().timestamp_millis());
        conversation_manager.start_conversation(&tab_id, message_id.clone());
        seed_shadow_artifacts(&tab_id, &workspace_path);
        // Phase 6: 跟踪本轮是否已产生候选，用于 review_ready 判断
        let mut candidate_emitted_this_session = false;

        // ⚠️ 关键修复：清空流式响应处理器的累积文本，避免新对话时使用旧的累积文本
        streaming_handler.clear_accumulated(&tab_id);

        // 使用 HashMap 来累积多个工具调用的参数和结果
        use std::collections::HashMap;
        let mut tool_calls: HashMap<String, (String, String)> = HashMap::new(); // (id -> (name, arguments))
        let mut tool_results: Vec<(String, String, crate::services::tool_service::ToolResult)> =
          Vec::new(); // 收集工具调用结果
                      // 与 tool_results 顺序一致：id, name，模型侧原始 arguments 字符串（用于 assistant tool_calls）
        let mut tool_call_specs: Vec<(String, String, String)> = Vec::new();
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
                  finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                  emit_ai_chat_stream_done(
                      &app_handle,
                      &tab_id,
                      &stream_ctx,
                      Some("用户取消了请求"),
                  );
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
                ChatChunk::ToolCall {
                  id,
                  name,
                  arguments,
                  is_complete,
                } => {
                  // 参考 void 的实现：只处理完整的工具调用
                  // 不完整的工具调用在 deepseek.rs 中已经被过滤，不会到达这里
                  if !is_complete {
                    eprintln!("⚠️ 收到不完整的工具调用，跳过: id={}, name={}", id, name);
                    // 保存状态，等待完成
                    let entry = tool_calls
                      .entry(id.clone())
                      .or_insert_with(|| (name.clone(), String::new()));
                    entry.1 = arguments.clone();
                    continue;
                  }

                  eprintln!("🔧 收到完整的工具调用 chunk: id={}, name={}, arguments_len={}, arguments_preview={}",
                                        id, name, arguments.len(),
                                        safe_truncate(&arguments, 100));

                  eprintln!(
                    "✅ 工具调用完成，开始处理: id={}, name={}, arguments={}",
                    id, name, arguments
                  );

                  // 检测工具调用循环
                  if loop_detector.detect_tool_call_loop(&name, &arguments) {
                    eprintln!("⚠️ 检测到工具调用循环，跳过: {}", name);
                    continue;
                  }

                  has_tool_calls = true; // 标记有工具调用

                  // 更新对话状态：开始工具调用
                  conversation_manager.start_tool_call(
                    &tab_id,
                    message_id.clone(),
                    id.clone(),
                    name.clone(),
                  );
                  conversation_manager.update_tool_call_status(
                    &tab_id,
                    crate::services::conversation_manager::ToolCallStatus::Pending,
                  );

                  // 使用 ToolCallHandler 解析工具调用参数
                  let mut parsed_arguments = ToolCallHandler::parse_tool_arguments(&arguments);

                  // ⚠️ 文档编辑功能：如果是 edit_current_editor_document，自动增强参数
                  if name == "edit_current_editor_document" {
                    sanitize_edit_current_editor_document_arguments(&mut parsed_arguments);
                    let skip = should_skip_edit_current_editor_injection(
                      &primary_edit_target,
                      &current_file,
                      &workspace_path,
                    );
                    if skip {
                      eprintln!(
                                                "📝 跳过 edit_current_editor_document 自动注入: primary_edit_target={:?} 与 current_file 不一致",
                                                primary_edit_target
                                            );
                    } else {
                      // 自动添加 current_file 和 current_content 参数
                      if let Some(ref file_path) = current_file {
                        parsed_arguments["current_file"] =
                          serde_json::Value::String(file_path.clone());
                      }
                      if let Some(ref content) = current_editor_content {
                        parsed_arguments["current_content"] =
                          serde_json::Value::String(content.clone());
                      }
                      if let Some(rev) = document_revision {
                        parsed_arguments["document_revision"] = serde_json::json!(rev);
                      }
                      if let Some(ref bid) = baseline_id {
                        parsed_arguments["baseline_id"] = serde_json::Value::String(bid.clone());
                      }
                      // 旧的 edit_target / target_content 自动注入已禁用。
                      // 新路径仅保留 _sel_* 零搜索坐标与 block_index + edit_mode。
                      // §7.1：注入选区坐标（零搜索路径，供 Resolver 使用）
                      if let Some(ref sbid) = selection_start_block_id_clone {
                        parsed_arguments["_sel_start_block_id"] =
                          serde_json::Value::String(sbid.clone());
                      }
                      if let Some(so) = selection_start_offset_clone {
                        parsed_arguments["_sel_start_offset"] = serde_json::json!(so);
                      }
                      if let Some(ref ebid) = selection_end_block_id_clone {
                        parsed_arguments["_sel_end_block_id"] =
                          serde_json::Value::String(ebid.clone());
                      }
                      if let Some(eo) = selection_end_offset_clone {
                        parsed_arguments["_sel_end_offset"] = serde_json::json!(eo);
                      }
                      if let Some(ref sel) = selected_text {
                        if !sel.is_empty() {
                          parsed_arguments["_sel_text"] = serde_json::Value::String(sel.clone());
                        }
                      }
                      if let Some(ref cbid) = cursor_block_id_clone {
                        parsed_arguments["cursor_block_id"] =
                          serde_json::Value::String(cbid.clone());
                      }
                      if let Some(co) = cursor_offset_clone {
                        parsed_arguments["cursor_offset"] = serde_json::json!(co);
                      }
                      eprintln!("📝 已增强 edit_current_editor_document 参数: current_file={:?}, current_content_len={}",
                                            current_file.as_ref().map(|s| s.as_str()),
                                            current_editor_content.as_ref().map(|s| s.len()).unwrap_or(0));
                      merge_editor_snapshot_ipc_for_tool(
                        &app_handle,
                        &name,
                        current_file.clone(),
                        &mut parsed_arguments,
                      )
                      .await;
                    }
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
                      eprintln!(
                        "🛑 工具调用执行前检测到取消标志，停止执行: tab_id={}",
                        tab_id
                      );
                      finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                      emit_ai_chat_stream_done(
                        &app_handle,
                        &tab_id,
                        &stream_ctx,
                        Some("用户取消了请求"),
                      );
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
                  conversation_manager.update_tool_call_status(
                    &tab_id,
                    crate::services::conversation_manager::ToolCallStatus::Executing,
                  );

                  // 使用 ToolCallHandler 执行工具调用（带重试机制）
                  let (raw_tool_result, _retry_count) = tool_call_handler
                    .execute_tool_with_retry(
                      &tool_call,
                      &workspace_path,
                      3, // max_retries
                    )
                    .await;
                  let skip_continue = !raw_tool_result.success;
                  let tool_result = with_execution_observability(
                    raw_tool_result,
                    &name,
                    Some(&parsed_args_for_result),
                    skip_continue,
                  );
                  maybe_sync_workflow_execution_from_tool_result(
                    &app_handle,
                    &tab_id,
                    &effective_task_id,
                    &workspace_path,
                    &name,
                    &tool_result,
                  );

                  // ⚠️ 关键修复：在工具调用执行后检查取消标志
                  {
                    let flag = cancel_flag.lock().unwrap();
                    if *flag {
                      eprintln!(
                        "🛑 工具调用执行后检测到取消标志，停止处理: tab_id={}",
                        tab_id
                      );
                      finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                      emit_ai_chat_stream_done(
                        &app_handle,
                        &tab_id,
                        &stream_ctx,
                        Some("用户取消了请求"),
                      );
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
                      eprintln!(
                        "🔄 文件操作成功，触发文件树刷新: workspace={}",
                        workspace_path_str
                      );
                      if let Err(e) = app_handle.emit("file-tree-changed", workspace_path_str) {
                        eprintln!("⚠️ 触发文件树刷新事件失败: {}", e);
                      }
                    }

                    // 保存工具调用结果，用于后续继续对话
                    tool_call_specs.push((id.clone(), name.clone(), arguments.clone()));
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
                    eprintln!(
                      "⚠️ 工具执行失败: {} - {}",
                      name,
                      tool_result
                        .error
                        .as_ref()
                        .unwrap_or(&"未知错误".to_string())
                    );

                    // 保存工具调用结果，用于后续继续对话
                    tool_call_specs.push((id.clone(), name.clone(), arguments.clone()));
                    tool_results.push((id.clone(), name.clone(), tool_result.clone()));

                    // 工具执行失败
                    let error_message = format!(
                      "\n\n[工具调用失败: {}]\n错误: {}",
                      name,
                      tool_result
                        .error
                        .as_ref()
                        .unwrap_or(&"未知错误".to_string())
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
              finalize_stream(&mut stream_ctx, StreamState::Completed);
              emit_ai_chat_stream_done(&app_handle, &tab_id, &stream_ctx, Some(&e.to_string()));
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
        }

        // ⚠️ 关键修复：在流结束后检查取消标志
        {
          let flag = cancel_flag.lock().unwrap();
          if *flag {
            eprintln!("🛑 流结束后检测到取消标志，停止处理: tab_id={}", tab_id);
            finalize_stream(&mut stream_ctx, StreamState::Cancelled);
            emit_ai_chat_stream_done(&app_handle, &tab_id, &stream_ctx, Some("用户取消了请求"));
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

        // 第一段流正常结束（非取消）：进入 Completed，允许后续 assistant 对话历史写入
        if stream_ctx.state == StreamState::Streaming {
          finalize_stream(&mut stream_ctx, StreamState::Completed);
        }

        // 流结束时，检查是否有未完成的工具调用
        if !tool_calls.is_empty() {
          eprintln!("🔧 流结束，发现 {} 个未完成的工具调用", tool_calls.len());
          has_tool_calls = true; // 标记有工具调用
          for (id, (name, arguments)) in tool_calls.iter() {
            eprintln!(
              "🔧 流结束，处理未完成的工具调用: id={}, name={}, arguments_len={}",
              id,
              name,
              arguments.len()
            );
            eprintln!("🔧 工具调用 arguments 内容: {}", arguments);

            // 解析工具调用参数（简化修复逻辑）
            let mut parsed_arguments = match serde_json::from_str::<serde_json::Value>(arguments) {
              Ok(args) => {
                eprintln!("✅ 成功解析工具调用参数");
                args
              }
              Err(e) => {
                eprintln!(
                  "⚠️ 工具调用参数 JSON 解析失败: {}, arguments: {}",
                  e, arguments
                );
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

            if name == "edit_current_editor_document" {
              sanitize_edit_current_editor_document_arguments(&mut parsed_arguments);
              let skip = should_skip_edit_current_editor_injection(
                &primary_edit_target_clone,
                &current_file_clone,
                &workspace_path,
              );
              if !skip {
                if let Some(ref file_path) = current_file_clone {
                  parsed_arguments["current_file"] = serde_json::Value::String(file_path.clone());
                }
                if let Some(ref content) = current_editor_content_clone {
                  parsed_arguments["current_content"] = serde_json::Value::String(content.clone());
                }
                if let Some(rev) = document_revision_clone {
                  parsed_arguments["document_revision"] = serde_json::json!(rev);
                }
                if let Some(ref bid) = baseline_id_clone {
                  parsed_arguments["baseline_id"] = serde_json::Value::String(bid.clone());
                }
                if let Some(ref sbid) = selection_start_block_id_clone {
                  parsed_arguments["_sel_start_block_id"] = serde_json::Value::String(sbid.clone());
                }
                if let Some(so) = selection_start_offset_clone {
                  parsed_arguments["_sel_start_offset"] = serde_json::json!(so);
                }
                if let Some(ref ebid) = selection_end_block_id_clone {
                  parsed_arguments["_sel_end_block_id"] = serde_json::Value::String(ebid.clone());
                }
                if let Some(eo) = selection_end_offset_clone {
                  parsed_arguments["_sel_end_offset"] = serde_json::json!(eo);
                }
                if let Some(ref sel) = selected_text_clone {
                  if !sel.is_empty() {
                    parsed_arguments["_sel_text"] = serde_json::Value::String(sel.clone());
                  }
                }
                if let Some(ref cbid) = cursor_block_id_clone {
                  parsed_arguments["cursor_block_id"] = serde_json::Value::String(cbid.clone());
                }
                if let Some(co) = cursor_offset_clone {
                  parsed_arguments["cursor_offset"] = serde_json::json!(co);
                }
              }
              merge_editor_snapshot_ipc_for_tool(
                &app_handle,
                name,
                current_file_clone.clone(),
                &mut parsed_arguments,
              )
              .await;
            }

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
                eprintln!(
                  "🛑 流结束后的工具调用执行前检测到取消标志，停止处理: tab_id={}",
                  tab_id
                );
                finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                emit_ai_chat_stream_done(&app_handle, &tab_id, &stream_ctx, Some("用户取消了请求"));
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
                    eprintln!(
                      "🔄 重试工具调用: {} (尝试 {}/{})",
                      name,
                      attempt + 1,
                      max_retries
                    );
                  }
                }
              }
            }

            let raw_tool_result = match tool_result {
              Some(result) => result,
              None => {
                // 所有重试都失败了
                let error_msg = last_error.unwrap_or_else(|| "未知错误".to_string());
                eprintln!(
                  "❌ 工具执行最终失败（已重试 {} 次）: {} - {}",
                  max_retries, name, error_msg
                );
                crate::services::tool_service::ToolResult {
                  success: false,
                  data: None,
                  error: Some(format!(
                    "执行失败（已重试 {} 次）: {}",
                    max_retries, error_msg
                  )),
                  message: None,
                  error_kind: None,
                  display_error: None,
                  meta: None,
                }
              }
            };
            let skip_continue = !raw_tool_result.success;
            let tool_result = with_execution_observability(
              raw_tool_result,
              &name,
              Some(&parsed_args_for_result),
              skip_continue,
            );
            maybe_sync_workflow_execution_from_tool_result(
              &app_handle,
              &tab_id,
              &effective_task_id,
              &workspace_path,
              &name,
              &tool_result,
            );

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
                eprintln!(
                  "🔄 文件操作成功，触发文件树刷新: workspace={}",
                  workspace_path_str
                );
                if let Err(e) = app_handle.emit("file-tree-changed", workspace_path_str) {
                  eprintln!("⚠️ 触发文件树刷新事件失败: {}", e);
                }
              }

              // 保存工具调用结果，用于后续继续对话
              tool_call_specs.push((id.clone(), name.clone(), arguments.clone()));
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
              eprintln!(
                "⚠️ 工具执行失败: {} - {}",
                name,
                tool_result
                  .error
                  .as_ref()
                  .unwrap_or(&"未知错误".to_string())
              );

              // 保存工具调用结果，用于后续继续对话
              tool_call_specs.push((id.clone(), name.clone(), arguments.clone()));
              tool_results.push((id.clone(), name.clone(), tool_result.clone()));

              // 工具执行失败
              let error_message = format!(
                "\n\n[工具调用失败: {}]\n错误: {}",
                name,
                tool_result
                  .error
                  .as_ref()
                  .unwrap_or(&"未知错误".to_string())
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
          eprintln!(
            "🔄 检测到工具调用，准备继续对话: 工具调用数量={}",
            tool_results.len()
          );
          if tool_results_emit_candidate(&tool_results) {
            mark_shadow_candidate_artifacts(&tab_id, &workspace_path);
            // Phase 6: 写 candidate_ready 阶段
            write_task_stage(
              &app_handle,
              &effective_task_id,
              &tab_id,
              "candidate_ready",
              "tool_candidate_emitted",
              &workspace_path,
            );
            candidate_emitted_this_session = true;
          }

          // 将 assistant 的回复（含 tool_calls）写入历史；工具执行结果见后续 role=tool 消息（OpenAI 兼容）
          let accumulated_text = streaming_handler.get_accumulated(&tab_id);
          let assistant_tool_calls = if !tool_call_specs.is_empty() {
            Some(build_openai_tool_calls_json(&tool_call_specs))
          } else {
            None
          };
          if !accumulated_text.is_empty() || assistant_tool_calls.is_some() {
            push_chat_message_if_allowed(
              &stream_ctx,
              &mut current_messages,
              ChatMessage {
                role: "assistant".to_string(),
                content: if assistant_tool_calls.is_some() {
                  None
                } else if accumulated_text.is_empty() {
                  None
                } else {
                  Some(accumulated_text.clone())
                },
                tool_call_id: None,
                name: None,
                tool_calls: assistant_tool_calls,
              },
            );
          }

          // 分析任务完成度，生成任务进度提示
          let task_progress_info = TaskProgressAnalyzer::analyze(&tool_results);
          let task_progress = task_progress_info.progress_hint.clone();

          // Phase 8: 用通用任务执行策略统一控制 TPA force-continue
          let is_doc_edit_task = task_progress_info.task_type
            == crate::services::task_progress_analyzer::TaskType::DocumentEdit
            || task_progress_info.task_type
              == crate::services::task_progress_analyzer::TaskType::MultiDocumentEdit;
          let task_execution_policy = if is_doc_edit_task {
            TaskExecutionPolicy::for_document_editing()
          } else if task_progress_info.task_type
            == crate::services::task_progress_analyzer::TaskType::RecursiveCheck
            || task_progress_info.task_type
              == crate::services::task_progress_analyzer::TaskType::FileMove
          {
            TaskExecutionPolicy::for_workspace_maintenance()
          } else {
            TaskExecutionPolicy::for_document_editing()
          };

          let task_incomplete = if task_execution_policy.allows_tpa_force_continue() {
            task_progress_info.is_incomplete
          } else {
            false
          };
          let task_completed = if task_execution_policy.allows_tpa_force_continue() {
            task_progress_info.is_completed
          } else {
            false
          };

          // 检查是否是"检查所有文件夹"任务未完成
          let check_folders_incomplete = task_progress_info.task_type
            == crate::services::task_progress_analyzer::TaskType::RecursiveCheck
            && task_progress_info.is_incomplete;

          let continue_instruction = if is_doc_edit_task {
            "The edit has been applied to the document. Review the result and determine if the task is complete. If further edits are needed, call edit_current_editor_document again. Otherwise, provide a concise summary of what was changed.".to_string()
          } else if check_folders_incomplete {
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
            let last_user_message = find_last_real_user_message(&messages);
            let user_asks_for_summary = last_user_message
              .map(|m| {
                let content_lower = m.text().to_lowercase();
                content_lower.contains("写了什么")
                  || content_lower.contains("内容是什么")
                  || content_lower.contains("内容")
                    && (content_lower.contains("总结")
                      || content_lower.contains("概述")
                      || content_lower.contains("介绍"))
                  || content_lower.contains("总结")
                  || content_lower.contains("概述")
                  || content_lower.contains("介绍")
              })
              .unwrap_or(false);

            if user_asks_for_summary {
              "重要：用户要求了解文件内容。请基于读取的文件内容，提供清晰的总结和概述，说明文件的主要内容、关键信息等。请用自然语言回复，不要调用工具。".to_string()
            } else {
              "请基于以上结果继续执行用户的任务。如果用户明确要求移动文件、创建文件夹等操作，请立即调用相应的工具完成，不要停止或等待。".to_string()
            }
          } else if tool_results.iter().any(|(_, name, _)| name == "list_files") {
            // 检查用户是否要求检查/列出文件
            let last_user_message = find_last_real_user_message(&messages);
            let user_asks_to_check_or_list_files = last_user_message
              .map(|m| {
                let content_lower = m.text().to_lowercase();
                content_lower.contains("检查")
                  && (content_lower.contains("文件") || content_lower.contains("文件夹"))
                  || content_lower.contains("列出")
                    && (content_lower.contains("文件") || content_lower.contains("文件夹"))
                  || content_lower.contains("查看")
                    && (content_lower.contains("文件") || content_lower.contains("文件夹"))
                  || content_lower.contains("有哪些")
                    && (content_lower.contains("文件") || content_lower.contains("文件夹"))
                  || (content_lower.contains("所有文件") || content_lower.contains("全部文件"))
                  || (content_lower.contains("文件")
                    && (content_lower.contains("包括")
                      || content_lower.contains("子文件夹")
                      || content_lower.contains("子目录")))
                  || content_lower.contains("每一个")
                    && (content_lower.contains("文件夹") || content_lower.contains("文件"))
              })
              .unwrap_or(false);

            // 检查用户是否要求检查"每一个"文件夹
            let user_asks_check_every_folder = last_user_message
              .map(|m| {
                let content_lower = m.text().to_lowercase();
                content_lower.contains("每一个")
                  && (content_lower.contains("文件夹") || content_lower.contains("文件"))
                  || content_lower.contains("每个")
                    && (content_lower.contains("文件夹") || content_lower.contains("文件"))
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
            "请基于以上结果继续执行用户的任务。如果任务还未完成，请继续调用相应的工具完成剩余步骤。"
              .to_string()
          };
          let continue_instruction = if task_execution_policy.allows_tpa_force_continue() {
            if let Some(runtime_workflow_constraint) =
              maybe_build_runtime_workflow_constraint(&workspace_path, &effective_task_id)
            {
              format!(
                "{}\n\n{}",
                continue_instruction, runtime_workflow_constraint
              )
            } else {
              continue_instruction
            }
          } else {
            continue_instruction
          };

          // 如果任务未完成，添加调试日志
          if task_incomplete {
            eprintln!("⚠️ 任务未完成，强制要求 AI 继续：{}", task_progress);
          }

          // 每条工具结果一条 role=tool；随后单独一条 user 承载 [NEXT_ACTION]（不再拼接 [TOOL_RESULTS]）
          let followup_user_content = if !task_progress.is_empty() {
            format!(
              "[NEXT_ACTION]\n\n[TASK_STATUS]\n{}\n\n{}",
              task_progress, continue_instruction
            )
          } else {
            format!("[NEXT_ACTION]\n{}", continue_instruction)
          };
          let followup_user_content = if let Some(runtime_directive) =
            maybe_build_runtime_execution_directive(&workspace_path, &effective_task_id)
          {
            format!(
              "{}\n\n[WORKFLOW_EXECUTION]\n{}",
              followup_user_content, runtime_directive
            )
          } else {
            followup_user_content
          };
          for (tool_id, tool_name, tool_result) in &tool_results {
            let mut tool_content = format_single_tool_result_content(tool_name, tool_result);
            if tool_name == "create_folder" && tool_result.success {
              tool_content.push_str("\n\n下一步操作：文件夹已创建，现在必须立即调用 move_file 工具移动文件到这个文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。");
            }
            push_chat_message_if_allowed(
              &stream_ctx,
              &mut current_messages,
              ChatMessage {
                role: "tool".to_string(),
                content: Some(tool_content),
                tool_call_id: Some(tool_id.clone()),
                name: None,
                tool_calls: None,
              },
            );
          }
          push_chat_message_if_allowed(
            &stream_ctx,
            &mut current_messages,
            ChatMessage {
              role: "user".to_string(),
              content: Some(followup_user_content),
              tool_call_id: None,
              name: None,
              tool_calls: None,
            },
          );

          eprintln!("📝 构建新的消息列表，消息数量: {}", current_messages.len());

          // 估算消息历史长度，如果过长则截断（防止Token超限）
          // 简单估算：1 token ≈ 4 字符，保留约80%的token预算给响应
          let total_chars: usize = current_messages.iter().map(|m| m.text().len()).sum();
          let estimated_tokens = total_chars / 4;
          let max_context_tokens = (model_config_clone.max_tokens * 10).min(30000); // 假设上下文窗口为32K，保留一些给响应

          if estimated_tokens > max_context_tokens {
            eprintln!(
              "⚠️ 消息历史过长（估算 {} tokens），截断以预防Token超限",
              estimated_tokens
            );
            // 保留系统消息（第一条）和最后10条消息
            if current_messages.len() > 11 {
              ContextManager::default()
                .truncate_with_strategy(&mut current_messages, TruncationStrategy::KeepRecent(10));
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
              finalize_stream(&mut stream_ctx, StreamState::Cancelled);
              emit_ai_chat_stream_done(&app_handle, &tab_id, &stream_ctx, Some("用户取消了请求"));
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

            begin_next_stream_round(&mut stream_ctx);
            match provider_clone
              .chat_stream(
                &current_messages,
                &model_config_clone,
                &mut new_cancel_rx,
                tool_definitions_clone.as_deref(),
              )
              .await
            {
              Ok(mut new_stream) => {
                break Ok(new_stream);
              }
              Err(e) => {
                let error_str = e.to_string();
                // 检测Token超限错误
                if error_str.contains("Token超限")
                  || error_str.contains("token")
                  || error_str.contains("length")
                  || error_str.contains("context")
                  || error_str.contains("maximum")
                  || error_str.contains("exceeded")
                {
                  if retry_count < max_retries {
                    retry_count += 1;
                    eprintln!(
                      "⚠️ Token超限，尝试截断消息历史（第 {} 次重试）",
                      retry_count
                    );
                    // 更激进的截断：只保留系统消息和最后5条消息
                    if current_messages.len() > 6 {
                      ContextManager::default().truncate_with_strategy(
                        &mut current_messages,
                        TruncationStrategy::KeepRecent(5),
                      );
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
              let mut new_tool_results: Vec<(
                String,
                String,
                crate::services::tool_service::ToolResult,
              )> = Vec::new();
              let mut new_tool_call_specs: Vec<(String, String, String)> = Vec::new();
              // 使用新的流式响应处理器
              let mut new_streaming_handler = StreamingResponseHandler::new();

              // 循环检测：记录上一次的回复内容，防止无限循环
              let mut last_reply_content: Option<String> = None;
              let mut continue_reply_retry_count = 0;
              const MAX_CONTINUE_REPLY_RETRIES: usize = 3; // 最大重试次数

              // 累积所有工具调用结果（包括第一次的和后续的），用于任务完成度分析
              let mut all_tool_results = tool_results.clone();

              // Phase 8: 循环级续轮策略（由外层首轮 TPA 分析确定）
              let loop_execution_policy = task_execution_policy.clone();
              let budget = &loop_execution_policy.budget;

              // 添加循环检测和重试限制（从 ToolCallBudget 获取）
              let mut force_continue_count = 0usize;
              let max_force_continue_retries = budget.max_force_continues;
              let mut last_force_continue_content: Option<String> = None;

              // 工具调用轮次限制（从 ToolCallBudget 获取）
              let mut tool_round_count = 0usize;
              let max_tool_rounds = budget.max_tool_rounds;

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
                          finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                          emit_ai_chat_stream_done(
                              &app_handle,
                              &tab_id,
                              &stream_ctx,
                              Some("用户取消了请求"),
                          );
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
                          if let Some(text_to_send) =
                            new_streaming_handler.process_text_chunk(&tab_id, &text)
                          {
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
                        ChatChunk::ToolCall {
                          id,
                          name,
                          arguments,
                          is_complete,
                        } => {
                          if !is_complete {
                            continue;
                          }
                          let arguments_for_api_continue = arguments.clone();

                          eprintln!("🔧 继续对话中检测到工具调用: id={}, name={}", id, name);

                          // 使用 ToolCallHandler 解析工具调用参数
                          let mut parsed_arguments =
                            ToolCallHandler::parse_tool_arguments(&arguments);

                          // ⚠️ 文档编辑功能：如果是 edit_current_editor_document，自动增强参数
                          if name == "edit_current_editor_document" {
                            sanitize_edit_current_editor_document_arguments(&mut parsed_arguments);
                            let skip = should_skip_edit_current_editor_injection(
                              &primary_edit_target_clone,
                              &current_file_clone,
                              &workspace_path,
                            );
                            if skip {
                              eprintln!(
                                                                "📝 [继续对话] 跳过 edit_current_editor_document 自动注入: primary_edit_target={:?}",
                                                                primary_edit_target_clone
                                                            );
                            } else if let serde_json::Value::Object(ref mut map) = parsed_arguments
                            {
                              // 在继续对话中，从保存的原始参数中获取编辑器信息
                              // 自动添加 current_file 和 current_content 参数（如果缺少）
                              if !map.contains_key("current_file") {
                                if let Some(ref file_path) = current_file_clone {
                                  map.insert(
                                    "current_file".to_string(),
                                    serde_json::Value::String(file_path.clone()),
                                  );
                                  eprintln!("📝 [继续对话] 已添加 current_file: {}", file_path);
                                }
                              }
                              if !map.contains_key("current_content") {
                                if let Some(ref content) = current_editor_content_clone {
                                  map.insert(
                                    "current_content".to_string(),
                                    serde_json::Value::String(content.clone()),
                                  );
                                  eprintln!(
                                    "📝 [继续对话] 已添加 current_content (长度: {})",
                                    content.len()
                                  );
                                }
                              }
                              if !map.contains_key("document_revision") {
                                if let Some(rev) = document_revision_clone {
                                  map.insert(
                                    "document_revision".to_string(),
                                    serde_json::json!(rev),
                                  );
                                  eprintln!("📝 [继续对话] 已添加 document_revision: {}", rev);
                                }
                              }
                              if !map.contains_key("baseline_id") {
                                if let Some(ref bid) = baseline_id_clone {
                                  map.insert(
                                    "baseline_id".to_string(),
                                    serde_json::Value::String(bid.clone()),
                                  );
                                  eprintln!("📝 [继续对话] 已添加 baseline_id: {}", bid);
                                }
                              }
                              // 旧的 edit_target / target_content 自动补参与继续对话兼容已禁用。
                              // 新路径仅保留 _sel_* 零搜索坐标与 block_index + edit_mode。
                              // §7.1：注入选区坐标（零搜索路径，供 Resolver 使用）
                              if !map.contains_key("_sel_start_block_id") {
                                if let Some(ref sbid) = selection_start_block_id_clone {
                                  map.insert(
                                    "_sel_start_block_id".to_string(),
                                    serde_json::Value::String(sbid.clone()),
                                  );
                                }
                              }
                              if !map.contains_key("_sel_start_offset") {
                                if let Some(so) = selection_start_offset_clone {
                                  map
                                    .insert("_sel_start_offset".to_string(), serde_json::json!(so));
                                }
                              }
                              if !map.contains_key("_sel_end_block_id") {
                                if let Some(ref ebid) = selection_end_block_id_clone {
                                  map.insert(
                                    "_sel_end_block_id".to_string(),
                                    serde_json::Value::String(ebid.clone()),
                                  );
                                }
                              }
                              if !map.contains_key("_sel_end_offset") {
                                if let Some(eo) = selection_end_offset_clone {
                                  map.insert("_sel_end_offset".to_string(), serde_json::json!(eo));
                                }
                              }
                              if !map.contains_key("_sel_text") {
                                if let Some(ref sel) = selected_text_clone {
                                  if !sel.is_empty() {
                                    map.insert(
                                      "_sel_text".to_string(),
                                      serde_json::Value::String(sel.clone()),
                                    );
                                  }
                                }
                              }
                              if !map.contains_key("cursor_block_id") {
                                if let Some(ref cbid) = cursor_block_id_clone {
                                  map.insert(
                                    "cursor_block_id".to_string(),
                                    serde_json::Value::String(cbid.clone()),
                                  );
                                }
                              }
                              if !map.contains_key("cursor_offset") {
                                if let Some(co) = cursor_offset_clone {
                                  map.insert("cursor_offset".to_string(), serde_json::json!(co));
                                }
                              }
                              if map.contains_key("current_file")
                                && map.contains_key("current_content")
                              {
                                eprintln!("✅ [继续对话] edit_current_editor_document 参数已完整");
                              } else {
                                eprintln!(
                                  "⚠️ [继续对话] edit_current_editor_document 仍然缺少参数"
                                );
                              }
                            }
                            merge_editor_snapshot_ipc_for_tool(
                              &app_handle,
                              &name,
                              current_file_clone.clone(),
                              &mut parsed_arguments,
                            )
                            .await;
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
                              eprintln!(
                                "🛑 继续对话中工具调用执行前检测到取消标志，停止执行: tab_id={}",
                                tab_id
                              );
                              finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                              emit_ai_chat_stream_done(
                                &app_handle,
                                &tab_id,
                                &stream_ctx,
                                Some("用户取消了请求"),
                              );
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
                                    eprintln!(
                                      "✅ 继续对话中工具执行成功（第 {} 次尝试）: {}",
                                      attempt, name
                                    );
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
                                eprintln!(
                                  "⚠️ 继续对话中工具执行失败（第 {} 次尝试）: {} - {}",
                                  attempt, name, e
                                );
                                if attempt < max_retries {
                                  // 等待一小段时间后重试（指数退避）
                                  let delay_ms = 100 * attempt;
                                  tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms))
                                    .await;
                                  eprintln!(
                                    "🔄 重试工具调用: {} (尝试 {}/{})",
                                    name,
                                    attempt + 1,
                                    max_retries
                                  );
                                }
                              }
                            }
                          }

                          let raw_tool_result = match tool_result {
                            Some(result) => result,
                            None => {
                              // 所有重试都失败了
                              let error_msg = last_error.unwrap_or_else(|| "未知错误".to_string());
                              eprintln!(
                                "❌ 继续对话中工具执行最终失败（已重试 {} 次）: {} - {}",
                                max_retries, name, error_msg
                              );
                              crate::services::tool_service::ToolResult {
                                success: false,
                                data: None,
                                error: Some(format!(
                                  "执行失败（已重试 {} 次）: {}",
                                  max_retries, error_msg
                                )),
                                message: None,
                                error_kind: None,
                                display_error: None,
                                meta: None,
                              }
                            }
                          };
                          let skip_continue = !raw_tool_result.success;
                          let tool_result = with_execution_observability(
                            raw_tool_result,
                            &name,
                            Some(&parsed_args_for_result_continue),
                            skip_continue,
                          );
                          maybe_sync_workflow_execution_from_tool_result(
                            &app_handle,
                            &tab_id,
                            &effective_task_id,
                            &workspace_path,
                            &name,
                            &tool_result,
                          );

                          // ⚠️ 关键修复：在继续对话的工具调用执行后检查取消标志
                          {
                            let flag = continue_cancel_flag_for_stream.lock().unwrap();
                            if *flag {
                              eprintln!(
                                "🛑 继续对话中工具调用执行后检测到取消标志，停止处理: tab_id={}",
                                tab_id
                              );
                              finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                              emit_ai_chat_stream_done(
                                &app_handle,
                                &tab_id,
                                &stream_ctx,
                                Some("用户取消了请求"),
                              );
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
                            new_tool_call_specs.push((
                              id.clone(),
                              name.clone(),
                              arguments_for_api_continue.clone(),
                            ));
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
                            eprintln!(
                              "⚠️ 继续对话中工具执行失败: {} - {}",
                              name,
                              tool_result
                                .error
                                .as_ref()
                                .unwrap_or(&"未知错误".to_string())
                            );
                            new_tool_call_specs.push((
                              id.clone(),
                              name.clone(),
                              arguments_for_api_continue.clone(),
                            ));
                            new_tool_results.push((id.clone(), name.clone(), tool_result.clone()));

                            // 立即更新累积结果
                            all_tool_results.push((id.clone(), name.clone(), tool_result.clone()));

                            let error_message = format!(
                              "\n\n[工具调用失败: {}]\n错误: {}",
                              name,
                              tool_result
                                .error
                                .as_ref()
                                .unwrap_or(&"未知错误".to_string())
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
                      // Phase 8: 流错误后仅在允许自动续轮的任务上尝试继续
                      if loop_execution_policy.allows_tpa_force_continue() {
                        let err_progress = TaskProgressAnalyzer::analyze(&all_tool_results);
                        if err_progress.is_incomplete {
                          eprintln!("⚠️ 流错误但任务未完成（允许自动续轮），尝试继续");
                        } else {
                          continue_loop = false;
                        }
                      } else {
                        continue_loop = false;
                      }
                      break;
                    }
                  }
                }

                // 继续对话子流：本轮 new_stream 读取结束（非取消路径下收口为 Completed，允许后续 assistant 写入）
                {
                  let cancelled = *continue_cancel_flag_for_stream.lock().unwrap();
                  if !cancelled && stream_ctx.state == StreamState::Streaming {
                    finalize_stream(&mut stream_ctx, StreamState::Completed);
                  }
                }

                // 如果流正常结束且没有工具调用，但有文本内容，需要保存到消息历史
                // 但是，如果任务未完成，必须强制继续
                let new_accumulated_text = new_streaming_handler.get_accumulated(&tab_id);
                let new_accumulated_text_clone = new_accumulated_text.clone();
                if !continue_loop
                  && !new_accumulated_text_clone.is_empty()
                  && new_tool_results.is_empty()
                {
                  // Phase 8: 用通用任务执行策略统一控制 TPA force-continue
                  let task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                  let task_progress = task_progress_info.progress_hint.clone();

                  let inner_is_doc_edit = task_progress_info.task_type
                    == crate::services::task_progress_analyzer::TaskType::DocumentEdit
                    || task_progress_info.task_type
                      == crate::services::task_progress_analyzer::TaskType::MultiDocumentEdit;
                  let inner_execution_policy = if inner_is_doc_edit {
                    TaskExecutionPolicy::for_document_editing()
                  } else if task_progress_info.task_type
                    == crate::services::task_progress_analyzer::TaskType::RecursiveCheck
                    || task_progress_info.task_type
                      == crate::services::task_progress_analyzer::TaskType::FileMove
                  {
                    TaskExecutionPolicy::for_workspace_maintenance()
                  } else {
                    TaskExecutionPolicy::for_document_editing()
                  };
                  let task_incomplete = if inner_execution_policy.allows_tpa_force_continue() {
                    task_progress_info.is_incomplete
                  } else {
                    false
                  };

                  // 检查用户是否要求递归检查所有文件（使用 TaskProgressAnalyzer 的辅助方法）
                  let last_user_message = find_last_real_user_message(&current_messages);
                  let user_asks_for_all_files_recursive = last_user_message
                    .map(|m| TaskProgressAnalyzer::user_asks_for_recursive_check(m.text()))
                    .unwrap_or(false);

                  // 如果用户要求递归检查，使用 TaskProgressAnalyzer 的结果判断是否完成
                  let recursive_check_incomplete = if user_asks_for_all_files_recursive {
                    task_progress_info.task_type
                      == crate::services::task_progress_analyzer::TaskType::RecursiveCheck
                      && task_progress_info.is_incomplete
                  } else {
                    false
                  };

                  // 使用 ReplyCompletenessChecker 检查回复是否完整
                  let reply_complete = reply_checker.is_complete(&new_accumulated_text_clone);

                  // 综合判断任务是否未完成
                  let task_really_incomplete = task_incomplete || recursive_check_incomplete;

                  eprintln!(
                    "🔍 流结束检查：任务未完成={}, 递归检查未完成={}, 回复完整={}, 文本长度={}",
                    task_incomplete,
                    recursive_check_incomplete,
                    reply_complete,
                    new_accumulated_text_clone.len()
                  );

                  // 使用 ReplyCompletenessChecker 检查回复是否太短
                  let is_reply_too_short =
                    reply_checker.is_too_short(&new_accumulated_text_clone) && !reply_complete;
                  if is_reply_too_short && !task_really_incomplete {
                    eprintln!("⚠️ 警告：回复内容可能不完整（长度={}，未以标点符号结尾），但流已结束，保存当前回复", new_accumulated_text_clone.len());
                  }

                  // 更新任务未完成标志
                  let task_incomplete = task_really_incomplete;

                  if task_incomplete {
                    // 使用 LoopDetector 检查是否超过最大重试次数
                    if force_continue_count >= max_force_continue_retries {
                      eprintln!(
                        "⚠️ 已达到最大强制继续重试次数（{}），停止继续请求",
                        max_force_continue_retries
                      );
                      eprintln!(
                        "📝 保存当前回复（长度={}）",
                        new_accumulated_text_clone.len()
                      );
                      // 不再继续，保存当前回复
                      continue_loop = false;
                    } else {
                      // 使用 LoopDetector 检测内容重复
                      // 先检查上次内容，然后检测当前内容
                      let mut is_same_as_last_force =
                        if let Some(last) = &last_force_continue_content {
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
                            let last_has_pattern = repetitive_patterns
                              .iter()
                              .any(|pattern| last_trimmed.contains(pattern));
                            let current_has_pattern = repetitive_patterns
                              .iter()
                              .any(|pattern| current_trimmed.contains(pattern));

                            // 如果都包含重复模式，且内容相似度很高，认为是重复
                            if last_has_pattern && current_has_pattern {
                              // 计算相似度：检查关键短语是否相同
                              let last_words: Vec<&str> = last_trimmed.split_whitespace().collect();
                              let current_words: Vec<&str> =
                                current_trimmed.split_whitespace().collect();

                              let common_words = last_words
                                .iter()
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
                        is_same_as_last_force =
                          loop_detector.detect_content_repetition(&new_accumulated_text_clone);
                      }

                      if is_same_as_last_force {
                        eprintln!("⚠️ 检测到循环：回复内容与上次强制继续时相同，停止继续请求");
                        eprintln!(
                          "📝 保存当前回复（长度={}）",
                          new_accumulated_text_clone.len()
                        );
                        // 不再继续，保存当前回复
                        continue_loop = false;
                      } else {
                        force_continue_count += 1;
                        last_force_continue_content = Some(new_accumulated_text_clone.clone());

                        eprintln!(
                          "⚠️ 流结束但任务未完成，强制继续对话（第 {} 次）",
                          force_continue_count
                        );
                        eprintln!("📊 任务进度详情：{}", task_progress);
                        // 任务未完成，强制继续对话
                        continue_loop = true;

                        // 将 assistant 的回复添加到消息历史
                        if !new_accumulated_text_clone.is_empty() {
                          push_chat_message_if_allowed(
                            &stream_ctx,
                            &mut current_messages,
                            ChatMessage {
                              role: "assistant".to_string(),
                              content: Some(new_accumulated_text_clone.clone()),
                              tool_call_id: None,
                              name: None,
                              tool_calls: None,
                            },
                          );
                        }
                      }
                    }
                  } else {
                    // 任务完成，重置计数器
                    force_continue_count = 0;
                    last_force_continue_content = None;
                  }

                  if task_incomplete && continue_loop {
                    // Phase 8: force-continue 只在允许自动续轮的任务上才可能到达此处
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

                    push_chat_message_if_allowed(
                      &stream_ctx,
                      &mut current_messages,
                      ChatMessage {
                        role: "user".to_string(),
                        content: Some(format!("[NEXT_ACTION]\n{}", force_continue_message)),
                        tool_call_id: None,
                        name: None,
                        tool_calls: None,
                      },
                    );

                    // 清空文本，准备下一轮
                    new_streaming_handler.clear_accumulated(&tab_id);

                    // ⚠️ 关键修复：任务未完成时，必须重新调用 chat_stream 继续对话
                    eprintln!("🔄 任务未完成，重新调用 chat_stream 继续执行");
                    // ⚠️ 关键修复：为强制继续创建新的取消通道并注册
                    let (force_continue_cancel_tx, mut force_continue_cancel_rx) =
                      tokio::sync::oneshot::channel();
                    {
                      let mut channels = CANCEL_CHANNELS.lock().unwrap();
                      channels.insert(tab_id.clone(), force_continue_cancel_tx);
                      eprintln!("✅ 强制继续时注册新的取消通道: tab_id={}", tab_id);
                    }
                    let mut force_retry_count = 0;
                    let max_force_retries = 2;
                    let mut force_stream_result = loop {
                      begin_next_stream_round(&mut stream_ctx);
                      match provider_clone
                        .chat_stream(
                          &current_messages,
                          &model_config_clone,
                          &mut force_continue_cancel_rx,
                          tool_definitions_clone.as_deref(),
                        )
                        .await
                      {
                        Ok(force_stream) => {
                          break Ok(force_stream);
                        }
                        Err(e) => {
                          let error_str = e.to_string();
                          // 检测Token超限错误
                          if error_str.contains("Token超限")
                            || error_str.contains("token")
                            || error_str.contains("length")
                            || error_str.contains("context")
                            || error_str.contains("maximum")
                            || error_str.contains("exceeded")
                          {
                            if force_retry_count < max_force_retries {
                              force_retry_count += 1;
                              eprintln!(
                                "⚠️ Token超限，尝试截断消息历史（第 {} 次重试）",
                                force_retry_count
                              );
                              // 更激进的截断：只保留系统消息和最后5条消息
                              if current_messages.len() > 6 {
                                ContextManager::default().truncate_with_strategy(
                                  &mut current_messages,
                                  TruncationStrategy::KeepRecent(5),
                                );
                                eprintln!("📝 截断后消息数量: {}", current_messages.len());
                              }
                              // ⚠️ 关键修复：重新创建cancel channel并注册
                              let (force_continue_cancel_tx2, mut force_continue_cancel_rx2) =
                                tokio::sync::oneshot::channel();
                              {
                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                channels.insert(tab_id.clone(), force_continue_cancel_tx2);
                                eprintln!(
                                  "✅ Token超限重试时注册新的取消通道（强制继续）: tab_id={}",
                                  tab_id
                                );
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
                    // Phase 8: 总结注入仅在自动续轮策略开启时触发
                    let task_completed = if inner_execution_policy.allows_tpa_force_continue() {
                      !task_progress.is_empty() && task_progress.contains("任务完成确认")
                    } else {
                      false
                    };

                    // 检查是否调用了 read_file 且用户要求总结内容
                    let has_read_file = all_tool_results
                      .iter()
                      .any(|(_, name, _)| name == "read_file");
                    let last_user_message = find_last_real_user_message(&current_messages);
                    let user_asks_for_summary = last_user_message
                      .map(|m| {
                        let content_lower = m.text().to_lowercase();
                        content_lower.contains("写了什么")
                          || content_lower.contains("内容是什么")
                          || (content_lower.contains("内容")
                            && (content_lower.contains("总结")
                              || content_lower.contains("概述")
                              || content_lower.contains("介绍")))
                          || content_lower.contains("总结")
                          || content_lower.contains("概述")
                          || content_lower.contains("介绍")
                      })
                      .unwrap_or(false);

                    // 如果调用了 read_file 且用户要求总结，但回复很短，可能需要总结
                    let needs_summary_for_read = has_read_file
                      && user_asks_for_summary
                      && new_accumulated_text_clone.len() < 200;

                    let has_summary = reply_checker.has_summary(&new_accumulated_text_clone);

                    eprintln!(
                      "📝 流正常结束，任务完成={}, 已有总结={}, 需要总结={}, 文本长度={}",
                      task_completed,
                      has_summary,
                      needs_summary_for_read,
                      new_accumulated_text_clone.len()
                    );

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
                        push_chat_message_if_allowed(
                          &stream_ctx,
                          &mut current_messages,
                          ChatMessage {
                            role: "assistant".to_string(),
                            content: Some(new_accumulated_text_clone.clone()),
                            tool_call_id: None,
                            name: None,
                            tool_calls: None,
                          },
                        );
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

                      push_chat_message_if_allowed(
                        &stream_ctx,
                        &mut current_messages,
                        ChatMessage {
                          role: "user".to_string(),
                          content: Some(format!("[NEXT_ACTION]\n{}", summary_request)),
                          tool_call_id: None,
                          name: None,
                          tool_calls: None,
                        },
                      );

                      // 清空文本，准备下一轮
                      new_streaming_handler.clear_accumulated(&tab_id);

                      // ⚠️ 关键修复：在获取总结前检查取消标志
                      {
                        let flag = continue_cancel_flag_for_stream.lock().unwrap();
                        if *flag {
                          eprintln!("🛑 获取总结前检测到取消标志，停止处理: tab_id={}", tab_id);
                          finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                          emit_ai_chat_stream_done(
                            &app_handle,
                            &tab_id,
                            &stream_ctx,
                            Some("用户取消了请求"),
                          );
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
                      let (summary_cancel_tx, mut summary_cancel_rx) =
                        tokio::sync::oneshot::channel();
                      {
                        let mut channels = CANCEL_CHANNELS.lock().unwrap();
                        channels.insert(tab_id.clone(), summary_cancel_tx);
                        eprintln!("✅ 获取总结时注册新的取消通道: tab_id={}", tab_id);
                      }
                      let mut summary_retry_count = 0;
                      let max_summary_retries = 2;
                      let mut summary_stream_result = loop {
                        begin_next_stream_round(&mut stream_ctx);
                        match provider_clone
                          .chat_stream(
                            &current_messages,
                            &model_config_clone,
                            &mut summary_cancel_rx,
                            tool_definitions_clone.as_deref(),
                          )
                          .await
                        {
                          Ok(summary_stream) => {
                            break Ok(summary_stream);
                          }
                          Err(e) => {
                            let error_str = e.to_string();
                            // 检测Token超限错误
                            if error_str.contains("Token超限")
                              || error_str.contains("token")
                              || error_str.contains("length")
                              || error_str.contains("context")
                              || error_str.contains("maximum")
                              || error_str.contains("exceeded")
                            {
                              if summary_retry_count < max_summary_retries {
                                summary_retry_count += 1;
                                eprintln!(
                                  "⚠️ Token超限，尝试截断消息历史（第 {} 次重试）",
                                  summary_retry_count
                                );
                                // 更激进的截断：只保留系统消息和最后5条消息
                                if current_messages.len() > 6 {
                                  ContextManager::default().truncate_with_strategy(
                                    &mut current_messages,
                                    TruncationStrategy::KeepRecent(5),
                                  );
                                  eprintln!("📝 截断后消息数量: {}", current_messages.len());
                                }
                                // ⚠️ 关键修复：重新创建cancel channel并注册
                                let (summary_cancel_tx2, mut summary_cancel_rx2) =
                                  tokio::sync::oneshot::channel();
                                {
                                  let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                  channels.insert(tab_id.clone(), summary_cancel_tx2);
                                  eprintln!(
                                    "✅ Token超限重试时注册新的取消通道（总结）: tab_id={}",
                                    tab_id
                                  );
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
                      let is_reply_too_short =
                        reply_checker.is_too_short(&new_accumulated_text_clone) && !reply_complete;

                      // 检查是否有工具调用结果但回复不完整（这是关键场景）
                      let has_tool_results_but_incomplete =
                        !all_tool_results.is_empty() && is_reply_too_short;

                      if is_reply_too_short {
                        // 循环检测：检查是否与上一次回复内容相同或语义重复
                        let is_same_as_last = last_reply_content
                          .as_ref()
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

                            let last_has_pattern = repetitive_patterns
                              .iter()
                              .any(|pattern| last_trimmed.contains(pattern));
                            let current_has_pattern = repetitive_patterns
                              .iter()
                              .any(|pattern| current_trimmed.contains(pattern));

                            // 如果都包含重复模式，且内容相似度很高，认为是语义重复
                            if last_has_pattern && current_has_pattern {
                              // 计算相似度：检查关键短语是否相同
                              let last_key_phrases: Vec<&str> =
                                last_trimmed.split_whitespace().collect();
                              let current_key_phrases: Vec<&str> =
                                current_trimmed.split_whitespace().collect();

                              // 如果关键短语有80%以上相同，认为是语义重复
                              let common_phrases = last_key_phrases
                                .iter()
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
                          eprintln!(
                            "⚠️ 已达到最大重试次数（{}），停止继续请求AI完成回复",
                            MAX_CONTINUE_REPLY_RETRIES
                          );
                          eprintln!(
                            "📝 保存当前回复（长度={}）",
                            new_accumulated_text_clone.len()
                          );
                          // 不再继续，保存当前回复
                        } else if is_same_as_last {
                          eprintln!("⚠️ 检测到循环：回复内容与上一次相同或语义重复，停止继续请求");
                          eprintln!(
                            "📝 保存当前回复（长度={}）",
                            new_accumulated_text_clone.len()
                          );
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
                            push_chat_message_if_allowed(
                              &stream_ctx,
                              &mut current_messages,
                              ChatMessage {
                                role: "assistant".to_string(),
                                content: Some(new_accumulated_text_clone.clone()),
                                tool_call_id: None,
                                name: None,
                                tool_calls: None,
                              },
                            );
                          }

                          // 请求AI继续完成回复（明确告诉AI需要做什么）
                          // 检查是否有工具调用结果需要总结
                          let has_tool_results = !all_tool_results.is_empty();

                          // 检查用户是否要求检查/列出文件
                          let last_user_message = find_last_real_user_message(&current_messages);
                          let user_asks_to_check_or_list_files = last_user_message
                            .map(|m| {
                              let content_lower = m.text().to_lowercase();
                              content_lower.contains("检查")
                                && (content_lower.contains("文件")
                                  || content_lower.contains("文件夹"))
                                || content_lower.contains("列出")
                                  && (content_lower.contains("文件")
                                    || content_lower.contains("文件夹"))
                                || content_lower.contains("查看")
                                  && (content_lower.contains("文件")
                                    || content_lower.contains("文件夹"))
                                || content_lower.contains("有哪些")
                                  && (content_lower.contains("文件")
                                    || content_lower.contains("文件夹"))
                                || (content_lower.contains("所有文件")
                                  || content_lower.contains("全部文件"))
                                || (content_lower.contains("文件")
                                  && (content_lower.contains("包括")
                                    || content_lower.contains("子文件夹")
                                    || content_lower.contains("子目录")))
                            })
                            .unwrap_or(false);

                          let has_list_files_tool = all_tool_results
                            .iter()
                            .any(|(_, name, _)| name == "list_files");

                          let continue_prompt = if has_tool_results
                            && has_list_files_tool
                            && user_asks_to_check_or_list_files
                          {
                            // 用户要求检查文件，且AI已调用list_files工具，必须要求完整列出所有文件
                            format!(
                                                            "重要：你的回复不完整。你已经调用了 list_files 工具检查了所有文件夹，现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件（包括文件名、路径等）\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                                                        )
                          } else if has_tool_results {
                            // 有工具调用结果，但并非文件清单任务：仅围绕原始任务继续
                            format!(
                                                            "你的回复不完整。你已经调用了工具并获取了结果，请基于这些结果继续完成原始任务：\n\n1. 简洁说明已执行的关键操作及结果\n2. 明确当前任务是否已完成；若未完成，继续调用必要工具\n3. 仅围绕用户原始指令输出，不要引入额外的文件巡检或目录总结\n\n请继续完成任务。"
                                                        )
                          } else {
                            // 如果没有工具调用，只是要求继续完成文本回复
                            "你的回复似乎不完整，请继续完成你的回答。确保回复完整、清晰，并以适当的标点符号结尾。".to_string()
                          };

                          push_chat_message_if_allowed(
                            &stream_ctx,
                            &mut current_messages,
                            ChatMessage {
                              role: "user".to_string(),
                              content: Some(format!("[NEXT_ACTION]\n{}", continue_prompt)),
                              tool_call_id: None,
                              name: None,
                              tool_calls: None,
                            },
                          );

                          // 清空文本，准备下一轮
                          new_streaming_handler.clear_accumulated(&tab_id);

                          // 重新调用 chat_stream 继续完成回复
                          eprintln!("🔄 请求AI继续完成回复");
                          // ⚠️ 关键修复：为继续回复创建新的取消通道并注册
                          let (continue_reply_cancel_tx, mut continue_reply_cancel_rx) =
                            tokio::sync::oneshot::channel();
                          {
                            let mut channels = CANCEL_CHANNELS.lock().unwrap();
                            channels.insert(tab_id.clone(), continue_reply_cancel_tx);
                            eprintln!("✅ 继续回复时注册新的取消通道: tab_id={}", tab_id);
                          }
                          begin_next_stream_round(&mut stream_ctx);
                          match provider_clone
                            .chat_stream(
                              &current_messages,
                              &model_config_clone,
                              &mut continue_reply_cancel_rx,
                              tool_definitions_clone.as_deref(),
                            )
                            .await
                          {
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
                              eprintln!(
                                "📝 保存不完整的回复（长度={}）",
                                new_accumulated_text_clone.len()
                              );
                            }
                          }
                        }
                      } else {
                        // 回复完整，重置循环检测
                        last_reply_content = None;
                        continue_reply_retry_count = 0;
                        // 基于第一性原理：分析AI的实际行为，判断任务是否真正完成
                        // 1. 分析用户意图：是否明确要求递归检查所有文件或检查每一个文件夹
                        let last_user_message = find_last_real_user_message(&current_messages);
                        let user_asks_for_all_files_recursive = last_user_message
                                                    .map(|m| {
                                                        let content_lower = m.text().to_lowercase();
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
                                  if let Some(is_dir) =
                                    f.get("is_directory").and_then(|d| d.as_bool())
                                  {
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
                                  let dir_name = path
                                    .split('/')
                                    .last()
                                    .or_else(|| path.split('\\').last())
                                    .unwrap_or(path);
                                  checked_subdirs.insert(dir_name.to_string());
                                }
                              }
                            }
                          }
                        }

                        // 3. 判断执行完整性（更严格的判断逻辑）
                        let execution_incomplete = if let Some((_root_files, root_dirs)) =
                          root_list_files_result
                        {
                          // 如果用户要求递归检查所有文件，且根目录有文件夹
                          if user_asks_for_all_files_recursive && root_dirs > 0 {
                            // 检查AI是否检查了所有子文件夹
                            // 改进：降低阈值，即使只有1-2个文件夹也要检查
                            let list_files_calls = all_tool_results
                              .iter()
                              .filter(|(_, name, _)| *name == "list_files")
                              .count();

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
                            let list_files_calls = all_tool_results
                              .iter()
                              .filter(|(_, name, _)| *name == "list_files")
                              .count();
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
                              push_chat_message_if_allowed(
                                &stream_ctx,
                                &mut current_messages,
                                ChatMessage {
                                  role: "assistant".to_string(),
                                  content: Some(new_accumulated_text_clone.clone()),
                                  tool_call_id: None,
                                  name: None,
                                  tool_calls: None,
                                },
                              );
                            }

                            // 明确提示AI需要继续检查所有子文件夹
                            push_chat_message_if_allowed(&stream_ctx, &mut current_messages, ChatMessage {
                                                            role: "user".to_string(),
                                                            content: Some(format!(
                                                                "[NEXT_ACTION]\n\n{}",
                                                                format!(
                                                                "任务未完成警告：你还没有检查完所有子文件夹。\n\n根目录下有 {} 个文件夹，但你只检查了部分文件夹。\n\n重要指令：\n1. 必须使用 list_files 工具检查剩余的每个子文件夹\n2. 不要停止，不要结束回复\n3. 必须检查完所有文件夹才能结束\n4. 立即调用 list_files 工具检查剩余的文件夹\n\n执行要求：必须调用工具继续检查，不要只回复文本。",
                                                                root_dirs
                                                            ))),
                                                            tool_call_id: None,
                                                            name: None,
                                                            tool_calls: None,
                                                        });

                            // 清空文本，准备下一轮
                            new_streaming_handler.clear_accumulated(&tab_id);

                            // 重新调用 chat_stream 继续完成
                            eprintln!("🔄 请求AI继续完成所有子文件夹的检查");
                            let (_, mut continue_check_cancel_rx) = tokio::sync::oneshot::channel();
                            begin_next_stream_round(&mut stream_ctx);
                            match provider_clone
                              .chat_stream(
                                &current_messages,
                                &model_config_clone,
                                &mut continue_check_cancel_rx,
                                tool_definitions_clone.as_deref(),
                              )
                              .await
                            {
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
                                eprintln!(
                                  "📝 保存当前回复（长度={}）",
                                  new_accumulated_text_clone.len()
                                );
                              }
                            }
                          } else {
                            // 无法获取根目录信息，正常保存
                            eprintln!(
                              "📝 流正常结束，保存 assistant 回复到消息历史（长度={}，完整={}）",
                              new_accumulated_text_clone.len(),
                              reply_complete
                            );
                            push_chat_message_if_allowed(
                              &stream_ctx,
                              &mut current_messages,
                              ChatMessage {
                                role: "assistant".to_string(),
                                content: Some(new_accumulated_text_clone.clone()),
                                tool_call_id: None,
                                name: None,
                                tool_calls: None,
                              },
                            );
                          }
                        } else {
                          // 检查用户是否要求检查/列出文件，且AI是否给出了完整的文件列表
                          let last_user_message = find_last_real_user_message(&current_messages);
                          let user_asks_to_check_or_list_files = last_user_message
                            .map(|m| {
                              let content_lower = m.text().to_lowercase();
                              content_lower.contains("检查")
                                && (content_lower.contains("文件")
                                  || content_lower.contains("文件夹"))
                                || content_lower.contains("列出")
                                  && (content_lower.contains("文件")
                                    || content_lower.contains("文件夹"))
                                || content_lower.contains("查看")
                                  && (content_lower.contains("文件")
                                    || content_lower.contains("文件夹"))
                                || content_lower.contains("有哪些")
                                  && (content_lower.contains("文件")
                                    || content_lower.contains("文件夹"))
                                || (content_lower.contains("所有文件")
                                  || content_lower.contains("全部文件"))
                                || (content_lower.contains("文件")
                                  && (content_lower.contains("包括")
                                    || content_lower.contains("子文件夹")
                                    || content_lower.contains("子目录")))
                                || content_lower.contains("每一个")
                                  && (content_lower.contains("文件夹")
                                    || content_lower.contains("文件"))
                                || content_lower.contains("每个")
                                  && (content_lower.contains("文件夹")
                                    || content_lower.contains("文件"))
                            })
                            .unwrap_or(false);

                          let has_list_files_tool = all_tool_results
                            .iter()
                            .any(|(_, name, _)| name == "list_files");

                          // 检查回复内容质量：是否只是说明状态而没有实际执行
                          let reply_is_just_status = new_accumulated_text_clone.contains("我理解")
                            || new_accumulated_text_clone.contains("我需要完成")
                            || new_accumulated_text_clone.contains("还需要检查")
                            || new_accumulated_text_clone.contains("目前我只检查了")
                            || (new_accumulated_text_clone.contains("还需要检查剩余的")
                              && !new_accumulated_text_clone.contains("：")
                              && !new_accumulated_text_clone.contains(":"));

                          // 如果用户要求检查文件，且AI已调用list_files工具，但回复只是说明状态而没有实际执行，认为任务未完成
                          let reply_has_file_list = new_accumulated_text_clone.len() > 200
                            && (new_accumulated_text_clone.contains("文件")
                              && (
                                new_accumulated_text_clone.contains("：")
                                  || new_accumulated_text_clone.contains(":")
                                  || new_accumulated_text_clone.contains("列表")
                                  || new_accumulated_text_clone.contains("包括")
                                  || new_accumulated_text_clone.matches("文件").count() >= 3
                                // 至少提到3次"文件"
                              ))
                            && !reply_is_just_status;

                          // 检查任务完成度：如果用户要求检查每一个文件夹，检查是否真的检查了所有文件夹
                          let task_progress_check_info =
                            TaskProgressAnalyzer::analyze(&all_tool_results);
                          let check_folders_task_incomplete = task_progress_check_info.task_type
                            == crate::services::task_progress_analyzer::TaskType::RecursiveCheck
                            && task_progress_check_info.is_incomplete;

                          if check_folders_task_incomplete
                            || (user_asks_to_check_or_list_files
                              && has_list_files_tool
                              && !reply_has_file_list)
                          {
                            eprintln!("⚠️ 用户要求检查文件，AI已调用工具但回复中没有完整列出文件（长度={}），要求AI给出完整的文件列表", new_accumulated_text_clone.len());

                            // 将当前回复添加到消息历史
                            if !new_accumulated_text_clone.is_empty() {
                              push_chat_message_if_allowed(
                                &stream_ctx,
                                &mut current_messages,
                                ChatMessage {
                                  role: "assistant".to_string(),
                                  content: Some(new_accumulated_text_clone.clone()),
                                  tool_call_id: None,
                                  name: None,
                                  tool_calls: None,
                                },
                              );
                            }

                            // 明确要求AI给出完整的文件列表总结
                            push_chat_message_if_allowed(&stream_ctx, &mut current_messages, ChatMessage {
                                                            role: "user".to_string(),
                                                            content: Some(format!(
                                                                "[NEXT_ACTION]\n\n{}",
                                                                "重要：你已经调用了 list_files 工具检查了所有文件夹，但你的回复中没有完整列出所有文件。现在必须基于工具调用结果给出完整、详细的文件列表总结。\n\n必须包含的内容：\n1. 完整列出所有检查到的文件：详细列出每个文件夹中的所有文件（包括文件名、路径等）\n2. 按文件夹分类组织：清晰地按文件夹分组展示文件列表\n3. 提供统计信息：总文件数、文件夹数、每个文件夹的文件数等\n4. 使用清晰的格式：使用列表、分类等方式，确保用户能够清楚了解所有文件的情况\n\n重要：不要只给出简短回复，必须完整呈现所有文件信息。基于你调用的 list_files 工具结果，提供一份详细、完整的文件列表总结。"
                                                            )),
                                                            tool_call_id: None,
                                                            name: None,
                                                            tool_calls: None,
                                                        });

                            // 清空文本，准备下一轮
                            new_streaming_handler.clear_accumulated(&tab_id);

                            // 重新调用 chat_stream 继续完成
                            eprintln!("🔄 要求AI给出完整的文件列表总结");
                            let (_, mut file_list_cancel_rx) = tokio::sync::oneshot::channel();
                            begin_next_stream_round(&mut stream_ctx);
                            match provider_clone
                              .chat_stream(
                                &current_messages,
                                &model_config_clone,
                                &mut file_list_cancel_rx,
                                tool_definitions_clone.as_deref(),
                              )
                              .await
                            {
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
                                eprintln!(
                                  "📝 保存当前回复（长度={}）",
                                  new_accumulated_text_clone.len()
                                );
                              }
                            }
                          } else {
                            // 正常保存
                            eprintln!(
                              "📝 流正常结束，保存 assistant 回复到消息历史（长度={}，完整={}）",
                              new_accumulated_text_clone.len(),
                              reply_complete
                            );
                            push_chat_message_if_allowed(
                              &stream_ctx,
                              &mut current_messages,
                              ChatMessage {
                                role: "assistant".to_string(),
                                content: Some(new_accumulated_text_clone.clone()),
                                tool_call_id: None,
                                name: None,
                                tool_calls: None,
                              },
                            );
                          }
                        }
                      }
                    }
                  }
                }

                // 如果有新的工具调用，需要继续对话
                if continue_loop && !new_tool_results.is_empty() {
                  tool_round_count += 1;
                  if tool_round_count > max_tool_rounds {
                    eprintln!("🚫 工具调用轮次超过上限 ({})，终止循环", max_tool_rounds);
                    let _ = app_handle.emit("ai-stream-error", serde_json::json!({
                                            "tab_id": tab_id,
                                            "error": format!("工具调用轮次超过上限（{}轮），已自动终止。", max_tool_rounds)
                                        }));
                    continue_loop = false;
                  } else {
                    eprintln!(
                      "🔄 检测到继续对话中的工具调用，准备再次继续对话: 工具调用数量={}",
                      new_tool_results.len()
                    );

                    // 将 assistant 的回复（含 tool_calls）写入消息历史
                    let assistant_tool_calls = if !new_tool_call_specs.is_empty() {
                      Some(build_openai_tool_calls_json(&new_tool_call_specs))
                    } else {
                      None
                    };
                    if !new_accumulated_text_clone.is_empty() || assistant_tool_calls.is_some() {
                      push_chat_message_if_allowed(
                        &stream_ctx,
                        &mut current_messages,
                        ChatMessage {
                          role: "assistant".to_string(),
                          content: if assistant_tool_calls.is_some() {
                            None
                          } else if new_accumulated_text_clone.is_empty() {
                            None
                          } else {
                            Some(new_accumulated_text_clone.clone())
                          },
                          tool_call_id: None,
                          name: None,
                          tool_calls: assistant_tool_calls,
                        },
                      );
                    }

                    // Phase 8: 用通用任务执行策略统一控制 TPA（工具调用续轮路径）
                    let task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                    let task_progress = task_progress_info.progress_hint.clone();

                    eprintln!(
                      "📊 任务进度分析结果：{}",
                      if task_progress.is_empty() {
                        "任务已完成或无需进度检查"
                      } else {
                        &task_progress
                      }
                    );

                    let tool_round_is_doc_edit = task_progress_info.task_type
                      == crate::services::task_progress_analyzer::TaskType::DocumentEdit
                      || task_progress_info.task_type
                        == crate::services::task_progress_analyzer::TaskType::MultiDocumentEdit;
                    let tool_round_policy = if tool_round_is_doc_edit {
                      TaskExecutionPolicy::for_document_editing()
                    } else if task_progress_info.task_type
                      == crate::services::task_progress_analyzer::TaskType::RecursiveCheck
                      || task_progress_info.task_type
                        == crate::services::task_progress_analyzer::TaskType::FileMove
                    {
                      TaskExecutionPolicy::for_workspace_maintenance()
                    } else {
                      TaskExecutionPolicy::for_document_editing()
                    };
                    let task_incomplete = if tool_round_policy.allows_tpa_force_continue() {
                      task_progress_info.is_incomplete
                    } else {
                      false
                    };
                    let task_completed = if tool_round_policy.allows_tpa_force_continue() {
                      task_progress_info.is_completed
                    } else {
                      false
                    };

                    let continue_instruction = if tool_round_is_doc_edit {
                      "The edit has been applied to the document. Review the result and determine if the task is complete. If further edits are needed, call edit_current_editor_document again. Otherwise, provide a concise summary of what was changed.".to_string()
                    } else if task_incomplete {
                      // 任务未完成，强制要求继续
                      format!("{}\n\n重要：任务尚未完成！请立即继续调用 move_file 工具处理剩余文件，不要停止或结束回复。必须处理完所有文件才能结束。", 
                                            // 优先检查 create_folder，明确要求调用 move_file
                                            if new_tool_results.iter().any(|(_, name, _)| name == "create_folder") {
                                                "重要：文件夹已创建完成，现在必须立即调用 move_file 工具移动文件到相应的文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。".to_string()
                                            } else if new_tool_results.iter().any(|(_, name, _)| name == "list_files" || name == "read_file") {
                                                // 检查用户是否要求检查/列出文件
                                                let last_user_message = find_last_real_user_message(&current_messages);
                                                let user_asks_to_check_or_list_files = last_user_message
                                                    .map(|m| {
                                                        let content_lower = m.text().to_lowercase();
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
                    } else if new_tool_results
                      .iter()
                      .any(|(_, name, _)| name == "create_folder")
                    {
                      // 即使任务完成，如果刚创建了文件夹，也要提示移动文件
                      "重要：文件夹已创建完成，现在必须立即调用 move_file 工具移动文件到相应的文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。".to_string()
                    } else if new_tool_results
                      .iter()
                      .any(|(_, name, _)| name == "list_files" || name == "read_file")
                    {
                      // 检查用户是否要求检查/列出文件
                      let last_user_message = find_last_real_user_message(&current_messages);
                      let user_asks_to_check_or_list_files = last_user_message
                        .map(|m| {
                          let content_lower = m.text().to_lowercase();
                          content_lower.contains("检查")
                            && (content_lower.contains("文件") || content_lower.contains("文件夹"))
                            || content_lower.contains("列出")
                              && (content_lower.contains("文件")
                                || content_lower.contains("文件夹"))
                            || content_lower.contains("查看")
                              && (content_lower.contains("文件")
                                || content_lower.contains("文件夹"))
                            || content_lower.contains("有哪些")
                              && (content_lower.contains("文件")
                                || content_lower.contains("文件夹"))
                            || (content_lower.contains("所有文件")
                              || content_lower.contains("全部文件"))
                            || (content_lower.contains("文件")
                              && (content_lower.contains("包括")
                                || content_lower.contains("子文件夹")
                                || content_lower.contains("子目录")))
                        })
                        .unwrap_or(false);

                      if user_asks_to_check_or_list_files
                        && new_tool_results
                          .iter()
                          .any(|(_, name, _)| name == "list_files")
                      {
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
                    let continue_instruction = if tool_round_policy.allows_tpa_force_continue() {
                      if let Some(build_mode_constraint) =
                        maybe_build_runtime_workflow_constraint(&workspace_path, &effective_task_id)
                      {
                        format!("{}\n\n{}", continue_instruction, build_mode_constraint)
                      } else {
                        continue_instruction
                      }
                    } else {
                      continue_instruction
                    };

                    // 每条工具结果一条 role=tool；随后单独 user 承载 [NEXT_ACTION]
                    let followup_user_content = if !task_progress.is_empty() {
                      format!(
                        "[NEXT_ACTION]\n\n[TASK_STATUS]\n{}\n\n{}",
                        task_progress, continue_instruction
                      )
                    } else {
                      format!("[NEXT_ACTION]\n{}", continue_instruction)
                    };
                    let followup_user_content = if let Some(runtime_directive) =
                      maybe_build_runtime_execution_directive(&workspace_path, &effective_task_id)
                    {
                      format!(
                        "{}\n\n[WORKFLOW_EXECUTION]\n{}",
                        followup_user_content, runtime_directive
                      )
                    } else {
                      followup_user_content
                    };
                    for (tool_id, tool_name, tool_result) in &new_tool_results {
                      let mut tool_content =
                        format_single_tool_result_content(tool_name, tool_result);
                      if tool_name == "create_folder" && tool_result.success {
                        tool_content.push_str("\n\n下一步操作：文件夹已创建，现在必须立即调用 move_file 工具移动文件到这个文件夹。不要停止，不要创建更多文件夹，必须开始移动文件。");
                      }
                      push_chat_message_if_allowed(
                        &stream_ctx,
                        &mut current_messages,
                        ChatMessage {
                          role: "tool".to_string(),
                          content: Some(tool_content),
                          tool_call_id: Some(tool_id.clone()),
                          name: None,
                          tool_calls: None,
                        },
                      );
                    }
                    push_chat_message_if_allowed(
                      &stream_ctx,
                      &mut current_messages,
                      ChatMessage {
                        role: "user".to_string(),
                        content: Some(followup_user_content),
                        tool_call_id: None,
                        name: None,
                        tool_calls: None,
                      },
                    );
                    if tool_results_emit_candidate(&new_tool_results) {
                      mark_shadow_candidate_artifacts(&tab_id, &workspace_path);
                    }

                    new_tool_results.clear();
                    new_tool_call_specs.clear();
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
                      begin_next_stream_round(&mut stream_ctx);
                      match provider_clone
                        .chat_stream(
                          &current_messages,
                          &model_config_clone,
                          &mut next_cancel_rx,
                          tool_definitions_clone.as_deref(),
                        )
                        .await
                      {
                        Ok(next_stream) => {
                          break Ok(next_stream);
                        }
                        Err(e) => {
                          let error_str = e.to_string();
                          // 检测Token超限错误
                          if error_str.contains("Token超限")
                            || error_str.contains("token")
                            || error_str.contains("length")
                            || error_str.contains("context")
                            || error_str.contains("maximum")
                            || error_str.contains("exceeded")
                          {
                            if retry_count_inner < max_retries_inner {
                              retry_count_inner += 1;
                              eprintln!(
                                "⚠️ Token超限，尝试截断消息历史（第 {} 次重试）",
                                retry_count_inner
                              );
                              // 更激进的截断：只保留系统消息和最后5条消息
                              if current_messages.len() > 6 {
                                ContextManager::default().truncate_with_strategy(
                                  &mut current_messages,
                                  TruncationStrategy::KeepRecent(5),
                                );
                                eprintln!("📝 截断后消息数量: {}", current_messages.len());
                              }
                              // 重新创建cancel channel
                              // ⚠️ 关键修复：重新创建cancel channel并注册
                              let (next_cancel_tx2, mut next_cancel_rx2) =
                                tokio::sync::oneshot::channel();
                              {
                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                channels.insert(tab_id.clone(), next_cancel_tx2);
                                eprintln!(
                                  "✅ Token超限重试时注册新的取消通道（下一轮）: tab_id={}",
                                  tab_id
                                );
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
                  } // else (tool_round_count <= max_tool_rounds)
                }

                // ⚠️ 关键修复：在继续对话循环结束前检查取消标志
                {
                  let flag = continue_cancel_flag_for_stream.lock().unwrap();
                  if *flag {
                    eprintln!(
                      "🛑 继续对话循环结束前检测到取消标志，停止处理: tab_id={}",
                      tab_id
                    );
                    finalize_stream(&mut stream_ctx, StreamState::Cancelled);
                    emit_ai_chat_stream_done(
                      &app_handle,
                      &tab_id,
                      &stream_ctx,
                      Some("用户取消了请求"),
                    );
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
                // LEG-004 降级：doc edit 任务不走 TPA 完成裁定，跳过此总结注入
                if !continue_loop {
                  let final_task_progress_info = TaskProgressAnalyzer::analyze(&all_tool_results);
                  let is_final_doc_edit = final_task_progress_info.task_type
                    == crate::services::task_progress_analyzer::TaskType::DocumentEdit
                    || final_task_progress_info.task_type
                      == crate::services::task_progress_analyzer::TaskType::MultiDocumentEdit;
                  let final_task_completed = if is_final_doc_edit {
                    false
                  } else {
                    final_task_progress_info.is_completed
                  };

                  // 检查最后一条assistant消息是否包含总结
                  let final_has_summary = current_messages
                    .iter()
                    .rev()
                    .find(|m| m.role == "assistant")
                    .map(|m| {
                      m.text().len() > 50
                        && (m.text().contains("总结")
                          || m.text().contains("完成")
                          || m.text().contains("已处理")
                          || m.text().contains("下一步")
                          || m.text().contains("执行逻辑")
                          || m.text().contains("执行效果"))
                    })
                    .unwrap_or(false);

                  // 也检查当前累积的文本
                  let current_text_has_summary =
                    reply_checker.has_summary(&new_accumulated_text_clone);

                  if final_task_completed && !final_has_summary && !current_text_has_summary {
                    // 任务完成但没有总结，要求总结
                    eprintln!("📋 循环结束，任务已完成但无总结，要求AI做工作总结");

                    // 如果当前有文本，先保存
                    if !new_accumulated_text_clone.is_empty() {
                      push_chat_message_if_allowed(
                        &stream_ctx,
                        &mut current_messages,
                        ChatMessage {
                          role: "assistant".to_string(),
                          content: Some(new_accumulated_text_clone.clone()),
                          tool_call_id: None,
                          name: None,
                          tool_calls: None,
                        },
                      );
                    }

                    // 添加总结要求
                    let summary_request = format!(
                                            "{}\n\n任务已完成，请进行工作总结：\n\n请检查你的工作，然后提供一份简洁的总结，包括：\n1. 完成的工作：简要说明你完成了哪些操作（如移动了多少文件、创建了哪些文件夹等）\n2. 执行逻辑：简要说明你是如何组织和执行这些操作的\n3. 执行效果：说明任务完成后的结果和状态\n4. 下一步建议：如果有需要用户注意的事项或后续建议，请说明\n\n请用自然语言回复，不要调用工具。",
                                            final_task_progress_info.progress_hint
                                        );

                    push_chat_message_if_allowed(
                      &stream_ctx,
                      &mut current_messages,
                      ChatMessage {
                        role: "user".to_string(),
                        content: Some(format!("[NEXT_ACTION]\n{}", summary_request)),
                        tool_call_id: None,
                        name: None,
                        tool_calls: None,
                      },
                    );

                    // 重新调用 chat_stream 获取总结
                    eprintln!("🔄 要求AI做工作总结，重新调用 chat_stream");
                    // ⚠️ 关键修复：为最终总结创建新的取消通道并注册
                    let (final_summary_cancel_tx, mut final_summary_cancel_rx) =
                      tokio::sync::oneshot::channel();
                    {
                      let mut channels = CANCEL_CHANNELS.lock().unwrap();
                      channels.insert(tab_id.clone(), final_summary_cancel_tx);
                      eprintln!("✅ 最终总结时注册新的取消通道: tab_id={}", tab_id);
                    }
                    let mut final_summary_retry_count = 0;
                    let max_final_summary_retries = 2;
                    let mut final_summary_stream_result = loop {
                      begin_next_stream_round(&mut stream_ctx);
                      match provider_clone
                        .chat_stream(
                          &current_messages,
                          &model_config_clone,
                          &mut final_summary_cancel_rx,
                          tool_definitions_clone.as_deref(),
                        )
                        .await
                      {
                        Ok(final_summary_stream) => {
                          break Ok(final_summary_stream);
                        }
                        Err(e) => {
                          let error_str = e.to_string();
                          // 检测Token超限错误
                          if error_str.contains("Token超限")
                            || error_str.contains("token")
                            || error_str.contains("length")
                            || error_str.contains("context")
                            || error_str.contains("maximum")
                            || error_str.contains("exceeded")
                          {
                            if final_summary_retry_count < max_final_summary_retries {
                              final_summary_retry_count += 1;
                              eprintln!(
                                "⚠️ Token超限，尝试截断消息历史（第 {} 次重试）",
                                final_summary_retry_count
                              );
                              // 更激进的截断：只保留系统消息和最后5条消息
                              if current_messages.len() > 6 {
                                ContextManager::default().truncate_with_strategy(
                                  &mut current_messages,
                                  TruncationStrategy::KeepRecent(5),
                                );
                                eprintln!("📝 截断后消息数量: {}", current_messages.len());
                              }
                              // 重新创建cancel channel
                              // ⚠️ 关键修复：重新创建cancel channel并注册
                              let (final_summary_cancel_tx2, mut final_summary_cancel_rx2) =
                                tokio::sync::oneshot::channel();
                              {
                                let mut channels = CANCEL_CHANNELS.lock().unwrap();
                                channels.insert(tab_id.clone(), final_summary_cancel_tx2);
                                eprintln!(
                                  "✅ Token超限重试时注册新的取消通道（最终总结）: tab_id={}",
                                  tab_id
                                );
                              }
                              final_summary_cancel_rx = final_summary_cancel_rx2;
                              continue;
                            } else {
                              eprintln!(
                                "❌ Token超限，已重试 {} 次仍失败",
                                max_final_summary_retries
                              );
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

        // 清理取消通道
        {
          let mut channels = CANCEL_CHANNELS.lock().unwrap();
          channels.remove(&tab_id_clone);
          eprintln!("🧹 清理取消通道: tab_id={}", tab_id_clone);
        }

        // 统一收尾：避免「已取消」又发一次 completed 的 done
        if stream_ctx.state == StreamState::Cancelled {
          eprintln!("🛑 流已取消，不再发送完成信号: tab_id={}", tab_id);
        } else {
          if stream_ctx.state == StreamState::Streaming {
            finalize_stream(&mut stream_ctx, StreamState::Completed);
          }
          // Phase 6: 如果本轮产生过候选且模型已停止调用工具，进入 review_ready
          if candidate_emitted_this_session {
            write_task_stage(
              &app_handle,
              &effective_task_id,
              &tab_id,
              "review_ready",
              "model_stopped_candidate_pending",
              &workspace_path,
            );
          }

          // 记忆提炼：每5轮 user 消息触发一次后台提炼（fire-and-forget）
          if should_trigger_tab_memory_extraction(&current_messages) {
            let provider_mem = provider_clone.clone();
            let ws_mem = workspace_path.clone();
            let tab_mem = tab_id.clone();
            let msgs_mem = current_messages.clone();
            tokio::spawn(async move {
              crate::services::memory_service::memory_generation_task_tab(
                provider_mem,
                ws_mem,
                tab_mem,
                msgs_mem,
              )
              .await;
            });
            eprintln!(
              "[memory] MEMORY_WRITE_QUEUED: tab memory extraction triggered for tab={}",
              tab_id
            );
          }

          emit_ai_chat_stream_done(&app_handle, &tab_id, &stream_ctx, None);
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
      eprintln!(
        "🧹 清理取消通道和标志（chat_stream 失败）: tab_id={}",
        tab_id
      );

      // 发送错误事件给前端（统一 stream_state）
      let error_message = format!("AI 请求失败: {}", e);
      let mut stream_ctx_err = StreamContext::default();
      finalize_stream(&mut stream_ctx_err, StreamState::Completed);
      emit_ai_chat_stream_done(&app, &tab_id, &stream_ctx_err, Some(&error_message));

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
  let service_guard = service
    .lock()
    .map_err(|e| format!("获取 AI 服务失败: {}", e))?;

  service_guard.save_api_key(&provider, &key)?;

  // 重新注册提供商
  if provider == "openai" {
    let openai_provider = Arc::new(crate::services::ai_providers::OpenAIProvider::new(key));
    drop(service_guard); // 释放锁
    let service_guard = service
      .lock()
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
  let service_guard = service
    .lock()
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
  let service_guard = service
    .lock()
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
    let service_guard = service
      .lock()
      .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
    service_guard
      .get_provider("deepseek")
      .or_else(|| service_guard.get_provider("openai"))
  };

  let provider = provider
    .ok_or_else(|| "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string())?;

  // 构建消息
  let messages = vec![ChatMessage {
    role: "user".to_string(),
    content: Some(prompt),
    tool_call_id: None,
    name: None,
    tool_calls: None,
  }];

  // 使用默认模型配置
  let model_config = ModelConfig::default();

  // 创建取消令牌（文档分析不需要存储到全局映射，因为它是同步调用）
  let (_, mut cancel_rx) = tokio::sync::oneshot::channel();

  // 调用流式聊天并收集响应
  let mut stream = provider
    .chat_stream(&messages, &model_config, &mut cancel_rx, None)
    .await
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

#[tauri::command]
pub async fn chat_build_generate_outline(
  discussion_context: String,
  model_config: ModelConfig,
  service: State<'_, AIServiceState>,
) -> Result<ChatBuildOutlinePayload, String> {
  let provider_name = chat_build_provider_name(&model_config.model);
  let provider = {
    let service_guard = service
      .lock()
      .map_err(|e| format!("获取 AI 服务失败: {}", e))?;

    if let Some(p) = service_guard.get_provider(provider_name) {
      Some(p)
    } else if provider_name == "deepseek" {
      service_guard.get_provider("openai")
    } else {
      service_guard.get_provider("deepseek")
    }
  }
  .ok_or_else(|| format!("未配置 {} 提供商，请先配置 API key", provider_name))?;

  let prompt = format!(
    concat!(
      "你是 Chat Build P0 的 Build Outline 生成器。\n",
      "根据下面的讨论内容，输出一个 JSON 对象，不要输出 markdown，不要输出额外说明。\n",
      "JSON 结构必须为：\n",
      "{{\n",
      "  \"title\": \"构建标题\",\n",
      "  \"goal\": \"本轮构建目标\",\n",
      "  \"summary\": \"一句话摘要\",\n",
      "  \"steps\": [\n",
      "    {{ \"id\": \"step_1\", \"name\": \"步骤名称\", \"summary\": \"步骤说明\" }}\n",
      "  ]\n",
      "}}\n",
      "要求：\n",
      "1. 生成 3-6 个步骤。\n",
      "2. 步骤必须是可顺序执行的构建步骤。\n",
      "3. 不要出现 discussion build、多角色、人工协作。\n",
      "4. 目标必须基于给定讨论，不要编造无关需求。\n",
      "讨论内容如下：\n{}\n"
    ),
    discussion_context
  );

  let messages = vec![ChatMessage {
    role: "user".to_string(),
    content: Some(prompt),
    tool_call_id: None,
    name: None,
    tool_calls: None,
  }];

  let (_, mut cancel_rx) = tokio::sync::oneshot::channel();
  let mut stream = provider
    .chat_stream(&messages, &model_config, &mut cancel_rx, None)
    .await
    .map_err(|e| format!("生成 Build Outline 失败: {}", e))?;

  let mut response = String::new();
  use tokio_stream::StreamExt;
  while let Some(chunk_result) = stream.next().await {
    match chunk_result {
      Ok(ChatChunk::Text(text)) => response.push_str(&text),
      Ok(ChatChunk::ToolCall { .. }) => continue,
      Err(e) => return Err(format!("生成 Build Outline 失败: {}", e)),
    }
  }

  let json = extract_json_object_block(&response)
    .ok_or_else(|| format!("Build Outline 响应不是有效 JSON: {}", safe_truncate(&response, 200)))?;

  let mut payload: ChatBuildOutlinePayload =
    serde_json::from_str(json).map_err(|e| format!("Build Outline JSON 解析失败: {}", e))?;

  if payload.steps.is_empty() {
    return Err("Build Outline 至少需要一个步骤".to_string());
  }

  for (index, step) in payload.steps.iter_mut().enumerate() {
    if step.id.trim().is_empty() {
      step.id = format!("step_{}", index + 1);
    }
    if step.name.trim().is_empty() {
      return Err(format!("Build Outline 第 {} 步缺少名称", index + 1));
    }
    if step.summary.trim().is_empty() {
      step.summary = "未提供步骤说明".to_string();
    }
  }

  if payload.title.trim().is_empty() {
    payload.title = "未命名构建".to_string();
  }
  if payload.goal.trim().is_empty() {
    payload.goal = "未提供构建目标".to_string();
  }
  if payload.summary.trim().is_empty() {
    payload.summary = "未提供摘要".to_string();
  }

  Ok(payload)
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

// ── 记忆辅助函数 ──────────────────────────────────────────────────────────────

/// 构造记忆检索 query：用户消息前200字符 + 当前文件名 + 选区前100字符
fn build_memory_query(
  user_msg: &str,
  current_file: Option<&str>,
  selected_text: Option<&str>,
) -> String {
  let mut parts: Vec<String> = Vec::new();

  let msg_excerpt: String = user_msg.chars().take(200).collect();
  if !msg_excerpt.is_empty() {
    parts.push(msg_excerpt);
  }

  if let Some(f) = current_file {
    if let Some(name) = std::path::Path::new(f).file_name().and_then(|n| n.to_str()) {
      // strip extension for cleaner token match
      let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
      parts.push(stem.to_string());
    }
  }

  if let Some(sel) = selected_text {
    let sel_excerpt: String = sel.chars().take(100).collect();
    if !sel_excerpt.is_empty() {
      parts.push(sel_excerpt);
    }
  }

  parts.join(" ")
}

fn build_knowledge_query(
  user_msg: &str,
  current_file: Option<&str>,
  selected_text: Option<&str>,
) -> String {
  let mut parts: Vec<String> = Vec::new();

  let msg_excerpt: String = user_msg.chars().take(240).collect();
  if !msg_excerpt.is_empty() {
    parts.push(msg_excerpt);
  }

  if let Some(file) = current_file {
    if let Some(stem) = std::path::Path::new(file)
      .file_stem()
      .and_then(|value| value.to_str())
    {
      parts.push(stem.to_string());
    }
  }

  if let Some(selected) = selected_text {
    let selected_excerpt: String = selected.chars().take(120).collect();
    if !selected_excerpt.is_empty() {
      parts.push(selected_excerpt);
    }
  }

  parts.join(" ")
}

/// 检查是否应触发标签级记忆提炼（每 extraction_interval 轮 user 消息触发一次）
fn should_trigger_tab_memory_extraction(messages: &[ChatMessage]) -> bool {
  let cfg = crate::services::memory_service::ExtractionConfig::load();
  if !cfg.enabled || !cfg.write_enabled {
    return false;
  }
  let interval = cfg.extraction_interval.max(1);
  let user_count = messages
    .iter()
    .filter(|m| m.role == "user" && !is_internal_orchestration_user_message(m))
    .count();
  user_count > 0 && user_count % interval == 0
}
