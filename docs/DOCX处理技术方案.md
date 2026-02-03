# DOCX 处理技术方案

## 文档信息
- **版本**：v2.0（LibreOffice + ODT 方案）
- **创建日期**：2025-01
- **方案状态**：✅ **最终确定方案**
- **核心原则**：基于技术事实，明确技术方向，不再摇摆

---

## 一、技术方案概述

### 1.1 核心决策

**技术方向**：
- **预览模式**：LibreOffice + PDF 方案
- **编辑模式**：Pandoc + CSS 样式表方案（三层样式处理策略）

**决策依据**：
1. **预览模式**：LibreOffice 转换为 PDF，完美保留格式，适合只读预览
2. **编辑模式**：Pandoc 转换 + CSS 样式表，简单稳定，确保内容完整性
3. **三层样式处理**：提取样式（100% 复现）+ 预设样式（层次化展示）+ 工具样式（完整编辑能力）

### 1.2 方案架构

```
┌─────────────────────────────────────────────────────────┐
│              DOCX 处理技术架构                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  预览模式（完全独立）                                      │
│  DOCX → LibreOffice → PDF → iframe + data URL           │
│                                                           │
│  编辑模式（完全独立）                                      │
│  DOCX → Pandoc → HTML → CSS样式表 → TipTap               │
│  （三层样式处理：提取样式 + 预设样式 + 工具样式）          │
│                                                           │
│  保存模式（完全独立）                                      │
│  TipTap HTML → Pandoc → DOCX                             │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**关键原则**：
- ✅ 预览模式和编辑模式完全分离，无功能黏连
- ✅ 预览模式使用 LibreOffice（PDF 转换）
- ✅ 编辑模式使用 Pandoc（三层样式处理策略）
- ✅ 文件树显示原 DOCX 文件，用户感知不到变化
- ✅ 编辑模式采用三层样式处理：提取样式（100% 复现）+ 预设样式（层次化展示）+ 工具样式（完整编辑能力）

---

## 二、预览模式技术方案

### 2.1 功能需求

**用户场景**：
- 用户点击外部导入的 DOCX 文件
- 系统识别为预览模式（`isReadOnly = true`）
- 显示预览界面，用户可查看文档内容

**功能要求**：
- 文本选中和复制（浏览器原生支持）
- 打印功能（工具栏按钮）
- 缩放功能（浏览器原生支持，工具栏提示）
- 搜索功能（浏览器原生 Cmd+F，工具栏提示）
- 页码显示和页面跳转（浏览器原生支持）
- 模拟 Word 页面效果（PDF 格式自动支持）
- 暗色模式适配（浏览器原生支持）
- 编辑功能（创建草稿并切换到编辑模式）

### 2.2 技术路线

#### 2.2.1 后端转换（LibreOffice）

**技术栈**：
- LibreOffice 命令行工具（`soffice`）
- Rust 标准库（`std::process::Command`）

**转换流程**：
```
DOCX 文件
  ↓
检查缓存（文件路径 + 修改时间）
  ↓
缓存命中 → 返回 PDF 路径
  ↓
缓存未命中 → LibreOffice 转换
  ↓
soffice --headless --convert-to pdf:writer_pdf_Export:UseTaggedPDF=1:SelectPdfVersion=1:EmbedStandardFonts=1:EmbedLatinScriptFonts=1:EmbedAsianScriptFonts=1 --outdir <output> <docx>
  ↓
生成 PDF 文件
  ↓
缓存 PDF 路径（1小时过期）
  ↓
返回 PDF 路径（file:// 绝对路径）
```

**LibreOffice 服务设计**：
```rust
// src-tauri/src/services/libreoffice_service.rs
pub struct LibreOfficeService {
    libreoffice_path: PathBuf,        // LibreOffice 可执行文件路径
    cache_dir: PathBuf,               // 缓存目录
    cache_duration: Duration,         // 缓存过期时间（1小时）
}

impl LibreOfficeService {
    // 检测 LibreOffice 是否可用
    pub fn is_available(&self) -> bool;
    
    // 转换 DOCX → PDF（带缓存）
    pub async fn convert_docx_to_pdf(
        &self,
        docx_path: &Path,
    ) -> Result<PathBuf, String>;
    
    // 检查缓存
    fn check_cache(&self, docx_path: &Path) -> Option<PathBuf>;
    
