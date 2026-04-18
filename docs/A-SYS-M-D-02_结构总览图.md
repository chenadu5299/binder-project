# 结构总览图

## 文档头

- 结构编码：`SYS-M-D-02`
- 文档属性：`运行时地图 / 结构层`
- 生成依据：代码事实
- 主索引：`A-SYS-M-D-01_当前实现运行时逻辑地图总览.md`
- 术语来源：`A-CORE-C-D-02_产品术语边界.md`

---

## 一、应用级结构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Binder 桌面应用（Tauri 2）                        │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     前端（React 18 + Vite）                         │  │
│  │                                                                   │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │  FileTree  │  │  EditorPanel │  │       ChatPanel          │  │  │
│  │  │            │  │              │  │                          │  │  │
│  │  │ 文件树展示  │  │ TipTap 编辑器 │  │  ChatInput / ChatMessages│  │  │
│  │  │ workspace  │  │ 标签页管理   │  │  DiffCard / ToolCallCard │  │  │
│  │  │ 路径感知   │  │ diff 装饰层  │  │  DiffAllActionsBar       │  │  │
│  │  └─────┬──────┘  └──────┬───────┘  └──────────┬───────────────┘  │  │
│  │        │                │                       │                  │  │
│  │  ┌─────▼────────────────▼───────────────────────▼───────────────┐  │  │
│  │  │                    Zustand Stores                             │  │  │
│  │  │                                                               │  │  │
│  │  │  fileStore   editorStore   chatStore   diffStore              │  │  │
│  │  │  agentStore  referenceStore layoutStore themeStore            │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                    前端 Services                              │  │  │
│  │  │                                                               │  │  │
│  │  │  DiffActionService   AgentTaskController   DiffRetryController│  │  │
│  │  │  documentService     memoryService         timelineService   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────┬──────────────────────────────────────┘  │
│                                │ Tauri invoke() / emit()                 │
│  ┌─────────────────────────────▼────────────────────────────────────┐  │
│  │                    后端（Rust + Tauri 2）                           │  │
│  │                                                                   │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Commands 层（薄封装）                        │  │  │
│  │  │                                                               │  │  │
│  │  │  ai_commands    file_commands    workspace_commands           │  │  │
│  │  │  knowledge_commands  memory_commands  tool_commands           │  │  │
│  │  └────────────────────────┬─────────────────────────────────────┘  │  │
│  │                            │                                        │  │
│  │  ┌─────────────────────────▼────────────────────────────────────┐  │  │
│  │  │                    Services 层（业务逻辑）                       │  │  │
│  │  │                                                               │  │  │
│  │  │  context_manager    tool_service      ai_service              │  │  │
│  │  │  pandoc_service     loop_detector     task_progress_analyzer  │  │  │
│  │  │  positioning_resolver  stage_transition_guard                 │  │  │
│  │  │  ai_providers（DeepSeek / OpenAI）                            │  │  │
│  │  └────────────────────────┬─────────────────────────────────────┘  │  │
│  │                            │                                        │  │
│  │  ┌─────────────────────────▼────────────────────────────────────┐  │  │
│  │  │                    Workspace 层                                │  │  │
│  │  │                                                               │  │  │
│  │  │  workspace_db（SQLite）    diff_engine    canonical_html      │  │  │
│  │  │  canonical_service        timeline_support                   │  │  │
│  │  └────────────────────────┬─────────────────────────────────────┘  │  │
│  └─────────────────────────────┴────────────────────────────────────┘  │
│                                │                                         │
│  ┌─────────────────────────────▼────────────────────────────────────┐  │
│  │                     存储层                                          │  │
│  │                                                                   │  │
│  │  .binder/workspace.db（SQLite）                                   │  │
│  │    ├── file_cache（文件 canonical HTML 缓存）                       │  │
│  │    ├── pending_diffs（未确认 workspace diff）                       │  │
│  │    ├── agent_tasks / agent_artifacts                               │  │
│  │    ├── timeline_nodes / timeline_restore_payloads                 │  │
│  │    └── file_dependencies                                          │  │
│  │                                                                   │  │
│  │  .binder/memories.db（SQLite，记忆库）                               │  │
│  │  .binder/search.db（SQLite，全文检索）                               │  │
│  │  文件系统（工作区 path）                                              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  外部工具：Pandoc（DOCX↔HTML 转换）、LibreOffice（预览，可选）             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、模块级结构

