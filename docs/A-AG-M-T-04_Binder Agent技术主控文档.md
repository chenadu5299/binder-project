# Binder Agent技术主控文档

## 文档头

- 结构编码：`AG-M-T-04`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`Binder Agent技术主控文档 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`
- 直接承接：`AG-M-T-01`, `AG-M-T-02`, `AG-M-P-01`, `AG-M-T-03`, `AST-M-P-01`, `AG-X-L-01`
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`, `AG-M-T-01`
- 扩散检查：`AG-M-T-02`, `AG-M-T-03`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：30_capabilities / 03_ai执行系统 / Agent 技术主控  
> 对应描述文档：`A-AG-M-D-01_Binder Agent能力描述文档.md`  
> 对应落地计划：`A-AG-X-L-01_Binder Agent落地开发计划.md`  
> 关联指导参考：`R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`  
> 文档角色：Agent 技术控制文档之一，独立可读、独立可承接、独立可评审

---

## 一、文档定位与控制权威

### 1.1 文档定位

本文是 Binder Agent 的**技术主控文档**。  
本文用于回答以下问题：

1. `A-AG-M-D-01_Binder Agent能力描述文档.md` 中定义的能力边界应如何落成技术对象与技术控制点。
2. Agent 的状态、验证、确认、artifact、gate 应如何建模。
3. Agent 的逻辑运行模型应如何映射为可实现的运行结构。
4. 各专项文档与核心模块应如何承接 Agent 技术语义。

### 1.2 控制权威

在开发阶段，本文不是“技术说明摘要”，而是 Agent 的技术控制口径。  
如果 `R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md` 不存在，技术团队仍必须能够仅依赖 `A-AG-M-D-01_Binder Agent能力描述文档.md` + 本文 + `A-AG-X-L-01_Binder Agent落地开发计划.md` 完成：

1. 技术方案设计。
2. 对象命名与边界统一。
3. 状态、验证、确认、artifact 的技术落模。
4. 专项文档承接与实现分工。

### 1.3 本文不负责什么

本文不负责：

1. 具体代码最终落在哪个 commit。
2. sprint 级拆解与排期。
3. 当前代码现状逐文件解释。

这些内容由 `A-AG-X-L-01_Binder Agent落地开发计划.md` 和工程实现文档承接。

---

## 二、技术总目标

Binder Agent 的技术总目标，不是构建一个“会自动做事的模型容器”，而是构建一个具备以下能力的协作运行系统：

1. **状态可表达**：系统能表达任务所处阶段，而不是只依赖消息文本。
2. **验证可分层**：不同类型的验证有不同对象、不同责任方、不同结果语义。
3. **确认可托底**：用户确认不是自由文本猜测，而是被系统组织成明确动作。
4. **中间态可保存**：候选、diff、验证、确认等对象可以成为稳定 artifact。
5. **运行可门禁**：系统能在关键节点判断“能不能继续”，而不是把约束都交给 prompt。

---

## 三、描述主控 / 技术主控对应关系

| 描述主控能力模块 | 技术承接目标 | 本文节点 |
|---|---|---|
| 根定义与目标边界 | 架构层边界与禁止性约束 | §5.1 |
| 三元协作模型 | 职责标签、对象分层、输出边界 | §5.2 |
| 完成观与状态语义 | 状态对象、状态迁移、闭合判定接口 | §5.3 / §7 |
| 分层验证与确认 | 验证对象、确认对象、执行顺序 | §5.4 / §7 |
| 运行模型与 runtime gate | 逻辑流程、门禁、失败处理 | §6 / §7 |
| 左右能力场景 | 场景化入口和对象优先级 | §9 |
| 中间态资产化与项目沉淀 | artifact 结构、来源链、存储语义 | §8 |

### 3.1 编码承接总则

本文承接 `A-AG-M-D-01_Binder Agent能力描述文档.md` 时遵循统一编码原则：

1. `BA-*` 作为 Agent 上位规则主源。
2. `DE-*` 作为对话编辑专项规则主源。
3. `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` 的 `AX/PR/TC/TP` 仅用于各自模块新增规则。
4. 若本文中出现的技术约束本质上已由 `BA` 或 `DE` 定义，则技术承接时必须引用原规则 ID，不得另造同义规则。

---

## 四、技术架构总览

### 4.1 Binder Agent 的目标技术分层

| 层级 | 主要职责 | 典型对象 |
|---|---|---|
| 交互层 | 接收用户输入、显示候选与确认入口 | 输入事件、消息、diff 视图、确认面板 |
| 协作编排层 | 组织 plan -> execute -> verify -> confirm -> transition | Agent task、step、scene handler |
| 运行治理层 | gate、权限、作用范围、失败阻断、回退 | Gate decision、scope check、transition policy |
| 验证确认层 | 结构验证、约束验证、确认请求、确认结果 | Verification record、confirmation ticket |
| 资产上下文层 | plan、candidate、diff、memory seed、template seed | Artifact record、context package |
| 专项承接层 | prompt、tool、task planner、context injector 等 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md`、`A-AST-M-P-01_上下文注入.md` 承接点 |

