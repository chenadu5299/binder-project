use crate::workspace::workspace_db::{
    TimelineNodeRecord, TimelineRestorePayloadRecord, WorkspaceDb,
};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const TIMELINE_NODE_LIMIT: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineFileRestoreEntry {
    pub file_path: String,
    pub file_type: String,
    pub content_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineResourceRestoreEntry {
    pub path: String,
    pub entry_type: String,
    pub desired_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_base64: Option<String>,
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn normalize_content_for_compare(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}

pub fn relative_path_under_workspace(workspace_root: &Path, path: &Path) -> Result<String, String> {
    let ws = workspace_root
        .canonicalize()
        .map_err(|e| format!("workspace canonicalize 失败: {}", e))?;

    if path.exists() {
        let p = path
            .canonicalize()
            .map_err(|e| format!("路径 canonicalize 失败: {}", e))?;
        if !p.starts_with(&ws) {
            return Err(format!("路径越界: {}", path.to_string_lossy()));
        }
        return Ok(
            p.strip_prefix(&ws)
                .map_err(|e| format!("计算相对路径失败: {}", e))?
                .to_string_lossy()
                .replace('\\', "/"),
        );
    }

    let raw = path.to_string_lossy().replace('\\', "/");
    let root = workspace_root.to_string_lossy().replace('\\', "/");
    if raw == root {
        return Ok(String::new());
    }
    if let Some(stripped) = raw.strip_prefix(&(root.clone() + "/")) {
        return Ok(stripped.to_string());
    }
    Err(format!("路径越界: {}", raw))
}

fn build_node(
    workspace_root: &Path,
    node_type: &str,
    operation_type: &str,
    summary: &str,
    impact_scope: Vec<String>,
    actor: &str,
    payload_id: String,
) -> TimelineNodeRecord {
    TimelineNodeRecord {
        node_id: Uuid::new_v4().to_string(),
        workspace_path: workspace_root.to_string_lossy().to_string(),
        node_type: node_type.to_string(),
        operation_type: operation_type.to_string(),
        summary: summary.to_string(),
        impact_scope,
        actor: actor.to_string(),
        restorable: true,
        restore_payload_id: payload_id,
        created_at: now_millis(),
    }
}

pub fn record_file_content_timeline_node(
    db: &WorkspaceDb,
    workspace_root: &Path,
    file_path: &str,
    file_type: &str,
    operation_type: &str,
    summary: &str,
    actor: &str,
    before_content: &str,
    after_content: &str,
) -> Result<bool, String> {
    if normalize_content_for_compare(before_content) == normalize_content_for_compare(after_content) {
        return Ok(false);
    }

    let payload_id = Uuid::new_v4().to_string();
    let payload = TimelineRestorePayloadRecord {
        payload_id: payload_id.clone(),
        workspace_path: workspace_root.to_string_lossy().to_string(),
        payload_kind: "file_content".to_string(),
        payload_json: json!({
            "kind": "file_content",
            "files": [{
                "filePath": file_path,
                "fileType": file_type,
                "contentBase64": general_purpose::STANDARD.encode(after_content.as_bytes()),
            }]
        }),
        created_at: now_millis(),
    };

    let node = build_node(
        workspace_root,
        "file_content",
        operation_type,
        summary,
        vec![file_path.to_string()],
        actor,
        payload_id,
    );

    db.insert_timeline_node_with_payload(&node, &payload, TIMELINE_NODE_LIMIT)?;
    Ok(true)
}

fn capture_resource_state_recursive(
    workspace_root: &Path,
    path: &Path,
    entries: &mut Vec<TimelineResourceRestoreEntry>,
    seen: &mut HashSet<String>,
) -> Result<(), String> {
    let relative = relative_path_under_workspace(workspace_root, path)?;
    if !seen.insert(relative.clone()) {
        return Ok(());
    }

    if !path.exists() {
        entries.push(TimelineResourceRestoreEntry {
            path: relative,
            entry_type: "unknown".to_string(),
            desired_state: "absent".to_string(),
            content_base64: None,
        });
        return Ok(());
    }

    if path.is_dir() {
        entries.push(TimelineResourceRestoreEntry {
            path: relative.clone(),
            entry_type: "dir".to_string(),
            desired_state: "present".to_string(),
            content_base64: None,
        });

        let mut children: Vec<PathBuf> = std::fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .collect();
        children.sort();
        for child in children {
            capture_resource_state_recursive(workspace_root, &child, entries, seen)?;
        }
    } else {
        let bytes = std::fs::read(path).map_err(|e| format!("读取文件快照失败: {}", e))?;
        entries.push(TimelineResourceRestoreEntry {
            path: relative,
            entry_type: "file".to_string(),
            desired_state: "present".to_string(),
            content_base64: Some(general_purpose::STANDARD.encode(bytes)),
        });
    }

    Ok(())
}

pub fn record_resource_structure_timeline_node(
    db: &WorkspaceDb,
    workspace_root: &Path,
    operation_type: &str,
    summary: &str,
    actor: &str,
    impact_paths: &[PathBuf],
) -> Result<bool, String> {
    if impact_paths.is_empty() {
        return Ok(false);
    }

    let mut impact_scope = Vec::new();
    let mut impact_seen = HashSet::new();
    let mut entries = Vec::new();
    let mut entry_seen = HashSet::new();

    for path in impact_paths {
        let relative = relative_path_under_workspace(workspace_root, path)?;
        if impact_seen.insert(relative.clone()) {
            impact_scope.push(relative);
        }
        capture_resource_state_recursive(workspace_root, path, &mut entries, &mut entry_seen)?;
    }

    if entries.is_empty() {
        return Ok(false);
    }

    let payload_id = Uuid::new_v4().to_string();
    let payload = TimelineRestorePayloadRecord {
        payload_id: payload_id.clone(),
        workspace_path: workspace_root.to_string_lossy().to_string(),
        payload_kind: "resource_structure".to_string(),
        payload_json: json!({
            "kind": "resource_structure",
            "entries": entries,
        }),
        created_at: now_millis(),
    };

    let node = build_node(
        workspace_root,
        "resource_structure",
        operation_type,
        summary,
        impact_scope,
        actor,
        payload_id,
    );

    db.insert_timeline_node_with_payload(&node, &payload, TIMELINE_NODE_LIMIT)?;
    Ok(true)
}

pub fn payload_differs_from_current(
    workspace_root: &Path,
    node: &TimelineNodeRecord,
    payload: &TimelineRestorePayloadRecord,
) -> Result<bool, String> {
    match payload.payload_kind.as_str() {
        "file_content" => {
            let files = payload
                .payload_json
                .get("files")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "file_content payload 缺少 files".to_string())?;

            for file in files {
                let path = file
                    .get("filePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "filePath 缺失".to_string())?;
                let desired = file
                    .get("contentBase64")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "contentBase64 缺失".to_string())?;
                let full_path = workspace_root.join(path);
                let current = if full_path.exists() {
                    general_purpose::STANDARD.encode(
                        std::fs::read(&full_path).map_err(|e| format!("读取当前文件失败: {}", e))?,
                    )
                } else {
                    String::new()
                };
                if current != desired {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        "resource_structure" => {
            let mut current_entries = Vec::new();
            let mut seen = HashSet::new();
            for relative in &node.impact_scope {
                let full_path = workspace_root.join(relative);
                capture_resource_state_recursive(workspace_root, &full_path, &mut current_entries, &mut seen)?;
            }
            let desired_entries = payload
                .payload_json
                .get("entries")
                .cloned()
                .unwrap_or_else(|| json!([]));
            let current_json = serde_json::to_value(current_entries)
                .map_err(|e| format!("序列化当前资源状态失败: {}", e))?;
            Ok(current_json != desired_entries)
        }
        _ => Ok(false),
    }
}

pub fn restore_payload(
    workspace_root: &Path,
    payload: &TimelineRestorePayloadRecord,
) -> Result<Vec<String>, String> {
    match payload.payload_kind.as_str() {
        "file_content" => {
            let files = payload
                .payload_json
                .get("files")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "file_content payload 缺少 files".to_string())?;

            let mut impacted = Vec::new();
            for file in files {
                let path = file
                    .get("filePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "filePath 缺失".to_string())?;
                let file_type = file
                    .get("fileType")
                    .and_then(|v| v.as_str())
                    .unwrap_or("txt");
                let content_b64 = file
                    .get("contentBase64")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "contentBase64 缺失".to_string())?;
                let content = general_purpose::STANDARD
                    .decode(content_b64)
                    .map_err(|e| format!("解码文件内容失败: {}", e))?;
                let full_path = workspace_root.join(path);
                if let Some(parent) = full_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("创建父目录失败: {}", e))?;
                }
                if file_type == "docx" {
                    let html = String::from_utf8(content)
                        .map_err(|e| format!("DOCX 还原内容不是合法 UTF-8: {}", e))?;
                    use crate::services::pandoc_service::PandocService;
                    let pandoc = PandocService::new();
                    if !pandoc.is_available() {
                        return Err("Pandoc 不可用，无法还原 DOCX".to_string());
                    }
                    pandoc
                        .convert_html_to_docx(&html, &full_path)
                        .map_err(|e| format!("DOCX 还原失败: {}", e))?;
                } else {
                    std::fs::write(&full_path, content)
                        .map_err(|e| format!("写入还原文件失败: {}", e))?;
                }
                impacted.push(path.to_string());
            }
            Ok(impacted)
        }
        "resource_structure" => {
            let entries_value = payload
                .payload_json
                .get("entries")
                .cloned()
                .unwrap_or_else(|| json!([]));
            let mut entries: Vec<TimelineResourceRestoreEntry> = serde_json::from_value(entries_value)
                .map_err(|e| format!("解析 resource_structure payload 失败: {}", e))?;

            let mut impacted: Vec<String> = entries.iter().map(|entry| entry.path.clone()).collect();
            impacted.sort();
            impacted.dedup();

            let mut present_dirs: Vec<_> = entries
                .iter()
                .filter(|entry| entry.desired_state == "present" && entry.entry_type == "dir")
                .cloned()
                .collect();
            present_dirs.sort_by_key(|entry| entry.path.matches('/').count());

            let mut present_files: Vec<_> = entries
                .iter()
                .filter(|entry| entry.desired_state == "present" && entry.entry_type == "file")
                .cloned()
                .collect();
            present_files.sort_by_key(|entry| entry.path.matches('/').count());

            let mut absent_entries: Vec<_> = entries
                .drain(..)
                .filter(|entry| entry.desired_state == "absent")
                .collect();
            absent_entries.sort_by_key(|entry| std::cmp::Reverse(entry.path.matches('/').count()));

            for entry in present_dirs {
                std::fs::create_dir_all(workspace_root.join(&entry.path))
                    .map_err(|e| format!("创建目录失败: {}", e))?;
            }

            for entry in present_files {
                let full_path = workspace_root.join(&entry.path);
                if let Some(parent) = full_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("创建父目录失败: {}", e))?;
                }
                let content = entry
                    .content_base64
                    .ok_or_else(|| format!("资源文件快照缺少 content: {}", entry.path))?;
                let bytes = general_purpose::STANDARD
                    .decode(content)
                    .map_err(|e| format!("解码资源文件快照失败: {}", e))?;
                std::fs::write(&full_path, bytes)
                    .map_err(|e| format!("写入资源文件失败: {}", e))?;
            }

            for entry in absent_entries {
                let full_path = workspace_root.join(&entry.path);
                if full_path.is_file() {
                    let _ = std::fs::remove_file(&full_path);
                } else if full_path.is_dir() {
                    let _ = std::fs::remove_dir_all(&full_path);
                } else if full_path.exists() {
                    let _ = std::fs::remove_file(&full_path);
                    let _ = std::fs::remove_dir_all(&full_path);
                }
            }

            Ok(impacted)
        }
        _ => Err(format!("不支持的时间轴载荷类型: {}", payload.payload_kind)),
    }
}
