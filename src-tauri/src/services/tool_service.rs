// 工具调用服务
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use crate::utils::path_validator::PathValidator;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub message: Option<String>,
}

pub struct ToolService;

impl ToolService {
    pub fn new() -> Self {
        ToolService
    }

    /// 执行工具调用
    pub async fn execute_tool(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        // 验证工作区路径
        if !workspace_path.exists() {
            return Err("工作区路径不存在".to_string());
        }

        match tool_call.name.as_str() {
            "read_file" => self.read_file(tool_call, workspace_path).await,
            "create_file" => self.create_file(tool_call, workspace_path).await,
            "update_file" => self.update_file(tool_call, workspace_path).await,
            "delete_file" => self.delete_file(tool_call, workspace_path).await,
            "list_files" => self.list_files(tool_call, workspace_path).await,
            "search_files" => self.search_files(tool_call, workspace_path).await,
            "move_file" => self.move_file(tool_call, workspace_path).await,
            "rename_file" => self.rename_file(tool_call, workspace_path).await,
            "create_folder" => self.create_folder(tool_call, workspace_path).await,
            "get_current_editor_file" => self.get_current_editor_file(tool_call).await,
            "edit_current_editor_document" => self.edit_current_editor_document(tool_call).await,
            _ => Err(format!("未知的工具: {}", tool_call.name)),
        }
    }

