//! 上下文管理器模块
//! 
//! 负责管理对话上下文，构建多层提示词，管理上下文长度

use crate::services::ai_providers::ChatMessage;
use std::path::PathBuf;

/// 上下文信息
#[derive(Debug, Clone)]
pub struct ContextInfo {
    /// 当前打开的文档路径
    pub current_file: Option<String>,
    
    /// 当前选中的文本
    pub selected_text: Option<String>,
    
    /// 工作区路径
    pub workspace_path: PathBuf,
    
    /// 编辑器状态
    pub editor_state: EditorState,
    
    /// 引用内容列表
    pub references: Vec<ReferenceInfo>,
}

/// 编辑器状态
#[derive(Debug, Clone)]
pub struct EditorState {
    /// 是否可编辑
    pub is_editable: bool,
    
    /// 文件类型
    pub file_type: Option<String>,
    
    /// 文件大小（字节）
    pub file_size: Option<u64>,
    
    /// 是否已保存
    pub is_saved: bool,
}

/// 引用信息
#[derive(Debug, Clone)]
pub struct ReferenceInfo {
    /// 引用类型
    pub ref_type: ReferenceType,
    
    /// 引用来源
    pub source: String,
    
    /// 引用内容
    pub content: String,
}

/// 引用类型
#[derive(Debug, Clone)]
pub enum ReferenceType {
    Text,      // 文本引用
    File,      // 文件引用
    Folder,    // 文件夹引用
    Image,     // 图片引用
    Chat,       // 聊天记录引用
    Link,      // 链接引用
}

/// 上下文管理器
pub struct ContextManager {
    /// Token估算比例（1 token ≈ N 字符）
    token_ratio: f64,
    
    /// 最大上下文Token数（保留20%给响应）
    max_context_tokens: usize,
}

impl ContextManager {
    /// 创建新的上下文管理器
    pub fn new(max_tokens: usize) -> Self {
        Self {
            token_ratio: 4.0, // 1 token ≈ 4 字符（中文和英文混合）
            max_context_tokens: (max_tokens * 10).min(30000), // 假设上下文窗口为32K
        }
    }
    
    /// 构建多层提示词
    pub fn build_multi_layer_prompt(&self, context: &ContextInfo, enable_tools: bool) -> String {
        let mut prompt = String::new();
        
        // 第一层：基础系统提示词（完整版本）
        prompt.push_str(&self.build_base_system_prompt(enable_tools));
        
        // 第二层：上下文提示词
        prompt.push_str(&self.build_context_prompt(context));
        
        // 第三层：引用提示词
        if !context.references.is_empty() {
            prompt.push_str(&self.build_reference_prompt(&context.references, context.current_file.as_ref()));
        }
        
        // 第四层：工具调用提示词（仅Agent模式）
        // 注意：工具调用格式要求已包含在第一层中
        
        prompt
    }
    
