# A-DE-M-D-02 对话编辑当前实现逻辑全检

## 文档头信息

| 项 | 内容 |
|----|------|
| **本次检查范围** | 前端：`chatStore.ts`、`ChatPanel.tsx`、`ChatMessages.tsx`、`ToolCallCard.tsx`、`DiffActionService.ts`、`diffStore.ts`、`agentStore.ts`、`AgentTaskController.ts`、`DiffAllActionsBar.tsx`、`PendingDiffPanel.tsx`、`DiffCard.tsx`、`FileDiffCard.tsx`、`applyDiffReplaceInEditor.ts`、`DiffDecorationExtension.ts`、`referenceHelpers.ts`、`referenceProtocolAdapter.ts`、`anchorFromSelection.ts`、`unopenedDocumentDiffRuntime.ts`、`editToolTabResolve.ts`、`requestContext.ts`、`diffFormatAdapter.ts`、`DiffRetryController.ts`、`editorStore.ts`、`TipTapEditor.tsx`、`EditorPanel.tsx`；后端：`tool_service.rs`（`edit_current_editor_document` / `update_file`）、`ai_commands.rs`（invoke 边界）、`context_manager.rs`（prompt 注入）、`workspace_commands.rs`（`accept_file_diffs` / `reject_file_diffs` / `sync_workspace_file_cache_after_save`）、`workspace_db.rs`（`insert_pending_diffs` / pending 查询）、`diff_engine.rs`（pending diff 生成）；对照文档仅作自洽性核对，**不作为事实源**。 |
| **代码事实来源** | 上述文件在仓库中的当前实现（以检查时的 `src/`、`src-tauri/src/` 为准）。 |
| **是否扩展上下游** | 是：已追踪 `documentService.openFile`、`timelineService.invalidateForFilePaths`、`MainLayout` 关闭确认、`editorOffsetUtils`/`blockRangeToPMRange` 与 `diffStore` 的耦合。 |
| **是否发现结构性并行逻辑** | **是**：当前文档编辑（块级 + `byTab`）与未打开/工作区路径（`para_index` + `workspace_db.pending_diffs` + `byFilePath` → resolve → `byTab`）为两条并行主链；消息展示上 `contentBlocks` 与 `toolCalls` 并存。 |
| **是否发现文档与实现不一致** | **是**：部分设计文档仍描述「唯一收口」「旧路径已移除」等，与代码中仍存在的双池、兼容层、禁用 UI 分支、以及 `new_content` 语义等不完全一致（见 §9）。 |

---

## 1. 总结论

**一句话结论（明确、不模糊）：**

- **当前对话编辑不存在单一、端到端唯一的「一条主链」**：已实现的是 **两条可并行存在的业务主链**——(A) 已打开文档 + `edit_current_editor_document` → 前端 `diffStore.byTab`；(B) `update_file(use_diff)` → Rust `workspace_db.pending_diffs` + 前端 `diffStore.byFilePath` → `resolveFilePathDiffs` 映射入 `byTab`（`toolCallId` 形如 `workspace-pending:...`）。两条链在 **存储容器、坐标系、写盘路径** 上均不同。
- **仍存在并行逻辑**：是（见 §7）。
- **仍存在旧逻辑/兼容逻辑参与主状态写入**：是——例如持久化聊天重放时 `toolCalls` 路径仍会 `ingestUpdateFileToolCall`；`ToolCallCard` 旧格式 `update_file` 仅摘要不写入 store，但 **hydration 仍会从 `toolCalls` 再灌入**；`chatStore` 同时维护 `toolCalls` 与 `contentBlocks` 双结构。
- **当前问题性质**：**结构性未收口为主**（双轨模型 + 双池 + 多写入者 + 展示/应用同源需人工对齐），局部为 **实现细节风险**（如 `diffStore.acceptAll`/`acceptAllByDiffIds` 无调用方、`convertLegacyDiffsToEntriesWithFallback` 名存实亡等）。

---

## 2. 全链路总表