    /// 读取文件内容
    async fn read_file(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let file_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 path 参数".to_string())?;

        let full_path = workspace_path.join(file_path);

        // 验证路径安全性
        // 检查路径是否包含 .. 或其他不安全字符
        if file_path.contains("..") || file_path.contains("/") && file_path.starts_with("/") {
            return Err("路径不安全".to_string());
        }
        
        // 对于已存在的文件，使用 PathValidator 验证
        if full_path.exists() {
            if PathValidator::validate_workspace_path(&full_path, workspace_path).is_err() {
                return Err("路径不安全".to_string());
            }
        } else {
            // 对于不存在的文件，检查父目录是否在工作区内
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if PathValidator::validate_workspace_path(parent, workspace_path).is_err() {
                        return Err("路径不安全".to_string());
                    }
                } else {
                    // 如果父目录也不存在，检查路径是否在工作区根目录下
                    if !full_path.starts_with(workspace_path) {
                        return Err("路径不安全".to_string());
                    }
                }
            }
        }

        // 检查文件是否存在
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("文件不存在: {}", file_path)),
                message: None,
            });
        }

        // 检查文件扩展名，如果是 DOCX，需要使用 Pandoc 转换
        let ext = full_path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        
        if ext.as_deref() == Some("docx") || file_path.ends_with(".draft.docx") {
            // DOCX 文件：使用 Pandoc 转换为纯文本
            use crate::services::pandoc_service::PandocService;
            let pandoc_service = PandocService::new();
            
            if !pandoc_service.is_available() {
                return Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some("Pandoc 不可用，无法读取 DOCX 文件。请安装 Pandoc 或使用其他格式。".to_string()),
                    message: None,
                });
            }
            
            // 使用 Pandoc 将 DOCX 转换为 HTML（不设置工作目录，保持原行为）
            match pandoc_service.convert_document_to_html(&full_path, None) {
                Ok(html_content) => {
                    // 从 HTML 中提取纯文本（简单处理）
                    // 注意：这里返回的是 HTML，如果需要纯文本，可以进一步处理
                    // 但为了保持兼容性，先返回 HTML
                    Ok(ToolResult {
                        success: true,
                        data: Some(serde_json::json!({
                            "path": file_path,
                            "content": html_content,
                            "size": html_content.len(),
                            "format": "html",
                        })),
                        error: None,
                        message: Some(format!("成功读取 DOCX 文件（已转换为 HTML）: {}", file_path)),
                    })
                },
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("读取 DOCX 文件失败: {}", e)),
                    message: None,
                }),
            }
        } else {
            // 普通文本文件：直接读取
            match std::fs::read_to_string(&full_path) {
                Ok(content) => Ok(ToolResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "path": file_path,
                        "content": content,
                        "size": content.len(),
                    })),
                    error: None,
                    message: Some(format!("成功读取文件: {}", file_path)),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("读取文件失败: {}", e)),
                    message: None,
                }),
            }
        }
    }

    /// 创建文件（原子写入）
    async fn create_file(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        eprintln!("🔧 create_file 调用参数: {}", serde_json::to_string(&tool_call.arguments).unwrap_or_default());
        
        let file_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                eprintln!("❌ create_file 缺少 path 参数，arguments: {:?}", tool_call.arguments);
                "缺少 path 参数".to_string()
            })?;

        // content 可以为空字符串，但不能缺失
        let content = tool_call
            .arguments
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or(""); // 如果 content 不存在，使用空字符串

        let full_path = workspace_path.join(file_path);

        // 验证路径安全性
        // 检查路径是否包含 .. 或其他不安全字符
        if file_path.contains("..") || file_path.contains("/") && file_path.starts_with("/") {
            return Err("路径不安全".to_string());
        }
        
        // 对于已存在的文件，使用 PathValidator 验证
        if full_path.exists() {
            if PathValidator::validate_workspace_path(&full_path, workspace_path).is_err() {
                return Err("路径不安全".to_string());
            }
        } else {
            // 对于不存在的文件，检查父目录是否在工作区内
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if PathValidator::validate_workspace_path(parent, workspace_path).is_err() {
                        return Err("路径不安全".to_string());
                    }
                } else {
                    // 如果父目录也不存在，检查路径是否在工作区根目录下
                    if !full_path.starts_with(workspace_path) {
                        return Err("路径不安全".to_string());
                    }
                }
            }
        }

        // 检查文件是否已存在
        if full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("文件已存在: {}", file_path)),
                message: None,
            });
        }

        // 创建父目录
        if let Some(parent) = full_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("创建目录失败: {}", e)),
                    message: None,
                });
            }
        }

        // 检查文件扩展名，如果是 DOCX，需要特殊处理
        let ext = full_path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase());
        
        if ext.as_deref() == Some("docx") {
            // DOCX 文件：使用 Pandoc 将内容转换为 DOCX 格式
            use crate::services::pandoc_service::PandocService;
            let pandoc_service = PandocService::new();
            
            if !pandoc_service.is_available() {
                return Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some("Pandoc 不可用，无法创建 DOCX 文件。请安装 Pandoc 或使用其他格式。".to_string()),
                    message: None,
                });
            }
            
            // 将内容（Markdown 或 HTML）转换为 DOCX
            match pandoc_service.convert_html_to_docx(&content, &full_path) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "path": file_path,
                        "format": "docx",
                    })),
                    error: None,
                    message: Some(format!("成功创建 DOCX 文件: {}", file_path)),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("转换 DOCX 失败: {}", e)),
                    message: None,
                }),
            }
        } else {
            // 其他文件：直接写入文本内容
            match self.atomic_write_file(&full_path, content.as_bytes()) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "path": file_path,
                        "size": content.len(),
                    })),
                    error: None,
                    message: Some(format!("成功创建文件: {}", file_path)),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("写入文件失败: {}", e)),
                    message: None,
                }),
            }
        }
    }

    /// 更新文件（原子写入）
    async fn update_file(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let file_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 path 参数".to_string())?;

        let content = tool_call
            .arguments
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 content 参数".to_string())?;

        let full_path = workspace_path.join(file_path);

        // 验证路径安全性
        // 检查路径是否包含 .. 或其他不安全字符
        if file_path.contains("..") || file_path.contains("/") && file_path.starts_with("/") {
            return Err("路径不安全".to_string());
        }
        
        // 对于已存在的文件，使用 PathValidator 验证
        if full_path.exists() {
            if PathValidator::validate_workspace_path(&full_path, workspace_path).is_err() {
                return Err("路径不安全".to_string());
            }
        } else {
            // 对于不存在的文件，检查父目录是否在工作区内
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if PathValidator::validate_workspace_path(parent, workspace_path).is_err() {
                        return Err("路径不安全".to_string());
                    }
                } else {
                    // 如果父目录也不存在，检查路径是否在工作区根目录下
                    if !full_path.starts_with(workspace_path) {
                        return Err("路径不安全".to_string());
                    }
                }
            }
        }

        // 检查文件是否存在
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("文件不存在: {}", file_path)),
                message: None,
            });
        }

        // 原子写入文件
        match self.atomic_write_file(&full_path, content.as_bytes()) {
            Ok(_) => Ok(ToolResult {
                success: true,
                data: Some(serde_json::json!({
                    "path": file_path,
                    "size": content.len(),
                })),
                error: None,
                message: Some(format!("成功更新文件: {}", file_path)),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("写入文件失败: {}", e)),
                message: None,
            }),
        }
    }

    /// 删除文件
    async fn delete_file(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let file_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 path 参数".to_string())?;

        let full_path = workspace_path.join(file_path);

        // 验证路径安全性
        // 检查路径是否包含 .. 或其他不安全字符
        if file_path.contains("..") || file_path.contains("/") && file_path.starts_with("/") {
            return Err("路径不安全".to_string());
        }
        
        // 对于已存在的文件，使用 PathValidator 验证
        if full_path.exists() {
            if PathValidator::validate_workspace_path(&full_path, workspace_path).is_err() {
                return Err("路径不安全".to_string());
            }
        } else {
            // 对于不存在的文件，检查父目录是否在工作区内
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if PathValidator::validate_workspace_path(parent, workspace_path).is_err() {
                        return Err("路径不安全".to_string());
                    }
                } else {
                    // 如果父目录也不存在，检查路径是否在工作区根目录下
                    if !full_path.starts_with(workspace_path) {
                        return Err("路径不安全".to_string());
                    }
                }
            }
        }

        // 检查文件或文件夹是否存在
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("文件或文件夹不存在: {}", file_path)),
                message: None,
            });
        }

        // 判断是文件还是文件夹，使用不同的删除方法
        let metadata = match std::fs::metadata(&full_path) {
            Ok(m) => m,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("无法获取文件信息: {}", e)),
                    message: None,
                });
            }
        };

        // 删除文件或文件夹
        let result = if metadata.is_dir() {
            // 删除文件夹（递归删除）
            std::fs::remove_dir_all(&full_path)
        } else {
            // 删除文件
            std::fs::remove_file(&full_path)
        };

        match result {
            Ok(_) => Ok(ToolResult {
                success: true,
                data: Some(serde_json::json!({
                    "path": file_path,
                    "type": if metadata.is_dir() { "folder" } else { "file" },
                })),
                error: None,
                message: Some(format!("成功删除{}: {}", if metadata.is_dir() { "文件夹" } else { "文件" }, file_path)),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("删除{}失败: {}", if metadata.is_dir() { "文件夹" } else { "文件" }, e)),
                message: None,
            }),
        }
    }

    /// 列出文件
    async fn list_files(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let dir_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let full_path = workspace_path.join(dir_path);

        // 验证路径安全性
        if dir_path.contains("..") {
            return Err("路径不安全".to_string());
        }
        
        if full_path.exists() {
            if PathValidator::validate_workspace_path(&full_path, workspace_path).is_err() {
                return Err("路径不安全".to_string());
            }
        }

        // 检查目录是否存在
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("目录不存在: {}", dir_path)),
                message: None,
            });
        }

        // 列出文件
        match std::fs::read_dir(&full_path) {
            Ok(entries) => {
                let mut files = Vec::new();
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        let is_dir = path.is_dir();
                        files.push(serde_json::json!({
                            "name": name,
                            "path": path.strip_prefix(workspace_path)
                                .ok()
                                .and_then(|p| p.to_str())
                                .unwrap_or(""),
                            "is_directory": is_dir,
                        }));
                    }
                }
                Ok(ToolResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "path": dir_path,
                        "files": files,
                    })),
                    error: None,
                    message: Some(format!("成功列出目录: {}", dir_path)),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("读取目录失败: {}", e)),
                message: None,
            }),
        }
    }

    /// 搜索文件
    async fn search_files(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let query = tool_call
            .arguments
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 query 参数".to_string())?;

        // 简单的文件名搜索（后续可以优化为全文搜索）
        let mut results = Vec::new();
        self.search_files_recursive(workspace_path, workspace_path, query, &mut results)?;

        Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "query": query,
                "results": results,
            })),
            error: None,
            message: Some(format!("找到 {} 个匹配的文件", results.len())),
        })
    }

    fn search_files_recursive(
        &self,
        root: &Path,
        current: &Path,
        query: &str,
        results: &mut Vec<serde_json::Value>,
    ) -> Result<(), String> {
        if let Ok(entries) = std::fs::read_dir(current) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

                    if name.contains(query) {
                        results.push(serde_json::json!({
                            "name": name,
                            "path": path.strip_prefix(root)
                                .ok()
                                .and_then(|p| p.to_str())
                                .unwrap_or(""),
                            "is_directory": path.is_dir(),
                        }));
                    }

                    if path.is_dir() {
                        self.search_files_recursive(root, &path, query, results)?;
                    }
                }
            }
        }
        Ok(())
    }

    /// 移动文件
    async fn move_file(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let source_path = tool_call
            .arguments
            .get("source")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 source 参数".to_string())?;

        let dest_path = tool_call
            .arguments
            .get("destination")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 destination 参数".to_string())?;

        let source_full = workspace_path.join(source_path);
        let dest_full = workspace_path.join(dest_path);

        // 验证路径安全性
        if source_path.contains("..") || dest_path.contains("..") {
            return Err("路径不安全".to_string());
        }

        if source_full.exists() {
            if PathValidator::validate_workspace_path(&source_full, workspace_path).is_err() {
                return Err("源路径不安全".to_string());
            }
        }

        // 检查源文件是否存在
        if !source_full.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("源文件不存在: {}", source_path)),
                message: None,
            });
        }

        // 检查目标文件是否已存在
        if dest_full.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("目标文件已存在: {}", dest_path)),
                message: None,
            });
        }

        // 创建目标目录
        if let Some(parent) = dest_full.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("创建目标目录失败: {}", e)),
                    message: None,
                });
            }
        }

        // 移动文件
        match std::fs::rename(&source_full, &dest_full) {
            Ok(_) => Ok(ToolResult {
                success: true,
                data: Some(serde_json::json!({
                    "source": source_path,
                    "destination": dest_path,
                })),
                error: None,
                message: Some(format!("成功移动文件: {} -> {}", source_path, dest_path)),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("移动文件失败: {}", e)),
                message: None,
            }),
        }
    }

    /// 重命名文件
    async fn rename_file(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        let file_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 path 参数".to_string())?;

        let new_name = tool_call
            .arguments
            .get("new_name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 new_name 参数".to_string())?;

        let full_path = workspace_path.join(file_path);

        // 验证路径安全性
        if file_path.contains("..") || new_name.contains("..") || new_name.contains("/") || new_name.contains("\\") {
            return Err("路径不安全".to_string());
        }

        if full_path.exists() {
            if PathValidator::validate_workspace_path(&full_path, workspace_path).is_err() {
                return Err("路径不安全".to_string());
            }
        }

        // 检查文件是否存在
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("文件不存在: {}", file_path)),
                message: None,
            });
        }

        // 构建新路径
        let parent = full_path.parent().ok_or_else(|| "无法获取父目录".to_string())?;
        let new_path = parent.join(new_name);

        // 检查新名称是否已存在
        if new_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("目标名称已存在: {}", new_name)),
                message: None,
            });
        }

        // 重命名文件
        match std::fs::rename(&full_path, &new_path) {
            Ok(_) => {
                // 计算新的相对路径
                let new_relative = new_path.strip_prefix(workspace_path)
                    .ok()
                    .and_then(|p| p.to_str())
                    .unwrap_or("");

                Ok(ToolResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "old_path": file_path,
                        "new_path": new_relative,
                        "new_name": new_name,
                    })),
                    error: None,
                    message: Some(format!("成功重命名文件: {} -> {}", file_path, new_name)),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("重命名文件失败: {}", e)),
                message: None,
            }),
        }
    }

    /// 创建文件夹
    async fn create_folder(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        eprintln!("🔧 create_folder 调用参数: {}", serde_json::to_string(&tool_call.arguments).unwrap_or_default());
        eprintln!("🔧 工作区路径: {:?}", workspace_path);
        
        let folder_path = tool_call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                eprintln!("❌ create_folder 缺少 path 参数，arguments: {:?}", tool_call.arguments);
                "缺少 path 参数".to_string()
            })?;

        let full_path = workspace_path.join(folder_path);
        eprintln!("🔧 完整路径: {:?}", full_path);

        // 验证路径安全性
        if folder_path.contains("..") {
            eprintln!("❌ 路径不安全，包含 ..");
            return Err("路径不安全".to_string());
        }

        // 检查文件夹是否已存在
        if full_path.exists() {
            if full_path.is_dir() {
                eprintln!("✅ 文件夹已存在: {:?}", full_path);
                return Ok(ToolResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "path": folder_path,
                        "full_path": full_path.to_string_lossy().to_string(),
                        "message": "文件夹已存在",
                    })),
                    error: None,
                    message: Some(format!("文件夹已存在: {}", folder_path)),
                });
            } else {
                eprintln!("❌ 路径已存在但不是文件夹: {:?}", full_path);
                return Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("路径已存在但不是文件夹: {}", folder_path)),
                    message: None,
                });
            }
        }

        // 创建文件夹
        eprintln!("🚀 开始创建文件夹: {:?}", full_path);
        match std::fs::create_dir_all(&full_path) {
            Ok(_) => {
                eprintln!("✅ 文件夹创建成功: {:?}", full_path);
                // 验证文件夹是否真的创建成功
                if full_path.exists() && full_path.is_dir() {
                    Ok(ToolResult {
                        success: true,
                        data: Some(serde_json::json!({
                            "path": folder_path,
                            "full_path": full_path.to_string_lossy().to_string(),
                        })),
                        error: None,
                        message: Some(format!("成功创建文件夹: {}", folder_path)),
                    })
                } else {
                    eprintln!("⚠️ 文件夹创建后验证失败: {:?}", full_path);
                    Ok(ToolResult {
                        success: false,
                        data: None,
                        error: Some(format!("文件夹创建后验证失败: {}", folder_path)),
                        message: None,
                    })
                }
            }
            Err(e) => {
                eprintln!("❌ 创建文件夹失败: {:?} - {}", full_path, e);
                Ok(ToolResult {
                    success: false,
                    data: None,
                    error: Some(format!("创建文件夹失败: {} - {}", folder_path, e)),
                    message: None,
                })
            }
        }
    }

    /// 获取当前编辑器打开的文件
    /// 注意：这个工具需要通过事件系统与前端通信，这里返回一个占位符
    async fn get_current_editor_file(
        &self,
        _tool_call: &ToolCall,
    ) -> Result<ToolResult, String> {
        // 这个工具需要前端状态信息，返回提示信息
        Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "message": "请在前端自动引用当前编辑器打开的文件",
                "note": "当前编辑器打开的文件会自动添加到引用中"
            })),
            error: None,
            message: Some("当前编辑器打开的文件信息会通过引用系统提供".to_string()),
        })
    }

    /// 当 AI 只返回替换片段时，根据 instruction/target_content 在当前内容中做一次替换，得到完整新内容再参与 diff。
    /// 优先解析 instruction 中的「将 "X" 修改为 ... "Y"」模式，只做短语级替换，避免整篇被替换。
    fn resolve_new_content_for_diff(
        current_content: &str,
        new_content: &str,
        target_content: Option<&str>,
        instruction: Option<&str>,
    ) -> String {
        // 1. 优先：instruction 中明确「将 X 改为 Y」时，提取两处引号内容，只做短语替换（不依赖 AI 的 content 长度）
        if let Some((old_str, new_str)) = Self::extract_two_quoted_from_instruction(instruction) {
            if !old_str.is_empty() && !new_str.is_empty() && current_content.contains(old_str.as_str()) {
                let full = current_content.replacen(old_str.as_str(), new_str.as_str(), 1);
                eprintln!("📝 [edit_current_editor_document] 已按 instruction 短语替换: \"{}\" -> \"{}\"", old_str.chars().take(20).collect::<String>(), new_str.chars().take(20).collect::<String>());
                return full;
            }
        }

        let current_chars = current_content.chars().count();
        let new_chars = new_content.chars().count();

        // 2. 若有 target_content（如前端传入的选中文本）且当前内容包含它，且新内容较短（短语级），只做短语替换
        if let Some(ref target) = target_content {
            let t = target.trim();
            if !t.is_empty() && current_content.contains(t) {
                let phrase_max = 300.max(current_chars / 5);
                if new_chars <= phrase_max {
                    let full = current_content.replacen(t, new_content, 1);
                    eprintln!("📝 [edit_current_editor_document] 已按 target_content 短语替换: \"{}\" (新内容长度: {})", t.chars().take(20).collect::<String>(), new_chars);
                    return full;
                }
                // 3. 若有 target_content 但 AI 返回了长文档，不做整篇替换，避免覆盖用户只想改的词
                if new_chars >= current_chars / 3 {
                    eprintln!("📝 [edit_current_editor_document] 检测到 target_content 但 content 为长文档，跳过整篇替换，保持当前内容");
                    return current_content.to_string();
                }
            }
        }

        // 若新内容长度已接近当前内容（例如超过 30%），视为 AI 已返回完整文档，直接使用
        if current_chars > 0 && new_chars >= current_chars / 3 {
            return new_content.to_string();
        }
        // 确定要被替换的原文：优先 target_content，否则从 instruction 中解析第一个引号内的片段
        let to_replace: Option<String> = target_content
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string())
            .or_else(|| Self::extract_first_quoted_from_instruction(instruction));
        let Some(ref old) = to_replace else {
            return new_content.to_string();
        };
        if old.is_empty() || !current_content.contains(old.as_str()) {
            return new_content.to_string();
        }
        // 在当前内容中只替换第一次出现，得到完整新内容
        let full = current_content.replacen(old.as_str(), new_content, 1);
        eprintln!("📝 [edit_current_editor_document] content 为替换片段，已用 instruction/target 构建完整新内容（替换 \"{}\"）", old.chars().take(20).collect::<String>());
        full
    }

    /// 从 instruction 中提取前两处引号内的内容，用于「将 "X" 修改为 ... "Y"」的短语替换。
    /// 例如：将\"高度自动化\"修改为英文\"High Automation\" -> ("高度自动化", "High Automation")
    fn extract_two_quoted_from_instruction(instruction: Option<&str>) -> Option<(String, String)> {
        let s = instruction?.trim();
        if s.is_empty() {
            return None;
        }
        let quote_chars = ['"', '"', '"', '"', '\''];
        let mut segments: Vec<String> = Vec::new();
        let mut start: Option<usize> = None;
        for (i, c) in s.char_indices() {
            if quote_chars.contains(&c) {
                if start.is_none() {
                    start = Some(i + c.len_utf8());
                } else {
                    if let Some(st) = start {
                        if st < i {
                            segments.push(s[st..i].to_string());
                        }
                        start = None;
                    }
                }
            }
        }
        if segments.len() >= 2 {
            Some((segments[0].clone(), segments[1].clone()))
        } else {
            None
        }
    }

    /// 从 instruction 中提取第一个双引号或中文引号之间的内容（作为「要被替换」的原文）
    fn extract_first_quoted_from_instruction(instruction: Option<&str>) -> Option<String> {
        let s = instruction?.trim();
        if s.is_empty() {
            return None;
        }
        let mut chars = s.char_indices().peekable();
        let mut start: Option<usize> = None;
        let quote_chars = ['"', '"', '"', '"', '\''];
        while let Some((i, c)) = chars.next() {
            if quote_chars.contains(&c) {
                if start.is_none() {
                    start = Some(i + c.len_utf8()); // 跳过引号，记录内容起始（字节）
                } else {
                    let start_byte = start.unwrap();
                    if start_byte < i {
                        return Some(s[start_byte..i].to_string());
                    }
                    start = None;
                }
            }
        }
        None
    }

    /// 编辑当前编辑器打开的文档
    /// 新实现：获取当前编辑器内容，计算 diff，返回完整的编辑信息
    async fn edit_current_editor_document(
        &self,
        tool_call: &ToolCall,
    ) -> Result<ToolResult, String> {
        eprintln!("📝 [edit_current_editor_document] 开始处理文档编辑请求");
        eprintln!("📝 [edit_current_editor_document] 工具调用参数: {:?}", tool_call.arguments);
        
        use crate::services::diff_service::DiffService;
        
        // 1. 获取当前编辑器内容（从工具调用参数中获取，已在 ai_commands.rs 中增强）
        let current_file = tool_call
            .arguments
            .get("current_file")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 current_file 参数，请确保前端传递了当前编辑器信息".to_string())?;
        
        let current_content = tool_call
            .arguments
            .get("current_content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 current_content 参数，请确保前端传递了当前编辑器内容".to_string())?;
        
        // 2. 获取新内容
        let new_content = tool_call
            .arguments
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 content 参数".to_string())?;
        
        // 3. 获取可选参数（用于增强 diff 信息）
        let target_content = tool_call
            .arguments
            .get("target_content")
            .and_then(|v| v.as_str());
        let context_before = tool_call
            .arguments
            .get("context_before")
            .and_then(|v| v.as_str());
        let context_after = tool_call
            .arguments
            .get("context_after")
            .and_then(|v| v.as_str());
        let element_type = tool_call
            .arguments
            .get("element_type")
            .and_then(|v| v.as_str());
        let element_identifier = tool_call
            .arguments
            .get("element_identifier")
            .and_then(|v| v.as_str());
        
        eprintln!("📝 [edit_current_editor_document] 当前文件: {}", current_file);
        eprintln!("📝 [edit_current_editor_document] 当前内容长度: {} 字符", current_content.len());
        eprintln!("📝 [edit_current_editor_document] 新内容长度: {} 字符", new_content.len());
        eprintln!("📝 [edit_current_editor_document] 元素类型: {:?}", element_type);
        eprintln!("📝 [edit_current_editor_document] 元素标识符: {:?}", element_identifier);
        
        // 4. 若 AI 只返回了替换片段（content 远短于当前内容），根据 instruction/target_content 构建完整新内容再算 diff
        let instruction = tool_call
            .arguments
            .get("instruction")
            .and_then(|v| v.as_str());
        let effective_new_content = Self::resolve_new_content_for_diff(
            current_content,
            new_content,
            target_content,
            instruction,
        );
        
        // 5. 计算 Diff（使用 DiffService）
        eprintln!("📝 [edit_current_editor_document] 开始计算 diff...");
        use crate::services::diff_service::{Diff as DiffStruct, DiffType};
        let diff_service = DiffService::new();
        let mut diffs = diff_service.calculate_diff(current_content, &effective_new_content)
            .map_err(|e| {
                eprintln!("❌ [edit_current_editor_document] 计算 diff 失败: {}", e);
                format!("计算 diff 失败: {}", e)
            })?;
        
        eprintln!("📝 [edit_current_editor_document] 计算完成，共 {} 个 diff", diffs.len());
        
        // 5a. 若为「整篇替换」：单条 Edit 且变更块过大（>50% 原文或新文），改为一条「全文替换」diff，避免预览乱序/乱码
        let current_chars = current_content.chars().count();
        let new_chars_total = effective_new_content.chars().count();
        if diffs.len() == 1 {
            let d = &diffs[0];
            if matches!(d.diff_type, DiffType::Edit) {
                let orig_chars = d.original_code.chars().count();
                let new_code_chars = d.new_code.chars().count();
                let is_whole_replace = current_chars > 0
                    && (orig_chars > current_chars / 2 || new_code_chars > new_chars_total / 2);
                if is_whole_replace {
                    eprintln!("📝 [edit_current_editor_document] 检测为整篇替换，改为单条 replace_whole diff");
                    diffs = vec![DiffStruct {
                        diff_id: format!("diff_{}", uuid::Uuid::new_v4()),
                        diff_area_id: String::new(),
                        diff_type: DiffType::Edit,
                        original_code: current_content.to_string(),
                        original_start_line: 1,
                        original_end_line: 1,
                        new_code: effective_new_content.clone(),
                        start_line: 1,
                        end_line: 1,
                        context_before: None,
                        context_after: None,
                        element_type: Some("replace_whole".to_string()),
                        element_identifier: None,
                    }];
                }
            }
        }
        
        // 6. 如果提供了上下文，增强 diff 信息
        if let (Some(ctx_before), Some(ctx_after)) = (context_before, context_after) {
            for diff in &mut diffs {
                if diff.context_before.is_none() {
                    diff.context_before = Some(ctx_before.to_string());
                }
                if diff.context_after.is_none() {
                    diff.context_after = Some(ctx_after.to_string());
                }
            }
        }
        
        // 7. 如果提供了元素类型，设置到 diff 中
        if let Some(elem_type) = element_type {
            for diff in &mut diffs {
                diff.element_type = Some(elem_type.to_string());
                if let Some(identifier) = element_identifier {
                    diff.element_identifier = Some(identifier.to_string());
                }
            }
        }
        
        // 调试：打印每个 diff 的上下文信息
        for (i, diff) in diffs.iter().enumerate() {
            eprintln!("📝 [edit_current_editor_document] Diff #{}: type={:?}, start_line={}, end_line={}, context_before={:?}, context_after={:?}, element_type={:?}", 
                i + 1,
                diff.diff_type,
                diff.original_start_line,
                diff.original_end_line,
                diff.context_before.as_ref().map(|s| s.len()).unwrap_or(0),
                diff.context_after.as_ref().map(|s| s.len()).unwrap_or(0),
                diff.element_type,
            );
            if let Some(ref ctx_before) = diff.context_before {
                eprintln!("   context_before: {}", ctx_before.chars().take(50).collect::<String>());
            }
            if let Some(ref ctx_after) = diff.context_after {
                eprintln!("   context_after: {}", ctx_after.chars().take(50).collect::<String>());
            }
        }
        
        // 8. 生成 diff_area_id（MVP 阶段简化处理，阶段二使用 EditCodeService）
        let diff_area_id = format!("diff_area_{}", uuid::Uuid::new_v4());
        eprintln!("📝 [edit_current_editor_document] 生成的 diff_area_id: {}", diff_area_id);
        
        // 9. 返回结果（包含所有必要信息供前端使用；new_content 使用构建后的完整内容以便应用时一致）
        let result = ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "diff_area_id": diff_area_id,
                "file_path": current_file,
                "old_content": current_content,
                "new_content": effective_new_content,
                "diffs": diffs,  // 后端计算的 diffs，前端直接使用
            })),
            error: None,
            message: Some("文档编辑已准备，请查看预览".to_string()),
        };
        
        eprintln!("✅ [edit_current_editor_document] 文档编辑处理完成，返回结果");
        Ok(result)
    }

    /// 原子文件写入
    fn atomic_write_file(&self, path: &Path, content: &[u8]) -> Result<(), String> {
        // 1. 创建临时文件
        let temp_path = path.with_extension(format!(
            "{}.tmp.{}",
            path.extension()
                .and_then(|s| s.to_str())
                .unwrap_or("tmp"),
            std::process::id()
        ));

        // 2. 写入临时文件
        std::fs::write(&temp_path, content)
            .map_err(|e| format!("写入临时文件失败: {}", e))?;

        // 3. 原子重命名（仅在写入成功后才替换原文件）
        std::fs::rename(&temp_path, path)
            .map_err(|e| format!("原子重命名失败: {}", e))?;

        Ok(())
    }
}

