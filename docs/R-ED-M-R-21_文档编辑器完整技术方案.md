# 文档编辑器完整技术方案

## 文档头

- 结构编码：`ED-M-R-21`
- 文档属性：`参考`
- 主责模块：`ED`
- 文档职责：`文档编辑器完整技术方案 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `SYS-C-T-01`, `WS-M-T-01`, `ED-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-T-01`, `SYS-I-P-01`, `ENG-X-T-01`
- 汇聚影响：`CORE-C-R-01`, `ED-M-T-01`
- 扩散检查：`ED-M-T-02`, `ED-M-T-03`, `ED-M-T-04`, `ED-M-T-05`, `ED-M-T-06`
- 使用边界：`仅作参考，不直接替代主结构文档、协议文档和执行文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 文档信息
- **版本**：v1.0
- **创建日期**：2025-01-XX
- **状态**：📋 技术方案
- **目标**：实现完整的文档编辑器功能，支持多种文件格式和来源的编辑/预览

---

## 一、需求概述

### 1.1 功能需求

#### 文件类型处理策略

| 文件类型 | 新建 | 外部导入 | AI生成 | 处理方式 |
|---------|------|---------|--------|---------|
| **Markdown (.md)** | ✅ 直接编辑 | ✅ 直接编辑 | ✅ 直接编辑 | 文本编辑器 |
| **TXT (.txt)** | ✅ 直接编辑 | ✅ 直接编辑 | ✅ 直接编辑 | 文本编辑器 |
| **DOCX (.docx)** | ✅ 直接编辑 | 🔍 预览→编辑 | ✅ 直接编辑 | Pandoc转换 + CSS样式表 |
| **PDF (.pdf)** | ❌ 不支持 | 🔍 预览 | ❌ 不支持 | PDF预览器 |
| **HTML (.html)** | ✅ 直接编辑 | 🔍 预览 | ✅ 直接编辑 | HTML预览/编辑 |
| **图片** | ❌ 不支持 | 🔍 预览 | ❌ 不支持 | 图片预览器 |

#### 关键场景

1. **DOCX 新建**：创建空 DOCX 文件，可直接编辑
2. **DOCX AI生成**：AI 创建 DOCX 文件，可直接编辑（已转换为可编辑格式）
3. **DOCX 外部导入**：
   - 首次打开：预览模式（只读）
   - 点击"编辑"按钮：创建草稿副本（`document.draft.docx`）
   - 草稿文件：可编辑模式

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│              文档编辑器架构                              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │        前端层 (React + TypeScript)                │   │
│  │                                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐            │   │
│  │  │ documentService│  │ EditorPanel │            │   │
│  │  │ - openFile()  │  │ - 文件类型判断│            │   │
│  │  │ - saveFile()  │  │ - 编辑/预览切换│            │   │
│  │  └──────────────┘  └──────────────┘            │   │
│  │                                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐            │   │
│  │  │ TipTapEditor │  │ FilePreview  │            │   │
│  │  │ - 文本编辑    │  │ - PDF预览    │            │   │
│  │  │ - HTML编辑   │  │ - 图片预览   │            │   │
│  │  └──────────────┘  └──────────────┘            │   │
│  │                                                   │   │
│  │  ┌──────────────┐                               │   │
│  │  │ ReadOnlyBanner│                               │   │
│  │  │ - 编辑按钮    │                               │   │
│  │  └──────────────┘                               │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕ IPC                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │        后端层 (Rust + Tauri)                      │   │
│  │                                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐            │   │
│  │  │ PandocService│  │ FileCommands │            │   │
│  │  │ - DOCX→HTML  │  │ - open_docx_for_edit│   │   │
│  │  │ - HTML→DOCX  │  │ - save_docx  │            │   │
│  │  └──────────────┘  │ - create_draft│            │   │
│  │                     └──────────────┘            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流设计

#### 文件打开流程

```
用户操作（双击文件/新建文件/AI生成）
  ↓
documentService.openFile(filePath)
  ↓
判断文件类型和来源
  ↓
┌─────────────────┬─────────────────┬─────────────────┐
│ Markdown/TXT    │ DOCX (新建/AI)   │ DOCX (外部导入)  │
│                 │                 │                 │
│ 直接读取文本     │ 创建空DOCX/      │ 转换为HTML预览   │
│ 打开编辑器       │ 转换为HTML      │ 只读模式         │
│                 │ 打开编辑器       │ 显示编辑按钮     │
└─────────────────┴─────────────────┴─────────────────┘
```

