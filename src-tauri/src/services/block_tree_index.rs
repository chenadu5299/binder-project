use once_cell::sync::Lazy;
use scraper::{Html, Selector};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct BlockTreeNode {
  pub block_id: String,
  pub block_index: usize,
  pub path: String,
  pub text_start: usize,
  pub text_end: usize,
  pub text_hash: String,
  pub block_type: String,
  pub text_content: String,
}

#[derive(Debug, Clone)]
pub struct BlockTreeIndex {
  pub baseline_id: Option<String>,
  pub content_hash: String,
  pub nodes: Vec<BlockTreeNode>,
}

#[derive(Debug, Clone)]
pub struct BlockTreeAcquireResult {
  pub index: Arc<BlockTreeIndex>,
  pub cache_hit: bool,
}

#[derive(Debug, Clone)]
pub enum BlockTreeError {
  BuildFailed(String),
  Stale {
    baseline_id: String,
    cached_content_hash: String,
    current_content_hash: String,
  },
}

impl BlockTreeError {
  pub fn error_code(&self) -> &'static str {
    match self {
      BlockTreeError::BuildFailed(_) => "E_BLOCKTREE_BUILD_FAILED",
      BlockTreeError::Stale { .. } => "E_BLOCKTREE_STALE",
    }
  }
}

impl fmt::Display for BlockTreeError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      BlockTreeError::BuildFailed(reason) => write!(f, "block tree build failed: {}", reason),
      BlockTreeError::Stale {
        baseline_id,
        cached_content_hash,
        current_content_hash,
      } => write!(
        f,
        "block tree stale for baseline_id={} (cached={} current={})",
        baseline_id, cached_content_hash, current_content_hash
      ),
    }
  }
}

type BaselineCache = HashMap<String, Arc<BlockTreeIndex>>;

static BLOCK_TREE_CACHE: Lazy<Mutex<BaselineCache>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn sha256_hex(input: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(input.as_bytes());
  let out = hasher.finalize();
  format!("{:x}", out)
}

fn build_index(
  baseline_id: Option<String>,
  html: &str,
  content_hash: String,
) -> Result<BlockTreeIndex, BlockTreeError> {
  let document = Html::parse_document(html);
  let selector = Selector::parse("[data-block-id]")
    .map_err(|e| BlockTreeError::BuildFailed(format!("selector parse failed: {}", e)))?;

  let mut nodes = Vec::new();
  let mut text_cursor = 0usize;

  for (idx, el) in document.select(&selector).enumerate() {
    let block_id = el
      .value()
      .attr("data-block-id")
      .unwrap_or("")
      .trim()
      .to_string();
    if block_id.is_empty() {
      continue;
    }

    let block_type = el.value().name().to_string();
    let text_content: String = el.text().collect();
    let char_count = text_content.chars().count();
    let text_start = text_cursor;
    let text_end = text_start + char_count;
    let path = format!("/{}[{}]", block_type, idx);
    let text_hash = sha256_hex(&text_content);

    nodes.push(BlockTreeNode {
      block_id,
      block_index: idx,
      path,
      text_start,
      text_end,
      text_hash,
      block_type,
      text_content,
    });

    text_cursor = text_end.saturating_add(1);
  }

  if nodes.is_empty() {
    return Err(BlockTreeError::BuildFailed(
      "no data-block-id nodes found in baseline content".to_string(),
    ));
  }

  Ok(BlockTreeIndex {
    baseline_id,
    content_hash,
    nodes,
  })
}

/// baseline 绑定索引获取：
/// - baseline_id 存在：同 baseline 共用同一索引；若同 baseline 内容哈希不一致，返回 STALE。
/// - baseline_id 缺失：构建一次临时索引，不写缓存。
pub fn get_or_build_for_baseline(
  baseline_id: Option<&str>,
  html: &str,
) -> Result<BlockTreeAcquireResult, BlockTreeError> {
  let content_hash = sha256_hex(html);

  let Some(baseline_id) = baseline_id.filter(|s| !s.trim().is_empty()) else {
    let index = Arc::new(build_index(None, html, content_hash)?);
    return Ok(BlockTreeAcquireResult {
      index,
      cache_hit: false,
    });
  };

  {
    let cache = BLOCK_TREE_CACHE
      .lock()
      .map_err(|_| BlockTreeError::BuildFailed("cache lock poisoned".to_string()))?;
    if let Some(existing) = cache.get(baseline_id) {
      if existing.content_hash == content_hash {
        return Ok(BlockTreeAcquireResult {
          index: Arc::clone(existing),
          cache_hit: true,
        });
      }
      return Err(BlockTreeError::Stale {
        baseline_id: baseline_id.to_string(),
        cached_content_hash: existing.content_hash.clone(),
        current_content_hash: content_hash,
      });
    }
  }

  let built = Arc::new(build_index(
    Some(baseline_id.to_string()),
    html,
    content_hash.clone(),
  )?);
  let mut cache = BLOCK_TREE_CACHE
    .lock()
    .map_err(|_| BlockTreeError::BuildFailed("cache lock poisoned".to_string()))?;

  if let Some(existing) = cache.get(baseline_id) {
    if existing.content_hash == content_hash {
      return Ok(BlockTreeAcquireResult {
        index: Arc::clone(existing),
        cache_hit: true,
      });
    }
    return Err(BlockTreeError::Stale {
      baseline_id: baseline_id.to_string(),
      cached_content_hash: existing.content_hash.clone(),
      current_content_hash: content_hash,
    });
  }

  cache.insert(baseline_id.to_string(), Arc::clone(&built));
  Ok(BlockTreeAcquireResult {
    index: built,
    cache_hit: false,
  })
}
