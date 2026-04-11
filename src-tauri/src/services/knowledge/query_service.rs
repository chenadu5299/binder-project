use super::repository::{ChunkQueryRow, KnowledgeService, KnowledgeServiceError};
use super::types::{
    KnowledgeAssetKindFilter, KnowledgeChunkHit, KnowledgeDocumentHit, KnowledgeEntryHit,
    KnowledgeEntryListItem, KnowledgeEntryListResponse, KnowledgeErrorCode, KnowledgeQueryIntent,
    KnowledgeQueryMetadata, KnowledgeQueryMode, KnowledgeQueryRequest, KnowledgeQueryResponse,
    KnowledgeQueryWarning, KnowledgeRetrievalStrategy,
};
use rusqlite::params;
use std::cmp::Ordering;
use std::collections::HashMap;

impl KnowledgeService {
    pub fn list_knowledge_entries(
        &self,
        knowledge_base_id: Option<&str>,
        query: Option<&str>,
        limit: usize,
    ) -> Result<KnowledgeEntryListResponse, KnowledgeServiceError> {
        let knowledge_base = self.resolve_knowledge_base(knowledge_base_id)?;
        let query = query.unwrap_or_default().trim().to_lowercase();
        let limit = limit.clamp(1, 100);

        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT
                    e.id, e.knowledge_base_id, e.folder_id, e.title, e.entry_type, e.asset_kind, e.source_type, e.source_ref,
                    e.sync_mode, e.visibility_scope, e.access_policy, e.active_document_id,
                    e.verification_status, e.deletion_status, e.retrieval_status, e.created_at, e.updated_at, e.deleted_at,
                    d.id, d.entry_id, d.version, d.state, d.lifecycle_status, d.content_text,
                    d.content_checksum, d.parser_kind, d.metadata_json, d.provenance_json,
                    d.created_at, d.updated_at, d.ready_at, d.superseded_at, d.deleted_at
                 FROM knowledge_entries e
                 LEFT JOIN knowledge_documents d ON d.id = e.active_document_id
                 WHERE e.knowledge_base_id = ?1
                   AND e.deletion_status = 'active'
                   AND e.retrieval_status = 'eligible'
                 ORDER BY e.updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| self.db_error(KnowledgeErrorCode::QueryFailed, e))?;

        let rows = stmt
            .query_map(params![knowledge_base.id, limit as i64], |row| {
                let entry = super::repository::KnowledgeService::map_entry_with_offset(row, 0)?;
                let document_id: Option<String> = row.get(18)?;
                let document = if document_id.is_some() {
                    Some(super::repository::KnowledgeService::map_document_with_offset(row, 18)?)
                } else {
                    None
                };
                Ok((entry, document))
            })
            .map_err(|e| self.db_error(KnowledgeErrorCode::QueryFailed, e))?;

        let mut items = Vec::new();
        for row in rows {
            let (mut entry, mut document) =
                row.map_err(|e| self.db_error(KnowledgeErrorCode::QueryFailed, e))?;
            self.hydrate_entry_source_status(&mut entry);
            if let Some(document_ref) = document.as_mut() {
                self.hydrate_document_source_status(document_ref);
            }
            if !query.is_empty() {
                let title_match = entry.title.to_lowercase().contains(&query);
                let source_match = entry
                    .source_ref
                    .as_deref()
                    .map(|value| value.to_lowercase().contains(&query))
                    .unwrap_or(false);
                if !title_match && !source_match {
                    continue;
                }
            }

            let preview = document
                .as_ref()
                .map(|doc| {
                    if entry.asset_kind == "structure_asset" {
                        doc.structure_metadata
                            .as_ref()
                            .map(|metadata| metadata.section_outline_summary.clone())
                            .unwrap_or_else(|| build_snippet(doc.content_text.as_deref().unwrap_or_default(), ""))
                    } else {
                        build_snippet(doc.content_text.as_deref().unwrap_or_default(), "")
                    }
                })
                .unwrap_or_default();
            let citation = document
                .as_ref()
                .and_then(|document| Self::build_citation(&entry, document, None));
            items.push(KnowledgeEntryListItem {
                entry: entry.clone(),
                active_document_id: entry.active_document_id.clone(),
                active_version: document.as_ref().map(|doc| doc.version),
                preview,
                citation,
                structure_metadata: document.as_ref().and_then(|doc| doc.structure_metadata.clone()),
            });
        }

