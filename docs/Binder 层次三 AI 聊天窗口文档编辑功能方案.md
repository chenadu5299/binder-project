# Binder 层次三 AI 聊天窗口文档编辑功能方案

> **自检报告**：请参考 `Binder文档编辑功能方案自检报告.md` 了解方案的完整性和落地性评估。

## 1. 概述

本文档基于 Void 的文档编辑实现逻辑，为 Binder 设计完整的文档编辑功能方案。Binder 作为文档助手，需要支持 AI 在聊天窗口中编辑当前打开的文档，并提供清晰的 diff 预览和确认/拒绝机制。

### 1.1 Binder 与 Void 的差异

| 特性 | Void | Binder |
|------|------|--------|
| 应用类型 | VSCode 扩展 | Tauri 桌面应用 |
| 编辑器 | Monaco Editor | 自定义编辑器（TipTap） |
| 后端 | TypeScript (Node.js) | Rust (Tauri) |
| 前端 | TypeScript (VSCode) | React + TypeScript |
| 定位 | 编程助手 | 文档助手 |
| 通信方式 | 服务注入 | Tauri Commands + Events |

### 1.2 设计目标

1. **完整性**：支持获取当前编辑器内容、计算 diff、预览变更、应用/拒绝变更
2. **稳定性**：处理边界情况，支持撤销/重做，处理并发编辑
3. **用户体验**：清晰的视觉反馈，流畅的交互，支持部分接受
4. **性能**：大文件优化，流式传输支持（可选）

## 2. 依赖说明

### 2.1 后端依赖

需要在 `src-tauri/Cargo.toml` 中添加：

```toml
[dependencies]
similar = "2.4"  # 高性能 diff 算法库
```

### 2.2 前端依赖

前端无需新增依赖，使用现有的 React 和 Tauri API。

**可选依赖**（虚拟滚动，大文件优化）：
```json
{
  "dependencies": {
    "@tanstack/react-virtual": "^3.0.0"
  }
}
```

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ChatMessages │  │DocumentDiffView│ │   Editor     │  │
│  │              │  │               │ │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                              │
│                    ┌───────▼────────┐                    │
│                    │  EditorStore   │                    │
│                    │  ChatStore     │                    │
│                    └───────┬────────┘                    │
└────────────────────────────┼─────────────────────────────┘
                              │
                    Tauri Commands/Events
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                    后端 (Rust)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ ToolService  │  │ DiffService  │  │ EditorService│   │
│  │              │  │              │  │              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │           │
│         └──────────────────┼──────────────────┘           │
│                            │                               │
│                    ┌───────▼────────┐                     │
│                    │  EditCodeService│                    │
│                    │  (核心服务)     │                    │
│                    └────────────────┘                    │
└────────────────────────────────────────────────────────────┘
```

### 3.2 核心服务设计

#### 3.2.1 EditCodeService (Rust)

**文件位置**：`src-tauri/src/services/edit_code_service.rs`

**服务注册**：在 `src-tauri/src/services/mod.rs` 中添加：
```rust
pub mod edit_code_service;
```

**状态管理**：在 `src-tauri/src/main.rs` 或 `lib.rs` 中注册为 Tauri State：
```rust
.manage(Arc::new(Mutex::new(EditCodeService::new())))
```

#### 3.2.2 DiffService (Rust)

**文件位置**：`src-tauri/src/services/diff_service.rs`

**服务注册**：在 `src-tauri/src/services/mod.rs` 中添加：
```rust
pub mod diff_service;
```

**使用方式**：作为工具服务的一部分，在 `ToolService` 中使用。

#### 3.2.3 EditCodeService 数据结构

参考 Void 的 `EditCodeService`，但适配 Tauri 架构：

```rust
pub struct EditCodeService {
    // DiffArea 管理
    diff_areas: HashMap<String, DiffArea>, // diff_area_id -> DiffArea
    diff_areas_by_uri: HashMap<String, HashSet<String>>, // uri -> diff_area_ids
    
    // Diff 管理
    diffs: HashMap<String, Diff>, // diff_id -> Diff
    
    // 事件发送器（用于通知前端）
    event_emitter: EventEmitter,
}

pub enum DiffArea {
    DiffZone {
        diff_area_id: String,
        uri: String,
        original_code: String,
        start_line: usize,
        end_line: usize,
        diffs: HashMap<String, Diff>,
        stream_state: StreamState,
    },
    // 注意：Binder 不需要 CtrlKZone，因为不是编程助手
}

