//! 记忆服务 (P0–P2 实现)
//!
//! - 数据库：workspace.db（与 WorkspaceDb 共用同一文件，WAL 模式允许并发读）
//! - user_memory.db：位于 {data_dir}/binder/user_memory.db，跨工作区用户级记忆
//! - 无 AppState：每次调用按 workspace_path 打开连接（与 WorkspaceDb 模式一致）
//! - 写入：tokio::spawn fire-and-forget，不阻塞主链（MC-WRITE-001）
//! - 检索：500ms 超时，超时返回空结果（A-AST-M-S-02 §六）

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::fmt;

// ── Workspace memory schema (P0) ────────────────────────────────────────────

/// workspace.db 中的记忆库主表、FTS、注入日志和关键索引。
/// 幂等执行：可在 migration 和运行时初始化阶段重复调用。
const WORKSPACE_MEMORY_DDL: &str = "
CREATE TABLE IF NOT EXISTS memory_items (
    id TEXT PRIMARY KEY,
    layer TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    source_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0.8,
    freshness_status TEXT NOT NULL DEFAULT 'fresh',
    readonly INTEGER NOT NULL DEFAULT 1,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
    entity_name,
    content,
    summary,
    tags,
    content='memory_items',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memory_items_fts_insert AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_items_fts(rowid, entity_name, content, summary, tags)
    VALUES (new.rowid, new.entity_name, new.content, new.summary, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memory_items_fts_update AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_items_fts(memory_items_fts, rowid, entity_name, content, summary, tags)
    VALUES ('delete', old.rowid, old.entity_name, old.content, old.summary, old.tags);
    INSERT INTO memory_items_fts(rowid, entity_name, content, summary, tags)
    VALUES (new.rowid, new.entity_name, new.content, new.summary, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memory_items_fts_delete AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_items_fts(memory_items_fts, rowid, entity_name, content, summary, tags)
    VALUES ('delete', old.rowid, old.entity_name, old.content, old.summary, old.tags);
END;

CREATE TABLE IF NOT EXISTS memory_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL,
    tab_id TEXT NOT NULL,
    query_text TEXT NOT NULL DEFAULT '',
    inject_position TEXT NOT NULL DEFAULT '',
    injected_at INTEGER NOT NULL,
    FOREIGN KEY(memory_id) REFERENCES memory_items(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_items(scope_type, scope_id, layer);
CREATE INDEX IF NOT EXISTS idx_memory_entity ON memory_items(scope_id, layer, entity_name);
CREATE INDEX IF NOT EXISTS idx_memory_freshness ON memory_items(freshness_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_source_ref ON memory_items(source_ref, layer, updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_usage_memory ON memory_usage_logs(memory_id, injected_at);
CREATE INDEX IF NOT EXISTS idx_memory_usage_tab ON memory_usage_logs(tab_id, injected_at);
";

pub fn ensure_workspace_memory_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(WORKSPACE_MEMORY_DDL)
        .map_err(|e| format!("初始化 workspace memory schema 失败: {}", e))
}

// ── P2: ExtractionConfig ────────────────────────────────────────────────────

/// P2：记忆提炼独立 AI 配置口（§10.2 调试开关 + D-11 独立 provider/model）
///
/// 读取顺序：环境变量 > `.binder/memory.env` > 默认值
#[derive(Debug, Clone)]
pub struct ExtractionConfig {
    /// 提炼任务使用的模型（默认 deepseek-chat，避免 reasoner 等高成本模型）
    pub model: String,
    /// 是否启用整个记忆系统（false → 所有操作空操作）
    pub enabled: bool,
    /// 是否启用写入（false → 只检索注入，不触发 AI 提炼）
    pub write_enabled: bool,
    /// 是否注入到 context（false → 只写入，不注入）
    pub inject_enabled: bool,
    /// 标签级提炼轮次间隔（默认 5）
    pub extraction_interval: usize,
    /// 输出详细调试日志
    pub debug_log: bool,
}

impl Default for ExtractionConfig {
    fn default() -> Self {
        ExtractionConfig {
            model: std::env::var("BINDER_MEMORY_MODEL")
                .unwrap_or_else(|_| "deepseek-chat".to_string()),
            enabled: std::env::var("BINDER_MEMORY_ENABLED")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            write_enabled: std::env::var("BINDER_MEMORY_WRITE")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            inject_enabled: std::env::var("BINDER_MEMORY_INJECT")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            extraction_interval: std::env::var("BINDER_MEMORY_INTERVAL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5),
            debug_log: std::env::var("BINDER_MEMORY_DEBUG")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
        }
    }
}

impl ExtractionConfig {
    /// 加载配置（从环境变量，可被 .env 文件预填）
    pub fn load() -> Self {
        Self::default()
    }
}

// ── 错误类型 ─────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum MemoryError {
    LockError(String),
    DbError(rusqlite::Error),
    ParseError(serde_json::Error),
    ValidationError(String),
    Timeout,
    AiCallFailed(String),
}

impl MemoryError {
    pub fn lock_error<T>(e: std::sync::PoisonError<T>) -> Self {
        MemoryError::LockError(e.to_string())
    }
}

impl fmt::Display for MemoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MemoryError::LockError(s) => write!(f, "lock error: {}", s),
            MemoryError::DbError(e) => write!(f, "db error: {}", e),
            MemoryError::ParseError(e) => write!(f, "parse error: {}", e),
            MemoryError::ValidationError(s) => write!(f, "validation error: {}", s),
            MemoryError::Timeout => write!(f, "timeout"),
            MemoryError::AiCallFailed(s) => write!(f, "ai call failed: {}", s),
        }
    }
}

impl From<rusqlite::Error> for MemoryError {
    fn from(e: rusqlite::Error) -> Self {
        MemoryError::DbError(e)
    }
}

impl From<serde_json::Error> for MemoryError {
    fn from(e: serde_json::Error) -> Self {
        MemoryError::ParseError(e)
    }
}

// ── 数据模型 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryLayer {
    Tab,
    Content,
    WorkspaceLongTerm,
    User,
}

impl MemoryLayer {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryLayer::Tab => "tab",
            MemoryLayer::Content => "content",
            MemoryLayer::WorkspaceLongTerm => "workspace_long_term",
            MemoryLayer::User => "user",
        }
    }

    pub fn priority_rank(&self) -> i32 {
        match self {
            MemoryLayer::Tab => 0,
            MemoryLayer::Content => 1,
            MemoryLayer::WorkspaceLongTerm => 2,
            MemoryLayer::User => 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryScopeType {
    Tab,
    Workspace,
    User,
}

impl MemoryScopeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryScopeType::Tab => "tab",
            MemoryScopeType::Workspace => "workspace",
            MemoryScopeType::User => "user",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "tab" => Some(MemoryScopeType::Tab),
            "workspace" => Some(MemoryScopeType::Workspace),
            "user" => Some(MemoryScopeType::User),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessStatus {
    Fresh,
    Stale,
    Expired,
    Superseded,
}

impl FreshnessStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            FreshnessStatus::Fresh => "fresh",
            FreshnessStatus::Stale => "stale",
            FreshnessStatus::Expired => "expired",
            FreshnessStatus::Superseded => "superseded",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemorySourceKind {
    ConversationSummary,
    ConversationEntity,
    DocumentExtract,
    DocumentOutline,
    DocumentDetailEnrichment,
    TabDeletionSummary,
    UserPreference,
}

impl MemorySourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemorySourceKind::ConversationSummary => "conversation_summary",
            MemorySourceKind::ConversationEntity => "conversation_entity",
            MemorySourceKind::DocumentExtract => "document_extract",
            MemorySourceKind::DocumentOutline => "document_outline",
            MemorySourceKind::DocumentDetailEnrichment => "document_detail_enrichment",
            MemorySourceKind::TabDeletionSummary => "tab_deletion_summary",
            MemorySourceKind::UserPreference => "user_preference",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
    pub id: String,
    pub layer: String,
    pub scope_type: String,
    pub scope_id: String,
    pub entity_type: String,
    pub entity_name: String,
    pub content: String,
    pub summary: String,
    pub tags: String,
    pub source_kind: String,
    pub source_ref: String,
    pub confidence: f64,
    pub freshness_status: String,
    pub readonly: bool,
    pub access_count: i64,
    pub last_accessed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct MemoryItemInput {
    pub layer: MemoryLayer,
    pub scope_type: MemoryScopeType,
    pub scope_id: String,
    pub entity_type: String,
    pub entity_name: String,
    pub content: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub source_kind: MemorySourceKind,
    pub source_ref: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemorySearchScope {
    Tab,
    Content,
    WorkspaceLongTerm,
    User,
    All,
}

impl MemorySearchScope {
    pub fn from_str(s: &str) -> Self {
        match s {
            "tab" => MemorySearchScope::Tab,
            "content" => MemorySearchScope::Content,
            "workspace_long_term" => MemorySearchScope::WorkspaceLongTerm,
            "user" => MemorySearchScope::User,
            _ => MemorySearchScope::All,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchMemoriesParams {
    pub query: String,
    pub tab_id: Option<String>,
    pub workspace_path: Option<String>,
    pub scope: MemorySearchScope,
    pub limit: Option<usize>,
    pub entity_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySearchResult {
    pub item: MemoryItem,
    pub relevance_score: f64,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySearchResponse {
    pub items: Vec<MemorySearchResult>,
    pub total_found: usize,
    pub scope_used: Vec<String>,
    pub timed_out: bool,
}

impl MemorySearchResponse {
    pub fn empty() -> Self {
        MemorySearchResponse {
            items: vec![],
            total_found: 0,
            scope_used: vec![],
            timed_out: false,
        }
    }
}

// ── 服务 ──────────────────────────────────────────────────────────────────────

pub struct MemoryService {
    db: Arc<Mutex<Connection>>,
    workspace_path: PathBuf,
}

impl MemoryService {
    /// 打开工作区的 workspace.db（记忆表已由 WorkspaceDb migration 创建）
    pub fn new(workspace_path: &Path) -> Result<Self, String> {
        let db_path = workspace_path.join(".binder").join("workspace.db");
        if !db_path.exists() {
            return Err(format!("workspace.db 不存在: {}", db_path.display()));
        }
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("打开 workspace.db 失败: {}", e))?;
        // WAL 模式（与 WorkspaceDb 保持一致）
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("设置 pragma 失败: {}", e))?;
        // 运行时兜底：即使 migration 漏跑，也保证主链可用。
        ensure_workspace_memory_schema(&conn)?;
        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            workspace_path: workspace_path.to_path_buf(),
        })
    }

    // ── P0.5：孤立 tab 记忆降级 ────────────────────────────────────────────

    pub async fn mark_orphan_tab_memories_stale(
        &self,
        active_tab_ids: &[String],
    ) -> Result<u64, MemoryError> {
        let db = self.db.clone();
        let ids = active_tab_ids.to_vec();

        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();

            if ids.is_empty() {
                // 所有 tab 层 fresh 记忆都标记为 stale
                let count = conn.execute(
                    "UPDATE memory_items SET freshness_status = 'stale', updated_at = ?1
                     WHERE scope_type = 'tab' AND freshness_status = 'fresh'",
                    params![now],
                )?;
                return Ok(count as u64);
            }

            // 构造 NOT IN 占位符
            let placeholders: String = ids
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 2))
                .collect::<Vec<_>>()
                .join(", ");

            let sql = format!(
                "UPDATE memory_items SET freshness_status = 'stale', updated_at = ?1
                 WHERE scope_type = 'tab' AND freshness_status = 'fresh'
                   AND scope_id NOT IN ({})",
                placeholders
            );

            let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];
            for id in &ids {
                param_values.push(Box::new(id.clone()));
            }
            let params_refs: Vec<&dyn rusqlite::ToSql> =
                param_values.iter().map(|b| b.as_ref()).collect();

            let count = conn.execute(&sql, params_refs.as_slice())?;
            Ok(count as u64)
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    // ── P0：写入链 ──────────────────────────────────────────────────────────

    pub async fn upsert_tab_memories(
        &self,
        tab_id: &str,
        items: Vec<MemoryItemInput>,
    ) -> Result<(), MemoryError> {
        let db = self.db.clone();
        let tab_id = tab_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();

            for item in &items {
                if item.entity_name.is_empty() || item.content.is_empty() {
                    eprintln!("skip invalid memory item: entity_name or content empty");
                    continue;
                }
                if item.content.chars().count() > 500 {
                    eprintln!("skip memory item: content too long (>500 chars)");
                    continue;
                }
                if item.confidence < 0.3 {
                    eprintln!("skip memory item: confidence too low ({:.2})", item.confidence);
                    continue;
                }

                let id = uuid::Uuid::new_v4().to_string();
                let tags_str = item.tags.join(" ");

                conn.execute(
                    "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1
                     WHERE scope_type = 'tab' AND scope_id = ?2
                       AND entity_name = ?3 AND layer = 'tab'
                       AND freshness_status = 'fresh'",
                    params![now, tab_id, item.entity_name],
                )?;

                conn.execute(
                    "INSERT INTO memory_items (
                        id, layer, scope_type, scope_id, entity_type, entity_name,
                        content, summary, tags, source_kind, source_ref,
                        confidence, freshness_status, readonly, created_at, updated_at
                     ) VALUES (?1, 'tab', 'tab', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'fresh', 1, ?11, ?11)",
                    params![
                        id, tab_id,
                        item.entity_type, item.entity_name,
                        item.content, item.summary, tags_str,
                        item.source_kind.as_str(), item.source_ref,
                        item.confidence, now,
                    ],
                )?;
            }
            Ok::<(), MemoryError>(())
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    pub async fn upsert_project_content_memories(
        &self,
        file_path: &str,
        items: Vec<MemoryItemInput>,
    ) -> Result<(), MemoryError> {
        let db = self.db.clone();
        let workspace_path = self.workspace_path.to_string_lossy().to_string();
        let file_path = file_path.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();

            conn.execute(
                "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1
                 WHERE layer = 'content' AND scope_id = ?2
                   AND source_ref = ?3 AND freshness_status = 'fresh'",
                params![now, workspace_path, file_path],
            )?;

            for item in &items {
                if item.entity_name.is_empty() || item.content.is_empty() {
                    continue;
                }
                if item.content.chars().count() > 500 {
                    eprintln!("skip content memory item: content too long");
                    continue;
                }
                if item.confidence < 0.3 {
                    continue;
                }

                let id = uuid::Uuid::new_v4().to_string();
                let tags_str = item.tags.join(" ");
                conn.execute(
                    "INSERT INTO memory_items (
                        id, layer, scope_type, scope_id, entity_type, entity_name,
                        content, summary, tags, source_kind, source_ref,
                        confidence, freshness_status, readonly, created_at, updated_at
                     ) VALUES (?1, 'content', 'workspace', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'fresh', 1, ?11, ?11)",
                    params![
                        id, workspace_path,
                        item.entity_type, item.entity_name,
                        item.content, item.summary, tags_str,
                        item.source_kind.as_str(), file_path,
                        item.confidence, now,
                    ],
                )?;
            }
            Ok::<(), MemoryError>(())
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    /// P1: 带 LLM-as-judge 的标签级记忆写入（ADD/UPDATE/DELETE/NOOP 四分类）
    pub async fn upsert_tab_memories_with_judge(
        &self,
        tab_id: &str,
        items: Vec<MemoryItemInput>,
        provider: &std::sync::Arc<dyn crate::services::ai_providers::AIProvider>,
    ) -> Result<(), MemoryError> {
        let now = now_secs();
        let db = self.db.clone();
        let tab_id_str = tab_id.to_string();

        for item in &items {
            // 基本校验
            if item.entity_name.is_empty() || item.content.is_empty() { continue; }
            if item.content.chars().count() > 500 { continue; }
            if item.confidence < 0.3 { continue; }

            // 检索相似记忆
            let similar = {
                let conn = db.lock().map_err(MemoryError::lock_error)?;
                find_similar_memories(&conn, item, &tab_id_str, "tab", 3)
            };

            // LLM 仲裁
            let action = llm_judge_action(provider, item, &similar).await;
            eprintln!("[memory] judge: {:?} for entity={}", action, item.entity_name);

            // 按动作执行
            let db_clone = db.clone();
            let tab_clone = tab_id_str.clone();
            let item_clone = item.clone();
            match action {
                JudgeAction::Noop => {
                    // 不写入
                }
                JudgeAction::Add => {
                    tokio::task::spawn_blocking(move || {
                        let conn = db_clone.lock().map_err(MemoryError::lock_error)?;
                        insert_memory_item(&conn, &item_clone, "tab", "tab", &tab_clone, now)?;
                        Ok::<(), MemoryError>(())
                    }).await.map_err(|e| MemoryError::LockError(e.to_string()))??;
                }
                JudgeAction::Update(old_id) => {
                    let tab_clone2 = tab_clone.clone();
                    tokio::task::spawn_blocking(move || {
                        let conn = db_clone.lock().map_err(MemoryError::lock_error)?;
                        conn.execute(
                            "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1 WHERE id = ?2",
                            params![now, old_id],
                        )?;
                        let new_id = insert_memory_item(&conn, &item_clone, "tab", "tab", &tab_clone, now)?;
                        // P2: 记忆演化 — 级联检查相关记忆
                        let _ = cascade_supersede_related(&conn, &new_id, &item_clone, &tab_clone2, "tab", now);
                        Ok::<(), MemoryError>(())
                    }).await.map_err(|e| MemoryError::LockError(e.to_string()))??;
                }
                JudgeAction::Delete(old_id) => {
                    tokio::task::spawn_blocking(move || {
                        let conn = db_clone.lock().map_err(MemoryError::lock_error)?;
                        conn.execute(
                            "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1 WHERE id = ?2",
                            params![now, old_id],
                        )?;
                        Ok::<(), MemoryError>(())
                    }).await.map_err(|e| MemoryError::LockError(e.to_string()))??;
                }
            }
        }
        Ok(())
    }

    /// P1: 带 LLM-as-judge 的内容记忆写入
    pub async fn upsert_content_memories_with_judge(
        &self,
        file_path: &str,
        items: Vec<MemoryItemInput>,
        provider: &std::sync::Arc<dyn crate::services::ai_providers::AIProvider>,
    ) -> Result<(), MemoryError> {
        let now = now_secs();
        let db = self.db.clone();
        let ws = self.workspace_path.to_string_lossy().to_string();
        let fp = file_path.to_string();

        for item in &items {
            if item.entity_name.is_empty() || item.content.is_empty() { continue; }
            if item.content.chars().count() > 500 { continue; }
            if item.confidence < 0.3 { continue; }

            let similar = {
                let conn = db.lock().map_err(MemoryError::lock_error)?;
                find_similar_memories(&conn, item, &ws, "content", 3)
            };

            let action = llm_judge_action(provider, item, &similar).await;
            eprintln!("[memory] content judge: {:?} for entity={}", action, item.entity_name);

            let db_clone = db.clone();
            let ws_clone = ws.clone();
            let fp_clone = fp.clone();
            let item_clone = item.clone();
            match action {
                JudgeAction::Noop => {}
                JudgeAction::Add => {
                    tokio::task::spawn_blocking(move || {
                        let conn = db_clone.lock().map_err(MemoryError::lock_error)?;
                        insert_content_memory_item(&conn, &item_clone, &ws_clone, &fp_clone, now)?;
                        Ok::<(), MemoryError>(())
                    }).await.map_err(|e| MemoryError::LockError(e.to_string()))??;
                }
                JudgeAction::Update(old_id) => {
                    let ws_clone2 = ws_clone.clone();
                    tokio::task::spawn_blocking(move || {
                        let conn = db_clone.lock().map_err(MemoryError::lock_error)?;
                        conn.execute(
                            "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1 WHERE id = ?2",
                            params![now, old_id],
                        )?;
                        let new_id = insert_content_memory_item(&conn, &item_clone, &ws_clone, &fp_clone, now)?;
                        // P2: 记忆演化 — 级联检查相关记忆
                        let _ = cascade_supersede_related(&conn, &new_id, &item_clone, &ws_clone2, "content", now);
                        Ok::<(), MemoryError>(())
                    }).await.map_err(|e| MemoryError::LockError(e.to_string()))??;
                }
                JudgeAction::Delete(old_id) => {
                    tokio::task::spawn_blocking(move || {
                        let conn = db_clone.lock().map_err(MemoryError::lock_error)?;
                        conn.execute(
                            "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1 WHERE id = ?2",
                            params![now, old_id],
                        )?;
                        Ok::<(), MemoryError>(())
                    }).await.map_err(|e| MemoryError::LockError(e.to_string()))??;
                }
            }
        }
        Ok(())
    }

    /// P1: 写入一条 workspace_long_term 层记忆（tab 删除升格）
    pub async fn upsert_workspace_long_term_memory(
        &self,
        item: MemoryItemInput,
    ) -> Result<(), MemoryError> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO memory_items (
                    id, layer, scope_type, scope_id, entity_type, entity_name,
                    content, summary, tags, source_kind, source_ref,
                    confidence, freshness_status, readonly, created_at, updated_at
                 ) VALUES (?1, 'workspace_long_term', ?2, ?3, ?4, ?5, ?6, ?7, '', ?8, ?9, ?10, 'fresh', 1, ?11, ?11)",
                params![
                    id,
                    item.scope_type.as_str(), item.scope_id,
                    item.entity_type, item.entity_name,
                    item.content, item.summary,
                    item.source_kind.as_str(), item.source_ref,
                    item.confidence, now,
                ],
            )?;
            Ok::<(), MemoryError>(())
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    /// 记录注入日志（fire-and-forget，不要在热路径 await）
    pub async fn record_memory_usage(
        &self,
        memory_ids: &[String],
        tab_id: &str,
    ) -> Result<(), MemoryError> {
        let db = self.db.clone();
        let ids = memory_ids.to_vec();
        let tab_id = tab_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();
            for id in &ids {
                let _ = conn.execute(
                    "INSERT INTO memory_usage_logs (memory_id, tab_id, query_text, inject_position, injected_at)
                     VALUES (?1, ?2, '', '', ?3)",
                    params![id, tab_id, now],
                );
                let _ = conn.execute(
                    "UPDATE memory_items SET access_count = access_count + 1, last_accessed_at = ?1
                     WHERE id = ?2",
                    params![now, id],
                );
            }
            Ok::<(), MemoryError>(())
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    // ── P0：检索链 ──────────────────────────────────────────────────────────

    pub async fn search_memories(
        &self,
        params: SearchMemoriesParams,
    ) -> Result<MemorySearchResponse, MemoryError> {
        use tokio::time::{timeout, Duration};

        let result = timeout(
            Duration::from_millis(500),
            self.search_memories_inner(params),
        )
        .await;

        match result {
            Ok(inner) => inner,
            Err(_) => {
                eprintln!("memory search timed out after 500ms");
                Ok(MemorySearchResponse {
                    items: vec![],
                    total_found: 0,
                    scope_used: vec![],
                    timed_out: true,
                })
            }
        }
    }

    async fn search_memories_inner(
        &self,
        params: SearchMemoriesParams,
    ) -> Result<MemorySearchResponse, MemoryError> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || execute_fts_search(&db, &params))
            .await
            .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    /// 检索是否存在 content 层记忆的最近提取时间（用于写入节流）
    pub async fn get_last_content_extraction_time(
        &self,
        file_path: &str,
    ) -> Option<i64> {
        let db = self.db.clone();
        let file_path = file_path.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().ok()?;
            conn.query_row(
                "SELECT updated_at FROM memory_items WHERE source_ref = ?1 AND layer = 'content' ORDER BY updated_at DESC LIMIT 1",
                params![file_path],
                |row| row.get::<_, i64>(0),
            ).ok()
        })
        .await
        .ok()
        .flatten()
    }

    /// 文件删除/目录删除时：将对应 content 记忆标记为 expired。
    /// recursive=true 时，匹配 path 本身和其子路径。
    pub async fn expire_content_memories_for_path(
        &self,
        path: &str,
        recursive: bool,
    ) -> Result<u64, MemoryError> {
        let db = self.db.clone();
        let path_norm = path.replace('\\', "/").trim_end_matches('/').to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();
            let count = if recursive {
                let prefix = format!("{}/%", path_norm);
                conn.execute(
                    "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1
                     WHERE layer = 'content'
                       AND freshness_status NOT IN ('expired', 'superseded')
                       AND (source_ref = ?2 OR source_ref LIKE ?3)",
                    params![now, path_norm, prefix],
                )?
            } else {
                conn.execute(
                    "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1
                     WHERE layer = 'content'
                       AND freshness_status NOT IN ('expired', 'superseded')
                       AND source_ref = ?2",
                    params![now, path_norm],
                )?
            };
            Ok(count as u64)
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    /// 文件重命名/目录重命名时：将 content 记忆的 source_ref 重绑定到新路径。
    /// recursive=true 时，path 本身和其所有子路径都重写前缀。
    pub async fn rebind_content_memories_for_path(
        &self,
        old_path: &str,
        new_path: &str,
        recursive: bool,
    ) -> Result<u64, MemoryError> {
        let db = self.db.clone();
        let old_norm = old_path.replace('\\', "/").trim_end_matches('/').to_string();
        let new_norm = new_path.replace('\\', "/").trim_end_matches('/').to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();
            let count = if recursive {
                let prefix = format!("{}/%", old_norm);
                conn.execute(
                    "UPDATE memory_items
                     SET source_ref = CASE
                        WHEN source_ref = ?2 THEN ?3
                        ELSE ?3 || substr(source_ref, length(?2) + 1)
                     END,
                     updated_at = ?1
                     WHERE layer = 'content'
                       AND freshness_status IN ('fresh', 'stale')
                       AND (source_ref = ?2 OR source_ref LIKE ?4)",
                    params![now, old_norm, new_norm, prefix],
                )?
            } else {
                conn.execute(
                    "UPDATE memory_items
                     SET source_ref = ?1, updated_at = ?2
                     WHERE layer = 'content'
                       AND freshness_status IN ('fresh', 'stale')
                       AND source_ref = ?3",
                    params![new_norm, now, old_norm],
                )?
            };
            Ok(count as u64)
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }

    /// P2: 将指定 layer 的所有记忆标记为 expired（批量屏蔽）
    pub async fn expire_layer(&self, layer: &str) -> Result<u64, MemoryError> {
        let db = self.db.clone();
        let layer = layer.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();
            let count = conn.execute(
                "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1
                 WHERE layer = ?2 AND freshness_status NOT IN ('expired', 'superseded')",
                params![now, layer],
            )?;
            eprintln!("[memory] P2: batch expired layer={}, count={}", layer, count);
            Ok(count as u64)
        })
        .await
        .map_err(|e| MemoryError::AiCallFailed(e.to_string()))?
    }

    /// P2: 将指定记忆项标记为 expired（用户主动屏蔽）
    pub async fn expire_item(&self, memory_id: &str) -> Result<(), MemoryError> {
        let db = self.db.clone();
        let id = memory_id.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = now_secs();
            conn.execute(
                "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
            eprintln!("[memory] P2: user expired memory_id={}", id);
            Ok(())
        })
        .await
        .map_err(|e| MemoryError::AiCallFailed(e.to_string()))?
    }
}

