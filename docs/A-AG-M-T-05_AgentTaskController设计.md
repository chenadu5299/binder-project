# AgentTaskController 设计

## 文档头

- 结构编码：`AG-M-T-05`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`AgentTaskController 技术设计 / stage_complete 与 invalidated 推进主体`
- 上游约束：`CORE-C-D-05`, `AG-M-T-04`, `DE-M-T-01`
- 直接承接：`AG-X-L-01`
- 接口耦合：`DE-M-T-01`（DiffRetryController）、`diffStore`、`agentStore`
- 汇聚影响：`CORE-C-R-01`
- 扩散检查：`AG-M-T-04`, `DE-M-T-01`, `CORE-C-D-05`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L2 / 二级规则文档`  
> 文档类型：`专项技术设计`  
> 当前状态：`Active`  
> 受约束于：`A-CORE-C-D-05_状态单一真源原则.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`  
> 可约束：`stage_complete`、`invalidated`、`verification failed`、`DiffActionService` 相关实现  
> 不可用于：`重定义 diff 数据结构与展示规则`

---

## 一、文档定位

本文是 `stage_complete` 与 `invalidated` 两个业务状态的唯一合法推进主体设计文档。

解决以下问题：
1. 谁能推进 `stage_complete`（`A-CORE-C-D-05` §6.5/§6.7 遗留的推进主体空缺）。
2. `verification failed` 与 `invalidated` 如何解耦，谁来裁决转换（`A-CORE-C-D-05` §6.6 规则5 遗留的裁决主链缺失）。
3. `accepted`/`rejected`/`expired` 的入口如何收敛（`A-CORE-C-D-05` §6.6 规则7 的 `DiffActionService` 设计）。

本文不定义：
- diff 数据结构（见 `A-DE-M-T-01`）
- execute_failed 事件对象与重试规则（见 `A-DE-M-T-01` §6.4/§6.5）
- agentStore 内部结构（见 `A-AG-M-T-04` §5.3）

---

## 二、AgentTaskController

### 2.1 定位

`AgentTaskController` 是前端 service 层对象（非 store、非 UI 组件），负责：

1. 接收 `diffStore` 的状态变更通知。
2. 按规则裁决是否推进 `stage_complete` 或 `invalidated`。
3. 调用 `agentStore` 写入最终阶段结论。

**它不做的事**：
- 不直接操作编辑器（editor）。
- 不生成 diff，不消费 `execute_failed` 事件（由 `DiffRetryController` 消费）。
- 不写入 `workspace.db`（shadow runtime 持久化禁止边界，见 `A-AG-M-T-04` §5.3.5）。
- 不拥有编辑目标坐标真源；`ExecutionAnchor` 的生成与归一属于上游 diff/resolve 主链，controller 只消费其终态结果。

### 2.2 接口签名

```typescript
interface AgentTaskController {
  /**
   * 候选就绪通知入口。
   * 调用时机：流式响应处理到含候选结果的工具回调（hasCandidatePayload）时，由 ChatPanel.tsx 调用。
   * 禁止 UI 组件内联直接调用 agentStore.setStageState('candidate_ready')。
   */
  notifyCandidateReady(
    agentTaskId: string,
    chatTabId: string,
    source: string,
  ): void;

  /**
   * Diff 写入就绪通知入口。
   * 调用时机：setDiffsForToolCall / setFilePathDiffs 完成写入后，由写入方主动调用。
   * 推进 review_ready + awaiting_user_review。
   * 禁止 ChatMessages.tsx 通过 useEffect 扫描 contentBlocks 来推进此阶段。
   */
  notifyDiffsReady(
    agentTaskId: string,
    chatTabId: string,
  ): void;

  /**
   * 每次 diff 状态变更后由 DiffActionService 调用。
   * 检查该 agentTaskId 下是否满足 stage_complete 或 invalidated 条件。
   */
  checkAndAdvanceStage(
    agentTaskId: string,
    chatTabId: string,
    filePath: string,
  ): void;

