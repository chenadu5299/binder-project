//! 记忆库 Tauri 命令（P0.5 + P0 + P1 + P2）

use crate::services::memory_service::{
  MemorySearchResponse, MemorySearchScope, MemoryService, SearchMemoriesParams,
};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

type AIServiceState = Arc<Mutex<crate::services::ai_service::AIService>>;

// ── P0.5：孤立 tab 记忆清理 ─────────────────────────────────────────────────

#[tauri::command]
pub async fn mark_orphan_tab_memories_stale(
  active_tab_ids: Vec<String>,
  workspace_path: String,
) -> Result<u64, String> {
  let service = MemoryService::new(Path::new(&workspace_path))
    .map_err(|e| format!("MemoryService 初始化失败: {}", e))?;

  service
    .mark_orphan_tab_memories_stale(&active_tab_ids)
    .await
    .map_err(|e| e.to_string())
}

// ── P0：检索命令 ─────────────────────────────────────────────────────────────

/// P0/P2: 检索记忆（workspace + 可选 user_memory 合并）
#[tauri::command]
pub async fn search_memories_cmd(
  query: String,
  tab_id: Option<String>,
  workspace_path: Option<String>,
  scope: Option<String>,
  limit: Option<usize>,
  entity_types: Option<Vec<String>>,
  include_user_memory: Option<bool>, // P2: 是否合并 user_memory.db
) -> Result<MemorySearchResponse, String> {
  let ws_path = workspace_path.clone().unwrap_or_default();
  if ws_path.is_empty() && tab_id.is_none() {
    return Ok(MemorySearchResponse::empty());
  }

  let db_workspace = if !ws_path.is_empty() {
    ws_path.clone()
  } else {
    return Ok(MemorySearchResponse::empty());
  };

  let scope_parsed = scope
    .as_deref()
    .map(MemorySearchScope::from_str)
    .unwrap_or(MemorySearchScope::All);

  // 阶段边界收口：默认不合并 user_memory，只有显式开启才合并（P2）。
  let should_include_user = include_user_memory.unwrap_or(false);

  let service = MemoryService::new(Path::new(&db_workspace))
    .map_err(|e| format!("MemoryService 初始化失败: {}", e))?;

  let total_limit = limit.unwrap_or(10);
  let params = SearchMemoriesParams {
    query: query.clone(),
    tab_id,
    workspace_path,
    scope: scope_parsed,
    limit: Some(total_limit),
    entity_types,
  };

  let mut resp = service
    .search_memories(params)
    .await
    .map_err(|e| e.to_string())?;

  // P2: 合并用户记忆
  if should_include_user {
    let merged = crate::services::memory_service::merge_with_user_memories(
      resp.items,
      &query,
      total_limit,
      true,
    )
    .await;
    resp.items = merged;
    resp.total_found = resp.items.len();
  }

  Ok(resp)
}

// ── P1：Tab 删除升格 ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn on_tab_deleted_cmd(
  tab_id: String,
  user_message_count: usize,
  workspace_path: Option<String>,
  service: State<'_, AIServiceState>,
) -> Result<(), String> {
  let ws_str = match workspace_path {
    Some(p) if !p.is_empty() => p,
    _ => return Ok(()), // 无工作区时不升格
  };

  let provider = {
    let guard = service.lock().map_err(|e| e.to_string())?;
    guard
      .get_provider("deepseek")
      .or_else(|| guard.get_provider("openai"))
  };

  let ws = std::path::PathBuf::from(ws_str);
  tokio::spawn(async move {
    crate::services::memory_service::on_tab_deleted(provider, ws, tab_id, user_message_count).await;
  });

  Ok(())
}

// ── P2：用户手动屏蔽记忆项 ────────────────────────────────────────────────────

/// P2: 将指定记忆项标记为 expired（用户主动屏蔽）
#[tauri::command]
pub async fn expire_memory_item(memory_id: String, workspace_path: String) -> Result<(), String> {
  if workspace_path.is_empty() || memory_id.is_empty() {
    return Ok(());
  }
  let service = MemoryService::new(Path::new(&workspace_path))
    .map_err(|e| format!("MemoryService 初始化失败: {}", e))?;
  service
    .expire_item(&memory_id)
    .await
    .map_err(|e| e.to_string())
}

// ── P2：批量屏蔽（按 layer）───────────────────────────────────────────────────

/// P2: 将指定 layer 的所有记忆标记为 expired（批量屏蔽）
#[tauri::command]
pub async fn expire_memory_layer(layer: String, workspace_path: String) -> Result<u64, String> {
  if workspace_path.is_empty() || layer.is_empty() {
    return Ok(0);
  }
  let service = MemoryService::new(Path::new(&workspace_path))
    .map_err(|e| format!("MemoryService 初始化失败: {}", e))?;
  service
    .expire_layer(&layer)
    .await
    .map_err(|e| e.to_string())
}

// ── P2：user_memory.db 初始化与信息获取 ──────────────────────────────────────

/// P2: 获取 user_id 和 user_memory.db 路径（前端初始化时调用）
#[tauri::command]
pub async fn get_memory_user_data(
) -> Result<crate::services::memory_service::UserMemoryInfo, String> {
  let user_id = crate::services::memory_service::get_or_create_user_id()?;
  let user_db_path = crate::services::memory_service::user_memory_db_path()
    .ok_or_else(|| "无法获取 data_dir".to_string())?
    .to_string_lossy()
    .to_string();
  Ok(crate::services::memory_service::UserMemoryInfo {
    user_id,
    user_db_path,
  })
}

// ── P1：启动维护 ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn startup_memory_maintenance(workspace_path: String) -> Result<(), String> {
  if workspace_path.is_empty() {
    return Ok(());
  }
  let ws = std::path::PathBuf::from(workspace_path);
  tokio::spawn(async move {
    crate::services::memory_service::startup_maintenance(&ws).await;
  });
  Ok(())
}
