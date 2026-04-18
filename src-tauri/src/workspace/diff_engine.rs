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
  pub diff_type: String,
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

fn pending_diff(
  para_index: i32,
  original_text: String,
  new_text: String,
  diff_type: &str,
) -> PendingDiff {
  PendingDiff {
    para_index,
    original_text,
    new_text,
    diff_type: diff_type.to_string(),
  }
}

fn refine_precise_replace(original_text: &str, new_text: &str) -> Option<(String, String)> {
  let old_chars: Vec<char> = original_text.chars().collect();
  let new_chars: Vec<char> = new_text.chars().collect();
  let min_len = old_chars.len().min(new_chars.len());

  let mut prefix_len = 0;
  while prefix_len < min_len && old_chars[prefix_len] == new_chars[prefix_len] {
    prefix_len += 1;
  }

  let mut suffix_len = 0;
  while suffix_len < old_chars.len().saturating_sub(prefix_len)
    && suffix_len < new_chars.len().saturating_sub(prefix_len)
    && old_chars[old_chars.len() - 1 - suffix_len] == new_chars[new_chars.len() - 1 - suffix_len]
  {
    suffix_len += 1;
  }

  if prefix_len == 0 && suffix_len == 0 {
    return None;
  }

  let old_mid: String = old_chars[prefix_len..old_chars.len() - suffix_len]
    .iter()
    .collect();
  let new_mid: String = new_chars[prefix_len..new_chars.len() - suffix_len]
    .iter()
    .collect();

  if old_mid.is_empty() {
    return None;
  }

  Some((old_mid, new_mid))
}

fn replace_diff(
  para_index: i32,
  original_text: String,
  new_text: String,
  coarse_diff_type: &str,
) -> PendingDiff {
  if !original_text.is_empty() && !new_text.is_empty() {
    if let Some((refined_original, refined_new)) =
      refine_precise_replace(&original_text, &new_text)
    {
      return pending_diff(para_index, refined_original, refined_new, "precise");
    }
  }

  pending_diff(para_index, original_text, new_text, coarse_diff_type)
}

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
            result.push(pending_diff(
              para_index + (i - start) as i32,
              old_text,
              String::new(),
              "block_level",
            ));
          }
        }
        para_index += (end - start) as i32;
      }
      similar::DiffTag::Insert => {
        let (start, end) = (op.new_range().start, op.new_range().end);
        for i in start..end {
          let new_text = new_blocks.get(i).cloned().unwrap_or_default();
          if !new_text.is_empty() {
            result.push(pending_diff(
              para_index + (i - start) as i32,
              String::new(),
              new_text,
              "block_level",
            ));
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
            result.push(replace_diff(
              para_index + k as i32,
              old_text,
              new_text,
              "block_level",
            ));
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
          result.push(pending_diff(
            para_index,
            old_text,
            String::new(),
            "block_level",
          ));
        }
        para_index += (end - start) as i32;
      }
      similar::DiffTag::Insert => {
        let (start, end) = (op.new_range().start, op.new_range().end);
        let new_text: String = new_lines[start..end].join("\n");
        if !new_text.is_empty() {
          result.push(pending_diff(
            para_index,
            String::new(),
            new_text,
            "block_level",
          ));
        }
        // Insert 不增加 old 的 para_index
      }
      similar::DiffTag::Replace => {
        let (old_start, old_end) = (op.old_range().start, op.old_range().end);
        let (new_start, new_end) = (op.new_range().start, op.new_range().end);
        let old_text: String = old_lines[old_start..old_end].join("\n");
        let new_text: String = new_lines[new_start..new_end].join("\n");
        let old_len = old_end - old_start;
        let new_len = new_end - new_start;
        if old_len == 1 && new_len == 1 {
          result.push(replace_diff(para_index, old_text, new_text, "block_level"));
        } else {
          result.push(pending_diff(para_index, old_text, new_text, "block_level"));
        }
        para_index += (old_end - old_start) as i32;
      }
    }
  }

  result
}

#[cfg(test)]
mod tests {
  use super::{generate_pending_diffs_for_file_type, generate_pending_diffs_html};

  #[test]
  fn line_replace_trims_common_prefix_and_suffix_into_precise_diff() {
    let diffs =
      generate_pending_diffs_for_file_type("prefix old suffix", "prefix new suffix", "md");
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].original_text, "old");
    assert_eq!(diffs[0].new_text, "new");
    assert_eq!(diffs[0].diff_type, "precise");
  }

  #[test]
  fn insertion_only_keeps_coarse_block_level_diff() {
    let diffs = generate_pending_diffs_for_file_type("hello", "hello world", "md");
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].original_text, "hello");
    assert_eq!(diffs[0].new_text, "hello world");
    assert_eq!(diffs[0].diff_type, "block_level");
  }

  #[test]
  fn html_block_replace_refines_inside_single_block() {
    let diffs = generate_pending_diffs_html("<p>alpha beta omega</p>", "<p>alpha gamma omega</p>");
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].original_text, "bet");
    assert_eq!(diffs[0].new_text, "gamm");
    assert_eq!(diffs[0].diff_type, "precise");
  }
}
