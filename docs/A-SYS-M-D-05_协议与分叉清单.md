# 协议与分叉清单

## 文档头

- 结构编码：`SYS-M-D-05`
- 文档属性：`运行时地图 / 协议与分叉层`
- 生成依据：代码事实
- 主索引：`A-SYS-M-D-01_当前实现运行时逻辑地图总览.md`
- 术语来源：`A-CORE-C-D-02_产品术语边界.md`

---

## 一、协议对象清单

### 1.1 `ChatMessage`（前端消息对象）

- **来源**：前端定义，`src/stores/chatStore.ts`
- **主定义**：`chatStore.ts` 内联类型
- **生产位置**：`chatStore.addMessage`（用户消息）；`chatStore.addMessage { isLoading:true }`（占位助手消息）；流式事件处理（ChatPanel.tsx）
- **消费位置**：`ChatMessages.tsx` 渲染；`sendMessage` 构建 `messages` 数组发给后端

| 字段 | 类型 | 必填 | 状态 |
|------|------|------|------|
| `id` | `string` | 是 | 主链 |
| `role` | `'user' \| 'assistant' \| 'system'` | 是 | 主链；**无 `tool` 值** |
| `content` | `string` | 是 | 主链 |
| `timestamp` | `number` | 是 | 主链 |
| `displayNodes` | `DisplayNode[]` | 否 | 主链（用户消息 @引用展示） |
| `displayContent` | `string` | 否 | `@deprecated`（优先 `displayNodes`） |
| `isLoading` | `boolean` | 否 | 主链（流式占位） |
| `contentBlocks` | `MessageContentBlock[]` | 否 | **新路径主链** |
| `toolCalls` | `ToolCall[]` | 否 | **旧路径兼容链** |
| `knowledgeInjectionSlices` | `KnowledgeInjectionSlice[]` | 否 | 知识增强附属 |
| `knowledgeQueryWarnings` | `KnowledgeQueryWarning[]` | 否 | 知识增强附属 |
| `knowledgeQueryMetadata` | `KnowledgeQueryMetadata \| null` | 否 | 知识增强附属 |
| `knowledgeDecisionReason` | `string \| null` | 否 | 知识增强附属 |

**已知污染点**：
- `contentBlocks` 和 `toolCalls` 可同时存在于同一消息；渲染逻辑以 `contentBlocks?.length > 0` 判断优先，但未强制互斥
- 无 `role: 'tool'` 值，后端多轮 history 中的 `role:"tool"` 消息不在前端 `ChatMessage` 中存储，前端 history 重建时存在缺口

---

### 1.2 `DiffEntry`（编辑器 diff 对象，byTab 路径）

- **来源**：前端定义，`src/stores/diffStore.ts`
- **主定义**：`diffStore.ts`
- **生产位置**：后端 `tool_service.rs::resolve()` 生成，通过 `ToolResult.data.diffs[]` 传至前端，前端 `diffStore.addDiff(filePath, entry)` 写入
- **消费位置**：`DiffCard.tsx` 渲染；`DiffActionService` 操作；`AgentTaskController` 查询

| 字段 | 类型 | 必填 | 状态 |
|------|------|------|------|
| `diffId` | `string`（UUID v4） | 是 | 主链 |
| `startBlockId` | `string` | 是 | 主链（定位） |
| `endBlockId` | `string` | 是 | 主链（定位） |
| `startOffset` | `number` | 是 | 主链（定位） |
| `endOffset` | `number` | 是 | 主链（定位） |
| `originalText` | `string` | 是 | 主链（验证用） |
| `newText` | `string` | 是 | 主链 |
| `type` | `'replace' \| 'delete' \| 'insert'` | 是 | 主链 |
| `status` | `DiffEntryStatus` | 是 | 主链 |
| `diffType` | `string`（`precise \| block_level \| document_level`） | 否 | 主链（定位精度标记） |
| `positioningPath` | `'Anchor' \| 'Resolver' \| 'Legacy'` | 否 | 主链（定位路径追踪） |
| `toolCallId` | `string` | 否 | 主链（关联消息） |
| `chatTabId` | `string` | 否 | 主链（Agent 关联） |
| `agentTaskId` | `string` | 否 | 主链（Agent 关联） |
| `messageId` | `string` | 否 | 主链（关联消息） |
| `acceptedAt` | `number` | 否 | accept 后写入 |
| `createdAt` | `number` | 否 | 创建时间 |
| `documentRevision` | `number` | 否 | 版本守卫 |
| `contentSnapshotHash` | `string` | 否 | 内容快照哈希守卫 |
| `blockOrderSnapshotHash` | `string` | 否 | 块顺序快照哈希守卫 |
| `expireReason` | `DiffExpireReason` | 否 | 失效原因 |
| `executionExposure` | `ExecutionExposure` | 否 | 执行异常暴露（重试用） |
| `occurrenceIndex` | `number` | 否 | 多处匹配选第几处 |
| `batchVersion` | `number` | 否 | 批次版本 |
| `reviewConfirmed` | `boolean` | 否 | 审查确认标记 |
| `mappedFrom` / `mappedTo` | `number` | 否 | ProseMirror 位置映射结果 |
| `acceptedFrom` / `acceptedTo` | `number` | 否 | accept 后写入的 PM 位置 |
| `sourceLabel` | `string` | 否 | 来源展示标签 |
| `fileDiffIndex` | `number` | 否 | 关联 byFilePath 条目索引 |

