# A-DE-M-D-03 对话编辑收口性审计

> **依据**：仅以当前仓库 `src/`、`src-tauri/src/` 实现与真实调用链为准；不引用设计文档作为「应当如何」的依据。  
> **前置结论来源**：《A-DE-M-D-02_对话编辑当前实现逻辑全检》中已用代码验证的事实，本文件在此基础上做**收口分类与删除/保留裁决**。

---

## A. 一句话总裁决

**当前系统尚未具备端到端的「唯一主链」**：在代码层面仍存在 **两条并行的、均可写真实状态的生产链**（`edit_current_editor_document`→`byTab` 与 `update_file`→`workspace_db`+`byFilePath`→resolve→`byTab`），且 **stage**、**diff 映射**、**hydration** 仍存在 **多写入者或全量重放**；若要收口为「唯一主链」，必须先按 §G 删除或冻结分叉，否则后续修补会持续叠加体量。

---

## B. 对话编辑最终收口表（五类）

**图例**  
- **W**：是否写入业务状态（非仅 UI 局部 state）  
- **重复**：与表中其他点是否功能重叠  
- **旁路**：不经 `DiffActionService` / `AgentTaskController` 约定入口写共享 store  

### B.1 唯一保留主链（生产路径上、收口后应作为唯一真源延续）

| 逻辑点 | 文件 / 符号 | W | 写入状态 | 重复 | 旁路 | 保留理由 | 退出条件（若适用） |
|--------|---------------|---|----------|------|------|----------|-------------------|
| 发送注入 + 流式请求 | `chatStore.ts` `sendMessage` | 是 | `messages`；`agentStore.currentTask`（shadow）；`positioningContextByChatTab`；`diffStore.setBaseline` | 与 `refreshPositioningContextForEditor` 同写 baseline/L，**语义分段**（轮次 vs accept 后） | 无 | 对话入口真源 | 无 |
| 打开文档编辑结果落库 | `ChatPanel.tsx` 流式回调 `edit_current_editor_document` 成功分支 | 是 | `diffStore.setDiffsForToolCall`；异步后 `AgentTaskController.notifyDiffsReady` | 无 | 无 | 唯一与流式工具结果对接的 `byTab` 写入 | 无 |
| 未打开文件 pending 摄入 | `unopenedDocumentDiffRuntime.ts` `ingestUpdateFileToolCall` → `ingestNormalizedPendingDiffs` | 是 | `setFilePathDiffs`；可能 `resolveFilePathDiffs`→`setDiffsForToolCall`；`notifyDiffsReady` | 与 `ChatPanel` 直接 `ingest` 同源 | 无 | `update_file` 主入口 | 见 §C |
| 后端打开文档编辑 | `tool_service.rs` `edit_current_editor_document` | 是（工具结果） | 返回 `diffs`/`old_content`/`new_content`（**不写** `pending_diffs` 表） | 与 `update_file` 分叉 | N/A（后端） | 块级 resolve 唯一后端实现 | 无 |
| 后端未打开写 pending | `tool_service.rs` `update_file` + `diff_engine` + `workspace_db.insert_pending_diffs` | 是 | SQLite `pending_diffs` | 与上一行分叉 | N/A | 工作区持久 pending 唯一后端写 | 无 |
| 用户 accept/reject（前端约定入口） | `DiffActionService.ts` 全部对外方法 | 是 | `diffStore`；`invoke accept_file_diffs`/`reject_file_diffs`；`editorStore.updateTabContent`；`AgentTaskController.*` | `diffStore` 内部 `acceptDiff` 为子步骤，**非重复主链** | 无（相对 UI） | 注释声明的唯一合法入口 | 无 |
| Stage 裁决与推进（前端聚合） | `AgentTaskController.ts` | 是 | `agentStore`：`setStageState`/`setConfirmation`/`setVerification`/`setCurrentTask`；委托 `markAgentInvalidated` | 与 `syncBackendStageState`、DB 恢复 **并行**，见 §E | 无 | 业务规则集中 | 收口目标见 §F |
| 写盘应用 pending | `workspace_commands.rs` `accept_file_diffs` / `reject_file_diffs` | 是 | 磁盘；`workspace_db`；`file_cache` | 无 | N/A | 链 B 写盘唯一 IPC | 无 |

### B.2 附属但必须保留（不单独构成业务闭环，但缺则主链断裂）