    // 执行转换
    fn execute_conversion(&self, docx_path: &Path, output_dir: &Path) -> Result<PathBuf, String>;
}
```

**LibreOffice 安装策略**：
- **内置方案**：LibreOffice 作为应用内置组件
  - 打包 LibreOffice 到应用安装包中
  - 应用首次启动时解压到应用数据目录
  - 应用体积增加约 180MB（一次性）
  - 无需用户手动安装，开箱即用
  - 无需网络连接

**LibreOffice 路径管理**：
- 内置 LibreOffice 路径：应用数据目录下的 `libreoffice/` 文件夹
- 启动时检测内置 LibreOffice 是否已解压
- 未解压时自动解压（首次启动）
- 解压后检测可执行文件是否可用

**错误处理**：
- 内置 LibreOffice 解压失败时，提示用户失败原因，建议手动创建草稿进行编辑
- 内置 LibreOffice 不可用时，提示用户失败原因，建议手动创建草稿进行编辑
- 不提供 HTML 预览降级方案（弃用）

#### 2.2.2 前端渲染（iframe + data URL）

**技术栈**：
- React + TypeScript
- 浏览器原生 PDF 查看器（iframe + data URL）

**组件设计**：
```typescript
// src/components/Editor/DocxPdfPreview.tsx
const DocxPdfPreview: React.FC<{ filePath: string }> = ({ filePath }) => {
  // 1. 调用后端转换（preview_docx_as_pdf）
  // 2. 读取 PDF 文件为 base64（read_file_as_base64）
  // 3. 创建 data URL（data:application/pdf;base64,...）
  // 4. 使用 iframe 加载 data URL（浏览器原生 PDF 查看器）
  // 5. 实现工具栏（打印、编辑按钮，搜索和缩放提示）
};
```

**渲染方案**：
- ✅ 使用 iframe + data URL（浏览器原生 PDF 查看器）
- ✅ 支持滚动浏览（浏览器原生）
- ✅ 支持文本选择和复制（浏览器原生）
- ✅ 支持浏览器原生搜索（Cmd+F）
- ✅ 支持浏览器原生缩放
- ❌ 不使用 PDF.js Canvas 渲染（会导致无法滚动和选择文本）

### 2.3 后端命令接口

```rust
// src-tauri/src/commands/file_commands.rs

/// 预览 DOCX 文件（预览模式专用）
/// 
/// **功能**：转换 DOCX → PDF，返回 PDF 文件路径
/// 
/// **使用场景**：
/// - DocxPdfPreview 组件内部调用
/// - 预览模式（isReadOnly = true）
/// 
/// **返回**：PDF 文件路径（file:// 绝对路径）
/// 
/// **缓存机制**：
/// - 缓存键：文件路径 + 修改时间
/// - 缓存过期：1 小时
/// - 缓存位置：应用缓存目录
#[tauri::command]
pub async fn preview_docx_as_pdf(
    path: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
  // 1. 检查 LibreOffice 可用性
  // 2. 检查缓存
  // 3. 转换 DOCX → PDF（LibreOffice，带30秒超时）
  // 4. 缓存 PDF 路径
  // 5. 返回 PDF 路径（file:// 绝对路径）
  // 6. 发送 preview-progress 事件（"正在预览..."）
}

```

### 2.4 前端组件接口

```typescript
// src/components/Editor/DocxPdfPreview.tsx

interface DocxPdfPreviewProps {
  filePath: string;  // DOCX 文件路径
}

const DocxPdfPreview: React.FC<DocxPdfPreviewProps> = ({ filePath }) => {
  // 1. 调用 preview_docx_as_pdf 获取 PDF 路径
  // 2. 使用 read_file_as_base64 读取 PDF 为 base64
  // 3. 创建 data URL（data:application/pdf;base64,...）
  // 4. 使用 iframe 加载 data URL（浏览器原生 PDF 查看器）
  // 5. 实现工具栏（打印、编辑按钮，搜索和缩放提示）
};
```

---

## 三、编辑模式技术方案

### 3.1 功能需求

**用户场景**：
- 用户点击"编辑"按钮（从预览模式切换）
- 系统创建草稿副本（`document.draft.docx`）
- 提取样式子集和内容，在草稿副本中复现
- 加载到 TipTap 编辑器，用户可编辑

**样式子集要求**（AI 编辑所需的基础样式）：
- 标题层级（H1-H6）
- 段落对齐（左、中、右、两端对齐）
- 文本颜色、字体、字号
- 粗体、斜体、下划线
- 列表结构（有序、无序）
- 表格结构（基础表格）
- 图片（嵌入图片）

**不处理的复杂格式**：
- 页眉页脚
- 复杂文本框布局
- SmartArt、VBA 宏
- 复杂样式继承链
- 复杂表格格式（合并单元格、边框样式等）

### 3.2 技术路线（三层样式处理策略）

#### 3.2.1 后端转换（Pandoc → HTML + CSS 样式表）

**技术栈**：
- Pandoc（DOCX → HTML）
- Rust 标准库（`std::process::Command`）
- 字符串处理（CSS 类转换、样式表插入）

**转换流程**：
```
DOCX 文件
  ↓
Pandoc 转换 DOCX → HTML
  （提取基础样式：标题、粗体、斜体、下划线、列表、图片、表格、段落对齐）
  ↓
CSS 类转换为内联样式（段落对齐）
  ↓
添加预设样式表（CSS 样式表，不修改 HTML）
  （字体：Arial，字号：3 级体系）
  ↓
返回 HTML（可直接加载到 TipTap）
```

**Pandoc 服务扩展**：
```rust
impl PandocService {
    // 转换 DOCX → HTML（三层样式处理）
    pub fn convert_document_to_html(&self, doc_path: &Path) -> Result<String, String> {
        // 1. Pandoc 转换
        // 2. CSS 类转换为内联样式
        // 3. 添加预设样式表
    }
    
