//! Workspace Tauri 命令
//!
//! open_file_with_cache、open_docx_with_cache、ai_edit_file_with_diff、accept_file_diffs、reject_file_diffs

use crate::workspace::timeline_support::{
    payload_differs_from_current, record_file_content_timeline_node, restore_payload,
};
use crate::workspace::workspace_db::{
    PendingDiffEntry, TimelineNodeRecord, TimelineRestorePayloadRecord, WorkspaceDb,
};
use crate::workspace::diff_engine;
use crate::workspace::canonical_html::{
    canonical_html_for_workspace_cache, materialize_cached_body_if_stale_hash,
    should_run_workspace_canonical_pipeline, inspect_block_id_map,
    inject_blockids_for_plain_text, should_inject_block_ids_for_plain_text,
};
use crate::workspace::canonical_service::{
    record_sync_success, should_skip_duplicate_sync, sync_cache_key,
};
use crate::commands::file_commands::{read_file_content, open_docx_for_edit};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};
use tauri::{Emitter, State};

type AIServiceState = Arc<Mutex<crate::services::ai_service::AIService>>;

/// open_file_with_cache 返回结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenFileResult {
    pub content: String,
    pub pending_diffs: Option<Vec<PendingDiffDto>>,
    /// 非当前文档四态门禁
    pub gates: NonCurrentFileGates,
    /// 场景标记：4/5/6（对照统一方案）
    pub route_scene: String,
    /// md/txt 是否发生了后端 block-ws 注入
    pub injected_block_ws: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NonCurrentFileGates {
    pub target_file_resolved: bool,
    pub canonical_loaded: bool,
    pub block_map_ready: bool,
    pub context_injected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingDiffDto {
    pub id: i64,
    pub file_path: String,
    pub diff_index: i32,
    pub original_text: String,
    pub new_text: String,
    pub para_index: i32,
    pub diff_type: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRestorePreview {
    pub node: TimelineNodeRecord,
    pub payload_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRestoreResult {
    pub impacted_paths: Vec<String>,
    pub created_node: bool,
}

fn resolve_target_file_under_workspace(
    workspace_path: &str,
    file_path: &str,
) -> Result<PathBuf, String> {
    let workspace = Path::new(workspace_path);
    if !workspace.exists() {
        return Err(format!("workspace 不存在: {}", workspace_path));
    }
    let full_path = workspace.join(file_path);
    if !full_path.exists() {
        return Err(format!("目标文件不存在: {}", file_path));
    }
    let ws_canonical = workspace
        .canonicalize()
        .map_err(|e| format!("workspace canonicalize 失败: {}", e))?;
    let file_canonical = full_path
        .canonicalize()
        .map_err(|e| format!("目标文件 canonicalize 失败: {}", e))?;
    if !file_canonical.starts_with(&ws_canonical) {
        return Err(format!("目标文件越界: {}", file_path));
    }
    Ok(file_canonical)
}

fn gate_error(code: &str, reason: &str, gates: &NonCurrentFileGates) -> String {
    format!(
        "E_TARGET_NOT_READY:{}: {} | gates[targetFileResolved={}, canonicalLoaded={}, blockMapReady={}, contextInjected={}]",
        code,
        reason,
        gates.target_file_resolved,
        gates.canonical_loaded,
        gates.block_map_ready,
        gates.context_injected
    )
}

fn finalize_gate_by_content(
    file_path: &str,
    content: &str,
    gates: &mut NonCurrentFileGates,
) -> Result<(), String> {
    let stats = inspect_block_id_map(content);
    gates.block_map_ready = stats.total > 0 && !stats.has_duplicates;
    if !gates.block_map_ready {
        return Err(gate_error(
            "BLOCK_MAP_NOT_READY",
            &format!(
                "block map 不可用（file={}, total={}, unique={}, has_duplicates={}）",
                file_path, stats.total, stats.unique, stats.has_duplicates
            ),
            gates,
        ));
    }
    gates.context_injected = gates.canonical_loaded && gates.block_map_ready;
    if !gates.context_injected {
        return Err(gate_error(
            "CONTEXT_NOT_INJECTED",
            &format!("上下文注入失败（file={}）", file_path),
            gates,
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn open_file_with_cache(
    workspace_path: String,
    file_path: String,
) -> Result<OpenFileResult, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let mut gates = NonCurrentFileGates::default();
    let full_path = resolve_target_file_under_workspace(&workspace_path, &file_path).map_err(|e| {
        gate_error("TARGET_FILE_RESOLVE_FAILED", &e, &gates)
    })?;
    gates.target_file_resolved = true;

    let mtime = std::fs::metadata(&full_path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);

    let file_type = full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase();

    let cached = db.get_file_cache(&file_path)?;
    let mut route_scene = "4".to_string();
    let mut injected_block_ws = false;
    let content = match &cached {
        Some(entry) if entry.mtime == mtime => {
            let mut loaded = materialize_cached_body_if_stale_hash(
                &db,
                &file_path,
                &file_type,
                entry.cached_content.clone(),
                entry.content_hash.clone(),
                mtime,
            )?;
            if should_inject_block_ids_for_plain_text(&file_type) {
                let before = inspect_block_id_map(&loaded);
                if before.total == 0 {
                    loaded = inject_blockids_for_plain_text(&loaded);
                    injected_block_ws = true;
                    let stats = inspect_block_id_map(&loaded);
                    if stats.has_duplicates {
                        return Err(format!(
                            "E_APPLY_FAILED:DUPLICATE_BLOCK_IDS: path={} total={} unique={}",
                            file_path, stats.total, stats.unique
                        ));
                    }
                    db.upsert_file_cache(&file_path, &file_type, Some(&loaded), None, mtime)?;
                }
            }
            loaded
        }
        _ => {
            route_scene = if should_inject_block_ids_for_plain_text(&file_type) {
                "6".to_string()
            } else {
                "5".to_string()
            };
            let path_str = full_path.to_string_lossy().to_string();
            let raw = read_file_content(path_str)
                .await
                .map_err(|e| format!("读取文件失败: {}", e))?;
            if should_run_workspace_canonical_pipeline(&file_type) {
                let (html, hash) = canonical_html_for_workspace_cache(&raw);
                let stats = inspect_block_id_map(&html);
                if stats.has_duplicates {
                    return Err(format!(
                        "E_APPLY_FAILED:DUPLICATE_BLOCK_IDS: path={} total={} unique={}",
                        file_path, stats.total, stats.unique
                    ));
                }
                db.upsert_file_cache(
                    &file_path,
                    &file_type,
                    Some(&html),
                    Some(hash.as_str()),
                    mtime,
                )?;
                eprintln!(
                    "[p4/canonical] open_file_with_cache: path={} len={}",
                    file_path,
                    html.len()
                );
                html
            } else if should_inject_block_ids_for_plain_text(&file_type) {
                let injected = inject_blockids_for_plain_text(&raw);
                injected_block_ws = injected != raw;
                let stats = inspect_block_id_map(&injected);
                if stats.has_duplicates {
                    return Err(format!(
                        "E_APPLY_FAILED:DUPLICATE_BLOCK_IDS: path={} total={} unique={}",
                        file_path, stats.total, stats.unique
                    ));
                }
                db.upsert_file_cache(&file_path, &file_type, Some(&injected), None, mtime)?;
                injected
            } else {
                db.upsert_file_cache(&file_path, &file_type, Some(&raw), None, mtime)?;
                raw
            }
        }
    };
    gates.canonical_loaded = true;
    finalize_gate_by_content(&file_path, &content, &mut gates)?;

    let pending_diffs = db.get_pending_diffs(&file_path)?;
    let pending_dtos = if pending_diffs.is_empty() {
        None
    } else {
        Some(
            pending_diffs
                .into_iter()
                .map(|d| PendingDiffDto {
                    id: d.id,
                    file_path: d.file_path,
                    diff_index: d.diff_index,
                    original_text: d.original_text,
                    new_text: d.new_text,
                    para_index: d.para_index,
                    diff_type: d.diff_type,
                    status: d.status,
                })
                .collect(),
        )
    };

    Ok(OpenFileResult {
        content,
        pending_diffs: pending_dtos,
        gates,
        route_scene,
        injected_block_ws,
    })
}

#[tauri::command]
pub async fn open_docx_with_cache(
    workspace_path: String,
    file_path: String,
) -> Result<OpenFileResult, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let mut gates = NonCurrentFileGates::default();
    let full_path = resolve_target_file_under_workspace(&workspace_path, &file_path).map_err(|e| {
        gate_error("TARGET_FILE_RESOLVE_FAILED", &e, &gates)
    })?;
    gates.target_file_resolved = true;

    let mtime = std::fs::metadata(&full_path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);

    let cached = db.get_file_cache(&file_path)?;
    let mut route_scene = "4".to_string();
    let content = match &cached {
        Some(entry) if entry.mtime == mtime => {
            materialize_cached_body_if_stale_hash(
                &db,
                &file_path,
                "docx",
                entry.cached_content.clone(),
                entry.content_hash.clone(),
                mtime,
            )?
        }
        _ => {
            route_scene = "5".to_string();
            let path_str = full_path.to_string_lossy().to_string();
            let raw = open_docx_for_edit(path_str)
                .await
                .map_err(|e| format!("打开 DOCX 失败: {}", e))?;
            let (html, hash) = canonical_html_for_workspace_cache(&raw);
            db.upsert_file_cache(
                &file_path,
                "docx",
                Some(&html),
                Some(hash.as_str()),
                mtime,
            )?;
            eprintln!(
                "[p4/canonical] open_docx_with_cache: path={} len={}",
                file_path,
                html.len()
            );
            html
        }
    };
    gates.canonical_loaded = true;
    finalize_gate_by_content(&file_path, &content, &mut gates)?;

    let pending_diffs = db.get_pending_diffs(&file_path)?;
    let pending_dtos = if pending_diffs.is_empty() {
        None
    } else {
        Some(
            pending_diffs
                .into_iter()
                .map(|d| PendingDiffDto {
                    id: d.id,
                    file_path: d.file_path,
                    diff_index: d.diff_index,
                    original_text: d.original_text,
                    new_text: d.new_text,
                    para_index: d.para_index,
                    diff_type: d.diff_type,
                    status: d.status,
                })
                .collect(),
        )
    };

    Ok(OpenFileResult {
        content,
        pending_diffs: pending_dtos,
        gates,
        route_scene,
        injected_block_ws: false,
    })
}

/// ai_edit_file_with_diff：生成 diff 并写入 pending_diffs，不写盘
#[tauri::command]
pub async fn ai_edit_file_with_diff(
    workspace_path: String,
    file_path: String,
    old_content: String,
    new_content: String,
) -> Result<Vec<PendingDiffDto>, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;

    let ext = Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt");
    let diffs = diff_engine::generate_pending_diffs_for_file_type(&old_content, &new_content, ext);
    if diffs.is_empty() {
        return Ok(Vec::new());
    }

    let rows: Vec<(String, String, i32)> = diffs
        .iter()
        .map(|d| (d.original_text.clone(), d.new_text.clone(), d.para_index))
        .collect();

    let entries = db.insert_pending_diffs(&file_path, &rows)?;
    Ok(entries
        .into_iter()
        .map(|d| PendingDiffDto {
            id: d.id,
            file_path: d.file_path,
            diff_index: d.diff_index,
            original_text: d.original_text,
            new_text: d.new_text,
            para_index: d.para_index,
            diff_type: d.diff_type,
            status: d.status,
        })
        .collect())
}

/// 按 diff_index 倒序应用 diffs 到 content（行级，6.5）
fn apply_diffs_to_content(content: &str, diffs: &[PendingDiffEntry]) -> Result<String, String> {
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut sorted: Vec<&PendingDiffEntry> = diffs.iter().collect();
    sorted.sort_by(|a, b| b.diff_index.cmp(&a.diff_index));

    for d in sorted {
        if !d.original_text.is_empty() {
            let start = d.para_index as usize;
            let num_old = d.original_text.lines().count().max(1);
            let end = (start + num_old).min(lines.len());
            if start >= lines.len() {
                return Err(format!(
                    "E_APPLY_FAILED: para_index {} out of range (lines={})",
                    d.para_index,
                    lines.len()
                ));
            }
            let old_joined: String = lines[start..end].join("\n");
            if old_joined != d.original_text {
                return Err(format!(
                    "E_ORIGINALTEXT_MISMATCH: para_index={} expected_len={} actual_len={}",
                    d.para_index,
                    d.original_text.len(),
                    old_joined.len()
                ));
            }
            let new_lines: Vec<String> = d.new_text.lines().map(|s| s.to_string()).collect();
            lines.splice(start..end, new_lines);
        } else {
            let new_lines: Vec<String> = d.new_text.lines().map(|s| s.to_string()).collect();
            let pos = d.para_index as usize;
            if pos > lines.len() {
                return Err(format!(
                    "E_APPLY_FAILED: insert para_index {} out of range (lines={})",
                    d.para_index,
                    lines.len()
                ));
            }
            for (i, line) in new_lines.into_iter().enumerate() {
                lines.insert(pos + i, line);
            }
        }
    }
    Ok(lines.join("\n"))
}

/// accept_file_diffs：应用 pending diffs 并写盘（6.5）
/// diff_indices 可选，不传则应用全部
#[tauri::command]
pub async fn accept_file_diffs(
    workspace_path: String,
    file_path: String,
    diff_indices: Option<Vec<i32>>,
) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let full_path = Path::new(&workspace_path).join(&file_path);

    let mut diffs = db.get_pending_diffs(&file_path)?;
    if diffs.is_empty() {
        return Err("没有待确认的修改".to_string());
    }
    if let Some(indices) = &diff_indices {
        let set: std::collections::HashSet<i32> = indices.iter().copied().collect();
        diffs.retain(|d| set.contains(&d.diff_index));
        if diffs.is_empty() {
            return Err("指定的 diff 不存在".to_string());
        }
    }

    let file_type = full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase();

    let base_content = match db.get_file_cache(&file_path)? {
        Some(entry) => materialize_cached_body_if_stale_hash(
            &db,
            &file_path,
            &file_type,
            entry.cached_content.clone(),
            entry.content_hash.clone(),
            entry.mtime,
        )?,
        None => {
            let path_str = full_path.to_string_lossy().to_string();
            let raw = if file_type == "docx" {
                open_docx_for_edit(path_str)
                    .await
                    .map_err(|e| format!("读取 DOCX 失败: {}", e))?
            } else {
                read_file_content(path_str)
                    .await
                    .map_err(|e| format!("读取文件失败: {}", e))?
            };
            if should_run_workspace_canonical_pipeline(&file_type) {
                canonical_html_for_workspace_cache(&raw).0
            } else {
                raw
            }
        }
    };

    let final_content = apply_diffs_to_content(&base_content, &diffs)?;

    let (body_to_store, content_hash_opt) =
        if should_run_workspace_canonical_pipeline(&file_type) {
            let (html, hash) = canonical_html_for_workspace_cache(&final_content);
            eprintln!(
                "[p4/canonical] accept_file_diffs: path={} cache_len={}",
                file_path,
                html.len()
            );
            (html, Some(hash))
        } else {
            (final_content.clone(), None)
        };

    if file_type == "docx" {
        use crate::services::pandoc_service::PandocService;
        let pandoc = PandocService::new();
        if !pandoc.is_available() {
            return Err("Pandoc 不可用，无法将 HTML 转为 DOCX".to_string());
        }
        pandoc.convert_html_to_docx(&body_to_store, &full_path)
            .map_err(|e| format!("DOCX 转换失败: {}", e))?;
    } else {
        std::fs::write(&full_path, &body_to_store).map_err(|e| format!("写入文件失败: {}", e))?;
    }

    db.delete_pending_diffs(&file_path)?;
    let mtime = std::fs::metadata(&full_path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);
    db.upsert_file_cache(
        &file_path,
        &file_type,
        Some(&body_to_store),
        content_hash_opt.as_deref(),
        mtime,
    )?;

    let _ = record_file_content_timeline_node(
        &db,
        Path::new(&workspace_path),
        &file_path,
        &file_type,
        "accept_file_diffs",
        &format!("接受待确认修改：{}", file_path),
        "ai",
        &base_content,
        &final_content,
    )?;

    Ok(())
}

/// reject_file_diffs：拒绝并清除 pending diffs
#[tauri::command]
pub async fn reject_file_diffs(workspace_path: String, file_path: String) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    db.delete_pending_diffs(&file_path)?;
    Ok(())
}

/// 编辑器保存成功后：经 P4 canonical 管道更新 `file_cache`，与 `open_*_with_cache` 一致
#[tauri::command]
pub async fn sync_workspace_file_cache_after_save(
    workspace_path: String,
    file_absolute_path: String,
    html_content: String,
    service: State<'_, AIServiceState>,
) -> Result<(), String> {
    // 记忆内容提取（文本文件，60s 节流，fire-and-forget）
    {
        let is_text = {
            let ext = std::path::Path::new(&file_absolute_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            matches!(ext.as_str(), "md" | "txt" | "html" | "htm" | "rst")
        };
        if is_text && !html_content.trim().is_empty() {
            // 获取 AI provider（fire-and-forget，失败静默）
            let provider_opt = {
                let guard = service.lock().ok();
                guard.and_then(|g| g.get_provider("deepseek").or_else(|| g.get_provider("openai")))
            };
            if let Some(provider) = provider_opt {
                let ws = std::path::PathBuf::from(workspace_path.clone());
                let fp = file_absolute_path.clone();
                let html = html_content.clone();
                tokio::spawn(async move {
                    // 60s 节流检查
                    let svc = match crate::services::memory_service::MemoryService::new(&ws) {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    if let Some(t) = svc.get_last_content_extraction_time(&fp).await {
                        if now - t < 60 {
                            eprintln!("[memory] content extraction skipped: cooldown for {}", fp);
                            return;
                        }
                    }
                    drop(svc); // release before task
                    eprintln!("[memory] content extraction triggered for {}", fp);
                    crate::services::memory_service::memory_generation_task_content(
                        provider, ws, fp, html,
                    ).await;
                });
            }
        }
    }

    let Some(rel) = relative_path_under_workspace(&workspace_path, &file_absolute_path) else {
        return Ok(());
    };
    let full_path = Path::new(&workspace_path).join(&rel);
    let file_type = Path::new(&rel)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase();
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let mtime = std::fs::metadata(&full_path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);

    let cache_key = sync_cache_key(&workspace_path, &rel);
    if should_skip_duplicate_sync(&cache_key, &html_content) {
        eprintln!(
            "[p4/canonical] sync after editor save skipped (duplicate content) rel={}",
            rel
        );
        return Ok(());
    }

    if !should_run_workspace_canonical_pipeline(&file_type) {
        // md/txt：直接将编辑器 HTML（含 TipTap block ID）存入缓存，保留 block ID 连续性
        if !html_content.trim().is_empty() {
            db.upsert_file_cache(&rel, &file_type, Some(&html_content), None, mtime)?;
            record_sync_success(&cache_key, &html_content);
            eprintln!(
                "[p4/canonical] sync after editor save (non-canonical) rel={} len={}",
                rel,
                html_content.len()
            );
        }
        return Ok(());
    }
    let (body, hash) = canonical_html_for_workspace_cache(&html_content);
    db.upsert_file_cache(&rel, &file_type, Some(&body), Some(hash.as_str()), mtime)?;
    record_sync_success(&cache_key, &html_content);
    eprintln!(
        "[p4/canonical] sync after editor save rel={} len={}",
        rel,
        body.len()
    );
    Ok(())
}

fn relative_path_under_workspace(workspace_path: &str, file_path: &str) -> Option<String> {
    let ws = workspace_path.replace('\\', "/").trim_end_matches('/').to_string();
    if ws.is_empty() {
        return None;
    }
    let f = file_path.replace('\\', "/");
    let prefix = format!("{}/", ws);
    if f.starts_with(&prefix) {
        return Some(f[prefix.len()..].to_string());
    }
    if f == ws {
        return None;
    }
    // 已是工作区相对路径（无前导盘符 / 根）
    let looks_absolute = f.starts_with('/') || f.starts_with("//") || f.contains(":/") || f.contains(":\\");
    if !looks_absolute {
        return Some(
            f.trim_start_matches(|c| c == '/' || c == '\\')
                .replace('\\', "/"),
        );
    }
    None
}

#[tauri::command]
pub async fn record_saved_file_timeline_node(
    workspace_path: String,
    file_absolute_path: String,
    before_content: String,
    after_content: String,
) -> Result<bool, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let abs = PathBuf::from(&file_absolute_path);
    let rel = relative_path_under_workspace(&workspace_path, &file_absolute_path)
        .unwrap_or_else(|| file_absolute_path.replace('\\', "/"));
    let file_type = abs
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase();

    record_file_content_timeline_node(
        &db,
        Path::new(&workspace_path),
        &rel,
        &file_type,
        "save_file",
        &format!("保存文件：{}", rel),
        "user",
        &before_content,
        &after_content,
    )
}

#[tauri::command]
pub async fn list_timeline_nodes(
    workspace_path: String,
    limit: Option<usize>,
) -> Result<Vec<TimelineNodeRecord>, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    db.list_timeline_nodes(limit.unwrap_or(50))
}

#[tauri::command]
pub async fn get_timeline_restore_preview(
    workspace_path: String,
    node_id: String,
) -> Result<TimelineRestorePreview, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let node = db
        .get_timeline_node(&node_id)?
        .ok_or_else(|| format!("时间轴节点不存在: {}", node_id))?;
    let payload = db
        .get_timeline_restore_payload(&node.restore_payload_id)?
        .ok_or_else(|| format!("时间轴载荷不存在: {}", node.restore_payload_id))?;

    Ok(TimelineRestorePreview {
        node,
        payload_kind: payload.payload_kind,
    })
}

#[tauri::command]
pub async fn restore_timeline_node(
    workspace_path: String,
    node_id: String,
    app: tauri::AppHandle,
) -> Result<TimelineRestoreResult, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let node = db
        .get_timeline_node(&node_id)?
        .ok_or_else(|| format!("时间轴节点不存在: {}", node_id))?;
    if !node.restorable {
        return Err("该时间轴节点不可还原".to_string());
    }

    let payload = db
        .get_timeline_restore_payload(&node.restore_payload_id)?
        .ok_or_else(|| format!("时间轴载荷不存在: {}", node.restore_payload_id))?;

    let state_changed = payload_differs_from_current(Path::new(&workspace_path), &node, &payload)?;
    let impacted_paths = restore_payload(Path::new(&workspace_path), &payload)?;
    let mut created_node = false;

    if state_changed {
        let restore_node = TimelineNodeRecord {
            node_id: uuid::Uuid::new_v4().to_string(),
            workspace_path: workspace_path.clone(),
            node_type: "restore_commit".to_string(),
            operation_type: "restore".to_string(),
            summary: format!("还原到：{}", node.summary),
            impact_scope: node.impact_scope.clone(),
            actor: "system_restore".to_string(),
            restorable: true,
            restore_payload_id: uuid::Uuid::new_v4().to_string(),
            created_at: chrono::Utc::now().timestamp_millis(),
        };
        let restore_payload_record = TimelineRestorePayloadRecord {
            payload_id: restore_node.restore_payload_id.clone(),
            workspace_path: workspace_path.clone(),
            payload_kind: payload.payload_kind.clone(),
            payload_json: payload.payload_json.clone(),
            created_at: chrono::Utc::now().timestamp_millis(),
        };
        db.insert_timeline_node_with_payload(&restore_node, &restore_payload_record, 50)?;
        created_node = true;
    }

    let _ = app.emit("file-tree-changed", &workspace_path);

    Ok(TimelineRestoreResult {
        impacted_paths,
        created_node,
    })
}