// ── FTS5 检索实现 ──────────────────────────────────────────────────────────

fn execute_fts_search(
    db: &Arc<Mutex<Connection>>,
    params: &SearchMemoriesParams,
) -> Result<MemorySearchResponse, MemoryError> {
    let scope_ids = build_scope_ids(params);
    if scope_ids.is_empty() {
        return Ok(MemorySearchResponse::empty());
    }

    let conn = db.lock().map_err(MemoryError::lock_error)?;

    let fts_query = sanitize_fts_query(&params.query);
    let limit = params.limit.unwrap_or(10).min(50);
    let entity_types: Vec<String> = params
        .entity_types
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let layer_filter: Vec<&str> = match &params.scope {
        MemorySearchScope::Tab => vec!["tab"],
        MemorySearchScope::Content => vec!["content"],
        MemorySearchScope::WorkspaceLongTerm => vec!["workspace_long_term"],
        MemorySearchScope::User => return Ok(MemorySearchResponse::empty()),
        MemorySearchScope::All => vec!["tab", "content", "workspace_long_term"],
    };

    let scope_used: Vec<String> = scope_ids.iter().map(|s| s.clone()).collect();

    // If query is empty, fallback to recent memories
    if fts_query.is_empty() {
        return fetch_recent_memories(
            &conn,
            &scope_ids,
            &layer_filter,
            &entity_types,
            limit,
            &scope_used,
        );
    }

    let scope_placeholders: String = scope_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2))
        .collect::<Vec<_>>()
        .join(", ");

    let layer_placeholders: String = layer_filter
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2 + scope_ids.len()))
        .collect::<Vec<_>>()
        .join(", ");

    let entity_placeholders: Option<String> = if entity_types.is_empty() {
        None
    } else {
        Some(
            entity_types
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 2 + scope_ids.len() + layer_filter.len()))
                .collect::<Vec<_>>()
                .join(", "),
        )
    };

    let limit_idx = 2 + scope_ids.len() + layer_filter.len() + entity_types.len();
    let entity_filter_sql = if let Some(ph) = &entity_placeholders {
        format!(" AND m.entity_type IN ({})", ph)
    } else {
        String::new()
    };

    let sql = format!(
        r#"
        SELECT
            m.id, m.layer, m.scope_type, m.scope_id,
            m.entity_type, m.entity_name, m.content, m.summary,
            m.tags, m.source_kind, m.source_ref, m.confidence,
            m.freshness_status, m.readonly, m.access_count,
            m.last_accessed_at, m.created_at, m.updated_at,
            memory_items_fts.rank AS fts_rank
        FROM memory_items_fts
        JOIN memory_items m ON memory_items_fts.rowid = m.rowid
        WHERE memory_items_fts MATCH ?1
          AND m.scope_id IN ({scope_ph})
          AND m.layer IN ({layer_ph})
          {entity_filter}
          AND m.freshness_status IN ('fresh', 'stale')
        ORDER BY
            CASE m.layer WHEN 'tab' THEN 0 WHEN 'content' THEN 1 WHEN 'workspace_long_term' THEN 2 ELSE 3 END ASC,
            (CASE m.freshness_status WHEN 'fresh' THEN 1.0 ELSE 0.5 END)
                * (1.0 + 0.1 * MIN(m.access_count, 10))
                * m.confidence
                * (-memory_items_fts.rank) DESC,
            m.updated_at DESC
        LIMIT ?{limit_ph}
        "#,
        scope_ph = scope_placeholders,
        layer_ph = layer_placeholders,
        entity_filter = entity_filter_sql,
        limit_ph = limit_idx,
    );

    let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    param_values.push(Box::new(fts_query.clone()));
    for sid in &scope_ids {
        param_values.push(Box::new(sid.clone()));
    }
    for l in &layer_filter {
        param_values.push(Box::new(l.to_string()));
    }
    for et in &entity_types {
        param_values.push(Box::new(et.clone()));
    }
    param_values.push(Box::new(limit as i64));

    let params_refs: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("FTS5 prepare failed, fallback to recent: {:?}", e);
            return fetch_recent_memories(
                &conn,
                &scope_ids,
                &layer_filter,
                &entity_types,
                limit,
                &scope_used,
            );
        }
    };

    let rows: Vec<(MemoryItem, f64)> = stmt
        .query_map(params_refs.as_slice(), |row| {
            let rank: f64 = row.get(18).unwrap_or(0.0);
            let item = map_row_to_memory_item(row)?;
            Ok((item, rank))
        })
        .map_err(MemoryError::DbError)?
        .filter_map(|r| r.ok())
        .collect();

    let max_rank = rows
        .iter()
        .map(|(_, r)| r.abs())
        .fold(f64::NEG_INFINITY, f64::max);

    // P1-3.3: 懒判定 stale（7天未更新的 fresh 记忆降权为 stale）
    let now = now_secs();
    let seven_days = 7 * 24 * 3600i64;
    let stale_ids: Vec<String> = rows
        .iter()
        .filter(|(item, _)| {
            item.freshness_status == "fresh" && now - item.updated_at > seven_days
        })
        .map(|(item, _)| item.id.clone())
        .collect();
    if !stale_ids.is_empty() {
        for sid in &stale_ids {
            let _ = conn.execute(
                "UPDATE memory_items SET freshness_status = 'stale', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, sid],
            );
        }
    }

    let items: Vec<MemorySearchResult> = rows
        .into_iter()
        .map(|(mut item, rank)| {
            // 同步更新返回对象的 freshness_status
            if stale_ids.contains(&item.id) {
                item.freshness_status = "stale".to_string();
            }
            let relevance_score = if max_rank > 0.0 {
                rank.abs() / max_rank
            } else {
                0.5
            };
            let source_label = format_source_label(&item);
            MemorySearchResult { item, relevance_score, source_label }
        })
        .collect();

    let total = items.len();
    Ok(MemorySearchResponse {
        items,
        total_found: total,
        scope_used,
        timed_out: false,
    })
}