### 4.2 总体技术原则

1. Agent 的核心状态不能只存在于消息文本里。
2. 用户确认不能只是一句“是否继续”的自然语言追问。
3. 验证结果不能与 AI 内容混合为一段不可区分的文本。
4. 高影响操作不能绕过 artifact、verification、confirmation 直接落到终态。

---

## 五、核心技术对象模型

## 5.1 根定义与目标边界的技术承接

**承接规则**：

1. BA-CORE-001
2. BA-CORE-002

### 5.1.1 技术边界

Agent 的技术架构必须支持三件事同时成立：

1. 用户始终可接管。
2. 系统始终可阻断。
3. AI 始终只是在协作链中承担生成与推进，而不是独占最终判定权。

### 5.1.2 禁止性约束

以下技术方案应直接判为不合格：

1. 直接把 AI 回复写入最终文档状态，不形成任何中间对象。
2. 直接用 `message.status = done` 代表任务完成。
3. 将系统验证结果写成 AI 文本的一部分，而不保留独立结构化结果。

## 5.2 三元协作模型的技术承接

**承接规则**：

1. BA-MODEL-001
2. BA-MODEL-002
3. BA-MODEL-003
4. BA-MODEL-004

### 5.2.1 责任标签模型

```ts
type AgentResponsibility = 'human' | 'ai' | 'system';

interface ResponsibilityTag {
  owner: AgentResponsibility;
  scope: string;
  note?: string;
}
```

### 5.2.2 责任落位要求

| 对象 | 默认责任方 | 说明 |
|---|---|---|
| 用户目标、目标修正 | `human` | 由用户输入或用户确认动作产生 |
| 候选内容、候选计划、候选修改 | `ai` | AI 产物，但不等于系统确认结果 |
| 状态快照、验证结果、门禁决策 | `system` | 必须与 AI 文本输出隔离 |
| 最终接受、拒绝、局部接受 | `human` + `system` | 用户动作触发，系统记录并产生状态跃迁 |

### 5.2.3 技术约束

1. 用户确认对象必须单独建模，不可混入一般消息文本。
2. 系统验证结果必须单独建模，不可伪装成 AI 回复摘要。
3. AI 输出若引用系统判定，必须引用结构化对象，而不是自行口头宣布。

## 5.3 完成观与状态语义的技术承接

**承接规则**：

1. BA-STATE-001
2. BA-STATE-002
3. BA-STATE-003
4. BA-STATE-004

### 5.3.1 状态对象

