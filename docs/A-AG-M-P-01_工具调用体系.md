# 工具调用体系

## 文档头

- 结构编码：`AG-M-P-01`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`工具调用体系 / 接口、协议与契约主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `AG-M-T-01`
- 直接承接：`AG-M-P-02`, `AG-X-L-01`
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`, `AG-M-T-01`
- 扩散检查：`AG-M-T-02`, `AG-M-T-03`, `AG-M-T-04`
- 使用边界：`定义接口、协议与数据契约，不承担模块主规则裁定与开发计划`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：30_capabilities / 03_ai执行系统 / 工具调用主控  
> 文档角色：工具运行时控制文档  
> 上游主控：`A-AG-M-T-01_ai执行架构.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`  
> 下游专项：`A-AG-M-P-02_Binder Agent工具矩阵.md`、`A-DE-M-D-01_对话编辑统一方案.md`、`A-DE-M-T-01_diff系统规则.md`

---

## 一、文档定位与控制权威

### 1.1 文档定位

本文定义 Binder AI 系统中**工具调用能力的统一运行时契约**。  
本文回答：

1. 工具从定义、调用、解析、执行到回流的完整主链如何成立。
2. 哪些层默认允许工具调用，哪些层默认不允许。
3. 工具执行如何与 gate、确认、artifact、错误分级协同。
4. 如何判断工具调用方案是否可进入主链。
5. 模型可调用工具目录应如何与场景、风险、确认和阶段语义对齐。

### 1.2 控制权威

本文是工具运行时的主控文档。  
本文不替代：

1. 某个具体工具目录的场景覆盖设计。
2. 提示词里如何描述工具。
3. 任务层如何编排工具步骤。

但凡涉及工具运行时契约，必须以本文为准。
模型可调用工具清单、分层开放策略、风险分级矩阵，由 `A-AG-M-P-02_Binder Agent工具矩阵.md` 负责。

---

## 二、适用范围与基本立场

### 2.1 适用范围

1. 当前工具定义注册链
2. 当前工具执行分发链
3. 当前工具结果回流链
4. 与对话编辑主链相关的工具调用

### 2.2 基本立场

1. 工具体系是统一基础设施，但不是所有层的默认能力。
2. 层次三是当前工具主链的主要消费层。
3. 层次一默认不进入工具主链。
4. 层次二默认不进入对话编辑工具主链，除非未来单独立项。

---

## 三、规则 ID 体系

本文采用统一编码体系：

1. `TC-*`：本文本地规则
2. `BA-*`：复用 Agent 上位规则
3. `DE-*`：如需引用对话编辑专项规则，直接复用原 ID

| 规则域 | 含义 |
|---|---|
| `TC-CORE` | 本文定义的文档定位、适用范围、层次边界规则 |
| `TC-DEF` | 工具定义契约 |
| `TC-CALL` | tool_call 生成与解析契约 |
| `TC-EXEC` | 工具执行契约 |
| `TC-RESULT` | 返回结构与结果标准化 |
| `TC-ERR` | 错误分级与回流 |
| `TC-GOV` | 本文定义的扩展、重构、上下游控制关系规则 |

### 3.1 规则承接矩阵