    // CSS 类转换为内联样式（段落对齐）
    fn convert_css_classes_to_inline_styles(html: &str) -> String;
    
    // 添加预设样式表（CSS 样式表）
    fn apply_preset_styles(html: &str) -> String;
}
```

#### 3.2.2 三层样式处理策略

**层次 1：提取样式层（100% 复现）**

**技术栈**：
- Pandoc（DOCX → HTML）
- 字符串处理（CSS 类转换）

**提取范围**：
- 标题层级（H1-H6）：Pandoc 直接输出 `<h1>`-`<h6>` 标签
- 粗体、斜体、下划线：Pandoc 直接输出 `<strong>`, `<em>`, `<u>` 标签
- 列表结构（有序、无序）：Pandoc 直接输出 `<ul>`, `<ol>`, `<li>` 标签
- 图片（嵌入图片）：Pandoc 直接输出 `<img>` 标签，保留路径
- 表格结构（基础表格）：Pandoc 直接输出 `<table>`, `<tr>`, `<td>` 标签
- 段落对齐：通过 CSS 类转换为内联样式

**CSS 类转换**：
```rust
// 只转换段落对齐相关的 CSS 类
fn convert_css_classes_to_inline_styles(html: &str) -> String {
    // 转换 class="center" → style="text-align: center"
    // 转换 class="text-center" → style="text-align: center"
    // ... 其他对齐类
}
```

**层次 2：预设样式层（层次化展示）**

**技术栈**：
- CSS 样式表（不修改 HTML）

**预设样式**：
- 字体：Arial（统一标准）
- 字号：3 级体系（大 24px、中 18px、小 14px）
- 自动套用：通过 CSS 选择器自动应用到标题和正文

**CSS 样式表插入**：
```rust
// 添加预设样式表到 HTML（不修改 HTML 结构）
fn apply_preset_styles(html: &str) -> String {
    // 在 </head> 标签前插入 <style> 标签
    // 如果 HTML 没有 <head>，在 <body> 前添加
}
```

**层次 3：工具样式层（完整编辑能力）**

**技术栈**：
- TipTap 编辑器（已支持的功能）

**工具栏样式**：
- 文本格式：粗体、斜体、下划线、删除线、上标、下标
- 标题：H1-H6
- 列表：有序、无序
- 对齐：左、中、右、两端对齐
- 颜色：文本颜色、背景颜色
- 字体：字体族、字号
- 其他：代码块、行内代码、引用块、水平线
- 媒体：链接、图片
- 表格：插入表格、表格操作

### 3.3 后端命令接口

```rust
// src-tauri/src/commands/file_commands.rs

/// 打开 DOCX 文件用于编辑（编辑模式专用）
/// 
/// **功能**：转换 DOCX → HTML（三层样式处理策略）
/// 
/// **使用场景**：
/// - 编辑模式（新建/AI生成/点击编辑）
/// - TipTap 编辑器显示
/// 
/// **处理流程**：
/// 1. Pandoc 转换 DOCX → HTML（提取基础样式）
/// 2. CSS 类转换为内联样式（段落对齐）
/// 3. 添加预设样式表（CSS 样式表，不修改 HTML）
/// 4. 返回 HTML 字符串
/// 
/// **返回**：HTML 内容（可直接加载到 TipTap）
#[tauri::command]
pub async fn open_docx_for_edit(path: String) -> Result<String, String> {
    let docx_path = PathBuf::from(&path);
    
    // 1. 检查文件是否存在和大小
    // 2. 使用 PandocService 转换（包含三层样式处理）
    let pandoc_service = PandocService::new();
    let html = pandoc_service.convert_document_to_html(&docx_path)?;
    
    Ok(html)
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
    // 1. 检查原文件是否存在
    // 2. 生成草稿文件路径（document.draft.docx）
    // 3. 如果草稿文件已存在，先删除
    // 4. 复制原文件到草稿文件
    // 5. 返回草稿文件路径
}
```

### 3.4 前端组件接口

```typescript
// src/components/Editor/EditorPanel.tsx

// 编辑模式打开 DOCX
const htmlContent = await invoke<string>('open_docx_for_edit', {
  docxPath: filePath,
});

// TipTap 编辑器加载 HTML 内容
<TipTapEditor
  content={htmlContent}
  onChange={handleContentChange}
  onSave={handleSave}
  editable={true}
/>
```

---

## 四、保存模式技术方案

### 4.1 功能需求

**用户场景**：
- 用户在 TipTap 编辑器中编辑内容
- 用户保存文件（自动保存或手动保存）
- 系统将 HTML 内容转换为 DOCX 格式
- 保存到原文件或草稿文件

**保存要求**：
- 保留编辑的格式（标题、段落、列表、表格、图片等）
- 保存为 DOCX 格式（标准 Office 格式）
- 支持自动保存和手动保存
- 保存进度提示

### 4.2 技术路线

#### 4.2.1 后端转换（Pandoc）

**技术栈**：
- Pandoc（HTML → DOCX 转换）
- Rust 标准库（`std::process::Command`）

**转换流程**：
```
TipTap HTML 内容
  ↓
Pandoc 转换 HTML → DOCX
  ↓
