use super::chunker::chunk_text;
use super::repository::{KnowledgeService, KnowledgeServiceError};
use super::types::{
    KnowledgeChunk, KnowledgeDocumentState, KnowledgeErrorCode, KnowledgeRebuildRequest,
    KnowledgeRecoveryResponse, KnowledgeRetryRequest,
};
use rusqlite::params;

impl KnowledgeService {
    pub fn rebuild_entry(
        &self,
        request: KnowledgeRebuildRequest,
    ) -> Result<KnowledgeRecoveryResponse, KnowledgeServiceError> {
        let entry = self.fetch_entry(&request.entry_id)?;
        if Self::is_entry_deleted(&entry) {
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::EntryDeleted,
                message: format!("knowledge entry 已删除: {}", request.entry_id),
            });
        }

        let knowledge_base = self.resolve_knowledge_base(Some(&entry.knowledge_base_id))?;
        let document_id = request
            .document_id
            .or_else(|| entry.active_document_id.clone())
            .ok_or_else(|| KnowledgeServiceError {
                code: KnowledgeErrorCode::RebuildFailed,
                message: format!("knowledge entry 缺少可重建 document: {}", entry.id),
            })?;
        let document = self.fetch_document(&document_id, true)?;
        let content = document.content_text.clone().ok_or_else(|| KnowledgeServiceError {
            code: KnowledgeErrorCode::RebuildFailed,
            message: format!("knowledge document 缺少 content_text: {}", document.id),
        })?;
        let chunks = chunk_text(&content);
        if chunks.is_empty() {
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::ChunkFailed,
                message: "重建后的 chunk 结果为空".to_string(),
            });
        }

        let now = Self::now_ts();
        let mut conn = self.lock_conn()?;
        let tx = conn
            .transaction()
            .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

        let operation = || -> Result<(), KnowledgeServiceError> {
            Self::insert_stage_event(&tx, "document", &document.id, "rebuild", "ok", None, None, false)?;

            let mut stmt = tx
                .prepare(
                    "SELECT id, document_id, entry_id, chunk_index, chunk_text, token_estimate,
                            start_offset, end_offset, anchor_text, state, created_at, deleted_at
                     FROM knowledge_chunks
                     WHERE document_id = ?1
                     ORDER BY chunk_index ASC",
                )
                .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
            let rows = stmt
                .query_map(params![document.id.clone()], Self::map_chunk)
                .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

            let mut existing_chunks: Vec<KnowledgeChunk> = Vec::new();
            for row in rows {
                existing_chunks.push(row.map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?);
            }

            for chunk in &chunks {
                if let Some(existing) = existing_chunks.iter().find(|row| row.chunk_index == chunk.chunk_index) {
                    tx.execute(
                        "UPDATE knowledge_chunks
                         SET chunk_text = ?2,
                             token_estimate = ?3,
                             start_offset = ?4,
                             end_offset = ?5,
                             anchor_text = ?6,
                             state = 'ready',
                             deleted_at = NULL
                         WHERE id = ?1",
                        params![
                            existing.id,
                            chunk.chunk_text,
                            chunk.token_estimate as i64,
                            chunk.start_offset as i64,
                            chunk.end_offset as i64,
                            chunk.anchor_text,
                        ],
                    )
                    .map_err(|e| KnowledgeServiceError {
                        code: KnowledgeErrorCode::RebuildFailed,
                        message: format!("更新重建 chunk 失败: {}", e),
                    })?;
                } else {
                    tx.execute(
                        "INSERT INTO knowledge_chunks (
                            id, document_id, entry_id, chunk_index, chunk_text, token_estimate,
                            start_offset, end_offset, anchor_text, state, created_at, deleted_at
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ready', ?10, NULL)",
                        params![
                            Self::new_id("kcg"),
                            document.id,
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
                        code: KnowledgeErrorCode::RebuildFailed,
                        message: format!("插入重建 chunk 失败: {}", e),
                    })?;
                }
            }

            for existing in existing_chunks.iter().filter(|row| row.chunk_index >= chunks.len()) {
                tx.execute(
                    "UPDATE knowledge_chunks
                     SET state = 'deleted',
                         deleted_at = ?2
                     WHERE id = ?1",
                    params![existing.id, now],
                )
                .map_err(|e| KnowledgeServiceError {
                    code: KnowledgeErrorCode::RebuildFailed,
                    message: format!("清理旧 chunk 失败: {}", e),
                })?;
            }

            tx.execute(
                "UPDATE knowledge_documents
                 SET state = ?2,
                     lifecycle_status = lifecycle_status,
                     updated_at = ?3
                 WHERE id = ?1",
                params![document.id, KnowledgeDocumentState::Ready.as_str(), now],
            )
            .map_err(|e| KnowledgeServiceError {
                code: KnowledgeErrorCode::RebuildFailed,
                message: format!("更新重建 document 状态失败: {}", e),
            })?;
            tx.execute(
                "UPDATE knowledge_entries
                 SET retrieval_status = ?2,
                     updated_at = ?3
                 WHERE id = ?1",
                params![entry.id, Self::eligible_retrieval_status(), now],
            )
            .map_err(|e| KnowledgeServiceError {
                code: KnowledgeErrorCode::RebuildFailed,
                message: format!("恢复 entry retrieval_status 失败: {}", e),
            })?;
            Self::insert_stage_event(&tx, "document", &document.id, "rebuild_ready", "ok", None, None, false)?;
            Ok(())
        };

        if let Err(error) = operation() {
            drop(tx);
            drop(conn);
            self.record_operation_failure(
                "document",
                &document.id,
                "rebuild",
                &error,
                Self::is_retryable_error(&error.code),
            );
            let _ = self.insert_stage_event_direct("entry", &entry.id, "rollback", "ok", None, None, false);
            return Err(error);
        }

        tx.commit()
            .map_err(|e| self.db_error(KnowledgeErrorCode::RebuildFailed, e))?;
        drop(conn);

        let updated_entry = self.fetch_entry(&entry.id)?;
        let rebuilt_document = self.fetch_document(&document.id, true)?;
        let stage_events = self.list_stage_events(&vec![entry.id.clone(), document.id.clone()])?;
        Ok(KnowledgeRecoveryResponse {
            knowledge_base,
            entry: updated_entry,
            document: Some(rebuilt_document),
            chunk_count: chunks.len(),
            retried_stage: None,
            stage_events,
        })
    }

    pub fn retry_entry(
        &self,
        request: KnowledgeRetryRequest,
    ) -> Result<KnowledgeRecoveryResponse, KnowledgeServiceError> {
        let entry = self.fetch_entry(&request.entry_id)?;
        let mut object_ids = vec![entry.id.clone()];
        if let Some(active_document_id) = entry.active_document_id.clone() {
            object_ids.push(active_document_id);
        }
        let stage_events = self.list_stage_events(&object_ids)?;
        let latest_retryable = stage_events
            .iter()
            .filter(|event| event.status == "failed" && event.retryable)
            .max_by_key(|event| event.created_at)
            .cloned()
            .ok_or_else(|| KnowledgeServiceError {
                code: KnowledgeErrorCode::RecoveryFailed,
                message: format!("knowledge entry 没有可重试的失败阶段: {}", entry.id),
            })?;

        self.insert_stage_event_direct("entry", &entry.id, "retry", "ok", None, None, false)?;
        match self.rebuild_entry(KnowledgeRebuildRequest {
            entry_id: entry.id.clone(),
            document_id: entry.active_document_id.clone(),
        }) {
            Ok(mut response) => {
                response.retried_stage = Some(latest_retryable.stage);
                Ok(response)
            }
            Err(error) => {
                self.record_operation_failure(
                    "entry",
                    &entry.id,
                    "retry",
                    &error,
                    Self::is_retryable_error(&error.code),
                );
                Err(error)
            }
        }
    }
}
