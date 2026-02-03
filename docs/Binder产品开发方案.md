# Binder（合页）产品开发方案

## 文档版本信息

- **文档版本**：v1.6（图片处理补充版）
- **创建日期**：2025年
- **最后更新**：2025年
- **方案状态**：✅ **可执行（已整合UI修正、AI三层架构、技术实现细节、产品决策和图片处理功能）**

## 方案要点

1. **DOCX 处理**：Pandoc 集成，文件树显示原格式文件，复杂格式创建草稿副本
2. **MVP 范围**：MVP 1.0 只做文档编辑器，极致打磨
3. **AI 三层架构**：自动补全（幽灵文字）、Inline Assist（Cmd+K）、聊天窗口（完整对话）
4. **文件管理**：直接操作本地文件，导入=复制，拖拽=移动
5. **核心功能**：SQLite 全文索引、Inline Assist、记忆库功能
6. **图片处理**：图片存储到 assets/ 文件夹，编辑器使用 file:// 路径显示，Pandoc 自动打包进 DOCX

---

## 一、项目概述

### 1.1 产品定位

**Binder（合页）** 是一个面向创作者的 **AI 智能办公套件**，作为独立应用程序提供文档、表格、演示文稿三大核心能力（长期愿景），配备全面的 AI 辅助功能和完善的本地资源管理系统，打造一站式内容创作与办公平台。

**核心定位**：
- **独立应用**：作为独立的桌面应用运行，专注办公功能
- **AI 驱动**：全面的 AI 辅助能力，覆盖创作、编辑、分析全流程
- **格式互通**：支持 Office 标准格式及开放格式
- **资源管理**：完善的本地文件管理系统

**⚠️ MVP 1.0 定位**：
- **聚焦文档编辑器**：极致打磨文档编辑体验，秒杀 Word 的写作体验
- **完整 AI 能力**：AI 自动补全、聊天、Inline Assist、记忆库等
- **不包含表格和演示文稿**：移至后续版本，专注核心功能

### 1.2 核心价值主张

基于**第一性原理**的产品设计原则：
1. **无感流畅**：用户操作自然流畅，无学习成本
2. **杜绝技术妥协**：不在功能上妥协，提供完整体验
3. **便捷高效**：操作简单，效率提升明显
4. **AI 原生**：AI 能力深度集成，而非简单叠加

### 1.3 目标用户

- 专业写作者：小说、文章、书籍等内容创作者
- 产品/技术从业者：技术文档、产品说明、数据分析报告
- 商务办公人员：日常文档、表格、演示文稿处理
- 知识博主与教育工作者：结构化内容、课件制作
- 数据分析师：表格分析、数据可视化
- 演示与汇报人员：演示文稿、商务汇报
- 项目管理人：多文件管理、批量操作

### 1.4 技术架构决策

**核心决策**：采用**轻量化重构方案**，而非改造 Void

**架构选型**：
- **桌面框架**：Tauri（替代 Electron）
- **前端框架**：**React 18** + TypeScript
- **富文本编辑器**：TipTap（开源版本，MIT 许可证）
- **后端语言**：Rust
- **UI 组件库**：Tailwind CSS + Headless UI
- **状态管理**：Zustand 或 Jotai
- **文件系统**：Tauri File System API + 自研文件管理逻辑

**技术选型理由**：
- ✅ **轻量级**：Tauri 安装包 < 10MB，启动秒开（vs Electron 500MB+）
- ✅ **性能优秀**：Rust 后端性能强劲，内存占用低
- ✅ **原生富文本**：TipTap 完全符合文档编辑需求
- ✅ **架构清晰**：无历史包袱，完全按照 Binder 需求设计
- ✅ **符合第一性原理**：无感流畅，杜绝技术妥协

**对 Void 资产的利用方式**：
- ✅ **借鉴逻辑，不抄代码库**：学习 Void 的 AI 请求流式转发、Diff 机制、多模型配置等逻辑
- ✅ **放弃 UI 遗产**：不用 VS Code UI，直接用 React + Tailwind 画一个清爽界面
- ✅ **Rust 后端移植**：将 Void 的优秀 AI 代理逻辑移植到 Rust

---

## 二、技术架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Binder 应用架构                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │        前端层 (React + TypeScript)                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │   │
│  │  │ 文件树   │  │ 编辑器   │  │ AI 聊天  │      │   │
│  │  │ 组件     │  │ 组件     │  │ 组件     │      │   │
│  │  └──────────┘  └──────────┘  └──────────┘      │   │
│  │  ┌──────────────────────────────────────┐       │   │
│  │  │      布局系统（可拖拽、可吸附）        │       │   │
│  │  └──────────────────────────────────────┘       │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕ Tauri IPC                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │        后端层 (Rust)                             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │   │
│  │  │ 文件系统 │  │ AI 服务  │  │ 格式转换 │      │   │
│  │  │ 服务     │  │          │  │ 服务     │      │   │
│  │  └──────────┘  └──────────┘  └──────────┘      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │   │
│  │  │ DOCX 处理│  │ 工作区   │  │ 版本控制 │      │   │
│  │  │          │  │ 管理     │  │          │      │   │
│  │  └──────────┘  └──────────┘  └──────────┘      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 2.2 前端架构

**技术栈**：
- React 18 + TypeScript
- TipTap（富文本编辑器）
- Tailwind CSS（样式）
- Zustand（状态管理）
- React Router（路由，如需要）
- Tauri API（与后端通信）

**核心模块**：

```typescript
src/
├── components/           # UI 组件
│   ├── Layout/          # 布局组件
│   │   ├── MainLayout.tsx          # 主布局
│   │   ├── DraggablePanel.tsx      # 可拖拽面板
│   │   ├── WelcomeDialog.tsx       # 欢迎对话框
│   │   └── LayoutManager.tsx       # 布局管理器
│   ├── FileTree/        # 文件树组件
│   │   ├── FileTree.tsx            # 文件树主组件
│   │   ├── FileTreeNode.tsx        # 文件树节点
│   │   └── FileTreeContextMenu.tsx # 右键菜单
│   ├── Editor/          # 编辑器组件
│   │   ├── TipTapEditor.tsx        # TipTap 编辑器
│   │   ├── EditorToolbar.tsx       # 编辑器工具栏（根据文件类型动态显示）
│   │   ├── ImageHandler.tsx        # 图片处理组件（插入、显示、删除）
│   │   ├── GhostText.tsx            # 层次一：幽灵文字组件
│   │   ├── InlineAssistInput.tsx    # 层次二：Inline Assist 输入框
│   ├── Chat/            # AI 聊天组件（层次三）
│   │   ├── ChatWindow.tsx          # 聊天窗口
│   │   ├── ChatTabs.tsx            # 聊天标签栏（多线程聊天）
│   │   ├── ChatMessageList.tsx     # 消息列表
│   │   ├── ChatInput.tsx           # 聊天输入
│   │   ├── ModelSelector.tsx       # 模型选择
│   │   ├── MemoryTab.tsx           # 记忆库标签
│   │   └── MessageWithReference.tsx # 引用内容显示
│   └── Common/          # 通用组件
│       ├── Button.tsx
│       ├── Modal.tsx
│       └── Toast.tsx
├── stores/              # 状态管理
│   ├── layoutStore.ts   # 布局状态
│   ├── fileStore.ts     # 文件状态
│   ├── editorStore.ts   # 编辑器状态
│   └── chatStore.ts     # 聊天状态
├── services/            # 服务层
│   ├── fileService.ts   # 文件服务（调用 Tauri）
│   ├── aiService.ts     # AI 服务（调用 Tauri）
│   ├── formatService.ts # 格式服务（调用 Tauri）
│   └── imageService.ts  # 图片服务（调用 Tauri）
├── hooks/               # 自定义 Hooks
│   ├── useFileTree.ts
│   ├── useAutoComplete.ts          # 层次一：自动补全 Hook
│   ├── useInlineAssist.ts          # 层次二：Inline Assist Hook
│   ├── useChat.ts                  # 层次三：聊天 Hook
│   └── useEdgeSnap.ts
└── utils/               # 工具函数
    ├── fileUtils.ts
    └── formatUtils.ts
```

### 2.3 后端架构（Rust）

