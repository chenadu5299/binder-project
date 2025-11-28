use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;
use crate::utils::error_helpers::{db_lock_error, get_current_timestamp, json_serialize_error};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub document_path: String,
    pub entity_type: MemoryEntityType,
    pub entity_name: String,
    pub content: String,
    pub metadata: serde_json::Value,
    pub source: MemorySource,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryEntityType {
    Character,  // 人物
    Event,      // 事件
    Location,   // 地点
    Concept,    // 概念
    Relationship, // 关系
    Other(String), // 其他
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemorySource {
    Manual,     // 手动添加
    AISuggested, // AI 建议
}

impl Memory {
    pub fn new(
        document_path: String,
        entity_type: MemoryEntityType,
        entity_name: String,
        content: String,
        metadata: serde_json::Value,
        source: MemorySource,
        confidence: f64,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            document_path,
            entity_type,
            entity_name,
            content,
            metadata,
            source,
            confidence,
        }
    }
}

pub struct MemoryService {
    db: Arc<Mutex<Connection>>,
    workspace_path: PathBuf,
}

impl MemoryService {
    pub fn new(workspace_path: &Path) -> SqlResult<Self> {
        let db_path = workspace_path.join(".binder").join("memories.db");
        
        // 确保 .binder 目录存在
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("创建目录失败: {}", e))
                ))?;
        }
        
        let conn = Connection::open(&db_path)?;
        
        // 创建记忆表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                document_path TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_name TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                confidence REAL DEFAULT 1.0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )?;
        
        // 创建索引
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_memories_document ON memories(document_path)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_memories_entity_type ON memories(entity_type)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_memories_entity_name ON memories(entity_name)",
            [],
        )?;
        
        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            workspace_path: workspace_path.to_path_buf(),
        })
    }
    
    /// 添加记忆
    pub fn add_memory(&self, memory: Memory) -> SqlResult<()> {
        let conn = self.db.lock()
            .map_err(|e| rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_LOCKED),
                Some(format!("获取数据库连接失败: {}", e))
            ))?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_MISUSE),
                Some(format!("获取时间失败: {}", e))
            ))?
            .as_secs() as i64;
        
        let entity_type_str = match &memory.entity_type {
            MemoryEntityType::Character => "character",
            MemoryEntityType::Event => "event",
            MemoryEntityType::Location => "location",
            MemoryEntityType::Concept => "concept",
            MemoryEntityType::Relationship => "relationship",
            MemoryEntityType::Other(s) => s,
        };
        
        let source_str = match &memory.source {
            MemorySource::Manual => "manual",
            MemorySource::AISuggested => "ai_suggested",
        };
        
        conn.execute(
            "INSERT OR REPLACE INTO memories 
             (id, document_path, entity_type, entity_name, content, metadata, source, confidence, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                memory.id,
                memory.document_path,
                entity_type_str,
                memory.entity_name,
                memory.content,
                serde_json::to_string(&memory.metadata)
                    .map_err(json_serialize_error)?,
                source_str,
                memory.confidence,
                now,
                now
            ],
        )?;
        
        Ok(())
    }
    
    /// 获取文档的所有记忆
    pub fn get_memories(&self, document_path: &str) -> SqlResult<Vec<Memory>> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        let mut stmt = conn.prepare(
            "SELECT id, document_path, entity_type, entity_name, content, metadata, source, confidence
             FROM memories
             WHERE document_path = ?1
             ORDER BY entity_type, entity_name"
        )?;
        
        let rows = stmt.query_map(params![document_path], |row| {
            let entity_type_str: String = row.get(2)?;
            let entity_type = match entity_type_str.as_str() {
                "character" => MemoryEntityType::Character,
                "event" => MemoryEntityType::Event,
                "location" => MemoryEntityType::Location,
                "concept" => MemoryEntityType::Concept,
                "relationship" => MemoryEntityType::Relationship,
                s => MemoryEntityType::Other(s.to_string()),
            };
            
            let source_str: String = row.get(6)?;
            let source = match source_str.as_str() {
                "manual" => MemorySource::Manual,
                "ai_suggested" => MemorySource::AISuggested,
                _ => MemorySource::Manual,
            };
            
            let metadata_json: String = row.get(5)?;
            let metadata = serde_json::from_str(&metadata_json).unwrap_or(serde_json::json!({}));
            
            Ok(Memory {
                id: row.get(0)?,
                document_path: row.get(1)?,
                entity_type,
                entity_name: row.get(3)?,
                content: row.get(4)?,
                metadata,
                source,
                confidence: row.get(7)?,
            })
        })?;
        
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        
        Ok(memories)
    }
    
    /// 搜索记忆
    pub fn search_memories(&self, query: &str) -> SqlResult<Vec<Memory>> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        let mut stmt = conn.prepare(
            "SELECT id, document_path, entity_type, entity_name, content, metadata, source, confidence
             FROM memories
             WHERE entity_name LIKE ?1 OR content LIKE ?1
             ORDER BY confidence DESC, entity_name"
        )?;
        
        let search_pattern = format!("%{}%", query);
        
        let rows = stmt.query_map(params![search_pattern], |row| {
            let entity_type_str: String = row.get(2)?;
            let entity_type = match entity_type_str.as_str() {
                "character" => MemoryEntityType::Character,
                "event" => MemoryEntityType::Event,
                "location" => MemoryEntityType::Location,
                "concept" => MemoryEntityType::Concept,
                "relationship" => MemoryEntityType::Relationship,
                s => MemoryEntityType::Other(s.to_string()),
            };
            
            let source_str: String = row.get(6)?;
            let source = match source_str.as_str() {
                "manual" => MemorySource::Manual,
                "ai_suggested" => MemorySource::AISuggested,
                _ => MemorySource::Manual,
            };
            
            let metadata_json: String = row.get(5)?;
            let metadata = serde_json::from_str(&metadata_json).unwrap_or(serde_json::json!({}));
            
            Ok(Memory {
                id: row.get(0)?,
                document_path: row.get(1)?,
                entity_type,
                entity_name: row.get(3)?,
                content: row.get(4)?,
                metadata,
                source,
                confidence: row.get(7)?,
            })
        })?;
        
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        
        Ok(memories)
    }
    
    /// 删除记忆
    pub fn delete_memory(&self, memory_id: &str) -> SqlResult<()> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        conn.execute("DELETE FROM memories WHERE id = ?1", params![memory_id])?;
        
        Ok(())
    }
    
    /// 获取所有记忆（用于记忆库视图）
    pub fn get_all_memories(&self) -> SqlResult<Vec<Memory>> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        
        let mut stmt = conn.prepare(
            "SELECT id, document_path, entity_type, entity_name, content, metadata, source, confidence
             FROM memories
             ORDER BY entity_type, entity_name"
        )?;
        
        let rows = stmt.query_map([], |row| {
            let entity_type_str: String = row.get(2)?;
            let entity_type = match entity_type_str.as_str() {
                "character" => MemoryEntityType::Character,
                "event" => MemoryEntityType::Event,
                "location" => MemoryEntityType::Location,
                "concept" => MemoryEntityType::Concept,
                "relationship" => MemoryEntityType::Relationship,
                s => MemoryEntityType::Other(s.to_string()),
            };
            
            let source_str: String = row.get(6)?;
            let source = match source_str.as_str() {
                "manual" => MemorySource::Manual,
                "ai_suggested" => MemorySource::AISuggested,
                _ => MemorySource::Manual,
            };
            
            let metadata_json: String = row.get(5)?;
            let metadata = serde_json::from_str(&metadata_json).unwrap_or(serde_json::json!({}));
            
            Ok(Memory {
                id: row.get(0)?,
                document_path: row.get(1)?,
                entity_type,
                entity_name: row.get(3)?,
                content: row.get(4)?,
                metadata,
                source,
                confidence: row.get(7)?,
            })
        })?;
        
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        
        Ok(memories)
    }

    /// 检查记忆库一致性
    pub fn check_consistency(&self) -> SqlResult<Vec<ConsistencyIssue>> {
        let conn = self.db.lock().map_err(db_lock_error)?;
        let mut issues = Vec::new();

        // 检查重复名称
        let mut stmt = conn.prepare(
            "SELECT entity_name, entity_type, COUNT(*) as count, GROUP_CONCAT(id) as ids
             FROM memories
             GROUP BY entity_name, entity_type
             HAVING count > 1"
        )?;

        let duplicate_rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;

        for row in duplicate_rows {
            let (name, entity_type, count, ids_str) = row?;
            let ids: Vec<String> = ids_str.split(',').map(|s| s.to_string()).collect();
            issues.push(ConsistencyIssue {
                issue_type: IssueType::DuplicateName,
                description: format!("发现 {} 个重复的{}名称: {}", count, entity_type, name),
                affected_items: ids,
                severity: Severity::Medium,
            });
        }

        // 检查缺失关系（如果关系类型存在但目标实体不存在）
        // 这个检查需要更复杂的逻辑，暂时跳过

        Ok(issues)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsistencyIssue {
    pub issue_type: IssueType,
    pub description: String,
    pub affected_items: Vec<String>,
    pub severity: Severity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IssueType {
    DuplicateName,        // 重复的名称
    ConflictingAttribute, // 冲突的属性
    MissingRelationship,  // 缺失的关系
    CircularReference,    // 循环引用
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
}

