use super::types::{KnowledgeAccessPolicy, KnowledgeSyncMode, KnowledgeVisibilityScope};

pub trait KnowledgeSourceAdapter: Send + Sync {
  fn default_sync_mode(&self) -> KnowledgeSyncMode;
  fn default_visibility_scope(&self) -> KnowledgeVisibilityScope;
  fn default_access_policy(&self) -> KnowledgeAccessPolicy;

  fn supports_sync_mode(&self, sync_mode: &KnowledgeSyncMode) -> bool {
    matches!(
      sync_mode,
      KnowledgeSyncMode::None | KnowledgeSyncMode::Snapshot
    )
  }

  fn supports_automatic_retrieval(
    &self,
    visibility_scope: &KnowledgeVisibilityScope,
    access_policy: &KnowledgeAccessPolicy,
  ) -> bool {
    matches!(visibility_scope, KnowledgeVisibilityScope::Workspace)
      && matches!(access_policy, KnowledgeAccessPolicy::WorkspaceAuto)
  }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct WorkspaceSnapshotSourceAdapter;

impl KnowledgeSourceAdapter for WorkspaceSnapshotSourceAdapter {
  fn default_sync_mode(&self) -> KnowledgeSyncMode {
    KnowledgeSyncMode::Snapshot
  }

  fn default_visibility_scope(&self) -> KnowledgeVisibilityScope {
    KnowledgeVisibilityScope::Workspace
  }

  fn default_access_policy(&self) -> KnowledgeAccessPolicy {
    KnowledgeAccessPolicy::WorkspaceAuto
  }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ManualSnapshotSourceAdapter;

impl KnowledgeSourceAdapter for ManualSnapshotSourceAdapter {
  fn default_sync_mode(&self) -> KnowledgeSyncMode {
    KnowledgeSyncMode::None
  }

  fn default_visibility_scope(&self) -> KnowledgeVisibilityScope {
    KnowledgeVisibilityScope::ExplicitOnly
  }

  fn default_access_policy(&self) -> KnowledgeAccessPolicy {
    KnowledgeAccessPolicy::ExplicitOnly
  }
}

pub fn adapter_for_source_type(source_type: &str) -> Box<dyn KnowledgeSourceAdapter> {
  match source_type {
    "workspace_snapshot" => Box::new(WorkspaceSnapshotSourceAdapter),
    "manual_snapshot" => Box::new(ManualSnapshotSourceAdapter),
    _ => Box::new(ManualSnapshotSourceAdapter),
  }
}
