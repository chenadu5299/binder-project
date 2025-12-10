use crate::services::file_tree::{FileTreeService, FileTreeNode};
use crate::services::workspace::{WorkspaceService, Workspace};
use crate::services::file_watcher::FileWatcherService;
use crate::services::file_system::FileSystemService;
use crate::services::pandoc_service::PandocService;
use crate::services::libreoffice_service::LibreOfficeService;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::{State, Emitter, AppHandle};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

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
    
    // 检查文件扩展名，如果是 DOCX，需要特殊处理
    let ext = path_buf.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());
    
    if ext.as_deref() == Some("docx") {
        // DOCX 文件：使用 Pandoc 创建空 DOCX 文件
        use crate::services::pandoc_service::PandocService;
        let pandoc_service = PandocService::new();
        
        if !pandoc_service.is_available() {
            return Err("Pandoc 不可用，无法创建 DOCX 文件。请安装 Pandoc 或使用其他格式。".to_string());
        }
        
        // 创建空 HTML 内容
        let empty_html = "<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"UTF-8\">\n  <title>新文档</title>\n</head>\n<body>\n  <h1>新文档</h1>\n</body>\n</html>";
        
        // 使用 Pandoc 转换为 DOCX
        match pandoc_service.convert_html_to_docx(empty_html, &path_buf) {
            Ok(_) => {
                eprintln!("[create_file] DOCX 文件创建成功: {}", path);
                Ok(())
            }
            Err(e) => {
                eprintln!("[create_file] DOCX 文件创建失败: {}", e);
                Err(format!("创建 DOCX 文件失败: {}", e))
            }
        }
    } else {
        // 其他文件：直接写入文本内容
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

// 工作区内移动文件或文件夹
#[tauri::command]
pub async fn move_file(
    source_path: String,
    destination_path: String,
    workspace_path: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    let dest = PathBuf::from(&destination_path);
    
    // 检查源文件是否存在
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }
    
    // 检查目标文件是否已存在
    if dest.exists() {
        return Err(format!("目标文件已存在: {}", destination_path));
    }
    
    // 检查是否尝试移动到自己的子目录
    if dest.starts_with(&source) {
        return Err("不能将文件移动到自己的子目录中".to_string());
    }
    
    // 创建目标目录的父目录（如果不存在）
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目标目录失败: {}", e))?;
    }
    
    // 移动文件或文件夹
    if source.is_dir() {
        // 移动文件夹
        match std::fs::rename(&source, &dest) {
            Ok(_) => {}
            Err(_) => {
                // 如果 rename 失败（可能是跨分区），尝试复制后删除
                copy_dir_all(&source, &dest)
                    .map_err(|e| format!("移动文件夹失败: {}", e))?;
                std::fs::remove_dir_all(&source)
                    .map_err(|e| format!("删除源文件夹失败: {}", e))?;
            }
        }
    } else {
        // 移动文件
        match std::fs::rename(&source, &dest) {
            Ok(_) => {}
            Err(_) => {
                // 如果 rename 失败（可能是跨分区），尝试复制后删除
                std::fs::copy(&source, &dest)
                    .map_err(|e| format!("复制文件失败: {}", e))?;
                std::fs::remove_file(&source)
                    .map_err(|e| format!("删除源文件失败: {}", e))?;
            }
        }
    }
    
    // 触发文件树变化事件
    if let Some(ws_path) = workspace_path {
        let _ = app.emit("file-tree-changed", ws_path);
    } else if let Some(parent) = source.parent() {
        // 如果没有提供工作区路径，尝试从源路径推断（使用父目录作为工作区）
        let workspace_str = parent.to_string_lossy().to_string();
        let _ = app.emit("file-tree-changed", workspace_str);
    }
    
    Ok(())
}

