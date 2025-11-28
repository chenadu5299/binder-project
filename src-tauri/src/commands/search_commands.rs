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

// ⚠️ Week 19.2：异步构建初始索引
#[tauri::command]
pub async fn build_index_async(
    workspace_path: String,
) -> Result<(), String> {
    let workspace = PathBuf::from(&workspace_path);
    
    tokio::spawn(async move {
        use std::fs;
        use walkdir::WalkDir;
        
        let service = match SearchService::new(&workspace) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("初始化搜索服务失败: {}", e);
                return;
            }
        };
        
        let mut updates = Vec::new();
        let mut count = 0;
        
        println!("开始构建索引: {}", workspace.display());
        
        // 遍历所有文件
        for entry in WalkDir::new(&workspace)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok()) {
            
            let path = entry.path();
            if path.is_file() {
                // 检查是否需要索引
                if let Ok(should_index) = service.should_index(path) {
                    if should_index {
                        // 读取文件内容
                        if let Ok(content) = fs::read_to_string(path) {
                            updates.push((path.to_path_buf(), content));
                            count += 1;
                            
                            // 每 100 个文件批量提交一次
                            if updates.len() >= 100 {
                                if let Err(e) = service.batch_update_index(updates.clone()) {
                                    eprintln!("批量更新索引失败: {}", e);
                                }
                                
                                println!("已索引 {} 个文件...", count);
                                
                                updates.clear();
                            }
                        }
                    }
                }
            }
        }
        
        // 提交剩余的文件
        if !updates.is_empty() {
            if let Err(e) = service.batch_update_index(updates) {
                eprintln!("批量更新索引失败: {}", e);
            }
        }
        
        println!("索引构建完成，共索引 {} 个文件", count);
    });
    
    Ok(())
}

