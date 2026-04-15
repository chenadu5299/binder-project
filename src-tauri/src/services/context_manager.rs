//! 上下文管理器模块
//!
//! 负责管理对话上下文，构建多层提示词，管理上下文长度

use crate::services::ai_providers::ChatMessage;
use crate::services::knowledge::KnowledgeInjectionSlice;
use std::path::PathBuf;

// ── 文档内容注入策略 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum ContentInjectionStrategy {
  MetaOnly,
  SelectionContext,
  FocusedCurrentDocument,
  Summary,
  Full,
}

fn strip_html_tags(input: &str) -> String {
  let mut result = String::with_capacity(input.len());
  let mut inside_tag = false;
  for ch in input.chars() {
    match ch {
      '<' => inside_tag = true,
      '>' => inside_tag = false,
      _ if !inside_tag => result.push(ch),
      _ => {}
    }
  }
  result
}

// ── 块列表构建（§四节） ────────────────────────────────────────────────────────

struct BlockEntry {
  block_id: String,
  block_type: &'static str,
  text: String,
}

/// 从带 data-block-id 属性的 HTML 中按文档顺序提取所有块
fn extract_blocks(html: &str) -> Vec<BlockEntry> {
  use scraper::{Html, Selector};
  let document = Html::parse_document(html);
  let Ok(selector) = Selector::parse("[data-block-id]") else {
    return Vec::new();
  };
  let mut blocks = Vec::new();
  for el in document.select(&selector) {
    let block_id = match el.value().attr("data-block-id") {
      Some(id) if !id.is_empty() => id.to_string(),
      _ => continue,
    };
    let block_type: &'static str = match el.value().name() {
      "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => "标题",
      "li" => "列表",
      _ => "正文",
    };
    let text: String = el.text().collect::<Vec<_>>().join("");
    let text = text.trim().to_string();
    if text.is_empty() {
      continue;
    }
    blocks.push(BlockEntry {
      block_id,
      block_type,
      text,
    });
  }
  blocks
}

/// 将指定索引子集格式化为 [文档块列表] 字符串
/// `indices`：原始 blocks 中的 0-based 全局索引（显示时保留全局编号）
/// `total_count`：全文块总数（用于 "总块数" 行，传 blocks.len()）
fn format_blocks_as_list(
  blocks: &[BlockEntry],
  indices: &[usize],
  cursor_block_id: Option<&str>,
) -> String {
  let mut output = String::new();
  output.push_str("[文档块列表]\n");
  for &i in indices {
    if i >= blocks.len() {
      continue;
    }
    let b = &blocks[i];
    let cursor = if cursor_block_id
      .map(|c| c == b.block_id.as_str())
      .unwrap_or(false)
    {
      "  ← [光标位置]"
    } else {
      ""
    };
    output.push_str(&format!(
      "Block {} [{}]: {}{}\n",
      i, b.block_type, b.text, cursor
    ));
  }
  output.push_str("[/文档块列表]\n\n");
  output.push_str(&format!(
    "总块数：{}。编辑时通过块编号（0起）指定目标块。\n",
    blocks.len()
  ));
  output
}

/// 从 HTML 构建完整块列表字符串（§4.1）
fn build_block_list(html: &str, cursor_block_id: Option<&str>) -> String {
  let blocks = extract_blocks(html);
  if blocks.is_empty() {
    return String::new();
  }
  let indices: Vec<usize> = (0..blocks.len()).collect();
  format_blocks_as_list(&blocks, &indices, cursor_block_id)
}

/// 检测全文扫描意图（§4.3）
fn contains_full_scan_intent(text: &str) -> bool {
  let lower = text.to_lowercase();
  let edit_verbs = ["改", "替换", "修改", "统一", "翻译"];
  if lower.contains("所有") && edit_verbs.iter().any(|v| lower.contains(v)) {
    return true;
  }
  if lower.contains("全文") && edit_verbs.iter().any(|v| lower.contains(v)) {
    return true;
  }
  lower.contains("all occurrences")
    || lower.contains("replace all")
    || lower.contains("throughout the document")
    || lower.contains("every instance")
}

fn extract_headings_from_html(html: &str) -> Vec<String> {
  let mut headings = Vec::new();
  let mut pos = 0;
  while pos < html.len() {
    let next = [1u8, 2, 3].iter().find_map(|level| {
      let tag = format!("<h{}", level);
      html[pos..].find(&tag).map(|p| pos + p)
    });
    let tag_pos = match next {
      Some(p) => p,
      None => break,
    };
    let content_start = match html[tag_pos..].find('>') {
      Some(p) => tag_pos + p + 1,
      None => break,
    };
    let content_end = match html[content_start..].find("</h") {
      Some(p) => content_start + p,
      None => break,
    };
    let text = strip_html_tags(&html[content_start..content_end])
      .trim()
      .to_string();
    if !text.is_empty() {
      headings.push(text);
    }
    pos = content_end + 4;
  }
  headings
}

fn contains_file_op_intent(msg: &str) -> bool {
  let msg_lower = msg.to_lowercase();
  let keywords = [
    "新建文件",
    "创建文件",
    "移动文件",
    "重命名文件",
    "删除文件",
    "列出文件",
    "搜索文件",
    "目录结构",
    "create file",
    "rename file",
    "move file",
    "delete file",
    "list files",
    "list_files",
    "move_file",
  ];
  keywords.iter().any(|k| msg_lower.contains(k))
}

fn contains_current_doc_only_intent(msg: &str) -> bool {
  let msg_lower = msg.to_lowercase();
  let keywords = [
    "只基于当前文档",
    "仅基于当前文档",
    "只看当前文档",
    "只看当前文件",
    "仅看当前文件",
    "不要查知识库",
    "不要用知识库",
    "only current document",
    "only current doc",
    "only this file",
    "do not use knowledge base",
  ];
  keywords.iter().any(|k| msg_lower.contains(k))
}

fn contains_current_doc_focus_intent(msg: &str) -> bool {
  let msg_lower = msg.to_lowercase();
  let keywords = [
    "当前文档",
    "当前文件",
    "本文件",
    "这篇文档",
    "这份文档",
    "这段",
    "当前段落",
    "当前选区",
    "上面这段",
    "this document",
    "current document",
    "current file",
    "selected text",
    "this section",
  ];
  keywords.iter().any(|k| msg_lower.contains(k))
}

fn contains_workspace_project_scope_intent(msg: &str) -> bool {
  let msg_lower = msg.to_lowercase();
  let keywords = [
    "项目里",
    "项目内",
    "工作区里",
    "工作区内",
    "仓库里",
    "仓库内",
    "当前项目",
    "当前工作区",
    "其他文档",
    "其它文档",
    "别的文档",
    "相关文档",
    "相关文件",
    "其他文件",
    "其它文件",
    "workspace",
    "project docs",
    "other documents",
    "other files",
    "rest of the project",
    "repository",
    "repo",
  ];
  keywords.iter().any(|k| msg_lower.contains(k))
}