### 2.1 前端模块结构

```
src/
├── components/
│   ├── Chat/                          【主链模块】
│   │   ├── ChatPanel.tsx              — 右侧 AI 面板容器；流式事件监听；addContentBlock/appendToMessage
│   │   ├── ChatInput.tsx              — 用户输入；@mention 创建；sendMessage 触发
│   │   ├── ChatMessages.tsx           — 消息列表渲染；contentBlocks/toolCalls 双路径
│   │   ├── DiffCard.tsx               — 编辑器 diff 展示（byTab 路径）
│   │   ├── DiffAllActionsBar.tsx      — 批量 accept/reject（跨 scope）
│   │   ├── ToolCallCard.tsx           — 旧消息工具调用展示【兼容模块】
│   │   ├── FileDiffCard.tsx           — workspace diff 展示（byFilePath 路径）
│   │   ├── ToolCallSummary.tsx        — contentBlocks 路径非编辑工具摘要
│   │   ├── AuthorizationCard.tsx      — 需授权工具的确认 UI
│   │   ├── AgentShadowStateSummary.tsx — Agent runtime 状态展示；workflow 旁路控制【风险模块】
│   │   ├── WorkPlanCard.tsx           — 工作计划卡片【兼容模块 / 非正式 agent plan 主链】
│   │   └── ...
│   │
│   ├── Editor/                        【主链模块】
│   │   ├── EditorPanel.tsx            — 编辑器容器；mtime 监听；外部修改检测
│   │   ├── PendingDiffPanel.tsx       — workspace diff 待确认面板（byFilePath 聚合）
│   │   └── ...（TipTap 扩展、InlineAssist 等）
│   │
│   ├── FileTree/                      【主链模块】
│   │   └── FileTree.tsx               — 文件树；workspace 路径感知
│   │
│   └── Layout/                        【基础模块】
│       └── MainLayout.tsx             — 面板布局；onCloseRequested（pending diff 守卫）
│
├── stores/
│   ├── chatStore.ts                   【主链 / 核心状态】
│   ├── diffStore.ts                   【主链 / 核心状态】
│   ├── agentStore.ts                  【主链 / Agent 状态】
│   ├── editorStore.ts                 【主链 / 编辑器状态】
│   ├── fileStore.ts                   【主链 / 工作区状态】
│   ├── referenceStore.ts              【主链 / 引用状态】
│   ├── chatBuildStore.ts              【非主链 / ChatBuild 功能】
│   ├── layoutStore.ts                 【基础模块】
│   ├── themeStore.ts                  【基础模块】
│   └── timelineStore.ts              【非主链 / 时间轴 UI 状态】
│
└── services/
    ├── DiffActionService.ts           【主链 / Diff 操作唯一入口】
    ├── AgentTaskController.ts         【主链 / Agent stage 推进唯一入口】
    ├── DiffRetryController.ts         【主链 / Diff 重试管理】
    ├── documentService.ts             【主链 / 文档打开保存】
    ├── agentTaskPersistence.ts        【主链 / task 持久化】
    ├── memoryService.ts               【支撑模块】
    ├── fileService.ts                 【支撑模块】
    └── timelineService.ts             【非主链 / 时间轴操作】
```

### 2.2 后端模块结构

