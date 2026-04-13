use super::chunker::chunk_text;
use super::repository::{KnowledgeService, KnowledgeServiceError};
use super::types::{
  KnowledgeAssetKind, KnowledgeDeletionStatus, KnowledgeDocumentState, KnowledgeErrorCode,
  KnowledgeIngestRequest, KnowledgeReplaceRequest, KnowledgeStructureMetadata,
  KnowledgeWorkspaceSnapshotUpsertRequest, KnowledgeWriteResponse,
};
use rusqlite::params;

impl KnowledgeService {
  pub fn ingest_document(
    &self,
    request: KnowledgeIngestRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let knowledge_base = self.resolve_knowledge_base(request.knowledge_base_id.as_deref())?;
    self.reject_folder_scope_if_present(request.folder_id.as_deref())?;

    let verification_status = request
      .verification_status
      .unwrap_or(super::types::KnowledgeVerificationStatus::Unverified)
      .as_str()
      .to_string();
    let asset_kind = Self::resolve_asset_kind(
      request.asset_kind,
      request.structure_metadata.as_ref(),
      None,
    )?;
    let structure_metadata =
      Self::resolve_structure_metadata(&asset_kind, request.structure_metadata, None)?;
    let resolved = self.resolve_content_input(
      request.title,
      request.content,
      request.source_path,
      request.source_ref,
      request.source_type,
    )?;

    let chunks = chunk_text(&resolved.content);
    if chunks.is_empty() {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::ChunkFailed,
        message: "知识文档分块结果为空".to_string(),
      });
    }

    let entry_id = Self::new_id("ke");
    let document_id = Self::new_id("kd");
    let now = Self::now_ts();
    let sync_mode = Self::default_sync_mode_for_source(&resolved.source_type);
    let visibility_scope = Self::default_visibility_scope_for_source(&resolved.source_type);
    let access_policy = Self::default_access_policy_for_source(&resolved.source_type);
    let provenance = self.build_provenance(
      resolved.source_type.clone(),
      resolved.source_ref.clone(),
      resolved.checksum.clone(),
    );
    let metadata_json =
      Self::serialize_document_metadata(&asset_kind, request.metadata, structure_metadata.clone())?;
    let provenance_json =
      serde_json::to_string(&provenance).map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::PersistenceFailed,
        message: format!("序列化 provenance 失败: {}", e),
      })?;

    let mut conn = self.lock_conn()?;
    let tx = conn
      .transaction()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

    Self::insert_stage_event(&tx, "entry", &entry_id, "validate", "ok", None, None, false)?;
    Self::insert_stage_event(
      &tx,
      "document",
      &document_id,
      "validate",
      "ok",
      None,
      None,
      false,
    )?;

    tx.execute(
            "INSERT INTO knowledge_entries (
                id, knowledge_base_id, folder_id, title, entry_type, asset_kind, source_type, source_ref,
                sync_mode, visibility_scope, access_policy, active_document_id,
                verification_status, deletion_status, retrieval_status, created_at, updated_at, deleted_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?13, ?14, ?15, ?16, NULL)",
            params![
                entry_id,
                knowledge_base.id,
                request.folder_id,
                resolved.title,
                "snapshot",
                asset_kind.as_str(),
                resolved.source_type,
                resolved.source_ref,
                sync_mode,
                visibility_scope,
                access_policy,
                verification_status,
                KnowledgeDeletionStatus::Active.as_str(),
                Self::suppressed_retrieval_status(),
                now,
                now
            ],
        )
        .map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::PersistenceFailed,
            message: format!("写入 knowledge entry 失败: {}", e),
        })?;
    Self::insert_stage_event(&tx, "entry", &entry_id, "persist", "ok", None, None, false)?;

    tx.execute(
            "INSERT INTO knowledge_documents (
                id, entry_id, version, state, lifecycle_status, content_text, content_checksum,
                parser_kind, metadata_json, provenance_json, created_at, updated_at,
                ready_at, superseded_at, deleted_at
            ) VALUES (?1, ?2, 1, ?3, 'staging', ?4, ?5, 'plain_text', ?6, ?7, ?8, ?9, NULL, NULL, NULL)",
            params![
                document_id,
                entry_id,
                KnowledgeDocumentState::Processing.as_str(),
                resolved.content,
                resolved.checksum,
                metadata_json,
                provenance_json,
                now,
                now
            ],
        )
        .map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::PersistenceFailed,
            message: format!("写入 knowledge document 失败: {}", e),
        })?;
    Self::insert_stage_event(
      &tx,
      "document",
      &document_id,
      "persist",
      "ok",
      None,
      None,
      false,
    )?;
    Self::insert_stage_event(
      &tx,
      "document",
      &document_id,
      "parse",
      "ok",
      None,
      None,
      false,
    )?;

    for chunk in &chunks {
      tx.execute(
        "INSERT INTO knowledge_chunks (
                    id, document_id, entry_id, chunk_index, chunk_text, token_estimate,
                    start_offset, end_offset, anchor_text, state, created_at, deleted_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ready', ?10, NULL)",
        params![
          Self::new_id("kcg"),
          document_id,
          entry_id,
          chunk.chunk_index as i64,
          chunk.chunk_text,
          chunk.token_estimate as i64,
          chunk.start_offset as i64,
          chunk.end_offset as i64,
          chunk.anchor_text,
          now
        ],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::IndexFailed,
        message: format!("写入 knowledge chunk 失败: {}", e),
      })?;
    }
    Self::insert_stage_event(
      &tx,
      "document",
      &document_id,
      "chunk",
      "ok",
      None,
      None,
      false,
    )?;
    Self::insert_stage_event(
      &tx,
      "document",
      &document_id,
      "index",
      "ok",
      None,
      None,
      false,
    )?;

    tx.execute(
      "UPDATE knowledge_documents
             SET state = ?2,
                 lifecycle_status = 'active',
                 ready_at = ?3,
                 updated_at = ?3
             WHERE id = ?1",
      params![document_id, KnowledgeDocumentState::Ready.as_str(), now],
    )
    .map_err(|e| KnowledgeServiceError {
      code: KnowledgeErrorCode::PersistenceFailed,
      message: format!("更新 knowledge document ready 状态失败: {}", e),
    })?;

    tx.execute(
      "UPDATE knowledge_entries
             SET active_document_id = ?2,
                 retrieval_status = ?3,
                 updated_at = ?4
             WHERE id = ?1",
      params![
        entry_id,
        document_id,
        Self::eligible_retrieval_status(),
        now
      ],
    )
    .map_err(|e| KnowledgeServiceError {
      code: KnowledgeErrorCode::PersistenceFailed,
      message: format!("更新 knowledge entry active version 失败: {}", e),
    })?;
    Self::insert_stage_event(
      &tx,
      "document",
      &document_id,
      "ready",
      "ok",
      None,
      None,
      false,
    )?;

    tx.commit()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    drop(conn);

    let entry = self.fetch_entry(&entry_id)?;
    let document = self.fetch_document(&document_id, true)?;
    let stage_events = self.list_stage_events(&vec![entry_id.clone(), document_id.clone()])?;

    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry,
      document: Some(document),
      chunk_count: chunks.len(),
      stage_events,
    })
  }

  pub fn replace_document(
    &self,
    request: KnowledgeReplaceRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let entry = self.fetch_entry(&request.entry_id)?;
    if Self::is_entry_deleted(&entry) {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::EntryDeleted,
        message: format!("knowledge entry 已删除: {}", request.entry_id),
      });
    }

    let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
    let existing_document = self.fetch_active_document_for_entry(&entry, true)?;
    let existing_structure_metadata = existing_document
      .as_ref()
      .and_then(|document| document.structure_metadata.clone());
    let asset_kind = Self::resolve_asset_kind(
      request.asset_kind,
      request.structure_metadata.as_ref(),
      Some(&entry.asset_kind),
    )?;
    let structure_metadata = Self::resolve_structure_metadata(
      &asset_kind,
      request.structure_metadata,
      existing_structure_metadata,
    )?;
    let resolved = self.resolve_content_input(
      Some(entry.title.clone()),
      request.content,
      request.source_path,
      request.source_ref.or_else(|| entry.source_ref.clone()),
      Some(entry.source_type.clone()),
    )?;
    let chunks = chunk_text(&resolved.content);
    if chunks.is_empty() {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::ChunkFailed,
        message: "替换后的知识文档分块结果为空".to_string(),
      });
    }

    let now = Self::now_ts();
    let document_id = Self::new_id("kd");
    let provenance = self.build_provenance(
      resolved.source_type.clone(),
      resolved.source_ref.clone(),
      resolved.checksum.clone(),
    );
    let metadata_json =
      Self::serialize_document_metadata(&asset_kind, request.metadata, structure_metadata.clone())?;
    let provenance_json =
      serde_json::to_string(&provenance).map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::PersistenceFailed,
        message: format!("序列化 replace provenance 失败: {}", e),
      })?;

    let mut conn = self.lock_conn()?;
    let tx = conn
      .transaction()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    let next_version = Self::next_document_version(&tx, &entry.id)?;
    let operation = || -> Result<(), KnowledgeServiceError> {
      Self::insert_stage_event(&tx, "entry", &entry.id, "validate", "ok", None, None, false)?;
      Self::insert_stage_event(
        &tx,
        "document",
        &document_id,
        "validate",
        "ok",
        None,
        None,
        false,
      )?;

      tx.execute(
                "INSERT INTO knowledge_documents (
                    id, entry_id, version, state, lifecycle_status, content_text, content_checksum,
                    parser_kind, metadata_json, provenance_json, created_at, updated_at,
                    ready_at, superseded_at, deleted_at
                ) VALUES (?1, ?2, ?3, ?4, 'staging', ?5, ?6, 'plain_text', ?7, ?8, ?9, ?10, NULL, NULL, NULL)",
                params![
                    document_id,
                    entry.id,
                    next_version,
                    KnowledgeDocumentState::Processing.as_str(),
                    resolved.content,
                    resolved.checksum,
                    metadata_json,
                    provenance_json,
                    now,
                    now
                ],
            )
            .map_err(|e| KnowledgeServiceError {
                code: KnowledgeErrorCode::PersistenceFailed,
                message: format!("写入新 version document 失败: {}", e),
            })?;
      Self::insert_stage_event(
        &tx,
        "document",
        &document_id,
        "persist",
        "ok",
        None,
        None,
        false,
      )?;
      Self::insert_stage_event(
        &tx,
        "document",
        &document_id,
        "parse",
        "ok",
        None,
        None,
        false,
      )?;

      for chunk in &chunks {
        tx.execute(
          "INSERT INTO knowledge_chunks (
                        id, document_id, entry_id, chunk_index, chunk_text, token_estimate,
                        start_offset, end_offset, anchor_text, state, created_at, deleted_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ready', ?10, NULL)",
          params![
            Self::new_id("kcg"),
            document_id,
            entry.id,
            chunk.chunk_index as i64,
            chunk.chunk_text,
            chunk.token_estimate as i64,
            chunk.start_offset as i64,
            chunk.end_offset as i64,
            chunk.anchor_text,
            now
          ],
        )
        .map_err(|e| KnowledgeServiceError {
          code: KnowledgeErrorCode::IndexFailed,
          message: format!("写入 replace chunk 失败: {}", e),
        })?;
      }
      Self::insert_stage_event(
        &tx,
        "document",
        &document_id,
        "chunk",
        "ok",
        None,
        None,
        false,
      )?;
      Self::insert_stage_event(
        &tx,
        "document",
        &document_id,
        "index",
        "ok",
        None,
        None,
        false,
      )?;

      if let Some(active_document_id) = entry.active_document_id.as_deref() {
        tx.execute(
          "UPDATE knowledge_documents
                     SET state = ?2,
                         lifecycle_status = 'superseded',
                         superseded_at = ?3,
                         updated_at = ?3
                     WHERE id = ?1",
          params![
            active_document_id,
            KnowledgeDocumentState::Superseded.as_str(),
            now
          ],
        )
        .map_err(|e| KnowledgeServiceError {
          code: KnowledgeErrorCode::VersionConflict,
          message: format!("标记旧 active version 失败: {}", e),
        })?;
      }

      tx.execute(
        "UPDATE knowledge_documents
                 SET state = ?2,
                     lifecycle_status = 'active',
                     ready_at = ?3,
                     updated_at = ?3
                 WHERE id = ?1",
        params![document_id, KnowledgeDocumentState::Ready.as_str(), now],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::PersistenceFailed,
        message: format!("切换新 active version 失败: {}", e),
      })?;

      tx.execute(
        "UPDATE knowledge_entries
                 SET active_document_id = ?2,
                     asset_kind = ?3,
                     source_type = ?4,
                     source_ref = ?5,
                     retrieval_status = ?6,
                     updated_at = ?7
                 WHERE id = ?1",
        params![
          entry.id,
          document_id,
          asset_kind.as_str(),
          resolved.source_type,
          resolved.source_ref,
          Self::eligible_retrieval_status(),
          now
        ],
      )
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::VersionConflict,
        message: format!("更新 entry active_document_id 失败: {}", e),
      })?;
      Self::insert_stage_event(
        &tx,
        "document",
        &document_id,
        "ready",
        "ok",
        None,
        None,
        false,
      )?;
      Ok(())
    };

    if let Err(error) = operation() {
      drop(tx);
      drop(conn);
      self.record_operation_failure(
        "document",
        &document_id,
        "replace",
        &error,
        Self::is_retryable_error(&error.code),
      );
      let _ =
        self.insert_stage_event_direct("entry", &entry.id, "rollback", "ok", None, None, false);
      return Err(error);
    }

    tx.commit()
      .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
    drop(conn);

    let updated_entry = self.fetch_entry(&entry.id)?;
    let document = self.fetch_document(&document_id, true)?;
    let stage_events = self.list_stage_events(&vec![entry.id.clone(), document_id.clone()])?;

    Ok(KnowledgeWriteResponse {
      knowledge_base,
      entry: updated_entry,
      document: Some(document),
      chunk_count: chunks.len(),
      stage_events,
    })
  }

  pub fn upsert_workspace_snapshot(
    &self,
    request: KnowledgeWorkspaceSnapshotUpsertRequest,
  ) -> Result<KnowledgeWriteResponse, KnowledgeServiceError> {
    let source_path = request.source_path.trim();
    if source_path.is_empty() {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::InvalidInput,
        message: "workspace snapshot 缺少 source_path".to_string(),
      });
    }

    let knowledge_base = self.resolve_knowledge_base(request.knowledge_base_id.as_deref())?;
    self.reject_folder_scope_if_present(request.folder_id.as_deref())?;

    let resolved = self.resolve_content_input(
      request.title.clone(),
      None,
      Some(source_path.to_string()),
      None,
      Some("workspace_snapshot".to_string()),
    )?;
    let effective_source_ref = resolved.source_ref.as_deref().unwrap_or(source_path);

    if let Some(existing_entry) =
      self.find_workspace_snapshot_entry_by_source_ref(&knowledge_base.id, effective_source_ref)?
    {
      return self.replace_document(KnowledgeReplaceRequest {
        entry_id: existing_entry.id,
        content: None,
        source_path: Some(source_path.to_string()),
        source_ref: resolved.source_ref,
        asset_kind: request.asset_kind,
        structure_metadata: request.structure_metadata,
        metadata: None,
      });
    }

    self.ingest_document(KnowledgeIngestRequest {
      knowledge_base_id: Some(knowledge_base.id),
      folder_id: request.folder_id,
      title: request.title,
      content: None,
      source_path: Some(source_path.to_string()),
      source_ref: None,
      source_type: Some("workspace_snapshot".to_string()),
      asset_kind: request.asset_kind,
      structure_metadata: request.structure_metadata,
      metadata: None,
      verification_status: request.verification_status,
    })
  }

  fn resolve_asset_kind(
    asset_kind: Option<KnowledgeAssetKind>,
    structure_metadata: Option<&KnowledgeStructureMetadata>,
    existing_asset_kind: Option<&str>,
  ) -> Result<KnowledgeAssetKind, KnowledgeServiceError> {
    if asset_kind.is_none() && structure_metadata.is_some() {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::InvalidInput,
        message: "传入 structure_metadata 时必须显式指定 asset_kind".to_string(),
      });
    }

    if let Some(asset_kind) = asset_kind {
      return Ok(asset_kind);
    }

    match existing_asset_kind {
      Some("structure_asset") => Ok(KnowledgeAssetKind::StructureAsset),
      _ => Ok(KnowledgeAssetKind::Standard),
    }
  }

  fn resolve_structure_metadata(
    asset_kind: &KnowledgeAssetKind,
    structure_metadata: Option<KnowledgeStructureMetadata>,
    existing_structure_metadata: Option<KnowledgeStructureMetadata>,
  ) -> Result<Option<KnowledgeStructureMetadata>, KnowledgeServiceError> {
    match asset_kind {
      KnowledgeAssetKind::Standard => Ok(None),
      KnowledgeAssetKind::StructureAsset => {
        let metadata = structure_metadata
          .or(existing_structure_metadata)
          .ok_or_else(|| KnowledgeServiceError {
            code: KnowledgeErrorCode::InvalidInput,
            message: "structure_asset 缺少 structure_metadata".to_string(),
          })?;
        Self::validate_structure_metadata(&metadata)?;
        Ok(Some(metadata))
      }
    }
  }

  fn validate_structure_metadata(
    metadata: &KnowledgeStructureMetadata,
  ) -> Result<(), KnowledgeServiceError> {
    if metadata.document_form.trim().is_empty()
      || metadata.structure_purpose.trim().is_empty()
      || metadata.section_outline_summary.trim().is_empty()
      || metadata.source_nature.trim().is_empty()
      || metadata.applicable_scenarios.is_empty()
      || metadata.slot_hints.is_empty()
      || metadata
        .applicable_scenarios
        .iter()
        .any(|value| value.trim().is_empty())
      || metadata
        .slot_hints
        .iter()
        .any(|value| value.trim().is_empty())
    {
      return Err(KnowledgeServiceError {
        code: KnowledgeErrorCode::InvalidInput,
        message: "structure_metadata 缺少必填字段或包含空值".to_string(),
      });
    }
    Ok(())
  }

  fn serialize_document_metadata(
    asset_kind: &KnowledgeAssetKind,
    metadata: Option<serde_json::Value>,
    structure_metadata: Option<KnowledgeStructureMetadata>,
  ) -> Result<Option<String>, KnowledgeServiceError> {
    let metadata_value = match asset_kind {
      KnowledgeAssetKind::Standard => metadata,
      KnowledgeAssetKind::StructureAsset => structure_metadata
        .map(serde_json::to_value)
        .transpose()
        .map_err(|e| KnowledgeServiceError {
          code: KnowledgeErrorCode::PersistenceFailed,
          message: format!("序列化 structure_metadata 失败: {}", e),
        })?,
    };

    metadata_value
      .as_ref()
      .map(serde_json::to_string)
      .transpose()
      .map_err(|e| KnowledgeServiceError {
        code: KnowledgeErrorCode::PersistenceFailed,
        message: format!("序列化 metadata 失败: {}", e),
      })
  }
}