/// Phase 5.5：获取工作区内所有文件依赖
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDependencyDto {
    pub source_path: String,
    pub target_path: String,
    pub dependency_type: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn get_file_dependencies(workspace_path: String) -> Result<Vec<FileDependencyDto>, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let deps = db.get_all_file_dependencies()?;
    Ok(deps
        .into_iter()
        .map(|(s, t, ty, d)| FileDependencyDto {
            source_path: s,
            target_path: t,
            dependency_type: ty,
            description: d,
        })
        .collect())
}

/// Phase 5.5：保存文件依赖（AI 推断或用户显式添加）
#[tauri::command]
pub async fn save_file_dependency(
    workspace_path: String,
    source_path: String,
    target_path: String,
    dependency_type: String,
    description: Option<String>,
) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    db.save_file_dependency(
        &source_path,
        &target_path,
        &dependency_type,
        description.as_deref(),
    )
}

// ── Agent Tasks / Artifacts 命令 ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskDto {
    pub id: String,
    pub chat_tab_id: String,
    pub goal: String,
    pub lifecycle: String,
    pub stage: String,
    pub stage_reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentArtifactDto {
    pub id: String,
    pub task_id: Option<String>,
    pub kind: String,
    pub status: String,
    pub summary: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn upsert_agent_task(
    workspace_path: String,
    id: String,
    chat_tab_id: String,
    goal: String,
    lifecycle: String,
    stage: String,
    stage_reason: Option<String>,
) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    db.upsert_agent_task(&id, &chat_tab_id, &goal, &lifecycle, &stage, stage_reason.as_deref())
}