**技术栈**：
- Rust（系统语言）
- Tauri（桌面应用框架）
- Tokio（异步运行时）
- Serde（序列化/反序列化）
- 相关库：
  - `notify`（文件监听）
  - `pandoc`（格式转换，DOCX ↔ HTML/Markdown，**自动处理图片打包**）
  - `rusqlite` + `sqlite-fts5`（全文索引）
  - `uuid`（生成唯一文件名，用于图片命名）
  - 各模型提供商的 Rust SDK

**核心模块**：

```rust
src-tauri/
├── src/
│   ├── main.rs              # 入口文件
│   ├── services/            # 服务模块
│   │   ├── file_system.rs   # 文件系统服务
│   │   ├── file_tree.rs     # 文件树服务
│   │   ├── ai_service.rs    # AI 服务（三层架构统一接口）
│   │   ├── docx_service.rs  # DOCX 处理服务（Pandoc）
│   │   ├── pandoc_service.rs # Pandoc 格式转换服务
│   │   ├── image_service.rs  # 图片处理服务（插入、存储、清理）
│   │   ├── search_service.rs # SQLite 全文索引服务
│   │   ├── memory_service.rs # 记忆库服务
│   │   └── workspace.rs     # 工作区管理
│   ├── models/              # 数据模型
│   │   ├── file.rs          # 文件模型
│   │   ├── workspace.rs     # 工作区模型
│   │   └── ai.rs            # AI 模型
│   ├── commands/            # Tauri 命令
│   │   ├── file_commands.rs # 文件操作命令
│   │   ├── ai_commands.rs   # AI 命令
│   │   ├── format_commands.rs # 格式命令
│   │   └── image_commands.rs # 图片操作命令
│   └── utils/               # 工具函数
│       ├── file_utils.rs
│       └── format_utils.rs
└── Cargo.toml               # 依赖配置
```

### 2.4 通信机制

**Tauri IPC（进程间通信）**：

```typescript
// 前端调用后端命令
import { invoke } from '@tauri-apps/api/tauri';

// 读取文件
const content = await invoke<string>('read_file', { path: '/path/to/file.docx' });

// 保存文件
await invoke('write_file', { path: '/path/to/file.docx', content: '...' });

// AI 请求
const response = await invoke<string>('ai_complete', { prompt: '...' });
```

```rust
// 后端定义命令
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    // 实现文件读取逻辑
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    // 实现文件写入逻辑
}

// 注册命令
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**事件通信（后端 → 前端）**：

```rust
// 后端发送事件
app_handle.emit_all("file-changed", FileChangedEvent { path: "...", kind: "..." }).unwrap();
```

```typescript
// 前端监听事件
import { listen } from '@tauri-apps/api/event';

listen<FileChangedEvent>('file-changed', (event) => {
  // 处理文件变化事件
});
```

---

## 三、核心功能模块详细设计

### 3.1 文档编辑器模块

#### 3.1.1 TipTap 编辑器集成

**功能特性**：
- 富文本编辑（标题、段落、列表、样式）
- **图片插入和编辑**（见 3.1.4 节详细设计）
- 表格编辑（基础表格）
- 链接插入
- 代码块支持
- Markdown 支持
- **撤销/重做**：支持 50 步历史记录（默认，可配置）

**工具栏动态显示**：
- 根据当前标签页的文件类型动态显示工具栏
- DOCX 文件：完整工具栏（格式化、标题、列表、表格、图片等）
- Markdown 文件：简化工具栏（标题、列表、链接、代码块等）
- HTML 文件：完整工具栏（类似 DOCX）
- 切换标签页时，工具栏自动更新

**保存机制**：
- 自动保存：2秒防抖后自动保存为原格式
- 手动保存：Cmd/Ctrl + S，立即保存（覆盖原文件）
- 另存为：保存为不同格式或不同位置（DOCX、PDF、其他位置）

#### 3.1.2 DOCX 文件处理 ⚠️ **最终方案：Pandoc 集成**

**核心策略**：Pandoc 集成 + 草稿副本机制

**关键原则**：
- ✅ 文件树显示用户可理解的格式文件（.docx、.md、.html 等）
- ✅ 直接编辑原格式文件（.docx），保持文件可见性
- ✅ 复杂格式 DOCX 创建同名草稿副本（如 `document.draft.docx`）

**处理流程（最终方案）**：

**预览模式（外部导入 DOCX，只读）**：
```
打开 DOCX 文件（外部导入）
  ↓
预览模式（isReadOnly = true）
  ↓
使用 DocxPdfPreview 组件 → 调用 preview_docx_as_pdf() 命令
  ↓
LibreOffice 转换 DOCX → PDF（带字体嵌入参数）
  ↓
读取 PDF 为 base64 → 创建 data URL
  ↓
使用 iframe 加载 data URL（浏览器原生 PDF 查看器）
  ↓
显示预览界面（工具栏：打印、编辑按钮，搜索和缩放提示）
```

**编辑模式（新建/AI生成/点击编辑）**：
```
打开 DOCX 文件
  ↓
检测文件复杂度（格式、样式、元素）
  ↓
简单格式 → Pandoc 解析 DOCX → HTML → TipTap 加载
  ↓
复杂格式 → 提取内容和简单格式 → 创建同名草稿副本（document.draft.docx）
           → Pandoc 解析草稿 DOCX → HTML → TipTap 加载
  ↓
用户编辑（TipTap）
  ↓
TipTap 导出 HTML → Pandoc 转换 → 保存为原格式 DOCX（直接覆盖或保存到草稿文件）
```

**预览与编辑模式区分**：
- **预览模式**：使用 `preview_docx_as_pdf()` 命令，LibreOffice 转换为 PDF，由 `DocxPdfPreview` 组件使用 iframe + data URL 显示
- **编辑模式**：使用 `open_docx_for_edit()` 命令，Pandoc 转换 + CSS 样式表，返回 HTML，由 TipTap 编辑器显示

**编辑界面模式**：
- **分页式编辑界面**（DOCX 专用）：模拟 A4 纸张的固定尺寸编辑区域，支持横向/纵向页面方向，窗口宽度变化时自动切换单排/多排显示
  - 页面尺寸：纵向 210mm × 297mm，横向 297mm × 210mm
  - 自动分页：内容超出单页时自动创建新页面
  - 响应式布局：窗口缩放时页面保持固定尺寸，自动计算可容纳的列数
  - 详细方案：参考 `DOCX分页式编辑界面方案.md`
  - 开发计划：参考 `DOCX分页式编辑界面开发计划.md`
- 预览模式不显示编辑按钮（ReadOnlyBanner），工具栏包含打印和编辑按钮

**Pandoc 优势**：
- ✅ 转换质量比 mammoth 更好
- ✅ 支持更多格式
- ✅ 开源且成熟稳定
- ✅ 支持双向转换（DOCX ↔ HTML/Markdown）

**Rust 后端接口**：

```rust
// src-tauri/src/commands/file_commands.rs

/// 打开 DOCX 文件并转换为 HTML（用于编辑模式）
/// 
/// **使用场景**：
/// - 编辑模式（新建/AI生成/点击编辑）
/// - TipTap 编辑器显示
/// 
/// **处理流程**：
/// 1. Pandoc 转换 DOCX → HTML（提取基础样式）
/// 2. CSS 类转换为内联样式（段落对齐）
/// 3. 添加预设样式表（CSS 样式表，不修改 HTML）
/// 
/// **返回**：HTML 内容（带预设样式，可直接加载到 TipTap）
#[tauri::command]
pub async fn open_docx_for_edit(path: String) -> Result<String, String> {
    // 实现：Pandoc 转换 + CSS 类转换 + 预设样式表
}

/// 预览 DOCX 文件（预览模式专用）
/// 
/// **重要说明**：此命令与 `open_docx` 的区别
/// - `open_docx`：用于编辑模式，返回 HTML 供 TipTap 编辑器使用（Pandoc 转换）
/// - `preview_docx_as_pdf`：用于预览模式，LibreOffice 转换为 PDF，返回 PDF 文件路径
/// 
/// **转换流程**：
/// - LibreOffice 转换 DOCX → PDF（带字体嵌入参数）
/// - 缓存 PDF 文件（1小时过期）
/// - 返回 PDF 文件路径（file:// 绝对路径）
/// 
/// **使用场景**：
/// - DocxPdfPreview 组件内部调用
/// - 预览模式（isReadOnly = true）
/// 
/// **不使用场景**：
/// - 编辑模式（应使用 `open_docx`）
#[tauri::command]
pub async fn preview_docx_as_pdf(
    path: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // 实现：检查文件存在 → LibreOffice 转换 DOCX → PDF → 返回 PDF 路径
    // 发送 preview-progress 事件（"正在预览..."）
    // 超时机制：30秒超时，超时后提示失败并放弃转换
}


