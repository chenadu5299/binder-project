# Binder模板库技术主控文档

## 文档头

- 结构编码：`TMP-M-T-02`
- 文档属性：`主结构`
- 主责模块：`TMP`
- 文档职责：`Binder模板库技术主控文档 / 技术架构、主链规则、对象体系与专项承接总入口`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `AG-M-T-04`, `WS-M-D-01`, `TMP-M-D-01`, `TMP-M-D-02`, `TMP-M-T-01`
- 直接承接：`TMP-M-D-01`, `TMP-M-D-02`, `TMP-M-T-01`
- 接口耦合：`AG-M-T-05`, `AST-M-D-02`, `AST-M-D-03`, `AST-M-P-01`, `WS-M-D-01`, `BLD-I-P-02`, `BLD-M-D-01`
- 汇聚影响：`TMP-M-S-01`, `TMP-M-S-02`, `TMP-M-T-01`, `CORE-C-R-01`
- 扩散检查：`TMP-M-T-01`, `TMP-M-S-01`, `TMP-M-S-02`, `AG-M-T-05`, `AST-M-P-01`, `BLD-I-P-02`, `WS-M-D-01`
- 使用边界：`定义模板库技术主链、对象体系、执行协同、规则映射与专项分工；不直接承担数据库定稿、UI 视觉稿与开发排期`
- 变更要求：`修改本文后，必须复核：TMP-M-D-01、TMP-M-D-02、TMP-M-T-01、TMP-M-S-01、TMP-M-S-02、AG-M-T-05、AST-M-P-01、BLD-I-P-02、WS-M-D-01`
- 规则映射要求：`本文规则统一使用 TT-CORE-* / TT-OBJ-* / TT-COMP-* / TT-RUN-* / TT-INT-*；专项文档必须引用本文对应主规则`

---
> 文档层级：30_capabilities / 06_模板库系统 / 技术主控  
> 上游主控：`A-TMP-M-D-01_Binder Agent模板协同主控文档.md`、`A-TMP-M-D-02_Binder模板库模块描述文档.md`  
> 技术基础：`A-TMP-M-T-01_模板机制.md`  
> 专项拆分：`A-TMP-M-S-01_工作流模板结构解析与流程编译规范.md`、`A-TMP-M-S-02_统一执行模型与运行时状态规范.md`

---

## 一、文档定位与控制权威

本文是 Binder 模板库体系的**技术总控文档**。

本文负责：

1. 把 `A-TMP-M-D-02_Binder模板库模块描述文档.md` 的模块定位与运行语义落成技术主链。
2. 把 `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` 的协同边界落成可实现的技术边界。
3. 建立工作流模板从用户表达层到结构解析、流程编译、运行时 plan、执行协同、状态暴露的统一技术路线。
4. 建立模板库模块内部对象、子层、接口、状态边界、失败恢复与专项拆分关系。
5. 为后续实现文档、开发计划与代码实现提供统一入口。

本文不替代：

