# DOCX 编辑模式开发计划

## 文档信息
- **版本**：v1.0
- **创建日期**：2025-01
- **计划状态**：✅ **可执行开发计划**
- **基于方案**：`DOCX编辑模式开发方案.md`
- **预计工期**：8-12 天

---

## 一、开发目标

### 1.1 功能目标

实现 DOCX 文件的编辑模式功能，支持：
- DOCX → ODT → HTML 转换（LibreOffice + ODT 解析）
- AI 样式子集提取（标题、段落、列表、表格、图片、超链接）
- 语义化 HTML 生成（带内联样式）
- TipTap 编辑器加载和编辑
- 草稿文件创建和管理

### 1.2 性能目标

- 转换时间：首次 < 10 秒，缓存后 < 3 秒
- HTML 生成时间：< 1 秒
- 编辑器加载时间：< 1 秒
- 文件大小限制：100MB
- 并发转换限制：10 个

---

## 二、技术栈

### 2.1 后端技术栈

**编程语言**：Rust

**框架**：Tauri

**依赖库**：
- `zip = "0.6"`：ODT ZIP 解析
- `quick-xml = "0.31"`：ODT XML 解析（支持命名空间）
- `base64 = "0.22"`：图片 base64 编码
- `once_cell = "1.19"`：全局单例（LibreOffice 服务复用）
- `image = "0.24"`：图片压缩（大图片 > 1MB）
- `tokio = { version = "1", features = ["rt-multi-thread"] }`：异步运行时（并发处理）

**外部工具**：
- LibreOffice 命令行工具（内置）：DOCX → ODT 转换
- Pandoc（已安装）：HTML → DOCX 保存（保持不变）

### 2.2 前端技术栈

**编程语言**：TypeScript

**框架**：React

**编辑器**：TipTap（已安装，已配置所有需要的扩展）

**UI 库**：Tailwind CSS

---

## 三、开发阶段

### 阶段1：LibreOffice ODT 转换服务（1-2天）

**目标**：实现 DOCX → ODT 转换功能

**技术实现**：
- 文件位置：`src-tauri/src/services/libreoffice_service.rs`
- 方法名称：`convert_docx_to_odt()`
- 缓存目录：`cache/odt/`（与 PDF 缓存 `cache/preview/` 分离）
- 缓存策略：文件路径 + 修改时间，1小时过期
- 缓存共享：编辑模式和预览模式共享 ODT 缓存

**具体任务**：

1. **实现 `convert_docx_to_odt()` 方法**
   - 检查 LibreOffice 可用性（复用 `get_libreoffice_path()`）
   - 检查 ODT 缓存（使用独立的 `cache/odt/` 目录）
   - 缓存命中：返回缓存的 ODT 路径
   - 缓存未命中：执行 LibreOffice 转换
   - 转换命令：`soffice --headless --convert-to odt --outdir <output> <docx>`
   - 环境变量配置：复用 `convert_docx_to_pdf()` 的 macOS 环境变量设置
   - 保存到缓存：复制到 `cache/odt/` 目录
   - 返回 ODT 路径

2. **实现全局 LibreOffice 服务单例**
   - 使用 `once_cell::sync::Lazy` 创建全局单例
   - 文件位置：`src-tauri/src/services/libreoffice_service.rs`
   - 函数名称：`get_global_libreoffice_service()`
   - 返回类型：`Result<Arc<LibreOfficeService>, String>`
   - 所有命令共享同一个服务实例

3. **添加 Rust 依赖**
   - 在 `src-tauri/Cargo.toml` 中添加 `once_cell = "1.19"`

**验收标准**：
- ✅ `convert_docx_to_odt()` 方法正常工作
- ✅ ODT 缓存机制正常工作（缓存目录分离）
- ✅ 全局单例正常工作（所有命令共享服务实例）
- ✅ 转换时间：首次 < 10 秒，缓存后 < 3 秒

---

### 阶段2：ODT 解析服务实现（3-5天）

**目标**：实现 ODT 文件解析和结构提取

**技术实现**：
- 文件位置：`src-tauri/src/services/odt_parser.rs`（新建文件）
- 结构体名称：`OdtParser`
- 主要方法：`parse_odt()`
- XML 解析库：`quick-xml = "0.31"`（支持命名空间）
- ZIP 解析库：`zip = "0.6"`

