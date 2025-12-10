use std::path::{Path, PathBuf};
use std::process::Command;
use std::io::Read;
use std::collections::HashMap;
use which::which;

/// 运行格式信息（单个文本运行的格式）
#[derive(Debug, Clone)]
struct RunFormatting {
    text: String,
    color: Option<String>,
    font_family: Option<String>,
    font_size: Option<String>,
    bold: bool,
    italic: bool,
    underline: bool,
    position: usize, // 在段落中的位置索引
    background_color: Option<String>, // 运行级别背景色/高亮
}

/// 段落格式信息
#[derive(Debug, Clone)]
struct ParagraphFormatting {
    paragraph_id: Option<String>, // bookmark 名称或位置索引
    paragraph_align: Option<String>,
    paragraph_style_id: Option<String>,
    paragraph_level_color: Option<String>,
    line_height: Option<String>,           // 行距（如 "1.5", "240", "auto"）
    text_indent: Option<String>,           // 首行缩进（如 "2em", "720"）
    background_color: Option<String>,      // 背景色（如 "#FFFF00"）
    paragraph_font_family: Option<String>, // 段落级别字体（继承到所有运行）
    paragraph_font_size: Option<String>,   // 段落级别字号（继承到所有运行）
    runs: Vec<RunFormatting>,
}

impl RunFormatting {
    fn new() -> Self {
        Self {
            text: String::new(),
            color: None,
            font_family: None,
            font_size: None,
            bold: false,
            italic: false,
            underline: false,
            position: 0,
            background_color: None,
        }
    }
    
    /// 构建 CSS 样式字符串
    fn build_style_string(&self) -> String {
        let mut styles = Vec::new();
        
        if let Some(ref color) = self.color {
            styles.push(format!("color: {}", color));
        }
        if let Some(ref font) = self.font_family {
            styles.push(format!("font-family: {}", font));
        }
        if let Some(ref size) = self.font_size {
            styles.push(format!("font-size: {}", size));
        }
        if self.bold {
            styles.push("font-weight: bold".to_string());
        }
        if self.italic {
            styles.push("font-style: italic".to_string());
        }
        if self.underline {
            styles.push("text-decoration: underline".to_string());
        }
        if let Some(ref bg_color) = self.background_color {
            styles.push(format!("background-color: {}", bg_color));
        }
        
        styles.join("; ")
    }
    
    /// 检查是否有格式（除了文本内容）
    fn has_formatting(&self) -> bool {
        self.color.is_some() 
            || self.font_family.is_some() 
            || self.font_size.is_some() 
            || self.bold 
            || self.italic 
            || self.underline
            || self.background_color.is_some()
    }
}

impl ParagraphFormatting {
    fn new() -> Self {
        Self {
            paragraph_id: None,
            paragraph_align: None,
            paragraph_style_id: None,
            paragraph_level_color: None,
            line_height: None,
            text_indent: None,
            background_color: None,
            paragraph_font_family: None,
            paragraph_font_size: None,
            runs: Vec::new(),
        }
    }
    
    /// 获取段落的完整文本
    fn get_full_text(&self) -> String {
        self.runs.iter().map(|r| r.text.as_str()).collect()
    }
}

/// 样式定义信息（从 styles.xml 提取）
#[derive(Debug, Clone)]
struct StyleDefinition {
    style_id: String,
    font_family: Option<String>,
    font_size: Option<String>,
    color: Option<String>,
    line_height: Option<String>,
    text_indent: Option<String>,
    background_color: Option<String>,
    align: Option<String>,
}

pub struct PandocService {
    pandoc_path: Option<PathBuf>,
    is_bundled: bool, // 标记是否使用内置 Pandoc
}

impl PandocService {
    /// 创建 PandocService 实例
    /// 优先使用系统 Pandoc，如果没有则使用内置 Pandoc
    pub fn new() -> Self {
        // 1. 优先查找系统 Pandoc
        let system_pandoc = which("pandoc").ok();
        
        if let Some(path) = system_pandoc {
            eprintln!("✅ 使用系统 Pandoc: {:?}", path);
            return Self {
                pandoc_path: Some(path),
                is_bundled: false,
            };
        }
        
        // 2. 如果系统没有，尝试使用内置 Pandoc
        eprintln!("⚠️ 系统未安装 Pandoc，尝试使用内置 Pandoc...");
        let bundled_pandoc = Self::get_bundled_pandoc_path();
        
        if let Some(path) = bundled_pandoc {
            eprintln!("✅ 使用内置 Pandoc: {:?}", path);
            Self {
                pandoc_path: Some(path),
                is_bundled: true,
            }
        } else {
            eprintln!("❌ 未找到内置 Pandoc");
            Self {
                pandoc_path: None,
                is_bundled: false,
            }
        }
    }
    
