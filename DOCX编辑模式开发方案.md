# DOCX 编辑模式开发方案

## 文档信息
- **版本**：v2.0
- **创建日期**：2025-01
- **最后更新**：2024-12-19
- **方案状态**：✅ **可执行开发方案**
- **基于方案**：`DOCX编辑模式样式处理方案.md`（Pandoc + CSS 样式表方案）

---

## 一、核心原则

### 1.1 第一性原则

**三层样式处理策略，确保准确复现和灵活编辑**

- ✅ **提取样式层**：只提取 Pandoc 最成熟的部分（标题、粗体、斜体、下划线、列表、图片、表格、段落对齐），确保 100% 复现
- ✅ **预设样式层**：使用单一默认预设样式（CSS 样式表），自动套用实现层次化展示（字体、字号）
- ✅ **工具样式层**：工具栏展示全部 TipTap 支持的样式，用户可自由编辑
- ❌ **不处理复杂格式**：页眉页脚、复杂文本框、SmartArt、VBA 宏、复杂样式继承链、复杂表格格式（合并单元格、边框样式等）

### 1.2 编辑器能力边界

**TipTap 编辑器支持的功能**：
- ✅ 标题（H1-H6）
- ✅ 段落对齐（左、中、右、两端对齐）
- ✅ 文本样式（粗体、斜体、下划线、删除线、上下标）
- ✅ 文本颜色、字体、字号
- ✅ 列表（有序、无序）
- ✅ 表格（基础表格，支持 TableRow、TableCell、TableHeader）
- ✅ 图片（Image 扩展）
- ✅ 超链接（Link 扩展）

**TipTap 编辑器不支持的功能**（果断放弃）：
- ❌ 图标（Icon/Shape）
- ❌ 复杂文本框布局
- ❌ 页眉页脚
- ❌ SmartArt、VBA 宏
- ❌ 复杂表格格式（合并单元格、边框样式等）

---

## 二、技术架构

### 2.1 整体流程

```
用户点击"编辑"按钮（从预览模式切换）
  ↓
Pandoc 转换 DOCX → HTML（提取基础样式）
  ↓
CSS 类转换为内联样式（段落对齐）
  ↓
添加预设样式表（CSS 样式表，不修改 HTML）
  ↓
TipTap 编辑器加载 HTML
  ↓
用户编辑（AI 交互编辑，工具栏提供全部样式）
  ↓
保存：TipTap HTML → Pandoc → DOCX
```

### 2.2 技术栈

**后端**：
- Rust + Tauri
- Pandoc（DOCX → HTML，HTML → DOCX）
- 字符串处理（CSS 类转换、样式表插入）

**前端**：
- React + TypeScript
- TipTap 编辑器（已支持的功能）

---

## 三、三层样式处理策略

### 3.1 提取样式层（100% 复现）

**只提取 Pandoc 最成熟、最稳定的样式**：

**标题层级**：
- H1-H6（Pandoc 直接输出 `<h1>`-`<h6>` 标签）

**段落对齐**：
- 左对齐、居中、右对齐、两端对齐（通过 CSS 类转换为内联样式）

**文本格式**：
- 粗体、斜体、下划线（Pandoc 直接输出 `<strong>`, `<em>`, `<u>` 标签）

**列表结构**：
- 有序列表、无序列表（Pandoc 直接输出 `<ul>`, `<ol>`, `<li>` 标签）

**表格结构**：
- 基础表格（Pandoc 直接输出 `<table>`, `<tr>`, `<td>` 标签）

**图片**：
- 嵌入图片（Pandoc 直接输出 `<img>` 标签，保留路径）

### 3.2 预设样式层（层次化展示）

**单一默认预设样式**（CSS 样式表）：
- 字体：Arial（统一标准）
- 字号：3 级体系（大 24px、中 18px、小 14px）
- 自动套用：通过 CSS 选择器自动应用到标题和正文
- 不修改 HTML：只添加 `<style>` 标签到 `<head>`

### 3.3 工具样式层（完整编辑能力）

**工具栏提供全部 TipTap 支持的样式**：
- 文本格式：粗体、斜体、下划线、删除线、上标、下标
- 标题：H1-H6
- 列表：有序、无序
- 对齐：左、中、右、两端对齐
- 颜色：文本颜色、背景颜色
- 字体：字体族、字号
- 其他：代码块、行内代码、引用块、水平线
- 媒体：链接、图片
- 表格：插入表格、表格操作
- 表头（`<table:table-header-rows>`）

**图片**：
- 嵌入图片（`<draw:image>` + `xlink:href="Pictures/xxx.png"`）

**超链接**：
- 文本超链接（`<text:a>` + `xlink:href="http://..."`）

### 3.2 不支持的样式（果断放弃）

- ❌ 页眉页脚
- ❌ 复杂文本框布局
- ❌ SmartArt、VBA 宏
- ❌ 复杂样式继承链
- ❌ 复杂表格格式（合并单元格、边框样式等）
- ❌ 图标（Icon/Shape）
- ❌ 其他 TipTap 不支持的内容

---

## 四、特殊内容提取策略

### 4.1 图片提取

**ODT 图片结构**：
```xml
<draw:frame>
  <draw:image xlink:href="Pictures/10000000000001F4000001234567890AB.png"/>
</draw:frame>
```

**提取策略**：
1. 从 ODT ZIP 中提取图片文件（`Pictures/` 目录）
2. 转换为 base64 或保存到临时目录
3. 在 HTML 中使用 `<img src="data:image/png;base64,...">` 或 `file://` 路径
4. TipTap Image 扩展支持 base64 和 `file://` 路径

**实现要点**：
- 提取图片时保持图片格式（PNG、JPEG 等）
- 大图片可压缩（可选，不影响功能）
- 图片路径在 HTML 中正确引用

### 4.2 超链接提取

**ODT 超链接结构**：
```xml
<text:a xlink:href="http://example.com" xlink:type="simple">
  <text:span>链接文本</text:span>
</text:a>
```

**提取策略**：
1. 提取 `xlink:href` 属性（URL）
2. 提取链接文本（`<text:span>` 内容）
3. 在 HTML 中使用 `<a href="http://...">链接文本</a>`
4. TipTap Link 扩展支持标准 HTML `<a>` 标签

**实现要点**：
- 支持绝对 URL（`http://`、`https://`）
- 支持相对路径（`./file.docx`、`../folder/`）
- 不支持锚点链接（`#section`），如果遇到则提取为普通文本

### 4.3 图标/形状处理（果断放弃）

**ODT 图标/形状结构**：
```xml
<draw:custom-shape>
  <text:p>图标内容</text:p>
</draw:custom-shape>
```

**处理策略**：
- ❌ **不提取**：TipTap 不支持图标/形状
- ❌ **不转换**：遇到图标/形状时跳过，不生成 HTML
- ✅ **保留上下文**：跳过图标/形状，继续处理后续内容

