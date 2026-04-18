# 对话编辑收口 — 修改前检查报告（代码事实）

## 1）Diff 主链清单

| 链 | 入口 | 中间状态 | 最终写入 | 最终展示 | 是否正式主链 |
|----|------|----------|----------|----------|--------------|
| 当前文档编辑 | `ChatPanel` 流式 `edit_current_editor_document` → `setDiffsForToolCall` | `diffStore.byTab` | `DiffEntry` | `ChatMessages` `contentBlocks` → `DiffCard` + `DiffDecorationExtension` | **是** |
| 未打开文档编辑 | `ChatPanel` `ingestUpdateFileToolCall` / `tool_service.update_file` | `byFilePath` → `resolveFilePathDiffs` → `byTab` | `FileDiffEntry` / `DiffEntry` | `ChatMessages` `DiffCard` / `FileDiffCard` | **是** |
| 渲染主链 | `ChatMessages.renderContentBlock` | 读 `getDisplayDiffs` / `byFilePath` | 无写 | `DiffCard` / `FileDiffCard` | **是（只读）** |
| accept 主链 | `DiffActionService` / `UnopenedDocumentDiffRuntime` | 编辑器 / IPC | `diffStore`、磁盘 | — | **是** |
| reject 主链 | 同上 | — | `diffStore`、IPC | — | **是** |
| hydrate 主链（问题点） | `UnopenedDocumentDiffRuntime.start` 内 `hydrateFromChatStore` + **`useChatStore.subscribe` 全量重放** | `ingestUpdateFileToolCall` | `byFilePath`/`byTab` | 与上同源 | **subscribe 路径非收口主链，属污染** |

## 2）并行逻辑清单

| 并行 | 主逻辑 | 附属/兼容 | 处置 |
|------|--------|-----------|------|
| `ChatMessages` vs `ToolCallCard` diff | `ChatMessages` contentBlocks | `ToolCallCard` legacy 仅摘要 | 保持兼容只读；**移除 ToolCallCard 与 ChatPanel 重复的元数据写入** |
| `notify*` vs `syncBackendStageState` | `notify*` 推进 candidate/review | 后端事件写同字段 | **后端镜像加降级守卫**，避免覆盖前端已前进阶段 |
| `byFilePath` vs resolve 后 `byTab` | 先 `byFilePath` 再 resolve 入 `byTab` | 展示统一读 `getDisplayDiffs` | 保留结构；禁止第二套写入 |
| hydrate 全量 vs 定点 | **应仅启动/持久化恢复一次** | 当前 subscribe 全量 | **删除 subscribe** |
| `diffStore.acceptAll` vs `DiffActionService.acceptAll` | **DiffActionService** | store 内方法无调用 | **删除 store 分叉** |

## 3）死代码 / 过时 API

| API | 结论 |
|-----|------|
| `diffStore.acceptAll` / `acceptAllByDiffIds` | **可直接删除**（`src` 无调用） |
| `addDiffs` / `replaceDiffs` | **可直接删除** |
| `rejectAll` | **无调用，删除** |
| `agentShadowLifecycle` deprecated export 三函数 | **无 import，删除** |
| `convertLegacyDiffsToEntriesWithFallback` | **伪 fallback，改为直接调用 `convertLegacyDiffsToEntries`** |

## 4）写入口拥有权（多写入口标红）

| 状态 | 唯一拥有者（目标） | **多写入口（当前）** |
|------|---------------------|------------------------|
| `byTab` | `setDiffsForToolCall` / accept/reject 路径 | **DiffDecorationExtension** `updateDiff`（保留，属映射跟随） |
| `byFilePath` | `ingestNormalizedPendingDiffs` | 仅此处 + 清理 API |
| `stageState` | **AgentTaskController** | **`syncBackendStageState` 与 `notify*` 同写字段** → 收口为镜像+守卫 |
| hydration | **单次定点** | **`subscribe` 全表扫描** → 删除 |

## 5）本轮删除清单

- `useChatStore.subscribe` → `hydrateFromChatStore`
- `diffStore.acceptAll` / `acceptAllByDiffIds` / `executeAcceptAllForPending` / `addDiffs` / `replaceDiffs` / `rejectAll`
- `agentShadowLifecycle` 三 deprecated 函数及 export
- `ToolCallCard` 内 `recordBinderFile` useEffect（与 ChatPanel 重复）

## 6）本轮保留兼容清单及退出条件

| 项 | 退出条件 |
|----|----------|
| `hydrateFromChatStore` 单次扫描（toolCalls + contentBlocks） | 当历史消息不再含仅 `toolCalls` 且无 DB 外挂 pending 时，可缩为仅 contentBlocks |
| `ToolCallCard` legacy 摘要 UI | 无旧格式消息或产品下线旧渲染 |
| `syncBackendStageState`（改名为 mirror） | 后端不再发重叠事件时可简化为仅终端态 |
