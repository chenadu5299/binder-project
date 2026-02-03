//! 回复完整性检测模块
//! 
//! 负责检测AI回复是否完整，避免回复被截断或过早结束

/// 回复完整性检测器
pub struct ReplyCompletenessChecker {
    /// 最小回复长度（字符数）
    min_reply_length: usize,
}

impl ReplyCompletenessChecker {
    /// 创建新的回复完整性检测器
    pub fn new() -> Self {
        Self {
            min_reply_length: 100,
        }
    }
    
    /// 检查回复是否完整
    pub fn is_complete(&self, text: &str) -> bool {
        let trimmed = text.trim();
        
        // 检查是否以标点符号结尾
        let ends_with_punctuation = trimmed.ends_with('。') || trimmed.ends_with('.') || 
            trimmed.ends_with('！') || trimmed.ends_with('!') || 
            trimmed.ends_with('？') || trimmed.ends_with('?');
        
        // 检查是否包含结束标记
        let has_end_marker = text.contains("已完成") || text.contains("完成") ||
            text.contains("完毕") || text.contains("结束");
        
        // 检查长度
        let is_long_enough = text.len() >= self.min_reply_length;
        
        // 回复完整的条件：长度足够 且 （以标点符号结尾 或 包含结束标记）
        is_long_enough && (ends_with_punctuation || has_end_marker)
    }
    
    /// 检查回复是否太短
    pub fn is_too_short(&self, text: &str) -> bool {
        text.len() < self.min_reply_length
    }
    
    /// 检查回复是否缺少结束标记
    pub fn missing_end_marker(&self, text: &str) -> bool {
        let trimmed = text.trim();
        !trimmed.ends_with('。') && !trimmed.ends_with('.') && 
        !trimmed.ends_with('！') && !trimmed.ends_with('!') && 
        !trimmed.ends_with('？') && !trimmed.ends_with('?') &&
        !text.contains("已完成") && !text.contains("完成") &&
        !text.contains("完毕") && !text.contains("结束")
    }
    
    /// 检查是否有总结内容
    pub fn has_summary(&self, text: &str) -> bool {
        text.len() > 50 && (
            text.contains("总结") || 
            text.contains("完成") ||
            text.contains("已处理") ||
            text.contains("主要内容") ||
            text.contains("关键信息")
        )
    }
}

impl Default for ReplyCompletenessChecker {
    fn default() -> Self {
        Self::new()
    }
}

