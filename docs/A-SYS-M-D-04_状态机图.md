# 状态机图

## 文档头

- 结构编码：`SYS-M-D-04`
- 文档属性：`运行时地图 / 状态机层`
- 生成依据：代码事实（diffStore.ts, agentStore.ts, AgentTaskController.ts, DiffActionService.ts）
- 主索引：`A-SYS-M-D-01_当前实现运行时逻辑地图总览.md`
- 术语来源：`A-CORE-C-D-02_产品术语边界.md`

---

## 一、Diff 状态机

### 1.1 状态机图（byTab 路径 / DiffEntry）

```
                    ┌─────────────────────────────────────────────────────┐
                    │                byTab 路径 DiffEntry                   │
                    └─────────────────────────────────────────────────────┘

                               [创建]
                    tool_service resolve() 成功
                    → ToolResult.data.diffs[] 返回
                    → 前端 diffStore.addDiff(filePath, entry)
                                    │
                                    ▼
                           ┌──────────────┐
                           │   pending    │  ← 唯一初始状态
                           └──────┬───────┘
                                  │
              ┌───────────────────┼──────────────────────┐
              │                   │                      │
              ▼                   ▼                      ▼
   用户点击 Accept          用户点击 Reject         系统/外部触发 Expire
   DiffActionService        DiffActionService        markExpired /
   .acceptDiff()            .rejectDiff()            expirePendingForStaleRevision /
              │                   │                  外部文件修改 / 应用关闭确认
              │                   │                      │
              ▼                   ▼                      ▼
    ┌──────────────┐    ┌──────────────┐    ┌───────────────────────────┐
    │   accepted   │    │   rejected   │    │          expired          │
    │              │    │              │    │  expireReason:            │
    │ acceptedAt:  │    │              │    │  - document_revision_advanced
    │ number       │    │              │    │  - block_resolve_failed   │
    │ acceptedFrom │    │              │    │  - overlapping_range      │
    │ acceptedTo   │    │              │    │  - apply_replace_failed   │
    └──────────────┘    └──────────────┘    │  - stale_snapshot         │
                                            │  - (其他由 buildAcceptReadRow 产生) │
                                            └───────────────────────────┘

    ⚠️ 注：没有 execute_failed 作为独立状态
         execute_failed 是 DiffRetryController 管理的 事件/队列条目
         失败不会直接写 status: 'execute_failed'
         而是通过 DiffRetryController.handleFailedEvent → 可能后续 expire
```

**注意：`apply_replace_failed` 的路径不直接推进 expired**
- `DiffActionService.acceptDiff` 中 `applyDiffReplaceInEditor` 失败时：
  - 调用 `DiffRetryController.handleFailedEvent()`
  - **不直接改** `status: 'expired'`
  - 由 `DiffRetryController` 决定入队重试还是耗尽后 expire
  - 返回 `{ success: false, expireReason: 'apply_replace_failed' }`

### 1.2 状态定义表

| 状态 | 类型 | 含义 | 代码位置 |
|------|------|------|---------|
| `pending` | 业务状态 | diff 等待用户决策 | `diffStore.ts` `DiffEntryStatus` |
| `accepted` | 业务状态 | 用户已接受，已应用到编辑器 DOM | `diffStore.ts` |
| `rejected` | 业务状态 | 用户主动拒绝（不等于 verification failed） | `diffStore.ts` |
| `expired` | 业务状态 | 由系统判断失效（含多种原因） | `diffStore.ts` |

**不是独立状态的概念**：
- `execute_failed`：是事件/重试队列条目类型，不是 `DiffEntryStatus` 枚举值
- `retrying`：是 `DiffRetryController` 内部队列状态，不写入 `DiffEntry.status`
- `invalidated`：是 **Agent Task** 层级的状态，不是 Diff 的状态

### 1.3 事件表