**数据结构定义**：

```rust
// src-tauri/src/services/odt_parser.rs

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

#[derive(Debug, Clone)]
pub enum DocumentNode {
    Heading(Heading),
    Paragraph(Paragraph),
    List(List),
    Table(Table),
}

#[derive(Debug, Clone)]
pub struct OdtStructure {
    pub nodes: Vec<DocumentNode>,  // 按文档顺序存储
    pub image_map: HashMap<String, Image>,  // 图片路径映射表
}

#[derive(Debug, Clone)]
pub struct Heading {
    pub level: u8,  // 1-6
    pub text: String,
    pub style: TextStyle,
}

#[derive(Debug, Clone)]
pub struct Paragraph {
    pub text_runs: Vec<TextRun>,
    pub images: Vec<ImageNode>,
    pub align: Option<String>,  // left, center, right, justify
    pub style: TextStyle,
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub path: String,
    pub position: ImagePosition,
    pub index: usize,
}

#[derive(Debug, Clone)]
pub enum ImagePosition {
    Start,
    Middle,
    End,
}

#[derive(Debug, Clone)]
pub struct TextRun {
    pub text: String,
    pub color: Option<String>,  // #RRGGBB
    pub font_family: Option<String>,
    pub font_size: Option<String>,  // 12pt
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub link: Option<String>,  // 超链接 URL
    pub image_ref: Option<String>,  // 图片引用路径
}

#[derive(Debug, Clone)]
pub struct List {
    pub items: Vec<ListItem>,
    pub ordered: bool,
}

#[derive(Debug, Clone)]
pub struct ListItem {
    pub text_runs: Vec<TextRun>,
    pub nested_level: u8,  // 0 = 顶级
    pub children: Vec<ListItem>,  // 嵌套列表项
}

#[derive(Debug, Clone)]
pub struct Table {
    pub rows: Vec<TableRow>,
    pub header_rows: Vec<TableRow>,
}

#[derive(Debug, Clone)]
pub struct TableRow {
    pub cells: Vec<TableCell>,
}

#[derive(Debug, Clone)]
pub struct TableCell {
    pub content: Vec<Paragraph>,
    pub is_header: bool,
    pub colspan: u32,
    pub rowspan: u32,
    pub is_merged: bool,
}

#[derive(Debug, Clone)]
pub struct Image {
    pub path: String,
    pub data: Vec<u8>,
    pub mime_type: String,
}

#[derive(Debug, Clone)]
pub struct TextStyle {
    pub color: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<String>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub parent_style: Option<String>,
}

pub struct OdtParser;
```

**具体任务**：

1. **创建 ODT 解析服务文件**
   - 创建 `src-tauri/src/services/odt_parser.rs`
   - 定义所有数据结构
   - 实现 `OdtParser` 结构体

2. **实现 ODT ZIP 解析**
   - 使用 `zip = "0.6"` 打开 ODT 文件
   - 读取 `content.xml` 文件
   - 读取 `styles.xml` 文件（用于样式继承）
   - 提取 `Pictures/` 目录下的所有图片文件

3. **实现 ODT XML 解析**
   - 使用 `quick-xml = "0.31"` 解析 XML
   - 支持命名空间解析（`text:`, `fo:`, `style:`, `table:`, `draw:` 等）
   - 按照文档顺序提取元素（标题、段落、列表、表格）
   - 使用 `DocumentNode` 枚举类型存储

4. **实现结构提取**
   - 提取标题（`<text:h level="1-6">`）
   - 提取段落（`<text:p>`）
   - 提取列表（`<text:list>`，支持嵌套）
   - 提取表格（`<table:table>`，处理合并单元格）

5. **实现样式提取**
   - 提取文本颜色（`fo:color="#RRGGBB"`）
   - 提取字体（`fo:font-family`）
   - 提取字号（`fo:font-size`）
   - 提取粗体（`fo:font-weight="bold"`）
   - 提取斜体（`fo:font-style="italic"`）
   - 提取下划线（`style:text-underline-style="solid"`）
   - 提取段落对齐（`fo:text-align`）

