//! 对话管理器模块
//! 
//! 负责管理对话状态和对话历史，实现对话状态机

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 对话状态枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConversationState {
    /// 空闲，等待用户输入
    Idle,
    
    /// 等待AI回复
    WaitingAIResponse {
        message_id: String,
    },
    
    /// 正在流式显示AI回复
    StreamingResponse {
        message_id: String,
        accumulated_text: String,
    },
    
    /// 正在调用工具
    ToolCalling {
        message_id: String,
        tool_call_id: String,
        tool_name: String,
        status: ToolCallStatus,
    },
    
    /// 对话完成（AI回复完成）
    Completed {
        message_id: String,
    },
    
    /// 错误状态
    Error {
        message_id: String,
        error: String,
        recoverable: bool,
        suggestion: Option<String>,
    },
}

/// 工具调用状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ToolCallStatus {
    Pending,      // 等待执行
    Executing,    // 正在执行
    Completed,    // 执行成功
    Failed,       // 执行失败
}

/// 对话管理器
pub struct ConversationManager {
    /// 每个标签页的对话状态：tab_id -> ConversationState
    states: HashMap<String, ConversationState>,
    
    /// 每个标签页的对话历史：tab_id -> Vec<ChatMessage>
    histories: HashMap<String, Vec<crate::services::ai_providers::ChatMessage>>,
}

impl ConversationManager {
    /// 创建新的对话管理器
    pub fn new() -> Self {
        Self {
            states: HashMap::new(),
            histories: HashMap::new(),
        }
    }
    
    /// 获取对话状态
    pub fn get_state(&self, tab_id: &str) -> ConversationState {
        self.states.get(tab_id)
            .cloned()
            .unwrap_or(ConversationState::Idle)
    }
    
    /// 设置对话状态
    pub fn set_state(&mut self, tab_id: &str, state: ConversationState) {
        self.states.insert(tab_id.to_string(), state);
    }
    
    /// 状态转换：Idle -> WaitingAIResponse
    pub fn start_conversation(&mut self, tab_id: &str, message_id: String) {
        self.set_state(tab_id, ConversationState::WaitingAIResponse { message_id });
    }
    
    /// 状态转换：WaitingAIResponse -> StreamingResponse
    pub fn start_streaming(&mut self, tab_id: &str, message_id: String) {
        self.set_state(tab_id, ConversationState::StreamingResponse {
            message_id,
            accumulated_text: String::new(),
        });
    }
    
    /// 更新流式响应文本
    pub fn update_streaming_text(&mut self, tab_id: &str, text: &str) {
        if let Some(ConversationState::StreamingResponse { message_id, accumulated_text }) = 
            self.states.get_mut(tab_id) {
            accumulated_text.push_str(text);
        }
    }
    
    /// 状态转换：StreamingResponse -> ToolCalling
    pub fn start_tool_call(&mut self, tab_id: &str, message_id: String, tool_call_id: String, tool_name: String) {
        self.set_state(tab_id, ConversationState::ToolCalling {
            message_id,
            tool_call_id,
            tool_name,
            status: ToolCallStatus::Pending,
        });
    }
    
    /// 更新工具调用状态
    pub fn update_tool_call_status(&mut self, tab_id: &str, status: ToolCallStatus) {
        if let Some(ConversationState::ToolCalling { message_id, tool_call_id, tool_name, .. }) = 
            self.states.get(tab_id).cloned() {
            self.set_state(tab_id, ConversationState::ToolCalling {
                message_id,
                tool_call_id,
                tool_name,
                status,
            });
        }
    }
    
    /// 状态转换：ToolCalling -> StreamingResponse（工具完成，继续回复）
    pub fn tool_call_completed(&mut self, tab_id: &str, message_id: String) {
        if let Some(ConversationState::StreamingResponse { accumulated_text, .. }) = 
            self.states.get(tab_id).cloned() {
            self.set_state(tab_id, ConversationState::StreamingResponse {
                message_id,
                accumulated_text,
            });
        } else {
            // 如果没有StreamingResponse状态，创建新的
            self.set_state(tab_id, ConversationState::StreamingResponse {
                message_id,
                accumulated_text: String::new(),
            });
        }
    }
    
    /// 状态转换：StreamingResponse -> Completed
    pub fn complete_conversation(&mut self, tab_id: &str, message_id: String) {
        self.set_state(tab_id, ConversationState::Completed { message_id });
    }
    
    /// 状态转换：任何状态 -> Idle
    pub fn reset_to_idle(&mut self, tab_id: &str) {
        self.set_state(tab_id, ConversationState::Idle);
    }
    
    /// 状态转换：任何状态 -> Error
    pub fn set_error(&mut self, tab_id: &str, message_id: String, error: String, recoverable: bool, suggestion: Option<String>) {
        self.set_state(tab_id, ConversationState::Error {
            message_id,
            error,
            recoverable,
            suggestion,
        });
    }
    
    /// 获取对话历史
    pub fn get_history(&self, tab_id: &str) -> Vec<crate::services::ai_providers::ChatMessage> {
        self.histories.get(tab_id)
            .cloned()
            .unwrap_or_default()
    }
    
    /// 添加消息到历史
    pub fn add_message(&mut self, tab_id: &str, message: crate::services::ai_providers::ChatMessage) {
        self.histories.entry(tab_id.to_string())
            .or_insert_with(Vec::new)
            .push(message);
    }
    
    /// 清空对话历史
    pub fn clear_history(&mut self, tab_id: &str) {
        self.histories.remove(tab_id);
    }
    
    /// 清理不活跃的对话（可选，用于内存管理）
    pub fn cleanup_inactive(&mut self, active_tab_ids: &[String]) {
        let active_set: std::collections::HashSet<_> = active_tab_ids.iter().collect();
        self.states.retain(|k, _| active_set.contains(k));
        self.histories.retain(|k, _| active_set.contains(k));
    }
}

impl Default for ConversationManager {
    fn default() -> Self {
        Self::new()
    }
}

