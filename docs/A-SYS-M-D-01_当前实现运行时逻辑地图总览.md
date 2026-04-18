# 当前实现运行时逻辑地图总览

## 文档头

- 结构编码：`SYS-M-D-01`
- 文档属性：`运行时地图 / 索引主文档`
- 主责模块：`SYS`
- 文档职责：`当前实现运行时逻辑地图总索引、主链摘要、危险点摘要`
- 生成依据：代码事实（非设计文档）
- 代码读取范围：`src/stores/`, `src/components/Chat/`, `src/services/`, `src-tauri/src/commands/`, `src-tauri/src/services/`, `src-tauri/src/workspace/`
- 术语来源：`A-CORE-C-D-02_产品术语边界.md`
- 生成时间：2026-04-16

---

> 文档类型：`运行时地图 / 代码事实`  
> 当前状态：`Active`  
> 不是：产品愿景文档、方案设计文档、重构提案文档  
> 如有文档与代码不一致，以代码为准，不一致点在各子文档末尾单列

---

## 一、子文档索引

| 编码 | 文件名 | 内容定位 |
|------|--------|----------|
| SYS-M-D-02 | `A-SYS-M-D-02_结构总览图.md` | 应用级结构、模块级结构、层次边界、模块间接口点、主链/旧残留标记 |
| SYS-M-D-03 | `A-SYS-M-D-03_关键链路时序图.md` | 对话编辑主链、打开文档编辑链、未打开文档修改链、引用注入链、Agent/Task 推进链、工作区切换链 |
| SYS-M-D-04 | `A-SYS-M-D-04_状态机图.md` | Diff 状态机、Agent/Task 状态机、工作区/当前文档感知状态图 |
| SYS-M-D-05 | `A-SYS-M-D-05_协议与分叉清单.md` | 协议对象清单、分叉链清单、字段丢失/静默兼容登记 |

---

## 二、实现命名映射表

> 以下列出代码中存在的旧命名、别名，统一对应到术语边界中的标准术语。

| 代码中出现的命名 | 标准术语（A-CORE-C-D-02） | 所在文件 | 备注 |
|----------------|---------------------------|----------|------|
| `byTab` (diffStore) | `byTab`（以 filePath 为键的编辑器 diff 池） | `src/stores/diffStore.ts` | 字段名历史来自"按 tab"，但实际键为 **filePath 字符串**，非 tabId |
| `byFilePath` (diffStore) | workspace 文件 diff 池 | `src/stores/diffStore.ts` | 对应未打开文档的 pending_diffs 路径 |
| `positioningCtx.L` | 当前文档快照 HTML（本轮 baseline） | `src/stores/chatStore.ts` | 每轮 `sendMessage` 时更新，非"仅设一次" |
| `currentWorkspace` (fileStore) | workspace_path / 当前工作区路径 | `src/stores/fileStore.ts` | **属性名为 `currentWorkspace`，非 `currentWorkspacePath`** |
| `contentBlocks` | 新消息内容块路径 | `src/components/Chat/ChatMessages.tsx` | 相对旧的 `toolCalls` 字段的新格式 |
| `toolCalls` (ChatMessage) | 旧工具调用路径 | `src/components/Chat/ChatMessages.tsx` | 兼容路径，仍在运行中 |
| `ChatMode: 'agent' \| 'chat'` | 对话模式 | `src/stores/chatStore.ts` | 文档中有提及 `edit` 模式，但代码中不存在 |
| `[NEXT_ACTION]` user 消息 | 内部编排控制消息 | `src-tauri/src/commands/ai_commands.rs` | 非用户真实消息，前端过滤时排除 |
| `[TOOL_RESULTS]` user 消息 | 内部工具结果汇总消息（历史遗留） | `src-tauri/src/commands/ai_commands.rs` | 当前主链已改为 `role:"tool"` 单条写法，`[TOOL_RESULTS]` 为历史格式标识符 |
| `runtimeMode: 'shadow'` | Shadow runtime（投影运行时） | `src/stores/agentStore.ts` | 所有新建 tab 默认为 shadow |
| `edit_current_editor_document` | 当前文档编辑工具 | `src-tauri/src/services/tool_service.rs` | 作用于已打开文档；与 `update_file` 分叉 |
| `FileDiffEntry` | workspace 文件 diff 条目 | `src/stores/diffStore.ts` | 区别于 `DiffEntry`（编辑器 diff） |
| `pending_diffs` (workspace_db) | workspace pending diff 池 | `src-tauri/src/workspace/workspace_db.rs` | 仅由 `update_file` 写入，`edit_current_editor_document` 不写 |

