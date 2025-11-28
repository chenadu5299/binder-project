use crate::services::file_classifier::{FileClassifierService, FileClassification};
use crate::services::ai_service::AIService;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

// AI 服务状态（全局单例）
type AIServiceState = Arc<Mutex<AIService>>;

// ⚠️ Week 20.2：批量分类文件
#[tauri::command]
pub async fn classify_files(
    file_paths: Vec<String>,
    workspace_path: String,
    service: State<'_, AIServiceState>,
) -> Result<Vec<FileClassification>, String> {
    let files: Vec<PathBuf> = file_paths.iter().map(PathBuf::from).collect();
    let workspace = PathBuf::from(&workspace_path);
    
    // 获取 AI provider
    let provider = {
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        // 优先使用 DeepSeek，如果没有则使用 OpenAI
        service_guard.get_provider("deepseek")
            .or_else(|| service_guard.get_provider("openai"))
            .ok_or_else(|| "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string())?
    };
    
    FileClassifierService::classify_files(provider, files, &workspace).await
        .map_err(|e| format!("分类文件失败: {}", e))
}

// ⚠️ Week 20.3：整理文件（分类并移动）
#[tauri::command]
pub async fn organize_files(
    file_paths: Vec<String>,
    workspace_path: String,
    service: State<'_, AIServiceState>,
) -> Result<Vec<FileMoveResult>, String> {
    use std::fs;
    
    let files: Vec<PathBuf> = file_paths.iter().map(PathBuf::from).collect();
    let workspace = PathBuf::from(&workspace_path);
    
    // 获取 AI provider
    let provider = {
        let service_guard = service.lock()
            .map_err(|e| format!("获取 AI 服务失败: {}", e))?;
        // 优先使用 DeepSeek，如果没有则使用 OpenAI
        service_guard.get_provider("deepseek")
            .or_else(|| service_guard.get_provider("openai"))
            .ok_or_else(|| "未配置任何 AI 提供商，请先配置 DeepSeek 或 OpenAI API key".to_string())?
    };
    
    // 先分类文件
    let classifications = FileClassifierService::classify_files(provider, files.clone(), &workspace).await
        .map_err(|e| format!("分类文件失败: {}", e))?;
    
    let mut results = Vec::new();
    
    // 移动文件到分类文件夹
    for (file_path, classification) in file_paths.iter().zip(classifications.iter()) {
        let source = PathBuf::from(file_path);
        let category_dir = workspace.join(&classification.category);
        
        // 创建分类文件夹（如果不存在）
        if let Err(e) = fs::create_dir_all(&category_dir) {
            results.push(FileMoveResult {
                file_path: file_path.clone(),
                success: false,
                message: format!("创建文件夹失败: {}", e),
            });
            continue;
        }
        
        let file_name = source.file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", file_path))?;
        let dest = category_dir.join(file_name);
        
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
            let dest = category_dir.join(&new_name);
            
            // 移动文件
            match fs::rename(&source, &dest) {
                Ok(_) => {
                    results.push(FileMoveResult {
                        file_path: file_path.clone(),
                        success: true,
                        message: format!("已移动到 {}/{}", classification.category, new_name),
                    });
                }
                Err(e) => {
                    results.push(FileMoveResult {
                        file_path: file_path.clone(),
                        success: false,
                        message: format!("移动失败: {}", e),
                    });
                }
            }
        } else {
            // 移动文件
            match fs::rename(&source, &dest) {
                Ok(_) => {
                    results.push(FileMoveResult {
                        file_path: file_path.clone(),
                        success: true,
                        message: format!("已移动到 {}", classification.category),
                    });
                }
                Err(e) => {
                    results.push(FileMoveResult {
                        file_path: file_path.clone(),
                        success: false,
                        message: format!("移动失败: {}", e),
                    });
                }
            }
        }
    }
    
    Ok(results)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileMoveResult {
    pub file_path: String,
    pub success: bool,
    pub message: String,
}