/// 创建 DOCX 文件的草稿副本
/// 返回草稿文件路径
#[tauri::command]
pub async fn create_draft_docx(original_path: String) -> Result<String, String> {
    // 实现：创建草稿副本（document.draft.docx）
}

/// 保存 DOCX 文件（将 HTML 内容转换为 DOCX）
#[tauri::command]
pub async fn save_docx(
    path: String,
    html_content: String,
    app: tauri::AppHandle
) -> Result<(), String> {
    // 实现：Pandoc 转换 HTML → DOCX（含进度事件）
}
```

**前端组件**：

```typescript
// src/components/Editor/EditorPanel.tsx

import DocxPdfPreview from './DocxPdfPreview';
import HTMLPreview from './HTMLPreview'; // 继续用于 HTML 文件

// 在渲染逻辑中
{activeTab ? (() => {
  const fileType = getFileType(activeTab.filePath);
  
  // PDF 和图片文件使用预览组件
  if (fileType === 'pdf' || fileType === 'image') {
    return (
      <div className="h-full overflow-hidden">
        <FilePreview filePath={activeTab.filePath} fileType={fileType} />
      </div>
    );
  }
  
  // HTML 文件（只读模式）：使用 HTMLPreview（保持不变）
  if (fileType === 'html' && activeTab.isReadOnly) {
    return <HTMLPreview content={activeTab.content} />;
  }
  
  // DOCX 文件（只读模式）：使用 DocxPdfPreview（新方案：LibreOffice + PDF）
  if (fileType === 'docx' && activeTab.isReadOnly) {
    // 注意：不再使用 activeTab.content
    // 组件内部调用 preview_docx_as_pdf 命令获取 PDF，使用 iframe + data URL 显示
    return <DocxPdfPreview filePath={activeTab.filePath} />;
  }
  
  // 其他文件（包括 DOCX 可编辑模式）：使用编辑器
  return (
    <div className="h-full overflow-hidden relative">
      <TipTapEditor
        content={activeTab.content}
        onChange={handleContentChange}
        onSave={handleSave}
        editable={!activeTab.isReadOnly}
        onEditorReady={handleEditorReady}
        tabId={activeTab.id}
      />
    </div>
  );
})() : null}
```

**预览功能特性**：
- 文本选中和复制
- 打印功能
- 缩放功能（50%-200%，步进 10%）
- 搜索功能（高亮、滚动到结果）
- 页码显示和页面跳转
- Word 页面效果（模拟 Word 页面样式）
- 暗色模式适配
- 文本框支持（绝对定位渲染）
- 分栏支持（CSS 多列布局，1-13 列）

**详细实现方案**：见 [Word预览完整开发方案.md](./Word预览完整开发方案.md)

**文件树显示**：
- 用户看到的是 `.docx`、`.md`、`.html` 等熟悉的格式文件
- 草稿文件显示为 `document.draft.docx`
- 不显示内部格式文件

#### 3.1.3 保存机制

**自动保存**：
- 2秒防抖后自动保存为原格式
- 状态栏显示"已保存"或"保存中"
- 根据文件扩展名选择保存方式（DOCX 使用 Pandoc，MD/HTML 直接保存）
- **并发保存控制**：防止自动保存和手动保存同时进行（参考 Void）
- **保存失败重试**：自动保存失败时，**静默重试 3 次**，使用指数退避策略
- **失败后提示**：重试 3 次仍失败后，显示错误提示，提供手动保存选项
- **原子写入**：先写入临时文件，再重命名，确保文件完整性

**手动保存**：
- 快捷键：Cmd/Ctrl + S
- 功能：立即保存当前文件为原格式（覆盖原文件）
- 满足用户手动保存习惯
- **保存前检查**：如果内容未变化，跳过保存

**另存为**：
- 功能：保存为不同格式或不同位置
- 支持：另存为 DOCX（如果当前是 .md）、另存为 PDF、另存为其他位置
- **图片处理**：另存为时，图片文件一并复制到新位置的 assets/ 文件夹

**多标签页状态管理**（参考 Void）：
- 每个标签页独立管理编辑状态
- 标签页状态包括：文件路径、内容、上次保存内容、是否脏（isDirty）、保存状态
- **关闭标签页时检测未保存更改，弹出对话框确认**（保存/不保存/取消）
- 同一文件在多个标签页打开时，保存后同步更新所有标签页内容

**外部修改处理**：
- 正在编辑的文件被外部修改时，检测到后会弹出对话框提醒用户
- 用户可选择：
  - **继续覆盖**：保持当前编辑内容，下次自动保存时覆盖外部修改
  - **加载更改**：放弃当前未保存的编辑，加载外部修改的文件内容
  - **比较差异**：显示差异对比，让用户手动合并
- 非正在编辑的文件（仅在工作区中被修改），自动刷新文件树显示最新状态

### 3.2 AI 辅助功能模块（三层架构）

Binder 的 AI 功能分为三个独立的层次，每个层次有明确的职责和边界：

#### 3.2.1 AI 模型管理

**模型提供商支持**：
- OpenAI（GPT-4.1、O3、O4-mini 等）
- Anthropic（Claude 3.7 Sonnet、Claude Opus 4 等）
- Google Gemini（Gemini 2.5 Pro 等）
- 本地模型（Ollama、vLLM、LM Studio）

**Rust 后端接口**：

```rust
// src-tauri/src/services/ai_service.rs
pub struct AIService {
    providers: HashMap<String, Box<dyn AIProvider>>,
    model_manager: ModelManager,
}

impl AIService {
    // 层次一：自动补全（使用快速模型）
    pub async fn autocomplete(&self, context: &str) -> Result<String, Error>;
    
    // 层次二：Inline Assist（使用标准模型）
    pub async fn inline_assist(&self, instruction: &str, text: &str, context: &str) -> Result<String, Error>;
    
    // 层次三：聊天（使用标准模型，流式响应）
    pub async fn chat_stream(&self, messages: &[Message], context: &ChatContext) -> Result<Stream, Error>;
}

// AI 配置（用户可自定义）
pub struct AIConfig {
    pub request_timeout: Duration, // AI 请求超时时间，默认 60 秒，可在用户设置中配置
    pub autocomplete_trigger_delay: Duration, // 自动补全触发延迟，默认 7 秒，可在用户设置中配置（5-15 秒范围）
    pub undo_redo_max_steps: usize, // 撤销/重做最大步数，默认 50，可在用户设置中配置
}

// AI 请求并发控制（参考 Void）
pub struct AIRequestQueue {
    queue: VecDeque<AIRequest>,
    active_requests: usize,
    max_concurrent: usize,
}

impl AIRequestQueue {
    // 根据优先级管理请求队列
    // 自动补全：低优先级
    // Inline Assist：高优先级
    // 聊天：正常优先级
    pub async fn enqueue(&mut self, request: AIRequest) -> Result<()>;
}

// AI 请求错误处理
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AIRequestError {
    NetworkError(String),
    RateLimit { retry_after: u64 },
    ModelUnavailable,
    ContextTooLong,
    Unknown(String),
}

impl AIRequestError {
    pub fn is_retryable(&self) -> bool {
        matches!(self, AIRequestError::NetworkError(_) | AIRequestError::RateLimit { .. } | AIRequestError::ModelUnavailable)
    }
    
