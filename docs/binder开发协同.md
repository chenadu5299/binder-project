# Binder 开发协同文档

> **文档目的**：定义四个工作组（AI、资源、编辑器、UI/UX）之间的接口、协议、工作逻辑和关键名称，确保各组协作顺畅，避免“三不管地带”和“重复造轮子”。

> **维护原则**：本文档由 AI 功能组主导创建，但需要所有工作组共同维护。任何接口变更必须先在本文档中更新，并通知相关工作组。

---

## 一、工作组职责与边界定义

### 1. AI 功能组（The Brain）

**核心职责**：
- 所有与 LLM（DeepSeek/Ollama/OpenAI）的通信和流式处理
- AI 工具调用的执行与结果分发
- AI 响应的去重、清洗和格式化
- Prompt Engineering 和上下文管理
- 向量检索和 RAG 引擎（规划中）

**技术栈**：
- 后端：Rust (`reqwest`, `tokio_stream`, `serde_json`)
- 前端：TypeScript（事件监听和状态管理）

**关键交付物**：
- `AIService` (Rust)：封装 AI 提供商接口
- `StreamHandler` (Rust)：流式响应去重和清洗
- `ToolService` (Rust)：工具调用执行引擎
- `ChatPanel` (React)：AI 聊天界面和消息流管理
- `ChatStore` (Zustand)：聊天状态管理（包括临时聊天标记和绑定工作区）

**边界约束**：
- ✅ AI 组负责产出数据（文本/指令），不负责渲染到屏幕
- ✅ AI 组不直接操作文件系统（通过工具调用委托给资源组）
- ✅ AI 组不直接操作编辑器状态（通过事件系统通信）

---

### 2. 本地资源管理组（The Backbone）

**核心职责**：
- 文件系统 I/O（读写、创建、删除、重命名）
- 文件树结构和监听文件变动
- 全文搜索索引（SQLite FTS5）
- Pandoc 集成（DOCX/HTML/Markdown 转换）
- 工作区管理
- **聊天记录存储和加载**（绑定到工作区）

**技术栈**：
- 后端：Rust (`std::fs`, `notify`, `rusqlite`)
- 前端：TypeScript（文件树组件）

**关键交付物**：
- `FileTreeService` (Rust)：文件树构建和维护
- `FileWatcherService` (Rust)：文件系统监听和事件分发
- `SearchService` (Rust)：全文搜索索引
- `PandocService` (Rust)：文档格式转换
- `ChatService` (Rust)：聊天记录存储服务（新增）
  - `save_chat_to_workspace()`：保存聊天记录到工作区目录
  - `load_chat_from_workspace()`：从工作区加载聊天记录
  - `merge_chat_to_workspace()`：合并聊天记录到工作区
- `FileTree` (React)：文件树 UI 组件
- `FileTreePanel` (React)：文件树面板组件（包含关闭按钮，由 UI/UX 组提供样式）

**边界约束**：
- ✅ 资源组只负责文件在硬盘和内存之间的搬运
- ✅ 资源组不负责文件的展示样式（编辑器组）
- ✅ 资源组不负责文件的 AI 处理（AI 组）
- ✅ 资源组负责聊天记录的持久化存储（工作区目录下的 `.binder/chat_sessions/`）

---

### 3. 文档编辑器组（The Face）

**核心职责**：
- Tiptap/ProseMirror 编辑器的封装和管理
- Markdown 快捷键和语法支持
- 幽灵文字（Ghost Text）渲染
- Diff 视图（红绿对比）
- 编辑器状态管理（光标、选区、文档内容）

**技术栈**：
- 前端：React, Tiptap (ProseMirror), TypeScript
- 后端：无直接交互（通过事件系统）

**关键交付物**：
- `TipTapEditor` (React)：主编辑器组件
- `GhostText` (React)：AI 自动补全的幽灵文字
- `DiffView` (React)：AI 修改建议的对比视图
- `EditorPanel` (React)：编辑器面板组件（包含关闭按钮，由 UI/UX 组提供样式）
- `EditorStore` (Zustand)：编辑器状态管理

**边界约束**：
- ✅ 编辑器组只负责内存中的 Document State
- ✅ 保存文件时通过 `documentService` 委托给资源组
- ✅ 编辑器组不直接调用 AI API（通过事件系统接收数据）

---

### 4. UI/UX 组（The Skin）

**核心职责**：
- 应用整体视觉和交互规范
- 布局系统（三栏布局、可拖动分隔条、面板显示/隐藏控制）
- 标题栏组件（窗口切换按钮）
- 通用组件库（按钮、模态框、Toast）
- 主题管理（深色/浅色模式）

**技术栈**：
- 前端：React, Tailwind CSS, TypeScript

**关键交付物**：
- `MainLayout` (React)：主布局组件（整合文件树、编辑器、聊天面板）
- `TitleBar` (React)：标题栏组件（应用窗口右上角的窗口切换按钮，参考 Cursor 样式）
- `PanelResizer` (React)：可拖动分隔条组件（用于调整面板宽度）
- `WelcomePage` (React)：欢迎页面（全屏，首次启动，替代 `WelcomeDialog`）
  - `WelcomeHeader` (React)：应用名称显示
  - `WelcomeChatInput` (React)：欢迎页面的聊天输入框包装组件
  - `QuickActions` (React)：快捷操作按钮组件
  - `RecentWorkspaces` (React)：历史工作区列表组件
- `TemporaryChatWarning` (React)：退出时的临时聊天警告对话框（新增）
- `ChatMergeDialog` (React)：打开工作区时的聊天合并对话框（新增）
- `Design System`：通用组件库
  - `Button`：按钮组件（支持 primary/secondary/danger 变体）
  - `Modal`：模态框组件
  - `Toast`：Toast 通知系统（支持 success/error/warning/info 类型）
  - `ErrorBoundary`：错误边界组件（全局错误捕获）
  - `LoadingSpinner`：加载指示器（支持 sm/md/lg 尺寸）
- `Settings`：设置组件
  - `APIKeyConfig`：API Key 配置对话框
  - `ThemeSelector`：主题选择器（light/dark/auto）
- `LayoutStore` (Zustand)：布局状态管理（面板宽度、可见性，包括文件树、编辑器、聊天、分析面板）
- `ThemeStore` (Zustand)：主题状态管理（light/dark/auto，支持系统跟随）
- `ToastStore` (Zustand)：Toast 通知状态管理

**边界约束**：
- ✅ UI/UX 组为其他三个组提供“乐高积木”
- ✅ UI/UX 组不处理业务逻辑（委托给相应工作组）

---

## 二、工作组间接口与协议

### 2.1 AI 组 ↔ 资源组接口

#### 接口 1：文件读取（AI → 资源）

**触发场景**：AI 工具调用 `read_file`

**AI 组职责**：
- 在 `tool_service.rs` 中定义 `read_file` 工具
- 调用资源组的文件读取接口

**资源组职责**：
- 提供 Tauri IPC 命令：`read_file_content(path: String) -> Result<String, String>`
- 实现文件读取逻辑（路径验证、权限检查）

**数据流向**：
```
AI 工具调用 → ToolService::read_file() → invoke('read_file_content') → 资源组
```

**接口定义**：

```rust
// src-tauri/src/commands/file_commands.rs
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String>
```

**TypeScript 类型**：
```typescript
// 通过 invoke 调用，无需显式类型定义
const content = await invoke<string>('read_file_content', { path: 'xxx.md' });
```

---

#### 接口 2：文件创建（AI → 资源）

**触发场景**：AI 工具调用 `create_file`

**AI 组职责**：
- 定义 `create_file` 工具
- 执行工具调用（通过 `ToolService`）
- 获取工具执行结果（`ToolResult`）
- 将工具结果发送回 AI 聊天流继续对话
- 执行后触发 `file-tree-changed` 事件

**资源组职责**：
- 提供文件创建接口（`ToolService::create_file`）
- 返回 `ToolResult` 给 AI 组
- 监听文件系统变化，发送 `file-tree-changed` 事件

**数据流向**：
```
AI 工具调用 → ToolService::create_file() → 创建文件 → 返回 ToolResult
  ↓
AI 组：接收 ToolResult → 发送到 ai-chat-stream 事件（包含 result）
  ↓
AI 组：AI 模型基于工具结果继续生成对话内容（自动继续）
  ↓
触发 file-tree-changed 事件 → 前端 FileTree 组件刷新
```

**接口定义**：

```rust
// src-tauri/src/commands/file_commands.rs
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String>

// ToolService 返回 ToolResult
pub struct ToolResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub message: Option<String>,
}
```

**工具调用结果回传流程**（关键说明）：

