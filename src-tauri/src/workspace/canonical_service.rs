//! 编辑器保存后 canonical / 缓存同步的去重：避免同一内容连续触发两次 sync（baseline 抖动、diff 锚点失效）。

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;

/// 最近一次成功同步的编辑器正文 hash（按工作区内相对路径）。
pub struct CanonicalState {
  pub last_hash: HashMap<String, u64>,
}

static SYNC_STATE: Lazy<Mutex<CanonicalState>> = Lazy::new(|| {
  Mutex::new(CanonicalState {
    last_hash: HashMap::new(),
  })
});

pub fn calc_hash(content: &str) -> u64 {
  use std::collections::hash_map::DefaultHasher;
  use std::hash::{Hash, Hasher};

  let mut hasher = DefaultHasher::new();
  content.hash(&mut hasher);
  hasher.finish()
}

/// `cache_key` 建议：`workspace_path|rel`（见 `sync_cache_key`）。
pub fn should_skip_duplicate_sync(cache_key: &str, content: &str) -> bool {
  let new_hash = calc_hash(content);
  let state = SYNC_STATE.lock().unwrap();
  if let Some(old_hash) = state.last_hash.get(cache_key) {
    return *old_hash == new_hash;
  }
  false
}

/// 仅在 `upsert_file_cache` 成功后调用，避免失败时误记 hash 导致下次跳过。
pub fn record_sync_success(cache_key: &str, content: &str) {
  let new_hash = calc_hash(content);
  let mut state = SYNC_STATE.lock().unwrap();
  state.last_hash.insert(cache_key.to_string(), new_hash);
}

pub fn sync_cache_key(workspace_path: &str, rel: &str) -> String {
  let ws = workspace_path
    .replace('\\', "/")
    .trim_end_matches('/')
    .to_string();
  let r = rel.replace('\\', "/");
  format!("{}|{}", ws, r)
}
