//! P2：needle + occurrence_index + 可选 scope_block_id → anchor（与 `extract_block_range` 使用同一套块顺序与块内 text，§2.3 方案 B：原始 textContent）。

use scraper::{Html, Selector};

#[derive(Debug, Clone, Copy)]
pub struct ResolveHints<'a> {
  pub needle: &'a str,
  /// `None` 表示未传参：若全局多于一处匹配则 `Ambiguous`
  pub occurrence_index: Option<usize>,
  pub scope_block_id: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub enum ResolveOutcome {
  SingleAnchor {
    start_block_id: String,
    start_offset: usize,
    end_block_id: String,
    end_offset: usize,
  },
  Ambiguous {
    match_count: usize,
  },
  NotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrictDegradeCategory {
  Table,
  Code,
  SpecialSequence,
  RichTextNested,
  MathLike,
}

impl StrictDegradeCategory {
  pub fn as_str(&self) -> &'static str {
    match self {
      StrictDegradeCategory::Table => "table",
      StrictDegradeCategory::Code => "code",
      StrictDegradeCategory::SpecialSequence => "special_sequence",
      StrictDegradeCategory::RichTextNested => "rich_text_nested",
      StrictDegradeCategory::MathLike => "math_like",
    }
  }
}

fn has_table_like_pattern(s: &str) -> bool {
  s.contains('|') || s.contains('\t')
}

fn has_code_like_pattern(s: &str) -> bool {
  let lowers = s.to_lowercase();
  s.contains("```")
    || s.contains("`")
    || s.contains('{')
    || s.contains('}')
    || s.contains("=>")
    || s.contains("::")
    || s.contains("();")
    || s.contains("function")
    || lowers.contains("class ")
}

fn has_special_sequence_pattern(s: &str) -> bool {
  let mut run = 0usize;
  for ch in s.chars() {
    let is_special = ch.is_ascii_punctuation()
      || matches!(
        ch,
        '，' | '。' | '；' | '：' | '！' | '？' | '（' | '）' | '【' | '】' | '《' | '》'
      );
    if is_special {
      run += 1;
      if run >= 2 {
        return true;
      }
    } else {
      run = 0;
    }
  }
  false
}

fn has_rich_text_nested_pattern(s: &str) -> bool {
  s.contains("**")
    || s.contains("__")
    || s.contains("~~")
    || s.contains("</")
    || s.contains("<span")
    || s.contains("<strong")
    || s.contains("<em")
}

fn has_math_like_pattern(s: &str) -> bool {
  s.contains('$')
    || s.contains("\\(")
    || s.contains("\\)")
    || s.contains("\\[")
    || s.contains("\\]")
    || s.contains("∑")
    || s.contains("√")
    || s.contains("≈")
    || s.contains("≠")
    || s.contains("≤")
    || s.contains("≥")
}

/// 严格降级白名单命中判定：
/// 仅当命中以下类型时允许从块内精准搜索降级为 block_level：
/// - table / code / special_sequence / rich_text_nested / math_like
pub fn match_strict_block_level_whitelist(
  needle: &str,
  block_text: &str,
) -> Option<StrictDegradeCategory> {
  let hay = format!("{}\n{}", needle, block_text);
  if has_table_like_pattern(&hay) {
    return Some(StrictDegradeCategory::Table);
  }
  if has_code_like_pattern(&hay) {
    return Some(StrictDegradeCategory::Code);
  }
  if has_math_like_pattern(&hay) {
    return Some(StrictDegradeCategory::MathLike);
  }
  if has_rich_text_nested_pattern(&hay) {
    return Some(StrictDegradeCategory::RichTextNested);
  }
  if has_special_sequence_pattern(&hay) {
    return Some(StrictDegradeCategory::SpecialSequence);
  }
  None
}

fn block_spans(html: &str) -> Result<Vec<(String, String)>, String> {
  let document = Html::parse_document(html);
  let block_selector =
    Selector::parse("[data-block-id]").map_err(|e| format!("Selector 解析失败: {}", e))?;
  let mut out = Vec::new();
  for el in document.select(&block_selector) {
    let bid = el.value().attr("data-block-id").unwrap_or("").to_string();
    let text: String = el.text().collect();
    out.push((bid, text));
  }
  Ok(out)
}

/// 在 `full_text`（块间以 `\n` 连接）中查找 `needle` 的每一处 char 起始下标。
fn find_match_starts(full_text: &str, needle: &str) -> Vec<usize> {
  if needle.is_empty() {
    return Vec::new();
  }
  let hay: Vec<char> = full_text.chars().collect();
  let ndl: Vec<char> = needle.chars().collect();
  if ndl.is_empty() || ndl.len() > hay.len() {
    return Vec::new();
  }
  let mut v = Vec::new();
  let last = hay.len() - ndl.len();
  for i in 0..=last {
    if hay[i..i + ndl.len()] == ndl[..] {
      v.push(i);
    }
  }
  v
}

/// 将 `full_text` 内 [start_char, end_char)（char 下标）映射到 block anchor（与 `tool_service::find_block_range_for_text` 一致）。
fn char_span_to_anchor(
  block_ranges: &[(String, usize, usize)],
  start_char: usize,
  end_char: usize,
) -> Option<(String, usize, String, usize)> {
  if block_ranges.is_empty() || start_char >= end_char {
    return None;
  }
  let mut sbid = String::new();
  let mut so = 0usize;
  let mut ebid = String::new();
  let mut eo = 0usize;
  for (bid, range_start, range_end) in block_ranges {
    if start_char < *range_end {
      sbid = bid.clone();
      so = start_char.saturating_sub(*range_start);
      break;
    }
  }
  for (bid, range_start, range_end) in block_ranges.iter().rev() {
    if end_char > *range_start {
      ebid = bid.clone();
      let block_len = range_end - range_start;
      eo = (end_char - range_start).min(block_len);
      break;
    }
  }
  if sbid.is_empty() || ebid.is_empty() {
    return None;
  }
  Some((sbid, so, ebid, eo))
}

