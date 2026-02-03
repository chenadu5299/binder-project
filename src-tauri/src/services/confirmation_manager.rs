//! 用户确认管理器模块
//! 
//! 负责管理需要用户确认的操作，参考Cursor的确认机制

use serde_json::Value;

/// 操作类型
#[derive(Debug, Clone, PartialEq)]
pub enum OperationType {
    /// 需要确认的操作
    DeleteFile,
    DeleteFolder,
    ModifyCriticalFile,
    BatchOperation { count: usize },
    IrreversibleOperation,
    HighRiskOperation,
    
    /// 不需要确认的操作
    Query,
    Create,
    SimpleModify,
    UserExplicitlyRequested,
}

/// 用户确认管理器
pub struct ConfirmationManager {
    /// 批量操作阈值（超过此数量需要确认）
    batch_threshold: usize,
}

impl ConfirmationManager {
    /// 创建新的用户确认管理器
    pub fn new() -> Self {
        Self {
            batch_threshold: 10,
        }
    }
    
    /// 判断操作是否需要用户确认
    pub fn requires_confirmation(&self, tool_name: &str, arguments: &Value, user_explicitly_requested: bool) -> bool {
        // 如果用户明确要求，不需要确认
        if user_explicitly_requested {
            return false;
        }
        
        let operation_type = self.classify_operation(tool_name, arguments);
        
        match operation_type {
            OperationType::DeleteFile | 
            OperationType::DeleteFolder |
            OperationType::ModifyCriticalFile |
            OperationType::HighRiskOperation => true,
            
            OperationType::BatchOperation { count } => count > self.batch_threshold,
            
            OperationType::IrreversibleOperation => {
                // 检查是否覆盖现有文件
                self.will_overwrite_existing(tool_name, arguments)
            }
            
            OperationType::UserExplicitlyRequested => false,
            
            _ => false,
        }
    }
    
    /// 分类操作类型
    fn classify_operation(&self, tool_name: &str, arguments: &Value) -> OperationType {
        match tool_name {
            "delete_file" => OperationType::DeleteFile,
            "delete_folder" => OperationType::DeleteFolder,
            "edit_current_editor_document" => OperationType::ModifyCriticalFile,
            "move_file" => {
                // 检查是否是批量操作
                // 这里简化处理，实际应该统计批量操作数量
                OperationType::BatchOperation { count: 1 } // 暂时返回1，实际应该统计
            }
            "create_file" => {
                // 检查是否覆盖现有文件
                if self.will_overwrite_existing(tool_name, arguments) {
                    OperationType::IrreversibleOperation
                } else {
                    OperationType::Create
                }
            }
            "read_file" | "list_files" | "search_files" => OperationType::Query,
            "create_folder" => OperationType::Create,
            "update_file" => OperationType::SimpleModify,
            _ => OperationType::SimpleModify,
        }
    }
    
    /// 检查是否覆盖现有文件
    fn will_overwrite_existing(&self, tool_name: &str, arguments: &Value) -> bool {
        // 这里应该检查文件是否存在
        // 但需要文件系统访问，暂时简化处理
        match tool_name {
            "create_file" | "update_file" => {
                // 如果路径存在，可能覆盖
                // 实际应该检查文件是否存在
                false // 暂时返回false，由工具执行时检查
            }
            _ => false,
        }
    }
    
    /// 检查是否是关键文件
    pub fn is_critical_file(&self, path: &str) -> bool {
        let critical_patterns = [
            ".gitignore",
            "package.json",
            "package-lock.json",
            "yarn.lock",
            "tsconfig.json",
            "webpack.config.js",
            ".env",
            ".env.local",
        ];
        
        critical_patterns.iter().any(|pattern| path.contains(pattern))
    }
}

impl Default for ConfirmationManager {
    fn default() -> Self {
        Self::new()
    }
}