| 事件 | 触发方 | 目标状态 |
|------|--------|---------|
| `acceptDiff(filePath, diffId)` | `DiffActionService.acceptDiff` | `pending → accepted` |
| `rejectDiff(filePath, diffId)` | `DiffActionService.rejectDiff` | `pending → rejected` |
| `updateDiff(..., {status:'expired', expireReason})` | `markExpired` / `expirePendingForStaleRevision` / `buildAcceptReadRow` 失败路径 | `pending → expired` |
| `expirePendingForStaleRevision(fp, revision)` | `editorStore.updateTabContent` 触发（documentRevision 变化时） | `pending → expired`（若 documentRevision 不匹配） |
| 外部文件修改确认（`ExternalModificationDialog`） | `EditorPanel.tsx` → `markExpired` per diffId | `pending → expired` |

### 1.4 状态推进主体表

| 状态推进 | 合法主体 | 实际代码中的越权路径 |
|---------|---------|-------------------|
| `pending → accepted` | `DiffActionService.acceptDiff / acceptAll` | 无越权（路径已收口） |
| `pending → rejected` | `DiffActionService.rejectDiff` | `ToolCallCard.tsx` 拒绝 FileDiffCard 时直接调 `diffStore.removeFileDiffEntry`（绕过 DiffActionService，但这是 byFilePath 条目非 DiffEntry） |
| `pending → expired` | 系统触发（revision 变化、外部修改、buildAcceptReadRow 失败）| 无越权 |
| `byFilePath 条目删除` | `diffStore.acceptFileDiffs / rejectFileDiffs` 或 `removeFileDiffEntry` | `ToolCallCard.tsx` 直接调 `diffStore.removeFileDiffEntry`（绕过 DiffActionService） |

### 1.5 byFilePath 路径的特殊说明

`byFilePath` 存储的 `FileDiffEntry` **无 `status` 字段**：

```typescript
// FileDiffEntry（workspace diff 池，无状态字段）
{
  original_text: string;  // 下划线风格
  new_text: string;
  diff_index: number;
  para_index: number;
  agentTaskId?: string;
  chatTabId?: string;
  messageId?: string;
}
```

- 条目存在 = pending
- 条目被 `acceptFileDiffs` 调用后删除 = accepted（写盘）
- 条目被 `rejectFileDiffs` / `removeFileDiffEntry` 调用后删除 = rejected（不写盘）
- `AgentTaskController.hasFileDiffsForAgentTask` 以"是否存在条目"判断是否 pending

---

## 二、Agent/Task 状态机

### 2.1 AgentTaskLifecycle 状态机

```
                    [sendMessage, agent mode]
                    chatStore.sendMessage 调用
                    createShadowTaskRecord
                            │
                            ▼
                    ┌───────────────┐
                    │     idle      │  ← 无任务时的初始态
                    └───────┬───────┘
                            │ setCurrentTask（新 task 创建）
                            ▼
                    ┌───────────────┐
                    │    active     │  ← task 执行中
                    └───────┬───────┘
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
      AgentTaskController  AgentTaskController  resetRuntimeAfterRestore
      checkAndAdvanceStage  forceInvalidate     或外部强制
      至少一个 accepted      全部 rejected/expired
              │             │              │
              ▼             ▼              ▼
       ┌──────────┐  ┌─────────────┐  ┌─────────────┐
       │completed │  │ invalidated │  │ invalidated  │
       └──────────┘  └─────────────┘  └─────────────┘
```

### 2.2 AgentStageName 状态机

