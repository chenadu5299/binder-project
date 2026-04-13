# 任务规划执行

## 文档头

- 结构编码：`AG-M-T-03`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`任务规划执行 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`
- 直接承接：`AG-M-P-01`, `AG-X-L-01`
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`, `A-CBT-I-P-01`, `A-CBT-I-T-01`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`, `AG-M-T-01`
- 扩散检查：`AG-M-T-02`, `AG-M-T-04`, `A-CBT-I-P-01`, `A-CBT-I-T-01`, `A-AG-M-T-05`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档，尤其是 A-CBT-I-P-01、A-CBT-I-T-01、A-AG-M-T-05`

---
> 文档层级：30_capabilities / 03_ai执行系统 / 任务规划执行主控  
> 文档角色：任务闭环与收口控制文档  
> 上游主控：`A-AG-M-T-01_ai执行架构.md`、`A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`  
> 下游专项：`A-DE-M-D-01_对话编辑统一方案.md`、`A-CBT-I-P-01_Chat Build最小协议与状态.md`

---

## 一、文档定位与控制权威

### 1.1 文档定位

本文定义 Binder AI 系统中的**任务规划与执行闭环主链**。  
本文回答：

1. 一个任务如何从理解、规划、执行走到验证和结束决策。
2. 什么叫“任务完成”，什么叫“任务未完成但可继续”。
3. 步骤级、任务级、输出级验证如何成立。
4. 三层 AI 交互系统中，哪些层应承接完整任务闭环，哪些层只吸收局部规则。

### 1.2 控制权威

本文是任务闭环控制文档。  
本文不替代：

1. `A-AG-M-T-01_ai执行架构.md` 的总体执行架构。
2. `A-AG-M-T-02_prompt架构.md` 的提示词构建控制。
3. `A-AG-M-P-01_工具调用体系.md` 的工具运行时控制。
4. `A-AG-M-D-01_Binder Agent能力描述文档.md` 与 `A-AG-M-T-04_Binder Agent技术主控文档.md` 的 Agent 上位完成观与技术对象。

但在任务拆解、步骤验证、未完成处理、结束决策上，应以本文为准。

---

## 二、适用范围与基本立场

### 2.1 适用范围

1. 当前层次三：对话编辑主链
2. 当前 Chat Build 主线
3. 层次一、层次二在明确需要时吸收的局部闭环规则

### 2.2 基本立场

1. 本文定义任务闭环主链，不等于三层全部共享同一条任务主链。
2. 当前完整任务闭环主要服务层次三和当前 Chat Build。
3. 层次一、层次二只在明确需要时吸收局部规则。

---

## 三、规则 ID 体系

本文采用统一编码体系：

1. `TP-*`：本文本地规则
2. `BA-*`：复用 Agent 上位规则
3. `DE-*`：如需引用对话编辑专项规则，直接复用原 ID

| 规则域 | 含义 |
|---|---|
| `TP-CORE` | 本文定义的文档定位、适用范围、层次边界规则 |
| `TP-PLAN` | 任务理解与规划 |
| `TP-STEP` | 步骤对象与步骤验证 |
| `TP-VERIFY` | 任务级与输出级验证 |
| `TP-END` | 结束决策、未完成处理、阶段收口 |
| `TP-ERR` | 异常治理与恢复 |
| `TP-GOV` | 本文定义的与上下游文档的控制关系规则 |

### 3.1 规则承接矩阵

| 规则ID | 规则名称 | 本文主定义位置 | 下游承接文档 |
|---|---|---|---|
| TP-CORE-001 | 完整任务闭环主要服务层次三与 Chat Build | 4.1 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-X-L-01_Binder Agent落地开发计划.md` |
| BA-SCENE-006 | 新 Agent 优化不得在未明确决策前改写层次一/层次二运行逻辑 | 4.2 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-X-L-01_Binder Agent落地开发计划.md` |
| TP-PLAN-001 | 任务必须先理解目标、约束、对象、成功标准 | 5.1 | 层次三执行链 |
| TP-PLAN-002 | 任务拆解必须最小可执行 | 5.2 | 层次三执行链 |
| TP-STEP-001 | 每步必须有输入、动作、结果、状态 | 6.1 | 工具调用和执行链 |
| TP-STEP-002 | 步骤必须可追溯和可回放 | 6.2 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-P-01_工具调用体系.md` |
| TP-VERIFY-001 | 闭环判定必须包含目标达成、输出可验证、关键错误已处理 | 7.1 | 层次三闭环 |
| TP-VERIFY-002 | 自然语言总结不等于完成 | 7.1 | 层次三闭环 |
| TP-END-001 | 未完成必须暴露原因并生成下一步最小必要步骤 | 8.1 | 层次三闭环 |
| TP-END-002 | 禁止在未完成状态下直接输出已完成 | 8.1 | 层次三闭环 |
| TP-ERR-001 | 流式异常治理必须并入执行链 | 9.1 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-P-01_工具调用体系.md` |
| TP-ERR-002 | 可恢复与不可恢复异常必须区分处理 | 9.2 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-P-01_工具调用体系.md` |
| TP-GOV-001 | 本文不单独定义 Agent 上位完成观与验证语义 | 10.1 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md` |
| TP-GOV-002 | 本文可被层次三和 Chat Build 直接用于执行评审 | 10.2 | `A-AG-X-L-01_Binder Agent落地开发计划.md` |

### 3.2 编码使用说明

本文采用以下编码原则：

1. `BA-*` 用于复用 Agent 上位规则。
2. `TP-*` 只用于本文首次定义的任务闭环规则。
3. 本文不再为“层次一、层次二默认不进入完整任务主链”这类已被上位规则覆盖的边界另起同义 ID。

---

## 四、任务闭环适用边界

## 4.1 当前完整适用层

当前完整适用本文任务闭环主链的层次是：

1. 层次三：对话编辑
2. 当前 Chat Build

## 4.2 其他层的适用方式

| 层次 | 当前适用程度 | 说明 |
|---|---|---|
| 层次一：辅助续写 | 低 | 仅吸收最轻量的输入校验、异常治理、结果可观测规则 |
| 层次二：局部修改 | 中 | 可吸收局部范围确认、未完成暴露等局部闭环规则 |
| 层次三：对话编辑 | 高 | 承接完整规划、执行、验证、收口 |

### 4.3 不得误读的点

1. 有任务闭环文档，不等于层次一也必须先规划再执行。
2. 有未完成处理规则，不等于层次二必须升级成完整 Agent 主链。
3. 当前完整闭环主要服务复杂链路，而不是所有轻量交互。

---

## 五、任务理解与规划

## 5.1 任务理解

任务理解阶段必须至少回答：

1. 用户目标是什么。
2. 约束条件是什么。
3. 作用对象是什么。
4. 成功标准是什么。

若上述信息不清，不得直接宣称任务可结束。

## 5.2 任务规划

任务规划必须满足：

1. 最小可执行。
2. 可标注前置依赖。
3. 可标注预期产出。
4. 可标注完成条件。

规划对象最小结构如下：

```ts
interface TaskPlanRecord {
  id: string;
  taskId: string;
  goalSummary: string;
  constraintSummary: string[];
  scopeSummary: string;
  successCriteria: string[];
  steps: Array<{
    id: string;
    title: string;
    dependsOn?: string[];
    expectedArtifacts?: string[];
    doneWhen: string[];
  }>;
  createdAt: string;
}
```

规划器输出要求：

1. 不允许只产出泛化步骤名。
2. 每步必须能映射到执行动作、验证动作或确认动作。
3. 计划必须可被前端面板、上下文注入和执行器共同消费。

### 5.3 任务规划否决条件

以下方案应被否决：

1. 一个任务只拆成“大一步到位”。
2. 步骤无前置依赖。
3. 步骤无预期结果。

---

## 六、步骤对象与步骤验证

## 6.1 步骤最小结构

每一步至少必须有：

1. 输入
2. 动作
3. 结果
4. 状态

步骤对象最小结构如下：

```ts
type TaskStepStatus = 'success' | 'failed' | 'skipped';