保存到目标文件（原文件或草稿文件）
  ↓
发送保存进度事件
```

**Pandoc 命令**：
```bash
pandoc --from=html --to=docx --output=<output.docx> <input.html>
```

**保存服务设计**：
```rust
// src-tauri/src/services/pandoc_service.rs

impl PandocService {
    /// 保存 HTML 内容为 DOCX
    pub async fn save_html_to_docx(
        &self,
        html_content: &str,
        output_path: &Path,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        // 1. 检查 Pandoc 可用性
        // 2. 创建临时 HTML 文件
        // 3. 执行 Pandoc 转换
        // 4. 移动输出文件到目标位置
        // 5. 发送保存进度事件
        // 6. 清理临时文件
    }
}
```

### 4.3 后端命令接口

```rust
// src-tauri/src/commands/file_commands.rs

/// 保存 DOCX 文件（将 HTML 内容转换为 DOCX）
/// 
/// **功能**：转换 HTML → DOCX，保存到目标文件
/// 
/// **使用场景**：
/// - 自动保存（2秒防抖后）
/// - 手动保存（Cmd/Ctrl + S）
/// - 另存为功能
/// 
/// **处理流程**：
/// 1. 检查 Pandoc 可用性
/// 2. 创建临时 HTML 文件
/// 3. 执行 Pandoc 转换（HTML → DOCX）
/// 4. 移动输出文件到目标位置
/// 5. 发送保存进度事件
/// 6. 清理临时文件
/// 
/// **进度事件**：
/// - "started"：开始保存
/// - "converting"：转换中（progress: 0-100）
/// - "completed"：保存完成
/// - "failed"：保存失败（error 信息）
#[tauri::command]
pub async fn save_docx(
    path: String,
    html_content: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 1. 检查 Pandoc 可用性
    // 2. 创建临时 HTML 文件
    // 3. 执行 Pandoc 转换
    // 4. 移动输出文件到目标位置
    // 5. 发送保存进度事件
    // 6. 清理临时文件
}
```

---

## 五、共享接口设计

### 5.1 LibreOffice 服务（共享）

**服务位置**：`src-tauri/src/services/libreoffice_service.rs`

**功能**：
- 检测 LibreOffice 可用性
- 转换 DOCX → PDF（预览模式）
- 转换 DOCX → ODT（编辑模式）
- 缓存管理（共享缓存目录）

**接口设计**：
```rust
pub struct LibreOfficeService {
    libreoffice_path: PathBuf,        // LibreOffice 可执行文件路径
    cache_dir: PathBuf,               // 缓存目录（共享）
    cache_duration: Duration,         // 缓存过期时间（1小时）
}

impl LibreOfficeService {
    /// 创建服务实例（单例模式）
    /// 自动检测并初始化内置 LibreOffice
    pub fn new() -> Result<Self, String>;
    
    /// 初始化内置 LibreOffice（首次启动时解压）
    fn initialize_builtin_libreoffice(&self) -> Result<PathBuf, String>;
    
    /// 检测 LibreOffice 是否可用（内置或系统）
    pub fn is_available(&self) -> bool;
    
    /// 获取 LibreOffice 路径（优先内置，降级到系统）
    pub fn get_libreoffice_path(&self) -> &Path;
    
    /// 转换 DOCX → PDF（预览模式）
    pub async fn convert_docx_to_pdf(
        &self,
        docx_path: &Path,
    ) -> Result<PathBuf, String>;
    
    /// 转换 DOCX → ODT（编辑模式）
    pub async fn convert_docx_to_odt(
        &self,
        docx_path: &Path,
    ) -> Result<PathBuf, String>;
    
    /// 检查缓存（共享缓存逻辑）
    fn check_cache(&self, docx_path: &Path, output_ext: &str) -> Option<PathBuf>;
    
    /// 执行转换（共享转换逻辑）
    fn execute_conversion(
        &self,
        docx_path: &Path,
        output_dir: &Path,
        output_format: &str,  // "pdf" 或 "odt"
    ) -> Result<PathBuf, String>;
}
```

### 5.2 缓存管理（共享）

**缓存策略**：
- 缓存键：文件路径 + 修改时间 + 输出格式
- 缓存位置：应用缓存目录（`~/.cache/binder/` 或 `%APPDATA%/binder/cache/`）
- 缓存过期：1 小时
- 缓存清理：定期清理过期缓存（启动时或后台任务）

**缓存目录结构**：
```
~/.cache/binder/
├── preview/          # 预览模式缓存（PDF）
│   └── <hash>.pdf
└── edit/            # 编辑模式缓存（ODT）
    └── <hash>.odt
```

**缓存服务设计**：
```rust
// src-tauri/src/services/cache_service.rs

pub struct CacheService {
    cache_dir: PathBuf,
    cache_duration: Duration,
}

impl CacheService {
    /// 生成缓存键
    fn generate_cache_key(
        &self,
        file_path: &Path,
        output_format: &str,
    ) -> String {
        // 文件路径 + 修改时间 + 输出格式
        // 使用 SHA256 哈希
    }
    