```rust
// AI 组（ai_commands.rs）
// 工具调用执行后的处理流程

match tool_service.execute_tool(&tool_call, &workspace_path).await {
    Ok(tool_result) => {
        // 1. 工具执行成功，获取 ToolResult
        // 2. 将 ToolResult 作为消息内容发送到前端
        let tool_result_message = format!(
            "\n\n[工具调用: {}]\n结果: {}",
            name,
            serde_json::to_string_pretty(&tool_result).unwrap_or_default()
        );
        
        // 3. 发送工具调用结果到前端（通过 ai-chat-stream 事件）
        app_handle.emit("ai-chat-stream", {
            "tab_id": tab_id,
            "chunk": tool_result_message,
            "tool_call": {
                "id": id,
                "name": name,
                "result": tool_result,  // 【关键】工具结果
                "status": "completed",
            },
        })?;
        
        // 4. 【重要】在流式聊天中，工具结果会自动作为上下文继续对话
        //    AI 模型会基于工具结果生成后续响应
        //    这个过程是自动的，无需额外调用
    }
    Err(e) => {
        // 错误处理
    }
}
```

**⚠️ 重要说明**：
1. 工具调用结果通过 `ai-chat-stream` 事件发送到前端显示
2. 在流式聊天中，工具结果会自动作为上下文继续对话，AI 模型会基于结果生成后续响应
3. 这个过程是**自动的**，工具调用执行与 AI 响应生成在同一个流式任务中
4. 无需额外的 `ai_tool_result` 命令，结果已经正确回传并继续对话

**事件协议**：

```rust
// 后端触发事件（文件树变化）
app_handle.emit("file-tree-changed", workspace_path)?;

// 前端监听事件
listen<string>('file-tree-changed', (event) => {
  if (event.payload === currentWorkspace) {
    loadFileTree(); // 刷新文件树
  }
});
```

---

#### 接口 3：文件搜索（AI → 资源）

**触发场景**：AI 需要引用文件（@文件名）

**AI 组职责**：
- 查询文件树索引（SQLite）
- 或调用资源组的搜索接口

**资源组职责**：
- 维护文件树索引（SQLite FTS5）
- 提供搜索接口

**接口定义**：

```rust
// src-tauri/src/commands/search_commands.rs
#[tauri::command]
pub async fn search_documents(query: String) -> Result<Vec<SearchResult>, String>
```

**TypeScript 类型**：

```typescript
interface SearchResult {
  path: string;
  name: string;
  snippet?: string;
  score: number;
}
```

---

### 2.2 AI 组 ↔ 编辑器组接口

#### 接口 1：自动补全（AI → 编辑器）

**触发场景**：用户输入时触发 AI 自动补全

**AI 组职责**：
- 提供 `ai_autocomplete` Tauri 命令
- 流式返回补全文本
- 触发 `ai-autocomplete-stream` 事件

**编辑器组职责**：
- 调用 `getCursorContext()` 获取上下文
- 监听 `ai-autocomplete-stream` 事件
- 渲染幽灵文字（Ghost Text）

**数据流向**：
```
编辑器：光标位置变化 → 调用 ai_autocomplete(context, position)
  ↓
AI 组：流式返回补全文本 → 触发 ai-autocomplete-stream 事件
  ↓
编辑器：监听事件 → 渲染 GhostText 组件
```

**接口定义**：

```rust
// src-tauri/src/commands/ai_commands.rs
#[tauri::command]
pub async fn ai_autocomplete(
    context: String,      // 编辑器提供的上下文
    position: usize,      // 光标位置
    max_length: usize,    // 最大补全长度
    service: State<'_, AIServiceState>,
) -> Result<String, String>
```

**事件协议**：

```rust
// 后端触发流式事件
app_handle.emit("ai-autocomplete-stream", {
  "chunk": "...",
  "done": false,
})?;
```

```typescript
// 前端监听
listen<AutocompleteChunk>('ai-autocomplete-stream', (event) => {
  const { chunk, done } = event.payload;
  // 更新 GhostText 组件
});
```

**编辑器组需要提供的方法**：

```typescript
// EditorPanel.tsx 或 TipTapEditor.tsx
function getCursorContext(): string {
  const editor = editorStore.getActiveTab()?.editor;
  if (!editor) return '';
  
  // 获取光标前后的文本（例如前后各 1000 字符）
  const { from } = editor.state.selection;
  const text = editor.state.doc.textContent;
  const start = Math.max(0, from - 1000);
  const end = Math.min(text.length, from + 1000);
  return text.slice(start, end);
}
```

---

#### 接口 2：Inline Assist（AI → 编辑器）

**触发场景**：用户按 `Cmd+K`，输入指令

**AI 组职责**：
- 提供 `ai_inline_assist` 命令
- 返回编辑指令或 Diff

**编辑器组职责**：
- 捕获快捷键，显示 InlineAssistInput
- 发送指令到 AI 组
- 渲染修改建议（Diff View）

**接口定义**：

```rust
#[tauri::command]
pub async fn ai_inline_assist(
    instruction: String,  // 用户输入的指令
    text: String,         // 选中的文本
    context: String,      // 上下文
    service: State<'_, AIServiceState>,
) -> Result<String, String>
```

**TypeScript 类型**：

```typescript
interface InlineAssistResult {
  replacement?: string;      // 替换文本
  diff?: {                   // 或提供 Diff
    from: number;
    to: number;
    insert: string;
  };
}
```

---

#### 接口 3：文档修改（AI → 编辑器）

**触发场景**：AI 聊天窗口中的 `edit_current_editor_document` 工具调用

**AI 组职责**：
- 定义 `edit_current_editor_document` 工具
- 触发 `editor-apply-diff` 事件

**编辑器组职责**：
- 监听 `editor-apply-diff` 事件
- 应用 Diff 到编辑器（显示确认对话框）

**数据流向**：
```
AI 工具调用 → edit_current_editor_document → 触发 editor-apply-diff 事件
  ↓
编辑器：监听事件 → 显示 Diff View → 用户确认 → 应用修改
```

**事件协议**：

```rust
// 后端触发（实际使用的事件名）
app_handle.emit("editor-update-content", {
  "file_path": "...",
  "content": "...",      // 新内容
  "instruction": "...",  // AI 的修改说明
})?;
```

```typescript
// 编辑器监听
listen<EditorUpdateContentEvent>('editor-update-content', (event) => {
  const { file_path, content, instruction } = event.payload;
  // 显示 Diff View，等待用户确认
});
```

**⚠️ 注意**：
- 实际代码中使用的事件名是 `editor-update-content`（而非文档中最初定义的 `editor-apply-diff`）
- 未来如需统一命名，需同时更新文档和代码

---

### 2.3 编辑器组 ↔ 资源组接口

#### 接口 1：文件保存（编辑器 → 资源）

**触发场景**：用户按 `Ctrl+S` 保存文件

**编辑器组职责**：
- 捕获保存快捷键
- 获取编辑器内容（HTML/JSON）
- 调用 `documentService.saveFile()`
- 监听 `fs-save-progress` 事件显示进度
- 更新 `EditorTab.isSaving` 状态

**资源组职责**：
- 提供 `write_file` 接口
- 如果是 DOCX，调用 Pandoc 转换
- 在长耗时操作中触发进度事件
- 设置超时限制（避免无响应）
- 触发文件修改事件

**数据流向**：
```
编辑器：用户按 Ctrl+S → 获取内容 → 设置 isSaving=true → documentService.saveFile()
  ↓
资源组：write_file() → Pandoc 转换（如需要，触发进度事件） → 保存到硬盘
  ↓
资源组：触发 fs-save-progress 事件（进度）→ 编辑器更新进度显示
  ↓
资源组：保存完成 → 触发 file-tree-changed 事件 → 文件树刷新
  ↓
编辑器：设置 isSaving=false → 显示保存成功 Toast
```

**接口定义**：

```typescript
// src/services/documentService.ts
async saveFile(filePath: string, content: string): Promise<void> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  if (ext === 'docx') {
    // 调用 Pandoc 转换（支持进度反馈）
    await invoke('save_docx', { path: filePath, htmlContent: content });
  } else {
    await invoke('write_file', { path: filePath, content });
  }
}
```

**进度事件协议**（关键优化）：

```rust
// 资源组（Rust 后端）
// 在 Pandoc 转换过程中触发进度事件

#[tauri::command]
pub async fn save_docx(
    path: String,
    html_content: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 触发开始事件
    app.emit("fs-save-progress", {
        "file_path": &path,
        "status": "started",
        "progress": 0,
    })?;
    
    // Pandoc 转换（分阶段触发进度）
    // ... 转换逻辑 ...
    
    app.emit("fs-save-progress", {
        "file_path": &path,
        "status": "converting",
        "progress": 50,
    })?;
    
    // 保存文件
    // ... 保存逻辑 ...
    
    app.emit("fs-save-progress", {
        "file_path": &path,
        "status": "completed",
        "progress": 100,
    })?;
    
    Ok(())
}
```

```typescript
// 编辑器监听进度事件
listen<SaveProgressEvent>('fs-save-progress', (event) => {
  const { file_path, status, progress } = event.payload;
  // 更新 EditorTab 状态
  // 显示进度条或 Toast
});
```

**EditorTab 状态扩展**（关键优化）：

```typescript
// src/stores/editorStore.ts
export interface EditorTab {
  // ... 其他字段
  isSaving: boolean;
  saveStartTimestamp: number | null;  // 【新增】保存开始时间戳（用于计算耗时和超时）
  lastSaveError: string | null;       // 【新增】最后的保存错误信息
}
```

