use super::source_adapter::adapter_for_source_type;
use super::types::{
    KnowledgeAccessPolicy, KnowledgeAssetKind, KnowledgeBase, KnowledgeCitation,
    KnowledgeCitationStatus, KnowledgeDeletionStatus, KnowledgeDocument, KnowledgeDocumentState,
    KnowledgeEntry, KnowledgeErrorCode, KnowledgeFolder, KnowledgeProvenance,
    KnowledgeRetrievalMode, KnowledgeRetrievalStatus, KnowledgeSourceRole, KnowledgeSourceStatus,
    KnowledgeStageEvent, KnowledgeStructureMetadata, KnowledgeSyncMode,
    KnowledgeVerificationStatus, KnowledgeVisibilityScope,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use sha2::{Digest, Sha256};
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct KnowledgeService {
    conn: Mutex<Connection>,
    workspace_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct KnowledgeServiceError {
    pub code: KnowledgeErrorCode,
    pub message: String,
}

impl Display for KnowledgeServiceError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for KnowledgeServiceError {}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedContentInput {
    pub title: String,
    pub content: String,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub checksum: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ChunkQueryRow {
    pub entry: KnowledgeEntry,
    pub document: KnowledgeDocument,
    pub chunk: super::types::KnowledgeChunk,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct AutomaticRetrievalPolicySummary {
    pub active_entry_count: usize,
    pub policy_allowed_entry_count: usize,
    pub automatic_entry_count: usize,
}

impl KnowledgeService {
    pub fn new(workspace_path: &Path) -> Result<Self, String> {
        let binder_dir = workspace_path.join(".binder");
        std::fs::create_dir_all(&binder_dir)
            .map_err(|e| format!("创建 .binder 目录失败: {}", e))?;

        let db_path = binder_dir.join("workspace.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("打开 workspace.db 失败: {}", e))?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;",
        )
        .map_err(|e| format!("设置 knowledge WAL 失败: {}", e))?;

        let service = Self {
            conn: Mutex::new(conn),
            workspace_path: workspace_path.to_path_buf(),
        };
        service.run_migrations()?;
        let _ = service.ensure_default_base().map_err(|e| e.to_string())?;
        Ok(service)
    }

    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("knowledge 锁失败: {}", e))?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS knowledge_schema_version (version INTEGER PRIMARY KEY)",
            [],
        )
        .map_err(|e| format!("创建 knowledge schema 表失败: {}", e))?;

        let version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM knowledge_schema_version",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("读取 knowledge schema 版本失败: {}", e))?;

        if version < 1 {
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS knowledge_bases (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS knowledge_folders (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT NOT NULL,
                    parent_folder_id TEXT,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    deleted_at INTEGER,
                    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
                );

                CREATE TABLE IF NOT EXISTS knowledge_entries (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT NOT NULL,
                    folder_id TEXT,
                    title TEXT NOT NULL,
                    entry_type TEXT NOT NULL,
                    asset_kind TEXT NOT NULL DEFAULT 'standard',
                    source_type TEXT NOT NULL,
                    source_ref TEXT,
                    sync_mode TEXT NOT NULL DEFAULT 'snapshot',
                    visibility_scope TEXT NOT NULL DEFAULT 'workspace',
                    access_policy TEXT NOT NULL DEFAULT 'workspace_auto',
                    active_document_id TEXT,
                    verification_status TEXT NOT NULL,
                    deletion_status TEXT NOT NULL,
                    retrieval_status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    deleted_at INTEGER,
                    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id),
                    FOREIGN KEY (folder_id) REFERENCES knowledge_folders(id)
                );

                CREATE TABLE IF NOT EXISTS knowledge_documents (
                    id TEXT PRIMARY KEY,
                    entry_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    state TEXT NOT NULL,
                    lifecycle_status TEXT NOT NULL,
                    content_text TEXT NOT NULL,
                    content_checksum TEXT NOT NULL,
                    parser_kind TEXT NOT NULL,
                    metadata_json TEXT,
                    provenance_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    ready_at INTEGER,
                    superseded_at INTEGER,
                    deleted_at INTEGER,
                    UNIQUE(entry_id, version),
                    FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
                );

                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    entry_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    chunk_text TEXT NOT NULL,
                    token_estimate INTEGER NOT NULL,
                    start_offset INTEGER NOT NULL,
                    end_offset INTEGER NOT NULL,
                    anchor_text TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    deleted_at INTEGER,
                    UNIQUE(document_id, chunk_index),
                    FOREIGN KEY (document_id) REFERENCES knowledge_documents(id),
                    FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
                );

                CREATE TABLE IF NOT EXISTS knowledge_execution_stages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    object_type TEXT NOT NULL,
                    object_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error_code TEXT,
                    error_message TEXT,
                    retryable INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_knowledge_entries_base ON knowledge_entries(knowledge_base_id, deletion_status, retrieval_status);
                CREATE INDEX IF NOT EXISTS idx_knowledge_entries_asset_kind ON knowledge_entries(asset_kind, deletion_status, retrieval_status);
                CREATE INDEX IF NOT EXISTS idx_knowledge_entries_active_document ON knowledge_entries(active_document_id);
                CREATE INDEX IF NOT EXISTS idx_knowledge_documents_entry ON knowledge_documents(entry_id, version);
                CREATE INDEX IF NOT EXISTS idx_knowledge_documents_state ON knowledge_documents(state, lifecycle_status, deleted_at);
                CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id, chunk_index);
                CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entry ON knowledge_chunks(entry_id, deleted_at);
                CREATE INDEX IF NOT EXISTS idx_knowledge_execution_object ON knowledge_execution_stages(object_type, object_id, created_at);

                INSERT INTO knowledge_schema_version(version) VALUES (3);
                "#,
            )
            .map_err(|e| format!("执行 knowledge migration 失败: {}", e))?;
            return Ok(());
        }

        if (1..2).contains(&version) {
            conn.execute_batch(
                r#"
                ALTER TABLE knowledge_entries ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'snapshot';
                ALTER TABLE knowledge_entries ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'workspace';
                ALTER TABLE knowledge_entries ADD COLUMN access_policy TEXT NOT NULL DEFAULT 'workspace_auto';
                INSERT INTO knowledge_schema_version(version) VALUES (2);
                "#,
            )
            .map_err(|e| format!("执行 knowledge migration v2 失败: {}", e))?;
        }

        if version < 3 {
            conn.execute_batch(
                r#"
                ALTER TABLE knowledge_entries ADD COLUMN asset_kind TEXT NOT NULL DEFAULT 'standard';
                CREATE INDEX IF NOT EXISTS idx_knowledge_entries_asset_kind ON knowledge_entries(asset_kind, deletion_status, retrieval_status);
                INSERT INTO knowledge_schema_version(version) VALUES (3);
                "#,
            )
            .map_err(|e| format!("执行 knowledge migration v3 失败: {}", e))?;
        }

        Ok(())
    }

    pub(crate) fn ensure_default_base(&self) -> Result<KnowledgeBase, KnowledgeServiceError> {
        let mut conn = self.lock_conn()?;
        let existing = conn
            .query_row(
                "SELECT id, name, description, created_at, updated_at
                 FROM knowledge_bases
                 ORDER BY created_at ASC
                 LIMIT 1",
                [],
                Self::map_base,
            )
            .optional()
            .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

        if let Some(base) = existing {
            return Ok(base);
        }

        let now = Self::now_ts();
        let base = KnowledgeBase {
            id: Self::new_id("kb"),
            name: "Binder Knowledge Base".to_string(),
            description: Some("Workspace-scoped knowledge snapshots.".to_string()),
            created_at: now,
            updated_at: now,
        };
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                base.id,
                base.name,
                base.description,
                base.created_at,
                base.updated_at
            ],
        )
        .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
        Ok(base)
    }

    pub(crate) fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, KnowledgeServiceError> {
        self.conn.lock().map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::PersistenceFailed,
            message: format!("knowledge 锁失败: {}", e),
        })
    }

    pub(crate) fn resolve_knowledge_base(
        &self,
        knowledge_base_id: Option<&str>,
    ) -> Result<KnowledgeBase, KnowledgeServiceError> {
        if let Some(id) = knowledge_base_id {
            let conn = self.lock_conn()?;
            let base = conn
                .query_row(
                    "SELECT id, name, description, created_at, updated_at
                     FROM knowledge_bases
                     WHERE id = ?1",
                    params![id],
                    Self::map_base,
                )
                .optional()
                .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
            if let Some(base) = base {
                return Ok(base);
            }
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::InvalidInput,
                message: format!("knowledge_base_id 不存在: {}", id),
            });
        }
        self.ensure_default_base()
    }

    pub(crate) fn reject_folder_scope_if_present(
        &self,
        folder_id: Option<&str>,
    ) -> Result<(), KnowledgeServiceError> {
        let Some(folder_id) = folder_id else {
            return Ok(());
        };

        Err(KnowledgeServiceError {
            code: KnowledgeErrorCode::FolderScopeReserved,
            message: format!(
                "folder 主链仍为预留对象，当前封板范围不接受 folder_id={}",
                folder_id
            ),
        })
    }

    pub(crate) fn resolve_content_input(
        &self,
        title: Option<String>,
        content: Option<String>,
        source_path: Option<String>,
        source_ref: Option<String>,
        source_type: Option<String>,
    ) -> Result<ResolvedContentInput, KnowledgeServiceError> {
        let normalized_source_path = source_path
            .as_ref()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty());

        let normalized_content = content
            .as_ref()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty());

        let mut effective_source_ref = source_ref
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty());

        let effective_content = if let Some(content) = normalized_content {
            content
        } else if let Some(path) = normalized_source_path.as_ref() {
            let (_, relative_path) = self.resolve_workspace_snapshot_path(path)?;
            effective_source_ref = Some(relative_path.clone());
            self.read_workspace_snapshot(path)?
        } else {
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::InvalidInput,
                message: "知识库写入缺少 content 或 source_path".to_string(),
            });
        };

        if effective_content.trim().is_empty() {
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::InvalidInput,
                message: "知识文档内容为空".to_string(),
            });
        }

        if effective_source_ref.is_none() {
            if let Some(path) = normalized_source_path.as_ref() {
                let (_, relative_path) = self.resolve_workspace_snapshot_path(path)?;
                effective_source_ref = Some(relative_path);
            }
        }

        let effective_title = title
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty())
            .or_else(|| {
                effective_source_ref
                    .as_ref()
                    .and_then(|source| PathBuf::from(source).file_name().map(|name| name.to_string_lossy().to_string()))
            })
            .or_else(|| {
                effective_content
                    .lines()
                    .map(str::trim)
                    .find(|line| !line.is_empty())
                    .map(|line| line.chars().take(80).collect())
            })
            .unwrap_or_else(|| "Untitled Knowledge Entry".to_string());

        let effective_source_type = source_type
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty())
            .unwrap_or_else(|| {
                if normalized_source_path.is_some() {
                    "workspace_snapshot".to_string()
                } else {
                    "manual_snapshot".to_string()
                }
            });

        Ok(ResolvedContentInput {
            title: effective_title,
            content: effective_content.clone(),
            source_type: effective_source_type,
            source_ref: effective_source_ref,
            checksum: Self::checksum(&effective_content),
        })
    }

    fn read_workspace_snapshot(&self, source_path: &str) -> Result<String, KnowledgeServiceError> {
        let (absolute_path, _) = self.resolve_workspace_snapshot_path(source_path)?;
        fs::read_to_string(&absolute_path).map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::InvalidInput,
            message: format!("读取 workspace snapshot 失败: {}", e),
        })
    }

    fn resolve_workspace_snapshot_path(
        &self,
        source_path: &str,
    ) -> Result<(PathBuf, String), KnowledgeServiceError> {
        let requested = PathBuf::from(source_path);
        let absolute = if requested.is_absolute() {
            requested
        } else {
            self.workspace_path.join(requested)
        };

        let workspace_canonical = fs::canonicalize(&self.workspace_path).map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::WorkspaceBoundaryViolation,
            message: format!("workspace 路径不可用: {}", e),
        })?;
        let file_canonical = fs::canonicalize(&absolute).map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::WorkspaceBoundaryViolation,
            message: format!("snapshot 源文件不可访问: {}", e),
        })?;

        if !file_canonical.starts_with(&workspace_canonical) {
            return Err(KnowledgeServiceError {
                code: KnowledgeErrorCode::WorkspaceBoundaryViolation,
                message: "知识库 snapshot 只允许读取当前 workspace 内文件".to_string(),
            });
        }

        let relative = file_canonical
            .strip_prefix(&workspace_canonical)
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| source_path.replace('\\', "/"));

        Ok((file_canonical, relative))
    }

    pub(crate) fn fetch_entry(
        &self,
        entry_id: &str,
    ) -> Result<KnowledgeEntry, KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        let mut entry = conn.query_row(
            "SELECT id, knowledge_base_id, folder_id, title, entry_type, asset_kind, source_type, source_ref,
                    sync_mode, visibility_scope, access_policy, active_document_id,
                    verification_status, deletion_status, retrieval_status, created_at, updated_at, deleted_at
             FROM knowledge_entries
             WHERE id = ?1",
            params![entry_id],
            Self::map_entry,
        )
        .optional()
        .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?
        .ok_or_else(|| KnowledgeServiceError {
            code: KnowledgeErrorCode::EntryNotFound,
            message: format!("knowledge entry 不存在: {}", entry_id),
        })?;
        self.hydrate_entry_source_status(&mut entry);
        Ok(entry)
    }

    pub(crate) fn find_workspace_snapshot_entry_by_source_ref(
        &self,
        knowledge_base_id: &str,
        source_ref: &str,
    ) -> Result<Option<KnowledgeEntry>, KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        conn.query_row(
            "SELECT id, knowledge_base_id, folder_id, title, entry_type, asset_kind, source_type, source_ref,
                    sync_mode, visibility_scope, access_policy, active_document_id,
                    verification_status, deletion_status, retrieval_status, created_at, updated_at, deleted_at
             FROM knowledge_entries
             WHERE knowledge_base_id = ?1
               AND source_type = 'workspace_snapshot'
               AND source_ref = ?2
               AND deleted_at IS NULL
               AND deletion_status != 'deleted'
             ORDER BY updated_at DESC
             LIMIT 1",
            params![knowledge_base_id, source_ref],
            Self::map_entry,
        )
        .optional()
        .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))
    }

    pub(crate) fn fetch_document(
        &self,
        document_id: &str,
        include_content: bool,
    ) -> Result<KnowledgeDocument, KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        let mut document = Self::fetch_document_with_conn(&conn, document_id, include_content)?;
        self.hydrate_document_source_status(&mut document);
        Ok(document)
    }

    pub(crate) fn fetch_document_with_conn(
        conn: &Connection,
        document_id: &str,
        include_content: bool,
    ) -> Result<KnowledgeDocument, KnowledgeServiceError> {
        let sql = "SELECT id, entry_id, version, state, lifecycle_status, content_text,
                          content_checksum, parser_kind, metadata_json, provenance_json,
                          created_at, updated_at, ready_at, superseded_at, deleted_at
                   FROM knowledge_documents
                   WHERE id = ?1";
        let mut document = conn
            .query_row(sql, params![document_id], Self::map_document)
            .optional()
            .map_err(|e| KnowledgeServiceError {
                code: KnowledgeErrorCode::PersistenceFailed,
                message: format!("读取 knowledge document 失败: {}", e),
            })?
            .ok_or_else(|| KnowledgeServiceError {
                code: KnowledgeErrorCode::EntryNotFound,
                message: format!("knowledge document 不存在: {}", document_id),
            })?;
        if !include_content {
            document.content_text = None;
        }
        Ok(document)
    }

    pub(crate) fn fetch_active_document_for_entry(
        &self,
        entry: &KnowledgeEntry,
        include_content: bool,
    ) -> Result<Option<KnowledgeDocument>, KnowledgeServiceError> {
        let Some(document_id) = entry.active_document_id.as_deref() else {
            return Ok(None);
        };
        let conn = self.lock_conn()?;
        let mut document = Self::fetch_document_with_conn(&conn, document_id, include_content)?;
        self.hydrate_document_source_status(&mut document);
        if !include_content {
            document.content_text = None;
        }
        Ok(Some(document))
    }

    pub(crate) fn next_document_version(
        tx: &Transaction<'_>,
        entry_id: &str,
    ) -> Result<i64, KnowledgeServiceError> {
        tx.query_row(
            "SELECT COALESCE(MAX(version), 0) + 1
             FROM knowledge_documents
             WHERE entry_id = ?1",
            params![entry_id],
            |row| row.get(0),
        )
        .map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::PersistenceFailed,
            message: format!("读取 knowledge version 失败: {}", e),
        })
    }

    pub(crate) fn list_stage_events(
        &self,
        object_ids: &[String],
    ) -> Result<Vec<KnowledgeStageEvent>, KnowledgeServiceError> {
        if object_ids.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.lock_conn()?;
        let mut events = Vec::new();
        for object_id in object_ids {
            let mut stmt = conn
                .prepare(
                    "SELECT object_type, object_id, stage, status, error_code, error_message, retryable, created_at
                     FROM knowledge_execution_stages
                     WHERE object_id = ?1
                     ORDER BY id ASC",
                )
                .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
            let rows = stmt
                .query_map(params![object_id], |row| {
                    Ok(KnowledgeStageEvent {
                        object_type: row.get(0)?,
                        object_id: row.get(1)?,
                        stage: row.get(2)?,
                        status: row.get(3)?,
                        error_code: row.get(4)?,
                        error_message: row.get(5)?,
                        retryable: row.get::<_, i64>(6)? != 0,
                        created_at: row.get(7)?,
                    })
                })
                .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
            for row in rows {
                events.push(row.map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?);
            }
        }
        Ok(events)
    }

    pub(crate) fn list_chunks_for_document(
        &self,
        document_id: &str,
        include_deleted: bool,
    ) -> Result<Vec<super::types::KnowledgeChunk>, KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        let sql = if include_deleted {
            "SELECT id, document_id, entry_id, chunk_index, chunk_text, token_estimate,
                    start_offset, end_offset, anchor_text, state, created_at, deleted_at
             FROM knowledge_chunks
             WHERE document_id = ?1
             ORDER BY chunk_index ASC"
        } else {
            "SELECT id, document_id, entry_id, chunk_index, chunk_text, token_estimate,
                    start_offset, end_offset, anchor_text, state, created_at, deleted_at
             FROM knowledge_chunks
             WHERE document_id = ?1
               AND deleted_at IS NULL
             ORDER BY chunk_index ASC"
        };

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
        let rows = stmt
            .query_map(params![document_id], Self::map_chunk)
            .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

        let mut chunks = Vec::new();
        for row in rows {
            chunks.push(row.map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?);
        }
        Ok(chunks)
    }

    pub(crate) fn insert_stage_event(
        tx: &Transaction<'_>,
        object_type: &str,
        object_id: &str,
        stage: &str,
        status: &str,
        error_code: Option<KnowledgeErrorCode>,
        error_message: Option<String>,
        retryable: bool,
    ) -> Result<(), KnowledgeServiceError> {
        tx.execute(
            "INSERT INTO knowledge_execution_stages (
                object_type, object_id, stage, status, error_code, error_message, retryable, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                object_type,
                object_id,
                stage,
                status,
                error_code.map(|code| code.as_str().to_string()),
                error_message,
                if retryable { 1 } else { 0 },
                Self::now_ts()
            ],
        )
        .map_err(|e| KnowledgeServiceError {
            code: KnowledgeErrorCode::PersistenceFailed,
            message: format!("写入 knowledge stage 失败: {}", e),
        })?;
        Ok(())
    }

    pub(crate) fn insert_stage_event_direct(
        &self,
        object_type: &str,
        object_id: &str,
        stage: &str,
        status: &str,
        error_code: Option<KnowledgeErrorCode>,
        error_message: Option<String>,
        retryable: bool,
    ) -> Result<(), KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO knowledge_execution_stages (
                object_type, object_id, stage, status, error_code, error_message, retryable, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                object_type,
                object_id,
                stage,
                status,
                error_code.map(|code| code.as_str().to_string()),
                error_message,
                if retryable { 1 } else { 0 },
                Self::now_ts()
            ],
        )
        .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
        Ok(())
    }

    pub(crate) fn record_operation_failure(
        &self,
        object_type: &str,
        object_id: &str,
        stage: &str,
        error: &KnowledgeServiceError,
        retryable: bool,
    ) {
        let _ = self.insert_stage_event_direct(
            object_type,
            object_id,
            stage,
            "failed",
            Some(error.code.clone()),
            Some(error.message.clone()),
            retryable,
        );
    }

    pub(crate) fn verification_rank(status: &str) -> i32 {
        match status {
            "verified" => 2,
            "unverified" => 1,
            "needs_review" => 0,
            _ => 0,
        }
    }

    pub(crate) fn verification_boost(status: &str) -> f64 {
        match status {
            "verified" => 0.75,
            "needs_review" => -0.35,
            _ => 0.0,
        }
    }

    pub(crate) fn verification_risk_flags(status: &str) -> Vec<String> {
        match status {
            "verified" => Vec::new(),
            "needs_review" => vec!["verification_needs_review".to_string()],
            _ => vec!["verification_unverified".to_string()],
        }
    }

    pub(crate) fn is_retryable_error(code: &KnowledgeErrorCode) -> bool {
        matches!(
            code,
            KnowledgeErrorCode::PersistenceFailed
                | KnowledgeErrorCode::ChunkFailed
                | KnowledgeErrorCode::IndexFailed
                | KnowledgeErrorCode::QueryFailed
                | KnowledgeErrorCode::DeleteFailed
                | KnowledgeErrorCode::VersionConflict
                | KnowledgeErrorCode::RebuildFailed
                | KnowledgeErrorCode::RecoveryFailed
        )
    }

    pub(crate) fn map_base(row: &Row<'_>) -> rusqlite::Result<KnowledgeBase> {
        Ok(KnowledgeBase {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    }

    pub(crate) fn map_folder(row: &Row<'_>) -> rusqlite::Result<KnowledgeFolder> {
        Ok(KnowledgeFolder {
            id: row.get(0)?,
            knowledge_base_id: row.get(1)?,
            parent_folder_id: row.get(2)?,
            name: row.get(3)?,
            path: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            deleted_at: row.get(7)?,
        })
    }

    pub(crate) fn map_entry(row: &Row<'_>) -> rusqlite::Result<KnowledgeEntry> {
        Ok(KnowledgeEntry {
            id: row.get(0)?,
            knowledge_base_id: row.get(1)?,
            folder_id: row.get(2)?,
            title: row.get(3)?,
            entry_type: row.get(4)?,
            asset_kind: row.get(5)?,
            source_type: row.get(6)?,
            source_ref: row.get(7)?,
            sync_mode: row.get(8)?,
            visibility_scope: row.get(9)?,
            access_policy: row.get(10)?,
            active_document_id: row.get(11)?,
            verification_status: row.get(12)?,
            deletion_status: row.get(13)?,
            retrieval_status: row.get(14)?,
            source_status: KnowledgeSourceStatus::Ready.as_str().to_string(),
            source_status_message: None,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
            deleted_at: row.get(17)?,
        })
    }

    pub(crate) fn map_entry_with_offset(
        row: &Row<'_>,
        offset: usize,
    ) -> rusqlite::Result<KnowledgeEntry> {
        Ok(KnowledgeEntry {
            id: row.get(offset)?,
            knowledge_base_id: row.get(offset + 1)?,
            folder_id: row.get(offset + 2)?,
            title: row.get(offset + 3)?,
            entry_type: row.get(offset + 4)?,
            asset_kind: row.get(offset + 5)?,
            source_type: row.get(offset + 6)?,
            source_ref: row.get(offset + 7)?,
            sync_mode: row.get(offset + 8)?,
            visibility_scope: row.get(offset + 9)?,
            access_policy: row.get(offset + 10)?,
            active_document_id: row.get(offset + 11)?,
            verification_status: row.get(offset + 12)?,
            deletion_status: row.get(offset + 13)?,
            retrieval_status: row.get(offset + 14)?,
            source_status: KnowledgeSourceStatus::Ready.as_str().to_string(),
            source_status_message: None,
            created_at: row.get(offset + 15)?,
            updated_at: row.get(offset + 16)?,
            deleted_at: row.get(offset + 17)?,
        })
    }

    pub(crate) fn map_document(row: &Row<'_>) -> rusqlite::Result<KnowledgeDocument> {
        let metadata_json: Option<String> = row.get(8)?;
        let provenance_json: String = row.get(9)?;
        let metadata_value = metadata_json
            .as_deref()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok());
        let structure_metadata = metadata_value
            .clone()
            .and_then(|value| serde_json::from_value::<KnowledgeStructureMetadata>(value).ok());
        let provenance = serde_json::from_str::<KnowledgeProvenance>(&provenance_json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                9,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })?;

        Ok(KnowledgeDocument {
            id: row.get(0)?,
            entry_id: row.get(1)?,
            version: row.get(2)?,
            state: row.get(3)?,
            lifecycle_status: row.get(4)?,
            content_text: Some(row.get(5)?),
            content_checksum: row.get(6)?,
            parser_kind: row.get(7)?,
            metadata_json: metadata_value,
            structure_metadata,
            provenance,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
            ready_at: row.get(12)?,
            superseded_at: row.get(13)?,
            deleted_at: row.get(14)?,
            source_status: KnowledgeSourceStatus::Ready.as_str().to_string(),
            source_status_message: None,
        })
    }

    pub(crate) fn map_document_with_offset(
        row: &Row<'_>,
        offset: usize,
    ) -> rusqlite::Result<KnowledgeDocument> {
        let metadata_json: Option<String> = row.get(offset + 8)?;
        let provenance_json: String = row.get(offset + 9)?;
        let metadata_value = metadata_json
            .as_deref()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok());
        let structure_metadata = metadata_value
            .clone()
            .and_then(|value| serde_json::from_value::<KnowledgeStructureMetadata>(value).ok());
        let provenance = serde_json::from_str::<KnowledgeProvenance>(&provenance_json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                offset + 9,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })?;

        Ok(KnowledgeDocument {
            id: row.get(offset)?,
            entry_id: row.get(offset + 1)?,
            version: row.get(offset + 2)?,
            state: row.get(offset + 3)?,
            lifecycle_status: row.get(offset + 4)?,
            content_text: Some(row.get(offset + 5)?),
            content_checksum: row.get(offset + 6)?,
            parser_kind: row.get(offset + 7)?,
            metadata_json: metadata_value,
            structure_metadata,
            provenance,
            created_at: row.get(offset + 10)?,
            updated_at: row.get(offset + 11)?,
            ready_at: row.get(offset + 12)?,
            superseded_at: row.get(offset + 13)?,
            deleted_at: row.get(offset + 14)?,
            source_status: KnowledgeSourceStatus::Ready.as_str().to_string(),
            source_status_message: None,
        })
    }

    pub(crate) fn map_chunk(row: &Row<'_>) -> rusqlite::Result<super::types::KnowledgeChunk> {
        Ok(super::types::KnowledgeChunk {
            id: row.get(0)?,
            document_id: row.get(1)?,
            entry_id: row.get(2)?,
            chunk_index: row.get::<_, i64>(3)? as usize,
            chunk_text: row.get(4)?,
            token_estimate: row.get::<_, i64>(5)? as usize,
            start_offset: row.get::<_, i64>(6)? as usize,
            end_offset: row.get::<_, i64>(7)? as usize,
            anchor_text: row.get(8)?,
            state: row.get(9)?,
            created_at: row.get(10)?,
            deleted_at: row.get(11)?,
        })
    }

    pub(crate) fn map_chunk_with_offset(
        row: &Row<'_>,
        offset: usize,
    ) -> rusqlite::Result<super::types::KnowledgeChunk> {
        Ok(super::types::KnowledgeChunk {
            id: row.get(offset)?,
            document_id: row.get(offset + 1)?,
            entry_id: row.get(offset + 2)?,
            chunk_index: row.get::<_, i64>(offset + 3)? as usize,
            chunk_text: row.get(offset + 4)?,
            token_estimate: row.get::<_, i64>(offset + 5)? as usize,
            start_offset: row.get::<_, i64>(offset + 6)? as usize,
            end_offset: row.get::<_, i64>(offset + 7)? as usize,
            anchor_text: row.get(offset + 8)?,
            state: row.get(offset + 9)?,
            created_at: row.get(offset + 10)?,
            deleted_at: row.get(offset + 11)?,
        })
    }

    pub(crate) fn build_provenance(
        &self,
        source_type: String,
        source_ref: Option<String>,
        checksum: String,
    ) -> KnowledgeProvenance {
        KnowledgeProvenance {
            source_type,
            source_ref,
            workspace_path: self.workspace_path.to_string_lossy().to_string(),
            snapshot_mode: "snapshot".to_string(),
            checksum,
        }
    }

    pub(crate) fn is_structure_asset(entry: &KnowledgeEntry) -> bool {
        entry.asset_kind == KnowledgeAssetKind::StructureAsset.as_str()
    }

    pub(crate) fn build_citation(
        entry: &KnowledgeEntry,
        document: &KnowledgeDocument,
        chunk_id: Option<&str>,
    ) -> Option<KnowledgeCitation> {
        if Self::is_structure_asset(entry) {
            return None;
        }

        let status = match (document.lifecycle_status.as_str(), document.state.as_str()) {
            ("active", "ready") => KnowledgeCitationStatus::Active,
            ("superseded", _) | (_, "superseded") => KnowledgeCitationStatus::Superseded,
            ("deleted", _) | (_, "deleted") => KnowledgeCitationStatus::Deleted,
            _ => KnowledgeCitationStatus::Unavailable,
        };

        let citation_key = match chunk_id {
            Some(chunk_id) => format!("kc:{}:{}:{}:v{}", entry.id, document.id, chunk_id, document.version),
            None => format!("kc:{}:{}:v{}", entry.id, document.id, document.version),
        };

        Some(KnowledgeCitation {
            citation_key,
            knowledge_base_id: entry.knowledge_base_id.clone(),
            entry_id: entry.id.clone(),
            document_id: document.id.clone(),
            chunk_id: chunk_id.map(|value| value.to_string()),
            version: document.version,
            title: entry.title.clone(),
            source_type: document.provenance.source_type.clone(),
            source_ref: document.provenance.source_ref.clone(),
            status: status.as_str().to_string(),
            provenance: document.provenance.clone(),
        })
    }

    fn build_structure_reference_content(
        entry: &KnowledgeEntry,
        document: &KnowledgeDocument,
        chunk: &super::types::KnowledgeChunk,
    ) -> String {
        if let Some(metadata) = document.structure_metadata.as_ref() {
            let mut sections = Vec::new();
            sections.push(format!("文档形式: {}", metadata.document_form));
            sections.push(format!("结构用途: {}", metadata.structure_purpose));
            sections.push(format!("结构摘要: {}", metadata.section_outline_summary));
            if !metadata.applicable_scenarios.is_empty() {
                sections.push(format!(
                    "适用场景: {}",
                    metadata.applicable_scenarios.join(" / ")
                ));
            }
            if !metadata.slot_hints.is_empty() {
                sections.push(format!("固定槽位提示: {}", metadata.slot_hints.join(" / ")));
            }
            if let Some(notes) = metadata.usage_notes.as_ref().filter(|value| !value.trim().is_empty()) {
                sections.push(format!("使用说明: {}", notes));
            }
            return sections.join("\n");
        }

        let fallback = if !chunk.chunk_text.trim().is_empty() {
            chunk.chunk_text.clone()
        } else {
            document.content_text.clone().unwrap_or_default()
        };
        if fallback.trim().is_empty() {
            format!("结构参考：{}", entry.title)
        } else {
            fallback
        }
    }

    pub(crate) fn build_injection_slice(
        entry: &KnowledgeEntry,
        document: &KnowledgeDocument,
        chunk: &super::types::KnowledgeChunk,
    ) -> super::types::KnowledgeInjectionSlice {
        let citation = Self::build_citation(entry, document, Some(&chunk.id));
        let is_structure_asset = Self::is_structure_asset(entry);
        let mut risk_flags = if is_structure_asset {
            Vec::new()
        } else {
            Self::verification_risk_flags(&entry.verification_status)
        };
        match entry.access_policy.as_str() {
            "explicit_only" => risk_flags.push("access_explicit_only".to_string()),
            "blocked" => risk_flags.push("access_blocked".to_string()),
            _ => {}
        }
        if let Some(citation_ref) = citation.as_ref() {
            match citation_ref.status.as_str() {
                "superseded" => risk_flags.push("citation_superseded".to_string()),
                "deleted" => risk_flags.push("citation_deleted".to_string()),
                "unavailable" => risk_flags.push("citation_unavailable".to_string()),
                _ => {}
            }
        }
        match document.source_status.as_str() {
            "missing" => risk_flags.push("source_missing".to_string()),
            "unreadable" => risk_flags.push("source_unreadable".to_string()),
            _ => {}
        }
        let source_label = document
            .provenance
            .source_ref
            .clone()
            .or_else(|| entry.source_ref.clone())
            .unwrap_or_else(|| entry.title.clone());
        super::types::KnowledgeInjectionSlice {
            slice_id: format!("kis:{}:{}", document.id, chunk.id),
            entry_id: entry.id.clone(),
            document_id: document.id.clone(),
            chunk_id: if is_structure_asset {
                None
            } else {
                Some(chunk.id.clone())
            },
            asset_kind: entry.asset_kind.clone(),
            source_role: if is_structure_asset {
                KnowledgeSourceRole::StructureReference.as_str().to_string()
            } else {
                KnowledgeSourceRole::FactKnowledge.as_str().to_string()
            },
            title: entry.title.clone(),
            source_label,
            content: if is_structure_asset {
                Self::build_structure_reference_content(entry, document, chunk)
            } else {
                chunk.chunk_text.clone()
            },
            retrieval_mode: KnowledgeRetrievalMode::ManualQuery.as_str().to_string(),
            risk_flags,
            citation,
            provenance: document.provenance.clone(),
            structure_metadata: document.structure_metadata.clone(),
            source_status: document.source_status.clone(),
            source_status_message: document.source_status_message.clone(),
        }
    }

    pub(crate) fn automatic_retrieval_policy_summary(
        &self,
    ) -> Result<AutomaticRetrievalPolicySummary, KnowledgeServiceError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, knowledge_base_id, folder_id, title, entry_type, asset_kind, source_type, source_ref,
                        sync_mode, visibility_scope, access_policy, active_document_id,
                        verification_status, deletion_status, retrieval_status, created_at, updated_at, deleted_at
                 FROM knowledge_entries
                 WHERE deletion_status = 'active'
                   AND deleted_at IS NULL",
            )
            .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
        let rows = stmt
            .query_map([], Self::map_entry)
            .map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;

        let mut summary = AutomaticRetrievalPolicySummary::default();
        for row in rows {
            let mut entry = row.map_err(|e| self.db_error(KnowledgeErrorCode::PersistenceFailed, e))?;
            self.hydrate_entry_source_status(&mut entry);
            summary.active_entry_count += 1;
            if Self::supports_automatic_retrieval(&entry) {
                summary.policy_allowed_entry_count += 1;
                if entry.source_status == KnowledgeSourceStatus::Ready.as_str() {
                    summary.automatic_entry_count += 1;
                }
            }
        }
        Ok(summary)
    }

    pub(crate) fn checksum(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    pub(crate) fn default_sync_mode_for_source(source_type: &str) -> String {
        adapter_for_source_type(source_type)
            .default_sync_mode()
            .as_str()
            .to_string()
    }

    pub(crate) fn default_visibility_scope_for_source(source_type: &str) -> String {
        adapter_for_source_type(source_type)
            .default_visibility_scope()
            .as_str()
            .to_string()
    }

    pub(crate) fn default_access_policy_for_source(source_type: &str) -> String {
        adapter_for_source_type(source_type)
            .default_access_policy()
            .as_str()
            .to_string()
    }

    pub(crate) fn supports_sync_mode(source_type: &str, sync_mode: &str) -> bool {
        let sync_mode = match sync_mode {
            "none" => KnowledgeSyncMode::None,
            "snapshot" => KnowledgeSyncMode::Snapshot,
            "follow_source" => KnowledgeSyncMode::FollowSource,
            "external_scheduled" => KnowledgeSyncMode::ExternalScheduled,
            _ => return false,
        };
        adapter_for_source_type(source_type).supports_sync_mode(&sync_mode)
    }

    pub(crate) fn supports_automatic_retrieval(entry: &KnowledgeEntry) -> bool {
        if Self::is_structure_asset(entry) {
            return false;
        }
        let visibility_scope = match entry.visibility_scope.as_str() {
            "workspace" => KnowledgeVisibilityScope::Workspace,
            "explicit_only" => KnowledgeVisibilityScope::ExplicitOnly,
            _ => return false,
        };
        let access_policy = match entry.access_policy.as_str() {
            "workspace_auto" => KnowledgeAccessPolicy::WorkspaceAuto,
            "explicit_only" => KnowledgeAccessPolicy::ExplicitOnly,
            "blocked" => KnowledgeAccessPolicy::Blocked,
            _ => return false,
        };
        adapter_for_source_type(&entry.source_type)
            .supports_automatic_retrieval(&visibility_scope, &access_policy)
    }

    pub(crate) fn now_ts() -> i64 {
        Utc::now().timestamp()
    }

    pub(crate) fn new_id(prefix: &str) -> String {
        format!("{}_{}", prefix, Uuid::new_v4())
    }

    pub(crate) fn db_error(
        &self,
        code: KnowledgeErrorCode,
        err: rusqlite::Error,
    ) -> KnowledgeServiceError {
        KnowledgeServiceError {
            code,
            message: err.to_string(),
        }
    }

    pub(crate) fn is_entry_deleted(entry: &KnowledgeEntry) -> bool {
        entry.deletion_status == KnowledgeDeletionStatus::Deleted.as_str()
    }

    pub(crate) fn hydrate_entry_source_status(&self, entry: &mut KnowledgeEntry) {
        let (status, message) = self.resolve_source_status(
            entry.source_type.as_str(),
            entry.source_ref.as_deref(),
        );
        entry.source_status = status;
        entry.source_status_message = message;
    }

    pub(crate) fn hydrate_document_source_status(&self, document: &mut KnowledgeDocument) {
        let (status, message) = self.resolve_source_status(
            document.provenance.source_type.as_str(),
            document.provenance.source_ref.as_deref(),
        );
        document.source_status = status;
        document.source_status_message = message;
    }

    pub(crate) fn resolve_source_status(
        &self,
        source_type: &str,
        source_ref: Option<&str>,
    ) -> (String, Option<String>) {
        if source_type != "workspace_snapshot" {
            return (KnowledgeSourceStatus::Ready.as_str().to_string(), None);
        }

        let Some(source_ref) = source_ref.map(str::trim).filter(|value| !value.is_empty()) else {
            return (
                KnowledgeSourceStatus::Unreadable.as_str().to_string(),
                Some("workspace snapshot 缺少 source_ref，无法校验源文件".to_string()),
            );
        };

        let source_path = self.workspace_path.join(source_ref.trim_start_matches('/'));
        match fs::metadata(&source_path) {
            Ok(metadata) => {
                if !metadata.is_file() {
                    return (
                        KnowledgeSourceStatus::Unreadable.as_str().to_string(),
                        Some(format!("源路径不是文件: {}", source_ref)),
                    );
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                return (
                    KnowledgeSourceStatus::Missing.as_str().to_string(),
                    Some(format!("workspace 源文件不存在或路径已变化: {}", source_ref)),
                );
            }
            Err(err) => {
                return (
                    KnowledgeSourceStatus::Unreadable.as_str().to_string(),
                    Some(format!("无法访问 workspace 源文件 {}: {}", source_ref, err)),
                );
            }
        }

        match fs::read_to_string(&source_path) {
            Ok(_) => (KnowledgeSourceStatus::Ready.as_str().to_string(), None),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => (
                KnowledgeSourceStatus::Missing.as_str().to_string(),
                Some(format!("workspace 源文件不存在或路径已变化: {}", source_ref)),
            ),
            Err(err) => (
                KnowledgeSourceStatus::Unreadable.as_str().to_string(),
                Some(format!("无法读取 workspace 源文件 {}: {}", source_ref, err)),
            ),
        }
    }

    pub(crate) fn trim_document_for_query(mut document: KnowledgeDocument) -> KnowledgeDocument {
        document.content_text = None;
        document
    }

    pub(crate) fn eligible_retrieval_status() -> &'static str {
        KnowledgeRetrievalStatus::Eligible.as_str()
    }

    pub(crate) fn suppressed_retrieval_status() -> &'static str {
        KnowledgeRetrievalStatus::Suppressed.as_str()
    }

    pub(crate) fn verified_status_default() -> &'static str {
        KnowledgeVerificationStatus::Unverified.as_str()
    }

    pub(crate) fn ready_state() -> &'static str {
        KnowledgeDocumentState::Ready.as_str()
    }
}