**实现要点**：
- 解析 ODT XML 时，遇到 `<draw:custom-shape>` 等不支持的形状元素，直接跳过
- 不生成任何 HTML，不保留占位符
- 日志记录跳过的元素（可选，用于调试）

### 4.4 其他特殊内容处理

**复杂文本框**：
- ❌ 不提取：TipTap 不支持复杂文本框布局
- ✅ 提取文本内容：从文本框中提取纯文本，作为普通段落处理

**页眉页脚**：
- ❌ 不提取：TipTap 不支持页眉页脚
- ✅ 跳过：解析时直接跳过页眉页脚内容

**SmartArt、VBA 宏**：
- ❌ 不提取：TipTap 不支持
- ✅ 跳过：解析时直接跳过

**复杂表格格式**：
- ✅ 提取基础表格：提取表格结构和文本内容
- ❌ 不保留合并单元格：合并单元格转换为普通单元格
- ❌ 不保留边框样式：边框样式不提取
- ❌ 不保留表格样式：表格样式不提取

---

## 五、实现方案

### 5.1 后端实现

#### 5.1.1 LibreOffice 转换服务（复用预览模式）

**服务位置**：`src-tauri/src/services/libreoffice_service.rs`

**功能**：
- 转换 DOCX → ODT（带缓存）
- 缓存机制：文件路径 + 修改时间，1小时过期
- **缓存目录**：`cache/odt/`（与 PDF 缓存 `cache/preview/` 分离）
- **缓存共享**：编辑模式和预览模式共享 ODT 缓存（预览模式：DOCX → ODT → PDF，编辑模式：DOCX → ODT）

**实现**：
```rust
impl LibreOfficeService {
    /// 转换 DOCX → ODT（带缓存）
    /// 
    /// **缓存策略**：
    /// - 缓存目录：`cache/odt/`（与 PDF 缓存分离）
    /// - 缓存键：文件路径 + 修改时间
    /// - 缓存过期：1小时
    /// - 缓存共享：编辑模式和预览模式共享 ODT 缓存
    pub fn convert_docx_to_odt(
        &self,
        docx_path: &Path,
    ) -> Result<PathBuf, String> {
        // 1. 检查 LibreOffice 可用性
        let libreoffice_path = self.get_libreoffice_path()?;
        
        // 2. 检查 ODT 缓存（使用独立的 ODT 缓存目录）
        let odt_cache_dir = self.cache_dir.parent()
            .ok_or_else(|| "无法获取缓存父目录".to_string())?
            .join("odt");
        fs::create_dir_all(&odt_cache_dir)
            .map_err(|e| format!("创建 ODT 缓存目录失败: {}", e))?;
        
        let cache_key = self.generate_cache_key(docx_path)?;
        let cached_odt_path = odt_cache_dir.join(format!("{}.odt", cache_key));
        
        if cached_odt_path.exists() {
            let metadata = fs::metadata(&cached_odt_path)?;
            let elapsed = metadata.modified()?
                .duration_since(SystemTime::now() - self.cache_duration)
                .unwrap_or(Duration::from_secs(0));
            
            if elapsed < self.cache_duration {
                eprintln!("✅ 使用缓存 ODT: {:?}", cached_odt_path);
                return Ok(cached_odt_path);
            } else {
                let _ = fs::remove_file(&cached_odt_path);
            }
        }
        
        // 3. 执行转换
        eprintln!("🔄 开始转换 DOCX → ODT: {:?}", docx_path);
        
        // 创建临时输出目录
        let output_dir = odt_cache_dir.join("temp");
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("创建临时输出目录失败: {}", e))?;
        
        // 4. 配置 LibreOffice 运行环境（参考 convert_docx_to_pdf 的实现）
        let mut cmd = Command::new(&libreoffice_path);
        // ... 环境变量配置（与 PDF 转换相同）...
        
        // 5. 执行 LibreOffice 转换命令
        cmd.arg("--headless")
            .arg("--convert-to")
            .arg("odt")
            .arg("--outdir")
            .arg(&output_dir)
            .arg(docx_path);
        
        let output = cmd.output()
            .map_err(|e| format!("执行 LibreOffice 命令失败: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("LibreOffice 转换失败: {}", stderr));
        }
        
        // 6. 查找生成的 ODT 文件
        let expected_odt_filename = docx_path.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string() + ".odt");
        
        let temp_odt_path = if let Some(ref filename) = expected_odt_filename {
            let expected_path = output_dir.join(filename);
            if expected_path.exists() {
                expected_path
            } else {
                // 扫描目录查找 ODT 文件
                // ... 查找逻辑 ...
                return Err("未找到生成的 ODT 文件".to_string());
            }
        } else {
            return Err("无法确定 ODT 文件名".to_string());
        };
        
        // 7. 保存到缓存
        fs::copy(&temp_odt_path, &cached_odt_path)
            .map_err(|e| format!("保存 ODT 缓存失败: {}", e))?;
        
        eprintln!("✅ ODT 转换成功: {:?}", cached_odt_path);
        Ok(cached_odt_path)
    }
}
```

#### 5.1.2 ODT 解析服务

**服务位置**：`src-tauri/src/services/odt_parser.rs`

**功能**：
- 解析 ODT ZIP 结构
- 提取内容和 AI 样式子集
- 生成结构化数据

