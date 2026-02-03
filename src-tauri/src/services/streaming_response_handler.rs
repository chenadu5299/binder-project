//! 流式响应处理器模块
//! 
//! 负责处理AI流式回复，实时显示文本，检测工具调用

use crate::services::ai_providers::ChatChunk;
use std::collections::HashMap;

/// 流式响应处理器
pub struct StreamingResponseHandler {
    /// 每个标签页的累积文本：tab_id -> accumulated_text
    accumulated_texts: HashMap<String, String>,
}

impl StreamingResponseHandler {
    /// 创建新的流式响应处理器
    pub fn new() -> Self {
        Self {
            accumulated_texts: HashMap::new(),
        }
    }
    
    /// 处理文本chunk，返回是否应该发送（去重后）
    pub fn process_text_chunk(&mut self, tab_id: &str, text: &str) -> Option<String> {
        // 空文本跳过
        if text.is_empty() {
            return None;
        }
        
        let accumulated = self.accumulated_texts
            .entry(tab_id.to_string())
            .or_insert_with(String::new);
        
        // ⚠️ 增强去重逻辑：检查多种重复模式
        let text_len = text.len();
        
        // 检查1：content是否完全等于累积文本的末尾
        if accumulated.ends_with(text) {
            eprintln!("⚠️ [StreamingResponseHandler] 检测到重复文本（完全重复），跳过: '{}'", 
                safe_truncate(text, 50));
            return None;
        }
        
        // 检查2：检查短文本（1-5个字符）是否在累积文本末尾形成重复模式
        if text_len <= 5 && accumulated.len() >= text_len * 2 {
            let check_length = std::cmp::min(text_len * 10, accumulated.len());
            let check_start = accumulated.len().saturating_sub(check_length);
            // ⚠️ 关键修复：找到字符边界，避免在多字节字符中间切片
            let mut char_boundary = check_start;
            while char_boundary < accumulated.len() && !accumulated.is_char_boundary(char_boundary) {
                char_boundary += 1;
            }
            let check_part = &accumulated[char_boundary..];
            
            // 检查是否形成了明显的重复模式（连续出现2次或更多）
            let pattern = format!("{}{}", text, text);
            if check_part.contains(&pattern) {
                eprintln!("⚠️ [StreamingResponseHandler] 检测到重复文本（重复模式），跳过: '{}'", 
                    safe_truncate(text, 50));
                return None;
            }
        }
        
        // 检查3：检查文本是否在累积文本的最后部分重复出现
        if text_len > 0 {
            let check_bytes = std::cmp::min(text_len * 5, accumulated.len());
            if check_bytes > 0 {
                let start_pos = accumulated.len().saturating_sub(check_bytes);
                // 找到字符边界
                let mut char_boundary = start_pos;
                while char_boundary < accumulated.len() && !accumulated.is_char_boundary(char_boundary) {
                    char_boundary += 1;
                }
                
                if char_boundary < accumulated.len() {
                    let last_part = &accumulated[char_boundary..];
                    // 如果content在最后部分出现了多次，说明是重复的
                    let occurrences = last_part.matches(text).count();
                    if occurrences >= 2 {
                        eprintln!("⚠️ [StreamingResponseHandler] 检测到重复文本（多次出现），跳过: '{}'", 
                            safe_truncate(text, 50));
                        return None;
                    }
                }
            }
        }
        
        // 更新累积文本
        accumulated.push_str(text);
        
        Some(text.to_string())
    }
    
    /// 检测工具调用（从流式响应中提取）
    pub fn detect_tool_call(chunk: &ChatChunk) -> Option<ToolCallInfo> {
        match chunk {
            ChatChunk::ToolCall { id, name, arguments, is_complete } => {
                if *is_complete {
                    Some(ToolCallInfo {
                        id: id.clone(),
                        name: name.clone(),
                        arguments: arguments.clone(),
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }
    
    /// 清空累积文本（用于新的一轮对话）
    pub fn clear_accumulated(&mut self, tab_id: &str) {
        self.accumulated_texts.remove(tab_id);
    }
    
    /// 获取累积文本
    pub fn get_accumulated(&self, tab_id: &str) -> String {
        self.accumulated_texts
            .get(tab_id)
            .cloned()
            .unwrap_or_default()
    }
}

/// 工具调用信息
#[derive(Debug, Clone)]
pub struct ToolCallInfo {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// 安全地截取字符串，确保在字符边界处截取
fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // 找到最后一个完整的字符边界
    let mut end = max_bytes;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    &s[..end]
}

impl Default for StreamingResponseHandler {
    fn default() -> Self {
        Self::new()
    }
}

