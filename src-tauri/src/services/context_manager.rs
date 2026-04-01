//! 上下文管理器模块
//!
//! 负责管理对话上下文，构建多层提示词，管理上下文长度

use crate::services::ai_providers::ChatMessage;
use std::path::PathBuf;

// ── 文档内容注入策略 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum ContentInjectionStrategy {
  MetaOnly,
  SelectionContext,
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

pub fn determine_injection_strategy(
  user_message: &str,
  has_edit_target: bool,
  content_char_count: usize,
) -> ContentInjectionStrategy {
  if has_edit_target {
    return ContentInjectionStrategy::SelectionContext;
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

  /// 本轮定位基线标识（RequestContext.baselineId）
  pub baseline_id: Option<String>,

  /// 本轮文档版本（RequestContext.revision）
  pub document_revision: Option<u64>,
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

/// 引用信息
#[derive(Debug, Clone)]
pub struct ReferenceInfo {
  /// 引用类型
  pub ref_type: ReferenceType,

  /// 引用来源
  pub source: String,

  /// 引用内容
  pub content: String,
}

/// 引用类型（与前端 protocol 6.1 一一对应）
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

/// 截断策略（构建模式前置）
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

  /// 构建多层提示词
  pub fn build_multi_layer_prompt(&self, context: &ContextInfo, enable_tools: bool) -> String {
    let mut prompt = String::new();

    // 第一层：基础系统提示词（完整版本）
    prompt.push_str(&self.build_base_system_prompt(enable_tools));

    // 第二层：上下文提示词
    prompt.push_str(&self.build_context_prompt(context));

    // 第三层：引用提示词（Phase 2.3：超限时按优先级裁剪）
    if !context.references.is_empty() {
      let truncated = self
        .truncate_references_to_budget(context.references.clone(), context.current_file.as_ref());
      prompt.push_str(&self.build_reference_prompt(&truncated, context.current_file.as_ref()));
    }

    // 第四层：工具调用提示词（仅Agent模式）
    // 注意：工具调用格式要求已包含在第一层中

    prompt
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

      let strategy = determine_injection_strategy(
        &context.user_message,
        context.edit_target_present,
        plain_text_len,
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

        ContentInjectionStrategy::Summary => {
          prompt.push_str(&format!(
                        "Current file open in editor: {}\n\n\
                         ⚠️ For any edits to this file: use `edit_current_editor_document` directly.\n\
                            Use block_index from [文档块列表] below to specify the target block.\n\n",
                        file_path
                    ));

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

  /// 构建引用提示词（英文版，中文注释）
  pub fn build_reference_prompt(
    &self,
    references: &[ReferenceInfo],
    current_file: Option<&String>,
  ) -> String {
    if references.is_empty() {
      return String::new();
    }
    // 引用内容说明：这些内容已经完整包含在消息中，无需再读取
    let mut prompt = String::from("The user has referenced the following content:\n\n");

    for (idx, ref_info) in references.iter().enumerate() {
      // 引用类型名称（英文）
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
        ReferenceType::Template => "Template reference",
      };

      // 引用格式：Reference N: Type (Source: source)
      prompt.push_str(&format!(
        "Reference {}: {} (Source: {})\n",
        idx + 1,
        ref_type_name,
        ref_info.source
      ));

      // ⚠️ 关键：检查是否是当前编辑器打开的文件
      let is_current_file = current_file
        .map(|cf| {
          // 检查路径是否匹配（支持绝对路径和相对路径）
          ref_info.source == *cf || ref_info.source.ends_with(cf) || cf.ends_with(&ref_info.source)
        })
        .unwrap_or(false);

      // 显示内容
      if !ref_info.content.is_empty() {
        prompt.push_str(&format!("Content:\n{}\n\n", ref_info.content));
      } else {
        // 对于文件引用，如果没有内容，提示AI可以使用工具读取
        if matches!(ref_info.ref_type, ReferenceType::File) {
          if is_current_file {
            prompt.push_str("⚠️ IMPORTANT: This file is currently open in the editor. This is the document the user is viewing/editing right now. You should be aware of this file's content and can use the read_file tool to access it if needed.\n\n");
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
    }

    // 设计文档 6.2：含 File 时统一追加 path 可信声明
    let has_file = references
      .iter()
      .any(|r| matches!(r.ref_type, ReferenceType::File));
    if has_file {
      prompt.push_str("The above file paths have been resolved and can be used directly. No need to call list_files or search_files.\n\n");
    }
    // 末尾统一
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

  /// 按策略截断消息（构建模式前置）
  pub fn truncate_with_strategy(
    &self,
    messages: &mut Vec<ChatMessage>,
    strategy: TruncationStrategy,
  ) {
    match strategy {
      TruncationStrategy::KeepRecent(n) => self.truncate_messages(messages, n),
      TruncationStrategy::SummarizeMiddle => {
        // 构建模式实现
        self.truncate_messages(messages, 10);
      }
      TruncationStrategy::KeepTaskGoal => {
        // 构建模式实现
        self.truncate_messages(messages, 10);
      }
      TruncationStrategy::LayeredPriority { .. } => {
        // 未来实现：按分层权重截断
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
}

impl Default for ContextManager {
  fn default() -> Self {
    Self::new(3000) // 默认3000 tokens
  }
}
