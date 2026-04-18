// 工具调用服务
use crate::utils::path_validator::PathValidator;
use crate::workspace::canonical_html::{
  canonical_html_for_workspace_cache, materialize_cached_body_if_stale_hash,
  should_run_workspace_canonical_pipeline,
};
use crate::workspace::diff_engine;
use crate::workspace::timeline_support::{
  record_file_content_timeline_node, record_resource_structure_timeline_node,
};
use crate::workspace::workspace_db::WorkspaceDb;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
  pub id: String,
  pub name: String,
  pub arguments: serde_json::Value,
}

/// 工具错误类型：供上层调度或恢复策略区分重试/跳过/中止。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolErrorKind {
  Retryable,
  Skippable,
  Fatal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolGateMeta {
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub stage: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolArtifactMeta {
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub kind: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub artifact_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolVerificationMeta {
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub record_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolConfirmationMeta {
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub record_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultMeta {
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub gate: Option<ToolGateMeta>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub artifact: Option<ToolArtifactMeta>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub verification: Option<ToolVerificationMeta>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub confirmation: Option<ToolConfirmationMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
  pub success: bool,
  pub data: Option<serde_json::Value>,
  pub error: Option<String>,
  pub message: Option<String>,
  /// 错误类型，用于上层调度或恢复策略决策。
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub error_kind: Option<ToolErrorKind>,
  /// 用户可读的中文错误文案
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub display_error: Option<String>,
  /// Phase 2：shadow meta 骨架，暂不改变主闭环，仅预留统一回流位
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub meta: Option<ToolResultMeta>,
}

/// Phase 5: 为变更类工具构造统一的 candidate_ready meta。
/// 两条编辑链（edit_current_editor_document / update_file+use_diff）复用同一语义。
fn build_candidate_meta(tool_name: &str, file_path: &str, diff_count: usize) -> ToolResultMeta {
  ToolResultMeta {
    gate: Some(ToolGateMeta {
      status: Some("candidate_ready".to_string()),
      stage: Some("review".to_string()),
      summary: Some(format!(
        "{}: {} diff(s) queued for {}",
        tool_name, diff_count, file_path
      )),
    }),
    artifact: Some(ToolArtifactMeta {
      kind: Some("diff_candidate".to_string()),
      artifact_id: None,
      status: Some("pending_review".to_string()),
      summary: Some(format!("{} diff(s) awaiting user confirmation", diff_count)),
    }),
    verification: Some(ToolVerificationMeta {
      status: Some("passed".to_string()),
      record_id: None,
      summary: Some("diff generated successfully".to_string()),
    }),
    confirmation: Some(ToolConfirmationMeta {
      status: Some("pending".to_string()),
      record_id: None,
      summary: Some("awaiting user accept/reject".to_string()),
    }),
  }
}

/// Phase 5: 为 NO_OP 结果构造 meta（无变化时验证通过但无候选）
fn build_noop_meta(tool_name: &str) -> ToolResultMeta {
  ToolResultMeta {
    gate: Some(ToolGateMeta {
      status: Some("no_op".to_string()),
      stage: None,
      summary: Some(format!(
        "{}: content unchanged, no diff generated",
        tool_name
      )),
    }),
    artifact: None,
    verification: Some(ToolVerificationMeta {
      status: Some("passed".to_string()),
      record_id: None,
      summary: Some("content comparison passed, no changes needed".to_string()),
    }),
    confirmation: None,
  }
}

/// Phase 5: 为错误返回路径构造 meta，标记 verification.status=failed。
fn build_failure_meta(tool_name: &str, reason: &str) -> ToolResultMeta {
  ToolResultMeta {
    gate: Some(ToolGateMeta {
      status: Some("no_op".to_string()),
      stage: None,
      summary: Some(format!("{}: failed — {}", tool_name, reason)),
    }),
    artifact: None,
    verification: Some(ToolVerificationMeta {
      status: Some("failed".to_string()),
      record_id: None,
      summary: Some(reason.to_string()),
    }),
    confirmation: None,
  }
}

fn tool_requires_confirmation(tool_name: &str) -> bool {
  matches!(
    tool_name,
    "delete_file" | "move_file" | "rename_file" | "create_folder"
  )
}

fn gate_internal_keys() -> [&'static str; 2] {
  ["_confirmation_id", "_confirmation_action"]
}

fn strip_internal_gate_fields(arguments: &serde_json::Value) -> serde_json::Value {
  match arguments {
    serde_json::Value::Object(map) => {
      let mut next = serde_json::Map::new();
      for (key, value) in map {
        if gate_internal_keys().contains(&key.as_str()) {
          continue;
        }
        next.insert(key.clone(), strip_internal_gate_fields(value));
      }
      serde_json::Value::Object(next)
    }
    serde_json::Value::Array(items) => {
      serde_json::Value::Array(items.iter().map(strip_internal_gate_fields).collect())
    }
    other => other.clone(),
  }
}

fn normalize_json_for_gate(value: &serde_json::Value) -> serde_json::Value {
  match value {
    serde_json::Value::Object(map) => {
      let mut keys: Vec<_> = map.keys().cloned().collect();
      keys.sort();
      let mut next = serde_json::Map::new();
      for key in keys {
        if let Some(val) = map.get(&key) {
          next.insert(key, normalize_json_for_gate(val));
        }
      }
      serde_json::Value::Object(next)
    }
    serde_json::Value::Array(items) => {
      serde_json::Value::Array(items.iter().map(normalize_json_for_gate).collect())
    }
    other => other.clone(),
  }
}

fn confirmation_record_id(tool_call: &ToolCall) -> String {
  let normalized_args = normalize_json_for_gate(&strip_internal_gate_fields(&tool_call.arguments));
  let args_str = serde_json::to_string(&normalized_args).unwrap_or_else(|_| "{}".to_string());
  format!(
    "tool-confirm:{}:{}:{}",
    tool_call.id, tool_call.name, args_str
  )
}

fn build_confirmation_pending_result(tool_call: &ToolCall) -> ToolResult {
  let record_id = confirmation_record_id(tool_call);
  ToolResult {
    success: true,
    data: Some(serde_json::json!({
      "awaiting_confirmation": true,
      "confirmation_record_id": record_id,
      "tool_name": tool_call.name,
      "tool_call_id": tool_call.id,
    })),
    error: None,
    message: Some(format!("工具 {} 需要用户确认后才能执行", tool_call.name)),
    error_kind: None,
    display_error: None,
    meta: Some(ToolResultMeta {
      gate: Some(ToolGateMeta {
        status: Some("awaiting_confirmation".to_string()),
        stage: Some("confirmation".to_string()),
        summary: Some(format!(
          "{} is blocked until user confirmation",
          tool_call.name
        )),
      }),
      artifact: None,
      verification: Some(ToolVerificationMeta {
        status: Some("passed".to_string()),
        record_id: None,
        summary: Some("confirmation gate matched".to_string()),
      }),
      confirmation: Some(ToolConfirmationMeta {
        status: Some("pending".to_string()),
        record_id: Some(record_id),
        summary: Some("awaiting explicit user authorization".to_string()),
      }),
    }),
  }
}

fn build_confirmation_rejected_result(tool_call: &ToolCall, record_id: String) -> ToolResult {
  ToolResult {
    success: false,
    data: Some(serde_json::json!({
      "awaiting_confirmation": false,
      "confirmation_record_id": record_id,
      "tool_name": tool_call.name,
      "tool_call_id": tool_call.id,
    })),
    error: Some("用户拒绝了该工具操作".to_string()),
    message: Some(format!("工具 {} 已被用户拒绝", tool_call.name)),
    error_kind: Some(ToolErrorKind::Skippable),
    display_error: Some("用户拒绝了该操作".to_string()),
    meta: Some(ToolResultMeta {
      gate: Some(ToolGateMeta {
        status: Some("failed".to_string()),
        stage: Some("confirmation".to_string()),
        summary: Some("user denied the requested tool".to_string()),
      }),
      artifact: None,
      verification: Some(ToolVerificationMeta {
        status: Some("passed".to_string()),
        record_id: None,
        summary: Some("confirmation gate matched".to_string()),
      }),
      confirmation: Some(ToolConfirmationMeta {
        status: Some("rejected".to_string()),
        record_id: Some(record_id),
        summary: Some("user denied this tool call".to_string()),
      }),
    }),
  }
}

fn sanitize_confirmation_arguments(tool_call: &ToolCall) -> serde_json::Value {
  strip_internal_gate_fields(&tool_call.arguments)
}

fn parse_confirmation_action(tool_call: &ToolCall) -> Option<String> {
  tool_call
    .arguments
    .get("_confirmation_action")
    .and_then(|v| v.as_str())
    .map(|s| s.to_lowercase())
}

fn requires_reviewed_document_write(file_path: &Path) -> bool {
  matches!(
    file_path
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.to_lowercase())
      .as_deref(),
    Some("md")
      | Some("markdown")
      | Some("txt")
      | Some("html")
      | Some("htm")
      | Some("rst")
      | Some("docx")
      | Some("doc")
      | Some("odt")
      | Some("rtf")
  )
}

fn map_path_validation_error(err: crate::utils::path_validator::PathValidationError) -> String {
  err.to_string()
}

impl Default for ToolResult {
  fn default() -> Self {
    Self {
      success: false,
      data: None,
      error: None,
      message: None,
      error_kind: None,
      display_error: None,
      meta: None,
    }
  }
}

pub const E_ROUTE_MISMATCH: &str = "E_ROUTE_MISMATCH";
pub const E_TARGET_NOT_READY: &str = "E_TARGET_NOT_READY";
pub const E_RANGE_UNRESOLVABLE: &str = "E_RANGE_UNRESOLVABLE";
pub const E_REFRESH_FAILED: &str = "E_REFRESH_FAILED";
pub const E_BLOCKTREE_NODE_MISSING: &str = "E_BLOCKTREE_NODE_MISSING";
pub const E_BLOCKTREE_STALE: &str = "E_BLOCKTREE_STALE";
pub const E_BLOCKTREE_BUILD_FAILED: &str = "E_BLOCKTREE_BUILD_FAILED";
pub const E_ORIGINALTEXT_MISMATCH: &str = "E_ORIGINALTEXT_MISMATCH";
pub const E_PARTIAL_OVERLAP: &str = "E_PARTIAL_OVERLAP";
pub const E_BASELINE_MISMATCH: &str = "E_BASELINE_MISMATCH";
pub const E_APPLY_FAILED: &str = "E_APPLY_FAILED";

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExposureLevel {
  Info,
  Warn,
  Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExposurePhase {
  Route,
  Resolve,
  Validate,
  Apply,
  Refresh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionExposure {
  pub exposure_id: String,
  pub level: ExposureLevel,
  pub phase: ExposurePhase,
  pub code: String,
  pub message: String,
  pub target_file: String,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub diff_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub baseline_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub route_source: Option<String>,
  pub timestamp: u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// 对话编辑 Resolver（§6 主控设计文档）
// ─────────────────────────────────────────────────────────────────────────────

/// 块结构条目（Resolver Step 1 输出）
struct BlockEntry {
  block_id: String,
  #[allow(dead_code)]
  block_type: String,
  /// strip 标签后的纯文本
  text_content: String,
  /// chars().count()，不是 len()
  char_count: usize,
}

/// Resolver 输入（§6.1）
pub struct ResolverInput {
  // 模型提供
  pub block_index: Option<usize>,
  pub edit_mode: String,
  pub target: Option<String>,
  pub content: Option<String>,
  /// 默认 0
  pub occurrence_index: usize,
  // 系统提供（零搜索路径 Step 2a）
  pub selection_start_block_id: Option<String>,
  pub selection_start_offset: Option<usize>,
  pub selection_end_block_id: Option<String>,
  pub selection_end_offset: Option<usize>,
  pub selected_text: Option<String>,
  // 文档来源
  pub target_file: String,
  pub current_editor_content: String,
  // 基线绑定（RequestContext.baselineId）
  pub baseline_id: Option<String>,
}

/// Resolver 内部输出（Step 3 之前）
#[derive(Debug)]
struct CanonicalDiffBuilt {
  start_block_id: String,
  start_offset: usize,
  end_block_id: String,
  end_offset: usize,
  original_text: String,
  new_text: String,
  /// "precise" | "block_level" | "document_level"
  diff_type: String,
  /// "replace" | "delete" | "insert"
  edit_type: String,
  /// "selection" | "reference" | "block_search"
  route_source: String,
  /// BlockTree 退化/异常错误码暴露（为空表示无异常）
  resolver_error_codes: Vec<String>,
}

pub struct ToolService;

impl ToolService {
  pub fn new() -> Self {
    ToolService
  }

  fn resolve_relative_path(
    &self,
    workspace_path: &Path,
    relative_path: &str,
  ) -> Result<PathBuf, String> {
    PathValidator::resolve_workspace_relative_path(workspace_path, relative_path)
      .map_err(map_path_validation_error)
  }

  fn validate_existing_path(&self, path: &Path, workspace_path: &Path) -> Result<PathBuf, String> {
    PathValidator::validate_workspace_path(path, workspace_path).map_err(map_path_validation_error)
  }

  fn validate_write_target(&self, path: &Path, workspace_path: &Path) -> Result<PathBuf, String> {
    PathValidator::validate_workspace_write_target(path, workspace_path)
      .map_err(map_path_validation_error)
  }

  /// 执行工具调用
  pub async fn execute_tool(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    // 验证工作区路径
    if !workspace_path.exists() {
      return Err("工作区路径不存在".to_string());
    }

    if tool_requires_confirmation(&tool_call.name) {
      let expected_record_id = confirmation_record_id(tool_call);
      match parse_confirmation_action(tool_call).as_deref() {
        Some("confirm") => {
          let provided_record_id = tool_call
            .arguments
            .get("_confirmation_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 confirmation_id 参数".to_string())?;
          if provided_record_id != expected_record_id {
            return Err("确认记录与待执行工具不匹配".to_string());
          }
        }
        Some("deny") => {
          let provided_record_id = tool_call
            .arguments
            .get("_confirmation_id")
            .and_then(|v| v.as_str())
            .unwrap_or(expected_record_id.as_str())
            .to_string();
          return Ok(build_confirmation_rejected_result(
            tool_call,
            provided_record_id,
          ));
        }
        Some(other) => {
          return Err(format!("未知的 confirmation_action: {}", other));
        }
        None => return Ok(build_confirmation_pending_result(tool_call)),
      }
    }

    let sanitized_tool_call = if tool_requires_confirmation(&tool_call.name) {
      ToolCall {
        id: tool_call.id.clone(),
        name: tool_call.name.clone(),
        arguments: sanitize_confirmation_arguments(tool_call),
      }
    } else {
      tool_call.clone()
    };

    match sanitized_tool_call.name.as_str() {
      "read_file" => self.read_file(&sanitized_tool_call, workspace_path).await,
      "create_file" => self.create_file(&sanitized_tool_call, workspace_path).await,
      "update_file" => self.update_file(&sanitized_tool_call, workspace_path).await,
      "delete_file" => self.delete_file(&sanitized_tool_call, workspace_path).await,
      "list_files" => self.list_files(&sanitized_tool_call, workspace_path).await,
      "search_files" => {
        self
          .search_files(&sanitized_tool_call, workspace_path)
          .await
      }
      "move_file" => self.move_file(&sanitized_tool_call, workspace_path).await,
      "rename_file" => self.rename_file(&sanitized_tool_call, workspace_path).await,
      "create_folder" => {
        self
          .create_folder(&sanitized_tool_call, workspace_path)
          .await
      }
      "get_current_editor_file" => self.get_current_editor_file(&sanitized_tool_call).await,
      "edit_current_editor_document" => {
        self
          .edit_current_editor_document(&sanitized_tool_call)
          .await
      }
      "save_file_dependency" => {
        self
          .save_file_dependency(&sanitized_tool_call, workspace_path)
          .await
      }
      _ => Err(format!("未知的工具: {}", tool_call.name)),
    }
  }

  /// 读取文件内容
  async fn read_file(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let file_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 path 参数".to_string())?;

    let full_path = self.resolve_relative_path(workspace_path, file_path)?;

    // 检查文件是否存在
    if !full_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("文件不存在: {}", file_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 检查文件扩展名，如果是 DOCX，需要使用 Pandoc 转换
    let ext = full_path
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.to_lowercase());

    if ext.as_deref() == Some("docx") || file_path.ends_with(".draft.docx") {
      // DOCX 文件：使用 Pandoc 转换为纯文本
      use crate::services::pandoc_service::PandocService;
      let pandoc_service = PandocService::new();

      if !pandoc_service.is_available() {
        return Ok(ToolResult {
          success: false,
          data: None,
          error: Some(
            "Pandoc 不可用，无法读取 DOCX 文件。请安装 Pandoc 或使用其他格式。".to_string(),
          ),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        });
      }

      // 使用 Pandoc 将 DOCX 转换为 HTML（不设置工作目录，保持原行为）
      match pandoc_service.convert_document_to_html(&full_path, None) {
        Ok(html_content) => {
          // 从 HTML 中提取纯文本（简单处理）
          // 注意：这里返回的是 HTML，如果需要纯文本，可以进一步处理
          // 但为了保持兼容性，先返回 HTML
          Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "path": file_path,
                "content": html_content,
                "size": html_content.len(),
                "format": "html",
            })),
            error: None,
            message: Some(format!(
              "成功读取 DOCX 文件（已转换为 HTML）: {}",
              file_path
            )),
            error_kind: None,
            display_error: None,
            meta: None,
          })
        }
        Err(e) => Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("读取 DOCX 文件失败: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        }),
      }
    } else {
      // 普通文本文件：直接读取
      match std::fs::read_to_string(&full_path) {
        Ok(content) => Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
              "path": file_path,
              "content": content,
              "size": content.len(),
          })),
          error: None,
          message: Some(format!("成功读取文件: {}", file_path)),
          error_kind: None,
          display_error: None,
          meta: None,
        }),
        Err(e) => Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("读取文件失败: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        }),
      }
    }
  }

  /// 创建文件（原子写入）
  async fn create_file(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    eprintln!(
      "🔧 create_file 调用参数: {}",
      serde_json::to_string(&tool_call.arguments).unwrap_or_default()
    );

    let file_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| {
        eprintln!(
          "❌ create_file 缺少 path 参数，arguments: {:?}",
          tool_call.arguments
        );
        "缺少 path 参数".to_string()
      })?;

    // content 可以为空字符串，但不能缺失
    let content = tool_call
      .arguments
      .get("content")
      .and_then(|v| v.as_str())
      .unwrap_or(""); // 如果 content 不存在，使用空字符串

    let full_path = self.resolve_relative_path(workspace_path, file_path)?;
    self.validate_write_target(&full_path, workspace_path)?;

    // 检查文件是否已存在
    if full_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("文件已存在: {}", file_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 创建父目录
    if let Some(parent) = full_path.parent() {
      if let Err(e) = std::fs::create_dir_all(parent) {
        return Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("创建目录失败: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        });
      }
    }

    // 检查文件扩展名，如果是 DOCX，需要特殊处理
    let ext = full_path
      .extension()
      .and_then(|s| s.to_str())
      .map(|s| s.to_lowercase());

    if ext.as_deref() == Some("docx") {
      // DOCX 文件：使用 Pandoc 将内容转换为 DOCX 格式
      use crate::services::pandoc_service::PandocService;
      let pandoc_service = PandocService::new();

      if !pandoc_service.is_available() {
        return Ok(ToolResult {
          success: false,
          data: None,
          error: Some(
            "Pandoc 不可用，无法创建 DOCX 文件。请安装 Pandoc 或使用其他格式。".to_string(),
          ),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        });
      }

      // 将内容（Markdown 或 HTML）转换为 DOCX
      match pandoc_service.convert_html_to_docx(&content, &full_path) {
        Ok(_) => {
          let db = WorkspaceDb::new(workspace_path)
            .map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
          let _ = record_resource_structure_timeline_node(
            &db,
            workspace_path,
            "create_file",
            &format!("AI 创建文件：{}", file_path),
            "ai",
            &[full_path.clone()],
          )?;
          Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "path": file_path,
                "format": "docx",
            })),
            error: None,
            message: Some(format!("成功创建 DOCX 文件: {}", file_path)),
            error_kind: None,
            display_error: None,
            meta: None,
          })
        }
        Err(e) => Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("转换 DOCX 失败: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        }),
      }
    } else {
      // 其他文件：直接写入文本内容
      match self.atomic_write_file(&full_path, content.as_bytes()) {
        Ok(_) => {
          let db = WorkspaceDb::new(workspace_path)
            .map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
          let _ = record_resource_structure_timeline_node(
            &db,
            workspace_path,
            "create_file",
            &format!("AI 创建文件：{}", file_path),
            "ai",
            &[full_path.clone()],
          )?;
          Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "path": file_path,
                "size": content.len(),
            })),
            error: None,
            message: Some(format!("成功创建文件: {}", file_path)),
            error_kind: None,
            display_error: None,
            meta: None,
          })
        }
        Err(e) => Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("写入文件失败: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        }),
      }
    }
  }

  /// 更新文件（原子写入）
  async fn update_file(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let file_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 path 参数".to_string())?;

    let content = tool_call
      .arguments
      .get("content")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 content 参数".to_string())?;

    {
      let content_preview: String = content.chars().take(80).collect();
      eprintln!(
        "[CROSS_FILE_TRACE][TOOL] {{\"tool\":\"update_file\",\"target_file\":{:?},\"tool_call_id\":{:?},\"content_len\":{},\"content_preview\":{:?}}}",
        file_path,
        tool_call.id,
        content.len(),
        content_preview,
      );
    }

    let full_path = self.resolve_relative_path(workspace_path, file_path)?;
    self.validate_write_target(&full_path, workspace_path)?;

    // 检查文件是否存在
    if !full_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("文件不存在: {}", file_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: Some(build_failure_meta("update_file", "file not found")),
      });
    }

    let db =
      WorkspaceDb::new(workspace_path).map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;

    let mtime = std::fs::metadata(&full_path)
      .and_then(|m| m.modified())
      .map(|t| {
        t.duration_since(std::time::UNIX_EPOCH)
          .unwrap_or_default()
          .as_secs() as i64
      })
      .unwrap_or(0);

    let file_type = full_path
      .extension()
      .and_then(|e| e.to_str())
      .unwrap_or("txt")
      .to_lowercase();

    let old_content = match db.get_file_cache(file_path)? {
      Some(entry) if entry.mtime == mtime => materialize_cached_body_if_stale_hash(
        &db,
        file_path,
        &file_type,
        entry.cached_content.clone(),
        entry.content_hash.clone(),
        mtime,
      )?,
      _ => {
        let raw = if file_type == "docx" {
          use crate::services::pandoc_service::PandocService;
          let pandoc = PandocService::new();
          if pandoc.is_available() {
            pandoc
              .convert_document_to_html(&full_path, full_path.parent())
              .map_err(|e| format!("读取 DOCX 失败: {}", e))?
          } else {
            return Ok(ToolResult {
              success: false,
              data: None,
              error: Some("Pandoc 不可用，无法读取 DOCX".to_string()),
              message: None,
              error_kind: None,
              display_error: None,
              meta: Some(build_failure_meta("update_file", "pandoc unavailable")),
            });
          }
        } else {
          std::fs::read_to_string(&full_path).map_err(|e| format!("读取文件失败: {}", e))?
        };
        if should_run_workspace_canonical_pipeline(&file_type) {
          let (html, hash) = canonical_html_for_workspace_cache(&raw);
          db.upsert_file_cache(
            file_path,
            &file_type,
            Some(&html),
            Some(hash.as_str()),
            mtime,
          )?;
          html
        } else {
          db.upsert_file_cache(file_path, &file_type, Some(&raw), None, mtime)?;
          raw
        }
      }
    };

    // use_diff：生成 pending diffs，不写盘
    let requested_use_diff = tool_call
      .arguments
      .get("use_diff")
      .and_then(|v| v.as_bool())
      .unwrap_or(true);
    let use_diff = if requires_reviewed_document_write(&full_path) {
      true
    } else {
      requested_use_diff
    };

    if use_diff {
      let diffs =
        diff_engine::generate_pending_diffs_for_file_type(&old_content, content, &file_type);
      let rows: Vec<(String, String, i32, String)> = diffs
        .iter()
        .map(|d| {
          (
            d.original_text.clone(),
            d.new_text.clone(),
            d.para_index,
            d.diff_type.clone(),
          )
        })
        .collect();

      let entries = db.insert_pending_diffs(file_path, &rows)?;
      let pending_dtos: Vec<serde_json::Value> = entries
        .iter()
        .map(|e| {
          serde_json::json!({
              "id": e.id,
              "file_path": e.file_path,
              "diff_index": e.diff_index,
              "original_text": e.original_text,
              "new_text": e.new_text,
              "para_index": e.para_index,
              "diff_type": e.diff_type,
              "status": e.status,
          })
        })
        .collect();

      let diff_count = entries.len();
      return Ok(ToolResult {
        success: true,
        data: Some(serde_json::json!({
            "written": false,
            "path": file_path,
            "pending_diffs": pending_dtos,
        })),
        error: None,
        message: Some(
          if !requested_use_diff && requires_reviewed_document_write(&full_path) {
            format!(
              "文档型文件不允许 AI 直接写盘，已改为生成 {} 处待确认修改",
              diff_count
            )
          } else {
            format!("已生成 {} 处待确认修改，请用户确认后写盘", diff_count)
          },
        ),
        error_kind: None,
        display_error: None,
        meta: Some(build_candidate_meta("update_file", file_path, diff_count)),
      });
    }

    // 原子写入文件
    match self.atomic_write_file(&full_path, content.as_bytes()) {
      Ok(_) => {
        let _ = record_file_content_timeline_node(
          &db,
          workspace_path,
          file_path,
          &file_type,
          "update_file",
          &format!("AI 直接更新文件：{}", file_path),
          "ai",
          &old_content,
          content,
        )?;
        Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
              "path": file_path,
              "size": content.len(),
          })),
          error: None,
          message: Some(format!("成功更新文件: {}", file_path)),
          error_kind: None,
          display_error: None,
          meta: None,
        })
      }
      Err(e) => Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("写入文件失败: {}", e)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: Some(build_failure_meta("update_file", "write failed")),
      }),
    }
  }

  /// 删除文件
  async fn delete_file(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let file_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 path 参数".to_string())?;

    let full_path = self.resolve_relative_path(workspace_path, file_path)?;
    self.validate_write_target(&full_path, workspace_path)?;

    // 检查文件或文件夹是否存在
    if !full_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("文件或文件夹不存在: {}", file_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 判断是文件还是文件夹，使用不同的删除方法
    let metadata = match std::fs::metadata(&full_path) {
      Ok(m) => m,
      Err(e) => {
        return Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("无法获取文件信息: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        });
      }
    };

    // 删除文件或文件夹
    let result = if metadata.is_dir() {
      // 删除文件夹（递归删除）
      std::fs::remove_dir_all(&full_path)
    } else {
      // 删除文件
      std::fs::remove_file(&full_path)
    };

    match result {
      Ok(_) => {
        let db =
          WorkspaceDb::new(workspace_path).map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
        let _ = record_resource_structure_timeline_node(
          &db,
          workspace_path,
          "delete_file",
          &format!("AI 删除资源：{}", file_path),
          "ai",
          &[full_path.clone()],
        )?;
        Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
              "path": file_path,
              "type": if metadata.is_dir() { "folder" } else { "file" },
          })),
          error: None,
          message: Some(format!(
            "成功删除{}: {}",
            if metadata.is_dir() {
              "文件夹"
            } else {
              "文件"
            },
            file_path
          )),
          error_kind: None,
          display_error: None,
          meta: None,
        })
      }
      Err(e) => Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!(
          "删除{}失败: {}",
          if metadata.is_dir() {
            "文件夹"
          } else {
            "文件"
          },
          e
        )),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      }),
    }
  }

  /// 列出文件
  async fn list_files(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let dir_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .unwrap_or(".");

    let full_path = if dir_path == "." || dir_path.is_empty() {
      self.validate_existing_path(workspace_path, workspace_path)?
    } else {
      self.resolve_relative_path(workspace_path, dir_path)?
    };
    if full_path.exists() {
      self.validate_existing_path(&full_path, workspace_path)?;
    }

    // 检查目录是否存在
    if !full_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("目录不存在: {}", dir_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 列出文件
    match std::fs::read_dir(&full_path) {
      Ok(entries) => {
        let mut files = Vec::new();
        for entry in entries {
          if let Ok(entry) = entry {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let is_dir = path.is_dir();
            files.push(serde_json::json!({
                "name": name,
                "path": path.strip_prefix(workspace_path)
                    .ok()
                    .and_then(|p| p.to_str())
                    .unwrap_or(""),
                "is_directory": is_dir,
            }));
          }
        }
        Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
              "path": dir_path,
              "files": files,
          })),
          error: None,
          message: Some(format!("成功列出目录: {}", dir_path)),
          error_kind: None,
          display_error: None,
          meta: None,
        })
      }
      Err(e) => Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("读取目录失败: {}", e)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      }),
    }
  }

  /// 搜索文件
  async fn search_files(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let query = tool_call
      .arguments
      .get("query")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 query 参数".to_string())?;

    // 简单的文件名搜索（后续可以优化为全文搜索）
    let mut results = Vec::new();
    self.search_files_recursive(workspace_path, workspace_path, query, &mut results)?;

    Ok(ToolResult {
      success: true,
      data: Some(serde_json::json!({
          "query": query,
          "results": results,
      })),
      error: None,
      message: Some(format!("找到 {} 个匹配的文件", results.len())),
      error_kind: None,
      display_error: None,
      meta: None,
    })
  }

  fn search_files_recursive(
    &self,
    root: &Path,
    current: &Path,
    query: &str,
    results: &mut Vec<serde_json::Value>,
  ) -> Result<(), String> {
    if let Ok(entries) = std::fs::read_dir(current) {
      for entry in entries {
        if let Ok(entry) = entry {
          let path = entry.path();
          let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

          if name.contains(query) {
            results.push(serde_json::json!({
                "name": name,
                "path": path.strip_prefix(root)
                    .ok()
                    .and_then(|p| p.to_str())
                    .unwrap_or(""),
                "is_directory": path.is_dir(),
            }));
          }

          if path.is_dir() {
            self.search_files_recursive(root, &path, query, results)?;
          }
        }
      }
    }
    Ok(())
  }

  /// 移动文件
  async fn move_file(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let source_path = tool_call
      .arguments
      .get("source")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 source 参数".to_string())?;

    let dest_path = tool_call
      .arguments
      .get("destination")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 destination 参数".to_string())?;

    let source_full = self.resolve_relative_path(workspace_path, source_path)?;
    let dest_full = self.resolve_relative_path(workspace_path, dest_path)?;
    self.validate_write_target(&dest_full, workspace_path)?;
    if source_full.exists() {
      self.validate_existing_path(&source_full, workspace_path)?;
    }

    // 检查源文件是否存在
    if !source_full.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("源文件不存在: {}", source_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 检查目标文件是否已存在
    if dest_full.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("目标文件已存在: {}", dest_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    if dest_full.starts_with(&source_full) {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some("不能将资源移动到其自身子路径内".to_string()),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 创建目标目录
    if let Some(parent) = dest_full.parent() {
      if let Err(e) = std::fs::create_dir_all(parent) {
        return Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("创建目标目录失败: {}", e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        });
      }
    }

    // 移动文件
    match std::fs::rename(&source_full, &dest_full) {
      Ok(_) => {
        let db =
          WorkspaceDb::new(workspace_path).map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
        let _ = record_resource_structure_timeline_node(
          &db,
          workspace_path,
          "move_file",
          &format!("AI 移动资源：{} -> {}", source_path, dest_path),
          "ai",
          &[source_full.clone(), dest_full.clone()],
        )?;
        Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
              "source": source_path,
              "destination": dest_path,
          })),
          error: None,
          message: Some(format!("成功移动文件: {} -> {}", source_path, dest_path)),
          error_kind: None,
          display_error: None,
          meta: None,
        })
      }
      Err(e) => Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("移动文件失败: {}", e)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      }),
    }
  }

  /// 重命名文件
  async fn rename_file(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let file_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 path 参数".to_string())?;

    let new_name = tool_call
      .arguments
      .get("new_name")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 new_name 参数".to_string())?;

    let full_path = self.resolve_relative_path(workspace_path, file_path)?;

    if new_name.contains("..") || new_name.contains("/") || new_name.contains("\\") {
      return Err("路径不安全".to_string());
    }

    if full_path.exists() {
      self.validate_existing_path(&full_path, workspace_path)?;
    }

    // 检查文件是否存在
    if !full_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("文件不存在: {}", file_path)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 构建新路径
    let parent = full_path
      .parent()
      .ok_or_else(|| "无法获取父目录".to_string())?;
    let new_path = parent.join(new_name);
    self.validate_write_target(&new_path, workspace_path)?;

    // 检查新名称是否已存在
    if new_path.exists() {
      return Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("目标名称已存在: {}", new_name)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      });
    }

    // 重命名文件
    match std::fs::rename(&full_path, &new_path) {
      Ok(_) => {
        // 计算新的相对路径
        let new_relative = new_path
          .strip_prefix(workspace_path)
          .ok()
          .and_then(|p| p.to_str())
          .unwrap_or("");

        let db =
          WorkspaceDb::new(workspace_path).map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
        let _ = record_resource_structure_timeline_node(
          &db,
          workspace_path,
          "rename_file",
          &format!("AI 重命名资源：{} -> {}", file_path, new_name),
          "ai",
          &[full_path.clone(), new_path.clone()],
        )?;

        Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
              "old_path": file_path,
              "new_path": new_relative,
              "new_name": new_name,
          })),
          error: None,
          message: Some(format!("成功重命名文件: {} -> {}", file_path, new_name)),
          error_kind: None,
          display_error: None,
          meta: None,
        })
      }
      Err(e) => Ok(ToolResult {
        success: false,
        data: None,
        error: Some(format!("重命名文件失败: {}", e)),
        message: None,
        error_kind: None,
        display_error: None,
        meta: None,
      }),
    }
  }

  /// 创建文件夹
  async fn create_folder(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    eprintln!(
      "🔧 create_folder 调用参数: {}",
      serde_json::to_string(&tool_call.arguments).unwrap_or_default()
    );
    eprintln!("🔧 工作区路径: {:?}", workspace_path);

    let folder_path = tool_call
      .arguments
      .get("path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| {
        eprintln!(
          "❌ create_folder 缺少 path 参数，arguments: {:?}",
          tool_call.arguments
        );
        "缺少 path 参数".to_string()
      })?;

    let full_path = self.resolve_relative_path(workspace_path, folder_path)?;
    eprintln!("🔧 完整路径: {:?}", full_path);

    self.validate_write_target(&full_path, workspace_path)?;

    let existed_before = full_path.exists();

    // 检查文件夹是否已存在
    if full_path.exists() {
      if full_path.is_dir() {
        eprintln!("✅ 文件夹已存在: {:?}", full_path);
        return Ok(ToolResult {
          success: true,
          data: Some(serde_json::json!({
            "path": folder_path,
            "full_path": full_path.to_string_lossy().to_string(),
            "message": "文件夹已存在",
          })),
          error: None,
          message: Some(format!("文件夹已存在: {}", folder_path)),
          error_kind: None,
          display_error: None,
          meta: None,
        });
      } else {
        eprintln!("❌ 路径已存在但不是文件夹: {:?}", full_path);
        return Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("路径已存在但不是文件夹: {}", folder_path)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        });
      }
    }

    // 创建文件夹
    eprintln!("🚀 开始创建文件夹: {:?}", full_path);
    match std::fs::create_dir_all(&full_path) {
      Ok(_) => {
        eprintln!("✅ 文件夹创建成功: {:?}", full_path);
        // 验证文件夹是否真的创建成功
        if full_path.exists() && full_path.is_dir() {
          if !existed_before {
            let db = WorkspaceDb::new(workspace_path)
              .map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
            let _ = record_resource_structure_timeline_node(
              &db,
              workspace_path,
              "create_folder",
              &format!("AI 创建文件夹：{}", folder_path),
              "ai",
              &[full_path.clone()],
            )?;
          }
          Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "path": folder_path,
                "full_path": full_path.to_string_lossy().to_string(),
            })),
            error: None,
            message: Some(format!("成功创建文件夹: {}", folder_path)),
            error_kind: None,
            display_error: None,
            meta: None,
          })
        } else {
          eprintln!("⚠️ 文件夹创建后验证失败: {:?}", full_path);
          Ok(ToolResult {
            success: false,
            data: None,
            error: Some(format!("文件夹创建后验证失败: {}", folder_path)),
            message: None,
            error_kind: None,
            display_error: None,
            meta: None,
          })
        }
      }
      Err(e) => {
        eprintln!("❌ 创建文件夹失败: {:?} - {}", full_path, e);
        Ok(ToolResult {
          success: false,
          data: None,
          error: Some(format!("创建文件夹失败: {} - {}", folder_path, e)),
          message: None,
          error_kind: None,
          display_error: None,
          meta: None,
        })
      }
    }
  }

  /// 获取当前编辑器打开的文件
  /// 注意：这个工具需要通过事件系统与前端通信，这里返回一个占位符
  async fn get_current_editor_file(&self, _tool_call: &ToolCall) -> Result<ToolResult, String> {
    // 这个工具需要前端状态信息，返回提示信息
    Ok(ToolResult {
      success: true,
      data: Some(serde_json::json!({
          "message": "请在前端自动引用当前编辑器打开的文件",
          "note": "当前编辑器打开的文件会自动添加到引用中"
      })),
      error: None,
      message: Some("当前编辑器打开的文件信息会通过引用系统提供".to_string()),
      error_kind: None,
      display_error: None,
      meta: None,
    })
  }

  /// Phase 0.5：从 HTML 中提取跨块或单块文本
  /// 单块：start_block_id == end_block_id，取 [start_offset, end_offset]
  /// 跨块：start 块 [start_offset..] + "\n" + 中间块全文 + "\n" + end 块 [..end_offset]
  fn extract_block_range(
    html_content: &str,
    start_block_id: &str,
    start_offset: usize,
    end_block_id: &str,
    end_offset: usize,
  ) -> Result<String, String> {
    let document = Html::parse_document(html_content);
    let block_selector =
      Selector::parse("[data-block-id]").map_err(|e| format!("Selector 解析失败: {}", e))?;
    let blocks: Vec<_> = document.select(&block_selector).collect();

    if start_block_id == end_block_id {
      let el = blocks
        .iter()
        .find(|e| e.value().attr("data-block-id") == Some(start_block_id))
        .ok_or_else(|| format!("未找到 block_id={} 的块", start_block_id))?;
      let text: String = el.text().collect();
      let chars: Vec<_> = text.chars().collect();
      let len = chars.len();
      if start_offset >= len || end_offset > len || start_offset >= end_offset {
        return Err(format!(
          "offset 越界: start={}, end={}, block_len={}",
          start_offset, end_offset, len
        ));
      }
      return Ok(chars[start_offset..end_offset].iter().collect());
    }

    let start_idx = blocks
      .iter()
      .position(|e| e.value().attr("data-block-id") == Some(start_block_id))
      .ok_or_else(|| format!("未找到 start_block_id={} 的块", start_block_id))?;
    let end_idx = blocks
      .iter()
      .position(|e| e.value().attr("data-block-id") == Some(end_block_id))
      .ok_or_else(|| format!("未找到 end_block_id={} 的块", end_block_id))?;
    if start_idx > end_idx {
      return Err("start block 必须在 end block 之前".to_string());
    }

    let block_separator = "\n";
    let mut parts = vec![];
    for (i, el) in blocks[start_idx..=end_idx].iter().enumerate() {
      let text: String = el.text().collect();
      let chars: Vec<_> = text.chars().collect();
      let len = chars.len();
      if i == 0 {
        if start_offset >= len {
          return Err(format!(
            "start_offset 越界: start_offset={}, block_len={}",
            start_offset, len
          ));
        }
        parts.push(chars[start_offset..].iter().collect::<String>());
      } else if i == end_idx - start_idx {
        if end_offset > len {
          return Err(format!(
            "end_offset 越界: end_offset={}, block_len={}",
            end_offset, len
          ));
        }
        parts.push(chars[..end_offset].iter().collect::<String>());
      } else {
        parts.push(text);
      }
    }
    Ok(parts.join(block_separator))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resolver（§6 主控设计文档）
  // ─────────────────────────────────────────────────────────────────────────

  /// Step 1：从 HTML 中按文档顺序提取 data-block-id 块。
  fn extract_block_map(html: &str) -> Vec<BlockEntry> {
    let document = Html::parse_document(html);
    let selector = match Selector::parse("[data-block-id]") {
      Ok(s) => s,
      Err(_) => return Vec::new(),
    };
    let mut result = Vec::new();
    for el in document.select(&selector) {
      let block_id = el.value().attr("data-block-id").unwrap_or("").to_string();
      let block_type = el.value().name().to_string();
      let text_content: String = el.text().collect();
      let char_count = text_content.chars().count();
      result.push(BlockEntry {
        block_id,
        block_type,
        text_content,
        char_count,
      });
    }
    result
  }

  /// Phase-4：优先使用 baseline 绑定的 BlockTreeIndex；不可用时线性回退。
  /// 返回值：(block_map, error_codes)
  fn resolve_block_map_with_fallback(
    baseline_id: Option<&str>,
    html: &str,
  ) -> (Vec<BlockEntry>, Vec<String>) {
    use crate::services::block_tree_index::get_or_build_for_baseline;

    match get_or_build_for_baseline(baseline_id, html) {
      Ok(acquired) => {
        let first_node_meta = acquired
          .index
          .nodes
          .first()
          .map(|n| {
            format!(
              "#{} {} text_hash={}..",
              n.block_index,
              n.path,
              n.text_hash.chars().take(8).collect::<String>()
            )
          })
          .unwrap_or_else(|| "none".to_string());
        eprintln!(
          "[positioning][BlockTree] baseline_id={:?} cache_hit={} nodes={} content_hash={}.. first_node={}",
          acquired.index.baseline_id,
          acquired.cache_hit,
          acquired.index.nodes.len(),
          &acquired
            .index
            .content_hash
            .chars()
            .take(8)
            .collect::<String>(),
          first_node_meta
        );
        let map = acquired
          .index
          .nodes
          .iter()
          .map(|n| BlockEntry {
            block_id: n.block_id.clone(),
            block_type: n.block_type.clone(),
            text_content: n.text_content.clone(),
            char_count: n.text_end.saturating_sub(n.text_start),
          })
          .collect();
        (map, Vec::new())
      }
      Err(err) => {
        let code = err.error_code().to_string();
        eprintln!(
          "[positioning][BlockTree] {} code={} -> linear fallback",
          err, code
        );
        let fallback = Self::extract_block_map(html);
        if fallback.is_empty() {
          eprintln!("[positioning][BlockTree] linear fallback failed: no [data-block-id] nodes");
        }
        (fallback, vec![code])
      }
    }
  }

  fn resolve_zero_search_route_source(selected_text: Option<&String>) -> String {
    if selected_text.map(|s| !s.trim().is_empty()).unwrap_or(false) {
      "selection".to_string()
    } else {
      // 无显式选中文本但有精确坐标，归类为 reference 零搜索。
      "reference".to_string()
    }
  }

  fn should_reject_rewrite_document(input: &ResolverInput) -> bool {
    // Reject rewrite_document only when there are explicit local-edit signals
    // (block_index or non-empty target). The selection_start_block_id check
    // has been removed: inherited _sel_* fields from a prior turn must not
    // block a legitimate rewrite_document request (P0-1/P0-2 guard handles
    // the selection/block separation upstream).
    input.block_index.is_some()
      || input
        .target
        .as_ref()
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
  }

  fn is_no_op_diff(cd: &CanonicalDiffBuilt) -> bool {
    if cd.original_text == cd.new_text {
      return true;
    }
    match cd.edit_type.as_str() {
      "insert" => cd.new_text.is_empty(),
      "delete" => cd.original_text.is_empty(),
      _ => false,
    }
  }

  fn now_millis() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
      Ok(d) => d.as_millis() as u64,
      Err(_) => 0,
    }
  }

  fn build_execution_exposure(
    level: ExposureLevel,
    phase: ExposurePhase,
    code: &str,
    message: &str,
    target_file: &str,
    baseline_id: Option<&str>,
    route_source: Option<&str>,
    diff_id: Option<&str>,
  ) -> ExecutionExposure {
    ExecutionExposure {
      exposure_id: format!("exp-{}", uuid::Uuid::new_v4()),
      level,
      phase,
      code: code.to_string(),
      message: message.to_string(),
      target_file: target_file.to_string(),
      diff_id: diff_id.map(|s| s.to_string()),
      baseline_id: baseline_id.map(|s| s.to_string()),
      route_source: route_source.map(|s| s.to_string()),
      timestamp: Self::now_millis(),
    }
  }

  fn append_execution_exposures(
    mut data: Option<serde_json::Value>,
    exposures: Vec<ExecutionExposure>,
    error_code: Option<&str>,
  ) -> Option<serde_json::Value> {
    if exposures.is_empty() && error_code.is_none() {
      return data;
    }

    let mut data_obj = match data.take() {
      Some(serde_json::Value::Object(map)) => map,
      Some(other) => {
        let mut map = serde_json::Map::new();
        map.insert("payload".to_string(), other);
        map
      }
      None => serde_json::Map::new(),
    };

    if let Some(code) = error_code {
      data_obj.insert("error_code".to_string(), serde_json::json!(code));
    }

    if !exposures.is_empty() {
      let mut exposure_values: Vec<serde_json::Value> = data_obj
        .get("execution_exposures")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
      let appended_values: Vec<serde_json::Value> = exposures
        .into_iter()
        .filter_map(|x| serde_json::to_value(x).ok())
        .collect();
      if let Some(first) = appended_values.first() {
        data_obj.insert("execution_exposure".to_string(), first.clone());
      }
      exposure_values.extend(appended_values);
      data_obj.insert(
        "execution_exposures".to_string(),
        serde_json::Value::Array(exposure_values),
      );
    }

    Some(serde_json::Value::Object(data_obj))
  }

  fn resolver_error_result(
    input: &ResolverInput,
    code: &str,
    phase: ExposurePhase,
    level: ExposureLevel,
    route_source: Option<&str>,
    error: String,
    error_kind: ToolErrorKind,
    display_error: String,
    mut data_obj: serde_json::Map<String, serde_json::Value>,
  ) -> ToolResult {
    data_obj.insert("error_code".to_string(), serde_json::json!(code));
    let exposure = Self::build_execution_exposure(
      level,
      phase,
      code,
      &error,
      &input.target_file,
      input.baseline_id.as_deref(),
      route_source,
      None,
    );
    let data = Self::append_execution_exposures(
      Some(serde_json::Value::Object(data_obj)),
      vec![exposure],
      Some(code),
    );
    ToolResult {
      success: false,
      data,
      error: Some(error),
      message: None,
      error_kind: Some(error_kind),
      display_error: Some(display_error),
      meta: None,
    }
  }

  fn resolver_warning_exposures(
    codes: &[String],
    target_file: &str,
    baseline_id: Option<&str>,
    route_source: &str,
  ) -> Vec<ExecutionExposure> {
    codes
      .iter()
      .filter(|code| {
        matches!(
          code.as_str(),
          E_BLOCKTREE_NODE_MISSING | E_BLOCKTREE_STALE | E_BLOCKTREE_BUILD_FAILED
        )
      })
      .map(|code| {
        let message = format!("resolver degraded to linear block map fallback: {}", code);
        Self::build_execution_exposure(
          ExposureLevel::Warn,
          ExposurePhase::Resolve,
          code,
          &message,
          target_file,
          baseline_id,
          Some(route_source),
          None,
        )
      })
      .collect()
  }

  /// 主 Resolver 函数（§6.2）。
  /// Ok → 成功产出 canonical diff；Err → ToolResult（含 error_kind）。
  fn resolve(input: ResolverInput) -> Result<CanonicalDiffBuilt, ToolResult> {
    // ── Step 1 ───────────────────────────────────────────────────────────
    let (block_map, resolver_error_codes) = Self::resolve_block_map_with_fallback(
      input.baseline_id.as_deref(),
      &input.current_editor_content,
    );
    let build_error = |code: &str,
                       phase: ExposurePhase,
                       level: ExposureLevel,
                       route_source: Option<&str>,
                       error: String,
                       error_kind: ToolErrorKind,
                       display_error: &str| {
      let mut data_obj = serde_json::Map::new();
      if !resolver_error_codes.is_empty() {
        data_obj.insert(
          "resolver_error_codes".to_string(),
          serde_json::json!(resolver_error_codes.clone()),
        );
      }
      Self::resolver_error_result(
        &input,
        code,
        phase,
        level,
        route_source,
        error,
        error_kind,
        display_error.to_string(),
        data_obj,
      )
    };
    if block_map.is_empty() {
      let code = resolver_error_codes
        .first()
        .map(|s| s.as_str())
        .unwrap_or(E_BLOCKTREE_NODE_MISSING);
      return Err(build_error(
        code,
        ExposurePhase::Resolve,
        ExposureLevel::Error,
        None,
        "BlockTree and linear fallback both failed: no [data-block-id] blocks.".to_string(),
        ToolErrorKind::Retryable,
        "当前文档结构不可定位，AI 正在重试",
      ));
    }

    // ── Step 2 路由 ───────────────────────────────────────────────────────
    let mode = input.edit_mode.as_str();

    // Step 2a：零搜索路径（有选区坐标）
    //
    // P0-1/P0-2 硬性守卫：block 级模式（rewrite_block / rewrite_document）
    // 不允许走 selection 路径，即使上下文中残留了 _sel_* 字段（来自前一轮选区编辑）。
    // 这些模式必须 fall-through 到各自专属的 block 路径（Step 2d / Step 2e）。
    // selection 只服务于"当前选区编辑"，不得污染独立的 block 改写请求。
    let is_block_scoped_mode = matches!(mode, "rewrite_block" | "rewrite_document");

    if let Some(ref sbid) = input.selection_start_block_id {
      if is_block_scoped_mode {
        // 明确跳过 selection 路径，fall-through 到 Step 2d/2e。
        eprintln!(
          "[positioning] SELECTION_GUARD: mode={} has _sel_* fields but is block-scoped; skipping selection route",
          mode
        );
      } else {
        let so = input.selection_start_offset.unwrap_or(0);
        let ebid = input
          .selection_end_block_id
          .as_ref()
          .unwrap_or(sbid)
          .clone();
        let eo = input.selection_end_offset.unwrap_or(so);
        let route_source = Self::resolve_zero_search_route_source(input.selected_text.as_ref());

        // Step 2a 辅助：在 selected_text 缺失时从文档 HTML 提取原文。
        // 若 extract_block_range 失败（block ID 过期 / 文档已变更），返回结构化错误，
        // 不允许 unwrap_or_default() 产生空 originalText 继续下游。
        let resolve_original_text_from_range = || -> Result<String, String> {
          match input.selected_text.as_ref() {
            Some(t) => Ok(t.clone()),
            None => Self::extract_block_range(
              &input.current_editor_content,
              sbid,
              so,
              &ebid,
              eo,
            )
            .map_err(|e| {
              format!(
                "E_ANCHOR_STALE: block anchor (start={sbid}:{so}, end={ebid}:{eo}) \
                 not found in document. The anchor is stale or the document has changed. \
                 Inner: {e}"
              )
            }),
          }
        };

        return match mode {
          "delete" => {
            let original_text = resolve_original_text_from_range().map_err(|e| {
              build_error(
                E_RANGE_UNRESOLVABLE,
                ExposurePhase::Resolve,
                ExposureLevel::Error,
                Some("selection"),
                e,
                ToolErrorKind::Retryable,
                "定位锚点已失效，无法执行删除操作（文档可能已被修改）",
              )
            })?;
            Ok(CanonicalDiffBuilt {
              start_block_id: sbid.clone(),
              start_offset: so,
              end_block_id: ebid,
              end_offset: eo,
              original_text,
              new_text: String::new(),
              diff_type: "precise".to_string(),
              edit_type: "delete".to_string(),
              route_source: route_source.clone(),
              resolver_error_codes: resolver_error_codes.clone(),
            })
          }
          "insert" => {
            // insert：原文为空（0 长度 range）是设计上正确的，不需要 extract_block_range
            Ok(CanonicalDiffBuilt {
              start_block_id: ebid.clone(),
              start_offset: eo,
              end_block_id: ebid,
              end_offset: eo,
              original_text: String::new(),
              new_text: input.content.clone().unwrap_or_default(),
              diff_type: "precise".to_string(),
              edit_type: "insert".to_string(),
              route_source: route_source.clone(),
              resolver_error_codes: resolver_error_codes.clone(),
            })
          }
          _ => {
            // replace → 以选区为 anchor；锚点失效时结构化失败，不允许继续
            let original_text = resolve_original_text_from_range().map_err(|e| {
              build_error(
                E_RANGE_UNRESOLVABLE,
                ExposurePhase::Resolve,
                ExposureLevel::Error,
                Some("selection"),
                e,
                ToolErrorKind::Retryable,
                "定位锚点已失效，无法执行替换操作（文档可能已被修改）",
              )
            })?;
            Ok(CanonicalDiffBuilt {
              start_block_id: sbid.clone(),
              start_offset: so,
              end_block_id: ebid,
              end_offset: eo,
              original_text,
              new_text: input.content.clone().unwrap_or_default(),
              diff_type: "precise".to_string(),
              edit_type: "replace".to_string(),
              route_source: route_source.clone(),
              resolver_error_codes: resolver_error_codes.clone(),
            })
          }
        };
      }
    }

    // Step 2e：rewrite_document
    if mode == "rewrite_document" {
      if Self::should_reject_rewrite_document(&input) {
        return Err(build_error(
          E_ROUTE_MISMATCH,
          ExposurePhase::Route,
          ExposureLevel::Warn,
          Some("block_search"),
          "rewrite_document is forbidden for local/multi-block edit intent. Use per-block edits instead."
            .to_string(),
          ToolErrorKind::Retryable,
          "检测到局部编辑意图，已禁止全文重写，AI 正在改用分块编辑",
        ));
      }
      if block_map.is_empty() {
        return Err(build_error(
          E_RANGE_UNRESOLVABLE,
          ExposurePhase::Resolve,
          ExposureLevel::Error,
          Some("block_search"),
          "rewrite_document: document has no blocks.".to_string(),
          ToolErrorKind::Retryable,
          "文档为空，无法全文重写",
        ));
      }
      let first = &block_map[0];
      let last = &block_map[block_map.len() - 1];
      let full_text: String = block_map
        .iter()
        .map(|b| b.text_content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
      return Ok(CanonicalDiffBuilt {
        start_block_id: first.block_id.clone(),
        start_offset: 0,
        end_block_id: last.block_id.clone(),
        end_offset: last.char_count,
        original_text: full_text,
        new_text: input.content.clone().unwrap_or_default(),
        diff_type: "document_level".to_string(),
        edit_type: "replace".to_string(),
        route_source: "block_search".to_string(),
        resolver_error_codes: resolver_error_codes.clone(),
      });
    }

    // Step 2d：rewrite_block
    if mode == "rewrite_block" {
      let block_index = match input.block_index {
        Some(i) => i,
        None => {
          return Err(build_error(
            E_TARGET_NOT_READY,
            ExposurePhase::Validate,
            ExposureLevel::Error,
            Some("block_search"),
            "block_index required for edit_mode=rewrite_block.".to_string(),
            ToolErrorKind::Fatal,
            "编辑参数不完整",
          ));
        }
      };
      if block_index >= block_map.len() {
        return Err(build_error(
          E_RANGE_UNRESOLVABLE,
          ExposurePhase::Resolve,
          ExposureLevel::Error,
          Some("block_search"),
          format!(
            "block_index {} out of range. Has {} blocks (0 to {}).",
            block_index,
            block_map.len(),
            block_map.len().saturating_sub(1)
          ),
          ToolErrorKind::Retryable,
          "块编号超出范围，AI 正在修正",
        ));
      }
      let block = &block_map[block_index];
      return Ok(CanonicalDiffBuilt {
        start_block_id: block.block_id.clone(),
        start_offset: 0,
        end_block_id: block.block_id.clone(),
        end_offset: block.char_count,
        original_text: block.text_content.clone(),
        new_text: input.content.clone().unwrap_or_default(),
        diff_type: "block_level".to_string(),
        edit_type: "replace".to_string(),
        route_source: "block_search".to_string(),
        resolver_error_codes: resolver_error_codes.clone(),
      });
    }

    // Step 2b：块内搜索（replace | delete | insert）
    let block_index = match input.block_index {
      Some(i) => i,
      None => {
        return Err(build_error(
          E_TARGET_NOT_READY,
          ExposurePhase::Validate,
          ExposureLevel::Error,
          Some("block_search"),
          format!("block_index required for edit_mode={}.", mode),
          ToolErrorKind::Fatal,
          "编辑参数不完整",
        ));
      }
    };
    if block_index >= block_map.len() {
      return Err(build_error(
        E_RANGE_UNRESOLVABLE,
        ExposurePhase::Resolve,
        ExposureLevel::Error,
        Some("block_search"),
        format!(
          "block_index {} out of range. Has {} blocks (0 to {}).",
          block_index,
          block_map.len(),
          block_map.len().saturating_sub(1)
        ),
        ToolErrorKind::Retryable,
        "块编号超出范围，AI 正在修正",
      ));
    }
    let block = &block_map[block_index];

    // target 检验（replace/delete/insert 必须有 target）
    let target = match &input.target {
      Some(t) if !t.is_empty() => t.clone(),
      _ => {
        return Err(build_error(
          E_TARGET_NOT_READY,
          ExposurePhase::Validate,
          ExposureLevel::Error,
          Some("block_search"),
          format!("target required for edit_mode={}.", mode),
          ToolErrorKind::Fatal,
          "缺少目标文本",
        ));
      }
    };

    // 在块文本中查找 target 的所有出现位置（char 偏移）
    let block_chars: Vec<char> = block.text_content.chars().collect();
    let target_chars: Vec<char> = target.chars().collect();
    let mut match_starts: Vec<usize> = Vec::new();
    if !target_chars.is_empty() && target_chars.len() <= block_chars.len() {
      for i in 0..=block_chars.len() - target_chars.len() {
        if block_chars[i..i + target_chars.len()] == target_chars[..] {
          match_starts.push(i);
        }
      }
    }

    if match_starts.is_empty() {
      // Step 2c：整块替换降级
      let whitelist_hit = crate::services::positioning_resolver::match_strict_block_level_whitelist(
        &target,
        &block.text_content,
      );
      if whitelist_hit.is_none() {
        return Err(build_error(
          E_RANGE_UNRESOLVABLE,
          ExposurePhase::Resolve,
          ExposureLevel::Warn,
          Some("block_search"),
          "strict downgrade denied: target miss and whitelist not matched (table/code/special/rich_text/math)."
            .to_string(),
          ToolErrorKind::Retryable,
          "未命中目标文本，且不满足块级降级白名单，AI 正在重试精确定位",
        ));
      }
      eprintln!(
                "📝 [Resolver] target 未在 block {} 中命中，命中严格降级白名单 {:?}，降级为 block_level 替换",
                block_index,
                whitelist_hit.map(|c| c.as_str())
            );
      let new_text = input.content.clone().unwrap_or_default();
      return Ok(CanonicalDiffBuilt {
        start_block_id: block.block_id.clone(),
        start_offset: 0,
        end_block_id: block.block_id.clone(),
        end_offset: block.char_count,
        original_text: block.text_content.clone(),
        new_text,
        diff_type: "block_level".to_string(),
        edit_type: "replace".to_string(),
        route_source: "block_search".to_string(),
        resolver_error_codes: resolver_error_codes.clone(),
      });
    }

    // occurrence_index 校验
    if input.occurrence_index >= match_starts.len() {
      return Err(build_error(
        E_RANGE_UNRESOLVABLE,
        ExposurePhase::Resolve,
        ExposureLevel::Warn,
        Some("block_search"),
        format!(
          "Found {} occurrences in block {}. occurrence_index: 0 to {}.",
          match_starts.len(),
          block_index,
          match_starts.len() - 1
        ),
        ToolErrorKind::Retryable,
        "块内多处相同文本，AI 正在确认位置",
      ));
    }

    let match_start = match_starts[input.occurrence_index];
    let match_end = match_start + target_chars.len();

    // Step 2b 精确定位 → Step 3
    match mode {
      "delete" => Ok(CanonicalDiffBuilt {
        start_block_id: block.block_id.clone(),
        start_offset: match_start,
        end_block_id: block.block_id.clone(),
        end_offset: match_end,
        original_text: target.clone(),
        new_text: String::new(),
        diff_type: "precise".to_string(),
        edit_type: "delete".to_string(),
        route_source: "block_search".to_string(),
        resolver_error_codes: resolver_error_codes.clone(),
      }),
      "insert" => Ok(CanonicalDiffBuilt {
        // 在 target 结束位置插入（0 长度）
        start_block_id: block.block_id.clone(),
        start_offset: match_end,
        end_block_id: block.block_id.clone(),
        end_offset: match_end,
        original_text: String::new(),
        new_text: input.content.clone().unwrap_or_default(),
        diff_type: "precise".to_string(),
        edit_type: "insert".to_string(),
        route_source: "block_search".to_string(),
        resolver_error_codes: resolver_error_codes.clone(),
      }),
      _ => Ok(CanonicalDiffBuilt {
        // replace（或未知 mode 降级为 replace）
        start_block_id: block.block_id.clone(),
        start_offset: match_start,
        end_block_id: block.block_id.clone(),
        end_offset: match_end,
        original_text: target.clone(),
        new_text: input.content.clone().unwrap_or_default(),
        diff_type: "precise".to_string(),
        edit_type: "replace".to_string(),
        route_source: "block_search".to_string(),
        resolver_error_codes: resolver_error_codes.clone(),
      }),
    }
  }

  fn validate_edit_params(arguments: &serde_json::Value) -> Result<(), ToolResult> {
    let err = |message: String| ToolResult {
      success: false,
      data: None,
      message: None,
      error: Some(message),
      error_kind: Some(ToolErrorKind::Fatal),
      display_error: Some("编辑参数格式有误，AI 正在重试。".to_string()),
      meta: None,
    };

    let deprecated_fields = [
      "scope",
      "anchor",
      "edit_target",
      "instruction",
      "target_content",
      "element_identifier",
      "target_content_source",
      "scope_block_id",
    ];
    let mut hit: Vec<&str> = Vec::new();
    for key in deprecated_fields {
      if arguments.get(key).is_some() {
        hit.push(key);
      }
    }
    if !hit.is_empty() {
      return Err(err(format!(
        "deprecated fields are not allowed: {}",
        hit.join(", ")
      )));
    }

    let mode = arguments
      .get("edit_mode")
      .and_then(|v| v.as_str())
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .ok_or_else(|| err("edit_mode is required".to_string()))?;

    let valid_mode = matches!(
      mode,
      "replace" | "delete" | "insert" | "rewrite_block" | "rewrite_document"
    );
    if !valid_mode {
      return Err(err(format!(
        "unsupported edit_mode: {}. allowed: replace|delete|insert|rewrite_block|rewrite_document",
        mode
      )));
    }

    if mode != "rewrite_document" {
      if arguments
        .get("block_index")
        .and_then(|v| v.as_u64())
        .is_none()
      {
        return Err(err(
          "block_index is required unless edit_mode=rewrite_document".to_string(),
        ));
      }
    }

    if matches!(mode, "replace" | "delete" | "insert") {
      let has_target = arguments
        .get("target")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
      if !has_target {
        return Err(err(
          "target is required for replace/delete/insert".to_string(),
        ));
      }
    }

    if matches!(
      mode,
      "replace" | "insert" | "rewrite_block" | "rewrite_document"
    ) && arguments.get("content").and_then(|v| v.as_str()).is_none()
    {
      return Err(err(
        "content is required for replace/insert/rewrite_block/rewrite_document".to_string(),
      ));
    }

    Ok(())
  }

  /// 编辑当前编辑器打开的文档
  /// 新实现：获取当前编辑器内容，计算 diff，返回完整的编辑信息
  async fn edit_current_editor_document(&self, tool_call: &ToolCall) -> Result<ToolResult, String> {
    eprintln!("📝 [edit_current_editor_document] 开始处理文档编辑请求");
    eprintln!(
      "📝 [edit_current_editor_document] 工具调用参数: {:?}",
      tool_call.arguments
    );
    // 前置参数校验（冻结协议）
    if let Err(mut validation_error) = Self::validate_edit_params(&tool_call.arguments) {
      let target_file = tool_call
        .arguments
        .get("current_file")
        .and_then(|v| v.as_str())
        .unwrap_or("<current_editor_document>");
      let code = validation_error
        .data
        .as_ref()
        .and_then(|data| data.get("error_code"))
        .and_then(|v| v.as_str())
        .unwrap_or(E_TARGET_NOT_READY)
        .to_string();
      let message = validation_error
        .error
        .clone()
        .unwrap_or_else(|| "edit parameter validation failed".to_string());
      let exposure = Self::build_execution_exposure(
        ExposureLevel::Error,
        ExposurePhase::Validate,
        &code,
        &message,
        target_file,
        tool_call
          .arguments
          .get("baseline_id")
          .and_then(|v| v.as_str()),
        None,
        None,
      );
      validation_error.data =
        Self::append_execution_exposures(validation_error.data.take(), vec![exposure], Some(&code));
      if validation_error.error_kind.is_none() {
        validation_error.error_kind = Some(ToolErrorKind::Fatal);
      }
      return Ok(validation_error);
    }

    let current_file_new = tool_call
      .arguments
      .get("current_file")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 current_file 参数，请确保前端传递了当前编辑器信息".to_string())?;
    let current_content_new = tool_call
      .arguments
      .get("current_content")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 current_content 参数，请确保前端传递了当前编辑器内容".to_string())?;

    let block_index = tool_call
      .arguments
      .get("block_index")
      .and_then(|v| v.as_u64())
      .map(|u| u as usize);
    let edit_mode = tool_call
      .arguments
      .get("edit_mode")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string();
    let target = tool_call
      .arguments
      .get("target")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let content = tool_call
      .arguments
      .get("content")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let occurrence_index = tool_call
      .arguments
      .get("occurrence_index")
      .and_then(|v| v.as_u64())
      .map(|u| u as usize)
      .unwrap_or(0);
    let selection_start_block_id = tool_call
      .arguments
      .get("_sel_start_block_id")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let selection_start_offset = tool_call
      .arguments
      .get("_sel_start_offset")
      .and_then(|v| v.as_u64())
      .map(|u| u as usize);
    let selection_end_block_id = tool_call
      .arguments
      .get("_sel_end_block_id")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let selection_end_offset = tool_call
      .arguments
      .get("_sel_end_offset")
      .and_then(|v| v.as_u64())
      .map(|u| u as usize);
    let selected_text = tool_call
      .arguments
      .get("_sel_text")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
    let baseline_id = tool_call
      .arguments
      .get("baseline_id")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());

    let resolver_input = ResolverInput {
      block_index,
      edit_mode: edit_mode.clone(),
      target,
      content,
      occurrence_index,
      selection_start_block_id,
      selection_start_offset,
      selection_end_block_id,
      selection_end_offset,
      selected_text,
      target_file: current_file_new.to_string(),
      current_editor_content: current_content_new.to_string(),
      baseline_id,
    };

    match Self::resolve(resolver_input) {
      Err(mut tool_result) => {
        if tool_result.meta.is_none() {
          let reason = tool_result.error.as_deref().unwrap_or("resolve failed");
          tool_result.meta = Some(build_failure_meta("edit_current_editor_document", reason));
        }
        Ok(tool_result)
      }
      Ok(cd) => {
        let doc_rev = tool_call
          .arguments
          .get("document_revision")
          .and_then(|v| v.as_u64());
        if Self::is_no_op_diff(&cd) {
          let route_source = cd.route_source.clone();
          let resolver_error_codes = cd.resolver_error_codes.clone();
          let mut data_obj = serde_json::Map::new();
          data_obj.insert("diff_area_id".to_string(), serde_json::Value::Null);
          data_obj.insert("file_path".to_string(), serde_json::json!(current_file_new));
          data_obj.insert(
            "old_content".to_string(),
            serde_json::json!(current_content_new),
          );
          data_obj.insert(
            "new_content".to_string(),
            serde_json::json!(current_content_new),
          );
          data_obj.insert(
            "diffs".to_string(),
            serde_json::json!(Vec::<serde_json::Value>::new()),
          );
          data_obj.insert("document_revision".to_string(), serde_json::json!(doc_rev));
          data_obj.insert("no_op".to_string(), serde_json::json!(true));
          data_obj.insert(
            "route_source".to_string(),
            serde_json::json!(route_source.clone()),
          );
          data_obj.insert(
            "resolver_error_codes".to_string(),
            serde_json::json!(resolver_error_codes.clone()),
          );
          let warning_exposures = Self::resolver_warning_exposures(
            &resolver_error_codes,
            current_file_new,
            tool_call
              .arguments
              .get("baseline_id")
              .and_then(|v| v.as_str()),
            &route_source,
          );
          Ok(ToolResult {
            success: true,
            data: Self::append_execution_exposures(
              Some(serde_json::Value::Object(data_obj)),
              warning_exposures,
              None,
            ),
            error: None,
            message: Some(
              "edit_current_editor_document: NO_OP（内容无变化，未生成 diff）".to_string(),
            ),
            error_kind: None,
            display_error: None,
            meta: Some(build_noop_meta("edit_current_editor_document")),
          })
        } else {
          let diff_type = cd.diff_type.clone();
          let resolver_error_codes = cd.resolver_error_codes.clone();
          let route_source = cd.route_source.clone();
          let start_block_id = cd.start_block_id.clone();
          let end_block_id = cd.end_block_id.clone();
          let original_text = cd.original_text.clone();
          let start_offset = cd.start_offset;
          let end_offset = cd.end_offset;
          let baseline_id_for_anchor = tool_call
            .arguments
            .get("baseline_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
          let diff_id = format!("diff_{}", uuid::Uuid::new_v4());
          let execution_anchor = serde_json::json!({
            "filePath": current_file_new,
            "baselineId": baseline_id_for_anchor,
            "documentRevision": doc_rev,
            "startBlockId": start_block_id,
            "endBlockId": end_block_id,
            "startOffset": start_offset,
            "endOffset": end_offset,
            "originalText": original_text,
            "routeSource": route_source.clone(),
          });
          let canonical_diff = serde_json::json!({
            "diffId": diff_id,
            "startBlockId": cd.start_block_id,
            "endBlockId": cd.end_block_id,
            "startOffset": start_offset,
            "endOffset": end_offset,
            "originalText": cd.original_text,
            "newText": cd.new_text,
            "type": cd.edit_type,
            "diff_type": diff_type.clone(),
            "route_source": route_source.clone(),
            "execution_anchor": execution_anchor,
          });
          let diff_area_id = format!("diff_area_{}", uuid::Uuid::new_v4());
          eprintln!(
            "[positioning] path=Resolver2 file={} diff_type={} route_source={} edit_mode={} document_revision={:?} resolver_error_codes={:?}",
            current_file_new, diff_type, route_source, edit_mode, doc_rev, resolver_error_codes
          );
          {
            let orig_preview: String = cd.original_text.chars().take(80).collect();
            let new_preview: String = cd.new_text.chars().take(80).collect();
            let target_type = if diff_type == "block_level" || diff_type == "document_level" {
              "block"
            } else if route_source == "selection" {
              "selection"
            } else {
              "reference"
            };
            eprintln!(
              "[CROSS_FILE_TRACE][TOOL] {{\"tool\":\"edit_current_editor_document\",\"target_file\":{:?},\"tool_call_id\":{:?},\"route_source\":{:?},\"resolved_target_type\":{:?},\"original_text_len\":{},\"original_text_preview\":{:?},\"new_text_len\":{},\"new_text_preview\":{:?}}}",
              current_file_new,
              tool_call.id,
              route_source,
              target_type,
              cd.original_text.len(),
              orig_preview,
              cd.new_text.len(),
              new_preview,
            );
          }
          let mut data_obj = serde_json::Map::new();
          data_obj.insert("diff_area_id".to_string(), serde_json::json!(diff_area_id));
          data_obj.insert("file_path".to_string(), serde_json::json!(current_file_new));
          data_obj.insert(
            "old_content".to_string(),
            serde_json::json!(current_content_new),
          );
          data_obj.insert(
            "new_content".to_string(),
            serde_json::json!(current_content_new),
          );
          data_obj.insert("diffs".to_string(), serde_json::json!(vec![canonical_diff]));
          data_obj.insert("document_revision".to_string(), serde_json::json!(doc_rev));
          data_obj.insert(
            "resolver_error_codes".to_string(),
            serde_json::json!(resolver_error_codes.clone()),
          );
          data_obj.insert(
            "route_source".to_string(),
            serde_json::json!(route_source.clone()),
          );
          let warning_exposures = Self::resolver_warning_exposures(
            &resolver_error_codes,
            current_file_new,
            tool_call
              .arguments
              .get("baseline_id")
              .and_then(|v| v.as_str()),
            &route_source,
          );
          Ok(ToolResult {
            success: true,
            data: Self::append_execution_exposures(
              Some(serde_json::Value::Object(data_obj)),
              warning_exposures,
              None,
            ),
            error: None,
            message: Some(format!(
              "edit_current_editor_document: SUCCESS\n\
               Operation: {} (block_index={:?}, diff_type={})\n\
               Status: diff queued, awaiting user confirmation\n\
               Note: Do not re-edit this content until the user accepts or rejects the diff.",
              edit_mode, block_index, diff_type
            )),
            error_kind: None,
            display_error: None,
            meta: Some(build_candidate_meta(
              "edit_current_editor_document",
              current_file_new,
              1,
            )),
          })
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  /// Phase 5.5：保存文件依赖关系
  async fn save_file_dependency(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
  ) -> Result<ToolResult, String> {
    let source_path = tool_call
      .arguments
      .get("source_path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 source_path 参数".to_string())?;
    let target_path = tool_call
      .arguments
      .get("target_path")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "缺少 target_path 参数".to_string())?;
    let dependency_type = tool_call
      .arguments
      .get("dependency_type")
      .and_then(|v| v.as_str())
      .unwrap_or("references");
    let description = tool_call
      .arguments
      .get("description")
      .and_then(|v| v.as_str());

    let db =
      WorkspaceDb::new(workspace_path).map_err(|e| format!("WorkspaceDb 初始化失败: {}", e))?;
    db.save_file_dependency(source_path, target_path, dependency_type, description)
      .map_err(|e| format!("保存依赖失败: {}", e))?;

    Ok(ToolResult {
      success: true,
      data: Some(serde_json::json!({
          "source_path": source_path,
          "target_path": target_path,
          "dependency_type": dependency_type,
      })),
      error: None,
      message: Some("依赖关系已保存".to_string()),
      error_kind: None,
      display_error: None,
      meta: None,
    })
  }

  /// 原子文件写入
  fn atomic_write_file(&self, path: &Path, content: &[u8]) -> Result<(), String> {
    // 1. 创建临时文件
    let temp_path = path.with_extension(format!(
      "{}.tmp.{}",
      path.extension().and_then(|s| s.to_str()).unwrap_or("tmp"),
      std::process::id()
    ));

    // 2. 写入临时文件
    std::fs::write(&temp_path, content).map_err(|e| format!("写入临时文件失败: {}", e))?;

    // 3. 原子重命名（仅在写入成功后才替换原文件）
    std::fs::rename(&temp_path, path).map_err(|e| format!("原子重命名失败: {}", e))?;

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::{ResolverInput, ToolService};

  /// 构造一个最小 4-段 HTML 文档，带 data-block-id。
  fn make_html() -> String {
    r#"<p data-block-id="b0"># 项目说明</p><p data-block-id="b1">第一段：这是当前测试文档，用于验证对话编辑功能。</p><p data-block-id="b2">第二段：此处文字需要调整，agent将仅修改此句。</p><p data-block-id="b3">第三段：这里保留一段不应被改动的内容，用于观察误改。</p>"#.to_string()
  }

  /// 构造带 _sel_* 污染字段的 ResolverInput，模拟前一轮选区编辑遗留上下文。
  fn input_with_selection_ctx(edit_mode: &str, block_index: Option<usize>, content: &str) -> ResolverInput {
    ResolverInput {
      block_index,
      edit_mode: edit_mode.to_string(),
      target: None,
      content: Some(content.to_string()),
      occurrence_index: 0,
      // 前一轮选区上下文 — 污染字段
      selection_start_block_id: Some("b1".to_string()),
      selection_start_offset: Some(8),
      selection_end_block_id: Some("b1".to_string()),
      selection_end_offset: Some(10),
      selected_text: Some("测试".to_string()),
      target_file: "/test/test-a.md".to_string(),
      current_editor_content: make_html(),
      baseline_id: None,
    }
  }

  /// 测试 1：rewrite_block 不得继承旧 selection 上下文。
  /// originalText 必须来自目标 block，route_source 不得为 selection。
  #[test]
  fn test_rewrite_block_does_not_inherit_selection_context() {
    // block_index=1 → 第一段
    let input = input_with_selection_ctx("rewrite_block", Some(1), "第一段（润色后）。");
    let result = ToolService::resolve(input);
    assert!(result.is_ok(), "rewrite_block should succeed, got: {:?}", result.err());
    let cd = result.unwrap();
    assert_ne!(
      cd.original_text, "测试",
      "originalText must NOT be the old selection text '测试'"
    );
    assert!(
      cd.original_text.contains("第一段"),
      "originalText must be the full block 1 text, got: {:?}",
      cd.original_text
    );
    assert_ne!(
      cd.route_source, "selection",
      "route_source must not be 'selection' for rewrite_block"
    );
    assert_eq!(cd.route_source, "block_search");
    assert_eq!(cd.diff_type, "block_level");
    assert_eq!(cd.new_text, "第一段（润色后）。");
  }

  /// 测试 2：两个 block 分别 rewrite，两张 diff 的 originalText 分别对应各自 block 旧文本。
  #[test]
  fn test_two_rewrite_blocks_each_get_correct_original_text() {
    let input1 = input_with_selection_ctx("rewrite_block", Some(1), "润色后第一段。");
    let input2 = input_with_selection_ctx("rewrite_block", Some(2), "润色后第二段。");

    let cd1 = ToolService::resolve(input1).expect("block 1 rewrite should succeed");
    let cd2 = ToolService::resolve(input2).expect("block 2 rewrite should succeed");

    // 两张 diff 的 originalText 都不能是旧选区文本
    assert_ne!(cd1.original_text, "测试");
    assert_ne!(cd2.original_text, "测试");

    // 各自应对应正确 block
    assert!(
      cd1.original_text.contains("第一段"),
      "diff 1 originalText should be block 1 content, got: {:?}",
      cd1.original_text
    );
    assert!(
      cd2.original_text.contains("第二段"),
      "diff 2 originalText should be block 2 content, got: {:?}",
      cd2.original_text
    );

    // route_source 均应为 block_search
    assert_eq!(cd1.route_source, "block_search");
    assert_eq!(cd2.route_source, "block_search");
  }

  /// 测试 3：无 selection 污染时，rewrite_block 同样正常工作。
  #[test]
  fn test_rewrite_block_without_selection_context() {
    let input = ResolverInput {
      block_index: Some(1),
      edit_mode: "rewrite_block".to_string(),
      target: None,
      content: Some("新第一段。".to_string()),
      occurrence_index: 0,
      selection_start_block_id: None,
      selection_start_offset: None,
      selection_end_block_id: None,
      selection_end_offset: None,
      selected_text: None,
      target_file: "/test/test-a.md".to_string(),
      current_editor_content: make_html(),
      baseline_id: None,
    };
    let result = ToolService::resolve(input);
    assert!(result.is_ok());
    let cd = result.unwrap();
    assert!(cd.original_text.contains("第一段"));
    assert_eq!(cd.route_source, "block_search");
    assert_eq!(cd.diff_type, "block_level");
  }

  /// 测试 4：block_index 越界时受控失败，不生成脏 diff，不 fallback 到 selection diff。
  #[test]
  fn test_rewrite_block_out_of_range_controlled_failure() {
    let input = input_with_selection_ctx("rewrite_block", Some(99), "内容");
    let result = ToolService::resolve(input);
    assert!(result.is_err(), "out-of-range block_index should fail, not produce a diff");
    let tool_result = result.unwrap_err();
    assert_eq!(tool_result.success, false);
    // 必须返回结构化错误，不能是空
    assert!(
      tool_result.error.is_some(),
      "controlled failure must include an error message"
    );
  }

  /// 测试 5：纯 selection 路径（replace 模式带选区）不受影响，仍正常工作。
  #[test]
  fn test_selection_replace_still_works() {
    let input = ResolverInput {
      block_index: None,
      edit_mode: "replace".to_string(),
      target: None,
      content: Some("替换后文本".to_string()),
      occurrence_index: 0,
      selection_start_block_id: Some("b1".to_string()),
      selection_start_offset: Some(8),
      selection_end_block_id: Some("b1".to_string()),
      selection_end_offset: Some(10),
      selected_text: Some("测试".to_string()),
      target_file: "/test/test-a.md".to_string(),
      current_editor_content: make_html(),
      baseline_id: None,
    };
    let result = ToolService::resolve(input);
    assert!(result.is_ok());
    let cd = result.unwrap();
    assert_eq!(cd.original_text, "测试", "selection replace should use the selected text");
    assert_eq!(cd.new_text, "替换后文本");
    assert_eq!(cd.route_source, "selection");
  }
}