**数据结构**：
```rust
// ⚠️ 关键修复：使用统一的文档节点类型，按文档顺序存储
#[derive(Debug, Clone)]
pub enum DocumentNode {
    Heading(Heading),
    Paragraph(Paragraph),
    List(List),
    Table(Table),
}

#[derive(Debug, Clone)]
pub struct OdtStructure {
    pub nodes: Vec<DocumentNode>,  // 按文档顺序存储（ODT XML 中元素按文档顺序排列）
    pub image_map: HashMap<String, Image>,  // 图片路径映射表（路径 -> 图片数据）
}

#[derive(Debug, Clone)]
pub struct Heading {
    pub level: u8,                    // 1-6
    pub text: String,
    pub style: TextStyle,            // 样式信息
}

#[derive(Debug, Clone)]
pub struct Paragraph {
    pub text_runs: Vec<TextRun>,      // 文本运行列表（包含文本、图片、超链接）
    pub images: Vec<ImageNode>,        // 段落中的图片节点（按位置排序）
    pub align: Option<String>,         // left, center, right, justify
    pub style: TextStyle,
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub path: String,                  // ODT 中的图片路径（Pictures/xxx.png）
    pub position: ImagePosition,      // 图片位置（段落开头、中间、结尾）
    pub index: usize,                  // 在段落中的索引位置
}

#[derive(Debug, Clone)]
pub struct TextRun {
    pub text: String,
    pub color: Option<String>,        // #RRGGBB
    pub font_family: Option<String>,
    pub font_size: Option<String>,    // 12pt
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub link: Option<String>,         // 超链接 URL（如果有）
    pub image_ref: Option<String>,    // 图片引用路径（如果有，从 image_map 查找）
}

#[derive(Debug, Clone)]
pub struct List {
    pub items: Vec<ListItem>,         // 列表项列表
    pub ordered: bool,                // 有序/无序
}

#[derive(Debug, Clone)]
pub struct ListItem {
    pub text_runs: Vec<TextRun>,      // 文本运行列表
    pub nested_level: u8,             // 嵌套层级（0 = 顶级，1 = 一级嵌套，以此类推）
    pub children: Vec<ListItem>,      // 子列表项（用于嵌套列表）
}

#[derive(Debug, Clone)]
pub struct Table {
    pub rows: Vec<TableRow>,           // 表格行列表
    pub header_rows: Vec<TableRow>,    // 表头行列表
}

#[derive(Debug, Clone)]
pub struct TableRow {
    pub cells: Vec<TableCell>,         // 单元格列表
}

#[derive(Debug, Clone)]
pub struct TableCell {
    pub content: Vec<Paragraph>,      // 单元格内容（段落列表，包含图片）
    pub is_header: bool,               // 是否为表头
    pub colspan: u32,                  // 合并列数（table:number-columns-spanned）
    pub rowspan: u32,                  // 合并行数（table:number-rows-spanned）
    pub is_merged: bool,               // 是否为合并单元格（非第一个单元格）
}

#[derive(Debug, Clone)]
pub struct Image {
    pub path: String,                  // ODT 中的图片路径（Pictures/xxx.png）
    pub data: Vec<u8>,                 // 图片数据（从 ZIP 中提取）
    pub mime_type: String,             // 图片 MIME 类型（image/png, image/jpeg）
}

// ⚠️ 注意：Link 不再作为独立结构，超链接直接嵌入到 TextRun 中

#[derive(Debug, Clone)]
pub struct TextStyle {
    pub color: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<String>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub parent_style: Option<String>,  // 父样式名称（用于样式继承）
}

// ⚠️ 样式继承处理策略：
// - 简单处理：只继承一层（如果元素有 style:parent-style-name，查找父样式）
// - 合并规则：合并父样式和当前样式（当前样式优先级更高）
// - 不处理多层继承

pub struct OdtParser;

impl OdtParser {
    /// 解析 ODT 文件，提取结构
    /// 
    /// **关键实现**：
    /// - 按照文档顺序提取元素（ODT XML 中元素按文档顺序排列）
    /// - 使用统一的 DocumentNode 枚举类型
    /// - 建立图片路径映射表（image_map）
    /// - 处理样式继承（只继承一层）
    pub fn parse_odt(odt_path: &Path) -> Result<OdtStructure, String> {
        // 1. 打开 ODT（ZIP）
        let file = File::open(odt_path)?;
        let mut zip = ZipArchive::new(file)?;
        
        // 2. 提取图片数据（从 ZIP 中提取 Pictures/ 目录，建立映射表）
        let image_map = Self::extract_images(&mut zip)?;
        
        // 3. 读取 content.xml
        let mut content_xml = String::new();
        zip.by_name("content.xml")?
            .read_to_string(&mut content_xml)?;
        
        // 4. 解析 XML（quick-xml，支持命名空间）
        // ⚠️ 注意：quick-xml 支持命名空间，使用 `@namespace` 属性处理
        let mut nodes = Vec::new();
        let mut reader = quick_xml::Reader::from_str(&content_xml);
        reader.trim_text(true);
        
        // 5. 按照文档顺序提取元素（标题、段落、列表、表格）
        // 6. 提取样式信息（文本颜色、字体、字号等，处理样式继承）
        // 7. 关联图片（通过 image_map 查找图片数据）
        // 8. 返回结构化数据
        
        Ok(OdtStructure {
            nodes,
            image_map,
        })
    }
    
    /// 提取图片数据（从 ODT ZIP 中提取，建立映射表）
    /// 
    /// **返回**：图片路径 -> 图片数据的映射表
    fn extract_images(odt_zip: &mut ZipArchive<File>) -> Result<HashMap<String, Image>, String> {
        let mut image_map = HashMap::new();
        
        // 遍历 ODT ZIP 中的文件
        for i in 0..odt_zip.len() {
            let file = odt_zip.by_index(i)?;
            let name = file.name();
            
            // 检查是否为图片文件
            if name.starts_with("Pictures/") {
                let mut data = Vec::new();
                std::io::copy(&mut file, &mut data)?;
                
                // 识别 MIME 类型
                let mime_type = match name {
                    n if n.ends_with(".png") => "image/png",
                    n if n.ends_with(".jpg") || n.ends_with(".jpeg") => "image/jpeg",
                    n if n.ends_with(".gif") => "image/gif",
                    n if n.ends_with(".webp") => "image/webp",
                    _ => "image/png", // 默认
                };
                
                // ⚠️ 图片压缩：大图片需要压缩（减少 HTML 体积）
                let compressed_data = if data.len() > 1024 * 1024 {  // > 1MB
                    Self::compress_image(&data, &mime_type)?
                } else {
                    data
                };
                
                image_map.insert(name.to_string(), Image {
                    path: name.to_string(),
                    data: compressed_data,
                    mime_type: mime_type.to_string(),
                });
            }
        }
        
        Ok(image_map)
    }
    
    /// 压缩图片（大图片压缩，减少 HTML 体积）
    fn compress_image(data: &[u8], mime_type: &str) -> Result<Vec<u8>, String> {
        // 使用 image crate 压缩图片
        // 保持图片格式，降低质量或尺寸
        // 返回压缩后的图片数据
        // ⚠️ 注意：压缩是可选的，不影响功能
        Ok(data.to_vec())  // 占位实现
    }
    
    /// 跳过不支持的形状元素
    fn skip_unsupported_shape(&mut self) {
        // 遇到 <draw:custom-shape> 等不支持的形状元素时，直接跳过
        // 不生成任何 HTML，不保留占位符
    }
    
    /// 处理样式继承（只继承一层）
    fn resolve_style_inheritance(&self, style: &TextStyle, styles_map: &HashMap<String, TextStyle>) -> TextStyle {
        let mut resolved_style = style.clone();
        
        // 如果样式有父样式，查找并合并
        if let Some(ref parent_name) = style.parent_style {
            if let Some(parent_style) = styles_map.get(parent_name) {
                // 合并父样式和当前样式（当前样式优先级更高）
                if resolved_style.color.is_none() {
                    resolved_style.color = parent_style.color.clone();
                }
                if resolved_style.font_family.is_none() {
                    resolved_style.font_family = parent_style.font_family.clone();
                }
                if resolved_style.font_size.is_none() {
                    resolved_style.font_size = parent_style.font_size.clone();
                }
                if !resolved_style.bold {
                    resolved_style.bold = parent_style.bold;
                }
                if !resolved_style.italic {
                    resolved_style.italic = parent_style.italic;
                }
                if !resolved_style.underline {
                    resolved_style.underline = parent_style.underline;
                }
            }
        }
        
        resolved_style
    }
}
```

