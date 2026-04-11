# Binder Agent落地开发计划

## 文档头

- 结构编码：`AG-X-L-01`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`Binder Agent落地开发计划 / 落地、迁移与开发计划`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `AG-M-T-01`
- 直接承接：无
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`, `AG-M-T-01`
- 扩散检查：`AG-M-P-01`, `AG-M-T-02`, `AG-M-T-03`, `AG-M-T-04`
- 使用边界：`定义落地、迁移与开发承接，不承担规则主源与技术主源职责`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：30_capabilities / 03_ai执行系统 / Agent 落地开发计划  
> 上位文档：`A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`  
> 关联指导参考：`R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`

---

## 一、文档定位

本文是 Binder Agent 的**落地开发计划文档**。  
本文回答：

1. `A-AG-M-D-01_Binder Agent能力描述文档.md` 与 `A-AG-M-T-04_Binder Agent技术主控文档.md` 中的规则与技术控制点如何分阶段承接
2. 哪些现有文档需要同步更新
3. 哪些代码模块将成为主要承接对象
4. 每个阶段的验收门槛是什么

本文**不是**需求文档，也不是上位指导文档。  
本文是 Agent 文档组中的**执行承接文档**。

---

## 二、文档关系

1. `A-AG-M-D-01_Binder Agent能力描述文档.md`：能力描述主控，定义做什么、边界是什么、语义如何成立
2. `A-AG-M-T-04_Binder Agent技术主控文档.md`：技术主控，定义怎么承接、对象如何建模、关键控制点在哪里
3. 本文：开发计划，定义如何逐步落地与同步承接
4. `R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`：方向性背景参考，不作为开发阶段唯一依赖入口

补充说明：

1. Agent 的开发控制面以 `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、本文为准。
2. 即使不查阅 `R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`，也应能根据 `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、本文完成开发承接与评审。

---

## 三、规则 ID -> 阶段承接矩阵

| 规则域 | 主要规则 | 阶段 | 承接文档 | 重点模块 |
|---|---|---|---|---|
| BA-CORE | BA-CORE-001~002 | P0 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-M-T-01_ai执行架构.md` | `A-AG-M-T-01_ai执行架构.md`、Agent 入口层 |
| BA-MODEL | BA-MODEL-001~004 | P0 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-M-T-03_任务规划执行.md` | 任务对象、确认对象、责任标签 |
| BA-STATE | BA-STATE-001~004 | P0/P1 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-M-T-03_任务规划执行.md` | 状态语义、阶段闭合、状态对象 |
| BA-VERIFY | BA-VERIFY-001~005 | P1 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-M-T-03_任务规划执行.md` | 分层验证对象、确认对象 |
| BA-RUN | BA-RUN-001~004 | P1 | `A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-M-T-01_ai执行架构.md`、`A-AG-M-P-01_工具调用体系.md` | 逻辑循环、gate、artifact |
| BA-SCENE | BA-SCENE-001~006 | P0/P1/P2 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AG-M-T-02_prompt架构.md`、`A-AST-M-P-01_上下文注入.md` | 三层独立性边界、场景入口、上下文装配、提示词承接 |
| BA-ASSET | BA-ASSET-001~002 | P2 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、`A-AST-M-P-01_上下文注入.md`、`A-AST-M-D-01_Binder Agent记忆协同主控文档.md`、`A-AST-M-D-02_Binder Agent知识库协同主控文档.md`、`A-AST-M-T-02_知识库机制.md`、`A-TMP-M-T-01_模板机制.md`、`A-TMP-M-D-01_Binder Agent模板协同主控文档.md` | artifact、记忆沉淀、知识资产、模板种子 |
| BA-GOV | BA-GOV-001~003 | P0 | `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、本文、`A-CORE-C-R-01_项目文档结构清单（标准目录）.md` | 文档结构与主控协同 |

补充说明：

1. 当前 Agent 优化的主要承接层次是层次三（对话编辑）。
2. 层次一、层次二仅在有明确需求和明确设计决策时吸收局部优化。
3. 未明确要求作用于层次一、层次二的优化，不进入其开发计划默认范围。

### 3.1 当前代码承接审计补充

#### BA-CORE

- 当前代码承接模块：`src/stores/chatStore.ts`、`src-tauri/src/commands/ai_commands.rs`、`src-tauri/src/services/context_manager.rs`
- 当前实现：存在 `mode='agent'`、`enable_tools`、多轮流式工具链，说明 Agent 已作为现行运行入口之一进入系统
- 主要缺口：Agent 仍与普通 chat、对话编辑、辅助续写、局部修改共用大块入口与状态容器，未形成独立运行骨架
- 伪承接/弱承接：`src/hooks/useAutoComplete.ts`、`src/hooks/useInlineAssist.ts`、`ai_autocomplete`、`ai_inline_assist` 与主 Agent 共处同一后端命令层，说明三条 AI 路径尚未完全拆开

#### BA-MODEL

- 当前代码承接模块：`src/types/tool.ts`、`src/types/reference.ts`、`src/stores/diffStore.ts`、`src-tauri/src/services/tool_service.rs`
- 当前实现：已有 `ToolCall`、`ToolResult`、`Reference`、`DiffEntry`、`ExecutionExposure`、`RequestContext`
- 主要缺口：缺 `AgentTask`、`StageState`、`VerificationRecord`、`ConfirmationRecord`、`ArtifactRecord`、`PromptPackage`
- 伪承接/错承接：`src/utils/workPlanParser.ts`、`src/components/Chat/WorkPlanCard.tsx` 只是从回复文本里猜“计划”，不是正式任务模型；`workspace_db.ai_tasks` 已建表但未进入运行主链，属于预留承接

#### BA-STATE

- 当前代码承接模块：`src/stores/diffStore.ts`、`src/stores/chatStore.ts`、`src-tauri/src/services/conversation_manager.rs`、`src-tauri/src/services/stream_state.rs`
- 当前实现：存在 `pending/accepted/rejected/expired` diff 状态、tool call 状态、stream 状态
- 主要缺口：`structured/candidate_ready/review_ready/user_confirmed/stage_complete/invalidated` 没有统一 Agent 状态对象，只是散落在 diff、消息、tool status 中
- 弱承接：`edit_current_editor_document` 与 `update_file(use_diff)` 的“候选态”已存在，但没有统一 stage 闭合接口

#### BA-VERIFY

- 当前代码承接模块：`src/stores/diffStore.ts`、`src/utils/requestContext.ts`、`src-tauri/src/services/tool_service.rs`、`src-tauri/src/services/positioning_resolver.rs`、`src-tauri/src/services/block_tree_index.rs`、`src-tauri/src/workspace/workspace_commands.rs`
- 当前实现：已有 snapshot gate、originalText 校验、block tree stale 检测、非当前文档四态 gate、execution exposure
- 主要缺口：缺统一验证记录对象，验证结果未回流到 prompt/context/state 主链
- 弱承接：当前验证更像 DE/文件编辑校验，不是 Agent 通用验证层

#### BA-RUN

- 当前代码承接模块：`src-tauri/src/commands/ai_commands.rs`、`src-tauri/src/services/tool_call_handler.rs`、`src-tauri/src/services/tool_service.rs`、`src-tauri/src/services/confirmation_manager.rs`
- 当前实现：存在 `chat_stream -> tool parse/repair -> execute -> continue` 主循环，也存在取消、重试、错误暴露
- 主要缺口：缺正式 `runtime gate` 对象与 stage transition guard；工具结果成功仍会被多处逻辑当作“可以继续总结/收口”的依据
- 错承接：`src-tauri/src/services/task_progress_analyzer.rs` 以工具结果启发式判断任务状态，与主控要求的“verify/confirm/transition 后闭合”不一致

#### BA-SCENE

- 当前代码承接模块：`chatStore.sendMessage`、`ai_chat_stream`、`useAutoComplete`、`useInlineAssist`、`context_manager.rs`
- 当前实现：三条 AI 路径客观存在，层次三最成熟，层次一/二也已上线
- 主要缺口：路径边界虽然存在，但 prompt 构建仍共用同一后端文件与部分上下文方法；层次一/二历史逻辑仍容易回流到主 Agent 设计判断
- 重点风险：如果不拆运行入口与 prompt assembly，后续 P1/P2 的 Agent 状态与 artifact 会继续被 L1/L2 旧链污染

#### BA-ASSET

- 当前代码承接模块：`diffStore`、`workspace_db`、`memory_service`、`referenceStore`、`documentService`、`workspace_commands`
- 当前实现：已有 `pending_diffs`、`file_cache`、`file_dependencies`、`memories.db`、引用协议、执行观测暴露
- 主要缺口：`plan/candidate/verification/confirmation` 尚未成为统一 artifact；记忆/知识/模板尚未进入 Agent L3 prompt 主装配
- 伪承接：记忆当前主要是独立 CRUD 与 UI 跳转，不是 Agent 上下文增强链

#### BA-GOV

- 当前承接模块：主控/专项文档组、`tool_definitions.rs`、`ExecutionPanel`、旧 R 文档顶部声明
- 当前实现：文档层面已经有主控与旧体系降级说明；运行时存在执行观测面板
- 主要缺口：工程内没有“prompt 变更登记”、“tool 变更登记”、“旧引用阻断”这种可执行治理机制
- 待补控制位：`tool matrix -> tool_definitions` 自动生成、`PromptPackage` 类型冻结、文档与代码引用扫描规则

---

## 四、阶段划分

### 4.0 代码承接对象扩展清单

在本文后续各阶段审计中，除原先列出的 `chatStore.ts / context_manager.rs / ai_commands.rs / tool_service.rs / 类型定义层` 外，以下文件均纳入相关范围：

1. 前端直接相关：`src/stores/diffStore.ts`、`src/stores/referenceStore.ts`、`src/utils/requestContext.ts`、`src/utils/workPlanParser.ts`、`src/services/documentService.ts`、`src/services/memoryService.ts`
2. 前端 UI 消费层：`src/components/Chat/ChatMessages.tsx`、`ToolCallCard.tsx`、`ToolCallSummary.tsx`、`DiffCard.tsx`、`FileDiffCard.tsx`、`WorkPlanCard.tsx`、`src/components/Debug/ExecutionPanel.tsx`
3. 前端辅助 AI 路径：`src/hooks/useAutoComplete.ts`、`src/hooks/useInlineAssist.ts`
4. 后端命令与服务：`src-tauri/src/services/tool_call_handler.rs`、`tool_definitions.rs`、`confirmation_manager.rs`、`task_progress_analyzer.rs`、`memory_service.rs`、`src-tauri/src/commands/memory_commands.rs`
5. Workspace / artifact / gate：`src-tauri/src/workspace/workspace_commands.rs`、`workspace_db.rs`、`diff_engine.rs`、`canonical_service.rs`、`src-tauri/src/services/block_tree_index.rs`、`positioning_resolver.rs`
6. 旧逻辑残留或疑似相关：`referenceStore.formatForAI`、`workPlanParser + WorkPlanCard`、`ai_tasks` 预留表、`ai_inline_assist`/`ai_autocomplete` 与主 Agent 共处的提示词与命令层

## 4.1 P0：主控建制与语义冻结

**目标**：

1. 完成 `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、本文的文档组建制
2. 把 Agent 作为 `30_capabilities / 03_ai执行系统` 的正式能力位
3. 冻结规则 ID 体系与承接边界