**已知污染点**：
- `positioningPath` 值 `'Legacy'` 源自设计文档中 Anchor/Resolver/Legacy 三路径概念，但后端代码实际只有单一 `resolve()` 入口，无独立 Legacy 函数；该字段实际标记为历史标记，可能与实际执行路径不完全对应

---

### 1.3 `FileDiffEntry`（workspace diff 对象，byFilePath 路径）

- **来源**：前端定义，`src/stores/diffStore.ts`
- **生产位置**：后端 `tool_service::update_file` → `workspace_db.insert_pending_diffs`，通过 `ToolResult.data.pending_diffs[]` 传至前端，`diffStore.setFilePathDiffs(fp, entries)` 写入
- **消费位置**：`FileDiffCard.tsx`；`ToolCallCard.tsx`；`PendingDiffPanel.tsx`；`AgentTaskController.hasFileDiffsForAgentTask`

| 字段 | 类型 | 必填 | 备注 |
|------|------|------|------|
| `original_text` | `string` | 是 | **下划线命名**（区别于 DiffEntry 驼峰） |
| `new_text` | `string` | 是 | 下划线命名 |
| `diff_index` | `number` | 是 | workspace_db 中的行 index |
| `para_index` | `number` | 是 | 段落/行索引（行级精度，低于块级） |
| `agentTaskId` | `string` | 否 | Agent 关联 |
| `chatTabId` | `string` | 否 | Chat tab 关联 |
| `messageId` | `string` | 否 | 消息关联 |

**无 `status` 字段**：条目存在 = pending；删除 = resolved（accept 或 reject）

**已知污染点**：
- 字段命名风格与 `DiffEntry` 不统一（下划线 vs 驼峰）
- 无 `diffId`，无法用 `DiffRetryController` 机制重试
- `para_index` 精度低于 `startBlockId/startOffset`；两套 diff 池定位精度不一致

---

### 1.4 `ToolResult`（后端工具执行结果）

- **来源**：后端定义，`src-tauri/src/services/tool_service.rs`
- **生产位置**：`execute_tool()` 返回；通过 `emit("ai-chat-stream", {tool_call, result})` 传至前端
- **消费位置**：`ChatPanel.tsx` 解析并写入 `contentBlocks`；`ToolCallCard.tsx`（旧路径）

```rust
pub struct ToolResult {
  pub success: bool,
  pub data: Option<serde_json::Value>,  // 工具特定数据
  pub error: Option<String>,
  pub message: Option<String>,
  pub error_kind: Option<ToolErrorKind>,
  pub display_error: Option<String>,
  pub meta: Option<ToolResultMeta>,
}
```

**`data` 字段语义（按工具）**：

| 工具 | `data` 内容 | 关键字段 |
|------|-------------|---------|
| `edit_current_editor_document` 成功 | `{new_content, diffs[], diff_area_id, no_op}` | `new_content` = **当前 HTML（非修改后）**；`diffs[0].newText` = 实际修改 |
| `edit_current_editor_document` 失败 | `{error_code, execution_exposure, ...}` | `error_code` 供重试判断 |
| `update_file` use_diff=true | `{written: false, pending_diffs[]}` | `pending_diffs` = FileDiffEntry 数组 |
| `update_file` use_diff=false | `{written: true}` | 直接写盘 |
| `read_file` | `{content: string}` | — |
| `list_files` | `{files: []}` | — |