**超时处理**：

```rust
// 资源组在 Rust 端设置超时
use tokio::time::{timeout, Duration};

pub async fn save_docx(...) -> Result<(), String> {
    // 设置 30 秒超时
    match timeout(Duration::from_secs(30), pandoc_convert(...)).await {
        Ok(result) => result,
        Err(_) => {
            Err("保存超时，请稍后重试".to_string())
        }
    }
}
```

---

#### 接口 2：文件打开（编辑器 ← 资源）

**触发场景**：用户双击文件树中的文件

**资源组职责**：
- 提供文件读取接口
- 识别文件类型（Markdown/HTML/DOCX）

**编辑器组职责**：
- 调用 `documentService.openFile(filePath, options?)`
- 识别文件类型和来源（新建/外部导入/AI生成）
- 根据文件打开策略决定编辑/预览模式
- 处理 DOCX 文件的预览和草稿创建

**资源组职责**：
- 提供 `open_docx()` 接口（DOCX → HTML 转换，用于编辑模式）
- 提供 `preview_docx()` 接口（DOCX → HTML 转换，用于预览模式，带后处理）
- 提供 `create_draft_docx()` 接口（创建草稿副本）
- 提供 `save_docx()` 接口（HTML → DOCX 转换，含进度事件）
- 提供 `create_file()` 接口（支持创建空 DOCX 文件）
- 提供 `cleanup_preview_cache()` 接口（清理预览缓存）
- 提供 `cleanup_file_preview_cache()` 接口（清理特定文件的预览缓存）

**命令定义**：

```rust
// src-tauri/src/commands/file_commands.rs

/// 预览 DOCX 文件（预览模式专用）
/// 
/// **重要说明**：此命令与 `open_docx` 的区别
/// - `open_docx`：用于编辑模式，返回 HTML 供 TipTap 编辑器使用（无后处理）
/// - `preview_docx`：用于预览模式，返回增强的 HTML 供 DocxPreview 组件使用（有后处理）
/// 
/// **后处理包括**：
/// - 文本框提取和绝对定位渲染
/// - 分栏样式应用
/// - Word 页面样式增强
/// - 暗色模式支持
/// - 页面标记
/// 
/// **使用场景**：
/// - DocxPreview 组件内部调用
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
    // 带缓存机制（1小时过期）
    // 发送 preview-progress 事件（"正在预览..."）
    // 超时机制：30秒超时，超时后提示失败并放弃转换
}


/// 清理所有预览缓存
#[tauri::command]
pub async fn cleanup_preview_cache() -> Result<(), String> {
    // 实现：清理所有过期的预览缓存
}

/// 清理特定文件的预览缓存
#[tauri::command]
pub async fn cleanup_file_preview_cache(
    path: String
) -> Result<(), String> {
    // 实现：清理指定文件的预览缓存
}
```

**TypeScript 类型**：

```typescript
// 预览 DOCX 文件
const htmlContent = await invoke<string>('preview_docx', {
  path: '/path/to/document.docx',
  app: appHandle, // Tauri AppHandle
});


}

// 清理预览缓存
await invoke('cleanup_preview_cache');
await invoke('cleanup_file_preview_cache', { path: '/path/to/document.docx' });
```

**文件打开策略**：

```typescript
// src/types/file.ts
export type FileType = 'markdown' | 'text' | 'docx' | 'html' | 'pdf' | 'image';
export type FileSource = 'new' | 'external' | 'ai_generated';

export interface FileOpenStrategy {
  fileType: FileType;
  source: FileSource;
  canEdit: boolean;           // 是否可编辑
  previewMode: boolean;       // 是否预览模式
  requiresConversion: boolean; // 是否需要格式转换
}
```

**文件打开接口**：

```typescript
// src/services/documentService.ts
async openFile(
  filePath: string,
  options?: {
    source?: FileSource;      // 显式指定来源
    forceEdit?: boolean;       // 强制编辑模式
  }
): Promise<void>
```

**DOCX 处理流程**：

1. **新建 DOCX**：
   - 文件树新建 → `create_file('document.docx', 'docx')`
   - 后端：使用 Pandoc 创建空 DOCX 文件
   - 前端：`openFile(filePath, { source: 'new' })` → 可编辑模式

2. **AI 生成 DOCX**：
   - AI 工具调用 → `create_file` → 后端使用 Pandoc 转换
   - 前端：`openFile(filePath, { source: 'ai_generated' })` → 可编辑模式

3. **外部导入 DOCX**：
   - 用户双击文件 → `openFile(filePath)` → 检测为 `external`
   - 预览模式（只读）→ 使用 `DocxPreview` 组件 → 调用 `preview_docx()` → 显示增强预览
   - 用户点击"编辑" → `create_draft_docx()` → 创建草稿 → 可编辑模式
   - 编辑模式 → 使用 `open_docx()` → TipTap 编辑器显示

**数据流向**：
```
资源组：用户双击文件 → 读取文件内容 → 返回给编辑器
  ↓
编辑器：创建标签页 → 渲染内容
```

---

### 2.4 编辑器组 ↔ UI/UX 组接口

#### 接口 1：通用组件使用（编辑器 → UI/UX）

**触发场景**：编辑器需要使用通用 UI 组件

**UI/UX 组职责**：
- 提供通用组件库（Button, Modal, Toast, LoadingSpinner, ErrorBoundary）
- 提供统一的样式规范（Tailwind CSS 类名）

**编辑器组职责**：
- 导入并使用 UI/UX 组提供的通用组件
- 遵循 UI/UX 组的设计规范

**数据流向**：
```
编辑器组件 → 导入 UI/UX 通用组件 → 使用
```

**接口定义**：

```typescript
// 编辑器组使用示例
import { toast } from '../Common/Toast';
import LoadingSpinner from '../Common/LoadingSpinner';
import Button from '../Common/Button';
import Modal from '../Common/Modal';
```

**使用规范**：
- ✅ 使用 `toast.success()`, `toast.error()` 显示用户反馈
- ✅ 使用 `LoadingSpinner` 显示加载状态
- ✅ 使用 `Button` 组件保持按钮样式一致
- ✅ 使用 `Modal` 显示确认对话框

---

### 2.5 AI 组 ↔ UI/UX 组接口

#### 接口 1：AI 聊天窗口（AI + UI/UX）

**AI 组职责**：
- 提供聊天消息流和状态管理
- 处理 AI 响应渲染

**UI/UX 组职责**：
- 提供聊天窗口的布局和样式
- 提供消息气泡、输入框等组件

**协作方式**：
- AI 组负责 `ChatPanel.tsx` 的业务逻辑
- UI/UX 组提供 `Button`, `Modal`, `Toast` 等通用组件

---

### 2.6 AI 组 ↔ 资源组接口：聊天记录存储（新增）

#### 接口 1：聊天记录保存到工作区（AI → 资源）

**触发场景**：
- 用户在工作区中创建或更新聊天标签页
- 用户将临时聊天合并到工作区
- 工作区关闭时自动保存聊天记录

**AI 组职责**：
- 管理聊天标签页的状态（`ChatTab`）
- 标识聊天记录的绑定关系（`workspacePath`, `isTemporary`）
- 调用资源组的聊天记录保存接口

**资源组职责**：
- 提供 Tauri IPC 命令：`save_chat_to_workspace(workspace_path: String, chat_data: String) -> Result<(), String>`
- 在工作区目录下创建/更新聊天记录文件：`{workspace_path}/.binder/chat_sessions/{tab_id}.json`
- 更新元数据文件：`{workspace_path}/.binder/chat_sessions/metadata.json`

**数据流向**：
```
AI 组：聊天标签页更新 → 序列化为 JSON → invoke('save_chat_to_workspace') → 资源组
  ↓
资源组：写入文件系统 → 更新元数据 → 返回成功/失败
```

**接口定义**：

```rust
// src-tauri/src/commands/chat_commands.rs
#[tauri::command]
pub async fn save_chat_to_workspace(
    workspace_path: String,
    tab_id: String,
    chat_data: String, // JSON 格式的聊天标签页数据
) -> Result<(), String>
```

**TypeScript 类型**：
```typescript
// 通过 invoke 调用
await invoke('save_chat_to_workspace', {
  workspace_path: '/path/to/workspace',
  tab_id: 'chat-1234567890-abc123',
  chat_data: JSON.stringify(chatTab),
});
```

**存储结构**：
```
{workspace_path}/.binder/chat_sessions/
  ├─ {tab_id_1}.json    # 单个聊天标签页的完整数据
  ├─ {tab_id_2}.json
  └─ metadata.json       # 元数据（标签页列表、活跃标签页等）
```

---

#### 接口 2：聊天记录从工作区加载（AI ← 资源）

**触发场景**：
- 用户打开工作区时
- 应用启动时自动加载上次工作区的聊天记录

**资源组职责**：
- 提供 Tauri IPC 命令：`load_chat_from_workspace(workspace_path: String) -> Result<Vec<String>, String>`
- 读取工作区目录下的所有聊天记录文件
- 返回聊天标签页 JSON 数组