    pub fn retry_after(&self) -> Option<u64> {
        match self {
            AIRequestError::RateLimit { retry_after } => Some(*retry_after),
            _ => None,
        }
    }
}
```

#### 3.2.2 层次一：自动补全（自动续写）

**核心特性**：
- 无 UI 窗口，幽灵文字显示
- 自动触发：光标静止 7 秒后触发（默认，可配置）
- 在光标后方显示半透明续写内容（20-50 字符）
- 类似代码补全体验

**触发机制**：
- 光标在文档中静止不动（无输入、无移动）
- 静止时间达到阈值：**7 秒（默认，可配置）**
- 光标位置有足够的上下文（至少 100 字符）
- 用户可在设置中调整触发时间（5-15 秒范围）

**交互方式**：
- Tab 键：接受补全，插入幽灵文字
- 继续输入：自动清除幽灵文字
- Esc 键：手动清除幽灵文字
- 光标移动：自动清除幽灵文字

**后端接口**：

```rust
#[tauri::command]
pub async fn ai_autocomplete(
    context: String,
    position: usize,
    max_length: usize,
) -> Result<Option<String>, String> {
    // 使用快速模型（GPT-3.5、Claude Haiku 等）
    // 限制生成长度（20-50 字符）
    // 支持流式输出（参考 Void）
}
```

**性能优化**（参考 Void）：
- **缓存机制**：LRU 缓存，基于文档前缀缓存补全结果
- **请求去重**：相同上下文的请求复用结果
- **请求取消**：用户继续输入时自动取消之前的请求
- **预处理**：光标在行首/行尾时不生成，光标右侧有文本时生成单行
- **后处理**：平衡括号、处理字符串中间补全、结果修剪

**边界**：
- 不共享聊天历史
- 不显示在聊天窗口中
- 共享当前文档内容（作为上下文）

#### 3.2.3 层次二：Inline Assist（Cmd+K 快捷键）

**核心特性**：
- 独立输入框（非聊天窗口），浮动显示
- 快捷键调出：只能通过 Cmd+K（或 Ctrl+K）激活
- 反馈直接修改文本区域
- 无对话历史：每次调用都是独立的

**触发机制**：
- 用户选中文本（可选，也可以不选）
- 按下 Cmd+K（macOS）或 Ctrl+K（Windows/Linux）
- 在光标位置或选中文本位置显示输入框

**功能流程**（参考 Void Quick Edit）：
1. 选中文本 → Cmd+K → 显示输入框
2. 输入指令（如"改得更正式"）
3. AI 处理 → **流式接收响应** → 实时显示 Diff 视图
4. **Diff 可视化**：红色删除、绿色添加（参考 Void 的 Search/Replace 格式）
5. 应用或取消修改

**Diff 格式**（参考 Void）：
```
<<<<<<< ORIGINAL
原始文本
=======
修改后的文本
>>>>>>> UPDATED
```

**技术实现**：
- 使用 TipTap 的 Decoration API 实现 Diff 视图
- 支持流式接收 AI 响应，实时更新差异显示
- 与编辑器撤销/重做系统集成

**后端接口**：

```rust
#[tauri::command]
pub async fn ai_inline_assist(
    instruction: String,
    selected_text: String,
    context: String,
) -> Result<String, String> {
    // 使用标准模型
    // 单次请求，不流式
}
```

**边界**：
- 不共享聊天历史
- 不显示在聊天窗口中
- 不保存对话记录
- 共享当前文档内容和选中文本

#### 3.2.4 层次三：右侧聊天窗口

**核心特性**：
- 完整聊天界面：消息列表、输入框、历史记录
- 对话式交互：可以多轮对话，保持上下文
- 工具调用：可以操作文档、文件等
- 可拖拽、可关闭、可浮动

**功能模块**：

1. **聊天标签栏**：
   - 支持多个独立的聊天会话
   - 每个标签代表一个聊天线程
   - 可以创建、切换、关闭标签
   - 标签栏示例：`[💬 聊天 1] [💬 聊天 2] [🧠 记忆库] [+ 新建]`

2. **记忆库标签**：
   - 在标签栏中添加记忆库标签（图标：🧠）
   - 点击切换到记忆库面板
   - 显示记忆项列表和详情

3. **模型选择**：
   - 在聊天窗口标题栏显示当前模型
   - 点击可以切换模型
   - 每个聊天标签可以独立选择模型

4. **引用内容显示**：
   - 当用户在聊天中引用文本或文件时，显示引用内容的缩览
   - 点击可以查看完整内容
   - 引用文件显示文件名和图标

**后端接口**：

```rust
#[tauri::command]
pub async fn ai_chat_stream(
    messages: Vec<ChatMessage>,
    context: ChatContext,
    model: String,
) -> Result<(), String> {
    // 使用标准模型，流式响应
    // 支持工具调用
}
```

**边界**：
- 共享当前文档内容、选中文本、系统提示词、AI 模型配置、记忆库数据
- 不共享自动补全的触发逻辑
- 不共享 Inline Assist 的输入框

#### 3.1.4 图片处理功能 ⚠️ **最简方案**

**核心策略**：图片存储在文档同级目录的 `assets/` 文件夹，编辑器使用 `<img src="file://xxx">` 显示，保存时 Pandoc 自动打包进 DOCX

**图片存储方案**：
- **存储位置**：文档同级目录下的 `assets/` 文件夹
  - 例如：`document.docx` → `assets/` 文件夹
  - 例如：`~/Documents/我的项目/产品提案.docx` → `~/Documents/我的项目/assets/`
- **文件命名**：使用 UUID 或时间戳命名，避免冲突
  - 例如：`assets/image-20250101-123456.png`
  - 或：`assets/uuid-xxxx-xxxx-xxxx.png`
- **支持的格式**：PNG、JPEG、GIF、WebP、SVG

**图片插入流程**：
```
用户点击"插入图片"按钮
  ↓
选择图片文件（系统文件选择器）
  ↓
复制图片到 assets/ 文件夹（如果不存在则创建）
  ↓
生成相对路径或 file:// 路径
  ↓
在 TipTap 编辑器中插入 <img src="file:///path/to/assets/image.png">
  ↓
编辑器显示图片预览
```

**编辑器显示**：
- TipTap 编辑器使用 `<img src="file:///absolute/path/to/assets/image.png">` 标签
- 或使用相对路径：`<img src="assets/image.png">`（相对于文档位置）
- 编辑器实时显示图片预览
- 支持图片拖拽调整大小（可选，MVP 1.0 可暂不支持）

**保存处理**：
- **DOCX 保存**：
  - Pandoc 转换 HTML → DOCX 时，自动识别图片路径
  - Pandoc 自动将图片打包进 DOCX 文件（嵌入到文档中）
  - 图片路径可以是 `file://` 绝对路径或相对路径
- **Markdown 保存**：
  - 保存为 Markdown 格式时，使用 Markdown 图片语法：`![alt](assets/image.png)`
- **HTML 保存**：
  - 保持 `<img src="assets/image.png">` 或 `<img src="file:///path/to/assets/image.png">`

**图片管理**：
- **删除图片**：删除文档中的图片时，不影响源文件的存储
- **图片清理**：提供工具清理未使用的图片（扫描文档，找出未引用的图片文件）
- **图片引用检查**：保存前检查图片文件是否存在，缺失时提示用户

**Rust 后端接口**：

```rust
// src-tauri/src/services/image_service.rs
pub struct ImageService;

impl ImageService {
    // 插入图片：复制到 assets/ 文件夹，返回相对路径
    pub async fn insert_image(
        document_path: &Path,
        image_source: &Path, // 用户选择的图片文件
    ) -> Result<String, Error> {
        // 1. 确定 assets/ 文件夹路径（文档同级目录）
        let assets_dir = document_path.parent()
            .unwrap()
            .join("assets");
        
        // 2. 如果 assets/ 不存在，创建它
        if !assets_dir.exists() {
            std::fs::create_dir_all(&assets_dir)?;
        }
        
        // 3. 生成唯一文件名（UUID + 原扩展名）
        let ext = image_source.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");
        let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let dest_path = assets_dir.join(&filename);
        
        // 4. 复制图片文件
        std::fs::copy(image_source, &dest_path)?;
        
        // 5. 返回相对路径（相对于文档目录）
        Ok(format!("assets/{}", filename))
    }
    
    // 删除图片：从 assets/ 文件夹删除文件
    pub async fn delete_image(
        document_path: &Path,
        image_path: &str, // 相对路径，如 "assets/image.png"
    ) -> Result<(), Error> {
        let assets_dir = document_path.parent()
            .unwrap()
            .join("assets");
        let image_file = assets_dir.join(image_path.strip_prefix("assets/").unwrap());
        
        if image_file.exists() {
            std::fs::remove_file(&image_file)?;
        }
        
        Ok(())
    }
    
    // 检查图片是否存在
    pub fn check_image_exists(
        document_path: &Path,
        image_path: &str,
    ) -> bool {
        let assets_dir = document_path.parent()
            .unwrap()
            .join("assets");
        let image_file = assets_dir.join(image_path.strip_prefix("assets/").unwrap());
        image_file.exists()
    }
    
    // 清理未使用的图片
    pub async fn cleanup_unused_images(
        document_path: &Path,
        used_image_paths: &[String], // 文档中使用的图片路径列表
    ) -> Result<Vec<String>, Error> {
        let assets_dir = document_path.parent()
            .unwrap()
            .join("assets");
        
        if !assets_dir.exists() {
            return Ok(vec![]);
        }
        
        let mut deleted = vec![];
        let entries = std::fs::read_dir(&assets_dir)?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let filename = path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let relative_path = format!("assets/{}", filename);
            
            // 如果图片不在使用列表中，删除它
            if !used_image_paths.contains(&relative_path) {
                std::fs::remove_file(&path)?;
                deleted.push(relative_path);
            }
        }
        
        Ok(deleted)
    }
}
```