#### DOCX 编辑流程（外部导入）

```
用户点击"编辑"按钮
  ↓
ReadOnlyBanner.handleEnableEdit()
  ↓
调用 create_draft_docx(originalPath)
  ↓
后端：复制原文件 → document.draft.docx
  ↓
后端：转换为HTML（Pandoc）
  ↓
前端：更新标签页路径为草稿路径
  ↓
前端：加载HTML内容到编辑器
  ↓
前端：启用编辑模式（isReadOnly = false）
  ↓
用户编辑 → 保存到草稿文件
```

---

## 三、详细实现方案

### 3.1 文件类型判断与处理策略

#### 3.1.1 文件类型枚举

```typescript
// src/types/file.ts
export type FileType = 
  | 'markdown'  // .md
  | 'text'      // .txt
  | 'docx'      // .docx
  | 'html'      // .html
  | 'pdf'       // .pdf
  | 'image';    // .png, .jpg, etc.

export type FileSource = 
  | 'new'           // 新建
  | 'external'      // 外部导入
  | 'ai_generated'; // AI生成
```

#### 3.1.2 文件打开策略表

```typescript
// src/services/documentService.ts

interface FileOpenStrategy {
  fileType: FileType;
  source: FileSource;
  canEdit: boolean;
  previewMode: boolean;
  requiresConversion: boolean;
}

const FILE_OPEN_STRATEGIES: Record<FileType, Record<FileSource, FileOpenStrategy>> = {
  markdown: {
    new: { fileType: 'markdown', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'markdown', source: 'external', canEdit: true, previewMode: false, requiresConversion: false },
    ai_generated: { fileType: 'markdown', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  text: {
    new: { fileType: 'text', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'text', source: 'external', canEdit: true, previewMode: false, requiresConversion: false },
    ai_generated: { fileType: 'text', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  docx: {
    new: { fileType: 'docx', source: 'new', canEdit: true, previewMode: false, requiresConversion: true },
    external: { fileType: 'docx', source: 'external', canEdit: false, previewMode: true, requiresConversion: true },
    ai_generated: { fileType: 'docx', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: true },
  },
  html: {
    new: { fileType: 'html', source: 'new', canEdit: true, previewMode: false, requiresConversion: false },
    external: { fileType: 'html', source: 'external', canEdit: true, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'html', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: false },
  },
  pdf: {
    new: { fileType: 'pdf', source: 'new', canEdit: false, previewMode: true, requiresConversion: false },
    external: { fileType: 'pdf', source: 'external', canEdit: false, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'pdf', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: false },
  },
  image: {
    new: { fileType: 'image', source: 'new', canEdit: false, previewMode: true, requiresConversion: false },
    external: { fileType: 'image', source: 'external', canEdit: false, previewMode: true, requiresConversion: false },
    ai_generated: { fileType: 'image', source: 'ai_generated', canEdit: false, previewMode: true, requiresConversion: false },
  },
};
```

### 3.2 文件来源识别

#### 3.2.1 识别方法

```typescript
// src/services/documentService.ts

/**
 * 识别文件来源
 * @param filePath 文件路径
 * @param context 上下文信息（可选）
 */
async function detectFileSource(
  filePath: string,
  context?: { isNewFile?: boolean; isAIGenerated?: boolean }
): Promise<FileSource> {
  // 1. 检查上下文标记
  if (context?.isNewFile) {
    return 'new';
  }
  
  if (context?.isAIGenerated) {
    return 'ai_generated';
  }
  
  // 2. 检查文件是否为新创建（通过文件修改时间）
  // 如果文件在最近1分钟内创建，可能是新建或AI生成
  try {
    const modifiedTime = await invoke<number>('get_file_modified_time', { path: filePath });
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    if (modifiedTime > oneMinuteAgo) {
      // 检查是否是草稿文件（AI生成的文件通常不是草稿）
      if (filePath.includes('.draft.')) {
        return 'external'; // 草稿文件来自外部导入
      }
      
      // 检查文件内容是否包含AI生成标记（可选）
      // 这里可以添加更复杂的检测逻辑
      return 'ai_generated'; // 默认认为是AI生成
    }
  } catch (error) {
    console.warn('检测文件来源失败:', error);
  }
  
  // 3. 默认认为是外部导入
  return 'external';
}
```

