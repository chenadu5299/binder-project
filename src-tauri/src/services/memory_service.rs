use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

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
        let conn = self.db.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
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
                serde_json::to_string(&memory.metadata).unwrap(),
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
        let conn = self.db.lock().unwrap();
        
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
        let conn = self.db.lock().unwrap();
        
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
        let conn = self.db.lock().unwrap();
        
        conn.execute("DELETE FROM memories WHERE id = ?1", params![memory_id])?;
        
        Ok(())
    }
    
    /// 获取所有记忆（用于记忆库视图）
    pub fn get_all_memories(&self) -> SqlResult<Vec<Memory>> {
        let conn = self.db.lock().unwrap();
        
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
}