| 规则ID | 规则名称 | 本文主定义位置 | 下游承接文档 |
|---|---|---|---|
| TC-CORE-001 | 工具体系是统一基础设施，不是三层默认共享能力 | 4.1 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-T-02_prompt架构.md` |
| TC-CORE-002 | 层次三是工具主链主要消费层 | 4.2 | `A-AG-M-T-01_ai执行架构.md`、`A-DE-M-D-01_对话编辑统一方案.md` |
| TC-DEF-001 | 每个工具必须有稳定 name 和 schema | 5.1 | `A-AG-M-T-02_prompt架构.md` |
| TC-DEF-002 | 文档字段与运行时字段必须一一对应 | 5.1 | 工具实现文档 |
| TC-DEF-003 | 模型可调用工具目录必须由正式工具矩阵治理 | 5.1 | `A-AG-M-P-02_Binder Agent工具矩阵.md` |
| TC-CALL-001 | arguments 必须先解析后执行 | 5.2 | ai_commands/tool_service |
| TC-CALL-002 | 参数纠错必须可追踪 | 5.2 | tool_service |
| TC-EXEC-001 | 工具执行必须幂等可控 | 5.3 | tool_service |
| TC-EXEC-002 | 涉及确认动作的工具必须先过门禁 | 5.3 | `A-AG-M-T-03_任务规划执行.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md` |
| TC-RESULT-001 | 返回主结构统一为 success/data/error | 5.4 | 前后端消费链 |
| TC-RESULT-002 | `edit_current_editor_document` 必须返回规范 diff 结构 | 5.4 | `A-DE-M-D-01_对话编辑统一方案.md`、`A-DE-M-T-01_diff系统规则.md` |
| TC-ERR-001 | 错误必须分级并可观测回流 | 5.5 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-T-03_任务规划执行.md` |
| TC-GOV-001 | 新增工具必须走注册、执行、回归标准步骤 | 6.1 | `A-AG-X-L-01_Binder Agent落地开发计划.md` |
| TC-GOV-002 | 工具重构不得改变既有运行语义 | 6.2 | `A-AG-X-L-01_Binder Agent落地开发计划.md` |

### 3.2 编码使用说明

本文采用以下编码原则：

1. `TC-*` 只用于本文首次定义的工具运行时规则。
2. 若某条规则本质上已由 `BA-*`、`DE-*` 或 `A-AG-M-T-01_ai执行架构.md` 的上位规则定义，则本文应复用原规则 ID 或在矩阵中显式承接，不得另造同义规则。

---

## 四、三层与工具体系的关系

## 4.1 总体关系

工具体系对三层的默认关系如下：

| 层次 | 默认是否进入工具主链 | 说明 |
|---|---|---|
| 层次一：辅助续写 | 否 | 保持快速、单次、无工具主链 |
| 层次二：局部修改 | 否 | 保持局部执行，不默认接入对话编辑工具主链 |
| 层次三：对话编辑 | 是 | 当前工具主链主要消费层 |

### 4.2 不得误读的点

1. 有统一工具体系，不等于三层都应调用工具。
2. 工具基础设施存在，不等于层次一、层次二就应自动接入。
3. 层次三的工具链复杂度，不应反向下压到层次一、层次二。

---

## 五、工具运行时主链

## 5.1 定义契约

### 5.1.1 工具最小定义

每个工具至少必须定义：

1. `name`
2. `description`
3. `parameters`

### 5.1.2 约束

1. `name` 必须稳定。
2. `parameters` 使用 JSON Schema。
3. 文档字段与后端实际字段必须一致。
4. 工具是否暴露给模型，不得只由实现文件临时决定，必须受正式工具矩阵控制。

### 5.1.3 工具矩阵来源

运行时只负责消费工具定义，不负责决定“哪些工具应暴露给模型、覆盖哪些 Agent 场景、具备什么风险等级”。  
这些内容必须以 `A-AG-M-P-02_Binder Agent工具矩阵.md` 为准，并至少覆盖：

1. 工具分类
2. 场景覆盖
3. 分层开放策略
4. 风险等级
5. 确认要求
6. artifact / verification / stage 影响

## 5.2 调用与参数契约

### 5.2.1 调用主链

`模型生成 tool_call -> 调用侧解析 arguments -> 参数校验 -> 执行前门禁`

调用侧最小结构如下：

```ts
interface ToolCallEnvelope {
  callId: string;
  toolName: string;
  rawArguments: string;
  parsedArguments?: Record<string, unknown>;
  repairTrace?: string[];
}
```

### 5.2.2 约束

1. 所有 arguments 必须先解析再执行。
2. 禁止边解析边执行。
3. 参数缺失必须区分可重试与致命错误。
4. 默认值填充、兼容字段处理必须可追踪。

## 5.3 执行契约

### 5.3.1 执行主链

`execute_tool -> 路由到具体工具 -> 返回标准结果`

