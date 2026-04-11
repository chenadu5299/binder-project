# 工具调用实现

## 文档头

- 结构编码：`ENG-X-T-03`
- 文档属性：`主结构`
- 主责模块：`ENG`
- 文档职责：`工具调用实现 / 模型、架构与机制主控`
- 上游约束：`SYS-C-T-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 直接承接：无
- 接口耦合：`SYS-I-P-01`, `SYS-I-P-02`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`
- 扩散检查：`ENG-X-T-01`, `ENG-X-T-02`, `ENG-X-T-04`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 一、文档定位

本文是工程实现层的工具调用实现主规范，定义工具注册、参数校验、执行分发、结果回流、重试与错误处理的统一实现口径。  
本文承接工具扩展规范与 `ai_commands` 重构方向，补齐运行时实现细节层。

---

## 二、MVP 目标

1. 建立统一工具生命周期：定义、注册、调用、执行、回流。  
2. 建立统一参数与返回契约：JSON Schema 入参、`ToolResult` 出参。  
3. 建立统一异常与重试机制：可重试、可降级、可观测。  

---

## 三、工具调用主链

标准执行链：

1. 模型返回 `tool_call`（工具名 + arguments）。  
2. 后端解析参数并做 schema 校验。  
3. 执行层按工具名分发到具体实现。  
4. 返回 `ToolResult` 并写入对话历史。  
5. 继续下一轮推理或结束本轮。  

---

## 四、工具注册与定义

## 4.1 注册入口

1. 在 `tool_definitions` 维护工具定义清单。  
2. 每个工具必须包含：`name`、`description`、`parameters`。  

## 4.2 参数约束

1. `parameters` 使用 JSON Schema。  
2. 所有必填字段必须在 schema 明确声明。  
3. 可选字段必须定义默认行为。  

## 4.3 版本策略

1. 工具定义支持版本字段或兼容标记。  
2. 破坏性改动必须保留过渡兼容期。  

---

## 五、执行分发与实现边界

## 5.1 分发层职责

1. 只负责根据工具名路由执行。  
2. 不承担业务推理与提示词策略。  
3. 统一记录执行上下文（tab/message/tool_call_id）。  

## 5.2 工具实现层职责

1. 对外只暴露业务输入和 `ToolResult`。  
2. 内部处理文件/编辑器/工作区等具体逻辑。  
3. 失败时必须返回结构化错误，不抛裸异常到上层。  

---

## 六、返回结构与回流协议

## 6.1 标准返回结构

```ts
interface ToolResult {
  success: boolean
  data?: Record<string, unknown>
  message?: string
  error?: string
  error_kind?: 'retryable' | 'fatal' | 'validation' | 'execution'
  display_error?: string
}
```

## 6.2 回流规则

1. `ToolResult` 必须写回会话消息链。  
2. 工具成功/失败都要回流，不能静默吞掉。  
3. 对话层基于 `error_kind` 决定是否重试。  

---

## 七、重试与确认机制

## 7.1 重试规则

1. `retryable` 错误允许有限次数重试。  
2. `fatal/validation` 错误不自动重试。  
3. 超过上限后回落到解释性失败响应。  

## 7.2 确认规则

1. 高风险操作可挂确认门禁。  
2. 确认前禁止实际执行副作用写入。  
3. 确认结果必须可追溯。  

---

## 八、错误与可观测性

最小错误码集合（工具域）：

1. `E_TOOL_NAME_NOT_FOUND`  
2. `E_TOOL_ARGS_PARSE_FAILED`  
3. `E_TOOL_ARGS_SCHEMA_INVALID`  
4. `E_TOOL_EXEC_FAILED`  
5. `E_TOOL_RETRY_EXHAUSTED`  
6. `E_TOOL_CONFIRMATION_REQUIRED`  

约束：

1. 业务状态流与错误观测流分离。  
2. 错误必须带定位信息（tool_call_id、tool_name、request_id）。  

---

## 九、与重构计划映射

1. `ToolCallHandler`：参数解析、执行包装、重试与确认。  
2. `StreamingResponseHandler`：tool_call 检测与流事件处理。  
3. `ConversationManager`：工具结果回流后的会话状态推进。  
4. `ExceptionHandler`：工具异常统一分级处理。  

---

## 十、MVP 验收口径

1. 工具注册、参数校验、执行分发链路稳定可用。  
2. 工具返回结构统一，回流链路稳定。  
3. 错误重试和确认门禁可配置且可观测。  
4. 新增工具可按统一模板扩展，无需改动主流程。  

---

## 十一、来源映射

1. `R-ENG-X-R-02_工具集扩展规范.md`：工具定义、扩展步骤、diff 返回契约来源。  
2. `R-ENG-X-R-01_ai_commands重构计划.md`：模块化执行链、重试/确认/异常治理来源。  