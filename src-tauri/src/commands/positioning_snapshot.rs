//! 工具执行前向前端请求当前编辑器的 `L` + `document_revision`（精准定位 §2.1.1 方案 a）。

use once_cell::sync::Lazy;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(Debug, Clone)]
pub struct EditorSnapshotPayload {
    pub html: Option<String>,
    pub document_revision: Option<u64>,
}

static SNAPSHOT_WAITERS: Lazy<Mutex<HashMap<String, oneshot::Sender<EditorSnapshotPayload>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn positioning_submit_editor_snapshot(
    request_id: String,
    html: Option<String>,
    document_revision: Option<u64>,
) -> Result<(), String> {
    let mut map = SNAPSHOT_WAITERS
        .lock()
        .map_err(|e| format!("positioning snapshot lock: {}", e))?;
    if let Some(tx) = map.remove(&request_id) {
        let _ = tx.send(EditorSnapshotPayload {
            html,
            document_revision,
        });
    } else {
        eprintln!(
            "[positioning] submit_editor_snapshot: stale or unknown request_id={}",
            request_id
        );
    }
    Ok(())
}

/// 阻塞至多 `timeout_ms` 毫秒等待前端回传快照；超时或失败则返回 `None`，调用方保留请求入参中的 `L`。
pub async fn request_editor_snapshot_ipc(
    app: &AppHandle,
    file_path: Option<String>,
    timeout_ms: u64,
) -> Option<EditorSnapshotPayload> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    {
        let mut map = SNAPSHOT_WAITERS.lock().ok()?;
        map.insert(request_id.clone(), tx);
    }
    let payload = serde_json::json!({
        "request_id": request_id,
        "file_path": file_path,
    });
    if let Err(e) = app.emit("positioning-request-editor-snapshot", payload) {
        eprintln!("[positioning] emit positioning-request-editor-snapshot failed: {}", e);
        SNAPSHOT_WAITERS.lock().ok()?.remove(&request_id);
        return None;
    }

    match tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        rx,
    )
    .await
    {
        Ok(Ok(payload)) => {
            if payload.html.as_ref().is_some_and(|s| !s.is_empty()) {
                eprintln!(
                    "[positioning] IPC refreshed L len={} document_revision={:?}",
                    payload.html.as_ref().map(|s| s.len()).unwrap_or(0),
                    payload.document_revision
                );
            } else {
                eprintln!("[positioning] IPC snapshot missing/empty; keeping request-time L");
            }
            Some(payload)
        }
        Ok(Err(_)) => {
            eprintln!("[positioning] snapshot channel closed without payload");
            None
        }
        Err(_) => {
            eprintln!(
                "[positioning] snapshot IPC timeout ({}ms) request_id={}",
                timeout_ms, request_id
            );
            let _ = SNAPSHOT_WAITERS.lock().ok()?.remove(&request_id);
            None
        }
    }
}

pub fn merge_editor_snapshot_into_arguments(
    map: &mut serde_json::Map<String, Value>,
    snap: EditorSnapshotPayload,
) {
    if let Some(html) = snap.html {
        if !html.is_empty() {
            map.insert("current_content".to_string(), Value::String(html));
        }
    }
    if let Some(rev) = snap.document_revision {
        map.insert("document_revision".to_string(), serde_json::json!(rev));
    }
}