  /**
   * byFilePath file diff 完成 resolve 后的专用通知入口。
   * 由 DiffActionService.acceptFileDiffs / rejectFileDiffs 调用。
   */
  handleFileDiffResolution(params: {
    agentTaskId: string | undefined;
    chatTabId?: string;
    outcome: 'accepted' | 'rejected';
  }): void;

  /**
   * 外部强制 invalidated（如 resetRuntimeAfterRestore、外部文件恢复等）。
   * reason 用于追踪触发原因。
   */
  forceInvalidate(
    agentTaskId: string,
    chatTabId: string,
    reason: string,
  ): void;
}
```

### 2.2a UI 层约束（P0-1 收口后生效）

| 规则 | 说明 |
|------|------|
| UI 只观察，不推进 | ChatMessages.tsx、DiffCard、ToolCallCard 等 UI 组件不得直接调用 `agentStore.setStageState` / `agentStore.setConfirmation` 推进业务阶段 |
| `candidate_ready` 由 ChatPanel 串流处理调用 | 唯一入口：`AgentTaskController.notifyCandidateReady(...)` |
| `review_ready` 由 diff 写入方调用 | 唯一入口：`AgentTaskController.notifyDiffsReady(...)` |
| `stage_complete` / `invalidated` 由 DiffActionService 通知后由 controller 裁决 | 唯一推进路径：`DiffActionService → AgentTaskController.checkAndAdvanceStage / handleFileDiffResolution` |
| 已删除越权路径 | `ChatMessages.tsx` 中扫描 `contentBlocks` 的 `useEffect`（sets review_ready/awaiting_user_review）已删除（P0-1） |

### 2.3 `checkAndAdvanceStage` 裁决规则

```
输入：agentTaskId, chatTabId, filePath

Step 1：收集该 agentTaskId 下所有 diff
  → diffStore.getAllDiffsForAgentTask(agentTaskId)
  → 包含 byTab 和 byFilePath 中所有绑定该 agentTaskId 的 DiffEntry

Step 2：状态检查
  → 若存在任何 status === 'pending'
    → 尚未到达终态，不推进，直接返回

Step 3：所有 diff 均已终态（accepted / rejected / expired）
  → Case A：至少一个 accepted
    → agentStore.setStageState(chatTabId, 'stage_complete', reason)
    → agentStore.setCurrentTask(chatTabId, lifecycle='completed')
    → （不写 DB）
  → Case B：全部为 rejected 或 expired，没有 accepted
    → markVerificationFailed(chatTabId, agentTaskId, 'all_diffs_non_accepted')
    → AgentTaskController.forceInvalidate(agentTaskId, chatTabId, 'all_diffs_rejected_or_expired')
```

### 2.4 `forceInvalidate` 规则

```
输入：agentTaskId, chatTabId, reason