fn fetch_recent_memories(
    conn: &Connection,
    scope_ids: &[String],
    layer_filter: &[&str],
    entity_types: &[String],
    limit: usize,
    scope_used: &[String],
) -> Result<MemorySearchResponse, MemoryError> {
    if scope_ids.is_empty() {
        return Ok(MemorySearchResponse::empty());
    }

    let scope_ph: String = scope_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");
    let layer_ph: String = layer_filter
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1 + scope_ids.len()))
        .collect::<Vec<_>>()
        .join(", ");
    let entity_ph: Option<String> = if entity_types.is_empty() {
        None
    } else {
        Some(
            entity_types
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 1 + scope_ids.len() + layer_filter.len()))
                .collect::<Vec<_>>()
                .join(", "),
        )
    };
    let entity_filter_sql = if let Some(ph) = &entity_ph {
        format!(" AND entity_type IN ({})", ph)
    } else {
        String::new()
    };
    let limit_idx = 1 + scope_ids.len() + layer_filter.len() + entity_types.len();

    let sql = format!(
        "SELECT id, layer, scope_type, scope_id, entity_type, entity_name, content, summary,
                tags, source_kind, source_ref, confidence, freshness_status, readonly,
                access_count, last_accessed_at, created_at, updated_at
         FROM memory_items
         WHERE scope_id IN ({scope_ph}) AND layer IN ({layer_ph})
           {entity_filter}
           AND freshness_status IN ('fresh', 'stale')
         ORDER BY updated_at DESC
         LIMIT ?{limit_ph}",
        scope_ph = scope_ph,
        layer_ph = layer_ph,
        entity_filter = entity_filter_sql,
        limit_ph = limit_idx,
    );

    let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    for sid in scope_ids {
        param_values.push(Box::new(sid.clone()));
    }
    for l in layer_filter {
        param_values.push(Box::new(l.to_string()));
    }
    for et in entity_types {
        param_values.push(Box::new(et.clone()));
    }
    param_values.push(Box::new(limit as i64));
    let params_refs: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(MemoryError::DbError)?;
    let raw_items: Vec<MemoryItem> = stmt
        .query_map(params_refs.as_slice(), |row| {
            map_row_to_memory_item_no_rank(row)
        })
        .map_err(MemoryError::DbError)?
        .filter_map(|r| r.ok())
        .collect();

    // P1-3.3: 懒判定 stale
    let now = now_secs();
    let seven_days = 7 * 24 * 3600i64;
    let stale_ids: Vec<String> = raw_items
        .iter()
        .filter(|item| item.freshness_status == "fresh" && now - item.updated_at > seven_days)
        .map(|item| item.id.clone())
        .collect();
    if !stale_ids.is_empty() {
        for sid in &stale_ids {
            let _ = conn.execute(
                "UPDATE memory_items SET freshness_status = 'stale', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, sid],
            );
        }
    }

    let items: Vec<MemorySearchResult> = raw_items
        .into_iter()
        .map(|mut item| {
            if stale_ids.contains(&item.id) {
                item.freshness_status = "stale".to_string();
            }
            let source_label = format_source_label(&item);
            MemorySearchResult { item, relevance_score: 0.5, source_label }
        })
        .collect();

    let total = items.len();
    Ok(MemorySearchResponse {
        items,
        total_found: total,
        scope_used: scope_used.to_vec(),
        timed_out: false,
    })
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

