//! Workspace 数据库
//!
//! 存储路径：.binder/workspace.db（位于 workspace 根目录下）

use rusqlite::{Connection, params};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const SCHEMA_VERSION: i32 = 1;

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

/// Workspace 数据库
pub struct WorkspaceDb {
    conn: Mutex<Connection>,
    workspace_path: PathBuf,
}

impl WorkspaceDb {
    /// 创建或打开 workspace 数据库
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
        conn.execute(
            "CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY)",
            [],
        )
        .map_err(|e| format!("创建 schema 表失败: {}", e))?;

        let version: i32 = conn
            .query_row("SELECT COALESCE(MAX(version), 0) FROM _schema_version", [], |r| r.get(0))
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
                cached_content: row.get(3).map_err(|e| format!("get cached_content: {}", e))?,
                content_hash: row.get(4).map_err(|e| format!("get content_hash: {}", e))?,
                mtime: row.get(5).map_err(|e| format!("get mtime: {}", e))?,
                workspace_path: row.get(6).map_err(|e| format!("get workspace_path: {}", e))?,
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
            .execute("DELETE FROM pending_diffs WHERE file_path = ?1 AND status = 'pending'", params![file_path])
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
    pub fn get_dependencies_by_source(&self, source_path: &str) -> Result<Vec<(String, String, String)>, String> {
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
    pub fn get_dependencies_by_target(&self, target_path: &str) -> Result<Vec<(String, String, String)>, String> {
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
    pub fn get_all_file_dependencies(&self) -> Result<Vec<(String, String, String, Option<String>)>, String> {
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
}
