use crate::services::file_tree::{FileTreeService, FileTreeNode};
use crate::services::workspace::{WorkspaceService, Workspace};
use crate::services::file_watcher::FileWatcherService;
use crate::services::file_system::FileSystemService;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::{State, Emitter};

// 全局文件监听器（单例）
type FileWatcherState = Mutex<FileWatcherService>;

#[tauri::command]
pub async fn build_file_tree(root_path: String, max_depth: usize) -> Result<FileTreeNode, String> {
    let service = FileTreeService::new();
    let root = PathBuf::from(root_path);
    service.build_tree(&root, max_depth)
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let path_buf = std::path::PathBuf::from(&path);
    
    // 检查文件大小，如果超过 10MB，使用流式读取
    let metadata = std::fs::metadata(&path_buf)
        .map_err(|e| format!("获取文件信息失败: {}", e))?;
    
    let file_size = metadata.len();
    const MAX_IN_MEMORY_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    
    if file_size > MAX_IN_MEMORY_SIZE {
        // 大文件：只读取前 10MB 并提示用户
        use std::io::Read;
        let mut file = std::fs::File::open(&path_buf)
            .map_err(|e| format!("打开文件失败: {}", e))?;
        
        let mut buffer = vec![0u8; MAX_IN_MEMORY_SIZE as usize];
        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        
        let content = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
        
        // 在内容末尾添加提示
        Ok(format!("{}\n\n[文件过大，仅显示前 10MB。文件大小: {:.2} MB]", 
            content, 
            file_size as f64 / 1024.0 / 1024.0))
    } else {
        // 小文件：正常读取
        std::fs::read_to_string(&path_buf)
            .map_err(|e| format!("读取文件失败: {}", e))
    }
}

#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(base64)
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| format!("写入文件失败: {}", e))
}

