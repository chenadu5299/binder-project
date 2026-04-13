use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeErrorCode {
  InvalidInput,
  WorkspaceBoundaryViolation,
  EntryNotFound,
  EntryDeleted,
  FolderNotFound,
  FolderScopeReserved,
  PersistenceFailed,
  ParseFailed,
  ChunkFailed,
  IndexFailed,
  QueryFailed,
  VersionConflict,
  DeleteFailed,
  RebuildFailed,
  RecoveryFailed,
}

impl KnowledgeErrorCode {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::InvalidInput => "invalid_input",
      Self::WorkspaceBoundaryViolation => "workspace_boundary_violation",
      Self::EntryNotFound => "entry_not_found",
      Self::EntryDeleted => "entry_deleted",
      Self::FolderNotFound => "folder_not_found",
      Self::FolderScopeReserved => "folder_scope_reserved",
      Self::PersistenceFailed => "persistence_failed",
      Self::ParseFailed => "parse_failed",
      Self::ChunkFailed => "chunk_failed",
      Self::IndexFailed => "index_failed",
      Self::QueryFailed => "query_failed",
      Self::VersionConflict => "version_conflict",
      Self::DeleteFailed => "delete_failed",
      Self::RebuildFailed => "rebuild_failed",
      Self::RecoveryFailed => "recovery_failed",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeVerificationStatus {
  Unverified,
  Verified,
  NeedsReview,
}

impl KnowledgeVerificationStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Unverified => "unverified",
      Self::Verified => "verified",
      Self::NeedsReview => "needs_review",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeDeletionStatus {
  Active,
  PendingDelete,
  Deleted,
}

impl KnowledgeDeletionStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Active => "active",
      Self::PendingDelete => "pending_delete",
      Self::Deleted => "deleted",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeRetrievalStatus {
  Eligible,
  Suppressed,
}

impl KnowledgeRetrievalStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Eligible => "eligible",
      Self::Suppressed => "suppressed",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeDocumentState {
  Pending,
  Processing,
  Ready,
  Failed,
  Superseded,
  Deleted,
}

impl KnowledgeDocumentState {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Pending => "pending",
      Self::Processing => "processing",
      Self::Ready => "ready",
      Self::Failed => "failed",
      Self::Superseded => "superseded",
      Self::Deleted => "deleted",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeCitationStatus {
  Active,
  Superseded,
  Deleted,
  Unavailable,
}

impl KnowledgeCitationStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Active => "active",
      Self::Superseded => "superseded",
      Self::Deleted => "deleted",
      Self::Unavailable => "unavailable",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeRetrievalMode {
  ManualQuery,
  Explicit,
  Automatic,
}

impl KnowledgeRetrievalMode {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::ManualQuery => "manual_query",
      Self::Explicit => "explicit",
      Self::Automatic => "automatic",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSyncMode {
  None,
  Snapshot,
  FollowSource,
  ExternalScheduled,
}

impl KnowledgeSyncMode {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::None => "none",
      Self::Snapshot => "snapshot",
      Self::FollowSource => "follow_source",
      Self::ExternalScheduled => "external_scheduled",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeVisibilityScope {
  Workspace,
  ExplicitOnly,
}

impl KnowledgeVisibilityScope {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Workspace => "workspace",
      Self::ExplicitOnly => "explicit_only",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeAccessPolicy {
  WorkspaceAuto,
  ExplicitOnly,
  Blocked,
}

impl KnowledgeAccessPolicy {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::WorkspaceAuto => "workspace_auto",
      Self::ExplicitOnly => "explicit_only",
      Self::Blocked => "blocked",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeQueryIntent {
  Recall,
  Citation,
  Augmentation,
}

impl KnowledgeQueryIntent {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Recall => "recall",
      Self::Citation => "citation",
      Self::Augmentation => "augmentation",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeAssetKind {
  Standard,
  StructureAsset,
}

impl KnowledgeAssetKind {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Standard => "standard",
      Self::StructureAsset => "structure_asset",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSourceRole {
  FactKnowledge,
  StructureReference,
}

impl KnowledgeSourceRole {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::FactKnowledge => "fact_knowledge",
      Self::StructureReference => "structure_reference",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeQueryMode {
  Content,
  StructureReference,
}

impl KnowledgeQueryMode {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Content => "content",
      Self::StructureReference => "structure_reference",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeAssetKindFilter {
  Standard,
  StructureAsset,
  All,
}

impl KnowledgeAssetKindFilter {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Standard => "standard",
      Self::StructureAsset => "structure_asset",
      Self::All => "all",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeRetrievalStrategy {
  LexicalOnly,
  Hybrid,
  HybridWithRerank,
}

impl KnowledgeRetrievalStrategy {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::LexicalOnly => "lexical_only",
      Self::Hybrid => "hybrid",
      Self::HybridWithRerank => "hybrid_with_rerank",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSourceStatus {
  Ready,
  Missing,
  Unreadable,
}

impl KnowledgeSourceStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Ready => "ready",
      Self::Missing => "missing",
      Self::Unreadable => "unreadable",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
  pub id: String,
  pub name: String,
  pub description: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Folder 仍为预留对象。
/// 当前封板范围不包含 folder 主链，不应把它视为已完成对象。
pub struct KnowledgeFolder {
  pub id: String,
  pub knowledge_base_id: String,
  pub parent_folder_id: Option<String>,
  pub name: String,
  pub path: String,
  pub created_at: i64,
  pub updated_at: i64,
  pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntry {
  pub id: String,
  pub knowledge_base_id: String,
  pub folder_id: Option<String>,
  pub title: String,
  pub entry_type: String,
  pub asset_kind: String,
  pub source_type: String,
  pub source_ref: Option<String>,
  pub sync_mode: String,
  pub visibility_scope: String,
  pub access_policy: String,
  pub active_document_id: Option<String>,
  pub verification_status: String,
  pub deletion_status: String,
  pub retrieval_status: String,
  pub source_status: String,
  pub source_status_message: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
  pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeStructureMetadata {
  pub document_form: String,
  pub structure_purpose: String,
  pub applicable_scenarios: Vec<String>,
  pub section_outline_summary: String,
  pub slot_hints: Vec<String>,
  pub source_nature: String,
  pub structure_tags: Option<Vec<String>>,
  pub style_scope: Option<String>,
  pub usage_notes: Option<String>,
  pub sample_origin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeProvenance {
  pub source_type: String,
  pub source_ref: Option<String>,
  pub workspace_path: String,
  pub snapshot_mode: String,
  pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocument {
  pub id: String,
  pub entry_id: String,
  pub version: i64,
  pub state: String,
  pub lifecycle_status: String,
  pub content_text: Option<String>,
  pub content_checksum: String,
  pub parser_kind: String,
  pub metadata_json: Option<serde_json::Value>,
  pub structure_metadata: Option<KnowledgeStructureMetadata>,
  pub provenance: KnowledgeProvenance,
  pub created_at: i64,
  pub updated_at: i64,
  pub ready_at: Option<i64>,
  pub superseded_at: Option<i64>,
  pub deleted_at: Option<i64>,
  pub source_status: String,
  pub source_status_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunk {
  pub id: String,
  pub document_id: String,
  pub entry_id: String,
  pub chunk_index: usize,
  pub chunk_text: String,
  pub token_estimate: usize,
  pub start_offset: usize,
  pub end_offset: usize,
  pub anchor_text: String,
  pub state: String,
  pub created_at: i64,
  pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeStageEvent {
  pub object_type: String,
  pub object_id: String,
  pub stage: String,
  pub status: String,
  pub error_code: Option<String>,
  pub error_message: Option<String>,
  pub retryable: bool,
  pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCitation {
  pub citation_key: String,
  pub knowledge_base_id: String,
  pub entry_id: String,
  pub document_id: String,
  pub chunk_id: Option<String>,
  pub version: i64,
  pub title: String,
  pub source_type: String,
  pub source_ref: Option<String>,
  pub status: String,
  pub provenance: KnowledgeProvenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeInjectionSlice {
  pub slice_id: String,
  pub entry_id: String,
  pub document_id: String,
  pub chunk_id: Option<String>,
  pub asset_kind: String,
  pub source_role: String,
  pub title: String,
  pub source_label: String,
  pub content: String,
  pub retrieval_mode: String,
  pub risk_flags: Vec<String>,
  pub citation: Option<KnowledgeCitation>,
  pub provenance: KnowledgeProvenance,
  pub structure_metadata: Option<KnowledgeStructureMetadata>,
  pub source_status: String,
  pub source_status_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunkHit {
  pub chunk: KnowledgeChunk,
  pub entry_title: String,
  pub version: i64,
  pub score: f64,
  pub snippet: String,
  pub citation: KnowledgeCitation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntryHit {
  pub entry: KnowledgeEntry,
  pub active_document_id: Option<String>,
  pub active_version: Option<i64>,
  pub best_score: f64,
  pub hit_count: usize,
  pub citations: Vec<KnowledgeCitation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocumentHit {
  pub document: KnowledgeDocument,
  pub entry_title: String,
  pub best_score: f64,
  pub excerpt: String,
  pub citations: Vec<KnowledgeCitation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntryListItem {
  pub entry: KnowledgeEntry,
  pub active_document_id: Option<String>,
  pub active_version: Option<i64>,
  pub preview: String,
  pub citation: Option<KnowledgeCitation>,
  pub structure_metadata: Option<KnowledgeStructureMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntryListResponse {
  pub knowledge_base: KnowledgeBase,
  pub items: Vec<KnowledgeEntryListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQueryWarning {
  pub code: String,
  pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQueryMetadata {
  pub intent: String,
  pub query_mode: String,
  pub asset_kind_filter: String,
  pub strategy: String,
  pub effective_strategy: String,
  pub require_verified: bool,
  pub verified_only_applied: bool,
  pub rerank_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQueryResponse {
  pub knowledge_base: KnowledgeBase,
  pub chunk_hits: Vec<KnowledgeChunkHit>,
  pub entry_hits: Vec<KnowledgeEntryHit>,
  pub document_hits: Vec<KnowledgeDocumentHit>,
  pub injection_slices: Vec<KnowledgeInjectionSlice>,
  pub total_hits: usize,
  pub warnings: Vec<KnowledgeQueryWarning>,
  pub metadata: KnowledgeQueryMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeWriteResponse {
  pub knowledge_base: KnowledgeBase,
  pub entry: KnowledgeEntry,
  pub document: Option<KnowledgeDocument>,
  pub chunk_count: usize,
  pub stage_events: Vec<KnowledgeStageEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRecoveryResponse {
  pub knowledge_base: KnowledgeBase,
  pub entry: KnowledgeEntry,
  pub document: Option<KnowledgeDocument>,
  pub chunk_count: usize,
  pub retried_stage: Option<String>,
  pub stage_events: Vec<KnowledgeStageEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunkDraft {
  pub chunk_index: usize,
  pub chunk_text: String,
  pub token_estimate: usize,
  pub start_offset: usize,
  pub end_offset: usize,
  pub anchor_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIngestRequest {
  pub knowledge_base_id: Option<String>,
  /// Folder 在当前阶段仍为预留对象，主链不接受 folder 级写入。
  pub folder_id: Option<String>,
  pub title: Option<String>,
  pub content: Option<String>,
  pub source_path: Option<String>,
  pub source_ref: Option<String>,
  pub source_type: Option<String>,
  pub asset_kind: Option<KnowledgeAssetKind>,
  pub structure_metadata: Option<KnowledgeStructureMetadata>,
  pub metadata: Option<serde_json::Value>,
  pub verification_status: Option<KnowledgeVerificationStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeReplaceRequest {
  pub entry_id: String,
  pub content: Option<String>,
  pub source_path: Option<String>,
  pub source_ref: Option<String>,
  pub asset_kind: Option<KnowledgeAssetKind>,
  pub structure_metadata: Option<KnowledgeStructureMetadata>,
  pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeWorkspaceSnapshotUpsertRequest {
  pub knowledge_base_id: Option<String>,
  /// Folder 在当前阶段仍为预留对象，主链不接受 folder 级快照写入。
  pub folder_id: Option<String>,
  pub source_path: String,
  pub title: Option<String>,
  pub asset_kind: Option<KnowledgeAssetKind>,
  pub structure_metadata: Option<KnowledgeStructureMetadata>,
  pub verification_status: Option<KnowledgeVerificationStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDeleteRequest {
  pub entry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRenameRequest {
  pub entry_id: String,
  pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeMoveRequest {
  pub entry_id: String,
  /// Folder 在当前阶段仍为预留对象，move 只允许更新 source_ref。
  pub folder_id: Option<String>,
  pub source_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRebuildRequest {
  pub entry_id: String,
  pub document_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRetryRequest {
  pub entry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeVerificationUpdateRequest {
  pub entry_id: String,
  pub verification_status: KnowledgeVerificationStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePolicyUpdateRequest {
  pub entry_id: String,
  pub sync_mode: Option<KnowledgeSyncMode>,
  pub visibility_scope: Option<KnowledgeVisibilityScope>,
  pub access_policy: Option<KnowledgeAccessPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQueryRequest {
  pub query: Option<String>,
  pub knowledge_base_id: Option<String>,
  pub entry_id: Option<String>,
  pub document_id: Option<String>,
  pub limit: Option<usize>,
  pub include_deleted: Option<bool>,
  pub intent: Option<KnowledgeQueryIntent>,
  pub query_mode: Option<KnowledgeQueryMode>,
  pub asset_kind_filter: Option<KnowledgeAssetKindFilter>,
  pub retrieval_strategy: Option<KnowledgeRetrievalStrategy>,
  pub require_verified: Option<bool>,
  pub structure_document_form: Option<String>,
  pub structure_purpose: Option<String>,
}
