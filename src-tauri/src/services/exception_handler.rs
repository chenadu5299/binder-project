//! 异常处理器模块
//! 
//! 负责统一处理对话级异常，实现三阶段错误处理策略

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// 错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConversationError {
    /// 网络错误
    NetworkError {
        message: String,
        retryable: bool,
    },
    
    /// API错误
    APIError {
        message: String,
        error_type: APIErrorType,
    },
    
    /// 工具调用错误
    ToolCallError {
        tool_name: String,
        message: String,
        error_type: ToolCallErrorType,
    },
    
    /// JSON解析错误
    JSONParseError {
        message: String,
        arguments: String,
    },
    
    /// 上下文过长
    ContextTooLong {
        current_tokens: usize,
        max_tokens: usize,
    },
    
    /// 文件过大
    FileTooLarge {
        path: String,
        size: u64,
        max_size: u64,
    },
}

/// API错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum APIErrorType {
    InvalidAPIKey,
    QuotaExceeded,
    RateLimit { retry_after: Option<u64> },
    Unknown,
}

/// 工具调用错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolCallErrorType {
    ParameterError,
    FileNotFound,
    PermissionDenied,
    ExecutionFailed,
    Unknown,
}

/// 处理决策
#[derive(Debug, Clone)]
pub enum HandlingDecision {
    /// 第一次重试：自动重试（相同方案）
    Retry { delay: Duration },
    
    /// 第二次重试：使用替代方案
    RetryWithAlternative { 
        alternative_message: String,
        delay: Duration,
    },
    
    /// 暂停并等待用户决策（两次重试都失败）
    PauseForUserDecision {
        message: String,
        error_details: String,
        suggestions: Vec<String>,
        options: Vec<UserOption>,
    },
    
    /// 失败并报告（不可恢复的错误）
    Fail {
        message: String,
        suggestion: Option<String>,
    },
}

/// 用户选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserOption {
    Retry,
    TryAlternative,
    Skip,
    Cancel,
}

/// 异常处理器
pub struct ExceptionHandler {
    /// 最大重试次数
    max_retries: usize,
}

impl ExceptionHandler {
    /// 创建新的异常处理器
    pub fn new() -> Self {
        Self {
            max_retries: 2,
        }
    }
    
    /// 处理错误（三阶段策略）
    pub fn handle_error(
        &self,
        error: &ConversationError,
        retry_count: usize,
        context: &ErrorContext,
    ) -> HandlingDecision {
        // 第一次尝试：自动重试
        if retry_count == 0 {
            if self.is_recoverable(error) {
                return HandlingDecision::Retry {
                    delay: self.calculate_backoff(1),
                };
            }
        }
        
        // 第二次尝试：寻找替代方案
        if retry_count == 1 {
            if let Some(alternative) = self.find_alternative(error, context) {
                return HandlingDecision::RetryWithAlternative {
                    alternative_message: alternative,
                    delay: self.calculate_backoff(2),
                };
            }
        }
        
        // 两次重试都失败，提示用户决策
        HandlingDecision::PauseForUserDecision {
            message: self.generate_user_message(error),
            error_details: format!("{:?}", error),
            suggestions: self.generate_suggestions(error, context),
            options: vec![
                UserOption::Retry,
                UserOption::TryAlternative,
                UserOption::Skip,
                UserOption::Cancel,
            ],
        }
    }
    
    /// 判断错误是否可恢复
    fn is_recoverable(&self, error: &ConversationError) -> bool {
        match error {
            ConversationError::NetworkError { retryable, .. } => *retryable,
            ConversationError::APIError { error_type, .. } => {
                matches!(error_type, APIErrorType::RateLimit { .. })
            }
            ConversationError::ToolCallError { error_type, .. } => {
                matches!(error_type, ToolCallErrorType::ParameterError)
            }
            ConversationError::JSONParseError { .. } => true,
            ConversationError::ContextTooLong { .. } => true,
            _ => false,
        }
    }
    
