// Diff 计算服务
// 使用 similar crate 实现高性能的 diff 算法

use similar::{DiffTag, TextDiff};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diff {
    pub diff_id: String,
    pub diff_area_id: String,
    pub diff_type: DiffType,
    pub original_code: String,
    pub original_start_line: usize,
    pub original_end_line: usize,
    pub new_code: String,
    pub start_line: usize,
    pub end_line: usize,
    // ⚠️ 上下文信息：用于精确匹配定位
    pub context_before: Option<String>, // 目标文本前面的上下文（50-100字符）
    pub context_after: Option<String>,  // 目标文本后面的上下文（50-100字符）
    // ⚠️ 元素类型和标识符：用于表格、图片等复杂元素
    pub element_type: Option<String>, // "text" | "table" | "image" | "code_block"
    pub element_identifier: Option<String>, // 用于表格、图片等复杂元素
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum DiffType {
    Edit,
    Insertion,
    Deletion,
}

pub struct DiffService;

/// 位置映射表：纯文本位置 → HTML 位置
/// 用于在纯文本上计算 Diff，然后映射回 HTML 位置
struct PositionMap {
    // text_pos → html_pos（纯文本位置到 HTML 位置的映射）
    text_to_html: Vec<usize>,
    // 纯文本内容（已移除所有 HTML 标签）
    text_content: String,
    // 原始 HTML 内容
    html_content: String,
}

impl DiffService {
    pub fn new() -> Self {
        Self
    }
    
    /// ⚠️ 辅助函数：移除 HTML 标签
    /// ⚠️ 关键修复：改进处理逻辑，能够处理不完整的 HTML 标签片段
    fn strip_html_tags(text: &str) -> String {
        let mut result = String::new();
        let mut in_tag = false;
        let mut in_quotes = false;
        let mut quote_char = '\0';
        
        for ch in text.chars() {
            if in_tag {
                // 在标签内
                if !in_quotes && (ch == '\'' || ch == '"') {
                    // 进入引号
                    in_quotes = true;
                    quote_char = ch;
                } else if in_quotes && ch == quote_char {
                    // 退出引号
                    in_quotes = false;
                    quote_char = '\0';
                } else if !in_quotes && ch == '>' {
                    // 标签结束
                    in_tag = false;
                }
                // 标签内的内容（包括属性值）都跳过
            } else {
                // 不在标签内
                if ch == '<' {
                    // 标签开始
                    in_tag = true;
                    in_quotes = false;
                    quote_char = '\0';
                } else {
                    // 普通文本，保留
                    result.push(ch);
                }
            }
        }
        
        // 替换 HTML 实体
        result.replace("&nbsp;", " ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
    }
    
    /// 提取上下文信息
    /// 从 old_content 中提取目标文本前后的上下文（用于精确匹配定位）
    /// 上下文应该包含足够的唯一信息来准确定位修改位置
    fn extract_context(
        old_content: &str,
        target_start_line: usize,
        target_end_line: usize,
        context_chars: usize,
    ) -> (Option<String>, Option<String>) {
        let lines: Vec<&str> = old_content.lines().collect();
        let total_lines = lines.len();
        
        if total_lines == 0 || target_start_line == 0 || target_start_line > total_lines {
            return (None, None);
        }
        
        // ⚠️ 改进：提取目标行之前的上下文（优先提取目标行紧前面的内容）
        // 策略：先提取目标行紧前面的1-2行，如果不够再向前扩展
        let mut before_text = String::new();
        
        // 首先提取目标行紧前面的内容（最多3行，确保包含足够的定位信息）
        let context_lines_before = 3.min(target_start_line.saturating_sub(1));
        let before_start = target_start_line.saturating_sub(context_lines_before);
        
        for i in before_start..(target_start_line - 1) {
            if i < lines.len() {
                before_text.push_str(lines[i]);
                before_text.push('\n');
            }
        }
        
        // 如果提取的内容不够，向前扩展（但限制总长度）
        // 使用字符数而不是字节数进行比较
        let before_text_char_count = before_text.chars().count();
        if before_text_char_count < context_chars / 2 && before_start > 0 {
            let mut extended_before = String::new();
            let extended_start = before_start.saturating_sub(5); // 最多再向前5行
            
            for i in extended_start..before_start {
                if i < lines.len() {
                    extended_before.push_str(lines[i]);
                    extended_before.push('\n');
                }
            }
            
            // 合并，但限制总长度
            let combined = format!("{}{}", extended_before, before_text);
            let combined_char_count = combined.chars().count();
            if combined_char_count <= context_chars {
                before_text = combined;
            } else {
                // 如果合并后太长，只保留后面的部分（更接近目标行）
                // 使用字符迭代器，避免字节边界问题
                let start_chars = combined_char_count.saturating_sub(context_chars);
                before_text = combined.chars().skip(start_chars).take(context_chars).collect::<String>();
            }
        }
        
        // 限制上下文长度（优先保留接近目标行的内容）
        // 使用字符迭代器，避免字节边界问题
        let context_before = if !before_text.is_empty() {
            let char_count = before_text.chars().count();
            let start_chars = char_count.saturating_sub(context_chars);
            let raw_context = before_text.chars().skip(start_chars).take(context_chars).collect::<String>();
            // ⚠️ 关键修复：移除 HTML 标签，确保上下文是纯文本
            Some(Self::strip_html_tags(&raw_context))
        } else {
            None
        };
        
        // ⚠️ 改进：提取目标行之后的上下文（优先提取目标行紧后面的内容）
        let mut after_text = String::new();
        
        // 首先提取目标行紧后面的内容（最多3行）
        let after_end = (target_end_line + 3).min(total_lines);
        
        for i in target_end_line..after_end {
            if i < lines.len() {
                after_text.push_str(lines[i]);
                after_text.push('\n');
            }
        }
        
        // 如果提取的内容不够，向后扩展（但限制总长度）
        // 使用字符数而不是字节数进行比较
        let after_text_char_count = after_text.chars().count();
        if after_text_char_count < context_chars / 2 && after_end < total_lines {
            let mut extended_after = String::new();
            let extended_end = (after_end + 5).min(total_lines);
            
            for i in after_end..extended_end {
                if i < lines.len() {
                    extended_after.push_str(lines[i]);
                    extended_after.push('\n');
                }
            }
            
            // 合并，但限制总长度
            let combined = format!("{}{}", after_text, extended_after);
            let combined_char_count = combined.chars().count();
            if combined_char_count <= context_chars {
                after_text = combined;
            } else {
                // 如果合并后太长，只保留前面的部分（更接近目标行）
                // 使用字符迭代器，避免字节边界问题
                after_text = combined.chars().take(context_chars).collect::<String>();
            }
        }
        
        // 限制上下文长度（使用字符迭代器，避免字节边界问题）
        let context_after = if !after_text.is_empty() {
            // 使用 chars() 迭代器来安全地截取字符，避免字节边界问题
            let char_count = after_text.chars().count();
            let take_chars = context_chars.min(char_count);
            let raw_context = after_text.chars().take(take_chars).collect::<String>();
            // ⚠️ 关键修复：移除 HTML 标签，确保上下文是纯文本
            Some(Self::strip_html_tags(&raw_context))
        } else {
            None
        };
        
        (context_before, context_after)
    }
    
    /// 构建位置映射表：HTML → 纯文本
    /// 返回纯文本内容和位置映射（纯文本位置 → HTML 位置）
    fn build_position_map(html: &str) -> PositionMap {
        let mut text_content = String::new();
        let mut text_to_html = Vec::new();
        let mut in_tag = false;
        let mut in_quotes = false;
        let mut quote_char = '\0';
        
        for (html_pos, ch) in html.char_indices() {
            if in_tag {
                // 在标签内
                if !in_quotes && (ch == '\'' || ch == '"') {
                    // 进入引号
                    in_quotes = true;
                    quote_char = ch;
                } else if in_quotes && ch == quote_char {
                    // 退出引号
                    in_quotes = false;
                    quote_char = '\0';
                } else if !in_quotes && ch == '>' {
                    // 标签结束
                    in_tag = false;
                }
                // 标签内的内容（包括属性值）都跳过，不记录到纯文本
            } else {
                // 不在标签内
                if ch == '<' {
                    // 标签开始
                    in_tag = true;
                    in_quotes = false;
                    quote_char = '\0';
                } else {
                    // 这是可见文本字符
                    text_content.push(ch);
                    // 记录映射：当前纯文本位置 → HTML 位置
                    text_to_html.push(html_pos);
                }
            }
        }
        
        PositionMap {
            text_to_html,
            text_content,
            html_content: html.to_string(),
        }
    }
    
    /// 将纯文本位置映射回 HTML 位置（用于行号计算）
    /// 如果纯文本位置超出范围，返回 HTML 内容的末尾位置
    fn text_pos_to_html_pos(map: &PositionMap, text_pos: usize) -> usize {
        if text_pos < map.text_to_html.len() {
            map.text_to_html[text_pos]
        } else {
            map.html_content.len()
        }
    }
    
    /// 从纯文本中安全提取文本片段（基于字符位置，不是字节位置）
    /// 使用字符迭代器，避免多字节字符导致的字节边界问题；边界按字符数比较，避免与 str::len() 字节数混淆
    fn extract_text_safe(text: &str, start: usize, end: usize) -> String {
        let char_len = text.chars().count();
        if start >= end || start >= char_len {
            return String::new();
        }
        let end = end.min(char_len);
        text.chars().skip(start).take(end - start).collect()
    }
    
    /// 将 HTML 字节位置转换为字符位置
    /// 因为 text_to_html 存储的是字节位置（从 char_indices 获取）
    fn byte_pos_to_char_pos(html_content: &str, byte_pos: usize) -> usize {
        let mut char_count = 0;
        for (byte_idx, _) in html_content.char_indices() {
            if byte_idx >= byte_pos {
                break;
            }
            char_count += 1;
        }
        char_count
    }
    
    /// 计算字符位置对应的行号（基于 HTML 内容）
    /// 注意：char_pos 是 HTML 中的字符位置，不是字节位置
    fn char_pos_to_line(html_content: &str, char_pos: usize) -> usize {
        let mut line_count = 1;
        let mut char_count = 0;
        
        for ch in html_content.chars() {
            if char_count >= char_pos {
                break;
            }
            if ch == '\n' {
                line_count += 1;
            }
            char_count += 1;
        }
        
        line_count
    }
    
    /// 计算两个内容之间的差异
    /// 使用 similar crate 的高性能 diff 算法
    /// ⚠️ 方案 1：纯文本 Diff + 位置映射
    /// 核心思路：
    /// 1. HTML → 纯文本（移除所有标签）
    /// 2. 在纯文本上计算 Diff（位置永远不会落在标签中间）
    /// 3. 纯文本位置 → HTML 位置（映射回去，用于行号计算和上下文提取）
    /// 4. original_code 和 new_code 直接从纯文本 Diff 获取（已经是纯文本）
    pub fn calculate_diff(
        &self,
        old_content: &str,
        new_content: &str,
    ) -> Result<Vec<Diff>, String> {
        // 检查内容大小（防止大文件导致性能问题）
        const MAX_CONTENT_SIZE: usize = 10 * 1024 * 1024; // 10MB
        if old_content.len() > MAX_CONTENT_SIZE || new_content.len() > MAX_CONTENT_SIZE {
            return Err("文件过大，请分段编辑".to_string());
        }
        
        // ==================== Step 1: 构建位置映射 ====================
        let old_map = Self::build_position_map(old_content);
        let new_map = Self::build_position_map(new_content);
        
        // ==================== Step 2: 在纯文本上计算 Diff ====================
        // ⚠️ 关键修复：在纯文本上计算 Diff，而不是在 HTML 上
        // 这样可以确保位置永远不会落在 HTML 标签中间
        let text_diff = TextDiff::from_chars(&old_map.text_content, &new_map.text_content);
        
        // ==================== Step 3: 处理 Diff 结果并映射位置 ====================
        let mut diffs = Vec::new();
        let mut old_text_pos = 0;
        let mut new_text_pos = 0;
        
        // 遍历所有变更（纯文本 Diff 返回的是纯文本位置范围）
        for op in text_diff.ops() {
            match op.tag() {
                DiffTag::Equal => {
                    // 无变化，跳过
                    let old_range = op.old_range();
                    let new_range = op.new_range();
                    old_text_pos += old_range.len();
                    new_text_pos += new_range.len();
                }
                DiffTag::Delete => {
                    // 删除：从纯文本位置提取 original_code
                    let old_range = op.old_range();
                    let text_start = old_text_pos;
                    let text_end = old_text_pos + old_range.len();
                    
                    // ⚠️ 直接从纯文本提取，已经是纯文本，不需要移除 HTML 标签
                    // 使用字符迭代器安全提取，避免多字节字符问题
                    let original_code = Self::extract_text_safe(&old_map.text_content, text_start, text_end);
                    
                    // 映射到 HTML 位置（用于行号计算）
                    // text_pos_to_html_pos 返回的是字节位置，需要转换为字符位置
                    let html_start_byte = Self::text_pos_to_html_pos(&old_map, text_start);
                    let html_end_byte = Self::text_pos_to_html_pos(&old_map, text_end);
                    
                    // 将字节位置转换为字符位置
                    let html_start_char = Self::byte_pos_to_char_pos(old_content, html_start_byte);
                    let html_end_char = Self::byte_pos_to_char_pos(old_content, html_end_byte);
                    
                    // 计算行号（基于 HTML 内容）
                    let start_line = Self::char_pos_to_line(old_content, html_start_char);
                    let end_line = Self::char_pos_to_line(old_content, html_end_char.saturating_sub(1));
                    
                    // 提取上下文（基于 HTML 内容，但会移除 HTML 标签）
                    let (context_before, context_after) = Self::extract_context(
                        old_content,
                        start_line,
                        end_line,
                        100, // 提取前后各100字符的上下文
                    );
                    
                    // 计算新内容中的行号（用于兼容性）
                    let new_html_pos_byte = Self::text_pos_to_html_pos(&new_map, new_text_pos);
                    let new_html_pos_char = Self::byte_pos_to_char_pos(new_content, new_html_pos_byte);
                    let new_start_line = Self::char_pos_to_line(new_content, new_html_pos_char);
                    
                    diffs.push(Diff {
                        diff_id: format!("diff_{}", Uuid::new_v4()),
                        diff_area_id: String::new(), // 稍后设置
                        diff_type: DiffType::Deletion,
                        original_code,
                        original_start_line: start_line,
                        original_end_line: end_line,
                        new_code: String::new(),
                        start_line: new_start_line,
                        end_line: new_start_line,
                        context_before,
                        context_after,
                        element_type: None, // 将在 tool_service 中设置
                        element_identifier: None, // 将在 tool_service 中设置
                    });
                    
                    old_text_pos += old_range.len();
                }
                DiffTag::Insert => {
                    // 插入：从纯文本位置提取 new_code
                    let new_range = op.new_range();
                    let text_start = new_text_pos;
                    let text_end = new_text_pos + new_range.len();
                    
                    // ⚠️ 直接从纯文本提取，已经是纯文本，不需要移除 HTML 标签
                    // 使用字符迭代器安全提取，避免多字节字符问题
                    let new_code = Self::extract_text_safe(&new_map.text_content, text_start, text_end);
                    
                    // 计算插入位置的行号（基于旧内容的 HTML）
                    let old_html_pos_byte = Self::text_pos_to_html_pos(&old_map, old_text_pos);
                    let old_html_pos_char = Self::byte_pos_to_char_pos(old_content, old_html_pos_byte);
                    let insert_line = Self::char_pos_to_line(old_content, old_html_pos_char);
                    
                    // 提取上下文（基于 HTML 内容，但会移除 HTML 标签）
                    let (context_before, context_after) = Self::extract_context(
                        old_content,
                        insert_line,
                        insert_line,
                        100, // 提取前后各100字符的上下文
                    );
                    
                    // 映射到新内容的 HTML 位置（用于行号计算）
                    let new_html_start_byte = Self::text_pos_to_html_pos(&new_map, text_start);
                    let new_html_end_byte = Self::text_pos_to_html_pos(&new_map, text_end);
                    
                    // 将字节位置转换为字符位置
                    let new_html_start_char = Self::byte_pos_to_char_pos(new_content, new_html_start_byte);
                    let new_html_end_char = Self::byte_pos_to_char_pos(new_content, new_html_end_byte);
                    
                    let new_start_line = Self::char_pos_to_line(new_content, new_html_start_char);
                    let new_end_line = Self::char_pos_to_line(new_content, new_html_end_char.saturating_sub(1));
                    
                    diffs.push(Diff {
                        diff_id: format!("diff_{}", Uuid::new_v4()),
                        diff_area_id: String::new(), // 稍后设置
                        diff_type: DiffType::Insertion,
                        original_code: String::new(),
                        original_start_line: insert_line,
                        original_end_line: insert_line,
                        new_code,
                        start_line: new_start_line,
                        end_line: new_end_line,
                        context_before,
                        context_after,
                        element_type: None, // 将在 tool_service 中设置
                        element_identifier: None, // 将在 tool_service 中设置
                    });
                    
                    new_text_pos += new_range.len();
                }
                DiffTag::Replace => {
                    // 替换：从纯文本位置提取 original_code 和 new_code
                    let old_range = op.old_range();
                    let new_range = op.new_range();
                    
                    let old_text_start = old_text_pos;
                    let old_text_end = old_text_pos + old_range.len();
                    
                    // ⚠️ 直接从纯文本提取，已经是纯文本，不需要移除 HTML 标签
                    // 使用字符迭代器安全提取，避免多字节字符问题
                    let original_code = Self::extract_text_safe(&old_map.text_content, old_text_start, old_text_end);
                    
                    let new_text_start = new_text_pos;
                    let new_text_end = new_text_pos + new_range.len();
                    
                    // ⚠️ 直接从纯文本提取，已经是纯文本，不需要移除 HTML 标签
                    // 使用字符迭代器安全提取，避免多字节字符问题
                    let new_code = Self::extract_text_safe(&new_map.text_content, new_text_start, new_text_end);
                    
                    // 映射到 HTML 位置（用于行号计算）
                    // text_pos_to_html_pos 返回的是字节位置，需要转换为字符位置
                    let old_html_start_byte = Self::text_pos_to_html_pos(&old_map, old_text_start);
                    let old_html_end_byte = Self::text_pos_to_html_pos(&old_map, old_text_end);
                    
                    // 将字节位置转换为字符位置
                    let old_html_start_char = Self::byte_pos_to_char_pos(old_content, old_html_start_byte);
                    let old_html_end_char = Self::byte_pos_to_char_pos(old_content, old_html_end_byte);
                    
                    // 计算行号（基于 HTML 内容）
                    let start_line = Self::char_pos_to_line(old_content, old_html_start_char);
                    let end_line = Self::char_pos_to_line(old_content, old_html_end_char.saturating_sub(1));
                    
                    // 提取上下文（基于 HTML 内容，但会移除 HTML 标签）
                    let (context_before, context_after) = Self::extract_context(
                        old_content,
                        start_line,
                        end_line,
                        100, // 提取前后各100字符的上下文
                    );
                    
                    // 映射到新内容的 HTML 位置（用于行号计算）
                    let new_html_start_byte = Self::text_pos_to_html_pos(&new_map, new_text_start);
                    let new_html_end_byte = Self::text_pos_to_html_pos(&new_map, new_text_end);
                    
                    // 将字节位置转换为字符位置
                    let new_html_start_char = Self::byte_pos_to_char_pos(new_content, new_html_start_byte);
                    let new_html_end_char = Self::byte_pos_to_char_pos(new_content, new_html_end_byte);
                    
                    let new_start_line = Self::char_pos_to_line(new_content, new_html_start_char);
                    let new_end_line = Self::char_pos_to_line(new_content, new_html_end_char.saturating_sub(1));
                    
                    diffs.push(Diff {
                        diff_id: format!("diff_{}", Uuid::new_v4()),
                        diff_area_id: String::new(), // 稍后设置
                        diff_type: DiffType::Edit,
                        original_code,
                        original_start_line: start_line,
                        original_end_line: end_line,
                        new_code,
                        start_line: new_start_line,
                        end_line: new_end_line,
                        context_before,
                        context_after,
                        element_type: None, // 将在 tool_service 中设置
                        element_identifier: None, // 将在 tool_service 中设置
                    });
                    
                    old_text_pos += old_range.len();
                    new_text_pos += new_range.len();
                }
            }
        }
        
        // 处理替换操作（Delete + Insert 的组合）
        // 合并相邻的 Delete 和 Insert 为 Edit
        // ⚠️ 修复：对于字符级 diff，删除和插入可能在同一行，需要改进合并条件
        let mut merged_diffs = Vec::new();
        let mut i = 0;
        while i < diffs.len() {
            if i < diffs.len() - 1 {
                let current = &diffs[i];
                let next = &diffs[i + 1];
                
                // ⚠️ 改进合并条件：
                // 1. 如果当前是 Deletion，下一个是 Insertion
                // 2. 且它们在同一行或行号连续（字符级 diff 可能在同一行）
                // 3. 或者它们在新内容中的位置相同/连续
                if matches!(current.diff_type, DiffType::Deletion) 
                    && matches!(next.diff_type, DiffType::Insertion) {
                    // 检查是否在同一行或行号连续
                    let same_or_adjacent_line = 
                        current.original_start_line == next.original_start_line  // 同一行
                        || current.original_end_line + 1 == next.original_start_line  // 行号连续
                        || (current.original_end_line == next.original_start_line && current.original_end_line > 0);  // 同一行（end_line 可能等于 start_line）
                    
                    // 检查在新内容中的位置是否相同或连续
                    let same_or_adjacent_new_line = 
                        current.end_line == next.start_line  // 新内容中同一行
                        || current.end_line + 1 == next.start_line;  // 新内容中行号连续
                    
                    if same_or_adjacent_line && same_or_adjacent_new_line {
                        // 合并时使用第一个 diff 的上下文信息
                        merged_diffs.push(Diff {
                            diff_id: format!("diff_{}", Uuid::new_v4()),
                            diff_area_id: String::new(),
                            diff_type: DiffType::Edit,
                            original_code: current.original_code.clone(),
                            original_start_line: current.original_start_line,
                            original_end_line: current.original_end_line.max(next.original_end_line),
                            new_code: next.new_code.clone(),
                            start_line: next.start_line,
                            end_line: next.end_line,
                            context_before: current.context_before.clone(),
                            context_after: current.context_after.clone(),
                            element_type: current.element_type.clone(),
                            element_identifier: current.element_identifier.clone(),
                        });
                        i += 2;
                        continue;
                    }
                }
            }
            merged_diffs.push(diffs[i].clone());
            i += 1;
        }
        
        diffs = merged_diffs;
        
        // ⚠️ 第二次合并：合并同一行内的多个 Edit 操作
        // 这样可以进一步减少 diff 数量，特别是对于字符级 diff
        // ⚠️ 关键修复：使用更激进的合并策略，合并同一行内的所有 diff（不仅仅是相邻的）
        let mut final_diffs = Vec::new();
        let mut i = 0;
        while i < diffs.len() {
            // 查找同一行内的所有 diff，合并它们
            let current = &diffs[i];
            let mut merged_original = current.original_code.clone();
            let mut merged_new = current.new_code.clone();
            let mut merged_start_line = current.original_start_line;
            let mut merged_end_line = current.original_end_line;
            let mut merged_new_start_line = current.start_line;
            let mut merged_new_end_line = current.end_line;
            let mut merged_context_before = current.context_before.clone();
            let mut merged_context_after = current.context_after.clone();
            let mut j = i + 1;
            
            // 查找同一行内的后续 diff
            while j < diffs.len() {
                let next = &diffs[j];
                // 检查是否在同一行或行号连续（允许最多 3 行的差距，因为字符级 diff 可能跨行）
                let same_or_near_line = 
                    current.original_start_line == next.original_start_line  // 同一行
                    || current.original_end_line + 1 == next.original_start_line  // 行号连续
                    || (current.original_end_line < next.original_start_line && next.original_start_line <= current.original_end_line + 3);  // 行号接近（最多 3 行）
                
                if same_or_near_line {
                    // 合并这个 diff
                    merged_original.push_str(&next.original_code);
                    merged_new.push_str(&next.new_code);
                    merged_end_line = merged_end_line.max(next.original_end_line);
                    merged_new_end_line = merged_new_end_line.max(next.end_line);
                    // 使用第一个 diff 的上下文（更接近文档开头）
                    if merged_context_after.is_none() {
                        merged_context_after = next.context_after.clone();
                    }
                    j += 1;
                } else {
                    break;
                }
            }
            
            // 创建合并后的 diff
            if j > i + 1 {
                // 有多个 diff 被合并
                final_diffs.push(Diff {
                    diff_id: format!("diff_{}", Uuid::new_v4()),
                    diff_area_id: String::new(),
                    diff_type: if matches!(current.diff_type, DiffType::Deletion) && merged_new.is_empty() {
                        DiffType::Deletion
                    } else if matches!(current.diff_type, DiffType::Insertion) && merged_original.is_empty() {
                        DiffType::Insertion
                    } else {
                        DiffType::Edit
                    },
                    original_code: merged_original,
                    original_start_line: merged_start_line,
                    original_end_line: merged_end_line,
                    new_code: merged_new,
                    start_line: merged_new_start_line,
                    end_line: merged_new_end_line,
                    context_before: merged_context_before,
                    context_after: merged_context_after,
                    element_type: current.element_type.clone(),
                    element_identifier: current.element_identifier.clone(),
                });
                i = j;
            } else {
                // 没有合并，直接添加
                final_diffs.push(diffs[i].clone());
                i += 1;
            }
        }
        
        diffs = final_diffs;
        
        Ok(diffs)
    }
}

