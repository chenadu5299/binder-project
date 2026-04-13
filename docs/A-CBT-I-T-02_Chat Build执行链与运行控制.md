# Chat Build执行链与运行控制

## 文档头

- 结构编码：`CBT-I-T-02`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`定义 Chat Build 正式构建执行链、运行控制、状态推进与中断注入机制，作为最小可编码实现主文档`
- 上游约束：`CBT-M-D-01`, `CBT-M-T-01`, `CBT-I-P-01`, `CBT-I-D-01`, `CBT-I-T-01`
- 直接承接：`CBT-I-S-01`, `CBT-I-S-02`, `CBT-I-S-03`, `CBT-X-L-01`
- 接口耦合：`A-SYS-C-T-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-WS-M-D-01_workspace工作台协同主控文档.md`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-L-01`
- 扩散检查：`A-CBT-I-S-01`, `A-CBT-I-S-02`, `A-CBT-I-S-03`, `A-CBT-X-L-01`, `A-CBT-I-T-01`, `A-CBT-I-D-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`
- 变更要求：`修改本文后，必须复核：A-CBT-I-S-01、A-CBT-I-S-02、A-CBT-I-S-03、A-CBT-X-L-01、A-CBT-I-T-01、A-CBT-I-D-01、A-TMP-M-D-02、A-AG-M-T-03、A-AG-M-T-05`
- 使用边界：`只定义当前版本最小运行链与控制机制，不展开未来多角色、多房间或独立协作系统`

---

## 一、文档定位

本文是 Chat Build 当前版本的**执行链实现主文档**。

它直接回答：

1. Chat Build 从 chat 输入到正式构建完成的完整事件流是什么。
2. 每个节点的输入、输出、触发条件、调用方、被调用对象是什么。
3. 状态存在哪里，谁负责推进，UI 如何订阅变化。
4. 中断从哪里注入，如何传播，如何结束本轮运行。

本文不替代：

1. `A-CBT-I-P-01` 的规则源头与最小协议。
2. `A-CBT-I-T-01` 的控制对象与验收边界。
3. `A-CBT-I-S-*` 的专项细节。

当前规则源头统一以 `A-CBT-I-P-01` 中的 `BR-CBT-*` 为准。

## 二、最小运行目标

当前版本的最小可运行目标是：

1. 在现有 chat 表面上识别或触发构建意图。
2. 生成并展示 Build Outline。
3. 经确认后启动单主控正式构建。
4. 以步骤循环推进执行。
5. 只向 workspace 写入新增资源。
6. 在 `completed` / `failed` / `interrupted` 三种结束态中结束本轮运行。

本文严格受以下规则约束：

1. `BR-CBT-VERIFY-001`
2. `BR-CBT-STATE-001`
3. `BR-CBT-ASSET-001`
4. `BR-CBT-STATE-002`
5. `BR-CBT-MODEL-001`
6. `BR-CBT-RUN-002`
7. `BR-CBT-DATA-001`

## 三、完整执行链总览

当前版本的正式执行链必须按以下顺序成立：

```text
chat 输入
→ intent 识别
→ intent_pending
→ outline_drafting（调用 AI）
→ outline_pending_confirm
→ confirm
→ building（启动执行）
→ step 执行循环
→ workspace 写入
→ completed / interrupted / failed
```

更细的运行视图如下：

```text
onUserMessage()
  → detectBuildIntent()
  → createBuildIntent()
  → updateState(intent_pending)
  → generateOutline()
  → updateState(outline_drafting)
  → callLLM()
  → receiveOutline()
  → updateState(outline_pending_confirm)
  → confirmOutline()
  → lockIntent()
  → startBuildRun()
  → updateState(building)
  → for step in outline.steps:
        checkInterrupt()
        executeStep(step)
        checkInterrupt()
        writeWorkspace(stepResult)
        updateStepState()
  → finalizeRun()
  → updateState(completed | interrupted | failed)
