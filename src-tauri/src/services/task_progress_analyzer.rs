//! 任务完成度分析模块
//! 
//! 负责分析任务完成度，判断任务是否完成，生成任务进度提示

use crate::services::tool_service::ToolResult;
use std::collections::{HashSet, HashMap};

/// 任务类型
#[derive(Debug, Clone, PartialEq)]
pub enum TaskType {
    FileMove,           // 文件移动任务
    RecursiveCheck,     // 递归检查任务
    FileClassification, // 文件分类任务
    FileRead,           // 文件读取任务
    FileDelete,         // 文件/文件夹删除任务
    Unknown,            // 未知任务类型
}

/// 任务进度信息
#[derive(Debug, Clone)]
pub struct TaskProgress {
    /// 任务类型
    pub task_type: TaskType,
    
    /// 任务是否完成
    pub is_completed: bool,
    
    /// 任务是否未完成
    pub is_incomplete: bool,
    
    /// 进度提示文本
    pub progress_hint: String,
    
    /// 已处理文件数
    pub processed_count: usize,
    
    /// 总文件数
    pub total_count: Option<usize>,
}

/// 任务完成度分析器
pub struct TaskProgressAnalyzer;

impl TaskProgressAnalyzer {
    /// 分析任务完成度
    pub fn analyze(
        tool_results: &[(String, String, ToolResult)],
    ) -> TaskProgress {
        use std::collections::HashSet;
        
        let mut file_list: Option<Vec<String>> = None;
        let mut moved_files = HashSet::new();
        let mut created_folders = HashSet::new();
        let mut failed_operations = Vec::new();
        
        // 用于检查所有文件夹任务的统计
        let mut root_dir_count: Option<usize> = None;
        let mut checked_dirs = HashSet::new();
        let mut list_files_call_count = 0;
        
        // 用于删除任务的统计
        let mut deleted_items = HashSet::new(); // 已删除的文件/文件夹路径
        let mut deleted_folders = HashSet::new(); // 已删除的文件夹路径
        let mut deleted_files = HashSet::new(); // 已删除的文件路径
        let mut initial_empty_folders: Option<HashSet<String>> = None; // 初始检查到的空文件夹
        
        // 分析工具调用结果
        for (_id, tool_name, tool_result) in tool_results {
            match tool_name.as_str() {
                "list_files" => {
                    list_files_call_count += 1;
                    if tool_result.success {
                        if let Some(data) = &tool_result.data {
                            if let Some(files) = data.get("files").and_then(|f| f.as_array()) {
                                let path = data.get("path").and_then(|p| p.as_str()).unwrap_or("");
                                
                                let file_names: Vec<String> = files
                                    .iter()
                                    .filter_map(|f| {
                                        let is_dir = f.get("is_directory").and_then(|d| d.as_bool()).unwrap_or(false);
                                        if !is_dir {
                                            f.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
                                        } else {
                                            None
                                        }
                                    })
                                    .collect();
                                
                                if path == "." || path.is_empty() || file_list.is_none() {
                                    let file_count = file_names.len();
                                    file_list = Some(file_names);
                                    
                                    let dir_count = files.iter()
                                        .filter(|f| f.get("is_directory").and_then(|d| d.as_bool()).unwrap_or(false))
                                        .count();
                                    root_dir_count = Some(dir_count);
                                    
                                    // 检查是否有空文件夹（用于删除任务判断）
                                    let empty_folders: HashSet<String> = files
                                        .iter()
                                        .filter_map(|f| {
                                            let is_dir = f.get("is_directory").and_then(|d| d.as_bool()).unwrap_or(false);
                                            if is_dir {
                                                f.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
                                            } else {
                                                None
                                            }
                                        })
                                        .collect();
                                    if initial_empty_folders.is_none() {
                                        initial_empty_folders = Some(empty_folders);
                                    }
                                } else {
                                    checked_dirs.insert(path.to_string());
                                }
                            }
                        }
                    }
                }
                "move_file" => {
                    if tool_result.success {
                        if let Some(data) = &tool_result.data {
                            if let Some(source) = data.get("source").and_then(|s| s.as_str()) {
                                let file_name = source
                                    .split('/')
                                    .last()
                                    .or_else(|| source.split('\\').last())
                                    .unwrap_or(source);
                                moved_files.insert(file_name.to_string());
                            }
                        }
                    } else {
                        if let Some(data) = &tool_result.data {
                            if let Some(source) = data.get("source").and_then(|s| s.as_str()) {
                                let file_name = source
                                    .split('/')
                                    .last()
                                    .or_else(|| source.split('\\').last())
                                    .unwrap_or(source);
                                failed_operations.push(format!("移动文件失败: {} ({})", 
                                    file_name, 
                                    tool_result.error.as_ref().unwrap_or(&"未知错误".to_string())));
                            }
                        }
                    }
                }
                "create_folder" => {
                    if tool_result.success {
                        if let Some(data) = &tool_result.data {
                            if let Some(path) = data.get("path").and_then(|p| p.as_str()) {
                                created_folders.insert(path.to_string());
                            }
                        }
                    }
                }
                "delete_file" => {
                    if tool_result.success {
                        if let Some(data) = &tool_result.data {
                            if let Some(path) = data.get("path").and_then(|p| p.as_str()) {
                                deleted_items.insert(path.to_string());
                                
                                // 判断是文件还是文件夹
                                // 1. 优先检查工具返回的 type 字段
                                let is_folder = data.get("type")
                                    .and_then(|t| t.as_str())
                                    .map(|t| t == "folder")
                                    .unwrap_or_else(|| {
                                        // 2. 如果没有 type 字段，通过路径特征判断
                                        path.ends_with('/') || path.ends_with('\\') ||
                                        // 3. 检查是否在初始空文件夹列表中（通过路径匹配）
                                        initial_empty_folders.as_ref()
                                            .map(|folders| {
                                                // 提取路径的最后一部分（文件夹名）
                                                let folder_name = path.split('/').last()
                                                    .or_else(|| path.split('\\').last())
                                                    .unwrap_or(path);
                                                folders.contains(folder_name) || folders.contains(path)
                                            })
                                            .unwrap_or(false)
                                    });
                                
                                if is_folder {
                                    deleted_folders.insert(path.to_string());
                                } else {
                                    deleted_files.insert(path.to_string());
                                }
                            }
                        }
                    } else {
                        if let Some(data) = &tool_result.data {
                            if let Some(path) = data.get("path").and_then(|p| p.as_str()) {
                                failed_operations.push(format!("删除失败: {} ({})", 
                                    path, 
                                    tool_result.error.as_ref().unwrap_or(&"未知错误".to_string())));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        
        // 判断任务类型
        let has_list_files = tool_results.iter().any(|(_, name, _)| name == "list_files");
        let has_move_file = tool_results.iter().any(|(_, name, _)| name == "move_file");
        let has_create_folder = tool_results.iter().any(|(_, name, _)| name == "create_folder");
        let has_delete_file = tool_results.iter().any(|(_, name, _)| name == "delete_file");
        let is_file_move_task = has_create_folder || has_move_file;
        let is_check_all_folders_task = has_list_files && !is_file_move_task && !has_delete_file && list_files_call_count > 1;
        let is_delete_task = has_delete_file;
        
        // 生成任务进度提示
        let mut progress_hint = String::new();
        let mut is_completed = false;
        let mut is_incomplete = false;
        let mut processed_count = 0;
        let mut total_count = None;
        
        if is_check_all_folders_task {
            // 检查所有文件夹任务
            if let Some(total_dirs) = root_dir_count {
                let checked_count = checked_dirs.len();
                let expected_min_calls = total_dirs + 1;
                
                if list_files_call_count >= expected_min_calls {
                    progress_hint.push_str(&format!(
                        "\n检查所有文件夹任务已完成：已检查根目录和所有 {} 个子文件夹（调用次数：{}），任务已完成。\n",
                        total_dirs, list_files_call_count
                    ));
                    is_completed = true;
                } else {
                    let remaining = expected_min_calls.saturating_sub(list_files_call_count);
                    progress_hint.push_str(&format!(
                        "\n检查所有文件夹任务进度：根目录有 {} 个文件夹，已检查 {} 个，还需要检查 {} 个文件夹（调用次数：{}）。\n",
                        total_dirs, checked_count, remaining, list_files_call_count
                    ));
                    progress_hint.push_str("重要：必须继续调用 list_files 工具检查所有剩余的文件夹，不要停止，不要只回复文本说明。必须调用工具完成检查。\n");
                    is_incomplete = true;
                }
                processed_count = checked_count;
                total_count = Some(expected_min_calls);
            }
        } else if is_file_move_task {
            // 文件移动任务
            if let Some(files) = &file_list {
                let total_files = files.len();
                let moved_count = moved_files.len();
                
                if moved_count >= total_files {
                    progress_hint.push_str(&format!(
                        "\n任务已完成：已成功移动 {} 个文件到目标文件夹，任务已完成。\n",
                        moved_count
                    ));
                    is_completed = true;
                } else {
                    let remaining = total_files - moved_count;
                    progress_hint.push_str(&format!(
                        "\n任务进度：总共有 {} 个文件，已移动 {} 个，还有 {} 个文件需要处理。\n",
                        total_files, moved_count, remaining
                    ));
                    progress_hint.push_str("重要：必须继续调用 move_file 工具处理剩余文件，不要停止或结束回复。必须处理完所有文件才能结束。\n");
                    is_incomplete = true;
                }
                processed_count = moved_count;
                total_count = Some(total_files);
            }
        } else if is_delete_task {
            // 文件/文件夹删除任务
            let deleted_count = deleted_items.len();
            let deleted_folders_count = deleted_folders.len();
            let deleted_files_count = deleted_files.len();
            
            // 结合 list_files 结果判断删除任务是否完成
            // 如果初始检查到了空文件夹，且已删除的数量达到或超过初始空文件夹数量，认为任务完成
            if let Some(initial_folders) = &initial_empty_folders {
                let initial_empty_count = initial_folders.len();
                
                if deleted_folders_count >= initial_empty_count {
                    progress_hint.push_str(&format!(
                        "\n删除任务已完成：已成功删除 {} 个空文件夹（共 {} 个文件/文件夹）。\n",
                        deleted_folders_count, deleted_count
                    ));
                    is_completed = true;
                } else {
                    let remaining = initial_empty_count - deleted_folders_count;
                    progress_hint.push_str(&format!(
                        "\n删除任务进度：初始检查到 {} 个空文件夹，已删除 {} 个，还有 {} 个空文件夹需要删除（已删除 {} 个文件/文件夹）。\n",
                        initial_empty_count, deleted_folders_count, remaining, deleted_count
                    ));
                    // 不强制触发，只提供进度信息
                    is_incomplete = true;
                }
                processed_count = deleted_folders_count;
                total_count = Some(initial_empty_count);
            } else if deleted_count > 0 {
                // 没有初始检查结果，但已有删除操作
                progress_hint.push_str(&format!(
                    "\n删除任务进度：已删除 {} 个文件/文件夹（{} 个文件夹，{} 个文件）。\n",
                    deleted_count, deleted_folders_count, deleted_files_count
                ));
                // 无法判断是否完成，不标记为完成或未完成
                processed_count = deleted_count;
            } else {
                // 没有删除操作，也没有初始检查结果
                progress_hint.push_str("\n删除任务：尚未执行删除操作。\n");
            }
        }
        
        // 添加失败操作信息到进度提示
        if !failed_operations.is_empty() {
            progress_hint.push_str("\n执行失败的操作（需要重试或使用替代方案）：\n");
            for (idx, failed) in failed_operations.iter().enumerate() {
                progress_hint.push_str(&format!("{}. {}\n", idx + 1, failed));
            }
            progress_hint.push_str("\n请检查错误原因，重试这些操作，或使用其他方式完成这些任务。不要忽略失败的操作。\n");
        }
        
        // 判断任务类型
        let task_type = if is_check_all_folders_task {
            TaskType::RecursiveCheck
        } else if is_file_move_task {
            TaskType::FileMove
        } else if is_delete_task {
            TaskType::FileDelete
        } else if tool_results.iter().any(|(_, name, _)| name == "read_file") {
            TaskType::FileRead
        } else {
            TaskType::Unknown
        };
        
        TaskProgress {
            task_type,
            is_completed,
            is_incomplete,
            progress_hint,
            processed_count,
            total_count,
        }
    }
    
    /// 检查用户是否要求递归检查所有文件
    pub fn user_asks_for_recursive_check(user_message: &str) -> bool {
        let content_lower = user_message.to_lowercase();
        ((content_lower.contains("所有文件") || 
          content_lower.contains("所有文件夹") || 
          content_lower.contains("全部文件") ||
          (content_lower.contains("检查") && content_lower.contains("文件"))) &&
         (content_lower.contains("包括子文件夹") ||
          content_lower.contains("包括子目录") ||
          content_lower.contains("递归") ||
          content_lower.contains("子文件夹") ||
          content_lower.contains("子目录"))) ||
        ((content_lower.contains("检查") || content_lower.contains("查看")) &&
         (content_lower.contains("文件") || content_lower.contains("文件夹")) &&
         (content_lower.contains("子文件夹") ||
          content_lower.contains("子目录") ||
          content_lower.contains("递归")))
    }
    
    /// 检查用户是否要求总结内容
    pub fn user_asks_for_summary(user_message: &str) -> bool {
        let content_lower = user_message.to_lowercase();
        content_lower.contains("写了什么") || 
        content_lower.contains("内容是什么") || 
        (content_lower.contains("内容") && (content_lower.contains("总结") || content_lower.contains("概述") || content_lower.contains("介绍"))) ||
        content_lower.contains("总结") || 
        content_lower.contains("概述") ||
        content_lower.contains("介绍")
    }
}