**前端实现**：

```typescript
// src/components/Editor/ImageHandler.tsx
export const ImageHandler: React.FC<{ editor: Editor; documentPath: string }> = ({ editor, documentPath }) => {
  const insertImage = async () => {
    // 1. 打开文件选择器
    const file = await invoke<File>('select_image_file');
    
    // 2. 调用后端接口，复制图片到 assets/
    const relativePath = await invoke<string>('insert_image', {
      documentPath,
      imageSource: file.path,
    });
    
    // 3. 在编辑器中插入图片
    const absolutePath = await invoke<string>('resolve_image_path', {
      documentPath,
      relativePath,
    });
    
    editor.commands.setImage({
      src: `file://${absolutePath}`, // 或使用相对路径
      alt: file.name,
    });
  };
  
  return (
    <button onClick={insertImage}>
      📷 插入图片
    </button>
  );
};
```

**Pandoc 图片处理**：
- Pandoc 支持自动处理 HTML 中的图片引用
- 使用 `file://` 绝对路径时，Pandoc 会自动读取文件并嵌入 DOCX
- 使用相对路径时，Pandoc 会相对于 HTML 文件位置查找图片
- **关键**：Pandoc 转换时会自动将图片打包进 DOCX，无需额外处理

**注意事项**：
- assets/ 文件夹会在文件树中显示，用户可以看到
- 图片文件较大时，assets/ 文件夹可能占用较多空间
- 移动文档时，需要同时移动 assets/ 文件夹（或提供工具自动处理）
- 删除文档时，可选择是否删除 assets/ 文件夹

#### 3.2.5 记忆库功能（长文档场景）

**功能特性**：
- 自动识别文档中的关键信息（人物、地点、事件、时间等）
- 记忆库面板展示所有记忆项
- 点击记忆项查看详细信息和出现位置
- 一键跳转到记忆项出现的位置
- 一致性检查（人物名称、时间节点等）

**展示位置**：
- 在聊天窗口的标签栏中添加"记忆库"标签（图标：🧠）
- 点击后切换到记忆库面板
- 显示记忆项列表、详细信息、出现位置列表

**技术实现**：见 4.1.3 节详细设计

### 3.3 文件管理系统模块

#### 3.3.1 文件树实现

**核心原则**：
- 所有文件树操作都是对本地文件的直接操作
- 文件树就是项目目录的真实反映
- 删除、重命名、移动都在本地文件系统上操作

**文件树显示**：
- 文件树顶部显示根目录/工作区：
  - 工作区名称（如"我的项目"）
  - 工作区路径（可选显示，或鼠标悬停显示）
  - 工作区图标或标识
- 示例结构：
  ```
  📁 我的项目 (~/Documents/我的项目)
    📁 文档
      📄 产品提案.docx
    📁 数据
  ```

**Rust 后端接口**：

```rust
// src-tauri/src/services/file_tree.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileTreeNode>>,
}

pub struct FileTreeService;

impl FileTreeService {
    // 构建文件树（从根目录开始）
    pub fn build_tree(root: &Path, max_depth: usize) -> Result<FileTreeNode, Error>;
    
    // 文件操作（直接操作本地文件）
    pub async fn create_file(path: &Path, file_type: &str) -> Result<(), Error>;
    pub async fn delete_file(path: &Path) -> Result<(), Error>;
    pub async fn rename_file(path: &Path, new_name: &str) -> Result<(), Error>;
    pub async fn move_file(source: &Path, destination: &Path) -> Result<(), Error>;
}
```

**前端组件**：

```typescript
// src/components/FileTree/FileTree.tsx
export const FileTree: React.FC = () => {
  // 显示工作区根目录
  // 文件树节点（支持展开/折叠）
  // 文件选择和打开
  // 右键菜单（新建、删除、重命名等）
};
```

#### 3.3.2 文件操作

**新建文件**：
- 新建按钮改为图标按钮（+ 号图标）
- 点击后弹出下拉菜单：
  - 新建文档 (.docx)
  - 新建 Markdown (.md)
  - 新建 HTML (.html)
  - 新建文件夹
- 选择后弹出文件命名对话框

**导入操作**：
- 用户选择文件 → 复制文件到当前工作区 → 在文件树中显示
- 或：在当前目录创建文件副本
- 原文件位置不变

**拖拽文件到文件树**：
- 从系统文件管理器拖入 → 移动文件到当前工作区（如果跨分区则复制）
- 文件物理位置改变，文件树自动刷新
- 这是对本地文件的直接操作

**文件操作原则**：
- 导入 = 复制（原文件保留）
- 拖拽 = 移动（文件物理位置改变）
- 所有操作都是对本地文件的直接操作

#### 3.3.3 文件监听

**功能**：
- 监听工作区目录的文件变化
- 自动刷新文件树
- 支持文件创建、修改、删除事件

**事件处理**（参考 Void）：
- **事件去重**：相同路径的连续事件只保留最后一个
- **防抖机制**：500ms 内的多个事件合并为一个
- **事件过滤**：忽略临时文件（.tmp、.swp）、隐藏文件（.git）、系统文件
- **增量更新**：只更新变化的文件节点，不重建整个文件树

**外部修改检测**：
- 定期检查打开文件的修改时间
- 如果文件被外部修改，提示用户是否重新加载
- 如果文件有未保存更改，提示用户处理冲突

**Rust 实现**：

```rust
// src-tauri/src/services/file_tree.rs
use notify::{Watcher, RecursiveMode, Event, EventKind};

pub struct FileTreeWatcher {
    watcher: RecommendedWatcher,
    event_queue: VecDeque<FileChangeEvent>,
    debounce_timer: Option<tokio::time::Instant>,
}

impl FileTreeService {
    // 监听目录变化，发送事件到前端
    pub fn watch_directory(path: &Path, app_handle: tauri::AppHandle) -> Result<notify::RecommendedWatcher, Error> {
        let mut watcher = notify::recommended_watcher(move |event: Result<Event, notify::Error>| {
            // 事件去重和防抖处理
            // 过滤临时文件和系统文件
            // 发送事件到前端
        })?;
        
        watcher.watch(path, RecursiveMode::Recursive)?;
        Ok(watcher)
    }
    
    // 检测外部修改
    pub async fn check_external_modification(&self, path: &Path, last_modified: SystemTime) -> Result<bool> {
        let metadata = std::fs::metadata(path)?;
        Ok(metadata.modified()? > last_modified)
    }
}
```

#### 3.3.4 工作区管理

**功能**：
- 打开工作区（文件夹）
- 管理最近工作区列表
- 工作区信息显示在文件树顶部

**Rust 后端接口**：

```rust
// src-tauri/src/services/workspace.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub path: String,
    pub name: String,
    pub opened_at: DateTime<Utc>,
}

pub struct WorkspaceService {
    current_workspace: Option<Workspace>,
    recent_workspaces: Vec<Workspace>,
}

impl WorkspaceService {
    pub fn open_workspace(&mut self, path: &Path) -> Result<(), Error>;
    pub fn get_recent_workspaces(&self) -> Vec<Workspace>;
}
```

#### 3.3.5 SQLite 全文索引（毫秒级全文搜索）

**功能特性**：
- 毫秒级全文搜索（SQLite FTS5）
- 搜索结果片段高亮
- 搜索历史记录
- 增量索引更新（文件变化时自动更新）

**Rust 后端接口**：