| 动作名 | 入口函数/组件 | 主要调用链 | 状态读写对象 | 分类 | 是否仍参与正式主链 | 风险等级 |
|--------|---------------|------------|--------------|------|-------------------|----------|
| 发送消息时当前文档感知 | `chatStore.sendMessage` | `determineInjectionEditorTab` → `buildPositioningRequestContext` → `setPositioningRequestContextForChat`；`currentEditorContent`/`documentRevision` 来自 `positioningCtx` | `requestContext` 模块 Map；`editorStore` 读；`diffStore.setBaseline` | **主逻辑** | 是 | 中（injection 与 active 不一致时的选区规则已代码化） |
| 发送消息时选区注入 | `chatStore.sendMessage` | `lastActiveSelection` 或 `editor.state.selection` → `createAnchorFromSelection` → `ai_chat_stream` 参数 | `editorStore.lastActiveSelection`；IPC payload | **主逻辑** | 是 | 中 |
| 引用注入 | `chatStore.sendMessage` | `referenceStore.getReferences` → `buildReferencesForProtocol` → `references` | `referenceStore` 读；IPC | **主逻辑** | 是 | 低 |
| Prompt 构建 | `context_manager.rs` `build_multi_layer_prompt` 等 | 四层 prompt + `RetrievalContext` | 后端内存 | **主逻辑** | 是 | 低（与工具执行正交） |
| 模型工具参数生成 | 各 Provider / `tool_service` 执行前 | `ToolCall` + 注入字段 | IPC | **主逻辑** | 是 | 中 |
| 当前文档编辑 resolve | `tool_service::edit_current_editor_document` | `validate_edit_params` → `resolve(resolver_input)` → 规范 `diffs[]`；**不写** `workspace_db.pending_diffs` | 工具结果 JSON | **主逻辑** | 是 | 中 |
| 未打开文档编辑 resolve | `tool_service::update_file` + 前端 `resolveFilePathDiffs` | `diff_engine::generate_pending_diffs_for_file_type` → `insert_pending_diffs` → 前端 `setFilePathDiffs` → `findBlockByParaIndexAndText` / `findBlockByFuzzyNormalizedText` → `setDiffsForToolCall` | `workspace_db`；`diffStore.byFilePath` + `byTab` | **主逻辑（链 B）** | 是 | **高**（para_index ↔ block 映射与 fuzzy fallback） |
| diff 构造 | 后端 `resolve` / `diff_engine`；前端 `convertLegacyDiffsToEntries` | 见上 | `DiffEntry` / `FileDiffEntry` | **主逻辑** | 是 | 中 |
| diff 存储 | `ChatPanel` 流式回调 / `UnopenedDocumentDiffRuntime.ingest*` | `setDiffsForToolCall` / `setFilePathDiffs` | `diffStore.byTab` / `byFilePath` | **主逻辑** | 是 | **高**（双池） |
| diff 渲染 | `ChatMessages.renderContentBlock`；`DiffDecorationExtension` | `getDisplayDiffs` / `resolvePendingDiffRange` | `diffStore` 读；装饰层 | **附属逻辑（展示）** + **主链反馈** | 是 | 中 |
| 历史消息水合 | `UnopenedDocumentDiffRuntime.hydrateFromChatStore` | `ingestUpdateFileToolCall`（contentBlocks 与 toolCalls 两条） | `diffStore` 写 | **兼容逻辑 + 主链入口** | 是 | **高**（全量 subscribe 重放） |
| accept single（编辑器） | `DiffActionService.acceptDiff` | `buildAcceptReadRow` → `applyDiffReplaceInEditor` → `acceptDiff` → `checkAndAdvanceStage` | `diffStore`；`editorStore.updateTabContent` | **主逻辑** | 是 | 中 |
| accept single（工作区已 resolve） | `UnopenedDocumentDiffRuntime.acceptResolvedDiff` | `DiffActionService.acceptResolvedDiffCard` | `byTab` + `accept_file_diffs` IPC | **主逻辑** | 是 | **高**（编辑器应用 + DB 删行顺序） |
| accept all | `DiffAllActionsBar` | `DiffActionService.acceptAll`（byTab）+ `acceptFileDiffs`（整文件 byFilePath） | 同上 | **主逻辑** | 是 | **高** |
| reject single | `DiffActionService.rejectDiff` / `rejectResolvedDiffCard` / `rejectFileDiffEntry` | `rejectDiff` / `removeFileDiffEntry` / `reject_file_diffs` | `diffStore`；IPC | **主逻辑** | 是 | 中 |
| reject all | `DiffAllActionsBar` | 循环 `rejectDiff` + `rejectFileDiffs` | 同上 | **主逻辑** | 是 | 中 |
| stage 推进 | `AgentTaskController` | `bootstrapTaskAfterUserMessage` / `notifyCandidateReady` / `notifyDiffsReady` / `syncBackendStageState` / `checkAndAdvanceStage` / `handleFileDiffResolution` | `agentStore` | **主逻辑** | 是 | **高**（与双池裁决耦合） |
| confirmation / verification 更新 | `agent_state` 工厂 + `markVerificationFailed` / `reconcileVerificationAfterSuccess` | 见 `AgentTaskController`、`DiffActionService`、`diffStore.markExpired` 等 | `agentStore` | **主逻辑** | 是 | 中 |
| 外部同步 / 文档重建 / stale | `EditorPanel` 外部修改；`TipTapEditor` `invalidateDocRangesForFile`；`editorStore.updateTabContent` → `expirePendingForStaleRevision` | `markExpired` / `invalidateDocRangesForFile` / `expirePendingForStaleRevision` | `diffStore`；`editorStore` | **主逻辑（失效）** | 是 | **高** |
| 审阅高亮 | `DiffDecorationExtension` | `pending` 红删；`accepted` 绿底 | `diffStore` | **附属逻辑** | 是 | 中（扩展内 `updateDiff` 见 §4） |
| 写盘接受 | `workspace_commands::accept_file_diffs` | `apply_diffs_to_content` → 写文件 → `delete_pending_diffs` → `upsert_file_cache` | `workspace_db`；磁盘 | **主逻辑（链 B 写盘）** | 是 | **高** |
| DB pending_diffs 读/清理 | `workspace_db` + `accept_file_diffs` / `reject_file_diffs` | SQL | SQLite | **主逻辑** | 是 | 中 |

