// src-tauri/src/services/textbox_service.rs

use std::path::Path;
use serde::{Serialize, Deserialize};
use zip::ZipArchive;
use std::io::{BufReader, Read};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBoxInfo {
    pub id: String,                    // 文本框 ID
    pub left: f64,                     // 左边距（单位：EMU，转换为 px）
    pub top: f64,                      // 上边距（单位：EMU）
    pub width: f64,                    // 宽度（单位：EMU）
    pub height: f64,                   // 高度（单位：EMU）
    pub content: String,               // 文本框内容（HTML）
    pub z_index: i32,                  // 层级（用于处理重叠）
    pub border: Option<TextBoxBorder>,  // 边框样式
    pub fill: Option<TextBoxFill>,     // 填充样式
    pub rotation: Option<f64>,         // 旋转角度（度）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBoxBorder {
    pub width: f64,        // 边框宽度（pt）
    pub color: String,     // 边框颜色（#RRGGBB）
    pub style: String,     // 边框样式（solid, dashed, dotted）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBoxFill {
    pub color: String,     // 填充颜色（#RRGGBB）
    pub opacity: f64,      // 透明度（0.0-1.0）
}

pub struct TextBoxService;

impl TextBoxService {
    /// 从 DOCX 文件中提取所有文本框信息
    pub fn extract_textboxes(docx_path: &Path) -> Result<Vec<TextBoxInfo>, String> {
        let file = std::fs::File::open(docx_path)
            .map_err(|e| format!("无法打开文件: {}", e))?;
        
        let mut archive = ZipArchive::new(BufReader::new(file))
            .map_err(|e| format!("无法读取 ZIP 存档: {}", e))?;
        
        // 读取 document.xml
        let mut doc_xml = archive.by_name("word/document.xml")
            .map_err(|e| format!("无法读取 document.xml: {}", e))?;
        
        let mut content = String::new();
        doc_xml.read_to_string(&mut content)
            .map_err(|e| format!("读取 document.xml 失败: {}", e))?;
        
        let mut textboxes = Vec::new();
        
        // 解析 VML 格式文本框（旧版 Word）
        textboxes.extend(Self::extract_vml_textboxes(&content)?);
        
        // 解析 DrawingML 格式文本框（新版 Word）
        textboxes.extend(Self::extract_drawingml_textboxes(&content)?);
        
        Ok(textboxes)
    }
    
    /// 提取 VML 格式文本框
    fn extract_vml_textboxes(xml: &str) -> Result<Vec<TextBoxInfo>, String> {
        use regex::Regex;
        let mut textboxes = Vec::new();
        
        // 匹配 VML 文本框模式
        let vml_pattern = Regex::new(
            r#"<w:pict>[\s\S]*?<v:shape[^>]*>[\s\S]*?<v:textbox>[\s\S]*?<w:txbxContent>([\s\S]*?)</w:txbxContent>[\s\S]*?</v:textbox>[\s\S]*?</v:shape>[\s\S]*?</w:pict>"#
        ).map_err(|e| format!("正则表达式错误: {}", e))?;
        
        for (index, cap) in vml_pattern.captures_iter(xml).enumerate() {
            let content_xml = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            
            // 提取文本框内容（转换为 HTML）
            let content_html = Self::convert_textbox_content_to_html(content_xml)?;
            
            // 提取位置和大小（从 v:shape 属性）
            let shape_match = Regex::new(
                r#"<v:shape[^>]*style="([^"]*)""#
            ).ok();
            
            let (left, top, width, height) = if let Some(re) = shape_match {
                if let Some(cap) = re.captures(xml) {
                    let style = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    Self::parse_vml_style(style)
                } else {
                    (0.0, 0.0, 1000000.0, 500000.0) // 默认值
                }
            } else {
                (0.0, 0.0, 1000000.0, 500000.0)
            };
            
            textboxes.push(TextBoxInfo {
                id: format!("textbox-vml-{}", index),
                left,
                top,
                width,
                height,
                content: content_html,
                z_index: index as i32,
                border: None,
                fill: None,
                rotation: None,
            });
        }
        
        Ok(textboxes)
    }
    