6. **实现样式继承处理**
   - 读取 `styles.xml` 建立样式映射表
   - 处理 `style:parent-style-name` 属性
   - 只继承一层（不处理多层继承）
   - 合并父样式和当前样式（当前样式优先级更高）
   - 实现 `resolve_style_inheritance()` 方法

7. **实现图片提取**
   - 从 ODT ZIP 中提取 `Pictures/` 目录下的所有图片文件
   - 建立图片路径映射表（`HashMap<String, Image>`）
   - 识别图片 MIME 类型（PNG、JPEG、GIF、WebP）
   - 实现图片压缩（大图片 > 1MB 时压缩，使用 `image = "0.24"`）
   - 实现 `extract_images()` 方法

8. **实现超链接提取**
   - 提取 `<text:a>` 标签的 `xlink:href` 属性
   - 提取链接文本（`<text:span>` 内容）
   - 嵌入到 `TextRun` 的 `link` 字段中

9. **实现图片位置处理**
   - 检测图片在段落中的位置（开头、中间、结尾）
   - 创建 `ImageNode` 结构，记录位置和索引
   - 添加到段落的 `images` 字段中

10. **实现表格合并单元格处理**
    - 检测 `table:number-columns-spanned` 属性
    - 检测 `table:number-rows-spanned` 属性
    - 第一个单元格：保留内容，设置 `colspan` 和 `rowspan`
    - 其他合并的单元格：设置 `is_merged = true`，不提取内容

11. **实现列表嵌套处理**
    - 检测列表项的嵌套层级（`nested_level`）
    - 使用 `children` 字段存储嵌套列表项
    - 递归处理嵌套列表

12. **实现不支持的格式跳过**
    - 跳过 `<draw:custom-shape>` 等不支持的形状元素
    - 跳过页眉页脚内容
    - 跳过 SmartArt、VBA 宏
    - 不生成任何 HTML，不保留占位符

13. **添加 Rust 依赖**
    - 在 `src-tauri/Cargo.toml` 中添加：
      - `zip = "0.6"`
      - `quick-xml = "0.31"`
      - `base64 = "0.22"`
      - `image = "0.24"`

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
- ✅ 不支持的格式正确跳过（不生成 HTML）

---

### 阶段3：HTML 生成服务实现（2-3天）

**目标**：实现 ODT 结构到 HTML 的转换

**技术实现**：
- 文件位置：`src-tauri/src/services/html_generator.rs`（新建文件）
- 结构体名称：`HtmlGenerator`
- 主要方法：`odt_structure_to_html()`
- base64 编码：使用 `base64 = "0.22"` 的 `base64::engine::general_purpose::STANDARD`

**具体任务**：

1. **创建 HTML 生成服务文件**
   - 创建 `src-tauri/src/services/html_generator.rs`
   - 定义 `HtmlGenerator` 结构体
   - 实现所有 HTML 生成方法

2. **实现按文档顺序生成 HTML**
   - 使用 `DocumentNode` 枚举遍历 `structure.nodes`
   - 按照文档顺序生成 HTML（不是按类型分组）
   - 实现 `odt_structure_to_html()` 主方法

3. **实现标题 HTML 生成**
   - 方法名称：`heading_to_html()`
   - 生成 `<h1>` 到 `<h6>` 标签
   - 应用内联样式（使用 `text_style_to_css()`）
   - 格式：`<h{level} style="{css}">{text}</h{level}>`

4. **实现段落 HTML 生成**
   - 方法名称：`paragraph_to_html()`
   - 合并文本运行和图片节点，按位置排序
   - 处理段落对齐（`text-align`）
   - 图片位置处理：
     - `ImagePosition::Start`：图片在第一个文本运行之前
     - `ImagePosition::Middle`：图片在对应的文本运行之后
     - `ImagePosition::End`：图片在最后一个文本运行之后
   - 使用 `ElementType` 枚举合并元素
   - 按位置排序后生成 HTML

5. **实现文本运行 HTML 生成**
   - 方法名称：`text_run_to_html()`
   - 生成内联样式（颜色、字体、字号、粗体、斜体、下划线）
   - 处理超链接：如果有 `link`，生成 `<a href="...">...</a>`
   - 处理图片引用：如果有 `image_ref`，在文本后插入图片
   - 格式：`<span style="{css}">{text}</span>` 或 `<a href="{url}">{text}</a>`