---

## 3. 分类清单

### 3.1 主逻辑

| # | 代码位置 | 触发条件 | 输入 | 输出 | 写入状态 | 为何判为主逻辑 |
|---|----------|----------|------|------|----------|------------------|
| M1 | `chatStore.sendMessage` | 用户发送（Agent 需工作区） | 文本、`validRefIds`、`displayNodes` | `invoke('ai_chat_stream', …)` | `agentStore` shadow task；`setBaseline`；`setPositioningRequestContextForChat` | 对话编辑上下文真源在此建立 |
| M2 | `ChatPanel` 流式 `tool_call` 处理 | `edit_current_editor_document` 成功且含 `diff_area_id`+`diffs` | 工具结果 JSON | `setDiffsForToolCall` + `notifyDiffsReady` | `diffStore.byTab`；驱动 stage | 当前打开文档编辑结果唯一入口（与 ChatMessages 展示配对） |
| M3 | `ChatPanel` + `UnopenedDocumentDiffRuntime.ingestUpdateFileToolCall` | `update_file` 成功且含 `pending_diffs` | 工具结果 | `setFilePathDiffs`；条件 `resolveFilePathDiffs` | `byFilePath`；可能 `byTab` | 未打开文件/工作区 pending 主入口 |
| M4 | `tool_service::edit_current_editor_document` | 工具被调用 | `current_file`/`current_content`/模型参数 | `ToolResult.data`（`old_content`/`new_content` 相同；`diffs` 为真变更） | 无 DB pending | 后端块级 resolve 唯一实现 |
| M5 | `tool_service::update_file` + `diff_engine::generate_pending_diffs_for_file_type` | `use_diff` 真 | 新旧内容 | `insert_pending_diffs` | `workspace_db` | 工作区层唯一持久 pending |
| M6 | `DiffActionService.*` | 用户 accept/reject/bulk | 见各方法 | 编辑器变更或 IPC | `diffStore`；`editorStore`；可选 `accept_file_diffs` | 注释声明的「唯一合法入口」 |
| M7 | `AgentTaskController` | diff 写入后通知；diff 终态；文件 diff 决议 | `agentTaskId`、`chatTabId` | `setStageState`/`setConfirmation`/`setVerification`/`forceInvalidate` | `agentStore` | stage 收口中心（与 `finalizeStageClosure`） |

### 3.2 附属逻辑

| # | 代码块 | 服务的主逻辑 | 只读？ | 越权写风险 |
|---|--------|--------------|--------|------------|
| A1 | `ChatMessages` 中 `DiffCard` 的 `onLocate`（`documentService.openFile`） | M2/M3 展示 | 仅导航 | 低 |
| A2 | `PendingDiffPanel` 展示 `byFilePath` 数量 | M3 | 读为主 | 低 |
| A3 | `getLogicalContent`（`diffStore.ts` 导出函数） | 规范中的逻辑 L | 计算用 | 当前 **未**接到 `sendMessage`（`chatStore` 注释：直接用 `positioningCtx.L`） | 若未来误接双源会高风险 |
| A4 | `ExecutionPanel` / `AgentShadowStateSummary` 读 `byTab` | 调试展示 | 只读 | 低 |

### 3.3 分叉逻辑