---

## 三、当前实现主链摘要

### 3.1 最关键的三条运行主链

#### 主链 A：对话编辑主链（已打开文档）

```
用户输入 → ChatInput → chatStore.sendMessage
  → 构建 baseline/positioningCtx
  → invoke('ai_chat_stream')
    → context_manager.build_prompt_package（4+层注入）
    → provider.chat_stream（DeepSeek/OpenAI）
    → 流式 emit("ai-chat-stream")
  → 前端 ChatPanel 接收：appendToMessage / addContentBlock
  → tool_call：edit_current_editor_document
    → tool_service.rs resolve()（Resolver 路径）
    → 生成 canonical DiffEntry，写入 ToolResult.data.diffs
    → emit tool_call result
  → 前端：ChatMessages → contentBlocks → DiffCard
  → 用户 accept：DiffActionService.acceptDiff
    → buildAcceptReadRow（门禁校验）
    → applyDiffReplaceInEditor
    → diffStore.acceptDiff
    → AgentTaskController.checkAndAdvanceStage
```

**关键字段**：`positioningCtx.L`（baseline HTML）、`documentRevision`、`diffId`、`startBlockId`/`endBlockId`、`originalText`/`newText`

#### 主链 B：对话修改未打开文档链（workspace 路径）

```
用户输入 → chatStore.sendMessage → invoke('ai_chat_stream')
  → tool_call：update_file
    → tool_service.rs → diff_engine.generate_pending_diffs_for_file_type
    → workspace_db.insert_pending_diffs
    → ToolResult.data.pending_diffs（不写盘）
  → 前端：ToolCallCard → FileDiffCard / DiffCard（via byFilePath）
  → 用户 accept：DiffActionService.acceptFileDiffs
    → diffStore.acceptFileDiffs → invoke('accept_file_diffs')
    → 后端逆序写盘
    → AgentTaskController.handleFileDiffResolution
```

**关键字段**：`FileDiffEntry`（`original_text`/`new_text`/`diff_index`/`para_index`）、`byFilePath`

#### 主链 C：Agent 任务状态推进链

```
sendMessage (agent mode) → createShadowTaskRecord → setCurrentTask
  → AI 执行工具（主链 A 或 B）
  → 用户 accept/reject diff
  → DiffActionService → AgentTaskController.checkAndAdvanceStage
    → allDiffs 无 pending
      → 有 accepted → stage_complete（confirmation: all_diffs_resolved）
      → 全 rejected/expired → forceInvalidate
    → agentStore.setStageState / setConfirmation
```

### 3.2 主链模块依赖关系（简化）

```
chatStore.sendMessage
  ├── fileStore（工作区路径）
  ├── referenceStore（引用列表）
  ├── editorStore（编辑器 tab、documentRevision）
  ├── agentStore（shadow task 创建）
  └── invoke('ai_chat_stream') [Tauri IPC]
       ├── context_manager（prompt 构建）
       ├── provider（DeepSeek / OpenAI）
       ├── tool_service（工具执行）
       │    ├── edit_current_editor_document → ToolResult.diffs
       │    └── update_file → workspace_db.pending_diffs
       └── emit("ai-chat-stream") → ChatPanel → ChatMessages
            ├── contentBlocks 路径 → DiffCard → DiffActionService
            └── toolCalls 路径（旧）→ ToolCallCard → DiffActionService / FileDiffCard
```

---

## 四、当前最危险的分叉点 Top 10