6. **实现列表 HTML 生成**
   - 方法名称：`list_to_html()`
   - 支持有序列表（`<ol>`）和无序列表（`<ul>`）
   - 支持嵌套列表（使用 `children` 字段递归生成）
   - 嵌套列表继承父列表的有序/无序属性
   - 格式：`<ol><li>...</li></ol>` 或 `<ul><li>...</li></ul>`

7. **实现表格 HTML 生成**
   - 方法名称：`table_to_html()`
   - 生成表头（`<thead>`）和表体（`<tbody>`）
   - 处理合并单元格：
     - 第一个单元格：保留内容，添加 `colspan` 和 `rowspan` 属性
     - 其他合并的单元格（`is_merged = true`）：生成空 `<td></td>`
   - 格式：`<table><thead>...</thead><tbody>...</tbody></table>`

8. **实现表格行 HTML 生成**
   - 方法名称：`table_row_to_html()`
   - 生成 `<tr>` 标签
   - 处理表头单元格（`<th>`）和普通单元格（`<td>`）
   - 跳过合并的单元格（`is_merged = true`）
   - 添加合并属性（`colspan` 和 `rowspan`）

9. **实现图片 HTML 生成**
   - 方法名称：`image_to_html()`
   - 使用 `base64 = "0.22"` 的 `base64::engine::general_purpose::STANDARD.encode()`
   - 生成 base64 data URL：`data:{mime_type};base64,{base64}`
   - 格式：`<img src="data:{mime_type};base64,{base64}" class="editor-image" />`

10. **实现文本样式转 CSS**
    - 方法名称：`text_style_to_css()`
    - 转换 `TextStyle` 结构为 CSS 字符串
    - 包含：颜色、字体、字号、粗体、斜体、下划线
    - 格式：`"color: #RRGGBB; font-family: Arial; font-size: 12pt; font-weight: bold; ..."`

**验收标准**：
- ✅ HTML 正确生成（按文档顺序）
- ✅ 内联样式正确应用（包括样式继承）
- ✅ 图片正确显示（base64，位置正确）
- ✅ 超链接正确显示
- ✅ 嵌套列表正确显示
- ✅ 合并单元格正确处理

---

### 阶段4：后端命令接口实现（1-2天）

**目标**：实现后端命令接口，集成所有服务

**技术实现**：
- 文件位置：`src-tauri/src/commands/file_commands.rs`
- 命令名称：`open_docx_for_edit`
- 复用命令：`create_draft_docx`（已存在，逻辑不变）

**具体任务**：

1. **实现 `open_docx_for_edit` 命令**
   - 文件大小检查：限制 100MB，超过则返回错误
   - 使用全局 LibreOffice 服务单例（`get_global_libreoffice_service()`）
   - 转换 DOCX → ODT（使用 `spawn_blocking` 执行同步方法）
   - 解析 ODT XML（使用 `spawn_blocking` 执行同步方法）
   - 生成 HTML（使用 `spawn_blocking` 执行同步方法）
   - 返回 HTML 字符串
   - 错误处理：LibreOffice 不可用、ODT 解析失败、文件过大等

2. **实现全局 LibreOffice 服务单例**
   - 使用 `once_cell::sync::Lazy` 和 `std::sync::Mutex`
   - 函数名称：`get_global_libreoffice_service()`
   - 返回类型：`Result<Arc<LibreOfficeService>, String>`
   - 所有命令共享同一个服务实例

3. **注册命令到 Tauri**
   - 在 `src-tauri/src/main.rs` 中注册 `open_docx_for_edit` 命令
   - 确保命令可被前端调用

4. **实现并发控制**
   - 限制并发转换数量为 10 个
   - 使用 `tokio::sync::Semaphore` 控制并发
   - 超过限制时返回错误提示

5. **添加必要的导入**
   - 导入 `OdtParser` 和 `HtmlGenerator`
   - 导入 `Arc`、`Mutex`、`Lazy` 等类型
   - 导入 `tokio::task::spawn_blocking`