| # | 描述 | 与主链重复点 | 分叉条件 | 不同步风险 | 生产路径 |
|---|------|--------------|----------|------------|----------|
| F1 | **同文件既可 `edit_current_editor_document` 又可 `update_file`** | 同一 `filePath` 上可能同时存在 `byTab`（普通 toolCallId）与 `workspace-pending:*` | 模型选错工具 | 编辑器 DOM 与磁盘/cache 不一致 | **是**（无法从前端彻底禁止） |
| F2 | **`diffStore.acceptAll` / `acceptAllByDiffIds`（store 内建）与 `DiffActionService.acceptAll` 两套实现** | 均 `buildAcceptReadRow`+`applyDiffReplaceInEditor` 思路 | 当前 **仅** `DiffActionService.acceptAll` 被 `DiffAllActionsBar` 调用 | `acceptAll` store 方法为 **未使用分叉实现** | store 内 `acceptAll`/`acceptAllByDiffIds` **无外部引用** |
| F3 | **resolve 触发点多个**：ingest 时、`reconcileOpenedEditors`、`retryResolveFilePathDiffs`、`TipTapEditor` 订阅 | 均调用 `resolveFilePathDiffs` | 文件打开/切换/内容变 | 重复 resolve 有日志与 `WORKSPACE_RESOLVE_OVERWRITE_DECISION`；可能覆盖同 `toolCallId` 桶 | **是** |

### 3.4 兼容逻辑

| # | 兼容对象 | 是否写业务状态 | 只读？ | 退出条件 | 是否演化为事实主链 |
|---|----------|----------------|--------|----------|-------------------|
| C1 | `ChatMessage.toolCalls`（无 `contentBlocks`） | `hydrateFromChatStore` 仍会 `ingestUpdateFileToolCall` | 否 | 新消息全走 `contentBlocks` 时可缩窄 | 水合主链 **依赖** 它处理旧会话 |
| C2 | `ToolCallCard` 旧格式 `update_file` 摘要 UI | **不**执行 `setFilePathDiffs`（注释写明） | 展示为主 | `legacyMode` | 否（但 hydration 从 store 消息对象读 `toolCalls` 仍会写入） |
| C3 | `displayContent` vs `displayNodes` | 仅展示 | 是 | — | — |
| C4 | `referenceProtocolAdapter` 中 `editTarget` deprecated | 类型保留 | — | — | — |

### 3.5 旧逻辑

| # | 代码位置 | 认定理由 | 仍可能触发？ | 影响 |
|---|----------|----------|--------------|------|
| O1 | `ToolCallCard` 内 `edit_current_editor_document` 禁用分支（约 159–170、305–317 行一带） | 显式「已禁用」 | 旧消息渲染时 | 仅 UI 提示，不写 diff |
| O2 | `ChatMessages` 注释「旧版全文替换兜底已禁用」 | 无直接 `setContent` | 无 | 无写盘 |
| O3 | `diffStore.addDiffs` / `replaceDiffs` | 若仍被调用则为旧批量 API | 需全局 grep；主路径为 `setDiffsForToolCall` | 潜在残留调用需单独审计 |

### 3.6 失效逻辑

| # | 代码位置 | 为何失效 | 死代码？ | 误导性 | 建议 |
|---|----------|----------|----------|--------|------|
| X1 | `convertLegacyDiffsToEntriesWithFallback` | `_editor` 未使用，与 `convertLegacyDiffsToEntries` 等价 | 否（仍被 `ChatPanel` 调用） | 函数名暗示 fallback 已不存在 | 重命名或删除后缀 |
| X2 | `diffStore.acceptAll` / `acceptAllByDiffIds` | `src` 下无调用方 | **近似死代码**（仅 store 内部 `executeAcceptAllForPending` 被 `acceptAll` 包装） | 维护者以为 UI 会走 | 删除或统一调用 `DiffActionService` |

### 3.7 过时逻辑

| # | 原先用途 | 当前替代 | 仍读/写？ | 收口需求 |
|---|----------|----------|-----------|----------|
| P1 | `chatStore` 中「每轮 baseline」+ `getLogicalContent` 分轨 | 实际上 **`currentEditorContent` = `positioningCtx.L`** | `getLogicalContent` 保留未用 | 明确单一真源或接入 |
| P2 | `baselineId` 每轮 `Date.now()` 随机（`buildPositioningRequestContext`） | 作为注入字段存在 | 仍写入 IPC | 与「稳定 baseline」语义在文档中的表述需对齐 |

---

## 4. 代码块级清单（关键块）

以下格式：**文件 → 符号 → 链路 → 分类 → 读/写 → 越权/重复/退出条件 → 保留建议**

### 4.1 `chatStore.ts`