pub enum Diff {
    Edit {
        diff_id: String,
        diff_area_id: String,
        original_code: String,
        original_start_line: usize,
        original_end_line: usize,
        new_code: String,
        start_line: usize,
        end_line: usize,
    },
    Insertion {
        diff_id: String,
        diff_area_id: String,
        original_start_line: usize,
        new_code: String,
        start_line: usize,
        end_line: usize,
    },
    Deletion {
        diff_id: String,
        diff_area_id: String,
        original_code: String,
        original_start_line: usize,
        original_end_line: usize,
        start_line: usize,
    },
}
```

## 3. 数据结构设计

### 3.1 后端数据结构 (Rust)

```rust
// src-tauri/src/services/edit_code_service.rs

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffArea {
    pub diff_area_id: String,
    pub uri: String,
    pub diff_area_type: DiffAreaType,
    pub start_line: usize,
    pub end_line: usize,
    pub original_code: String,
    pub diffs: HashMap<String, Diff>,
    pub stream_state: StreamState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffAreaType {
    DiffZone,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StreamState {
    Streaming {
        stream_request_id: Option<String>,
        current_line: usize,
    },
    NotStreaming,
}

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffType {
    Edit,
    Insertion,
    Deletion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorContent {
    pub file_path: String,
    pub content: String,
    pub line_count: usize,
}
```

### 4.2 前端数据结构 (TypeScript)

```typescript
// src/types/editCode.ts

export interface DiffArea {
  diffAreaId: string;
  uri: string;
  type: 'DiffZone';
  startLine: number;
  endLine: number;
  originalCode: string;
  diffs: Record<string, Diff>;
  streamState: StreamState;
}

export interface Diff {
  diffId: string;
  diffAreaId: string;
  type: 'edit' | 'insertion' | 'deletion';
  originalCode: string;
  originalStartLine: number;
  originalEndLine: number;
  newCode: string;
  startLine: number;
  endLine: number;
}

export interface StreamState {
  isStreaming: boolean;
  streamRequestId?: string;
  currentLine?: number;
}

export interface EditorContent {
  filePath: string;
  content: string;
  lineCount: number;
}
```

## 5. 工作流程设计

### 5.1 编辑启动流程

```
用户请求编辑
    ↓
AI 调用 edit_current_editor_document 工具
    ↓
后端获取当前编辑器内容
    ↓
计算 Diff（如果提供新内容）
    ↓
返回 Diff 信息到前端
    ↓
前端显示 Diff 预览
    ↓
用户确认/拒绝
    ↓
应用变更到编辑器
```

### 5.2 详细流程

#### 步骤 1：工具调用参数增强（关键实现点）

**实现位置**：`src-tauri/src/commands/ai_commands.rs` 的 `ai_chat_stream` 函数中

**实现时机**：在工具调用处理之前，拦截 `edit_current_editor_document` 工具调用并自动增强参数

**实现逻辑**：
```rust
// src-tauri/src/commands/ai_commands.rs

// 在工具调用处理循环中，检测到 edit_current_editor_document 时
if tool_call.name == "edit_current_editor_document" {
    // 从前端传递的参数中获取当前编辑器内容
    // 注意：前端需要在调用 ai_chat_stream 时传递 current_editor_content
    if let Some(current_content) = &current_editor_content {
        // 自动添加 current_file 和 current_content 参数
        tool_call.arguments.insert(
            "current_file".to_string(),
            serde_json::Value::String(current_file.clone().unwrap_or_default()),
        );
        tool_call.arguments.insert(
            "current_content".to_string(),
            serde_json::Value::String(current_content.clone()),
        );
    }
}
```

**前端传递编辑器内容**：
```typescript
// src/stores/chatStore.ts

sendMessage: async (tabId: string, content: string) => {
  // ... 现有代码 ...
  
  // 获取当前编辑器内容
  const { getActiveTab } = useEditorStore.getState();
  const activeEditorTab = getActiveTab();
  const currentFile = activeEditorTab?.filePath || null;
  const currentContent = activeEditorTab?.content || null;
  
  await invoke('ai_chat_stream', {
    tabId,
    messages,
    modelConfig: { ... },
    enableTools,
    currentFile,
    selectedText,
    // 新增：传递当前编辑器内容（用于工具调用参数增强）
    currentEditorContent: currentContent,
    editorState: {
      file_type: currentFile ? currentFile.split('.').pop() : null,
      file_size: activeEditorTab?.content.length || 0,
      is_saved: !activeEditorTab?.isDirty,
    },
  });
}
```

**后端接收参数**：
```rust
// src-tauri/src/commands/ai_commands.rs

#[tauri::command]
pub async fn ai_chat_stream(
    // ... 现有参数 ...
    current_editor_content: Option<String>,  // 新增参数
) -> Result<(), String> {
    // ... 在工具调用处理中使用 current_editor_content ...
}
```

#### 步骤 2：工具执行

**前端触发**：
```typescript
// AI 在聊天中生成工具调用
{
  name: 'edit_current_editor_document',
  arguments: {
    content: '新内容...',
    instruction: '可选指令'
  }
}
```

**后端处理** (`tool_service.rs`)：
```rust
async fn edit_current_editor_document(
    &self,
    tool_call: &ToolCall,
    workspace_path: &Path,
) -> Result<ToolResult, String> {
    // 1. 获取当前编辑器内容
    let current_content = self.get_current_editor_content().await?;
    
    // 2. 获取新内容
    let new_content = tool_call
        .arguments
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "缺少 content 参数".to_string())?;
    
    // 3. 计算 Diff
    let diffs = self.calculate_diff(&current_content.content, new_content)?;
    
    // 4. 创建 DiffZone
    let diff_area_id = self.edit_code_service.create_diff_zone(
        &current_content.file_path,
        &current_content.content,
        diffs,
    ).await?;
    
    // 5. 返回结果
    Ok(ToolResult {
        success: true,
        data: Some(serde_json::json!({
            "diff_area_id": diff_area_id,
            "file_path": current_content.file_path,
            "old_content": current_content.content,
            "new_content": new_content,
            "diffs": diffs,
        })),
        error: None,
        message: Some("文档编辑已准备，请查看预览".to_string()),
    })
}
```

#### 步骤 2：获取当前编辑器内容

**新增 Tauri Command**：
```rust
// src-tauri/src/commands/editor_commands.rs

#[tauri::command]
pub async fn get_current_editor_content() -> Result<EditorContent, String> {
    // 通过事件系统或直接访问编辑器状态获取内容
    // 这里需要与前端编辑器状态同步
    // 方案 A：前端主动传递（推荐）
    // 方案 B：后端维护编辑器状态缓存
    
    // 临时方案：通过事件系统请求前端
    // 长期方案：维护编辑器状态服务
    todo!("实现获取当前编辑器内容")
}
```

**前端实现**：
```typescript
// src/stores/editorStore.ts

export const getCurrentEditorContent = async (): Promise<EditorContent> => {
  const { getActiveTab } = useEditorStore.getState();
  const activeTab = getActiveTab();
  
  if (!activeTab) {
    throw new Error('没有打开的编辑器');
  }
  
  return {
    filePath: activeTab.filePath,
    content: activeTab.content,
    lineCount: activeTab.content.split('\n').length,
  };
};
```

#### 步骤 3：Diff 计算

**后端实现** (`diff_service.rs`)：
```rust
use diff::Result as DiffResult;

pub struct DiffService;

impl DiffService {
    pub fn calculate_diff(
        &self,
        old_content: &str,
        new_content: &str,
    ) -> Result<Vec<Diff>, String> {
        let old_lines: Vec<&str> = old_content.lines().collect();
        let new_lines: Vec<&str> = new_content.lines().collect();
        
        // 使用 diff 算法计算差异
        let changes = diff::lines(old_content, new_content);
        
        let mut diffs = Vec::new();
        let mut old_line_num = 1;
        let mut new_line_num = 1;
        let mut streak_start_old = None;
        let mut streak_start_new = None;
        
        for change in changes {
            match change {
                DiffResult::Both(_, _) => {
                    // 无变化，结束当前 streak
                    if let (Some(old_start), Some(new_start)) = (streak_start_old, streak_start_new) {
                        let diff = self.create_diff_from_streak(
                            &old_lines,
                            &new_lines,
                            old_start,
                            old_line_num - 1,
                            new_start,
                            new_line_num - 1,
                        )?;
                        diffs.push(diff);
                        streak_start_old = None;
                        streak_start_new = None;
                    }
                    old_line_num += 1;
                    new_line_num += 1;
                }
                DiffResult::Left(_) => {
                    // 删除
                    if streak_start_old.is_none() {
                        streak_start_old = Some(old_line_num);
                        streak_start_new = Some(new_line_num);
                    }
                    old_line_num += 1;
                }
                DiffResult::Right(_) => {
                    // 添加
                    if streak_start_old.is_none() {
                        streak_start_old = Some(old_line_num);
                        streak_start_new = Some(new_line_num);
                    }
                    new_line_num += 1;
                }
            }
        }
        
        // 处理最后的 streak
        if let (Some(old_start), Some(new_start)) = (streak_start_old, streak_start_new) {
            let diff = self.create_diff_from_streak(
                &old_lines,
                &new_lines,
                old_start,
                old_line_num - 1,
                new_start,
                new_line_num - 1,
            )?;
            diffs.push(diff);
        }
        
        Ok(diffs)
    }
    
    fn create_diff_from_streak(
        &self,
        old_lines: &[&str],
        new_lines: &[&str],
        old_start: usize,
        old_end: usize,
        new_start: usize,
        new_end: usize,
    ) -> Result<Diff, String> {
        let original_code = old_lines[old_start - 1..old_end].join("\n");
        let new_code = new_lines[new_start - 1..new_end].join("\n");
        
        let diff_type = if old_start > old_end {
            DiffType::Insertion
        } else if new_start > new_end {
            DiffType::Deletion
        } else {
            DiffType::Edit
        };
        
        Ok(Diff {
            diff_id: generate_diff_id(),
            diff_area_id: String::new(), // 稍后设置
            diff_type,
            original_code,
            original_start_line: old_start,
            original_end_line: old_end,
            new_code,
            start_line: new_start,
            end_line: new_end,
        })
    }
}
```

#### 步骤 4：前端显示 Diff 预览

**更新 ChatMessages.tsx**：
```typescript
// src/components/Chat/ChatMessages.tsx

if (block.toolCall.name === 'edit_current_editor_document') {
  const toolResult = block.toolCall.result;
  const diffAreaId = toolResult?.data?.diff_area_id;
  const oldContent = toolResult?.data?.old_content || '';
  const newContent = toolResult?.data?.new_content || '';
  const filePath = toolResult?.data?.file_path || '当前文档';
  const diffs = toolResult?.data?.diffs || [];
  
  return (
    <div key={block.id} className="mt-2">
      <DocumentDiffView
        diffAreaId={diffAreaId}
        oldContent={oldContent}
        newContent={newContent}
        filePath={filePath}
        diffs={diffs}
        onConfirm={async (level: 'paragraph' | 'document' | 'all', paragraphId?: string) => {
          await handleConfirmEdit(diffAreaId, level, paragraphId);
        }}
        onReject={async () => {
          await handleRejectEdit(diffAreaId);
        }}
      />
    </div>
  );
}
```

**更新 DocumentDiffView.tsx**：
```typescript
// src/components/Chat/DocumentDiffView.tsx

interface DocumentDiffViewProps {
  diffAreaId: string;
  oldContent: string;
  newContent: string;
  filePath: string;
  diffs: Diff[];
  onConfirm: (level: 'paragraph' | 'document' | 'all', paragraphId?: string) => void;
  onReject: () => void;
}

export const DocumentDiffView: React.FC<DocumentDiffViewProps> = ({
  diffAreaId,
  oldContent,
  newContent,
  filePath,
  diffs,
  onConfirm,
  onReject,
}) => {
  // 使用传入的 diffs，而不是重新计算
  // 这样可以确保前后端一致
  
  const renderDiff = (diff: Diff) => {
    switch (diff.type) {
      case 'edit':
        return (
          <div className="space-y-2 mb-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded">
              <div className="text-xs text-red-600 dark:text-red-400 mb-1">
                删除 (行 {diff.originalStartLine}-{diff.originalEndLine})
              </div>
              <div className="text-sm font-mono whitespace-pre-wrap line-through">
                {diff.originalCode}
              </div>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded">
              <div className="text-xs text-green-600 dark:text-green-400 mb-1">
                添加 (行 {diff.startLine}-{diff.endLine})
              </div>
              <div className="text-sm font-mono whitespace-pre-wrap">
                {diff.newCode}
              </div>
            </div>
          </div>
        );
      case 'insertion':
        return (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded mb-4">
            <div className="text-xs text-green-600 dark:text-green-400 mb-1">
              插入 (行 {diff.startLine}-{diff.endLine})
            </div>
            <div className="text-sm font-mono whitespace-pre-wrap">
              {diff.newCode}
            </div>
          </div>
        );
      case 'deletion':
        return (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded mb-4">
            <div className="text-xs text-red-600 dark:text-red-400 mb-1">
              删除 (行 {diff.originalStartLine}-{diff.originalEndLine})
            </div>
            <div className="text-sm font-mono whitespace-pre-wrap line-through">
              {diff.originalCode}
            </div>
          </div>
        );
    }
  };
  
  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            文档编辑预览: {filePath}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            共 {diffs.length} 处变更
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onReject()}
            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
          >
            拒绝
          </button>
          <button
            onClick={() => onConfirm('all')}
            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/40 transition-colors"
          >
            全部接受
          </button>
        </div>
      </div>
      
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {diffs.map((diff, index) => (
          <div key={diff.diffId} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                变更 #{index + 1}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => onConfirm('paragraph', diff.diffId)}
                  className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/40 transition-colors"
                >
                  接受此项
                </button>
              </div>
            </div>
            {renderDiff(diff)}
          </div>
        ))}
      </div>
    </div>
  );
};
```

#### 步骤 5：应用变更到编辑器

**新增 Tauri Command**：
```rust
// src-tauri/src/commands/editor_commands.rs

