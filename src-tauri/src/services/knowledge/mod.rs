pub mod chunker;
pub mod ingestion_service;
pub mod lifecycle_service;
pub mod query_service;
pub mod recovery_service;
pub mod repository;
pub mod source_adapter;
pub mod types;

pub use repository::KnowledgeService;
pub use types::*;

#[cfg(test)]
mod tests {
    use super::{
        KnowledgeAccessPolicy, KnowledgeAssetKind, KnowledgeDeleteRequest, KnowledgeErrorCode,
        KnowledgeIngestRequest, KnowledgeMoveRequest, KnowledgePolicyUpdateRequest,
        KnowledgeQueryIntent, KnowledgeQueryMode, KnowledgeQueryRequest, KnowledgeRebuildRequest,
        KnowledgeRenameRequest, KnowledgeReplaceRequest, KnowledgeRetrievalStrategy,
        KnowledgeRetryRequest, KnowledgeService, KnowledgeStructureMetadata,
        KnowledgeVerificationStatus, KnowledgeVerificationUpdateRequest, KnowledgeVisibilityScope,
        KnowledgeWorkspaceSnapshotUpsertRequest,
    };
    use std::collections::HashSet;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn create_workspace() -> PathBuf {
        let workspace = std::env::temp_dir().join(format!("binder-knowledge-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace).expect("create temp workspace");
        workspace
    }

    #[test]
    fn p0_roundtrip_ingest_query_replace_delete() {
        let workspace = create_workspace();
        let document_path = workspace.join("notes.md");
        fs::write(
            &document_path,
            "Binder Knowledge P0\n\nThis snapshot covers citation and provenance.\n\nFinal chunk for query.",
        )
        .expect("write snapshot");

        let service = KnowledgeService::new(&workspace).expect("init knowledge service");
        let ingest = service
            .ingest_document(KnowledgeIngestRequest {
                source_path: Some("notes.md".to_string()),
                ..Default::default()
            })
            .expect("ingest document");

        assert!(ingest.chunk_count > 0);
        assert_eq!(ingest.entry.source_ref.as_deref(), Some("notes.md"));
        assert_eq!(ingest.document.as_ref().expect("document").version, 1);

        let first_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                knowledge_base_id: Some(ingest.knowledge_base.id.clone()),
                query: Some("provenance".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query first version");

        assert!(!first_query.chunk_hits.is_empty());
        assert_eq!(first_query.entry_hits[0].entry.id, ingest.entry.id);
        assert_eq!(first_query.document_hits[0].document.version, 1);
        let v1_citation = first_query.chunk_hits[0].citation.clone();
        assert_eq!(v1_citation.version, 1);
        assert_eq!(v1_citation.provenance.source_ref.as_deref(), Some("notes.md"));
        assert!(!v1_citation.provenance.checksum.is_empty());

        let replace = service
            .replace_document(KnowledgeReplaceRequest {
                entry_id: ingest.entry.id.clone(),
                content: Some(
                    "Binder Knowledge P0 Replacement\n\nThis replacement carries a versioned citation."
                        .to_string(),
                ),
                ..Default::default()
            })
            .expect("replace document");

        let replaced_document = replace.document.as_ref().expect("replaced document");
        assert_eq!(replaced_document.version, 2);

        let second_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                knowledge_base_id: Some(ingest.knowledge_base.id.clone()),
                query: Some("versioned".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query second version");

        assert!(!second_query.chunk_hits.is_empty());
        assert_eq!(second_query.document_hits[0].document.version, 2);
        assert_eq!(second_query.chunk_hits[0].citation.version, 2);
        assert_eq!(v1_citation.version, 1);

        let delete = service
            .delete_entry(KnowledgeDeleteRequest {
                entry_id: ingest.entry.id.clone(),
            })
            .expect("delete entry");
        assert_eq!(delete.entry.deletion_status, "deleted");

        let deleted_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                knowledge_base_id: Some(ingest.knowledge_base.id.clone()),
                entry_id: Some(ingest.entry.id.clone()),
                query: Some("versioned".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query deleted entry");
        assert!(deleted_query.chunk_hits.is_empty());

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p0_rename_and_move_update_entry_metadata() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");
        let ingest = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Original Title".to_string()),
                content: Some("Knowledge content for rename and move.".to_string()),
                source_ref: Some("docs/original.md".to_string()),
                ..Default::default()
            })
            .expect("ingest manual content");

        let renamed = service
            .rename_entry(KnowledgeRenameRequest {
                entry_id: ingest.entry.id.clone(),
                title: "Renamed Title".to_string(),
            })
            .expect("rename entry");
        assert_eq!(renamed.entry.title, "Renamed Title");

        let moved = service
            .move_entry(KnowledgeMoveRequest {
                entry_id: ingest.entry.id.clone(),
                folder_id: None,
                source_ref: Some("docs/moved.md".to_string()),
            })
            .expect("move entry");
        assert_eq!(moved.entry.source_ref.as_deref(), Some("docs/moved.md"));

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p1_dedupe_automatic_retrieval_respects_explicit_suppression() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");
        let repeated_section = (0..24)
            .map(|idx| {
                format!(
                    "Section {}: Citation stability relies on active version and provenance to keep Binder references auditable.",
                    idx
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        let ingest = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Citation Stability".to_string()),
                content: Some(
                    format!(
                        "{}\n\nCitation stability must not be silently rewritten after replace or delete.",
                        repeated_section
                    ),
                ),
                source_ref: Some("docs/citation-stability.md".to_string()),
                ..Default::default()
            })
            .expect("ingest knowledge entry");

        let query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                knowledge_base_id: Some(ingest.knowledge_base.id.clone()),
                query: Some("citation stability".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query knowledge entry");

        assert!(query.injection_slices.len() >= 2);

        let deduped = KnowledgeService::dedupe_automatic_slices(
            query.injection_slices.clone(),
            &HashSet::new(),
            &HashSet::new(),
            &HashSet::new(),
        );
        assert_eq!(deduped.len(), 1);

        let mut suppressed_entries = HashSet::new();
        suppressed_entries.insert(ingest.entry.id.clone());
        let suppressed = KnowledgeService::dedupe_automatic_slices(
            query.injection_slices,
            &suppressed_entries,
            &HashSet::new(),
            &HashSet::new(),
        );
        assert!(suppressed.is_empty());

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p1_workspace_snapshot_upsert_uses_explicit_replace_chain() {
        let workspace = create_workspace();
        let source_path = workspace.join("kb-source.md");
        fs::write(&source_path, "Version one from workspace snapshot").expect("write v1");

        let service = KnowledgeService::new(&workspace).expect("init knowledge service");
        let first = service
            .upsert_workspace_snapshot(KnowledgeWorkspaceSnapshotUpsertRequest {
                source_path: "kb-source.md".to_string(),
                ..Default::default()
            })
            .expect("ingest workspace snapshot");

        assert_eq!(first.entry.source_ref.as_deref(), Some("kb-source.md"));
        assert_eq!(first.document.as_ref().expect("first document").version, 1);

        fs::write(&source_path, "Version two from explicit replace chain").expect("write v2");
        let second = service
            .upsert_workspace_snapshot(KnowledgeWorkspaceSnapshotUpsertRequest {
                source_path: "kb-source.md".to_string(),
                ..Default::default()
            })
            .expect("replace workspace snapshot");

        assert_eq!(second.entry.id, first.entry.id);
        assert_eq!(second.document.as_ref().expect("second document").version, 2);

        let query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("explicit replace".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query replaced snapshot");

        assert_eq!(query.document_hits[0].document.version, 2);

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p1_workspace_source_mismatch_is_visible_and_removed_from_automatic_candidates() {
        let workspace = create_workspace();
        let source_path = workspace.join("snapshot.md");
        fs::write(&source_path, "Snapshot content for mismatch detection.").expect("write snapshot");

        let service = KnowledgeService::new(&workspace).expect("init knowledge service");
        let ingest = service
            .upsert_workspace_snapshot(KnowledgeWorkspaceSnapshotUpsertRequest {
                source_path: "snapshot.md".to_string(),
                ..Default::default()
            })
            .expect("ingest snapshot");
        fs::remove_file(&source_path).expect("remove source file");

        let list = service
            .list_knowledge_entries(None, None, 10)
            .expect("list entries after source mismatch");
        let item = list
            .items
            .iter()
            .find(|item| item.entry.id == ingest.entry.id)
            .expect("mismatched item exists");
        assert_eq!(item.entry.source_status, "missing");
        assert!(item
            .entry
            .source_status_message
            .as_deref()
            .unwrap_or_default()
            .contains("路径已变化"));

        let augmentation = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("snapshot content".to_string()),
                intent: Some(KnowledgeQueryIntent::Augmentation),
                limit: Some(5),
                ..Default::default()
            })
            .expect("augmentation query after mismatch");
        assert!(augmentation.chunk_hits.is_empty());

        let summary = service
            .automatic_retrieval_policy_summary()
            .expect("automatic retrieval summary");
        assert_eq!(summary.active_entry_count, 1);
        assert_eq!(summary.automatic_entry_count, 0);

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p1_folder_scope_is_reserved_in_current_seal_scope() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        let error = service
            .ingest_document(KnowledgeIngestRequest {
                folder_id: Some("folder_reserved".to_string()),
                title: Some("Folder Reserved".to_string()),
                content: Some("Folder is reserved in current seal scope.".to_string()),
                ..Default::default()
            })
            .expect_err("folder scope should be rejected");
        assert_eq!(error.code, KnowledgeErrorCode::FolderScopeReserved);

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn structure_asset_roundtrip_uses_asset_kind_and_structure_reference_query() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        let ingest = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("周报范本".to_string()),
                content: Some("摘要 / 本周进展 / 风险 / 下周计划".to_string()),
                asset_kind: Some(KnowledgeAssetKind::StructureAsset),
                structure_metadata: Some(KnowledgeStructureMetadata {
                    document_form: "weekly_report".to_string(),
                    structure_purpose: "standardized_output".to_string(),
                    applicable_scenarios: vec!["周报".to_string(), "项目同步".to_string()],
                    section_outline_summary: "摘要 / 本周进展 / 风险 / 下周计划".to_string(),
                    slot_hints: vec!["本周进展".to_string(), "风险".to_string(), "下周计划".to_string()],
                    source_nature: "sample".to_string(),
                    structure_tags: None,
                    style_scope: None,
                    usage_notes: Some("仅作为结构参考".to_string()),
                    sample_origin: None,
                }),
                ..Default::default()
            })
            .expect("ingest structure asset");

        assert_eq!(ingest.entry.asset_kind, "structure_asset");
        assert_eq!(
            ingest
                .document
                .as_ref()
                .and_then(|document| document.structure_metadata.as_ref())
                .map(|metadata| metadata.document_form.as_str()),
            Some("weekly_report")
        );

        let query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                entry_id: Some(ingest.entry.id.clone()),
                query: Some("周报 框架".to_string()),
                query_mode: Some(KnowledgeQueryMode::StructureReference),
                limit: Some(5),
                ..Default::default()
            })
            .expect("structure reference query");

        assert!(query.chunk_hits.is_empty());
        assert_eq!(query.entry_hits[0].entry.asset_kind, "structure_asset");
        assert_eq!(query.injection_slices[0].source_role, "structure_reference");
        assert!(query.injection_slices[0].citation.is_none());

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn structure_asset_is_excluded_from_citation_and_automatic_augmentation() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("知识事实".to_string()),
                content: Some("active version and provenance are fact knowledge.".to_string()),
                ..Default::default()
            })
            .expect("ingest standard knowledge");

        let structure = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("周报结构".to_string()),
                content: Some("摘要 / 风险 / 下周计划".to_string()),
                asset_kind: Some(KnowledgeAssetKind::StructureAsset),
                structure_metadata: Some(KnowledgeStructureMetadata {
                    document_form: "weekly_report".to_string(),
                    structure_purpose: "standardized_output".to_string(),
                    applicable_scenarios: vec!["周报".to_string()],
                    section_outline_summary: "摘要 / 风险 / 下周计划".to_string(),
                    slot_hints: vec!["摘要".to_string(), "风险".to_string()],
                    source_nature: "sample".to_string(),
                    structure_tags: None,
                    style_scope: None,
                    usage_notes: None,
                    sample_origin: None,
                }),
                ..Default::default()
            })
            .expect("ingest structure asset");

        let citation_error = service
            .query_knowledge_base(KnowledgeQueryRequest {
                entry_id: Some(structure.entry.id.clone()),
                query: Some("周报".to_string()),
                intent: Some(KnowledgeQueryIntent::Citation),
                ..Default::default()
            })
            .expect_err("citation should reject structure assets");
        assert_eq!(citation_error.code, KnowledgeErrorCode::InvalidInput);

        let augmentation = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("周报 active version".to_string()),
                intent: Some(KnowledgeQueryIntent::Augmentation),
                limit: Some(10),
                ..Default::default()
            })
            .expect("augmentation query");
        assert!(augmentation
            .injection_slices
            .iter()
            .all(|slice| slice.asset_kind == "standard"));

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p2_replace_preserves_historical_citation_and_deleted_status() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        let ingest = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Versioned Entry".to_string()),
                content: Some("Version one citation content.\n\nSecond chunk keeps version one stable.".to_string()),
                ..Default::default()
            })
            .expect("ingest");
        let first_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                entry_id: Some(ingest.entry.id.clone()),
                query: Some("version one".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query v1");
        let v1_document_id = first_query.document_hits[0].document.id.clone();
        let v1_citation_key = first_query.chunk_hits[0].citation.citation_key.clone();

        let replace = service
            .replace_document(KnowledgeReplaceRequest {
                entry_id: ingest.entry.id.clone(),
                content: Some("Version two citation content.\n\nSecond chunk keeps version two active.".to_string()),
                ..Default::default()
            })
            .expect("replace");

        assert_ne!(replace.document.as_ref().expect("doc").id, v1_document_id);

        let superseded_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                document_id: Some(v1_document_id.clone()),
                query: Some("version one".to_string()),
                include_deleted: Some(true),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query superseded document");
        assert_eq!(superseded_query.chunk_hits[0].citation.status, "superseded");
        assert_eq!(superseded_query.chunk_hits[0].citation.citation_key, v1_citation_key);

        service
            .delete_entry(KnowledgeDeleteRequest {
                entry_id: ingest.entry.id.clone(),
            })
            .expect("delete");

        let deleted_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                document_id: Some(v1_document_id),
                query: Some("version one".to_string()),
                include_deleted: Some(true),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query deleted document");
        assert_eq!(deleted_query.chunk_hits[0].citation.status, "deleted");

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p2_rebuild_and_retry_preserve_active_version() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        let ingest = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Rebuild Target".to_string()),
                content: Some(
                    (0..18)
                        .map(|idx| format!("Section {} rebuild preserves active version and chunk identity.", idx))
                        .collect::<Vec<_>>()
                        .join("\n\n"),
                ),
                ..Default::default()
            })
            .expect("ingest");
        let baseline = service
            .query_knowledge_base(KnowledgeQueryRequest {
                entry_id: Some(ingest.entry.id.clone()),
                query: Some("active version".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query before rebuild");
        let active_document = baseline.document_hits[0].document.clone();
        let first_citation_key = baseline.chunk_hits[0].citation.citation_key.clone();

        let rebuild = service
            .rebuild_entry(KnowledgeRebuildRequest {
                entry_id: ingest.entry.id.clone(),
                document_id: None,
            })
            .expect("rebuild entry");
        assert_eq!(rebuild.document.as_ref().expect("doc").id, active_document.id);
        assert_eq!(rebuild.document.as_ref().expect("doc").version, active_document.version);

        let rebuilt_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                entry_id: Some(ingest.entry.id.clone()),
                query: Some("active version".to_string()),
                limit: Some(5),
                ..Default::default()
            })
            .expect("query after rebuild");
        assert_eq!(rebuilt_query.document_hits[0].document.id, active_document.id);
        assert_eq!(rebuilt_query.chunk_hits[0].citation.citation_key, first_citation_key);

        service
            .insert_stage_event_direct(
                "document",
                &active_document.id,
                "index",
                "failed",
                Some(super::KnowledgeErrorCode::IndexFailed),
                Some("simulated rebuild failure".to_string()),
                true,
            )
            .expect("insert failed stage");
        let retried = service
            .retry_entry(KnowledgeRetryRequest {
                entry_id: ingest.entry.id.clone(),
            })
            .expect("retry entry");
        assert_eq!(retried.retried_stage.as_deref(), Some("index"));
        assert_eq!(retried.document.as_ref().expect("doc").version, active_document.version);

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p2_verification_affects_query_ranking_and_risk_flags() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        let verified = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Verified Binder Rule".to_string()),
                content: Some("Binder verification rule applies to citation trust.".to_string()),
                verification_status: Some(KnowledgeVerificationStatus::Verified),
                ..Default::default()
            })
            .expect("ingest verified");
        let unverified = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Unverified Binder Rule".to_string()),
                content: Some("Binder verification rule applies to citation trust.".to_string()),
                verification_status: Some(KnowledgeVerificationStatus::Unverified),
                ..Default::default()
            })
            .expect("ingest unverified");

        service
            .update_verification_status(KnowledgeVerificationUpdateRequest {
                entry_id: unverified.entry.id.clone(),
                verification_status: KnowledgeVerificationStatus::NeedsReview,
            })
            .expect("update verification");

        let query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("Binder verification rule".to_string()),
                limit: Some(10),
                ..Default::default()
            })
            .expect("query verification-ranked results");

        assert_eq!(query.entry_hits[0].entry.id, verified.entry.id);
        let needs_review_slice = query
            .injection_slices
            .iter()
            .find(|slice| slice.entry_id == unverified.entry.id)
            .expect("needs review slice");
        assert!(needs_review_slice
            .risk_flags
            .iter()
            .any(|flag| flag == "verification_needs_review"));

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p3_source_defaults_and_policy_controls_gate_automatic_retrieval() {
        let workspace = create_workspace();
        let source_path = workspace.join("kb-source.md");
        fs::write(&source_path, "Binder policy source content for automatic retrieval.")
            .expect("write source file");
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        let workspace_snapshot = service
            .ingest_document(KnowledgeIngestRequest {
                source_path: Some("kb-source.md".to_string()),
                ..Default::default()
            })
            .expect("ingest workspace snapshot");
        assert_eq!(workspace_snapshot.entry.sync_mode, "snapshot");
        assert_eq!(workspace_snapshot.entry.visibility_scope, "workspace");
        assert_eq!(workspace_snapshot.entry.access_policy, "workspace_auto");

        let manual_snapshot = service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Manual Policy Snapshot".to_string()),
                content: Some("Binder manual policy content for explicit references.".to_string()),
                ..Default::default()
            })
            .expect("ingest manual snapshot");
        assert_eq!(manual_snapshot.entry.sync_mode, "none");
        assert_eq!(manual_snapshot.entry.visibility_scope, "explicit_only");
        assert_eq!(manual_snapshot.entry.access_policy, "explicit_only");

        service
            .update_entry_policy(KnowledgePolicyUpdateRequest {
                entry_id: workspace_snapshot.entry.id.clone(),
                access_policy: Some(KnowledgeAccessPolicy::ExplicitOnly),
                visibility_scope: Some(KnowledgeVisibilityScope::ExplicitOnly),
                ..Default::default()
            })
            .expect("tighten automatic retrieval policy");

        let augmentation_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("automatic retrieval".to_string()),
                intent: Some(KnowledgeQueryIntent::Augmentation),
                limit: Some(5),
                ..Default::default()
            })
            .expect("augmentation query");
        assert!(augmentation_query.chunk_hits.is_empty());

        let recall_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("automatic retrieval".to_string()),
                intent: Some(KnowledgeQueryIntent::Recall),
                limit: Some(5),
                ..Default::default()
            })
            .expect("recall query");
        assert!(!recall_query.chunk_hits.is_empty());

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }

    #[test]
    fn p3_hybrid_query_metadata_and_root_scope_query_work() {
        let workspace = create_workspace();
        let service = KnowledgeService::new(&workspace).expect("init knowledge service");

        service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Binder Policy Matrix".to_string()),
                content: Some("Matrix section lists workspace auto and explicit only policy states.".to_string()),
                ..Default::default()
            })
            .expect("ingest title-rich entry");
        service
            .ingest_document(KnowledgeIngestRequest {
                title: Some("Misc Notes".to_string()),
                content: Some(
                    "policy matrix policy matrix policy matrix repeated in plain content only.".to_string(),
                ),
                ..Default::default()
            })
            .expect("ingest lexical-heavy entry");

        let hybrid_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                query: Some("policy matrix".to_string()),
                retrieval_strategy: Some(KnowledgeRetrievalStrategy::HybridWithRerank),
                require_verified: Some(false),
                limit: Some(5),
                ..Default::default()
            })
            .expect("hybrid query");

        assert_eq!(hybrid_query.metadata.strategy, "hybrid_with_rerank");
        assert!(hybrid_query.metadata.rerank_enabled);
        assert_eq!(hybrid_query.entry_hits[0].entry.title, "Binder Policy Matrix");

        let root_scope_query = service
            .query_knowledge_base(KnowledgeQueryRequest {
                knowledge_base_id: Some(hybrid_query.knowledge_base.id.clone()),
                query: None,
                retrieval_strategy: Some(KnowledgeRetrievalStrategy::Hybrid),
                limit: Some(3),
                ..Default::default()
            })
            .expect("root scope query");

        assert!(!root_scope_query.chunk_hits.is_empty());
        assert_eq!(root_scope_query.metadata.effective_strategy, "lexical_only");
        assert!(root_scope_query
            .warnings
            .iter()
            .any(|warning| warning.code == "hybrid_degraded_to_lexical"));

        drop(service);
        fs::remove_dir_all(&workspace).expect("cleanup workspace");
    }
}
