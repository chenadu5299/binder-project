# ai执行架构

## 文档头

- 结构编码：`AG-M-T-01`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`ai执行架构 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`
- 直接承接：`AG-M-P-01`, `AG-X-L-01`
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`
- 扩散检查：`AG-M-T-02`, `AG-M-T-03`, `AG-M-T-04`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：20_architecture / 20.04 / AI 执行架构主控  
> 文档角色：AI 执行架构控制文档  
> 关联主控：`A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-X-L-01_Binder Agent落地开发计划.md`  
> 关联专项：`A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md`

---

## 一、文档定位与控制权威

### 1.1 文档定位

本文定义 Binder AI 执行系统的**总体执行架构**。  
本文回答以下问题：

1. AI 请求从入口进入后，经过哪些统一执行层。
2. 三层 AI 交互系统在执行架构上如何并存而不互相污染。
3. 提示词、推理、工具、回流、观测在总体架构中的位置如何划分。
4. 哪些能力是统一基础设施，哪些能力只属于某一层。
5. 后续对 `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` 的修改，如何判断是否越过了总体执行架构边界。

### 1.2 控制权威

本文是 AI 执行架构层的**主控文档**。  
本文不替代：

1. `A-AG-M-T-02_prompt架构.md` 的提示词控制权。
2. `A-AG-M-P-01_工具调用体系.md` 的工具运行时控制权。
3. `A-AG-M-T-03_任务规划执行.md` 的任务闭环控制权。
4. `A-AG-M-D-01_Binder Agent能力描述文档.md` 与 `A-AG-M-T-04_Binder Agent技术主控文档.md` 的 Agent 上位语义与技术主控。

但上述文档在涉及总体执行分层时，不得逆向改写本文。

### 1.3 本文不负责什么

本文不负责：

1. 各层具体提示词文案。
2. 工具 schema 细节。
3. 某个单一功能的交互设计。
4. 当前代码逐文件实现说明。

---

## 二、适用范围与基本原则

### 2.1 适用范围

本文适用于 Binder 当前三层 AI 交互系统：

1. 层次一：辅助续写
2. 层次二：局部修改
3. 层次三：对话编辑

以及未来构建模式进入执行系统时的总体承接口径。

### 2.2 基本原则

1. 统一执行架构，不等于统一运行链。
2. 三层可以共享基础设施，但不得默认共享业务执行主链。
3. 总体执行架构必须允许层次差异存在，而不是强行统一。
4. 高影响链路必须具备可回流、可观测、可阻断能力。

---

## 三、规则 ID 体系

本文采用统一编码体系：

1. `AX-*`：本文本地规则
2. `BA-*`：复用 Agent 上位规则
3. `DE-*`：如需引用对话编辑专项规则，直接复用原 ID

| 规则域 | 含义 |
|---|---|
| `AX-CORE` | 本文定义的文档定位、统一口径、适用范围规则 |
| `AX-LAYER` | 总体执行分层模型 |
| `AX-L1` | 层次一执行架构约束 |
| `AX-L2` | 层次二执行架构约束 |
| `AX-L3` | 层次三执行架构约束 |
| `AX-RETURN` | 回流、状态与事件语义 |
| `AX-OBS` | 观测、错误分级、恢复策略 |
| `AX-GOV` | 本文定义的与上下游文档的控制关系 |

### 3.1 规则承接矩阵

| 规则ID | 规则名称 | 本文主定义位置 | 下游承接文档 |
|---|---|---|---|
| AX-CORE-001 | 统一执行架构不等于统一运行链 | 4.1 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| BA-SCENE-005 | 三层 AI 交互必须保持独立触发、独立执行链、独立提示词主链 | 4.2 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-T-03_任务规划执行.md` |
| BA-SCENE-006 | 新 Agent 优化不得在未明确决策前改写层次一/层次二运行逻辑 | 6.1/6.2 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-T-03_任务规划执行.md`、`A-AG-X-L-01_Binder Agent落地开发计划.md` |
| AX-LAYER-001 | 入口层负责分层接收，不负责业务合流 | 5.1 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-LAYER-002 | 提示词构建层按层次独立承接 | 5.2 | `A-AG-M-T-02_prompt架构.md` |
| AX-LAYER-003 | 推理与工具调度层是统一基础设施，不是统一业务主链 | 5.3 | `A-AG-M-P-01_工具调用体系.md` |
| AX-LAYER-004 | 回流与状态层负责事件回流与状态同步，不替代业务状态机 | 5.4 | `A-AG-M-T-03_任务规划执行.md` |
| AX-LAYER-005 | 观测层负责统一错误暴露与链路可观测 | 5.5 | `A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-L1-001 | 层次一保持单次、快速、无工具主链 | 6.1 | `A-AG-M-T-02_prompt架构.md` |
| AX-L1-002 | 层次一不进入完整 Agent 执行闭环 | 6.1 | `A-AG-M-T-03_任务规划执行.md` |
| AX-L2-001 | 层次二保持独立弹窗、多轮局部执行 | 6.2 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-L2-002 | 层次二不默认接入 Diff 主链和工具主链 | 6.2 | `A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-L3-001 | 层次三是完整 Agent 执行能力主要承接位 | 6.3 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-L3-002 | 层次三文档改写必须走可确认路径 | 6.3 | `A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-RETURN-001 | 执行状态与业务状态必须分离 | 7.1 | `A-AG-M-T-03_任务规划执行.md` |
| AX-RETURN-002 | 工具、文本、错误回流必须统一事件化 | 7.2 | `A-AG-M-P-01_工具调用体系.md` |
| AX-OBS-001 | 错误分级与恢复策略必须统一口径 | 8.1 | `A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-OBS-002 | 跳过、重试、终止必须可观测 | 8.2 | `A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-GOV-001 | 本文统总架构，不替代 `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` 专项控制 | 9.1 | `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` |
| AX-GOV-002 | 本文不得反向改写三层原始独立需求 | 9.2 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md` |

### 3.2 编码使用说明

本文采用以下编码原则：

1. `BA-*` 规则用于复用 Agent 上位主控中已经定义的规则。
2. `AX-*` 只用于本文首次定义的总体执行架构规则。
3. 本文不再为“层次独立性”这类已由 `BA-*` 定义的规则另起本地 ID。

---

## 四、总体架构立场

## 4.1 统一口径的真实含义

本文所说的“统一执行架构”，只包含以下统一内容：

1. 统一入口分层。
2. 统一基础设施位置。
3. 统一回流和观测语义。
4. 统一错误分级和恢复口径。

以下内容不因本文而统一：

1. 三层触发方式。
2. 三层业务交互逻辑。
3. 三层提示词主链。
4. 三层业务状态机。

### 4.2 三层独立性的总体约束

三层独立性不是局部提示，而是总体执行架构硬约束：

1. 层次一、层次二、层次三必须有独立入口。
2. 层次一、层次二不得默认共享层次三工具主链。
3. 层次二不得默认共享层次三 Diff 主链。
4. 层次三可以承接完整 Agent 优化，但不得反向吞并层次一、层次二。

---

## 五、执行分层模型

## 5.1 入口层 Entry Layer

### 5.1.1 作用

入口层负责接收不同 AI 入口请求，并将请求路由到正确执行链。

### 5.1.2 输入

1. 快捷键触发
2. 弹窗执行请求
3. 聊天消息发送
4. 未来构建模式工作流事件

### 5.1.3 输出

1. 层次一执行请求
2. 层次二执行请求
3. 层次三执行请求

### 5.1.4 约束

1. 入口层负责分层接收，不负责决定业务含义。
2. 入口层不得因为共享基础设施而合并三层业务入口。

## 5.2 提示词构建层 Prompt Layer

### 5.2.1 作用

提示词构建层负责按层次构建不同请求所需的提示词输入。

### 5.2.2 约束

1. 层次一、层次二、层次三各有主构建位。
2. 提示词构建允许共享字段命名，不允许默认共享业务提示词。
3. ContextManager 只主导层次三。

## 5.3 推理与工具调度层 Inference & Tool Layer

### 5.3.1 作用

推理与工具调度层负责：

1. 模型调用
2. 工具调用意图接收
3. 工具执行分发

### 5.3.2 约束

1. 这是统一基础设施层，不是统一业务主链。
2. 层次一默认不进入工具主链。
3. 层次二默认不进入对话编辑工具主链。
4. 层次三是工具主链的主要消费层。

## 5.4 回流与状态层 Return & State Layer

### 5.4.1 作用

处理：

1. 文本增量回流
2. 工具结果回流
3. 消息状态更新
4. Diff 写入与业务决策触发

### 5.4.2 约束

1. 回流层负责事件回流，不负责定义业务完成语义。
2. 执行状态不得直接替代业务状态。

## 5.5 观测层 Observation Layer

### 5.5.1 作用

输出：

1. 执行日志
2. 错误码
3. 重试信息
4. 跳过信息
5. 终止原因

### 5.5.2 约束

1. 所有链路异常都必须进入观测层。
2. 观测层不得吞掉业务关键错误。

---

## 六、三层执行链路与影响分析

## 6.1 层次一：辅助续写

### 6.1.1 执行链路

`上下文提取 -> 轻量提示词 -> 快速模型调用 -> 返回候选建议 -> 局部应用`

### 6.1.2 当前硬约束

1. 单次调用。
2. 低延迟优先。
3. 不走工具主链。
4. 不共享聊天历史。

### 6.1.3 当前允许吸收的优化

1. 统一字段命名。
2. 统一错误暴露。
3. 统一基础上下文采集规范。

### 6.1.4 当前不允许发生的变化

1. 不改成多阶段 Agent 执行链。
2. 不引入工具调用主链。
3. 不改为层次三的子入口。

## 6.2 层次二：局部修改

### 6.2.1 执行链路

`收集 instruction/text/context/messages -> 构建提示词 -> 模型返回结果 -> 应用到局部区域`

### 6.2.2 当前硬约束

1. 独立弹窗。
2. 多轮但局部执行。
3. 不进入对话编辑工具主链。
4. 不产出对话编辑 Diff 卡主链状态。

### 6.2.3 当前允许吸收的优化

1. 更清晰的局部范围语义。
2. 更明确的局部确认边界。
3. 上下文字段统一。

### 6.2.4 当前不允许发生的变化

1. 不默认接入 Diff 主链。
2. 不默认接入工具主链。
3. 不改造成聊天式主链。

## 6.3 层次三：对话编辑

### 6.3.1 执行链路

`多层上下文构建 -> ai_chat_stream -> tool_calls -> 工具结果回流 -> 继续调用/形成回复或 Diff`

### 6.3.2 当前硬约束

1. 工具执行必须走统一工具执行层。
2. 文档改写默认走可确认路径。
3. 执行状态与业务状态分离。

### 6.3.3 当前主要承接的优化

1. 状态跃迁。
2. 分层验证。
3. 确认机制。
4. artifact 与 gate。

### 6.3.4 边界

层次三可以成为完整 Agent 协作能力的主入口，但不能据此反向要求层次一、层次二共享其运行链。

---

## 七、回流、状态与事件语义

## 7.1 状态协作约束

1. 执行状态不直接等于业务状态。
2. Diff 的 `pending/accepted/rejected/expired` 应由业务状态机负责。
3. 执行异常通过观测层输出，不直接改写业务状态语义。

## 7.2 回流事件最小要求

回流事件至少需要覆盖：

1. 文本增量
2. 工具调用开始/结束
3. 错误事件
4. 验证结果事件
5. 确认请求 / 确认结果事件
6. 状态迁移事件
7. 完成事件

## 7.3 回流链设计否决条件

以下做法应被否决：

1. 工具结果只进日志，不回前端。
2. 错误被吞掉，只留下“失败了”。
3. 执行成功直接被写成业务完成。

---

## 八、错误分级与恢复策略

## 8.1 错误分级

统一分级如下：

1. `Retryable`：可重试
2. `Skippable`：可跳过继续
3. `Fatal`：终止当前链路

## 8.2 恢复策略

1. 可继续项优先继续。
2. 跳过项必须可观测。
3. Fatal 必须给出终止原因。

## 8.3 错误治理否决条件

以下情况不符合本文要求：

1. 重试语义不清。
2. 跳过后无暴露。
3. 终止时无定位线索。

## 8.4 工程模块落位

| 分层 | 前端模块 | 后端模块 | 当前主责任 |
|---|---|---|---|
| 入口层 | `src/components/Chat/ChatPanel.tsx`、`src/hooks/useAutoComplete.ts`、`src/hooks/useInlineAssist.ts` | `src-tauri/src/commands/ai_commands.rs` | 接收三层请求并路由到对应执行链 |
| 提示词构建层 | `src/hooks/useAutoComplete.ts`、`src/hooks/useInlineAssist.ts` | `src-tauri/src/services/context_manager.rs` | 构建 L1/L2/L3 提示词输入 |
| 推理与工具调度层 | `src/stores/chatStore.ts` | `src-tauri/src/commands/ai_commands.rs`、`src-tauri/src/services/tool_definitions.rs`、`src-tauri/src/services/tool_service.rs`、`src-tauri/src/services/tool_call_handler.rs` | 模型调用、工具定义注入、工具执行与重试 |
| 回流与状态层 | `src/stores/chatStore.ts`、`src/stores/diffStore.ts` | `src-tauri/src/commands/ai_commands.rs` | 消费流式事件、工具结果、Diff 与状态同步 |
| 观测层 | `src/components/Debug/ExecutionPanel.tsx` | `src-tauri/src/services/tool_service.rs` | 错误、跳过、重试、终止原因暴露 |

## 8.5 关键调用时序

### 8.5.1 层次一：辅助续写

```text
EditorPanel / useAutoComplete.trigger
  -> invoke('ai_autocomplete')
  -> ai_commands.rs::ai_autocomplete
  -> provider.chat / completion
  -> 返回 string[]
  -> AutoCompletePopover 展示 3 条建议
  -> 用户选择后 editor.insertContentAt