```

## 四、节点级执行链定义

| 节点 | 输入 | 输出 | 触发条件 | 调用方 | 被调用对象 | 是否可中断 | 状态更新 |
|---|---|---|---|---|---|---|---|
| `chat_input` | 用户消息、按钮点击、引用输入 | 普通对话处理或构建意图候选 | chat 中出现新输入 | chat 交互层 | `detectBuildIntent` | 否 | 不改状态或保持 `discussion` |
| `detect_build_intent` | 当前消息、最近上下文、显式 UI 动作 | `BuildIntent` 或空 | 显式构建指令 / 按钮 / 意图识别命中 | chat 交互层 | Chat Build 控制层 | 否 | 命中后进入 `intent_pending` |
| `intent_pending` | `BuildIntent` | 是否进入大纲阶段的决定 | 构建意图成立 | Chat Build 控制层 | chat 交互层 | 否 | `discussion -> intent_pending` |
| `outline_drafting` | `BuildIntent`、引用输入、模板约束 | `BuildOutlineDraft` | 用户确认进入大纲阶段 | Chat Build 控制层 | LLM 调用器 + template runtime | 否，不支持中断，只支持失败/返回讨论 | `intent_pending -> outline_drafting` |
| `outline_pending_confirm` | `BuildOutlineDraft` | `OutlineConfirmationResult` | 大纲生成成功 | Chat Build 控制层 | chat 交互层 | 否 | `outline_drafting -> outline_pending_confirm` |
| `confirm_outline` | 用户确认结果 | 启动构建或返回讨论 | 用户显式确认 / 修改 / 取消 | chat 交互层 | Chat Build 控制层 | 否 | `outline_pending_confirm -> building` 或返回 `discussion` |
| `build_start` | 已确认大纲、运行上下文 | `BuildRunContext` | 进入正式构建 | Chat Build 控制层 | Build Runner | 是，从该节点之后允许中断 | `outline_pending_confirm -> building` |
| `step_loop` | `BuildRunContext`、当前步骤 | 步骤结果、步骤状态 | 正式构建运行中 | Build Runner | step executor / LLM / template runtime | 是 | 保持 `building`，更新进度与步骤状态 |
| `workspace_write` | 步骤产出、写入计划 | 写入结果、资源索引 | 某一步完成且需要落盘 | Build Runner | workspace writer | 是，但只能在写前/写后协作中断，不做半写回滚 | 保持 `building`，更新 artifact / run progress |
| `finalize` | 运行结果、中断标志、错误信息 | `BuildTerminationResult` | 步骤完成 / 中断命中 / 不可恢复错误 | Chat Build 控制层 | task / artifact 持久层 + chat 交互层 | 不适用 | `building -> completed / interrupted / failed` |

## 五、状态流转机制

### 5.1 状态分层

当前版本状态必须拆成三层：

1. `UI Store`  
负责当前 chat/build 面板展示态与订阅态。

2. `Runtime Memory`  
负责当前正在运行的 BuildRunContext、步骤迭代器、中断标志。

3. `Durable Record`  
负责可恢复的运行结果、步骤状态、结束态、artifact 索引。

### 5.2 状态应存放在哪里

| 状态/对象 | 建议存放层 | 原因 |
|---|---|---|
| 当前 chat 显示状态 | 前端 store | UI 立即响应 |
| 当前 `BuildIntent` | 前端 store + 控制层内存 | 触发期需要快速变更，不要求先持久化 |
| `BuildOutlineDraft` | 前端 store + durable record | 需要用于确认和回看 |
| `building` 运行上下文 | 后端运行内存 | 包含执行循环与中断信号 |
| 步骤状态、进度、结束态 | durable record | 供 UI 订阅与结果查看 |
| 已写入资源索引 | durable record + workspace 元信息 | 供结果展示与后续编辑使用 |

### 5.3 谁负责推进状态

| 状态推进责任 | 负责对象 |
|---|---|
| `discussion -> intent_pending` | chat 交互层触发，Chat Build 控制层确认 |
| `intent_pending -> outline_drafting` | Chat Build 控制层 |
| `outline_drafting -> outline_pending_confirm` | Chat Build 控制层 |
| `outline_pending_confirm -> building` | Chat Build 控制层，必须校验显式确认 |
| `building` 内部进度推进 | Build Runner |
| `building -> interrupted/completed/failed` | Chat Build 控制层根据 Runner 结果推进 |

### 5.4 UI 如何订阅状态变化

当前版本推荐最小订阅机制：

1. 前端 store 保存当前 `ChatBuildSessionState`。
2. 后端在每次状态推进、步骤完成、写入完成、结束态成立时，回写 durable record。
3. 前端通过统一状态查询或事件推送刷新 `ChatBuildSessionState`。
4. UI 只消费状态快照，不自行推导状态跃迁。

最小订阅对象应包括：

1. 当前主状态
2. 当前步骤索引
3. 当前步骤摘要
4. 总进度
5. 结束态
6. 中断标志
7. 已生成资源索引

## 六、实现级调用链

### 6.1 chat 输入到构建意图

```ts
function onUserMessage(input: ChatInput) {
  const intent = detectBuildIntent(input, currentDiscussionContext);

  if (!intent) {
    return continueDiscussion(input);
  }

  buildStore.setIntent(intent);
  buildStore.setState("intent_pending");
  return openIntentConfirmation(intent);
}
```

### 6.2 大纲生成链

```ts
async function generateOutline(intent: BuildIntent) {
  assertCurrentState("intent_pending");

  buildStore.setState("outline_drafting");

  const outlineInput = assembleOutlineInput({
    intent,
    references: selectedReferences,
    templateConstraint: selectedWorkflowTemplate,
  });

  const outline = await callLLMForOutline(outlineInput);

  durableRecord.saveOutline(outline);
  buildStore.setOutline(outline);
  buildStore.setState("outline_pending_confirm");

  return outline;
}
```

### 6.3 大纲确认到正式构建启动

```ts
function confirmOutline(result: OutlineConfirmationResult) {
  assertCurrentState("outline_pending_confirm");

  if (result.type === "return_to_discussion") {
    buildStore.resetToDiscussion();
    return;
  }

  if (result.type === "revise_outline") {
    buildStore.setState("outline_drafting");
    return regenerateOutline();
  }

  lockIntent();
  return startBuild();
}
```

### 6.4 正式构建运行链

```ts
async function startBuild() {
  assertCurrentState("outline_pending_confirm");
  assertOutlineConfirmed();

  const run = createBuildRunContext({
    outline: buildStore.outline,
    interruptSignal: createInterruptSignal(),
  });

  runtimeRegistry.attach(run);
  durableRecord.markBuilding(run.id);
  buildStore.setState("building");

  return runBuild(run);
}