    /// 检查缓存
    fn get_cached_file(
        &self,
        cache_key: &str,
        output_format: &str,
    ) -> Option<PathBuf>;
    
    /// 保存缓存
    fn save_cache(
        &self,
        cache_key: &str,
        output_format: &str,
        file_path: &Path,
    ) -> Result<(), String>;
    
    /// 清理过期缓存
    fn cleanup_expired_cache(&self) -> Result<(), String>;
}
```

### 5.3 事件通信（共享）

**预览进度事件**：
```rust
// src-tauri/src/services/preview_service.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewProgressEvent {
    pub status: String,      // "started", "converting", "completed", "failed"
    pub progress: u32,       // 0-100
    pub message: String,
}

// 发送事件
app_handle.emit("preview-progress", PreviewProgressEvent { ... })?;
```

**编辑进度事件**：
```rust
// src-tauri/src/services/edit_service.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditProgressEvent {
    pub status: String,      // "started", "converting", "parsing", "completed", "failed"
    pub progress: u32,       // 0-100
    pub message: String,
}

// 发送事件
app_handle.emit("edit-progress", EditProgressEvent { ... })?;
```

**保存进度事件**：
```rust
// src-tauri/src/services/pandoc_service.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProgressEvent {
    pub status: String,      // "started", "converting", "completed", "failed"
    pub progress: u32,       // 0-100
    pub message: String,
    pub error: Option<String>,
}

// 发送事件
app_handle.emit("fs-save-progress", SaveProgressEvent { ... })?;
```

---

## 六、替换方案（平稳安全替换）

### 6.1 替换原则

**核心原则**：
- ✅ 渐进式替换：先实现新方案，再逐步替换旧方案
- ✅ 功能开关：使用功能开关控制新旧方案
- ✅ 降级机制：新方案失败时自动降级到旧方案
- ✅ 向后兼容：保持现有接口不变，内部实现替换

### 6.2 替换阶段

#### 阶段1：基础服务实现（1-2周）

**目标**：实现新方案的基础服务，不替换现有功能

**任务**：
1. 实现 `LibreOfficeService`（内置 LibreOffice 管理、检测、转换、缓存）
2. 实现内置 LibreOffice 解压逻辑（首次启动时解压到应用数据目录）
3. 实现 `OdtParser`（ODT XML 解析）
4. 实现 `HtmlGenerator`（ODT 结构 → HTML）

**验证**：
- 单元测试：测试各个服务的功能
- 集成测试：测试完整的转换流程
- 性能测试：测试转换速度和缓存效果

#### 阶段2：预览模式替换（1周）

**目标**：替换预览模式，使用 PDF 方案

**替换步骤**：
1. 实现 `preview_docx_as_pdf` 命令（新接口）
2. 实现 `DocxPdfPreview` 组件（前端）
3. 实现错误处理（LibreOffice 不可用时提示失败，建议创建草稿）
4. 修改 `EditorPanel`：DOCX 文件（只读模式）使用 `DocxPdfPreview`
5. 移除旧的 `preview_docx` 命令和 `DocxPreview` 组件
6. 测试验证：确保预览功能正常

**错误处理机制**：
- 内置 LibreOffice 解压失败时，提示用户失败原因，建议手动创建草稿进行编辑
- 内置 LibreOffice 不可用时，检测系统是否已安装
- 系统 LibreOffice 也不可用时，提示用户失败原因，建议手动创建草稿进行编辑
- 不提供 HTML 预览降级方案（弃用）

**回滚方案**：
- 如果新方案有问题，可以通过功能开关禁用（但不再提供 HTML 预览降级）

#### 阶段3：编辑模式替换（1-2周）

**目标**：替换编辑模式，使用 ODT 方案

**替换步骤**：
1. 实现 `open_docx_for_edit` 命令（新接口）
2. 添加功能开关：`USE_ODT_EDIT`（环境变量或配置）
3. 修改 `documentService.openFile`：根据开关选择命令
4. 测试验证：确保编辑功能正常

**降级机制**：
- 内置 LibreOffice 解压失败时，降级到 Pandoc 方案
- 内置 LibreOffice 不可用时，检测系统是否已安装
- 系统 LibreOffice 也不可用时，降级到 Pandoc 方案

**数据迁移**：
- 现有草稿文件继续使用旧方案打开
- 新创建的草稿文件使用新方案
- 逐步迁移现有草稿文件（可选）

#### 阶段4：清理旧代码（1周）

**目标**：移除旧方案代码，保留核心功能

**清理步骤**：
1. 确认新方案稳定运行（1-2周）
2. 移除 `preview_docx` 命令（HTML 预览，已弃用）
3. 移除 `DocxPreview` 组件（HTML 预览组件，已弃用）
4. 移除 `extract_docx_formatting` 函数（不再需要）
5. 移除 `apply_docx_formatting` 函数（不再需要）
6. 移除 `convert_docx_to_html_preview` 函数（预览模式已替换）
7. 保留 `convert_css_classes_to_inline_styles`（可能仍有用）
8. 更新文档和注释

**保留内容**：
- `open_docx` 命令（作为降级方案保留，用于编辑模式）
- Pandoc 服务（保存功能仍需要）

**移除内容**：
- `preview_docx` 命令（HTML 预览，已弃用）
- `DocxPreview` 组件（HTML 预览组件，已弃用）

### 6.3 功能开关设计

**配置位置**：`src-tauri/src/config.rs` 或环境变量

**开关定义**：
```rust
// src-tauri/src/config.rs