1. `A-TMP-M-D-02_Binder模板库模块描述文档.md` 的模块定位与否决条件。
2. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` 的用户主导与协同优先级裁定。
3. `A-TMP-M-T-01_模板机制.md` 的机制基础定义。
4. `A-TMP-M-S-01_工作流模板结构解析与流程编译规范.md` 与 `A-TMP-M-S-02_统一执行模型与运行时状态规范.md` 的专项冻结细则。

---

## 二、冻结前提与不可改写约束

以下约束已由上游文档冻结，本文只允许承接，不得改写：

1. 模板库当前唯一对象类型是工作流模板。
2. 模板库只承接过程约束，不承接内容、证据、结构参考、行为定义。
3. 文档范本类能力归知识库中的结构型资产，不属于模板库。
4. skills、prompt、rules、行为定义层、风格层不得借壳回流。
5. 工作流模板不是 graph 产品，不以节点链作为用户表达层。
6. 工作流模板不是普通 md 文本，也不是自由 prompt。
7. 工作流模板必须同时承接用户表现层、结构语义层、执行映射层。
8. 原始模板文档不得直接进入执行，必须先经过结构解析与流程编译。
9. 工作流模板不是独立执行器，不提供独立运行入口。
10. 工作流执行采用统一执行模型。
11. 连续推进、受限推进、人工介入是运行时隐性状态，不是显式模式系统。
12. 默认不采用逐步确认式执行，但用户始终保有介入权。
13. 工作流模板仅由用户创建。
14. 不存在模板涌现生成、自动保存为模板、自动沉淀入库的主链机制。

---

## 三、规则编号体系

本文采用以下规则域：

| 规则域 | 含义 | 主落点 |
|---|---|---|
| `TT-CORE-*` | 模板库技术主控总规则 | 本文 |
| `TT-OBJ-*` | 模板对象、状态与生命周期规则 | 本文 / `TMP-M-T-01` |
| `TT-COMP-*` | 结构解析、流程编译、编译产物规则 | `TMP-M-S-01` |
| `TT-RUN-*` | 运行时 plan、统一执行模型、失败恢复、可观测规则 | `TMP-M-S-02` |
| `TT-INT-*` | 与 AG / AST / WS / BLD 的接口协同规则 | 本文 |

### 3.1 主控规则矩阵

| 规则ID | 含义 | 承接来源 | 落点文档 | 扩散检查 |
|---|---|---|---|---|
| `TT-CORE-001` | 模板库只允许存在工作流模板一种主对象 | `TMP-M-D-02` §3 | 本文 / `TMP-M-T-01` | `WS-M-D-01`, `AST-M-D-02` |
| `TT-CORE-002` | 模板库只承接过程约束，不承接内容、结构或行为定义 | `TMP-M-D-02` §4/§10 | 本文 / `TMP-M-T-01` | `AST-M-P-01`, `BLD-I-P-02` |
| `TT-CORE-003` | 原始模板文档不得直接进入执行，必须先解析再编译 | `TMP-M-D-02` §6.6-§6.7 | 本文 / `TMP-M-S-01` | `AG-M-T-05`, `BLD-I-P-02` |
| `TT-CORE-004` | 执行采用统一执行模型，三类状态是隐性状态不是显式模式 | `TMP-M-D-02` §8 | 本文 / `TMP-M-S-02` | `WS-M-D-01` |
| `TT-CORE-005` | 模板仅由用户创建，不存在涌现入库链路 | `TMP-M-D-02` §13 | 本文 / `TMP-M-T-01` | `TMP-M-D-01` |
| `TT-CORE-006` | 模板不是独立执行器，执行主控始终是 Agent | `TMP-M-D-02` §7/§9 | 本文 / `TMP-M-S-02` | `AG-M-T-05`, `BLD-M-D-01` |

---

## 四、模板库技术总体架构

### 4.1 模板库在 Binder 全局系统中的位置

模板库位于 Binder 全局系统中的“过程约束资产层”和“执行协同层”之间。

它既不是单纯的存储系统，也不是独立的执行系统，而是：

1. 对用户暴露为工作流模板资产模块。
2. 对 Agent 暴露为可编译、可绑定、可约束执行的流程协议源。
3. 对 workspace / workbench 暴露为创建、编辑、选择、引用、观测的工作环境入口。
4. 对构建模式暴露为规划与执行约束输入源。

### 4.2 依赖关系

模板库模块依赖：

1. WS：提供工作环境、项目上下文、模板入口与状态展示位。
2. AG：提供运行时主控、plan 映射、执行推进与结果收口。
3. AST：提供事实知识与结构型资产的上下文补强，保证结构参考与过程约束不混层。
4. BLD：作为模板库在构建态下的消费方之一。

依赖模板库的模块：

1. AG 文档生成与任务执行主链。
2. WS 工作台中的模板创建、编辑、选择与状态展示。
3. BLD 构建模式中的 build outline 规划链。

### 4.3 固定技术分层

模板库技术架构采用以下固定分层：

1. **模板资产层**
   - 承接 `WorkflowTemplate` 及其元信息、状态、版本。
2. **模板编辑 / 存储层**
   - 承接用户文档表达层对象、编辑校验、持久化写入。
3. **结构解析层**
   - 承接从用户表达层到结构语义层的提取。
4. **流程编译层**
   - 承接从解析结果到结构化流程表示的构造与校验。
5. **运行时映射层**
   - 承接编译结果到 `RuntimeWorkflowPlan` 的任务绑定。
6. **执行协同层**
   - 承接 Agent 消费、步骤推进、风险控制与人工介入挂接。
7. **可观测状态层**
   - 承接阶段、步骤、受限推进状态、等待介入状态等运行信息。
8. **接口协同层**
   - 承接与 AG / AST / WS / BLD 的读取、绑定、消费协议。

### 4.4 总体主链

```text
用户创建 / 编辑工作流模板
  -> WorkflowTemplateDocument 持久化
  -> 结构解析
  -> ParsedWorkflow
  -> 流程编译
  -> CompiledWorkflow
  -> TemplateReference / TemplateBinding 绑定到当前任务
  -> RuntimeWorkflowPlan 生成
  -> Agent 在统一执行模型下推进
  -> ExecutionState / StepState 持续更新
  -> 可观测状态暴露给 workspace / chat / task UI
