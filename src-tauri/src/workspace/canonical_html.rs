//! P4：Workspace 可定位 HTML 唯一管道（《精准定位系统-统一优化开发步骤》§八、§2.4）
//!
//! `normalize_workspace_html_source` → `inject_missing_data_block_ids` → 写入 `file_cache`，并计算 `content_hash`（SHA-256 十六进制）。
//! 与前端 `BlockIdExtension` 对齐：已有 `data-block-id` 的块保留；仅对缺失属性的块级标签补全。
//!
//! 块级标签集合与 `src/utils/blockConstants.ts` 中 `BLOCK_NODE_NAMES` 的 HTML 映射一致（paragraph→p，heading→h1–h6，等）。

use crate::workspace::workspace_db::WorkspaceDb;
use once_cell::sync::Lazy;
use regex::Regex;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fmt::Write as _;
use uuid::Uuid;

/// 是否对磁盘/缓存中的正文跑 P4 管道（HTML 语义；Markdown 等纯文本不走）
pub fn should_run_workspace_canonical_pipeline(file_type: &str) -> bool {
  matches!(file_type, "html" | "htm" | "docx")
}

/// 纯文本类文件（md/txt）是否需要后端注入 block-ws id
pub fn should_inject_block_ids_for_plain_text(file_type: &str) -> bool {
  matches!(file_type, "md" | "markdown" | "txt")
}

/// BOM、换行规范化（不改动标签结构，避免破坏内联 base64 等场景下的 `>`）
pub fn normalize_workspace_html_source(html: &str) -> String {
  let s = html.strip_prefix('\u{feff}').unwrap_or(html);
  s.replace("\r\n", "\n").replace('\r', "\n")
}

static BLOCK_TAG_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"<(p|h[1-6]|blockquote|pre|li|td|th)((?:\s[^>]*)?)\s*>"#)
    .expect("BLOCK_TAG_RE valid")
});

static DATA_BLOCK_ID_RE: Lazy<Regex> = Lazy::new(|| {
  Regex::new(r#"(?i)data-block-id\s*=\s*["']([^"']+)["']"#).expect("DATA_BLOCK_ID_RE valid")
});

/// 为缺失 `data-block-id` 的块级起始标签注入稳定序号 id（同一段 HTML 输入结果确定）
pub fn inject_missing_data_block_ids(html: &str) -> String {
  let mut out = String::with_capacity(html.len().saturating_add(64));
  let mut last = 0usize;
  let mut seq = 0u32;
  for cap in BLOCK_TAG_RE.captures_iter(html) {
    let full = cap.get(0).unwrap();
    let tag = cap.get(1).unwrap().as_str();
    let attrs = cap.get(2).map(|m| m.as_str()).unwrap_or("");
    let has_id = attrs.to_ascii_lowercase().contains("data-block-id");
    if has_id {
      out.push_str(&html[last..full.end()]);
    } else {
      out.push_str(&html[last..full.start()]);
      let id = format!("block_ws_{seq}");
      seq += 1;
      if attrs.trim().is_empty() {
        let _ = write!(out, "<{} data-block-id=\"{}\">", tag, id);
      } else {
        let _ = write!(out, "<{}{} data-block-id=\"{}\">", tag, attrs, id);
      }
    }
    last = full.end();
  }
  out.push_str(&html[last..]);
  out
}

pub fn has_data_block_ids(content: &str) -> bool {
  DATA_BLOCK_ID_RE.is_match(content)
}

#[derive(Debug, Clone, Copy)]
pub struct BlockIdMapStats {
  pub total: usize,
  pub unique: usize,
  pub has_duplicates: bool,
}

pub fn inspect_block_id_map(content: &str) -> BlockIdMapStats {
  let mut set: HashSet<String> = HashSet::new();
  let mut total = 0usize;
  for caps in DATA_BLOCK_ID_RE.captures_iter(content) {
    if let Some(id) = caps.get(1) {
      total += 1;
      set.insert(id.as_str().to_string());
    }
  }
  let unique = set.len();
  BlockIdMapStats {
    total,
    unique,
    has_duplicates: unique != total,
  }
}

fn escape_html_text(input: &str) -> String {
  input
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
    .replace('\'', "&#39;")
}

/// md/txt 后端注入：按空行分段生成 `<p data-block-id="block-ws-{uuid-v4}">...</p>`
pub fn inject_blockids_for_plain_text(content: &str) -> String {
  if has_data_block_ids(content) {
    return content.to_string();
  }

  let normalized = normalize_workspace_html_source(content);
  let segments: Vec<&str> = normalized
    .split("\n\n")
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
    .collect();

  if segments.is_empty() {
    return format!(r#"<p data-block-id="block-ws-{}"></p>"#, Uuid::new_v4());
  }

  segments
    .iter()
    .map(|segment| {
      let safe = escape_html_text(segment).replace('\n', "<br />");
      format!(
        r#"<p data-block-id="block-ws-{}">{}</p>"#,
        Uuid::new_v4(),
        safe
      )
    })
    .collect::<Vec<String>>()
    .join("\n")
}

pub fn content_hash_hex(body: &str) -> String {
  let mut h = Sha256::new();
  h.update(body.as_bytes());
  format!("{:x}", h.finalize())
}

/// P4 唯一入口：规范化 → 补全 blockId → 返回（正文, content_hash）
pub fn canonical_html_for_workspace_cache(html: &str) -> (String, String) {
  let n = normalize_workspace_html_source(html);
  let with_ids = inject_missing_data_block_ids(&n);
  let hash = content_hash_hex(&with_ids);
  (with_ids, hash)
}

/// 缓存命中但历史行无 `content_hash` 时惰性升级（同 mtime 写回 canonical + hash）
pub fn materialize_cached_body_if_stale_hash(
  db: &WorkspaceDb,
  file_path: &str,
  file_type: &str,
  cached_content: Option<String>,
  content_hash: Option<String>,
  mtime: i64,
) -> Result<String, String> {
  let c = cached_content.unwrap_or_default();
  if should_run_workspace_canonical_pipeline(file_type) && content_hash.is_none() && !c.is_empty() {
    let (html, hash) = canonical_html_for_workspace_cache(&c);
    db.upsert_file_cache(
      file_path,
      file_type,
      Some(&html),
      Some(hash.as_str()),
      mtime,
    )?;
    eprintln!(
      "[p4/canonical] upgraded cache (no hash): path={} len={} hash={}..",
      file_path,
      html.len(),
      &hash[..hash.len().min(12)]
    );
    Ok(html)
  } else {
    Ok(c)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn injects_only_missing_ids() {
    let html = r#"<p>a</p><p data-block-id="keep">b</p><h1>c</h1>"#;
    let out = inject_missing_data_block_ids(html);
    assert!(out.contains(r#"data-block-id="block_ws_0""#));
    assert!(out.contains(r#"data-block-id="keep""#));
    assert!(out.contains(r#"data-block-id="block_ws_1""#));
    assert!(!out.contains("block_ws_2"));
  }

  #[test]
  fn normalize_bom_and_crlf() {
    let s = format!("\u{feff}<p>x</p>\r\n");
    let n = normalize_workspace_html_source(&s);
    assert!(!n.starts_with('\u{feff}'));
    assert!(!n.contains('\r'));
  }

  #[test]
  fn injects_block_ws_ids_for_plain_text() {
    let raw = "第一段\n\n第二段";
    let out = inject_blockids_for_plain_text(raw);
    assert!(out.contains("data-block-id=\"block-ws-"));
    let stats = inspect_block_id_map(&out);
    assert_eq!(stats.total, 2);
    assert!(!stats.has_duplicates);
  }
}
