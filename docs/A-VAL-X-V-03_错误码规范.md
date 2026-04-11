# 错误码规范

## 文档头

- 结构编码：`VAL-X-V-03`
- 文档属性：`主结构`
- 主责模块：`VAL`
- 文档职责：`错误码规范 / 验证、测试或运维规范`
- 上游约束：`ENG-X-T-01`, `ENG-X-T-02`, `SYS-I-P-01`
- 直接承接：无
- 接口耦合：`ENG-X-T-01`, `ENG-X-T-02`, `SYS-I-P-01`
- 汇聚影响：`CORE-C-R-01`
- 扩散检查：`VAL-X-R-01`, `VAL-X-V-01`, `VAL-X-V-02`, `VAL-X-V-04`, `VAL-X-V-05`
- 使用边界：`定义验证、验收、运维与限制口径，不承担功能主控与实现主源职责`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 一、文档定位

本文是验证与运维层的错误码统一主规范，定义 AI 主链与对话编辑链的错误码分层、命名规则、返回契约与处置语义。  
本文承接 AI 需求协议中的错误处理约束，补齐统一错误码总表。

---

## 二、MVP 目标

1. 建立统一错误码命名与分层体系。  
2. 建立统一错误返回结构与重试语义。  
3. 建立统一错误码到用户提示、日志观测的映射关系。  

---

## 三、错误码结构

格式：

`E_<DOMAIN>_<SCENARIO>`

示例：

`E_STREAM_INTERRUPTED`  
`E_TOOL_ARGS_INVALID`  
`E_DIFF_RANGE_UNRESOLVABLE`

约束：

1. 错误码必须稳定且可检索。  
2. 错误码不得承载动态业务文本。  
3. 错误码与 message 分离。  

---

## 四、返回契约

```ts
interface ProtocolError {
  code: string
  message: string
  detail?: string
  retryable?: boolean
  displayMessage?: string
}
```

规则：

1. `code`：机器可判定。  
2. `message`：开发调试信息。  
3. `displayMessage`：用户侧文案。  
4. `retryable`：是否允许自动重试。  

---

## 五、错误码分层总表（MVP）

## 5.1 请求与协议层（API）

1. `E_API_INVALID_PAYLOAD`  
2. `E_API_MODEL_UNAVAILABLE`  
3. `E_API_UNSUPPORTED_VERSION`  
4. `E_API_TIMEOUT`  

## 5.2 流式层（STREAM）

1. `E_STREAM_INTERRUPTED`  
2. `E_STREAM_JSON_PARSE_FAILED`  
3. `E_STREAM_DUPLICATE_CHUNK`  
4. `E_STREAM_TOOL_ARGS_INCOMPLETE`  

## 5.3 工具层（TOOL）

1. `E_TOOL_NAME_NOT_FOUND`  
2. `E_TOOL_ARGS_INVALID`  
3. `E_TOOL_EXEC_FAILED`  
4. `E_TOOL_RETRY_EXHAUSTED`  
5. `E_TOOL_CONFIRMATION_REQUIRED`  

## 5.4 diff 与状态层（DIFF/STATE）

1. `E_DIFF_RANGE_UNRESOLVABLE`  
2. `E_DIFF_ORIGINALTEXT_MISMATCH`  
3. `E_DIFF_PARTIAL_OVERLAP`  
4. `E_DIFF_APPLY_FAILED`  
5. `E_STATE_TRANSITION_INVALID`  

## 5.5 上下文与资源层（CONTEXT）

1. `E_CONTEXT_SOURCE_UNAVAILABLE`  
2. `E_CONTEXT_BUDGET_EXCEEDED`  
3. `E_CONTEXT_INCOMPLETE`  
4. `E_CONTEXT_PRIORITY_CONFLICT`  

---

## 六、重试与降级语义

1. `retryable=true`：允许自动重试（有上限）。  
2. `retryable=false`：禁止自动重试，直接返回错误。  
3. 超过重试上限：转 `E_*_RETRY_EXHAUSTED`。  
4. 错误不阻塞主链时，执行降级并记录 exposure。  

---

## 七、错误码与观测映射

1. 每条错误码必须关联 `requestId/tabId/messageId/toolCallId`。  
2. 错误事件进入可观测性通道，不替代业务状态流转。  
3. 同一错误码应有稳定的排障指引。  

---

## 八、发布准入规则（MVP）

1. P0 链路不得存在未归类错误码。  
2. 所有已知错误必须映射到总表中的 code。  
3. 线上日志不得出现裸字符串错误（无 code）。  

---

## 九、来源映射

1. `R-AG-M-R-06_AI功能需求协议.md`：错误处理约束与三层链路来源。  