**AI 组职责**：
- 调用资源组的加载接口
- 反序列化 JSON 数据为 `ChatTab` 对象
- 恢复到 `ChatStore` 中

**数据流向**：
```
资源组：读取文件系统 → 返回聊天记录 JSON 数组
  ↓
AI 组：反序列化 JSON → 恢复到 ChatStore → 显示在聊天面板
```

**接口定义**：

```rust
// src-tauri/src/commands/chat_commands.rs
#[tauri::command]
pub async fn load_chat_from_workspace(
    workspace_path: String,
) -> Result<Vec<String>, String> // 返回聊天标签页 JSON 数组
```

**TypeScript 类型**：
```typescript
const chatTabsJson = await invoke<string[]>('load_chat_from_workspace', {
  workspace_path: '/path/to/workspace',
});
const chatTabs = chatTabsJson.map(json => JSON.parse(json) as ChatTab);
```

---

#### 接口 3：聊天记录合并到工作区（AI → 资源）

**触发场景**：
- 用户从欢迎页面聊天后，打开工作区时选择"合并到工作区"
- 用户选择将临时聊天记录保存到工作区

**AI 组职责**：
- 识别临时聊天标签页（`isTemporary: true`）
- 调用资源组的合并接口
- 更新聊天标签页的绑定关系（`workspacePath`, `isTemporary: false`）

**资源组职责**：
- 提供 Tauri IPC 命令：`merge_chat_to_workspace(workspace_path: String, chat_data_array: Vec<String>) -> Result<(), String>`
- 将临时聊天记录保存到工作区目录
- 更新元数据文件

**数据流向**：
```
AI 组：临时聊天标签页数组 → 序列化为 JSON 数组 → invoke('merge_chat_to_workspace') → 资源组
  ↓
资源组：保存所有聊天记录到工作区 → 更新元数据 → 返回成功/失败
  ↓
AI 组：更新标签页绑定关系（workspacePath, isTemporary: false）
```

**接口定义**：

```rust
// src-tauri/src/commands/chat_commands.rs
#[tauri::command]
pub async fn merge_chat_to_workspace(
    workspace_path: String,
    chat_data_array: Vec<String>, // 聊天标签页 JSON 数组
) -> Result<(), String>
```

**TypeScript 类型**：
```typescript
const temporaryTabs = useChatStore.getState().tabs.filter(tab => tab.isTemporary);
const chatDataArray = temporaryTabs.map(tab => JSON.stringify(tab));

await invoke('merge_chat_to_workspace', {
  workspace_path: '/path/to/workspace',
  chat_data_array: chatDataArray,
});

// 更新绑定关系
temporaryTabs.forEach(tab => {
  bindToWorkspace(tab.id, workspacePath);
});
```

---

### 2.7 资源组 ↔ UI/UX 组接口

#### 接口 1：文件树 UI（资源 + UI/UX）

**资源组职责**：
- 提供文件树数据（FileTreeService）
- 处理文件操作（创建、删除、重命名）

**UI/UX 组职责**：
- 提供文件树组件的样式和交互
- 文件图标、右键菜单等

**协作方式**：
- 资源组负责 `FileTree.tsx` 的数据逻辑
- UI/UX 组提供文件图标、菜单样式等

---

## 三、关键数据类型定义

### 3.1 AI 组数据类型

#### ChatMessage

```typescript
// src/stores/chatStore.ts
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    isLoading?: boolean;
    toolCalls?: ToolCall[];  // 工具调用列表
}
```

#### ToolCall

```typescript
// src/types/tool.ts
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;  // 必须是解析后的 JSON 对象
    status: 'pending' | 'executing' | 'completed' | 'failed';
    result?: ToolResult;
    error?: string;
    timestamp: number;
}
```

**⚠️ 关键约束**：
- `arguments` 必须是完整的 JSON 对象，不能是不完整的字符串
- 后端只有在 `is_complete=true` 时才发送工具调用事件到前端

#### ToolResult

```typescript
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}
```

---

### 3.2 资源组数据类型

#### FileTreeNode

```typescript
// src/types/file.ts
export interface FileTreeNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileTreeNode[];
}
```

**Rust 对应类型**：

```rust
// src-tauri/src/models/mod.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}
```

---

### 3.3 编辑器组数据类型

#### EditorTab

```typescript
// src/stores/editorStore.ts
export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;           // HTML/JSON 格式的内容
  lastSavedContent: string;
  isDirty: boolean;
  isSaving: boolean;
  isReadOnly: boolean;
  isDraft: boolean;
  lastModifiedTime: number;  // 文件最后修改时间（毫秒时间戳）
  editor: Editor | null;     // Tiptap Editor 实例
}
```

---

### 3.4 引用系统数据类型

#### Reference（联合类型）

```typescript
// src/types/reference.ts
export type Reference = 
    | TextReference 
    | FileReference 
    | ImageReference 
    | MemoryReference 
    | LinkReference;
```

**关键字段**：
- `id`: 唯一标识符
- `type`: 引用类型（`text` | `file` | `image` | `memory` | `link`）
- `createdAt`: 创建时间戳

**使用场景**：
- AI 聊天窗口中的引用标签
- 编辑器中的 @ 提及功能

---

## 四、事件系统与状态管理

### 4.1 Tauri IPC 事件列表

#### 后端 → 前端事件

| 事件名称 | 触发方 | 监听方 | 用途 |
|---------|--------|--------|------|
| `ai-chat-stream` | AI 组 | AI 组（前端） | AI 聊天流式响应 |
| `ai-autocomplete-stream` | AI 组 | 编辑器组 | 自动补全流式响应（包含 request_id） |
| `file-tree-changed` | 资源组/AI 组 | 资源组（前端） | 文件树变化通知 |
| `editor-update-content` | AI 组 | 编辑器组 | 应用 AI 修改建议（实际使用的事件名） |
| `fs-save-progress` | 资源组 | 编辑器组 | 文件保存进度通知（新增） |

**事件格式示例**：

```typescript
// ai-chat-stream 事件
interface ChatStreamEvent {
  tab_id: string;
  chunk: string;          // 文本片段
  done: boolean;
  tool_call?: {           // 工具调用（可选）
    id: string;
    name: string;
    arguments: Record<string, any>;  // 必须是完整的 JSON 对象
    status: 'executing' | 'completed' | 'failed';
    result?: ToolResult;
    error?: string;
  };
}

// file-tree-changed 事件
type FileTreeChangedEvent = string;  // workspace_path

// ai-autocomplete-stream 事件（优化后）
interface AutocompleteStreamEvent {
  request_id: string;  // 【新增】请求 ID，用于过滤旧请求
  chunk: string;
  done: boolean;
}

// fs-save-progress 事件（新增）
interface SaveProgressEvent {
  file_path: string;
  status: 'started' | 'converting' | 'saving' | 'completed' | 'failed';
  progress: number;  // 0-100
  error?: string;
}
```

---

### 4.2 Zustand Store 状态管理

#### 全局 Store 列表

| Store 名称 | 管理组 | 用途 |
|-----------|--------|------|
| `chatStore` | AI 组 | 聊天标签页和消息 |
| `editorStore` | 编辑器组 | 编辑器标签页和内容 |
| `fileStore` | 资源组 | 文件树和当前工作区 |
| `referenceStore` | AI 组 | 引用标签和链接 |
| `layoutStore` | UI/UX 组 | 布局状态（面板宽度、可见性，包括文件树、编辑器、聊天、分析面板） |
| `themeStore` | UI/UX 组 | 主题模式 |

**关键约束**：
- 每个 Store 由对应的工作组负责维护
- 跨组访问时，使用 `useStore.getState()` 获取状态，避免循环依赖

**布局系统详细说明**（v1.2.0 新增）：
- **面板可见性控制**：
  - 每个功能模块（文件树、编辑器、聊天）都有 `visible` 状态
  - 可通过两种方式控制：
    1. **右上角关闭按钮**：每个面板的右上角有关闭按钮（X 图标），点击后隐藏面板
    2. **标题栏切换按钮**：应用窗口右上角有三个圆形图标按钮（参考 Cursor 样式），点击切换面板显示/隐藏状态
  - 激活状态：蓝色背景 + 白色图标
  - 非激活状态：灰色背景 + 灰色图标 + 边框
- **可拖动分隔条**：
  - 位置：文件树与编辑器之间、编辑器与聊天窗口之间
  - 功能：拖动调整相邻面板宽度
  - 宽度限制：
    - 文件树：150px - 600px
    - 聊天窗口：250px - 800px
  - 交互反馈：hover 时显示蓝色高亮，拖动时保持高亮
- **面板关闭占位符**：
  - 编辑器关闭时显示占位符（"编辑器已关闭" + 重新打开按钮）
  - 文件树和聊天窗口关闭后完全隐藏
- **边缘遮挡修复**：
  - 文件树左侧和聊天窗口右侧添加了 padding，确保内容不被窗口边缘遮挡
  - 所有面板内容区域都有适当的 padding 处理

---

## 五、交叉点工作流程

### 5.1 交叉点 A：AI 自动补全

**参与组**：AI 组 + 编辑器组

**工作流程**：