/// `L` 与 `arguments.current_content` 须为同一字节串（§2.7）。
pub fn resolve_needle_to_anchor(html: &str, hints: ResolveHints<'_>) -> ResolveOutcome {
  let needle = hints.needle;
  if needle.is_empty() {
    return ResolveOutcome::NotFound;
  }

  let blocks = match block_spans(html) {
    Ok(b) => b,
    Err(_) => return ResolveOutcome::NotFound,
  };
  if blocks.is_empty() {
    return ResolveOutcome::NotFound;
  }

  let block_sep = "\n";

  if let Some(scope_id) = hints.scope_block_id {
    let Some((bid, block_text)) = blocks.iter().find(|(id, _)| id == scope_id) else {
      return ResolveOutcome::NotFound;
    };
    let starts = find_match_starts(block_text, needle);
    if starts.is_empty() {
      return ResolveOutcome::NotFound;
    }
    if starts.len() > 1 && hints.occurrence_index.is_none() {
      return ResolveOutcome::Ambiguous {
        match_count: starts.len(),
      };
    }
    let occ = hints.occurrence_index.unwrap_or(0);
    let Some(&start_off) = starts.get(occ) else {
      return ResolveOutcome::NotFound;
    };
    let end_off = start_off + needle.chars().count();
    return ResolveOutcome::SingleAnchor {
      start_block_id: bid.clone(),
      start_offset: start_off,
      end_block_id: bid.clone(),
      end_offset: end_off,
    };
  }

  // 全局：块顺序 + `\n` 与 find_block_range_for_text / extract_block_range 跨块约定一致
  let mut full_text = String::new();
  let mut block_ranges: Vec<(String, usize, usize)> = vec![];
  for (i, (bid, text)) in blocks.iter().enumerate() {
    if i > 0 {
      full_text.push_str(block_sep);
    }
    let start = full_text.chars().count();
    full_text.push_str(text);
    let end = full_text.chars().count();
    block_ranges.push((bid.clone(), start, end));
  }

  let starts = find_match_starts(&full_text, needle);
  if starts.is_empty() {
    return ResolveOutcome::NotFound;
  }
  if starts.len() > 1 && hints.occurrence_index.is_none() {
    return ResolveOutcome::Ambiguous {
      match_count: starts.len(),
    };
  }
  let occ = hints.occurrence_index.unwrap_or(0);
  let Some(&start_char) = starts.get(occ) else {
    return ResolveOutcome::NotFound;
  };
  let end_char = start_char + needle.chars().count();
  let Some((sbid, so, ebid, eo)) = char_span_to_anchor(&block_ranges, start_char, end_char) else {
    return ResolveOutcome::NotFound;
  };
  ResolveOutcome::SingleAnchor {
    start_block_id: sbid,
    start_offset: so,
    end_block_id: ebid,
    end_offset: eo,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sample_html_two_blocks(a: &str, b: &str) -> String {
    format!(
      r#"<p data-block-id="blk-1">{}</p><p data-block-id="blk-2">{}</p>"#,
      a, b
    )
  }

  #[test]
  fn scope_disambiguates_duplicate_needle() {
    let html = sample_html_two_blocks("foo bar", "foo baz");
    let r = resolve_needle_to_anchor(
      &html,
      ResolveHints {
        needle: "foo",
        occurrence_index: None,
        scope_block_id: Some("blk-2"),
      },
    );
    match r {
      ResolveOutcome::SingleAnchor {
        start_block_id,
        start_offset,
        end_offset,
        ..
      } => {
        assert_eq!(start_block_id, "blk-2");
        assert_eq!(start_offset, 0);
        assert_eq!(end_offset, 3);
      }
      _ => panic!("expected SingleAnchor, got {:?}", r),
    }
  }

  #[test]
  fn global_ambiguous_without_occurrence_index() {
    let html = sample_html_two_blocks("hi", "hi");
    let r = resolve_needle_to_anchor(
      &html,
      ResolveHints {
        needle: "hi",
        occurrence_index: None,
        scope_block_id: None,
      },
    );
    match r {
      ResolveOutcome::Ambiguous { match_count } => assert!(match_count >= 2),
      _ => panic!("expected Ambiguous"),
    }
  }

  #[test]
  fn global_second_occurrence() {
    let html = sample_html_two_blocks("hi", "hi");
    let r = resolve_needle_to_anchor(
      &html,
      ResolveHints {
        needle: "hi",
        occurrence_index: Some(1),
        scope_block_id: None,
      },
    );
    match r {
      ResolveOutcome::SingleAnchor { start_block_id, .. } => {
        assert_eq!(start_block_id, "blk-2");
      }
      _ => panic!("expected SingleAnchor"),
    }
  }

  #[test]
  fn strict_degrade_whitelist_table() {
    let cat = match_strict_block_level_whitelist("A|B|C", "row1|row2");
    assert_eq!(cat, Some(StrictDegradeCategory::Table));
  }

  #[test]
  fn strict_degrade_whitelist_code() {
    let cat = match_strict_block_level_whitelist("fn main() {", "}");
    assert_eq!(cat, Some(StrictDegradeCategory::Code));
  }

  #[test]
  fn strict_degrade_whitelist_no_match() {
    let cat = match_strict_block_level_whitelist("普通文本", "这是一段普通中文句子");
    assert_eq!(cat, None);
  }
}