- **`sendMessage`** — 链路：注入 + `ai_chat_stream` — **主逻辑** — 读 `editorStore`、`referenceStore`、`requestContext`；写 `messages`、`agentStore`（shadow task）、`diffStore.setBaseline`、模块级 `positioningContextByChatTab` — **无**越权 — **无**与 `refreshPositioningContextForEditor` 重复（职责不同）— **保留**。
- **`updateToolCall`** — 链路：流式工具更新 — **主逻辑** — 写 `toolCalls` + `contentBlocks` 同步 — **双写 chat 消息内结构** — **保留**（ intentional 同步）。
- **`refreshPositioningContextForEditor`** — 链路：accept 后刷新 L — **主逻辑** — 写 `requestContext` + `setBaseline` — **多写入者**（与 `sendMessage` 均写 baseline）— **保留**。
- **`persist` `onRehydrateStorage`** — 链路：localStorage 恢复 — **附属** — `ensureRuntimeForTab` — **保留**。

### 4.2 `ChatPanel.tsx`

- **流式回调中 `edit_current_editor_document` 分支**（`setDiffsForToolCall` + `notifyDiffsReady`）— **主逻辑** — 写 `diffStore` — **唯一**与后端工具结果对接的打开文档编辑写入口 — **保留**。
- **`update_file` → `UnopenedDocumentDiffRuntime.ingestUpdateFileCall`** — **主逻辑** — **保留**。
- **`listen('ai-agent-stage-changed')` → `AgentTaskController.syncBackendStageState`** — **主逻辑（后端 stage 同步）** — 与前端 `notify*` 并行写入 `agentStore.stageState` — **多写入者** — **保留**但属 **分叉风险点**。
- **`listen('ai-workflow-execution-updated')`** — **附属** — **保留**。

### 4.3 `ChatMessages.tsx`

- **`renderContentBlock` → `edit_current_editor_document` → `DiffCard`** — **主逻辑** — 读 `getDisplayDiffs`；动作走 `DiffActionService` — **保留**。
- **`renderContentBlock` → `update_file` → `DiffCard` / `FileDiffCard`** — **主逻辑（链 B UI）** — **保留**。
- **`useDiffStore(s => s.byTab)` / `byFilePath` 订阅** — **附属（强制重渲染）** — **保留**。
- **旧全文替换** — **失效** — 已禁用文案 — **保留**占位提示。

### 4.4 `ToolCallCard.tsx`

- **`legacyMode && update_file`** — **兼容展示** — **不写** `diffStore`（与注释一致）— **保留**。
- **`edit_current_editor_document` 禁用** — **旧逻辑** — **保留**防误用。

### 4.5 `DiffActionService.ts`

- **`acceptDiff` / `acceptAll` / `rejectDiff` / `acceptResolvedDiffCard` / `acceptFileDiffs` / `rejectFileDiffs`** — **主逻辑** — 注释要求 UI **只**走此层 — **保留**。
- **`reconcileVerificationAfterSuccess`** — **主逻辑** — 写 `verification` — **保留**。

### 4.6 `diffStore.ts`

- **`setDiffsForToolCall`** — **主逻辑** — 写 `byTab`；可能 `executionExposures`；`snapStale` 整批 expired — **保留**。
- **`setFilePathDiffs`** — **主逻辑** — 写 `byFilePath` — **保留**。
- **`resolveFilePathDiffs`** — **主逻辑** — para_index+fuzzy → `setDiffsForToolCall(workspaceKey)` — **保留**。
- **`executeAcceptAllForPending`（模块函数）** — **与 `DiffActionService.acceptAll` 逻辑并行存在** — **分叉/重复** — `DiffAllActionsBar` **未**调用 store 的 `acceptAll` 方法 — **见 §3.3 F2**。
- **`invalidateDocRangesForFile` / `markExpired` / `expirePendingForStaleRevision`** — **主逻辑** — **保留**。
- **`getLogicalContent`（导出函数）** — **过时/未接线** — **保留**待定。

### 4.7 `DiffDecorationExtension.ts`

- **`appendTransaction` → `updateDiff`** — **主逻辑（映射跟随）+ 潜在越权** — 在用户编辑时 **直接** `updateDiff`（`mappedFrom`/`mappedTo`/`expired`/`acceptedFrom`）— **不经 `DiffActionService`** — **判定为「编辑器扩展旁路写入」** — **保留**（功能需要）但须在 §6 标为 **多写入者**。

### 4.8 `unopenedDocumentDiffRuntime.ts`

- **`hydrateFromChatStore` + `useChatStore.subscribe`** — **兼容 + 主链** — 每次 chat 变化全表扫描 — **性能/重复 ingest 风险** — **保留**但属 **P0 结构风险**。
- **`reconcileOpenedEditors`** — **仅当前激活 tab** resolve — **主逻辑** — **保留**。
- **`acceptResolvedDiff` / `acceptPendingDiff`** — 委托 `DiffActionService` — **主逻辑** — **保留**。