工具执行上下文最小结构如下：

```ts
interface ToolExecutionContext {
  taskId: string;
  stageSnapshotId?: string;
  scopeSummary: string;
  requiredGateIds: string[];
  relatedArtifactIds?: string[];
  confirmationTicketId?: string;
}
```

### 5.3.2 约束

1. 工具执行必须幂等可控。
2. 工具执行支持受控重试。
3. 涉及确认动作的工具，先过确认门禁再执行。

## 5.4 结果契约

### 5.4.1 主结构

工具统一返回：

1. `success`
2. `data`
3. `error`

正式结果结构如下：

```ts
interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: ToolErrorRecord;
  meta?: ToolResultMeta;
}
```

工具返回扩展结构如下：

```ts
interface ToolResultMeta {
  scopeSummary?: string;
  producedArtifactIds?: string[];
  verificationIds?: string[];
  confirmationTicketId?: string;
  stageStateHint?: string;
}
```

### 5.4.2 约束

1. 允许扩展字段，但不得破坏主结构。
2. 对话编辑主工具必须返回规范 diff 结果。
3. 前端消费链不得依赖未文档化的隐式字段。
4. 若工具影响作用范围、artifact、verification、confirmation 或阶段状态，必须通过结构化扩展字段回流，不能只写自然语言说明。

## 5.5 错误契约

### 5.5.1 错误类型

1. 可重试错误
2. 不可重试错误
3. 确认中断

### 5.5.2 约束

1. 错误必须带工具名、阶段、错误码。
2. 错误回流不得吞错。
3. 错误必须进入统一观测链。

错误对象最小结构如下：

```ts
interface ToolErrorRecord {
  toolName: string;
  stage: 'parse' | 'gate' | 'execute' | 'return';
  code: string;
  retryable: boolean;
  message: string;
}
```

---

## 六、扩展与重构规则

## 6.1 新增工具标准步骤

新增工具必须完成：

1. 在定义层注册 schema。
2. 在执行层增加分支。
3. 补参数校验。
4. 补错误分级。
5. 补返回结构。
6. 补回归测试。
7. 在工具矩阵文档中登记所属场景、风险等级、层次开放策略和确认要求。

## 6.2 重构规则

1. 调用解析、执行、重试、确认、异常处理可重构。
2. 但重构后既有工具运行语义不得变化。
3. 计划态重构项未落为运行契约前，不得进入主链。

## 6.3 工程模块结构

| 层次 | 模块 | 职责 |
|---|---|---|
| 定义层 | `src-tauri/src/services/tool_definitions.rs` | 输出模型可见的 `ToolDefinition[]` |
| 调用解析层 | `src-tauri/src/commands/ai_commands.rs` | 解析模型 tool_call，累积跨 chunk 参数 |
| 重试编排层 | `src-tauri/src/services/tool_call_handler.rs` | 执行重试、跳过、中断策略 |
| 执行层 | `src-tauri/src/services/tool_service.rs` | 分发到具体工具实现并返回结构化结果 |
| 前端消费层 | `src/stores/chatStore.ts`、`src/components/Chat/ToolCallCard.tsx` | 展示调用状态、结果、错误和确认入口 |

## 6.4 标准运行路径

```text
tool_definitions.rs::get_tool_definitions
  -> ai_commands.rs 将 definitions 传给 provider.chat_stream
  -> 模型输出 tool_call
  -> ai_commands.rs 累积 raw arguments
  -> tool_call_handler.rs::execute_tool_with_retry
  -> tool_service.rs::execute_tool
  -> ToolExecutionResult 回流前端
  -> chatStore / ToolCallCard 消费
```

## 6.5 工具调用协议示例

模型侧调用示例：

```json
{
  "id": "call_001",
  "name": "edit_current_editor_document",
  "arguments": {
    "edit_mode": "replace",
    "block_index": 12,
    "target": "原始句子",
    "content": "改写后的句子",
    "occurrence_index": 0
  }
}
```

运行时回流示例：