| 逻辑点 | 文件 / 符号 | W | 写入状态 | 重复 | 旁路 | 保留理由 |
|--------|---------------|---|----------|------|------|----------|
| 选区锚点 | `anchorFromSelection.ts` | 否 | 无 store | 无 | 无 | `sendMessage` 注入 |
| RequestContext 模块 | `requestContext.ts` `setPositioningRequestContextForChat` / `updatePositioningLForFilePath` | 是 | 模块级 `Map` | 与 `sendMessage`/`refreshPositioningContextForEditor` 双写同一抽象 | 无 | 工具注入与 accept 后 L 一致 |
| Diff 转条目 | `diffFormatAdapter.ts` `convertLegacyDiffsToEntries` | 否 | 无 | `WithFallback` 同名双函数，见 §D | 无 | `ChatPanel` 解析工具 JSON |
| 应用单条到编辑器 | `applyDiffReplaceInEditor.ts` | 是（编辑器 doc） | ProseMirror 文档；间接驱动 `editorStore` 由调用方 | 无 | 无 | 唯一推荐 apply 实现 |
| Prompt 构建 | `context_manager.rs` | 否（输出给模型） | 无前端 store | 无 | N/A | 与执行链正交 |
| 工具分发 | `tool_service.rs` match 分支、`ai_commands.rs` 编排 | 否/是依分支 | 依工具 | 无 | N/A | 入口 |
| `diff_engine.rs` | 生成 para 级 pending | 否（被 `update_file` 调用） | 无独立前端 | 无 | N/A | 链 B 构造 |

### B.3 兼容保留（必须写明退出条件）

| 逻辑点 | 文件 / 符号 | W | 写入状态 | 重复 | 旁路 | 退出条件 |
|--------|---------------|---|----------|------|------|----------|
| 旧消息 `toolCalls` 水合 | `unopenedDocumentDiffRuntime.ts` `hydrateFromChatStore` 中对 `message.toolCalls` 的循环 | 是 | `setFilePathDiffs` 等 | 与 `contentBlocks` 分支 **重复遍历同一会话** | 无 | **当持久化数据中不再存在「仅有 toolCalls、无 contentBlocks」的助手消息」或迁移脚本已把历史写入 workspace 侧一次性修复** |
| `ToolCallCard` 旧格式 `update_file` 摘要 | `ToolCallCard.tsx` | 否（注释写明不写 `diffStore`） | 无 | 与水合写入 **不同路径**（水合仍可从 `toolCalls` 灌入） | 无 | **当用户清除旧会话或产品放弃旧消息渲染** |
| `chatStore` 双结构同步 | `updateToolCall` 同时写 `toolCalls` 与 `contentBlocks` | 是 | `messages` 内嵌 | 双轨 | 无 | **当发送路径不再产生 `toolCalls` 数组、仅 contentBlocks**（需数据迁移） |
| `chatStore` persist 部分字段 | `partialize` 不持久化 messages | 否 | localStorage | 无 | 无 | **会话级策略；与 diff 收口独立** |

### B.4 待删除分叉逻辑（仍在生产路径或可被调用，收口时应删除或降级为无写权限）

| 逻辑点 | 文件 / 符号 | W | 写入状态 | 重复 | 旁路 | 删除/冻结理由 |
|--------|---------------|---|----------|------|------|----------------|
| **全量 chat subscribe 水合** | `unopenedDocumentDiffRuntime.ts` `useChatStore.subscribe`→`hydrateFromChatStore` | 是 | 同 `ingest` | **每次任意 chat 变更全表扫描** | 无 | 体量与重复 ingest 风险；**收口后应改为显式迁移或惰性单次** |
| **双套批量 accept 实现** | `diffStore.ts` `acceptAll` / `acceptAllByDiffIds`（store 方法） | 是 | `byTab` 等 | 与 `DiffActionService.acceptAll` **逻辑等价并行** | **是**（若被误调则绕过 `AgentTaskController` 后置步骤） | **当前 `src` 内无调用方**（仅 `DiffAllActionsBar` 调 `DiffActionService.acceptAll`），属 **死 API 分叉** |
| **后端 stage 事件 + 前端 notify 双写** | `ChatPanel.tsx` `listen('ai-agent-stage-changed')` → `syncBackendStageState` **与** `notifyCandidateReady`/`notifyDiffsReady` | 是 | `agentStore.stageState` | **同一字段双入口** | 无 | 需收敛为 **单一顺序真源**（见 §F） |
| **Deprecated 导出仍暴露** | `agentShadowLifecycle.ts` `markAgentUserConfirmed` / `markAgentStageComplete` / `markAgentRejected` | 若被调则 **是** | `agentStore` | 与 `AgentTaskController` **重复** | **是** | **`src` 内无 import**（仅自文件 export），属 **待删 API 面** |
| **`addDiffs` / `replaceDiffs`** | `diffStore.ts` | 是 | `byTab` | 与 `setDiffsForToolCall` **重叠** | 若被调则 **是** | **`src` 内无引用**（仅定义），**死代码路径** |