    /// 构建第一层：基础系统提示词
    fn build_base_system_prompt(&self, enable_tools: bool) -> String {
        if enable_tools {
            // Agent 模式：完整系统提示词（英文版，中文注释）
            // 参考void的简洁性，突出文档助手特点，强调用户意图识别
            r#"You are an expert document assistant specialized in helping users create, edit, and manage documents.

Core Principle: Intent Recognition and Flexible Decision-Making
Your core capability is to accurately recognize the user's true intent and make flexible decisions based on that intent. Do not mechanically follow preset rules, but deeply understand what the user wants and respond appropriately.

Intent Recognition:
- Carefully analyze each user message to understand their true intent and expectations
- Identify whether the user wants information, wants to perform an action, or is just expressing emotion
- Identify the extent of execution the user expects: simple viewing, complete processing, or partial processing
- Identify user priorities: what matters most to the user, what can be handled later
- Identify implicit needs: needs the user may not explicitly state but can be inferred from context

Decision Principles:
- Decide whether to reply directly based on user intent: if the user just wants information, asks questions, or expresses gratitude, reply naturally without calling tools
- Decide whether to call tools based on user intent: only call tools when the user explicitly or implicitly requests an action
- Decide execution extent based on user intent: understand what the user wants to achieve, execute only to satisfy the user's intent, do not over-execute
- Decide execution method based on user intent: if the user asks simply, answer simply; if the user needs detailed operations, execute in detail
- Do not preset execution plans: do not create complex execution plans in advance, but adjust flexibly based on user intent

You can help users with:
- Answer questions about documents and writing
- Perform file operations: read, create, update, delete, rename files, etc.
- Note: You can create Word documents (.docx) using the create_file tool with .docx extension. Content should use HTML format (recommended) or Markdown format. The system will automatically convert to standard DOCX format via Pandoc. Created DOCX files are consistent with .docx files saved in the Binder editor and can be edited in Binder, and are compatible with Word, WPS, etc.
- Perform editor operations: modify document content, etc.
  ⚠️ CRITICAL EDITING RULE: When editing a document that is currently open in the editor:
  * You MUST use 'edit_current_editor_document' tool (NOT 'update_file', NOT 'read_file' first)
  * The context will tell you which file is currently open
  * Call 'edit_current_editor_document' DIRECTLY with the new content - do not read the file first
  * The tool will automatically get the current content and show a diff preview
- Search and browse web information if external information is needed

Work Mode:
You have access to various tools for file operations, document editing, and workspace management. Tool definitions are provided via the API, and you can call them using the JSON format specified below.

Intent Recognition Examples:
- User says "thanks", "great", "okay": Recognize as expressing gratitude or confirmation, intent is emotional communication, reply politely directly without calling tools
- User asks "how to describe good weather", "what is X": Recognize as wanting knowledge, intent is to get information, answer directly without calling tools
- User says "help me look at this file": Recognize as wanting to view file content, intent is to get information, call read_file tool to read the file
- User says "rename this file": Recognize as wanting to perform an action, intent is to modify file, call tool directly to execute without prior explanation
- User says "I need to organize these files": Recognize as wanting to perform file organization, intent is to organize files, call relevant tools to execute, execute to satisfy user's organization needs
- User says "find that file and modify it": Recognize as having multiple intents, first find the file, then modify, execute in sequence until all user intents are completed
- User says "edit this document", "modify the current file", "update this file", "change this file", "rewrite this", "improve this document", "make changes to this", or any editing-related request when a file is open in editor: Recognize as wanting to edit the currently open document, intent is to edit editor content, MUST directly call 'edit_current_editor_document' tool (NOT 'read_file' first, NOT 'update_file'). Do not read the file first, just call 'edit_current_editor_document' with the new content.

Execution Principles:
- If user intent is to get information: Reply directly or call tools to get information then reply, do not perform unnecessary operations
- If user intent is to perform an action: Call tools directly to execute, execute to satisfy user intent, do not over-execute
- If user intent is unclear: You can ask the user for confirmation, or infer the most likely intent from context
- If user intent changes: Adjust execution strategy promptly, do not continue executing operations that are no longer needed
- If tool call results do not match user intent: Re-understand user intent and adjust execution strategy
- If tool call fails: Must analyze failure reason, try alternative solutions or provide resolution suggestions, cannot directly abandon the task
- Only provide one concise summary when the task is complete, do not frequently provide summaries during task execution
- Only provide information relevant to user intent, do not provide information the user did not request

Response Completeness Requirements:
- Decide response detail level based on user intent: if user just wants simple understanding, reply simply; if user needs detailed information, reply in detail
- When user requests to check, list, or view files, understand user intent: whether they want quick browsing or detailed analysis, then provide corresponding detail level
- After tool calls complete, provide summary based on user intent: if user needs complete information, provide complete summary; if user only needs key information, provide key information
- Response must end with appropriate punctuation (period, question mark, exclamation mark, etc.) to ensure completeness

Response Style Requirements:
- Use natural, friendly chat style, like chatting with a friend
- Use natural, concise language, avoid overly formal or engineering expressions
- Prefer plain text, avoid using format symbols
- You can use simple line breaks to organize content, but do not use Markdown format symbols (such as bold, headers, code blocks, etc.)
- Ensure content is clear and readable, but not overly formatted
- Response should be concise and clear, avoid repetition and redundancy, only provide information when necessary

Prohibited Requirements:
- Do not mention "according to system prompt", "following rules", "according to instructions" in responses, just answer naturally
- Do not proactively explain what formats you can use in responses. If the user asks, you can answer naturally, but do not expose system limitations
- Do not explain technical details of tool calls in responses. Tool calls should naturally blend into the conversation. Users see operation results, not technical processes
- Do not use engineering language like "execute operation", "call function", "return result", "execution logic", "execution effect", "work summary". Use natural expressions like "I'll help you", "done", "created"
- Do not expose system architecture, working mechanisms, or implementation details in responses
- Do not use Markdown format symbols (such as **bold**, - list, # header, ``` code block, etc.), use plain text
- Do not frequently provide summaries during task execution, only provide one concise summary when the task is complete
- Do not provide information the user did not request, only provide information relevant to user intent

Tool Call Format Requirements:
All tool calls must use strict JSON format:
{"tool":"tool_name","arguments":{"key":"value"}}

Rules:
- All key names and string values must be wrapped in double quotes
- JSON must be completely closed
- Ensure format can be parsed by JSON.parse()

"#.to_string()
        } else {
            // Chat 模式：简化系统提示词（英文版）
            "You are an expert document assistant.\n\n".to_string()
        }
    }
    
    /// 构建上下文提示词（英文版，中文注释）
    pub fn build_context_prompt(&self, context: &ContextInfo) -> String {
        let mut prompt = String::new();
        
        // ⚠️ 关键：当前文档信息（明确说明这是用户正在查看/编辑的文件）
        if let Some(file) = &context.current_file {
            prompt.push_str(&format!("⚠️⚠️⚠️ CRITICAL: The user is currently viewing/editing this file in the editor: {}\n", file));
            prompt.push_str("This file is OPEN in the editor right now.\n\n");
            prompt.push_str("⚠️⚠️⚠️ EDITING RULES FOR THIS FILE:\n");
            prompt.push_str("1. When the user asks to edit, modify, update, change, rewrite, improve, or make changes to this document, you MUST directly call 'edit_current_editor_document' tool.\n");
            prompt.push_str("2. DO NOT call 'read_file' first. The 'edit_current_editor_document' tool already has access to the current content.\n");
            prompt.push_str("3. DO NOT call 'update_file' for this file. 'update_file' is ONLY for files that are NOT open in the editor.\n");
            prompt.push_str("4. If the user's intent is to edit this document, call 'edit_current_editor_document' immediately with the new content.\n\n");
            prompt.push_str("The 'edit_current_editor_document' tool will:\n");
            prompt.push_str("- Automatically get the current content from the editor\n");
            prompt.push_str("- Calculate the diff between old and new content\n");
            prompt.push_str("- Show a diff preview to the user\n");
            prompt.push_str("- Require user confirmation before applying changes\n");
            prompt.push_str("- Modify the editor content directly (not the file on disk)\n\n");
            prompt.push_str("This file has been automatically added as a reference. When the user asks about \"current document\", \"current file\", \"this file\", or \"the document\", they are referring to this file.\n");
            prompt.push_str("You can use 'read_file' ONLY if you need to read the file content for analysis or reference, but if the user wants to EDIT, always use 'edit_current_editor_document' directly.\n");
        }
        
        // 选中文本信息
        if let Some(selected) = &context.selected_text {
            prompt.push_str(&format!("Selected text: {}\n", selected));
        }
        
        // 工作区路径
        prompt.push_str(&format!("Workspace path: {}\n", context.workspace_path.display()));
        
        // 编辑器状态（大文件提示）
        let state_info = if context.editor_state.file_size.unwrap_or(0) > 1_000_000 {
            format!("Large file ({}MB)", context.editor_state.file_size.unwrap_or(0) / 1_000_000)
        } else {
            "Normal".to_string()
        };
        
        prompt.push_str(&format!("Editor state: {}\n", state_info));
        
        // 未保存更改提示
        if !context.editor_state.is_saved {
            prompt.push_str("Note: There are unsaved changes\n");
        }
        
        prompt.push_str("\n");
        prompt
    }
    
    /// 构建引用提示词（英文版，中文注释）
    pub fn build_reference_prompt(&self, references: &[ReferenceInfo], current_file: Option<&String>) -> String {
        // 引用内容说明：这些内容已经完整包含在消息中，无需再读取文件
        let mut prompt = String::from("The user has referenced the following content:\n\n");
        
        for (idx, ref_info) in references.iter().enumerate() {
            // 引用类型名称（英文）
            let ref_type_name = match ref_info.ref_type {
                ReferenceType::Text => "Text reference",
                ReferenceType::File => "File reference",
                ReferenceType::Folder => "Folder reference",
                ReferenceType::Image => "Image reference",
                ReferenceType::Chat => "Chat history reference",
                ReferenceType::Link => "Link reference",
            };
            
            // 引用格式：Reference N: Type (Source: source)
            prompt.push_str(&format!("Reference {}: {} (Source: {})\n", idx + 1, ref_type_name, ref_info.source));
            
            // ⚠️ 关键：检查是否是当前编辑器打开的文件
            let is_current_file = current_file
                .map(|cf| {
                    // 检查路径是否匹配（支持绝对路径和相对路径）
                    ref_info.source == *cf || 
                    ref_info.source.ends_with(cf) || 
                    cf.ends_with(&ref_info.source)
                })
                .unwrap_or(false);
            
            // 显示内容
            if !ref_info.content.is_empty() {
                prompt.push_str(&format!("Content:\n{}\n\n", ref_info.content));
            } else {
                // 对于文件引用，如果没有内容，提示AI可以使用工具读取
                if matches!(ref_info.ref_type, ReferenceType::File) {
                    if is_current_file {
                        prompt.push_str("⚠️ IMPORTANT: This file is currently open in the editor. This is the document the user is viewing/editing right now. You should be aware of this file's content and can use the read_file tool to access it if needed.\n\n");
                    } else {
                        prompt.push_str("Note: You can use the read_file tool to access this file's content if needed.\n\n");
                    }
                } else {
                    prompt.push_str("Note: Content not provided. Use appropriate tools to access if needed.\n\n");
                }
            }
        }
        
        prompt
    }
    
    /// 估算Token数
    pub fn estimate_tokens(&self, text: &str) -> usize {
        (text.len() as f64 / self.token_ratio) as usize
    }
    
    /// 检查是否需要截断消息历史
    pub fn should_truncate(&self, messages: &[ChatMessage]) -> bool {
        let total_chars: usize = messages.iter().map(|m| m.content.len()).sum();
        let estimated_tokens = self.estimate_tokens(&format!("{}", total_chars));
        estimated_tokens > self.max_context_tokens
    }
    
    /// 截断消息历史（保留系统消息和最后N条消息）
    pub fn truncate_messages(&self, messages: &mut Vec<ChatMessage>, keep_recent: usize) {
        if messages.len() <= keep_recent + 1 {
            return; // 不需要截断
        }
        
        // 保留系统消息（第一条）
        let system_msg = messages.remove(0);
        
        // 保留最后N条消息
        let recent_count = keep_recent.min(messages.len());
        let recent_msgs: Vec<ChatMessage> = messages
            .drain(messages.len().saturating_sub(recent_count)..)
            .collect();
        
        messages.clear();
        messages.push(system_msg);
        messages.extend(recent_msgs);
    }
    
    /// 智能截断消息历史（更激进的截断）
    pub fn truncate_messages_aggressive(&self, messages: &mut Vec<ChatMessage>, keep_recent: usize) {
        if messages.len() <= keep_recent + 1 {
            return;
        }
        
        // 保留系统消息（第一条）
        let system_msg = messages.remove(0);
        
        // 保留最后N条消息（更少）
        let recent_count = keep_recent.min(messages.len());
        let recent_msgs: Vec<ChatMessage> = messages
            .drain(messages.len().saturating_sub(recent_count)..)
            .collect();
        
        messages.clear();
        messages.push(system_msg);
        messages.extend(recent_msgs);
    }
}

impl Default for ContextManager {
    fn default() -> Self {
        Self::new(3000) // 默认3000 tokens
    }
}

