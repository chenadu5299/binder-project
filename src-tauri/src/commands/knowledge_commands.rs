use crate::services::knowledge::{
  KnowledgeDeleteRequest, KnowledgeEntryListResponse, KnowledgeIngestRequest, KnowledgeMoveRequest,
  KnowledgePolicyUpdateRequest, KnowledgeQueryRequest, KnowledgeQueryResponse,
  KnowledgeRebuildRequest, KnowledgeRecoveryResponse, KnowledgeRenameRequest,
  KnowledgeReplaceRequest, KnowledgeRetryRequest, KnowledgeService,
  KnowledgeVerificationUpdateRequest, KnowledgeWorkspaceSnapshotUpsertRequest,
  KnowledgeWriteResponse,
};
use std::path::Path;

#[tauri::command]
pub async fn ingest_knowledge_document(
  workspace_path: String,
  request: KnowledgeIngestRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.ingest_document(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn replace_knowledge_document(
  workspace_path: String,
  request: KnowledgeReplaceRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.replace_document(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_workspace_snapshot_to_knowledge(
  workspace_path: String,
  request: KnowledgeWorkspaceSnapshotUpsertRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service
    .upsert_workspace_snapshot(request)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_knowledge_entry(
  workspace_path: String,
  request: KnowledgeDeleteRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.delete_entry(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_knowledge_entry(
  workspace_path: String,
  request: KnowledgeRenameRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.rename_entry(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_knowledge_entry(
  workspace_path: String,
  request: KnowledgeMoveRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.move_entry(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn query_knowledge_base(
  workspace_path: String,
  request: KnowledgeQueryRequest,
) -> Result<KnowledgeQueryResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service
    .query_knowledge_base(request)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebuild_knowledge_entry(
  workspace_path: String,
  request: KnowledgeRebuildRequest,
) -> Result<KnowledgeRecoveryResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.rebuild_entry(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn retry_knowledge_entry(
  workspace_path: String,
  request: KnowledgeRetryRequest,
) -> Result<KnowledgeRecoveryResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service.retry_entry(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_knowledge_verification(
  workspace_path: String,
  request: KnowledgeVerificationUpdateRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service
    .update_verification_status(request)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_knowledge_entry_policy(
  workspace_path: String,
  request: KnowledgePolicyUpdateRequest,
) -> Result<KnowledgeWriteResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service
    .update_entry_policy(request)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_knowledge_entries(
  workspace_path: String,
  knowledge_base_id: Option<String>,
  query: Option<String>,
  limit: Option<usize>,
) -> Result<KnowledgeEntryListResponse, String> {
  let service = KnowledgeService::new(Path::new(&workspace_path))?;
  service
    .list_knowledge_entries(
      knowledge_base_id.as_deref(),
      query.as_deref(),
      limit.unwrap_or(50),
    )
    .map_err(|e| e.to_string())
}