**已知污染点**：
- `edit_current_editor_document` 的 `new_content` = 当前 HTML（即传入的 `current_content`），**不是应用 diff 后的 HTML**；实际修改内容在 `diffs[0].newText`；消费方必须区分这两个字段

---

### 1.5 `ai_chat_stream` 调用参数（前→后协议）

- **生产位置**：`chatStore.sendMessage` → `invoke('ai_chat_stream', {...})`
- **消费位置**：`ai_commands.rs::ai_chat_stream`

| 参数 | 类型 | 必填 | 含义 |
|------|------|------|------|
| `tabId` | `string` | 是 | 前端 chat tab id（后端用于 emit 路由） |
| `messages` | `ChatMessage[]` | 是 | 历史消息（已过滤 NEXT_ACTION/TOOL_RESULTS） |
| `modelConfig` | `ModelConfig` | 是 | 模型参数 |
| `enableTools` | `boolean` | 是 | agent 模式且有工作区时为 true |
| `workspacePath` | `string \| null` | 否 | 工作区路径 |
| `currentFile` | `string \| null` | 否 | 当前文件路径 |
| `currentFileExplicitlyReferenced` | `boolean` | 否 | 是否显式引用当前文件 |
| `selectedText` | `string \| null` | 否 | 编辑器选区文本 |
| `currentEditorContent` | `string \| null` | 否 | 当前文档 HTML（= `positioningCtx.L`） |
| `references` | `Reference[]` | 否 | 引用列表 |
| `primaryEditTarget` | `string \| null` | 否 | 主编辑目标文件路径 |
| `documentRevision` | `number` | 否 | 文档修订版本号 |
| `baselineId` | `string \| null` | 否 | baseline 标识 |
| `editorTabId` | `string \| null` | 否 | 编辑器 tab id |
| `selectionStartBlockId` | `string \| null` | 否 | 选区起始 blockId |
| `selectionEndBlockId` | `string \| null` | 否 | 选区终止 blockId |
| `selectionStartOffset` | `number \| null` | 否 | 选区起始偏移 |
| `selectionEndOffset` | `number \| null` | 否 | 选区终止偏移 |
| `cursorBlockId` | `string \| null` | 否 | 光标所在 blockId |
| `cursorOffset` | `number \| null` | 否 | 光标偏移 |
| `agentTaskId` | `string \| null` | 否 | 当前 agent task id |

**已知污染点**：
- `messages` 通过字符串前缀（`[NEXT_ACTION]`/`[TOOL_RESULTS]`）过滤内部消息，依赖脆弱；模型若生成含此前缀的内容会被误判为内部消息

---

### 1.6 `pending_diffs` 数据库表条目

- **来源**：后端 `workspace_db.rs` `PendingDiffEntry`
- **生产位置**：`tool_service::update_file` → `workspace_db.insert_pending_diffs`
- **消费位置**：`workspace_commands::open_file_with_cache` 返回；`accept_file_diffs` 逆序写盘；`reject_file_diffs` 删除

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | `i64` | 自增主键 |
| `file_path` | `String` | 文件路径 |
| `diff_index` | `i32` | 条目索引（`accept_file_diffs` 逆序依据） |
| `original_text` | `String` | 原文（用于冲突检测） |
| `new_text` | `String` | 新文 |
| `para_index` | `i32` | 段落索引（行级定位） |
| `diff_type` | `String` | diff 类型 |
| `status` | `String` | 当前状态（数据库级） |
| `created_at` | `i64` | 创建时间戳 |

---

### 1.7 `OpenFileResult`（open_file_with_cache 返回结构）

- **来源**：后端 `workspace_commands.rs`
- **消费位置**：前端 `documentService.ts` → `editorStore.addTab`

| 字段 | 含义 |
|------|------|
| `content` | canonical HTML（含 data-block-id） |
| `pending_diffs` | `PendingDiffDto[]`（当前文件的 pending workspace diffs） |
| `gates` | `NonCurrentFileGates`（target_file_resolved, canonical_loaded, block_map_ready, context_injected） |
| `route_scene` | 场景标记 `4/5/6`（对应统一方案场景分类） |
| `injected_block_ws` | md/txt 是否发生了后端 block-ws 注入 |

---

## 二、分叉链清单

### 2.1 `edit_current_editor_document` vs `update_file`

