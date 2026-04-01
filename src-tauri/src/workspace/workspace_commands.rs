//! Workspace Tauri 命令
//!
//! open_file_with_cache、open_docx_with_cache、ai_edit_file_with_diff、accept_file_diffs、reject_file_diffs

use crate::workspace::workspace_db::{WorkspaceDb, PendingDiffEntry};
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
use serde::{Serialize, Deserialize};

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
                return Err(format!("para_index {} 越界", d.para_index));
            }
            let old_joined: String = lines[start..end].join("\n");
            if old_joined != d.original_text {
                return Err(format!(
                    "original_text 不匹配 at para_index {} (expected {} chars, got {} chars)",
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
                return Err(format!("insert para_index {} 越界", d.para_index));
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
            (final_content, None)
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
) -> Result<(), String> {
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