```ts
type AgentStageState =
  | 'draft'
  | 'structured'
  | 'candidate_ready'
  | 'constraint_satisfied'
  | 'review_ready'
  | 'user_confirmed'
  | 'refined'
  | 'stage_complete'
  | 'invalidated';

interface AgentStageSnapshot {
  id: string;
  taskId: string;
  state: AgentStageState;
  reason?: string;
  producedArtifactIds: string[];
  verificationIds: string[];
  pendingChecks: string[];
  pendingHumanDecisions: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 5.3.2 状态对象设计要求

1. 阶段状态必须与运行状态分离。
2. 阶段状态必须可追踪变更来源。
3. 阶段状态必须可以被 UI、context 注入、验证器、确认器共同消费。

### 5.3.3 运行状态与阶段状态的区别

| 类型 | 示例 | 作用 |
|---|---|---|
| 运行状态 | running、waiting_tool、streaming、failed | 描述执行过程 |
| 阶段状态 | structured、review_ready、stage_complete | 描述任务语义所处阶段 |

技术实现上，禁止用运行状态替代阶段状态。

## 5.4 分层验证与确认的技术承接

**承接规则**：

1. BA-VERIFY-001
2. BA-VERIFY-002
3. BA-VERIFY-003
4. BA-VERIFY-004
5. BA-VERIFY-005

### 5.4.1 验证对象

```ts
type VerificationLayer = 'structural' | 'constraint' | 'human_quality';
type VerificationStatus = 'pass' | 'warn' | 'fail' | 'needs_human';

interface VerificationItem {
  id: string;
  message: string;
  severity: 'info' | 'warn' | 'critical';
  relatedArtifactId?: string;
}

interface VerificationRecord {
  id: string;
  taskId: string;
  layer: VerificationLayer;
  status: VerificationStatus;
  summary: string;
  items: VerificationItem[];
  createdAt: string;
}
```

### 5.4.2 确认对象

```ts
type ConfirmationChoice = 'accept' | 'reject' | 'partial_accept' | 'refine';

interface ConfirmationTicket {
  id: string;
  taskId: string;
  targetArtifactIds: string[];
  scopeSummary: string;
  riskSummary: string[];
  suggestedChoices: ConfirmationChoice[];
  blockingIssues?: string[];
  createdAt: string;
}

interface ConfirmationResult {
  ticketId: string;
  choice: ConfirmationChoice;
  acceptedArtifactIds?: string[];
  rejectedArtifactIds?: string[];
  note?: string;
  createdAt: string;
}
```

### 5.4.3 技术约束

1. 结构验证和约束验证可由系统自动触发。
2. 用户质量判断不能被结构化 pass/fail 结果伪装替代。
3. 进入 `stage_complete` 前，必须存在对应确认结果或符合显式豁免规则。

---

## 六、逻辑运行模型的技术承接

### 6.1 逻辑流程

Binder Agent 的目标逻辑流程如下：

```text
plan
  -> execute
  -> verify
  -> confirm
  -> transition
```

这五个阶段必须能够在技术上被感知、记录和干预。

### 6.2 plan 阶段

**输入**：

1. 用户目标
2. 作用范围
3. 相关上下文
4. 约束条件

**输出**：

1. plan artifact
2. scope 信息
3. 初始阶段状态快照

**最小要求**：

1. 目标不清不能直接跳到 execute。
2. 范围不清不能直接生成高影响改动。

### 6.3 execute 阶段

**输入**：

1. plan artifact
2. 作用范围
3. 上下文包
4. 工具调用能力

**输出**：

1. candidate artifact
2. diff artifact
3. execution step 记录

**最小要求**：

1. 必须形成可见中间态对象。
2. 不允许高影响操作直接落终态。

### 6.4 verify 阶段

**输入**：

1. candidate/diff artifact
2. 任务约束
3. 结构规则

**输出**：

1. verification record
2. pending issue 清单

**最小要求**：

1. 结构失败不得进入确认。
2. 关键约束失败不得进入阶段闭合。

### 6.5 confirm 阶段

**输入**：

1. 确认票据
2. 范围摘要
3. 风险摘要
4. 候选与变更对象

**输出**：

1. confirmation result
2. refinement 指令或用户接受结果

**最小要求**：

1. 用户不应面对无整理的原始日志。
2. 用户必须能够局部接受、拒绝或要求 refinement。

### 6.6 transition 阶段

**输入**：

1. verification record
2. confirmation result 或豁免结果
3. 当前状态快照

**输出**：

1. 新状态快照
2. stage_complete 或 invalidated 等后续状态

**最小要求**：

1. 状态迁移必须可解释。
2. 不允许无依据进入 `stage_complete`。

---

## 七、状态迁移与 gate 系统

### 7.1 Gate 对象

```ts
type GateStatus = 'pass' | 'block' | 'warn';