#### 5.1.3 HTML 生成服务

**服务位置**：`src-tauri/src/services/html_generator.rs`

**功能**：
- 将 ODT 结构转换为语义化 HTML
- 生成内联样式（TipTap 支持）
- 处理图片（base64 或 file:// 路径）
- 处理超链接（标准 HTML `<a>` 标签）

**实现**：
```rust
pub struct HtmlGenerator;

impl HtmlGenerator {
    /// 将 ODT 结构转换为 HTML
    /// 
    /// **关键实现**：
    /// - 按照文档顺序生成 HTML（使用 nodes 列表）
    /// - 图片通过 image_map 查找并转换为 base64
    /// - 处理嵌套列表
    /// - 处理合并单元格
    pub fn odt_structure_to_html(structure: &OdtStructure) -> String {
        let mut html = String::new();
        
        // ⚠️ 关键修复：按照文档顺序生成 HTML（不是按类型分组）
        for node in &structure.nodes {
            match node {
                DocumentNode::Heading(heading) => {
                    html.push_str(&self.heading_to_html(heading));
                }
                DocumentNode::Paragraph(para) => {
                    html.push_str(&self.paragraph_to_html(para, &structure.image_map));
                }
                DocumentNode::List(list) => {
                    html.push_str(&self.list_to_html(list, &structure.image_map, 0));
                }
                DocumentNode::Table(table) => {
                    html.push_str(&self.table_to_html(table, &structure.image_map));
                }
            }
        }
        
        html
    }
    
    /// 生成标题 HTML
    fn heading_to_html(&self, heading: &Heading) -> String {
        let style = self.text_style_to_css(&heading.style);
        format!("<h{} style=\"{}\">{}</h{}>", 
                heading.level, style, heading.text, heading.level)
    }
    
    /// 生成段落 HTML
    /// 
    /// **图片处理**：
    /// - 图片在段落中的位置：根据 ImageNode 的 position 和 index 确定
    /// - 段落开头：图片在第一个文本运行之前
    /// - 段落中间：图片在对应的文本运行之后
    /// - 段落结尾：图片在最后一个文本运行之后
    fn paragraph_to_html(&self, para: &Paragraph, image_map: &HashMap<String, Image>) -> String {
        let mut html = String::from("<p");
        
        // 段落对齐
        if let Some(align) = &para.align {
            html.push_str(&format!(" style=\"text-align: {};\"", align));
        }
        
        html.push_str(">");
        
        // ⚠️ 关键：合并文本运行和图片节点，按位置排序
        let mut elements: Vec<(usize, ElementType)> = Vec::new();
        
        // 添加文本运行
        for (i, run) in para.text_runs.iter().enumerate() {
            elements.push((i, ElementType::TextRun(run.clone())));
        }
        
        // 添加图片节点
        for img_node in &para.images {
            let index = match img_node.position {
                ImagePosition::Start => 0,
                ImagePosition::Middle => img_node.index,
                ImagePosition::End => para.text_runs.len(),
            };
            elements.push((index, ElementType::Image(img_node.clone())));
        }
        
        // 按位置排序
        elements.sort_by_key(|(idx, _)| *idx);
        
        // 生成 HTML
        for (_, element) in elements {
            match element {
                ElementType::TextRun(run) => {
                    html.push_str(&self.text_run_to_html(&run, image_map));
                }
                ElementType::Image(img_node) => {
                    if let Some(image) = image_map.get(&img_node.path) {
                        html.push_str(&self.image_to_html(image));
                    }
                }
            }
        }
        
        html.push_str("</p>");
        html
    }
    
    enum ElementType {
        TextRun(TextRun),
        Image(ImageNode),
    }
    
    /// 生成文本运行 HTML
    /// 
    /// **图片处理**：
    /// - 如果 TextRun 有 image_ref，在文本后插入图片
    fn text_run_to_html(&self, run: &TextRun, image_map: &HashMap<String, Image>) -> String {
        let mut style = String::new();
        
        // 文本颜色
        if let Some(color) = &run.color {
            style.push_str(&format!("color: {}; ", color));
        }
        
        // 字体
        if let Some(font) = &run.font_family {
            style.push_str(&format!("font-family: {}; ", font));
        }
        
        // 字号
        if let Some(size) = &run.font_size {
            style.push_str(&format!("font-size: {}; ", size));
        }
        
        // 粗体
        if run.bold {
            style.push_str("font-weight: bold; ");
        }
        
        // 斜体
        if run.italic {
            style.push_str("font-style: italic; ");
        }
        
        // 下划线
        if run.underline {
            style.push_str("text-decoration: underline; ");
        }
        
        let text_html = if !style.is_empty() {
            format!("<span style=\"{}\">{}</span>", style.trim(), run.text)
        } else {
            run.text.clone()
        };
        
        // 超链接
        if let Some(url) = &run.link {
            let mut result = format!("<a href=\"{}\">{}</a>", url, text_html);
            
            // 如果文本运行中有图片引用，在链接后插入图片
            if let Some(ref img_path) = run.image_ref {
                if let Some(image) = image_map.get(img_path) {
                    result.push_str(&self.image_to_html(image));
                }
            }
            
            return result;
        }
        
        // 普通文本
        let mut result = text_html;
        
        // 如果文本运行中有图片引用，在文本后插入图片
        if let Some(ref img_path) = run.image_ref {
            if let Some(image) = image_map.get(img_path) {
                result.push_str(&self.image_to_html(image));
            }
        }
        
        result
    }
    
    /// 生成列表 HTML（支持嵌套）
    /// 
    /// **嵌套处理**：
    /// - 根据 nested_level 生成嵌套的 `<ul>` 或 `<ol>` 标签
    /// - 使用 children 字段处理嵌套列表项
    fn list_to_html(&self, list: &List, image_map: &HashMap<String, Image>, current_level: u8) -> String {
        let tag = if list.ordered { "ol" } else { "ul" };
        let mut html = format!("<{}>", tag);
        
        for item in &list.items {
            html.push_str("<li>");
            
            // 文本运行
            for run in &item.text_runs {
                html.push_str(&self.text_run_to_html(run, image_map));
            }
            
            // 嵌套列表（children）
            if !item.children.is_empty() {
                // 递归生成嵌套列表
                let nested_list = List {
                    items: item.children.clone(),
                    ordered: list.ordered,  // 嵌套列表继承父列表的有序/无序属性
                };
                html.push_str(&self.list_to_html(&nested_list, image_map, current_level + 1));
            }
            
            html.push_str("</li>");
        }
        
        html.push_str(&format!("</{}>", tag));
        html
    }
    
    /// 生成表格 HTML
    /// 
    /// **合并单元格处理**：
    /// - 保留第一个单元格的内容，其他合并的单元格生成空 `<td></td>`
    /// - 检测 `table:number-columns-spanned` 和 `table:number-rows-spanned`
    fn table_to_html(&self, table: &Table, image_map: &HashMap<String, Image>) -> String {
        let mut html = String::from("<table>");
        
        // 表头
        if !table.header_rows.is_empty() {
            html.push_str("<thead>");
            for row in &table.header_rows {
                html.push_str(&self.table_row_to_html(row, true, image_map));
            }
            html.push_str("</thead>");
        }
        
        // 表体
        html.push_str("<tbody>");
        for row in &table.rows {
            html.push_str(&self.table_row_to_html(row, false, image_map));
        }
        html.push_str("</tbody>");
        
        html.push_str("</table>");
        html
    }
    
    /// 生成表格行 HTML
    /// 
    /// **合并单元格处理**：
    /// - 第一个单元格：保留内容，如果有 colspan/rowspan，添加相应属性
    /// - 其他合并的单元格（is_merged = true）：生成空 `<td></td>`
    fn table_row_to_html(&self, row: &TableRow, is_header: bool, image_map: &HashMap<String, Image>) -> String {
        let mut html = String::from("<tr>");
        
        for cell in &row.cells {
            // ⚠️ 关键：跳过合并的单元格（非第一个单元格）
            if cell.is_merged {
                // 生成空单元格（占位符）
                let tag = if is_header || cell.is_header { "th" } else { "td" };
                html.push_str(&format!("<{}></{}>", tag, tag));
                continue;
            }
            
            let tag = if is_header || cell.is_header { "th" } else { "td" };
            let mut cell_html = format!("<{}", tag);
            
            // 添加合并属性
            if cell.colspan > 1 {
                cell_html.push_str(&format!(" colspan=\"{}\"", cell.colspan));
            }
            if cell.rowspan > 1 {
                cell_html.push_str(&format!(" rowspan=\"{}\"", cell.rowspan));
            }
            
            cell_html.push_str(">");
            
            // 单元格内容
            for para in &cell.content {
                cell_html.push_str(&self.paragraph_to_html(para, image_map));
            }
            
            cell_html.push_str(&format!("</{}>", tag));
            html.push_str(&cell_html);
        }
        
        html.push_str("</tr>");
        html
    }
    
    /// 文本样式转 CSS
    fn text_style_to_css(&self, style: &TextStyle) -> String {
        let mut css = String::new();
        
        if let Some(color) = &style.color {
            css.push_str(&format!("color: {}; ", color));
        }
        
        if let Some(font) = &style.font_family {
            css.push_str(&format!("font-family: {}; ", font));
        }
        
        if let Some(size) = &style.font_size {
            css.push_str(&format!("font-size: {}; ", size));
        }
        
        if style.bold {
            css.push_str("font-weight: bold; ");
        }
        
        if style.italic {
            css.push_str("font-style: italic; ");
        }
        
        if style.underline {
            css.push_str("text-decoration: underline; ");
        }
        
        css.trim().to_string()
    }
}
```

