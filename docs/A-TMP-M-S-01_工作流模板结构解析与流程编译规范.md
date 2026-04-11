# 工作流模板结构解析与流程编译规范

## 文档头

- 结构编码：`TMP-M-S-01`
- 文档属性：`专项落地规范`
- 主责模块：`TMP`
- 文档职责：`工作流模板结构解析与流程编译规范 / 从用户表达层到结构化流程表示的专项冻结`
- 上游约束：`TMP-M-D-02`, `TMP-M-T-01`, `TMP-M-T-02`, `AG-M-T-05`, `BLD-I-P-02`
- 直接承接：`TMP-M-T-02`
- 接口耦合：`AG-M-T-05`, `AST-M-P-01`, `BLD-I-P-02`
- 使用边界：`冻结结构解析与流程编译主链，不替代模板资产治理与运行时状态规范`
- 决策依据：`TMP-M-D-02 §6.6-§6.7`, `TMP-M-T-02 §5.3-§5.4`

---
> 文档层级：30_capabilities / 06_模板库系统 / 结构解析与流程编译专项

## 一、文档定位

本文负责冻结以下链路：

`WorkflowTemplateDocument -> ParsedWorkflow -> CompiledWorkflow`

本文回答：

1. 如何从用户友好文档表达提取流程语义。
2. 解析结果的最小结构单元是什么。
3. 如何从解析结果生成可执行消费的结构化流程表示。
4. 解析失败、编译失败时如何处理。

本文不回答：

1. 模板资产为什么存在。
2. 统一执行模型如何承接。
3. UI 编辑器长什么样。

## 二、冻结前提

1. 用户看到的是模板文档表达，不是 graph。
2. 执行链使用的不是原始文本，而是编译结果。
3. 解析失败时不得退化成 prompt 直接执行。

## 三、核心对象

### 3.1 `WorkflowTemplateDocument`

职责：

1. 保存用户实际编辑的模板表达。
2. 作为模板表达层真源。

### 3.2 `ParsedWorkflow`

职责：

1. 保存结构解析后的语义结果。
2. 表达阶段、步骤、输入、输出、约束、依赖。

### 3.3 `CompiledWorkflow`

职责：

1. 保存通过编译校验后的结构化流程表示。
2. 作为运行时 plan 映射的唯一合法输入。

## 四、解析主链

### 4.1 输入

1. `WorkflowTemplateDocument`

### 4.2 输出

1. `ParsedWorkflow`

### 4.3 最小解析语义

每个最小步骤单元至少应包含：

1. `step name`
2. `input`
3. `output`
4. `constraint`

### 4.4 解析流程

```text
WorkflowTemplateDocument
  -> section normalization
  -> semantic block extraction
  -> phase detection
  -> step extraction
  -> dependency hint extraction
  -> ParsedWorkflow
```

### 4.5 解析失败原则

若无法稳定识别最小步骤边界，则视为解析失败。

失败后：

1. 不进入编译。
2. 不进入执行。
3. 必须暴露解析失败状态。

## 五、编译主链

### 5.1 输入

1. `ParsedWorkflow`

### 5.2 输出

1. `CompiledWorkflow`

### 5.3 编译职责

编译阶段负责：

1. 校验阶段顺序。
2. 规范步骤边界。
3. 规范输入输出约束。
4. 固化依赖关系。
5. 形成稳定消费载荷。

### 5.4 编译流程

```text
ParsedWorkflow
  -> semantic validation
  -> normalize phase boundaries
  -> normalize step boundaries
  -> validate dependencies
  -> freeze execution-relevant constraints
  -> CompiledWorkflow
```

### 5.5 编译结果与原始模板的关系

1. 原始模板表达是用户编辑真源。
2. 解析结果是中间语义对象。
3. 编译结果是执行前消费对象。

三者不得互相偷换。

## 六、缓存与版本

1. `WorkflowTemplateDocument` 是长期真源，应持久化。
2. `ParsedWorkflow` 可缓存，不是长期真源。
3. `CompiledWorkflow` 可缓存，不是模板资产真源。
4. 模板表达更新后，应使旧解析与旧编译缓存失效。

## 七、与其他模块协同

### 7.1 与 AG

AG 只消费 `CompiledWorkflow`，不直接消费原始模板文本。

### 7.2 与 BLD

BLD 只消费 `CompiledWorkflow` 或其等价结构化载荷。

### 7.3 与 AST

AST 不参与编译，但它注入的知识与结构参考会参与后续运行时 plan 绑定。

## 八、验收口径

1. 模板表达、解析结果、编译结果边界明确。
2. 编译失败时不会退化成自由 prompt 执行。
3. AG / BLD 消费对象统一为编译结果。

## 九、来源映射

1. `A-TMP-M-D-02_Binder模板库模块描述文档.md`
2. `A-TMP-M-T-02_Binder模板库技术主控文档.md`
