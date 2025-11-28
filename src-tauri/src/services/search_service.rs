use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use crate::utils::error_helpers::{db_lock_error, get_current_timestamp, time_error};

pub struct SearchService {
    db: Arc<Mutex<Connection>>,
    workspace_path: PathBuf,
}

impl SearchService {
    pub fn new(workspace_path: &Path) -> SqlResult<Self> {
        let db_path = workspace_path.join(".binder").join("search.db");
        
        // 确保 .binder 目录存在
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("创建目录失败: {}", e))
                ))?;
        }
        
        let conn = Connection::open(&db_path)?;
        
        // 创建 FTS5 虚拟表用于全文搜索
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                path UNINDEXED,
                title,
                content,
                content_tokenize='unicode61 remove_diacritics=2'
            )",
            [],
        )?;
        
        // 创建文档元数据表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                path TEXT PRIMARY KEY,
                title TEXT,
                modified_time INTEGER,
                indexed_time INTEGER
            )",
            [],
        )?;
        
        // 创建索引以提高查询性能
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_time)",
            [],
        )?;
        
        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            workspace_path: workspace_path.to_path_buf(),
        })
    }
    
    /// 索引或更新文档
    pub fn index_document(&self, path: &Path, content: &str) -> SqlResult<()> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        // 获取文件的相对路径
        let relative_path = path.strip_prefix(&self.workspace_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        
        // 提取标题（文件名的第一行或文件名）
        let title = Path::new(&relative_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&relative_path)
            .to_string();
        
        let modified_time = path.metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        
        let indexed_time = get_current_timestamp()?;
        
        // 更新或插入文档元数据
        conn.execute(
            "INSERT OR REPLACE INTO documents (path, title, modified_time, indexed_time)
             VALUES (?1, ?2, ?3, ?4)",
            params![relative_path, title, modified_time, indexed_time],
        )?;
        
        // 更新或插入 FTS5 索引
        conn.execute(
            "INSERT OR REPLACE INTO documents_fts (path, title, content)
             VALUES (?1, ?2, ?3)",
            params![relative_path, title, content],
        )?;
        
        Ok(())
    }
    
    /// 删除文档索引
    pub fn remove_document(&self, path: &Path) -> SqlResult<()> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        let relative_path = path.strip_prefix(&self.workspace_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        
        conn.execute("DELETE FROM documents WHERE path = ?1", params![relative_path])?;
        conn.execute("DELETE FROM documents_fts WHERE path = ?1", params![relative_path])?;
        
        Ok(())
    }
    
    /// 全文搜索
    pub fn search(&self, query: &str, limit: usize) -> SqlResult<Vec<SearchResult>> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        // 使用 FTS5 的 MATCH 语法进行搜索
        let sql = format!(
            "SELECT path, title, 
                    snippet(documents_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
                    rank
             FROM documents_fts
             WHERE documents_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2"
        );
        
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![query, limit as i64], |row| {
            Ok(SearchResult {
                path: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                rank: row.get(3)?,
            })
        })?;
        
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        
        Ok(results)
    }
    
    /// 检查文档是否需要重新索引
    pub fn needs_reindex(&self, path: &Path) -> SqlResult<bool> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        let relative_path = path.strip_prefix(&self.workspace_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        
        let modified_time = path.metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        
        let mut stmt = conn.prepare(
            "SELECT indexed_time FROM documents WHERE path = ?1"
        )?;
        
        let indexed_time: Option<i64> = stmt.query_row(
            params![relative_path],
            |row| row.get(0)
        ).ok();
        
        Ok(indexed_time.map_or(true, |it| it < modified_time))
    }
    
    /// 清理不存在的文档索引
    pub fn cleanup_orphaned_documents(&self) -> SqlResult<usize> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        let mut stmt = conn.prepare("SELECT path FROM documents")?;
        let rows = stmt.query_map([], |row| {
            let relative_path: String = row.get(0)?;
            Ok(relative_path)
        })?;
        
        let mut deleted_count = 0;
        for row in rows {
            let relative_path = row?;
            let full_path = self.workspace_path.join(&relative_path);
            
            if !full_path.exists() {
                conn.execute("DELETE FROM documents WHERE path = ?1", params![relative_path])?;
                conn.execute("DELETE FROM documents_fts WHERE path = ?1", params![relative_path])?;
                deleted_count += 1;
            }
        }
        
        Ok(deleted_count)
    }
    
    // ⚠️ Week 19.1：批量索引更新（提高性能）
    pub fn batch_update_index(
        &self,
        updates: Vec<(PathBuf, String)>, // (path, content)
    ) -> SqlResult<()> {
        let mut conn = self.db.lock().map_err(db_lock_error)?;
        let tx = conn.transaction()?;
        
        for (path, content) in updates {
            // 获取文件的相对路径
            let relative_path = path.strip_prefix(&self.workspace_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            
            // 提取标题
            let title = Path::new(&relative_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&relative_path)
                .to_string();
            
            let modified_time = path.metadata()
                .and_then(|m| m.modified())
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64)
                .unwrap_or(0);
            
            let indexed_time = get_current_timestamp()?;
            
            // 使用 UPSERT 避免重复
            tx.execute(
                "INSERT OR REPLACE INTO documents (path, title, modified_time, indexed_time)
                 VALUES (?1, ?2, ?3, ?4)",
                params![relative_path, title, modified_time, indexed_time],
            )?;
            
            tx.execute(
                "INSERT OR REPLACE INTO documents_fts (path, title, content)
                 VALUES (?1, ?2, ?3)",
                params![relative_path, title, content],
            )?;
        }
        
        tx.commit()?;
        Ok(())
    }
    
    // ⚠️ Week 19.1：检查文件是否需要索引（基于修改时间）
    pub fn should_index(&self, path: &Path) -> SqlResult<bool> {
        // 只索引文本文件
        if !self.is_text_file(path) {
            return Ok(false);
        }
        
        // 检查是否需要重新索引
        self.needs_reindex(path)
    }
    
    // 判断是否为文本文件
    fn is_text_file(&self, path: &Path) -> bool {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            matches!(
                ext_lower.as_str(),
                "md" | "txt" | "html" | "htm" | "css" | "js" | "ts" | "json" | "xml" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf"
            )
        } else {
            false
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub rank: f64,
}

impl SearchResult {
    pub fn full_path(&self, workspace_path: &Path) -> PathBuf {
        workspace_path.join(&self.path)
    }
}