```
src-tauri/src/
├── commands/                          【薄封装层 / 主链模块】
│   ├── ai_commands.rs                 — ai_chat_stream / ai_autocomplete / ai_inline_assist
│   ├── file_commands.rs               — 文件 CRUD；open_docx_for_edit；read_file_content
│   ├── workspace_commands.rs          — ※ 实际在 workspace/ 子目录（见下）
│   ├── knowledge_commands.rs          — 知识库检索
│   ├── memory_commands.rs             — 记忆库操作
│   ├── tool_commands.rs               — execute_tool_with_retry（授权门）
│   ├── classifier_commands.rs         — 文件类型分类
│   ├── positioning_snapshot.rs        — 快照管理
│   ├── search_commands.rs             — 全文检索
│   └── template_commands.rs           — 模板与 workflow
│
├── services/                          【业务逻辑层 / 主链模块】
│   ├── context_manager.rs             — 4+层 prompt 构建（governance/task/fact/constraint/augmentation/knowledge）
│   ├── tool_service.rs                — 所有工具执行；edit_current_editor_document；update_file
│   ├── ai_service.rs                  — AI provider 工厂与注册
│   ├── positioning_resolver.rs        — 文档定位（blockId + offset → ProseMirror position）
│   ├── loop_detector.rs               — 工具调用循环检测【风险：硬编码关键词，绕过容易】
│   ├── task_progress_analyzer.rs      — 任务进度分析（DocumentEdit/MultiDocumentEdit/…）
│   ├── stage_transition_guard.rs      — stage 推进守卫【覆盖范围待验证】
│   ├── pandoc_service.rs              — DOCX↔HTML 转换（外部进程）
│   ├── memory_service.rs              — 记忆库读写
│   ├── search_service.rs              — 全文检索
│   ├── file_system.rs                 — 原子写文件
│   ├── file_watcher.rs                — 文件 mtime 监听
│   ├── reply_completeness_checker.rs  — 回复完整性检查
│   ├── stream_state.rs                — 流式状态跟踪
│   ├── ai_providers/
│   │   ├── deepseek.rs                【主链 / 实现完整 tool-calling】
│   │   └── openai.rs                  【⚠️ 关键缺陷：tool-calling 完全失效】
│   └── knowledge/                     — 知识库相关服务
│
└── workspace/                         【Workspace 层 / 主链模块】
    ├── workspace_db.rs                — SQLite CRUD；file_cache/pending_diffs/timeline/agent_tasks
    ├── workspace_commands.rs          — Tauri 命令：open_file_with_cache / accept_file_diffs…
    ├── diff_engine.rs                 — 行/段级 diff 生成（update_file 路径使用）
    ├── canonical_html.rs              — canonical HTML 生成（blockId 注入）
    ├── canonical_service.rs           — 缓存同步去重
    └── timeline_support.rs            — 时间轴节点记录与还原
```

---

## 三、关键模块接口点

### 3.1 chatStore → 后端

| 接口 | 调用方式 | 传入关键字段 | 返回/事件 |
|------|----------|-------------|-----------|
| `ai_chat_stream` | `invoke()` | `tabId`, `messages`, `modelConfig`, `enableTools`, `workspacePath`, `currentFile`, `currentEditorContent`, `references`, `selectedText`, `documentRevision`, `baselineId`, `agentTaskId` | 流式 `"ai-chat-stream"` 事件 |
| `ai_inline_assist` | `invoke()` | `instruction`, `text`, `context`, `messages` | `Result<String>` |
| `ai_autocomplete` | `invoke()` | `contextBefore`, `contextAfter`, `position`, `editorState` | `Result<Vec<String>>` |
| `open_file_with_cache` | `invoke()` | `workspacePath`, `filePath` | `OpenFileResult`（含 `content`, `pendingDiffs`, `routeScene`） |
| `accept_file_diffs` / `reject_file_diffs` | `invoke()` | `workspacePath`, `filePath`, `diffIndices` | `Result<()>` |
| `sync_workspace_file_cache_after_save` | `invoke()` | `workspacePath`, `filePath`, `content` | `Result<()>` |

### 3.2 diffStore ↔ 前端 Services

| 调用方 | 接口 | 方向 |
|--------|------|------|
| `DiffActionService.acceptDiff` | `diffStore.buildAcceptReadRow` + `acceptDiff` | 读写 byTab |
| `DiffActionService.acceptAll` | `diffStore.buildAcceptReadRow` + `compareAcceptWriteOrder` + `acceptDiff` | 批量写 byTab |
| `DiffActionService.acceptFileDiffs` | `diffStore.acceptFileDiffs` → `invoke('accept_file_diffs')` | 写 byFilePath → 后端 |
| `AgentTaskController.checkAndAdvanceStage` | `diffStore.byTab`（查询） | 只读 |
| `AgentTaskController.checkAndAdvanceStage` | `agentStore.setStageState / setConfirmation / setCurrentTask` | 写 agentStore |

### 3.3 模块边界：哪些可以直接互访，哪些必须经过中间层

```
合法访问路径：
  UI 组件 → DiffActionService → diffStore（写）
  UI 组件 → diffStore（读，via selector）
  UI 组件 → chatStore.sendMessage
  DiffActionService → AgentTaskController → agentStore（写）

存在越权的访问路径（当前代码实际存在）：
  ChatMessages.tsx → agentStore.setStageState（直接写，越过 AgentTaskController）
  ToolCallCard.tsx → diffStore.removeFileDiffEntry（直接写，越过 DiffActionService）
  AgentShadowStateSummary.tsx → agentStore.setWorkflowExecution（直接写）
  DiffAllActionsBar.tsx → editorStore.updateTabContent（重复调用）
```