    /// 获取内置 Pandoc 路径
    /// 在运行时从资源目录获取
    fn get_bundled_pandoc_path() -> Option<PathBuf> {
        // 方法1：尝试从环境变量获取资源路径（开发模式）
        if let Ok(resource_dir) = std::env::var("TAURI_RESOURCE_DIR") {
            let pandoc_path = PathBuf::from(resource_dir).join("bin").join(Self::get_pandoc_binary_name());
            if pandoc_path.exists() {
                return Some(pandoc_path);
            }
        }
        
        // 方法2：尝试从当前可执行文件目录获取（打包后）
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // macOS: Binder.app/Contents/MacOS/binder -> Binder.app/Contents/Resources/bin/pandoc
                // Windows: binder.exe -> bin/pandoc.exe
                // Linux: binder -> bin/pandoc
                
                #[cfg(target_os = "macos")]
                {
                    // macOS: 向上查找 .app 目录
                    let mut current = exe_dir;
                    while let Some(parent) = current.parent() {
                        if parent.ends_with("Contents") {
                            let resources_dir = parent.join("Resources");
                            let pandoc_path = resources_dir.join("bin").join(Self::get_pandoc_binary_name());
                            if pandoc_path.exists() {
                                return Some(pandoc_path);
                            }
                        }
                        current = parent;
                    }
                }
                
                #[cfg(any(target_os = "windows", target_os = "linux"))]
                {
                    let pandoc_path = exe_dir.join("bin").join(Self::get_pandoc_binary_name());
                    if pandoc_path.exists() {
                        return Some(pandoc_path);
                    }
                }
            }
        }
        
        // 方法3：尝试从工作目录获取（开发模式）
        // 获取当前工作目录
        if let Ok(current_dir) = std::env::current_dir() {
            // 尝试多个可能的路径
            let mut possible_paths = vec![
                current_dir.join("src-tauri/resources/bin").join(Self::get_pandoc_binary_name()),
                current_dir.join("resources/bin").join(Self::get_pandoc_binary_name()),
            ];
            
            // 如果从项目根目录运行，添加父目录路径
            if let Some(parent) = current_dir.parent() {
                possible_paths.push(parent.join("src-tauri/resources/bin").join(Self::get_pandoc_binary_name()));
            }
            
            for path in possible_paths {
                if path.exists() {
                    eprintln!("✅ 找到开发模式 Pandoc: {:?}", path);
                    return Some(path);
                }
            }
        }
        
        None
    }
    
    /// 获取平台特定的 Pandoc 二进制文件名
    fn get_pandoc_binary_name() -> &'static str {
        #[cfg(target_os = "windows")]
        {
            "pandoc.exe"
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            "pandoc"
        }
    }
    
    /// 获取参考 DOCX 模板路径
    /// 用于 HTML → DOCX 转换时的格式保留
    fn get_reference_docx_path() -> Option<PathBuf> {
        // 方法1：尝试从环境变量获取资源路径（开发模式）
        if let Ok(resource_dir) = std::env::var("TAURI_RESOURCE_DIR") {
            let ref_path = PathBuf::from(resource_dir).join("reference.docx");
            if ref_path.exists() {
                return Some(ref_path);
            }
        }
        
        // 方法2：尝试从当前可执行文件目录获取（打包后）
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                #[cfg(target_os = "macos")]
                {
                    // macOS: 向上查找 .app 目录
                    let mut current = exe_dir;
                    while let Some(parent) = current.parent() {
                        if parent.ends_with("Contents") {
                            let resources_dir = parent.join("Resources");
                            let ref_path = resources_dir.join("reference.docx");
                            if ref_path.exists() {
                                return Some(ref_path);
                            }
                        }
                        current = parent;
                    }
                }
                
                #[cfg(any(target_os = "windows", target_os = "linux"))]
                {
                    let ref_path = exe_dir.join("reference.docx");
                    if ref_path.exists() {
                        return Some(ref_path);
                    }
                }
            }
        }
        
        // 方法3：尝试从工作目录获取（开发模式）
        if let Ok(current_dir) = std::env::current_dir() {
            let mut possible_paths = vec![
                current_dir.join("src-tauri/resources/reference.docx"),
                current_dir.join("resources/reference.docx"),
            ];
            
            if let Some(parent) = current_dir.parent() {
                possible_paths.push(parent.join("src-tauri/resources/reference.docx"));
            }
            
            for path in possible_paths {
                if path.exists() {
                    eprintln!("✅ 找到参考文档: {:?}", path);
                    return Some(path);
                }
            }
        }
        
        eprintln!("⚠️ 未找到参考文档模板，将使用默认转换");
        None
    }
    
    /// 获取 Lua 过滤器路径
    /// 用于 DOCX → HTML 转换时保留格式信息
    fn get_lua_filter_path() -> Option<PathBuf> {
        // 方法1：尝试从环境变量获取资源路径（开发模式）
        if let Ok(resource_dir) = std::env::var("TAURI_RESOURCE_DIR") {
            let filter_path = PathBuf::from(resource_dir).join("preserve-styles.lua");
            if filter_path.exists() {
                return Some(filter_path);
            }
        }
        
        // 方法2：尝试从当前可执行文件目录获取（打包后）
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                #[cfg(target_os = "macos")]
                {
                    let mut current = exe_dir;
                    while let Some(parent) = current.parent() {
                        if parent.ends_with("Contents") {
                            let resources_dir = parent.join("Resources");
                            let filter_path = resources_dir.join("preserve-styles.lua");
                            if filter_path.exists() {
                                return Some(filter_path);
                            }
                        }
                        current = parent;
                    }
                }
                
                #[cfg(any(target_os = "windows", target_os = "linux"))]
                {
                    let filter_path = exe_dir.join("preserve-styles.lua");
                    if filter_path.exists() {
                        return Some(filter_path);
                    }
                }
            }
        }
        
        // 方法3：尝试从工作目录获取（开发模式）
        if let Ok(current_dir) = std::env::current_dir() {
            let mut possible_paths = vec![
                current_dir.join("src-tauri/resources/preserve-styles.lua"),
                current_dir.join("resources/preserve-styles.lua"),
            ];
            
            if let Some(parent) = current_dir.parent() {
                possible_paths.push(parent.join("src-tauri/resources/preserve-styles.lua"));
            }
            
            for path in possible_paths {
                if path.exists() {
                    eprintln!("✅ 找到 Lua 过滤器: {:?}", path);
                    return Some(path);
                }
            }
        }
        
        eprintln!("⚠️ 未找到 Lua 过滤器，将使用默认转换");
        None
    }
    
    pub fn is_available(&self) -> bool {
        self.pandoc_path.is_some()
    }
    
    pub fn get_path(&self) -> Option<&PathBuf> {
        self.pandoc_path.as_ref()
    }
    
    /// 检查是否使用内置 Pandoc
    pub fn is_bundled(&self) -> bool {
        self.is_bundled
    }
    
    /// 将文档文件转换为 HTML（用于预览）
    /// 支持格式：.docx, .doc, .odt, .rtf
    pub fn convert_document_to_html(&self, doc_path: &Path) -> Result<String, String> {
        if !self.is_available() {
            return Err("Pandoc 不可用，请安装 Pandoc 或确保内置 Pandoc 可用。\n访问 https://pandoc.org/installing.html 获取安装指南。".to_string());
        }
        
        let pandoc_path = self.pandoc_path.as_ref().unwrap();
        
        // 检查文件是否存在
        if !doc_path.exists() {
            return Err(format!("文件不存在: {}", doc_path.display()));
        }
        
        // 检查文件大小（空文件或损坏的文件可能很小）
        if let Ok(metadata) = std::fs::metadata(doc_path) {
            let file_size = metadata.len();
            if file_size < 100 {
                return Err(format!(
                    "文件太小（{} 字节），可能不是有效的文档文件。",
                    file_size
                ));
            }
            eprintln!("📄 文件大小: {} 字节", file_size);
        }
        
        // 获取文件扩展名，确定输入格式
        let ext = doc_path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("docx")
            .to_lowercase();
        
        eprintln!("🔄 开始转换文档到 HTML: {:?} (格式: {})", doc_path, ext);
        eprintln!("📝 使用 Pandoc: {:?}", pandoc_path);
        
        // 构建 Pandoc 命令，优化格式保留
        // 注意：扩展参数必须作为格式字符串的一部分，不能作为独立参数
        let mut cmd = Command::new(pandoc_path);
        cmd.arg(doc_path.as_os_str())
            .arg("--from")
            .arg("docx+styles")               // 关键：启用 styles 扩展以保留 DOCX 样式信息
            .arg("--to")
            .arg("html+raw_html+native_divs+native_spans")  // 扩展作为格式字符串的一部分
            .arg("--standalone")              // 生成完整 HTML（包含样式）
            .arg("--wrap=none")               // 不换行
            .arg("--extract-media=.")         // 提取媒体文件
            .arg("--preserve-tabs");           // 保留制表符
            // 注意：不再使用 --variable 强制设置字体和字号，避免与文档原有样式冲突
        
        // 尝试使用 Lua 过滤器来保留格式（如果存在）
        if let Some(lua_filter) = Self::get_lua_filter_path() {
            eprintln!("📝 使用 Lua 过滤器: {:?}", lua_filter);
            cmd.arg("--lua-filter").arg(lua_filter);
        } else {
            eprintln!("⚠️ 未找到 Lua 过滤器，格式保留可能不完整");
        }
        
        let output = cmd.output()
            .map_err(|e| {
                let error_msg = format!("执行 Pandoc 失败: {}\nPandoc 路径: {:?}", e, pandoc_path);
                eprintln!("❌ {}", error_msg);
                error_msg
            })?;
        
        if !output.status.success() {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            let stdout_msg = String::from_utf8_lossy(&output.stdout);
            let full_error = format!("Pandoc 转换失败:\nSTDERR: {}\nSTDOUT: {}", error_msg, stdout_msg);
            eprintln!("❌ {}", full_error);
            return Err(full_error);
        }
        
        let html = String::from_utf8(output.stdout)
            .map_err(|e| {
                let error_msg = format!("解析 Pandoc 输出失败: {}", e);
                eprintln!("❌ {}", error_msg);
                error_msg
            })?;
        
        // 诊断：检查 Pandoc 输出的 HTML 是否包含样式信息
        let has_inline_styles = html.matches("style=\"").count();
        let has_data_custom_style = html.matches("data-custom-style=").count();
        let has_color = html.matches("color:").count();
        let has_font_size = html.matches("font-size:").count();
        
        eprintln!("🔍 Pandoc 输出诊断:");
        eprintln!("   - 内联样式数: {}", has_inline_styles);
        eprintln!("   - data-custom-style 属性数: {}", has_data_custom_style);
        eprintln!("   - 颜色样式数: {}", has_color);
        eprintln!("   - 字号样式数: {}", has_font_size);
        
        // 2. CSS 类转换为内联样式（段落对齐）
        // 只做必要的 CSS 类转换，满足 AI 样式子集要求
        // Pandoc 可能以 CSS 类形式输出段落对齐，TipTap 编辑器需要内联样式才能正确解析
        let html = Self::convert_css_classes_to_inline_styles(&html);
        
        // 诊断：检查转换后的 HTML
        let after_inline_styles = html.matches("style=\"").count();
        eprintln!("🔍 转换后诊断:");
        eprintln!("   - 内联样式数: {} (增加: {})", after_inline_styles, after_inline_styles as i32 - has_inline_styles as i32);
        
        // 3. 不再应用预设样式表
        // 编辑模式策略：只保留换行和结构，不强制应用字体和字号
        // 保留 Pandoc 输出的原始内联样式，让用户通过工具栏自行设置样式
        
        eprintln!("✅ DOCX 转换成功，HTML 长度: {} 字符", html.len());
        Ok(html)
    }
    
    /// 添加预设样式表到 HTML（不修改 HTML 结构）
    /// 
    /// ⚠️ 注意：此函数已不再使用
    /// 编辑模式策略已改为：只保留换行和结构，不强制应用字体和字号
    /// 保留此函数以备将来需要
    #[allow(dead_code)]
    fn apply_preset_styles(html: &str) -> String {
        /// 默认预设样式 CSS（现代简洁）
        /// 
        /// 单一预设样式，使用 3 级字号体系（24px/18px/14px）和 Arial 字体
        const DEFAULT_PRESET_CSS: &str = r#"
    <style>
        /* 标题层级 - 3 级字号体系 */
        h1, h2 { 
            font-family: "Arial", sans-serif; 
            font-size: 24px; 
            font-weight: bold; 
        }
        
        h3, h4 { 
            font-family: "Arial", sans-serif; 
            font-size: 18px; 
            font-weight: bold; 
        }
        
        h5, h6 { 
            font-family: "Arial", sans-serif; 
            font-size: 14px; 
            font-weight: bold; 
        }
        
        /* 正文 - 统一字体和字号 */
        p, li, td { 
            font-family: "Arial", sans-serif; 
            font-size: 14px; 
        }
        
        /* 注意：如果元素已有内联样式（如 style="font-size: 20px"），
           内联样式优先级更高，不会被此 CSS 覆盖 */
    </style>
"#;
        // 在 </head> 标签前插入样式表
        if html.contains("</head>") {
            html.replace("</head>", &format!("{}</head>", DEFAULT_PRESET_CSS))
        } else if html.contains("<body>") {
            // 如果没有 <head>，在 <body> 前添加 <head> 和样式表
            html.replace("<body>", &format!("<head>{}</head><body>", DEFAULT_PRESET_CSS))
        } else {
            // 如果都没有，在开头添加完整的 HTML 结构
            format!("<!DOCTYPE html><html><head>{}</head><body>{}</body></html>", 
                    DEFAULT_PRESET_CSS, html)
        }
    }
    
    /// 将 HTML 转换为 DOCX 文件
    pub fn convert_html_to_docx(&self, html_content: &str, docx_path: &Path) -> Result<(), String> {
        if !self.is_available() {
            return Err("Pandoc 不可用，请安装 Pandoc 或确保内置 Pandoc 可用。\n访问 https://pandoc.org/installing.html 获取安装指南。".to_string());
        }
        
        let pandoc_path = self.pandoc_path.as_ref().unwrap();
        
        // 创建临时 HTML 文件
        let temp_html = std::env::temp_dir().join(format!("pandoc_temp_{}.html", uuid::Uuid::new_v4()));
        std::fs::write(&temp_html, html_content)
            .map_err(|e| {
                let error_msg = format!("创建临时文件失败: {}", e);
                eprintln!("❌ {}", error_msg);
                error_msg
            })?;
        
        eprintln!("🔄 开始转换 HTML 到 DOCX");
        eprintln!("📝 使用 Pandoc: {:?}", pandoc_path);
        eprintln!("📄 输出路径: {:?}", docx_path);
        
        // 确保输出目录存在
        if let Some(parent) = docx_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                let _ = std::fs::remove_file(&temp_html);
                return Err(format!("创建输出目录失败: {}", e));
            }
        }
        
        // 执行转换（保留格式）
        // 注意：扩展参数必须作为格式字符串的一部分
        let mut cmd = Command::new(pandoc_path);
        cmd.arg(&temp_html)
            .arg("--from")
            .arg("html+raw_html+native_divs+native_spans")  // 扩展作为格式字符串的一部分
            .arg("--to")
            .arg("docx")
            .arg("--output")
            .arg(docx_path.as_os_str())
            .arg("--wrap=none")
            .arg("--preserve-tabs");           // 保留制表符
        
        // 如果找到参考文档，使用它来保留格式
        if let Some(ref_doc) = Self::get_reference_docx_path() {
            eprintln!("📄 使用参考文档: {:?}", ref_doc);
            cmd.arg("--reference-doc").arg(ref_doc);
        } else {
            eprintln!("⚠️ 未使用参考文档，格式保留可能不完整");
        }
        
        let output = cmd.output()
            .map_err(|e| {
                let _ = std::fs::remove_file(&temp_html);
                let error_msg = format!("执行 Pandoc 失败: {}\nPandoc 路径: {:?}", e, pandoc_path);
                eprintln!("❌ {}", error_msg);
                error_msg
            })?;
        
        // 清理临时文件
        let _ = std::fs::remove_file(&temp_html);
        
        if !output.status.success() {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            let stdout_msg = String::from_utf8_lossy(&output.stdout);
            let full_error = format!("Pandoc 转换失败:\nSTDERR: {}\nSTDOUT: {}", error_msg, stdout_msg);
            eprintln!("❌ {}", full_error);
            return Err(full_error);
        }
        
        eprintln!("✅ HTML 转换 DOCX 成功: {:?}", docx_path);
        Ok(())
    }
    
    /// 将 CSS 类转换为内联样式
    /// 处理 Pandoc 生成的 HTML 中的 CSS 类，转换为内联样式以便 TipTap 正确解析
    fn convert_css_classes_to_inline_styles(html: &str) -> String {
        use regex::Regex;
        let mut result = html.to_string();
        
        // 1. 提取 <style> 标签中的所有 CSS 规则
        let style_regex = Regex::new(r#"<style[^>]*>([\s\S]*?)</style>"#).unwrap();
        let mut style_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut tag_style_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        
        for cap in style_regex.captures_iter(&result) {
            let style_content = &cap[1];
            
            // 解析 CSS 类规则：.class-name { property: value; }
            let rule_regex = Regex::new(r#"\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}"#).unwrap();
            for rule_cap in rule_regex.captures_iter(style_content) {
                let class_name = rule_cap[1].to_string();
                let styles = rule_cap[2].trim().to_string();
                // 合并相同类名的样式（如果存在）
                style_map.entry(class_name)
                    .and_modify(|e| {
                        *e = format!("{}; {}", e, styles);
                    })
                    .or_insert(styles);
            }
            
            // 解析标签选择器规则：p { ... }, h1 { ... }, div { ... } 等
            // 支持单个标签和组合标签（如 h1, h2, h3 { ... }）
            let tag_rule_regex = Regex::new(r#"((?:p|h[1-6]|div|span|td|th|body|html)(?:\s*,\s*(?:p|h[1-6]|div|span|td|th|body|html))*)\s*\{([^}]+)\}"#).unwrap();
            for tag_cap in tag_rule_regex.captures_iter(style_content) {
                let tag_selector = tag_cap[1].to_string();
                let styles = tag_cap[2].trim().to_string();
                // 解析组合选择器中的每个标签
                let tags: Vec<&str> = tag_selector.split(',').map(|s| s.trim()).collect();
                for tag_name in tags {
                    // 合并相同标签的样式（追加，而不是覆盖）
                    tag_style_map.entry(tag_name.to_string())
                        .and_modify(|e| {
                            // 先收集现有属性
                            let existing_props: Vec<&str> = e.split(';').map(|s| s.split(':').next().unwrap_or("").trim()).collect();
                            
                            // 收集需要添加的新样式
                            let mut new_styles = Vec::new();
                            for style_part in styles.split(';') {
                                let style_part = style_part.trim();
                                if !style_part.is_empty() {
                                    let prop = style_part.split(':').next().unwrap_or("").trim();
                                    // 如果属性不存在，则添加到列表
                                    if !existing_props.contains(&prop) {
                                        new_styles.push(style_part);
                                    }
                                }
                            }
                            
                            // 一次性添加所有新样式
                            if !new_styles.is_empty() {
                                let new_styles_str = new_styles.join("; ");
                                *e = format!("{}; {}", e, new_styles_str);
                            }
                        })
                        .or_insert(styles.clone());
                }
                
                // 诊断：如果包含 text-align，输出日志
                if styles.contains("text-align") {
                    eprintln!("📝 提取到包含 text-align 的规则: {} {{ {} }}", tag_selector, styles);
                }
            }
            
            // 对齐信息通过 CSS 类转换保留（convert_css_classes_to_inline_styles）
            
            // 解析 ID 选择器规则：#id { ... }（用于特定元素）
            let id_rule_regex = Regex::new(r#"#([a-zA-Z0-9_-]+)\s*\{([^}]+)\}"#).unwrap();
            for id_cap in id_rule_regex.captures_iter(style_content) {
                let id_name = id_cap[1].to_string();
                let styles = id_cap[2].trim().to_string();
                // 将 ID 样式也存储到 style_map 中，使用特殊前缀
                style_map.entry(format!("#{}", id_name))
                    .and_modify(|e| {
                        *e = format!("{}; {}", e, styles);
                    })
                    .or_insert(styles);
            }
        }
        
        // 统计 ID 选择器数量
        let id_selector_count = style_map.keys().filter(|k| k.starts_with('#')).count();
        let class_selector_count = style_map.len() - id_selector_count;
        
        eprintln!("📝 提取到 {} 个 CSS 类规则", class_selector_count);
        eprintln!("📝 提取到 {} 个 ID 选择器规则", id_selector_count);
        eprintln!("📝 提取到 {} 个标签样式规则", tag_style_map.len());
        
        // 2. 将标签样式应用到所有对应标签的元素
        for (tag_name, styles) in tag_style_map.iter() {
            // 查找所有该标签的元素（不区分大小写）
            let tag_pattern = format!(r#"<{}[^>]*>"#, regex::escape(tag_name));
            let tag_re = Regex::new(&tag_pattern).unwrap();
            let mut replacements: Vec<(usize, usize, String)> = Vec::new();
            
            // 诊断：检查样式内容
            if styles.contains("text-align") {
                eprintln!("🔍 为 <{}> 应用样式，包含 text-align: {}", tag_name, styles);
            }
            
            for cap in tag_re.captures_iter(&result) {
                let full_match = cap.get(0).unwrap();
                let match_start = full_match.start();
                let match_end = full_match.end();
                let element = &result[match_start..match_end];
                
                // 检查是否已有 style 属性
                let new_element = if element.contains("style=") {
                    let style_re = Regex::new(r#"style="([^"]*)""#).unwrap();
                    style_re.replace(element, |caps: &regex::Captures| {
                        let existing_style = &caps[1];
                        let mut new_styles = existing_style.to_string();
                        for style_part in styles.split(';') {
                            let style_part = style_part.trim();
                            if !style_part.is_empty() {
                                let prop = style_part.split(':').next().unwrap_or("").trim();
                                // 对于 text-align，需要检查是否已存在（可能以不同形式存在）
                                let prop_lower = prop.to_lowercase();
                                if prop_lower == "text-align" {
                                    // 检查是否已有 text-align 或 textAlign
                                    if !existing_style.to_lowercase().contains("text-align") {
                                        new_styles.push_str(&format!("; {}", style_part));
                                    }
                                } else if !existing_style.to_lowercase().contains(&prop_lower) {
                                    new_styles.push_str(&format!("; {}", style_part));
                                }
                            }
                        }
                        format!(r#"style="{}""#, new_styles)
                    }).to_string()
                } else {
                    element.replace('>', &format!(r#" style="{}">"#, styles))
                };
                
                replacements.push((match_start, match_end, new_element));
            }
            
            // 从后往前替换，避免索引偏移
            for (start, end, new_elem) in replacements.iter().rev() {
                result.replace_range(*start..*end, new_elem);
            }
            
            if !replacements.is_empty() {
                eprintln!("✅ 为 {} 个 <{}> 元素应用样式: {}", replacements.len(), tag_name, styles);
            }
        }
        
        // 3. 将 CSS 类转换为内联样式
        for (class_name, styles) in style_map.iter() {
            let pattern = format!(r#"class="([^"]*\b{}\b[^"]*)""#, regex::escape(class_name));
            let re = Regex::new(&pattern).unwrap();
            
            // 收集所有需要替换的位置（从后往前，避免索引偏移）
            let mut replacements: Vec<(usize, usize, String)> = Vec::new();
            
            for cap in re.captures_iter(&result) {
                let full_match = cap.get(0).unwrap();
                let match_start = full_match.start();
                let _match_end = full_match.end();
                
                // 找到对应的元素开始标签
                if let Some(elem_start) = result[..match_start].rfind('<') {
                    if let Some(elem_end) = result[match_start..].find('>') {
                        let elem_end = match_start + elem_end;
                        let element = &result[elem_start..elem_end + 1];
                        
                        // 检查是否已有 style 属性
                        let new_element = if element.contains("style=") {
                            // 追加样式（合并，避免重复）
                            let style_re = Regex::new(r#"style="([^"]*)""#).unwrap();
                            style_re.replace(element, |caps: &regex::Captures| {
                                let existing_style = &caps[1];
                                // 检查样式是否已存在，避免重复
                                let mut new_styles = existing_style.to_string();
                                for style_part in styles.split(';') {
                                    let style_part = style_part.trim();
                                    if !style_part.is_empty() {
                                        let prop = style_part.split(':').next().unwrap_or("").trim();
                                        if !existing_style.contains(prop) {
                                            new_styles.push_str(&format!("; {}", style_part));
                                        }
                                    }
                                }
                                format!(r#"style="{}""#, new_styles)
                            }).to_string()
                        } else {
                            // 添加 style 属性
                            element.replace('>', &format!(r#" style="{}">"#, styles))
                        };
                        
                        replacements.push((elem_start, elem_end + 1, new_element));
                    }
                }
            }
            
            // 从后往前替换，避免索引偏移
            for (start, end, new_elem) in replacements.iter().rev() {
                result.replace_range(*start..*end, new_elem);
            }
        }
        
        // 3. 处理特定的常见格式类（即使不在 style 标签中）
        // 处理居中对齐
        for class_name in &["center", "text-center"] {
            let pattern = format!(r#"class="([^"]*\b{}\b[^"]*)""#, regex::escape(class_name));
            let re = Regex::new(&pattern).unwrap();
            let mut replacements: Vec<(usize, usize, String)> = Vec::new();
            
            for cap in re.captures_iter(&result) {
                let full_match = cap.get(0).unwrap();
                let match_start = full_match.start();
                let _match_end = full_match.end();
                
                if let Some(elem_start) = result[..match_start].rfind('<') {
                    if let Some(elem_end) = result[match_start..].find('>') {
                        let elem_end = match_start + elem_end;
                        let element = &result[elem_start..elem_end + 1];
                        
                        let new_element = if element.contains("style=") {
                            if !element.contains("text-align") {
                                let style_re = Regex::new(r#"style="([^"]*)""#).unwrap();
                                style_re.replace(element, |caps: &regex::Captures| {
                                    format!(r#"style="{}; text-align: center""#, &caps[1])
                                }).to_string()
                            } else {
                                element.to_string()
                            }
                        } else {
                            element.replace('>', r#" style="text-align: center">"#)
                        };
                        
                        replacements.push((elem_start, elem_end + 1, new_element));
                    }
                }
            }
            
            for (start, end, new_elem) in replacements.iter().rev() {
                result.replace_range(*start..*end, new_elem);
            }
        }
        
        // 4. 处理 data-custom-style 属性（Pandoc 可能使用此属性保留样式信息）
        // 将 data-custom-style 转换为内联样式
        let data_style_regex = Regex::new(r#"data-custom-style="([^"]+)""#).unwrap();
        let mut replacements: Vec<(usize, usize, String)> = Vec::new();
        
        for cap in data_style_regex.captures_iter(&result) {
            let full_match = cap.get(0).unwrap();
            let match_start = full_match.start();
            let match_end = full_match.end();
            let style_name = &cap[1];
            
            // 查找对应的元素开始标签
            if let Some(elem_start) = result[..match_start].rfind('<') {
                if let Some(elem_end) = result[match_start..].find('>') {
                    let elem_end = match_start + elem_end;
                    let element = &result[elem_start..elem_end + 1];
                    
                    // 检查 style_map 中是否有对应的样式
                    if let Some(styles) = style_map.get(style_name) {
                        let new_element = if element.contains("style=") {
                            // 合并样式
                            let style_re = Regex::new(r#"style="([^"]*)""#).unwrap();
                            style_re.replace(element, |caps: &regex::Captures| {
                                let existing_style = &caps[1];
                                let mut new_styles = existing_style.to_string();
                                for style_part in styles.split(';') {
                                    let style_part = style_part.trim();
                                    if !style_part.is_empty() {
                                        let prop = style_part.split(':').next().unwrap_or("").trim();
                                        if !existing_style.contains(prop) {
                                            new_styles.push_str(&format!("; {}", style_part));
                                        }
                                    }
                                }
                                format!(r#"style="{}""#, new_styles)
                            }).to_string()
                        } else {
                            // 添加 style 属性
                            element.replace('>', &format!(r#" style="{}">"#, styles))
                        };
                        
                        // 移除 data-custom-style 属性
                        let final_element = new_element.replace(&format!(r#" data-custom-style="{}""#, style_name), "");
                        replacements.push((elem_start, elem_end + 1, final_element));
                    }
                }
            }
        }
        
        // 从后往前替换
        for (start, end, new_elem) in replacements.iter().rev() {
            result.replace_range(*start..*end, new_elem);
        }
        
        eprintln!("✅ CSS 类转内联样式处理完成");
        result
    }
    
    /// 从 DOCX 文件中提取格式信息（段落级别和运行级别）
    /// 从 XML 片段中提取属性值
    fn extract_attribute_value(xml_fragment: &str, attr_name: &str) -> Option<String> {
        use regex::Regex;
        let pattern = format!(r#"{}=\"([^\"]+)\""#, attr_name);
        let re = match Regex::new(&pattern) {
            Ok(r) => r,
            Err(_) => return None,
        };
        re.captures(xml_fragment)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
    }
    
    /// 从 styles.xml 提取样式定义
    fn extract_style_definitions(styles_content: &str) -> HashMap<String, StyleDefinition> {
        let mut styles = HashMap::new();
        
        if styles_content.is_empty() {
            return styles;
        }
        
        // 解析每个样式定义（简化版，使用字符串匹配）
        let style_sections: Vec<&str> = styles_content.split("<w:style").collect();
        
        for style_section in style_sections.iter().skip(1) {
            // 提取样式 ID
            let style_id = if let Some(id_start) = style_section.find("w:styleId=\"") {
                let id_start = id_start + 11;
                if let Some(id_end) = style_section[id_start..].find('"') {
                    style_section[id_start..id_start + id_end].to_string()
                } else {
                    continue;
                }
            } else {
                continue;
            };
            
            let mut style_def = StyleDefinition {
                style_id: style_id.clone(),
                font_family: None,
                font_size: None,
                color: None,
                line_height: None,
                text_indent: None,
                background_color: None,
                align: None,
            };
            
            // 提取段落属性中的格式
            if let Some(p_pr_start) = style_section.find("<w:pPr>") {
                if let Some(p_pr_end) = style_section[p_pr_start..].find("</w:pPr>") {
                    let p_pr = &style_section[p_pr_start..p_pr_start + p_pr_end];
                    
                    // 提取行距
                    if let Some(spacing_start) = p_pr.find("<w:spacing") {
                        if let Some(line) = Self::extract_attribute_value(&p_pr[spacing_start..], "w:line") {
                            if let Ok(line_int) = line.parse::<u32>() {
                                let line_rule = Self::extract_attribute_value(&p_pr[spacing_start..], "w:lineRule");
                                if line_rule.as_deref() == Some("auto") {
                                    // 自动行距：line/240 = 倍数
                                    let multiple = line_int as f32 / 240.0;
                                    style_def.line_height = Some(format!("{:.1}", multiple));
                                } else {
                                    // 固定行距：line/20 = pt
                                    let pt = line_int as f32 / 20.0;
                                    style_def.line_height = Some(format!("{}pt", pt));
                                }
                            }
                        }
                    }
                    
                    // 提取首行缩进
                    if let Some(ind_start) = p_pr.find("<w:ind") {
                        if let Some(first_line) = Self::extract_attribute_value(&p_pr[ind_start..], "w:firstLine") {
                            if let Ok(first_line_int) = first_line.parse::<u32>() {
                                // firstLine/20 = pt，转换为 em
                                let pt = first_line_int as f32 / 20.0;
                                let em = pt / 12.0; // 假设基础字号 12pt
                                style_def.text_indent = Some(format!("{:.2}em", em));
                            }
                        }
                    }
                    
                    // 提取背景色
                    if let Some(shd_start) = p_pr.find("<w:shd") {
                        if let Some(fill) = Self::extract_attribute_value(&p_pr[shd_start..], "w:fill") {
                            if let Some(val) = Self::extract_attribute_value(&p_pr[shd_start..], "w:val") {
                                if val != "clear" {
                                    // 转换颜色格式：FFFF00 -> #FFFF00
                                    let color = if fill.len() == 6 && fill.chars().all(|c| c.is_ascii_hexdigit()) {
                                        format!("#{}", fill)
                                    } else {
                                        fill
                                    };
                                    style_def.background_color = Some(color);
                                }
                            }
                        }
                    }
                    
                    // 提取段落级别的运行属性
                    if let Some(r_pr_start) = p_pr.find("<w:rPr>") {
                        if let Some(r_pr_end) = p_pr[r_pr_start..].find("</w:rPr>") {
                            let r_pr = &p_pr[r_pr_start..r_pr_start + r_pr_end];
                            
                            // 提取字体
                            if let Some(fonts_start) = r_pr.find("<w:rFonts") {
                                if let Some(ascii) = Self::extract_attribute_value(&r_pr[fonts_start..], "w:ascii") {
                                    style_def.font_family = Some(ascii);
                                }
                            }
                            
                            // 提取字号
                            if let Some(sz_start) = r_pr.find("<w:sz") {
                                if let Some(sz_val) = Self::extract_attribute_value(&r_pr[sz_start..], "w:val") {
                                    if let Ok(sz_int) = sz_val.parse::<u32>() {
                                        let pt = sz_int as f32 / 2.0;
                                        style_def.font_size = Some(format!("{}pt", pt));
                                    }
                                }
                            }
                            
                            // 提取颜色
                            if let Some(color_start) = r_pr.find("<w:color") {
                                if let Some(color_val) = Self::extract_attribute_value(&r_pr[color_start..], "w:val") {
                                    let color = if color_val.len() == 6 && color_val.chars().all(|c| c.is_ascii_hexdigit()) {
                                        format!("#{}", color_val)
                                    } else {
                                        color_val
                                    };
                                    style_def.color = Some(color);
                                }
                            }
                        }
                    }
                    
                    // 提取对齐
                    if let Some(jc_start) = p_pr.find("<w:jc") {
                        if let Some(align_val) = Self::extract_attribute_value(&p_pr[jc_start..], "w:val") {
                            style_def.align = Some(align_val);
                        }
                    }
                }
            }
            
            styles.insert(style_id, style_def);
        }
        
        eprintln!("📝 从 styles.xml 提取到 {} 个样式定义", styles.len());
        styles
    }
    
    /// 返回段落格式列表，包含每个段落的对齐信息和运行列表（仅用于预览模式）
    /// 注意：编辑模式不再使用此函数，只保留换行和结构
    fn extract_docx_formatting(doc_path: &Path) -> Vec<ParagraphFormatting> {
        use zip::ZipArchive;
        
        let mut paragraphs_formatting = Vec::new();
        
        // 打开 DOCX 文件（它是一个 ZIP 文件）
        let file = match std::fs::File::open(doc_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("⚠️ 无法打开 DOCX 文件提取格式信息: {}", e);
                return paragraphs_formatting;
            }
        };
        
        let mut archive = match ZipArchive::new(file) {
            Ok(a) => a,
            Err(e) => {
                eprintln!("⚠️ 无法读取 DOCX ZIP 文件: {}", e);
                return paragraphs_formatting;
            }
        };
        
        // 读取 document.xml
        let mut xml_content = {
            let mut doc_xml = match archive.by_name("word/document.xml") {
                Ok(f) => f,
                Err(e) => {
                    eprintln!("⚠️ 无法读取 document.xml: {}", e);
                    return paragraphs_formatting;
                }
            };
            
            let mut content = String::new();
            if doc_xml.read_to_string(&mut content).is_err() {
                eprintln!("⚠️ 无法读取 document.xml 内容");
                return paragraphs_formatting;
            }
            content
        };
        
        // 读取 styles.xml 来查找样式定义中的对齐信息
        let styles_content = {
            if let Ok(mut styles_file) = archive.by_name("word/styles.xml") {
                let mut content = String::new();
                let _ = styles_file.read_to_string(&mut content);
                content
            } else {
                eprintln!("⚠️ 无法读取 styles.xml，将跳过样式定义查找");
                String::new()
            }
        };
        
        // 提取样式定义
        let style_definitions = Self::extract_style_definitions(&styles_content);
        
        // 解析 XML，提取段落对齐和运行级别格式信息
        // 使用简单的字符串匹配，因为 DOCX XML 结构相对固定
        let paragraphs: Vec<&str> = xml_content.split("<w:p ").collect();
        
        for (para_idx, para) in paragraphs.iter().skip(1).enumerate() {
            let mut para_formatting = ParagraphFormatting::new();
            para_formatting.paragraph_id = Some(format!("para_{}", para_idx));
            
            // 提取段落样式 ID（用于查找样式定义中的对齐信息）
            let mut style_id: Option<&str> = None;
            if let Some(p_pr_start) = para.find("<w:pPr>") {
                if let Some(p_pr_end) = para[p_pr_start..].find("</w:pPr>") {
                    let p_pr = &para[p_pr_start..p_pr_start + p_pr_end];
                    
                    // 查找 <w:pStyle w:val="..."/>
                    if let Some(style_start) = p_pr.find("<w:pStyle") {
                        if let Some(val_start) = p_pr[style_start..].find("w:val=\"") {
                            let val_start = style_start + val_start + 7;
                            if let Some(val_end) = p_pr[val_start..].find('"') {
                                style_id = Some(&p_pr[val_start..val_start + val_end]);
                                para_formatting.paragraph_style_id = Some(style_id.unwrap().to_string());
                            }
                        }
                    }
                    
                    // 查找段落级别的对齐信息（在 <w:jc> 中）
                    if let Some(jc_start) = p_pr.find("<w:jc") {
                        if let Some(val_start) = p_pr[jc_start..].find("w:val=\"") {
                            let val_start = jc_start + val_start + 7;
                            if let Some(val_end) = p_pr[val_start..].find('"') {
                                let align_val = &p_pr[val_start..val_start + val_end];
                                para_formatting.paragraph_align = Some(align_val.to_string());
                            }
                        }
                    }
                    
                    // 提取行距
                    if let Some(spacing_start) = p_pr.find("<w:spacing") {
                        if let Some(line) = Self::extract_attribute_value(&p_pr[spacing_start..], "w:line") {
                            if let Ok(line_int) = line.parse::<u32>() {
                                let line_rule = Self::extract_attribute_value(&p_pr[spacing_start..], "w:lineRule");
                                if line_rule.as_deref() == Some("auto") {
                                    // 自动行距：line/240 = 倍数
                                    let multiple = line_int as f32 / 240.0;
                                    para_formatting.line_height = Some(format!("{:.1}", multiple));
                                    eprintln!("📝 提取到行距: {} 倍", multiple);
                                } else {
                                    // 固定行距：line/20 = pt
                                    let pt = line_int as f32 / 20.0;
                                    para_formatting.line_height = Some(format!("{}pt", pt));
                                    eprintln!("📝 提取到行距: {}pt", pt);
                                }
                            }
                        }
                    }
                    
                    // 提取首行缩进
                    if let Some(ind_start) = p_pr.find("<w:ind") {
                        if let Some(first_line) = Self::extract_attribute_value(&p_pr[ind_start..], "w:firstLine") {
                            if let Ok(first_line_int) = first_line.parse::<u32>() {
                                // firstLine/20 = pt，转换为 em
                                let pt = first_line_int as f32 / 20.0;
                                let em = pt / 12.0; // 假设基础字号 12pt
                                para_formatting.text_indent = Some(format!("{:.2}em", em));
                                eprintln!("📝 提取到首行缩进: {}em", em);
                            }
                        }
                    }
                    
                    // 提取段落级别背景色
                    if let Some(shd_start) = p_pr.find("<w:shd") {
                        if let Some(fill) = Self::extract_attribute_value(&p_pr[shd_start..], "w:fill") {
                            if let Some(val) = Self::extract_attribute_value(&p_pr[shd_start..], "w:val") {
                                if val != "clear" {
                                    let color = if fill.len() == 6 && fill.chars().all(|c| c.is_ascii_hexdigit()) {
                                        format!("#{}", fill)
                                    } else {
                                        fill
                                    };
                                    para_formatting.background_color = Some(color.clone());
                                    eprintln!("📝 提取到段落背景色: {}", color);
                                }
                            }
                        }
                    }
                    
                    // 提取段落级别的字体和字号（在 <w:pPr><w:rPr> 中）
                    if let Some(r_pr_start) = p_pr.find("<w:rPr>") {
                        if let Some(r_pr_end) = p_pr[r_pr_start..].find("</w:rPr>") {
                            let r_pr = &p_pr[r_pr_start..r_pr_start + r_pr_end];
                            
                            // 提取字体
                            if let Some(fonts_start) = r_pr.find("<w:rFonts") {
                                if let Some(ascii) = Self::extract_attribute_value(&r_pr[fonts_start..], "w:ascii") {
                                    para_formatting.paragraph_font_family = Some(ascii.clone());
                                    eprintln!("📝 提取到段落字体: {}", ascii);
                                }
                            }
                            
                            // 提取字号
                            if let Some(sz_start) = r_pr.find("<w:sz") {
                                if let Some(sz_val) = Self::extract_attribute_value(&r_pr[sz_start..], "w:val") {
                                    if let Ok(sz_int) = sz_val.parse::<u32>() {
                                        let pt = sz_int as f32 / 2.0;
                                        para_formatting.paragraph_font_size = Some(format!("{}pt", pt));
                                        eprintln!("📝 提取到段落字号: {}pt", pt);
                                    }
                                }
                            }
                            
                            // 查找段落级别的颜色（在 <w:rPr> 中）
                            if let Some(color_start) = r_pr.find("<w:color") {
                                if let Some(color_val) = Self::extract_attribute_value(&r_pr[color_start..], "w:val") {
                                    // 转换颜色格式：FF0000 -> #FF0000
                                    let color = if color_val.len() == 6 && color_val.chars().all(|c| c.is_ascii_hexdigit()) {
                                        format!("#{}", color_val)
                                    } else {
                                        color_val
                                    };
                                    para_formatting.paragraph_level_color = Some(color);
                                }
                            }
                        }
                    }
                }
            }
            
            // 如果段落级别没有格式信息，尝试从样式定义中获取
            if let Some(style_id) = &para_formatting.paragraph_style_id {
                if let Some(style_def) = style_definitions.get(style_id) {
                    // 应用样式定义的格式（如果段落级别没有）
                    if para_formatting.paragraph_align.is_none() {
                        para_formatting.paragraph_align = style_def.align.clone();
                    }
                    if para_formatting.line_height.is_none() {
                        para_formatting.line_height = style_def.line_height.clone();
                    }
                    if para_formatting.text_indent.is_none() {
                        para_formatting.text_indent = style_def.text_indent.clone();
                    }
                    if para_formatting.background_color.is_none() {
                        para_formatting.background_color = style_def.background_color.clone();
                    }
                    if para_formatting.paragraph_font_family.is_none() {
                        para_formatting.paragraph_font_family = style_def.font_family.clone();
                    }
                    if para_formatting.paragraph_font_size.is_none() {
                        para_formatting.paragraph_font_size = style_def.font_size.clone();
                    }
                    if para_formatting.paragraph_level_color.is_none() {
                        para_formatting.paragraph_level_color = style_def.color.clone();
                    }
                }
            }
            
            // 提取运行（Run）级别的格式信息
            let runs: Vec<&str> = para.split("<w:r").collect();
            let mut run_position = 0;
            
            for run in runs.iter().skip(1) {
                let mut run_formatting = RunFormatting::new();
                run_formatting.position = run_position;
                
                // 提取运行属性（<w:rPr>）
                // 注意：<w:rPr> 可能没有结束标签，需要查找下一个标签或 </w:rPr>
                let r_pr = if let Some(r_pr_start) = run.find("<w:rPr>") {
                    // 查找 </w:rPr> 结束标签
                    if let Some(r_pr_end) = run[r_pr_start..].find("</w:rPr>") {
                        Some(&run[r_pr_start..r_pr_start + r_pr_end + 8])
                    } else {
                        // 如果没有 </w:rPr>，查找下一个标签（如 <w:t>）
                        if let Some(next_tag) = run[r_pr_start..].find("<w:") {
                            Some(&run[r_pr_start..r_pr_start + next_tag])
                        } else {
                            Some(&run[r_pr_start..])
                        }
                    }
                } else if let Some(r_pr_start) = run.find("<w:rPr") {
                    // 处理 <w:rPr 后面可能有属性或自闭合的情况
                    // 先查找 </w:rPr> 结束标签
                    if let Some(r_pr_end) = run[r_pr_start..].find("</w:rPr>") {
                        Some(&run[r_pr_start..r_pr_start + r_pr_end + 8])
                    } else {
                        // 如果没有 </w:rPr>，查找下一个 <w: 标签（如 <w:t>）
                        if let Some(next_tag) = run[r_pr_start..].find("<w:") {
                            Some(&run[r_pr_start..r_pr_start + next_tag])
                        } else {
                            // 如果都没有，尝试查找 > 然后找下一个标签
                            if let Some(r_pr_end) = run[r_pr_start..].find(">") {
                                if let Some(next_tag) = run[r_pr_start + r_pr_end + 1..].find("<w:") {
                                    Some(&run[r_pr_start..r_pr_start + r_pr_end + 1 + next_tag])
                                } else {
                                    Some(&run[r_pr_start..r_pr_start + r_pr_end + 1])
                                }
                            } else {
                                None
                            }
                        }
                    }
                } else {
                    None
                };
                
                // 提取颜色：即使没有找到 r_pr，也尝试在运行片段中直接查找颜色
                // 因为 split("<w:r") 分割后，片段可能不包含完整的 <w:rPr> 标签
                let search_text = if let Some(r_pr) = r_pr {
                    r_pr
                } else {
                    run // 如果没有找到 r_pr，在整个运行片段中查找
                };
                
                // 提取颜色
                if let Some(color_start) = search_text.find("<w:color") {
                    // 查找 w:val 属性
                    if let Some(val_start) = search_text[color_start..].find("w:val=\"") {
                        let val_start = color_start + val_start + 7;
                        if let Some(val_end) = search_text[val_start..].find('"') {
                            let color_val = &search_text[val_start..val_start + val_end];
                            let color = if color_val.len() == 6 && color_val.chars().all(|c| c.is_ascii_hexdigit()) {
                                format!("#{}", color_val)
                            } else {
                                color_val.to_string()
                            };
                            run_formatting.color = Some(color.clone());
                            eprintln!("🎨 提取到运行颜色: 颜色={}", color);
                        }
                    }
                }
                
                // 调试：检查是否找到 r_pr
                if r_pr.is_none() && run.contains("<w:t") && run_formatting.color.is_none() {
                    // 安全截取：使用字符迭代器避免 UTF-8 字符边界问题
                    let preview: String = run.chars().take(200).collect();
                    eprintln!("⚠️ 运行 {}: 未找到 <w:rPr>，运行预览: {}", run_position, preview);
                }
                
                // 使用 r_pr 或整个 run 片段来提取格式
                // 因为有些格式可能不在 <w:rPr> 标签内，或者 <w:rPr> 标签不完整
                let search_text = if let Some(r_pr) = r_pr {
                    // 安全截取：使用字符迭代器避免 UTF-8 字符边界问题
                    let preview: String = r_pr.chars().take(150).collect();
                    eprintln!("✅ 运行 {}: 找到 r_pr，长度={}, 预览={:?}", run_position, r_pr.len(), preview);
                    r_pr
                } else {
                    // 如果没有找到 r_pr，在整个运行片段中查找格式
                    eprintln!("⚠️ 运行 {}: 未找到 <w:rPr>，在整个运行片段中查找格式", run_position);
                    run
                };
                
                // 提取字体（<w:rFonts w:ascii="..."/>）
                if let Some(font_start) = search_text.find("<w:rFonts") {
                    if let Some(ascii_start) = search_text[font_start..].find("w:ascii=\"") {
                        let ascii_start = font_start + ascii_start + 8;
                        if let Some(ascii_end) = search_text[ascii_start..].find('"') {
                            let font_name = &search_text[ascii_start..ascii_start + ascii_end];
                            run_formatting.font_family = Some(font_name.to_string());
                            eprintln!("📝 提取到字体: {}", font_name);
                        }
                    }
                }
                
                // 提取字号（<w:sz w:val="40"/>，转换为 pt：val/2）
                if let Some(sz_start) = search_text.find("<w:sz") {
                    if let Some(val_start) = search_text[sz_start..].find("w:val=\"") {
                        let val_start = sz_start + val_start + 7;
                        if let Some(val_end) = search_text[val_start..].find('"') {
                            if let Ok(sz_val) = search_text[val_start..val_start + val_end].parse::<u32>() {
                                let pt = sz_val as f32 / 2.0;
                                run_formatting.font_size = Some(format!("{}pt", pt));
                                eprintln!("📝 提取到字号: {}pt", pt);
                            }
                        }
                    }
                }
                
                // 提取粗体（<w:b/> 或 <w:bCs/>）
                if search_text.contains("<w:b") && !search_text.contains("w:val=\"false\"") {
                    run_formatting.bold = true;
                    eprintln!("📝 提取到粗体");
                }
                
                // 提取斜体（<w:i/> 或 <w:iCs/>）
                if search_text.contains("<w:i") && !search_text.contains("w:val=\"false\"") {
                    run_formatting.italic = true;
                    eprintln!("📝 提取到斜体");
                }
                
                // 提取下划线（<w:u w:val="..."/>）
                if search_text.contains("<w:u") && !search_text.contains("w:val=\"none\"") {
                    run_formatting.underline = true;
                    eprintln!("📝 提取到下划线");
                }
                
                // 提取运行级别背景色/高亮
                // 方法1：高亮颜色（<w:highlight>）
                if let Some(highlight_start) = search_text.find("<w:highlight") {
                    if let Some(val) = Self::extract_attribute_value(&search_text[highlight_start..], "w:val") {
                        if val != "none" {
                            // 高亮颜色映射
                            let highlight_color = match val.as_str() {
                                "yellow" => Some("#FFFF00"),
                                "green" => Some("#00FF00"),
                                "cyan" => Some("#00FFFF"),
                                "magenta" => Some("#FF00FF"),
                                "blue" => Some("#0000FF"),
                                "red" => Some("#FF0000"),
                                "darkBlue" => Some("#00008B"),
                                "darkCyan" => Some("#008B8B"),
                                "darkGreen" => Some("#006400"),
                                "darkMagenta" => Some("#8B008B"),
                                "darkRed" => Some("#8B0000"),
                                "darkYellow" => Some("#B8860B"),
                                "darkGray" => Some("#A9A9A9"),
                                "lightGray" => Some("#D3D3D3"),
                                "black" => Some("#000000"),
                                "white" => Some("#FFFFFF"),
                                _ => None,
                            };
                            if let Some(color) = highlight_color {
                                run_formatting.background_color = Some(color.to_string());
                                eprintln!("📝 提取到运行背景色（高亮）: {}", color);
                            }
                        }
                    }
                }
                
                // 方法2：阴影/填充（<w:shd>）
                if let Some(shd_start) = search_text.find("<w:shd") {
                    if let Some(fill) = Self::extract_attribute_value(&search_text[shd_start..], "w:fill") {
                        if let Some(val) = Self::extract_attribute_value(&search_text[shd_start..], "w:val") {
                            if val != "clear" {
                                let color = if fill.len() == 6 && fill.chars().all(|c| c.is_ascii_hexdigit()) {
                                    format!("#{}", fill)
                                } else {
                                    fill
                                };
                                run_formatting.background_color = Some(color.clone());
                                eprintln!("📝 提取到运行背景色（填充）: {}", color);
                            }
                        }
                    }
                }
                
                // 提取文本（<w:t>...</w:t>）
                if let Some(t_start) = run.find("<w:t") {
                    if let Some(text_start) = run[t_start..].find('>') {
                        let text_start = t_start + text_start + 1;
                        if let Some(text_end) = run[text_start..].find("</w:t>") {
                            let text = &run[text_start..text_start + text_end];
                            // 处理 XML 实体
                            let text = text.replace("&lt;", "<")
                                .replace("&gt;", ">")
                                .replace("&amp;", "&")
                                .replace("&quot;", "\"")
                                .replace("&apos;", "'");
                            run_formatting.text = text;
                        }
                    }
                }
                
                // 如果运行级别没有字体/字号，从段落级别继承
                if run_formatting.font_family.is_none() {
                    if let Some(para_font) = &para_formatting.paragraph_font_family {
                        run_formatting.font_family = Some(para_font.clone());
                        eprintln!("📝 运行继承段落字体: {}", para_font);
                    }
                }
                
                if run_formatting.font_size.is_none() {
                    if let Some(para_size) = &para_formatting.paragraph_font_size {
                        run_formatting.font_size = Some(para_size.clone());
                        eprintln!("📝 运行继承段落字号: {}", para_size);
                    }
                }
                
                // 如果运行有文本，添加到段落
                if !run_formatting.text.is_empty() {
                    if run_formatting.has_formatting() {
                        eprintln!("📝 运行有格式: 文本=\"{}\", 颜色={:?}, 字体={:?}, 字号={:?}, 粗体={}, 斜体={}, 下划线={}, 背景色={:?}", 
                            run_formatting.text, 
                            run_formatting.color, 
                            run_formatting.font_family, 
                            run_formatting.font_size,
                            run_formatting.bold,
                            run_formatting.italic,
                            run_formatting.underline,
                            run_formatting.background_color);
                    }
                    para_formatting.runs.push(run_formatting);
                    run_position += 1;
                }
            }
            
            // 如果段落有内容，添加到列表
            if !para_formatting.runs.is_empty() {
                paragraphs_formatting.push(para_formatting);
            }
        }
        
        eprintln!("📝 从 DOCX 提取到 {} 个段落格式信息", paragraphs_formatting.len());
        paragraphs_formatting
    }
    
    /// 将从 DOCX 提取的格式信息应用到 HTML（仅用于预览模式）
    /// 包括段落级别的对齐和运行级别的格式（颜色、字体、字号等）
    /// 注意：编辑模式不再使用此函数，只保留换行和结构
    fn apply_docx_formatting(html: &str, paragraphs_formatting: &[ParagraphFormatting]) -> String {
        use regex::Regex;
        let mut result = html.to_string();
        
        // 遍历每个段落格式信息
        for (para_idx, para_formatting) in paragraphs_formatting.iter().enumerate() {
            // 1. 应用段落级别的对齐
            let para_text = para_formatting.get_full_text();
            let normalized_para_text = Self::normalize_text(&para_text);
            
            eprintln!("🔍 [段落 {}/{}] 查找元素: 文本=\"{}\", 运行数={}, 有格式运行数={}", 
                para_idx + 1, 
                paragraphs_formatting.len(),
                normalized_para_text,
                para_formatting.runs.len(),
                para_formatting.runs.iter().filter(|r| r.has_formatting()).count());
            
            // 策略1：通过 ID 匹配（标题通常有 ID）
            let mut element_found = false;
            if para_formatting.paragraph_id.is_some() {
                // 尝试通过 ID 匹配（Pandoc 为标题生成 ID）
                let id_pattern = format!(r#"<(h[1-6]|p)[^>]*id="[^"]*"[^>]*>"#);
                let id_re = Regex::new(&id_pattern).unwrap();
                
                for cap in id_re.captures_iter(&result) {
                    let full_match = cap.get(0).unwrap();
                    let match_start = full_match.start();
                    let match_end = full_match.end();
                    let start_tag = &result[match_start..match_end];
                    
                    // 检查标签内的文本是否匹配
                    if let Some(tag_end_offset) = result[match_start..].find('>') {
                        let tag_end = match_start + tag_end_offset + 1;
                        if let Some(closing_tag_offset) = result[tag_end..].find(&format!("</{}>", &cap[1])) {
                            let content_start = tag_end;
                            let content_end = tag_end + closing_tag_offset;
                            let content = &result[content_start..content_end];
                            let normalized_content = Self::normalize_text(content);
                            
                            if normalized_content == normalized_para_text {
                                // 找到匹配的元素，应用段落对齐和运行格式
                                element_found = true;
                                result = Self::apply_formatting_to_element(
                                    &result,
                                    match_start,
                                    content_start,
                                    content_end,
                                    para_formatting,
                                );
                                break;
                            }
                        }
                    }
                }
            }
            
            // 策略2：通过文本内容匹配（如果 ID 匹配失败）
            // 使用更宽松的匹配策略：支持部分匹配和模糊匹配
            if !element_found {
                // 尝试精确匹配
                let escaped_text = regex::escape(&normalized_para_text);
                let pattern = format!(r#"<(h[1-6]|p)([^>]*)>([^<]*{}[^<]*)</(h[1-6]|p)>"#, escaped_text);
                let re = Regex::new(&pattern).unwrap();
                
                for cap in re.captures_iter(&result) {
                    let full_match = cap.get(0).unwrap();
                    let tag_start = full_match.start();
                    let match_end = full_match.end();
                    
                    // 找到开始标签的结束位置
                    if let Some(tag_end_offset) = result[tag_start..].find('>') {
                        let content_start = tag_start + tag_end_offset + 1;
                        let content_end = match_end - cap[1].len() - 3; // 减去 </tag>
                        
                        // 应用格式
                        result = Self::apply_formatting_to_element(
                            &result,
                            tag_start,
                            content_start,
                            content_end,
                            para_formatting,
                        );
                        element_found = true;
                        break;
                    }
                }
                
                // 策略3：如果精确匹配失败，尝试模糊匹配（忽略空格和HTML实体差异）
                if !element_found {
                    eprintln!("⚠️ 精确匹配失败，尝试模糊匹配");
                    
                    // 查找所有可能的段落元素
                    let para_elements = Self::find_paragraph_elements(&result);
                    
                    let mut best_match: Option<(usize, usize, usize, f64)> = None;
                    
                    for (tag_start, content_start, content_end) in para_elements {
                        // 验证文本是否匹配（使用规范化后的文本）
                        let element_content = &result[content_start..content_end];
                        let normalized_element = Self::normalize_text(element_content);
                        
                        // 使用相似度匹配（允许部分差异）
                        let similarity = Self::text_similarity(&normalized_element, &normalized_para_text);
                        
                        // 记录最佳匹配（相似度最高的）
                        if let Some((_, _, _, best_sim)) = best_match {
                            if similarity > best_sim {
                                best_match = Some((tag_start, content_start, content_end, similarity));
                            }
                        } else if similarity > 0.5 {
                            // 降低阈值到 0.5，只要相似度超过 0.5 就考虑
                            best_match = Some((tag_start, content_start, content_end, similarity));
                        }
                    }
                    
                    // 如果找到最佳匹配，应用格式
                    if let Some((tag_start, content_start, content_end, similarity)) = best_match {
                        eprintln!("✅ 模糊匹配成功，相似度: {:.2}", similarity);
                        
                        result = Self::apply_formatting_to_element(
                            &result,
                            tag_start,
                            content_start,
                            content_end,
                            para_formatting,
                        );
                        element_found = true;
                    } else {
                        eprintln!("⚠️ 模糊匹配也失败，未找到相似段落");
                    }
                }
            }
        }
        
        if !paragraphs_formatting.is_empty() {
            eprintln!("✅ 已应用 DOCX 格式信息到 HTML（{} 个段落）", paragraphs_formatting.len());
        }
        
        result
    }
    
    /// 规范化文本（去除 HTML 标签，统一空白字符）
    fn normalize_text(text: &str) -> String {
        use regex::Regex;
        // 去除 HTML 标签
        let re_tags = Regex::new(r"<[^>]+>").unwrap();
        let text = re_tags.replace_all(text, "");
        
        // 转换 HTML 实体
        let text = text.replace("&nbsp;", " ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&#160;", " ")  // 非断行空格
            .replace("&#xa0;", " "); // 非断行空格（十六进制）
        
        // 规范化空白字符（多个空格合并为一个，去除首尾空白）
        let re_whitespace = Regex::new(r"\s+").unwrap();
        re_whitespace.replace_all(&text, " ").trim().to_string()
    }
    
    /// 应用格式到 HTML 元素（段落对齐 + 运行级别格式）
    fn apply_formatting_to_element(
        html: &str,
        tag_start: usize,
        content_start: usize,
        content_end: usize,
        para_formatting: &ParagraphFormatting,
    ) -> String {
        use regex::Regex;
        let mut result = html.to_string();
        
        // 1. 应用段落级别的格式（对齐、行距、首行缩进、背景色）
        let start_tag = &result[tag_start..content_start];
        
        // 构建段落级别样式字符串
        let mut para_styles = Vec::new();
        if let Some(ref align) = para_formatting.paragraph_align {
            para_styles.push(format!("text-align: {}", align));
        }
        if let Some(ref line_height) = para_formatting.line_height {
            para_styles.push(format!("line-height: {}", line_height));
        }
        if let Some(ref text_indent) = para_formatting.text_indent {
            para_styles.push(format!("text-indent: {}", text_indent));
        }
        if let Some(ref bg_color) = para_formatting.background_color {
            para_styles.push(format!("background-color: {}", bg_color));
        }
        
        if !para_styles.is_empty() {
            let style_re = Regex::new(r#"style="([^"]*)""#).unwrap();
            let new_tag = if start_tag.contains("style=") {
                // 合并到现有样式
                style_re.replace(start_tag, |caps: &regex::Captures| {
                    let existing_style = &caps[1];
                    let merged_style = if existing_style.is_empty() {
                        para_styles.join("; ")
                    } else {
                        format!("{}; {}", existing_style, para_styles.join("; "))
                    };
                    format!(r#"style="{}""#, merged_style)
                }).to_string()
            } else {
                // 添加新样式
                let style_str = para_styles.join("; ");
                start_tag.replace('>', &format!(r#" style="{}">"#, style_str))
            };
            result.replace_range(tag_start..content_start, &new_tag);
            // 更新 content_start（因为标签长度可能改变）
            let new_content_start = tag_start + new_tag.len();
            let content_end_offset = content_end - content_start;
            let new_content_end = new_content_start + content_end_offset;
            
            // 2. 应用运行级别的格式（在内容中插入 <span> 标签）
            let content = &result[new_content_start..new_content_end];
            let preview: String = content.chars().take(200).collect();
            eprintln!("📝 原始内容: {}", preview);
            let new_content = Self::apply_run_formatting_to_content(content, &para_formatting.runs);
            let new_preview: String = new_content.chars().take(200).collect();
            eprintln!("📝 新内容: {}", new_preview);
            
            // 替换内容
            result.replace_range(new_content_start..new_content_end, &new_content);
        } else {
            // 没有段落级别格式，只应用运行格式
            let content = &result[content_start..content_end];
            let preview: String = content.chars().take(200).collect();
            eprintln!("📝 原始内容（无对齐）: {}", preview);
            let new_content = Self::apply_run_formatting_to_content(content, &para_formatting.runs);
            let new_preview: String = new_content.chars().take(200).collect();
            eprintln!("📝 新内容（无对齐）: {}", new_preview);
            result.replace_range(content_start..content_end, &new_content);
        }
        
        result
    }
    
    /// 在 HTML 内容中应用运行级别格式（插入 <span> 标签）
    /// 优化策略：尝试在保留原有 HTML 标签的基础上应用格式
    /// 安全保护：添加性能限制，防止内存问题和无限循环
    fn apply_run_formatting_to_content(content: &str, runs: &[RunFormatting]) -> String {
        eprintln!("🔍 应用运行格式: 内容长度={}, 运行数={}", content.len(), runs.len());
        
        // 安全限制：如果内容或运行数过大，直接使用顺序拼接策略
        const MAX_CONTENT_LENGTH: usize = 50_000; // 50KB
        const MAX_RUNS: usize = 500;
        
        if content.len() > MAX_CONTENT_LENGTH {
            eprintln!("⚠️ 内容过长 ({} 字节)，直接使用顺序拼接策略", content.len());
            return Self::apply_run_formatting_with_concatenation(runs);
        }
        
        if runs.len() > MAX_RUNS {
            eprintln!("⚠️ 运行数过多 ({} 个)，直接使用顺序拼接策略", runs.len());
            return Self::apply_run_formatting_with_concatenation(runs);
        }
        
        // 安全地截取预览：使用字符迭代器，避免在 UTF-8 字符中间截断
        let preview: String = content.chars().take(150).collect();
        eprintln!("🔍 HTML 内容预览: {}", preview);
        
        // 如果只有一个运行且没有格式，直接返回原内容
        if runs.len() == 1 && !runs[0].has_formatting() {
            eprintln!("⚠️ 只有一个运行且无格式，跳过");
            return content.to_string();
        }
        
        // 如果所有运行都没有格式，直接返回原内容
        if runs.iter().all(|r| !r.has_formatting()) {
            eprintln!("⚠️ 所有运行都无格式，跳过");
            return content.to_string();
        }
        
        // 统计有格式的运行数
        let formatted_runs_count = runs.iter().filter(|r| r.has_formatting()).count();
        eprintln!("✅ 找到 {} 个有格式的运行，开始应用", formatted_runs_count);
        
        // 策略1：检查是否包含格式标签（<strong>, <em>, <u>）
        // 根本修复：当Pandoc已经生成了格式标签时，直接保留原始HTML，不应用额外格式
        // 这样可以确保内容不会丢失，格式标签也不会被破坏
        // 虽然颜色等样式信息可能丢失，但内容完整性更重要
        if content.contains('<') && content.contains('>') {
            let has_format_tags = content.contains("<strong") || content.contains("</strong>") ||
                                  content.contains("<em") || content.contains("</em>") ||
                                  content.contains("<u") || content.contains("</u>");
            
            if has_format_tags {
                eprintln!("📝 检测到格式标签（<strong>/<em>/<u>），保留原始HTML确保内容完整性");
                eprintln!("⚠️ 注意：颜色等样式信息可能不会应用，但内容不会丢失");
                // 直接返回原始内容，不应用额外格式
                // 这样可以确保内容不会丢失，格式标签也不会被破坏
                return content.to_string();
            } else if content.contains("<span") || content.contains("</span>") {
                eprintln!("⚠️ 检测到 <span> 标签，跳过智能匹配，直接使用顺序拼接策略");
            } else {
                // 没有格式标签，可以尝试智能匹配
                eprintln!("📝 检测到 HTML 标签（无格式标签），尝试智能匹配策略");
                if let Some(result) = Self::apply_formatting_preserving_html_tags(content, runs) {
                    eprintln!("✅ 智能匹配成功，保留 HTML 标签");
                    let preview: String = result.chars().take(200).collect();
                    eprintln!("🔍 生成的 HTML 预览: {}", preview);
                    return result;
                }
                eprintln!("⚠️ 智能匹配失败，回退到顺序拼接策略");
            }
        }
        
        // 策略2：使用顺序拼接策略（回退方案）
        // 原因：HTML 中的文本可能与 DOCX 中的文本有差异（HTML 实体、空格等），
        // 但运行顺序是确定的，按顺序拼接可以确保格式应用正确
        eprintln!("📝 使用顺序拼接策略应用运行格式");
        let result = Self::apply_run_formatting_with_concatenation(runs);
        let preview: String = result.chars().take(200).collect();
        eprintln!("🔍 生成的 HTML 预览: {}", preview);
        result
    }
    
    /// 智能匹配策略：在保留原有 HTML 标签的基础上应用格式
    /// 改进：使用更精确的文本匹配，避免嵌套和标签丢失
    /// 性能优化：避免在每个字符位置都提取文本，使用更高效的匹配策略
    /// 安全保护：添加性能限制，防止无限循环和内存问题
    fn apply_formatting_preserving_html_tags(content: &str, runs: &[RunFormatting]) -> Option<String> {
        use regex::Regex;
        
        // 安全限制：如果内容或运行数过大，直接返回 None，使用回退策略
        const MAX_CONTENT_LENGTH: usize = 100_000; // 100KB
        const MAX_RUNS: usize = 1000;
        
        if content.len() > MAX_CONTENT_LENGTH {
            eprintln!("⚠️ 内容过长 ({} 字节)，跳过智能匹配", content.len());
            return None;
        }
        
        if runs.len() > MAX_RUNS {
            eprintln!("⚠️ 运行数过多 ({} 个)，跳过智能匹配", runs.len());
            return None;
        }
        
        let mut result = content.to_string();
        let mut processed_ranges: Vec<(usize, usize)> = Vec::new(); // 记录已处理的范围，避免重复处理
        
        // 提取纯文本（去除 HTML 标签）用于验证
        let text_only = Self::extract_text_from_html(content);
        let normalized_text = Self::normalize_text(&text_only);
        
        // 构建运行文本的完整字符串
        let runs_text: String = runs.iter().map(|r| r.text.as_str()).collect();
        let normalized_runs_text = Self::normalize_text(&runs_text);
        
        // 如果文本不匹配，返回 None
        if normalized_text != normalized_runs_text {
            eprintln!("⚠️ 文本不匹配，无法使用智能匹配: 原始={}, 运行={}", normalized_text, normalized_runs_text);
            return None;
        }
        
        // 性能优化：预先提取所有文本位置映射（文本字符位置 -> HTML 字节位置）
        // 关键修复：使用字节索引而不是字符迭代器，避免索引错误和无限循环
        let mut text_to_html_map: Vec<(usize, usize)> = Vec::new(); // (文本字符索引, HTML字节位置)
        let mut text_char_index = 0;
        let mut byte_pos = 0;
        let content_bytes = result.as_bytes();
        let content_len = result.len();
        
        // 安全限制：最多处理 10000 个字符，防止无限循环
        let max_chars = 10000;
        let mut char_count = 0;
        
        while byte_pos < content_len && char_count < max_chars {
            // 检查是否是 HTML 标签的开始
            if content_bytes[byte_pos] == b'<' {
                // 查找标签结束位置
                let remaining = &result[byte_pos..];
                if let Some(tag_end) = remaining.find('>') {
                    let tag_content = &remaining[..tag_end + 1];
                    
                    // 检查是否是格式标签（<em>, <strong>, <u>）或结束标签
                    // 关键：格式标签会被跳过，但它们的文本内容会被记录
                    // 其他标签（如 <span>）也会被跳过，但它们的文本内容也会被记录
                    if tag_content.starts_with("</em>") || tag_content.starts_with("</strong>") || 
                       tag_content.starts_with("</u>") || tag_content.starts_with("<em") || 
                       tag_content.starts_with("<strong") || tag_content.starts_with("<u") {
                        // 跳过格式标签，不记录为文本
                        byte_pos += tag_end + 1;
                        continue;
                    } else if tag_content.starts_with("<span") || tag_content.starts_with("</span>") {
                        // 跳过 <span> 标签，不记录为文本
                        // 关键：<span> 标签的文本内容已经在之前被记录了
                        byte_pos += tag_end + 1;
                        continue;
                    } else {
                        // 其他 HTML 标签，跳过
                        byte_pos += tag_end + 1;
                        continue;
                    }
                } else {
                    // 没有找到 '>'，可能是格式错误，跳过这个字符
                    byte_pos += 1;
                    continue;
                }
            }
            
            // 不是标签，是文本字符
            // 安全地获取字符（处理 UTF-8）
            if let Some((ch, ch_len)) = Self::safe_char_at(&result, byte_pos) {
                text_to_html_map.push((text_char_index, byte_pos));
                text_char_index += 1;
                byte_pos += ch_len;
                char_count += 1;
            } else {
                // 无效的 UTF-8 字符，跳过
                byte_pos += 1;
            }
        }
        
        // 如果达到字符限制，记录警告
        if char_count >= max_chars {
            eprintln!("⚠️ 达到字符处理限制 ({} 个字符)，可能影响格式应用", max_chars);
        }
        
        // 按顺序处理每个运行，在 HTML 中查找对应的文本位置
        let mut current_text_pos = 0; // 当前文本字符位置
        let mut processed_count = 0; // 已处理的运行数（用于性能监控）
        const MAX_PROCESSED_RUNS: usize = 500; // 最多处理 500 个运行
        
        for run in runs.iter() {
            // 性能保护：限制处理的运行数
            if processed_count >= MAX_PROCESSED_RUNS {
                eprintln!("⚠️ 达到运行处理限制 ({} 个)，停止处理", MAX_PROCESSED_RUNS);
                break;
            }
            
            if run.text.is_empty() {
                continue;
            }
            
            processed_count += 1;
            
            let run_text_normalized = Self::normalize_text(&run.text);
            let run_text_len = run_text_normalized.chars().count();
            
            // 在文本位置映射中查找运行文本的起始位置
            let mut found = false;
            let mut html_start = 0;
            let mut html_end = 0;
            
            // 从当前位置开始查找
            if current_text_pos < text_to_html_map.len() {
                // 安全地获取从当前位置开始的文本（使用字符迭代器，避免 UTF-8 边界错误）
                let remaining_text: String = normalized_text
                    .chars()
                    .skip(current_text_pos)
                    .collect();
                
                // 检查从当前位置开始的文本是否匹配
                if remaining_text.starts_with(&run_text_normalized) {
                    // 找到匹配位置
                    let start_map_idx = current_text_pos;
                    let end_map_idx = current_text_pos + run_text_len;
                    
                    if start_map_idx < text_to_html_map.len() && end_map_idx <= text_to_html_map.len() {
                        html_start = text_to_html_map[start_map_idx].1;
                        html_end = if end_map_idx < text_to_html_map.len() {
                            text_to_html_map[end_map_idx].1
                        } else {
                            result.len()
                        };
                        
                        // 检查是否与已处理的范围重叠
                        let overlaps = processed_ranges.iter().any(|(start, end)| {
                            (html_start >= *start && html_start < *end) || 
                            (html_end > *start && html_end <= *end) ||
                            (html_start <= *start && html_end >= *end)
                        });
                        
                        if !overlaps {
                            found = true;
                            processed_ranges.push((html_start, html_end));
                            current_text_pos += run_text_len;
                        }
                    }
                }
            }
            
            if !found {
                eprintln!("⚠️ 无法在 HTML 中找到运行文本: \"{}\"", run.text);
                return None;
            }
            
            // 应用格式
            if run.has_formatting() {
                // 根本修复：html_start 和 html_end 已经指向纯文本的字节位置
                // 我们需要找到这些文本位置对应的完整 HTML 元素范围
                // 关键：只查找格式标签（<em>, <strong>, <u>），不查找 <span> 标签
                
                let mut actual_start = html_start;
                let mut actual_end = html_end;
                
                // 策略：从 html_start 向前查找，找到最近的格式标签开始位置
                // 但必须确保 html_start 在该标签的文本内容区域内（不在标签属性中）
                let search_start = if html_start > 200 { html_start - 200 } else { 0 };
                let before_text = &result[search_start..html_start];
                
                // 查找格式标签，但必须确保标签完整且 html_start 在标签内容区域内
                // 使用更严格的检查：确保找到的标签是完整的，且 html_start 在标签内容区域内
                
                // 查找 <em> 标签
                let mut found_format_tag = false;
                if let Some(em_start_rel) = before_text.rfind("<em") {
                    let em_start_abs = search_start + em_start_rel;
                    // 查找 <em> 标签的结束位置
                    if let Some(em_tag_end) = result[em_start_abs..].find('>') {
                        let em_content_start = em_start_abs + em_tag_end + 1;
                        // 检查 html_start 是否在 <em> 标签的内容区域内
                        if html_start >= em_content_start {
                            // 查找对应的 </em> 标签
                            if let Some(em_close) = result[html_end..].find("</em>") {
                                let em_content_end = html_end + em_close;
                                // 验证：确保 html_end 在 </em> 之前
                                if html_end <= em_content_end {
                                    actual_start = em_start_abs;
                                    actual_end = em_content_end + 5; // +5 for "</em>"
                                    found_format_tag = true;
                                }
                            }
                        }
                    }
                }
                
                // 如果没找到 <em>，尝试查找 <strong>
                if !found_format_tag {
                    if let Some(strong_start_rel) = before_text.rfind("<strong") {
                        let strong_start_abs = search_start + strong_start_rel;
                        if let Some(strong_tag_end) = result[strong_start_abs..].find('>') {
                            let strong_content_start = strong_start_abs + strong_tag_end + 1;
                            if html_start >= strong_content_start {
                                if let Some(strong_close) = result[html_end..].find("</strong>") {
                                    let strong_content_end = html_end + strong_close;
                                    if html_end <= strong_content_end {
                                        actual_start = strong_start_abs;
                                        actual_end = strong_content_end + 8; // +8 for "</strong>"
                                        found_format_tag = true;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // 如果没找到，尝试查找 <u>
                if !found_format_tag {
                    if let Some(u_start_rel) = before_text.rfind("<u") {
                        let u_start_abs = search_start + u_start_rel;
                        if let Some(u_tag_end) = result[u_start_abs..].find('>') {
                            let u_content_start = u_start_abs + u_tag_end + 1;
                            if html_start >= u_content_start {
                                if let Some(u_close) = result[html_end..].find("</u>") {
                                    let u_content_end = html_end + u_close;
                                    if html_end <= u_content_end {
                                        actual_start = u_start_abs;
                                        actual_end = u_content_end + 4; // +4 for "</u>"
                                        found_format_tag = true;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // 根本修复：验证 actual_start 和 actual_end 是否包含 <span> 标签
                // 如果包含，说明范围计算错误，需要重新计算
                let text_to_wrap = &result[actual_start..actual_end];
                let style_str = run.build_style_string();
                
                // 关键检查：如果 text_to_wrap 包含 <span> 标签，说明范围计算错误
                // 这种情况下，我们应该只使用纯文本，不包含任何 HTML 标签
                let has_span_tags = text_to_wrap.contains("<span") || text_to_wrap.contains("</span>");
                
                if has_span_tags {
                    // 范围计算错误：包含了 <span> 标签
                    // 根本修复：直接使用 html_start 和 html_end（它们指向纯文本位置）
                    // 不向前查找，直接使用纯文本位置
                    eprintln!("⚠️ 检测到范围计算错误（包含 <span> 标签），使用纯文本位置");
                    actual_start = html_start;
                    actual_end = html_end;
                    
                    // 重新提取要包装的文本（现在应该只包含纯文本）
                    let text_to_wrap = &result[actual_start..actual_end];
                    
                    // 再次验证：如果仍然包含 HTML 标签，说明 html_start/html_end 计算错误
                    // 这种情况下，我们应该直接使用 run.text，而不是从 HTML 中提取
                    if text_to_wrap.contains('<') || text_to_wrap.contains('>') || 
                       text_to_wrap.contains("style=") || text_to_wrap.contains("color:") {
                        eprintln!("⚠️ html_start/html_end 仍然包含 HTML 代码，直接使用 run.text");
                        // 直接使用 run.text，不尝试从 HTML 中提取
                        let plain_text = run.text.clone();
                        let escaped_text = Self::escape_html(&plain_text);
                        let mut inner_content = escaped_text;
                        
                        if run.italic {
                            inner_content = format!("<em>{}</em>", inner_content);
                        }
                        if run.bold {
                            inner_content = format!("<strong>{}</strong>", inner_content);
                        }
                        if run.underline {
                            inner_content = format!("<u>{}</u>", inner_content);
                        }
                        
                        let wrapped = format!("<span style=\"{}\">{}</span>", style_str, inner_content);
                        
                        // 使用 html_start 和 html_end 进行替换（它们应该指向正确的文本位置）
                        if actual_start < result.len() && actual_end <= result.len() && actual_start < actual_end {
                            if !result.is_char_boundary(actual_start) || !result.is_char_boundary(actual_end) {
                                let safe_start = Self::find_char_boundary(&result, actual_start);
                                let safe_end = Self::find_char_boundary(&result, actual_end);
                                if safe_start < safe_end && safe_end <= result.len() {
                                    actual_start = safe_start;
                                    actual_end = safe_end;
                                } else {
                                    eprintln!("⚠️ 无法找到安全的字符边界，跳过此替换");
                                    continue;
                                }
                            }
                            
                            result.replace_range(actual_start..actual_end, &wrapped);
                            if let Some(last_range) = processed_ranges.last_mut() {
                                *last_range = (actual_start, actual_end);
                            }
                        }
                        continue; // 跳过后续处理
                    }
                }
                
                // 重新提取要包装的文本
                let text_to_wrap = &result[actual_start..actual_end];
                
                // 提取纯文本（去除所有 HTML 标签），用于回退情况
                let plain_text = Self::extract_text_from_html(text_to_wrap);
                
                // 检查 text_to_wrap 是否包含 HTML 标签或样式代码（除了我们期望的格式标签）
                let has_html_tags = text_to_wrap.contains('<') && text_to_wrap.contains('>');
                // 检查是否包含样式代码片段（如 `color: #FF0000; font-weight: bold`）
                let has_style_code = text_to_wrap.contains("color:") || text_to_wrap.contains("font-weight:") || 
                                     text_to_wrap.contains("font-style:") || text_to_wrap.contains("font-size:") ||
                                     text_to_wrap.contains("text-align:") || text_to_wrap.contains("style=");
                // 检查是否包含 HTML 实体（如 `&quot;`, `&amp;`）
                let has_html_entities = text_to_wrap.contains("&quot;") || text_to_wrap.contains("&amp;") ||
                                        text_to_wrap.contains("&lt;") || text_to_wrap.contains("&gt;");
                let trimmed_wrap = text_to_wrap.trim();
                let is_format_tag_only = trimmed_wrap.starts_with("<em") || trimmed_wrap.starts_with("<strong") || trimmed_wrap.starts_with("<u");
                
                // 如果包含 <span> 标签、样式代码、HTML 实体或其他非格式 HTML 标签，直接使用纯文本
                // 根本修复：如果检测到任何问题，直接使用纯文本，不尝试保留格式标签
                if has_span_tags || has_style_code || has_html_entities || (has_html_tags && !is_format_tag_only) {
                    let preview_len = text_to_wrap.len().min(100);
                    let preview: String = text_to_wrap.chars().take(preview_len).collect();
                    eprintln!("🔍 检测到 HTML 标签（包含 <span> 或其他标签），使用纯文本: {}", preview);
                    // 安全截取：使用字符迭代器避免 UTF-8 字符边界问题
                    let preview: String = plain_text.chars().take(50).collect();
                    eprintln!("🔍 提取的纯文本: \"{}\"", preview);
                    
                    // 包含 <span> 或其他非格式标签，直接使用纯文本并转义
                    let escaped_text = Self::escape_html(&plain_text);
                    // 安全截取：使用字符迭代器避免 UTF-8 字符边界问题
                    let preview: String = escaped_text.chars().take(50).collect();
                    eprintln!("🔍 转义后的文本: \"{}\"", preview);
                    let mut inner_content = escaped_text;
                    
                    // 如果运行有斜体，添加 <em>
                    if run.italic {
                        inner_content = format!("<em>{}</em>", inner_content);
                    }
                    // 如果运行有粗体，添加 <strong>
                    if run.bold {
                        inner_content = format!("<strong>{}</strong>", inner_content);
                    }
                    // 如果运行有下划线，添加 <u>
                    if run.underline {
                        inner_content = format!("<u>{}</u>", inner_content);
                    }
                    
                    let wrapped = format!("<span style=\"{}\">{}</span>", style_str, inner_content);
                    
                    // 安全检查：确保范围有效，并且是有效的字符边界
                    if actual_start < result.len() && actual_end <= result.len() && actual_start < actual_end {
                        // 验证字节索引是否在字符边界上
                        if !result.is_char_boundary(actual_start) || !result.is_char_boundary(actual_end) {
                            eprintln!("⚠️ 无效的字符边界: start={}, end={}", actual_start, actual_end);
                            // 尝试找到最近的字符边界
                            let safe_start = Self::find_char_boundary(&result, actual_start);
                            let safe_end = Self::find_char_boundary(&result, actual_end);
                            if safe_start < safe_end && safe_end <= result.len() {
                                actual_start = safe_start;
                                actual_end = safe_end;
                            } else {
                                eprintln!("⚠️ 无法找到安全的字符边界，跳过此替换");
                                continue;
                            }
                        }
                        
                        // 限制替换后的字符串长度，防止内存爆炸
                        let new_length = result.len() - (actual_end - actual_start) + wrapped.len();
                        const MAX_RESULT_LENGTH: usize = 200_000; // 200KB
                        
                        if new_length > MAX_RESULT_LENGTH {
                            eprintln!("⚠️ 替换后字符串过长 ({} 字节)，跳过此替换", new_length);
                            continue;
                        }
                        
                        result.replace_range(actual_start..actual_end, &wrapped);
                        
                        // 更新 processed_ranges，使用实际的范围
                        if let Some(last_range) = processed_ranges.last_mut() {
                            *last_range = (actual_start, actual_end);
                        }
                    } else {
                        eprintln!("⚠️ 无效的范围: start={}, end={}, result_len={}", actual_start, actual_end, result.len());
                    }
                    
                    continue; // 跳过后续的格式标签检查
                }
                
                // 检查文本是否已经被格式标签包裹
                let wrapped = {
                    let trimmed = text_to_wrap.trim();
                    // 检查是否是完整的格式标签包裹：<em>text</em>, <strong>text</strong>, <u>text</u>
                    let em_pattern = Regex::new(r#"^<em([^>]*)>(.*)</em>$"#).ok();
                    let strong_pattern = Regex::new(r#"^<strong([^>]*)>(.*)</strong>$"#).ok();
                    let u_pattern = Regex::new(r#"^<u([^>]*)>(.*)</u>$"#).ok();
                    
                    // 检查是否是 <em> 标签
                    if let Some(re) = em_pattern {
                        if let Some(caps) = re.captures(trimmed) {
                            let inner_text = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                            // 如果运行有斜体，保留 <em> 标签，添加其他格式
                            if run.italic {
                                format!("<em><span style=\"{}\">{}</span></em>", style_str, inner_text)
                            } else {
                                // 如果运行没有斜体，移除 <em> 标签，只保留内容和其他格式
                                format!("<span style=\"{}\">{}</span>", style_str, inner_text)
                            }
                        } else {
                            // 匹配失败，使用纯文本（转义 HTML），避免 HTML 标签被显示为文本
                            let escaped_text = Self::escape_html(&plain_text);
                            format!("<span style=\"{}\">{}</span>", style_str, escaped_text)
                        }
                    }
                    // 检查是否是 <strong> 标签
                    else if let Some(re) = strong_pattern {
                        if let Some(caps) = re.captures(trimmed) {
                            let inner_text = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                            if run.bold {
                                format!("<strong><span style=\"{}\">{}</span></strong>", style_str, inner_text)
                            } else {
                                format!("<span style=\"{}\">{}</span>", style_str, inner_text)
                            }
                        } else {
                            // 匹配失败，使用纯文本（转义 HTML），避免 HTML 标签被显示为文本
                            let escaped_text = Self::escape_html(&plain_text);
                            format!("<span style=\"{}\">{}</span>", style_str, escaped_text)
                        }
                    }
                    // 检查是否是 <u> 标签
                    else if let Some(re) = u_pattern {
                        if let Some(caps) = re.captures(trimmed) {
                            let inner_text = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                            if run.underline {
                                format!("<u><span style=\"{}\">{}</span></u>", style_str, inner_text)
                            } else {
                                format!("<span style=\"{}\">{}</span>", style_str, inner_text)
                            }
                        } else {
                            // 匹配失败，使用纯文本（转义 HTML），避免 HTML 标签被显示为文本
                            let escaped_text = Self::escape_html(&plain_text);
                            format!("<span style=\"{}\">{}</span>", style_str, escaped_text)
                        }
                    }
                    // 不是格式标签，直接用 span 包裹
                    else {
                        // 使用纯文本（转义 HTML），避免 HTML 标签被显示为文本
                        let escaped_text = Self::escape_html(&plain_text);
                        let mut inner_content = escaped_text;
                        
                        // 如果运行有斜体，添加 <em>
                        if run.italic {
                            inner_content = format!("<em>{}</em>", inner_content);
                        }
                        // 如果运行有粗体，添加 <strong>
                        if run.bold {
                            inner_content = format!("<strong>{}</strong>", inner_content);
                        }
                        // 如果运行有下划线，添加 <u>
                        if run.underline {
                            inner_content = format!("<u>{}</u>", inner_content);
                        }
                        
                        format!("<span style=\"{}\">{}</span>", style_str, inner_content)
                    }
                };
                
                // 安全检查：确保范围有效，并且是有效的字符边界
                if actual_start < result.len() && actual_end <= result.len() && actual_start < actual_end {
                    // 验证字节索引是否在字符边界上
                    if !result.is_char_boundary(actual_start) || !result.is_char_boundary(actual_end) {
                        eprintln!("⚠️ 无效的字符边界: start={}, end={}", actual_start, actual_end);
                        // 尝试找到最近的字符边界
                        let safe_start = Self::find_char_boundary(&result, actual_start);
                        let safe_end = Self::find_char_boundary(&result, actual_end);
                        if safe_start < safe_end && safe_end <= result.len() {
                            actual_start = safe_start;
                            actual_end = safe_end;
                        } else {
                            eprintln!("⚠️ 无法找到安全的字符边界，跳过此替换");
                            continue;
                        }
                    }
                    
                    // 限制替换后的字符串长度，防止内存爆炸
                    let new_length = result.len() - (actual_end - actual_start) + wrapped.len();
                    const MAX_RESULT_LENGTH: usize = 200_000; // 200KB
                    
                    if new_length > MAX_RESULT_LENGTH {
                        eprintln!("⚠️ 替换后字符串过长 ({} 字节)，跳过此替换", new_length);
                        continue;
                    }
                    
                    result.replace_range(actual_start..actual_end, &wrapped);
                    
                    // 更新 processed_ranges，使用实际的范围
                    if let Some(last_range) = processed_ranges.last_mut() {
                        *last_range = (actual_start, actual_end);
                    }
                } else {
                    eprintln!("⚠️ 无效的范围: start={}, end={}, result_len={}", actual_start, actual_end, result.len());
                }
            }
        }
        
        Some(result)
    }
    
    /// 安全地获取字符串中指定字节位置的字符
    /// 返回 (字符, 字符的字节长度)
    fn safe_char_at(s: &str, byte_pos: usize) -> Option<(char, usize)> {
        if byte_pos >= s.len() {
            return None;
        }
        let remaining = &s[byte_pos..];
        if let Some(ch) = remaining.chars().next() {
            let ch_len = ch.len_utf8();
            Some((ch, ch_len))
        } else {
            None
        }
    }
    
    /// 找到指定字节位置最近的字符边界（向前查找）
    fn find_char_boundary(s: &str, byte_pos: usize) -> usize {
        if byte_pos >= s.len() {
            return s.len();
        }
        if s.is_char_boundary(byte_pos) {
            return byte_pos;
        }
        // 向前查找最近的字符边界（最多向前查找 4 个字节，因为 UTF-8 字符最多 4 字节）
        for i in 1..=4 {
            if byte_pos >= i && s.is_char_boundary(byte_pos - i) {
                return byte_pos - i;
            }
        }
        // 如果找不到，返回 0
        0
    }
    
    /// 从 HTML 中提取纯文本（去除所有标签）
    /// 根本修复：彻底清理所有 HTML 代码片段，包括不完整的标签和属性
    fn extract_text_from_html(html: &str) -> String {
        use regex::Regex;
        
        // 第一步：去除所有完整的 HTML 标签：<tag> 或 <tag attr="...">
        let re_tags = Regex::new(r"<[^>]+>").unwrap();
        let mut text = re_tags.replace_all(html, "").to_string();
        
        // 第二步：处理不完整的 HTML 标签片段（如 `style="...">` 或 `">`）
        // 这些可能是由于范围计算错误导致的
        let re_incomplete = Regex::new(r#"[a-zA-Z-]+="[^"]*">"#).unwrap();
        text = re_incomplete.replace_all(&text, "").to_string();
        
        // 第三步：处理所有 HTML 实体
        text = text.replace("&amp;quot;", "").replace("&quot;", "")
            .replace("&amp;", "").replace("&lt;", "").replace("&gt;", "")
            .replace("&apos;", "");
        
        // 第四步：处理所有样式属性片段（更严格的匹配）
        // 匹配：color: #FF0000; font-weight: bold; font-style: italic 等
        let re_style_fragment = Regex::new(r#"(color|font-weight|font-style|font-size|text-align|text-decoration|font-family|background-color|text-decoration-line|text-decoration-style|text-decoration-color|vertical-align|letter-spacing|word-spacing|line-height|text-indent|margin|padding|border|width|height|display|position|float|clear|overflow|z-index|opacity|visibility|white-space|word-wrap|word-break|text-overflow|text-transform|text-shadow|box-shadow|transform|transition|animation):\s*[^;"]*[;"]?"#).unwrap();
        text = re_style_fragment.replace_all(&text, "").to_string();
        
        // 第五步：处理所有颜色代码片段（更严格的匹配）
        // 匹配：#FF0000, #FF0000;, #FF0000", rgb(255,0,0), rgba(255,0,0,1) 等
        let re_color = Regex::new(r#"#?[0-9A-Fa-f]{3,8}[;:"]?|rgb\([^)]*\)|rgba\([^)]*\)|hsl\([^)]*\)|hsla\([^)]*\)"#).unwrap();
        text = re_color.replace_all(&text, "").to_string();
        
        // 第六步：处理所有可能的标签片段字符
        // 去除所有可能来自 HTML 标签的字符
        text = text.replace("\">", "").replace("'>", "").replace(">", "")
            .replace("<", "").replace("=", "").replace(";", "")
            .replace(":", "").replace("\"", "").replace("'", "");
        
        // 第七步：处理可能的单词片段（如 "font-s", "spantyle", "italicorlor", "olor" 等）
        // 这些可能是由于范围计算错误，包含了 HTML 属性的一部分
        let re_word_fragments = Regex::new(r#"\b(font|style|span|color|weight|size|align|decoration|italic|bold|underline|normal|inherit|initial|unset|transparent|auto|none|solid|dashed|dotted|double|groove|ridge|inset|outset|left|right|center|justify|start|end|baseline|top|middle|bottom|sub|super|text-top|text-bottom|block|inline|inline-block|flex|grid|table|list-item|run-in|table-row-group|table-header-group|table-footer-group|table-row|table-cell|table-column-group|table-column|table-caption|inherit|initial|unset|normal|bold|bolder|lighter|100|200|300|400|500|600|700|800|900|italic|oblique|normal|small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps)\w*\b"#).unwrap();
        text = re_word_fragments.replace_all(&text, "").to_string();
        
        // 第八步：清理多余的空格和空白字符
        let re_whitespace = Regex::new(r"\s+").unwrap();
        text = re_whitespace.replace_all(&text, " ").to_string();
        
        // 第九步：去除首尾空白
        text.trim().to_string()
    }
    
    /// 使用顺序拼接策略应用运行格式
    fn apply_run_formatting_with_concatenation(runs: &[RunFormatting]) -> String {
        let mut new_content = String::new();
        
        for (idx, run) in runs.iter().enumerate() {
            if run.text.is_empty() {
                continue;
            }
            
            // 如果运行有格式，创建 <span> 标签
            if run.has_formatting() {
                let style_str = run.build_style_string();
                let escaped_text = Self::escape_html(&run.text);
                
                // 检查是否需要保留粗体、斜体、下划线标签
                let mut inner_content = escaped_text.clone();
                if run.bold {
                    inner_content = format!("<strong>{}</strong>", inner_content);
                }
                if run.italic {
                    inner_content = format!("<em>{}</em>", inner_content);
                }
                if run.underline {
                    inner_content = format!("<u>{}</u>", inner_content);
                }
                
                let span_tag = format!("<span style=\"{}\">{}</span>", style_str, inner_content);
                new_content.push_str(&span_tag);
            } else {
                // 没有格式，直接添加文本
                let escaped_text = Self::escape_html(&run.text);
                new_content.push_str(&escaped_text);
            }
        }
        
        new_content
    }
    
    /// 转义 HTML 特殊字符
    fn escape_html(text: &str) -> String {
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&apos;")
    }
    
    /// 查找段落元素（支持模糊匹配）
    fn find_paragraph_elements(html: &str) -> Vec<(usize, usize, usize)> {
        use regex::Regex;
        let mut elements = Vec::new();
        
        // 查找所有段落和标题元素的开始标签
        let tag_pattern = r#"<(h[1-6]|p)([^>]*)>"#;
        let tag_re = Regex::new(tag_pattern).unwrap();
        
        for tag_match in tag_re.find_iter(html) {
            let tag_start = tag_match.start();
            let tag_full = tag_match.as_str();
            
            // 提取标签名（h1, h2, ..., h6, 或 p）
            let tag_name = if tag_full.starts_with("<p") {
                "p"
            } else if tag_full.starts_with("<h1") {
                "h1"
            } else if tag_full.starts_with("<h2") {
                "h2"
            } else if tag_full.starts_with("<h3") {
                "h3"
            } else if tag_full.starts_with("<h4") {
                "h4"
            } else if tag_full.starts_with("<h5") {
                "h5"
            } else if tag_full.starts_with("<h6") {
                "h6"
            } else {
                continue;
            };
            
            // 找到开始标签的结束位置
            if let Some(tag_end_offset) = html[tag_start..].find('>') {
                let content_start = tag_start + tag_end_offset + 1;
                
                // 查找对应的结束标签
                let closing_tag = format!("</{}>", tag_name);
                
                if let Some(closing_pos) = html[content_start..].find(&closing_tag) {
                    let content_end = content_start + closing_pos;
                    elements.push((tag_start, content_start, content_end));
                }
            }
        }
        
        elements
    }
    
    /// 计算文本相似度（改进的算法：支持部分匹配和字符顺序）
    fn text_similarity(text1: &str, text2: &str) -> f64 {
        if text1 == text2 {
            return 1.0;
        }
        
        let len1 = text1.chars().count();
        let len2 = text2.chars().count();
        
        if len1 == 0 || len2 == 0 {
            return 0.0;
        }
        
        // 策略1：如果一个是另一个的子串，返回较高的相似度
        if text1.contains(text2) || text2.contains(text1) {
            let min_len = len1.min(len2);
            let max_len = len1.max(len2);
            return min_len as f64 / max_len as f64;
        }
        
        // 策略2：使用简单的字符匹配率（考虑顺序）
        let common_chars = text1.chars()
            .zip(text2.chars())
            .filter(|(a, b)| a == b)
            .count();
        
        let max_len = len1.max(len2);
        let base_similarity = common_chars as f64 / max_len as f64;
        
        // 策略3：如果文本长度相近，提高相似度
        let length_ratio = len1.min(len2) as f64 / len1.max(len2) as f64;
        
        // 综合相似度：基础相似度 * 长度比例
        base_similarity * 0.7 + length_ratio * 0.3
    }
    
    /// 预览模式：DOCX → HTML 转换
    /// 
    /// 参数：
    /// - docx_path: DOCX 文件路径
    /// - output_dir: 输出目录（用于提取图片）
    /// - app_handle: Tauri AppHandle（用于发送进度事件）
    /// 
    /// 返回：
    /// - HTML 内容字符串
    /// - 错误信息
    pub async fn convert_docx_to_html_preview(
        &self,
        docx_path: &Path,
        output_dir: &Path,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<String, String> {
        use crate::services::preview_service::PreviewProgressEvent;
        use tauri::Emitter;
        
        // 1. 检查 Pandoc 可用性
        let pandoc_path = self.pandoc_path.as_ref()
            .ok_or_else(|| "Pandoc 不可用".to_string())?;
        
        // 2. 检查文件大小（50MB 限制）
        let file_size = std::fs::metadata(docx_path)
            .map_err(|e| format!("无法读取文件: {}", e))?
            .len();
        
        if file_size > 50 * 1024 * 1024 {
            return Err(format!("文件过大（{}MB），预览功能支持最大 50MB 文件", file_size / 1024 / 1024));
        }
        
        // 3. 检查磁盘空间（需要至少 2 倍文件大小的可用空间）
        let output_dir_metadata = std::fs::metadata(output_dir.parent().unwrap_or(output_dir))
            .ok();
        
        // 注意：跨平台磁盘空间检查较复杂，这里简化处理
        // 实际实现可以使用 sysinfo 或其他库检查可用空间
        
        // 4. 发送开始转换事件（添加错误处理）
        if let Some(handle) = &app_handle {
            if let Err(e) = handle.emit("preview-progress", PreviewProgressEvent {
                status: "started".to_string(),
                progress: 0,
                message: "正在预览".to_string(),
            }) {
                eprintln!("发送预览进度事件失败: {}", e);
            }
        }
        
        // 5. 创建输出目录
        std::fs::create_dir_all(output_dir)
            .map_err(|e| format!("创建输出目录失败: {}", e))?;
        
        // 6. 构建 Pandoc 命令（必须包含格式保留参数）
        // 注意：不设置 --metadata title，避免在 body 中生成标题
        // 如果原文档没有标题，就不应该显示标题
        let mut cmd = Command::new(pandoc_path);
        cmd.arg(docx_path)
            .arg("--from")
            .arg("docx+styles")  // 必须：启用样式扩展以保留 DOCX 样式信息
            .arg("--to")
            .arg("html+raw_html+native_divs+native_spans")
            .arg("--standalone")
            .arg("--wrap=none")
            .arg("--extract-media")
            .arg(output_dir)
            .arg("--css")
            .arg("") // 空 CSS，使用内联样式
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        
        // 必须：添加 Lua 过滤器（如果存在）
        if let Some(lua_filter) = Self::get_lua_filter_path() {
            eprintln!("✅ [预览日志] 使用 Lua 过滤器: {:?}", lua_filter);
            cmd.arg("--lua-filter").arg(lua_filter);
        } else {
            eprintln!("⚠️ [预览日志] 未找到 Lua 过滤器，格式保留可能不完整");
        }
        
        // 7. 执行命令（带超时：30 秒）
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            tokio::task::spawn_blocking(move || cmd.output())
        ).await
            .map_err(|_| "转换超时（30 秒）".to_string())?
            .map_err(|e| format!("执行失败: {}", e))?
            .map_err(|e| format!("Pandoc 执行失败: {}", e))?;
        
        // 8. 检查执行结果
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            eprintln!("❌ [预览日志] Pandoc 转换失败");
            eprintln!("   - 状态码: {:?}", output.status.code());
            eprintln!("   - STDERR: {}", error);
            eprintln!("   - STDOUT: {}", stdout);
            
            // 发送失败事件（添加错误处理）
            if let Some(handle) = &app_handle {
                if let Err(e) = handle.emit("preview-progress", PreviewProgressEvent {
                    status: "failed".to_string(),
                    progress: 0,
                    message: format!("转换失败: {}", error),
                }) {
                    eprintln!("发送预览失败事件失败: {}", e);
                }
            }
            
            return Err(format!("Pandoc 转换失败: {}\nSTDOUT: {}", error, stdout));
        }
        
        // 9. 读取 HTML 内容
        let html_content = String::from_utf8(output.stdout)
            .map_err(|e| format!("读取转换结果失败: {}", e))?;
        
        // 读取 stderr（可能包含 Lua 过滤器的日志）
        let stderr_content = String::from_utf8_lossy(&output.stderr);
        if !stderr_content.trim().is_empty() {
            eprintln!("📋 [预览日志] Pandoc STDERR 输出（包含 Lua 过滤器日志）:");
            for line in stderr_content.lines() {
                eprintln!("   {}", line);
            }
        }
        
        eprintln!("📄 [预览日志] Pandoc 转换完成");
        eprintln!("   - HTML 内容长度: {} 字节", html_content.len());
        eprintln!("   - 输出目录: {:?}", output_dir);
        
        // 检查输出是否为空
        if html_content.trim().is_empty() {
            let error_msg = "Pandoc 转换成功但输出为空，文件可能已损坏或格式不支持";
            
            if let Some(handle) = &app_handle {
                if let Err(e) = handle.emit("preview-progress", PreviewProgressEvent {
                    status: "failed".to_string(),
                    progress: 0,
                    message: error_msg.to_string(),
                }) {
                    eprintln!("发送预览失败事件失败: {}", e);
                }
            }
            
            return Err(error_msg.to_string());
        }
        
        // 诊断：检查 Pandoc 输出的关键信息
        let has_body = html_content.contains("<body");
        let has_style = html_content.contains("<style");
        let img_count = html_content.matches("<img").count();
        let p_count = html_content.matches("<p").count();
        let div_count = html_content.matches("<div").count();
        
        eprintln!("📊 [预览日志] Pandoc 输出诊断:");
        eprintln!("   - 包含 <body>: {}", has_body);
        eprintln!("   - 包含 <style>: {}", has_style);
        eprintln!("   - 图片数量: {}", img_count);
        eprintln!("   - 段落数量: {}", p_count);
        eprintln!("   - div 数量: {}", div_count);
        eprintln!("   - HTML 预览（前500字符）: {}", &html_content.chars().take(500).collect::<String>());
        
        // 9. 格式保留机制（必须步骤，用于保留颜色、对齐、行距等格式）
        // 预览方案：Pandoc + docx+styles + Lua 过滤器 + 格式提取 + CSS 类转换 + 格式应用
        eprintln!("🎨 [预览日志] 开始格式保留处理...");
        
        // 9.1 提取 DOCX 格式信息（复用编辑模式的格式提取方法）
        // 注意：如果格式提取失败，返回空 Vec，后续格式应用会跳过
        let docx_formatting = Self::extract_docx_formatting(docx_path);
        eprintln!("   - 格式提取完成，段落数: {}", docx_formatting.len());
        
        // 9.2 转换 CSS 类为内联样式（复用编辑模式的 CSS 转换方法）
        let html_with_inline_styles = Self::convert_css_classes_to_inline_styles(&html_content);
        eprintln!("   - CSS 类转换完成");
        
        // 9.3 应用格式信息到 HTML（复用编辑模式的格式应用方法）
        // 注意：格式应用总是成功（返回 String），如果格式提取失败（空 Vec），则不会应用任何格式
        let html_with_formatting = Self::apply_docx_formatting(&html_with_inline_styles, &docx_formatting);
        eprintln!("   - 格式应用完成");
        
        // 10. 后处理 HTML（图片路径处理、文本框处理、样式增强）
        eprintln!("🔧 [预览日志] 开始后处理 HTML...");
        let processed_html = self.post_process_preview_html(&html_with_formatting, output_dir, docx_path, app_handle.as_ref())?;
        
        eprintln!("✅ [预览日志] 后处理完成");
        eprintln!("   - 处理后 HTML 长度: {} 字节", processed_html.len());
        eprintln!("   - 长度变化: {} 字节", processed_html.len() as i64 - html_content.len() as i64);
        
        // 11. 发送完成事件（添加错误处理）
        if let Some(handle) = &app_handle {
            if let Err(e) = handle.emit("preview-progress", PreviewProgressEvent {
                status: "completed".to_string(),
                progress: 100,
                message: "预览完成".to_string(),
            }) {
                eprintln!("发送预览完成事件失败: {}", e);
            }
        }
        
        Ok(processed_html)
    }
    
    /// 后处理预览 HTML（已废弃，预览模式现在使用 PDF）
    /// 
    /// 此函数已不再使用，保留仅用于参考
    #[allow(dead_code)]
    fn post_process_preview_html(
        &self,
        html: &str,
        media_dir: &Path,
        docx_path: &Path,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<String, String> {
        use regex::Regex;
        use crate::services::textbox_service::TextBoxService;
        
        let mut processed = html.to_string();
        
        // 0. 移除 Pandoc 自动生成的标题（如果存在）
        // Pandoc 使用 --metadata title 时，可能会在 body 开头自动添加 <h1> 标题
        // 注意：只移除 body 开头的第一个 <h1>，避免误删文档原有的标题
        eprintln!("📝 [后处理日志] 步骤 0: 移除自动生成的标题");
        let body_pattern = Regex::new(r#"<body[^>]*>([\s\S]*?)"#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        if let Some(body_cap) = body_pattern.captures(&processed) {
            let body_start = body_cap.get(0).unwrap().end();
            let body_content = body_cap.get(1).map(|m| m.as_str()).unwrap_or("");
            
            // 检查 body 开头是否有 <h1> 标签（可能是 Pandoc 自动生成的标题）
            let h1_pattern = Regex::new(r#"^\s*<h1[^>]*>[\s\S]*?</h1>\s*"#)
                .map_err(|e| format!("正则表达式错误: {}", e))?;
            
            if h1_pattern.is_match(body_content) {
                // 找到 body 标签的结束位置
                let body_tag_end = processed.find("</body>").unwrap_or(processed.len());
                let body_content_start = body_start;
                
                // 在 body 内容中查找第一个 <h1> 的位置
                if let Some(h1_match) = h1_pattern.find(body_content) {
                    let h1_start = body_content_start + h1_match.start();
                    let h1_end = body_content_start + h1_match.end();
                    
                    // 移除这个 <h1> 标签
                    processed.replace_range(h1_start..h1_end, "");
                    eprintln!("   - 已移除 body 开头的自动生成标题（减少 {} 字节）", h1_end - h1_start);
                }
            } else {
                eprintln!("   - 未发现 body 开头的自动生成标题");
            }
        } else {
            eprintln!("   - 未找到 <body> 标签，跳过标题移除");
        }
        
        eprintln!("📝 [后处理日志] 步骤 1: 处理图片路径");
        eprintln!("   - 原始 HTML 长度: {} 字节", processed.len());
        
        // 1. 处理图片路径（使用 ImageService）
        // Pandoc 提取的图片路径可能是相对路径，需要转换为绝对路径或 base64
        use crate::services::image_service::ImageService;
        
        // 获取工作区根目录（从 DOCX 文件路径推导）
        let workspace_root = docx_path.parent()
            .ok_or_else(|| "无法获取文件目录".to_string())?;
        
        eprintln!("   - 工作区根目录: {:?}", workspace_root);
        eprintln!("   - 媒体目录: {:?}", media_dir);
        
        let image_service = ImageService;
        let img_pattern = Regex::new(r#"<img\s+([^>]*src=["'])([^"']+)(["'][^>]*)>"#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let mut img_processed_count = 0;
        let mut img_base64_count = 0;
        let mut img_file_count = 0;
        let mut img_error_count = 0;
        
        processed = img_pattern.replace_all(&processed, |caps: &regex::Captures| {
            img_processed_count += 1;
            let prefix = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let src = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let suffix = caps.get(3).map(|m| m.as_str()).unwrap_or("");
            
            // 如果是相对路径，使用 ImageService 处理
            let new_src = if src.starts_with("http://") || src.starts_with("https://") || src.starts_with("data:") {
                eprintln!("   - 图片 {}: 已处理（HTTP/HTTPS/data URL）", img_processed_count);
                src.to_string()
            } else if src.starts_with("/") {
                eprintln!("   - 图片 {}: 已处理（绝对路径）", img_processed_count);
                src.to_string() // 已经是绝对路径
            } else {
                // 相对路径，使用 ImageService 处理
                let img_path = media_dir.join(src);
                eprintln!("   - 图片 {}: 原始路径: {:?}", img_processed_count, src);
                eprintln!("   - 图片 {}: 完整路径: {:?}", img_processed_count, img_path);
                eprintln!("   - 图片 {}: 文件存在: {}", img_processed_count, img_path.exists());
                
                if img_path.exists() {
                    // 使用 ImageService 处理图片（小图片 base64，大图片复制到 preview_media/）
                    match image_service.process_preview_image(&img_path, workspace_root) {
                        Ok(processed_src) => {
                            if processed_src.starts_with("data:") {
                                img_base64_count += 1;
                                eprintln!("   - 图片 {}: 转换为 base64", img_processed_count);
                            } else {
                                img_file_count += 1;
                                eprintln!("   - 图片 {}: 使用文件路径: {}", img_processed_count, processed_src);
                            }
                            processed_src
                        }
                        Err(e) => {
                            img_error_count += 1;
                            eprintln!("   - 图片 {}: 处理失败: {}", img_processed_count, e);
                            // 处理失败，保持原路径
                            src.to_string()
                        }
                    }
                } else {
                    img_error_count += 1;
                    eprintln!("   - 图片 {}: 文件不存在，保持原路径", img_processed_count);
                    // 文件不存在，保持原路径（可能在其他位置）
                    src.to_string()
                }
            };
            
            format!("<img {}src=\"{}\"{}>", prefix, new_src, suffix)
        }).to_string();
        
        eprintln!("   - 图片处理完成: 总计 {} 个，base64 {} 个，文件路径 {} 个，错误 {} 个", 
                 img_processed_count, img_base64_count, img_file_count, img_error_count);
        
        // 2. 提取文本框信息
        eprintln!("📝 [后处理日志] 步骤 2: 提取文本框信息");
        let textboxes = match TextBoxService::extract_textboxes(docx_path) {
            Ok(tb) => {
                eprintln!("   - 找到 {} 个文本框", tb.len());
                for (i, tb) in tb.iter().enumerate() {
                    eprintln!("   - 文本框 {}: ID={}, 位置=({:.2}, {:.2}), 大小=({:.2}x{:.2}), 内容长度={}",
                             i + 1, tb.id, tb.left, tb.top, tb.width, tb.height, tb.content.len());
                }
                tb
            }
            Err(e) => {
                eprintln!("   - 提取文本框失败: {}", e);
                Vec::new() // 失败时继续处理，不影响其他功能
            }
        };
        
        // 3. 提取并应用分栏样式（在文本框之前，应用到 .word-page 容器）
        // 注意：分栏样式应用在 .word-page 上，文本框是绝对定位不受影响
        eprintln!("📝 [后处理日志] 步骤 3: 提取并应用分栏样式");
        match self.extract_column_info(docx_path) {
            Ok(Some(cols)) => {
                eprintln!("   - 找到分栏信息: 列数={}, 列间距={:.2}px, 分隔线={}, 等宽={}",
                         cols.column_count, cols.column_gap, cols.separator, cols.equal_width);
                processed = self.apply_columns_to_html(&processed, &cols)?;
                eprintln!("   - 分栏样式已应用");
            }
            Ok(None) => {
                eprintln!("   - 没有分栏信息（单栏）");
                // 没有分栏信息，继续处理
            }
            Err(e) => {
                eprintln!("   - 提取分栏信息失败: {}，继续处理", e);
                // 继续处理，不影响其他功能
            }
        }
        
        // 4. 增强样式（模拟 Word 页面效果）
        eprintln!("📝 [后处理日志] 步骤 4: 增强 Word 页面样式");
        processed = self.enhance_word_page_style(&processed)?;
        eprintln!("   - Word 页面样式已添加");
        
        // 5. 添加暗色模式支持（使用应用主题系统）
        eprintln!("📝 [后处理日志] 步骤 5: 添加暗色模式支持");
        processed = self.add_dark_mode_support(&processed, app_handle)?;
        eprintln!("   - 暗色模式支持已添加");
        
        // 6. 添加页面标记（用于页码和跳转）
        // 注意：Pandoc 不会生成 .word-page 元素，需要通过后处理添加
        eprintln!("📝 [后处理日志] 步骤 6: 添加页面标记");
        let page_count_before = processed.matches("word-page").count();
        processed = self.add_page_markers(&processed)?;
        let page_count_after = processed.matches("word-page").count();
        eprintln!("   - 页面标记: 之前 {} 个，之后 {} 个", page_count_before, page_count_after);
        
        // 7. 从 Pandoc 生成的 HTML 中移除文本框内容（避免重复显示）
        // 使用更精确的匹配算法
        if !textboxes.is_empty() {
            eprintln!("📝 [后处理日志] 步骤 7: 移除重复的文本框内容");
            eprintln!("   - 需要移除 {} 个文本框的内容", textboxes.len());
            let html_before_remove = processed.len();
            let p_count_before = processed.matches("<p").count();
            processed = self.remove_textbox_content_from_html(&processed, &textboxes)?;
            let html_after_remove = processed.len();
            let p_count_after = processed.matches("<p").count();
            eprintln!("   - 移除前: {} 字节, {} 个段落", html_before_remove, p_count_before);
            eprintln!("   - 移除后: {} 字节, {} 个段落", html_after_remove, p_count_after);
            eprintln!("   - 减少: {} 字节, {} 个段落", 
                     html_before_remove - html_after_remove, p_count_before - p_count_after);
        } else {
            eprintln!("📝 [后处理日志] 步骤 7: 跳过（无文本框）");
        }
        
        // 8. 插入文本框（使用绝对定位）
        if !textboxes.is_empty() {
            eprintln!("📝 [后处理日志] 步骤 8: 插入文本框");
            let html_before_insert = processed.len();
            processed = self.insert_textboxes(&processed, &textboxes)?;
            let html_after_insert = processed.len();
            eprintln!("   - 插入前长度: {} 字节", html_before_insert);
            eprintln!("   - 插入后长度: {} 字节", html_after_insert);
            eprintln!("   - 增加: {} 字节", html_after_insert - html_before_insert);
            eprintln!("   - 已插入 {} 个文本框", textboxes.len());
            eprintln!("   - 包含 textbox-container: {}", processed.contains("textbox-container"));
        } else {
            eprintln!("📝 [后处理日志] 步骤 8: 跳过（无文本框）");
        }
        
        // 最终诊断
        eprintln!("📊 [后处理日志] 最终 HTML 诊断:");
        eprintln!("   - 最终长度: {} 字节", processed.len());
        eprintln!("   - 包含 .word-page: {}", processed.contains("word-page"));
        eprintln!("   - 包含 textbox-container: {}", processed.contains("textbox-container"));
        eprintln!("   - 包含 word-page-style: {}", processed.contains("word-page-style"));
        eprintln!("   - 包含 dark-mode-style: {}", processed.contains("dark-mode-style"));
        eprintln!("   - 包含 column-count: {}", processed.contains("column-count"));
        
        Ok(processed)
    }
    
    /// 从 HTML 中移除已转换的文本框内容（已废弃）
    #[allow(dead_code)]
    fn remove_textbox_content_from_html(
        &self,
        html: &str,
        textboxes: &[crate::services::textbox_service::TextBoxInfo],
    ) -> Result<String, String> {
        // Pandoc 会将文本框内容转换为普通段落
        // 我们需要识别并移除这些段落，避免与绝对定位的文本框重复显示
        // 使用更精确的匹配算法：结合文本内容和结构特征
        
        let mut processed = html.to_string();
        
        for textbox in textboxes {
            // 方法1：提取文本框的完整文本内容（去除 HTML 标签）
            let textbox_text = Self::extract_text_from_html(&textbox.content);
            
            if textbox_text.trim().is_empty() || textbox_text.len() < 3 {
                continue;
            }
            
            // 方法2：提取文本框的 HTML 结构特征（段落数量、格式等）
            let textbox_paragraphs: Vec<String> = textbox.content
                .split("</p>")
                .filter(|s| !s.trim().is_empty())
                .map(|s| Self::extract_text_from_html(s))
                .collect();
            
            // 方法3：使用更精确的正则表达式匹配
            // 匹配包含文本框文本的段落，考虑可能的格式差异
            use regex::Regex;
            
            // 尝试匹配完整的段落结构
            for para_text in &textbox_paragraphs {
                if para_text.trim().is_empty() {
                    continue;
                }
                
                // 转义特殊字符
                let escaped_text = regex::escape(para_text.trim());
                
                // 匹配包含该文本的段落（考虑可能的空白字符差异）
                let pattern = format!(
                    r#"<p[^>]*>[\s\S]*?{}[\s\S]*?</p>"#,
                    escaped_text.replace(r"\s+", r"\s+")
                );
                
                if let Ok(re) = Regex::new(&pattern) {
                    processed = re.replace_all(&processed, "").to_string();
                }
            }
            
            // 方法4：如果文本匹配失败，尝试匹配部分文本（容错处理）
            if textbox_text.len() > 20 {
                // 安全截取：使用字符迭代器避免 UTF-8 字符边界问题
                let partial_text: String = textbox_text.chars().take(20).collect();
                let escaped_partial = regex::escape(&partial_text);
                let pattern = format!(
                    r#"<p[^>]*>[\s\S]*?{}[\s\S]*?</p>"#,
                    escaped_partial
                );
                
                if let Ok(re) = Regex::new(&pattern) {
                    // 只移除第一个匹配（避免误删）
                    if let Some(first_match) = re.find(&processed) {
                        let start = first_match.start();
                        let end = first_match.end();
                        processed.replace_range(start..end, "");
                    }
                }
            }
        }
        
        Ok(processed)
    }
    
    
    /// 在 HTML 中插入文本框（已废弃）
    #[allow(dead_code)]
    fn insert_textboxes(
        &self,
        html: &str,
        textboxes: &[crate::services::textbox_service::TextBoxInfo],
    ) -> Result<String, String> {
        use crate::services::textbox_service::TextBoxService;
        
        // 生成文本框 HTML
        let textbox_html: Vec<String> = textboxes.iter()
            .map(|tb| TextBoxService::textbox_to_html(tb))
            .collect();
        
        let textbox_container = format!(
            r#"<div class="textbox-container" style="position: relative; width: 100%; min-height: 100%;">{}</div>"#,
            textbox_html.join("\n")
        );
        
        // 在 </body> 之前插入文本框容器
        if let Some(pos) = html.find("</body>") {
            let mut result = html.to_string();
            result.insert_str(pos, &textbox_container);
            Ok(result)
        } else {
            // 如果没有 </body>，在末尾添加
            Ok(format!("{}{}", html, textbox_container))
        }
    }
    
    /// 增强 Word 页面样式（已废弃）
    #[allow(dead_code)]
    fn enhance_word_page_style(&self, html: &str) -> Result<String, String> {
        // 在 <style> 标签中添加 Word 页面样式
        let page_style = r#"
        <style id="word-page-style">
          body {
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
            font-family: 'Times New Roman', '宋体', serif;
          }
          .word-page {
            background-color: white;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto 20px auto;
            padding: 25.4mm 31.8mm;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            page-break-after: always;
          }
          .word-page:last-child {
            page-break-after: auto;
          }
          @media print {
            body {
              background-color: white;
              padding: 0;
            }
            .word-page {
              margin: 0;
              box-shadow: none;
              page-break-after: always;
            }
          }
        </style>
        "#;
        
        // 在 </head> 之前插入样式
        if let Some(pos) = html.find("</head>") {
            let mut result = html.to_string();
            result.insert_str(pos, page_style);
            eprintln!("   - Word 页面样式已插入到 </head> 之前");
            Ok(result)
        } else {
            eprintln!("   - 警告: 未找到 </head>，在开头添加样式");
            // 如果没有 </head>，在开头添加
            Ok(format!("<html><head>{}</head>{}", page_style, html))
        }
    }
    
    /// 添加暗色模式支持（已废弃）
    #[allow(dead_code)]
    fn add_dark_mode_support(
        &self,
        html: &str,
        _app_handle: Option<&tauri::AppHandle>,
    ) -> Result<String, String> {
        // 使用应用主题系统，通过 data-theme 属性或类名控制
        // 前端会通过 iframe 的父窗口获取主题信息
        let dark_mode_style = r#"
        <style id="dark-mode-style">
          /* 默认浅色模式样式 */
          body {
            background-color: #f5f5f5;
            color: #000;
          }
          .word-page {
            background-color: white;
            color: #000;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          
          /* 暗色模式样式（通过父窗口主题控制） */
          body[data-theme="dark"],
          body.dark,
          html[data-theme="dark"] body,
          html.dark body {
            background-color: #1a1a1a;
            color: #e0e0e0;
          }
          body[data-theme="dark"] .word-page,
          body.dark .word-page,
          html[data-theme="dark"] .word-page,
          html.dark .word-page {
            background-color: #2d2d2d;
            color: #e0e0e0;
            box-shadow: 0 0 10px rgba(255,255,255,0.1);
          }
          body[data-theme="dark"] a,
          body.dark a,
          html[data-theme="dark"] a,
          html.dark a {
            color: #4a9eff;
          }
          body[data-theme="dark"] table,
          body.dark table,
          html[data-theme="dark"] table,
          html.dark table {
            border-color: #555;
          }
          body[data-theme="dark"] th,
          body[data-theme="dark"] td,
          body.dark th,
          body.dark td,
          html[data-theme="dark"] th,
          html[data-theme="dark"] td,
          html.dark th,
          html.dark td {
            border-color: #555;
          }
        </style>
        <script>
          // 从父窗口同步主题
          (function() {
            try {
              if (window.parent && window.parent !== window) {
                const parentDoc = window.parent.document;
                const parentHtml = parentDoc.documentElement;
                const parentBody = parentDoc.body;
                
                // 检测父窗口的主题
                const isDark = parentHtml.classList.contains('dark') ||
                              parentHtml.getAttribute('data-theme') === 'dark' ||
                              parentBody.classList.contains('dark') ||
                              parentBody.getAttribute('data-theme') === 'dark' ||
                              window.getComputedStyle(parentBody).colorScheme === 'dark';
                
                // 应用主题到当前文档
                if (isDark) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.body.setAttribute('data-theme', 'dark');
                }
                
                // 监听父窗口主题变化
                const observer = new MutationObserver(function(mutations) {
                  const isDarkNow = parentHtml.classList.contains('dark') ||
                                   parentHtml.getAttribute('data-theme') === 'dark' ||
                                   parentBody.classList.contains('dark') ||
                                   parentBody.getAttribute('data-theme') === 'dark';
                  
                  if (isDarkNow) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.body.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.removeAttribute('data-theme');
                    document.body.removeAttribute('data-theme');
                  }
                });
                
                observer.observe(parentHtml, {
                  attributes: true,
                  attributeFilter: ['class', 'data-theme']
                });
                observer.observe(parentBody, {
                  attributes: true,
                  attributeFilter: ['class', 'data-theme']
                });
              }
            } catch (e) {
              // 跨域限制时，使用系统偏好
              if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
                document.body.setAttribute('data-theme', 'dark');
              }
            }
          })();
        </script>
        "#;
        
        if let Some(pos) = html.find("</head>") {
            let mut result = html.to_string();
            result.insert_str(pos, dark_mode_style);
            Ok(result)
        } else {
            Ok(format!("<html><head>{}</head>{}", dark_mode_style, html))
        }
    }
    
    /// 添加页面标记（用于页码和跳转）
    /// 
    /// 注意：Pandoc 不会自动生成 .word-page 元素
    /// 策略：通过后处理将内容分割为页面，每个页面包装在 .word-page 容器中
    #[allow(dead_code)]
    fn add_page_markers(&self, html: &str) -> Result<String, String> {
        use regex::Regex;
        
        eprintln!("   - 开始添加页面标记");
        
        // 策略1：如果 HTML 中已有 .word-page 元素，直接添加 data-page 属性
        let page_pattern = Regex::new(r#"<div\s+class=["']word-page["']"#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        if page_pattern.is_match(html) {
            eprintln!("   - 发现已有的 .word-page 元素，添加 data-page 属性");
            // 已有 .word-page 元素，添加 data-page 属性
            let mut page_num = 1;
            let processed = page_pattern.replace_all(html, |_caps: &regex::Captures| {
                let marker = format!("<div class=\"word-page\" data-page=\"{}\"", page_num);
                page_num += 1;
                marker
            });
            let page_count = page_num - 1;
            eprintln!("   - 已标记 {} 个页面", page_count);
            return Ok(processed.to_string());
        }
        
        eprintln!("   - 未找到 .word-page 元素，尝试包装 body 内容");
        
        // 策略2：Pandoc 没有生成 .word-page，需要通过后处理添加
        // 将 body 内容按页面高度（297mm）分割，每个页面包装在 .word-page 中
        let body_pattern = Regex::new(r#"<body[^>]*>([\s\S]*?)</body>"#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let processed = body_pattern.replace(html, |caps: &regex::Captures| {
            let body_content = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let body_attrs = html.find("<body").and_then(|start| {
                html[start..].find(">").map(|end| &html[start..start+end+1])
            }).unwrap_or("<body>");
            
            // 将内容包装在 .word-page 容器中
            // 注意：这里简化处理，实际应该根据内容高度智能分页
            let page_wrapped = format!(
                r#"{}<div class="word-page" data-page="1">{}</div></body>"#,
                body_attrs, body_content
            );
            
            page_wrapped
        });
        
        Ok(processed.to_string())
    }
    
    /// 从 DOCX 提取分栏信息
    /// 
    /// 提取分栏信息（已废弃）
    #[allow(dead_code)]
    fn extract_column_info(&self, docx_path: &Path) -> Result<Option<crate::services::column_service::ColumnInfo>, String> {
        use crate::services::column_service::ColumnService;
        use zip::ZipArchive;
        use std::io::{BufReader, Read};
        
        let file = std::fs::File::open(docx_path)
            .map_err(|e| format!("无法打开文件: {}", e))?;
        
        let mut archive = ZipArchive::new(BufReader::new(file))
            .map_err(|e| format!("无法读取 ZIP 存档: {}", e))?;
        
        let mut doc_xml = archive.by_name("word/document.xml")
            .map_err(|e| format!("无法读取 document.xml: {}", e))?;
        
        let mut content = String::new();
        doc_xml.read_to_string(&mut content)
            .map_err(|e| format!("读取失败: {}", e))?;
        
        // 提取所有节的分栏信息
        // 支持多节不同分栏：返回所有节的分栏信息
        // 注意：当前实现返回第一个节的分栏信息作为文档级统一分栏
        // 未来可以扩展为返回 Vec<ColumnInfo>，为每个节创建对应的 HTML 容器
        let columns = ColumnService::extract_columns(&content)
            .map_err(|e| format!("提取分栏信息失败: {}", e))?;
        
        // 如果有多节，使用第一个节的分栏设置（文档级统一分栏）
        // 未来可以扩展为支持多节不同分栏
        Ok(columns.first().cloned())
    }
    
    /// 应用分栏样式到 HTML（已废弃）
    #[allow(dead_code)]
    fn apply_columns_to_html(
        &self,
        html: &str,
        column_info: &crate::services::column_service::ColumnInfo,
    ) -> Result<String, String> {
        use regex::Regex;
        
        // 如果只有 1 列，不需要应用分栏样式
        if column_info.column_count <= 1 {
            return Ok(html.to_string());
        }
        
        // 构建 CSS 样式
        let mut column_style = format!(
            "column-count: {}; column-gap: {:.2}px;",
            column_info.column_count,
            column_info.column_gap
        );
        
        // 添加分隔线
        if column_info.separator {
            column_style.push_str(" column-rule: 1px solid #ccc;");
        }
        
        // 在 .word-page 容器上添加样式（而不是 <body>）
        let page_pattern = Regex::new(r#"<div\s+class=["']word-page["']([^>]*)>"#)
            .map_err(|e| format!("正则表达式错误: {}", e))?;
        
        let page_count = page_pattern.find_iter(html).count();
        eprintln!("   - 找到 {} 个 .word-page 元素", page_count);
        
        let processed = page_pattern.replace_all(html, |caps: &regex::Captures| {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            
            // 检查是否已有 style 属性
            if attrs.contains("style=") {
                // 合并样式
                let style_pattern = Regex::new(r#"style="([^"]*)""#).ok();
                if let Some(re) = style_pattern {
                    if let Some(cap) = re.captures(attrs) {
                        let existing_style = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                        // 确保样式之间有分号分隔
                        let separator = if existing_style.trim_end().ends_with(';') { " " } else { "; " };
                        let new_attrs = re.replace(attrs, |_c: &regex::Captures| {
                            format!("style=\"{}{}{}\"", existing_style, separator, column_style)
                        });
                        return format!("<div class=\"word-page\"{}>", new_attrs);
                    }
                }
            }
            
            // 添加新样式
            format!("<div class=\"word-page\"{} style=\"{}\">", attrs, column_style)
        });
        
        // 如果没有 .word-page 元素，应用在 <body> 上（向后兼容）
        if !page_pattern.is_match(&processed) {
            eprintln!("   - 未找到 .word-page，应用在 <body> 上");
            let body_pattern = Regex::new(r#"<body([^>]*)>"#)
                .map_err(|e| format!("正则表达式错误: {}", e))?;
            
            let result = body_pattern.replace_all(&processed, |caps: &regex::Captures| {
                let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                format!("<body{} style=\"{}\">", attrs, column_style)
            }).to_string();
            eprintln!("   - 分栏样式已应用到 <body>");
            return Ok(result);
        }
        
        eprintln!("   - 分栏样式已应用到 {} 个 .word-page 元素", page_count);
        Ok(processed.to_string())
    }
}