```rust
// src-tauri/src/services/search_service.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String, // 高亮片段
    pub rank: f64,       // 相关性评分
}

pub struct SearchService {
    db: Connection,
}

impl SearchService {
    // 初始化全文索引（FTS5）
    pub fn new(db_path: &Path) -> Result<Self>;
    
    // 索引文档
    pub fn index_document(&self, path: &str, title: &str, content: &str, file_type: &str) -> Result<()>;
    
    // 全文搜索（毫秒级）
    pub fn search(&self, query: &str, limit: i32) -> Result<Vec<SearchResult>> {
        // 使用 FTS5 的 rank 函数排序
        // 使用 prepared statement 提高性能
        // 支持片段高亮
    }
    
    // 删除文档索引
    pub fn remove_document(&self, path: &str) -> Result<()>;
    
    // 增量索引更新（文件变化时自动更新）
    pub fn update_index_on_change(&self, path: &Path, event: &FileChangeEvent) -> Result<()>;
    
    // 异步构建初始索引（不阻塞启动）
    pub async fn build_index_async(workspace_path: &Path) -> Result<()> {
        // 后台任务：遍历所有文件并索引
        // 每 100 个文件提交一次（批量提交提高性能）
    }
}
```

### 3.4 UI 布局系统模块

#### 3.4.1 可拖拽布局系统

**布局特性**：
- 三个主功能模块：文件树管理区、文档预览编辑区、AI 聊天窗口
- 默认左中右布局
- 用户可自由拖动面板位置
- 移动到上下左右边缘时自动吸附边缘形成新布局
- 聊天窗口移动到中间区域自动识别为悬浮对话框

**状态管理**：

```typescript
// src/stores/layoutStore.ts
interface LayoutState {
  fileTree: {
    position: 'left' | 'right' | 'top' | 'bottom' | 'floating';
    width: number;
    visible: boolean;
  };
  editor: {
    position: 'center' | 'left' | 'right' | 'full';
  };
  chat: {
    position: 'right' | 'left' | 'top' | 'bottom' | 'floating';
    width: number;
    visible: boolean;
    isFloating: boolean;
    floatingPosition: { x: number; y: number };
  };
  isFirstOpen: boolean;
  showWelcomeDialog: boolean;
}
```

**边缘吸附逻辑**：
- 检测面板位置是否接近边缘（阈值 50px）
- 检测聊天窗口是否在中间区域（阈值 100px）
- 自动吸附到边缘或切换为浮动模式

**组件结构**：

```typescript
// src/components/Layout/MainLayout.tsx
export const MainLayout: React.FC = () => {
  // 首次打开显示欢迎对话框
  // 三个可拖拽面板：文件树、编辑器、聊天窗口
  // 边缘吸附和浮动检测
};
```

#### 3.4.2 欢迎对话框

**功能**：
- 首次打开应用时显示
- 项目操作按钮：打开项目、新建项目
- 历史项目快捷进入：显示最近打开的工作区列表

**组件**：

```typescript
// src/components/Layout/WelcomeDialog.tsx
export const WelcomeDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // 加载最近工作区
  // 打开项目/新建项目
  // 历史项目列表
};
```

---

## 四、核心风险点与应对策略

### 4.0 核心风险点

#### 4.0.1 风险一：DOCX 的"无损回写" ⚠️⚠️⚠️ **极高风险**

**风险描述**：
HTML ↔ DOCX 的数据模型不对等，Round-trip 转换必然导致数据丢失。

**丢失的格式**：
- 页眉、页脚、分页符
- 复杂的文本框布局
- SmartArt、VBA 宏
- 复杂样式（多级样式、自定义样式）

**应对策略**：Pandoc + 草稿副本

**核心策略**：
- 使用 Pandoc（转换质量更好）
- 文件树显示原格式文件（.docx、.md 等）
- 直接保存为原格式
- 复杂格式 DOCX 创建同名草稿副本（`document.draft.docx`）

**处理流程**：
```
打开 DOCX → 检测复杂度 → 
简单格式：直接打开 → Pandoc 解析 → TipTap 编辑 → 保存为原 DOCX
复杂格式：创建草稿副本 → Pandoc 解析 → TipTap 编辑 → 保存到草稿文件
```

**用户预期管理**：
- 复杂格式时提示"已创建草稿副本"
- 文件树中显示草稿文件（`document.draft.docx`）
- 直接保存为原格式，保持文件可见性

#### 4.0.2 风险二：MVP 范围失控 ⚠️⚠️ **高风险**

**风险描述**：
开发表格和演示文稿编辑器的工作量不亚于文档编辑器本身。

**应对策略**：修正 MVP 范围

**MVP 1.0 范围**：
- 只做文档编辑器（极致打磨）
- 完整的 AI 辅助功能
- 完整的文件管理系统
- 移除表格编辑器（移至 MVP 2.0）
- 移除演示文稿编辑器（移至 MVP 3.0）

**产品路线图**：
- MVP 1.0（30 周）：文档编辑器 + AI 功能 + 文件管理
- MVP 2.0（+6 月）：表格编辑器
- MVP 3.0（+12 月）：演示文稿编辑器

### 4.1 核心功能设计

#### 4.1.1 SQLite 全文索引

**功能**：
- 毫秒级全文搜索（SQLite FTS5）
- 搜索结果片段高亮
- 增量索引更新（文件变化时自动更新）

**技术实现**：见 3.3.5 节

#### 4.1.2 Inline Assist（行内辅助）

**功能**：
- 选中文本后按 Cmd+K 激活
- 输入改写指令（如"改得更委婉一点"）
- AI 直接在原文位置生成 Diff 视图（红删绿增）
- 对比查看修改前后差异
- 一键应用或取消修改

**技术实现**：

```typescript
// src/hooks/useInlineAssist.ts
export const useInlineAssist = (editor: Editor | null) => {
  // Cmd+K 激活
  // 显示输入框
  // 调用 AI 处理
  // 显示 Diff 视图（可选）
  // 应用或取消修改
};
```

#### 4.1.3 记忆库功能（长文档场景）

**功能**：
- 自动识别文档中的关键信息（人物、地点、事件、时间等）
- 记忆库面板展示所有记忆项
- 点击记忆项查看详细信息和出现位置
- 一键跳转到记忆项出现的位置
- 一致性检查（人物名称、时间节点等）

**展示位置**：
- 在聊天窗口的标签栏中添加"记忆库"标签（图标：🧠）
- 点击后切换到记忆库面板

**Rust 后端接口**：

```rust
// src-tauri/src/services/memory_service.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub r#type: MemoryType, // Character, Location, Event, Time, Concept, Object
    pub name: String,
    pub content: String,
    pub occurrences: Vec<Occurrence>, // 出现位置
}

pub struct MemoryService {
    memories: Vec<MemoryItem>,
}

impl MemoryService {
    // 分析文档，提取记忆项
    pub async fn analyze_document(&mut self, path: &Path, content: &str) -> Result<Vec<MemoryItem>, Error>;
    
    // 检查一致性
    pub fn check_consistency(&self) -> Vec<ConsistencyIssue>;
}
```

---

## 五、开发实施计划

### 5.1 开发阶段划分

#### 阶段一：基础架构搭建（4 周）

**Week 1-2：项目初始化和基础框架**
- 创建 Tauri 项目
- 配置开发环境（Rust + React + TypeScript）
- 搭建项目目录结构
- 配置构建和打包流程
- 实现基础的前后端通信（Tauri IPC）

**Week 3：布局系统**
- 实现可拖拽布局系统
- 实现边缘吸附功能
- 实现欢迎对话框
- 实现布局状态管理

**Week 4：文件树基础**
- Rust 后端：实现文件树构建逻辑
- Rust 后端：实现文件系统操作（读取、写入）
- React 前端：实现文件树组件（显示工作区根目录）
- 实现文件选择和打开功能
- 实现新建文件下拉菜单（图标按钮）

**交付物**：
- 可运行的应用框架
- 基础布局系统
- 文件树显示和基本操作

#### 阶段二：文档编辑器核心功能（6 周）

**Week 5-6：TipTap 编辑器集成**
- 集成 TipTap 编辑器
- 实现基础编辑功能（文本、样式、列表等）
- 实现编辑器工具栏（根据文件类型动态显示）
- **实现图片处理功能**：
  - 图片插入（复制到 assets/ 文件夹）
  - 图片显示（file:// 路径）
  - 图片删除和清理