fn contains_knowledge_expansion_intent(msg: &str) -> bool {
  let msg_lower = msg.to_lowercase();
  let keywords = [
    "知识库",
    "外部资料",
    "参考资料",
    "外部来源",
    "联网",
    "查资料",
    "搜索资料",
    "knowledge base",
    "external sources",
    "external material",
    "research",
    "look up",
  ];
  keywords.iter().any(|k| msg_lower.contains(k))
}

fn is_cjk(ch: char) -> bool {
  matches!(
    ch as u32,
    0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0x3040..=0x30FF | 0xAC00..=0xD7AF
  )
}

fn push_focus_term(token: &str, out: &mut Vec<String>) {
  let trimmed = token.trim();
  if trimmed.is_empty() {
    return;
  }
  let lower = trimmed.to_lowercase();
  let stopwords = [
    "请",
    "帮我",
    "一下",
    "一个",
    "目前",
    "当前",
    "当前文档",
    "当前文件",
    "本文件",
    "文档",
    "文件",
    "内容",
    "关于",
    "基于",
    "看看",
    "说明",
    "解释",
    "分析",
    "总结",
    "概括",
    "哪些",
    "什么",
    "是否",
    "还有",
    "没有",
    "以及",
    "帮忙",
    "please",
    "summarize",
    "summary",
    "explain",
    "analyze",
    "current",
    "document",
    "file",
    "this",
  ];
  if stopwords.contains(&lower.as_str()) {
    return;
  }
  if trimmed.chars().all(|ch| ch.is_ascii_digit()) {
    return;
  }
  let char_count = trimmed.chars().count();
  let has_ascii = trimmed.chars().any(|ch| ch.is_ascii_alphanumeric());
  let has_cjk = trimmed.chars().any(is_cjk);
  if (has_ascii && char_count < 3) || (has_cjk && char_count < 2) {
    return;
  }
  if !out.iter().any(|existing| existing == trimmed) {
    out.push(trimmed.to_string());
  }
}

fn extract_focus_terms(text: &str) -> Vec<String> {
  let mut terms = Vec::new();
  let mut current = String::new();
  for ch in text.chars() {
    if ch.is_ascii_alphanumeric() || is_cjk(ch) {
      current.push(ch);
    } else if !current.is_empty() {
      push_focus_term(&current, &mut terms);
      current.clear();
    }
  }
  if !current.is_empty() {
    push_focus_term(&current, &mut terms);
  }
  let existing_terms = terms.clone();
  for term in existing_terms {
    let chars: Vec<char> = term.chars().collect();
    let has_cjk = chars.iter().copied().any(is_cjk);
    if !has_cjk || chars.len() <= 4 {
      continue;
    }
    for window in chars.windows(4) {
      let slice: String = window.iter().collect();
      push_focus_term(&slice, &mut terms);
    }
  }
  terms
}

fn message_mentions_current_file(msg: &str, current_file: Option<&str>) -> bool {
  let Some(file) = current_file else {
    return false;
  };
  let Some(stem) = std::path::Path::new(file)
    .file_stem()
    .and_then(|value| value.to_str())
  else {
    return false;
  };
  let stem = stem.trim().to_lowercase();
  if stem.is_empty() {
    return false;
  }
  msg.to_lowercase().contains(&stem)
}

pub fn determine_injection_strategy(
  user_message: &str,
  has_edit_target: bool,
  content_char_count: usize,
  prioritize_current_document: bool,
) -> ContentInjectionStrategy {
  if has_edit_target {
    return ContentInjectionStrategy::SelectionContext;
  }
  if prioritize_current_document && content_char_count >= 800 {
    return ContentInjectionStrategy::FocusedCurrentDocument;
  }
  if content_char_count < 800 {
    return ContentInjectionStrategy::Full;
  }
  if contains_file_op_intent(user_message) {
    return ContentInjectionStrategy::MetaOnly;
  }
  ContentInjectionStrategy::Summary
}

// ─────────────────────────────────────────────────────────────────────────────

// ============================================================
// M5: Context Layer Priority (interface reservation)
// 当前版本只定义接口，不改变现有行为
// 记忆库、知识库、模板库接入后按此优先级截断
// ============================================================

/// 上下文各层优先级
/// 数字越小优先级越高，超出 token 预算时从高数字层开始截断
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ContextLayer {
  // P0：永远保留
  SystemPrompt,
  UserMessage,
  EditTarget,
  // P1：尽量保留，可压缩
  CurrentDocument,
  DirectReferences,
  RecentHistory,
  // P2：按预算分配，超出截断
  MemoryLibrary,
  KnowledgeBase,
  TemplateLibrary,
  // P3：按需注入
  WorkspaceDependencies,
  PendingDiffStatus,
}

/// 上下文条目（供相关性筛选使用）
#[derive(Debug, Clone)]
pub struct ContextEntry {
  pub layer: ContextLayer,
  pub content: String,
  pub token_estimate: usize,
}

/// 相关性筛选接口
/// 记忆库和知识库接入后，按用户消息对候选条目打分并选出 TopK
pub trait RelevanceScorer: Send + Sync {
  fn score_and_select(
    &self,
    user_message: &str,
    candidates: &[ContextEntry],
    budget_tokens: usize,
  ) -> Vec<ContextEntry>;
}

/// 当前版本的空实现：直接返回前 5 条，不做相关性计算
pub struct PassthroughScorer;