fn insert_memory_item(
    conn: &Connection,
    item: &MemoryItemInput,
    layer: &str,
    scope_type: &str,
    scope_id: &str,
    now: i64,
) -> Result<String, MemoryError> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags_str = item.tags.join(" ");
    conn.execute(
        "INSERT INTO memory_items (
            id, layer, scope_type, scope_id, entity_type, entity_name,
            content, summary, tags, source_kind, source_ref,
            confidence, freshness_status, readonly, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'fresh', 1, ?13, ?13)",
        params![
            id, layer, scope_type, scope_id,
            item.entity_type, item.entity_name,
            item.content, item.summary, tags_str,
            item.source_kind.as_str(), item.source_ref,
            item.confidence, now,
        ],
    )?;
    Ok(id)
}

fn insert_content_memory_item(
    conn: &Connection,
    item: &MemoryItemInput,
    workspace_path: &str,
    file_path: &str,
    now: i64,
) -> Result<String, MemoryError> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags_str = item.tags.join(" ");
    conn.execute(
        "INSERT INTO memory_items (
            id, layer, scope_type, scope_id, entity_type, entity_name,
            content, summary, tags, source_kind, source_ref,
            confidence, freshness_status, readonly, created_at, updated_at
         ) VALUES (?1, 'content', 'workspace', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'fresh', 1, ?11, ?11)",
        params![
            id, workspace_path,
            item.entity_type, item.entity_name,
            item.content, item.summary, tags_str,
            item.source_kind.as_str(), file_path,
            item.confidence, now,
        ],
    )?;
    Ok(id)
}