```json
{
  "success": true,
  "data": {
    "diffs": []
  },
  "meta": {
    "scopeSummary": "current_editor:block-12",
    "producedArtifactIds": ["artifact-diff-001"],
    "verificationIds": ["verify-001"],
    "stageStateHint": "candidate_ready"
  }
}
```

## 6.6 重试与门禁代码骨架

```rust
pub async fn execute_tool_with_agent_context(
    tool_call: &ToolCall,
    exec_ctx: &ToolExecutionContext,
    workspace_path: &Path,
) -> Result<ToolExecutionResult, String> {
    ensure_required_gates(exec_ctx)?;

    let result = tool_service.execute_tool(tool_call, workspace_path).await?;
    let normalized = normalize_tool_result(result, exec_ctx);

    Ok(normalized)
}
```

## 6.7 AI 支持方案

当前工具调用仅在层次三默认启用，调用方式固定为：

1. `src/stores/chatStore.ts` 调用 `invoke('ai_chat_stream')`。
2. `src-tauri/src/commands/ai_commands.rs` 根据 `enable_tools=true` 注入 `get_tool_definitions()`。
3. Provider 通过 `chat_stream(..., tool_definitions.as_deref())` 执行带工具的流式会话。
4. 工具结果通过流式事件与最终 `ToolExecutionResult` 一并回流。

---

## 七、关键工具专项约束

## 7.1 `edit_current_editor_document`

该工具是当前对话编辑主链关键工具。

### 7.1.1 必须满足

1. 返回 canonical diff 语义结果。
2. 输出优先消费 `diffs`。
3. 不得用兼容字段替代 diff 主链。

### 7.1.2 下游承接

1. `A-DE-M-D-01_对话编辑统一方案.md`
2. `A-DE-M-T-01_diff系统规则.md`

## 7.2 未来新工具接入限制

若未来要把工具能力扩展到层次一或层次二，必须同时满足：

1. 有独立设计文档。
2. 有专项评审结论。
3. 不破坏三层独立性硬约束。

---

## 八、与上下游文档的控制关系

| 文档 | 关系 |
|---|---|
| `A-AG-M-T-01_ai执行架构.md` | `A-AG-M-T-01_ai执行架构.md` 定义总体执行分层，本文定义工具运行时契约 |
| `A-AG-M-T-02_prompt架构.md` | `A-AG-M-T-02_prompt架构.md` 定义工具提示协作，本文定义工具执行语义 |
| `A-AG-M-T-03_任务规划执行.md` | `A-AG-M-T-03_任务规划执行.md` 负责任务层编排，本文负责单次工具执行可靠性 |
| `A-AG-M-T-04_Binder Agent技术主控文档.md` | `A-AG-M-T-04_Binder Agent技术主控文档.md` 定义 gate/artifact/confirmation 上位技术语义，本文负责运行时承接 |
| `A-DE-M-D-01_对话编辑统一方案.md`、`A-DE-M-T-01_diff系统规则.md` | 定义对话编辑主工具 diff 与状态协作规则 |

---

## 九、设计评审否决条件

以下任一情况成立，都应视为不符合工具调用体系主控要求：

1. 工具没有稳定 schema。
2. arguments 未完整解析就执行。
3. 结果结构不稳定或无法统一消费。
4. 错误无分级或不可观测。
5. 层次一、层次二在无专项决策前默认接入层次三工具主链。

---

## 十、MVP 验收口径

1. 工具定义与执行实现一致。
2. 参数错误可稳定分级并回流。
3. 工具重试、确认、异常处理链可复现。
4. 对话编辑关键工具可稳定输出规范结果。
5. 本文本身足以独立控制工具运行时逻辑板块。

---

## 十一、来源映射

1. `R-ENG-X-R-02_工具集扩展规范.md`
2. `R-ENG-X-R-01_ai_commands重构计划.md`
3. `A-AG-M-T-01_ai执行架构.md`
4. `A-AG-M-T-04_Binder Agent技术主控文档.md`
5. `A-DE-M-D-01_对话编辑统一方案.md`
6. `A-DE-M-T-01_diff系统规则.md`