impl RelevanceScorer for PassthroughScorer {
  fn score_and_select(
    &self,
    _user_message: &str,
    candidates: &[ContextEntry],
    _budget_tokens: usize,
  ) -> Vec<ContextEntry> {
    candidates.iter().take(5).cloned().collect()
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/// 上下文信息
#[derive(Debug, Clone)]
pub struct ContextInfo {
  /// 当前打开的文档路径
  pub current_file: Option<String>,

  /// 当前选中的文本
  pub selected_text: Option<String>,

  /// 工作区路径
  pub workspace_path: PathBuf,

  /// 编辑器状态
  pub editor_state: EditorState,

  /// 引用内容列表
  pub references: Vec<ReferenceInfo>,

  /// 编辑器 HTML 全文（用于分级注入策略）
  pub current_content: Option<String>,

  /// 是否有精确锚点（has_edit_target 的代理）
  pub edit_target_present: bool,

  /// 选区完整坐标（§7.1，替代 edit_target_present bool）
  pub selection_start_block_id: Option<String>,
  pub selection_start_offset: Option<usize>,
  pub selection_end_block_id: Option<String>,
  pub selection_end_offset: Option<usize>,

  /// 光标所在块（无选区时，§7.1）
  pub cursor_block_id: Option<String>,
  pub cursor_offset: Option<usize>,

  /// 当前用户消息，用于意图判断
  pub user_message: String,

  /// 当前打开文档是否在本轮被用户显式引用
  pub current_file_explicitly_referenced: bool,

  /// 本轮定位基线标识（RequestContext.baselineId）
  pub baseline_id: Option<String>,

  /// 本轮文档版本（RequestContext.revision）
  pub document_revision: Option<u64>,

  /// Agent 任务状态摘要（从 workspace.db 读取，注入 prompt 让模型感知当前任务）
  pub agent_task_summary: Option<String>,
  /// Phase 7: Agent artifact 摘要（当前任务的 verification/confirmation 记录，注入 prompt 增强上下文感知）
  pub agent_artifacts_summary: Option<String>,

  /// L6 augmentation：记忆库检索结果（已格式化为注入字符串，带 [记忆库信息] 标签）
  pub memory_context: Option<String>,
  /// L6 augmentation：知识库自动检索结果（augmentation-only，保持结构化直到最终消费）
  pub knowledge_injection_slices: Vec<KnowledgeInjectionSlice>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KnowledgeRetrievalTriggerReason {
  Triggered,
  ExplicitReferencesSufficient,
  EditingContext,
  FileOperationIntent,
  QueryTooShort,
  CurrentDocumentSufficient,
  CurrentDocumentPriority,
  CurrentScopeOnly,
  WorkspaceProjectScope,
  AutomaticPolicyBlocked,
  NoAutomaticCandidates,
}

#[derive(Debug, Clone, Default)]
pub struct KnowledgeRetrievalContext {
  pub explicit_reference_count: usize,
  pub granular_explicit_reference_count: usize,
  pub automatic_candidate_count: usize,
  pub automatic_policy_blocked: bool,
}

#[derive(Debug, Clone)]
pub struct KnowledgeRetrievalDecision {
  pub should_trigger: bool,
  pub reason: KnowledgeRetrievalTriggerReason,
}

/// Phase 3：七层 prompt 语义层。
/// governance → task → conversation → fact → constraint → augmentation → tool_and_output
#[derive(Debug, Clone, Default)]
pub struct PromptPackageLayer {
  pub key: String,
  pub title: String,
  pub content: String,
}

/// Phase 3：结构化 PromptPackage。
/// 包含七层语义内容和渲染后的完整 prompt 字符串。
#[derive(Debug, Clone, Default)]
pub struct PromptPackage {
  pub layers: Vec<PromptPackageLayer>,
  pub rendered_prompt: Option<String>,
}

/// 编辑器状态
#[derive(Debug, Clone)]
pub struct EditorState {
  /// 是否可编辑
  pub is_editable: bool,

  /// 文件类型
  pub file_type: Option<String>,

  /// 文件大小（字节）
  pub file_size: Option<u64>,

  /// 是否已保存
  pub is_saved: bool,
}

/// 引用信息（RichReferenceInfo：保留 IPC 传入的全部结构化字段）
/// 依据：A-CORE-C-D-02 §3.3 RichReferenceInfo / 引用结构保真
#[derive(Debug, Clone)]
pub struct ReferenceInfo {
  /// 引用类型
  pub ref_type: ReferenceType,

  /// 引用来源（路径 / ID / URL）
  pub source: String,

  /// 引用内容
  pub content: String,

  /// 精确引用四元组（仅 Text 类型，可选）
  pub text_reference: Option<TextReferenceAnchorInfo>,

  /// 知识库细粒度 ID（仅 KnowledgeBase 类型，可选）
  pub knowledge_base_id: Option<String>,
  pub knowledge_entry_id: Option<String>,
  pub knowledge_document_id: Option<String>,
  pub knowledge_citation_key: Option<String>,
}

/// 精确引用四元组（后端内部表示）
#[derive(Debug, Clone)]
pub struct TextReferenceAnchorInfo {
  pub start_block_id: String,
  pub start_offset: u32,
  pub end_block_id: String,
  pub end_offset: u32,
}

/// 引用类型（与前端 ReferenceType 一一对应，A-CORE-C-D-02 §3.3）
#[derive(Debug, Clone)]
pub enum ReferenceType {
  Text,          // 文本引用
  File,          // 文件引用
  Folder,        // 文件夹引用
  Image,         // 图片引用
  Table,         // 表格引用
  Memory,        // 记忆库引用
  Link,          // 链接引用
  Chat,          // 聊天记录引用
  KnowledgeBase, // 知识库引用 (kb)
  Template,      // 模板库引用
}

/// 通用消息截断策略。
///
/// 除 `KeepRecent` 外，其余分支当前都回退到固定的最近消息截断，
/// 这里只保留统一入口，不绑定任何独立模式管线。
#[derive(Debug, Clone)]
pub enum TruncationStrategy {
  /// 当前使用：保留最近 N 条历史
  KeepRecent(usize),
  SummarizeMiddle,
  KeepTaskGoal,
  /// 未来：按分层权重截断，P2+ 层先截
  LayeredPriority {
    max_tokens: usize,
  },
}

/// 引用截断配置（Phase 2.3：提示词构建层总预算）
const DEFAULT_MAX_REFERENCE_TOKENS: usize = 8000; // references 单层预算，与 messages 共享总窗口

/// 上下文管理器
pub struct ContextManager {
  /// Token估算比例（1 token ≈ N 字符）
  token_ratio: f64,

  /// 最大上下文Token数（保留20%给响应）
  max_context_tokens: usize,

  /// references 层最大 token 数（Phase 2.3）
  max_reference_tokens: usize,
}

impl ContextManager {
  /// 创建新的上下文管理器
  pub fn new(max_tokens: usize) -> Self {
    Self {
      token_ratio: 4.0, // 1 token ≈ 4 字符（中文和英文混合）
      max_context_tokens: (max_tokens * 10).min(30000), // 假设上下文窗口为32K
      max_reference_tokens: DEFAULT_MAX_REFERENCE_TOKENS,
    }
  }

  pub fn should_trigger_knowledge_retrieval(
    &self,
    context: &ContextInfo,
    retrieval_context: &KnowledgeRetrievalContext,
  ) -> KnowledgeRetrievalDecision {
    let msg = context.user_message.trim();
    if retrieval_context.automatic_policy_blocked {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::AutomaticPolicyBlocked,
      };
    }

    if retrieval_context.automatic_candidate_count == 0 {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::NoAutomaticCandidates,
      };
    }

    if msg.chars().count() < 5 {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::QueryTooShort,
      };
    }

    if context.edit_target_present
      || context
        .selected_text
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::EditingContext,
      };
    }

    if contains_file_op_intent(msg) {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::FileOperationIntent,
      };
    }

    let current_document_priority = context.current_file.is_some()
      && (context.current_file_explicitly_referenced
        || context.edit_target_present
        || context
          .selected_text
          .as_ref()
          .map(|s| !s.trim().is_empty())
          .unwrap_or(false)
        || contains_current_doc_focus_intent(msg)
        || message_mentions_current_file(msg, context.current_file.as_deref()));

    if retrieval_context.granular_explicit_reference_count > 0 {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::ExplicitReferencesSufficient,
      };
    }

    if contains_current_doc_only_intent(msg) {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::CurrentScopeOnly,
      };
    }

    if current_document_priority && !contains_knowledge_expansion_intent(msg) {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::CurrentDocumentPriority,
      };
    }

    if contains_workspace_project_scope_intent(msg) && !contains_knowledge_expansion_intent(msg) {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::WorkspaceProjectScope,
      };
    }

    let current_doc_fact_ready = context
      .selected_text
      .as_ref()
      .map(|value| value.trim().chars().count() >= 20)
      .unwrap_or(false)
      || context.edit_target_present
      || context
        .current_content
        .as_ref()
        .map(|value| value.chars().count() >= 200)
        .unwrap_or(false);

    if current_doc_fact_ready && contains_current_doc_focus_intent(msg) {
      return KnowledgeRetrievalDecision {
        should_trigger: false,
        reason: KnowledgeRetrievalTriggerReason::CurrentDocumentSufficient,
      };
    }

    KnowledgeRetrievalDecision {
      should_trigger: true,
      reason: KnowledgeRetrievalTriggerReason::Triggered,
    }
  }

  /// 构建多层提示词（兼容接口，渲染为单一字符串）
  pub fn build_multi_layer_prompt(&self, context: &ContextInfo, enable_tools: bool) -> String {
    let package = self.build_prompt_package(context, enable_tools);
    package.rendered_prompt.unwrap_or_default()
  }

  /// Phase 3：七层语义 prompt 装配。
  /// 层次：governance → task → conversation → fact → constraint → augmentation → tool_and_output
  pub fn build_prompt_package(&self, context: &ContextInfo, enable_tools: bool) -> PromptPackage {
    let mut layers = Vec::new();

    // L1 governance: 基础系统提示词（角色、规则、行为准则）
    let governance = self.build_base_system_prompt(enable_tools);
    if !governance.is_empty() {
      layers.push(PromptPackageLayer {
        key: "governance".to_string(),
        title: "System Governance".to_string(),
        content: governance,
      });
    }

    // L2 task: Agent 任务状态上下文（当前任务 + 历史阶段 + artifacts）
    {
      let mut task_parts: Vec<String> = Vec::new();
      if let Some(ref summary) = context.agent_task_summary {
        task_parts.push(format!("### Task State\n{}", summary));
      }
      if let Some(ref artifacts) = context.agent_artifacts_summary {
        task_parts.push(format!("### Recent Artifacts\n{}", artifacts));
      }
      if !task_parts.is_empty() {
        layers.push(PromptPackageLayer {
          key: "task".to_string(),
          title: "Agent Task State".to_string(),
          content: format!("## Current Agent Task State\n\n{}", task_parts.join("\n\n")),
        });
      }
    }

    // L3 conversation: 由消息历史承载，不注入 system prompt。此层为占位。
    // （多轮对话历史由 ai_chat_stream 在 messages 数组中管理，不在此处拼装）

    // L4 fact: 文档内容、编辑器状态（当前文件内容、块列表、选区等）
    let fact = self.build_context_prompt(context);
    if !fact.is_empty() {
      layers.push(PromptPackageLayer {
        key: "fact".to_string(),
        title: "Document & Editor Context".to_string(),
        content: fact,
      });
    }

    // L5 constraint: 引用资料（文件引用、选区引用，按优先级裁剪）
    if !context.references.is_empty() {
      let truncated = self
        .truncate_references_to_budget(context.references.clone(), context.current_file.as_ref());
      let constraint = self.build_reference_prompt(&truncated, context.current_file.as_ref());
      if !constraint.is_empty() {
        layers.push(PromptPackageLayer {
          key: "constraint".to_string(),
          title: "Reference Materials".to_string(),
          content: constraint,
        });
      }
    }

    // L6 augmentation: 记忆库注入
    if let Some(ref mem) = context.memory_context {
      if !mem.is_empty() {
        layers.push(PromptPackageLayer {
          key: "augmentation".to_string(),
          title: "Memory Augmentation".to_string(),
          content: mem.clone(),
        });
      }
    }
    if !context.knowledge_injection_slices.is_empty() {
      layers.push(PromptPackageLayer {
        key: "knowledge_augmentation".to_string(),
        title: "Knowledge Augmentation".to_string(),
        content: self.build_knowledge_augmentation_prompt(&context.knowledge_injection_slices),
      });
    }

    // L7 tool_and_output: 工具定义已通过 provider-side function calling 注入，
    // 此层为占位，与 governance 中的工具使用指导互补。

    // 渲染：将各层按顺序拼接为最终字符串
    let rendered = layers
      .iter()
      .map(|l| l.content.as_str())
      .collect::<Vec<_>>()
      .join("\n\n");

    PromptPackage {
      layers,
      rendered_prompt: Some(rendered),
    }
  }

  /// 构建第一层：基础系统提示词
  fn build_base_system_prompt(&self, enable_tools: bool) -> String {
    if enable_tools {
      // Agent 模式：完整系统提示词（英文版，中文注释）
      // 参考void的简洁性，突出文档助手特点，强调用户意图识别
      r#"You are Binder's document editing assistant. You help users edit, create, and manage documents in their workspace.

## When to Call Tools vs Reply Directly

Call tools when the user wants to perform an action (edit, create, move, read files).
Reply directly when the user asks a question, wants analysis, or is just chatting.

## Editing Rules

Use `edit_current_editor_document` for ALL edits to the currently open file.
- Do NOT call read_file first — the tool gets current content automatically.
- Do NOT use update_file for open files.

**Editing files NOT open in the editor**: Use `update_file` with `use_diff: true`.

## Fact Priority

Treat facts in this order:
1. Current open document in the editor
2. Other files inside the current workspace
3. Knowledge augmentation / external materials

For questions about the current document, stay inside the current document first.
If the current document is insufficient, expand to other workspace files before relying on knowledge augmentation.

**Edit modes** (use edit_mode field, do NOT set scope):
- Replace text in a block: edit_mode=replace, block_index=<N>, target=<exact text>, content=<new text>
- Delete text: edit_mode=delete, block_index=<N>, target=<exact text>
- Insert after text: edit_mode=insert, block_index=<N>, target=<anchor text>, content=<text to insert>
- Rewrite entire block: edit_mode=rewrite_block, block_index=<N>, content=<new text>
- Rewrite entire document: edit_mode=rewrite_document, content=<full new text>

**Rules**:
- block_index comes from [文档块列表], 0-based
- target must be exact plain text as shown in the block list, no HTML
- For multi-block edits: call the tool ONCE PER BLOCK — never use rewrite_document for multi-block tasks
- occurrence_index (0-based): use when same text appears multiple times in one block
- Never fabricate block_index values not shown in [文档块列表]

## Task Boundaries

Only edit documents and manage files within the workspace.
When a document edit task involves multiple steps, complete them sequentially.
Do not call file management tools (list_files, move_file, delete_file, create_folder)
unless the user explicitly requests file organization work.

## Response Style

Plain text only. No markdown formatting symbols.
Summarize once when a task is fully complete — not during execution.
Only act on the LAST user message. Previous messages are completed history.
"#.to_string()
    } else {
      // Chat 模式：简化系统提示词
      "You are Binder's document assistant. Help the user with their document and writing questions.\nReply in plain text. Only respond to the LAST user message.\n".to_string()
    }
  }

  /// 构建上下文提示词（英文版，中文注释）
  pub fn build_context_prompt(&self, context: &ContextInfo) -> String {
    let mut prompt = String::new();

    // ⚠️ 关键：当前文档信息 — 分级注入策略
    if let Some(ref file_path) = context.current_file {
      let plain_text_len = context
        .current_content
        .as_deref()
        .map(|c| strip_html_tags(c).chars().count())
        .unwrap_or(0);
      let prioritize_current_document = context.current_file_explicitly_referenced
        || contains_current_doc_focus_intent(&context.user_message)
        || message_mentions_current_file(&context.user_message, Some(file_path));

      let strategy = determine_injection_strategy(
        &context.user_message,
        context.edit_target_present,
        plain_text_len,
        prioritize_current_document,
      );

      match strategy {
        ContentInjectionStrategy::MetaOnly => {
          prompt.push_str(&format!(
                        "Current file open in editor: {}\n\
                         File info: ~{} chars\n\
                         Content not injected — use read_file if file content is needed for this task.\n\n",
                        file_path, plain_text_len
                    ));
        }

        ContentInjectionStrategy::SelectionContext => {
          prompt.push_str(&format!(
                        "Current file open in editor: {}\n\n\
                         ⚠️ For any edits to this file: use `edit_current_editor_document` directly.\n\
                            Use block_index from [文档块列表] below to specify the target block.\n\n",
                        file_path
                    ));

          if let Some(ref content) = context.current_content {
            let blocks = extract_blocks(content);
            if !blocks.is_empty() {
              // 找到选区起始块，注入 ±2 块的子列表（§4.2）
              let sel_idx = context
                .selection_start_block_id
                .as_deref()
                .and_then(|sid| blocks.iter().position(|b| b.block_id == sid));
              let indices: Vec<usize> = if let Some(idx) = sel_idx {
                let start = idx.saturating_sub(2);
                let end = (idx + 3).min(blocks.len());
                (start..end).collect()
              } else {
                // 找不到选区块时回退为完整列表
                (0..blocks.len()).collect()
              };
              prompt.push_str(&format_blocks_as_list(
                &blocks,
                &indices,
                context.cursor_block_id.as_deref(),
              ));
            }
          }
        }

        ContentInjectionStrategy::FocusedCurrentDocument => {
          prompt.push_str(&format!(
                        "Current file open in editor: {}\n\n\
                         This current document is the highest-priority editable fact source for this turn.\n\
                         The user is asking about the current document itself. Stay inside this document first.\n\
                         If the first-pass summary is insufficient, deepen within this document before expanding to workspace files.\n\
                         Only use knowledge augmentation after current-document facts and workspace files are both insufficient.\n\n\
                         ⚠️ For any edits to this file: use `edit_current_editor_document` directly.\n\
                            Use block_index from [文档块列表] below to specify the target block.\n\n",
                        file_path
                    ));

          if context.current_file_explicitly_referenced {
            prompt.push_str(
              "User explicitly referenced the current file in this turn. Preserve that anchor in reasoning and routing.\n\n",
            );
          }

          if let Some(ref content) = context.current_content {
            let blocks = extract_blocks(content);
            if !blocks.is_empty() {
              let mut idx_set = std::collections::BTreeSet::new();

              if let Some(cursor_block_id) = context.cursor_block_id.as_deref() {
                if let Some(cursor_idx) = blocks.iter().position(|b| b.block_id == cursor_block_id) {
                  let start = cursor_idx.saturating_sub(3);
                  let end = (cursor_idx + 4).min(blocks.len());
                  for i in start..end {
                    idx_set.insert(i);
                  }
                }
              }

              if let Some(sel_block_id) = context.selection_start_block_id.as_deref() {
                if let Some(sel_idx) = blocks.iter().position(|b| b.block_id == sel_block_id) {
                  let start = sel_idx.saturating_sub(2);
                  let end = (sel_idx + 3).min(blocks.len());
                  for i in start..end {
                    idx_set.insert(i);
                  }
                }
              }

              let query_terms = extract_focus_terms(&context.user_message);
              for (idx, block) in blocks.iter().enumerate() {
                let block_text_lower = block.text.to_lowercase();
                if query_terms
                  .iter()
                  .any(|term| block_text_lower.contains(&term.to_lowercase()))
                {
                  let start = idx.saturating_sub(1);
                  let end = (idx + 2).min(blocks.len());
                  for i in start..end {
                    idx_set.insert(i);
                  }
                }
              }

              if idx_set.is_empty() {
                for (idx, block) in blocks.iter().enumerate() {
                  if block.block_type == "标题" {
                    idx_set.insert(idx);
                  }
                  if idx_set.len() >= 8 {
                    break;
                  }
                }
                for i in 0..blocks.len().min(12) {
                  idx_set.insert(i);
                }
              }

              let indices: Vec<usize> = idx_set.into_iter().collect();
              prompt.push_str(&format_blocks_as_list(
                &blocks,
                &indices,
                context.cursor_block_id.as_deref(),
              ));
            }
          }
        }

        ContentInjectionStrategy::Summary => {
          prompt.push_str(&format!(
                        "Current file open in editor: {}\n\n\
                         ⚠️ For any edits to this file: use `edit_current_editor_document` directly.\n\
                            Use block_index from [文档块列表] below to specify the target block.\n\n",
                        file_path
                    ));

          if context.current_file_explicitly_referenced {
            prompt.push_str(
              "User explicitly referenced the current file in this turn. Treat the current document as the primary source before any broader retrieval.\n\n",
            );
          }

          if let Some(ref content) = context.current_content {
            let blocks = extract_blocks(content);
            if !blocks.is_empty() {
              let indices: Vec<usize> = if contains_full_scan_intent(&context.user_message) {
                // 全文扫描：注入完整块列表（§4.2）
                (0..blocks.len()).collect()
              } else {
                // 摘要：前10块 + 所有标题块，去重，按原顺序（§4.2）
                let mut idx_set = std::collections::BTreeSet::new();
                for i in 0..blocks.len().min(10) {
                  idx_set.insert(i);
                }
                for (i, b) in blocks.iter().enumerate() {
                  if b.block_type == "标题" {
                    idx_set.insert(i);
                  }
                }
                idx_set.into_iter().collect()
              };
              prompt.push_str(&format_blocks_as_list(
                &blocks,
                &indices,
                context.cursor_block_id.as_deref(),
              ));
            }
          }
        }

        ContentInjectionStrategy::Full => {
          prompt.push_str(&format!(
                        "Current file open in editor: {}\n\n\
                         ⚠️ For any edits to this file: use `edit_current_editor_document` directly.\n\
                            Use block_index from [文档块列表] below to specify the target block.\n\n",
                        file_path
                    ));

          if let Some(ref content) = context.current_content {
            // 短文档：注入完整块列表（§4.2）
            let block_list = build_block_list(content, context.cursor_block_id.as_deref());
            if !block_list.is_empty() {
              prompt.push_str(&block_list);
            } else {
              // 无 data-block-id 时回退为纯文本
              let plain = strip_html_tags(content);
              prompt.push_str(&format!("Content:\n{}\n\n", plain));
            }
          }
        }
      }
    }

    // 选中文本信息
    if let Some(selected) = &context.selected_text {
      prompt.push_str(&format!("Selected text: {}\n", selected));
    }

    // 工作区路径
    prompt.push_str(&format!(
      "Workspace path: {}\n",
      context.workspace_path.display()
    ));

    if let Some(rev) = context.document_revision {
      prompt.push_str(&format!("Document revision: {}\n", rev));
    }
    if let Some(ref baseline_id) = context.baseline_id {
      prompt.push_str(&format!("Baseline id: {}\n", baseline_id));
    }

    // Phase 5.6：注入 pending_files 与 file_dependencies
    if let Ok(db) = crate::workspace::workspace_db::WorkspaceDb::new(&context.workspace_path) {
      if let Ok(pending) = db.get_files_with_pending_diffs() {
        if !pending.is_empty() {
          prompt.push_str(&format!(
            "\nFiles with pending diffs (awaiting user confirmation): {:?}\n",
            pending
          ));
          prompt.push_str("These files have AI-generated changes that the user has not yet accepted. Do not assume changes are applied.\n");
        }
      }
      if let Ok(deps) = db.get_all_file_dependencies() {
        if !deps.is_empty() {
          prompt.push_str("\nFile dependencies (source -> target):\n");
          for (s, t, ty, _d) in deps {
            prompt.push_str(&format!("  {} -> {} ({})\n", s, t, ty));
          }
          prompt.push_str(
            "When modifying a source file, consider whether dependent target files need sync.\n",
          );
        }
      }
    }

    // 编辑未打开文件：使用 update_file 且 use_diff=true
    prompt.push_str("\nWhen editing files that are NOT currently open in the editor, use 'update_file' with use_diff=true. This generates pending diffs; user must confirm before disk write.\n");
    // 问题5：DOCX 格式统一（6.7）
    prompt.push_str("\n[DOCX / 问题5] For .docx files: (1) `update_file` with use_diff=true MUST use `content` as HTML (<p>, <h1>, etc.), never markdown, so pending diffs match workspace file_cache and the TipTap editor. (2) `read_file` on .docx returns Pandoc HTML; it may differ slightly from cache—prefer editing the open file via `edit_current_editor_document` when possible. (3) Do not mix markdown/plaintext with HTML for the same docx edit.\n");

    // 编辑器状态（大文件提示）
    let state_info = if context.editor_state.file_size.unwrap_or(0) > 1_000_000 {
      format!(
        "Large file ({}MB)",
        context.editor_state.file_size.unwrap_or(0) / 1_000_000
      )
    } else {
      "Normal".to_string()
    };

    prompt.push_str(&format!("Editor state: {}\n", state_info));

    // 未保存更改提示
    if !context.editor_state.is_saved {
      prompt.push_str("Note: There are unsaved changes\n");
    }

    prompt.push_str("\n");
    prompt
  }

  /// 构建引用提示词（英文版）
  /// 依据：A-CORE-C-D-02 §3.3 build_reference_prompt / A-DE-M-D-01 §5.8
  /// 每条引用输出：类型标题 + Source 路径 + Position（若有四元组）+ Content
  pub fn build_reference_prompt(
    &self,
    references: &[ReferenceInfo],
    current_file: Option<&String>,
  ) -> String {
    if references.is_empty() {
      return String::new();
    }
    let mut prompt = String::from("The user has referenced the following content:\n\n");

    for (idx, ref_info) in references.iter().enumerate() {
      let ref_type_name = match ref_info.ref_type {
        ReferenceType::Text => "Text reference",
        ReferenceType::File => "File reference",
        ReferenceType::Folder => "Folder reference",
        ReferenceType::Image => "Image reference",
        ReferenceType::Table => "Table reference",
        ReferenceType::Memory => "Memory reference",
        ReferenceType::Chat => "Chat history reference",
        ReferenceType::Link => "Link reference",
        ReferenceType::KnowledgeBase => "Knowledge base reference",
        ReferenceType::Template => "Compiled workflow constraint reference",
      };

      prompt.push_str(&format!(
        "Reference {}: {} (Source: {})\n",
        idx + 1,
        ref_type_name,
        ref_info.source
      ));

      // 输出精确位置（若有 text_reference 四元组）
      if let Some(tr) = &ref_info.text_reference {
        prompt.push_str(&format!(
          "Position: block[{}] offset {} — block[{}] offset {}\n",
          tr.start_block_id, tr.start_offset, tr.end_block_id, tr.end_offset
        ));
      } else if matches!(ref_info.ref_type, ReferenceType::Text) {
        prompt.push_str("Precision: line-level (no character-level anchor). The referenced text is fully included below. Use the document block list to locate the exact block. Do NOT ask the user for confirmation — apply your best judgment.\n");
      }

      let is_current_file = current_file
        .map(|cf| {
          ref_info.source == *cf || ref_info.source.ends_with(cf) || cf.ends_with(&ref_info.source)
        })
        .unwrap_or(false);

      if !ref_info.content.is_empty() {
        prompt.push_str(&format!("Content:\n{}\n\n", ref_info.content));
      } else if matches!(ref_info.ref_type, ReferenceType::File) {
        if is_current_file {
          prompt.push_str("This file is currently open in the editor. You can use the read_file tool to access it if needed.\n\n");
        } else {
          prompt.push_str(
            "Note: You can use the read_file tool to access this file's content if needed.\n\n",
          );
        }
      } else {
        prompt
          .push_str("Note: Content not provided. Use appropriate tools to access if needed.\n\n");
      }
    }

    let has_file = references
      .iter()
      .any(|r| matches!(r.ref_type, ReferenceType::File));
    if has_file {
      prompt.push_str("The above file paths have been resolved and can be used directly. No need to call list_files or search_files.\n\n");
    }
    prompt.push_str("The above content has been fully provided. No need to read again.\n");

    prompt
  }

  /// 估算Token数
  pub fn estimate_tokens(&self, text: &str) -> usize {
    (text.len() as f64 / self.token_ratio) as usize
  }

  /// Phase 2.3：按总预算截断 references，优先级：用户明确引用 > 自动注入（current_file）
  /// 策略：从末尾逐个缩短 content 或移除；current_file 对应的 ref 视为自动注入，优先裁剪
  fn truncate_references_to_budget(
    &self,
    references: Vec<ReferenceInfo>,
    current_file: Option<&String>,
  ) -> Vec<ReferenceInfo> {
    let total: usize = references
      .iter()
      .map(|r| self.estimate_tokens(&r.content) + self.estimate_tokens(&r.source) + 20)
      .sum();
    if total <= self.max_reference_tokens {
      return references;
    }
    // 标记哪些是 current_file（自动注入，优先裁减）
    let is_auto = |r: &ReferenceInfo| -> bool {
      current_file.map_or(false, |cf| {
        r.source == *cf || r.source.ends_with(cf) || cf.ends_with(&r.source)
      })
    };
    let mut refs: Vec<ReferenceInfo> = references;
    let mut current_tokens: usize = refs
      .iter()
      .map(|r| self.estimate_tokens(&r.content) + self.estimate_tokens(&r.source) + 20)
      .sum();
    let max_content_chars = 2000usize; // ~500 tokens
    while current_tokens > self.max_reference_tokens && !refs.is_empty() {
      let last = refs.last().unwrap();
      if is_auto(last) {
        refs.pop();
      } else if last.content.len() > max_content_chars {
        // 截断最后一条的 content 至预算内
        let new_content: String = last.content.chars().take(max_content_chars).collect();
        refs.last_mut().unwrap().content = format!("{}\n\n[内容因预算已截断]", new_content);
      } else {
        refs.pop();
      }
      current_tokens = refs
        .iter()
        .map(|r| self.estimate_tokens(&r.content) + self.estimate_tokens(&r.source) + 20)
        .sum();
    }
    refs
  }

  /// 按策略截断消息。
  pub fn truncate_with_strategy(
    &self,
    messages: &mut Vec<ChatMessage>,
    strategy: TruncationStrategy,
  ) {
    match strategy {
      TruncationStrategy::KeepRecent(n) => self.truncate_messages(messages, n),
      TruncationStrategy::SummarizeMiddle => {
        // 占位分支：当前统一回退为固定最近消息截断。
        self.truncate_messages(messages, 10);
      }
      TruncationStrategy::KeepTaskGoal => {
        // 占位分支：当前统一回退为固定最近消息截断。
        self.truncate_messages(messages, 10);
      }
      TruncationStrategy::LayeredPriority { .. } => {
        // 通用扩展点：当前尚无分层截断实现，先回退到固定最近消息截断。
        self.truncate_messages(messages, 10);
      }
    }
  }

  /// 检查是否需要截断消息历史
  pub fn should_truncate(&self, messages: &[ChatMessage]) -> bool {
    let total_chars: usize = messages.iter().map(|m| m.text().len()).sum();
    let estimated_tokens = self.estimate_tokens(&format!("{}", total_chars));
    estimated_tokens > self.max_context_tokens
  }

  /// 截断消息历史（保留系统消息和最后N条消息）
  pub fn truncate_messages(&self, messages: &mut Vec<ChatMessage>, keep_recent: usize) {
    if messages.len() <= keep_recent + 1 {
      return; // 不需要截断
    }

    // 保留系统消息（第一条）
    let system_msg = messages.remove(0);

    // 保留最后N条消息
    let recent_count = keep_recent.min(messages.len());
    let recent_msgs: Vec<ChatMessage> = messages
      .drain(messages.len().saturating_sub(recent_count)..)
      .collect();

    messages.clear();
    messages.push(system_msg);
    messages.extend(recent_msgs);
  }

  /// 智能截断消息历史（更激进的截断）
  pub fn truncate_messages_aggressive(&self, messages: &mut Vec<ChatMessage>, keep_recent: usize) {
    if messages.len() <= keep_recent + 1 {
      return;
    }

    // 保留系统消息（第一条）
    let system_msg = messages.remove(0);

    // 保留最后N条消息（更少）
    let recent_count = keep_recent.min(messages.len());
    let recent_msgs: Vec<ChatMessage> = messages
      .drain(messages.len().saturating_sub(recent_count)..)
      .collect();

    messages.clear();
    messages.push(system_msg);
    messages.extend(recent_msgs);
  }

  fn build_knowledge_augmentation_prompt(&self, slices: &[KnowledgeInjectionSlice]) -> String {
    let mut lines = vec![
      "[知识库补强]".to_string(),
      "以下内容来自知识库自动检索，仅作 augmentation 补强，不覆盖当前文档、显式引用或当前轮 artifact。".to_string(),
      String::new(),
    ];

    for (index, slice) in slices.iter().enumerate() {
      let source_ref = slice
        .provenance
        .source_ref
        .clone()
        .unwrap_or_else(|| "unknown".to_string());
      let risk_flags = if slice.risk_flags.is_empty() {
        "none".to_string()
      } else {
        slice.risk_flags.join(", ")
      };
      let source_message = slice
        .source_status_message
        .clone()
        .unwrap_or_else(|| "none".to_string());
      let source_role_label = match slice.source_role.as_str() {
        "structure_reference" => "结构参考",
        _ => "知识补强",
      };

      lines.push(format!("### {} Slice {}", source_role_label, index + 1));
      lines.push(format!("title: {}", slice.title));
      lines.push(format!("source_role: {}", slice.source_role));
      lines.push(format!("asset_kind: {}", slice.asset_kind));
      lines.push(format!("source_label: {}", slice.source_label));
      lines.push(format!("entry_id: {}", slice.entry_id));
      lines.push(format!("document_id: {}", slice.document_id));
      lines.push(format!("retrieval_mode: {}", slice.retrieval_mode));
      if let Some(citation) = slice.citation.as_ref() {
        lines.push(format!("citation_key: {}", citation.citation_key));
        lines.push(format!("version: {}", citation.version));
        lines.push(format!("citation_status: {}", citation.status));
      } else {
        lines.push("citation: none".to_string());
      }
      lines.push(format!("source_ref: {}", source_ref));
      lines.push(format!("source_status: {}", slice.source_status));
      lines.push(format!("source_status_message: {}", source_message));
      lines.push(format!("risk_flags: {}", risk_flags));
      if let Some(metadata) = slice.structure_metadata.as_ref() {
        lines.push(format!("document_form: {}", metadata.document_form));
        lines.push(format!("structure_purpose: {}", metadata.structure_purpose));
        lines.push(format!(
          "section_outline_summary: {}",
          metadata.section_outline_summary
        ));
      }
      lines.push("content:".to_string());
      lines.push(slice.content.clone());
      lines.push(String::new());
    }

    lines.push("[/知识库补强]".to_string());
    lines.join("\n")
  }
}

