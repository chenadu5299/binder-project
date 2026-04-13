//! 未打开文件的 diff 生成
//!
//! 基于 similar 库，按行/段落生成 para_index + original_text + new_text
//! 问题4/5：HTML 内容可按块级 diff，使 para_index 与 TipTap block 对齐

use once_cell::sync::Lazy;
use regex::Regex;
use similar::TextDiff;

/// 单条 diff
#[derive(Debug, Clone)]
pub struct PendingDiff {
  pub para_index: i32,
  pub original_text: String,
  pub new_text: String,
}

/// 判断内容是否像 HTML（含块级标签）
fn looks_like_html(content: &str) -> bool {
  let trimmed = content.trim();
  trimmed.starts_with('<')
    && (trimmed.contains("<p>")
      || trimmed.contains("<p ")
      || trimmed.contains("<h1")
      || trimmed.contains("<body")
      || trimmed.contains("<div"))
}

static BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r"(?s)<(?:p|h[1-6]|li)(?:\s[^>]*)?>([\s\S]*?)</(?:p|h[1-6]|li)>").unwrap()
});
static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());

/// 从 HTML 中提取块级元素的纯文本（p, h1-h6, li），保持顺序
fn extract_html_blocks(html: &str) -> Vec<String> {
  let mut result = Vec::new();
  for cap in BLOCK_RE.captures_iter(html) {
    let raw = &cap[1];
    let text = TAG_RE.replace_all(raw, "").trim().to_string();
    result.push(text);
  }
  result
}

/// 问题4：HTML 块级 diff，para_index 对应块索引，与 TipTap 对齐
pub fn generate_pending_diffs_html(old_html: &str, new_html: &str) -> Vec<PendingDiff> {
  let old_blocks = extract_html_blocks(old_html);
  let new_blocks = extract_html_blocks(new_html);
  if old_blocks.is_empty() && new_blocks.is_empty() {
    return vec![];
  }
  let old_block_refs: Vec<&str> = old_blocks.iter().map(String::as_str).collect();
  let new_block_refs: Vec<&str> = new_blocks.iter().map(String::as_str).collect();
  let diff = TextDiff::from_slices(&old_block_refs, &new_block_refs);
  let mut result = Vec::new();
  let mut para_index: i32 = 0;

  for op in diff.ops() {
    match op.tag() {
      similar::DiffTag::Equal => {
        para_index += op.old_range().len() as i32;
      }
      similar::DiffTag::Delete => {
        let (start, end) = (op.old_range().start, op.old_range().end);
        for i in start..end {
          let old_text = old_blocks.get(i).cloned().unwrap_or_default();
          if !old_text.is_empty() {
            result.push(PendingDiff {
              para_index: para_index + (i - start) as i32,
              original_text: old_text,
              new_text: String::new(),
            });
          }
        }
        para_index += (end - start) as i32;
      }
      similar::DiffTag::Insert => {
        let (start, end) = (op.new_range().start, op.new_range().end);
        for i in start..end {
          let new_text = new_blocks.get(i).cloned().unwrap_or_default();
          if !new_text.is_empty() {
            result.push(PendingDiff {
              para_index: para_index + (i - start) as i32,
              original_text: String::new(),
              new_text,
            });
          }
        }
      }
      similar::DiffTag::Replace => {
        let (old_start, old_end) = (op.old_range().start, op.old_range().end);
        let (new_start, new_end) = (op.new_range().start, op.new_range().end);
        let old_len = old_end - old_start;
        let new_len = new_end - new_start;
        let pairs = old_len.max(new_len);
        for k in 0..pairs {
          let old_text = if k < old_len {
            old_blocks.get(old_start + k).cloned().unwrap_or_default()
          } else {
            String::new()
          };
          let new_text = if k < new_len {
            new_blocks.get(new_start + k).cloned().unwrap_or_default()
          } else {
            String::new()
          };
          if !old_text.is_empty() || !new_text.is_empty() {
            result.push(PendingDiff {
              para_index: para_index + k as i32,
              original_text: old_text,
              new_text,
            });
          }
        }
        para_index += old_len as i32;
      }
    }
  }
  result
}

/// 生成 pending diffs（行级 diff；HTML 内容自动走块级分支）
/// 问题5：块级解析未产出任何 diff 时回退行级，避免 docx/HTML 结构特殊时无 pending
pub fn generate_pending_diffs(old_content: &str, new_content: &str) -> Vec<PendingDiff> {
  if looks_like_html(old_content) || looks_like_html(new_content) {
    let html_result = generate_pending_diffs_html(old_content, new_content);
    if !html_result.is_empty() {
      return html_result;
    }
  }
  generate_pending_diffs_lines(old_content, new_content)
}

/// 问题5：按扩展名强制 HTML 块级 diff（与 TipTap 一致），失败则回退 `generate_pending_diffs`
pub fn generate_pending_diffs_for_file_type(
  old_content: &str,
  new_content: &str,
  file_ext: &str,
) -> Vec<PendingDiff> {
  let ext = file_ext.to_lowercase();
  if ext == "docx" || ext == "html" || ext == "htm" {
    let html_result = generate_pending_diffs_html(old_content, new_content);
    if !html_result.is_empty() {
      return html_result;
    }
  }
  generate_pending_diffs(old_content, new_content)
}

/// 行级 diff（按 \\n 切分）
fn generate_pending_diffs_lines(old_content: &str, new_content: &str) -> Vec<PendingDiff> {
  let diff = TextDiff::from_lines(old_content, new_content);
  let old_lines: Vec<&str> = old_content.lines().collect();
  let new_lines: Vec<&str> = new_content.lines().collect();
  let mut result = Vec::new();
  let mut para_index: i32 = 0;

  for op in diff.ops() {
    match op.tag() {
      similar::DiffTag::Equal => {
        para_index += op.old_range().len() as i32;
      }
      similar::DiffTag::Delete => {
        let (start, end) = (op.old_range().start, op.old_range().end);
        let old_text: String = old_lines[start..end].join("\n");
        if !old_text.is_empty() {
          result.push(PendingDiff {
            para_index,
            original_text: old_text,
            new_text: String::new(),
          });
        }
        para_index += (end - start) as i32;
      }
      similar::DiffTag::Insert => {
        let (start, end) = (op.new_range().start, op.new_range().end);
        let new_text: String = new_lines[start..end].join("\n");
        if !new_text.is_empty() {
          result.push(PendingDiff {
            para_index,
            original_text: String::new(),
            new_text,
          });
        }
        // Insert 不增加 old 的 para_index
      }
      similar::DiffTag::Replace => {
        let (old_start, old_end) = (op.old_range().start, op.old_range().end);
        let (new_start, new_end) = (op.new_range().start, op.new_range().end);
        let old_text: String = old_lines[old_start..old_end].join("\n");
        let new_text: String = new_lines[new_start..new_end].join("\n");
        result.push(PendingDiff {
          para_index,
          original_text: old_text,
          new_text,
        });
        para_index += (old_end - old_start) as i32;
      }
    }
  }

  result
}