interface TaskStepRecord {
  id: string;
  taskId: string;
  inputSummary: string;
  actionSummary: string;
  resultSummary: string;
  status: TaskStepStatus;
  producedArtifactIds?: string[];
  verificationIds?: string[];
  createdAt: string;
  updatedAt: string;
}
```

状态最少包含：

1. 成功
2. 失败
3. 跳过

## 6.2 步骤可追溯要求

1. 每步必须可追溯来源。
2. 每步必须可追溯到执行结果。
3. 每步至少步骤级可回放。

---

## 七、执行闭环验证

## 7.1 闭环判定规则

任务闭环判定必须同时满足：

1. 任务目标达成。
2. 输出可验证。
3. 无关键错误未处理。
4. 用户确认已完成，或存在显式豁免结果。

闭环判定输出最小结构如下：

```ts
type TaskClosureDecision =
  | 'stage_complete'
  | 'continue_execution'
  | 'blocked_waiting_human'
  | 'invalidated';

interface TaskClosureRecord {
  taskId: string;
  decision: TaskClosureDecision;
  verificationIds: string[];
  confirmationResultId?: string;
  waiverReason?: string;
  nextStepSummary?: string;
}
```

### 7.2 分层验证口径

1. 步骤级验证：检查每步输入/动作/结果/状态。
2. 任务级验证：聚合步骤结果，判断主目标是否达成。
3. 输出级验证：确保最终输出可追溯到步骤结果。

### 7.3 典型误判

以下都不等于任务完成：

1. 只有自然语言总结。
2. 只有部分步骤成功。
3. 工具返回了结果，但未检查是否满足目标。
4. 存在确认前置条件，但尚未完成确认或豁免。

---

## 八、未完成处理与结束决策

## 8.1 未完成处理

任务未完成时必须：

1. 标记未完成原因。
2. 生成下一轮最小必要步骤。
3. 明确说明当前为何不能进入结束态。

典型未完成原因包括：

1. 缺数据
2. 工具失败
3. 确认未通过
4. 冲突未解决

## 8.2 结束决策

结束决策只允许输出以下四类结果：

1. `stage_complete`：满足闭环条件，可进入本轮结束态。
2. `continue_execution`：继续下一轮执行，并附下一步最小必要步骤。
3. `blocked_waiting_human`：等待用户确认、补充信息或范围裁定。
4. `invalidated`：当前链路失效，需要回退并重建任务边界。

若未满足 `stage_complete` 条件，不得以自然语言总结替代正式结束决策。

### 8.3 结束决策否决条件

以下情况不得进入结束态：

1. 关键失败项仍悬置。
2. 输出不可验证。
3. 当前轮目标实际上未达成。
4. 应确认但未确认，且无显式豁免结果。

---

## 九、异常治理并入执行链

## 9.1 流式异常治理

1. 流式增量去重与拼接校验必须内建在执行链。
2. 工具调用参数跨 chunk 累积必须有完整性校验。
3. 空事件、重复 chunk、无效增量需统一过滤。

## 9.2 异常分类与策略

### 异常分类

1. 输入异常
2. 执行异常
3. 回流异常

### 处理策略

1. 可恢复异常：重试或降级继续。
2. 不可恢复异常：终止当前步骤并暴露原因。
3. 关键链路异常：进入统一错误观测与人工确认路径。

## 9.3 执行编排模块落位

| 职责 | 前端模块 | 后端模块 | 当前落位 |
|---|---|---|---|
| 任务入口 | `src/stores/chatStore.ts` | `src-tauri/src/commands/ai_commands.rs` | 对话编辑主链直接使用；Chat Build 当前以 chat 入口壳承接并复用该入口基础 |
| 计划生成 | `src/components/Chat/ChatPanel.tsx` | `src-tauri/src/services/context_manager.rs` + `src-tauri/src/commands/ai_commands.rs` | 由 L3 主链生成 plan artifact |
| 步骤执行 | `src/stores/chatStore.ts` | `src-tauri/src/services/tool_call_handler.rs`、`src-tauri/src/services/tool_service.rs` | 工具步骤、纯生成步骤共用 step record |
| 闭环判定 | `src/stores/diffStore.ts` | `src-tauri/src/commands/ai_commands.rs` | 汇总 verification / confirmation / error 形成 closure record |

## 9.4 标准执行路径

```text
用户消息
  -> 任务理解
  -> 生成 TaskPlanRecord
  -> 逐步执行 TaskStepRecord
  -> 汇总 VerificationRecord
  -> 生成 ConfirmationTicket
  -> 产生 ConfirmationResult / waiver
  -> 输出 TaskClosureRecord
  -> 决定 stage_complete / continue_execution / blocked_waiting_human / invalidated