#### 5.1.4 图片处理

**图片提取策略**：
1. 从 ODT ZIP 中提取 `Pictures/` 目录下的所有图片文件
2. 转换为 base64 编码
3. 在 HTML 中使用 `<img src="data:image/png;base64,...">` 格式

**实现要点**：
```rust
impl OdtParser {
    fn extract_images(odt_zip: &mut ZipArchive<File>) -> Result<Vec<Image>, String> {
        let mut images = Vec::new();
        
        // 遍历 ODT ZIP 中的文件
        for i in 0..odt_zip.len() {
            let file = odt_zip.by_index(i)?;
            let name = file.name();
            
            // 检查是否为图片文件
            if name.starts_with("Pictures/") {
                let mut data = Vec::new();
                std::io::copy(&mut file, &mut data)?;
                
                // 识别 MIME 类型
                let mime_type = match name {
                    n if n.ends_with(".png") => "image/png",
                    n if n.ends_with(".jpg") || n.ends_with(".jpeg") => "image/jpeg",
                    n if n.ends_with(".gif") => "image/gif",
                    n if n.ends_with(".webp") => "image/webp",
                    _ => "image/png", // 默认
                };
                
                images.push(Image {
                    path: name.to_string(),
                    data,
                    mime_type: mime_type.to_string(),
                });
            }
        }
        
        Ok(images)
    }
}

impl HtmlGenerator {
    fn image_to_html(&self, image: &Image) -> String {
        // 转换为 base64（使用 base64 crate）
        // ⚠️ 注意：使用 base64 = "0.22" 版本（推荐）
        let base64 = base64::engine::general_purpose::STANDARD.encode(&image.data);
        format!("<img src=\"data:{};base64,{}\" class=\"editor-image\" />", 
                image.mime_type, base64)
    }
}
```

#### 5.1.5 后端命令接口

**服务位置**：`src-tauri/src/commands/file_commands.rs`