#[cfg(test)]
mod tests {
  use super::{
    ContextInfo, ContextManager, EditorState, KnowledgeRetrievalContext,
    KnowledgeRetrievalTriggerReason, ReferenceInfo, ReferenceType,
  };
  use std::path::PathBuf;

  fn build_context(user_message: &str, edit_target_present: bool) -> ContextInfo {
    ContextInfo {
      current_file: Some("docs/spec.md".to_string()),
      selected_text: None,
      workspace_path: PathBuf::from("/tmp/binder-p1-context"),
      editor_state: EditorState {
        is_editable: true,
        file_type: Some("md".to_string()),
        file_size: None,
        is_saved: true,
      },
      references: vec![ReferenceInfo {
        ref_type: ReferenceType::File,
        source: "docs/spec.md".to_string(),
        content: String::new(),
        text_reference: None,
        knowledge_base_id: None,
        knowledge_entry_id: None,
        knowledge_document_id: None,
        knowledge_citation_key: None,
      }],
      current_content: Some("<p data-block-id=\"b1\">Binder context</p>".to_string()),
      edit_target_present,
      selection_start_block_id: None,
      selection_start_offset: None,
      selection_end_block_id: None,
      selection_end_offset: None,
      cursor_block_id: None,
      cursor_offset: None,
      user_message: user_message.to_string(),
      current_file_explicitly_referenced: false,
      baseline_id: None,
      document_revision: None,
      agent_task_summary: None,
      agent_artifacts_summary: None,
      memory_context: None,
      knowledge_injection_slices: Vec::new(),
    }
  }

