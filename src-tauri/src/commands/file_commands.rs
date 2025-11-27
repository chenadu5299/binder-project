use crate::services::file_tree::{FileTreeService, FileTreeNode};
use crate::services::workspace::WorkspaceService;
use crate::services::file_watcher::FileWatcherService;
use std::path::PathBuf;
use std::sync::Mutex;
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
    std::fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
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
pub async fn load_workspaces() -> Result<Vec<String>, String> {
    let service = WorkspaceService::new()?;
    let workspaces = service.load_workspaces()?;
    // 只返回路径列表
    Ok(workspaces.into_iter().map(|w| w.path).collect())
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
    let mut watcher_service = watcher.lock().unwrap();
    let workspace_path = PathBuf::from(&path);
    watcher_service.watch_workspace(workspace_path)?;
    
    // 订阅文件变化事件
    let mut rx = watcher_service.subscribe();
    let app_handle = app.clone();
    let path_clone = path.clone();
    
    tokio::spawn(async move {
        while let Ok(_event) = rx.recv().await {
            // 发送文件树变化事件到前端
            app_handle.emit("file-tree-changed", &path_clone).unwrap_or_else(|e| {
                eprintln!("发送文件树变化事件失败: {}", e);
            });
        }
    });
    
    Ok(())
}