```
                    [sendMessage, agent mode]
                            │
                            ▼
                    ┌───────────────┐
                    │     draft     │  ← setStageState('draft') 在 sendMessage 中
                    └───────┬───────┘
                            │ AI 返回结构化工作计划（WorkPlanCard 解析成功）
                            ▼
                    ┌───────────────┐
                    │  structured   │  ← 工作计划已解析（WorkPlanCard 场景）
                    └───────┬───────┘
                            │ AI 工具调用开始执行（contentBlocks 有结果）
                            ▼
                    ┌───────────────────┐
                    │  candidate_ready  │  ← 有工具执行结果待审查
                    └─────────┬─────────┘
                              │
              ┌───────────────┼─────────────────────────────────┐
              │               │（正式路径）                       │（越权路径）
              │               ▼                                  ▼
              │     AgentTaskController                 ChatMessages useEffect
              │     （无此 → review_ready 推进）         直接 setStageState('review_ready')
              │               │                                  │（⚠️ 越权）
              │               └───────────────┬──────────────────┘
              │                               ▼
              │                       ┌───────────────┐
              │                       │  review_ready  │  ← 待用户审查（setConfirmation: awaiting_user_review）
              │                       └───────┬────────┘
              │                               │ 用户 accept 至少一个 diff
              │                               ▼
              │                       ┌───────────────────┐
              │                       │  user_confirmed   │  ← confirmation: all_diffs_resolved
              │                       └───────┬───────────┘
              │                               │
              │                               ▼
              │                       ┌───────────────────┐
              │                       │   stage_complete  │  ← AgentTaskController 写入
              │                       └───────────────────┘
              │
              │ 全部 rejected/expired
              ▼
       ┌─────────────┐
       │ invalidated │  ← AgentTaskController.forceInvalidate
       └─────────────┘
       stageReason:
       - 'user_rejected_all'（全 rejected）
       - 'system_invalidated'（全 expired）
       - 'mixed_outcome'（mixed）
```

### 2.3 状态定义表

**AgentTaskLifecycle（lifecycle 字段）**

| 状态 | 含义 | 推进主体 |
|------|------|---------|
| `idle` | 无当前任务 | 初始值；task 完成后清理 |
| `active` | 任务执行中 | `chatStore.sendMessage` 创建新 task 时 |
| `completed` | 任务结束（至少一个 diff accepted） | `AgentTaskController.checkAndAdvanceStage` |
| `invalidated` | 任务失效（全 rejected/expired 或外部强制） | `AgentTaskController.forceInvalidate` |

**AgentStageName（stage 字段）**

| 状态 | 含义 | 推进主体 | 当前越权路径 |
|------|------|---------|------------|
| `draft` | 草稿阶段 | `chatStore.sendMessage` | 无 |
| `structured` | 工作计划已结构化 | `ChatMessages.tsx` useEffect | UI 直接写（越权） |
| `candidate_ready` | 候选结果就绪 | `ChatMessages.tsx` useEffect | UI 直接写（越权） |
| `review_ready` | 待用户审查 | `ChatMessages.tsx` useEffect | UI 直接写（越权，应由 AgentTaskController） |
| `user_confirmed` | 用户已确认 | `AgentTaskController`（via confirmation record） | — |
| `stage_complete` | 阶段完成 | `AgentTaskController.checkAndAdvanceStage` | — |
| `invalidated` | 阶段失效 | `AgentTaskController.forceInvalidate` | — |

**注意**：`draft → structured → candidate_ready → review_ready` 这条路径**当前完全由 `ChatMessages.tsx` useEffect 驱动**，绕过了 `AgentTaskController`。

### 2.4 AgentVerificationStatus / AgentConfirmationStatus（辅助状态）

| 字段 | 状态值 | 含义 |
|------|--------|------|
| `verification` | `pending_start` | 初始，等待开始 |
| `verification` | `in_progress` | 验证中 |
| `verification` | `passed` | 验证通过 |
| `verification` | `failed` | 验证失败（由 `markVerificationFailed` 写入） |
| `confirmation` | `awaiting_user_review` | 等待用户确认（UI 直接写） |
| `confirmation` | `confirmed`（`all_diffs_resolved`） | 已确认（AgentTaskController 写入） |

### 2.5 Shadow runtime 在状态机中的位置

```
新建 chat tab
  → agentStore.ensureRuntimeForTab
  → AgentRuntimeRecord {
      runtimeMode: 'shadow',   ← 所有 tab 默认 shadow
      currentTask: null,
      stageState: { stageName: 'idle' }
    }

sendMessage（agent mode）
  → createShadowTaskRecord → setCurrentTask
  → AgentRuntimeRecord {
      runtimeMode: 'shadow',   ← 仍为 shadow
      currentTask: { lifecycle: 'active', ... }
      stageState: { stageName: 'draft' }
    }

有 workflowExecution 时
  → setWorkflowExecution
  → runtimeMode 可能变为 'active'   ← 唯一变为 active 的路径
```