```rust
/// 打开 DOCX 文件用于编辑（编辑模式专用）
/// 
/// **功能**：转换 DOCX → ODT → 解析结构 → 生成 HTML
/// 
/// **使用场景**：
/// - 编辑模式（新建/AI生成/点击编辑）
/// - TipTap 编辑器显示
/// 
/// **处理流程**：
/// 1. 检查缓存（ODT 文件）
/// 2. 如果没有，调用 LibreOffice 转换 DOCX → ODT
/// 3. 解析 ODT XML，提取结构
/// 4. 提取 AI 样式子集（基础样式）
/// 5. 生成语义化 HTML（带内联样式）
/// 6. 返回 HTML 字符串
/// 
/// **返回**：HTML 内容（带内联样式，可直接加载到 TipTap）
#[tauri::command]
pub async fn open_docx_for_edit(
    path: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let docx_path = PathBuf::from(&path);
    
    // ⚠️ 文件大小检查：限制 100MB
    let file_size = std::fs::metadata(&docx_path)
        .map_err(|e| format!("无法读取文件信息: {}", e))?
        .len();
    
    if file_size > 100 * 1024 * 1024 {  // 100MB
        return Err("文件过大（>100MB），无法打开。请使用较小的文件或分割文档。".to_string());
    }
    
    // ⚠️ 服务实例复用：使用全局单例（在应用启动时创建）
    // 使用 lazy_static 或 once_cell 创建单例，所有命令共享同一个服务实例
    let lo_service = get_global_libreoffice_service()
        .map_err(|e| format!("LibreOffice 服务初始化失败: {}", e))?;
    
    // 2. 转换 DOCX → ODT（LibreOffice，带缓存）
    // ⚠️ 注意：convert_docx_to_odt 是同步方法，需要在 spawn_blocking 中执行
    let odt_path = tokio::task::spawn_blocking({
        let docx_path = docx_path.clone();
        let lo_service = lo_service.clone();
        move || lo_service.convert_docx_to_odt(&docx_path)
    }).await
        .map_err(|e| format!("转换任务失败: {}", e))??;
    
    // 3. 解析 ODT XML，提取结构（流式处理大文件）
    let structure = tokio::task::spawn_blocking({
        let odt_path = odt_path.clone();
        move || OdtParser::parse_odt(&odt_path)
    }).await
        .map_err(|e| format!("解析任务失败: {}", e))??;
    
    // 4. 提取 AI 样式子集（基础样式，已在解析时完成）
    
    // 5. 生成语义化 HTML（带内联样式）
    let html = tokio::task::spawn_blocking({
        move || HtmlGenerator::odt_structure_to_html(&structure)
    }).await
        .map_err(|e| format!("HTML 生成任务失败: {}", e))??;
    
    // 6. 返回 HTML 字符串
    Ok(html)
}

// ⚠️ 全局 LibreOffice 服务单例（使用 once_cell）
use once_cell::sync::Lazy;
use std::sync::Mutex;

static GLOBAL_LO_SERVICE: Lazy<Mutex<Option<LibreOfficeService>>> = Lazy::new(|| {
    Mutex::new(None)
});

fn get_global_libreoffice_service() -> Result<Arc<LibreOfficeService>, String> {
    let mut service = GLOBAL_LO_SERVICE.lock().unwrap();
    
    if service.is_none() {
        *service = Some(LibreOfficeService::new()?);
    }
    
    Ok(Arc::new(service.as_ref().unwrap().clone()))
}

/// 创建 DOCX 文件的草稿副本
/// 
/// **功能**：复制原文件，创建草稿副本（`document.draft.docx`）
/// 
/// **使用场景**：
/// - 用户点击"编辑"按钮（从预览模式切换）
/// - 编辑模式需要可编辑的副本
/// 
/// **返回**：草稿文件路径
#[tauri::command]
pub async fn create_draft_docx(original_path: String) -> Result<String, String> {
    let original = PathBuf::from(&original_path);
    
    // 1. 检查原文件是否存在
    if !original.exists() {
        return Err(format!("原文件不存在: {}", original_path));
    }
    
    // 2. 生成草稿文件路径（document.draft.docx）
    let parent = original.parent()
        .ok_or_else(|| "无法获取文件父目录".to_string())?;
    let stem = original.file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法获取文件名".to_string())?;
    let draft_path = parent.join(format!("{}.draft.docx", stem));
    
    // 3. 如果草稿文件已存在，先删除
    if draft_path.exists() {
        std::fs::remove_file(&draft_path)
            .map_err(|e| format!("删除旧草稿文件失败: {}", e))?;
    }
    
    // 4. 复制原文件到草稿文件
    std::fs::copy(&original, &draft_path)
        .map_err(|e| format!("复制文件失败: {}", e))?;
    
    // 5. 返回草稿文件路径
    Ok(draft_path.to_string_lossy().to_string())
}
```

### 5.2 前端实现

#### 5.2.1 编辑模式切换

**组件位置**：`src/components/Editor/DocxPdfPreview.tsx`

**功能**：
- 点击"编辑"按钮时，调用 `create_draft_docx` 创建草稿副本
- 调用 `open_docx_for_edit` 获取 HTML 内容
- 切换到编辑模式（TipTap 编辑器）

**实现**：
```typescript
const handleCreateDraft = async () => {
  try {
    // 1. 创建草稿副本
    const draftPath = await invoke<string>('create_draft_docx', {
      originalPath: filePath
    });
    
    // 2. 打开草稿文件进行编辑
    const htmlContent = await invoke<string>('open_docx_for_edit', {
      path: draftPath
    });
    
    // 3. 打开草稿文件进行编辑
    const { useEditorStore } = await import('../../stores/editorStore');
    const { addTab, setActiveTab } = useEditorStore.getState();
    
    // ⚠️ 修复：使用字符串操作提取文件名（不使用 path 模块）
    const fileName = draftPath.split('/').pop() || draftPath.split('\\').pop() || '草稿.docx';
    
    const tabId = addTab(
      draftPath,
      fileName,
      htmlContent,
      false, // isReadOnly
      true,  // isDraft（这是用户的主编辑文件，草稿只是我们的说法，后续还要换名称）
      Date.now() // lastModifiedTime
    );
    
    setActiveTab(tabId);
  } catch (error) {
    console.error('创建草稿失败:', error);
    toast.error(`创建草稿失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};