```

### 8.5.2 层次二：局部修改

```text
EditorPanel / useInlineAssist.execute
  -> invoke('ai_inline_assist')
  -> ai_commands.rs::ai_inline_assist
  -> provider.chat
  -> 返回 {"kind":"reply|edit","text":"..."}
  -> InlineAssistPanel 展示
  -> 用户 apply 时替换选区或当前块
```

### 8.5.3 层次三：对话编辑

```text
ChatPanel / chatStore.sendMessage
  -> invoke('ai_chat_stream')
  -> ai_commands.rs::ai_chat_stream
  -> ContextManager.build_multi_layer_prompt
  -> provider.chat_stream(..., tool_definitions)
  -> tool_call_handler / tool_service.execute_tool
  -> 流式事件回发前端
  -> chatStore / diffStore 消费
  -> 形成 message / tool_call / diff / verification / confirmation / stage state
```

## 8.6 统一事件协议

统一回流事件冻结为以下结构：

```ts
type ExecutionEventType =
  | 'text_delta'
  | 'tool_call_started'
  | 'tool_call_finished'
  | 'verification_ready'
  | 'confirmation_requested'
  | 'confirmation_resolved'
  | 'stage_transition'
  | 'completed'
  | 'error';

interface ExecutionEvent {
  tabId: string;
  type: ExecutionEventType;
  messageId?: string;
  toolCallId?: string;
  taskId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
```

前端统一由 `src/stores/chatStore.ts` 消费，业务衍生状态由 `src/stores/diffStore.ts` 或后续 `agent task store` 消费。

## 8.7 统一编排骨架

`src-tauri/src/commands/ai_commands.rs` 中三层入口应遵守如下编排骨架：

```rust
pub async fn route_ai_request(req: AiExecutionRequest) -> Result<(), String> {
    match req.layer {
        AiLayer::L1 => handle_autocomplete(req).await,
        AiLayer::L2 => handle_inline_assist(req).await,
        AiLayer::L3 => handle_agent_chat(req).await,
    }
}

async fn handle_agent_chat(req: AiExecutionRequest) -> Result<(), String> {
    let prompt = context_manager.build_multi_layer_prompt(&req.context, req.enable_tools);
    let stream = provider.chat_stream(&prompt.messages, &req.model, &mut req.cancel_rx, req.tool_definitions.as_deref()).await?;
    consume_stream_and_emit_events(stream, req.tab_id).await
}
```

该骨架要求：

1. 三层入口隔离。
2. 编排器只负责路由，不合并业务语义。
3. L3 才进入完整流式 + 工具 + 状态回流链。

---

## 九、与上下游文档的控制关系

## 9.1 下游专项文档职责

| 文档 | 职责 |
|---|---|
| `A-AG-M-T-02_prompt架构.md` | 提示词构建链和提示词治理 |
| `A-AG-M-P-01_工具调用体系.md` | 工具运行时契约 |
| `A-AG-M-T-03_任务规划执行.md` | 任务闭环、完成判定、异常治理 |

### 9.2 上游主控边界

| 文档 | 职责 |
|---|---|
| `A-AG-M-D-01_Binder Agent能力描述文档.md` | Agent 能力边界、三层独立性总约束、完成观 |
| `A-AG-M-T-04_Binder Agent技术主控文档.md` | Agent 技术对象、状态、验证、确认、gate |

### 9.3 与旧体系文档的关系

`R-AG-M-R-05_AI功能需求文档.md` 与 `R-AG-M-R-06_AI功能需求协议.md` 可作为背景和历史对照材料引用，但不再作为本文控制权威来源。

---

## 十、设计评审否决条件

以下任一情况成立，都应视为不符合 AI 执行架构主控要求：

1. 以统一架构为理由合并三层运行链。
2. 入口层不分层，直接把三层请求混流。
3. 层次一或层次二默认接入层次三工具或 Diff 主链。
4. 回流层直接写业务完成态。
5. 观测层吞掉关键错误。

---

## 十一、MVP 验收口径

1. 三层执行链路可独立跑通。
2. 层次三工具主链稳定回流。
3. 执行状态与业务状态不混用。
4. 错误分级、恢复、暴露口径统一。
5. 下游 `A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md` 可按本文分层模型独立承接。

---

## 十二、来源映射

1. `R-AG-M-R-12_AI功能三层架构设计.md`
2. `R-AG-M-R-05_AI功能需求文档.md`
3. `R-AG-M-R-06_AI功能需求协议.md`
4. `A-AG-M-D-01_Binder Agent能力描述文档.md`
5. `A-AG-M-T-04_Binder Agent技术主控文档.md`
6. `R-DE-M-R-02_对话编辑-统一整合方案.md`