Shadow runtime 是**投影层**：
- 不驱动后端执行
- 只聚合 diff 状态变化后的裁决（通过 `AgentTaskController`）
- `runtimeMode: 'shadow'` 下不影响工具执行路径
- **注意**：`runtimesByTab` 不参与 Zustand persist，session 结束后全部清空

### 2.6 非法推进路径（当前实际越权点）

| 越权行为 | 位置 | 目标状态 | 风险 |
|---------|------|---------|------|
| `useAgentStore.setStageState('review_ready')` | `ChatMessages.tsx` useEffect | `candidate_ready → review_ready` | 可能在 diff 实际未就绪时触发 |
| `useAgentStore.setConfirmation('awaiting_user_review')` | `ChatMessages.tsx` useEffect | confirmation 变化 | 与 AgentTaskController 的 confirmation 写入可能重叠 |
| `agentStore.setWorkflowExecution` 由 UI 触发 | `AgentShadowStateSummary.tsx` | workflow 状态变化 | workflow 推进旁路 AgentTaskController |
| `resetRuntimeAfterRestore` 直接调 `setCurrentTask(invalidated)` | `agentStore.ts` | task → invalidated | 合法（外部强制），但路径与 forceInvalidate 重复 |

---

## 三、工作区/当前文档感知状态图

### 3.1 状态拥有权图

```
┌──────────────────────────────────────────────────────────────┐
│                   工作区状态来源层                              │
│                                                              │
│  fileStore.currentWorkspace  ←────── 单一真源                 │
│  （String | null）                                            │
│         │                                                    │
│         │ 派生（sendMessage 时读取）                            │
│         ▼                                                    │
│  chatStore tab.workspacePath ←─────── 快照（每次 sendMessage 同步）
│  （String | null）                                            │
│         │                                                    │
│         │ 锁入 invoke 参数                                     │
│         ▼                                                    │
│  ai_chat_stream 参数 workspacePath ←── 请求级快照（不可变）      │
│  （整个 stream 生命周期固定）                                    │
│         │                                                    │
│         │ 传递给                                              │
│         ▼                                                    │
│  tool_service 执行时的 workspacePath ←── 最终工具执行工作区      │
└──────────────────────────────────────────────────────────────┘

失同步场景：
  用户在 stream 运行中切换工作区
  → fileStore.currentWorkspace 更新
  → tab.workspacePath 在下次 sendMessage 时才同步
  → 当前 stream 的工具执行仍用旧工作区路径
```

### 3.2 当前文档状态来源层

```
┌──────────────────────────────────────────────────────────────┐
│                 当前文档状态来源层                              │
│                                                              │
│  editorStore.activeTabId ←─────── UI 焦点真源                 │
│         │                                                    │
│         ▼                                                    │
│  editorStore.tabs[activeTabId]                               │
│    .editor（TipTap Editor 实例）←── 编辑器 DOM 真源            │
│    .filePath                                                 │
│    .documentRevision ←──────────── revision 真源（单调递增）   │
│    .content（lastSavedContent 基准）                          │
│         │                                                    │
│         │ sendMessage 时                                      │
│         ▼                                                    │
│  positioningCtx.L = editor.getHTML() ←── 本轮 baseline（快照）  │
│         │                                                    │
│         ├── diffStore.setBaseline(filePath, L)               │
│         │                                                    │
│         └── invoke('ai_chat_stream', {                       │
│               currentEditorContent: L,                       │
│               documentRevision,                              │
│               baselineId,                                    │
│               ...})                                          │
└──────────────────────────────────────────────────────────────┘

getLogicalContent（已实现，当前未被主链调用）：
  = diffStore.baseline（快照 HTML）
  + 所有 acceptedAt >= baselineSetAt 的 accepted diff（ProseMirror 重放）
  当前等效于 positioningCtx.L（因为 accepted diff 已应用到编辑器 DOM）
```

### 3.3 可能失同步的关键路径