```

### 4.5 技术边界

1. 模板资产层不直接负责运行时执行。
2. 结构解析层不负责业务推理。
3. 流程编译层不负责上下文注入排序。
4. 运行时映射层不重写模板原始语义，只绑定任务上下文。
5. 执行协同层不把模板偷换成行为定义层。
6. 可观测状态层不等于显式模式系统。

---

## 五、核心功能点与技术路线

### 5.1 工作流模板资产创建

**功能职责**

1. 接收用户创建模板请求。
2. 生成模板资产身份与归属关系。
3. 持久化保存用户表达层模板文档。

**技术目标**

1. 模板成为稳定、可管理、可引用的用户资产。
2. 模板创建与任务实例解绑，不依赖当前一次运行结果沉淀。

**输入**

1. 用户输入的模板名称、描述、表达内容。
2. 当前 workspace / project 上下文。

**输出**

1. `WorkflowTemplate`
2. `WorkflowTemplateDocument`

**核心数据对象**

1. `WorkflowTemplate`
2. `WorkflowTemplateDocument`

**核心处理链路**

```text
create template request
  -> create WorkflowTemplate identity
  -> persist WorkflowTemplateDocument
  -> write metadata / ownership / status
```

**协作点**

1. WS 提供创建入口。
2. TMP 负责资产生成与保存。

**技术约束 / 不变量**

1. 模板来源只能是用户创建。
2. 创建完成后不得自动进入执行，必须经过显式引用或选择。

### 5.2 工作流模板编辑

**功能职责**

1. 支持用户编辑模板表达层内容。
2. 触发解析与编译链的重新校验。

**技术目标**

1. 编辑操作面向用户友好文档表达层。
2. 系统能稳定判断编辑后语义是否仍然成立。

**输入**

1. 已存在模板 ID。
2. 新的模板文档表达内容。

**输出**

1. 更新后的 `WorkflowTemplateDocument`
2. 新的解析 / 编译结果或错误状态

**核心数据对象**

1. `WorkflowTemplateDocument`
2. `ParsedWorkflow`
3. `CompiledWorkflow`

**核心处理链路**

```text
edit template document
  -> persist draft-like updated document expression
  -> parse
  -> compile
  -> validation result writeback
```

**协作点**

1. WS 提供编辑入口与错误暴露。
2. TMP 提供语义校验结果。

**技术约束 / 不变量**

1. 编辑对象是用户表达层，不直接暴露运行时对象给用户。
2. 若编辑后语义不成立，模板不得被当作可执行模板继续使用。

### 5.3 工作流模板结构解析

**功能职责**

1. 从用户表达层提取流程语义。
2. 形成稳定的解析结果对象。

**技术目标**

1. 把用户友好文档表达转换为可控语义单元。
2. 避免直接依赖 prompt 理解。

**输入**

1. `WorkflowTemplateDocument`

**输出**

1. `ParsedWorkflow`

**核心数据对象**

1. `WorkflowTemplateDocument`
2. `ParsedWorkflow`

**核心处理链路**

```text
template document
  -> normalize sections / headings / semantic blocks
  -> extract phase / step / input / output / constraint
  -> build ParsedWorkflow
```

**协作点**

1. `TMP-M-S-01` 负责冻结解析流程。

**技术约束 / 不变量**

1. 解析失败时不得退化为直接按模板文本执行。
2. 最小步骤单元必须可回答 `step name / input / output / constraint`。

### 5.4 流程编译

**功能职责**

1. 将解析结果转换为结构化流程表示。
2. 对依赖、顺序、约束、校验点执行编译时校验。

**技术目标**

1. 产出可被 Agent 稳定消费的 `CompiledWorkflow`。
2. 为运行时 plan 映射提供唯一合法输入。

**输入**

1. `ParsedWorkflow`

**输出**

1. `CompiledWorkflow`

**核心数据对象**

1. `ParsedWorkflow`
2. `CompiledWorkflow`

**核心处理链路**

```text
ParsedWorkflow
  -> semantic validation
  -> dependency resolution
  -> boundary normalization
  -> CompiledWorkflow
