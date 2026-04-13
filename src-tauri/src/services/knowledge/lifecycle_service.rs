use super::repository::{KnowledgeService, KnowledgeServiceError};
use super::types::{
  KnowledgeDeleteRequest, KnowledgeDeletionStatus, KnowledgeDocumentState, KnowledgeErrorCode,
  KnowledgeMoveRequest, KnowledgePolicyUpdateRequest, KnowledgeRenameRequest,
  KnowledgeVerificationUpdateRequest, KnowledgeWriteResponse,
};
use rusqlite::params;

impl KnowledgeService {
  pub fn delete_entry(
    &self,
    request: KnowledgeDeleteRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let entry = self.fetch_entry(&request.entry_id)?;
    let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
    if entry.deletion_status == KnowledgeDeletionStatus::Deleted.as_str() {
      let document = self.fetch_active_document_for_entry(&entry, true)?;
      let stage_events = self.list_stage_events(std::slice::from_ref(&entry.id))?;
      return Ok(KnowledgeWriteResponse {
        knowledge_base,
        entry,
        document,
        chunk_count: 0,
        stage_events,
      });
    }

    let now = Self::now_ts();
    let mut conn = self.lock_conn()?;
    let tx = conn
      .transaction()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

    let operation = || -> Result<(), KnowledgeServiceError> {
      Self::insert_stage_event(
        &tx,
        "entry",
        &entry.id,
        "pending_delete",
        "ok",
        None,
        None,
        false,
      )?;
      tx.execute(
        "UPDATE knowledge_entries
                 SET deletion_status = ?2,
                     retrieval_status = ?3,
                     updated_at = ?4
                 WHERE id = ?1",
        params![
          entry.id,
          KnowledgeDeletionStatus::PendingDelete.as_str(),
          Self::suppressed_retrieval_status(),
          now
        ],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::DeleteFailed,
        message: format!("进入 pending_delete 失败: {}", e),
      })?;

      tx.execute(
        "UPDATE knowledge_chunks
                 SET state = 'deleted',
                     deleted_at = ?2
                 WHERE entry_id = ?1
                   AND deleted_at IS NULL",
        params![entry.id, now],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::DeleteFailed,
        message: format!("删除 knowledge chunks 失败: {}", e),
      })?;
      Self::insert_stage_event(&tx, "entry", &entry.id, "remove", "ok", None, None, false)?;