#[tauri::command]
pub async fn apply_edit_to_editor(
    file_path: String,
    new_content: String,
) -> Result<(), String> {
    // 发送事件到前端，通知编辑器更新
    // 或者直接通过共享状态更新
    
    // 方案：通过 Tauri Event 通知前端
    // 前端监听事件并更新编辑器
    Ok(())
}
```

**前端实现**：
```typescript
// src/components/Chat/ChatMessages.tsx

const handleConfirmEdit = async (
  diffAreaId: string,
  level: 'paragraph' | 'document' | 'all',
  paragraphId?: string,
) => {
  try {
    if (level === 'all') {
      // 接受所有变更
      const result = await invoke('accept_all_diffs', {
        diffAreaId,
      });
      
      // 获取最终内容并应用到编辑器
      const finalContent = await invoke('get_diff_final_content', {
        diffAreaId,
      });
      
      // 更新编辑器
      const { getActiveTab, updateTabContent } = useEditorStore.getState();
      const activeTab = getActiveTab();
      if (activeTab && activeTab.filePath === result.filePath) {
        updateTabContent(activeTab.id, finalContent);
      }
    } else if (level === 'paragraph' && paragraphId) {
      // 接受单个 diff
      await invoke('accept_diff', {
        diffId: paragraphId,
      });
      
      // 获取更新后的内容
      const updatedContent = await invoke('get_diff_final_content', {
        diffAreaId,
      });
      
      // 更新编辑器
      const { getActiveTab, updateTabContent } = useEditorStore.getState();
      const activeTab = getActiveTab();
      if (activeTab) {
        updateTabContent(activeTab.id, updatedContent);
      }
    }
  } catch (error) {
    console.error('应用编辑失败:', error);
  }
};

const handleRejectEdit = async (diffAreaId: string) => {
  try {
    await invoke('reject_all_diffs', {
      diffAreaId,
    });
    
    // 移除 diff 预览
    // 编辑器内容保持不变
  } catch (error) {
    console.error('拒绝编辑失败:', error);
  }
};
```

## 5. 后端实现细节

### 5.1 EditCodeService 实现

```rust
// src-tauri/src/services/edit_code_service.rs

use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};

pub struct EditCodeService {
    diff_areas: HashMap<String, DiffArea>,
    diff_areas_by_uri: HashMap<String, HashSet<String>>,
    diffs: HashMap<String, Diff>,
    diff_area_id_pool: usize,
    diff_id_pool: usize,
}

impl EditCodeService {
    pub fn new() -> Self {
        Self {
            diff_areas: HashMap::new(),
            diff_areas_by_uri: HashMap::new(),
            diffs: HashMap::new(),
            diff_area_id_pool: 0,
            diff_id_pool: 0,
        }
    }
    