    /// 寻找替代方案
    fn find_alternative(&self, error: &ConversationError, _context: &ErrorContext) -> Option<String> {
        match error {
            ConversationError::ContextTooLong { .. } => {
                Some("智能截断对话历史，保留关键信息".to_string())
            }
            ConversationError::ToolCallError { tool_name, error_type, .. } => {
                match error_type {
                    ToolCallErrorType::FileNotFound => {
                        Some(format!("提示AI文件路径可能错误，建议检查路径: {}", tool_name))
                    }
                    ToolCallErrorType::ParameterError => {
                        Some(format!("尝试修复工具调用参数: {}", tool_name))
                    }
                    _ => None,
                }
            }
            _ => None,
        }
    }
    
    /// 生成用户友好的错误消息
    fn generate_user_message(&self, error: &ConversationError) -> String {
        match error {
            ConversationError::NetworkError { message, .. } => {
                format!("网络连接失败：{}。请检查网络连接后重试。", message)
            }
            ConversationError::APIError { message, error_type, .. } => {
                match error_type {
                    APIErrorType::InvalidAPIKey => {
                        "API Key 无效，请检查配置".to_string()
                    }
                    APIErrorType::QuotaExceeded => {
                        "API 配额已用完，请升级或切换模型".to_string()
                    }
                    APIErrorType::RateLimit { .. } => {
                        format!("API 调用频率过高，请稍后重试：{}", message)
                    }
                    APIErrorType::Unknown => {
                        format!("API 错误：{}", message)
                    }
                }
            }
            ConversationError::ToolCallError { tool_name, message, .. } => {
                format!("工具调用失败（{}）：{}", tool_name, message)
            }
            ConversationError::JSONParseError { message, .. } => {
                format!("工具调用参数格式错误：{}", message)
            }
            ConversationError::ContextTooLong { current_tokens, max_tokens } => {
                format!("对话历史过长（{} tokens，限制 {} tokens），请开启新对话或减少引用内容", 
                    current_tokens, max_tokens)
            }
            ConversationError::FileTooLarge { path, size, max_size } => {
                format!("文件过大（{}，{} bytes，限制 {} bytes），无法处理", 
                    path, size, max_size)
            }
        }
    }
    
    /// 生成建议
    fn generate_suggestions(&self, error: &ConversationError, _context: &ErrorContext) -> Vec<String> {
        match error {
            ConversationError::NetworkError { .. } => {
                vec![
                    "检查网络连接".to_string(),
                    "检查防火墙设置".to_string(),
                    "稍后重试".to_string(),
                ]
            }
            ConversationError::APIError { error_type, .. } => {
                match error_type {
                    APIErrorType::InvalidAPIKey => {
                        vec!["检查 API Key 配置".to_string(), "重新配置 API Key".to_string()]
                    }
                    APIErrorType::QuotaExceeded => {
                        vec!["升级 API 配额".to_string(), "切换其他模型".to_string()]
                    }
                    APIErrorType::RateLimit { .. } => {
                        vec!["等待一段时间后重试".to_string(), "降低请求频率".to_string()]
                    }
                    _ => vec![],
                }
            }
            ConversationError::ContextTooLong { .. } => {
                vec![
                    "开启新对话".to_string(),
                    "减少引用内容".to_string(),
                    "使用摘要代替完整内容".to_string(),
                ]
            }
            _ => vec![],
        }
    }
    
    /// 计算退避时间（指数退避）
    fn calculate_backoff(&self, attempt: usize) -> Duration {
        let delay_ms = 1000 * (2_u64.pow(attempt as u32));
        Duration::from_millis(delay_ms.min(10000)) // 最多10秒
    }
}

/// 错误上下文
#[derive(Debug, Clone)]
pub struct ErrorContext {
    pub retry_count: usize,
    pub tab_id: String,
    pub message_id: Option<String>,
}

impl Default for ExceptionHandler {
    fn default() -> Self {
        Self::new()
    }
}