#### 3.2.2 文件打开接口优化

```typescript
// src/services/documentService.ts

export const documentService = {
  /**
   * 打开文件
   * @param filePath 文件路径
   * @param options 可选参数
   */
  async openFile(
    filePath: string,
    options?: {
      source?: FileSource;  // 显式指定来源
      forceEdit?: boolean;  // 强制编辑模式
    }
  ): Promise<void> {
    try {
      // 1. 获取文件修改时间
      let lastModifiedTime: number;
      try {
        lastModifiedTime = await invoke<number>('get_file_modified_time', { path: filePath });
      } catch (error) {
        console.warn('获取文件修改时间失败，使用当前时间:', error);
        lastModifiedTime = Date.now();
      }
      
      // 2. 识别文件类型
      const fileType = getFileType(filePath);
      
      // 3. 识别文件来源（如果未显式指定）
      const source = options?.source || await detectFileSource(filePath);
      
      // 4. 获取打开策略
      const strategy = FILE_OPEN_STRATEGIES[fileType]?.[source];
      if (!strategy) {
        throw new Error(`不支持的文件类型或来源: ${fileType} / ${source}`);
      }
      
      // 5. 根据策略打开文件
      await this.openFileWithStrategy(filePath, strategy, lastModifiedTime, options);
      
    } catch (error) {
      console.error('打开文件失败:', error);
      throw error;
    }
  },
  
  /**
   * 根据策略打开文件
   */
  async openFileWithStrategy(
    filePath: string,
    strategy: FileOpenStrategy,
    lastModifiedTime: number,
    options?: { forceEdit?: boolean }
  ): Promise<void> {
    const fileName = filePath.split('/').pop() || '未命名';
    const { fileType, canEdit, previewMode, requiresConversion } = strategy;
    const forceEdit = options?.forceEdit || false;
    
    // 判断是否为草稿文件
    const isDraft = filePath.includes('.draft.');
    
    switch (fileType) {
      case 'markdown':
      case 'text': {
        // Markdown 和 TXT：直接读取文本
        const content = await invoke<string>('read_file_content', { path: filePath });
        useEditorStore.getState().addTab(
          filePath,
          fileName,
          content,
          false, // isReadOnly
          isDraft,
          lastModifiedTime
        );
        break;
      }
      
      case 'html': {
        // HTML：读取内容
        const content = await invoke<string>('read_file_content', { path: filePath });
        useEditorStore.getState().addTab(
          filePath,
          fileName,
          content,
          previewMode && !forceEdit, // 外部导入的HTML默认预览
          isDraft,
          lastModifiedTime
        );
        break;
      }
      
      case 'docx': {
        if (requiresConversion) {
          try {
            // 使用 Pandoc 转换为 HTML
            const htmlContent = await invoke<string>('open_docx_for_edit', { path: filePath });
            
            // 判断是否可编辑
            const isReadOnly = previewMode && !forceEdit && !isDraft;
            
            useEditorStore.getState().addTab(
              filePath,
              fileName,
              htmlContent,
              isReadOnly,
              isDraft,
              lastModifiedTime
            );
          } catch (error) {
            // Pandoc 转换失败，显示错误提示
            const errorMessage = error instanceof Error ? error.message : String(error);
            const placeholder = this.createErrorPlaceholder(fileName, errorMessage);
            useEditorStore.getState().addTab(
              filePath,
              fileName,
              placeholder,
              true, // 只读模式
              isDraft,
              lastModifiedTime
            );
          }
        }
        break;
      }
      
      case 'pdf':
      case 'image': {
        // PDF 和图片：预览模式
        useEditorStore.getState().addTab(
          filePath,
          fileName,
          '', // 预览文件不需要内容
          true, // 只读模式
          isDraft,
          lastModifiedTime
        );
        break;
      }
    }
  },
  
  /**
   * 创建错误占位符
   */
  createErrorPlaceholder(fileName: string, errorMessage: string): string {
    return `<div style="padding: 20px; text-align: center; color: #666;">
      <h2>文件预览失败</h2>
      <p>文件：${fileName}</p>
      <p style="margin-top: 20px; color: #999;">
        ${errorMessage}<br/>
        请确保已安装 Pandoc，或文件格式正确。
      </p>
    </div>`;
  },
};
```

