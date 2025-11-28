use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};
use crate::services::ai_providers::AIProvider;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileClassification {
    pub file_path: String,
    pub category: String,
    pub reason: String,
    pub confidence: f64,
}

pub struct FileClassifierService;

impl FileClassifierService {
    pub fn new() -> Self {
        Self
    }
    
    // ⚠️ Week 20.1：提取文件内容（纯文本）
    pub fn extract_text_content(path: &Path) -> Result<String, String> {
        let ext = path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        match ext.as_str() {
            "txt" | "md" | "html" | "htm" | "css" | "js" | "ts" | "json" | "xml" | "yaml" | "yml" => {
                fs::read_to_string(path)
                    .map_err(|e| format!("读取文件失败: {}", e))
            }
            _ => {
                // 尝试作为文本读取（UTF-8）
                fs::read_to_string(path)
                    .map_err(|e| format!("读取文件失败: {}", e))
            }
        }
    }
    
    // ⚠️ Week 20.1：获取现有文件夹列表
    pub fn get_existing_folders(workspace_path: &Path) -> Result<Vec<String>, String> {
        let mut folders = Vec::new();
        
        if let Ok(entries) = fs::read_dir(workspace_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        // 忽略隐藏文件夹和系统文件夹
                        if !name.starts_with('.') && name != "node_modules" && name != "target" {
                            folders.push(name.to_string());
                        }
                    }
                }
            }
        }
        
        Ok(folders)
    }
    
    // ⚠️ Week 20.2：使用 AI 分类文件
    pub async fn classify_file_with_ai(
        provider: Arc<dyn AIProvider>,
        path: &Path,
        content: &str,
        existing_folders: &[String],
    ) -> Result<FileClassification, String> {
        
        // 构建分类提示词
        let content_preview = content.chars().take(2000).collect::<String>();
        let folders_list = if existing_folders.is_empty() {
            "无现有文件夹".to_string()
        } else {
            existing_folders.join("、")
        };
        
        let prompt = format!(
            r#"请分析以下文件内容，并建议将其分类到哪个文件夹。

文件路径：{}
文件内容（前 2000 字符）：
{}

现有文件夹：{}

请根据文件内容、文件名和路径，建议一个合适的文件夹名称。如果现有文件夹都不合适，可以建议创建新文件夹。

请返回 JSON 格式（必须是有效的 JSON）：
{{
    "category": "文件夹名称（建议使用中文，如：文档、代码、图片、设计等）",
    "reason": "分类原因（简短说明）",
    "confidence": 0.9
}}

只返回 JSON，不要其他文字。"#,
            path.display(),
            content_preview,
            folders_list
        );
        
        // 调用 AI 服务进行聊天（使用 chat_stream 并收集响应）
        let messages = vec![
            crate::services::ai_providers::ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }
        ];
        
        // 使用 inline_assist 方法进行简单分类（更简单且不需要流式处理）
        let instruction = format!(
            "分析以下文件内容，并建议将其分类到哪个文件夹。\n\n文件路径：{}\n文件内容（前 2000 字符）：\n{}\n\n现有文件夹：{}\n\n请根据文件内容、文件名和路径，建议一个合适的文件夹名称。如果现有文件夹都不合适，可以建议创建新文件夹。\n\n请返回 JSON 格式（必须是有效的 JSON）：\n{{\n    \"category\": \"文件夹名称（建议使用中文，如：文档、代码、图片、设计等）\",\n    \"reason\": \"分类原因（简短说明）\",\n    \"confidence\": 0.9\n}}\n\n只返回 JSON，不要其他文字。",
            path.display(),
            content_preview,
            folders_list
        );
        
        let response = provider.inline_assist(&instruction, "", "").await
            .map_err(|e| format!("AI 分类失败: {}", e))?;
        
        // 尝试从响应中提取 JSON
        let json_start = response.find('{').unwrap_or(0);
        let json_end = response.rfind('}').map(|i| i + 1).unwrap_or(response.len());
        let json_str = &response[json_start..json_end];
        
        // 解析 JSON 响应
        let mut classification: FileClassification = serde_json::from_str(json_str)
            .map_err(|e| format!("解析 AI 响应失败: {}，响应内容: {}", e, response))?;
        
        // 设置文件路径
        classification.file_path = path.to_string_lossy().to_string();
        
        Ok(classification)
    }
    
    // ⚠️ Week 20.2：批量分类文件
    pub async fn classify_files(
        provider: Arc<dyn AIProvider>,
        files: Vec<PathBuf>,
        workspace_path: &Path,
    ) -> Result<Vec<FileClassification>, String> {
        // 获取现有文件夹列表
        let existing_folders = Self::get_existing_folders(workspace_path)?;
        
        let mut classifications = Vec::new();
        
        for file in files {
            // 提取文件内容
            match Self::extract_text_content(&file) {
                Ok(content) => {
                    // 使用 AI 分类
                    match Self::classify_file_with_ai(provider.clone(), &file, &content, &existing_folders).await {
                        Ok(classification) => {
                            classifications.push(classification);
                        }
                        Err(e) => {
                            eprintln!("分类文件失败 {}: {}", file.display(), e);
                            // 使用默认分类
                            classifications.push(FileClassification {
                                file_path: file.to_string_lossy().to_string(),
                                category: "未分类".to_string(),
                                reason: format!("分类失败: {}", e),
                                confidence: 0.0,
                            });
                        }
                    }
                }
                Err(e) => {
                    eprintln!("读取文件失败 {}: {}", file.display(), e);
                    // 使用默认分类
                    classifications.push(FileClassification {
                        file_path: file.to_string_lossy().to_string(),
                        category: "未分类".to_string(),
                        reason: format!("无法读取文件: {}", e),
                        confidence: 0.0,
                    });
                }
            }
        }
        
        Ok(classifications)
    }
}