| 排名 | 分叉名称 | 涉及文件 | 风险类型 | 建议治理方向 |
|------|----------|----------|----------|-------------|
| 1 | `contentBlocks` vs `toolCalls` 双路径渲染 | `ChatMessages.tsx` | UI 渲染不一致；同一工具调用可能被两条路径分别展示或遗漏 | 废弃 `toolCalls` 路径，统一走 `contentBlocks` |
| 2 | `edit_current_editor_document` vs `update_file` | `tool_service.rs` | 用于已打开文档时若错误选择 `update_file`，编辑器状态与磁盘分叉 | AI 模型层强制校验；当前文件打开状态注入工具选择决策 |
| 3 | `byTab`（filePath键）vs `byFilePath` 两套 diff 池 | `diffStore.ts` | 接受/拒绝逻辑分叉；`AgentTaskController` 需跨两池查询；状态合并存在漏判 | 明确两池的生命周期与归属规则，统一聚合查询入口 |
| 4 | `[NEXT_ACTION]` user 消息与 `role:"tool"` 双重注入 | `ai_commands.rs` | 多轮 history 污染；前端 `sendMessage` 过滤逻辑依赖字符串前缀，脆弱 | 迁移到 provider-native tool result；去掉 `[NEXT_ACTION]` user 包装 |
| 5 | `LoopDetector` 关键词硬编码、绕过容易 | `loop_detector.rs` | 任意一次参数变化重置计数器；语义检测依赖中文硬编码短语 | 基于工具调用签名哈希+语义相似度替代字符串匹配 |
| 6 | `DiffCard` onAccept/onReject 通过 props 传入 | `DiffCard.tsx` | 回调来源不统一；存在 ToolCallCard 内部有独立 `removeFileDiffEntry` 直接操作 diffStore 的旁路 | 所有 diff 操作统一经 `DiffActionService`，DiffCard 只发事件 |
| 7 | `AgentShadowStateSummary` 的 workflow 旁路控制 | `AgentShadowStateSummary.tsx` / `ToolCallCard.tsx` | workflow 阶段状态可由 UI 直接触发 `templateService` 修改，绕过 `AgentTaskController` | 明确 workflow 事件路由；或将 workflow 推进纳入 controller 管辖 |
| 8 | `WorkPlanCard` 发确认消息替代 Agent 正式 plan 推进 | `ChatMessages.tsx` / `WorkPlanCard.tsx` | 注释明确"兼容展示，不接 Agent 正式 plan 主链"，但仍在渲染中 | Phase 1 起废弃；当前不应依赖其作为任务确认入口 |
| 9 | `ChatMode` 代码只有 `agent`/`chat`，文档提及 `edit` | `chatStore.ts` vs 旧文档 | 基于 `edit` 模式的逻辑在代码中不存在；若有遗留引用将静默失效 | 清理所有 `edit` 模式引用；更新文档 |
| 10 | `OpenAI provider` tool-calling 完全失效 | `src-tauri/src/services/ai_providers/openai.rs` | `_tools` 参数被忽略，SSE 无 `tool_calls` 分支；选 OpenAI = agent 模式全失效 | 实现 OpenAI SSE tool_calls 解析，对齐 DeepSeek 路径 |

---

## 五、当前最危险的协议污染点 Top 10