### 4.9 `editorStore.ts`

- **`updateTabContent`** — **主逻辑** — `documentRevision++` + `expirePendingForStaleRevision` — **保留**。

### 4.10 `TipTapEditor.tsx`

- **`useDiffStore.subscribe` + `invalidateDocRangesForFile`** — **主逻辑（重建失效）** — **保留**。

### 4.11 `EditorPanel.tsx`

- **外部修改 `markExpired` 批量** — **主逻辑** — **保留**。

### 4.12 后端 `tool_service.rs`

- **`edit_current_editor_document`** — **主逻辑** — `new_content`/`old_content` 均为当前内容字符串（与 `A-SYS-M-D-05` 一致）— **保留**。
- **`update_file` `use_diff`** — **主逻辑** — **保留**。

---

## 5. 逻辑网络图

### 5.1 结构总览（模块层级）

```
输入层: ChatInput / chatStore.sendMessage / referenceStore / editorStore 选区
  ↓
注入层: requestContext (positioningCtx) / anchorFromSelection / primaryEditTarget
  ↓
prompt 层: context_manager (块列表、引用、选区字段)
  ↓
工具执行层: tool_service (edit_current_editor_document | update_file | …)
  ↓
diff 构造层: Resolver2 / diff_engine(para_index)
  ↓
前端状态层: diffStore.byTab | byFilePath；agentStore；workspace 终端状态 Map
  ↓
渲染层: ChatMessages contentBlocks；DiffDecorationExtension；PendingDiffPanel
  ↓
accept/reject 应用层: DiffActionService；UnopenedDocumentDiffRuntime
  ↓
高亮反馈层: DiffDecorationExtension（红/绿）
  ↓
DB 层: workspace_db.pending_diffs；accept_file_diffs 写盘
```

### 5.2 关键链路树（文字树）

**当前文档编辑主链（打开文件）**  
`sendMessage` → `ai_chat_stream` → 模型 → `edit_current_editor_document` → `ChatPanel` 流式 → `setDiffsForToolCall` → `byTab` → `notifyDiffsReady` → `ChatMessages` `DiffCard` → `DiffActionService.acceptDiff` → `applyDiffReplaceInEditor` → `acceptDiff` → `editorStore.updateTabContent` → `refreshPositioningContextForEditor`（由 accept 后路径触发）  
- **分叉点**：若模型误用 `update_file` 改同一文件 → **链 B** 并行。

**未打开文档编辑主链**  
`update_file` → DB `insert_pending_diffs` → 工具结果 `pending_diffs[]` → `ingestUpdateFileToolCall` → `byFilePath` →（打开且 active）`resolveFilePathDiffs` → `byTab`（`workspace-pending:file:tc:…`）→ `DiffCard`/`FileDiffCard` → `acceptResolvedDiff` 或 `acceptPendingDiff` → `accept_file_diffs` IPC  
- **fallback**：`findBlockByFuzzyNormalizedText`（`diffStore.resolveFilePathDiffs`）。

**引用进入编辑的链**  
`references` → prompt 层强调当前文件 → **不**自动改工具参数；`primaryEditTarget` 仅影响「是否跳过向 `edit_current_editor_document` 注入当前编辑器内容」的**后端策略**（需与 `ai_commands` 注入逻辑一致，此处不展开）。

**diff 渲染链**  
`byTab` → `getDisplayDiffs` → `DiffCard` / `DiffDecorationExtension`（`resolvePendingDiffRange`）。

**accept single**  
`DiffActionService.acceptDiff`（唯一）；resolved 工作区：`acceptResolvedDiffCard`。

**accept all**  
`DiffAllActionsBar` → `DiffActionService.acceptAll`（byTab 子集）+ `acceptFileDiffs`（整文件 byFilePath）。

**stage 推进链**  
`bootstrapTaskAfterUserMessage` → `notifyCandidateReady` → `notifyDiffsReady` →（用户操作）`checkAndAdvanceStage` / `handleFileDiffResolution`；并行 **`ai-agent-stage-changed`** → `syncBackendStageState`。

**stale / external_sync / rebuild**  
`updateTabContent` → `expirePendingForStaleRevision`；`TipTapEditor` / `invalidateDocRangesForFile`；`EditorPanel` 外部修改 `markExpired`。

### 5.3 状态写入图（摘要）