/// P2: 记忆演化 — UPDATE 后级联检查相关记忆，将旧的相关条目标记为 superseded
///
/// 逻辑：用更新后的新条目作为 candidate，在同 scope+layer 范围内检索相似记忆（top-3），
/// 排除新条目自身，将剩余 fresh/stale 的高相似条目标记为 superseded。
fn cascade_supersede_related(
    conn: &Connection,
    new_item_id: &str,
    candidate: &MemoryItemInput,
    scope_id: &str,
    layer: &str,
    now: i64,
) -> Result<u64, MemoryError> {
    let similar = find_similar_memories(conn, candidate, scope_id, layer, 5);
    let mut count = 0u64;
    for sim in &similar {
        if sim.id == new_item_id { continue; } // 跳过刚写入的新条目
        if sim.freshness_status == "expired" || sim.freshness_status == "superseded" { continue; }
        // 仅 supersede 置信度 >= 0.5 的相关条目（避免误伤低相关记忆）
        if sim.confidence < 0.5 { continue; }
        conn.execute(
            "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1 WHERE id = ?2",
            params![now, sim.id],
        )?;
        count += 1;
        eprintln!("[memory] evolution: cascade superseded id={} (related to updated {})", sim.id, new_item_id);
    }
    Ok(count)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn build_scope_ids(params: &SearchMemoriesParams) -> Vec<String> {
    let mut ids = Vec::new();
    match &params.scope {
        MemorySearchScope::Tab => {
            if let Some(ref t) = params.tab_id { ids.push(t.clone()); }
        }
        MemorySearchScope::Content | MemorySearchScope::WorkspaceLongTerm => {
            if let Some(ref w) = params.workspace_path { ids.push(w.clone()); }
        }
        MemorySearchScope::User => {}
        MemorySearchScope::All => {
            if let Some(ref t) = params.tab_id { ids.push(t.clone()); }
            if let Some(ref w) = params.workspace_path { ids.push(w.clone()); }
        }
    }
    ids
}

fn sanitize_fts_query(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    let terms: Vec<&str> = cleaned
        .split_whitespace()
        .filter(|t| t.chars().count() >= 2)
        .take(10)
        .collect();

    if terms.is_empty() {
        return String::new();
    }
    terms.join(" OR ")
}

fn map_row_to_memory_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryItem> {
    Ok(MemoryItem {
        id: row.get(0)?,
        layer: row.get(1)?,
        scope_type: row.get(2)?,
        scope_id: row.get(3)?,
        entity_type: row.get(4)?,
        entity_name: row.get(5)?,
        content: row.get(6)?,
        summary: row.get(7)?,
        tags: row.get(8)?,
        source_kind: row.get(9)?,
        source_ref: row.get(10)?,
        confidence: row.get(11)?,
        freshness_status: row.get(12)?,
        readonly: row.get::<_, i64>(13)? != 0,
        access_count: row.get(14)?,
        last_accessed_at: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn map_row_to_memory_item_no_rank(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryItem> {
    // Same column order as SELECT without rank column
    map_row_to_memory_item(row)
}

fn format_source_label(item: &MemoryItem) -> String {
    match item.layer.as_str() {
        "tab" => "[标签记忆]".to_string(),
        "content" => {
            let file = std::path::Path::new(&item.source_ref)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&item.source_ref);
            format!("[文档记忆: {}]", file)
        }
        "workspace_long_term" => "[工作区记忆]".to_string(),
        _ => "[记忆]".to_string(),
    }
}

// ── P1 LLM-as-judge 写入分类 ─────────────────────────────────────────────────

/// 写入操作分类
#[derive(Debug, PartialEq)]
pub enum JudgeAction {
    Add,
    Update(String), // 旧记忆 ID（UPDATE 时用于标记 superseded）
    Delete(String), // 旧记忆 ID
    Noop,
}

/// 在同 scope_id + layer 范围内检索相似记忆（基于 entity_name FTS，top_k=3）
pub fn find_similar_memories(
    conn: &Connection,
    candidate: &MemoryItemInput,
    scope_id: &str,
    layer: &str,
    top_k: usize,
) -> Vec<MemoryItem> {
    let query = sanitize_fts_query(&candidate.entity_name);
    if query.is_empty() {
        return vec![];
    }
    let sql = "SELECT m.id, m.layer, m.scope_type, m.scope_id, m.entity_type, m.entity_name,
                      m.content, m.summary, m.tags, m.source_kind, m.source_ref, m.confidence,
                      m.freshness_status, m.readonly, m.access_count, m.last_accessed_at,
                      m.created_at, m.updated_at
               FROM memory_items m
               WHERE m.scope_id = ?1 AND m.layer = ?2
                 AND m.freshness_status IN ('fresh', 'stale')
                 AND (m.entity_name LIKE ?3 OR m.content LIKE ?3)
               LIMIT ?4";

    let like_pat = format!("%{}%", candidate.entity_name.chars().take(20).collect::<String>());
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    stmt.query_map(
        rusqlite::params![scope_id, layer, like_pat, top_k as i64],
        |row| map_row_to_memory_item_no_rank(row),
    )
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

/// 构造 LLM-as-judge prompt（A-AST-M-S-03 §三.3）
fn build_judge_prompt(candidate: &MemoryItemInput, similar: &[MemoryItem]) -> String {
    let similar_text = if similar.is_empty() {
        "（无相似记忆）".to_string()
    } else {
        similar
            .iter()
            .map(|m| format!("- [{}] {}: {}", m.id[..8.min(m.id.len())].to_string(), m.entity_name, m.content))
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        r#"你是 Binder 记忆库的写入仲裁器。请判断候选记忆是否应写入。

## 候选记忆
- entity_name: {}
- entity_type: {}
- content: {}

## 现有相似记忆
{}

## 判断规则
- ADD：候选记忆与现有记忆无实质重复，应新增
- UPDATE：候选记忆与某条现有记忆实质等价但有更新，应更新（输出被替换的记忆 ID）
- DELETE：候选记忆表明某条现有记忆已过期/错误，应删除（输出需删除的记忆 ID）
- NOOP：候选记忆已被现有记忆完全覆盖，无需写入

## 输出格式（仅输出 JSON，不要其他文本）
{{"action": "ADD"|"UPDATE"|"DELETE"|"NOOP", "target_id": "相关记忆ID或null"}}"#,
        candidate.entity_name,
        candidate.entity_type,
        candidate.content,
        similar_text,
    )
}

/// 调用 LLM 判定写入动作
pub async fn llm_judge_action(
    provider: &std::sync::Arc<dyn crate::services::ai_providers::AIProvider>,
    candidate: &MemoryItemInput,
    similar: &[MemoryItem],
) -> JudgeAction {
    let prompt = build_judge_prompt(candidate, similar);
    let response = match provider.chat_simple(&prompt, 100).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[memory] llm_judge_action: AI call failed: {:?}, defaulting to ADD", e);
            return JudgeAction::Add;
        }
    };

    // 解析 JSON
    let json_start = response.find('{').unwrap_or(0);
    let json_end = response.rfind('}').map(|i| i + 1).unwrap_or(response.len());
    let json_str = &response[json_start..json_end.max(json_start)];

    let v: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => {
            eprintln!("[memory] llm_judge_action: parse failed, defaulting to ADD. response={}", response);
            return JudgeAction::Add;
        }
    };

    let action = v["action"].as_str().unwrap_or("ADD");
    let target_id = v["target_id"].as_str().unwrap_or("").to_string();

    match action {
        "NOOP" => JudgeAction::Noop,
        "UPDATE" if !target_id.is_empty() && target_id != "null" => JudgeAction::Update(target_id),
        "DELETE" if !target_id.is_empty() && target_id != "null" => JudgeAction::Delete(target_id),
        _ => JudgeAction::Add,
    }
}

// ── AI 提炼任务 ───────────────────────────────────────────────────────────────

/// P0 标签级记忆提炼 prompt
pub fn build_tab_memory_extraction_prompt(history_text: &str) -> String {
    format!(
        r#"你是 Binder 的记忆提炼助手。请从以下对话历史中提炼出值得记忆的关键信息。

## 对话历史（最近轮次）
{}

## 提炼要求
请提炼以下类型的信息（JSON 数组格式，每条为一个对象）：
1. 用户表达的偏好（风格、格式、语气约束）
2. 用户明确拒绝或不希望的内容
3. 对话中提及的关键实体（人名、项目名、文档名）
4. 本次对话的主题摘要（一句话）

## 输出格式
```json
[
  {{
    "entity_type": "preference|constraint|entity_person|entity_concept|topic_summary",
    "entity_name": "简短实体名或摘要标题",
    "content": "完整内容描述",
    "summary": "一句话摘要（15字以内）",
    "tags": "空格分隔的关键词",
    "confidence": 0.8
  }}
]
```
仅输出 JSON 数组，不要其他文本。如无值得记忆的内容，输出空数组 `[]`。"#,
        history_text
    )
}

/// P0 项目内容记忆提取 prompt
pub fn build_content_memory_extraction_prompt(file_path: &str, content_excerpt: &str) -> String {
    format!(
        r#"你是 Binder 的文档分析助手。请从以下文档内容中提取关键信息，生成项目内容记忆。

## 文档路径
{}

## 文档内容（前 3000 字符）
{}

## 提取要求
1. 命名实体（人物、地点、概念、术语、组织）
2. 文档结构摘要（如有章节则提取大纲）
3. 项目特定定义（专有名词及其定义）

## 输出格式
```json
[
  {{
    "entity_type": "entity_person|entity_place|entity_concept|outline|entity_object",
    "entity_name": "实体名",
    "content": "详细描述",
    "summary": "一句话摘要",
    "tags": "关键词",
    "confidence": 0.8
  }}
]
```
仅输出 JSON，如无可提取内容则输出 `[]`。"#,
        file_path, content_excerpt
    )
}

/// 解析 AI 输出的 JSON 候选项
pub fn parse_memory_candidates(
    response_text: &str,
    layer: MemoryLayer,
    scope_type: MemoryScopeType,
    scope_id: &str,
    source_kind: MemorySourceKind,
    source_ref: &str,
) -> Result<Vec<MemoryItemInput>, serde_json::Error> {
    #[derive(Deserialize)]
    struct RawCandidate {
        entity_type: String,
        entity_name: String,
        content: String,
        summary: Option<String>,
        tags: Option<String>,
        confidence: Option<f64>,
    }

    // 提取 JSON 数组部分
    let json_start = response_text.find('[').unwrap_or(0);
    let json_end = response_text.rfind(']').map(|i| i + 1).unwrap_or(response_text.len());
    let json_str = if json_start < json_end {
        &response_text[json_start..json_end]
    } else {
        "[]"
    };

    let raw: Vec<RawCandidate> = serde_json::from_str(json_str)?;

    Ok(raw
        .into_iter()
        .filter(|c| !c.entity_name.is_empty() && !c.content.is_empty())
        .map(|c| MemoryItemInput {
            layer: layer.clone(),
            scope_type: scope_type.clone(),
            scope_id: scope_id.to_string(),
            entity_type: c.entity_type,
            entity_name: c.entity_name,
            content: c.content,
            summary: c.summary.unwrap_or_default(),
            tags: c
                .tags
                .unwrap_or_default()
                .split_whitespace()
                .map(String::from)
                .collect(),
            source_kind: source_kind.clone(),
            source_ref: source_ref.to_string(),
            confidence: c.confidence.unwrap_or(0.8),
        })
        .collect())
}

/// 将检索结果格式化为 [记忆库信息]...[/记忆库信息] 注入字符串（S-02/S-03）
/// 超过 5 条时加锚定指令（S-06）
/// Token budget: augmentation layer uses at most ~10% of a typical 4096-token context.
/// Rough heuristic: 1 token ≈ 4 chars, 10% of 4096 ≈ 400 tokens ≈ 1600 chars.
/// We reserve a slightly larger budget (2000 chars) to allow for varied model sizes.
const MEMORY_INJECT_BUDGET_CHARS: usize = 2000;

/// Trim formatted memory block to fit within the token budget.
/// If the block is too long, removes items from the end (lowest priority) until it fits.
fn trim_memory_to_budget(lines: &mut Vec<String>, header: Option<&str>) {
    // Calculate total size including wrapper tags
    let wrapper_overhead = "[记忆库信息]\n\n[/记忆库信息]".len();
    let header_len = header.map(|h| h.len() + 1).unwrap_or(0);

    loop {
        let current_len: usize = lines.iter().map(|l| l.len() + 1).sum::<usize>()
            + wrapper_overhead + header_len;
        if current_len <= MEMORY_INJECT_BUDGET_CHARS || lines.is_empty() {
            break;
        }
        lines.pop(); // remove lowest-priority item (last in list)
    }
}

pub fn format_memory_for_injection(items: &[MemorySearchResult]) -> String {
    if items.is_empty() {
        return String::new();
    }

    // S-06: 超过 5 条加锚定说明
    let anchor_header = if items.len() > 5 {
        Some("以下内容来自历史对话或文档分析的记忆提炼，供参考，不代表当前现场事实，请结合实际情况判断。")
    } else {
        None
    };

    let mut lines: Vec<String> = Vec::with_capacity(items.len());
    for r in items {
        let label = format_source_label_with_file(&r.item); // S-05
        let body = if r.item.summary.is_empty() { &r.item.content } else { &r.item.summary };
        let stale_mark = if r.item.freshness_status == "stale" { " [旧]" } else { "" };
        lines.push(format!("{}{} {}: {}", label, stale_mark, r.item.entity_name, body));
    }

    // Token budget trimming: drop lowest-priority items if block is too large
    trim_memory_to_budget(&mut lines, anchor_header);

    if lines.is_empty() {
        return String::new();
    }

    let body = if let Some(header) = anchor_header {
        format!("{}\n{}", header, lines.join("\n"))
    } else {
        lines.join("\n")
    };

    format!("[记忆库信息]\n{}\n[/记忆库信息]", body)
}

/// S-05：项目内容记忆带文件名标注；标签记忆带 [标签记忆] 标注
fn format_source_label_with_file(item: &MemoryItem) -> String {
    match item.layer.as_str() {
        "tab" => "[标签记忆]".to_string(),
        "content" => {
            let file = std::path::Path::new(&item.source_ref)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&item.source_ref);
            format!("[项目内容 · {}]", file)
        }
        "workspace_long_term" => "[工作区记忆]".to_string(),
        _ => "[记忆]".to_string(),
    }
}

/// 标签级记忆提炼（后台异步任务），接受 AIProvider 作为参数
/// 从对话历史提炼记忆并写入 memory_items（layer=tab）
pub async fn memory_generation_task_tab(
    provider: std::sync::Arc<dyn crate::services::ai_providers::AIProvider>,
    workspace_path: std::path::PathBuf,
    tab_id: String,
    messages: Vec<crate::services::ai_providers::ChatMessage>,
) {
    let cfg = ExtractionConfig::load();
    if !cfg.enabled || !cfg.write_enabled {
        eprintln!("[memory] tab extraction skipped: disabled by ExtractionConfig");
        return;
    }
    let svc = match MemoryService::new(&workspace_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[memory] tab extraction: MemoryService init failed: {}", e);
            return;
        }
    };

    // 取最近 20 轮 user/assistant 消息，格式化为对话历史文本
    let history_pairs: Vec<String> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .rev()
        .take(40) // 20 轮 = 40 条
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|m| {
            let role = if m.role == "user" { "用户" } else { "助手" };
            let content: String = m.content.as_deref().unwrap_or("").chars().take(500).collect();
            format!("{}: {}", role, content)
        })
        .collect();

    if history_pairs.is_empty() {
        return;
    }

    let history_text = history_pairs.join("\n");
    let prompt = build_tab_memory_extraction_prompt(&history_text);

    let ai_output = match provider.chat_with_model(&prompt, 500, &cfg.model).await {
        Ok(text) => text,
        Err(e) => {
            eprintln!("[memory] tab extraction: AI call failed: {:?}", e);
            return;
        }
    };

    let candidates = match parse_memory_candidates(
        &ai_output,
        MemoryLayer::Tab,
        MemoryScopeType::Tab,
        &tab_id,
        MemorySourceKind::ConversationSummary,
        &tab_id,
    ) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[memory] tab extraction: parse failed: {:?}", e);
            return;
        }
    };

    if candidates.is_empty() {
        return;
    }

    // P1: 使用 LLM-as-judge 写入（ADD/UPDATE/DELETE/NOOP 四分类）
    if let Err(e) = svc.upsert_tab_memories_with_judge(&tab_id, candidates, &provider).await {
        eprintln!("[memory] tab extraction: upsert_with_judge failed: {:?}", e);
    } else {
        eprintln!("[memory] tab extraction: done for tab={}", tab_id);
    }
}