| 失同步场景 | 失同步的状态 | 根因 | 已有缓解措施 |
|-----------|------------|------|------------|
| Tab 切换后未 refresh baseline | `positioningCtx.L` 仍指向旧 tab | `sendMessage` 只在调用时读 activeTab | `refreshPositioningContextForEditor` 可手动刷新，但不自动触发 |
| 工作区切换后 stream 继续运行 | tool_service 工作区 vs fileStore 工作区 | invoke 参数已锁定 | 无缓解；需取消 stream 后再切换 |
| DOCX 重新打开后 blockId 变化 | diffStore 已有的 DiffEntry.startBlockId 失效 | Pandoc 每次解析生成新 blockId | `markExpired` 在外部文件修改时触发 |
| `documentRevision` 不同步 | `expirePendingForStaleRevision` 多余触发 | `updateTabContent` 触发 revision++，DiffAllActionsBar 也调 `updateTabContent` | 已有 `documentRevision` 比对守卫 |
| `byTab` 键为 filePath 但字段名误导 | 无运行时失同步，但认知失同步 | 历史命名遗留 | 无（字段名未改） |

### 3.4 当前文档 vs workspace 文档层 状态边界

```
                    ┌──────────────────────────────┐
                    │     当前文档事实层             │
                    │                              │
                    │  currentFile（文件路径）       │
                    │  currentEditorContent（HTML） │
                    │  selectedText                │
                    │  selection 块锚点             │
                    │  documentRevision            │
                    │  baselineId                  │
                    │                              │
                    │  最高优先级；直接参与 diff 定位│
                    └───────────────┬──────────────┘
                                    │ 相互独立，不合并
                    ┌───────────────▼──────────────┐
                    │   workspace 文档层（项目文档层）│
                    │                              │
                    │  file_cache（所有文件）        │
                    │  pending_diffs               │
                    │  file_dependencies           │
                    │                              │
                    │  通过 context_manager 注入    │
                    │  pending 文件列表 + 依赖关系   │
                    └───────────────┬──────────────┘
                                    │ 相互独立，不合并
                    ┌───────────────▼──────────────┐
                    │   知识增强层                   │
                    │                              │
                    │  knowledge_injection_slices  │
                    │  memory_context              │
                    │                              │
                    │  自动检索；不参与 diff 定位    │
                    └──────────────────────────────┘
```

---

## 四、工具执行确认状态机

### 4.1 确认门（Confirmation Gate）状态

部分工具（`delete_file`、`move_file`、`rename_file`、`create_folder`）有前置确认门：

```
工具调用到达
      │
      ▼
tool_service::execute_tool
      │
      │ 是确认门工具？
      ▼
┌─────────────┐   无 _confirmation_action 参数
│   需要确认   │──────────────────────────────► 返回 ToolResult {
└──────┬──────┘                                 success: false,
       │ 有 _confirmation_action: 'confirm'      meta: awaiting_confirmation }
       ▼
┌─────────────┐
│  正常执行   │──► ToolResult { success: true, ... }
└─────────────┘
       │ _confirmation_action: 'cancel'
       ▼
┌─────────────┐
│    取消     │──► ToolResult { success: false, cancelled: true }
└─────────────┘
```

前端 `AuthorizationCard` 处理 `awaiting_confirmation` 状态，用户确认后调 `invoke('execute_tool_with_retry', {_confirmation_action: 'confirm'})`。

---

## 五、DiffRetryController 状态机

### 5.1 重试队列条目状态

```
applyDiffReplaceInEditor 失败
      │
      ▼
DiffRetryController.handleFailedEvent({
  diffId, code: 'E_APPLY_FAILED',
  retryable: true, retryCount: 0
})
      │
      ▼
┌──────────────────┐
│  retry_queue 入队 │  ← retryCount < maxRetries
└─────────┬────────┘
          │ 重试触发（时机：用户下次操作 or 定时）
          ├─────────► applyDiffReplaceInEditor 再次尝试
          │                │
          │         成功   │ 失败
          │           │   │
          ▼           ▼   ▼
     queue 出队    accepted   retryCount++
     （_remove）
                       │ retryCount >= maxRetries
                       ▼
                  DiffEntry.status → expired
                  expireReason: 'apply_replace_failed'
```

**注**：`DiffRetryController` 的 maxRetries 及触发时机需进一步查看 `DiffRetryController.ts` 源码确认。上述为根据 `DiffActionService.ts` 调用方式推断的行为模型。