```
1. 编辑器组：用户输入 → 触发自动补全
   ↓
2. 编辑器组：生成唯一的 request_id (UUID) → 调用 getCursorContext() 获取上下文
   ↓
3. 编辑器组：调用 ai_autocomplete(request_id, context, position)
   ↓
4. AI 组：取消旧的请求（如果有）→ 调用 AI API → 流式返回补全文本
   ↓
5. AI 组：触发 ai-autocomplete-stream 事件（包含 request_id）
   ↓
6. 编辑器组：监听事件 → 过滤 request_id（只处理最新的）→ 渲染 GhostText 组件
   ↓
7. 用户：按 Tab 接受 → 编辑器组：插入文本
```

**关键接口**：

```typescript
// 编辑器组提供
function getCursorContext(): string;
const requestId = generateUUID();  // 生成唯一的请求 ID

// AI 组提供（优化后）
async function ai_autocomplete(
  request_id: string,  // 【新增】用于取消旧请求
  context: string,
  position: number,
  max_length: number
): Promise<void>;  // 通过事件流式返回

// 事件协议（优化后）
listen<AutocompleteStreamEvent>('ai-autocomplete-stream', (event) => {
  // 只处理匹配 request_id 的事件
  if (event.payload.request_id !== currentRequestId) {
    return;  // 忽略旧请求的结果
  }
  // 更新 GhostText
});
```

**性能优化要点**：
- ✅ 使用 `request_id` 标识每次请求
- ✅ 后端自动取消旧的请求，避免堆积
- ✅ 前端只渲染最新请求的结果，避免乱序

---

### 5.2 交叉点 B：Pandoc 保存流程

**参与组**：编辑器组 + 资源组 + UI/UX 组

**工作流程**：

```
1. 编辑器组：用户按 Ctrl+S → 获取编辑器内容（HTML）
   ↓
2. 编辑器组：调用 documentService.saveFile(filePath, htmlContent)
   ↓
3. 资源组：识别文件类型（.docx）→ 调用 PandocService 转换
   ↓
4. 资源组：保存文件到硬盘
   ↓
5. 资源组：触发 file-tree-changed 事件
   ↓
6. UI/UX 组：显示 "保存成功" Toast 提示
```

**关键接口**：

```typescript
// 编辑器组调用
await documentService.saveFile(filePath, htmlContent);

// 资源组实现（未来）
async function save_docx(path: string, htmlContent: string): Promise<void> {
  // 调用 Pandoc 转换 HTML → DOCX
  // 保存到硬盘
}
```

---

### 5.3 交叉点 C：引用系统（@文件名）

**参与组**：AI 组 + 资源组

**工作流程**：

```
1. AI 组：用户输入 @文件名 → 查询文件树索引
   ↓
2. 资源组：SearchService 从 SQLite 查询文件
   ↓
3. 资源组：返回匹配的文件列表
   ↓
4. AI 组：显示文件选择器（MentionSelector）
   ↓
5. AI 组：用户选择 → 添加到引用（ReferenceStore）
   ↓
6. AI 组：发送消息时，将引用内容添加到上下文
```

**关键接口**：

```typescript
// AI 组调用
await invoke<SearchResult[]>('search_documents', { query: '@文件名' });

// 资源组提供
interface SearchResult {
  path: string;
  name: string;
  snippet?: string;
}
```

---

## 六、关键名称与引用

### 6.1 文件路径规范

**工作区路径**：
- 存储位置：`fileStore.currentWorkspace` (Zustand)
- Rust 后端：通过 `FileWatcherService::get_workspace_path()` 获取
- 路径格式：绝对路径（例如 `/Users/xxx/workspace`）

**文件路径**：
- 格式：相对路径（相对于工作区根目录）
- 示例：`src/components/ChatPanel.tsx`
- 存储：`editorTab.filePath` (EditorTab)

---

### 6.2 工具调用名称规范

**文件操作工具**：

| 工具名称 | 参数 | 说明 |
|---------|------|------|
| `create_file` | `{ path: string, content: string }` | 创建文件 |
| `update_file` | `{ path: string, content: string }` | 更新文件 |
| `delete_file` | `{ path: string }` | 删除文件 |
| `read_file` | `{ path: string }` | 读取文件 |
| `list_files` | `{ path?: string }` | 列出目录 |
| `search_files` | `{ query: string }` | 搜索文件 |
| `create_folder` | `{ path: string }` | 创建文件夹 |
| `rename_file` | `{ path: string, new_name: string }` | 重命名文件 |
| `move_file` | `{ source: string, destination: string }` | 移动文件 |

**编辑器操作工具**：

| 工具名称 | 参数 | 说明 |
|---------|------|------|
| `edit_current_editor_document` | `{ content: string, instruction?: string }` | 编辑当前编辑器打开的文档 |

**⚠️ 重要约束**：
- 所有工具调用的 `arguments` 必须是完整的 JSON 对象
- 后端只有 `is_complete=true` 时才发送工具调用事件
- 工具调用执行成功后，AI 组需要触发 `file-tree-changed` 事件（文件操作工具）

---

### 6.3 事件名称规范

**命名规则**：
- 使用 kebab-case（短横线分隔）
- 格式：`<组名>-<动作>-<对象>`
- 示例：`ai-chat-stream`, `file-tree-changed`, `editor-update-content`

**事件列表**：

| 事件名称 | 方向 | 说明 |
|---------|------|------|
| `ai-chat-stream` | 后端→前端 | AI 聊天流式响应 |
| `ai-autocomplete-stream` | 后端→前端 | 自动补全流式响应（包含 request_id） |
| `file-tree-changed` | 后端→前端 | 文件树变化 |
| `editor-update-content` | 后端→前端 | 应用编辑器修改（实际使用的事件名） |
| `fs-save-progress` | 后端→前端 | 文件保存进度（新增） |

---

### 6.4 Store 状态键名规范

**Zustand Store**：

| Store | 关键状态键 | 类型 | 说明 |
|-------|-----------|------|------|
| `chatStore` | `tabs` | `ChatTab[]` | 聊天标签页列表 |
| `chatStore` | `activeTabId` | `string \| null` | 当前活跃标签页 ID |
| `editorStore` | `tabs` | `EditorTab[]` | 编辑器标签页列表 |
| `editorStore` | `activeTabId` | `string \| null` | 当前活跃标签页 ID |
| `fileStore` | `currentWorkspace` | `string \| null` | 当前工作区路径 |
| `fileStore` | `fileTree` | `FileTreeNode \| null` | 文件树结构 |

---

## 七、错误处理与调试

### 7.1 错误传播路径

**AI 组错误**：
```
AI API 错误 → AIError (Rust) → 前端显示错误消息
```

**资源组错误**：
```
文件 I/O 错误 → String (错误消息) → 前端 Toast 提示
```

**编辑器组错误**：
```
编辑器错误 → 组件内部处理 → ErrorBoundary 捕获 → Toast 提示用户
```

**UI/UX 组错误处理**：
```
全局错误 → ErrorBoundary 捕获 → 显示错误页面
用户操作错误 → Toast 提示（toast.error()）
加载状态 → LoadingSpinner 显示
```

---

### 7.2 调试日志规范

**后端日志（Rust）**：
- 使用 `eprintln!()` 输出到终端
- 格式：`🔧 [功能] 消息内容`

**前端日志（TypeScript）**：
- 使用 `console.log()` / `console.warn()` / `console.error()`
- 格式：`🔧 [功能] 消息内容`

**关键日志点**：
- AI 组：工具调用开始/完成、流式响应接收
- 资源组：文件操作、文件树变化
- 编辑器组：文件打开/保存、内容变更

---

## 八、未来扩展接口（规划中）

### 8.1 RAG 引擎接口

**参与组**：AI 组 + 资源组

**接口设计**：

```rust
// AI 组调用
#[tauri::command]
pub async fn search_vector_db(
    query: String,
    limit: usize,
) -> Result<Vec<VectorSearchResult>, String>
```

---

### 8.2 记忆库接口

**参与组**：AI 组 + 资源组

**接口设计**：

```rust
// AI 组调用
#[tauri::command]
pub async fn get_memories_by_keywords(
    keywords: Vec<String>,
) -> Result<Vec<MemoryItem>, String>
```

---

## 九、接口变更流程

### 9.1 变更请求流程

**步骤**：

1. **工作组提出变更需求**
   - 在本文档的"变更日志"章节添加变更记录
   - 明确变更原因、影响范围和向后兼容性

2. **技术评审**
   - 相关工作组负责人评审
   - 评估对现有代码的影响

3. **更新文档**
   - 更新本文档中的接口定义
   - 更新相关的类型定义文件

4. **实现变更**
   - 按照新接口实现代码
   - 添加测试用例

5. **通知相关组**
   - 在开发群组中通知所有相关工作组
   - 提供迁移指南（如需要）

**变更记录格式**：

```markdown
### 变更记录：YYYY-MM-DD

**变更内容**：[描述变更]
**影响范围**：[列出受影响的工作组]
**向后兼容**：[是/否，如否需说明迁移方案]
**负责人**：[工作组名称]
```

---

### 9.2 版本控制规范