### 3.3 DOCX 文件处理详细流程

#### 3.3.1 DOCX 新建流程

```typescript
// 文件树新建按钮 → create_file('document.docx', 'docx')
// 
// 后端处理：
// 1. 创建空 DOCX 文件（使用 Pandoc 将空 HTML 转换为 DOCX）
// 2. 返回文件路径
//
// 前端处理：
// 1. 调用 documentService.openFile(filePath, { source: 'new' })
// 2. 检测到 source='new'，strategy.canEdit=true
// 3. 调用 open_docx_for_edit 转换为 HTML（三层样式处理策略）
// 4. 以可编辑模式打开（isReadOnly=false）
```

#### 3.3.2 DOCX AI生成流程

```typescript
// AI 工具调用 create_file → 
// 后端检测到 .docx 扩展名 →
// 使用 Pandoc 将内容（HTML/Markdown）转换为 DOCX →
// 返回成功
//
// 前端处理：
// 1. 文件树刷新，显示新文件
// 2. 用户双击打开
// 3. 调用 documentService.openFile(filePath)
// 4. 检测到文件在最近1分钟内创建 → source='ai_generated'
// 5. strategy.canEdit=true
// 6. 调用 open_docx_for_edit 转换为 HTML（三层样式处理策略）
// 7. 以可编辑模式打开（isReadOnly=false）
```

#### 3.3.3 DOCX 外部导入流程

```typescript
// 用户从文件系统拖拽或导入 DOCX 文件 →
// 文件树显示文件 →
// 用户双击打开
//
// 前端处理：
// 1. 调用 documentService.openFile(filePath)
// 2. 检测到文件不是新创建 → source='external'
// 3. strategy.canEdit=false, previewMode=true
// 4. 调用 open_docx_for_edit 转换为 HTML（三层样式处理策略）
// 5. 以只读模式打开（isReadOnly=true）
// 6. 显示 ReadOnlyBanner（包含"编辑"按钮）
//
// 用户点击"编辑"按钮：
// 1. ReadOnlyBanner.handleEnableEdit()
// 2. 调用 create_draft_docx(originalPath)
// 3. 后端：复制原文件 → document.draft.docx
// 4. 后端：转换为 HTML（Pandoc）
// 5. 前端：更新标签页路径为草稿路径
// 6. 前端：加载 HTML 内容到编辑器
// 7. 前端：启用编辑模式（isReadOnly=false）
```

#### 3.3.4 草稿文件创建实现

```rust
// src-tauri/src/commands/file_commands.rs

#[tauri::command]
pub async fn create_draft_docx(original_path: String) -> Result<String, String> {
    let original = PathBuf::from(&original_path);
    
    if !original.exists() {
        return Err(format!("原文件不存在: {}", original_path));
    }
    
    // 生成草稿文件路径：document.docx -> document.draft.docx
    let parent = original.parent()
        .ok_or_else(|| "无法获取文件父目录".to_string())?;
    let stem = original.file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法获取文件名".to_string())?;
    
    let draft_path = parent.join(format!("{}.draft.docx", stem));
    
    // 如果草稿文件已存在，先删除
    if draft_path.exists() {
        std::fs::remove_file(&draft_path)
            .map_err(|e| format!("删除已存在的草稿文件失败: {}", e))?;
    }
    
    // 复制原文件到草稿文件
    std::fs::copy(&original, &draft_path)
        .map_err(|e| format!("创建草稿文件失败: {}", e))?;
    
    // 注意：草稿文件保持原格式，不需要立即转换
    // 转换在打开时进行（open_docx_for_edit）
    
    Ok(draft_path.to_string_lossy().to_string())
}
```

### 3.4 编辑器组件渲染逻辑

#### 3.4.1 EditorPanel 渲染策略