        items.sort_by(|a, b| {
            Self::verification_rank(&b.entry.verification_status)
                .cmp(&Self::verification_rank(&a.entry.verification_status))
                .then_with(|| b.entry.updated_at.cmp(&a.entry.updated_at))
        });

        Ok(KnowledgeEntryListResponse { knowledge_base, items })
    }

    pub fn query_knowledge_base(
        &self,
        request: KnowledgeQueryRequest,
    ) -> Result<KnowledgeQueryResponse, KnowledgeServiceError> {
        let knowledge_base = self.resolve_knowledge_base(request.knowledge_base_id.as_deref())?;
        let limit = request.limit.unwrap_or(10).clamp(1, 50);
        let include_deleted = request.include_deleted.unwrap_or(false);
        let query = request.query.unwrap_or_default().trim().to_string();
        let intent = request.intent.unwrap_or(KnowledgeQueryIntent::Recall);
        let query_mode = request.query_mode.unwrap_or(KnowledgeQueryMode::Content);
        let strategy = request
            .retrieval_strategy
            .unwrap_or(KnowledgeRetrievalStrategy::LexicalOnly);
        let require_verified = request.require_verified.unwrap_or(false);
        let asset_kind_filter = resolve_asset_kind_filter(
            &intent,
            &query_mode,
            request.asset_kind_filter.clone(),
            require_verified,
        )?;
        let mut warnings = Vec::new();

        if query.is_empty()
            && request.entry_id.is_none()
            && request.document_id.is_none()
            && request.knowledge_base_id.is_none()
        {
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::InvalidInput,
                message: "knowledge query 为空且未指定 entry/document".to_string(),
            });
        }

        if matches!(intent, KnowledgeQueryIntent::Citation) {
            if let Some(entry_id) = request.entry_id.as_deref() {
                let entry = self.fetch_entry(entry_id)?;
                if Self::is_structure_asset(&entry) {
                    return Err(KnowledgeServiceError {
                        code: KnowledgeErrorCode::InvalidInput,
                        message: "structure_asset 不允许进入 citation 查询".to_string(),
                    });
                }
            }
            if let Some(document_id) = request.document_id.as_deref() {
                let document = self.fetch_document(document_id, false)?;
                let entry = self.fetch_entry(&document.entry_id)?;
                if Self::is_structure_asset(&entry) {
                    return Err(KnowledgeServiceError {
                        code: KnowledgeErrorCode::InvalidInput,
                        message: "structure_asset 不允许进入 citation 查询".to_string(),
                    });
                }
            }
        }

        let rows = self.fetch_query_rows(
            &knowledge_base.id,
            request.entry_id.as_deref(),
            request.document_id.as_deref(),
            include_deleted,
            &intent,
            &asset_kind_filter,
        )?;

        let mut scored_hits: Vec<(ChunkQueryRow, f64, String)> = rows
            .into_iter()
            .filter_map(|row| {
                let (score, snippet) = score_row(
                    &row,
                    &query,
                    &strategy,
                    &query_mode,
                    request.structure_document_form.as_deref(),
                    request.structure_purpose.as_deref(),
                );
                if score > 0.0 {
                    Some((row, score, snippet))
                } else {
                    None
                }
            })
            .collect();

        if matches!(strategy, KnowledgeRetrievalStrategy::HybridWithRerank) {
            rerank_hits(&mut scored_hits, &query);
        }

        scored_hits.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(Ordering::Equal)
                .then_with(|| a.0.chunk.chunk_index.cmp(&b.0.chunk.chunk_index))
        });

        let mut verified_only_applied = false;
        let preferred_hits: Vec<(ChunkQueryRow, f64, String)> = if require_verified {
            let verified_hits: Vec<_> = scored_hits
                .iter()
                .filter(|(row, _, _)| row.entry.verification_status == "verified")
                .cloned()
                .collect();
            if !verified_hits.is_empty() {
                verified_only_applied = true;
                verified_hits
            } else {
                warnings.push(KnowledgeQueryWarning {
                    code: "verified_only_unavailable".to_string(),
                    message: "当前知识命中中没有 verified 对象，已降级返回一般结果".to_string(),
                });
                scored_hits.clone()
            }
        } else {
            scored_hits.clone()
        };

        let preferred_total_hits = preferred_hits.len();
        let mut preferred_hits = preferred_hits;
        preferred_hits.truncate(limit);

        let chunk_hits: Vec<KnowledgeChunkHit> = if matches!(query_mode, KnowledgeQueryMode::StructureReference) {
            Vec::new()
        } else {
            preferred_hits
                .iter()
                .filter_map(|(row, score, snippet)| {
                    let citation = Self::build_citation(&row.entry, &row.document, Some(&row.chunk.id))?;
                    Some(KnowledgeChunkHit {
                        chunk: row.chunk.clone(),
                        entry_title: row.entry.title.clone(),
                        version: row.document.version,
                        score: *score,
                        snippet: snippet.clone(),
                        citation,
                    })
                })
                .collect()
        };

        let mut entry_map: HashMap<String, KnowledgeEntryHit> = HashMap::new();
        let mut document_map: HashMap<String, KnowledgeDocumentHit> = HashMap::new();

        for (row, score, snippet) in &preferred_hits {
            let citation = Self::build_citation(&row.entry, &row.document, Some(&row.chunk.id));

            let entry_hit = entry_map
                .entry(row.entry.id.clone())
                .or_insert_with(|| KnowledgeEntryHit {
                    entry: row.entry.clone(),
                    active_document_id: row.entry.active_document_id.clone(),
                    active_version: Some(row.document.version),
                    best_score: *score,
                    hit_count: 0,
                    citations: Vec::new(),
                });
            entry_hit.best_score = entry_hit.best_score.max(*score);
            entry_hit.hit_count += 1;
            if let Some(citation_ref) = citation.clone().filter(|_| entry_hit.citations.len() < 3) {
                entry_hit.citations.push(citation_ref);
            }

            let document_hit = document_map
                .entry(row.document.id.clone())
                .or_insert_with(|| KnowledgeDocumentHit {
                    document: Self::trim_document_for_query(row.document.clone()),
                    entry_title: row.entry.title.clone(),
                    best_score: *score,
                    excerpt: snippet.clone(),
                    citations: Vec::new(),
                });
            document_hit.best_score = document_hit.best_score.max(*score);
            if document_hit.excerpt.is_empty() {
                document_hit.excerpt = snippet.clone();
            }
            if let Some(citation_ref) = citation.filter(|_| document_hit.citations.len() < 3) {
                document_hit.citations.push(citation_ref);
            }
        }

        let mut entry_hits: Vec<KnowledgeEntryHit> = entry_map.into_values().collect();
        entry_hits.sort_by(|a, b| {
            b.best_score
                .partial_cmp(&a.best_score)
                .unwrap_or(Ordering::Equal)
                .then_with(|| b.hit_count.cmp(&a.hit_count))
        });

        let mut document_hits: Vec<KnowledgeDocumentHit> = document_map.into_values().collect();
        document_hits.sort_by(|a, b| {
            b.best_score
                .partial_cmp(&a.best_score)
                .unwrap_or(Ordering::Equal)
        });

        let injection_slices = if matches!(query_mode, KnowledgeQueryMode::StructureReference) {
            let mut seen_entries = std::collections::HashSet::new();
            preferred_hits
                .iter()
                .filter(|(row, _, _)| seen_entries.insert(row.entry.id.clone()))
                .take(5)
                .map(|(row, _, _)| Self::build_injection_slice(&row.entry, &row.document, &row.chunk))
                .collect()
        } else {
            preferred_hits
                .iter()
                .take(5)
                .map(|(row, _, _)| Self::build_injection_slice(&row.entry, &row.document, &row.chunk))
                .collect()
        };

        let effective_strategy = if query.is_empty()
            && matches!(strategy, KnowledgeRetrievalStrategy::Hybrid | KnowledgeRetrievalStrategy::HybridWithRerank)
        {
            warnings.push(KnowledgeQueryWarning {
                code: "hybrid_degraded_to_lexical".to_string(),
                message: "当前 query 为空，hybrid 试点已降级为 lexical_only".to_string(),
            });
            KnowledgeRetrievalStrategy::LexicalOnly
        } else {
            strategy.clone()
        };

        Ok(KnowledgeQueryResponse {
            knowledge_base,
            chunk_hits,
            entry_hits,
            document_hits,
            injection_slices,
            total_hits: preferred_total_hits,
            warnings,
            metadata: KnowledgeQueryMetadata {
                intent: intent.as_str().to_string(),
                query_mode: query_mode.as_str().to_string(),
                asset_kind_filter: asset_kind_filter.as_str().to_string(),
                strategy: strategy.as_str().to_string(),
                effective_strategy: effective_strategy.as_str().to_string(),
                require_verified,
                verified_only_applied,
                rerank_enabled: matches!(strategy, KnowledgeRetrievalStrategy::HybridWithRerank),
            },
        })
    }

    pub fn dedupe_automatic_slices(
        slices: Vec<super::types::KnowledgeInjectionSlice>,
        suppressed_entry_ids: &std::collections::HashSet<String>,
        suppressed_document_ids: &std::collections::HashSet<String>,
        suppressed_citation_keys: &std::collections::HashSet<String>,
    ) -> Vec<super::types::KnowledgeInjectionSlice> {
        let mut seen_entries = std::collections::HashSet::new();
        let mut seen_documents = std::collections::HashSet::new();
        let mut seen_citations = std::collections::HashSet::new();
        let mut deduped = Vec::new();

        for slice in slices {
            if suppressed_entry_ids.contains(&slice.entry_id) {
                continue;
            }
            if suppressed_document_ids.contains(&slice.document_id) {
                continue;
            }
            if !seen_entries.insert(slice.entry_id.clone()) {
                continue;
            }
            if !seen_documents.insert(slice.document_id.clone()) {
                continue;
            }
            if let Some(citation) = slice.citation.as_ref() {
                if suppressed_citation_keys.contains(&citation.citation_key) {
                    continue;
                }
                if !seen_citations.insert(citation.citation_key.clone()) {
                    continue;
                }
            }
            deduped.push(slice);
        }

        deduped
    }

    fn fetch_query_rows(
        &self,
        knowledge_base_id: &str,
        entry_id: Option<&str>,
        document_id: Option<&str>,
        include_deleted: bool,
        intent: &KnowledgeQueryIntent,
        asset_kind_filter: &KnowledgeAssetKindFilter,
    ) -> Result<Vec<ChunkQueryRow>, KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        let active_entry_filter = if include_deleted {
            ""
        } else {
            "AND e.deletion_status = 'active' AND e.retrieval_status = 'eligible'"
        };
        let automatic_access_filter = if matches!(intent, KnowledgeQueryIntent::Augmentation) {
            "AND e.visibility_scope = 'workspace' AND e.access_policy = 'workspace_auto'"
        } else {
            ""
        };
        let asset_kind_sql_filter = match asset_kind_filter {
            KnowledgeAssetKindFilter::Standard => "AND e.asset_kind = 'standard'",
            KnowledgeAssetKindFilter::StructureAsset => "AND e.asset_kind = 'structure_asset'",
            KnowledgeAssetKindFilter::All => "",
        };
        let active_document_filter = if include_deleted {
            ""
        } else {
            "AND d.state = 'ready' AND d.lifecycle_status = 'active' AND d.deleted_at IS NULL"
        };
        let active_chunk_filter = if include_deleted {
            ""
        } else {
            "AND c.deleted_at IS NULL AND c.state = 'ready'"
        };

        let sql = if document_id.is_some() {
            format!(
                "SELECT
                    e.id, e.knowledge_base_id, e.folder_id, e.title, e.entry_type, e.asset_kind, e.source_type, e.source_ref,
                    e.sync_mode, e.visibility_scope, e.access_policy, e.active_document_id,
                    e.verification_status, e.deletion_status, e.retrieval_status, e.created_at, e.updated_at, e.deleted_at,
                    d.id, d.entry_id, d.version, d.state, d.lifecycle_status, d.content_text,
                    d.content_checksum, d.parser_kind, d.metadata_json, d.provenance_json,
                    d.created_at, d.updated_at, d.ready_at, d.superseded_at, d.deleted_at,
                    c.id, c.document_id, c.entry_id, c.chunk_index, c.chunk_text, c.token_estimate,
                    c.start_offset, c.end_offset, c.anchor_text, c.state, c.created_at, c.deleted_at
                 FROM knowledge_chunks c
                 JOIN knowledge_documents d ON d.id = c.document_id
                 JOIN knowledge_entries e ON e.id = d.entry_id
                 WHERE e.knowledge_base_id = ?1
                   AND d.id = ?2
                   {active_entry_filter}
                   {asset_kind_sql_filter}
                   {automatic_access_filter}
                   {active_document_filter}
                   {active_chunk_filter}
                 ORDER BY c.chunk_index ASC"
            )
        } else if entry_id.is_some() {
            format!(
                "SELECT
                    e.id, e.knowledge_base_id, e.folder_id, e.title, e.entry_type, e.asset_kind, e.source_type, e.source_ref,
                    e.sync_mode, e.visibility_scope, e.access_policy, e.active_document_id,
                    e.verification_status, e.deletion_status, e.retrieval_status, e.created_at, e.updated_at, e.deleted_at,
                    d.id, d.entry_id, d.version, d.state, d.lifecycle_status, d.content_text,
                    d.content_checksum, d.parser_kind, d.metadata_json, d.provenance_json,
                    d.created_at, d.updated_at, d.ready_at, d.superseded_at, d.deleted_at,
                    c.id, c.document_id, c.entry_id, c.chunk_index, c.chunk_text, c.token_estimate,
                    c.start_offset, c.end_offset, c.anchor_text, c.state, c.created_at, c.deleted_at
                 FROM knowledge_chunks c
                 JOIN knowledge_documents d ON d.id = c.document_id
                 JOIN knowledge_entries e ON e.id = d.entry_id
                 WHERE e.knowledge_base_id = ?1
                   AND e.id = ?2
                   {active_entry_filter}
                   {asset_kind_sql_filter}
                   {automatic_access_filter}
                   {active_document_filter}
                   {active_chunk_filter}
                 ORDER BY c.chunk_index ASC"
            )
        } else {
            format!(
                "SELECT
                    e.id, e.knowledge_base_id, e.folder_id, e.title, e.entry_type, e.asset_kind, e.source_type, e.source_ref,
                    e.sync_mode, e.visibility_scope, e.access_policy, e.active_document_id,
                    e.verification_status, e.deletion_status, e.retrieval_status, e.created_at, e.updated_at, e.deleted_at,
                    d.id, d.entry_id, d.version, d.state, d.lifecycle_status, d.content_text,
                    d.content_checksum, d.parser_kind, d.metadata_json, d.provenance_json,
                    d.created_at, d.updated_at, d.ready_at, d.superseded_at, d.deleted_at,
                    c.id, c.document_id, c.entry_id, c.chunk_index, c.chunk_text, c.token_estimate,
                    c.start_offset, c.end_offset, c.anchor_text, c.state, c.created_at, c.deleted_at
                 FROM knowledge_chunks c
                 JOIN knowledge_documents d ON d.id = c.document_id
                 JOIN knowledge_entries e ON e.id = d.entry_id
                 WHERE e.knowledge_base_id = ?1
                   {active_entry_filter}
                   {asset_kind_sql_filter}
                   {automatic_access_filter}
                   {active_document_filter}
                   {active_chunk_filter}
                 ORDER BY e.updated_at DESC, c.chunk_index ASC"
            )
        };

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| self.db_error(KnowledgeErrorCode::QueryFailed, e))?;
        let mapper = |row: &rusqlite::Row<'_>| -> rusqlite::Result<ChunkQueryRow> {
            Ok(ChunkQueryRow {
                entry: super::repository::KnowledgeService::map_entry_with_offset(row, 0)?,
                document: super::repository::KnowledgeService::map_document_with_offset(row, 18)?,
                chunk: super::repository::KnowledgeService::map_chunk_with_offset(row, 33)?,
            })
        };

        let rows = if let Some(document_id) = document_id {
            stmt.query_map(params![knowledge_base_id, document_id], mapper)
        } else if let Some(entry_id) = entry_id {
            stmt.query_map(params![knowledge_base_id, entry_id], mapper)
        } else {
            stmt.query_map(params![knowledge_base_id], mapper)
        }
        .map_err(|e| self.db_error(KnowledgeErrorCode::QueryFailed, e))?;

        let mut results = Vec::new();
        for row in rows {
            let mut row = row.map_err(|e| self.db_error(KnowledgeErrorCode::QueryFailed, e))?;
            self.hydrate_entry_source_status(&mut row.entry);
            self.hydrate_document_source_status(&mut row.document);
            results.push(row);
        }
        if matches!(intent, KnowledgeQueryIntent::Augmentation) {
            results.retain(|row| {
                row.entry.source_status == "ready" && KnowledgeService::supports_automatic_retrieval(&row.entry)
            });
        }
        Ok(results)
    }
}