async function runBuild(run: BuildRunContext) {
  for (const step of run.outline.steps) {
    run.checkInterrupt();

    const stepResult = await executeStep(step, run);

    run.checkInterrupt();

    if (stepResult.shouldWrite) {
      await workspaceWriter.write(stepResult.writePlan, run);
    }

    durableRecord.updateStep(step.id, stepResult);
    buildStore.updateProgress(step.id, stepResult);
  }

  return finalizeCompleted(run);
}
```

### 6.5 结束态回写

```ts
function finalizeCompleted(run: BuildRunContext) {
  durableRecord.markCompleted(run.id);
  buildStore.setState("completed");
  runtimeRegistry.detach(run.id);
}

function finalizeFailed(run: BuildRunContext, error: Error) {
  durableRecord.markFailed(run.id, error);
  buildStore.setState("failed");
  runtimeRegistry.detach(run.id);
}

function finalizeInterrupted(run: BuildRunContext) {
  durableRecord.markInterrupted(run.id);
  buildStore.setState("interrupted");
  runtimeRegistry.detach(run.id);
}
```

## 七、中断注入点

### 7.1 哪些节点允许中断

当前版本只有 `building` 态允许正式中断。

因此：

1. `discussion`
2. `intent_pending`
3. `outline_drafting`
4. `outline_pending_confirm`

都不走“中断”，而走“返回讨论 / 取消 / 重新生成大纲”。

### 7.2 中断注入点

中断必须在以下位置进行协作注入：

1. 每个步骤开始前
2. 单步 AI 调用返回后、写入前
3. workspace 写入完成后、进入下一步前
4. finalize 前

长耗时调用必须支持：

1. 查询 interrupt signal
2. 在安全点提早返回

### 7.3 中断传播路径

```text
UI 中断按钮
→ Chat Build 控制层 set interrupt_requested = true
→ Build Runner 在下一安全点 checkInterrupt()
→ 停止调度新 step
→ 当前运行进入 finalizeInterrupted()
→ durable record 标记 interrupted
→ UI 刷新为 interrupted
```

### 7.4 中断后的状态回写

中断命中后必须完成以下动作：

1. 停止调度未开始的步骤。
2. 不再接受新的自然语义改向进入当前运行。
3. 回写 `interrupted` 结束态。
4. 保留已完成步骤与已写入资源索引。
5. UI 回到“结束态可查看 + 返回讨论”的模式。

专项细节见：

1. `A-CBT-I-S-02_构建中断机制`
2. `A-CBT-I-S-01_Workspace写入策略与资源边界`

## 八、与专项文档的分工

1. `A-CBT-I-S-01` 继续细化 workspace 写入策略、命名规则、冲突处理与 partial build 标记。
2. `A-CBT-I-S-02` 继续细化中断触发、传播、步骤残留与结束态回写。
3. `A-CBT-I-S-03` 继续细化构建前 / 构建中 / 构建后的 chat 与 build 接管机制。

## 九、最小可实现结论

开发要写出最小运行骨架，至少应先实现以下对象：

1. `ChatBuildController`
2. `ChatBuildStateStore`
3. `BuildRunner`
4. `WorkspaceBuildWriter`
5. `BuildInterruptSignal`

只要这 5 个对象能按本文的调用链与状态推进关系工作，就能先做出当前版本的最小可运行 Chat Build。