```

**协作点**

1. AG 和 BLD 只消费编译后的结构化流程表示。

**技术约束 / 不变量**

1. 编译结果与原始模板表达分层存在，不互相替代。
2. 编译失败时必须阻断模板执行链。
3. 编译结果可缓存，但缓存不是资产真源。

### 5.5 运行时 plan 映射

**功能职责**

1. 把 `CompiledWorkflow` 绑定到当前任务上下文。
2. 生成具体任务实例的 `RuntimeWorkflowPlan`。

**技术目标**

1. 实现模板与具体任务实例解耦。
2. 保证模板是协议，plan 是本次任务实例。

**输入**

1. `CompiledWorkflow`
2. 当前用户目标
3. 当前任务上下文
4. AST / WS / 显式引用形成的上下文补强

**输出**

1. `RuntimeWorkflowPlan`

**核心数据对象**

1. `CompiledWorkflow`
2. `TemplateBinding`
3. `RuntimeWorkflowPlan`
4. `ExecutionContext`

**核心处理链路**

```text
CompiledWorkflow + task context
  -> bind template to task
  -> fill runtime inputs
  -> build RuntimeWorkflowPlan
```

**协作点**

1. AG 负责消费 plan。
2. AST 提供事实知识与结构参考。

**技术约束 / 不变量**

1. plan 必须绑定任务实例。
2. plan 可以随上下文变化而调整，但不应反向改写模板资产。

### 5.6 模板执行协同

**功能职责**

1. 在 Agent 执行链中使用 `RuntimeWorkflowPlan` 约束推进。
2. 让模板约束执行，但不替代 Agent。

**技术目标**

1. 模板主语始终是过程约束。
2. Agent 主语始终是执行主控。

**输入**

1. `RuntimeWorkflowPlan`
2. `ExecutionContext`

**输出**

1. 运行中的 `RuntimeStep`
2. `ExecutionState`
3. 中间态与最终结果

**核心数据对象**

1. `RuntimeWorkflowPlan`
2. `RuntimeStep`
3. `ExecutionState`
4. `ExecutionContext`

**核心处理链路**

```text
RuntimeWorkflowPlan
  -> agent execute step by step
  -> update step state
  -> update execution state
  -> produce result
```

**协作点**

1. AG 负责推进、暂停、校验、收口。
2. WS 负责观测状态呈现。

**技术约束 / 不变量**

1. 模板不直接执行。
2. 模板不替代 Agent 的异常处理和运行时判断。

### 5.7 统一执行模型承接

**功能职责**

1. 在技术上承接统一执行模型。
2. 在不暴露显式模式切换的前提下承接三种运行状态。

**技术目标**

1. 连续推进、受限推进、人工介入在技术上是状态，不是模式。

**输入**

1. `RuntimeWorkflowPlan`
2. 风险、置信度、用户行为、中断信号

**输出**

1. 当前 `ExecutionState`
2. 当前 `StepState`

**核心数据对象**

1. `ExecutionState`
2. `StepState`
3. `ExecutionContext`

**核心处理链路**

```text
runtime signals
  -> evaluate execution state
  -> continue / restrict / wait-for-user
  -> preserve same execution model
```

**协作点**

1. `TMP-M-S-02` 冻结状态承接规则。

**技术约束 / 不变量**

1. 不允许引入 mode A / B / C 显式切换系统。
2. 状态变化必须建立在运行时条件而非用户选择模式之上。

### 5.8 执行状态可观测性

**功能职责**

1. 对运行中模板执行暴露最小必要状态。

**技术目标**

1. 避免黑箱执行。
2. 为用户介入与恢复提供定位依据。

**输入**

1. `ExecutionState`
2. `RuntimeStep`

**输出**

1. 当前阶段
2. 当前步骤
3. 已完成步骤
4. 是否处于受限推进状态
5. 是否等待人工介入

**核心数据对象**

1. `ExecutionState`
2. `RuntimeStep`

**协作点**

1. WS / chat / task UI 消费状态。

**技术约束 / 不变量**

1. 可观测不等于暴露实现细节。
2. 状态展示必须建立在统一执行对象之上，而不是 UI 自己猜测。

### 5.9 中断、失败与恢复

**功能职责**

1. 在步骤失败、约束不满足或用户中断时，安全停止盲推。
2. 保留可恢复边界。

**技术目标**

1. 失败不退化为盲目继续。
2. 恢复建立在上下文连续性与步骤状态之上。

**输入**

1. 执行失败
2. 风险升级
3. 用户介入

**输出**

1. 中断后的 `ExecutionState`
2. 可恢复的 `ExecutionContext`

**核心数据对象**

1. `ExecutionState`
2. `ExecutionContext`
3. `StepState`

**核心处理链路**

```text
step failed / user interrupted
  -> stop blind push
  -> persist execution boundary
  -> adjust / replan / resume from boundary