/// 项目内容记忆提炼（后台异步任务）
pub async fn memory_generation_task_content(
    provider: std::sync::Arc<dyn crate::services::ai_providers::AIProvider>,
    workspace_path: std::path::PathBuf,
    file_path: String,
    content_html: String,
) {
    let cfg = ExtractionConfig::load();
    if !cfg.enabled || !cfg.write_enabled {
        eprintln!("[memory] content extraction skipped: disabled by ExtractionConfig");
        return;
    }

    let svc = match MemoryService::new(&workspace_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[memory] content extraction: MemoryService init failed: {}", e);
            return;
        }
    };

    let plain = strip_html_tags(&content_html);
    // S-04: filter sensitive content before passing to AI
    let filtered = filter_sensitive_content(&plain);
    let excerpt: String = filtered.chars().take(3000).collect();
    if excerpt.trim().is_empty() {
        return;
    }

    let prompt = build_content_memory_extraction_prompt(&file_path, &excerpt);

    let ai_output = match provider.chat_with_model(&prompt, 500, &cfg.model).await {
        Ok(text) => text,
        Err(e) => {
            eprintln!("[memory] content extraction: AI call failed: {:?}", e);
            return;
        }
    };

    let candidates = match parse_memory_candidates(
        &ai_output,
        MemoryLayer::Content,
        MemoryScopeType::Workspace,
        &workspace_path.to_string_lossy(),
        MemorySourceKind::DocumentExtract,
        &file_path,
    ) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[memory] content extraction: parse failed: {:?}", e);
            return;
        }
    };

    if candidates.is_empty() {
        return;
    }

    // P1: 使用 LLM-as-judge 写入
    if let Err(e) = svc.upsert_content_memories_with_judge(&file_path, candidates, &provider).await {
        eprintln!("[memory] content extraction: upsert_with_judge failed: {:?}", e);
    } else {
        eprintln!("[memory] content extraction: done for file={}", file_path);
    }
}