  #[test]
  fn p1_should_trigger_knowledge_retrieval_for_general_query() {
    let manager = ContextManager::new(4000);
    let context = build_context("请结合知识库说明 Binder 的引用稳定性规则", false);

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        automatic_candidate_count: 1,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(decision.should_trigger);
    assert_eq!(decision.reason, KnowledgeRetrievalTriggerReason::Triggered);
  }

  #[test]
  fn p1_should_block_knowledge_retrieval_for_editing_context() {
    let manager = ContextManager::new(4000);
    let context = build_context("帮我改写当前段落", true);

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        automatic_candidate_count: 1,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(!decision.should_trigger);
    assert_eq!(
      decision.reason,
      KnowledgeRetrievalTriggerReason::EditingContext
    );
  }

  #[test]
  fn p1_should_block_knowledge_retrieval_when_explicit_knowledge_is_sufficient() {
    let manager = ContextManager::new(4000);
    let context = build_context("请对照这条知识条目回答", false);

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        granular_explicit_reference_count: 1,
        automatic_candidate_count: 2,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(!decision.should_trigger);
    assert_eq!(
      decision.reason,
      KnowledgeRetrievalTriggerReason::ExplicitReferencesSufficient
    );
  }

  #[test]
  fn p1_should_block_knowledge_retrieval_for_current_doc_only_scope() {
    let manager = ContextManager::new(4000);
    let context = build_context("只基于当前文档总结这段内容，不要查知识库", false);

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        automatic_candidate_count: 2,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(!decision.should_trigger);
    assert_eq!(
      decision.reason,
      KnowledgeRetrievalTriggerReason::CurrentScopeOnly
    );
  }