interface GateDecision {
  gate: string;
  status: GateStatus;
  reason: string;
  relatedIds?: string[];
}
```

### 7.1.1 Gate 的运行时实现形态

在 Binder 中，gate 不应只存在于抽象说明里。  
gate 的运行时实现可以体现为：

1. permission check
2. pre-execution hook
3. validator
4. post-check hook
5. transition guard

无论采用哪种实现形态，都必须保留同一组 gate 语义，而不能退化为“只在 prompt 中提醒模型”。

### 7.2 最小 gate 集

| gate | 作用 | 典型阻断条件 |
|---|---|---|
| `permission_ready` | 检查是否具备执行当前动作的权限与批准条件 | 缺审批、权限不足、动作超出允许范围 |
| `target_scope_ready` | 检查目标和范围是否足够明确 | 目标模糊、范围缺失、对象缺失 |
| `context_ready` | 检查上下文是否足够 | 必要引用未装配、文档上下文缺失 |
| `artifact_emitted` | 检查是否已形成可见中间态 | 只有消息文本，没有 candidate/diff |
| `verification_ready` | 检查验证是否已执行 | 缺结构验证、缺约束验证 |
| `confirmation_ready` | 检查是否已准备低成本确认材料 | 缺范围摘要、缺风险提示、缺确认对象 |
| `transition_allowed` | 检查是否允许状态迁移 | 关键失败项未处理、确认未完成 |

### 7.3 状态迁移规则

| 当前状态 | 允许进入 | 不应直接进入 |
|---|---|---|
| `draft` | `structured`、`invalidated` | `review_ready`、`stage_complete` |
| `structured` | `candidate_ready`、`invalidated` | `user_confirmed`、`stage_complete` |
| `candidate_ready` | `constraint_satisfied`、`invalidated` | `stage_complete` |
| `constraint_satisfied` | `review_ready`、`invalidated` | `stage_complete` |
| `review_ready` | `user_confirmed`、`refined`、`invalidated` | `stage_complete` |
| `user_confirmed` | `refined`、`stage_complete` | `draft` |
| `refined` | `review_ready`、`stage_complete`、`invalidated` | `draft` |

### 7.4 技术反模式

以下做法属于状态与 gate 设计反模式：

1. 只用一个 `done` 布尔值表达复杂收口状态。
2. 只要工具调用返回成功就进入完成态。
3. 将 gate 只写在 prompt 里，而没有系统判断点。

---

## 八、中间态与 artifact 技术模型

### 8.1 Artifact 对象

```ts
type AgentArtifactType =
  | 'plan'
  | 'scope'
  | 'candidate'
  | 'diff'
  | 'verification'
  | 'confirmation'
  | 'report'
  | 'memory_seed'
  | 'template_seed';