**验收标准**：
- ✅ `open_docx_for_edit` 命令正常工作
- ✅ 文件大小检查正常工作（100MB 限制）
- ✅ 全局单例正常工作（所有命令共享服务实例）
- ✅ 并发控制正常工作（限制 10 个）
- ✅ 错误处理正确（LibreOffice 不可用、ODT 解析失败等）
- ✅ HTML 内容正确返回

---

### 阶段5：前端集成（1-2天）

**目标**：实现前端编辑模式切换，集成新命令

**技术实现**：
- 文件位置：`src/components/Editor/DocxPdfPreview.tsx`
- 方法名称：`handleCreateDraft()`
- 编辑器：TipTap（已安装，已配置所有需要的扩展）

**具体任务**：

1. **更新 `DocxPdfPreview` 组件的"编辑"按钮逻辑**
   - 文件位置：`src/components/Editor/DocxPdfPreview.tsx`
   - 更新 `handleCreateDraft()` 函数
   - 调用 `create_draft_docx` 创建草稿副本
   - 调用 `open_docx_for_edit` 获取 HTML 内容
   - 使用字符串操作提取文件名（不使用 `path` 模块）

2. **更新 `documentService.ts`**
   - 文件位置：`src/services/documentService.ts`
   - 编辑模式：从 `open_docx` 改为 `open_docx_for_edit`
   - 更新错误处理

3. **更新 `ReadOnlyBanner.tsx`**
   - 文件位置：`src/components/Editor/ReadOnlyBanner.tsx`
   - 编辑模式切换：从 `open_docx` 改为 `open_docx_for_edit`
   - 更新错误处理

4. **测试编辑功能**
   - 测试草稿副本创建
   - 测试 HTML 内容加载到 TipTap
   - 测试编辑功能（标题、段落、列表、表格、图片、超链接）
   - 测试样式显示（颜色、字体、字号、粗体、斜体、下划线、对齐）

**实现代码**：

```typescript
// src/components/Editor/DocxPdfPreview.tsx

const handleCreateDraft = async () => {
  if (!filePath) return;

  try {
    // 1. 创建草稿副本
    const draftPath = await invoke<string>('create_draft_docx', {
      originalPath: filePath,
    });

    // 2. 打开草稿文件进行编辑
    const htmlContent = await invoke<string>('open_docx_for_edit', {
      path: draftPath,
    });

    // 3. 打开草稿文件到新标签页
    const { useEditorStore } = await import('../../stores/editorStore');
    const { addTab, setActiveTab } = useEditorStore.getState();
    
    // 使用字符串操作提取文件名（不使用 path 模块）
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

**验收标准**：
- ✅ 编辑按钮正常工作
- ✅ 草稿副本正确创建
- ✅ HTML 内容正确加载到 TipTap
- ✅ 编辑功能正常工作（标题、段落、列表、表格、图片、超链接）
- ✅ 样式正确显示（颜色、字体、字号、粗体、斜体、下划线、对齐）

---

## 四、替换策略

### 4.1 替换原则

**核心原则**：稳定替换，不破坏现有功能

**替换方式**：并行实现新方案，逐步切换，最后清理旧代码

### 4.2 替换阶段

#### 阶段1：并行实现新方案（3-5天）

**目标**：实现新方案，但不替换旧方案，确保现有功能正常

**任务清单**：
1. 实现 `open_docx_for_edit` 命令（新命令，不替换 `open_docx`）
2. 实现 ODT 解析服务（`odt_parser.rs`）
3. 实现 HTML 生成服务（`html_generator.rs`）
4. 扩展 LibreOffice 服务（添加 `convert_docx_to_odt` 方法）
5. 实现全局 LibreOffice 服务单例
6. 测试新命令功能（独立测试，不影响现有功能）

**验收标准**：
- ✅ 新命令 `open_docx_for_edit` 正常工作
- ✅ 旧命令 `open_docx` 仍然正常工作
- ✅ 现有编辑功能不受影响

#### 阶段2：前端逐步切换（功能开关）（1-2天）

**目标**：前端添加功能开关，逐步切换到新方案

**任务清单**：
1. 创建功能开关文件：`src/config/featureFlags.ts`
   ```typescript
   export const USE_ODT_EDIT_MODE = import.meta.env.VITE_USE_ODT_EDIT_MODE === 'true' || false;
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