    /// 提取 DrawingML 格式文本框
    fn extract_drawingml_textboxes(xml: &str) -> Result<Vec<TextBoxInfo>, String> {
        use regex::Regex;
        let mut textboxes = Vec::new();
        
        // 匹配 DrawingML 文本框模式
        let drawing_pattern = Regex::new(
            r#"<w:drawing>[\s\S]*?<wp:anchor[^>]*>([\s\S]*?)</wp:anchor>[\s\S]*?</w:drawing>"#
        ).map_err(|e| format!("正则表达式错误: {}", e))?;
        
        for (index, cap) in drawing_pattern.captures_iter(xml).enumerate() {
            let anchor_xml = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            
            // 提取位置信息
            let (left, top, width, height) = Self::parse_drawingml_position(&anchor_xml)?;
            
            // 提取文本框内容
            let content_xml = Self::extract_drawingml_content(&anchor_xml)?;
            let content_html = Self::convert_textbox_content_to_html(&content_xml)?;
            
            // 提取样式信息
            let (border, fill, rotation) = Self::parse_drawingml_style(&anchor_xml)?;
            
            textboxes.push(TextBoxInfo {
                id: format!("textbox-dml-{}", index),
                left,
                top,
                width,
                height,
                content: content_html,
                z_index: index as i32,
                border,
                fill,
                rotation,
            });
        }
        
        Ok(textboxes)
    }
    