```

对话编辑主链中的关键节点必须固定为：

1. `plan_emitted`
2. `step_started`
3. `step_finished`
4. `verification_ready`
5. `confirmation_ready`
6. `closure_decided`

## 9.5 规划与收口代码骨架

```rust
async fn run_agent_task(req: AgentTaskRequest) -> Result<TaskClosureRecord, String> {
    let plan = build_task_plan(&req)?;
    let mut step_records = Vec::new();

    for step in &plan.steps {
        let step_record = execute_task_step(step, &req).await?;
        step_records.push(step_record);
    }

    let verification_ids = verify_task_outputs(&step_records, &req).await?;
    let confirmation = resolve_confirmation_if_needed(&step_records, &req).await?;

    Ok(decide_task_closure(&plan, &step_records, &verification_ids, confirmation.as_ref())?)
}
```

## 9.6 计划内容设计示例

```json
{
  "goalSummary": "将当前文档第三节改写为更正式的项目汇报语气",
  "constraintSummary": ["只改第三节", "保留原有事实", "不得扩写为全文重写"],
  "scopeSummary": "current_file#section-3",
  "successCriteria": ["第三节完成改写", "Diff 可确认", "验证通过并完成确认"],
  "steps": [
    {
      "id": "step-1",
      "title": "抽取第三节范围并生成候选改写",
      "expectedArtifacts": ["scope", "candidate", "diff"],
      "doneWhen": ["已形成候选 diff"]
    },
    {
      "id": "step-2",
      "title": "执行结构与约束验证",
      "dependsOn": ["step-1"],
      "expectedArtifacts": ["verification"],
      "doneWhen": ["验证结果可消费"]
    },
    {
      "id": "step-3",
      "title": "发起用户确认并完成状态迁移",
      "dependsOn": ["step-2"],
      "expectedArtifacts": ["confirmation"],
      "doneWhen": ["closure decision 已输出"]
    }
  ]
}
```

---

## 十、与上下游文档的控制关系

## 10.1 上游控制边界

| 文档 | 关系 |
|---|---|
| `A-AG-M-D-01_Binder Agent能力描述文档.md` | 定义 Agent 完成观、阶段闭合、职责分层 |
| `A-AG-M-T-04_Binder Agent技术主控文档.md` | 定义状态、验证、确认、gate 等技术对象 |
| `A-AG-M-T-01_ai执行架构.md` | 定义总体执行分层 |

### 10.2 同级专项关系

| 文档 | 关系 |
|---|---|
| `A-AG-M-T-02_prompt架构.md` | `A-AG-M-T-02_prompt架构.md` 决定提示词构建，本文决定任务闭环 |
| `A-AG-M-P-01_工具调用体系.md` | `A-AG-M-P-01_工具调用体系.md` 决定单次工具执行可靠性，本文决定任务层编排与收口 |

### 10.3 下游消费关系

层次三执行链和当前 Chat Build，应直接消费本文关于：

1. 任务理解
2. 任务拆解
3. 闭环验证
4. 未完成处理
5. 结束决策

当本文被 Chat Build 复用时，还必须同时服从：

1. `BR-CBT-VERIFY-001`：大纲确认是正式构建前的硬边界。
2. `BR-CBT-STATE-001`：构建一旦开始不可语义改向。
3. `BR-CBT-ASSET-001`：当前构建只生成新的项目资源，不修改既有内容。

以上规则源头以 `A-CBT-I-P-01_Chat Build最小协议与状态.md` 为准，本文不再重复定义其控制语义。

---

## 十一、设计评审否决条件

以下任一情况成立，都应视为不符合任务规划执行主控要求：

1. 任务无目标和成功标准就开始执行。
2. 步骤不可追溯。
3. 自然语言总结直接被当作完成。
4. 未完成原因未暴露就直接结束。
5. 层次一、层次二在无独立决策前被强行拉入完整任务主链。

---

## 十二、MVP 验收口径

1. 任务执行可见“理解 -> 规划 -> 执行 -> 验证 -> 结束”完整链路。
2. 执行完成判定可复现，不依赖主观文本判断。
3. 流式与工具异常不会造成静默失败。
4. 未完成任务能给出下一步执行计划而非直接结束。
5. 本文本身足以独立控制任务规划执行逻辑板块。

---

## 十三、来源映射

1. `X-AG-M-R-19_提示词功能优化开发计划.md`
2. `R-DE-M-R-05_流式响应问题完整解决方案.md`
3. `A-AG-M-T-01_ai执行架构.md`
4. `A-AG-M-D-01_Binder Agent能力描述文档.md`
5. `A-AG-M-T-04_Binder Agent技术主控文档.md`