pub struct FeatureFlags {
    pub use_pdf_preview: bool,      // 使用 PDF 预览（默认：true）
    pub use_odt_edit: bool,         // 使用 ODT 编辑（默认：true）
    pub fallback_to_pandoc: bool,   // 降级到 Pandoc（默认：true）
}

impl FeatureFlags {
    pub fn new() -> Self {
        Self {
            use_pdf_preview: std::env::var("USE_PDF_PREVIEW")
                .map(|v| v == "true")
                .unwrap_or(true),
            use_odt_edit: std::env::var("USE_ODT_EDIT")
                .map(|v| v == "true")
                .unwrap_or(true),
            fallback_to_pandoc: std::env::var("FALLBACK_TO_PANDOC")
                .map(|v| v == "true")
                .unwrap_or(true),
        }
    }
}
```

### 6.4 错误处理和降级机制

**错误类型**：
1. **内置 LibreOffice 解压失败**：提示用户失败原因，建议手动创建草稿
2. **LibreOffice 不可用**：检测系统版本，如果也不可用，提示失败，建议创建草稿
3. **PDF 转换失败**：提示用户失败原因，建议手动创建草稿
4. **ODT 解析失败**（编辑模式）：降级到 Pandoc 方案
5. **缓存损坏**：清理缓存，重新转换

**错误处理策略**：
- 预览模式：内置 LibreOffice 不可用 → 系统 LibreOffice → 提示失败，建议手动创建草稿
- 编辑模式：内置 LibreOffice 不可用 → 系统 LibreOffice → Pandoc 方案（旧方案）
- 所有降级操作都有日志记录，便于排查问题

### 6.5 测试策略

**单元测试**：
- `LibreOfficeService`：测试内置 LibreOffice 解压、检测、转换、缓存功能
- `OdtParser`：测试 XML 解析、结构提取
- `HtmlGenerator`：测试 HTML 生成
- `CacheService`：测试缓存管理

**集成测试**：
- 完整预览流程：DOCX → PDF → 前端渲染
- 完整编辑流程：DOCX → ODT → HTML → TipTap
- 降级机制：测试 LibreOffice 不可用时的降级

**性能测试**：
- 转换速度：首次转换、缓存命中
- 内存占用：大文件处理
- 并发处理：多个文件同时转换

**兼容性测试**：
- 不同 DOCX 版本（.docx, .doc）
- 不同操作系统（macOS, Windows, Linux）
- 内置 LibreOffice 解压测试（首次启动）
- 系统 LibreOffice 降级测试（如果用户已安装）

### 6.6 性能优化建议

**缓存优化**：
- 使用文件哈希作为缓存键（更准确）
- 实现缓存预热（启动时预转换常用文件）
- 实现缓存压缩（PDF/ODT 文件压缩存储）

**并发优化**：
- 使用异步任务池处理转换
- 限制并发转换数量（避免资源耗尽）
- 实现转换队列（按优先级处理）

**内存优化**：
- 流式处理大文件（不一次性加载到内存）
- 及时释放临时文件
- 实现内存监控和限制

---

## 七、技术细节补充

### 7.1 LibreOffice 内置方案实现

**内置 LibreOffice 管理**：
- LibreOffice 打包在应用资源中（`resources/libreoffice/`）
- 应用首次启动时解压到应用数据目录
- 解压后检测可执行文件路径并缓存
- 应用体积增加约 180MB（一次性）

**路径检测逻辑**：
1. 优先使用内置 LibreOffice（应用数据目录）
2. 如果内置不可用，检测系统是否已安装（降级方案）
3. 如果都不可用，提示用户失败原因，建议手动创建草稿进行编辑

**macOS 路径**：
- 内置路径：`~/.local/share/binder/libreoffice/LibreOffice.app/Contents/MacOS/soffice`
- 系统路径（降级）：`/Applications/LibreOffice.app/Contents/MacOS/soffice`

**Windows 路径**：
- 内置路径：`%APPDATA%\binder\libreoffice\LibreOffice\program\soffice.exe`
- 系统路径（降级）：`C:\Program Files\LibreOffice\program\soffice.exe`

**Linux 路径**：
- 内置路径：`~/.local/share/binder/libreoffice/libreoffice/program/soffice`
- 系统路径（降级）：`/usr/bin/soffice`

**解压逻辑**：
- 应用启动时检查内置 LibreOffice 是否已解压
- 未解压时从资源文件解压到应用数据目录
- 解压过程显示进度（可选）
- 解压后验证可执行文件完整性

### 7.2 ODT XML 解析细节

**content.xml 结构**：
```xml
<office:document-content>
  <office:body>
    <office:text>
      <!-- 标题 -->
      <text:h text:style-name="Heading 1" text:outline-level="1">
        标题文本
      </text:h>
      
      <!-- 段落 -->
      <text:p text:style-name="Standard">
        <text:span text:style-name="T1">文本运行</text:span>
      </text:p>
      
      <!-- 列表 -->
      <text:list>
        <text:list-item>
          <text:p>列表项</text:p>
        </text:list-item>
      </text:list>
      
      <!-- 表格 -->
      <table:table>
        <table:table-row>
          <table:table-cell>单元格</table:table-cell>
        </table:table-row>
      </table:table>
      
      <!-- 图片 -->
      <draw:frame>
        <draw:image xlink:href="Pictures/10000000000001F4000001234567890AB.png"/>
      </draw:frame>
    </office:text>
  </office:body>