```typescript
// src/components/Editor/EditorPanel.tsx

const getFileType = (filePath: string): FileType => {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'md') return 'markdown';
  if (ext === 'txt') return 'text';
  if (ext === 'docx') return 'docx';
  if (ext === 'html') return 'html';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  return 'text';
};

// 渲染逻辑
{activeTab ? (() => {
  const fileType = getFileType(activeTab.filePath);
  
  // PDF 和图片：使用预览组件
  if (fileType === 'pdf' || fileType === 'image') {
    return (
      <div className="h-full overflow-hidden">
        <FilePreview filePath={activeTab.filePath} fileType={fileType} />
      </div>
    );
  }
  
  // DOCX 和 HTML（只读模式）：HTML 预览
  if ((fileType === 'docx' || fileType === 'html') && activeTab.isReadOnly) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div 
          className="prose dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: activeTab.content }}
        />
      </div>
    );
  }
  
  // 其他文件：使用编辑器
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
      {/* ... */}
    </div>
  );
})() : null}
```

### 3.5 文件保存逻辑

#### 3.5.1 保存策略

```typescript
// src/services/documentService.ts

async saveFile(filePath: string, content: string): Promise<void> {
  try {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    if (ext === 'docx') {
      // DOCX 文件：使用 Pandoc 转换 HTML → DOCX
      await invoke('save_docx', { path: filePath, htmlContent: content });
    } else {
      // 其他文件：直接保存文本内容
      await invoke('write_file', { path: filePath, content });
    }
  } catch (error) {
    console.error('保存文件失败:', error);
    throw error;
  }
}
```

#### 3.5.2 保存进度监听

```typescript
// src/components/Editor/EditorPanel.tsx

useEffect(() => {
  const setupSaveProgressListener = async () => {
    try {
      const unlisten = await listen<SaveProgressEvent>('fs-save-progress', (event) => {
        const { file_path, status, progress, error } = event.payload;
        
        // 只处理当前标签页的文件
        if (activeTab && activeTab.filePath === file_path) {
          if (status === 'started') {
            setTabSaving(activeTab.id, true);
            toast.info('开始保存文件...');
          } else if (status === 'converting') {
            toast.info(`正在转换格式... ${progress}%`);
          } else if (status === 'completed') {
            setTabSaving(activeTab.id, false);
            markTabSaved(activeTab.id);
            toast.success('文件保存成功');
          } else if (status === 'failed') {
            setTabSaving(activeTab.id, false);
            toast.error(`保存失败: ${error || '未知错误'}`);
          }
        }
      });
      
      return unlisten;
    } catch (error) {
      console.error('初始化保存进度监听失败:', error);
      return () => {};
    }
  };
  
  let unlistenFn: (() => void) | null = null;
  setupSaveProgressListener().then(unlisten => {
    unlistenFn = unlisten;
  });
  
  return () => {
    if (unlistenFn) {
      unlistenFn();
    }
  };
}, [activeTab, setTabSaving, markTabSaved]);
```

---

## 四、关键接口定义

### 4.1 后端 Tauri 命令

```rust
// src-tauri/src/commands/file_commands.rs

/// 打开 DOCX 文件并转换为 HTML（用于预览）
#[tauri::command]
pub async fn open_docx_for_edit(path: String) -> Result<String, String>;

/// 创建 DOCX 文件的草稿副本
/// 返回草稿文件路径
#[tauri::command]
pub async fn create_draft_docx(original_path: String) -> Result<String, String>;

/// 保存 DOCX 文件（将 HTML 内容转换为 DOCX）
#[tauri::command]
pub async fn save_docx(
    path: String,
    html_content: String,
    app: tauri::AppHandle
) -> Result<(), String>;
```

### 4.2 前端服务接口

```typescript
// src/services/documentService.ts

export const documentService = {
  /**
   * 打开文件
   * @param filePath 文件路径
   * @param options 可选参数
   */
  async openFile(
    filePath: string,
    options?: {
      source?: FileSource;
      forceEdit?: boolean;
    }
  ): Promise<void>;

  /**
   * 保存文件
   * @param filePath 文件路径
   * @param content 文件内容（HTML/文本）
   */
  async saveFile(filePath: string, content: string): Promise<void>;
};
```

### 4.3 编辑器状态接口

```typescript
// src/stores/editorStore.ts

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;           // HTML/文本格式的内容
  lastSavedContent: string;
  isDirty: boolean;
  isSaving: boolean;
  isReadOnly: boolean;        // 是否只读模式
  isDraft: boolean;           // 是否为草稿文件
  lastModifiedTime: number;   // 文件最后修改时间
  editor: Editor | null;        // TipTap Editor 实例
}
```

---

## 五、实现检查清单