**接口版本号**：
- 格式：`v<major>.<minor>.<patch>`
- 向后兼容的变更：增加 minor 版本号
- 破坏性变更：增加 major 版本号，需提供迁移路径

**文档版本**：
- 本文档使用 Git 进行版本控制
- 每次接口变更必须提交到 Git
- 使用 Git Tag 标记重要版本

---

## 十、开发规范与最佳实践

### 10.1 代码组织规范

#### 文件命名规范

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| Rust 命令 | `snake_case` | `ai_chat_stream` |
| TypeScript 函数 | `camelCase` | `getCursorContext` |
| React 组件 | `PascalCase` | `ChatPanel` |
| 事件名称 | `kebab-case` | `ai-chat-stream` |
| Store 名称 | `camelCase` + `Store` | `chatStore` |

#### 目录结构规范

```
src/
  ├── components/
  │   ├── Chat/          # AI 组负责
  │   ├── Editor/        # 编辑器组负责
  │   ├── FileTree/      # 资源组负责
  │   └── Common/        # UI/UX 组负责
  ├── stores/
  │   ├── chatStore.ts   # AI 组
  │   ├── editorStore.ts # 编辑器组
  │   └── fileStore.ts   # 资源组
  ├── services/
  │   ├── documentService.ts  # 编辑器组
  │   └── fileService.ts      # 资源组
  └── types/
      ├── tool.ts        # AI 组
      ├── file.ts        # 资源组
      └── reference.ts   # AI 组

src-tauri/src/
  ├── commands/
  │   ├── ai_commands.rs      # AI 组
  │   ├── file_commands.rs    # 资源组
  │   └── search_commands.rs  # 资源组
  ├── services/
  │   ├── ai_service.rs       # AI 组
  │   ├── file_tree.rs        # 资源组
  │   └── search_service.rs   # 资源组
```

---

### 10.2 错误处理最佳实践

#### AI 组错误处理

```rust
// 后端：使用 Result 类型返回错误
pub async fn ai_chat_stream(...) -> Result<(), String> {
    match provider.chat_stream(...).await {
        Ok(stream) => { /* ... */ }
        Err(e) => {
            eprintln!("❌ AI 流式请求失败: {}", e);
            Err(format!("AI 请求失败: {}", e))
        }
    }
}
```

```typescript
// 前端：使用 try-catch 捕获错误
try {
    await invoke('ai_chat_stream', { ... });
} catch (error) {
    console.error('❌ 聊天请求失败:', error);
    toast.error('AI 请求失败，请稍后重试');
}
```

#### 资源组错误处理

```rust
// 文件操作错误处理
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| {
            eprintln!("❌ 写入文件失败: {} - {}", path, e);
            format!("写入文件失败: {}", e)
        })
}
```

---

### 10.3 测试规范

#### 单元测试

**AI 组**：
- 测试工具调用的 JSON 解析
- 测试流式响应的去重逻辑

**资源组**：
- 测试文件读写操作
- 测试路径验证逻辑

**编辑器组**：
- 测试编辑器的状态管理
- 测试内容变更检测

#### 集成测试

- AI 工具调用 → 资源组文件操作
- 编辑器保存 → 资源组文件写入
- 文件变化 → 编辑器外部修改检测

---

### 10.4 性能优化建议

#### AI 组

- **流式响应去重**：使用三层去重机制（见《流式响应问题完整解决方案.md》）
- **工具调用批处理**：多个工具调用合并执行
- **上下文剪枝**：限制发送给 AI 的上下文长度
- **自动补全请求取消**：使用 `request_id` 机制，快速输入时自动取消旧请求，避免请求堆积和结果乱序（v1.1.0 新增）

#### 资源组

- **文件监听防抖**：500ms 防抖避免频繁刷新
- **文件树懒加载**：大目录只加载第一层
- **索引异步更新**：文件变化后异步更新搜索索引

#### 编辑器组

- **内容变更节流**：使用防抖限制保存频率
- **虚拟滚动**：大文件使用虚拟滚动
- **增量更新**：只更新变化的部分
- **自动补全请求过滤**：只渲染最新 `request_id` 的补全结果，避免乱序（v1.1.0 新增）
- **保存进度显示**：监听 `fs-save-progress` 事件，显示长耗时操作的进度（v1.1.0 新增）

---

## 十一、常见问题与解决方案

### 11.1 工具调用失败

**问题**：工具调用的 `arguments` 解析失败

**原因**：
- AI 返回的 JSON 不完整
- 流式传输中被截断

**解决方案**：
1. 后端只在 `is_complete=true` 时发送工具调用
2. 使用 JSON 修复工具（`aggressiveJSONRepair`）
3. 如果修复失败，使用空对象并记录错误

**相关文档**：《流式响应问题完整解决方案.md》

---

### 11.2 文件树不刷新

**问题**：AI 创建文件后，文件树没有显示新文件

**原因**：
- 工具调用成功后没有触发 `file-tree-changed` 事件
- 前端监听的事件处理逻辑有问题

**解决方案**：
1. AI 组在文件操作工具执行成功后，手动触发事件
2. 前端监听时检查工作区路径是否匹配

**代码位置**：
- 后端：`src-tauri/src/commands/ai_commands.rs` (line 383-388)
- 前端：`src/components/FileTree/FileTree.tsx` (line 55-60)

---

### 11.3 编辑器状态不同步

**问题**：编辑器内容与文件系统内容不一致

**原因**：
- 外部程序修改了文件
- 编辑器没有检测到外部修改

**解决方案**：
1. 使用 `FileWatcherService` 监听文件变化
2. 编辑器在文件打开时记录 `lastModifiedTime`
3. 定期检查文件修改时间（`check_external_modification`）

**代码位置**：
- 后端：`src-tauri/src/commands/file_commands.rs`
- 前端：`src/components/Editor/ExternalModificationDialog.tsx`

---

### 11.4 自动补全请求堆积（v1.1.0 优化）

**问题**：用户快速输入时，多个自动补全请求同时执行，导致结果乱序

**原因**：
- 前端虽然取消了 Promise，但后端 Rust 的 AI 请求仍在执行
- 没有机制真正取消后端请求
- 多个请求结果混杂，导致补全内容错乱

**解决方案**（v1.1.0）：
1. 前端每次调用时生成唯一的 `request_id`（UUID）
2. 后端维护活跃请求映射，新请求自动取消旧请求
3. 前端只渲染与最新 `request_id` 匹配的事件

**相关代码位置**：
- 后端：`src-tauri/src/commands/ai_commands.rs`（需要实现）
- 前端：`src/hooks/useAutoComplete.ts`（需要更新）

---

### 11.5 文件保存无响应（v1.1.0 优化）

**问题**：保存 DOCX 文件时，用户界面卡顿，无法看到进度

**原因**：
- Pandoc 转换是长耗时操作（可能超过 10 秒）
- 没有进度反馈机制
- 没有超时处理，可能永久卡死

**解决方案**（v1.1.0）：
1. 资源组在转换过程中触发 `fs-save-progress` 事件
2. 编辑器组监听事件，显示进度条或 Toast
3. 资源组设置超时限制（30 秒），超时后返回错误

**相关代码位置**：
- 后端：`src-tauri/src/services/pandoc_service.rs`（需要实现）
- 前端：`src/components/Editor/EditorPanel.tsx`（需要监听事件）

---

## 十二、附录

### 12.1 关键文件索引

#### AI 组关键文件

| 文件路径 | 说明 |
|---------|------|
| `src-tauri/src/services/ai_service.rs` | AI 服务核心 |
| `src-tauri/src/services/ai_providers/deepseek.rs` | DeepSeek 提供商 |
| `src-tauri/src/commands/ai_commands.rs` | AI Tauri 命令 |
| `src-tauri/src/services/tool_service.rs` | 工具调用服务 |
| `src/components/Chat/ChatPanel.tsx` | 聊天界面 |
| `src/stores/chatStore.ts` | 聊天状态管理 |

#### 资源组关键文件

| 文件路径 | 说明 |
|---------|------|
| `src-tauri/src/services/file_tree.rs` | 文件树服务 |
| `src-tauri/src/services/file_watcher.rs` | 文件监听服务 |
| `src-tauri/src/services/search_service.rs` | 搜索服务 |
| `src-tauri/src/commands/file_commands.rs` | 文件操作命令 |
| `src/components/FileTree/FileTree.tsx` | 文件树组件 |
| `src/stores/fileStore.ts` | 文件状态管理 |

#### 编辑器组关键文件

| 文件路径 | 说明 |
|---------|------|
| `src/components/Editor/TipTapEditor.tsx` | 主编辑器组件 |
| `src/components/Editor/GhostText.tsx` | 幽灵文字组件 |
| `src/components/Editor/DiffView.tsx` | Diff 视图组件 |
| `src/stores/editorStore.ts` | 编辑器状态管理 |
| `src/services/documentService.ts` | 文档服务 |

#### UI/UX 组关键文件