#### 阶段3：全面测试新方案（2-3天）

**目标**：全面测试新方案，确保稳定性和正确性

**任务清单**：
1. 功能测试：测试所有编辑功能（标题、段落、列表、表格、图片、超链接）
2. 样式测试：测试所有样式提取（颜色、字体、字号、粗体、斜体、下划线、对齐）
3. 兼容性测试：测试不同 DOCX 文件（简单格式、复杂格式、包含图片、包含超链接）
4. 性能测试：测试转换时间、HTML 生成时间、编辑器加载时间
5. 错误处理测试：测试 LibreOffice 不可用、ODT 解析失败、文件过大等错误场景

**验收标准**：
- ✅ 所有功能测试通过
- ✅ 所有样式测试通过
- ✅ 兼容性测试通过（至少 90% 的 DOCX 文件正确处理）
- ✅ 性能指标达标（转换时间 < 10 秒，HTML 生成 < 1 秒）
- ✅ 错误处理正确

#### 阶段4：切换默认方案（1天）

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

#### 阶段5：清理旧代码（1-2天）

**目标**：新方案稳定运行后，清理旧代码

**任务清单**：
1. 搜索确认 `open_docx` 的所有调用位置
   - `documentService.ts`：编辑模式使用
   - `ReadOnlyBanner.tsx`：编辑模式切换使用
   - `DocxPdfPreview.tsx`：编辑按钮使用
   - 确认是否被其他功能使用（搜索代码库）
2. 移除功能开关（不再需要）
   - 删除 `src/config/featureFlags.ts` 文件
   - 移除所有 `USE_ODT_EDIT_MODE` 判断逻辑
   - 统一使用 `open_docx_for_edit` 命令
3. 移除 `open_docx` 命令（编辑模式专用部分）
   - ⚠️ **注意**：如果 `open_docx` 被其他功能使用，需要保留或重构
   - ⚠️ **注意**：如果 `open_docx` 被预览模式使用，需要保留或重构
   - 文件位置：`src-tauri/src/commands/file_commands.rs`
4. 移除 `PandocService::convert_docx_to_html()`（编辑模式专用部分）
   - ⚠️ **注意**：如果预览模式使用，需要保留或重构
   - 文件位置：`src-tauri/src/services/pandoc_service.rs`
5. 移除 `extract_docx_formatting()` 和 `apply_docx_formatting()`（编辑模式专用部分）
   - ⚠️ **注意**：如果预览模式使用，需要保留或重构
   - 文件位置：`src-tauri/src/services/pandoc_service.rs`
6. 更新文档：更新所有相关文档，移除旧方案说明
   - `DOCX处理技术方案.md`
   - `Binder产品开发方案.md`
   - `binder开发协同.md`

**验收标准**：
- ✅ 旧代码已清理
- ✅ 新方案正常工作
- ✅ 没有功能回归
- ✅ 代码库更简洁

---

## 五、验收标准

### 5.1 功能完整性

- ✅ 标题层级正确提取（H1-H6）
- ✅ 段落对齐正确提取（左、中、右、两端对齐）
- ✅ 文本样式正确提取（颜色、字体、字号、粗体、斜体、下划线）
- ✅ 列表结构正确提取（有序、无序，支持嵌套）
- ✅ 表格结构正确提取（基础表格，合并单元格处理）
- ✅ 图片正确提取和显示（base64，位置正确）
- ✅ 超链接正确提取和显示
- ✅ 不支持的格式正确跳过（不生成 HTML）

### 5.2 编辑器兼容性

- ✅ HTML 内容正确加载到 TipTap
- ✅ 所有样式正确显示（颜色、字体、字号、粗体、斜体、下划线、对齐）
- ✅ 图片正确显示（base64 data URL）
- ✅ 超链接正确显示（可点击）
- ✅ 编辑功能正常工作（标题、段落、列表、表格、图片、超链接）

### 5.3 性能指标

- ✅ 转换时间：首次 < 10 秒，缓存后 < 3 秒
- ✅ HTML 生成时间：< 1 秒
- ✅ 编辑器加载时间：< 1 秒
- ✅ 文件大小限制：100MB
- ✅ 并发转换限制：10 个

### 5.4 错误处理

