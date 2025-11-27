use crate::services::memory_service::{MemoryService, Memory};
use std::path::PathBuf;
use uuid::Uuid;
use tauri::State;

#[tauri::command]
pub async fn add_memory(
    mut memory: Memory,
    workspace_path: String,
) -> Result<(), String> {
    // 如果ID为空，生成新的UUID
    if memory.id.is_empty() {
        memory.id = Uuid::new_v4().to_string();
    }
    
    let path = PathBuf::from(workspace_path);
    let service = MemoryService::new(&path)
        .map_err(|e| format!("初始化记忆服务失败: {}", e))?;
    
    service.add_memory(memory)
        .map_err(|e| format!("添加记忆失败: {}", e))
}

#[tauri::command]
pub async fn get_document_memories(
    document_path: String,
    workspace_path: String,
) -> Result<Vec<Memory>, String> {
    let path = PathBuf::from(workspace_path);
    let service = MemoryService::new(&path)
        .map_err(|e| format!("初始化记忆服务失败: {}", e))?;
    
    service.get_memories(&document_path)
        .map_err(|e| format!("获取记忆失败: {}", e))
}

#[tauri::command]
pub async fn search_memories(
    query: String,
    workspace_path: String,
) -> Result<Vec<Memory>, String> {
    let path = PathBuf::from(workspace_path);
    let service = MemoryService::new(&path)
        .map_err(|e| format!("初始化记忆服务失败: {}", e))?;
    
    service.search_memories(&query)
        .map_err(|e| format!("搜索记忆失败: {}", e))
}

#[tauri::command]
pub async fn delete_memory(
    memory_id: String,
    workspace_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(workspace_path);
    let service = MemoryService::new(&path)
        .map_err(|e| format!("初始化记忆服务失败: {}", e))?;
    
    service.delete_memory(&memory_id)
        .map_err(|e| format!("删除记忆失败: {}", e))
}

#[tauri::command]
pub async fn get_all_memories(
    workspace_path: String,
) -> Result<Vec<Memory>, String> {
    let path = PathBuf::from(workspace_path);
    let service = MemoryService::new(&path)
        .map_err(|e| format!("初始化记忆服务失败: {}", e))?;
    
    service.get_all_memories()
        .map_err(|e| format!("获取所有记忆失败: {}", e))
}