fn score_row(
    row: &ChunkQueryRow,
    query: &str,
    strategy: &KnowledgeRetrievalStrategy,
    query_mode: &KnowledgeQueryMode,
    structure_document_form: Option<&str>,
    structure_purpose: Option<&str>,
) -> (f64, String) {
    if matches!(query_mode, KnowledgeQueryMode::StructureReference) {
        return score_structure_row(row, query, structure_document_form, structure_purpose);
    }

    if query.is_empty() {
        return (
            1.0 - ((row.chunk.chunk_index as f64) * 0.001),
            build_snippet(&row.chunk.chunk_text, query),
        );
    }

    let query_lower = query.to_lowercase();
    let title_lower = row.entry.title.to_lowercase();
    let chunk_lower = row.chunk.chunk_text.to_lowercase();
    let anchor_lower = row.chunk.anchor_text.to_lowercase();
    let source_lower = row.entry.source_ref.clone().unwrap_or_default().to_lowercase();
    let query_terms = split_query_terms(query);

    let mut score = 0.0f64;
    score += occurrence_score(&chunk_lower, &query_lower) * 3.0;
    score += occurrence_score(&anchor_lower, &query_lower) * 2.0;
    if title_lower.contains(&query_lower) {
        score += 2.5;
    }
    score += KnowledgeService::verification_boost(&row.entry.verification_status);

    if matches!(
        strategy,
        KnowledgeRetrievalStrategy::Hybrid | KnowledgeRetrievalStrategy::HybridWithRerank
    ) {
        if title_lower.contains(&query_lower) {
            score += 6.0;
        }
        if source_lower.contains(&query_lower) {
            score += 2.5;
        }
        score += metadata_overlap_score(&title_lower, &query_terms) * 1.5;
        score += metadata_overlap_score(&source_lower, &query_terms) * 1.0;
        score += metadata_overlap_score(&anchor_lower, &query_terms) * 0.5;
    }

    (score, build_snippet(&row.chunk.chunk_text, query))
}