| 排名 | 污染名称 | 字段 / 对象 | 具体问题 |
|------|----------|-------------|----------|
| 1 | `new_content` 语义不一致 | `ToolResult.data.new_content` | `edit_current_editor_document` 成功路径 `new_content` = 当前 HTML（非修改后），实际修改在 `diffs[0].newText`；消费方需明确区分 |
| 2 | `FileDiffEntry` vs `DiffEntry` 字段命名不一致 | `original_text`（下划线）vs `originalText`（驼峰） | 两套 diff 池字段命名风格不同，消费时需双重适配 |
| 3 | `ChatMessage.role` 无 `tool` 值 | `chatStore.ts` `ChatMessage` | 工具结果在前端消息列表中没有 `role:"tool"` 存储，仅在后端 history 中存在；前端重建 history 时丢失 tool 结果 |
| 4 | `toolCalls` 与 `contentBlocks` 共存于同一 `ChatMessage` | `ChatMessage` | 两字段可能同时存在，渲染优先级依赖 `contentBlocks?.length > 0` 判断；边缘状态可能双重渲染 |
| 5 | `byTab` 键名误导性 | `diffStore.byTab` | 字段名为 `byTab` 但键是 `filePath`；消费代码用 `filePath` 查，与字段名产生认知分叉 |
| 6 | `[NEXT_ACTION]`/`[TOOL_RESULTS]` 字符串前缀过滤机制 | `ai_commands.rs` / `chatStore.sendMessage` | 过滤逻辑依赖字符串前缀，与模型生成内容边界模糊；模型若生成含此前缀文本则误判 |
| 7 | `positioningCtx.L` / `getLogicalContent` 语义重叠 | `chatStore` / `diffStore` | 两者语义相近，当前 `getLogicalContent` 已实现但未被主链调用；维护成本高，可能未来引入分歧 |
| 8 | `PendingDiffEntry` para_index 用于行级定位 | `workspace_db.rs` | `para_index` 含义为段落/行索引，与 `startBlockId/startOffset` 精度不等；两套 diff 池定位精度不统一 |
| 9 | `expireReason` 枚举与 `stageReason` 字符串混用 | `diffStore` / `AgentTaskController.ts` | `expireReason` 有类型枚举，`stageReason` 传字符串字面量；类型一致性待统一 |
| 10 | `WorkflowExecutionRuntime` 嵌入 `AgentRuntimeRecord` | `agentStore.ts` | workflow 状态通过 `setWorkflowExecution` 写入 agent runtime，与 task 状态共享同一 store；workflow 推进旁路可影响 task 状态 |

---

## 六、当前最危险的状态越权点 Top 10

| 排名 | 越权名称 | 发生位置 | 越权方式 | 说明 |
|------|----------|----------|----------|------|
| 1 | `ChatMessages` 直接推进 agentStore stage | `ChatMessages.tsx` useEffect | UI 组件监听 stageState + 消息内容，直接调用 `useAgentStore.setStageState / setConfirmation` | 应由 AgentTaskController 唯一推进，UI 仅订阅 |
| 2 | `ToolCallCard` `removeFileDiffEntry` 直接操作 diffStore | `ToolCallCard.tsx` | 拒绝 FileDiffCard 时，除调用 `DiffActionService.rejectDiff` 外还直接调 `diffStore.removeFileDiffEntry` | 破坏 DiffActionService 的唯一入口约束 |
| 3 | `AgentShadowStateSummary` 通过 templateService 推进 workflow | `AgentShadowStateSummary.tsx` | UI 按钮直接调 templateService 修改 workflow 执行态，再调 `agentStore.setWorkflowExecution` | 绕过 AgentTaskController；workflow 与 task 状态耦合 |
| 4 | `WorkPlanCard` 发消息推进 task | `ChatMessages.tsx` → `sendMessage` | 用户确认 WorkPlan 后，组件直接调 `sendMessage(tabId, '好的，开始执行')` 作为 task 推进手段 | 兼容路径，非 Agent 正式状态推进 |
| 5 | `DiffAllActionsBar` 直接调 `editorStore.updateTabContent` | `DiffAllActionsBar.tsx` | 批量接受后直接写 `updateTabContent`；同时触发 `documentRevision++` 和 `expirePendingForStaleRevision` | 可能与 DiffActionService 内部的 updateTabContent 调用重复 |
| 6 | `setMode` 拒绝切换有消息 tab 的限制缺乏保护 | `chatStore.ts` | `setMode` 若已有消息则拒绝，但检测逻辑仅在 action 层；外部直接修改 zustand state 可绕过 | Zustand store 无私有保护机制 |
| 7 | `stage_transition_guard.rs` 存在但未知是否覆盖所有路径 | `src-tauri/src/services/stage_transition_guard.rs` | 后端存在专用 stage transition guard 服务，但其覆盖范围与前端 AgentTaskController 的关系未验证 | 需交叉比对覆盖范围 |
| 8 | 前端 `confirmAuthorization` 直接 invoke 工具执行 | `ChatMessages.tsx` | `resolveAuthorization` 路径直接 invoke `execute_tool_with_retry`，绕过正常 `ai_chat_stream` 工具调用链 | 工具执行结果不经过 task progress 分析 |
| 9 | `createShadowTaskRecord` 在 sendMessage 中而非由 Agent runtime 触发 | `chatStore.ts` | task 创建与消息发送耦合在同一函数；agent 模式下每次 sendMessage 都创建新 task | 应由 AgentTaskController 管理 task 生命周期 |
| 10 | `refreshPositioningContextForEditor` 调用方分散 | `chatStore.ts` / `DiffAllActionsBar.tsx` | baseline 刷新逻辑在 DiffAllActionsBar 里通过 `useChatStore.getState()` 调用，而非统一入口 | 基线状态刷新路径不收口 |