| 维度 | `edit_current_editor_document` | `update_file` |
|------|-------------------------------|--------------|
| **适用场景** | 文件已在编辑器中打开 | 未打开文件，或强制写盘 |
| **diff 存储** | 不写 workspace_db；通过 ToolResult 返回给前端 | 写 workspace_db.pending_diffs（use_diff=true） |
| **diff 精度** | 块级（startBlockId + offset） | 行/段级（para_index） |
| **写盘时机** | 用户 accept → 应用到编辑器 DOM（不自动写盘） | 用户 accept_file_diffs → 后端逆序写盘 |
| **前端 diff 池** | `byTab`（以 filePath 为键） | `byFilePath` |
| **UI 展示** | DiffCard（contentBlocks 路径）或 ToolCallCard（旧路径） | FileDiffCard / ToolCallCard |
| **状态推进** | AgentTaskController.checkAndAdvanceStage | AgentTaskController.handleFileDiffResolution |
| **是否为主链** | 是（已打开文档） | 是（未打开文档） |
| **分叉入口** | `tool_service.rs` match 分支 | `tool_service.rs` match 分支 |
| **风险** | AI 错误选择此工具作用于未打开文件时，编辑器状态与文件不同步 | AI 错误选择此工具作用于已打开文件时，编辑器 DOM 不更新，产生展示分叉 |

**分叉是否合理**：是（两种场景确实需要不同路径）。  
**是否应收口**：不应合并，但应在工具选择决策层（AI prompt）明确区分。

---

### 2.2 `byTab` vs `byFilePath` 两套 diff 池

| 维度 | `byTab`（实际为 byFilePath） | `byFilePath` |
|------|----------------------------|-------------|
| **存储内容** | `DiffEntry`（含完整状态字段） | `FileDiffEntry`（无状态字段） |
| **来源工具** | `edit_current_editor_document` | `update_file` |
| **pending 判断** | `entry.status === 'pending'` | 条目存在即为 pending |
| **accept 路径** | `DiffActionService.acceptDiff → applyDiffReplaceInEditor` | `DiffActionService.acceptFileDiffs → invoke('accept_file_diffs')` |
| **reject 路径** | `DiffActionService.rejectDiff → diffStore.rejectDiff` | `DiffActionService.rejectFileDiffs → diffStore.rejectFileDiffs` |
| **Agent 推进** | `AgentTaskController.checkAndAdvanceStage` | `AgentTaskController.handleFileDiffResolution` |
| **字段命名** | 驼峰（`originalText`） | 下划线（`original_text`） |
| **是否为主链** | 是 | 是 |

**分叉是否合理**：部分合理（两套不同精度的 diff 来源）。  
**收口方向**：统一字段命名风格；`AgentTaskController` 已处理两路合并裁决，但 `hasFileDiffsForAgentTask` 轮询机制需确保与 `getAllDiffsForAgentTask` 同步更新。

---

### 2.3 `contentBlocks` vs `toolCalls` 双路径渲染

| 维度 | `contentBlocks`（新路径） | `toolCalls`（旧路径） |
|------|--------------------------|---------------------|
| **触发条件** | `message.contentBlocks?.length > 0` | `!message.contentBlocks && message.toolCalls?.length > 0` |
| **工具展示组件** | `ToolCallSummary`（非编辑工具） + `DiffCard`（编辑工具） | `ToolCallCard` |
| **授权卡片** | `AuthorizationCard` | 无（ToolCallCard 内处理） |
| **DiffCard 触发** | `edit_current_editor_document` 且 `getDisplayDiffs` 非空 | `update_file` 且 result 含 `pending_diffs` |
| **状态展示** | 按 timestamp 排序，diff_area_id 去重 | 无去重 |
| **是否为主链** | 是（新消息走此路径） | 兼容链（旧消息展示） |
| **edit_current_editor_document UI** | DiffCard（完整接受/拒绝/重试） | **已禁用**（显示"旧版预览已禁用"） |

**分叉是否合理**：历史包袱，不合理继续并存。  
**收口方向**：Phase 1 完成后废弃 `toolCalls` 路径；`ToolCallCard` 中 `edit_current_editor_document` 代码可直接删除。

---

### 2.4 `ChatMessages` vs `ToolCallCard` vs `PendingDiffPanel` 展示分叉

