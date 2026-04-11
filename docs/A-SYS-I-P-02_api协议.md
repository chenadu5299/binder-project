# api协议

## 文档头

- 结构编码：`SYS-I-P-02`
- 文档属性：`主结构`
- 主责模块：`SYS`
- 文档职责：`api协议 / 接口、协议与契约主控`
- 上游约束：`CORE-C-D-04`, `CORE-C-D-05`, `CORE-C-D-06`, `SYS-C-T-01`
- 直接承接：无
- 接口耦合：`SYS-I-P-01`, `ENG-X-T-01`, `ENG-X-T-02`
- 汇聚影响：`CORE-C-R-01`, `SYS-C-T-01`
- 扩散检查：`SYS-M-T-01`
- 使用边界：`定义接口、协议与数据契约，不承担模块主规则裁定与开发计划`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 一、文档定位

本文是工程实现层的 API 与协议统一主规范，定义 AI 三层能力与对话编辑主链的接口契约、数据包结构、流式事件与错误语义。  
本文承接需求协议与前置协议，补齐统一协议索引层。

---

## 二、MVP 目标

1. 建立统一调用契约：命令入参、返回体、流式事件一致。  
2. 建立统一工具调用契约：tool request/response 与重试语义一致。  
3. 建立统一错误契约：可观测、可降级、可追踪。  

---

## 三、协议分层

## 3.1 入口命令层

1. `ai_autocomplete`（层次一）  
2. `ai_inline_assist`（层次二）  
3. `ai_chat_stream`（层次三）  

## 3.2 工具执行层

1. `ToolCall` 请求结构  
2. `ToolResult` 返回结构  
3. 工具重试与确认语义  

## 3.3 上下文协议层

1. 引用 `references` 协议  
2. 选区与定位 `editTarget` 协议  
3. `currentEditorContent / baseline / revision` 协议  

---

## 四、统一请求与响应包

## 4.1 请求包（通用）

```ts
interface AiRequestEnvelope<TPayload> {
  requestId: string
  tabId?: string
  workspacePath?: string
  payload: TPayload
  timestamp: number
  protocolVersion: string
}
```

## 4.2 响应包（通用）

```ts
interface AiResponseEnvelope<TData> {
  requestId: string
  success: boolean
  data?: TData
  error?: ProtocolError
  timestamp: number
  protocolVersion: string
}
```

---

## 五、层次三核心协议（ai_chat_stream）

## 5.1 入参基线

```ts
interface ChatStreamPayload {
  tabId: string
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  modelConfig?: { model?: string; temperature?: number; top_p?: number; max_tokens?: number }
  enableTools?: boolean
  currentFile?: string | null
  selectedText?: string | null
  currentEditorContent?: string | null
  editTarget?: Record<string, unknown>
  references?: Array<Record<string, unknown>>
  documentRevision?: number
  editorTabId?: string
}
```

## 5.2 流式事件协议

事件通道：`ai-chat-stream`

```ts
interface ChatStreamEvent {
  tab_id: string
  message_id: string
  chunk?: string
  done?: boolean
  tool_call?: {
    id: string
    name: string
    arguments?: string
    status?: 'calling' | 'completed' | 'failed'
    result?: Record<string, unknown>
  }
  error?: ProtocolError
}
```

---

## 六、工具调用协议

## 6.1 ToolCall

```ts
interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}
```

## 6.2 ToolResult

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

约束：

1. `arguments` 必须为可解析 JSON。  
2. `error_kind` 用于模型重试决策，`display_error` 用于用户展示。  
3. 工具失败不应破坏整个流式会话。  

---

## 七、上下文注入协议

## 7.1 references 协议

```ts
interface ReferenceItem {
  type: 'text' | 'file' | 'folder' | 'image' | 'table' | 'memory' | 'link' | 'chat' | 'kb' | 'template'
  source: string
  content: string
  preciseRange?: {
    startBlockId: string
    startOffset: number
    endBlockId: string
    endOffset: number
  }
}
```

## 7.2 编辑定位协议

`editTarget`/选区坐标用于零搜索定位，缺失时走块级定位路径。

## 7.3 状态协作字段

1. `currentEditorContent`：当前注入内容快照。  
2. `documentRevision`：文档修订号。  
3. `baselineId`（扩展字段）：本轮基线标识。  

---

## 八、错误协议

```ts
interface ProtocolError {
  code: string
  message: string
  detail?: string
  retryable?: boolean
}
```

最小错误码集合（MVP）：

1. `E_API_INVALID_PAYLOAD`  
2. `E_API_MODEL_UNAVAILABLE`  
3. `E_API_STREAM_INTERRUPTED`  
4. `E_TOOL_ARGS_INVALID`  
5. `E_TOOL_EXEC_FAILED`  
6. `E_CONTEXT_INCOMPLETE`  

---

## 九、版本与兼容

1. 所有请求/响应必须带 `protocolVersion`。  
2. 新字段采用向后兼容追加，不做破坏式改名。  
3. 废弃字段进入 `deprecated` 清单并标记移除计划。  

---

## 十、与配置文档关系

`API配置指南` 负责 provider key 与运行配置，不定义协议结构。  
本文负责接口与数据契约定义。

---

## 十一、MVP 验收口径

1. 三层命令均有统一请求/响应口径。  
2. 流式事件与工具调用结构可稳定消费。  
3. 错误码、重试语义与用户展示语义分离。  
4. 协议版本可追踪，新增字段可兼容。  

---

## 十二、来源映射

1. `R-AG-M-R-06_AI功能需求协议.md`：三层命令与需求约束来源。  
2. `R-AG-M-R-08_AI功能前置协议与标准.md`：引用、上下文、工具格式与前置约束来源。  
3. `R-ENG-X-R-03_API配置指南.md`：运行配置边界来源（非协议主定义）。  