      tx.execute(
        "UPDATE knowledge_documents
                 SET state = ?2,
                     lifecycle_status = 'deleted',
                     deleted_at = ?3,
                     updated_at = ?3
                 WHERE entry_id = ?1
                   AND deleted_at IS NULL",
        params![entry.id, KnowledgeDocumentState::Deleted.as_str(), now],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::DeleteFailed,
        message: format!("删除 knowledge documents 失败: {}", e),
      })?;

      tx.execute(
        "UPDATE knowledge_entries
                 SET active_document_id = NULL,
                     deletion_status = ?2,
                     retrieval_status = ?3,
                     deleted_at = ?4,
                     updated_at = ?4
                 WHERE id = ?1",
        params![
          entry.id,
          KnowledgeDeletionStatus::Deleted.as_str(),
          Self::suppressed_retrieval_status(),
          now
        ],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::DeleteFailed,
        message: format!("提交 knowledge entry delete 失败: {}", e),
      })?;
      Self::insert_stage_event(&tx, "entry", &entry.id, "commit", "ok", None, None, false)?;
      Ok(())
    };

    if let Err(error) = operation() {
      drop(tx);
      drop(conn);
      self.record_operation_failure(
        "entry",
        &entry.id,
        "delete",
        &error,
        Self::is_retryable_error(&error.code),
      );
      let _ =
        self.insert_stage_event_direct("entry", &entry.id, "rollback", "ok", None, None, false);
      return Err(error);
    }

    tx.commit()
      .map_err(|e| self.db_error(KnowledgeErrorCode::DeleteFailed, e))?;
    drop(conn);

    let updated_entry = self.fetch_entry(&entry.id)?;
    let stage_events = self.list_stage_events(std::slice::from_ref(&entry.id))?;
    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry: updated_entry,
      document: None,
      chunk_count: 0,
      stage_events,
    })
  }

  pub fn rename_entry(
    &self,
    request: KnowledgeRenameRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    if request.title.trim().is_empty() {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::InvalidInput,
        message: "知识条目标题不能为空".to_string(),
      });
    }
    let entry = self.fetch_entry(&request.entry_id)?;
    if Self::is_entry_deleted(&entry) {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::EntryDeleted,
        message: format!("knowledge entry 已删除: {}", request.entry_id),
      });
    }
    let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
    let now = Self::now_ts();

    let conn = self.lock_conn()?;
    conn
      .execute(
        "UPDATE knowledge_entries
             SET title = ?2,
                 updated_at = ?3
             WHERE id = ?1",
        params![request.entry_id, request.title.trim(), now],
      )
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    drop(conn);

    let updated_entry = self.fetch_entry(&request.entry_id)?;
    let document = self.fetch_active_document_for_entry(&updated_entry, true)?;
    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry: updated_entry,
      document,
      chunk_count: 0,
      stage_events: Vec::new(),
    })
  }

  pub fn move_entry(
    &self,
    request: KnowledgeMoveRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let entry = self.fetch_entry(&request.entry_id)?;
    if Self::is_entry_deleted(&entry) {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::EntryDeleted,
        message: format!("knowledge entry 已删除: {}", request.entry_id),
      });
    }
    self.reject_folder_scope_if_present(request.folder_id.as_deref())?;

    let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
    let now = Self::now_ts();
    let new_source_ref = request.source_ref.or_else(|| entry.source_ref.clone());
    let mut conn = self.lock_conn()?;
    let tx = conn
      .transaction()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    tx.execute(
      "UPDATE knowledge_entries
             SET folder_id = ?2,
                 source_ref = ?3,
                 updated_at = ?4
             WHERE id = ?1",
      params![entry.id, request.folder_id, new_source_ref.clone(), now],
    )
    .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

    if let (Some(source_ref), Some(active_document_id)) =
      (new_source_ref.as_ref(), entry.active_document_id.as_deref())
    {
      let document = Self::fetch_document_with_conn(&tx, active_document_id, true)?;
      let mut provenance = document.provenance.clone();
      provenance.source_ref = Some(source_ref.clone());
      let provenance_json =
        serde_json::to_string(&provenance).map_err(|e| KnowledgeServiceError {
          code: KnowledgeErrorCode::PersistenceFailed,
          message: format!("序列化 metadata reindex provenance 失败: {}", e),
        })?;
      tx.execute(
        "UPDATE knowledge_documents
                 SET provenance_json = ?2,
                     updated_at = ?3
                 WHERE id = ?1",
        params![document.id, provenance_json, now],
      )
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    }
    Self::insert_stage_event(
      &tx,
      "entry",
      &entry.id,
      "metadata_reindex",
      "ok",
      None,
      None,
      false,
    )?;
    tx.commit()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    drop(conn);

    let updated_entry = self.fetch_entry(&entry.id)?;
    let document = self.fetch_active_document_for_entry(&updated_entry, true)?;
    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry: updated_entry,
      document,
      chunk_count: 0,
      stage_events: Vec::new(),
    })
  }

  pub fn update_verification_status(
    &self,
    request: KnowledgeVerificationUpdateRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let entry = self.fetch_entry(&request.entry_id)?;
    if Self::is_entry_deleted(&entry) {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::EntryDeleted,
        message: format!("knowledge entry 已删除: {}", request.entry_id),
      });
    }

    let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
    let now = Self::now_ts();
    let conn = self.lock_conn()?;
    conn
      .execute(
        "UPDATE knowledge_entries
             SET verification_status = ?2,
                 updated_at = ?3
             WHERE id = ?1",
        params![entry.id, request.verification_status.as_str(), now],
      )
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    drop(conn);

    let updated_entry = self.fetch_entry(&entry.id)?;
    let document = self.fetch_active_document_for_entry(&updated_entry, true)?;
    let stage_events = self.list_stage_events(std::slice::from_ref(&entry.id))?;
    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry: updated_entry,
      document,
      chunk_count: 0,
      stage_events,
    })
  }

  pub fn update_entry_policy(
    &self,
    request: KnowledgePolicyUpdateRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let entry = self.fetch_entry(&request.entry_id)?;
    if Self::is_entry_deleted(&entry) {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::EntryDeleted,
        message: format!("knowledge entry 已删除: {}", request.entry_id),
      });
    }

    let next_sync_mode = request
      .sync_mode
      .as_ref()
      .map(|value| value.as_str().to_string())
      .unwrap_or_else(|| entry.sync_mode.clone());
    if !Self::supports_sync_mode(&entry.source_type, &next_sync_mode) {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::InvalidInput,
        message: format!(
          "source_type={} 不支持 sync_mode={}",
          entry.source_type, next_sync_mode
        ),
      });
    }

    let next_visibility_scope = request
      .visibility_scope
      .as_ref()
      .map(|value| value.as_str().to_string())
      .unwrap_or_else(|| entry.visibility_scope.clone());
    let next_access_policy = request
      .access_policy
      .as_ref()
      .map(|value| value.as_str().to_string())
      .unwrap_or_else(|| entry.access_policy.clone());

    let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
    let now = Self::now_ts();
    let conn = self.lock_conn()?;
    conn
      .execute(
        "UPDATE knowledge_entries
             SET sync_mode = ?2,
                 visibility_scope = ?3,
                 access_policy = ?4,
                 updated_at = ?5
             WHERE id = ?1",
        params![
          entry.id,
          next_sync_mode,
          next_visibility_scope,
          next_access_policy,
          now
        ],
      )
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    drop(conn);

    let _ =
      self.insert_stage_event_direct("entry", &entry.id, "policy_update", "ok", None, None, false);

    let updated_entry = self.fetch_entry(&entry.id)?;
    let document = self.fetch_active_document_for_entry(&updated_entry, true)?;
    let stage_events = self.list_stage_events(std::slice::from_ref(&entry.id))?;
    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry: updated_entry,
      document,
      chunk_count: 0,
      stage_events,
    })
  }
}