| 组件 | 展示来源 | diff 类型 | accept/reject 路径 |
|------|---------|-----------|-------------------|
| `ChatMessages` → `DiffCard` | contentBlocks 工具结果 | byTab DiffEntry | DiffActionService.acceptDiff |
| `ToolCallCard` → `DiffCard` | toolCalls 旧消息（update_file + pending_diffs） | byFilePath FileDiffEntry → resolve 后为 byTab DiffEntry | DiffActionService.acceptDiff + acceptFileDiffs |
| `ToolCallCard` → `FileDiffCard` | toolCalls 旧消息（未 resolve 的 byFilePath） | byFilePath FileDiffEntry | DiffActionService.acceptFileDiffs；diffStore.removeFileDiffEntry |
| `PendingDiffPanel` | byFilePath 聚合 | byFilePath FileDiffEntry | DiffActionService.acceptFileDiffs / rejectFileDiffs |
| `DiffAllActionsBar` | byTab + byFilePath（按 scope） | 两套 | 两套 |

**分叉是否合理**：部分合理（不同入口面向不同场景）。  
**风险**：同一文件的 diff 可能同时出现在 ToolCallCard 和 PendingDiffPanel 中，造成重复展示或重复操作。

---

### 2.5 引用注入 vs 编辑器选区注入

| 维度 | 引用注入 | 编辑器选区注入 |
|------|---------|--------------|
| **来源** | `referenceStore.getReferences(tabId)` | `editorStore` 选区/光标 |
| **注入层** | context_manager L5 constraint | ai_chat_stream 参数直接传（`selectedText`、选区 blockId 锚点） |
| **精度** | 引用对象级（可含内容） | 字符级（selectedText + blockId + offset） |
| **零搜索回退** | TextReference 四元组可作为零搜索输入 | 光标 blockId 注入 |
| **是否为主链** | 两者均是 | 两者均是 |

**风险**：两路注入在同一请求中共存，context_manager 需去重/优先级处理。

---

### 2.6 当前文档事实层 vs workspace 文档层 vs 知识增强

（已在 A-SYS-M-D-04 §三.四描述，此处补充分叉标记）

| 层 | 注入方式 | 优先级 | 是否参与 diff 定位 |
|---|---------|--------|-----------------|
| 当前文档事实层 | `currentEditorContent`, `selectedText`, blockId 锚点（直接参数） | 最高 | 是 |
| workspace 文档层 | context_manager L4 fact（`pending_diffs 列表`、`file_dependencies`） | 中 | 否（仅事实描述） |
| 知识增强层 | context_manager L6/L7（`memory_context`、`knowledge_injection_slices`） | 最低 | 否 |

---

### 2.7 AgentTaskController 正式推进 vs ChatMessages UI 旁路推进

| 维度 | AgentTaskController 推进 | ChatMessages useEffect 旁路 |
|------|--------------------------|---------------------------|
| **触发时机** | diff accept/reject 后（DiffActionService 调用） | streaming 结束后，检测 stageState + 消息内容 |
| **推进目标** | `stage_complete` / `invalidated` | `review_ready`（candidate_ready → review_ready） |
| **写入位置** | `agentStore.setStageState` / `setConfirmation` / `setCurrentTask` | `agentStore.setStageState` / `setConfirmation` |
| **是否合法** | 是（唯一合法主体） | **否（越权）** |
| **风险** | 无 | 可能在 diff 未就绪时推进；可能与 AgentTaskController 写入冲突 |

---

### 2.8 新 `contentBlocks` 路径 vs 旧 `toolCalls` 路径（消息内容块）

此条与 2.3 重叠，见 2.3 详细描述。核心分叉标记：

- `contentBlocks`：**主链**，新消息
- `toolCalls`：**兼容链**，旧消息；`edit_current_editor_document` 部分已禁用但代码保留

---

### 2.9 Shadow runtime vs 业务状态主真源

| 维度 | Shadow runtime | 业务状态主真源 |
|------|----------------|--------------|
| **存储** | `agentStore.runtimesByTab`（内存） | `workspace_db.agent_tasks`（SQLite） |
| **持久化** | 不持久化（session 结束清空） | `persistAgentTask` 异步写入 |
| **数据内容** | task record + stageState + verification + confirmation + artifacts + workflowExecution | task lifecycle + stage + stage_reason |
| **推进主体** | `AgentTaskController`（正式路径）+ `ChatMessages` useEffect（越权路径） | `agentTaskPersistence.ts` 调 invoke 写入 |
| **投影关系** | shadow runtime 的 stage/confirmation 投影给 UI 展示 | workspace_db 记录历史任务 |
| **失同步风险** | app 重启后 shadow runtime 清空；重新加载时 `loadTasksFromDb` 恢复 `active` 任务 | workspace_db 存的是快照，不含 streaming 中间状态 |

---