    /// 创建 DiffZone
    pub fn create_diff_zone(
        &mut self,
        uri: &str,
        original_code: &str,
        diffs: Vec<Diff>,
    ) -> Result<String, String> {
        let diff_area_id = self.generate_diff_area_id();
        
        // 计算行范围
        let (start_line, end_line) = self.calculate_line_range(&diffs);
        
        // 创建 DiffArea
        let diff_area = DiffArea {
            diff_area_id: diff_area_id.clone(),
            uri: uri.to_string(),
            diff_area_type: DiffAreaType::DiffZone,
            start_line,
            end_line,
            original_code: original_code.to_string(),
            diffs: HashMap::new(),
            stream_state: StreamState::NotStreaming,
        };
        
        // 添加 diffs
        let mut diff_map = HashMap::new();
        for mut diff in diffs {
            diff.diff_area_id = diff_area_id.clone();
            diff.diff_id = self.generate_diff_id();
            diff_map.insert(diff.diff_id.clone(), diff.clone());
            self.diffs.insert(diff.diff_id.clone(), diff);
        }
        
        // 更新 diff_area
        // 注意：需要修改 DiffArea 结构以支持可变更新
        // 这里简化处理，实际需要重新设计
        
        // 添加到映射
        self.diff_areas.insert(diff_area_id.clone(), diff_area);
        self.diff_areas_by_uri
            .entry(uri.to_string())
            .or_insert_with(HashSet::new)
            .insert(diff_area_id.clone());
        
        Ok(diff_area_id)
    }
    
    /// 接受所有 diffs
    pub fn accept_all_diffs(
        &mut self,
        diff_area_id: &str,
    ) -> Result<String, String> {
        let diff_area = self.diff_areas.get_mut(diff_area_id)
            .ok_or_else(|| "DiffArea 不存在".to_string())?;
        
        // 构建最终内容
        let mut final_content = diff_area.original_code.clone();
        let mut line_offset = 0;
        
        // 按行号排序 diffs
        let mut sorted_diffs: Vec<_> = diff_area.diffs.values().collect();
        sorted_diffs.sort_by_key(|d| d.original_start_line);
        
        // 从后往前应用，避免行号偏移问题
        for diff in sorted_diffs.iter().rev() {
            match diff.diff_type {
                DiffType::Edit => {
                    // 替换代码
                    let lines: Vec<&str> = final_content.lines().collect();
                    let before = lines[..(diff.original_start_line - 1 + line_offset)].join("\n");
                    let after = lines[(diff.original_end_line + line_offset)..].join("\n");
                    final_content = format!("{}\n{}\n{}", before, diff.new_code, after);
                }
                DiffType::Insertion => {
                    // 插入代码
                    let lines: Vec<&str> = final_content.lines().collect();
                    let before = lines[..(diff.original_start_line - 1 + line_offset)].join("\n");
                    let after = lines[(diff.original_start_line - 1 + line_offset)..].join("\n");
                    final_content = format!("{}\n{}\n{}", before, diff.new_code, after);
                    line_offset += diff.end_line - diff.start_line + 1;
                }
                DiffType::Deletion => {
                    // 删除代码
                    let lines: Vec<&str> = final_content.lines().collect();
                    let before = lines[..(diff.original_start_line - 1 + line_offset)].join("\n");
                    let after = lines[(diff.original_end_line + line_offset)..].join("\n");
                    final_content = format!("{}\n{}", before, after);
                    line_offset -= diff.original_end_line - diff.original_start_line + 1;
                }
            }
        }
        
        // 删除 diff_area
        self.diff_areas.remove(diff_area_id);
        self.diff_areas_by_uri
            .get_mut(&diff_area.uri)
            .and_then(|set| {
                set.remove(diff_area_id);
                Some(())
            });
        
        Ok(final_content)
    }
    
    /// 拒绝所有 diffs
    pub fn reject_all_diffs(&mut self, diff_area_id: &str) -> Result<(), String> {
        let diff_area = self.diff_areas.get(diff_area_id)
            .ok_or_else(|| "DiffArea 不存在".to_string())?;
        
        // 删除 diff_area（内容保持不变）
        self.diff_areas.remove(diff_area_id);
        self.diff_areas_by_uri
            .get_mut(&diff_area.uri)
            .and_then(|set| {
                set.remove(diff_area_id);
                Some(())
            });
        
        Ok(())
    }
    
    /// 接受单个 diff
    pub fn accept_diff(&mut self, diff_id: &str) -> Result<String, String> {
        let diff = self.diffs.get(diff_id)
            .ok_or_else(|| "Diff 不存在".to_string())?;
        
        let diff_area = self.diff_areas.get_mut(&diff.diff_area_id)
            .ok_or_else(|| "DiffArea 不存在".to_string())?;
        
        // 更新 original_code
        // 这里需要根据 diff 类型更新 original_code
        // 简化处理：直接使用 new_code 替换对应部分
        
        // 删除该 diff
        diff_area.diffs.remove(diff_id);
        self.diffs.remove(diff_id);
        
        // 如果 diff_area 没有更多 diffs，删除它
        if diff_area.diffs.is_empty() {
            self.diff_areas.remove(&diff.diff_area_id);
            self.diff_areas_by_uri
                .get_mut(&diff_area.uri)
                .and_then(|set| {
                    set.remove(&diff.diff_area_id);
                    Some(())
                });
        }
        
        // 返回更新后的内容
        self.get_diff_final_content(&diff.diff_area_id)
    }
    
    /// 获取最终内容
    pub fn get_diff_final_content(&self, diff_area_id: &str) -> Result<String, String> {
        let diff_area = self.diff_areas.get(diff_area_id)
            .ok_or_else(|| "DiffArea 不存在".to_string())?;
        
        // 如果所有 diffs 都已接受，返回 original_code（已更新）
        // 否则，应用所有 diffs 计算最终内容
        // 这里简化处理，实际需要更复杂的逻辑
        Ok(diff_area.original_code.clone())
    }
    
    fn generate_diff_area_id(&mut self) -> String {
        self.diff_area_id_pool += 1;
        format!("diff_area_{}", self.diff_area_id_pool)
    }
    
    fn generate_diff_id(&mut self) -> String {
        self.diff_id_pool += 1;
        format!("diff_{}", self.diff_id_pool)
    }
    
    fn calculate_line_range(&self, diffs: &[Diff]) -> (usize, usize) {
        if diffs.is_empty() {
            return (1, 1);
        }
        
        let min_start = diffs.iter()
            .map(|d| d.original_start_line.min(d.start_line))
            .min()
            .unwrap_or(1);
        
        let max_end = diffs.iter()
            .map(|d| d.original_end_line.max(d.end_line))
            .max()
            .unwrap_or(1);
        
        (min_start, max_end)
    }
}
```

### 5.2 工具服务更新

```rust
// src-tauri/src/services/tool_service.rs

impl ToolService {
    // ... 现有代码 ...
    
    async fn edit_current_editor_document(
        &self,
        tool_call: &ToolCall,
        workspace_path: &Path,
    ) -> Result<ToolResult, String> {
        // 1. 获取当前编辑器内容
        // 注意：这里需要通过 Tauri Event 或 Command 获取
        // 临时方案：要求前端在调用时传递 current_file
        let current_file = tool_call
            .arguments
            .get("current_file")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 current_file 参数".to_string())?;
        
        // 读取文件内容（临时方案）
        // 长期方案：从编辑器状态服务获取
        let current_content = std::fs::read_to_string(workspace_path.join(current_file))
            .map_err(|e| format!("读取文件失败: {}", e))?;
        
        // 2. 获取新内容
        let new_content = tool_call
            .arguments
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 content 参数".to_string())?;
        
        // 3. 计算 Diff
        let diff_service = DiffService::new();
        let diffs = diff_service.calculate_diff(&current_content, new_content)?;
        
        // 4. 创建 DiffZone
        let mut edit_code_service = EditCodeService::new(); // 实际应该是单例
        let diff_area_id = edit_code_service.create_diff_zone(
            current_file,
            &current_content,
            diffs.clone(),
        )?;
        
        // 5. 返回结果
        Ok(ToolResult {
            success: true,
            data: Some(serde_json::json!({
                "diff_area_id": diff_area_id,
                "file_path": current_file,
                "old_content": current_content,
                "new_content": new_content,
                "diffs": diffs,
            })),
            error: None,
            message: Some("文档编辑已准备，请查看预览".to_string()),
        })
    }
}
```

## 6. 前端实现细节

### 6.1 编辑器内容获取

**方案 A：前端主动传递（推荐）**

在调用工具时，前端主动传递当前编辑器内容：

```typescript
// src/stores/chatStore.ts

