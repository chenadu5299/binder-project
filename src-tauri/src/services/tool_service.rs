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

        // 读取文件内容
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

        // 原子写入文件
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

        // 检查文件是否存在
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("文件不存在: {}", file_path)),
                message: None,
            });
        }

        // 删除文件
        match std::fs::remove_file(&full_path) {
            Ok(_) => Ok(ToolResult {
                success: true,
                data: Some(serde_json::json!({
                    "path": file_path,
                })),
                error: None,
                message: Some(format!("成功删除文件: {}", file_path)),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                data: None,
                error: Some(format!("删除文件失败: {}", e)),
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

    /// 编辑当前编辑器打开的文档
    /// 注意：这个工具需要通过事件系统通知前端更新编辑器内容
    async fn edit_current_editor_document(
        &self,
        tool_call: &ToolCall,
    ) -> Result<ToolResult, String> {
        // 获取新内容
        let new_content = tool_call
            .arguments
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 content 参数".to_string())?;

        // 获取指令（可选）
        let instruction = tool_call
            .arguments
            .get("instruction")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // 返回结果，前端需要通过事件系统来更新编辑器
        Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "content": new_content,
                "instruction": instruction,
                "message": "需要前端通过事件系统应用变更到编辑器"
            })),
            error: None,
            message: Some("文档内容已准备好，等待应用到编辑器".to_string()),
        })
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