```

**技术约束 / 不变量**

1. step 失败不是默认继续的理由。
2. 恢复必须从可确认边界继续。
3. 跳步必须建立在明确判断或用户介入基础上。

### 5.10 模板选择与引用

**功能职责**

1. 让模板在任务上下文中形成稳定引用关系。

**技术目标**

1. 模板选择与任务执行绑定，而不是全局静默启用。

**输入**

1. 用户显式选择模板
2. AI 建议模板并经用户接受

**输出**

1. `TemplateReference`
2. `TemplateBinding`

**核心数据对象**

1. `TemplateReference`
2. `TemplateBinding`

**核心处理链路**

```text
select template
  -> create reference
  -> bind to task
  -> compile + map to runtime plan
```

**协作点**

1. 对话态与构建态都可以消费工作流模板，但消费位置不同。

**技术约束 / 不变量**

1. 模板引用默认绑定当前任务 / 当前项目上下文。
2. 模板不是全局隐藏规则层。

### 5.11 模板治理

**功能职责**

1. 管理模板的创建、编辑、版本、启用状态。

**技术目标**

1. 保持用户主导。
2. 保持模板资产可管理但不膨胀。

**输入**

1. 用户的创建、保存、编辑、归档、启用请求

**输出**

1. 模板状态更新
2. 新版本或新状态

**核心数据对象**

1. `WorkflowTemplate`
2. `WorkflowTemplateDocument`

**技术约束 / 不变量**

1. 模板来源只允许用户创建。
2. 当前阶段应支持版本和启用状态。
3. 当前阶段不应设计涌现链路、市场、社区共享。

---

## 六、核心数据对象与协议对象

| 对象 | 所属层 | 由谁生成 | 被谁消费 | 生命周期 | 是否持久化 | 是否可缓存 | 是否绑定任务实例 |
|---|---|---|---|---|---|---|---|
| `WorkflowTemplate` | 模板资产层 | TMP 资产创建链 | WS / TMP / AG / BLD | 长期资产 | 是 | 否 | 否 |
| `WorkflowTemplateDocument` | 编辑 / 存储层 | 用户编辑链 | 解析层 | 长期资产表达层 | 是 | 否 | 否 |
| `ParsedWorkflow` | 结构解析层 | 解析链 | 编译层 | 中间产物 | 可选 | 是 | 否 |
| `CompiledWorkflow` | 流程编译层 | 编译链 | AG / BLD / 运行时映射层 | 中间产物 | 可选 | 是 | 否 |
| `TemplateReference` | 接口协同层 | 用户选择 / AI 建议接受链 | 绑定链 | 任务引用期 | 可选 | 否 | 是 |
| `TemplateBinding` | 运行时映射层 | 绑定链 | plan 映射层 | 当前任务运行期 | 否 | 可选 | 是 |
| `RuntimeWorkflowPlan` | 运行时映射层 | AG 计划映射链 | 执行协同层 | 当前任务运行期 | 否 | 可选 | 是 |
| `RuntimeStep` | 执行协同层 | 执行推进链 | 可观测状态层 / AG | 当前步骤运行期 | 否 | 否 | 是 |
| `StepState` | 可观测状态层 | 执行推进链 | WS / chat / task UI | 当前任务运行期 | 可选 | 否 | 是 |
| `ExecutionState` | 可观测状态层 | 执行主链 | WS / AG / 恢复链 | 当前任务运行期 | 可选 | 否 | 是 |
| `ExecutionContext` | 执行协同层 | AG + AST + WS 协同装配 | 执行主链 / 恢复链 | 当前任务运行期 | 否 | 可选 | 是 |

### 6.1 核心对象语义补充

#### 6.1.1 `WorkflowTemplate`

它是模板资产真源，回答：

1. 这份模板是谁的。
2. 当前是否启用。
3. 当前活跃版本是什么。

#### 6.1.2 `WorkflowTemplateDocument`

它是用户表达层真源，回答：

1. 用户实际编辑的内容是什么。
2. 用户可见版本是什么。

#### 6.1.3 `ParsedWorkflow`

它是语义提取结果，回答：

1. 模板中的阶段、步骤、输入、输出、约束是什么。

#### 6.1.4 `CompiledWorkflow`

它是执行前唯一合法消费对象，回答：

1. 这份模板在结构上是否成立。
2. 可以如何稳定进入运行时 plan 映射。

#### 6.1.5 `RuntimeWorkflowPlan`

它是任务实例级对象，回答：

1. 在这次任务语境下，模板如何具体展开。

#### 6.1.6 `ExecutionState / StepState / ExecutionContext`

这三者共同回答：

1. 当前执行到哪里。
2. 当前处于何种隐性执行状态。
3. 从哪里恢复。

---

## 七、系统主链与状态边界

### 7.1 创建与存储主链

```text
user create template
  -> WorkflowTemplate created
  -> WorkflowTemplateDocument persisted
  -> template status initialized