    /// 解析 DrawingML 位置信息
    fn parse_drawingml_position(anchor_xml: &str) -> Result<(f64, f64, f64, f64), String> {
        use regex::Regex;
        
        // 提取位置（wp:positionH, wp:positionV）
        let pos_h_pattern = Regex::new(r#"<wp:positionH[^>]*posOffset="(\d+)""#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        let pos_v_pattern = Regex::new(r#"<wp:positionV[^>]*posOffset="(\d+)""#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        // 提取大小（wp:extent）
        let extent_pattern = Regex::new(r#"<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)""#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let left = pos_h_pattern.captures(anchor_xml)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<f64>().ok())
            .unwrap_or(0.0);
        
        let top = pos_v_pattern.captures(anchor_xml)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<f64>().ok())
            .unwrap_or(0.0);
        
        let (width, height) = if let Some(cap) = extent_pattern.captures(anchor_xml) {
            let w = cap.get(1).and_then(|m| m.as_str().parse::<f64>().ok()).unwrap_or(1000000.0);
            let h = cap.get(2).and_then(|m| m.as_str().parse::<f64>().ok()).unwrap_or(500000.0);
            (w, h)
        } else {
            (1000000.0, 500000.0) // 默认值
        };
        
        Ok((left, top, width, height))
    }
    
    /// 提取 DrawingML 文本框内容
    fn extract_drawingml_content(anchor_xml: &str) -> Result<String, String> {
        use regex::Regex;
        
        let content_pattern = Regex::new(
            r#"<wps:txbx>[\s\S]*?<w:txbxContent>([\s\S]*?)</w:txbxContent>[\s\S]*?</wps:txbx>"#
        ).map_err(|e| format!("正则表达式错误: {}", e))?;
        
        if let Some(cap) = content_pattern.captures(anchor_xml) {
            Ok(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default())
        } else {
            Ok(String::new())
        }
    }
    
    /// 解析 DrawingML 样式信息
    fn parse_drawingml_style(anchor_xml: &str) -> Result<(Option<TextBoxBorder>, Option<TextBoxFill>, Option<f64>), String> {
        use regex::Regex;
        
        // 提取边框信息
        let border = None; // 简化处理，可根据需要实现
        
        // 提取填充信息
        let fill = None; // 简化处理，可根据需要实现
        
        // 提取旋转角度
        let rotation_pattern = Regex::new(r#"rot="(\d+)""#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let rotation = rotation_pattern.captures(anchor_xml)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<f64>().ok())
            .map(|r| r / 60000.0); // 转换为度
        
        Ok((border, fill, rotation))
    }
    
    /// 解析 VML 样式字符串
    fn parse_vml_style(style: &str) -> (f64, f64, f64, f64) {
        // VML 样式格式：left:123pt;top:456pt;width:789pt;height:012pt
        use regex::Regex;
        
        let left_re = Regex::new(r#"left:(\d+(?:\.\d+)?)pt"#).ok();
        let top_re = Regex::new(r#"top:(\d+(?:\.\d+)?)pt"#).ok();
        let width_re = Regex::new(r#"width:(\d+(?:\.\d+)?)pt"#).ok();
        let height_re = Regex::new(r#"height:(\d+(?:\.\d+)?)pt"#).ok();
        
        // pt 转 EMU：1 pt = 12700 EMU
        let pt_to_emu = 12700.0;
        
        let left = left_re.and_then(|re| {
            re.captures(style)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<f64>().ok())
                .map(|v| v * pt_to_emu)
        }).unwrap_or(0.0);
        
        let top = top_re.and_then(|re| {
            re.captures(style)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<f64>().ok())
                .map(|v| v * pt_to_emu)
        }).unwrap_or(0.0);
        
        let width = width_re.and_then(|re| {
            re.captures(style)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<f64>().ok())
                .map(|v| v * pt_to_emu)
        }).unwrap_or(1000000.0);
        
        let height = height_re.and_then(|re| {
            re.captures(style)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<f64>().ok())
                .map(|v| v * pt_to_emu)
        }).unwrap_or(500000.0);
        
        (left, top, width, height)
    }
    
    /// 将文本框内容 XML 转换为 HTML
    fn convert_textbox_content_to_html(content_xml: &str) -> Result<String, String> {
        // 使用 Pandoc 将文本框内容转换为 HTML
        // 或者手动解析 XML 转换为 HTML
        
        // 简化实现：提取文本内容
        use regex::Regex;
        
        let text_pattern = Regex::new(r#"<w:t[^>]*>([^<]*)</w:t>"#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let mut html_content = String::new();
        for cap in text_pattern.captures_iter(content_xml) {
            if let Some(text) = cap.get(1) {
                let text_str = text.as_str();
                // HTML 转义
                let escaped = text_str
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;");
                html_content.push_str(&format!("<p>{}</p>", escaped));
            }
        }
        
        if html_content.is_empty() {
            html_content = "<p></p>".to_string();
        }
        
        Ok(html_content)
    }
    
    /// 将文本框信息转换为 HTML
    pub fn textbox_to_html(textbox: &TextBoxInfo) -> String {
        // EMU 转 px：1 inch = 914400 EMU = 96 px（96 DPI）
        let emu_to_px = |emu: f64| -> f64 {
            (emu / 914400.0) * 96.0
        };
        
        let left_px = emu_to_px(textbox.left);
        let top_px = emu_to_px(textbox.top);
        let width_px = emu_to_px(textbox.width);
        let height_px = emu_to_px(textbox.height);
        
        let mut style = format!(
            "position: absolute; left: {:.2}px; top: {:.2}px; width: {:.2}px; height: {:.2}px; z-index: {};",
            left_px, top_px, width_px, height_px, textbox.z_index
        );
        
        // 添加边框样式
        if let Some(ref border) = textbox.border {
            style.push_str(&format!(
                "border: {:.2}pt {} {};",
                border.width, border.style, border.color
            ));
        } else {
            style.push_str("border: none;");
        }
        
        // 添加填充样式
        if let Some(ref fill) = textbox.fill {
            let opacity = fill.opacity;
            style.push_str(&format!(
                "background-color: {}; opacity: {:.2};",
                fill.color, opacity
            ));
        } else {
            style.push_str("background-color: transparent;");
        }
        
        // 添加旋转
        if let Some(rotation) = textbox.rotation {
            style.push_str(&format!("transform: rotate({:.2}deg);", rotation));
        }
        
        // 添加文本框内容样式
        style.push_str("padding: 4px; box-sizing: border-box; overflow: hidden;");
        
        format!(
            r#"<div class="textbox" id="{}" style="{}">{}</div>"#,
            textbox.id, style, textbox.content
        )
    }
}