- ✅ LibreOffice 不可用时，提示失败并建议创建草稿
- ✅ ODT 解析失败时，提示错误信息
- ✅ 图片提取失败时，跳过图片，继续处理其他内容
- ✅ 超链接提取失败时，提取为普通文本
- ✅ 文件过大时，提示错误信息（100MB 限制）
- ✅ 并发超限时，提示错误信息（10 个限制）

---

## 六、开发依赖

### 6.1 Rust 依赖

**已添加的依赖**：
- `once_cell = "1.19"`：全局单例（LibreOffice 服务复用）
- `zip = "0.6"`：ODT ZIP 解析
- `quick-xml = "0.31"`：ODT XML 解析（支持命名空间）
- `base64 = "0.22"`：图片 base64 编码
- `image = "0.24"`：图片压缩（大图片 > 1MB）

**已存在的依赖**：
- `tokio = { version = "1", features = ["rt-multi-thread"] }`：异步运行时（并发处理）

### 6.2 前端依赖

**已安装的依赖**：
- TipTap 编辑器（已安装，已配置所有需要的扩展）
- React + TypeScript（已安装）
- Tailwind CSS（已安装）

### 6.3 外部工具

**LibreOffice**：
- 内置 LibreOffice（macOS：`LibreOffice.app`）
- 命令行工具：`soffice`
- 转换命令：`soffice --headless --convert-to odt --outdir <output> <docx>`

**Pandoc**：
- 已安装（保持不变）
- 保存时使用：`pandoc -f html -t docx -o <output> <input>`

---

## 七、风险控制

### 7.1 技术风险

**风险1：LibreOffice 转换失败**
- **影响**：无法打开 DOCX 文件进行编辑
- **应对**：提示失败并建议创建草稿
- **监控**：记录错误日志，收集用户反馈

**风险2：ODT 解析失败**
- **影响**：无法提取文档内容和样式
- **应对**：提示错误信息，不提供降级方案
- **监控**：记录错误日志，分析失败原因

**风险3：样式提取不完整**
- **影响**：部分样式丢失，显示不正确
- **应对**：只提取 AI 样式子集，不支持的样式跳过
- **监控**：对比测试，确保核心样式正确提取

### 7.2 性能风险

**风险1：转换时间过长**
- **影响**：用户体验差，等待时间长
- **应对**：实现缓存机制（ODT 缓存 1 小时），优化转换参数
- **监控**：记录转换时间，确保首次 < 10 秒，缓存后 < 3 秒

**风险2：大文件处理慢**
- **影响**：大文件转换和解析时间长
- **应对**：限制文件大小（100MB），支持流式处理
- **监控**：记录文件大小和处理时间

**风险3：并发处理压力**
- **影响**：多个文件同时转换导致系统负载高
- **应对**：限制并发数量（10 个），使用信号量控制
- **监控**：记录并发数量和处理时间

### 7.3 兼容性风险

**风险1：不同 DOCX 格式兼容性**
- **影响**：部分 DOCX 文件无法正确处理
- **应对**：兼容性测试，确保至少 90% 的 DOCX 文件正确处理
- **监控**：收集用户反馈，分析失败案例

**风险2：复杂格式处理**
- **影响**：复杂格式（合并单元格、嵌套列表等）处理不正确
- **应对**：明确处理策略（合并单元格保留第一个，嵌套列表使用 children）
- **监控**：对比测试，确保核心功能正常

### 7.4 替换风险

**风险1：新方案不稳定**
- **影响**：编辑功能不可用
- **应对**：保留旧方案作为降级，功能开关可以快速切换
- **监控**：收集错误日志和用户反馈

**风险2：功能回归**
- **影响**：现有功能丢失或损坏
- **应对**：全面测试，确保所有功能正常工作
- **监控**：对比测试，确保新方案功能不弱于旧方案

**风险3：代码清理不彻底**
- **影响**：代码库冗余，维护困难
- **应对**：搜索确认所有调用位置，彻底清理旧代码
- **监控**：代码审查，确保没有遗留代码

---

## 八、开发注意事项

### 8.1 特殊内容处理