---

## 四、Tauri IPC 边界

```
前端（TypeScript）                    后端（Rust）
─────────────────────────────────────────────────────
invoke('ai_chat_stream', {...})   →   ai_commands::ai_chat_stream
                                  ←   emit("ai-chat-stream", {chunk/tool_call/done})

invoke('open_file_with_cache')    →   workspace_commands::open_file_with_cache
invoke('accept_file_diffs')       →   workspace_commands::accept_file_diffs
invoke('execute_tool_with_retry') →   tool_commands::execute_tool_with_retry（授权门）
invoke('sync_workspace_file_cache_after_save') → workspace_commands::sync_workspace_file_cache_after_save
```

**IPC 注意点**：
- 所有跨进程调用为异步；前端无法感知后端内部异步状态，只能等 Promise resolve 或监听 event
- `ai-chat-stream` 是**单向推送**；cancel 通过 `ai_cancel_chat_stream` invoke 触发（设置 cancel token）
- `save` 操作与 `sync_workspace_file_cache_after_save` 之间无互斥锁，存在竞态风险（已知问题）

---

## 五、存储层结构

### 5.1 workspace.db 表结构（当前版本 Schema v8）

| 表名 | 核心字段 | 用途 |
|------|---------|------|
| `file_cache` | `file_path`, `file_type`, `cached_content`, `content_hash`, `mtime`, `workspace_path` | canonical HTML 缓存；blockId 跨会话保持 |
| `pending_diffs` | `file_path`, `diff_index`, `original_text`, `new_text`, `para_index`, `diff_type`, `status` | workspace 文件 AI diff 暂存（`update_file` 路径写入） |
| `agent_tasks` | `id`, `chat_tab_id`, `goal`, `lifecycle`, `stage`, `stage_reason` | agent task 持久化 |
| `agent_artifacts` | `id`, `task_id`, `kind`, `status`, `summary` | agent 工件 |
| `timeline_nodes` | `node_id`, `node_type`, `operation_type`, `impact_scope`, `actor`, `restorable` | 时间轴节点 |
| `timeline_restore_payloads` | `payload_id`, `payload_kind`, `payload_json` | 时间轴还原载荷 |
| `file_dependencies` | (跨文件关联) | context_manager 注入依赖信息用 |

### 5.2 存储访问路径

| 路径 | 写入时机 | 读取时机 |
|------|---------|---------|
| `file_cache` 写入 | `sync_workspace_file_cache_after_save`（每次 save 后）；`open_docx_for_edit` 时 | `open_file_with_cache` 时（mtime 校验） |
| `pending_diffs` 写入 | `update_file` 工具执行且 `use_diff=true` | `open_file_with_cache` 返回；前端 `byFilePath` 初始化 |
| `pending_diffs` 删除 | `accept_file_diffs`（逆序写盘）；`reject_file_diffs` | — |

---

## 六、主链/兼容/旧残留模块标记

| 模块 | 分类 | 说明 |
|------|------|------|
| `ChatMessages.tsx` → contentBlocks 渲染路径 | **主链** | 当前新消息走此路径 |
| `ChatMessages.tsx` → toolCalls 渲染路径 | **兼容链** | 旧消息展示；`ToolCallCard` |
| `ToolCallCard.tsx`（edit_current_editor_document 部分） | **废弃但仍存在** | 已禁用（显示"旧版预览已禁用"），代码未删 |
| `DiffActionService.ts` | **主链** | 所有 diff 操作唯一合法入口 |
| `AgentTaskController.ts` | **主链** | stage_complete / invalidated 唯一合法推进主体 |
| `WorkPlanCard.tsx` | **兼容链** | 注释明确"不接正式 plan 主链" |
| `GhostTextExtension.ts` | **历史残留** | 待 Phase 1a AutoCompletePopover 实装后删除 |
| `DiffHighlightExtension.ts` | **历史残留** | 待 DiffDecorationExtension 完成后删除 |
| `openai.rs` (tool-calling 部分) | **已知缺陷 / 实际失效** | tool 参数被忽略，未实现 |
| `loop_detector.rs` 语义检测 | **弱保护链** | 硬编码关键词，可轻易绕过 |
| `stage_transition_guard.rs` | **覆盖范围未验证** | 后端有此服务，与前端 AgentTaskController 的关系待审计 |