interface AgentArtifactRecord {
  id: string;
  taskId: string;
  type: AgentArtifactType;
  scopeSummary: string;
  source: 'human' | 'ai' | 'system';
  status: 'active' | 'superseded' | 'rejected' | 'accepted';
  payloadRef?: string;
  derivedFromIds?: string[];
  createdAt: string;
}
```

### 8.2 Artifact 设计要求

1. 每个 artifact 必须能表达来源。
2. 每个 artifact 必须能表达作用范围。
3. 每个 artifact 必须能表达当前是否被接受、被替换、被废弃。
4. artifact 必须能被上下文系统、验证系统、确认系统共同引用。

### 8.3 为什么 artifact 不能只是日志

如果 artifact 只是日志，系统就无法：

1. 做稳定的确认对象。
2. 做稳定的状态追踪。
3. 做跨轮 refinement。
4. 做项目级沉淀和记忆复用。

---

## 九、场景化技术承接

### 9.1 左侧场景

左侧场景优先输出以下对象：

1. `plan`
2. `scope`
3. `risk summary`

技术上应优先保证：

1. 结构化输入。
2. 目标和范围的 gate。
3. 上下文装配质量。

### 9.2 中段场景

中段场景优先输出以下对象：

1. `candidate`
2. `diff`
3. `execution step`

技术上应优先保证：

1. 中间态可见。
2. 作用范围清晰。
3. 修改对象可局部接受。

### 9.3 右侧场景

右侧场景优先输出以下对象：

1. `verification`
2. `confirmation`
3. `memory seed`
4. `template seed`

技术上应优先保证：

1. 分层验证结果可消费。
2. 确认动作与状态迁移可追踪。
3. 阶段收口后可以沉淀。

### 9.4 三层 AI 交互的技术独立性约束

Binder 原始需求明确要求三层 AI 交互系统保持独立设计。  
这项要求在 Agent 新体系下继续有效，并且是技术主控的硬边界，而不是建议项。

技术约束如下：

1. 层次一、层次二、层次三必须保留独立入口。
2. 三层必须保留独立提示词主链，不允许因为 Agent 体系而合并为单一构建器。
3. 三层必须保留独立运行链，不允许默认串接。
4. 层次一、层次二默认不接入层次三的工具执行主链。
5. 层次二默认不接入层次三的 Diff 主链。
6. 层次三是完整 Agent 协作能力的主要承接位，但不得反向吞并层次一、层次二。

### 9.5 三层 AI 功能与 Agent 优化的实际影响矩阵

| 层次 | 原始技术定位 | 当前允许吸收的优化 | 当前不允许擅自改动的部分 |
|---|---|---|---|
| 层次一：辅助续写 | 单次、快速、无工具、独立提示词的候选生成路径 | 统一字段命名、统一错误暴露口径、统一上下文采集基础能力 | 不改成多阶段 Agent 链；不引入工具链；不引入对话编辑状态链 |
| 层次二：局部修改 | 独立弹窗、多轮但无历史持久化、局部执行路径 | 更明确的 `scope` 语义、更稳定的局部确认语义、上下文对象命名统一 | 不默认接入 Diff 主链；不默认接入工具链；不被改造成对话编辑子入口 |
| 层次三：对话编辑 | 工具驱动、流式回流、可承接复杂协作的完整入口 | 重点承接状态跃迁、分层验证、确认、artifact、gate | 仍需遵守对话编辑专项规则，不得被抽象文档反向覆盖 |

### 9.6 三层技术承接关系的正确理解

“承接”不等于“合并”，也不等于“运行时关系改变”。  
在技术层，三层与 Agent 总体系的关系应理解为：

1. 层次一、层次二、层次三共用上位术语和约束体系。
2. 各层只在明确需要时吸收 Agent 优化带来的局部技术能力。
3. 如果某项优化没有明确要求作用于层次一或层次二，则默认不进入这两层。
4. 层次三是当前最主要的 Agent 技术承接位。

### 9.7 三层误改的典型反模式

以下做法应直接判为不符合技术主控要求：

1. 以“统一 Agent 体系”为理由，把层次一改成层次三的简化版。
2. 以“统一确认语义”为理由，把层次二强行接到对话编辑 Diff 主链。
3. 以“统一状态语义”为理由，让层次一、层次二默认共享层次三的业务状态机。
4. 在没有独立决策和专项文档承接的前提下，改变层次一或层次二的交互逻辑。

---

## 十、与专项文档和工程模块的技术协同

### 10.1 主控文档组关系

1. `A-AG-M-D-01_Binder Agent能力描述文档.md` 负责定义能力边界与语义。
2. 本文负责定义技术对象与约束。
3. `A-AG-X-L-01_Binder Agent落地开发计划.md` 负责定义阶段承接与落地顺序。

### 10.2 与专项文档的承接关系

核心专项承接文档：

| 文档 | 应承接的内容 |
|---|---|
| `A-AG-M-T-01_ai执行架构.md` | Agent 在总体执行架构中的位置与分层关系 |
| `A-AG-M-T-02_prompt架构.md` | 如何让 prompt 构建消费状态、作用范围、验证与确认语义 |
| `A-AG-M-P-01_工具调用体系.md` | tool schema 如何消费 gate、artifact、scope 和确认边界 |
| `A-AG-M-T-03_任务规划执行.md` | 任务闭环如何从“完成判定”改写为“阶段闭合判定” |
| `A-AST-M-P-01_上下文注入.md` | context package 如何装配 plan、artifact、verification 和 scope |

扩展协同承接文档：

| 文档 | 应承接的内容 |
|---|---|
| `A-AST-M-T-01_记忆模型.md` | 哪些沉淀对象进入标签 / 项目 / 工作区 / 用户记忆，以及生命周期如何定义 |
| `A-AST-M-D-01_Binder Agent记忆协同主控文档.md` | 当前轮 artifact、对话记忆、记忆库之间的升格、检索与协同边界 |
| `A-AST-M-D-02_Binder Agent知识库协同主控文档.md` | 知识库作为用户主导知识资产时，如何与当前轮上下文、显式引用、自动检索协同 |
| `A-AST-M-T-02_知识库机制.md` | 知识库双库结构、导入替换删除、检索结果对象与状态 |
| `A-TMP-M-T-01_模板机制.md` | 工作流模板对象、调用机制、权限与涌现机制 |
| `A-AG-M-T-05_文档生成流程.md` | Agent 文档生成七步主链：输入归一、计划构建、上下文注入、内容生成、审阅修订、写入、导出与回流 |
| `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` | 模板作为用户主导约束资产时，如何与 Agent 协同而不越权启用 |

### 10.3 与工程模块的承接落位

| 模块 | 承接内容 |
|---|---|
| `src/stores/chatStore.ts` | 挂载 `taskId`、阶段快照、确认票据、流式事件与中间态对象引用 |
| `src/stores/diffStore.ts` | 消费 `diff` / `confirmation` / `stage_transition` 事件，维护业务接受态 |
| `src/components/Chat/ChatPanel.tsx` | 组织用户输入、确认入口、任务级展示槽位 |
| `src-tauri/src/commands/ai_commands.rs` | 作为 Agent 逻辑入口，传递 `task_id`、上下文包、工具定义与事件回流 |
| `src-tauri/src/services/context_manager.rs` | 构建 context package，装配 `stage/plan/scope/verification/confirmation` 摘要 |
| `src-tauri/src/services/tool_call_handler.rs` | 执行 gate 校验、重试策略、调用级状态推进 |
| `src-tauri/src/services/tool_service.rs` | 承接 tool 执行、artifact 回流、错误分级与结构化结果归一化 |
| `src-tauri/src/services/tool_definitions.rs` | 输出模型侧可见 schema，并与运行时字段保持一致 |
| 类型定义层 | 冻结 `AgentStageSnapshot`、`VerificationRecord`、`ConfirmationTicket`、`AgentArtifactRecord` 等结构化对象 |

### 10.4 Agent 运行时装配路径

```text
ChatPanel / chatStore.sendMessage
  -> ai_commands.rs::ai_chat_stream
  -> context_manager.rs 生成 AgentContextPackage
  -> provider.chat_stream(..., tool_definitions)
  -> tool_call_handler.rs 执行 gate / retry / dispatch
  -> tool_service.rs 返回 ToolExecutionResult + artifact meta
  -> ai_commands.rs 发出 verification / confirmation / stage_transition 事件
  -> chatStore / diffStore 消费并更新 UI 与业务状态