### B.5 已失效 / 应立即删除逻辑

| 逻辑点 | 文件 / 符号 | W | 依据 | 删除理由 |
|--------|---------------|---|------|----------|
| `convertLegacyDiffsToEntriesWithFallback` 中 **fallback 语义** | `diffFormatAdapter.ts` | 否（与 `convertLegacyDiffsToEntries` 等价） | `_editor` 未使用 | **命名误导**；应立即改名或删除别名 |
| `AgentTaskController` 注释仍写「addDiffs」触发 notify | `AgentTaskController.ts` 注释 | 否 | 代码已无 `addDiffs` 调用 | **文档注释与代码不一致**，应修正注释避免误读 |

---

## C. 兼容逻辑退出表

| 兼容项 | 当前退出判据（可自动化） | 人工/产品判据 |
|--------|---------------------------|----------------|
| `hydrateFromChatStore` 扫描 `toolCalls` | 全局不存在 `messages[].toolCalls?.length && !messages[].contentBlocks` | 产品决定「是否支持导入极旧导出」 |
| 全量 `subscribe` 水合 | 改为启动时单次 + 增量后，删除 subscribe | 需配套「状态已同步」验收 |
| `updateToolCall` 双写 | 新消息仅 `contentBlocks` 且旧数据已迁移 | 大版本升级 |
| `ToolCallCard` legacy 分支 | 无 `legacyMode` 消息 | 同上 |

---

## D. 待删除逻辑表（汇总）

| 删除对象 | 类型 | 风险若直接删 |
|----------|------|----------------|
| `diffStore` 的 `acceptAll` / `acceptAllByDiffIds` 公共 API | 死分叉 | 低（无调用方） |
| `diffStore` 的 `addDiffs` / `replaceDiffs` | 死代码 | 低（无调用方） |
| `agentShadowLifecycle` 三函数 export `markAgentUserConfirmed` 等 | 死 API | 低（无引用） |
| `hydrate` 的 `useChatStore.subscribe` 全量回调 | 结构性 | **高**，需替代方案 |
| `convertLegacyDiffsToEntriesWithFallback` 符号 | 误导命名 | 低，改名即可 |

---

## E. 多写入者清单

| 状态 / 字段 | 写入者（文件::符号） | 是否旁路 | 收口目标 |
|-------------|------------------------|----------|----------|
| `diffStore.byTab` DiffEntry | `setDiffsForToolCall`；`acceptDiff`/`rejectDiff`/`updateDiff`；`resolveFilePathDiffs`→`setDiffsForToolCall`；`cleanup*`；`acceptFileDiffs` 删行；`invalidate*`；`executeAcceptAllForPending`（仅被 store 内 `acceptAll` 调，**外层未用**） | **DiffDecorationExtension** `appendTransaction`→`updateDiff` 为 **编辑器内旁路** | 映射更新保留在扩展或收拢到单一 service，**二者只留一种** |
| `diffStore.byFilePath` | `setFilePathDiffs`；`resolveFilePathDiffs` 回写；`acceptFileDiffs` 等 | 无 | ingest 单一入口 |
| `agentStore.stageState` | `AgentTaskController` 多方法；**`syncBackendStageState`**（`ChatPanel` 事件）；`loadTasksFromDb`；`resetRuntimeAfterRestore`；`markAgentInvalidated` | 部分为 **生命周期必要** | **声明唯一「业务语义」写入者为 `AgentTaskController`，其余为系统/恢复类并加类型区分**（实现层可后续做） |
| `positioningCtx.L` | `sendMessage`；`updatePositioningLForFilePath`（accept 后） | 无 | 双场景保留，**非分叉** |
| `messages` 内 `toolCalls` 与 `contentBlocks` | `addToolCall`/`updateToolCall`/`addContentBlock` | 无 | 数据模型单轨 |

---

## F. 单一收口目标架构（文字树）

**声明：以下为「收口完成态」应呈现的结构，用于对齐改造；不等同于当前已实现。**