**文档动作**：

1. 新增 `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、本文
2. 更新 000 文档结构清单
3. 更新 `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-T-02_prompt架构.md`、`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-03_任务规划执行.md`、`A-AST-M-P-01_上下文注入.md` 的 Agent 协同说明
4. 更新 `R-AG-M-R-05_AI功能需求文档.md` 与 `R-AG-M-R-06_AI功能需求协议.md` 的 Agent 文档索引说明

**验收门槛**：

1. 文档结构清单已纳入 `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`、本文
2. `A-AG-M-D-01_Binder Agent能力描述文档.md` 与 `A-AG-M-T-04_Binder Agent技术主控文档.md` 的规则承接矩阵完整
3. 现有文档边界清晰，无主控冲突

### 4.1.1 当前代码实现审计与改造计划

#### （1）当前实现对照

- 已存在承接点：
  - `src/stores/chatStore.ts` 已有 `agent/chat` 两种模式与 Agent 发送入口
  - `src-tauri/src/commands/ai_commands.rs` 已承载主对话、工具调用、继续对话、取消、总结补发
  - `src-tauri/src/services/context_manager.rs` 已是所有层次的统一 prompt 入口，但目前输出仍是单字符串
  - `src-tauri/src/services/tool_definitions.rs` 已定义模型可见工具清单
  - `src/types/tool.ts`、`src/types/reference.ts`、`src/utils/requestContext.ts` 已形成若干基础协议对象
- 一致点：
  - Agent 已是现行系统的真实运行链，不是纯概念
  - L1/L2/L3 三路径客观存在，后续可基于现状做拆分式改造
- 偏差点：
  - Agent 根模型未冻结，`chatStore` 混合了聊天与 Agent 两套状态
  - `ContextManager` 还不是 `PromptPackage` 装配器
  - 工具列表来源是静态注册代码，不是工具矩阵治理结果
  - `WorkPlanCard`/`workPlanParser` 是文本解析式伪计划，不是正式任务对象

#### （2）删除计划

- 停止把 `src/utils/workPlanParser.ts` + `src/components/Chat/WorkPlanCard.tsx` 作为 Agent `plan` 主链承接；短期可保留 UI，但必须降级为“历史兼容展示”
- 停止把 `src/stores/referenceStore.ts` 的 `formatForAI()` 当作主 prompt 注入路径；该路径仅可作为旧 UI 兼容辅助
- 停止在 `ai_commands.rs` 中继续扩大 L1/L2/L3 共文件叠加式实现
- 删除风险：
  - `WorkPlanCard` 当前仍在 `ChatMessages.tsx` 消费，直接删会造成旧聊天卡片缺失
  - `formatForAI()` 被 `ChatInput.tsx` 直接调用，必须先替换为统一 `PromptContextPackage` 注入后再移除

#### （3）修改计划

- 修改 `src/stores/chatStore.ts`：
  - 拆出 Agent 运行态对象，至少新增 `agentRuntime`, `activeStage`, `activeTaskId`, `activeArtifacts`
  - 继续保留现有消息数组，但消息不再承担唯一状态来源
- 修改 `src-tauri/src/services/context_manager.rs`：
  - 从 `build_multi_layer_prompt() -> String` 改为 `PromptPackage` 结构化装配，再在 provider 前序列化
  - 明确分离 L3 主链与 L1/L2 辅链
- 修改 `src-tauri/src/commands/ai_commands.rs`：
  - 从“巨型流程文件”收敛为 orchestrator，抽出 prompt assembly、tool round 管理、stage transition、summary continuation
- 修改 `src-tauri/src/services/tool_definitions.rs`：
  - 改为从 `tool matrix / tool policy` 生成模型可见工具列表

#### （4）新增计划

- 新增核心类型：
  - `AgentTaskRecord`
  - `AgentStageState`
  - `VerificationRecord`
  - `ConfirmationRecord`
  - `ArtifactRecord`
  - `PromptPackage`
  - `ToolExecutionResultMeta`
- 新增模块建议：
  - `agent_runtime_store.ts`
  - `agent_prompt_assembly.rs`
  - `tool_matrix.rs`
  - `agent_stage_guard.rs`
- 新增消费关系：
  - `chatStore` 产出当前轮任务与上下文快照
  - `context_manager` 消费状态/artifact/verification/confirmation
  - `ai_commands` 消费 stage guard 与 tool policy

#### （5）风险评估

- 高风险：
  - `ai_commands.rs` 过大，改造时极易影响现有流式消息、继续对话、取消控制
  - `chatStore.ts` 是聊天主入口，状态拆分可能影响全部 Chat UI
- 中风险：
  - `context_manager.rs` 改成结构化装配后，可能影响所有 provider prompt 长度与行为
  - `tool_definitions.rs` 改为矩阵驱动后，可能导致工具可见性变化
- 低风险：
  - `WorkPlanCard` 降级为兼容展示
  - `referenceStore.formatForAI()` 降级为兼容路径

#### （6）已确认口径

- 【人工确认】保留 `WorkPlanCard` 作为 UI 附属能力。保留展示，但明确不再作为 Agent `plan` 结构承接
- 【人工确认】单独新增 `agentStore`。边界更清晰
- 【人工确认】L1/L2 继续共用 `ai_commands.rs`，但必须严格文件内隔离，不允许再向层次三主链反向注入状态与 prompt 逻辑
## 4.2 P1：状态、验证、确认最小闭环

**目标**：

1. 定义统一阶段状态对象
2. 定义分层验证对象
3. 定义确认对象与最小 gate 集

**重点承接**：

1. `A-AG-M-T-03_任务规划执行.md`：从“完成判定”转为“阶段闭合判定”
2. `A-AG-M-P-01_工具调用体系.md`：补 artifact / confirmation / gate 协同
3. `A-AG-M-T-01_ai执行架构.md`：补 Agent 逻辑运行目标

**层次影响范围**：

1. 主要影响层次三（对话编辑）
2. 层次二仅在明确需要局部确认语义时做有限承接
3. 层次一不进入本阶段完整闭环改造范围

**优先代码承接对象**：

1. `chatStore.ts`
2. `context_manager.rs`
3. `ai_commands.rs`
4. `tool_service.rs`
5. 相关类型定义层

**验收门槛**：

1. 至少一个核心 Agent 入口可表达 `structured -> candidate_ready -> review_ready -> user_confirmed/stage_complete`
2. 不再以“执行成功”直接冒充“任务完成”

### 4.2.1 当前代码实现审计与改造计划

#### （1）当前实现对照

- 已存在承接点：
  - `src/stores/diffStore.ts` 已有 `pending/accepted/rejected/expired`、snapshot gate、execution exposure、批量接受拒绝
  - `src/utils/requestContext.ts` 已有 `targetFile/L/revision/baselineId/editorTabId`
  - `src-tauri/src/services/tool_service.rs` 的 `edit_current_editor_document`、`update_file(use_diff)` 已形成候选变更主链
  - `src-tauri/src/services/positioning_resolver.rs`、`block_tree_index.rs`、`workspace/workspace_commands.rs` 已具备结构验证与部分约束验证
  - `src/components/Chat/DiffCard.tsx`、`ToolCallCard.tsx`、`ExecutionPanel.tsx` 已承接 review/观测 UI
- 一致点：
  - 对话编辑场景已经有比较强的 verify / review / confirm 雏形
  - 非当前文档 gate 与当前文档 originalText 校验都已在代码里存在
- 偏差点：
  - 缺正式 Agent 状态对象，`candidate_ready/review_ready/user_confirmed/stage_complete` 还没有统一落位
  - `TaskProgressAnalyzer` 依赖工具结果与启发式文案，不是阶段闭合器
  - `ConfirmationManager` 与 `ToolCallHandler.requires_confirmation()` 为两套分散逻辑
  - `ToolResult` 缺 `meta.gate/meta.artifact/meta.verification/meta.confirmation`

#### （2）删除计划

- 停止把 `src-tauri/src/services/task_progress_analyzer.rs` 的 `is_completed/is_incomplete` 作为 Agent 闭环裁定依据
- 停止把 `ConfirmationManager` 和 `ToolCallHandler.requires_confirmation()` 的简单分类逻辑当作最终确认规则
- 停止在 `ai_commands.rs` 中通过 `[NEXT_ACTION]` 纯文本推进来模拟 stage state
- 删除风险：
  - 直接移除 `TaskProgressAnalyzer` 会影响当前多轮工具继续对话，需要先引入 `StageState + TransitionGuard`
  - 直接移除确认启发式会影响删除类工具的最小安全性，因此必须先落统一 gate 再删旧逻辑

#### （3）修改计划

- 修改 `src/types/tool.ts` 与 `src-tauri/src/services/tool_service.rs`：
  - 统一 `ToolResult` / `ToolExecutionResult` 结构，补 `meta`
  - 让 `edit_current_editor_document`、`update_file(use_diff)` 返回标准化 `artifactId`、`verificationStatus`、`confirmationRequired`
- 修改 `src/stores/diffStore.ts`：
  - 在 diff 状态外，再保存 `agentStageState`
  - 接受/拒绝时显式推进 `user_confirmed / invalidated / stage_complete`
- 修改 `src/stores/chatStore.ts`：
  - 把最后一条 assistant message 不再作为闭环事实来源，只作为展示层
- 修改 `src-tauri/src/commands/ai_commands.rs`：
  - 引入统一 `StageTransitionGuard`
  - 将“工具成功后继续总结/继续调用工具”的逻辑改为“先读 state，再决定 transition”
- 修改 UI：
  - `DiffCard.tsx`、`ToolCallCard.tsx`、`FileDiffCard.tsx` 增加明确 stage/verification/confirmation 展示位

#### （4）新增计划

- 新增状态对象：
  - `structured`
  - `candidate_ready`
  - `review_ready`
  - `user_confirmed`
  - `stage_complete`
  - `invalidated`
- 新增记录对象：
  - `VerificationRecord`
  - `ConfirmationDecision`
  - `StageTransitionDecision`
- 新增代码模块：
  - `agent_state.ts`
  - `verification_registry.rs`
  - `confirmation_registry.rs`
  - `stage_transition_guard.rs`

#### （5）风险评估

- 高风险：
  - DE 当前链路已经可用，任何对 `diffStore` / `edit_current_editor_document` 的改造都有真实回归风险
  - `ai_commands.rs` 里“继续对话”高度依赖当前 `TaskProgressAnalyzer`，替换时容易出现无限循环或过早停止
- 中风险：
  - `update_file(use_diff)` 与 `edit_current_editor_document` 需要统一确认语义，当前两条链的 UI 呈现与存储容器不同
- 低风险：
  - `ExecutionPanel` 扩充为 state/verification 面板

#### （6）已确认口径

- 【人工确认】变更型任务的 `stage_complete` 以“候选已生成、用户确认已完成、revision/写盘推进成功、状态回写成功”为闭合标准；只读查询类任务不进入 `candidate/review/confirm` 链，可在验证完成后直接闭合
- 【人工确认】`update_file(use_diff)` 与 `edit_current_editor_document` 统一进入同一 `candidate/review/confirm` 状态机；只允许候选对象和执行路径不同，不允许状态语义不同
- 【人工确认】`TaskProgressAnalyzer` 退出主闭环裁定链，保留为 `build-mode / 文件整理 / 递归检查` 的辅助分析器，不再决定现行 Agent 任务是否完成

## 4.3 P2：中间态资产化与上下文协同

**目标**：

1. 把 plan / candidate / diff / verification / confirmation 纳入 artifact 体系
2. 与 `A-AST-M-P-01_上下文注入.md` 和记忆沉淀系统对接
3. 让跨轮任务具备可继续、可恢复、可沉淀能力
4. 建立结构化 `plan / verify / confirm` 面板承接接口

**重点承接**：

1. `A-AST-M-P-01_上下文注入.md`
2. `A-AST-M-T-01_记忆模型.md`
3. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
4. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
5. `A-AST-M-T-02_知识库机制.md`
6. `A-TMP-M-T-01_模板机制.md`
7. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
8. 模板与项目资产相关文档

**验收门槛**：

1. 中间态不再只是消息文本
2. 至少部分 artifact 可进入项目沉淀链

**层次影响范围**：

1. 主要影响层次三与后续构建模式
2. 层次一、层次二如无单独立项，不默认接入 artifact 主链

### 4.3.1 当前代码实现审计与改造计划

#### （1）当前实现对照

- 已存在承接点：
  - `src/stores/diffStore.ts` 已保存当前对话与文件级 diff
  - `src-tauri/src/workspace/workspace_db.rs` 已有 `pending_diffs`、`file_cache`、`file_dependencies`、`ai_tasks`
  - `src/services/documentService.ts`、`workspace_commands.rs` 已能读取/接受/拒绝未打开文件 diff
  - `src-tauri/src/services/memory_service.rs` + `commands/memory_commands.rs` + `src/services/memoryService.ts` 已有记忆 CRUD
  - `src/types/reference.ts` 与 `referenceProtocolAdapter.ts` 已有 memory/knowledge/template reference 类型
  - `context_manager.rs` 已会注入 `pending_files` 与 `file_dependencies`
- 一致点：
  - diff 与 workspace cache 已可视为 artifact 雏形
  - 资产沉淀底座已经有数据库与协议入口
- 偏差点：
  - `ai_tasks` 只建表未见主链消费，当前更像预留结构
  - 记忆只做独立存取，不参与 Agent L3 augmentation
  - 缺 `plan/candidate/verification/confirmation` artifact 表与来源链
  - `referenceStore.formatForAI()` 仍然是字符串拼接式旧注入路径

#### （2）删除计划

- 停止把“消息文本 + tool result 文本”当作唯一中间态存储
- 停止新增只写 `workspace_db.pending_diffs` 不写 artifact 元数据的实现
- 停止让记忆/知识/模板长期停留在“协议类型已存在，但 prompt 不消费”的半承接状态
- 删除风险：
  - 直接移除旧消息承载会影响历史聊天回放，因此应保留消息展示，新增结构化 artifact 并逐步切主链

#### （3）修改计划

- 修改 `src-tauri/src/workspace/workspace_db.rs`：
  - 为 `ai_tasks` 明确用途；若继续使用，则改为 `agent_tasks`
  - 新增 `agent_artifacts / verification_records / confirmation_records / artifact_links`
- 修改 `src-tauri/src/services/context_manager.rs`：
  - 读取结构化 artifact，而不是只读 `pending_files` 与依赖列表
  - 将 memory/knowledge/template 命中结果注入 augmentation / constraint 层
- 修改 `src/services/memoryService.ts` 与 `memory_service.rs`：
  - 增加按当前文档、项目、标签、置信度、来源链检索
- 修改 `src/stores/referenceStore.ts`：
  - 把引用 UI 管理与 Agent L3 注入分层，避免继续使用 `formatForAI()` 直接拼文本

#### （4）新增计划

- 新增 artifact 类型：
  - `PlanArtifact`
  - `CandidateArtifact`
  - `VerificationArtifact`
  - `ConfirmationArtifact`
  - `SummaryArtifact`
- 新增上下文装配对象：
  - `PromptContextPackage`
  - `ArtifactContextSlice`
  - `MemoryAugmentationSlice`
  - `KnowledgeAugmentationSlice`
  - `TemplateConstraintSlice`
- 新增消费链：
  - `chatStore/agentRuntimeStore` 产出当前活跃 artifact
  - `context_manager` 消费 artifact 与 augmentation
  - `workspace/memory/knowledge/template` 负责沉淀与检索

#### （5）风险评估

- 高风险：
  - `workspace_db` 迁移涉及已存在 `.binder/workspace.db`，需要 schema migration 方案
  - 结构化 artifact 接入 prompt 后，模型输入长度和优先级会发生明显变化
- 中风险：
  - 记忆/知识/模板目前文档先行、代码后跟，真实检索策略尚未稳定
  - `referenceStore` 当前被多个 UI 入口使用，拆分需避免影响引用按钮与输入框
- 低风险：
  - `ai_tasks` 若最终确认为废弃，可迁移后停用

#### （6）已确认口径

- 【人工确认】`workspace_db.ai_tasks` 作为历史预留表处理，不直接沿用；P2 新增正式 `agent_tasks / agent_artifacts` 结构，并提供迁移或只读兼容
- 【人工确认】接入顺序固定为：`memory -> template constraint -> knowledge augmentation`
- 【人工确认】本轮正式 artifact 主链只在层次三落地；层次二仅保留轻量兼容对象，不接入完整 artifact 主链

## 4.4 P3：构建模式与有限 delegation 准备

**目标**：

1. 为有限多 agent / delegation 做边界准备
2. 明确哪些子任务可委派，哪些不委派

**重点承接**：

1. `A-AG-M-T-03_任务规划执行.md`
2. `A-AST-M-P-01_上下文注入.md`
3. 模板构建系统相关文档

**验收门槛**：

1. delegation 不进入主写作链默认路径
2. 仅在资料搜集、专项检查、构建模式等场景受控使用

### 4.4.1 当前代码实现审计与改造计划

#### （1）当前实现对照

- 已存在承接点：
  - `src-tauri/src/services/task_progress_analyzer.rs` 已有任务类型启发式
  - `src/utils/workPlanParser.ts` + `WorkPlanCard.tsx` 已有“计划展示”雏形
  - `workspace_db.ai_tasks` 提示系统曾预留任务对象入口
  - `tool_definitions.rs`、`ConfirmationManager`、`ToolErrorKind`、`ExecutionExposure` 已具备部分 build-mode 所需安全要素
- 一致点：
  - 系统已经开始试图做“任务继续、任务总结、工具轮次控制”
- 偏差点：
  - 当前没有正式 delegation 边界对象，只有启发式继续对话与任务判断
  - `TaskProgressAnalyzer` 很容易误入主写作链，反而扩大自动执行范围
  - 缺 build mode / tool policy / allowed delegation scopes

#### （2）删除计划

- 停止把 `TaskProgressAnalyzer` 的启发式继续/总结逻辑继续扩大到所有 Agent 主链场景
- 停止把 `WorkPlanCard` 误读成 delegation 准备完成
- 删除风险：
  - 当前文件整理类任务依赖该逻辑，短期应先降级为“实验性 build-mode 辅助模块”，不能硬删

#### （3）修改计划

- 修改 `src-tauri/src/commands/ai_commands.rs`：
  - 把“继续执行任务”的启发式链路收口到受控 build mode 分支
  - 默认对话主链禁止隐式 delegation
- 修改 `tool_definitions.rs` 与后续 `tool_policy.rs`：
  - 为后续 build mode 增加工具开放级别、是否允许 background/subtask 使用
- 修改 `task_progress_analyzer.rs`：
  - 从主闭环裁定器改为 build-mode 辅助分析器

#### （4）新增计划

- 新增 `BuildModePolicy`
- 新增 `DelegationBoundary`
- 新增 `SubtaskRecord`
- 新增 `AllowedDelegationScene` 枚举
- 新增 UI/日志：
  - build mode 标识
  - delegation 触发原因
  - 子任务结果回流位置

#### （5）风险评估

- 高风险：
  - 当前系统已经存在自动继续多轮工具调用逻辑，若不先加边界，后续 delegation 很容易与主写作链混淆
- 中风险：
  - 文件整理、递归检查类历史能力可能与新 build mode 部分重叠，需防止重复方案并存
- 低风险：
  - 先只做边界与预留，不真正开放多 agent

#### （6）已确认口径

- 【人工确认】P3 只做“边界准备”，不开放真实多 agent delegation
- 【人工确认】历史“自动继续调用工具直到完成”的能力保留为受控 `build-mode` 专项能力，默认主链禁用
- 【人工确认】未来若开放资料搜集类 delegation，仅允许只读访问 `memory / knowledge / template`，且不得写回主任务状态与项目资产

## 4.5 细化实施阶段（8 阶段）

本节把原 `P0 / P1 / P2 / P3` 进一步细化为 8 个可执行阶段。执行顺序固定，原则上不建议跨阶段并行推进核心主链改造。

### Phase 1：基线冻结与入口隔离准备

- 所属大阶段：`P0`
- 进入条件：当前主控文档、技术主控文档、开发计划文档已冻结
- 目标：
  - 固定现行主入口、兼容入口、旧入口
  - 明确哪些代码块属于主链、哪些属于兼容链
- 主要改动：
  - 在 `chatStore.ts`、`ai_commands.rs`、`context_manager.rs`、`useAutoComplete.ts`、`useInlineAssist.ts`、`workPlanParser.ts`、`referenceStore.ts` 加入口径注释与模块边界标记
  - 新增 `agentStore` 空骨架与核心类型文件
- 主要文件：
  - `src/stores/chatStore.ts`
  - `src/stores/agentStore.ts`（新增）
  - `src-tauri/src/commands/ai_commands.rs`
  - `src-tauri/src/services/context_manager.rs`
- 安全控制：
  - 本阶段只做边界冻结与类型引入，不改主运行行为
  - 所有旧路径先保留为兼容路径
- 完成标志：
  - 三条 AI 路径边界在代码与文档中一致
  - `agentStore` 与核心类型文件可编译接入

### Phase 2：工具矩阵切换与 PromptPackage 骨架落地

- 所属大阶段：`P0`
- 进入条件：Phase 1 完成，主入口边界已明确
- 目标：
  - 让工具可见性与工具矩阵对齐
  - 建立 `PromptPackage` / `PromptContextPackage` 代码骨架
- 主要改动：
  - 新增 `tool_matrix.rs`、`tool_policy.rs`
  - 让 `tool_definitions.rs` 改为读取矩阵配置生成
  - 在 `context_manager.rs` 中新增结构化装配输出，但先保留旧字符串路径作为兼容 fallback
- 主要文件：
  - `src-tauri/src/services/tool_definitions.rs`
  - `src-tauri/src/services/tool_matrix.rs`（新增）
  - `src-tauri/src/services/tool_policy.rs`（新增）
  - `src-tauri/src/services/context_manager.rs`
- 安全控制：
  - 工具名称和 schema 暂不大改，只先切换生成来源
  - `PromptPackage` 落骨架不立即切全量逻辑
- 完成标志：
  - 工具定义主源从静态拼装切到工具矩阵
  - `PromptPackage` 类型进入代码，provider 调用前可取得结构化装配结果

### Phase 3：L3 Prompt Assembly 主链切换

- 所属大阶段：`P0/P1`
- 进入条件：Phase 2 完成，`PromptPackage` 已可生成
- 目标：
  - 层次三先切到七层 prompt assembly
  - 停止层次三继续依赖旧式字符串拼接主链
- 主要改动：
  - 在 `context_manager.rs` 落实 `governance -> task -> conversation -> fact -> constraint -> augmentation -> tool_and_output`
  - `ai_chat_stream` 改为消费 `PromptPackage`
  - `referenceStore.formatForAI()` 降级为 UI 兼容，不再是主注入链
- 主要文件：
  - `src-tauri/src/services/context_manager.rs`
  - `src-tauri/src/commands/ai_commands.rs`
  - `src/stores/referenceStore.ts`
  - `src/components/Chat/ChatInput.tsx`
- 安全控制：
  - 只切层次三
  - L1/L2 继续走原路径，避免同时改三条链
- 完成标志：
  - `agent` 模式下 provider 调用统一消费 `PromptPackage`
  - 层次三上下文优先级与文档口径一致

### Phase 4：状态对象与任务对象落地

- 所属大阶段：`P1`
- 进入条件：Phase 3 完成，L3 prompt 已稳定
- 目标：
  - 把 Agent 状态从消息/卡片隐含语义中抽出
  - 建立统一任务对象和阶段状态对象
- 主要改动：
  - 新增 `AgentTaskRecord`、`AgentStageState`
  - `chatStore` 与 `agentStore` 共同维护 active task / active stage
  - `diffStore` 与 task/state 关联，而不是单独漂浮
- 主要文件：
  - `src/stores/agentStore.ts`
  - `src/stores/chatStore.ts`
  - `src/stores/diffStore.ts`
  - `src/types/tool.ts`
- 安全控制：
  - 消息展示结构不删，只减少其作为“唯一事实来源”的职责
- 完成标志：
  - 至少一条 DE 主链能显式表达 `structured -> candidate_ready -> review_ready`

### Phase 5：验证、gate、确认统一

- 所属大阶段：`P1`
- 进入条件：Phase 4 完成，任务/状态对象已存在
- 目标：
  - 收口验证、确认、gate 规则
  - 停止双重确认逻辑和启发式闭环逻辑
- 主要改动：
  - 新增 `verification_registry.rs`、`confirmation_registry.rs`、`stage_transition_guard.rs`
  - `ToolCallHandler.requires_confirmation()` 与 `ConfirmationManager` 统一收口
  - `ToolResult.meta` 增加 gate / verification / confirmation / artifact
- 主要文件：
  - `src-tauri/src/services/tool_call_handler.rs`
  - `src-tauri/src/services/confirmation_manager.rs`
  - `src-tauri/src/services/tool_service.rs`
  - `src-tauri/src/services/task_progress_analyzer.rs`
- 安全控制：
  - 先收口 `edit_current_editor_document` 与 `update_file(use_diff)` 两条变更链
  - 读工具暂不强行纳入候选链
- 完成标志：
  - `edit_current_editor_document` 与 `update_file(use_diff)` 使用同一候选-验证-确认语义
  - `TaskProgressAnalyzer` 退出主闭环裁定

### Phase 6：闭环迁移与 UI 稳定化

- 所属大阶段：`P1`
- 进入条件：Phase 5 完成，确认与 transition guard 已可用
- 目标：
  - 打通 `user_confirmed -> stage_complete`
  - 让前端 UI 明确展示 state / verification / confirmation
- 主要改动：
  - `DiffCard.tsx`、`ToolCallCard.tsx`、`FileDiffCard.tsx`、`ExecutionPanel.tsx` 增加状态展示
  - `ai_commands.rs` 多轮继续逻辑改为读 state/transition 决策
  - `stage_complete` 显式写回 store / artifact
- 主要文件：
  - `src/components/Chat/DiffCard.tsx`
  - `src/components/Chat/ToolCallCard.tsx`
  - `src/components/Debug/ExecutionPanel.tsx`
  - `src-tauri/src/commands/ai_commands.rs`
- 安全控制：
  - 先改展示，再切换循环决策
  - 对无限循环、过早结束、取消请求三类风险做专项回归
- 完成标志：
  - 至少一个完整变更任务可显式走完 `structured -> candidate_ready -> review_ready -> user_confirmed -> stage_complete`

### Phase 7：Artifact 持久化与上下文协同

- 所属大阶段：`P2`
- 进入条件：Phase 6 完成，阶段闭环稳定
- 目标：
  - 建立正式 artifact 表
  - 接入 memory / template / knowledge 的上下文协同
- 主要改动：
  - `workspace_db` 新增 `agent_tasks / agent_artifacts / verification_records / confirmation_records`
  - `context_manager.rs` 消费 artifact 与 augmentation/constraint 切片
  - `memory_service` 补检索维度
- 主要文件：
  - `src-tauri/src/workspace/workspace_db.rs`
  - `src-tauri/src/services/context_manager.rs`
  - `src-tauri/src/services/memory_service.rs`
  - `src/services/memoryService.ts`
- 安全控制：
  - 采用 migration，不直接破坏现有 `.binder/workspace.db`
  - 先接 memory，再接 template，再接 knowledge
- 完成标志：
  - `candidate/verification/confirmation` 可结构化落库、可回读、可注入 prompt

### Phase 8：恢复能力、Build Mode 边界与 delegation 预留

- 所属大阶段：`P2/P3`
- 进入条件：Phase 7 完成，artifact 已稳定
- 目标：
  - 建立跨轮恢复能力
  - 为受控 build mode 做边界准备
- 主要改动：
  - 基于 artifact/task 做恢复与继续
  - 把 `TaskProgressAnalyzer` 降级为 `build-mode` 辅助模块
  - 新增 `BuildModePolicy / DelegationBoundary / AllowedDelegationScene`
- 主要文件：
  - `src-tauri/src/services/task_progress_analyzer.rs`
  - `src-tauri/src/commands/ai_commands.rs`
  - `src-tauri/src/services/tool_policy.rs`
  - `src/stores/agentStore.ts`
- 安全控制：
  - 默认主链关闭 build mode
  - delegation 不开放写操作，不开放真实多 agent
- 完成标志：
  - 工作区重开后可恢复活跃任务/候选/确认状态
  - build mode 仅作为受控预留能力存在，不干扰主链

## 4.6 阶段依赖与实施原则

1. `Phase 1-2` 是根基，不完成就不要开始状态闭环改造。
2. `Phase 3` 不稳定，`Phase 4-6` 会全部失真，因为状态和验证会继续被旧 prompt 注入路径污染。
3. `Phase 4` 不完成，`Phase 5-6` 就只能继续靠消息文本和启发式推进，无法形成真实闭环。
4. `Phase 6` 不稳定，不要开始 `Phase 7`。否则会把不稳定状态写进 artifact 与数据库。
5. `Phase 7` 不完成，不要开始 `Phase 8`。否则恢复能力与 build mode 会建立在漂浮的 artifact 之上。
6. 每个阶段结束都应有一次最小回归，不允许“连跳两阶段后统一回归”。

---

## 五、现有文档同步更新清单

| 文档 | 当前状态审计 | 需同步动作 |
|---|---|---|
| `A-CORE-C-R-01_项目文档结构清单（标准目录）.md` | 文档建制已承接，但需确保新增 `P-02`、Prompt/DE 专项文档位置长期一致 | 继续保持结构清单与主控组同步，避免后续新增专项文档漏登记 |
| `A-AG-M-T-01_ai执行架构.md` | 已承接 Agent 主链，但需与代码拆分后的 `ai_commands/context_manager/provider` 模块重新对照 | 在 P0/P1 落代码后回写实际模块图、流式轮次与状态承接对象 |
| `A-AG-M-T-02_prompt架构.md` | 架构已拆层，但当前代码仍未实现 `PromptPackage` | 在 P0/P2 回写真实 `PromptPackage` 类型、装配顺序、代码入口 |
| `A-AG-M-P-01_工具调用体系.md` | 规则较完整，但代码仍只实现部分 `meta/gate/artifact` | 在 P1 代码落地后回写 `ToolExecutionResultMeta`、dispatch、回流结构 |
| `A-AG-M-P-02_Binder Agent工具矩阵.md` | 文档已形成工具矩阵，但代码仍由 `tool_definitions.rs` 静态注册驱动 | 在 P0/P1 回写矩阵到 `tool_matrix/tool_policy/tool_definitions` 的真实承接 |
| `A-AG-M-T-03_任务规划执行.md` | 主控口径已修正，但代码侧仍由 `TaskProgressAnalyzer` 启发式驱动 | 在 P1/P3 回写“正式 stage 对象”和“build-mode 辅助分析器”的边界 |
| `A-AST-M-T-01_记忆模型.md` | 文档有模型，但代码仍是 CRUD 型 `MemoryService` | 在 P2 回写检索层级、注入字段、沉淀来源链 |
| `A-AST-M-P-01_上下文注入.md` | 文档已明确优先级，但 `context_manager.rs` 尚未实现 | 在 P2 回写 `PromptContextPackage` 与实际注入切片 |
| `A-AST-M-D-01_Binder Agent记忆协同主控文档.md` | 文档侧承接已建，代码尚未进入 Agent 主 prompt 链 | 在 P2 明确 memory 命中、消费、沉淀触发条件 |
| `A-AST-M-D-02_Binder Agent知识库协同主控文档.md` | 文档侧承接已建，代码接入点主要停留在 reference 类型 | 在 P2 明确知识检索接口、结果进入 augmentation 的方式 |
| `A-AST-M-T-02_知识库机制.md` | 机制文档存在，但代码侧尚未形成 Agent 检索主链 | 在 P2 回写最小可用检索与来源回链方案 |
| `A-TMP-M-T-01_模板机制.md` | 文档侧已形成约束模型，代码未形成模板主约束注入 | 在 P2 回写 template constraint slice、选择优先级、消费模块 |
| `A-AG-M-T-05_文档生成流程.md` | Agent 文档生成主链，与 artifact 驱动路径有潜在交叉，当前代码未打通 | 在 P2/P3 决定是否由 Agent artifact 驱动文档生成 |
| `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` | 文档有协同边界，代码尚无明确模板库接入模块 | 在 P2 明确模板检索、约束注入、用户显式选择优先级 |
| `A-DE-M-D-01_对话编辑统一方案.md` | 当前是层次三最强实际承接位，代码与文档耦合度很高 | 在 P1/P2 同步回写 `state/verification/confirmation/artifact` 对齐结果 |
| `A-DE-M-T-01_diff系统规则.md` | diff 规则已较成熟，当前代码大量依赖其术语与路径 | 在 P1 明确哪些 diff 状态升级为 Agent stage state，哪些仍保持 DE 局部状态 |
| `A-DE-M-T-02_baseline状态协作.md` | `baseline/requestContext/block tree` 已进入代码主链 | 在 P1/P2 回写 baseline 与 Agent artifact/state 的绑定关系 |
| `A-DE-M-P-01_对话编辑提示词.md` | DE 提示词已拆出，但代码侧仍未实现结构化 prompt package | 在 P0/P2 回写 L3 组装、DE 专项字段映射与最终 provider 注入实现 |
| `A-DE-X-L-01_对话编辑落地开发计划.md` | DE 开发计划与 AG 开发计划存在直接联动 | 在 AG P1/P2 代码落地后同步修订 DE 计划，避免双计划口径漂移 |
| `R-AG-M-R-05_AI功能需求文档.md` | 顶部已明确主控索引与权威口径，仍作为历史背景存在 | 继续维持“仅背景参考”，不得回流现行裁定 |
| `R-AG-M-R-06_AI功能需求协议.md` | 顶部已明确不作为现行主控依据，但历史待实现语义仍保留 | 继续维持降级；若发现代码注释/命名仍引用旧协议，应同步清理 |

---

## 六、阶段验收标准

### P0 验收

1. 当前是否满足：部分满足。文档组已建立，但代码根模型未冻结
2. 差距：
   - `chatStore.ts`、`ai_commands.rs`、`context_manager.rs` 仍为混合承接
   - 工具矩阵尚未成为工具注册主源
   - `PromptPackage` 尚未进入代码
3. 建议验收：
   - 完成 `AgentTaskRecord / AgentStageState / PromptPackage / ToolMatrix` 类型冻结
   - 完成入口模块图与代码对象对照
4. 所需回归：
   - 聊天发送
   - Agent 模式发送
   - L1/L2/L3 基本可用性

### P1 验收

1. 当前是否满足：不满足
2. 差距：
   - `structured -> candidate_ready -> review_ready -> user_confirmed/stage_complete` 无显式系统对象
   - `TaskProgressAnalyzer` 仍在模拟完成判定
3. 建议验收：
   - 至少一条 `edit_current_editor_document` 主链能完整产出 state / verification / confirmation / transition 记录
   - `ToolResult.meta` 包含 gate、artifact、verification、confirmation
4. 所需回归：
   - 当前文档编辑
   - 非当前文档 `update_file(use_diff)`
   - diff 接受/拒绝
   - 取消请求与多轮工具继续

### P2 验收

1. 当前是否满足：不满足
2. 差距：
   - artifact 仍主要存在于 diffStore、workspace_db、消息文本
   - 记忆/知识/模板未进入 Agent 主 prompt 链
3. 建议验收：
   - 至少 `candidate/verification/confirmation` 三类 artifact 可查询、可注入、可回链
   - `context_manager` 能消费当前状态、artifact、memory/template/knowledge 切片
4. 所需回归：
   - 跨轮继续对话
   - 关闭重开工作区后的恢复
   - artifact 注入长度与优先级回归

### P3 验收

1. 当前是否满足：不满足
2. 差距：
   - 只有启发式多轮执行，没有正式 delegation boundary
   - build mode 尚未立项为代码对象
3. 建议验收：
   - 默认主写作链不触发 delegation
   - build mode 下的工具开放策略、子任务边界、结果回流位置明确
4. 所需回归：
   - 资料搜集类实验场景
   - 文件整理类历史逻辑降级验证
   - 不启用 build mode 时的主链稳定性

---

## 七、治理执行清单

### 7.1 Prompt 变更执行清单

每次提示词变更必须同时完成：

1. 登记影响层。
2. 登记影响链路。
3. 登记是否影响工具提示。
4. 登记是否影响上下文字段。
5. 完成层次一、层次二、层次三回归。
6. 完成跨层命名一致性检查。

当前代码入口与审计结论：

1. 主要入口在 `src-tauri/src/services/context_manager.rs`、`src-tauri/src/commands/ai_commands.rs`
2. 辅助入口还包括 `ai_autocomplete`、`ai_inline_assist`、`src/hooks/useAutoComplete.ts`、`src/hooks/useInlineAssist.ts`
3. 当前缺口：
   - 没有 prompt 变更登记对象
   - 没有 `PromptPackage` 类型约束
   - `referenceStore.formatForAI()` 仍可绕开正式注入链
4. 本轮改造要求：
   - Prompt 变更必须同时修改 `T-02` 文档、`context_manager.rs`、相关 L1/L2/L3 调用方
   - 必须记录是否影响 state/artifact/verification/confirmation 注入
   - 必须回归 `chatStore.sendMessage`、`ai_chat_stream`、`ai_autocomplete`、`ai_inline_assist`

### 7.2 Tool 变更执行清单

每次工具新增或重构必须同时完成：

1. 更新工具定义与 schema。
2. 更新执行分发分支。
3. 更新参数校验与参数修复记录。
4. 更新错误分级与错误回流。
5. 更新返回结构与事件消费链。
6. 完成运行回归并确认既有语义不变。

当前代码入口与审计结论：

1. 工具定义入口：`src-tauri/src/services/tool_definitions.rs`
2. 工具分发入口：`src-tauri/src/services/tool_service.rs`
3. 参数修复入口：`src-tauri/src/services/tool_call_handler.rs`、`ai_commands.rs`
4. 前端消费入口：`src/types/tool.ts`、`ToolCallCard.tsx`、`ToolCallSummary.tsx`、`diffStore.ts`、`ExecutionPanel.tsx`
5. 当前缺口：
   - 没有以 `tool matrix` 为主源的工具定义
   - `ToolResult` 缺统一 `meta`
   - 参数修复散落在 `ToolCallHandler` 与 `ai_commands.rs`
   - `requires_confirmation` 也有双入口
6. 本轮改造要求：
   - 工具变更必须同时覆盖 definition / dispatch / validation / repair / result meta / UI 消费
   - `edit_current_editor_document` 与 `update_file(use_diff)` 必须统一纳入候选-验证-确认链
   - `ExecutionExposure` 保留并扩展为状态与验证观测

### 7.3 旧体系文档收口清单

1. `R-AG-M-R-05_AI功能需求文档.md` 与 `R-AG-M-R-06_AI功能需求协议.md` 顶部必须明确“仅作参考，不作为现行主控依据”。
2. 旧文档中的“待明确 / 待确认 / 待实现”只允许作为历史对照，不得再承载现行规则裁定。
3. 若旧文档仍保留有效约束，必须回写到 `A-AG-M-D-01 / A-AG-M-T-04 / A-AG-M-T-01 / A-AG-M-T-02 / A-AG-M-P-01 / A-AG-M-T-03 / A-AST-M-P-01` 等主结构文档。

当前代码与引用链审计：

1. `R-AG-M-R-05`、`R-AG-M-R-06` 顶部已经标注现行权威口径，但旧术语仍可能通过代码注释和历史命名残留影响理解
2. 当前高风险旧链：
   - `workPlanParser + WorkPlanCard` 的文本式计划承接
   - `TaskProgressAnalyzer` 的启发式完成判定
   - `referenceStore.formatForAI()` 的旧式字符串注入
   - `ai_inline_assist` / `ai_autocomplete` 与主 Agent 共用的提示词与命令层
3. 本轮改造要求：
   - 所有上述路径都要在代码中明确标注“兼容路径 / 非主链 / build-mode only / 待退役”
   - 若发现注释、类型名、常量名仍引用旧完成观或旧协议，统一列入 P0/P1 清理范围

---

## 八、来源映射

1. `A-AG-M-D-01_Binder Agent能力描述文档.md`
2. `A-AG-M-T-04_Binder Agent技术主控文档.md`
3. `R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`