</office:document-content>
```

**样式提取**：
- 从 `styles.xml` 提取样式定义
- 从 `content.xml` 提取内联样式
- 合并样式（内联样式优先）

### 7.3 PDF.js 集成细节

**Worker 配置**：
```typescript
// src/utils/pdfjs.ts
import * as pdfjsLib from 'pdfjs-dist';

// 设置 worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// 或使用本地 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
```

**页面渲染**：
```typescript
// 加载 PDF
const loadingTask = pdfjsLib.getDocument(pdfUrl);
const pdf = await loadingTask.promise;

// 渲染页面
const page = await pdf.getPage(pageNumber);
const viewport = page.getViewport({ scale: 1.5 });
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
canvas.height = viewport.height;
canvas.width = viewport.width;

await page.render({
  canvasContext: context,
  viewport: viewport,
}).promise;
```

**文本搜索**：
```typescript
// 搜索文本
const textContent = await page.getTextContent();
const textItems = textContent.items.map(item => item.str);
const searchText = textItems.join(' ');

// 高亮搜索结果
const matches = searchText.matchAll(new RegExp(searchTerm, 'gi'));
```

### 7.4 图片处理

**ODT 图片提取**：
- 从 ODT ZIP 中提取图片文件（`Pictures/` 目录）
- 转换为 base64 或保存到临时目录
- 在 HTML 中使用 `<img src="data:image/png;base64,...">` 或文件路径

**图片优化**：
- 压缩大图片（减少 HTML 体积）
- 使用 WebP 格式（浏览器支持时）
- 实现图片懒加载（前端）

### 7.5 表格处理

**ODT 表格结构**：
```xml
<table:table>
  <table:table-column table:number-columns-repeated="2"/>
  <table:table-row>
    <table:table-cell>
      <text:p>单元格内容</text:p>
    </table:table-cell>
  </table:table-row>
</table:table>
```

**HTML 表格生成**：
- 提取表格行和列
- 处理合并单元格（`table:number-columns-spanned`）
- 生成 `<table>`, `<tr>`, `<td>` 结构
- 保留基础样式（边框、对齐等）

---

## 八、总结

### 8.1 技术方案优势

**稳定性**：
- ✅ 标准 XML 解析，不依赖文本匹配
- ✅ LibreOffice 处理复杂格式，准确率高
- ✅ 降级机制保证可用性

**性能**：
- ✅ 缓存机制（首次 7-12秒，缓存后 <2秒）
- ✅ 异步处理，不阻塞 UI
- ✅ 流式处理大文件

**可维护性**：
- ✅ 代码简洁，标准库为主
- ✅ 模块化设计，职责清晰
- ✅ 统一技术栈（预览和编辑都用 LibreOffice）

### 8.2 实施建议

**优先级**：
1. **阶段1**：基础服务实现（最关键）
2. **阶段2**：预览模式替换（用户可见）
3. **阶段3**：编辑模式替换（核心功能）
4. **阶段4**：清理旧代码（优化）

**风险控制**：
- 使用功能开关，可随时回滚
- 保留降级机制，保证可用性
- 充分测试，确保稳定性

**后续优化**：
- 实现缓存预热
- 优化大文件处理
- 支持更多格式（.doc, .rtf 等）

---

## 附录

### A. 相关文档

- `Binder产品开发方案.md`：产品整体方案
- `文档编辑器完整技术方案.md`：编辑器技术方案
- `binder开发协同.md`：开发协同文档

### B. 技术栈版本

- **LibreOffice**：7.6+（内置版本，打包在应用中）
- **Pandoc**：3.0+（保存功能）
- **PDF.js**：3.0+（前端 PDF 渲染）
- **Rust**：1.70+（后端开发）
- **React**：18.0+（前端框架）
- **TypeScript**：5.0+（类型系统）
- **TipTap**：2.0+（富文本编辑器）

### C. 依赖库

**Rust 依赖**：
- `zip`：ODT ZIP 文件解析
- `quick-xml`：XML 解析
- `sha2`：缓存键生成（SHA256）
- `which`：LibreOffice 路径检测（降级方案）
- `zip` 或 `flate2`：内置 LibreOffice 解压
- `tauri`：桌面应用框架

**前端依赖**：
- `pdfjs-dist`：PDF 渲染和搜索
- `@tiptap/react`：富文本编辑器
- `@tiptap/starter-kit`：编辑器基础功能

### D. 命令接口汇总

**预览模式**：
- `preview_docx_as_pdf(path: String, app: AppHandle) -> Result<String, String>`
  - 功能：转换 DOCX → PDF，返回 PDF 文件路径
  - 事件：`preview-progress`

**编辑模式**：
- `open_docx_for_edit(path: String, app: AppHandle) -> Result<String, String>`
  - 功能：转换 DOCX → ODT → HTML，返回 HTML 内容
  - 事件：`edit-progress`
  
- `create_draft_docx(original_path: String) -> Result<String, String>`
  - 功能：创建草稿副本（`document.draft.docx`）
  - 返回：草稿文件路径

**保存模式**：
- `save_docx(path: String, html_content: String, app: AppHandle) -> Result<(), String>`
  - 功能：转换 HTML → DOCX，保存到目标文件
  - 事件：`fs-save-progress`

### E. 事件接口汇总

**预览进度事件**（`preview-progress`）：
```typescript
interface PreviewProgressEvent {
  status: "started" | "converting" | "completed" | "failed";
  progress: number;  // 0-100
  message: string;
}
```

**编辑进度事件**（`edit-progress`）：
```typescript
interface EditProgressEvent {
  status: "started" | "converting" | "parsing" | "completed" | "failed";
  progress: number;  // 0-100
  message: string;
}
```

**保存进度事件**（`fs-save-progress`）：
```typescript
interface SaveProgressEvent {
  status: "started" | "converting" | "completed" | "failed";
  progress: number;  // 0-100
  message: string;
  error?: string;
}
```

### F. 文件结构

**后端服务**：
```
src-tauri/src/
├── services/
│   ├── libreoffice_service.rs    # LibreOffice 转换服务（共享）
│   ├── odt_parser.rs              # ODT XML 解析服务
│   ├── html_generator.rs          # HTML 生成服务
│   ├── cache_service.rs           # 缓存管理服务（共享）
│   └── pandoc_service.rs          # Pandoc 保存服务
├── commands/
│   └── file_commands.rs           # Tauri 命令接口
└── config.rs                      # 功能开关配置
```

**前端组件**：
```
src/
├── components/
│   ├── Editor/
│   │   ├── DocxPdfPreview.tsx      # PDF 预览组件
│   │   └── EditorPanel.tsx         # 编辑器面板
│   └── ...
└── utils/
    └── pdfjs.ts                    # PDF.js 工具函数