```

上面这条路径要求：

1. `task_id` 在前后端保持一致，不允许流式过程中丢失任务标识。
2. `stage_snapshot`、`verification`、`confirmation` 只能通过结构化对象回流，不允许退化成自然语言说明。
3. `diffStore` 只负责业务接受态，不负责生成 Agent 阶段语义。

### 10.5 Agent 技术主控代码骨架

前端任务态对象：

```ts
interface AgentTaskRuntimeState {
  taskId: string;
  stage: AgentStageSnapshot;
  activeArtifacts: AgentArtifactRecord[];
  verificationRecords: VerificationRecord[];
  confirmationTicket?: ConfirmationTicket;
  confirmationResult?: ConfirmationResult;
}
```

后端阶段迁移骨架：

```rust
fn transition_agent_stage(
    snapshot: &AgentStageSnapshot,
    verification: &[VerificationRecord],
    confirmation: Option<&ConfirmationResult>,
    gates: &[GateDecision],
) -> Result<AgentStageSnapshot, String> {
    ensure_transition_allowed(snapshot, verification, confirmation, gates)?;

    Ok(AgentStageSnapshot {
        id: snapshot.id.clone(),
        task_id: snapshot.task_id.clone(),
        state: AgentStageState::StageComplete,
        reason: Some("verification_passed_and_confirmation_resolved".to_string()),
        produced_artifact_ids: snapshot.produced_artifact_ids.clone(),
        verification_ids: verification.iter().map(|v| v.id.clone()).collect(),
        pending_checks: vec![],
        pending_human_decisions: vec![],
        created_at: snapshot.created_at.clone(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}
```

### 10.6 AgentContextPackage 装配骨架

```ts
interface AgentContextPackage {
  taskId: string;
  stageSnapshot: AgentStageSnapshot;
  activePlanSummary?: string;
  scopeSummary: string;
  artifactSummaries: Array<{ id: string; type: string; scopeSummary: string }>;
  verificationSummary?: string;
  confirmationSummary?: string;
  pendingGates: string[];
}
```

---

## 十一、技术评审否决条件

以下任一情况成立，都应直接判为不符合 Agent 技术主控要求：

1. 技术方案没有独立的状态对象。
2. 技术方案没有独立的验证对象。
3. 技术方案没有独立的确认对象。
4. 高影响执行路径不产生 artifact。
5. gate 只存在于 prompt 中，不存在于系统层。
6. `stage_complete` 可以在无确认、无验证的情况下产生。
7. 系统对象无法表达作用范围。

---

## 十二、MVP 验收口径

1. 本文本身已经足以说明 Agent 的状态、验证、确认、artifact、gate 和逻辑流程。
2. 技术团队阅读本文后，不依赖 `R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md` 也能完成对象命名和流程建模。
3. 本文与 `A-AG-M-D-01_Binder Agent能力描述文档.md` 存在一一对应关系，且 `A-AG-X-L-01_Binder Agent落地开发计划.md` 能继续承接。
4. 专项文档能够按本文口径接入状态、验证、确认和上下文对象。
5. 任何实现若违背本文否决条件，都能被明确指出并驳回。

---

## 十三、来源与背景

1. `A-AG-M-D-01_Binder Agent能力描述文档.md`：能力边界与语义模型来源。
2. `A-AG-X-L-01_Binder Agent落地开发计划.md`：阶段承接与实施顺序来源。
3. `R-AG-M-R-02_Binder-Agent约束与演化调研（中间态）.md`：runtime 与问题本质来源。
4. `R-AG-M-R-03_Binder-Agent前沿研究储备库（扩大研究）.md`：前沿架构与治理思路来源。
5. `R-AG-M-R-04_Binder-Agent补充研究：内容任务验证、阶段性完成与协作状态设计.md`：验证、状态跃迁、确认责任来源。
6. `R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`：方向性背景来源。
