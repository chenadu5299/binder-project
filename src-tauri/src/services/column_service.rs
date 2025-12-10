// src-tauri/src/services/column_service.rs

use serde::{Serialize, Deserialize};
use regex::Regex;

/// 分栏信息
/// 
/// 支持多节不同分栏：
/// - 每个节可以有不同的分栏设置
/// - 使用日常办公场景的复杂度（最多 10 个节，每节最多 13 列）
/// - 当前实现返回所有节的分栏信息，应用时使用第一个节作为文档级统一分栏
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub column_count: u32,      // 列数（1-13）
    pub column_width: Option<f64>,  // 列宽度（px），None 表示等宽
    pub column_gap: f64,        // 列间距（px）
    pub separator: bool,        // 是否有分隔线
    pub equal_width: bool,      // 是否等宽
}

pub struct ColumnService;

impl ColumnService {
    /// 从 DOCX XML 中提取分栏信息
    /// 
    /// 支持多节不同分栏：
    /// - 提取所有节的分栏设置
    /// - 限制最多 10 个节（日常办公场景）
    /// - 每节最多 13 列（Word 限制）
    pub fn extract_columns(xml: &str) -> Result<Vec<ColumnInfo>, String> {
        // 匹配 sectPr 中的 cols 元素
        // Word 文档可能包含多个节（section），每个节可以有不同的分栏设置
        let cols_pattern = Regex::new(
            r#"<w:sectPr>[\s\S]*?<w:cols[^>]*>([\s\S]*?)</w:cols>[\s\S]*?</w:sectPr>"#
        ).map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let mut columns = Vec::new();
        let mut section_count = 0;
        const MAX_SECTIONS: usize = 10; // 日常办公场景限制
        
        for cap in cols_pattern.captures_iter(xml) {
            // 限制节的数量（日常办公场景）
            if section_count >= MAX_SECTIONS {
                eprintln!("警告：文档包含超过 {} 个节，只处理前 {} 个节的分栏设置", MAX_SECTIONS, MAX_SECTIONS);
                break;
            }
            section_count += 1;
            
            let cols_content = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            
            // 提取列数（使用 \b 确保匹配完整单词，避免误匹配）
            let num_pattern = Regex::new(r#"\bw:num="(\d+)""#)
                .map_err(|e| format!("正则表达式错误: {}", e))?;
            let column_count = num_pattern.captures(cols_content)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .unwrap_or(1)
                .min(13); // Word 限制最多 13 列
            
            // 如果只有 1 列，跳过（不需要分栏）
            if column_count <= 1 {
                continue;
            }
            
            // 提取列间距（twips）
            let space_pattern = Regex::new(r#"w:space="(\d+)""#)
                .map_err(|e| format!("正则表达式错误: {}", e))?;
            let space_twips = space_pattern.captures(cols_content)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<f64>().ok())
                .unwrap_or(720.0); // 默认 0.5 英寸 = 720 twips
            
            // twips 转 px：1 inch = 1440 twips = 96 px
            let space_px = (space_twips / 1440.0) * 96.0;
            
            // 检查是否有分隔线（使用正则表达式，避免误匹配）
            let sep_pattern = Regex::new(r#"w:sep="(true|1)""#).ok();
            let separator = sep_pattern
                .and_then(|re| re.captures(cols_content))
                .is_some();
            
            // 检查是否等宽（默认等宽，除非明确指定不等宽）
            let equal_width = !cols_content.contains("w:equalWidth=\"0\"");
            
            // 提取列宽度（如果指定了）
            let mut column_width = None;
            let col_pattern = Regex::new(r#"<w:col[^>]*w:w="(\d+)""#)
                .ok();
            if let Some(re) = col_pattern {
                if let Some(cap) = re.captures(cols_content) {
                    if let Some(w) = cap.get(1)
                        .and_then(|m| m.as_str().parse::<f64>().ok()) {
                        // twips 转 px
                        column_width = Some((w / 1440.0) * 96.0);
                    }
                }
            }
            
            columns.push(ColumnInfo {
                column_count,
                column_width,
                column_gap: space_px,
                separator,
                equal_width,
            });
        }
        
        // 如果没有找到分栏信息，返回空向量（表示单栏）
        Ok(columns)
    }
}