fn score_structure_row(
    row: &ChunkQueryRow,
    query: &str,
    structure_document_form: Option<&str>,
    structure_purpose: Option<&str>,
) -> (f64, String) {
    let Some(metadata) = row.document.structure_metadata.as_ref() else {
        return (0.0, String::new());
    };

    let query_terms = split_query_terms(query);
    let document_form = metadata.document_form.to_lowercase();
    let structure_purpose_value = metadata.structure_purpose.to_lowercase();
    let outline = metadata.section_outline_summary.to_lowercase();
    let title = row.entry.title.to_lowercase();
    let source = row.entry.source_ref.clone().unwrap_or_default().to_lowercase();
    let scenarios = metadata
        .applicable_scenarios
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");

    let mut score = 0.0f64;
    if let Some(target_form) = structure_document_form.map(|value| value.trim().to_lowercase()).filter(|value| !value.is_empty()) {
        if document_form == target_form {
            score += 8.0;
        } else if document_form.contains(&target_form) {
            score += 4.0;
        }
    }
    if let Some(target_purpose) = structure_purpose.map(|value| value.trim().to_lowercase()).filter(|value| !value.is_empty()) {
        if structure_purpose_value == target_purpose {
            score += 7.0;
        } else if structure_purpose_value.contains(&target_purpose) {
            score += 3.5;
        }
    }

    score += metadata_overlap_score(&document_form, &query_terms) * 3.0;
    score += metadata_overlap_score(&structure_purpose_value, &query_terms) * 3.0;
    score += metadata_overlap_score(&scenarios, &query_terms) * 2.0;
    score += metadata_overlap_score(&outline, &query_terms) * 2.0;
    score += metadata_overlap_score(&title, &query_terms) * 1.5;
    score += metadata_overlap_score(&source, &query_terms) * 1.0;

    if query.trim().is_empty() {
        score += 1.0;
    }

    (
        score,
        metadata.section_outline_summary.clone(),
    )
}