| 状态 | 唯一写入者（理想） | 实际多写入者 | 越权写入者 |
|------|-------------------|--------------|------------|
| `byTab`（DiffEntry） | `setDiffsForToolCall` / `acceptDiff` / `updateDiff` | `resolveFilePathDiffs`、`DiffDecorationExtension.appendTransaction`、`markExpired` 等 | **DiffDecorationExtension**（用户编辑时） |
| `byFilePath` | `setFilePathDiffs`、`acceptFileDiffs` 后删减 | `resolveFilePathDiffs` 回写 | — |
| `pending_diffs`（SQLite） | `insert_pending_diffs`、`accept_file_diffs`/`reject_file_diffs` | 仅后端 | — |
| `agentStore.stageState` | 设计意图：`AgentTaskController` | **`syncBackendStageState`（后端事件）** + `notify*`** | 需严格幂等 |
| `confirmation` / `verification` | `AgentTaskController` + `markVerificationFailed` 等 | `reconcileVerificationAfterSuccess` | — |
| `currentTask` | `chatStore` 设 shadow；DB `loadTasksFromDb`；`completeAgentTask` | 多 | — |
| `acceptedFrom`/`To`、`mappedFrom`/`To` | `acceptDiff`；`DiffDecorationExtension` 更新映射 | **Decoration 扩展与 accept 路径** | 扩展在用户键入时更新 |

---

## 6. 主状态写权限表

| 状态名 | 当前所有写入点 | 建议唯一写入点 | 多写入 | UI 旁路 | 兼容层写入 | 旧逻辑残留 |
|--------|----------------|----------------|--------|---------|------------|------------|
| `byTab[filePath].diffs` | `setDiffsForToolCall`、`addDiffs`、`replaceDiffs`、`acceptDiff`、`rejectDiff`、`updateDiff`、`cleanup*`、`acceptFileDiffs` 删 workspace 桶、`removeFileDiffEntry`、`invalidate*`、`executeAcceptAllForPending` | `setDiffsForToolCall` / `accept|reject` / 明确的 cleanup | **是** | **DiffDecorationExtension** | `resolveFilePathDiffs` | `addDiffs` 待确认调用面 |
| `byFilePath` | `setFilePathDiffs`、`resolveFilePathDiffs`、`acceptFileDiffs`、`rejectFileDiffs`、`removeFileDiffEntry`、`cleanup*`、`invalidateForFilePaths` | `ingest` + `resolve` + `DiffActionService` 后果 | **是** | — | hydration | — |
| `agentStore` 内 `stageState/confirmation/verification` | `AgentTaskController`、`markVerificationFailed`、`reconcileVerificationAfterSuccess`、`syncBackendStageState`、`loadTasksFromDb`、`resetRuntimeAfterRestore` | `AgentTaskController` + 明确后端同步 | **是** | — | timeline restore | — |
| `workspaceDiffTerminalStates`（模块 Map） | `recordWorkspaceDiffTerminalState`（accept/reject/remove 等） | 同左 | **是** | — | 水合 UI | — |
| `positioningCtx.L` | `setPositioningRequestContextForChat`、`updatePositioningLForFilePath` | sendMessage 与 accept 后刷新 | **是** | — | — | — |

---

## 7. 分叉与并行逻辑总清单

| 项 | 真实存在？ | 危险？ | 已收口？ | 仍需处理？ |
|----|------------|--------|----------|------------|
| `update_file` 与 `edit_current_editor_document` 双链 | **是** | **高** | **否**（工具层提示仅部分） | **是** |
| accept 多入口 | **否**（业务均归 `DiffActionService`；内部 `diffStore.acceptDiff` 为子步骤） | 低 | **部分** | 清理未使用的 `diffStore.acceptAll` API |
| stage 双推进（前端 notify vs 后端 event） | **是** | **高** | **部分**（幂等判断） | **是** |
| 历史水合与实时 ingest 并行 | **是**（`subscribe` 全量扫描） | **高** | **否** | **是** |
| `byFilePath` 多源写入 | **是**（ingest、resolve 改写、清理） | 中 | **否** | 加强不变量断言 |
| resolve 的 active editor fallback / fuzzy | **是** | **高** | **否** | **是** |
| 外部同步后 `invalidateDocRangesForFile` 与 `expirePendingForStaleRevision` | **是** | 中 | **部分** | 验证是否双重失效用户 |

---

## 8. 失配点清单（展示链 vs 应用链）

