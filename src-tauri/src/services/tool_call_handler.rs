//! 工具调用处理器模块
//! 
//! 负责执行工具调用，处理工具结果，管理工具调用状态

use crate::services::tool_service::{ToolService, ToolCall, ToolResult};
use std::path::PathBuf;

/// 工具调用处理器
pub struct ToolCallHandler {
    tool_service: ToolService,
}

impl ToolCallHandler {
    /// 创建新的工具调用处理器
    pub fn new() -> Self {
        Self {
            tool_service: ToolService::new(),
        }
    }
    
    /// 执行工具调用（带重试机制）
    pub async fn execute_tool_with_retry(
        &self,
        tool_call: &ToolCall,
        workspace_path: &PathBuf,
        max_retries: usize,
    ) -> (ToolResult, usize) {
        let mut last_error = None;
        
        for attempt in 1..=max_retries {
            match self.tool_service.execute_tool(tool_call, workspace_path).await {
                Ok(result) => {
                    if result.success {
                        if attempt > 1 {
                            eprintln!("✅ 工具执行成功（第 {} 次尝试）: {}", attempt, tool_call.name);
                        }
                        return (result, attempt);
                    } else {
                        // 工具返回失败，但这是工具层面的失败（如文件不存在），不需要重试
                        return (result, attempt);
                    }
                }
                Err(e) => {
                    last_error = Some(e.clone());
                    eprintln!("⚠️ 工具执行失败（第 {} 次尝试）: {} - {}", attempt, tool_call.name, e);
                    if attempt < max_retries {
                        // 等待一小段时间后重试（指数退避）
                        let delay_ms = 100u64 * attempt as u64;
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                        eprintln!("🔄 重试工具调用: {} (尝试 {}/{})", tool_call.name, attempt + 1, max_retries);
                    }
                }
            }
        }
        
        // 所有重试都失败了
        let error_msg = last_error.unwrap_or_else(|| "未知错误".to_string());
        eprintln!("❌ 工具执行最终失败（已重试 {} 次）: {} - {}", max_retries, tool_call.name, error_msg);
        
        (
            ToolResult {
                success: false,
                data: None,
                error: Some(format!("执行失败（已重试 {} 次）: {}", max_retries, error_msg)),
                message: None,
            },
            max_retries,
        )
    }
    
    /// 解析工具调用参数（带增强修复）
    pub fn parse_tool_arguments(arguments: &str) -> serde_json::Value {
        match serde_json::from_str::<serde_json::Value>(arguments) {
            Ok(args) => {
                eprintln!("✅ 成功解析工具调用参数");
                args
            }
            Err(e) => {
                eprintln!("⚠️ 工具调用参数 JSON 解析失败: {}, arguments 长度: {}", e, arguments.len());
                
                // 尝试修复 JSON
                let repaired = Self::repair_json_string(arguments);
                
                // 尝试解析修复后的 JSON
                match serde_json::from_str::<serde_json::Value>(&repaired) {
                    Ok(args) => {
                        eprintln!("✅ JSON 修复成功");
                        args
                    }
                    Err(e2) => {
                        eprintln!("❌ JSON 修复后仍然解析失败: {}", e2);
                        // 尝试从部分 JSON 中提取可用字段
                        Self::extract_partial_json(arguments)
                    }
                }
            }
        }
    }
    
    /// 修复 JSON 字符串（处理字符串转义和未闭合问题）
    fn repair_json_string(broken: &str) -> String {
        let mut repaired = broken.trim().to_string();
        
        // 1. 确保以 { 开头
        if !repaired.starts_with('{') {
            repaired = format!("{{{repaired}");
        }
        
        // 2. 修复缺失的结束括号
        if repaired.starts_with('{') && !repaired.ends_with('}') {
            let open = repaired.matches('{').count();
            let close = repaired.matches('}').count();
            let missing = open - close;
            repaired = repaired.trim_end_matches(',').trim().to_string();
            for _ in 0..missing {
                repaired.push('}');
            }
        }
        
        // 3. 修复字符串值中的未转义换行符（在字符串值内部）
        // 注意：我们需要小心处理，只在字符串值内部替换，不在键名或其他地方替换
        // 简单策略：查找 "key": "value 模式，在 value 部分替换未转义的换行符
        let mut result = String::new();
        let mut in_string = false;
        let mut escaped = false;
        let mut chars = repaired.chars().peekable();
        
        while let Some(ch) = chars.next() {
            if escaped {
                result.push(ch);
                escaped = false;
                continue;
            }
            
            if ch == '\\' {
                result.push(ch);
                escaped = true;
                continue;
            }
            
            if ch == '"' {
                in_string = !in_string;
                result.push(ch);
                continue;
            }
            
            if in_string && ch == '\n' {
                // 在字符串值内部，将未转义的换行符替换为 \n
                result.push_str("\\n");
            } else if in_string && ch == '\r' {
                // 处理 \r\n 或单独的 \r
                if chars.peek() == Some(&'\n') {
                    chars.next(); // 跳过 \n
                    result.push_str("\\n");
                } else {
                    result.push_str("\\n");
                }
            } else if in_string && ch == '\t' {
                // 将制表符转义
                result.push_str("\\t");
            } else if in_string && ch == '"' {
                // 字符串中的引号应该被转义（但这里我们已经处理了字符串边界）
                result.push_str("\\\"");
            } else {
                result.push(ch);
            }
        }
        
        result
    }
    