#[tauri::command]
pub async fn create_file(path: String, file_type: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    
    eprintln!("[create_file] 开始创建文件: path={}, type={}", path, file_type);
    
    // 检查文件是否已存在
    if path_buf.exists() {
        eprintln!("[create_file] 文件已存在: {}", path);
        return Err(format!("文件已存在: {}", path));
    }
    
    // 确保父目录存在
    if let Some(parent) = path_buf.parent() {
        eprintln!("[create_file] 创建父目录: {:?}", parent);
        std::fs::create_dir_all(parent)
            .map_err(|e| {
                eprintln!("[create_file] 创建父目录失败: {}", e);
                format!("创建目录失败: {}", e)
            })?;
    }
    
    // 根据文件类型创建内容
    let content = match file_type.as_str() {
        "md" => "# 新文档\n\n",
        "html" => "<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"UTF-8\">\n  <title>新文档</title>\n</head>\n<body>\n  <h1>新文档</h1>\n</body>\n</html>\n",
        "txt" => "新文档\n\n",
        _ => "",
    };
    
    eprintln!("[create_file] 写入文件内容: path={}", path);
    std::fs::write(&path_buf, content)
        .map_err(|e| {
            eprintln!("[create_file] 写入文件失败: {}", e);
            format!("创建文件失败: {}", e)
        })?;
    
    eprintln!("[create_file] 文件创建成功: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    
    eprintln!("[create_folder] 开始创建文件夹: path={}", path);
    
    // 检查文件夹是否已存在
    if path_buf.exists() {
        eprintln!("[create_folder] 文件夹已存在: {}", path);
        return Err(format!("文件夹已存在: {}", path));
    }
    
    // 确保父目录存在
    if let Some(parent) = path_buf.parent() {
        eprintln!("[create_folder] 创建父目录: {:?}", parent);
        std::fs::create_dir_all(parent)
            .map_err(|e| {
                eprintln!("[create_folder] 创建父目录失败: {}", e);
                format!("创建目录失败: {}", e)
            })?;
    }
    
    eprintln!("[create_folder] 创建文件夹: path={}", path);
    std::fs::create_dir_all(&path_buf)
        .map_err(|e| {
            eprintln!("[create_folder] 创建文件夹失败: {}", e);
            format!("创建文件夹失败: {}", e)
        })?;
    
    eprintln!("[create_folder] 文件夹创建成功: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn open_workspace_dialog() -> Result<Option<String>, String> {
    // 注意：在 Tauri 2.x 中，对话框功能由前端插件处理
    // 这个命令保留用于兼容，但实际由前端调用插件
    Ok(None)
}

#[tauri::command]
pub async fn load_workspaces() -> Result<Vec<Workspace>, String> {
    let service = WorkspaceService::new()?;
    service.load_workspaces()
}

#[tauri::command]
pub async fn open_workspace(
    path: String,
    watcher: State<'_, FileWatcherState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let service = WorkspaceService::new()?;
    service.open_workspace(&path)?;
    
    // 启动文件监听
    let mut watcher_service = watcher.lock()
        .map_err(|e| format!("获取文件监听服务失败: {}", e))?;
    let workspace_path = PathBuf::from(&path);
    watcher_service.watch_workspace(workspace_path)?;
    
    // 订阅文件变化事件
    let mut rx = watcher_service.subscribe();
    let app_handle = app.clone();
    let path_clone = path.clone();
    
    // ⚠️ Week 17 优化：实现防抖机制（500ms）
    // ⚠️ Week 19.1：集成索引更新
    let workspace_path_for_index = PathBuf::from(&path);
    tokio::spawn(async move {
        use tokio::time::{sleep, Duration, Instant};
        use crate::services::search_service::SearchService;
        use std::fs;
        
        let mut last_event_time = Instant::now();
        let debounce_duration = Duration::from_millis(500);
        let mut debounce_task: Option<tokio::task::JoinHandle<()>> = None;
        
        // 创建搜索服务实例用于索引更新（使用 Arc 包装以便在闭包中使用）
        use std::sync::Arc;
        let search_service = match SearchService::new(&workspace_path_for_index) {
            Ok(service) => Some(Arc::new(service)),
            Err(e) => {
                eprintln!("初始化搜索服务失败（索引更新将跳过）: {}", e);
                None
            }
        };
        
        while let Ok(_event) = rx.recv().await {
            last_event_time = Instant::now();
            
            // 取消之前的防抖任务（如果存在）
            if let Some(task) = debounce_task.take() {
                task.abort();
            }
            
            // 创建新的防抖任务
            let app_handle_clone = app_handle.clone();
            let path_clone_for_task = path_clone.clone();
            let workspace_path_clone = workspace_path_for_index.clone();
            let search_service_clone = search_service.clone();
            
            debounce_task = Some(tokio::spawn(async move {
                // 等待 500ms
                sleep(debounce_duration).await;
                
                // 发送文件树变化事件到前端
                app_handle_clone.emit("file-tree-changed", &path_clone_for_task).unwrap_or_else(|e| {
                    eprintln!("发送文件树变化事件失败: {}", e);
                });
                
                // ⚠️ Week 19.1：自动更新索引（扫描变化的文件）
                // 注意：这里简化实现，只扫描一级目录，避免性能问题
                // 完整的递归扫描应该在 build_index_async 中完成
                if let Some(ref service) = search_service_clone {
                    if let Ok(entries) = fs::read_dir(&workspace_path_clone) {
                        let mut updates = Vec::new();
                        
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_file() {
                                // 检查是否需要索引
                                if let Ok(should_index) = service.should_index(&path) {
                                    if should_index {
                                        // 读取文件内容
                                        if let Ok(content) = fs::read_to_string(&path) {
                                            updates.push((path.clone(), content));
                                            
                                            // 每 50 个文件批量提交一次
                                            if updates.len() >= 50 {
                                                if let Err(e) = service.batch_update_index(updates.clone()) {
                                                    eprintln!("批量更新索引失败: {}", e);
                                                }
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
                    }
                }
            }));
        }
        
        // 清理：如果有未完成的防抖任务，等待它完成
        if let Some(task) = debounce_task {
            let _ = task.await;
        }
    });
    
    Ok(())
}

// ⚠️ Week 17.1.2：检查文件是否被外部修改
#[tauri::command]
pub async fn check_external_modification(
    path: String,
    last_modified_ms: u64, // 毫秒时间戳
) -> Result<bool, String> {
    let file_path = PathBuf::from(&path);
    
    // 将毫秒时间戳转换为 SystemTime
    let last_modified = SystemTime::UNIX_EPOCH
        .checked_add(std::time::Duration::from_millis(last_modified_ms))
        .ok_or("时间戳转换失败")?;
    
    let service = FileSystemService::new();
    service.check_external_modification(&file_path, last_modified)
}

// 获取文件修改时间
#[tauri::command]
pub async fn get_file_modified_time(path: String) -> Result<u64, String> {
    let file_path = PathBuf::from(&path);
    let modified_time = FileSystemService::get_file_modified_time(&file_path)?;
    
    // 转换为毫秒时间戳
    let duration = modified_time
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|_| "时间计算失败")?;
    
    Ok(duration.as_millis() as u64)
}

// ⚠️ Week 18.1：移动文件到工作区（用于拖拽导入）
#[tauri::command]
pub async fn move_file_to_workspace(
    source_path: String,
    workspace_path: String,
) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    let dest_dir = PathBuf::from(&workspace_path);
    
    // 检查源文件是否存在
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }
    
    // 检查目标目录是否存在
    if !dest_dir.exists() {
        return Err(format!("目标目录不存在: {}", workspace_path));
    }
    
    // 获取文件名
    let file_name = source.file_name()
        .ok_or_else(|| format!("无法获取文件名: {}", source_path))?
        .to_string_lossy()
        .to_string();
    
    let dest = dest_dir.join(&file_name);
    
    // 检查目标文件是否已存在
    if dest.exists() {
        // 如果已存在，添加时间戳后缀
        let stem = source.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let ext = source.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_default();
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        
        let new_name = format!("{}_{}{}", stem, timestamp, ext);
        let dest = dest_dir.join(&new_name);
        
        // 复制文件（跨分区时）
        std::fs::copy(&source, &dest)
            .map_err(|e| format!("复制文件失败: {}", e))?;
        
        // 尝试删除源文件（如果失败也不影响，因为已经复制成功）
        let _ = std::fs::remove_file(&source);
        
        Ok(dest.to_string_lossy().to_string())
    } else {
        // 尝试直接移动（同一分区）
        match std::fs::rename(&source, &dest) {
            Ok(_) => Ok(dest.to_string_lossy().to_string()),
            Err(_) => {
                // 如果移动失败（可能是跨分区），则复制后删除
                std::fs::copy(&source, &dest)
                    .map_err(|e| format!("复制文件失败: {}", e))?;
                std::fs::remove_file(&source)
                    .map_err(|e| format!("删除源文件失败: {}", e))?;
                Ok(dest.to_string_lossy().to_string())
            }
        }
    }
}

// ⚠️ Week 18.2：重命名文件或文件夹
#[tauri::command]
pub async fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let source = PathBuf::from(&path);
    let parent = source.parent()
        .ok_or_else(|| format!("无法获取父目录: {}", path))?;
    let dest = parent.join(&new_name);
    
    if dest.exists() {
        return Err(format!("文件已存在: {}", new_name));
    }
    
    std::fs::rename(&source, &dest)
        .map_err(|e| format!("重命名失败: {}", e))?;
    
    Ok(())
}

// ⚠️ Week 18.2：删除文件或文件夹
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    
    if !path_buf.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    if path_buf.is_dir() {
        std::fs::remove_dir_all(&path_buf)
            .map_err(|e| format!("删除文件夹失败: {}", e))?;
    } else {
        std::fs::remove_file(&path_buf)
            .map_err(|e| format!("删除文件失败: {}", e))?;
    }
    
    Ok(())
}

// ⚠️ Week 18.2：复制文件
#[tauri::command]
pub async fn duplicate_file(path: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    
    if !source.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    if source.is_dir() {
        return Err("暂不支持复制文件夹".to_string());
    }
    
    let parent = source.parent()
        .ok_or_else(|| format!("无法获取父目录: {}", path))?;
    
    let file_stem = source.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let extension = source.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();
    
    // 生成副本名称：原文件名_copy.扩展名
    let mut copy_name = format!("{}_copy{}", file_stem, extension);
    let mut dest = parent.join(&copy_name);
    
    // 如果副本已存在，添加数字后缀
    let mut counter = 1;
    while dest.exists() {
        copy_name = format!("{}_copy_{}{}", file_stem, counter, extension);
        dest = parent.join(&copy_name);
        counter += 1;
    }
    
    std::fs::copy(&source, &dest)
        .map_err(|e| format!("复制文件失败: {}", e))?;
    
    Ok(dest.to_string_lossy().to_string())
}