| 文件路径 | 说明 |
|---------|------|
| `src/components/Layout/MainLayout.tsx` | 主布局组件（整合所有面板和分隔条） |
| `src/components/Layout/TitleBar.tsx` | 标题栏组件（窗口切换按钮，参考 Cursor 样式） |
| `src/components/Layout/PanelResizer.tsx` | 可拖动分隔条组件（用于调整面板宽度） |
| `src/components/Layout/WelcomeDialog.tsx` | 欢迎对话框（已废弃，替换为 WelcomePage） |
| `src/components/Welcome/WelcomePage.tsx` | 欢迎页面（全屏，v1.4.0 新增） |
| `src/components/Welcome/TemporaryChatWarning.tsx` | 退出警告对话框（v1.4.0 新增） |
| `src/components/Welcome/ChatMergeDialog.tsx` | 聊天合并对话框（v1.4.0 新增） |
| `src/components/Common/Button.tsx` | 按钮组件 |
| `src/components/Common/Modal.tsx` | 模态框组件 |
| `src/components/Common/Toast.tsx` | Toast 通知系统 |
| `src/components/Common/ErrorBoundary.tsx` | 错误边界组件 |
| `src/components/Common/LoadingSpinner.tsx` | 加载指示器 |
| `src/components/Settings/APIKeyConfig.tsx` | API Key 配置对话框 |
| `src/components/Settings/ThemeSelector.tsx` | 主题选择器 |
| `src/stores/layoutStore.ts` | 布局状态管理（面板宽度、可见性，包括文件树、编辑器、聊天、分析面板） |
| `src/stores/themeStore.ts` | 主题状态管理 |
| `src/stores/toastStore.ts` | Toast 状态管理（在 Toast.tsx 中定义） |

---

### 12.2 快速参考表

#### Tauri IPC 命令快速索引

| 命令名称 | 所属组 | 文件路径 |
|---------|--------|---------|
| `ai_chat_stream` | AI 组 | `commands/ai_commands.rs` |
| `ai_autocomplete` | AI 组 | `commands/ai_commands.rs` |
| `read_file_content` | 资源组 | `commands/file_commands.rs` |
| `write_file` | 资源组 | `commands/file_commands.rs` |
| `build_file_tree` | 资源组 | `commands/file_commands.rs` |
| `search_documents` | 资源组 | `commands/search_commands.rs` |
| `check_pandoc_available` | 资源组 | `commands/file_commands.rs` |
| `open_docx` | 资源组 | `commands/file_commands.rs` |
| `preview_docx` | 资源组 | `commands/file_commands.rs` (v1.5.0 新增) |
| `create_draft_docx` | 资源组 | `commands/file_commands.rs` |
| `create_draft_file` | 资源组 | `commands/file_commands.rs` |
| `save_docx` | 资源组 | `commands/file_commands.rs` |
| `cleanup_preview_cache` | 资源组 | `commands/file_commands.rs` (v1.5.0 新增) |
| `cleanup_file_preview_cache` | 资源组 | `commands/file_commands.rs` (v1.5.0 新增) |
| `save_chat_to_workspace` | 资源组 | `commands/chat_commands.rs` (v1.4.0 新增) |
| `load_chat_from_workspace` | 资源组 | `commands/chat_commands.rs` (v1.4.0 新增) |
| `merge_chat_to_workspace` | 资源组 | `commands/chat_commands.rs` (v1.4.0 新增) |

#### 事件快速索引

| 事件名称 | 触发方 | 监听方 | 用途 |
|---------|--------|--------|------|
| `ai-chat-stream` | AI 组后端 | AI 组前端 | 聊天流式响应 |
| `ai-autocomplete-stream` | AI 组后端 | 编辑器组 | 自动补全流式响应（包含 request_id） |
| `file-tree-changed` | 资源组/AI 组 | 资源组前端 | 文件树变化 |
| `editor-update-content` | AI 组 | 编辑器组 | 应用修改（实际使用的事件名） |
| `fs-save-progress` | 资源组 | 编辑器组 | 文件保存进度（v1.1.0 新增） |
| `preview-progress` | 资源组 | 编辑器组 | DOCX 预览转换进度（v1.5.0 新增） |
| `preview-progress` | 资源组 | 编辑器组 | DOCX 预览转换进度（v1.5.0 新增） |

**事件详情**：

```typescript
// fs-save-progress 事件
interface SaveProgressEvent {
  file_path: string;
  status: 'started' | 'converting' | 'saving' | 'completed' | 'failed';
  progress: number;  // 0-100
  error?: string;    // 失败时的错误信息
}

// preview-progress 事件（v1.5.0 新增）
interface PreviewProgressEvent {
  status: 'started' | 'converting' | 'completed' | 'failed' | 'warning';
  progress: number;  // 0-100
  message: string;   // 进度消息（"正在预览..."，不显示"转换"字眼）
  pdf_path?: string; // 完成时的 PDF 文件路径（file:// 绝对路径）
}
```

---

### 12.3 相关文档链接

- [流式响应问题完整解决方案](./流式响应问题完整解决方案.md)
- [工具调用功能技术报告](./工具调用功能技术报告.md)
- [自动续写功能完整解决方案](./自动续写功能完整解决方案.md)
- [测试指南](./测试指南.md)

---

## 十三、变更日志

### 2025-01-XX（初始版本）

- ✅ 创建协同文档框架
- ✅ 定义四个工作组的职责边界
- ✅ 梳理工作组间接口协议
- ✅ 建立事件系统和状态管理规范
- ✅ 制定工具调用和文件操作规范

### 2025-01-XX（性能优化版本 v1.1.0）

**变更内容**：添加关键性能优化协议

**影响范围**：
- AI 组：`ai_autocomplete` 接口增加 `request_id` 参数，实现请求取消机制
- 编辑器组：自动补全逻辑增加 `request_id` 过滤，只处理最新请求
- 资源组：文件保存接口增加进度事件 `fs-save-progress`，支持进度反馈和超时处理
- 编辑器组：`EditorTab` 增加 `saveStartTimestamp` 和 `lastSaveError` 字段

**向后兼容**：否

**迁移方案**：
1. AI 组：更新 `ai_autocomplete` 命令签名，添加 `request_id: String` 参数
2. 编辑器组：在调用 `ai_autocomplete` 前生成 UUID，并过滤事件中的 `request_id`
3. 资源组：实现 `fs-save-progress` 事件，在 Pandoc 转换过程中触发进度更新
4. 编辑器组：更新 `EditorTab` 接口，添加新的状态字段

**负责人**：AI 功能组

**详细变更**：
- ✅ 优化 1：AI 自动补全的取消机制（添加 `request_id` 和取消逻辑）
- ✅ 优化 2：长耗时操作的进度与取消（添加 `fs-save-progress` 事件和超时处理）
- ✅ 优化 3：明确工具调用结果回传流程（文档说明，无需代码变更）

---

### 2025-01-XX（UI/UX 布局系统优化 v1.2.0）

**变更内容**：完善布局系统，添加可拖动分隔条、面板关闭功能和标题栏切换按钮

**影响范围**：
- UI/UX 组：新增 `TitleBar` 和 `PanelResizer` 组件，完善布局系统功能
- 所有面板组件：添加右上角关闭按钮（FileTreePanel、EditorPanel、ChatPanel）
- LayoutStore：编辑器添加 `visible` 状态管理

**具体变更**：

1. **新增组件**：
   - `TitleBar.tsx`：标题栏组件，包含三个窗口切换按钮（文件树、编辑器、聊天），参考 Cursor 样式设计（圆形图标按钮，激活状态蓝色，非激活状态灰色）
   - `PanelResizer.tsx`：可拖动分隔条组件，支持水平/垂直方向的拖动调整，hover 时显示蓝色高亮

2. **面板关闭功能**：
   - FileTreePanel：在工作区信息栏右上角添加关闭按钮（X 图标）
   - EditorPanel：在标签页栏右上角添加关闭按钮，关闭后显示占位符（"编辑器已关闭" + 重新打开按钮）
   - ChatPanel：已有关闭按钮（保持不变）

3. **布局系统优化**：
   - 文件树与编辑器之间添加可拖动分隔条，支持调整文件树宽度（150px - 600px）
   - 编辑器与聊天窗口之间添加可拖动分隔条，支持调整聊天窗口宽度（250px - 800px）
   - 修复边缘遮挡问题：文件树左侧和聊天窗口右侧添加 padding，确保内容不被窗口边缘遮挡

4. **状态管理更新**：
   - `layoutStore` 中为编辑器添加 `visible: boolean` 状态
   - 添加 `setEditorVisible` 方法

5. **Tauri 配置修复**：
   - 修复 `tauri.conf.json` 中 `resources/bin/**` glob 模式匹配失败问题（目录为空时无法匹配）
   - 将 `resources` 配置改为空数组（开发模式下不需要打包资源，Pandoc 会从开发目录查找）

**向后兼容**：是（新增功能，不破坏现有接口）

**使用说明**：
- **关闭面板**：点击面板右上角的 X 按钮，或点击标题栏对应图标按钮
- **调整面板宽度**：拖动面板之间的分隔条（hover 时显示蓝色高亮，4px 宽，8px 可点击区域）
- **重新打开面板**：点击标题栏对应的图标按钮，或点击占位符中的按钮（仅编辑器）