**Week 7：Markdown 支持**
- 实现 Markdown 导入/导出
- 实现 Markdown 预览
- 测试 Markdown 编辑体验

**Week 8-9：DOCX 文件处理（Pandoc 集成）**
- 集成 Pandoc（检测系统或打包二进制）
- 实现 DOCX → HTML 转换（Pandoc）
- 实现 HTML → DOCX 转换（Pandoc，**自动处理图片打包**）
- 实现 DOCX 文件打开
- 实现 DOCX 文件保存（直接保存为原格式）
- 实现格式检测和复杂度判断
- 实现草稿副本创建机制
- **验证 Pandoc 图片打包功能**：确保图片正确嵌入 DOCX

**Week 10：保存机制**
- 实现自动保存逻辑（2秒防抖）
- 实现手动保存（Cmd/Ctrl + S）
- 实现另存为功能（不同格式或位置）
- 实现保存状态提示

**交付物**：
- 完整的文档编辑器
- DOCX 文件创建、编辑、保存（使用 Pandoc，直接保存为原格式）
- 草稿副本机制（复杂格式 DOCX）
- 自动保存和手动保存功能
- **图片处理功能**：图片插入、存储到 assets/ 文件夹、编辑器显示、保存时 Pandoc 自动打包进 DOCX

#### 阶段三：AI 功能集成（6 周）

**Week 11-12：AI 模型管理**
- Rust 后端：实现 AI 服务框架
- 实现多模型提供商支持（OpenAI、Anthropic、Gemini 等）
- 实现模型配置管理
- 实现本地模型支持（Ollama）
- React 前端：实现 AI 设置界面

**Week 13-14：层次一：AI 自动补全**
- 实现触发逻辑（光标静止 7 秒检测，可配置）
- 实现幽灵文字显示
- 实现 Tab/Esc 交互
- 集成快速模型（GPT-3.5、Claude Haiku 等）
- 实现请求缓存和去重机制

**Week 15：层次二：Inline Assist**
- 实现 Cmd+K 快捷键
- 实现输入框组件（浮动显示）
- 实现直接修改文本逻辑
- 可选：实现 Diff 视图

**Week 16：层次三：AI 聊天窗口**
- 实现聊天界面
- 实现标签栏（多线程聊天）
- 实现模型选择（标题栏下拉框）
- 实现引用内容显示
- 实现记忆库标签（🧠 图标）
- 实现工具调用

**交付物**：
- 完整的 AI 模型管理
- AI 三层架构（自动补全、Inline Assist、聊天窗口）
- 记忆库功能

#### 阶段四：文件管理完善（4 周）

**Week 17：文件监听和工作区**
- 实现文件系统监听
- 实现工作区管理
- 实现最近工作区列表
- 实现工作区切换

**Week 18：文件操作增强**
- 实现文件创建、删除、重命名（直接操作本地文件）
- 实现文件夹操作
- 实现文件拖拽导入（移动文件，跨分区则复制）
- 实现导入操作（复制文件）
- 实现右键菜单

**Week 19：SQLite 全文索引**
- Rust 后端：实现全文索引服务（FTS5）
- 创建 FTS5 虚拟表
- 实现文档索引功能
- 实现增量索引更新
- 实现毫秒级全文搜索
- 实现搜索结果片段高亮

**Week 20：AI 智能分类整理**
- 实现文件内容分析
- 实现文件夹结构理解
- 实现智能分类算法
- 实现批量整理功能

**交付物**：
- 完整的文件管理系统
- SQLite 全文搜索（毫秒级）
- AI 智能分类整理

#### 阶段五：AI 功能增强和优化（6 周）

**Week 21-22：AI 功能增强**
- 实现 AI 图片生成
- 实现 AI 分析和引用
- 实现 AI 排版功能
- 优化 AI 提示词和响应质量

**Week 23-24：记忆库功能完善**
- 实现记忆库数据结构完善
- 实现记忆项展示和管理（在聊天标签栏中）
- 实现一致性检查
- 实现记忆项搜索和跳转

**Week 25-26：用户体验优化**
- 优化 UI/UX
- 实现主题定制（暗色模式）
- 优化性能（大文件处理）
- 完善错误处理和用户提示
- 优化 DOCX 处理提示和流程

**交付物**：
- 完整的 AI 功能
- 优化的用户体验
- 极致打磨的文档编辑器

#### 阶段六：测试和发布准备（4 周）

**Week 27-28：功能测试**
- 编写测试用例
- 功能测试
- 兼容性测试（Windows、macOS、Linux）
- 性能测试
- Bug 修复

**Week 29：用户文档**
- 编写用户手册
- 编写快速入门指南
- 录制演示视频
- 完善帮助文档

**Week 30：发布准备**
- 打包和签名
- 创建安装程序
- 准备发布说明
- 准备发布渠道

**交付物**：
- 经过全面测试的应用
- 完整的用户文档
- 可发布的安装包

### 5.2 关键里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| **M1：基础架构完成** | Week 4 | 可运行的应用框架、布局系统、文件树（显示根目录） |
| **M2：文档编辑器完成** | Week 10 | 完整的文档编辑器、DOCX 支持（Pandoc）、草稿副本机制、保存机制（自动+手动+另存为） |
| **M3：AI 功能完成** | Week 16 | AI 三层架构（自动补全、Inline Assist、聊天窗口）、记忆库功能 |
| **M4：文件管理完成** | Week 20 | 完整的文件管理系统、SQLite 全文搜索、AI 分类整理 |
| **M5：AI 增强完成** | Week 26 | 记忆库功能完善、AI 图片生成、完整 AI 功能 |
| **M6：发布准备完成** | Week 30 | 测试完成、文档完成、MVP 1.0 可发布版本 |

**MVP 范围**：
- MVP 1.0 只包含文档编辑器（极致打磨）
- 不包含表格编辑器（移至 MVP 2.0）
- 不包含演示文稿编辑器（移至 MVP 3.0）

### 5.3 资源需求

#### 5.3.1 开发团队

**核心团队（5-6 人）**：
1. **前端开发（2 人）**：TipTap 编辑器集成、React 组件开发、UI/UX 实现、布局系统开发
2. **后端开发（1-2 人）**：Rust 后端开发、文件系统服务、DOCX 处理、AI 服务集成
3. **AI 开发（1 人）**：AI 模型管理和集成、自动补全算法、提示词优化、AI 功能开发
4. **测试（1 人）**：功能测试、兼容性测试、性能测试、用户体验测试

**可选**：UI/UX 设计师（1 人）

#### 5.3.2 开发工具和资源

**开发工具**：
- IDE：VS Code + Rust Analyzer
- 版本控制：Git
- 项目管理：GitHub Projects 或 Jira
- 设计工具：Figma

**依赖库**：
- 前端：React 18、TypeScript、TipTap、Tailwind CSS、Zustand
- 后端：Tauri、Tokio、Serde、notify
- 格式转换：Pandoc（DOCX、Markdown、HTML 等格式转换）
- 数据库：SQLite + FTS5（全文索引）
- AI：各模型提供商的 Rust SDK

**Pandoc 集成方案**：
- 打包 Pandoc 二进制文件到应用内（应用体积增加约 50-100MB）

**Rust 实现**：

```rust
// src-tauri/src/services/pandoc_service.rs
pub struct PandocService {
    pandoc_path: Option<PathBuf>,
}

impl PandocService {
    pub fn new() -> Self {
        // 检测系统 Pandoc，如果未安装则使用内置 Pandoc
    }
    
    pub async fn convert(&self, from: &str, to: &str, input_path: &Path, output_path: &Path) -> Result<(), Error>;
}
```

**测试环境**：
- Windows 10/11
- macOS（最新版本）
- Linux（Ubuntu LTS）

### 5.4 风险评估和应对

#### 5.4.1 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| **DOCX 无损回写** | ⚠️⚠️⚠️ 极高 | 高 | ✅ 已修正：Pandoc 集成，文件树显示原格式，复杂格式创建草稿副本 |
| DOCX 格式兼容性 | 高 | 中 | 明确告知格式限制 |
| TipTap 编辑器集成 | 中 | 低 | TipTap 技术成熟，提前验证 |
| Rust 后端开发难度 | 中 | 中 | 提前学习 Rust，参考 Void 的 Rust 代码 |
| 性能问题（大文件） | 中 | 中 | 分页加载，虚拟滚动，性能优化 |
| SQLite 索引性能 | 低 | 低 | SQLite FTS5 性能优秀 |