### 5.1 后端实现

- [x] **PandocService 扩展**
  - [x] `convert_docx_to_html()` - DOCX → HTML
  - [x] `convert_html_to_docx()` - HTML → DOCX
  - [x] Pandoc 可用性检测

- [x] **Tauri 命令实现**
  - [x] `open_docx_for_edit()` - 打开 DOCX 文件（三层样式处理策略）
  - [x] `create_draft_docx()` - 创建草稿副本
  - [x] `save_docx()` - 保存 DOCX 文件（含进度事件）

- [x] **工具调用优化**
  - [x] `create_file` 检测 DOCX 扩展名
  - [x] DOCX 文件使用 Pandoc 转换

### 5.2 前端实现

- [x] **documentService 优化**
  - [x] 文件类型判断
  - [x] 文件来源识别
  - [x] 打开策略表
  - [x] DOCX 预览支持
  - [x] DOCX 保存支持

- [x] **EditorPanel 更新**
  - [x] DOCX 预览模式渲染
  - [x] HTML 预览模式渲染
  - [x] 文件类型判断逻辑

- [x] **ReadOnlyBanner 更新**
  - [x] 编辑按钮功能
  - [x] 草稿文件创建
  - [x] 编辑模式切换

- [ ] **文件来源识别**（待实现）
  - [ ] `detectFileSource()` 函数
  - [ ] 文件修改时间检测
  - [ ] AI 生成标记检测

- [ ] **保存进度监听**（待实现）
  - [ ] `fs-save-progress` 事件监听
  - [ ] 进度显示 UI
  - [ ] 错误处理

### 5.3 测试场景

- [ ] **Markdown 文件**
  - [ ] 新建 → 直接编辑
  - [ ] 外部导入 → 直接编辑
  - [ ] AI 生成 → 直接编辑

- [ ] **TXT 文件**
  - [ ] 新建 → 直接编辑
  - [ ] 外部导入 → 直接编辑
  - [ ] AI 生成 → 直接编辑

- [ ] **DOCX 文件**
  - [ ] 新建 → 直接编辑
  - [ ] AI 生成 → 直接编辑
  - [ ] 外部导入 → 预览 → 点击编辑 → 草稿创建 → 编辑

- [ ] **PDF 文件**
  - [ ] 外部导入 → 预览（功能完好）

- [ ] **HTML 文件**
  - [ ] 新建 → 直接编辑
  - [ ] 外部导入 → 预览/编辑
  - [ ] AI 生成 → 直接编辑

---

## 六、错误处理与边界情况

### 6.1 Pandoc 不可用

**场景**：系统未安装 Pandoc

**处理方案**：
1. 检测 Pandoc 可用性（`PandocService::is_available()`）
2. 显示友好的错误提示
3. 提供安装指南链接

**错误提示**：
```typescript
"Pandoc 不可用，请安装 Pandoc 以支持 DOCX 文件。\n访问 https://pandoc.org/installing.html 获取安装指南。"
```

### 6.2 DOCX 文件损坏

**场景**：DOCX 文件格式错误或损坏

**处理方案**：
1. Pandoc 转换失败时捕获错误
2. 显示错误占位符
3. 提示用户文件可能损坏

### 6.3 草稿文件已存在

**场景**：用户多次点击"编辑"按钮

**处理方案**：
1. 检测草稿文件是否存在
2. 如果存在，先删除再创建
3. 或直接使用已存在的草稿文件（可选）

### 6.4 大文件处理

**场景**：DOCX 文件过大（>10MB）

**处理方案**：
1. 转换前检查文件大小
2. 大文件显示警告
3. 提供取消选项
4. 转换过程中显示进度

---

## 七、性能优化

### 7.1 转换缓存

**优化点**：相同 DOCX 文件多次打开时，缓存转换结果

**实现方案**：
```typescript
// 使用文件路径 + 修改时间作为缓存键
const cacheKey = `${filePath}_${lastModifiedTime}`;
if (conversionCache.has(cacheKey)) {
  return conversionCache.get(cacheKey);
}
```

### 7.2 异步转换

**优化点**：DOCX 转换是耗时操作，使用异步处理

**实现方案**：
- 后端：使用 `async/await` 处理转换
- 前端：显示加载状态，不阻塞 UI

### 7.3 进度反馈

**优化点**：长耗时操作提供进度反馈