```

### G. 缓存目录结构

**macOS**：
```
~/.cache/binder/
├── preview/          # 预览模式缓存（PDF）
│   └── <hash>.pdf
└── edit/            # 编辑模式缓存（ODT）
    └── <hash>.odt
```

**Windows**：
```
%APPDATA%\binder\cache\
├── preview/
│   └── <hash>.pdf
└── edit/
    └── <hash>.odt
```

**Linux**：
```
~/.cache/binder/
├── preview/
│   └── <hash>.pdf
└── edit/
    └── <hash>.odt
```

### H. 错误码定义

**LibreOffice 相关**：
- `LO_EXTRACT_FAILED`：内置 LibreOffice 解压失败
- `LO_NOT_FOUND`：LibreOffice 不可用（内置和系统都不可用）
- `LO_CONVERSION_FAILED`：转换失败
- `LO_TIMEOUT`：转换超时
- `LO_VERIFY_FAILED`：可执行文件验证失败

**ODT 解析相关**：
- `ODT_PARSE_ERROR`：ODT 解析失败
- `ODT_STRUCTURE_ERROR`：结构提取失败
- `ODT_STYLE_ERROR`：样式提取失败

**缓存相关**：
- `CACHE_READ_ERROR`：缓存读取失败
- `CACHE_WRITE_ERROR`：缓存写入失败
- `CACHE_CORRUPTED`：缓存损坏

### I. 性能指标

**转换速度**（首次转换）：
- 小文件（<1MB）：3-5秒
- 中文件（1-10MB）：7-12秒
- 大文件（>10MB）：15-30秒

**转换速度**（缓存命中）：
- 所有文件：<2秒

**内存占用**：
- 基础服务：<50MB
- 内置 LibreOffice：约 180MB（解压后常驻内存，可选）
- 转换过程：文件大小 × 2-3倍
- 缓存占用：累计转换文件大小

**准确率**：
- 预览模式（PDF）：95%+（LibreOffice 转换）
- 编辑模式（ODT）：90%+（AI 样式子集）

### J. 已知限制

**格式支持**：
- ✅ 支持：标题、段落、列表、表格、图片、基础样式
- ❌ 不支持：页眉页脚、复杂文本框、SmartArt、VBA 宏

**文件大小**：
- 推荐：<50MB
- 最大：<200MB（可能性能下降）

**操作系统**：
- ✅ macOS 10.15+
- ✅ Windows 10+
- ✅ Linux（主流发行版）

**LibreOffice 版本**：
- 内置版本：7.6+（打包在应用中）
- 系统版本（降级）：7.0+（如果用户已安装）

---

## 文档结束

**版本历史**：
- v2.0（2025-01）：LibreOffice + ODT 方案（最终确定）
- v1.0（2024-12）：Pandoc + HTML 方案（已废弃）

**维护者**：Binder 开发团队

**最后更新**：2025-01