| # | 失配 | 证据 |
|---|------|------|
| D1 | **工具结果里的 `new_content`** 不是应用后 HTML，而是当前内容 | `tool_service.rs` 成功分支写入 `new_content` = `current_content_new`；与 `A-SYS-M-D-05` 一致，若 UI 误当「新全文」会失配 |
| D2 | **`update_file` 展示用 `para_index` 行级** vs **`edit_current_editor_document` 块级** | `diff_engine` vs `Resolver2`；同一文件两种坐标 |
| D3 | **红删装饰** 使用 `resolvePendingDiffRange`；**accept** 使用同一 `buildAcceptReadRow` | **同源**（一致） |
| D4 | **绿高亮** 依赖 `acceptedFrom/To`；用户编辑后由 **Decoration 扩展** 映射更新 | 与 **DiffCard** 展示同源 store，但 **用户编辑** 可异步改 mapped 字段 |
| D5 | **当前文档 accept** 改编辑器；**未打开 accept** 走后端 `apply_diffs_to_content`（基于 file_cache/读盘） | **不同应用链**；若用户先在编辑器打开同文件再 accept，路径切换为「resolved 双轨」 |
| D6 | **`getLogicalContent` 未参与发送** | 发送用 `positioningCtx.L`；若未来混用会失配 |

---

## 9. 文档自洽性检查（对照，非事实源）

| 文档 | 与代码不一致/术语/掩盖点 |
|------|---------------------------|
| `A-DE-M-D-01_对话编辑统一方案` | 若文中写「单一真源已全局成立」，与 **双池 + 双工具链** 不符；需强调 **byTab 与 byFilePath 并存** 为事实。 |
| `A-DE-M-T-01_diff系统规则` | 规则文可写「禁止 update_file 审阅仅出现在某处」，代码仍允许 **contentBlocks + ChatMessages** 展示 `update_file` diff（与「禁止」冲突时需以代码为准或改文档）。 |
| `A-AG-M-T-05_AgentTaskController设计` | 设计写「唯一推进主体」—代码基本遵守，但 **`syncBackendStageState` 与 `notify*` 并行**，需在文档标注「双入口需幂等」。 |
| `A-SYS-M-D-01_当前实现运行时逻辑地图` | 总览与代码 **大体一致**；需补充 **`hydrateFromChatStore` 全量 subscribe** 级细节。 |
| `A-CORE-C-D-02_产品术语边界` | `editTarget` 已标 deprecated，与 `referenceProtocolAdapter.ts` 一致。 |

---

## 10. 最终裁决

### 10.1 当前是否已存在唯一主链？

**不是。**

**依据**：`edit_current_editor_document` → `byTab`（块级，无 `workspace_db` pending）与 `update_file` → `workspace_db` → `byFilePath` → resolve → `byTab`（`workspace-pending:*`）为 **两条并行的、均在生产路径生效的端到端链**；`agentStore` stage 亦存在 **前端 notify 与后端事件** 双驱动。

### 10.2 当前最危险的 5 个结构点

1. **双工具链 + 双坐标系**（`blockId+offset` vs `para_index`+fuzzy）导致同一 `filePath` 状态语义分裂。  
2. **`UnopenedDocumentDiffRuntime` 对 `chatStore` 全量 subscribe + `hydrateFromChatStore`**：重复 ingest 与性能/竞态风险。  
3. **`stageState` 多写入者**（`AgentTaskController.notify*` 与 `syncBackendStageState`）。  
4. **`DiffDecorationExtension` 直接 `updateDiff`**：用户编辑路径与 `DiffActionService` 并行写 `diffStore`。  
5. **展示与写盘分离**：`acceptResolvedDiff` 需 **先编辑器 apply 再 `accept_file_diffs`**，与纯后端行级 apply 的假设需永远一致，否则磁盘与编辑器脱钩。

### 10.3 下一轮修复必须优先收口顺序

| 优先级 | 内容 | 原因 |
|--------|------|------|
| **P0** | **hydration 策略**（增量/去重/避免全表扫描）；明确 **`ingest` 幂等边界** | 直接影响正确性与性能，属结构性债务 |
| **P0** | **stage 双入口幂等模型**（前端 notify vs 后端 event 顺序与覆盖规则） | 易导致错误 `stage_complete` / `invalidated` |
| **P1** | **删除或合并未使用的 `diffStore.acceptAll`/`acceptAllByDiffIds` 对外 API** 与 **`DiffActionService.acceptAll` 单一实现** | 消除死分叉 |
| **P1** | **resolve 仅 active tab** 与 **非激活 tab 打开文件** 的 resolve 时机 | 减少「未解析」与错误覆盖 |
| **P2** | **命名清理**（`convertLegacyDiffsToEntriesWithFallback`）与 **文档对齐**（`new_content` 语义、双轨模型） | 降低误用与沟通成本 |

---

**文档结束。** 本文仅描述检查日期的代码事实；后续变更请以版本控制为准。