#[tauri::command]
pub async fn get_agent_tasks_for_chat_tab(
    workspace_path: String,
    chat_tab_id: String,
) -> Result<Vec<AgentTaskDto>, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let rows = db.get_agent_tasks_by_chat_tab(&chat_tab_id)?;
    Ok(rows.into_iter().map(|r| AgentTaskDto {
        id: r.id,
        chat_tab_id: r.chat_tab_id,
        goal: r.goal,
        lifecycle: r.lifecycle,
        stage: r.stage,
        stage_reason: r.stage_reason,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
}

#[tauri::command]
pub async fn update_agent_task_stage(
    workspace_path: String,
    id: String,
    stage: String,
    stage_reason: Option<String>,
) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    db.update_agent_task_stage(&id, &stage, stage_reason.as_deref())
}

#[tauri::command]
pub async fn upsert_agent_artifact(
    workspace_path: String,
    id: String,
    task_id: Option<String>,
    kind: String,
    status: String,
    summary: Option<String>,
) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    db.upsert_agent_artifact(&id, task_id.as_deref(), &kind, &status, summary.as_deref())
}

#[tauri::command]
pub async fn get_agent_artifacts_for_task(
    workspace_path: String,
    task_id: String,
) -> Result<Vec<AgentArtifactDto>, String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let rows = db.get_agent_artifacts_by_task(&task_id)?;
    Ok(rows.into_iter().map(|r| AgentArtifactDto {
        id: r.id,
        task_id: r.task_id,
        kind: r.kind,
        status: r.status,
        summary: r.summary,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
}
