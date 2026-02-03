//! 循环检测模块
//! 
//! 负责检测对话中的循环行为，防止无限循环

use std::collections::VecDeque;

/// 循环检测器
pub struct LoopDetector {
    /// 最大强制继续重试次数
    pub max_force_continue_retries: usize,
    
    /// 最大继续回复重试次数
    pub max_continue_reply_retries: usize,
    
    /// 最近N次回复内容（用于检测重复）
    pub recent_replies: VecDeque<String>,
    
    /// 最近N次工具调用（用于检测工具调用循环）
    pub recent_tool_calls: VecDeque<ToolCallRecord>,
}

/// 工具调用记录
#[derive(Debug, Clone, PartialEq)]
struct ToolCallRecord {
    tool_name: String,
    arguments: String,
}

impl LoopDetector {
    /// 创建新的循环检测器
    pub fn new() -> Self {
        Self {
            max_force_continue_retries: 5,
            max_continue_reply_retries: 3,
            recent_replies: VecDeque::with_capacity(5),
            recent_tool_calls: VecDeque::with_capacity(10),
        }
    }
    
    /// 检测内容重复
    pub fn detect_content_repetition(&mut self, current_text: &str) -> bool {
        let trimmed_current = current_text.trim();
        
        // 检查是否与最近N次回复相同
        for recent in &self.recent_replies {
            let trimmed_recent = recent.trim();
            if trimmed_current == trimmed_recent {
                eprintln!("⚠️ 检测到内容重复：与最近回复相同");
                return true;
            }
        }
        
        // 检测语义重复（关键短语重复）
        let key_phrases = [
            "我将继续检查所有剩余的文件夹",
            "让我逐一检查每个文件夹的内容",
            "我需要继续处理剩余的文件",
            "我理解需要提供文件列表总结",
            "让我先删除临时文件",
            "然后再尝试删除整个文件夹",
            "我理解需要提供文件列表总结，但让我先完成用户的主要任务",
            "让我先完成用户的主要任务",
            "我理解需要提供文件列表总结",
        ];
        
        for phrase in &key_phrases {
            if trimmed_current.contains(phrase) {
                // 检查最近回复中是否也包含这个短语
                for recent in &self.recent_replies {
                    if recent.contains(phrase) {
                        eprintln!("⚠️ 检测到语义重复：关键短语 '{}' 重复出现", phrase);
                        return true;
                    }
                }
            }
        }
        
        // 添加到最近回复列表
        self.recent_replies.push_back(trimmed_current.to_string());
        if self.recent_replies.len() > 5 {
            self.recent_replies.pop_front();
        }
        
        false
    }
    
    /// 检测工具调用循环
    pub fn detect_tool_call_loop(&mut self, tool_name: &str, arguments: &str) -> bool {
        let record = ToolCallRecord {
            tool_name: tool_name.to_string(),
            arguments: arguments.to_string(),
        };
        
        // 检查是否与最近N次工具调用相同
        for recent in &self.recent_tool_calls {
            if *recent == record {
                eprintln!("⚠️ 检测到工具调用循环：{} 使用相同参数重复调用", tool_name);
                return true;
            }
        }
        
        // 添加到最近工具调用列表
        self.recent_tool_calls.push_back(record);
        if self.recent_tool_calls.len() > 10 {
            self.recent_tool_calls.pop_front();
        }
        
        false
    }
    
    /// 检查是否超过最大强制继续重试次数
    pub fn check_max_force_continue_retries(&self, count: usize) -> bool {
        count >= self.max_force_continue_retries
    }
    
    /// 检查是否超过最大继续回复重试次数
    pub fn check_max_continue_reply_retries(&self, count: usize) -> bool {
        count >= self.max_continue_reply_retries
    }
    
    /// 清空检测记录（用于新的一轮对话）
    pub fn clear(&mut self) {
        self.recent_replies.clear();
        self.recent_tool_calls.clear();
    }
}

impl Default for LoopDetector {
    fn default() -> Self {
        Self::new()
    }
}