// 递归复制目录的辅助函数
fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("创建目标目录失败: {}", e))?;
    
    let entries = std::fs::read_dir(src)
        .map_err(|e| format!("读取源目录失败: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dest_path = dst.join(&file_name);
        
        if path.is_dir() {
            copy_dir_all(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)
                .map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    
    Ok(())
}

/// 检查 Pandoc 是否可用
#[tauri::command]
pub async fn check_pandoc_available() -> Result<serde_json::Value, String> {
    let pandoc_service = PandocService::new();
    
    let is_available = pandoc_service.is_available();
    let is_bundled = if is_available {
        pandoc_service.is_bundled()
    } else {
        false
    };
    
    let path = pandoc_service.get_path()
        .map(|p| p.to_string_lossy().to_string());
    
    Ok(serde_json::json!({
        "available": is_available,
        "is_bundled": is_bundled,
        "path": path,
    }))
}

/// 打开 DOCX 文件进行编辑（使用 Pandoc 转换）
/// 返回 HTML 内容，供 TipTap 编辑器使用
#[tauri::command]
pub async fn open_docx_for_edit(path: String) -> Result<String, String> {
    let docx_path = PathBuf::from(&path);
    
    // 1. 检查文件是否存在
    if !docx_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    // 2. 检查文件大小（限制 100MB）
    let metadata = std::fs::metadata(&docx_path)
        .map_err(|e| format!("获取文件信息失败: {}", e))?;
    let file_size = metadata.len();
    const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100MB
    
    if file_size > MAX_FILE_SIZE {
        return Err(format!(
            "文件过大（{:.2} MB），超过限制（100 MB）。请使用较小的文件。",
            file_size as f64 / 1024.0 / 1024.0
        ));
    }
    
    eprintln!("📂 [open_docx_for_edit] 开始打开 DOCX 文件进行编辑（测试：使用 Pandoc 方案）: {}", path);
    
    // 3. 使用 Pandoc 方案（与预览模式相同）
    let pandoc_service = PandocService::new();
    
    if !pandoc_service.is_available() {
        return Err("Pandoc 不可用，请安装 Pandoc 或确保内置 Pandoc 可用。\n访问 https://pandoc.org/installing.html 获取安装指南。".to_string());
    }
    
    // 4. 转换 DOCX 到 HTML（使用与预览模式相同的逻辑）
    let html = pandoc_service.convert_document_to_html(&docx_path)?;
    
    eprintln!("✅ [open_docx_for_edit] Pandoc 转换完成，HTML 长度: {} 字符", html.len());
    
    Ok(html)
}

/// 创建 DOCX 文件的草稿副本
/// 返回草稿文件路径
#[tauri::command]
pub async fn create_draft_docx(original_path: String) -> Result<String, String> {
    let original = PathBuf::from(&original_path);
    
    if !original.exists() {
        return Err(format!("原文件不存在: {}", original_path));
    }
    
    // 生成草稿文件路径：document.docx -> document.draft.docx
    let parent = original.parent()
        .ok_or_else(|| "无法获取文件父目录".to_string())?;
    let stem = original.file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法获取文件名".to_string())?;
    
    let draft_path = parent.join(format!("{}.draft.docx", stem));
    
    // 如果草稿文件已存在，先删除
    if draft_path.exists() {
        std::fs::remove_file(&draft_path)
            .map_err(|e| format!("删除已存在的草稿文件失败: {}", e))?;
    }
    
    // 复制原文件到草稿文件
    std::fs::copy(&original, &draft_path)
        .map_err(|e| format!("创建草稿文件失败: {}", e))?;
    
    // 注意：草稿文件保持原格式，不需要立即转换
    // 转换在打开时进行（open_docx），这样可以确保使用最新的 Pandoc 转换逻辑
    
    Ok(draft_path.to_string_lossy().to_string())
}

/// 创建文件的草稿副本（通用方法，支持所有文件类型）
/// 返回草稿文件路径
#[tauri::command]
pub async fn create_draft_file(original_path: String) -> Result<String, String> {
    let original = PathBuf::from(&original_path);
    
    if !original.exists() {
        return Err(format!("原文件不存在: {}", original_path));
    }
    
    // 生成草稿文件路径：document.html -> document.draft.html
    let parent = original.parent()
        .ok_or_else(|| "无法获取文件父目录".to_string())?;
    let stem = original.file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法获取文件名".to_string())?;
    let extension = original.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    
    let draft_path = if extension.is_empty() {
        parent.join(format!("{}.draft", stem))
    } else {
        parent.join(format!("{}.draft.{}", stem, extension))
    };
    
    // 如果草稿文件已存在，先删除
    if draft_path.exists() {
        std::fs::remove_file(&draft_path)
            .map_err(|e| format!("删除已存在的草稿文件失败: {}", e))?;
    }
    
    // 复制原文件到草稿文件（保持原格式）
    std::fs::copy(&original, &draft_path)
        .map_err(|e| format!("创建草稿文件失败: {}", e))?;
    
    Ok(draft_path.to_string_lossy().to_string())
}

/// 保存 DOCX 文件（将 HTML 内容转换为 DOCX）
/// 列出文件夹内的所有文件路径（递归）
#[tauri::command]
pub async fn list_folder_files(path: String) -> Result<Vec<String>, String> {
    let folder_path = PathBuf::from(&path);
    
    if !folder_path.exists() {
        return Err(format!("文件夹不存在: {}", path));
    }
    
    if !folder_path.is_dir() {
        return Err(format!("路径不是文件夹: {}", path));
    }
    
    let mut files = Vec::new();
    let mut dirs = vec![folder_path.clone()];
    
    // 递归遍历所有子目录
    while let Some(current_dir) = dirs.pop() {
        let entries = std::fs::read_dir(&current_dir)
            .map_err(|e| format!("读取目录失败: {}", e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let entry_path = entry.path();
            
            // 跳过隐藏文件
            if let Some(name) = entry_path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.') && name_str != "." && name_str != ".." {
                    continue;
                }
            }
            
            if entry_path.is_dir() {
                // 如果是目录，加入待处理列表
                dirs.push(entry_path);
            } else {
                // 如果是文件，加入文件列表
                files.push(entry_path.to_string_lossy().to_string());
            }
        }
    }
    
    Ok(files)
}

/// 保存外部文件到临时目录（用于文件引用）
#[tauri::command]
pub async fn save_external_file(
    workspace_path: String,
    file_data: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    let workspace = PathBuf::from(&workspace_path);
    
    // 1. 确定临时文件目录（工作区根目录下的 .binder/temp 目录）
    let temp_dir = workspace.join(".binder").join("temp");
    
    // 2. 创建临时目录（如果不存在）
    if !temp_dir.exists() {
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("创建临时目录失败: {}", e))?;
    }
    
    // 3. 生成唯一文件名（时间戳 + UUID + 原文件名）
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("获取时间戳失败: {}", e))?
        .as_secs();
    
    let uuid = Uuid::new_v4();
    
    // 清理文件名（移除特殊字符，保留扩展名）
    let sanitized_name = file_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>();
    
    let file_name_without_ext = Path::new(&sanitized_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = Path::new(&sanitized_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    
    let final_file_name = if !ext.is_empty() {
        format!("{}_{}_{}.{}", timestamp, uuid, file_name_without_ext, ext)
    } else {
        format!("{}_{}_{}", timestamp, uuid, file_name_without_ext)
    };
    
    let temp_file_path = temp_dir.join(&final_file_name);
    
    // 4. 写入文件
    std::fs::write(&temp_file_path, file_data)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    
    // 5. 返回相对路径（相对于工作区）
    let relative_path = temp_file_path
        .strip_prefix(&workspace)
        .map_err(|e| format!("获取相对路径失败: {}", e))?
        .to_string_lossy()
        .to_string();
    
    Ok(relative_path)
}

/// 清理临时文件
/// 删除指定的临时文件（用于文件引用）
#[tauri::command]
pub async fn cleanup_temp_files(
    workspace_path: String,
    file_paths: Vec<String>,
) -> Result<usize, String> {
    let workspace = PathBuf::from(&workspace_path);
    let mut cleaned_count = 0;
    
    for file_path in file_paths {
        let full_path = workspace.join(&file_path);
        
        // 验证路径安全性：确保路径在 .binder/temp 目录下
        if !file_path.starts_with(".binder/temp/") {
            eprintln!("⚠️ 跳过不安全的路径: {}", file_path);
            continue;
        }
        
        // 删除文件
        if full_path.exists() && full_path.is_file() {
            match std::fs::remove_file(&full_path) {
                Ok(_) => {
                    cleaned_count += 1;
                    eprintln!("✅ 已清理临时文件: {}", file_path);
                }
                Err(e) => {
                    eprintln!("⚠️ 清理临时文件失败: {} - {}", file_path, e);
                }
            }
        }
    }
    
    Ok(cleaned_count)
}

/// 清理过期的临时文件（超过指定时间的文件）
#[tauri::command]
pub async fn cleanup_expired_temp_files(
    workspace_path: String,
    max_age_hours: u64,
) -> Result<usize, String> {
    let workspace = PathBuf::from(&workspace_path);
    let temp_dir = workspace.join(".binder").join("temp");
    
    if !temp_dir.exists() {
        return Ok(0);
    }
    
    let max_age = std::time::Duration::from_secs(max_age_hours * 3600);
    let now = SystemTime::now();
    let mut cleaned_count = 0;
    
    // 遍历临时目录中的所有文件
    let entries = std::fs::read_dir(&temp_dir)
        .map_err(|e| format!("读取临时目录失败: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();
        
        if !path.is_file() {
            continue;
        }
        
        // 获取文件修改时间
        if let Ok(metadata) = path.metadata() {
            if let Ok(modified) = metadata.modified() {
                if let Ok(age) = now.duration_since(modified) {
                    // 如果文件超过指定时间，删除它
                    if age > max_age {
                        match std::fs::remove_file(&path) {
                            Ok(_) => {
                                cleaned_count += 1;
                                eprintln!("✅ 已清理过期临时文件: {:?}", path);
                            }
                            Err(e) => {
                                eprintln!("⚠️ 清理过期临时文件失败: {:?} - {}", path, e);
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(cleaned_count)
}

/// 清理所有临时文件（谨慎使用）
#[tauri::command]
pub async fn cleanup_all_temp_files(workspace_path: String) -> Result<usize, String> {
    let workspace = PathBuf::from(&workspace_path);
    let temp_dir = workspace.join(".binder").join("temp");
    
    if !temp_dir.exists() {
        return Ok(0);
    }
    
    let mut cleaned_count = 0;
    
    // 遍历临时目录中的所有文件
    let entries = std::fs::read_dir(&temp_dir)
        .map_err(|e| format!("读取临时目录失败: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();
        
        if path.is_file() {
            match std::fs::remove_file(&path) {
                Ok(_) => {
                    cleaned_count += 1;
                }
                Err(e) => {
                    eprintln!("⚠️ 清理临时文件失败: {:?} - {}", path, e);
                }
            }
        }
    }
    
    Ok(cleaned_count)
}

#[tauri::command]
pub async fn save_docx(path: String, html_content: String, app: tauri::AppHandle) -> Result<(), String> {
    let pandoc_service = PandocService::new();
    
    if !pandoc_service.is_available() {
        return Err("Pandoc 不可用，请安装 Pandoc 以支持 DOCX 文件".to_string());
    }
    
    let docx_path = PathBuf::from(&path);
    
    // 触发开始事件
    app.emit("fs-save-progress", serde_json::json!({
        "file_path": path,
        "status": "started",
        "progress": 0,
    })).map_err(|e| format!("发送进度事件失败: {}", e))?;
    
    // 转换 HTML 到 DOCX
    app.emit("fs-save-progress", serde_json::json!({
        "file_path": path,
        "status": "converting",
        "progress": 50,
    })).map_err(|e| format!("发送进度事件失败: {}", e))?;
    
    pandoc_service.convert_html_to_docx(&html_content, &docx_path)?;
    
    // 触发完成事件
    app.emit("fs-save-progress", serde_json::json!({
        "file_path": path,
        "status": "completed",
        "progress": 100,
    })).map_err(|e| format!("发送进度事件失败: {}", e))?;
    
    Ok(())
}

// ==================== 预览相关命令 ====================

/// 预览 DOCX 文件为 PDF（新方案）
/// 
/// **功能**：转换 DOCX → PDF，返回 PDF 文件路径
/// 
/// **使用场景**：
/// - DocxPdfPreview 组件内部调用
/// - 预览模式（isReadOnly = true）
/// 
/// **返回**：PDF 文件路径（file:// 绝对路径）
/// 
/// **缓存机制**：
/// - 缓存键：文件路径 + 修改时间
/// - 缓存过期：1 小时
/// - 缓存位置：应用缓存目录
#[tauri::command]
pub async fn preview_docx_as_pdf(
    path: String,
    app: AppHandle,
) -> Result<String, String> {
    let docx_path = PathBuf::from(&path);
    
    // 检查文件是否存在
    if !docx_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    eprintln!("🔍 [preview_docx_as_pdf] 开始预览: {:?}", docx_path);
    
    // 发送预览进度事件：开始
    app.emit("preview-progress", serde_json::json!({
        "status": "started",
        "message": "正在预览..."
    })).ok();
    
    // 创建 LibreOffice 服务
    let lo_service = LibreOfficeService::new()
        .map_err(|e| {
            let error_msg = format!("LibreOffice 服务初始化失败: {}", e);
            app.emit("preview-progress", serde_json::json!({
                "status": "failed",
                "message": &error_msg
            })).ok();
            error_msg
        })?;
    
    // 检查 LibreOffice 是否可用（获取实际错误消息）
    let libreoffice_path_result = lo_service.get_libreoffice_path();
    if libreoffice_path_result.is_err() {
        let error_msg = libreoffice_path_result.unwrap_err();
        app.emit("preview-progress", serde_json::json!({
            "status": "failed",
            "message": &error_msg
        })).ok();
        return Err(error_msg);
    }
    
    // 发送预览进度事件：预览中
    app.emit("preview-progress", serde_json::json!({
        "status": "converting",
        "message": "正在预览..."
    })).ok();
    
    // 执行转换（带超时：30秒）
    let docx_path_clone = docx_path.clone();
    let lo_service_arc = Arc::new(lo_service);
    let pdf_path_result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            lo_service_arc.convert_docx_to_pdf(&docx_path_clone)
        })
    ).await;
    
    let pdf_path = match pdf_path_result {
        Ok(Ok(Ok(path))) => path,
        Ok(Ok(Err(e))) => {
            // 转换失败
            let error_msg = format!("预览失败: {}", e);
            app.emit("preview-progress", serde_json::json!({
                "status": "failed",
                "message": &error_msg
            })).ok();
            return Err(error_msg);
        }
        Ok(Err(e)) => {
            // spawn_blocking 失败
            let error_msg = format!("预览失败: {}", e);
            app.emit("preview-progress", serde_json::json!({
                "status": "failed",
                "message": &error_msg
            })).ok();
            return Err(error_msg);
        }
        Err(_) => {
            // 超时
            let error_msg = "预览失败，你的文件过大或存在无法预览的格式，请调整文档。".to_string();
            app.emit("preview-progress", serde_json::json!({
                "status": "failed",
                "message": &error_msg
            })).ok();
            eprintln!("⏱️ [preview_docx_as_pdf] 预览超时（30秒）");
            return Err(error_msg);
        }
    };
    
    // 转换为 file:// URL
    let pdf_url = format!("file://{}", pdf_path.to_string_lossy());
    
    eprintln!("✅ [preview_docx_as_pdf] 转换完成: {}", pdf_url);
    
    // 发送预览进度事件：完成
    app.emit("preview-progress", serde_json::json!({
        "status": "completed",
        "message": "预览完成",
        "pdf_path": &pdf_url
    })).ok();
    
    Ok(pdf_url)
}