fn resolve_asset_kind_filter(
    intent: &KnowledgeQueryIntent,
    query_mode: &KnowledgeQueryMode,
    asset_kind_filter: Option<KnowledgeAssetKindFilter>,
    require_verified: bool,
) -> Result<KnowledgeAssetKindFilter, KnowledgeServiceError> {
    let filter = asset_kind_filter.unwrap_or_else(|| match (intent, query_mode) {
        (KnowledgeQueryIntent::Augmentation, _) => KnowledgeAssetKindFilter::Standard,
        (_, KnowledgeQueryMode::StructureReference) => KnowledgeAssetKindFilter::StructureAsset,
        _ => KnowledgeAssetKindFilter::Standard,
    });

    if matches!(intent, KnowledgeQueryIntent::Citation)
        && matches!(
            filter,
            KnowledgeAssetKindFilter::StructureAsset | KnowledgeAssetKindFilter::All
        )
    {
        return Err(KnowledgeServiceError {
            code: KnowledgeErrorCode::InvalidInput,
            message: "citation 查询不允许 structure_asset 或 all 过滤器".to_string(),
        });
    }

    if matches!(intent, KnowledgeQueryIntent::Augmentation)
        && matches!(filter, KnowledgeAssetKindFilter::All)
    {
        return Err(KnowledgeServiceError {
            code: KnowledgeErrorCode::InvalidInput,
            message: "augmentation 查询不允许使用 asset_kind_filter=all".to_string(),
        });
    }

    if require_verified && matches!(filter, KnowledgeAssetKindFilter::All) {
        return Err(KnowledgeServiceError {
            code: KnowledgeErrorCode::InvalidInput,
            message: "require_verified 查询不允许使用 asset_kind_filter=all".to_string(),
        });
    }

    Ok(filter)
}