    /// 从部分 JSON 中提取可用字段（作为最后的备选方案）
    fn extract_partial_json(broken: &str) -> serde_json::Value {
        eprintln!("🔍 尝试从部分 JSON 中提取可用字段...");
        let mut extracted = serde_json::json!({});
        
        // ⚠️ 特殊处理：如果 JSON 很大（>5000 字符）且被截断，尝试修复
        if broken.len() > 5000 && !broken.trim().ends_with('}') {
            eprintln!("⚠️ 检测到大 JSON 被截断（长度: {}），尝试修复...", broken.len());
            // 尝试找到最后一个完整的字段
            // 如果 content 字段被截断，尝试提取已累积的部分
            if let Some(content_start) = broken.rfind("\"content\"") {
                // 找到 content 字段的开始位置
                if let Some(colon_pos) = broken[content_start..].find(':') {
                    let value_start = content_start + colon_pos + 1;
                    // 跳过空格和引号
                    let value_str = broken[value_start..].trim_start();
                    if value_str.starts_with('"') {
                        // 尝试找到最后一个完整的引号对
                        // 由于内容可能包含转义字符，我们需要更智能的解析
                        eprintln!("⚠️ content 字段可能被截断，但已提取部分内容（长度: {}）", broken.len() - value_start);
                        // 暂时不提取被截断的 content，只提取 path
                    }
                }
            }
        }
        
        // 尝试提取 path 字段（对于 update_file 等工具很重要）
        // 使用简单的正则或字符串匹配
        if let Some(path_start) = broken.find("\"path\"") {
            // 查找 path 的值
            if let Some(colon_pos) = broken[path_start..].find(':') {
                let value_start = path_start + colon_pos + 1;
                let value_str = &broken[value_start..];
                
                // 跳过空格
                let value_str = value_str.trim_start();
                
                // 如果以引号开头，尝试提取字符串值
                if value_str.starts_with('"') {
                    let mut path_value = String::new();
                    let mut escaped = false;
                    for (i, ch) in value_str.chars().enumerate().skip(1) {
                        if escaped {
                            path_value.push(ch);
                            escaped = false;
                            continue;
                        }
                        if ch == '\\' {
                            escaped = true;
                            path_value.push(ch);
                            continue;
                        }
                        if ch == '"' {
                            break;
                        }
                        path_value.push(ch);
                    }
                    
                    if !path_value.is_empty() {
                        extracted["path"] = serde_json::json!(path_value);
                        eprintln!("✅ 成功提取 path 字段: {}", path_value);
                    }
                }
            }
        }
        
        // 如果提取到了字段，返回提取的结果；否则返回空对象
        if extracted.as_object().unwrap().is_empty() {
            eprintln!("❌ 无法提取任何字段，使用空对象（工具调用将失败）");
            serde_json::json!({})
        } else {
            eprintln!("✅ 部分提取成功，返回提取的字段");
            extracted
        }
    }
    
    /// 检查操作是否需要用户确认
    pub fn requires_confirmation(tool_name: &str, arguments: &serde_json::Value) -> bool {
        match tool_name {
            "delete_file" | "delete_folder" => true,
            "edit_current_editor_document" => true,
            "move_file" => {
                // 批量操作需要确认（超过10个）
                // 这里简化处理，实际应该统计批量操作数量
                false // 暂时不确认，因为无法准确统计
            }
            "create_file" => {
                // 检查是否覆盖现有文件
                if let Some(path) = arguments.get("path").and_then(|p| p.as_str()) {
                    // 这里应该检查文件是否存在，但需要文件系统访问
                    // 暂时不确认，由工具执行时检查
                    false
                } else {
                    false
                }
            }
            _ => false,
        }
    }
}

impl Default for ToolCallHandler {
    fn default() -> Self {
        Self::new()
    }
}