sendMessage: async (tabId: string, content: string) => {
  // ... 现有代码 ...
  
  // 获取当前编辑器内容
  const { getActiveTab } = useEditorStore.getState();
  const activeEditorTab = getActiveTab();
  const currentFile = activeEditorTab?.filePath || null;
  const currentContent = activeEditorTab?.content || null;
  
  // 在工具调用时，如果工具是 edit_current_editor_document，
  // 自动添加 current_file 和 current_content 参数
  // 这需要在 AI 调用工具时进行拦截和增强
  
  await invoke('ai_chat_stream', {
    tabId,
    messages,
    modelConfig: { ... },
    enableTools,
    currentFile,
    selectedText,
    // 新增：传递当前编辑器内容
    currentEditorContent: currentContent,
  });
}
```

**后端处理**：
```rust
// src-tauri/src/commands/ai_commands.rs

#[tauri::command]
pub async fn ai_chat_stream(
    // ... 现有参数 ...
    current_editor_content: Option<String>,
) -> Result<(), String> {
    // 在工具调用处理中，如果是 edit_current_editor_document，
    // 自动添加 current_file 和 current_content
    // ...
}
```

### 6.2 Diff 预览组件增强

```typescript
// src/components/Chat/DocumentDiffView.tsx

export const DocumentDiffView: React.FC<DocumentDiffViewProps> = ({
  diffAreaId,
  oldContent,
  newContent,
  filePath,
  diffs,
  onConfirm,
  onReject,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  
  const handleConfirm = async (level: 'paragraph' | 'document' | 'all', paragraphId?: string) => {
    setIsApplying(true);
    try {
      await onConfirm(level, paragraphId);
      // 显示成功提示
    } catch (error) {
      console.error('应用编辑失败:', error);
      // 显示错误提示
    } finally {
      setIsApplying(false);
    }
  };
  
  const handleReject = async () => {
    setIsApplying(true);
    try {
      await onReject();
      // 移除预览
    } catch (error) {
      console.error('拒绝编辑失败:', error);
    } finally {
      setIsApplying(false);
    }
  };
  
  // ... 渲染逻辑 ...
};
```

### 6.3 编辑器更新

```typescript
// src/components/Chat/ChatMessages.tsx

const handleConfirmEdit = async (
  diffAreaId: string,
  level: 'paragraph' | 'document' | 'all',
  paragraphId?: string,
) => {
  try {
    let result;
    
    if (level === 'all') {
      // 接受所有变更
      result = await invoke('accept_all_diffs', {
        diffAreaId,
      });
      
      // 获取最终内容并应用到编辑器
      const finalContent = await invoke('get_diff_final_content', {
        diffAreaId,
      });
      
      // 更新编辑器
      const { getActiveTab, updateTabContent } = useEditorStore.getState();
      const activeTab = getActiveTab();
      if (activeTab && activeTab.filePath === result.filePath) {
        updateTabContent(activeTab.id, finalContent);
      }
    } else if (level === 'paragraph' && paragraphId) {
      // 接受单个 diff
      result = await invoke('accept_diff', {
        diffId: paragraphId,
      });
      
      // 获取更新后的内容
      const updatedContent = await invoke('get_diff_final_content', {
        diffAreaId,
      });
      
      // 更新编辑器
      const { getActiveTab, updateTabContent } = useEditorStore.getState();
      const activeTab = getActiveTab();
      if (activeTab) {
        updateTabContent(activeTab.id, updatedContent);
      }
    }
    
    // 移除 diff 预览
    // 可以通过更新消息状态来实现
  } catch (error) {
    console.error('应用编辑失败:', error);
    // 显示错误提示
  }
};

const handleRejectEdit = async (diffAreaId: string) => {
  try {
    await invoke('reject_all_diffs', {
      diffAreaId,
    });
    
    // 移除 diff 预览
    // 编辑器内容保持不变
  } catch (error) {
    console.error('拒绝编辑失败:', error);
  }
};
```

## 7. Tauri Commands 实现

### 7.1 新增 Commands

```rust
// src-tauri/src/commands/editor_commands.rs

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct EditorContent {
    pub file_path: String,
    pub content: String,
    pub line_count: usize,
}

#[tauri::command]
pub async fn get_current_editor_content(
    state: State<'_, Arc<Mutex<EditCodeService>>>,
) -> Result<EditorContent, String> {
    // 注意：这里需要前端主动传递编辑器内容
    // 或者通过事件系统请求前端
    // 临时方案：返回错误，要求前端传递
    Err("请在前端传递当前编辑器内容".to_string())
}

#[tauri::command]
pub async fn accept_all_diffs(
    diff_area_id: String,
    state: State<'_, Arc<Mutex<EditCodeService>>>,
) -> Result<EditorContent, String> {
    let mut service = state.lock().unwrap();
    let final_content = service.accept_all_diffs(&diff_area_id)?;
    
    // 获取文件路径
    let diff_area = service.get_diff_area(&diff_area_id)
        .ok_or_else(|| "DiffArea 不存在".to_string())?;
    
    Ok(EditorContent {
        file_path: diff_area.uri.clone(),
        content: final_content,
        line_count: final_content.lines().count(),
    })
}

#[tauri::command]
pub async fn reject_all_diffs(
    diff_area_id: String,
    state: State<'_, Arc<Mutex<EditCodeService>>>,
) -> Result<(), String> {
    let mut service = state.lock().unwrap();
    service.reject_all_diffs(&diff_area_id)?;
    Ok(())
}

#[tauri::command]
pub async fn accept_diff(
    diff_id: String,
    state: State<'_, Arc<Mutex<EditCodeService>>>,
) -> Result<EditorContent, String> {
    let mut service = state.lock().unwrap();
    let final_content = service.accept_diff(&diff_id)?;
    
    // 获取文件路径
    let diff = service.get_diff(&diff_id)
        .ok_or_else(|| "Diff 不存在".to_string())?;
    let diff_area = service.get_diff_area(&diff.diff_area_id)
        .ok_or_else(|| "DiffArea 不存在".to_string())?;
    
    Ok(EditorContent {
        file_path: diff_area.uri.clone(),
        content: final_content,
        line_count: final_content.lines().count(),
    })
}

#[tauri::command]
pub async fn get_diff_final_content(
    diff_area_id: String,
    state: State<'_, Arc<Mutex<EditCodeService>>>,
) -> Result<String, String> {
    let service = state.lock().unwrap();
    service.get_diff_final_content(&diff_area_id)
}
```

### 7.2 注册 Commands

```rust
// src-tauri/src/main.rs 或 lib.rs

use crate::commands::editor_commands;
use crate::services::edit_code_service::EditCodeService;
use std::sync::{Arc, Mutex};

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(EditCodeService::new())))
        .invoke_handler(tauri::generate_handler![
            // ... 现有 commands ...
            editor_commands::get_current_editor_content,
            editor_commands::accept_all_diffs,
            editor_commands::reject_all_diffs,
            editor_commands::accept_diff,
            editor_commands::get_diff_final_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 8. 错误处理和边界情况

### 8.1 错误处理

#### 后端错误处理

```rust
// src-tauri/src/services/edit_code_service.rs

impl EditCodeService {
    pub fn accept_all_diffs(
        &mut self,
        diff_area_id: &str,
    ) -> Result<String, String> {
        // 检查 DiffArea 是否存在
        let diff_area = self.diff_areas.get_mut(diff_area_id)
            .ok_or_else(|| format!("DiffArea {} 不存在", diff_area_id))?;
        
        // 检查是否有 diffs
        if diff_area.diffs.is_empty() {
            return Err("没有可接受的变更".to_string());
        }
        
        // 检查文件是否仍然打开
        // 这里可以添加额外的验证
        
        // 应用变更
        // ... 实现逻辑 ...
    }
    
    pub fn accept_diff(
        &mut self,
        diff_id: &str,
    ) -> Result<String, String> {
        // 检查 Diff 是否存在
        let diff = self.diffs.get(diff_id)
            .ok_or_else(|| format!("Diff {} 不存在", diff_id))?;
        
        // 检查 DiffArea 是否存在
        let diff_area = self.diff_areas.get_mut(&diff.diff_area_id)
            .ok_or_else(|| format!("DiffArea {} 不存在", diff.diff_area_id))?;
        
        // 检查 diff 是否属于该 diff_area
        if !diff_area.diffs.contains_key(diff_id) {
            return Err("Diff 不属于该 DiffArea".to_string());
        }
        
        // 应用变更
        // ... 实现逻辑 ...
    }
}
```

#### 前端错误处理

```typescript
// src/components/Chat/ChatMessages.tsx

const handleConfirmEdit = async (
  diffAreaId: string,
  level: 'paragraph' | 'document' | 'all',
  paragraphId?: string,
) => {
  try {
    // ... 实现逻辑 ...
  } catch (error) {
    console.error('应用编辑失败:', error);
    
    // 显示用户友好的错误提示
    const errorMessage = error instanceof Error 
      ? error.message 
      : '应用编辑时发生未知错误';
    
    // 可以使用 toast 或 notification 显示错误
    // toast.error(errorMessage);
    
    // 或者更新 UI 状态显示错误
    setError(errorMessage);
  }
};
```

### 8.2 边界情况处理

#### 情况 1：编辑器内容已更改

**问题**：用户在 AI 生成编辑后，手动修改了编辑器内容。

**处理方案**：
```rust
// 在应用编辑前，检查编辑器内容是否与 original_code 匹配
pub fn validate_diff_area(
    &self,
    diff_area_id: &str,
    current_content: &str,
) -> Result<bool, String> {
    let diff_area = self.diff_areas.get(diff_area_id)
        .ok_or_else(|| "DiffArea 不存在".to_string())?;
    
    // 检查当前内容是否与 original_code 匹配（允许部分差异）
    // 如果差异太大，返回错误
    let similarity = calculate_similarity(&diff_area.original_code, current_content);
    
    if similarity < 0.8 {
        return Err("编辑器内容已发生较大变化，无法应用编辑".to_string());
    }
    
    Ok(true)
}
```

#### 情况 2：文件已关闭

**问题**：用户在 AI 生成编辑后，关闭了文件。

**处理方案**：
```typescript
// 前端检查
const handleConfirmEdit = async (...) => {
  const { getActiveTab } = useEditorStore.getState();
  const activeTab = getActiveTab();
  
  if (!activeTab) {
    throw new Error('编辑器已关闭，无法应用编辑');
  }
  
  if (activeTab.filePath !== filePath) {
    throw new Error('当前打开的文件不匹配');
  }
  
  // ... 继续处理 ...
};
```

#### 情况 3：并发编辑

**问题**：多个 AI 请求同时尝试编辑同一文件。

**处理方案**：
```rust
// 使用锁机制防止并发编辑
use std::sync::Mutex;

pub struct EditCodeService {
    // ... 现有字段 ...
    editing_locks: HashMap<String, Mutex<()>>, // uri -> lock
}

impl EditCodeService {
    pub fn create_diff_zone(
        &mut self,
        uri: &str,
        original_code: &str,
        diffs: Vec<Diff>,
    ) -> Result<String, String> {
        // 检查是否已有编辑在进行
        if let Some(lock) = self.editing_locks.get(uri) {
            if lock.try_lock().is_err() {
                return Err("该文件正在被编辑，请稍后再试".to_string());
            }
        }
        
        // 创建锁
        let lock = Mutex::new(());
        self.editing_locks.insert(uri.to_string(), lock);
        
        // ... 创建 diff_zone ...
    }
    
    pub fn accept_all_diffs(
        &mut self,
        diff_area_id: &str,
    ) -> Result<String, String> {
        let diff_area = self.diff_areas.get(diff_area_id)
            .ok_or_else(|| "DiffArea 不存在".to_string())?;
        
        // 释放锁
        self.editing_locks.remove(&diff_area.uri);
        
        // ... 应用变更 ...
    }
}
```

#### 情况 4：大文件处理

**问题**：文件很大，diff 计算和应用可能很慢。

**处理方案**：
```rust
// 1. 限制 diff 大小
const MAX_DIFF_SIZE: usize = 10000; // 10KB

pub fn calculate_diff(
    &self,
    old_content: &str,
    new_content: &str,
) -> Result<Vec<Diff>, String> {
    // 检查内容大小
    if old_content.len() > MAX_DIFF_SIZE || new_content.len() > MAX_DIFF_SIZE {
        return Err("文件过大，请分段编辑".to_string());
    }
    
    // ... 计算 diff ...
}

// 2. 异步处理
pub async fn calculate_diff_async(
    &self,
    old_content: String,
    new_content: String,
) -> Result<Vec<Diff>, String> {
    // 在后台线程计算
    tokio::task::spawn_blocking(move || {
        // ... 计算 diff ...
    }).await.map_err(|e| format!("计算 diff 失败: {}", e))?
}
```

## 9. 性能优化

### 9.1 Diff 计算优化

```rust
// 使用更高效的 diff 算法
use similar::{ChangeTag, TextDiff};

pub fn calculate_diff_fast(
    &self,
    old_content: &str,
    new_content: &str,
) -> Result<Vec<Diff>, String> {
    let diff = TextDiff::from_lines(old_content, new_content);
    
    let mut diffs = Vec::new();
    let mut old_line = 1;
    let mut new_line = 1;
    
    for (idx, group) in diff.grouped_ops(3).iter().enumerate() {
        for op in group {
            match op.tag() {
                ChangeTag::Equal => {
                    // 无变化
                    old_line += op.old_len();
                    new_line += op.new_len();
                }
                ChangeTag::Delete => {
                    // 删除
                    let original_code = old_content
                        .lines()
                        .skip(old_line - 1)
                        .take(op.old_len())
                        .collect::<Vec<_>>()
                        .join("\n");
                    
                    diffs.push(Diff {
                        diff_type: DiffType::Deletion,
                        original_code,
                        original_start_line: old_line,
                        original_end_line: old_line + op.old_len() - 1,
                        new_code: String::new(),
                        start_line: new_line,
                        end_line: new_line,
                    });
                    
                    old_line += op.old_len();
                }
                ChangeTag::Insert => {
                    // 插入
                    let new_code = new_content
                        .lines()
                        .skip(new_line - 1)
                        .take(op.new_len())
                        .collect::<Vec<_>>()
                        .join("\n");
                    
                    diffs.push(Diff {
                        diff_type: DiffType::Insertion,
                        original_code: String::new(),
                        original_start_line: old_line,
                        original_end_line: old_line,
                        new_code,
                        start_line: new_line,
                        end_line: new_line + op.new_len() - 1,
                    });
                    
                    new_line += op.new_len();
                }
                ChangeTag::Replace => {
                    // 替换
                    let original_code = old_content
                        .lines()
                        .skip(old_line - 1)
                        .take(op.old_len())
                        .collect::<Vec<_>>()
                        .join("\n");
                    
                    let new_code = new_content
                        .lines()
                        .skip(new_line - 1)
                        .take(op.new_len())
                        .collect::<Vec<_>>()
                        .join("\n");
                    
                    diffs.push(Diff {
                        diff_type: DiffType::Edit,
                        original_code,
                        original_start_line: old_line,
                        original_end_line: old_line + op.old_len() - 1,
                        new_code,
                        start_line: new_line,
                        end_line: new_line + op.new_len() - 1,
                    });
                    
                    old_line += op.old_len();
                    new_line += op.new_len();
                }
            }
        }
    }
    
    Ok(diffs)
}
```

### 9.2 前端渲染优化

```typescript
// 使用 React.memo 和 useMemo 优化渲染
import React, { useMemo } from 'react';

export const DocumentDiffView: React.FC<DocumentDiffViewProps> = React.memo(({
  diffAreaId,
  oldContent,
  newContent,
  filePath,
  diffs,
  onConfirm,
  onReject,
}) => {
  // 使用 useMemo 缓存计算结果
  const diffSummary = useMemo(() => {
    const editCount = diffs.filter(d => d.type === 'edit').length;
    const insertCount = diffs.filter(d => d.type === 'insertion').length;
    const deleteCount = diffs.filter(d => d.type === 'deletion').length;
    return { editCount, insertCount, deleteCount };
  }, [diffs]);
  
  // ... 渲染逻辑 ...
}, (prevProps, nextProps) => {
  // 自定义比较函数，避免不必要的重渲染
  return prevProps.diffAreaId === nextProps.diffAreaId &&
         prevProps.oldContent === nextProps.oldContent &&
         prevProps.newContent === nextProps.newContent;
});
```

### 9.3 虚拟滚动（大文件）

```typescript
// 对于大量 diffs，使用虚拟滚动
import { useVirtualizer } from '@tanstack/react-virtual';

export const DocumentDiffView: React.FC<DocumentDiffViewProps> = ({
  diffs,
  // ... 其他 props
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: diffs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // 估计每个 diff 的高度
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} className="h-96 overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const diff = diffs[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderDiff(diff)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

## 10. 实施计划

### 10.1 阶段一：基础功能（MVP）

**目标**：实现基本的文档编辑功能

1. **后端实现**
   - [ ] 创建 `EditCodeService` 基础结构
   - [ ] 实现 `DiffService` 的 diff 计算
   - [ ] 实现 `edit_current_editor_document` 工具，获取当前编辑器内容
   - [ ] 实现 `accept_all_diffs` 和 `reject_all_diffs` commands
   - [ ] 添加 Tauri commands 注册

2. **前端实现**
   - [ ] 更新 `edit_current_editor_document` 工具调用，传递当前编辑器内容
   - [ ] 完善 `DocumentDiffView` 组件，使用后端返回的 diffs
   - [ ] 实现 `handleConfirmEdit` 和 `handleRejectEdit` 函数
   - [ ] 实现编辑器内容更新逻辑

3. **测试**
   - [ ] 测试基本编辑流程
   - [ ] 测试错误处理
   - [ ] 测试边界情况

**预计时间**：2-3 天

### 10.2 阶段二：增强功能

**目标**：完善用户体验和稳定性

**实施顺序**：

1. **创建 EditCodeService**（2-3 小时）
   - [ ] 创建 `src-tauri/src/services/edit_code_service.rs`
   - [ ] 实现 `DiffArea` 和 `Diff` 管理
   - [ ] 在 `src-tauri/src/main.rs` 中注册为 Tauri State

2. **实现 Tauri Commands**（2-3 小时）
   - [ ] 创建 `src-tauri/src/commands/editor_commands.rs`
   - [ ] 实现 `accept_all_diffs`、`reject_all_diffs`、`accept_diff`、`get_diff_final_content`
   - [ ] 在 `main.rs` 中注册 Commands

3. **实现单个 diff 接受/拒绝**（2-3 小时）
   - [ ] 更新前端 `handleConfirmEdit` 支持部分接受
   - [ ] 更新 `DocumentDiffView` 支持单个 diff 操作

4. **添加错误处理和边界情况**（2-3 小时）
   - [ ] 编辑器内容验证（防止内容已更改）
   - [ ] 并发编辑保护（使用 `Arc<Mutex<>>`）
   - [ ] 大文件处理（限制大小、异步处理）

5. **UI/UX 改进**（2-3 小时）
   - [ ] 添加加载状态
   - [ ] 添加成功/失败提示（toast）
   - [ ] 优化响应式布局

**预计时间**：2-3 天

### 10.3 阶段三：高级功能（可选）

**目标**：实现类似 Void 的高级功能

1. **流式传输支持**
   - [ ] 实现流式编辑（实时显示 AI 生成的内容）
   - [ ] 添加扫描效果
   - [ ] 支持中断流式传输

2. **撤销/重做支持**
   - [ ] 集成编辑器撤销系统
   - [ ] 支持编辑历史快照

3. **部分接受**
   - [ ] 支持按段落接受/拒绝
   - [ ] 支持按行接受/拒绝

**预计时间**：3-5 天

## 11. 关键技术点

### 11.1 编辑器内容获取方案

**方案 A：前端主动传递（推荐）**

优点：
- 实现简单
- 实时性好
- 不需要额外的状态同步

实现：
```typescript
// 在工具调用时，前端自动添加当前编辑器内容
const { getActiveTab } = useEditorStore.getState();
const activeTab = getActiveTab();
const currentContent = activeTab?.content || '';

// 在 AI 调用工具时，拦截并增强参数
if (toolCall.name === 'edit_current_editor_document') {
  toolCall.arguments = {
    ...toolCall.arguments,
    current_file: activeTab?.filePath,
    current_content: currentContent,
  };
}
```

**方案 B：后端通过事件请求**

优点：
- 解耦前端和后端
- 后端可以主动获取

缺点：
- 需要事件系统
- 可能有延迟

实现：
```rust
// 后端发送事件请求前端内容
app_handle.emit("request-editor-content", ())?;

// 前端监听事件并返回
listen("request-editor-content", (event) => {
  const content = getCurrentEditorContent();
  emit("editor-content-response", content);
});
```

**推荐**：使用方案 A，简单直接。

### 11.2 Diff 计算库选择

**选项 1：使用 `diff` crate（Rust）**

```toml
[dependencies]
diff = "0.1"
```

优点：
- 轻量级
- 简单易用

缺点：
- 功能有限
- 性能一般

**选项 2：使用 `similar` crate（推荐）**

```toml
[dependencies]
similar = "2.4"
```

优点：
- 功能强大
- 性能优秀
- 支持多种 diff 算法

缺点：
- 依赖较大

**推荐**：使用 `similar` crate，性能更好。

### 11.3 编辑器更新方案

**方案 A：直接更新 EditorStore**

```typescript
const { getActiveTab, updateTabContent } = useEditorStore.getState();
const activeTab = getActiveTab();
if (activeTab) {
  updateTabContent(activeTab.id, newContent);
}
```

优点：
- 简单直接
- 立即生效

**方案 B：通过 Tauri Event**

```rust
// 后端发送事件
app_handle.emit("update-editor-content", UpdateEditorContentEvent {
  file_path: file_path.clone(),
  content: new_content.clone(),
})?;
```

```typescript
// 前端监听事件
listen("update-editor-content", (event) => {
  const { file_path, content } = event.payload;
  const { getActiveTab, updateTabContent } = useEditorStore.getState();
  const activeTab = getActiveTab();
  if (activeTab && activeTab.filePath === file_path) {
    updateTabContent(activeTab.id, content);
  }
});
```

优点：
- 解耦后端和前端
- 支持多窗口

**推荐**：使用方案 A，简单直接。如果需要支持多窗口，再考虑方案 B。

## 12. 测试方案

### 12.1 单元测试

#### 后端测试

```rust
// src-tauri/src/services/edit_code_service.rs

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_create_diff_zone() {
        let mut service = EditCodeService::new();
        let original = "line1\nline2\nline3";
        let new = "line1\nline2_modified\nline3";
        
        let diffs = vec![/* ... */];
        let diff_area_id = service.create_diff_zone("test.txt", original, diffs).unwrap();
        
        assert!(service.diff_areas.contains_key(&diff_area_id));
    }
    
    #[test]
    fn test_accept_all_diffs() {
        // ... 测试接受所有 diffs ...
    }
    
    #[test]
    fn test_reject_all_diffs() {
        // ... 测试拒绝所有 diffs ...
    }
}
```

#### 前端测试

```typescript
// src/components/Chat/__tests__/DocumentDiffView.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentDiffView } from '../DocumentDiffView';

describe('DocumentDiffView', () => {
  it('should render diff preview', () => {
    const diffs = [{
      diffId: '1',
      type: 'edit',
      originalCode: 'old',
      newCode: 'new',
      // ... 其他字段
    }];
    
    render(
      <DocumentDiffView
        diffAreaId="area1"
        oldContent="old"
        newContent="new"
        filePath="test.txt"
        diffs={diffs}
        onConfirm={jest.fn()}
        onReject={jest.fn()}
      />
    );
    
    expect(screen.getByText('文档编辑预览: test.txt')).toBeInTheDocument();
  });
  
  it('should call onConfirm when accept button is clicked', () => {
    const onConfirm = jest.fn();
    // ... 测试逻辑 ...
  });
});
```

### 12.2 集成测试

```typescript
// 测试完整流程
describe('Document Edit Flow', () => {
  it('should complete edit flow', async () => {
    // 1. 打开文件
    // 2. AI 调用 edit_current_editor_document
    // 3. 显示 diff 预览
    // 4. 用户点击接受
    // 5. 编辑器内容更新
    // 6. 验证结果
  });
});
```

## 13. 与 Void 的对比总结

### 13.1 相同点

1. **核心概念**：都使用 DiffArea 和 Diff 来管理编辑
2. **工作流程**：获取内容 → 计算 diff → 显示预览 → 用户确认 → 应用变更
3. **用户体验**：清晰的视觉反馈，支持接受/拒绝

### 13.2 差异点

| 特性 | Void | Binder |
|------|------|--------|
| **流式传输** | ✅ 支持实时流式编辑 | ❌ 暂不支持（可选） |
| **编辑器集成** | Monaco Editor（深度集成） | TipTap（需要适配） |
| **撤销支持** | ✅ 完整支持 | ⚠️ 需要实现 |
| **并发编辑** | ✅ 支持 | ⚠️ 需要实现 |
| **部分接受** | ✅ 支持 | ⚠️ 需要实现 |
| **架构** | 单进程（VSCode） | 前后端分离（Tauri） |

### 13.3 Binder 的优势

1. **更简单的架构**：不需要处理 VSCode 的复杂性
2. **更灵活的编辑器**：可以自定义编辑器行为
3. **更好的性能**：Rust 后端性能更好

### 13.4 Binder 的挑战

1. **前后端通信**：需要处理 Tauri 的异步通信
2. **状态同步**：需要保持前后端状态一致
3. **编辑器集成**：TipTap 与 Monaco Editor 不同，需要适配

## 14. 实施检查清单

### 14.1 后端检查清单

- [ ] 创建 `EditCodeService` 服务
- [ ] 创建 `DiffService` 服务
- [ ] 实现 `edit_current_editor_document` 工具
- [ ] 实现 `get_current_editor_content` command（如果需要）
- [ ] 实现 `accept_all_diffs` command
- [ ] 实现 `reject_all_diffs` command
- [ ] 实现 `accept_diff` command
- [ ] 实现 `get_diff_final_content` command
- [ ] 添加错误处理
- [ ] 添加边界情况处理
- [ ] 添加单元测试

### 14.2 前端检查清单

- [ ] 更新工具调用逻辑，传递当前编辑器内容
- [ ] 完善 `DocumentDiffView` 组件
- [ ] 实现 `handleConfirmEdit` 函数
- [ ] 实现 `handleRejectEdit` 函数
- [ ] 实现编辑器内容更新逻辑
- [ ] 添加加载状态
- [ ] 添加错误提示
- [ ] 添加成功提示
- [ ] 优化 UI/UX
- [ ] 添加单元测试

### 14.3 集成检查清单

- [ ] 测试完整编辑流程
- [ ] 测试错误处理
- [ ] 测试边界情况
- [ ] 测试性能（大文件）
- [ ] 测试并发编辑
- [ ] 测试撤销/重做（如果实现）

## 15. 总结

本文档基于 Void 的文档编辑实现，为 Binder 设计了完整的文档编辑功能方案。方案考虑了 Binder 与 Void 的差异，提供了：

1. **完整的架构设计**：包括数据结构、服务设计、工作流程
2. **详细的实现方案**：包括后端 Rust 实现和前端 TypeScript 实现
3. **错误处理和边界情况**：确保系统稳定性
4. **性能优化建议**：确保良好的用户体验
5. **实施计划**：分阶段实施，逐步完善

### 15.1 核心要点

1. **编辑器内容获取**：推荐前端主动传递，简单直接
2. **Diff 计算**：使用 `similar` crate，性能优秀
3. **编辑器更新**：直接更新 EditorStore，立即生效
4. **错误处理**：完善的错误处理和用户提示
5. **边界情况**：处理内容已更改、文件已关闭、并发编辑等情况

### 15.2 下一步行动

1. **立即开始**：实施阶段一（基础功能）
2. **逐步完善**：根据用户反馈，实施阶段二和阶段三
3. **持续优化**：根据实际使用情况，优化性能和用户体验

### 15.3 参考资源

- **Void 实现**：`void/src/vs/workbench/contrib/void/browser/editCodeService.ts`
- **Diff 算法**：`similar` crate 文档
- **Tauri 通信**：Tauri 官方文档

---

**文档版本**：v1.0  
**最后更新**：2025-12-29  
**作者**：AI Assistant  
**审核状态**：待审核