**实现方案**：
- 使用 `fs-save-progress` 事件
- 显示进度条或 Toast 提示

---

## 八、用户体验优化

### 8.1 编辑按钮位置

**位置**：ReadOnlyBanner 组件中，文件预览区域顶部

**样式**：
- 蓝色按钮，带编辑图标
- 悬停效果
- 清晰的文字说明

### 8.2 草稿文件标识

**标识方式**：
- 标签页标题显示 `[草稿]` 前缀
- 文件树中显示 `.draft.docx` 后缀
- 工具栏显示草稿状态

### 8.3 保存提示

**提示内容**：
- 保存进度（转换中...）
- 保存成功/失败提示
- 草稿文件保存位置提示

---

## 九、后续扩展

### 9.1 草稿文件管理

**功能**：
- 草稿文件列表
- 一键清理未使用的草稿
- 草稿与原文件关联显示

### 9.2 格式转换增强

**功能**：
- 支持更多格式（RTF、ODT 等）
- 批量转换
- 转换选项配置

### 9.3 协作功能

**功能**：
- 草稿文件共享
- 版本对比
- 合并更改

---

## 十、总结

### 10.1 核心要点

1. **文件类型策略**：不同文件类型和来源采用不同的处理策略
2. **DOCX 特殊处理**：外部导入的 DOCX 需要预览→编辑流程
3. **草稿机制**：复杂格式文件使用草稿副本进行编辑
4. **Pandoc 集成**：所有 DOCX 转换依赖 Pandoc

### 10.2 实现状态

- ✅ **后端核心功能**：已完成
- ✅ **前端核心功能**：已完成
- ⚠️ **文件来源识别**：待优化
- ⚠️ **保存进度监听**：待实现
- ⚠️ **测试验证**：待完成

### 10.3 关键依赖

- **Pandoc**：优先使用系统安装版本，如果没有则使用内置版本
  - 系统 Pandoc：通过 `which pandoc` 查找
  - 内置 Pandoc：从 `resources/bin/` 目录加载
  - 详见：`src-tauri/resources/bin/PANDOC_SETUP.md`
- **Tauri 2.0**：桌面应用框架
- **TipTap**：富文本编辑器

### 10.4 Pandoc 内置方案

#### 10.4.1 实现原理

1. **优先级策略**：
   - 第一优先级：系统安装的 Pandoc（通过 `which pandoc` 查找）
   - 第二优先级：内置 Pandoc（从资源目录加载）

2. **查找路径**：
   - 开发模式：`src-tauri/resources/bin/pandoc`
   - macOS 打包后：`Binder.app/Contents/Resources/bin/pandoc`
   - Windows/Linux 打包后：`bin/pandoc`（相对于可执行文件）

3. **平台支持**：
   - macOS：`pandoc`（需要执行权限）
   - Windows：`pandoc.exe`
   - Linux：`pandoc`（需要执行权限）

#### 10.4.2 配置步骤

1. **获取 Pandoc 二进制文件**：
   - 从 [Pandoc 官网](https://github.com/jgm/pandoc/releases) 下载
   - 或从系统安装位置复制

2. **放置文件**：
   ```
   src-tauri/resources/bin/
   ├── pandoc          # macOS/Linux
   └── pandoc.exe      # Windows
   ```

3. **设置权限**（Linux/macOS）：
   ```bash
   chmod +x src-tauri/resources/bin/pandoc
   ```

4. **配置 tauri.conf.json**：
   ```json
   {
     "bundle": {
       "resources": [
         "resources/bin/**"
       ]
     }
   }
   ```

#### 10.4.3 优势

- ✅ **零配置**：用户无需手动安装 Pandoc
- ✅ **向后兼容**：优先使用系统版本（可能更新）
- ✅ **跨平台**：支持 macOS、Windows、Linux
- ✅ **自动降级**：系统版本不可用时自动使用内置版本

#### 10.4.4 注意事项

- ⚠️ **文件大小**：Pandoc 二进制文件较大（约 50-100MB），会增加应用体积
- ⚠️ **平台特定**：需要为每个目标平台准备对应的二进制文件
- ⚠️ **版本管理**：建议使用 Pandoc 2.x 或更高版本

---

**文档版本**：v1.1  
**最后更新**：2025-01-XX  
**维护者**：编辑器组