```

#### 5.2.2 TipTap 编辑器加载

**组件位置**：`src/components/Editor/TipTapEditor.tsx`

**功能**：
- TipTap 编辑器已支持所有需要的功能
- 直接加载 HTML 内容即可

**实现**：
```typescript
// TipTap 编辑器已配置所有需要的扩展
// 直接使用 editor.commands.setContent(htmlContent) 加载 HTML
```

---

## 六、开发计划

### 阶段1：ODT 解析服务实现（3-5天）

**目标**：实现 ODT 解析和结构提取

**任务清单**：
1. 实现 ODT ZIP 解析（`zip` crate）
2. 实现 ODT XML 解析（`quick-xml` crate）
3. 实现结构提取（标题、段落、列表、表格）
4. 实现样式提取（文本颜色、字体、字号、粗体、斜体、下划线、对齐）
5. 实现图片提取（从 ZIP 中提取 Pictures/ 目录）
6. 实现超链接提取（`<text:a>` 标签）

**验收标准**：
- ✅ ODT 文件正确解析（支持命名空间）
- ✅ 结构和样式正确提取（按文档顺序）
- ✅ 样式继承正确处理（只继承一层）
- ✅ 图片正确提取（base64 编码，建立映射表）
- ✅ 图片压缩正常工作（大图片 > 1MB）
- ✅ 超链接正确提取（嵌入到 TextRun 中）
- ✅ 图片位置正确处理（段落开头、中间、结尾）
- ✅ 表格合并单元格正确处理（保留第一个单元格，其他为空）
- ✅ 列表嵌套正确处理（使用 children 字段）

### 阶段2：HTML 生成服务实现（2-3天）

**目标**：实现 ODT 结构到 HTML 的转换

**任务清单**：
1. 实现标题 HTML 生成（H1-H6，带样式）
2. 实现段落 HTML 生成（带对齐和样式，合并文本运行和图片节点）
3. 实现文本运行 HTML 生成（带内联样式，处理图片引用和超链接）
4. 实现列表 HTML 生成（有序/无序，支持嵌套）
5. 实现表格 HTML 生成（基础表格，处理合并单元格）
6. 实现图片 HTML 生成（base64 data URL，使用 base64 = "0.22"）
7. 实现超链接 HTML 生成（标准 `<a>` 标签）
8. 实现按文档顺序生成 HTML（使用 DocumentNode 枚举）

**验收标准**：
- ✅ HTML 正确生成（按文档顺序）
- ✅ 内联样式正确应用（包括样式继承）
- ✅ 图片正确显示（base64，位置正确）
- ✅ 超链接正确显示
- ✅ 嵌套列表正确显示
- ✅ 合并单元格正确处理

### 阶段3：后端命令接口实现（1-2天）

**目标**：实现后端命令接口

**任务清单**：
1. 实现 `open_docx_for_edit` 命令
2. 实现 `create_draft_docx` 命令（复用现有实现）
3. 集成 LibreOffice 转换服务（复用预览模式）
4. 集成 ODT 解析服务
5. 集成 HTML 生成服务

**验收标准**：
- ✅ 命令正常工作
- ✅ 草稿副本正确创建
- ✅ HTML 内容正确返回

### 阶段4：前端集成（1-2天）

**目标**：实现前端编辑模式切换

**任务清单**：
1. 更新 `DocxPdfPreview` 组件的"编辑"按钮逻辑
2. 调用 `create_draft_docx` 创建草稿副本
3. 调用 `open_docx_for_edit` 获取 HTML 内容
4. 切换到编辑模式（TipTap 编辑器）
5. 测试编辑功能

**验收标准**：
- ✅ 编辑按钮正常工作
- ✅ 草稿副本正确创建
- ✅ HTML 内容正确加载到 TipTap
- ✅ 编辑功能正常工作

---

## 七、验收标准

### 7.1 功能完整性

- ✅ 标题层级正确提取（H1-H6）
- ✅ 段落对齐正确提取（左、中、右、两端对齐）
- ✅ 文本样式正确提取（颜色、字体、字号、粗体、斜体、下划线）
- ✅ 列表结构正确提取（有序、无序）
- ✅ 表格结构正确提取（基础表格）
- ✅ 图片正确提取和显示（base64）
- ✅ 超链接正确提取和显示
- ✅ 不支持的格式正确跳过（不生成 HTML）

### 7.2 编辑器兼容性

- ✅ HTML 内容正确加载到 TipTap
- ✅ 所有样式正确显示
- ✅ 图片正确显示
- ✅ 超链接正确显示
- ✅ 编辑功能正常工作

### 7.3 性能指标

- ✅ 转换时间：首次 < 10 秒，缓存后 < 3 秒
- ✅ HTML 生成时间：< 1 秒
- ✅ 编辑器加载时间：< 1 秒

---

## 八、注意事项

### 8.1 特殊内容处理

- ✅ **图片**：提取并转换为 base64，TipTap 支持
- ✅ **超链接**：提取并生成标准 HTML `<a>` 标签，TipTap 支持
- ❌ **图标/形状**：不提取，TipTap 不支持，果断放弃
- ❌ **复杂文本框**：提取文本内容，作为普通段落处理
- ❌ **页眉页脚**：不提取，TipTap 不支持
- ❌ **SmartArt、VBA 宏**：不提取，TipTap 不支持

### 8.2 样式处理

- ✅ **AI 样式子集**：只提取基础样式，不处理复杂样式
- ❌ **复杂样式继承链**：不处理，只提取直接样式
- ❌ **复杂表格格式**：不保留合并单元格、边框样式等

### 8.3 错误处理

- ✅ LibreOffice 不可用时，提示失败并建议创建草稿
- ✅ ODT 解析失败时，提示错误信息
- ✅ 图片提取失败时，跳过图片，继续处理其他内容
- ✅ 超链接提取失败时，提取为普通文本

---

## 九、技术依赖

### 9.1 Rust 依赖

```toml
[dependencies]
zip = "0.6"           # ODT ZIP 解析
quick-xml = "0.31"    # ODT XML 解析
base64 = "0.21"       # 图片 base64 编码
```

### 9.2 前端依赖

- TipTap 编辑器（已安装）
- React + TypeScript（已安装）

---

## 十、当前实现替换策略

### 10.1 当前实现分析

**当前编辑模式实现**：
- 后端：`open_docx` 命令（`src-tauri/src/commands/file_commands.rs`）
  - 使用 `PandocService::convert_docx_to_html()` 进行 DOCX → HTML 转换
  - 使用 `extract_docx_formatting()` 提取格式信息
  - 使用 `apply_docx_formatting()` 应用格式信息到 HTML
- 前端：`documentService.ts`
  - 编辑模式：调用 `open_docx` 获取 HTML 内容
  - 预览模式：使用 `DocxPdfPreview` 组件（已切换到 LibreOffice + PDF 方案）
- 其他组件：
  - `ReadOnlyBanner.tsx`：编辑模式切换逻辑（调用 `open_docx`）
  - `DocxPdfPreview.tsx`：编辑按钮逻辑（调用 `open_docx`）

**需要替换的部分**：
- ❌ `open_docx` 命令：从 Pandoc 方案改为 LibreOffice + ODT 方案
- ❌ `PandocService::convert_docx_to_html()`：不再用于编辑模式
- ❌ `extract_docx_formatting()` 和 `apply_docx_formatting()`：不再需要（ODT 解析直接提取样式）

**需要保留的部分**：
- ✅ `create_draft_docx` 命令：可以复用（逻辑不变）
- ✅ `save_docx` 命令：保存时仍然使用 Pandoc（HTML → DOCX），保持不变
- ✅ 前端编辑模式切换逻辑：需要更新调用（从 `open_docx` 改为 `open_docx_for_edit`）

### 10.2 替换策略（稳定且干净）

#### 阶段1：并行实现新方案（不破坏现有功能）

**目标**：实现新方案，但不替换旧方案，确保现有功能正常

**任务清单**：
1. 实现 `open_docx_for_edit` 命令（新命令，不替换 `open_docx`）
2. 实现 ODT 解析服务（`odt_parser.rs`）
3. 实现 HTML 生成服务（`html_generator.rs`）
4. 扩展 LibreOffice 服务（添加 `convert_docx_to_odt` 方法）
5. 测试新命令功能（独立测试，不影响现有功能）

**验收标准**：
- ✅ 新命令 `open_docx_for_edit` 正常工作
- ✅ 旧命令 `open_docx` 仍然正常工作
- ✅ 现有编辑功能不受影响

#### 阶段2：前端逐步切换（功能开关）

**目标**：前端添加功能开关，逐步切换到新方案

**任务清单**：
1. 添加功能开关（环境变量或配置）
   ```typescript
   // src/config/featureFlags.ts
   export const USE_ODT_EDIT_MODE = process.env.VITE_USE_ODT_EDIT_MODE === 'true';
   ```
2. 更新 `documentService.ts`：根据开关选择使用 `open_docx` 或 `open_docx_for_edit`
   ```typescript
   if (USE_ODT_EDIT_MODE) {
     htmlContent = await invoke<string>('open_docx_for_edit', { path: filePath });
   } else {
     htmlContent = await invoke<string>('open_docx', { path: filePath });
   }
   ```
3. 更新 `ReadOnlyBanner.tsx`：根据开关选择命令
4. 更新 `DocxPdfPreview.tsx`：根据开关选择命令
5. 测试功能开关（默认关闭，手动开启测试）

**验收标准**：
- ✅ 功能开关正常工作
- ✅ 默认使用旧方案（`open_docx`），功能正常
- ✅ 开启开关后使用新方案（`open_docx_for_edit`），功能正常

#### 阶段3：全面测试新方案（稳定验证）

**目标**：全面测试新方案，确保稳定性和正确性

**任务清单**：
1. 功能测试：测试所有编辑功能（标题、段落、列表、表格、图片、超链接）
2. 样式测试：测试所有样式提取（颜色、字体、字号、粗体、斜体、下划线、对齐）
3. 兼容性测试：测试不同 DOCX 文件（简单格式、复杂格式、包含图片、包含超链接）
4. 性能测试：测试转换时间、HTML 生成时间、编辑器加载时间
5. 错误处理测试：测试 LibreOffice 不可用、ODT 解析失败等错误场景

**验收标准**：
- ✅ 所有功能测试通过
- ✅ 所有样式测试通过
- ✅ 兼容性测试通过（至少 90% 的 DOCX 文件正确处理）
- ✅ 性能指标达标（转换时间 < 10 秒，HTML 生成 < 1 秒）
- ✅ 错误处理正确

#### 阶段4：切换默认方案（功能开关默认开启）

**目标**：将新方案设为默认，但保留旧方案作为降级

**任务清单**：
1. 修改功能开关默认值：`USE_ODT_EDIT_MODE = true`
2. 全面测试：确保新方案作为默认方案正常工作
3. 监控错误：收集用户反馈和错误日志
4. 保留旧方案：如果新方案有问题，可以快速切换回旧方案

**验收标准**：
- ✅ 新方案作为默认方案正常工作
- ✅ 旧方案仍然可用（作为降级方案）
- ✅ 错误监控正常

#### 阶段5：清理旧代码（稳定后清理）

**目标**：新方案稳定运行后，清理旧代码

**任务清单**：
1. 移除功能开关（不再需要）
2. 移除 `open_docx` 命令（编辑模式专用部分）
   - ⚠️ **注意**：`open_docx` 可能被其他功能使用，需要检查所有调用
   - ⚠️ **注意**：如果 `open_docx` 被预览模式使用，需要保留或重构
3. 移除 `PandocService::convert_docx_to_html()`（编辑模式专用部分）
   - ⚠️ **注意**：如果预览模式使用，需要保留或重构
4. 移除 `extract_docx_formatting()` 和 `apply_docx_formatting()`（编辑模式专用部分）
   - ⚠️ **注意**：如果预览模式使用，需要保留或重构
5. 更新文档：更新所有相关文档，移除旧方案说明

**验收标准**：
- ✅ 旧代码已清理
- ✅ 新方案正常工作
- ✅ 没有功能回归
- ✅ 代码库更简洁

### 10.3 替换注意事项

#### 10.3.1 命令命名

**新命令**：`open_docx_for_edit`
- 明确表示用于编辑模式
- 与预览模式命令 `preview_docx_as_pdf` 命名一致

**旧命令**：`open_docx`
- 如果被其他功能使用，需要检查所有调用
- 如果只用于编辑模式，可以移除
- 如果被预览模式使用，需要保留或重构

#### 10.3.2 服务复用

**LibreOffice 服务**：
- ✅ 预览模式已使用 `LibreOfficeService::convert_docx_to_pdf()`
- ✅ 编辑模式使用 `LibreOfficeService::convert_docx_to_odt()`（新增方法）
- ✅ 两个方法共享同一个服务实例，复用路径检测和缓存逻辑

**Pandoc 服务**：
- ✅ 保存时仍然使用 `PandocService::convert_html_to_docx()`（保持不变）
- ❌ 编辑模式不再使用 `PandocService::convert_docx_to_html()`（移除）

#### 10.3.3 前端调用更新

**需要更新的文件**：
1. `src/services/documentService.ts`
   - 编辑模式：从 `open_docx` 改为 `open_docx_for_edit`
2. `src/components/Editor/ReadOnlyBanner.tsx`
   - 编辑模式切换：从 `open_docx` 改为 `open_docx_for_edit`
3. `src/components/Editor/DocxPdfPreview.tsx`
   - 编辑按钮：从 `open_docx` 改为 `open_docx_for_edit`

**更新策略**：
- 使用功能开关，逐步切换
- 确保向后兼容（旧方案仍然可用）

#### 10.3.4 错误处理

**LibreOffice 不可用**：
- 提示失败并建议创建草稿
- 不提供降级方案（不降级到 Pandoc）

**ODT 解析失败**：
- 提示错误信息
- 不提供降级方案（不降级到 Pandoc）

**图片提取失败**：
- 跳过图片，继续处理其他内容
- 日志记录跳过的图片

**超链接提取失败**：
- 提取为普通文本
- 日志记录失败的超链接

### 10.4 替换时间表

**阶段1：并行实现**（3-5天）
- 实现新方案，不破坏现有功能

**阶段2：前端切换**（1-2天）
- 添加功能开关，逐步切换

**阶段3：全面测试**（2-3天）
- 功能测试、样式测试、兼容性测试、性能测试

**阶段4：切换默认**（1天）
- 新方案设为默认，保留旧方案作为降级

**阶段5：清理代码**（1-2天）
- 移除旧代码，更新文档

**总计**：8-13 天完成替换

### 10.5 风险控制

**风险1：新方案不稳定**
- **应对**：保留旧方案作为降级，功能开关可以快速切换
- **监控**：收集错误日志和用户反馈

**风险2：性能问题**
- **应对**：性能测试，确保转换时间 < 10 秒
- **优化**：缓存机制，ODT 文件缓存 1 小时

**风险3：兼容性问题**
- **应对**：兼容性测试，确保至少 90% 的 DOCX 文件正确处理
- **处理**：不支持的格式跳过，不生成 HTML

**风险4：功能回归**
- **应对**：全面测试，确保所有功能正常工作
- **验证**：对比测试，确保新方案功能不弱于旧方案

---

## 十一、参考文档

- `DOCX处理技术方案.md`：技术方案概述
- `DOCX预览模式开发计划.md`：预览模式开发计划（LibreOffice 服务复用）
- `Binder产品需求文档.md`：产品需求定义
- `文档编辑器完整技术方案.md`：编辑器技术方案