#### 5.4.2 项目风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| **MVP 范围失控** | ⚠️⚠️ 高 | 中 | ✅ 已修正：MVP 1.0 只做文档编辑器 |
| 开发周期延长 | 高 | 中 | 设置缓冲时间，优先核心功能 |
| 人员变动 | 高 | 低 | 文档完善，代码规范，知识共享 |
| 需求变更 | 中 | 中 | 明确需求范围，变更控制流程 |
| 功能打磨不足 | 高 | 中 | 专注核心功能，不要急于扩展功能 |

---

## 五、技术细节和最佳实践

### 5.1 代码规范

**前端（TypeScript）**：
- 使用 ESLint + Prettier
- 严格的 TypeScript 类型检查
- 组件使用函数式组件 + Hooks
- 状态管理使用 Zustand

**后端（Rust）**：
- 使用 `rustfmt` 格式化代码
- 使用 `clippy` 进行代码检查
- 遵循 Rust 最佳实践
- 错误处理使用 `Result<T, E>`

### 5.2 性能优化

**前端优化**：
- 使用 React.memo 避免不必要的重渲染
- 虚拟滚动处理大列表
- 代码分割和懒加载
- 图片懒加载和优化

**后端优化**：
- 异步处理文件操作
- 文件监听使用事件驱动
- 缓存文件树结构
- 流式处理大文件

### 5.3 安全性

- **文件路径验证**：防止路径遍历攻击，确保路径在工作区根目录内
- **用户输入验证和清理**：所有用户输入进行验证和清理
- **API 密钥安全存储**：使用 AES-256-GCM 加密存储 API 密钥
- **敏感数据不记录日志**：API 密钥、用户文件内容不记录到日志
- **XSS 防护**：TipTap 编辑器输出内容进行 HTML 转义
- **文件权限检查**：操作文件前检查读写权限
- **原子写入**：先写临时文件，再重命名，确保文件完整性

### 5.4 可维护性

- 清晰的代码注释
- 完善的文档（API 文档、架构文档）
- 单元测试和集成测试
- 代码审查流程

---

## 六、产品路线图

### 6.1 MVP 1.0（最小可行产品）

**目标**：30 周内完成 MVP 1.0

**产品定位**：极致打磨的文档编辑器，秒杀 Word 的写作体验

**核心功能**：

1. **文档编辑器**（TipTap）
   - 富文本编辑（标题、段落、列表、样式、图片、表格）
   - **图片处理**：图片插入、存储到 assets/ 文件夹、编辑器显示、保存时 Pandoc 自动打包进 DOCX
   - Markdown 支持
   - 工具栏根据文件类型动态显示

2. **DOCX 文件支持**（Pandoc 集成）
   - DOCX 导入（直接打开，复杂格式创建草稿副本）
   - 文件树显示原格式文件（.docx、.md 等）
   - 草稿副本显示为 `document.draft.docx`
   - 保存机制：自动保存、手动保存、另存为

3. **文件管理系统**
   - 文件树（显示工作区根目录）
   - 文件操作（直接操作本地文件）
   - 新建文件（图标按钮+下拉菜单）
   - 导入操作（复制文件）
   - 拖拽文件（移动文件）
   - SQLite 全文搜索（毫秒级）
   - AI 智能分类整理

4. **AI 功能（三层架构）**
   - 层次一：自动补全（光标静止 7 秒，幽灵文字，可配置）
   - 层次二：Inline Assist（Cmd+K，独立输入框）
   - 层次三：聊天窗口（标签栏、模型选择、引用内容、记忆库标签）
   - AI 图片生成
   - 记忆库功能（长文档场景）

5. **布局系统**（类似 Cursor）
   - 三栏可拖拽布局
   - 边缘吸附
   - 悬浮对话框
   - 欢迎对话框

**不包含功能**：
- 表格编辑器（移至 MVP 2.0）
- 演示文稿编辑器（移至 MVP 3.0）
- 系统托盘功能（移至后续版本）
- 文件关联注册：**可选功能**，安装时询问用户是否注册文件关联（双击 .docx 等文件打开 Binder）

**发布目标**：可以用于日常文档创作和 AI 辅助写作，体验优于 Word

### 6.2 MVP 2.0（表格编辑器）

**目标**：MVP 1.0 后 6-9 个月

**新增功能**：
- ✅ 表格编辑器
  - 基础表格编辑
  - 公式计算
  - 数据分析
  - XLSX 导入/导出
- ✅ AI 数据分析
  - 智能数据洞察
  - 趋势预测
  - 异常检测
- ✅ 表格模板系统

### 6.3 MVP 3.0（演示文稿编辑器）

**目标**：MVP 2.0 后 6-9 个月

**新增功能**：
- ✅ 演示文稿编辑器
  - 基础演示文稿编辑
  - 模板系统
  - 播放功能
  - PPTX 导入/导出
- ✅ AI 演示文稿生成
  - 根据内容自动生成
  - 智能排版
- ✅ 演示模式

### 6.4 V1.0（完整功能版本）

**目标**：MVP 3.0 后 3-6 个月

**新增功能**：
- 版本控制完善
- 协作功能（基础）
- 云端同步（可选）
- 更多格式支持

### 6.5 V2.0（增强版本）

**目标**：V1.0 后 6-12 个月

**新增功能**：
- 高级协作功能
- 完整云端同步
- 插件系统
- 移动端应用
- Web 版本

---

## 七、成功标准

### 7.1 技术指标

- 启动时间 < 2 秒
- 内存占用 < 200MB（空载）
- 大文件（10MB+）打开时间 < 3 秒
- AI 补全响应时间 < 2 秒
- 自动保存延迟 < 2 秒

### 7.2 用户体验指标

- 首次使用完成率 > 80%
- 用户满意度 > 4.0/5.0
- 日活跃用户留存率 > 60%
- 错误率 < 1%

### 7.3 功能完整性

- 核心功能 100% 实现
- DOCX 格式兼容性 > 90%（基本格式）
- AI 功能可用性 > 95%

---

## 八、总结

本开发方案采用轻量化重构方案（Tauri + React + TipTap + Rust），符合 Binder 产品的第一性原理要求。

### 8.1 核心优势

1. 架构清晰：无历史包袱，完全按照需求设计
2. 性能优秀：轻量级、启动快、内存占用低
3. 体验流畅：符合用户习惯，无学习成本
4. 技术成熟：所有技术栈都是成熟稳定的

### 8.2 方案要点

1. **DOCX 处理**：Pandoc 集成，文件树显示原格式文件，复杂格式创建草稿副本
2. **MVP 范围**：MVP 1.0 只做文档编辑器，极致打磨
3. **AI 三层架构**：自动补全（幽灵文字）、Inline Assist（Cmd+K）、聊天窗口（完整对话）
4. **文件管理**：直接操作本地文件，导入=复制，拖拽=移动
5. **核心功能**：SQLite 全文索引、Inline Assist、记忆库功能
6. **图片处理**：图片存储到 assets/ 文件夹，编辑器使用 file:// 路径显示，Pandoc 自动打包进 DOCX
6. **图片处理**：图片存储到 assets/ 文件夹，编辑器使用 file:// 路径显示，Pandoc 自动打包进 DOCX

### 8.3 实施可行性

- 技术方案可行：所有技术栈都是成熟稳定的
- 开发周期合理：30 周完成 MVP 1.0
- 资源需求明确：5-6 人的开发团队
- 风险可控：有明确的应对措施

### 8.4 关键成功因素

1. 专注核心功能：MVP 1.0 只做文档编辑器，做到极致
2. 诚实面对限制：明确告知 DOCX 格式限制，不妥协用户体验
3. AI 深度集成：AI 功能深度融入编辑流程，而非简单叠加
4. 性能优先：毫秒级搜索、流畅编辑体验

---

**方案版本**：v1.6（图片处理补充版：已整合UI修正、AI三层架构、技术实现细节、产品决策和图片处理功能，参考 Void/Cursor 方案）  
**创建日期**：2025年  
**最后更新**：2025年  
**方案状态**：✅ **可执行（图片处理补充版）**  
**关键补充**：图片处理功能（assets/ 文件夹存储，file:// 路径显示，Pandoc 自动打包）