/// P1: 启动时清理过期记忆（30天+ stale/expired 物理删除，superseded 7天后删除）
pub async fn startup_maintenance(workspace_path: &std::path::Path) {
    let svc = match MemoryService::new(workspace_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[memory] startup_maintenance: init failed: {}", e);
            return;
        }
    };
    let db = svc.db.clone();
    let _ = tokio::task::spawn_blocking(move || {
        let conn = match db.lock() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[memory] startup_maintenance: lock failed: {}", e);
                return;
            }
        };
        let now = now_secs();
        let thirty_days = 30 * 24 * 3600i64;
        let seven_days = 7 * 24 * 3600i64;

        // 删除 30 天+ 的 stale/expired 记忆
        let n1 = conn.execute(
            "DELETE FROM memory_items WHERE freshness_status IN ('stale', 'expired') AND updated_at < ?1",
            rusqlite::params![now - thirty_days],
        ).unwrap_or(0);

        // 删除 7 天+ 的 superseded 记忆
        let n2 = conn.execute(
            "DELETE FROM memory_items WHERE freshness_status = 'superseded' AND updated_at < ?1",
            rusqlite::params![now - seven_days],
        ).unwrap_or(0);

        eprintln!("[memory] startup_maintenance: deleted {} stale/expired + {} superseded", n1, n2);
    }).await;
}

/// P1: Tab 删除时的受限升格逻辑
/// 满足三条件（轮次>=5, 有工作区, 置信度>=0.6）时升格一条 workspace_long_term 记忆
pub async fn on_tab_deleted(
    provider: Option<std::sync::Arc<dyn crate::services::ai_providers::AIProvider>>,
    workspace_path: std::path::PathBuf,
    tab_id: String,
    user_message_count: usize,
) {
    let svc = match MemoryService::new(&workspace_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[memory] on_tab_deleted: init failed: {}", e);
            return;
        }
    };

    // 升格条件：轮次 >= 5 且有可用 provider
    if user_message_count >= 5 {
        let Some(provider) = provider else {
            eprintln!("[memory] on_tab_deleted: provider unavailable, skip promotion for tab={}", tab_id);
            // 仅跳过 AI 升格，后续基础治理照常执行
            let db = svc.db.clone();
            let tab_id_clone = tab_id.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let conn = match db.lock() {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let now = now_secs();
                let _ = conn.execute(
                    "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1
                     WHERE scope_type = 'tab' AND scope_id = ?2",
                    rusqlite::params![now, tab_id_clone],
                );
                eprintln!("[memory] on_tab_deleted: expired all tab memories for tab={}", tab_id_clone);
            }).await;
            return;
        };
        // 生成一条 workspace_long_term 摘要
        let prompt = format!(
            "请为一次 Binder 对话生成一句话摘要（25字以内），该对话共{}轮用户发言。\
             仅输出摘要文本，不要其他内容。",
            user_message_count
        );
        if let Ok(summary) = provider.chat_simple(&prompt, 100).await {
            let summary = summary.trim().to_string();
            if !summary.is_empty() {
                let item = MemoryItemInput {
                    layer: MemoryLayer::WorkspaceLongTerm,
                    scope_type: MemoryScopeType::Workspace,
                    scope_id: workspace_path.to_string_lossy().to_string(),
                    entity_type: "topic_summary".to_string(),
                    entity_name: format!("tab:{}", &tab_id[..8.min(tab_id.len())]),
                    content: summary.clone(),
                    summary: summary.chars().take(50).collect(),
                    tags: vec![],
                    source_kind: MemorySourceKind::TabDeletionSummary,
                    source_ref: tab_id.clone(),
                    confidence: 0.7,
                };
                let _ = svc.upsert_workspace_long_term_memory(item).await;
            }
        }
    }

    // 无论是否升格，将 tab 所有记忆标记为 expired
    let db = svc.db.clone();
    let tab_id_clone = tab_id.clone();
    let _ = tokio::task::spawn_blocking(move || {
        let conn = match db.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        let now = now_secs();
        let _ = conn.execute(
            "UPDATE memory_items SET freshness_status = 'expired', updated_at = ?1
             WHERE scope_type = 'tab' AND scope_id = ?2",
            rusqlite::params![now, tab_id_clone],
        );
        eprintln!("[memory] on_tab_deleted: expired all tab memories for tab={}", tab_id_clone);
    }).await;
}

// ── S-04 内容安全过滤 ─────────────────────────────────────────────────────────

/// S-04: 过滤敏感内容，防止 prompt injection 和 API 密钥泄露进入记忆库
///
/// 过滤规则：
/// 1. 逐行检查，移除包含 API key 模式的行（sk-xxx, Bearer, Authorization）
/// 2. 移除疑似 prompt injection 指令的行
/// 3. 保留其他正常内容行
/// 返回过滤后的文本；如果超过 80% 的行被过滤，返回空字符串（文档可能是恶意内容）
pub fn filter_sensitive_content(text: &str) -> String {
    // API key / secret patterns (case-insensitive)
    let api_key_patterns: &[&str] = &[
        "sk-",           // OpenAI / Anthropic API keys
        "api_key",
        "apikey",
        "api-key",
        "authorization:",
        "bearer ",
        "access_token",
        "secret_key",
        "private_key",
        "-----begin ",   // PEM certificates / private keys
    ];

    // Prompt injection patterns (lowercase check)
    let injection_patterns: &[&str] = &[
        "ignore previous instructions",
        "ignore all previous",
        "disregard previous",
        "forget everything",
        "you are now",
        "new instructions:",
        "system prompt:",
        "act as",
        "jailbreak",
        "[system]",
        "<<sys>>",
        "<|im_start|>",
        "###instruction",
    ];

    let lines: Vec<&str> = text.lines().collect();
    let total = lines.len();
    if total == 0 {
        return String::new();
    }

    let mut kept: Vec<&str> = Vec::with_capacity(total);
    let mut removed = 0usize;

    for line in &lines {
        let lower = line.to_lowercase();

        let is_sensitive = api_key_patterns.iter().any(|p| lower.contains(p))
            || injection_patterns.iter().any(|p| lower.contains(p));

        if is_sensitive {
            removed += 1;
        } else {
            kept.push(line);
        }
    }

    // If >80% of lines are suspicious, the whole document may be adversarial — reject entirely
    if total > 5 && removed * 100 / total > 80 {
        eprintln!("[memory] S-04: document rejected — {}% of lines flagged as sensitive", removed * 100 / total);
        return String::new();
    }

    kept.join("\n")
}

/// HTML 去标签（用于内容记忆提取前的纯文本化）
pub fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut inside_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(ch),
            _ => {}
        }
    }
    result
}

// ── P2: user_memory.db ───────────────────────────────────────────────────────

/// P2: 用户级记忆库路径（{data_dir}/binder/user_memory.db）
pub fn user_memory_db_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("binder").join("user_memory.db"))
}

/// P2: user_id 文件路径（{data_dir}/binder/user_id）
fn user_id_file_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("binder").join("user_id"))
}

/// P2: 获取或创建 user_id（UUID，持久化至文件）
pub fn get_or_create_user_id() -> Result<String, String> {
    let path = user_id_file_path().ok_or_else(|| "无法获取 data_dir".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if path.exists() {
        let id = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let trimmed = id.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }
    // 生成新 UUID
    let new_id = uuid_v4();
    std::fs::write(&path, &new_id).map_err(|e| e.to_string())?;
    Ok(new_id)
}

/// 简单 UUID v4 生成（无外部依赖，使用 getrandom）
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    // 使用系统时间 + 伪随机混合（适用于 user_id 生成，不需加密强随机）
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    // 简单实现：用 pid + time 混合（P2 够用）
    let pid = std::process::id();
    let a = t.wrapping_mul(2654435761).wrapping_add(pid);
    let b = a.wrapping_mul(0x9e3779b9).wrapping_add(t);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:08x}{:04x}",
        a,
        (b >> 16) & 0xffff,
        b & 0x0fff,
        0x8000 | ((a >> 4) & 0x3fff),
        b.wrapping_mul(0x6c62272e),
        (a >> 12) & 0xffff,
    )
}