  #[test]
  fn p1_should_block_knowledge_retrieval_when_current_document_is_sufficient() {
    let manager = ContextManager::new(4000);
    let mut context = build_context("请基于当前文档总结主要约束", false);
    context.current_content = Some(format!(
      "<p data-block-id=\"b1\">{}</p>",
      "Binder current document facts. ".repeat(20)
    ));

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        automatic_candidate_count: 2,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(!decision.should_trigger);
    assert_eq!(
      decision.reason,
      KnowledgeRetrievalTriggerReason::CurrentDocumentSufficient
    );
  }

  #[test]
  fn p1_should_block_knowledge_retrieval_when_current_file_is_explicitly_referenced() {
    let manager = ContextManager::new(4000);
    let mut context = build_context("请回答这份文件里的关键约束", false);
    context.current_file_explicitly_referenced = true;

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        automatic_candidate_count: 2,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(!decision.should_trigger);
    assert_eq!(
      decision.reason,
      KnowledgeRetrievalTriggerReason::CurrentDocumentPriority
    );
  }

  #[test]
  fn p1_should_block_knowledge_retrieval_for_workspace_project_scope_before_knowledge() {
    let manager = ContextManager::new(4000);
    let context = build_context("项目里还有没有别的相关文档可以参考", false);

    let decision = manager.should_trigger_knowledge_retrieval(
      &context,
      &KnowledgeRetrievalContext {
        automatic_candidate_count: 3,
        ..KnowledgeRetrievalContext::default()
      },
    );

    assert!(!decision.should_trigger);
    assert_eq!(
      decision.reason,
      KnowledgeRetrievalTriggerReason::WorkspaceProjectScope
    );
  }

  #[test]
  fn p1_build_context_prompt_should_deepen_inside_current_document_for_focus_queries() {
    let manager = ContextManager::new(4000);
    let mut context = build_context("请说明交付边界这一段的限制", false);
    let mut blocks = Vec::new();
    for idx in 1..=16 {
      let text = if idx == 12 {
        "这里说明交付边界与限制条件，并强调不能直接滑向知识检索。".to_string()
      } else {
        format!("第{}段背景说明。{}", idx, "常规背景描述。".repeat(12))
      };
      blocks.push(format!("<p data-block-id=\"b{idx}\">{text}</p>"));
    }
    context.current_content = Some(blocks.join(""));
    context.current_file_explicitly_referenced = true;

    let prompt = manager.build_context_prompt(&context);
    assert!(prompt.contains("highest-priority"));
    assert!(prompt.contains("交付边界"));
    assert!(prompt.contains("Block 10"));
    assert!(prompt.contains("Block 11"));
    assert!(prompt.contains("Block 12"));
  }
}

impl Default for ContextManager {
  fn default() -> Self {
    Self::new(3000) // 默认3000 tokens
  }
}
