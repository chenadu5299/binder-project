use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AIError {
    NetworkError(String),
    RateLimit { retry_after: u64 },
    ModelUnavailable,
    ContextTooLong,
    Timeout,
    Cancelled,
    Unknown(String),
}

impl AIError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AIError::NetworkError(_) 
            | AIError::RateLimit { .. } 
            | AIError::ModelUnavailable
        )
    }
    
    pub fn retry_after(&self) -> Option<u64> {
        match self {
            AIError::RateLimit { retry_after } => Some(*retry_after),
            _ => None,
        }
    }
}

impl std::fmt::Display for AIError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIError::NetworkError(msg) => write!(f, "网络错误: {}", msg),
            AIError::RateLimit { retry_after } => write!(f, "请求频率限制，请在 {} 秒后重试", retry_after),
            AIError::ModelUnavailable => write!(f, "模型不可用"),
            AIError::ContextTooLong => write!(f, "上下文过长"),
            AIError::Timeout => write!(f, "请求超时"),
            AIError::Cancelled => write!(f, "请求已取消"),
            AIError::Unknown(msg) => write!(f, "未知错误: {}", msg),
        }
    }
}

impl std::error::Error for AIError {}