- ✅ **图片**：提取并转换为 base64，TipTap 支持
- ✅ **超链接**：提取并生成标准 HTML `<a>` 标签，TipTap 支持
- ❌ **图标/形状**：不提取，TipTap 不支持，果断放弃
- ❌ **复杂文本框**：提取文本内容，作为普通段落处理
- ❌ **页眉页脚**：不提取，TipTap 不支持
- ❌ **SmartArt、VBA 宏**：不提取，TipTap 不支持

### 8.2 样式处理

- ✅ **AI 样式子集**：只提取基础样式，不处理复杂样式
- ✅ **样式继承**：只处理一层继承（不处理多层继承链）
- ❌ **复杂表格格式**：不保留合并单元格边框样式、表格网格等
- ❌ **复杂文本格式**：不处理文本方向、字符间距等

### 8.3 数据结构设计

- ✅ **按文档顺序存储**：使用 `DocumentNode` 枚举，按文档顺序存储所有元素
- ✅ **图片映射表**：使用 `HashMap<String, Image>` 建立图片路径映射
- ✅ **嵌套列表**：使用 `children` 字段存储嵌套列表项
- ✅ **合并单元格**：第一个单元格保留内容和属性，其他设置为 `is_merged = true`

### 8.4 错误处理

- ✅ **LibreOffice 不可用**：提示失败并建议创建草稿
- ✅ **ODT 解析失败**：提示错误信息，不提供降级方案
- ✅ **图片提取失败**：跳过图片，继续处理其他内容，日志记录
- ✅ **超链接提取失败**：提取为普通文本，日志记录
- ✅ **文件过大**：提示错误信息（100MB 限制）
- ✅ **并发超限**：提示错误信息（10 个限制）

### 8.5 性能优化

- ✅ **缓存机制**：ODT 文件缓存 1 小时（文件路径 + 修改时间）
- ✅ **并发控制**：限制并发转换数量为 10 个
- ✅ **图片压缩**：大图片 > 1MB 时压缩
- ✅ **流式处理**：支持大文件流式处理
- ✅ **全局单例**：LibreOffice 服务使用全局单例，复用实例

### 8.6 替换策略

- ✅ **并行实现**：新方案和旧方案并行存在，不破坏现有功能
- ✅ **功能开关**：使用前端功能开关，逐步切换
- ✅ **全面测试**：功能测试、样式测试、兼容性测试、性能测试
- ✅ **稳定切换**：新方案稳定后切换为默认，保留旧方案作为降级
- ✅ **彻底清理**：新方案稳定后，彻底清理旧代码

---

## 九、参考文档

- `DOCX处理技术方案.md`：技术方案概述（LibreOffice + ODT 方案）
- `DOCX编辑模式开发方案.md`：编辑模式开发方案（详细技术方案）
- `DOCX预览模式开发计划.md`：预览模式开发计划（LibreOffice 服务复用）
- `Binder产品需求文档.md`：产品需求定义
- `Binder产品开发方案.md`：产品开发方案
- `binder开发协同.md`：开发协同文档（命令定义、事件定义）
- `文档编辑器完整技术方案.md`：编辑器技术方案

---

## 十、开发时间表

### 10.1 阶段时间估算

- **阶段1：LibreOffice ODT 转换服务**：1-2 天
- **阶段2：ODT 解析服务实现**：3-5 天
- **阶段3：HTML 生成服务实现**：2-3 天
- **阶段4：后端命令接口实现**：1-2 天
- **阶段5：前端集成**：1-2 天
- **替换阶段1：并行实现新方案**：3-5 天
- **替换阶段2：前端逐步切换**：1-2 天
- **替换阶段3：全面测试**：2-3 天
- **替换阶段4：切换默认方案**：1 天
- **替换阶段5：清理旧代码**：1-2 天

### 10.2 总工期

**预计总工期**：8-12 天（开发）+ 8-13 天（替换）= **16-25 天**

**关键路径**：
1. 阶段2（ODT 解析服务）→ 阶段3（HTML 生成服务）→ 阶段4（后端命令接口）→ 阶段5（前端集成）
2. 替换阶段1（并行实现）→ 替换阶段2（前端切换）→ 替换阶段3（全面测试）→ 替换阶段4（切换默认）→ 替换阶段5（清理代码）

---

**文档状态**：✅ **可执行开发计划**

**最后更新**：2025-01