```
[当前文档编辑 — 唯一主链]
用户发送 → chatStore.sendMessage（L/baseline/选区）
  → ai_chat_stream → 模型
  → tool: edit_current_editor_document
  → tool_service::edit_current_editor_document（块级 diff，不写 DB pending 表）
  → ChatPanel 流式 → diffStore.setDiffsForToolCall(byTab)
  → ChatMessages 展示 ← diffStore.getDisplayDiffs（读）
  → 用户 accept → DiffActionService.acceptDiff → applyDiffReplaceInEditor → diffStore.acceptDiff
  → editorStore.updateTabContent →（可选）refreshPositioningContextForEditor

[未打开文档编辑 — 唯一主链]
  → tool: update_file(use_diff)
  → tool_service::update_file → workspace_db.insert_pending_diffs
  → 工具结果 pending_diffs[]
  → UnopenedDocumentDiffRuntime.ingest（唯一写 byFilePath 入口）→ 可选 resolve → byTab(workspace-pending:*)
  → 展示：FileDiffCard / DiffCard（读同一 store）
  → accept → DiffActionService.acceptResolvedDiffCard / acceptFileDiffs
  → workspace_commands::accept_file_diffs（写盘 + 清 DB 行）

[stage — 唯一写入口（语义层）]
  AgentTaskController（bootstrap / notify* / checkAndAdvanceStage / handleFileDiffResolution / forceInvalidate）
  ⊕ 系统类：后端事件若保留则必须 **幂等覆盖**同一 taskId，不定义独立业务语义

[展示 / accept / 高亮 — 同源字段]
  真源：diffStore.byTab[filePath].diffs :: DiffEntry
  展示：getDisplayDiffs / DiffCard /（读）
  accept：buildAcceptReadRow(entry, …)（读同一 DiffEntry + 当前 editor doc）
  红删高亮：resolvePendingDiffRange(doc, filePath, entry) 与 accept 同源 entry
  绿高亮：acceptedFrom/acceptedTo（accept 写入；Decoration 可跟随映射更新 mapped/accepted 范围）

[hydration — 允许保留边界]
  仅允许：「进程启动后一次」或「从磁盘导入会话一次」将历史 update_file 结果灌入 `byFilePath`/`ingest`，**禁止**对任意 chat state 变更做全量重放。
```

**直接回答 §4 条款：**

| 问题 | 收口答案 |
|------|----------|
| 当前文档编辑最终唯一主链 | 上表 **[当前文档编辑 — 唯一主链]** |
| 未打开文档编辑最终唯一主链 | 上表 **[未打开文档编辑 — 唯一主链]** |
| stage 推进最终唯一写入口 | **`AgentTaskController` 为业务语义唯一写者**；`syncBackendStageState` 仅允许作为 **后端镜像幂等**（或最终删除事件、只留前端推导） |
| 展示 / accept / 高亮同源 | **`DiffEntry`（`byTab`）+ 当前 `Editor` doc**；`byFilePath` 仅为 resolve 前暂存，resolve 后应以 **同一条** `DiffEntry` 为 accept 真源 |
| hydration | **保留边界**：单次或迁移式；**退出**：全量 subscribe 删除且数据单轨后 |

---

## G. 删除顺序建议（P0 / P1 / P2）

| 优先级 | 动作 | 原因 |
|--------|------|------|
| **P0** | 用「单次/增量」替换 `useChatStore.subscribe`→`hydrateFromChatStore` 全量扫描 | 不先删则每次修 diff 都会叠加行为与顺序依赖 |
| **P0** | 明确 `stageState` 双入口（notify vs `ai-agent-stage-changed`）的 **覆盖顺序与幂等规范**，或删除其一 | 避免「一边修 stage 一边加判断」 |
| **P1** | 删除未使用 API：`diffStore.acceptAll`/`acceptAllByDiffIds`、`addDiffs`/`replaceDiffs`（先全局再确认无动态调用） | 减少分叉与误用 |
| **P1** | 删除 `agentShadowLifecycle` 中未引用 deprecated export 或整段 dead 函数 | 防止未来误接 |
| **P2** | 重命名 `convertLegacyDiffsToEntriesWithFallback`；修正 `AgentTaskController` 注释 | 降低误读 |
| **P2** | 评估 `DiffDecorationExtension` 与 `DiffActionService` 对 `updateDiff` 的双写是否合并 | 长期可维护性 |

---

## H. 哪些逻辑若继续保留，会导致「越修越多」

1. **`hydrateFromChatStore` + 任意 chat 变更全量重放**：每修一次 ingest 条件，就要兼容「第 N 次 subscribe 触发」的顺序与跳过逻辑，**典型叠加体量**。  
2. **未删除的 `diffStore.acceptAll` 与 `DiffActionService.acceptAll` 双实现**：新人易调用 store 版，**绕过** `AgentTaskController.reconcileVerificationAfterSuccess` 等步骤，修复时往往再 **加一层守卫**。  
3. **`stage` 双入口无正式状态机文档（以代码为准）**：每加一种边界（restore、workflow、后端推送），就在 `notify*` 与 `syncBackendStageState` 上 **叠条件**。  
4. **`byFilePath` 与 `byTab` 长期双池**：每加一种 UI（批量、按消息），就要在 `getPendingForBulk` 等函数 **叠分支**。  
5. **同文件双工具链（模型误用）不阻断**：前端只能继续 **叠提示与 reconcile**，无法从结构上减少分支。

---

**文档结束。**