→ agentStore.setVerification(chatTabId, createFailedVerificationRecord(agentTaskId, reason))
→ agentStore.setCurrentTask(chatTabId, lifecycle='invalidated')
→ agentStore.setStageState(chatTabId, 'invalidated', reason)
→ （不写 DB）
```

**与旧 `markAgentInvalidated` 的区别**：
- 旧实现：`markAgentInvalidated` 在 `diffStore` 操作路径中被直接调用，原子绑定 verification.failed + lifecycle.invalidated。
- 新实现：`diffStore` 操作路径只调用 `markVerificationFailed`（只写 verification）；`invalidated` 由 `AgentTaskController` 在 `checkAndAdvanceStage` 或 `forceInvalidate` 中统一裁决。

---

## 三、DiffActionService

### 3.1 定位

`DiffActionService` 是 `accepted`/`rejected` 推进路径的唯一合法入口，替代各 UI 组件直接操作 `diffStore`。

所有 UI 组件（ToolCallCard、ChatMessages、DiffAllActionsBar、PendingDiffPanel）只调用 `DiffActionService`，不再直接调用 `diffStore.acceptDiff` / `diffStore.rejectDiff` 或任何 `markAgent*` 函数。

### 3.2 接口签名

```typescript
interface DiffActionService {
  /**
   * 接受单条 diff。
   * 内部包含：preApplySnapshotGatesForAccept → applyDiffReplaceInEditor
   *           → diffStore.acceptDiff → AgentTaskController.checkAndAdvanceStage
   */
  acceptDiff(
    filePath: string,
    diffId: string,
    editor: Editor,
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<DiffActionResult>;

  /**
   * 拒绝单条 diff。
   * 内部：diffStore.rejectDiff → AgentTaskController.checkAndAdvanceStage
   */
  rejectDiff(
    filePath: string,
    diffId: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): void;

  /**
   * 批量接受（逆序执行，保持稳定排序）。
   * 内部：逐条调用 acceptDiff → 最终统一触发 checkAndAdvanceStage
   */
  acceptAll(
    filePath: string,
    toolCallId: string,
    editor: Editor,
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<{ applied: number; expired: number; anyApplied: boolean }>;

  /**
   * 接受 workspace 文件 diff（byFilePath 路径，调用后端 accept_file_diffs）。
   */
  acceptFileDiffs(
    filePath: string,
    workspacePath: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<void>;

  /**
   * 拒绝 workspace 文件 diff。
   */
  rejectFileDiffs(
    filePath: string,
    workspacePath: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<void>;
}

type DiffActionResult =
  | { success: true; from: number; to: number }
  | { success: false; expireReason: DiffExpireReason };
```

### 3.3 accept 内部执行链

```
DiffActionService.acceptDiff(filePath, diffId, editor, options)

1. preApplySnapshotGatesForAccept(entry, editor, tabRev, filePath)
     失败 → diffStore.updateDiff(status:'expired', expireReason)
          → markVerificationFailed(chatTabId, agentTaskId, reason)
          → AgentTaskController.checkAndAdvanceStage(...)
          → return { success: false, expireReason }

2. applyDiffReplaceInEditor(editor, range, entry.newText)
     失败 → 产生 DiffExecuteFailedEvent(retryable=false)
          → DiffRetryController 消费（直接过期）
          → AgentTaskController.checkAndAdvanceStage(...)
          → return { success: false, expireReason: 'apply_replace_failed' }

3. diffStore.acceptDiff(filePath, diffId, { from, to })

4. updateTabContent(tabId, editor.getHTML())  // 推进 revision，触发 expirePendingForStaleRevision

5. AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath)

6. return { success: true, from, to }
```

### 3.4 reject 内部执行链

```
DiffActionService.rejectDiff(filePath, diffId, options)

1. diffStore.rejectDiff(filePath, diffId)

2. AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath)
```

---

## 四、`markVerificationFailed` 独立函数

替代原 `markAgentInvalidated` 中 verification 写入部分。

```typescript
/**
 * 仅标记 verification 失败。
 * 不推进 lifecycle 或 stage。
 * invalidated 的推进由 AgentTaskController.forceInvalidate 统一执行。
 */
function markVerificationFailed(
  chatTabId: string,
  agentTaskId: string | undefined,
  reason: string,
): boolean {
  if (!agentTaskId) return false;
  const store = useAgentStore.getState();
  const runtime = store.runtimesByTab[chatTabId];
  if (!runtime) return false;

  const task = runtime.currentTask?.id === agentTaskId
    ? runtime.currentTask
    : runtime.recentTasks.find((t) => t.id === agentTaskId);
  if (!task) return false;

  store.setVerification(
    chatTabId,
    createFailedVerificationRecord(task.id, reason),
  );
  return true;
}
```

**调用方**：
- `diffStore.markExpired`（外部文件修改路径）
- `diffStore.expirePendingForStaleRevision`
- `diffStore.setDiffsForToolCall`（snapStale 分支）
- `DiffActionService.acceptDiff`（apply 失败路径）
- `DiffRetryController`（重试耗尽路径）

**不调用 `markVerificationFailed` 的地方**：
- `diffStore.rejectDiff`：reject 是用户主动决策，不等于验证失败；直接交由 `AgentTaskController.checkAndAdvanceStage` 按全局终态条件裁决。

---

## 五、`diffStore` 侧改动说明

本节描述 `diffStore` 在新架构下的职责收窄：

### 5.1 移除的调用

| 原调用点 | 原调用 | 改为 |
|---|---|---|
| `diffStore.rejectDiff` | `markAgentRejected(...)` | 移除；交由 `AgentTaskController.checkAndAdvanceStage` |
| `diffStore.markExpired` | `markAgentInvalidated(...)` | 改为 `markVerificationFailed(...)` |
| `diffStore.expirePendingForStaleRevision` | `markAgentInvalidated(...)` | 改为 `markVerificationFailed(...)` |
| `diffStore.setDiffsForToolCall`（snapStale） | `markAgentInvalidated(...)` | 改为 `markVerificationFailed(...)` |

### 5.2 新增回调

`diffStore` 在以下操作后需通知 `AgentTaskController`：

```typescript
// diffStore 内部在完成 acceptDiff / rejectDiff / updateDiff(expired) 后
// 调用（通过 DiffActionService 注入的回调，或直接 import）：
AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
```

为避免循环依赖，`AgentTaskController` 的调用通过 `DiffActionService` 中间层传递，`diffStore` 本身不直接 import `AgentTaskController`。

---

## 六、`agentShadowLifecycle.ts` 侧改动说明

### 6.1 移除的函数

| 函数 | 移除原因 |
|---|---|
| `markAgentRejected` | reject 不等于 verification failed；裁决改由 `AgentTaskController` |
| `markAgentStageComplete` | stage_complete 唯一入口改为 `AgentTaskController`；UI 组件不再直接调用 |
| `markAgentUserConfirmed` | user_confirmed 阶段仍需要，但不在 UI 组件中直接调用；由 `AgentTaskController` 在进入 stage_complete 前写入 |

### 6.2 保留的函数

| 函数 | 保留原因 |
|---|---|
| `markAgentInvalidated` | 作为 `forceInvalidate` 实现的内部委托，入口收敛至 `AgentTaskController` |
| `markVerificationFailed`（新增） | 替代原 `markAgentInvalidated` 的 verification 部分 |

### 6.3 移除的持久化调用

```typescript
// 移除以下所有调用：
syncTaskToDb(task, stage, reason);
```

`syncTaskToDb` 连同 `agentStore.loadTasksFromDb` 的恢复分支一并停用。`workspace.db` 中 `agent_tasks` 表的写入可保留用于观测/排障，但不再作为状态恢复依据（读取分支停用）。

---

## 七、边界约束总表

| 操作 | 合法调用方 | 禁止调用方 |
|---|---|---|
| 推进 `stage_complete` | `AgentTaskController.checkAndAdvanceStage` | UI 组件、diffStore、agentShadowLifecycle 函数 |
| 推进 `invalidated` | `AgentTaskController.forceInvalidate` | UI 组件、diffStore 直接调用、markAgentInvalidated 对外暴露路径 |
| 写入 `verification.failed` | `markVerificationFailed`（diffStore 内/DiffRetryController） | 不经 markVerificationFailed 直接写 agentStore |
| 推进 `accepted` | `DiffActionService.acceptDiff` / `acceptAll` / `acceptFileDiffs` | UI 组件直接调用 `diffStore.acceptDiff` |
| 推进 `rejected` | `DiffActionService.rejectDiff` / `rejectFileDiffs` | UI 组件直接调用 `diffStore.rejectDiff` |
| 写入 agentStore DB | 禁止（shadow runtime 持久化禁止） | 所有路径 |

---

## 八、update_file 与 edit_current_editor_document 的 stage 裁决路径（2026-04-17 更新）

### 8.1 两条路径的 stage 裁决入口

| 工具 | 数据池 | accept/reject 后调用 | stage 裁决入口 |
|------|--------|---------------------|---------------|
| `edit_current_editor_document` | `byTab`（DiffEntry）| `DiffActionService.acceptDiff/rejectDiff/acceptAll` | `AgentTaskController.checkAndAdvanceStage` |
| `update_file`（byFilePath 路径）| `byFilePath`（FileDiffEntry）| `DiffActionService.acceptFileDiffs/rejectFileDiffs/rejectFileDiffEntry` | `AgentTaskController.handleFileDiffResolution` |
| `update_file`（byTab resolved 路径）| `byTab`（resolve 后的 DiffEntry）| `DiffActionService.acceptResolvedDiffCard/rejectResolvedDiffCard` | `acceptResolvedDiffCard` 先触发 `checkAndAdvanceStage`，再由 `acceptFileDiffs` 触发 `handleFileDiffResolution` 完成最终裁决 |

### 8.2 两条入口的协调规则

- `checkAndAdvanceStage` 在裁决前会检查 `hasFileDiffsForAgentTask(agentTaskId)`，若 `byFilePath` 仍有条目则**不推进**。
- `handleFileDiffResolution` 在裁决前会同时检查 `byTab` 和 `byFilePath` 是否仍有 `pending`，若有则**不推进**（等主链全部收口）。
- 因此两条路径在**同一 agentTaskId** 下，只有当 byTab 和 byFilePath 的所有 pending 均解决后，才会完成 `stage_complete`。
- 两条入口现已共享内部闭环函数 `finalizeStageClosure(...)`，由它统一判定 `pending / accepted / invalidated`，不再各自维护一份终态裁决逻辑。

补充约束：
- `byFilePath` 中未 resolve 的 workspace diff 仍可能只持有 `para_index + original_text`，它们在 controller 视角下属于“未完成收口”的 pending，不得被视为可直接完成的 canonical diff。
- `AgentTaskController` 只认上游已经写入 store 的正式终态，不承担把 `block_index`、`TextReference`、`para_index` 等辅助定位信号转换为执行真源的职责。

### 8.2a 正式分工

- `checkAndAdvanceStage`：拥有 `byTab` 终态集合的裁决权；适用于 `edit_current_editor_document` 以及 `update_file` resolved 卡片完成 `acceptDiff/rejectDiff` 后的阶段检查。
- `handleFileDiffResolution`：拥有 `byFilePath` 队列收口后的补裁决权；适用于 `acceptFileDiffs/rejectFileDiffs/rejectFileDiffEntry` 完成后，以 `outcome` 补齐“至少一个 accepted”或“全部 rejected”这一事实。
- `stage_complete / invalidated` 的最终写入权仍只在 `AgentTaskController`；UI 组件和 diffStore 只负责上报状态变化，不直接推进最终 stage。

### 8.2b diff-ready 触发边界

- 新格式 `update_file`：`byFilePath` 主写入来自 `ChatPanel` 流式链路；`notifyDiffsReady` 不再依赖 `ToolCallCard`。
- 历史消息恢复：由 `UnopenedDocumentDiffRuntime.start()` 订阅 chatStore 后统一补写缺失 `FileDiffEntry`，必要时补发 `notifyDiffsReady`。
- 文件打开后的 `resolveFilePathDiffs` 由 `UnopenedDocumentDiffRuntime.start()` 订阅 editorStore 统一触发，不再依附 `EditorPanel` / `ChatMessages` / `ToolCallCard`。
- `ToolCallCard` 不再承担 `setFilePathDiffs` / `resolveFilePathDiffs` / `notifyDiffsReady`，避免兼容层继续参与主链 stage 推进。

### 8.3 批量操作（DiffAllActionsBar）的统一覆盖

`DiffAllActionsBar.handleAcceptAll` 和 `handleRejectAll` 已统一处理 byTab（`acceptAll`）和 byFilePath（`acceptFileDiffs/rejectFileDiffs`），两者在同一函数内顺序执行，不存在遗漏。

---

## 八、与现有文档关系

上游约束：
1. `A-CORE-C-D-05_状态单一真源原则.md` §6.5/§6.6/§6.7（shadow runtime 边界、推进主体规则）
2. `A-AG-M-T-04_Binder Agent技术主控文档.md` §5.3.4/§5.3.5（shadow runtime Agent 承接边界）
3. `A-DE-M-T-01_diff系统规则.md` §6.4/§6.5（execute_failed 事件与 DiffRetryController）

直接承接：
1. `A-AG-X-L-01_Binder Agent落地开发计划.md`（实现排期）

协同：
1. `A-CORE-C-D-02_产品术语边界.md` §3.6（stage_complete / invalidated / shadow runtime 术语）