/// P2: DDL for user_memory.db（与 workspace.db memory_items 表结构相同）
const USER_MEMORY_DDL: &str = "
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS memory_items (
    id TEXT PRIMARY KEY,
    layer TEXT NOT NULL DEFAULT 'user',
    scope_type TEXT NOT NULL DEFAULT 'user',
    scope_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    source_kind TEXT NOT NULL DEFAULT 'user_preference',
    source_ref TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0.8,
    freshness_status TEXT NOT NULL DEFAULT 'fresh',
    readonly INTEGER NOT NULL DEFAULT 0,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
    entity_name,
    content,
    summary,
    tags,
    content='memory_items',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memory_items_fts_insert AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_items_fts(rowid, entity_name, content, summary, tags)
    VALUES (new.rowid, new.entity_name, new.content, new.summary, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memory_items_fts_update AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_items_fts(memory_items_fts, rowid, entity_name, content, summary, tags)
    VALUES ('delete', old.rowid, old.entity_name, old.content, old.summary, old.tags);
    INSERT INTO memory_items_fts(rowid, entity_name, content, summary, tags)
    VALUES (new.rowid, new.entity_name, new.content, new.summary, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memory_items_fts_delete AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_items_fts(memory_items_fts, rowid, entity_name, content, summary, tags)
    VALUES ('delete', old.rowid, old.entity_name, old.content, old.summary, old.tags);
END;

CREATE INDEX IF NOT EXISTS idx_user_memory_scope ON memory_items(scope_type, scope_id, layer);
CREATE INDEX IF NOT EXISTS idx_user_memory_freshness ON memory_items(freshness_status, updated_at);
";

/// P2: 打开（或创建）user_memory.db，返回连接
pub fn open_user_memory_db() -> Result<Connection, String> {
    let path = user_memory_db_path().ok_or_else(|| "无法获取 data_dir".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("打开 user_memory.db 失败: {}", e))?;
    conn.execute_batch(USER_MEMORY_DDL)
        .map_err(|e| format!("初始化 user_memory.db 失败: {}", e))?;
    Ok(conn)
}

/// P2: 向 user_memory.db 写入用户级记忆条目
pub async fn upsert_user_memory(item: MemoryItemInput) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_user_memory_db()?;
        let user_id = get_or_create_user_id()?;
        let now = now_secs();
        let id = format!("usr-{}-{}", &user_id[..8.min(user_id.len())], now);
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO memory_items
             (id, layer, scope_type, scope_id, entity_type, entity_name,
              content, summary, tags, source_kind, source_ref,
              confidence, freshness_status, readonly, access_count,
              last_accessed_at, created_at, updated_at)
             VALUES (?1,'user','user',?2,?3,?4,?5,?6,?7,?8,?9,?10,'fresh',0,0,NULL,?11,?11)",
            rusqlite::params![
                id, user_id, item.entity_type, item.entity_name,
                item.content, item.summary, tags_json,
                item.source_kind.as_str(), item.source_ref,
                item.confidence, now,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// P2: 从 user_memory.db 检索（FTS5，500ms 超时）
/// 返回 MemorySearchResult 列表，供与 workspace search 结果合并
pub async fn search_user_memories(
    query: &str,
    limit: usize,
) -> Result<Vec<MemorySearchResult>, String> {
    let q = query.to_string();
    tokio::task::spawn_blocking(move || {
        let conn = open_user_memory_db().map_err(|e| e)?;
        let fts_query = sanitize_fts_query(&q);
        let sql = format!(
            "SELECT m.id, m.layer, m.scope_type, m.scope_id,
                    m.entity_type, m.entity_name, m.content, m.summary,
                    m.tags, m.source_kind, m.source_ref, m.confidence,
                    m.freshness_status, m.readonly, m.access_count,
                    m.last_accessed_at, m.created_at, m.updated_at,
                    (-fts.rank) AS score
             FROM memory_items_fts fts
             JOIN memory_items m ON m.rowid = fts.rowid
             WHERE memory_items_fts MATCH ?1
               AND m.freshness_status NOT IN ('expired', 'superseded')
             ORDER BY score * m.confidence DESC
             LIMIT {}", limit
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![fts_query], |row| {
            Ok(MemoryItem {
                id: row.get(0)?,
                layer: row.get(1)?,
                scope_type: row.get(2)?,
                scope_id: row.get(3)?,
                entity_type: row.get(4)?,
                entity_name: row.get(5)?,
                content: row.get(6)?,
                summary: row.get(7)?,
                tags: row.get(8)?,
                source_kind: row.get(9)?,
                source_ref: row.get(10)?,
                confidence: row.get(11)?,
                freshness_status: row.get(12)?,
                readonly: row.get::<_, i64>(13)? != 0,
                access_count: row.get(14)?,
                last_accessed_at: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut results = Vec::new();
        for row in rows {
            let item = row.map_err(|e| e.to_string())?;
            let label = "[用户偏好]".to_string();
            results.push(MemorySearchResult {
                item,
                relevance_score: 1.0,
                source_label: label,
            });
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// P2: 合并 workspace 和 user_memory 检索结果
/// 当 scope=all 或 scope=user 时，将两路结果合并后去重，按 relevance_score 排序
pub async fn merge_with_user_memories(
    workspace_results: Vec<MemorySearchResult>,
    query: &str,
    total_limit: usize,
    include_user: bool,
) -> Vec<MemorySearchResult> {
    if !include_user {
        return workspace_results;
    }
    let user_limit = (total_limit / 3).max(2); // 用户记忆最多占 1/3
    let user_results = search_user_memories(query, user_limit).await.unwrap_or_default();

    // 合并，workspace 结果优先排前
    let mut merged = workspace_results;
    let existing_ids: std::collections::HashSet<String> = merged.iter().map(|r| r.item.id.clone()).collect();
    for r in user_results {
        if !existing_ids.contains(&r.item.id) {
            merged.push(r);
        }
    }
    // 按 relevance_score * confidence 降序
    merged.sort_by(|a, b| {
        let sa = a.relevance_score * a.item.confidence;
        let sb = b.relevance_score * b.item.confidence;
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    merged.truncate(total_limit);
    merged
}

/// P2: 获取 user_id + user_db_path（供前端初始化时使用）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMemoryInfo {
    pub user_id: String,
    pub user_db_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::workspace_db::WorkspaceDb;
    use rusqlite::{params, Connection};
    use std::path::{Path, PathBuf};

    struct TestWorkspace {
        path: PathBuf,
    }

    impl TestWorkspace {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "binder-memory-{}-{}",
                label,
                uuid::Uuid::new_v4()
            ));
            std::fs::create_dir_all(&path).expect("create temp workspace");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }

        fn db_path(&self) -> PathBuf {
            self.path.join(".binder").join("workspace.db")
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn object_exists(conn: &Connection, object_type: &str, name: &str) -> bool {
        conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM sqlite_master WHERE type = ?1 AND name = ?2
             )",
            params![object_type, name],
            |row| row.get::<_, i64>(0),
        )
        .map(|exists| exists == 1)
        .unwrap_or(false)
    }

    fn sample_tab_memory(tab_id: &str) -> MemoryItemInput {
        MemoryItemInput {
            layer: MemoryLayer::Tab,
            scope_type: MemoryScopeType::Tab,
            scope_id: tab_id.to_string(),
            entity_type: "decision".to_string(),
            entity_name: "memory-id-dedupe".to_string(),
            content: "Use the real memory item id to dedupe explicit references.".to_string(),
            summary: "tab memory continuity sample".to_string(),
            tags: vec!["dedupe".to_string(), "tab".to_string()],
            source_kind: MemorySourceKind::ConversationSummary,
            source_ref: "chat-tab".to_string(),
            confidence: 0.91,
        }
    }

    #[test]
    fn workspace_db_initializes_memory_schema_and_memory_service_new_is_idempotent() {
        let workspace = TestWorkspace::new("schema-init");
        let _db = WorkspaceDb::new(workspace.path()).expect("workspace db init");

        let conn = Connection::open(workspace.db_path()).expect("open workspace db");
        for table in ["memory_items", "memory_items_fts", "memory_usage_logs"] {
            assert!(object_exists(&conn, "table", table), "missing table: {table}");
        }
        for trigger in [
            "memory_items_fts_insert",
            "memory_items_fts_update",
            "memory_items_fts_delete",
        ] {
            assert!(
                object_exists(&conn, "trigger", trigger),
                "missing trigger: {trigger}"
            );
        }
        for index in [
            "idx_memory_scope",
            "idx_memory_entity",
            "idx_memory_freshness",
            "idx_memory_source_ref",
            "idx_memory_usage_memory",
            "idx_memory_usage_tab",
        ] {
            assert!(object_exists(&conn, "index", index), "missing index: {index}");
        }
        drop(conn);

        let _service = MemoryService::new(workspace.path()).expect("memory service init");
        let conn = Connection::open(workspace.db_path()).expect("reopen workspace db");
        assert!(object_exists(&conn, "table", "memory_items"));
        assert!(object_exists(&conn, "table", "memory_items_fts"));
    }

    #[tokio::test]
    async fn tab_memory_survives_service_restart_and_active_tab_is_not_marked_orphan() {
        let workspace = TestWorkspace::new("tab-restart");
        let _db = WorkspaceDb::new(workspace.path()).expect("workspace db init");
        let tab_id = "8ebd8f5b-8d0a-4f90-9fd6-bb9be37b6a1c";

        let service = MemoryService::new(workspace.path()).expect("memory service init");
        service
            .upsert_tab_memories(tab_id, vec![sample_tab_memory(tab_id)])
            .await
            .expect("insert tab memory");
        drop(service);

        let restarted = MemoryService::new(workspace.path()).expect("memory service restart");
        let response = restarted
            .search_memories(SearchMemoriesParams {
                query: "real memory item id dedupe".to_string(),
                tab_id: Some(tab_id.to_string()),
                workspace_path: Some(workspace.path().to_string_lossy().to_string()),
                scope: MemorySearchScope::All,
                limit: Some(10),
                entity_types: None,
            })
            .await
            .expect("search memories after restart");

        assert_eq!(response.total_found, 1, "tab memory should still be searchable");
        let item_id = response.items[0].item.id.clone();

        let stale_count = restarted
            .mark_orphan_tab_memories_stale(&[tab_id.to_string()])
            .await
            .expect("mark orphan tab memories stale");
        assert_eq!(stale_count, 0, "active tab must not be marked stale");

        let conn = Connection::open(workspace.db_path()).expect("open workspace db");
        let freshness: String = conn
            .query_row(
                "SELECT freshness_status FROM memory_items WHERE id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .expect("read freshness");
        assert_eq!(freshness, "fresh");
    }
}
