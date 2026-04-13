//! Workspace 数据库
//!
//! 存储路径：.binder/workspace.db（位于 workspace 根目录下）

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::services::template::{
  CompiledWorkflow, ParsedWorkflow, RuntimeWorkflowPlan, TemplateBinding, WorkflowExecutionRuntime,
  WorkflowTemplate, WorkflowTemplateDocument, WorkflowTemplateStatus,
};

const SCHEMA_VERSION: i32 = 8;

/// 文件缓存条目
#[derive(Debug, Clone)]
pub struct FileCacheEntry {
  pub id: i64,
  pub file_path: String,
  pub file_type: String,
  pub cached_content: Option<String>,
  pub content_hash: Option<String>,
  pub mtime: i64,
  pub workspace_path: String,
  pub created_at: i64,
  pub updated_at: i64,
}

/// Pending diff 条目
#[derive(Debug, Clone)]
pub struct PendingDiffEntry {
  pub id: i64,
  pub file_path: String,
  pub diff_index: i32,
  pub original_text: String,
  pub new_text: String,
  pub para_index: i32,
  pub diff_type: String,
  pub status: String,
  pub created_at: i64,
}

/// Agent task 行数据
#[derive(Debug, Clone)]
pub struct AgentTaskRow {
  pub id: String,
  pub chat_tab_id: String,
  pub goal: String,
  pub lifecycle: String,
  pub stage: String,
  pub stage_reason: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
}

/// Agent artifact 行数据
#[derive(Debug, Clone)]
pub struct AgentArtifactRow {
  pub id: String,
  pub task_id: Option<String>,
  pub kind: String,
  pub status: String,
  pub summary: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
}

/// 时间轴节点行数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineNodeRecord {
  pub node_id: String,
  pub workspace_path: String,
  pub node_type: String,
  pub operation_type: String,
  pub summary: String,
  pub impact_scope: Vec<String>,
  pub actor: String,
  pub restorable: bool,
  pub restore_payload_id: String,
  pub created_at: i64,
}

/// 时间轴还原载荷行数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRestorePayloadRecord {
  pub payload_id: String,
  pub workspace_path: String,
  pub payload_kind: String,
  pub payload_json: Value,
  pub created_at: i64,
}

/// Workspace 数据库
pub struct WorkspaceDb {
  conn: Mutex<Connection>,
  workspace_path: PathBuf,
}