fn rerank_hits(scored_hits: &mut [(ChunkQueryRow, f64, String)], query: &str) {
    if query.trim().is_empty() {
        return;
    }

    let query_terms = split_query_terms(query);
    for (row, score, _) in scored_hits.iter_mut() {
        let title_lower = row.entry.title.to_lowercase();
        let source_lower = row.entry.source_ref.clone().unwrap_or_default().to_lowercase();
        let query_lower = query.to_lowercase();
        if title_lower.contains(&query_lower) {
            *score += 5.0;
        }
        *score += metadata_overlap_score(&title_lower, &query_terms) * 1.2;
        *score += metadata_overlap_score(&source_lower, &query_terms) * 0.8;
        if row.entry.verification_status == "verified" {
            *score += 0.75;
        }
    }
}

fn split_query_terms(query: &str) -> Vec<String> {
    query
        .to_lowercase()
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| term.to_string())
        .collect()
}

fn metadata_overlap_score(haystack: &str, query_terms: &[String]) -> f64 {
    query_terms
        .iter()
        .filter(|term| haystack.contains(term.as_str()))
        .count() as f64
}

fn occurrence_score(haystack: &str, needle: &str) -> f64 {
    if needle.is_empty() {
        return 0.0;
    }
    let mut count = 0usize;
    let mut search_from = 0usize;
    while let Some(pos) = haystack[search_from..].find(needle) {
        count += 1;
        search_from += pos + needle.len();
    }
    count as f64
}

fn build_snippet(content: &str, query: &str) -> String {
    if content.is_empty() {
        return String::new();
    }
    if query.is_empty() {
        return content.chars().take(180).collect();
    }

    if let Some(char_pos) = content.find(query).map(|byte_pos| content[..byte_pos].chars().count()) {
        let chars: Vec<char> = content.chars().collect();
        let start = char_pos.saturating_sub(60);
        let end = (char_pos + query.chars().count() + 100).min(chars.len());
        return chars[start..end].iter().collect();
    }

    content.chars().take(180).collect()
}
