use crate::services::search_service::{SearchService, SearchResult};
use std::path::PathBuf;

// 搜索服务不需要全局状态，每次使用时创建新的实例（因为需要 workspace_path）

#[tauri::command]
pub async fn search_documents(
    query: String,
    limit: usize,
    workspace_path: String,
) -> Result<Vec<SearchResult>, String> {
    let path = PathBuf::from(workspace_path);
    let service = SearchService::new(&path)
        .map_err(|e| format!("初始化搜索服务失败: {}", e))?;
    
    service.search(&query, limit)
        .map_err(|e| format!("搜索失败: {}", e))
}

#[tauri::command]
pub async fn index_document(
    file_path: String,
    content: String,
    workspace_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    let workspace = PathBuf::from(workspace_path);
    let service = SearchService::new(&workspace)
        .map_err(|e| format!("初始化搜索服务失败: {}", e))?;
    
    service.index_document(&path, &content)
        .map_err(|e| format!("索引文档失败: {}", e))
}

#[tauri::command]
pub async fn remove_document_index(
    file_path: String,
    workspace_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    let workspace = PathBuf::from(workspace_path);
    let service = SearchService::new(&workspace)
        .map_err(|e| format!("初始化搜索服务失败: {}", e))?;
    
    service.remove_document(&path)
        .map_err(|e| format!("删除索引失败: {}", e))
}