impl WorkspaceDb {
  /// 创建或打开 workspace 数据库
  pub fn new(workspace_path: &Path) -> Result<Self, String> {
    let binder_dir = workspace_path.join(".binder");
    std::fs::create_dir_all(&binder_dir).map_err(|e| format!("创建 .binder 目录失败: {}", e))?;

    let db_path = binder_dir.join("workspace.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("打开 workspace.db 失败: {}", e))?;

    conn
      .execute_batch(
        "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;",
      )
      .map_err(|e| format!("设置 WAL 失败: {}", e))?;

    let mut db = Self {
      conn: Mutex::new(conn),
      workspace_path: workspace_path.to_path_buf(),
    };

    db.run_migrations()?;
    Ok(db)
  }

  fn run_migrations(&self) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    // 创建 user_version 表（若不存在）
    conn
      .execute(
        "CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY)",
        [],
      )
      .map_err(|e| format!("创建 schema 表失败: {}", e))?;

    let version: i32 = conn
      .query_row(
        "SELECT COALESCE(MAX(version), 0) FROM _schema_version",
        [],
        |r| r.get(0),
      )
      .map_err(|e| format!("读取 schema 版本失败: {}", e))?;

    if version < 1 {
      conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS file_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL UNIQUE,
                    file_type TEXT NOT NULL,
                    cached_content TEXT,
                    content_hash TEXT,
                    mtime INTEGER NOT NULL,
                    workspace_path TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS pending_diffs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    diff_index INTEGER NOT NULL,
                    original_text TEXT NOT NULL,
                    new_text TEXT NOT NULL,
                    para_index INTEGER NOT NULL,
                    diff_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS file_dependencies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_path TEXT NOT NULL,
                    target_path TEXT NOT NULL,
                    dependency_type TEXT NOT NULL,
                    description TEXT,
                    workspace_path TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(source_path, target_path)
                );

                CREATE TABLE IF NOT EXISTS ai_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL UNIQUE,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    affected_files TEXT NOT NULL,
                    workspace_path TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_file_cache_workspace ON file_cache(workspace_path);
                CREATE INDEX IF NOT EXISTS idx_pending_diffs_file ON pending_diffs(file_path, status);
                CREATE INDEX IF NOT EXISTS idx_dependencies_source ON file_dependencies(source_path);
                CREATE INDEX IF NOT EXISTS idx_dependencies_target ON file_dependencies(target_path);

                INSERT INTO _schema_version (version) VALUES (1);
                "#,
            )
            .map_err(|e| format!("执行 migration 1 失败: {}", e))?;
    }

    if version < 2 {
      conn
        .execute_batch(
          r#"
                CREATE TABLE IF NOT EXISTS agent_tasks (
                    id TEXT PRIMARY KEY,
                    chat_tab_id TEXT NOT NULL,
                    goal TEXT NOT NULL,
                    lifecycle TEXT NOT NULL DEFAULT 'active',
                    stage TEXT NOT NULL DEFAULT 'draft',
                    stage_reason TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_artifacts (
                    id TEXT PRIMARY KEY,
                    task_id TEXT,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft',
                    summary TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
                );

                CREATE INDEX IF NOT EXISTS idx_agent_tasks_chat_tab ON agent_tasks(chat_tab_id);
                CREATE INDEX IF NOT EXISTS idx_agent_tasks_lifecycle ON agent_tasks(lifecycle);
                CREATE INDEX IF NOT EXISTS idx_agent_artifacts_task ON agent_artifacts(task_id);
                CREATE INDEX IF NOT EXISTS idx_agent_artifacts_kind ON agent_artifacts(kind);

                INSERT INTO _schema_version (version) VALUES (2);
                "#,
        )
        .map_err(|e| format!("执行 migration 2 失败: {}", e))?;
    }

    if version < 3 {
      crate::services::memory_service::ensure_workspace_memory_schema(&conn)
        .map_err(|e| format!("执行 migration 3 失败: {}", e))?;
      conn
        .execute("INSERT INTO _schema_version (version) VALUES (3)", [])
        .map_err(|e| format!("写入 schema 版本 3 失败: {}", e))?;
    }

    if version < 4 {
      conn
        .execute_batch(
          r#"
                CREATE TABLE IF NOT EXISTS timeline_nodes (
                    node_id TEXT PRIMARY KEY,
                    workspace_path TEXT NOT NULL,
                    node_type TEXT NOT NULL,
                    operation_type TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    impact_scope_json TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    restorable INTEGER NOT NULL DEFAULT 1,
                    restore_payload_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS timeline_restore_payloads (
                    payload_id TEXT PRIMARY KEY,
                    workspace_path TEXT NOT NULL,
                    payload_kind TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_timeline_nodes_workspace_created
                    ON timeline_nodes(workspace_path, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_timeline_nodes_payload
                    ON timeline_nodes(restore_payload_id);
                CREATE INDEX IF NOT EXISTS idx_timeline_payloads_workspace_created
                    ON timeline_restore_payloads(workspace_path, created_at DESC);

                INSERT INTO _schema_version (version) VALUES (4);
                "#,
        )
        .map_err(|e| format!("执行 migration 4 失败: {}", e))?;
    }

    if version < 5 {
      conn
        .execute_batch(
          r#"
                CREATE TABLE IF NOT EXISTS workflow_templates (
                    id TEXT PRIMARY KEY,
                    workspace_path TEXT NOT NULL,
                    project_id TEXT,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS workflow_template_documents (
                    template_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace
                    ON workflow_templates(workspace_path, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_workflow_templates_status
                    ON workflow_templates(status);

                INSERT INTO _schema_version (version) VALUES (5);
                "#,
        )
        .map_err(|e| format!("执行 migration 5 失败: {}", e))?;
    }

    if version < 6 {
      conn
        .execute_batch(
          r#"
                CREATE TABLE IF NOT EXISTS workflow_template_parsed_cache (
                    template_id TEXT PRIMARY KEY,
                    document_updated_at INTEGER NOT NULL,
                    parsed_json TEXT NOT NULL,
                    cached_at INTEGER NOT NULL,
                    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS workflow_template_compiled_cache (
                    template_id TEXT PRIMARY KEY,
                    document_updated_at INTEGER NOT NULL,
                    compiled_json TEXT NOT NULL,
                    cached_at INTEGER NOT NULL,
                    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_workflow_template_parsed_cache_updated
                    ON workflow_template_parsed_cache(document_updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_workflow_template_compiled_cache_updated
                    ON workflow_template_compiled_cache(document_updated_at DESC);

                INSERT INTO _schema_version (version) VALUES (6);
                "#,
        )
        .map_err(|e| format!("执行 migration 6 失败: {}", e))?;
    }

    if version < 7 {
      conn
        .execute_batch(
          r#"
                CREATE TABLE IF NOT EXISTS workflow_template_bindings (
                    template_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    workspace_path TEXT NOT NULL,
                    bound_at INTEGER NOT NULL,
                    PRIMARY KEY (template_id, task_id),
                    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS runtime_workflow_plans (
                    task_id TEXT PRIMARY KEY,
                    template_id TEXT NOT NULL,
                    plan_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_workflow_template_bindings_task
                    ON workflow_template_bindings(task_id, bound_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runtime_workflow_plans_template
                    ON runtime_workflow_plans(template_id, updated_at DESC);

                INSERT INTO _schema_version (version) VALUES (7);
                "#,
        )
        .map_err(|e| format!("执行 migration 7 失败: {}", e))?;
    }

    if version < 8 {
      conn
        .execute_batch(
          r#"
                CREATE TABLE IF NOT EXISTS runtime_workflow_execution_states (
                    task_id TEXT PRIMARY KEY,
                    template_id TEXT NOT NULL,
                    execution_runtime_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_runtime_workflow_execution_states_template
                    ON runtime_workflow_execution_states(template_id, updated_at DESC);

                INSERT INTO _schema_version (version) VALUES (8);
                "#,
        )
        .map_err(|e| format!("执行 migration 8 失败: {}", e))?;
    }

    let _ = SCHEMA_VERSION;

    Ok(())
  }

  /// 获取文件缓存
  pub fn get_file_cache(&self, file_path: &str) -> Result<Option<FileCacheEntry>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();

    let mut stmt = conn
            .prepare(
                "SELECT id, file_path, file_type, cached_content, content_hash, mtime, workspace_path, created_at, updated_at
                 FROM file_cache WHERE file_path = ?1 AND workspace_path = ?2",
            )
            .map_err(|e| format!("prepare 失败: {}", e))?;

    let mut rows = stmt
      .query(params![file_path, workspace_str])
      .map_err(|e| format!("query 失败: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("next 失败: {}", e))? {
      Ok(Some(FileCacheEntry {
        id: row.get(0).map_err(|e| format!("get id: {}", e))?,
        file_path: row.get(1).map_err(|e| format!("get file_path: {}", e))?,
        file_type: row.get(2).map_err(|e| format!("get file_type: {}", e))?,
        cached_content: row
          .get(3)
          .map_err(|e| format!("get cached_content: {}", e))?,
        content_hash: row.get(4).map_err(|e| format!("get content_hash: {}", e))?,
        mtime: row.get(5).map_err(|e| format!("get mtime: {}", e))?,
        workspace_path: row
          .get(6)
          .map_err(|e| format!("get workspace_path: {}", e))?,
        created_at: row.get(7).map_err(|e| format!("get created_at: {}", e))?,
        updated_at: row.get(8).map_err(|e| format!("get updated_at: {}", e))?,
      }))
    } else {
      Ok(None)
    }
  }

  /// 插入或更新文件缓存
  pub fn upsert_file_cache(
    &self,
    file_path: &str,
    file_type: &str,
    cached_content: Option<&str>,
    content_hash: Option<&str>,
    mtime: i64,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();
    let now = chrono::Utc::now().timestamp();

    conn.execute(
            r#"
            INSERT INTO file_cache (file_path, file_type, cached_content, content_hash, mtime, workspace_path, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            ON CONFLICT(file_path) DO UPDATE SET
                file_type = excluded.file_type,
                cached_content = excluded.cached_content,
                content_hash = excluded.content_hash,
                mtime = excluded.mtime,
                updated_at = excluded.updated_at
            "#,
            params![
                file_path,
                file_type,
                cached_content,
                content_hash,
                mtime,
                workspace_str,
                now,
            ],
        )
        .map_err(|e| format!("upsert file_cache 失败: {}", e))?;

    Ok(())
  }

  /// 插入 pending diffs
  pub fn insert_pending_diffs(
    &self,
    file_path: &str,
    diffs: &[(String, String, i32)], // (original_text, new_text, para_index)
  ) -> Result<Vec<PendingDiffEntry>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let now = chrono::Utc::now().timestamp();
    let mut result = Vec::new();

    for (idx, (original_text, new_text, para_index)) in diffs.iter().enumerate() {
      conn.execute(
                "INSERT INTO pending_diffs (file_path, diff_index, original_text, new_text, para_index, diff_type, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'replace', 'pending', ?6)",
                params![file_path, idx as i32, original_text, new_text, para_index, now],
            )
            .map_err(|e| format!("insert pending_diff 失败: {}", e))?;

      let id = conn.last_insert_rowid();
      result.push(PendingDiffEntry {
        id,
        file_path: file_path.to_string(),
        diff_index: idx as i32,
        original_text: original_text.clone(),
        new_text: new_text.clone(),
        para_index: *para_index,
        diff_type: "replace".to_string(),
        status: "pending".to_string(),
        created_at: now,
      });
    }

    Ok(result)
  }

  /// 获取文件的 pending diffs
  pub fn get_pending_diffs(&self, file_path: &str) -> Result<Vec<PendingDiffEntry>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
            .prepare(
                "SELECT id, file_path, diff_index, original_text, new_text, para_index, diff_type, status, created_at
                 FROM pending_diffs WHERE file_path = ?1 AND status = 'pending' ORDER BY diff_index",
            )
            .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map(params![file_path], |row| {
        Ok(PendingDiffEntry {
          id: row.get(0)?,
          file_path: row.get(1)?,
          diff_index: row.get(2)?,
          original_text: row.get(3)?,
          new_text: row.get(4)?,
          para_index: row.get(5)?,
          diff_type: row.get(6)?,
          status: row.get(7)?,
          created_at: row.get(8)?,
        })
      })
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  /// 删除文件的 pending diffs（accept 或 reject 后调用）
  pub fn delete_pending_diffs(&self, file_path: &str) -> Result<usize, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let n = conn
      .execute(
        "DELETE FROM pending_diffs WHERE file_path = ?1 AND status = 'pending'",
        params![file_path],
      )
      .map_err(|e| format!("delete pending_diffs 失败: {}", e))?;
    Ok(n)
  }

  /// 获取 workspace 下所有有 pending diff 的文件路径
  pub fn get_files_with_pending_diffs(&self) -> Result<Vec<String>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
      .prepare("SELECT DISTINCT file_path FROM pending_diffs WHERE status = 'pending'")
      .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map([], |row| row.get(0))
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  pub fn workspace_path(&self) -> &Path {
    &self.workspace_path
  }

  fn workflow_template_status_from_db(status: &str) -> WorkflowTemplateStatus {
    match status {
      "active" => WorkflowTemplateStatus::Active,
      "disabled" => WorkflowTemplateStatus::Disabled,
      _ => WorkflowTemplateStatus::Draft,
    }
  }

  fn workflow_template_status_to_db(status: &WorkflowTemplateStatus) -> &'static str {
    match status {
      WorkflowTemplateStatus::Draft => "draft",
      WorkflowTemplateStatus::Active => "active",
      WorkflowTemplateStatus::Disabled => "disabled",
    }
  }

  pub fn insert_workflow_template(&self, template: &WorkflowTemplate) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    conn.execute(
            r#"
            INSERT INTO workflow_templates (id, workspace_path, project_id, name, description, status, version, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                template.id,
                template.workspace_path,
                template.project_id,
                template.name,
                template.description,
                Self::workflow_template_status_to_db(&template.status),
                template.version,
                template.created_at,
                template.updated_at,
            ],
        )
        .map_err(|e| format!("insert_workflow_template 失败: {}", e))?;
    Ok(())
  }

  pub fn list_workflow_templates(&self) -> Result<Vec<WorkflowTemplate>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();
    let mut stmt = conn
            .prepare(
                r#"
                SELECT id, workspace_path, project_id, name, description, status, version, created_at, updated_at
                FROM workflow_templates
                WHERE workspace_path = ?1
                ORDER BY updated_at DESC
                "#,
            )
            .map_err(|e| format!("prepare list_workflow_templates 失败: {}", e))?;

    let rows = stmt
      .query_map(params![workspace_str.as_ref()], |row| {
        let status: String = row.get(5)?;
        Ok(WorkflowTemplate {
          id: row.get(0)?,
          workspace_path: row.get(1)?,
          project_id: row.get(2)?,
          name: row.get(3)?,
          description: row.get(4)?,
          status: Self::workflow_template_status_from_db(&status),
          version: row.get(6)?,
          created_at: row.get(7)?,
          updated_at: row.get(8)?,
        })
      })
      .map_err(|e| format!("query_map list_workflow_templates 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row list_workflow_templates 失败: {}", e))?);
    }
    Ok(result)
  }

  pub fn get_workflow_template(
    &self,
    template_id: &str,
  ) -> Result<Option<WorkflowTemplate>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();
    let mut stmt = conn
            .prepare(
                r#"
                SELECT id, workspace_path, project_id, name, description, status, version, created_at, updated_at
                FROM workflow_templates
                WHERE id = ?1 AND workspace_path = ?2
                "#,
            )
            .map_err(|e| format!("prepare get_workflow_template 失败: {}", e))?;

    let mut rows = stmt
      .query(params![template_id, workspace_str.as_ref()])
      .map_err(|e| format!("query get_workflow_template 失败: {}", e))?;

    if let Some(row) = rows
      .next()
      .map_err(|e| format!("next get_workflow_template 失败: {}", e))?
    {
      let status: String = row.get(5).map_err(|e| format!("get status: {}", e))?;
      Ok(Some(WorkflowTemplate {
        id: row.get(0).map_err(|e| format!("get id: {}", e))?,
        workspace_path: row
          .get(1)
          .map_err(|e| format!("get workspace_path: {}", e))?,
        project_id: row.get(2).map_err(|e| format!("get project_id: {}", e))?,
        name: row.get(3).map_err(|e| format!("get name: {}", e))?,
        description: row.get(4).map_err(|e| format!("get description: {}", e))?,
        status: Self::workflow_template_status_from_db(&status),
        version: row.get(6).map_err(|e| format!("get version: {}", e))?,
        created_at: row.get(7).map_err(|e| format!("get created_at: {}", e))?,
        updated_at: row.get(8).map_err(|e| format!("get updated_at: {}", e))?,
      }))
    } else {
      Ok(None)
    }
  }

  pub fn update_workflow_template_status(
    &self,
    template_id: &str,
    status: &WorkflowTemplateStatus,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();
    let now = chrono::Utc::now().timestamp_millis();
    conn
      .execute(
        r#"
            UPDATE workflow_templates
            SET status = ?1, updated_at = ?2
            WHERE id = ?3 AND workspace_path = ?4
            "#,
        params![
          Self::workflow_template_status_to_db(status),
          now,
          template_id,
          workspace_str.as_ref(),
        ],
      )
      .map_err(|e| format!("update_workflow_template_status 失败: {}", e))?;
    Ok(())
  }

  pub fn bump_workflow_template_version(
    &self,
    template_id: &str,
  ) -> Result<WorkflowTemplate, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();
    let now = chrono::Utc::now().timestamp_millis();
    conn
      .execute(
        r#"
            UPDATE workflow_templates
            SET version = version + 1, updated_at = ?1
            WHERE id = ?2 AND workspace_path = ?3
            "#,
        params![now, template_id, workspace_str.as_ref()],
      )
      .map_err(|e| format!("bump_workflow_template_version 失败: {}", e))?;
    drop(conn);

    self
      .get_workflow_template(template_id)?
      .ok_or_else(|| format!("模板不存在: {}", template_id))
  }

  pub fn upsert_workflow_template_document(
    &self,
    document: &WorkflowTemplateDocument,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    conn
      .execute(
        r#"
            INSERT INTO workflow_template_documents (template_id, content, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(template_id) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at
            "#,
        params![document.template_id, document.content, document.updated_at],
      )
      .map_err(|e| format!("upsert_workflow_template_document 失败: {}", e))?;
    conn
      .execute(
        "DELETE FROM workflow_template_parsed_cache WHERE template_id = ?1",
        params![document.template_id],
      )
      .map_err(|e| format!("clear parsed cache 失败: {}", e))?;
    conn
      .execute(
        "DELETE FROM workflow_template_compiled_cache WHERE template_id = ?1",
        params![document.template_id],
      )
      .map_err(|e| format!("clear compiled cache 失败: {}", e))?;
    Ok(())
  }

  pub fn get_workflow_template_document(
    &self,
    template_id: &str,
  ) -> Result<Option<WorkflowTemplateDocument>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let mut stmt = conn
      .prepare(
        r#"
                SELECT template_id, content, updated_at
                FROM workflow_template_documents
                WHERE template_id = ?1
                "#,
      )
      .map_err(|e| format!("prepare get_workflow_template_document 失败: {}", e))?;

    let mut rows = stmt
      .query(params![template_id])
      .map_err(|e| format!("query get_workflow_template_document 失败: {}", e))?;

    if let Some(row) = rows
      .next()
      .map_err(|e| format!("next get_workflow_template_document 失败: {}", e))?
    {
      Ok(Some(WorkflowTemplateDocument {
        template_id: row.get(0).map_err(|e| format!("get template_id: {}", e))?,
        content: row.get(1).map_err(|e| format!("get content: {}", e))?,
        updated_at: row.get(2).map_err(|e| format!("get updated_at: {}", e))?,
      }))
    } else {
      Ok(None)
    }
  }

  pub fn upsert_parsed_workflow_cache(
    &self,
    parsed: &ParsedWorkflow,
    document_updated_at: i64,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let parsed_json = serde_json::to_string(parsed)
      .map_err(|e| format!("serialize parsed workflow 失败: {}", e))?;
    let cached_at = chrono::Utc::now().timestamp_millis();
    conn.execute(
            r#"
            INSERT INTO workflow_template_parsed_cache (template_id, document_updated_at, parsed_json, cached_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(template_id) DO UPDATE SET
                document_updated_at = excluded.document_updated_at,
                parsed_json = excluded.parsed_json,
                cached_at = excluded.cached_at
            "#,
            params![parsed.template_id, document_updated_at, parsed_json, cached_at],
        )
        .map_err(|e| format!("upsert parsed cache 失败: {}", e))?;
    Ok(())
  }

  pub fn get_parsed_workflow_cache(
    &self,
    template_id: &str,
    document_updated_at: i64,
  ) -> Result<Option<ParsedWorkflow>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let mut stmt = conn
      .prepare(
        r#"
                SELECT parsed_json
                FROM workflow_template_parsed_cache
                WHERE template_id = ?1 AND document_updated_at = ?2
                "#,
      )
      .map_err(|e| format!("prepare get_parsed_workflow_cache 失败: {}", e))?;

    let mut rows = stmt
      .query(params![template_id, document_updated_at])
      .map_err(|e| format!("query get_parsed_workflow_cache 失败: {}", e))?;

    if let Some(row) = rows
      .next()
      .map_err(|e| format!("next get_parsed_workflow_cache 失败: {}", e))?
    {
      let parsed_json: String = row.get(0).map_err(|e| format!("get parsed_json: {}", e))?;
      let parsed = serde_json::from_str::<ParsedWorkflow>(&parsed_json)
        .map_err(|e| format!("deserialize parsed workflow 失败: {}", e))?;
      Ok(Some(parsed))
    } else {
      Ok(None)
    }
  }

  pub fn upsert_compiled_workflow_cache(&self, compiled: &CompiledWorkflow) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let compiled_json = serde_json::to_string(compiled)
      .map_err(|e| format!("serialize compiled workflow 失败: {}", e))?;
    let cached_at = chrono::Utc::now().timestamp_millis();
    conn.execute(
            r#"
            INSERT INTO workflow_template_compiled_cache (template_id, document_updated_at, compiled_json, cached_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(template_id) DO UPDATE SET
                document_updated_at = excluded.document_updated_at,
                compiled_json = excluded.compiled_json,
                cached_at = excluded.cached_at
            "#,
            params![
                compiled.template_id,
                compiled.document_updated_at,
                compiled_json,
                cached_at
            ],
        )
        .map_err(|e| format!("upsert compiled cache 失败: {}", e))?;
    Ok(())
  }

  pub fn get_compiled_workflow_cache(
    &self,
    template_id: &str,
    document_updated_at: i64,
  ) -> Result<Option<CompiledWorkflow>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let mut stmt = conn
      .prepare(
        r#"
                SELECT compiled_json
                FROM workflow_template_compiled_cache
                WHERE template_id = ?1 AND document_updated_at = ?2
                "#,
      )
      .map_err(|e| format!("prepare get_compiled_workflow_cache 失败: {}", e))?;

    let mut rows = stmt
      .query(params![template_id, document_updated_at])
      .map_err(|e| format!("query get_compiled_workflow_cache 失败: {}", e))?;

    if let Some(row) = rows
      .next()
      .map_err(|e| format!("next get_compiled_workflow_cache 失败: {}", e))?
    {
      let compiled_json: String = row
        .get(0)
        .map_err(|e| format!("get compiled_json: {}", e))?;
      let compiled = serde_json::from_str::<CompiledWorkflow>(&compiled_json)
        .map_err(|e| format!("deserialize compiled workflow 失败: {}", e))?;
      Ok(Some(compiled))
    } else {
      Ok(None)
    }
  }

  pub fn upsert_template_binding(&self, binding: &TemplateBinding) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    conn
      .execute(
        r#"
            INSERT INTO workflow_template_bindings (template_id, task_id, workspace_path, bound_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(template_id, task_id) DO UPDATE SET
                workspace_path = excluded.workspace_path,
                bound_at = excluded.bound_at
            "#,
        params![
          binding.template_id,
          binding.task_id,
          binding.workspace_path,
          binding.bound_at
        ],
      )
      .map_err(|e| format!("upsert template binding 失败: {}", e))?;
    Ok(())
  }

  pub fn upsert_runtime_workflow_plan(&self, plan: &RuntimeWorkflowPlan) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let plan_json = serde_json::to_string(plan)
      .map_err(|e| format!("serialize runtime workflow plan 失败: {}", e))?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
            r#"
            INSERT INTO runtime_workflow_plans (task_id, template_id, plan_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(task_id) DO UPDATE SET
                template_id = excluded.template_id,
                plan_json = excluded.plan_json,
                updated_at = excluded.updated_at
            "#,
            params![plan.task_id, plan.template_id, plan_json, plan.created_at, now],
        )
        .map_err(|e| format!("upsert runtime workflow plan 失败: {}", e))?;
    Ok(())
  }

  pub fn get_runtime_workflow_plan(
    &self,
    task_id: &str,
  ) -> Result<Option<RuntimeWorkflowPlan>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let mut stmt = conn
      .prepare(
        r#"
                SELECT plan_json
                FROM runtime_workflow_plans
                WHERE task_id = ?1
                "#,
      )
      .map_err(|e| format!("prepare get_runtime_workflow_plan 失败: {}", e))?;

    let mut rows = stmt
      .query(params![task_id])
      .map_err(|e| format!("query get_runtime_workflow_plan 失败: {}", e))?;

    if let Some(row) = rows
      .next()
      .map_err(|e| format!("next get_runtime_workflow_plan 失败: {}", e))?
    {
      let plan_json: String = row.get(0).map_err(|e| format!("get plan_json: {}", e))?;
      let plan = serde_json::from_str::<RuntimeWorkflowPlan>(&plan_json)
        .map_err(|e| format!("deserialize runtime workflow plan 失败: {}", e))?;
      Ok(Some(plan))
    } else {
      Ok(None)
    }
  }

  pub fn upsert_workflow_execution_runtime(
    &self,
    runtime: &WorkflowExecutionRuntime,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let runtime_json = serde_json::to_string(runtime)
      .map_err(|e| format!("serialize workflow execution runtime 失败: {}", e))?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
            r#"
            INSERT INTO runtime_workflow_execution_states (task_id, template_id, execution_runtime_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(task_id) DO UPDATE SET
                template_id = excluded.template_id,
                execution_runtime_json = excluded.execution_runtime_json,
                updated_at = excluded.updated_at
            "#,
            params![
                runtime.context.task_id,
                runtime.context.template_id,
                runtime_json,
                runtime.context.created_at,
                now
            ],
        )
        .map_err(|e| format!("upsert workflow execution runtime 失败: {}", e))?;
    Ok(())
  }

  pub fn get_workflow_execution_runtime(
    &self,
    task_id: &str,
  ) -> Result<Option<WorkflowExecutionRuntime>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let mut stmt = conn
      .prepare(
        r#"
                SELECT execution_runtime_json
                FROM runtime_workflow_execution_states
                WHERE task_id = ?1
                "#,
      )
      .map_err(|e| format!("prepare get_workflow_execution_runtime 失败: {}", e))?;

    let mut rows = stmt
      .query(params![task_id])
      .map_err(|e| format!("query get_workflow_execution_runtime 失败: {}", e))?;

    if let Some(row) = rows
      .next()
      .map_err(|e| format!("next get_workflow_execution_runtime 失败: {}", e))?
    {
      let runtime_json: String = row
        .get(0)
        .map_err(|e| format!("get execution_runtime_json: {}", e))?;
      let runtime = serde_json::from_str::<WorkflowExecutionRuntime>(&runtime_json)
        .map_err(|e| format!("deserialize workflow execution runtime 失败: {}", e))?;
      Ok(Some(runtime))
    } else {
      Ok(None)
    }
  }

  /// Phase 5.3：插入或更新文件依赖
  pub fn save_file_dependency(
    &self,
    source_path: &str,
    target_path: &str,
    dependency_type: &str,
    description: Option<&str>,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();
    let now = chrono::Utc::now().timestamp();

    conn.execute(
            r#"
            INSERT INTO file_dependencies (source_path, target_path, dependency_type, description, workspace_path, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(source_path, target_path) DO UPDATE SET
                dependency_type = excluded.dependency_type,
                description = excluded.description,
                updated_at = excluded.updated_at
            "#,
            params![
                source_path,
                target_path,
                dependency_type,
                description,
                workspace_str,
                now,
                now,
            ],
        )
        .map_err(|e| format!("save_file_dependency 失败: {}", e))?;

    Ok(())
  }

  /// Phase 5.3：获取某文件作为 source 时的依赖（影响的目标文件）
  pub fn get_dependencies_by_source(
    &self,
    source_path: &str,
  ) -> Result<Vec<(String, String, String)>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
            .prepare(
                "SELECT source_path, target_path, dependency_type FROM file_dependencies WHERE source_path = ?1",
            )
            .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map(params![source_path], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
      })
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  /// Phase 5.3：获取某文件作为 target 时的依赖（依赖它的源文件）
  pub fn get_dependencies_by_target(
    &self,
    target_path: &str,
  ) -> Result<Vec<(String, String, String)>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
            .prepare(
                "SELECT source_path, target_path, dependency_type FROM file_dependencies WHERE target_path = ?1",
            )
            .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map(params![target_path], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
      })
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  /// Phase 5.3：获取工作区内所有依赖关系
  pub fn get_all_file_dependencies(
    &self,
  ) -> Result<Vec<(String, String, String, Option<String>)>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy();

    let mut stmt = conn
            .prepare(
                "SELECT source_path, target_path, dependency_type, description FROM file_dependencies WHERE workspace_path = ?1",
            )
            .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map(params![workspace_str], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
      })
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  // ── agent_tasks CRUD ──

  pub fn upsert_agent_task(
    &self,
    id: &str,
    chat_tab_id: &str,
    goal: &str,
    lifecycle: &str,
    stage: &str,
    stage_reason: Option<&str>,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
            r#"
            INSERT INTO agent_tasks (id, chat_tab_id, goal, lifecycle, stage, stage_reason, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            ON CONFLICT(id) DO UPDATE SET
                lifecycle = excluded.lifecycle,
                stage = excluded.stage,
                stage_reason = excluded.stage_reason,
                updated_at = excluded.updated_at
            "#,
            params![id, chat_tab_id, goal, lifecycle, stage, stage_reason, now],
        )
        .map_err(|e| format!("upsert_agent_task 失败: {}", e))?;

    Ok(())
  }

  /// Stage-only update — does not require goal/lifecycle.
  /// Silently succeeds (no-op) if task_id does not exist in DB.
  pub fn update_agent_task_stage(
    &self,
    id: &str,
    stage: &str,
    stage_reason: Option<&str>,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let now = chrono::Utc::now().timestamp_millis();
    conn
      .execute(
        "UPDATE agent_tasks SET stage = ?1, stage_reason = ?2, updated_at = ?3 WHERE id = ?4",
        params![stage, stage_reason, now, id],
      )
      .map_err(|e| format!("update_agent_task_stage 失败: {}", e))?;
    Ok(())
  }

  pub fn get_agent_task(&self, id: &str) -> Result<Option<AgentTaskRow>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
      .prepare(
        "SELECT id, chat_tab_id, goal, lifecycle, stage, stage_reason, created_at, updated_at
                 FROM agent_tasks WHERE id = ?1",
      )
      .map_err(|e| format!("prepare 失败: {}", e))?;

    let mut rows = stmt
      .query(params![id])
      .map_err(|e| format!("query 失败: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("next 失败: {}", e))? {
      Ok(Some(AgentTaskRow {
        id: row.get(0).map_err(|e| format!("get: {}", e))?,
        chat_tab_id: row.get(1).map_err(|e| format!("get: {}", e))?,
        goal: row.get(2).map_err(|e| format!("get: {}", e))?,
        lifecycle: row.get(3).map_err(|e| format!("get: {}", e))?,
        stage: row.get(4).map_err(|e| format!("get: {}", e))?,
        stage_reason: row.get(5).map_err(|e| format!("get: {}", e))?,
        created_at: row.get(6).map_err(|e| format!("get: {}", e))?,
        updated_at: row.get(7).map_err(|e| format!("get: {}", e))?,
      }))
    } else {
      Ok(None)
    }
  }

  pub fn get_agent_tasks_by_chat_tab(
    &self,
    chat_tab_id: &str,
  ) -> Result<Vec<AgentTaskRow>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
      .prepare(
        "SELECT id, chat_tab_id, goal, lifecycle, stage, stage_reason, created_at, updated_at
                 FROM agent_tasks WHERE chat_tab_id = ?1 ORDER BY created_at DESC",
      )
      .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map(params![chat_tab_id], |row| {
        Ok(AgentTaskRow {
          id: row.get(0)?,
          chat_tab_id: row.get(1)?,
          goal: row.get(2)?,
          lifecycle: row.get(3)?,
          stage: row.get(4)?,
          stage_reason: row.get(5)?,
          created_at: row.get(6)?,
          updated_at: row.get(7)?,
        })
      })
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  // ── agent_artifacts CRUD ──

  pub fn upsert_agent_artifact(
    &self,
    id: &str,
    task_id: Option<&str>,
    kind: &str,
    status: &str,
    summary: Option<&str>,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let now = chrono::Utc::now().timestamp_millis();

    conn
      .execute(
        r#"
            INSERT INTO agent_artifacts (id, task_id, kind, status, summary, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                summary = excluded.summary,
                updated_at = excluded.updated_at
            "#,
        params![id, task_id, kind, status, summary, now],
      )
      .map_err(|e| format!("upsert_agent_artifact 失败: {}", e))?;

    Ok(())
  }

  pub fn get_agent_artifacts_by_task(
    &self,
    task_id: &str,
  ) -> Result<Vec<AgentArtifactRow>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;

    let mut stmt = conn
      .prepare(
        "SELECT id, task_id, kind, status, summary, created_at, updated_at
                 FROM agent_artifacts WHERE task_id = ?1 ORDER BY created_at",
      )
      .map_err(|e| format!("prepare 失败: {}", e))?;

    let rows = stmt
      .query_map(params![task_id], |row| {
        Ok(AgentArtifactRow {
          id: row.get(0)?,
          task_id: row.get(1)?,
          kind: row.get(2)?,
          status: row.get(3)?,
          summary: row.get(4)?,
          created_at: row.get(5)?,
          updated_at: row.get(6)?,
        })
      })
      .map_err(|e| format!("query_map 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  pub fn insert_timeline_node_with_payload(
    &self,
    node: &TimelineNodeRecord,
    payload: &TimelineRestorePayloadRecord,
    limit: usize,
  ) -> Result<(), String> {
    let mut conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let tx = conn
      .transaction()
      .map_err(|e| format!("开启时间轴事务失败: {}", e))?;

    let impact_scope_json = serde_json::to_string(&node.impact_scope)
      .map_err(|e| format!("序列化 impact_scope 失败: {}", e))?;
    let payload_json = serde_json::to_string(&payload.payload_json)
      .map_err(|e| format!("序列化 payload_json 失败: {}", e))?;

    tx.execute(
            "INSERT INTO timeline_restore_payloads (payload_id, workspace_path, payload_kind, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                payload.payload_id,
                payload.workspace_path,
                payload.payload_kind,
                payload_json,
                payload.created_at,
            ],
        )
        .map_err(|e| format!("写入 timeline_restore_payloads 失败: {}", e))?;

    tx.execute(
      "INSERT INTO timeline_nodes (
                node_id, workspace_path, node_type, operation_type, summary,
                impact_scope_json, actor, restorable, restore_payload_id, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      params![
        node.node_id,
        node.workspace_path,
        node.node_type,
        node.operation_type,
        node.summary,
        impact_scope_json,
        node.actor,
        if node.restorable { 1 } else { 0 },
        node.restore_payload_id,
        node.created_at,
      ],
    )
    .map_err(|e| format!("写入 timeline_nodes 失败: {}", e))?;

    self.trim_timeline_nodes_in_tx(&tx, limit)?;

    tx.commit()
      .map_err(|e| format!("提交时间轴事务失败: {}", e))?;
    Ok(())
  }

  fn trim_timeline_nodes_in_tx(
    &self,
    tx: &rusqlite::Transaction<'_>,
    limit: usize,
  ) -> Result<(), String> {
    let workspace_str = self.workspace_path.to_string_lossy().to_string();
    let mut stmt = tx
      .prepare(
        "SELECT node_id, restore_payload_id
                 FROM timeline_nodes
                 WHERE workspace_path = ?1
                 ORDER BY created_at DESC, node_id DESC
                 LIMIT -1 OFFSET ?2",
      )
      .map_err(|e| format!("prepare 裁剪查询失败: {}", e))?;

    let rows = stmt
      .query_map(params![workspace_str, limit as i64], |row| {
        let node_id: String = row.get(0)?;
        let payload_id: String = row.get(1)?;
        Ok((node_id, payload_id))
      })
      .map_err(|e| format!("query 裁剪查询失败: {}", e))?;

    let stale: Result<Vec<(String, String)>, _> = rows.collect();
    let stale = stale.map_err(|e| format!("读取裁剪结果失败: {}", e))?;

    for (node_id, payload_id) in stale {
      tx.execute(
        "DELETE FROM timeline_nodes WHERE node_id = ?1",
        params![node_id],
      )
      .map_err(|e| format!("删除旧时间轴节点失败: {}", e))?;
      tx.execute(
        "DELETE FROM timeline_restore_payloads WHERE payload_id = ?1",
        params![payload_id],
      )
      .map_err(|e| format!("删除旧时间轴载荷失败: {}", e))?;
    }

    Ok(())
  }

  pub fn list_timeline_nodes(&self, limit: usize) -> Result<Vec<TimelineNodeRecord>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy().to_string();

    let mut stmt = conn
      .prepare(
        "SELECT node_id, workspace_path, node_type, operation_type, summary,
                        impact_scope_json, actor, restorable, restore_payload_id, created_at
                 FROM timeline_nodes
                 WHERE workspace_path = ?1
                 ORDER BY created_at DESC, node_id DESC
                 LIMIT ?2",
      )
      .map_err(|e| format!("prepare list_timeline_nodes 失败: {}", e))?;

    let rows = stmt
      .query_map(params![workspace_str, limit as i64], |row| {
        let impact_scope_json: String = row.get(5)?;
        let impact_scope: Vec<String> =
          serde_json::from_str(&impact_scope_json).unwrap_or_default();
        Ok(TimelineNodeRecord {
          node_id: row.get(0)?,
          workspace_path: row.get(1)?,
          node_type: row.get(2)?,
          operation_type: row.get(3)?,
          summary: row.get(4)?,
          impact_scope,
          actor: row.get(6)?,
          restorable: row.get::<_, i64>(7)? != 0,
          restore_payload_id: row.get(8)?,
          created_at: row.get(9)?,
        })
      })
      .map_err(|e| format!("query_map list_timeline_nodes 失败: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
      result.push(row.map_err(|e| format!("row 失败: {}", e))?);
    }
    Ok(result)
  }

  pub fn get_timeline_node(&self, node_id: &str) -> Result<Option<TimelineNodeRecord>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy().to_string();

    let mut stmt = conn
      .prepare(
        "SELECT node_id, workspace_path, node_type, operation_type, summary,
                        impact_scope_json, actor, restorable, restore_payload_id, created_at
                 FROM timeline_nodes
                 WHERE node_id = ?1 AND workspace_path = ?2",
      )
      .map_err(|e| format!("prepare get_timeline_node 失败: {}", e))?;

    let mut rows = stmt
      .query(params![node_id, workspace_str])
      .map_err(|e| format!("query get_timeline_node 失败: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("next 失败: {}", e))? {
      let impact_scope_json: String = row
        .get(5)
        .map_err(|e| format!("get impact_scope_json: {}", e))?;
      let impact_scope: Vec<String> = serde_json::from_str(&impact_scope_json)
        .map_err(|e| format!("解析 impact_scope_json 失败: {}", e))?;
      Ok(Some(TimelineNodeRecord {
        node_id: row.get(0).map_err(|e| format!("get node_id: {}", e))?,
        workspace_path: row
          .get(1)
          .map_err(|e| format!("get workspace_path: {}", e))?,
        node_type: row.get(2).map_err(|e| format!("get node_type: {}", e))?,
        operation_type: row
          .get(3)
          .map_err(|e| format!("get operation_type: {}", e))?,
        summary: row.get(4).map_err(|e| format!("get summary: {}", e))?,
        impact_scope,
        actor: row.get(6).map_err(|e| format!("get actor: {}", e))?,
        restorable: row
          .get::<_, i64>(7)
          .map_err(|e| format!("get restorable: {}", e))?
          != 0,
        restore_payload_id: row
          .get(8)
          .map_err(|e| format!("get restore_payload_id: {}", e))?,
        created_at: row.get(9).map_err(|e| format!("get created_at: {}", e))?,
      }))
    } else {
      Ok(None)
    }
  }

  pub fn get_timeline_restore_payload(
    &self,
    payload_id: &str,
  ) -> Result<Option<TimelineRestorePayloadRecord>, String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let workspace_str = self.workspace_path.to_string_lossy().to_string();

    let mut stmt = conn
      .prepare(
        "SELECT payload_id, workspace_path, payload_kind, payload_json, created_at
                 FROM timeline_restore_payloads
                 WHERE payload_id = ?1 AND workspace_path = ?2",
      )
      .map_err(|e| format!("prepare get_timeline_restore_payload 失败: {}", e))?;

    let mut rows = stmt
      .query(params![payload_id, workspace_str])
      .map_err(|e| format!("query get_timeline_restore_payload 失败: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("next 失败: {}", e))? {
      let payload_json: String = row.get(3).map_err(|e| format!("get payload_json: {}", e))?;
      let payload_json = serde_json::from_str(&payload_json)
        .map_err(|e| format!("解析 payload_json 失败: {}", e))?;
      Ok(Some(TimelineRestorePayloadRecord {
        payload_id: row.get(0).map_err(|e| format!("get payload_id: {}", e))?,
        workspace_path: row
          .get(1)
          .map_err(|e| format!("get workspace_path: {}", e))?,
        payload_kind: row.get(2).map_err(|e| format!("get payload_kind: {}", e))?,
        payload_json,
        created_at: row.get(4).map_err(|e| format!("get created_at: {}", e))?,
      }))
    } else {
      Ok(None)
    }
  }
}