### 2.10 `[NEXT_ACTION]` / `[TOOL_RESULTS]` 内部消息 vs 真实 user 消息

| 类型 | 标识 | 写入方 | 过滤方 | 风险 |
|------|------|--------|--------|------|
| `[NEXT_ACTION]` 编排消息 | 内容以 `"[NEXT_ACTION]\n"` 开头 | `ai_commands.rs` 多轮编排 | `chatStore.sendMessage`（构建 messages 时过滤）；`ai_commands.rs::is_internal_orchestration_user_message` | 依赖字符串前缀，脆弱 |
| `[TOOL_RESULTS]` 历史格式 | 内容以 `"[TOOL_RESULTS]"` 开头 | 历史版本（已不作为新消息写入） | 同上 | 历史兼容标识仍存在于过滤逻辑中 |
| 真实 user 消息 | 无特殊前缀 | `chatStore.sendMessage` | `find_last_real_user_message` 跳过内部消息 | — |

---

## 三、废弃但仍在运行中被调用的逻辑

| 逻辑 | 位置 | 废弃原因 | 实际状态 |
|------|------|---------|---------|
| `ToolCallCard` 的 `edit_current_editor_document` UI | `ToolCallCard.tsx` | 旧版展示逻辑，已被 contentBlocks + DiffCard 路径替代 | **代码保留，运行时显示"已禁用"提示，不执行实际操作** |
| `WorkPlanCard` 的 Agent plan 确认流程 | `ChatMessages.tsx` + `WorkPlanCard.tsx` | Phase 1 后不接正式 Agent plan 主链 | **代码保留，仍渲染，通过 sendMessage 确认消息推进** |
| `GhostTextExtension.ts` | `src/` TipTap 扩展 | 将被 AutoCompletePopover 替代 | Phase 1a 前仍活跃 |
| `DiffHighlightExtension.ts` | `src/` TipTap 扩展 | 将被 DiffDecorationExtension 替代 | 待迁移 |
| `displayContent` 字段（`ChatMessage`） | `chatStore.ts` | `@deprecated`，优先 `displayNodes` | 代码保留，部分路径仍可写入 |
| `[TOOL_RESULTS]` 字符串过滤 | `ai_commands.rs` / `chatStore.sendMessage` | 旧格式已不使用，但过滤逻辑仍存在 | 兼容保留 |
| `TruncationStrategy::SummarizeMiddle / KeepTaskGoal / LayeredPriority` | `context_manager.rs` | 实现回退到 `truncate_messages(_, 10)` | 已定义未真正实现 |

---

## 四、伪闭环链登记

### 4.1 `WorkPlanCard` 确认伪闭环

```
ChatMessages 检测到 WorkPlan 内容
→ 渲染 WorkPlanCard
→ 用户点击"开始执行"
→ chatStore.sendMessage(tabId, '好的，开始执行')
→ AI 收到确认消息，开始执行工具

⚠️ 闭环问题：
- 这是用户消息触发的新一轮对话，不是 AgentTask 状态机的正式确认路径
- AgentTask 的 confirmation 状态与此流程无直接关联
- 如果 WorkPlanCard 已渲染但 AgentTask 未创建（chat 模式），发送消息不会创建 AgentTask
```

### 4.2 `loop_detector` 伪保护链

```
ai_chat_stream 每轮工具结果 → LoopDetector.detect_content_repetition
→ 检测到重复 → 停止继续

⚠️ 伪闭环问题：
- 仅检测完整文本相同 或 硬编码中文关键词
- 任何微小参数变化（如文件名不同）重置计数器
- max_force_continue_retries = 5，但 tool_call 层无独立的 per-round 上限
- LoopDetector 只是软性保护，任何变化均可绕过
```

### 4.3 `expirePendingForStaleRevision` 可能误 expire

```
DiffAllActionsBar.acceptAll
→ applyDiffReplaceInEditor
→ updateTabContent(editor.getHTML())
→ editorStore.documentRevision++
→ diffStore.expirePendingForStaleRevision(fp, newRevision)
→ 其他 pending diff（documentRevision != newRevision）→ expired

⚠️ 潜在问题：
- acceptAll 批量接受时，每次 acceptDiff 内都调用 updateTabContent（documentRevision++）
- 但 DiffAllActionsBar 的 acceptAll 流程最后也调 updateTabContent
- 多次 revision++ 可能将其他 pending diff 标记为 stale 而提前 expire
- 实际影响需代码级审计 acceptAll 与单条 acceptDiff 的 revision 更新时序
```