---

## 七、后续最值得优先治理的方向

### 方向一：统一 diff 渲染路径（消除 contentBlocks / toolCalls 双轨）

**根因**：`ChatMessage` 同时有 `toolCalls` 和 `contentBlocks` 字段，渲染路径分叉，协议字段语义重复。  
**影响**：diff 展示可能遗漏，accept/reject 状态更新存在不一致风险。  
**治理步骤**：
1. 明确 `contentBlocks` 为唯一渲染主链
2. 将旧 `toolCalls` 路径标记为 `@deprecated`，加警告 log
3. 逐步清理 `ToolCallCard` 中 `edit_current_editor_document` 的旧路径（当前已禁用但代码仍保留）

### 方向二：收口 Diff 操作入口（DiffActionService 唯一化）

**根因**：`ToolCallCard` 直接调 `diffStore.removeFileDiffEntry`；`DiffAllActionsBar` 直接调 `editorStore.updateTabContent`；部分路径绕过 `AgentTaskController`。  
**影响**：Agent task 状态推进可能漏触发；diff 池状态可能不一致。  
**治理步骤**：
1. `DiffActionService` 增加 `removeFileDiffEntry` 封装
2. `updateTabContent` 调用统一由 `acceptDiff` 内部触发，外部不重复调用
3. 所有 FileDiff 相关操作通过 `DiffActionService` 路由

### 方向三：修复 OpenAI provider tool-calling

**根因**：`openai.rs` `chat_stream` 忽略 `_tools` 参数，SSE 无 `tool_calls` 分支。  
**影响**：选择 OpenAI provider 时 agent 模式全失效。  
**治理步骤**：
1. 实现 OpenAI SSE `tool_calls` 增量块解析
2. 对齐 `DeepSeekProvider::chat_stream` 中的工具调用处理逻辑
3. 统一 `AIProvider` trait 的 tool calling 行为保证

---

## 八、文档与实现不一致点清单

| 不一致项 | 旧文档描述 | 实际代码实现 | 所在文档 |
|----------|-----------|-------------|----------|
| `ChatMode` 包含 `edit` | CLAUDE.md 写"agent、chat 或 edit" | 代码只有 `'agent' \| 'chat'` | CLAUDE.md ChatTab.mode |
| baseline "仅设一次" | 旧 CLAUDE.md 描述"set once per session" | `sendMessage` 每轮覆盖 `positioningCtx.L` | CLAUDE.md Known Bugs（已有修正说明，但正文未完全清理） |
| `byTab` 键为 tabId | 字段名 `byTab` 语义暗示 | 实际键为 `filePath` 字符串 | 代码注释与字段命名不一致 |
| `edit_current_editor_document` 有 Anchor/Resolver/Legacy 三条路径 | CLAUDE.md ToolResult 不一致条目描述三条路径 | 实际代码统一为单一 `resolve()` 入口，无 Anchor 独立函数 | CLAUDE.md Medium bugs 条目 |
| `getLogicalContent` 未被调用 | CLAUDE.md 说保留供未来使用 | `diffStore.ts` 中已实现，`chatStore.sendMessage` 用 `positioningCtx.L` 直接传 | CLAUDE.md Critical 已标注，状态一致 |
| OpenAI provider tool 完全失效 | CLAUDE.md Critical 已标注 | 代码确认 `_tools` 被忽略 | 状态一致 |
| `role:"user"` `[TOOL_RESULTS]` 消息 | CLAUDE.md 描述"部分修复" | 当前主链写 `role:"tool"` 单条；`[TOOL_RESULTS]` 仍作为字符串前缀用于过滤判断，但不作为新消息写入 | CLAUDE.md Medium bugs |