```

### 7.2 编辑与校验主链

```text
user edit template
  -> update WorkflowTemplateDocument
  -> parse
  -> compile
  -> validation result writeback
```

### 7.3 解析与编译主链

```text
WorkflowTemplateDocument
  -> ParsedWorkflow
  -> CompiledWorkflow
  -> ready for binding
```

### 7.4 引用与绑定主链

```text
user select template
  -> TemplateReference
  -> TemplateBinding
  -> RuntimeWorkflowPlan
```

### 7.5 执行与观测主链

```text
RuntimeWorkflowPlan
  -> Agent execute
  -> RuntimeStep / StepState updates
  -> ExecutionState updates
  -> observable state output
```

### 7.6 失败与恢复主链

```text
step failed / execution interrupted
  -> freeze execution boundary
  -> preserve ExecutionContext
  -> adjust / replan / resume
```

---

## 八、规则映射表

| 描述文档规则 | 承接技术章节 | 承接技术对象 | 承接技术链路 / 机制 |
|---|---|---|---|
| 模板库唯一对象类型 = 工作流模板 | 本文 §2 / §5.1 / §6 | `WorkflowTemplate` | 创建、编辑、引用、执行主链都以 `WorkflowTemplate` 为唯一主对象 |
| 模板库只负责过程约束 | 本文 §2 / §4 / §5.6 | `WorkflowTemplate`, `CompiledWorkflow` | 模板只进入过程约束链，不进入事实 / 结构 / 行为定义链 |
| 文档范本归知识库结构型资产 | 本文 §2 / §9.2 | `TemplateReference` 与 AST 结构参考对象分层 | 接口协同层分流，不共用协议 |
| skills 不得借壳回流 | 本文 §2 / §5.6 / §8 | 无独立 skill 对象 | 不引入 prompt / behavior / style 对象层 |
| 工作流模板不是 graph | 本文 §2 / §5.3 / `TMP-M-S-01` | `WorkflowTemplateDocument` | 用户表达层不以图结构建模 |
| 工作流模板不是普通 md / 自由 prompt | 本文 §5.3 / §5.4 / `TMP-M-S-01` | `WorkflowTemplateDocument`, `ParsedWorkflow` | 文档表达必须进入解析与编译，不能直接执行 |
| 必须进行结构解析与流程编译 | 本文 §2 / §5.3 / §7.3 | `ParsedWorkflow`, `CompiledWorkflow` | 解析链、编译链 |
| 模板不是独立执行器 | 本文 §2 / §5.6 / §9.1 | `RuntimeWorkflowPlan`, `ExecutionState` | Agent 执行主控链 |
| 执行采用统一执行模型 | 本文 §2 / §5.7 / `TMP-M-S-02` | `ExecutionState` | 统一执行主链 |
| 三状态是隐性状态，不是显式模式 | 本文 §5.7 / `TMP-M-S-02` | `ExecutionState`, `StepState` | 状态评估链，不引入 mode system |
| 默认不逐步确认 | 本文 §5.7 / §5.8 / `TMP-M-S-02` | `ExecutionState` | 默认连续推进，风险时受限推进 |
| 用户始终可介入 | 本文 §5.7 / §5.9 / `TMP-M-S-02` | `ExecutionContext`, `ExecutionState` | 人工介入挂接链 |
| 模板仅由用户创建 | 本文 §2 / §5.1 / §5.11 | `WorkflowTemplate` | 创建链与治理链 |
| 不存在涌现生成链路 | 本文 §2 / §5.11 | `WorkflowTemplate` | 治理链不含涌现来源 |

---

## 九、与相关模块、相关文档的协作关系

### 9.1 与 AST（知识库）

边界：

1. 结构型资产负责结构参考。
2. 工作流模板负责过程约束。
3. 两者共同进入上下文时必须分层，不得混层。

技术关系：

1. AST 注入事实知识与结构参考。
2. TMP 注入编译后的结构化流程表示。
3. `A-AST-M-P-01_上下文注入.md` 负责注入顺序与预算。

### 9.2 与 AG（Agent）

边界：

1. Agent 是执行主控。
2. 模板是过程约束输入。

技术关系：

1. AG 读取 `CompiledWorkflow`。
2. AG 将其绑定为 `RuntimeWorkflowPlan`。
3. AG 在统一执行模型下推进并输出 `ExecutionState`。

### 9.3 与 WS（workspace / workbench）

边界：

1. WS 负责模板创建、编辑、选择、状态展示入口。
2. WS 不负责解释模板或执行模板。

技术关系：

1. WS 消费模板资产状态与运行状态。
2. WS 暴露当前阶段、当前步骤、受限推进状态等最小可观测信息。

### 9.4 与 BLD（构建模式）

边界：

1. BLD 不把模板当独立执行器。
2. 模板在构建模式中是规划与执行约束输入。

技术关系：

1. BLD 读取模板引用。
2. BLD 消费编译后的结构化流程表示。
3. BLD 将其吸收到 build outline，而不是直接运行模板。

### 9.5 与 `TMP-M-D-02` / `TMP-M-D-01` / `TMP-M-T-01`

分工：

1. `TMP-M-D-02` 定义模板库是什么、边界是什么、运行语义是什么。
2. `TMP-M-D-01` 定义模板库与 Agent 协同的主控边界。
3. 本文定义模板库技术主链、对象体系与专项拆分。
4. `TMP-M-T-01` 定义工作流模板机制基础与基础约束。

---

## 十、专项拆分说明

### 10.1 为什么需要专项文档

模板库技术主链中，以下两部分如果只在主文档中一笔带过，会导致实现理解分裂：

1. 从用户文档表达进入结构化流程表示的解析与编译链。
2. 统一执行模型下的隐性状态、可观测性与恢复链。

因此需要拆出两个专项文档。

### 10.2 专项文档承接关系

1. `A-TMP-M-S-01_工作流模板结构解析与流程编译规范.md`
   - 承接结构解析层与流程编译层。
   - 冻结 `WorkflowTemplateDocument -> ParsedWorkflow -> CompiledWorkflow` 主链。
2. `A-TMP-M-S-02_统一执行模型与运行时状态规范.md`
   - 承接运行时 plan、执行状态、失败恢复与可观测性。
   - 冻结 `RuntimeWorkflowPlan -> ExecutionState -> StepState -> resume` 主链。

### 10.3 与主技术文档的关系

本文负责：

1. 技术总控。
2. 主链结构。
3. 规则映射。
4. 模块协同。

专项文档负责：

1. 对主链中复杂子链做专项冻结。
2. 避免实现阶段对对象、状态和协议理解分裂。

---

## 十一、MVP 验收口径

1. 工作流模板资产、文档表达、解析结果、编译结果、运行时 plan、执行状态对象边界明确。
2. 用户表达 -> 结构解析 -> 流程编译 -> 运行时 plan -> 执行状态链路可复现。
3. AG / AST / WS / BLD 的接口边界与消费顺序明确。
4. 执行状态可观测的最小信息承接位明确。
5. 失败、中断、恢复具备统一技术锚点。
6. 技术体系中不存在文档模板、skills、prompt 层、涌现模板链路回流。

---

## 十二、来源映射

1. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
2. `A-TMP-M-D-02_Binder模板库模块描述文档.md`
3. `A-TMP-M-T-01_模板机制.md`
4. `A-AG-M-T-05_文档生成流程.md`
5. `A-AST-M-P-01_上下文注入.md`
6. `R-BLD-I-P-02_构建模式与模板库接口.md`