**负责人**：UI/UX 组

---

### 2025-01-XX（文档编辑器完整功能实现 v1.3.0）

**变更内容**：完成文档编辑器完整功能，支持多种文件格式和来源的编辑/预览

**影响范围**：
- 编辑器组：实现文件打开策略、文件来源识别、DOCX 完整支持
- 资源组：实现 Pandoc 服务、DOCX 转换命令、保存进度事件

**具体变更**：

1. **文件类型和来源支持**：
   - 实现 `FileType` 和 `FileSource` 类型定义
   - 实现文件打开策略表（`FILE_OPEN_STRATEGIES`）
   - 实现文件来源自动识别（`detectFileSource`）

2. **DOCX 文件完整支持**：
   - 新建 DOCX：直接可编辑
   - AI 生成 DOCX：直接可编辑
   - 外部导入 DOCX：预览模式 → 点击编辑 → 创建草稿 → 可编辑
   - 实现 `open_docx`、`create_draft_docx`、`save_docx` 命令
   - 实现 Pandoc 内置支持（优先系统，无则使用内置）

3. **HTML 预览优化**：
   - 使用 iframe 隔离 HTML 内容，避免样式污染全局应用
   - 修复 HTML 预览时影响全局字体的问题
   - HTML 文件预览时点击编辑，创建草稿副本（保持格式）

4. **DOCX 预览优化**（v1.3.0，已废弃，由 v1.5.0 新方案替换）：
   - ~~使用 iframe 隔离 DOCX 转换后的 HTML，避免 UI 偏移~~
   - ~~修复 DOCX 预览时影响全局样式的问题~~
   - **注意**：v1.5.0 使用新的 `DocxPreview` 组件替换此实现（见下方 v1.5.0 变更）

5. **格式保留优化**：
   - 优化 Pandoc 转换参数，启用格式保留扩展
   - 使用 `+raw_html`、`+native_divs`、`+native_spans` 保留 HTML 结构
   - 注意：Pandoc 转换仍有格式丢失限制，详见 `Pandoc格式保留优化方案.md`

4. **保存进度监听**：
   - 实现 `fs-save-progress` 事件监听
   - 显示保存进度和状态（开始、转换中、完成、失败）

5. **错误处理优化**：
   - 改进 DOCX 转换失败的错误提示
   - 添加文件大小检查（防止损坏文件）
   - 针对不同错误类型提供详细解决建议

6. **调试功能**：
   - 新增 `check_pandoc_available` 命令，用于检查 Pandoc 状态

**实现文件**：
- `src/types/file.ts` - 文件类型和来源定义
- `src/services/documentService.ts` - 文件打开策略实现
- `src/components/Editor/EditorPanel.tsx` - HTML/DOCX 预览 iframe 隔离
- `src/components/Editor/ReadOnlyBanner.tsx` - 编辑按钮和草稿创建（支持 HTML 和 DOCX）
- `src-tauri/src/services/pandoc_service.rs` - Pandoc 服务（内置支持，格式保留优化）
- `src-tauri/src/commands/file_commands.rs` - DOCX/HTML 相关命令

**关键修复**：
- HTML 文件预览时点击编辑，创建草稿副本（`create_draft_file`）
- DOCX 预览使用 iframe 隔离，避免 UI 偏移
- Pandoc 转换参数优化，启用格式保留扩展

**向后兼容**：是（新增功能，不破坏现有接口）

**使用说明**：
- **文件打开**：根据文件类型和来源自动选择编辑/预览模式
- **DOCX 编辑**：外部导入的 DOCX 需要点击"编辑"按钮创建草稿
- **HTML 预览**：使用 iframe 隔离，不会影响全局样式
- **保存进度**：DOCX 保存时会显示转换进度

**负责人**：编辑器组 + 资源组

---

### 2025-01-XX（欢迎页面重构与聊天记录绑定工作区 v1.4.0）

**变更内容**：重构欢迎页面为全屏设计，实现聊天记录绑定工作区机制

**影响范围**：
- UI/UX 组：重构欢迎页面，新增提示对话框组件
- AI 组：扩展聊天状态管理，添加临时聊天标记和绑定机制
- 资源组：实现聊天记录存储服务（保存、加载、合并）

**具体变更**：

1. **欢迎页面重构**（UI/UX 组）：
   - 将 `WelcomeDialog` 重构为全屏 `WelcomePage` 组件
   - 新增组件：`WelcomeHeader`、`WelcomeChatInput`、`QuickActions`、`RecentWorkspaces`
   - 集成 AI 聊天输入框（固定 chat 模式）到欢迎页面
   - 用户从欢迎页面开始聊天时，自动切换到聊天界面（关闭文件树和编辑器）

2. **聊天记录绑定工作区机制**（AI 组 + 资源组）：
   - **数据结构扩展**：`ChatTab` 接口新增字段
     - `workspacePath: string | null`：绑定的工作区路径
     - `isTemporary: boolean`：是否为临时聊天（未绑定工作区）
   - **临时聊天标记**：无工作区时创建的聊天自动标记为 `isTemporary: true`
   - **ChatStore 扩展**：新增方法
     - `getTemporaryTabs()`：获取所有临时聊天标签页
     - `bindToWorkspace(workspacePath: string)`：将临时聊天绑定到工作区
     - `clearTemporaryTabs()`：清除所有临时聊天记录

3. **聊天记录存储服务**（资源组）：
   - 实现 `ChatService` (Rust)：聊天记录存储服务
   - 新增 Tauri IPC 命令：
     - `save_chat_to_workspace()`：保存聊天记录到工作区目录
     - `load_chat_from_workspace()`：从工作区加载聊天记录
     - `merge_chat_to_workspace()`：合并聊天记录到工作区
   - 存储位置：`{workspace_path}/.binder/chat_sessions/`
     - 单个标签页：`{tab_id}.json`
     - 元数据：`metadata.json`

4. **提示对话框组件**（UI/UX 组）：
   - `TemporaryChatWarning.tsx`：退出时的临时聊天警告对话框
     - 检测到临时聊天记录时，阻止应用退出
     - 提供"创建工作区保存"和"直接退出"选项
   - `ChatMergeDialog.tsx`：打开工作区时的聊天合并对话框
     - 检测到临时聊天记录时，提示是否合并到工作区
     - 提供"合并到工作区"和"保持临时状态"选项

5. **退出检查逻辑**（UI/UX 组）：
   - 在 `MainLayout` 中添加 `beforeunload` 事件监听
   - 退出前检查临时聊天记录，显示警告对话框

6. **工作区合并逻辑**（UI/UX 组 + AI 组）：
   - 打开工作区时检测临时聊天记录
   - 显示合并对话框，处理用户选择

**接口变更**：

- 新增接口：`2.6 AI 组 ↔ 资源组接口：聊天记录存储`
  - 接口 1：聊天记录保存到工作区
  - 接口 2：聊天记录从工作区加载
  - 接口 3：聊天记录合并到工作区

**实现文件**：

**UI/UX 组**：
- `src/components/Welcome/WelcomePage.tsx` - 主欢迎页面组件（新建）
- `src/components/Welcome/WelcomeHeader.tsx` - 应用名称显示（新建）
- `src/components/Welcome/WelcomeChatInput.tsx` - 欢迎页面的聊天输入框包装（新建）
- `src/components/Welcome/QuickActions.tsx` - 快捷操作按钮（新建）
- `src/components/Welcome/RecentWorkspaces.tsx` - 历史工作区列表（新建）
- `src/components/Welcome/TemporaryChatWarning.tsx` - 退出警告对话框（新建）
- `src/components/Welcome/ChatMergeDialog.tsx` - 聊天合并对话框（新建）
- `src/components/Layout/MainLayout.tsx` - 添加退出检查和合并逻辑

**AI 组**：
- `src/stores/chatStore.ts` - 扩展数据结构和方法（`workspacePath`, `isTemporary`, `getTemporaryTabs`, `bindToWorkspace`, `clearTemporaryTabs`）

**资源组**：
- `src-tauri/src/services/chat_service.rs` - 聊天记录存储服务（新建）
- `src-tauri/src/commands/chat_commands.rs` - 聊天记录相关命令（新建）

**向后兼容**：否（数据结构变更，需要迁移现有聊天记录）

**迁移方案**：
1. 现有聊天记录：如果存在工作区，自动绑定到当前工作区
2. 临时聊天记录：应用启动时检测，提示用户保存或清除

**使用说明**：
- **从欢迎页面开始聊天**：在欢迎页面的输入框中输入并发送，自动创建临时聊天并切换到聊天界面
- **退出时保存临时聊天**：如果有临时聊天记录，退出时会提示创建新工作区保存
- **合并临时聊天到工作区**：打开工作区时，如果有临时聊天记录，会提示是否合并

**详细方案**：见 [欢迎页面重构实现方案](./欢迎页面重构实现方案.md)

**负责人**：UI/UX 组（欢迎页面和对话框）+ AI 组（状态管理）+ 资源组（存储服务）

---

**文档维护者**：AI 功能组（主导），所有工作组共同维护

**最后更新时间**：2025-01-XX

**版本**：v1.4.0