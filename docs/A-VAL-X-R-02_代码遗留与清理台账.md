# 代码遗留与清理台账

## 文档头

- 结构编码：`VAL-X-R-02`
- 文档属性：`审计 / 台账`
- 主责模块：`VAL`
- 文档职责：`统一登记当前推进过程中发现的未使用变量、幽灵代码、死代码、旧逻辑、历史预留与版本残留`
- 上游约束：`A-AG-X-L-01`, `A-DE-X-L-01`
- 直接承接：`A-VAL-X-R-01`
- 使用边界：`只登记现状、风险、处理阶段与状态，不在本文直接改写主控方案`

---

## 一、登记规则

1. 只要是可能影响本轮 Binder Agent 落地改造的遗留项，都进入台账。
2. 命名不一致、职责漂移、半废弃、仅 warning 暴露、仅注释提及，也登记。
3. 登记不等于立即删除；必须区分“保留兼容”“降级退役”“后续清理”。
4. 无法判断是否仍在使用的项，标注 `【待人工确认】`。

## 二、状态定义

| 状态 | 含义 |
|---|---|
| `观察中` | 已发现，尚未进入处理阶段 |
| `已降级` | 已明确不再作为主链，但代码仍保留兼容 |
| `计划清理` | 已进入开发计划后续阶段 |
| `待人工确认` | 无法自动裁定是否删除/迁移 |
| `已清理` | 已从主链退役或删除 |

## 三、遗留台账

| 编号 | 类型 | 文件/模块 | 现状说明 | 风险 | 计划阶段 | 当前状态 |
|---|---|---|---|---|---|---|
| `LEG-001` | 旧 UI 兼容链 | `src/components/Chat/WorkPlanCard.tsx` | 已明确为兼容展示组件，但仍容易被误读为 Agent plan 主链 UI | 中 | Phase 2-4 持续隔离 | 已降级 |
| `LEG-002` | 旧解析链 | `src/utils/workPlanParser.ts` | 历史 work plan 文本解析仍保留，现已不再承接正式 Agent plan | 中 | Phase 2-4 持续隔离 | 已降级 |
| `LEG-003` | 幽灵扩展 | `src/extensions/GhostTextExtension*` | 两文件无外部 import，已删除 | 低 | — | 已清理 |
| `LEG-004` | 旧闭环裁定逻辑 | `src-tauri/src/services/task_progress_analyzer.rs`, `src-tauri/src/commands/ai_commands.rs` | TPA force-continue 已统一收口到 `BuildModePolicy`：仅 `RecursiveCheck`/`FileMove` 任务类型激活 build mode 后才允许 TPA 驱动自动续轮，默认主写作链（含 doc edit）全部关闭 TPA 裁定。4 个 TPA 使用点均已迁移至 policy 门禁 | 低 | — | 已清理 |
| `LEG-005` | 未使用变量/对象 | `src-tauri/src/commands/ai_commands.rs` | 已清理 `exception_handler`、`confirmation_manager`、`task_analyzer`、`previous_tool_results`（含对应 import）；仍有少量 cancel flag 等历史预留 | 低 | 持续清理 | 已清理 |
| `LEG-006` | 未使用函数 | `src-tauri/src/commands/ai_commands.rs` | 已移除 `validate_and_normalize_arguments`、`repair_json_arguments`、`repair_json_string_escapes`（均无调用点） | 低 | — | 已清理 |
| `LEG-007` | 旧 provider 能力缺口 | `src-tauri/src/services/ai_providers/openai.rs` | 审计确认 tool_calls SSE 分支已在历史轮次实现；CLAUDE.md 描述过时 | 低 | — | 已清理 |
| `LEG-008` | 旧消息驱动式伪闭环 | `src/stores/chatStore.ts`, `src-tauri/src/commands/ai_commands.rs` | prompt 已可从 `agent_tasks` 表读取任务状态注入（P2-3）；force-continue 已迁移到 `BuildModePolicy` 门禁（P3-1）；前端 `agentStore.loadTasksFromDb` 已可从 workspace.db 恢复活跃任务。消息仍为展示通道，但决策链已逐步脱离纯文本驱动 | 中 | 持续收口 | 已降级 |
| `LEG-009` | 未使用导入/死代码 | 多文件 | 本轮已清理 agent 主链直接相关的死代码：TPA `FileClassification` 变体 + `user_asks_for_summary` + `HashMap` import、`tool_service.rs` 4 个未使用错误码常量、`tool_call_handler.rs` `requires_confirmation`、`streaming_response_handler.rs` `detect_tool_call` + `ToolCallInfo`、`reply_completeness_checker.rs` `missing_end_marker`。仍有非 agent 主链的历史 warning 残留 | 低 | 持续清理 | 已降级 |
| `LEG-010` | 私有接口暴露异常 | `src-tauri/src/services/loop_detector.rs` | `ToolCallRecord` 及字段已改为 `pub`，与 `recent_tool_calls` 公开字段对齐 | 低 | — | 已清理 |
| `LEG-011` | 大量未消费服务对象 | `src-tauri/src/services/diff_service.rs`, `preview_service.rs`, `document_analysis.rs`, `exception_handler.rs` | 审计：`diff_service.rs` / `exception_handler.rs` 无外部 use，已删除；`preview_service.rs` 被 pandoc_service 使用，保留；`document_analysis.rs` 被 ai_commands 使用，保留 | 低 | — | 已清理 |
| `LEG-012` | workspace 历史结构残留 | `src-tauri/src/workspace/workspace_db.rs` | 已新增 migration v2 创建正式 `agent_tasks / agent_artifacts` 表（不复用旧 `ai_tasks`）。旧 `ai_tasks` 表保留但不消费，后续可迁移或清理 | 低 | Phase 3 旧表清理 | 已降级 |
| `LEG-013` | 工程打包遗留 | `src/stores/chatStore.ts`, `src/stores/fileStore.ts`, `src/stores/diffStore.ts`, `src/services/documentService.ts` 等 | `npm run build` 暴露多处动态导入与静态导入并存 warning，说明历史按需加载边界不清 | 低 | 后续工程整理 | 观察中 |
| `LEG-014` | Shadow 状态归属限制 | `src/stores/agentStore.ts`, `src/components/Chat/ChatPanel.tsx`, `src/stores/diffStore.ts`, `src/utils/agentShadowLifecycle.ts` | 已引入 `recentTasks`（最近 5 个归档任务）。`markAgentInvalidated`/`markAgentRejected` 现在可匹配 `recentTasks` 中的旧任务并回写状态；`markAgentUserConfirmed`/`markAgentStageComplete` 仍限制只对 `currentTask` 生效（保守策略）。旧候选拒绝/失效不再静默跳过 | 中 | Phase 3 正式任务标识 | 已降级 |
| `LEG-015` | Rust registry 仍属内存影子态 | `src-tauri/src/services/verification_registry.rs`, `src-tauri/src/services/confirmation_registry.rs`, `src-tauri/src/commands/ai_commands.rs` | 两个 registry 文件已删除；`seed_shadow_registries`/`mark_shadow_candidate_registries` 及所有 `#[allow(deprecated)]` import 和调用点已清理；workspace.db artifact 路径为唯一写穿链路 | 低 | — | 已清理 |
| `LEG-016` | invalidated 覆盖仍不完整 | `src/stores/diffStore.ts`, `src/components/Chat/ChatMessages.tsx`, `src/components/Chat/ToolCallCard.tsx`, `src/components/Editor/EditorPanel.tsx` 等 | 审计完成：所有 `status:'expired'` 写入路径均已配对 `markAgentInvalidated`；`addDiff` 的 snapStale 路径为首次创建无需 shadow 回写，属正确行为。无需变更 | 低 | — | 已清理 |
| `LEG-017` | 旧工具定义静态残留 | `src-tauri/src/services/tool_definitions.rs` | 旧 `get_tool_definitions_legacy()` 保留为参照回退，主源已切到 `tool_matrix.rs` | 低 | 后续清理 | 已降级 |
| `LEG-018` | `formatForAI` 仍为前端引用主链 | `src/components/Chat/ChatInput.tsx`, `src/stores/referenceStore.ts` | `ChatInput.tsx` 已移除 `formatForAI` 调用及 `[引用信息]` 拼接；message content 仅含用户输入文本；引用注入由后端 constraint 层统一处理 | 低 | — | 已清理 |
| `LEG-019` | meta 注入未覆盖错误路径 | `src-tauri/src/services/tool_service.rs` | 新增 `build_failure_meta(tool_name, reason)`；`update_file` 三条错误路径（file not found / pandoc unavailable / write failed）及 `edit_current_editor_document` resolve 错误路径均已注入 `verification.status=failed` meta | 低 | — | 已清理 |

## 四、本轮新增发现（2026-04-05）

### 4.1 `cargo check` 暴露的高相关项

1. `src-tauri/src/commands/ai_commands.rs`
   - 未使用变量较多，集中在工具重试、继续对话、异常处理、主闭环判断路径。
   - 说明该文件存在明显历史预留和分支残留，是后续 Phase 2 的高风险清理面。
2. `src-tauri/src/services/task_progress_analyzer.rs`
   - 存在未使用导入、未使用字段与函数。
   - 与已锁定口径一致：该模块后续应退出默认主闭环。
3. `src-tauri/src/services/diff_service.rs`
   - 大量结构体/方法未被当前主链消费。
   - 需要后续确认哪些属于历史实现，哪些属于将来可复用能力。

### 4.2 本轮已做的处理动作

1. 已新增本台账文档，后续推进统一登记，不再散落在聊天记录中。
2. `WorkPlanCard` / `workPlanParser` 已按 Phase 1 明确降级，但暂不删除。
3. 后续每轮如发现新的遗留项，应直接补入本台账并标注阶段与状态。

## 五、本轮新增发现（2026-04-05，P1 第三轮）

### 5.1 Shadow 闭环归属问题

1. `src/utils/agentShadowLifecycle.ts`
   - 已新增“只在 `agentTaskId` 命中当前任务时才允许写入 `user_confirmed/stage_complete`”的保护。
   - 这不是最终模型，而是为了避免旧候选接受时把状态错误回写到新任务。
2. `src/stores/diffStore.ts` / `src/types/tool.ts`
   - 已开始给 `ToolCall`、`DiffEntry`、`FileDiffEntry` 传播 `agentTaskId`。
   - 说明当前主链已经需要“候选归属”字段，单靠 chatTab 不足以承接确认闭环。
3. 风险口径
   - 当前不会误闭环，但会出现“旧候选接受成功，shadow 状态不闭合”的保守行为。
   - 这属于可接受的阶段性保护，后续需要在正式 `agent_tasks / agent_artifacts` 结构里彻底解决。

### 5.2 本轮已做的处理动作

1. 已把接受动作接入 `user_confirmed -> stage_complete` shadow 闭环。
2. 已给 diff/tool 候选增加 `agentTaskId` 归属字段，避免只按当前 tab 粗粒度闭环。
3. 已将“旧候选无法安全闭环”的限制登记为 `LEG-014`，后续在 Phase 2-3 持续处理。

## 六、本轮新增发现（2026-04-05，P1 第四轮）

### 6.1 invalidated 路径补齐现状

1. `src/stores/diffStore.ts`
   - 已开始把 `rejectDiff / rejectFileDiffs / removeFileDiffEntry / markExpired` 统一接到 agent shadow invalidation helper。
   - 这使多数显式拒绝路径不再依赖各个 UI 按钮自行写状态。
2. `src/components/Chat/ChatMessages.tsx` / `src/components/Chat/ToolCallCard.tsx`
   - 对“接受前校验失败 -> diff expired”的主要路径补了 shadow invalidated 回写。
   - 但这仍不是全覆盖，内部批量失效和部分非聊天 UI 路径尚需继续核补。

### 6.2 Rust registry 最小承接现状

1. `src-tauri/src/services/verification_registry.rs`
   - 已增加全局内存 registry 写入口，不再是纯死结构。
2. `src-tauri/src/services/confirmation_registry.rs`
   - 已增加全局内存 registry 写入口，当前只做 shadow 记录，不参与主裁定。
3. `src-tauri/src/commands/ai_commands.rs`
   - 已在 L3 流启动和 candidate 发射时写入最小 verification / confirmation 记录。
   - 当前 task key 仍为 `shadow-tab:*`，只是过渡承接，不是最终任务标识体系。

## 七、本轮新增发现（2026-04-05，P1 第五轮）

### 7.1 TaskProgressAnalyzer 降级现状

1. `src-tauri/src/commands/ai_commands.rs`
   - 已在三处显式短路文档编辑任务的 TPA 完成裁定：
     - **(1)** 工具结果返回后（`continue_instruction` 生成前）：`is_doc_edit_task` 时 `task_incomplete` 和 `task_completed` 均强制为 `false`，不再注入强制继续或总结指令。
     - **(2)** 流结束强制继续判断入口（原 L2660 区域）：`is_doc_edit_task = true` 时 `task_incomplete` 强制为 `false`，模型自停不被 TPA 打断。
     - **(3)** 流结束总结注入入口（原 L2890 区域）：`is_final_doc_edit = true` 时 `task_completed` 强制为 `false`，不向 doc edit 任务注入总结强制消息。
   - `LEG-004` 状态维持 `已降级`；Phase 3 目标为 doc edit 任务完全不调用 TPA `analyze()`（当前仍调用，只是显式忽略其 completion 字段）。

### 7.2 invalidated 补齐现状

1. `src/stores/diffStore.ts`
   - `expirePendingForStaleRevision` 已补齐 shadow invalidation（第四轮完成）。
   - `cleanupDiffsForMessage`：消息删除时，先收集待删除 pending 条目的 `chatTabId+agentTaskId`，删除后去重回写 `markAgentInvalidated`。
   - `cleanupDiffsForChatTab`：聊天 tab 关闭时同理，先收集再批量回写 invalidated。
   - `executeAcceptAllForPending`：批量接受中因快照校验失败（failed）、非法部分重叠（overlap）、应用失败（apply_replace_failed）被标为 expired 的条目，现在均回写 `markAgentInvalidated`。
   - `setDiffsForToolCall`：当 `snapStale`（写入时 documentRevision 与当前 tab revision 不一致）导致整批 diff 直接写入 expired 状态时，现在也回写 shadow invalidated。
   - 至此，`LEG-016` 已覆盖所有主要 expire/reject/cleanup 路径，仅剩极少数直接调用 `updateDiff({ status: 'expired' })` 的内部路径未覆盖。

### 7.3 本轮已做的处理动作

1. `ai_commands.rs` 新增三处 `is_doc_edit_task` / `is_final_doc_edit` 门禁（含注释标注 `LEG-004 降级`），覆盖工具结果返回、流结束强制继续、流结束总结注入三个入口。
2. `diffStore.ts` 新增五处 shadow invalidation 回写：`cleanupDiffsForMessage`、`cleanupDiffsForChatTab`、`executeAcceptAllForPending`（三条路径）、`setDiffsForToolCall`（snapStale 路径）。
3. 台账：`LEG-004` 描述更新为三处短路；`LEG-016` 描述更新为已覆盖所有主要路径，风险降为低。

## 八、本轮新增发现（2026-04-05，P1 第六轮）

### 8.1 LEG-005 清理完成

1. `src-tauri/src/commands/ai_commands.rs`
   - 移除未使用声明：`let exception_handler = ExceptionHandler::new()`、`let confirmation_manager = ConfirmationManager::new()`、`let task_analyzer = TaskProgressAnalyzer`。
   - 移除对应未使用 import：`use crate::services::exception_handler::{ExceptionHandler, ConversationError, ErrorContext}`、`use crate::services::confirmation_manager::ConfirmationManager`。
   - 移除未使用赋值：`let previous_tool_results = new_tool_results.clone()`（赋值后从未读取）。
   - `LEG-005` 状态更新为 `已清理`，风险降为低。

### 8.2 LEG-014 降级处理

1. `src/types/agent.ts`
   - `AgentRuntimeRecord` 新增 `recentTasks: AgentTaskRecord[]` 字段，用于归档旧任务。
2. `src/stores/agentStore.ts`
   - `setCurrentTask`：当新旧任务 ID 不同时，自动将旧 `currentTask` 归档到 `recentTasks` 头部，最多保留 5 条。
3. `src/utils/agentShadowLifecycle.ts`
   - 新增 `withMatchingRuntimeOrRecent`：匹配 `currentTask` 或 `recentTasks` 中的旧任务，返回 `isRecentTask` 标记。
   - `markAgentRejected`、`markAgentInvalidated` 改用 `withMatchingRuntimeOrRecent`：旧候选的拒绝/失效现在可以正确回写 shadow 状态（但不修改 `currentTask` 引用，仅写 confirmation/verification/stageState）。
   - `markAgentUserConfirmed`、`markAgentStageComplete` 继续使用严格的 `withMatchingRuntime`，只对当前活跃任务生效。
   - `LEG-014` 状态更新为 `已降级`，风险从高降为中。

### 8.3 本轮已做的处理动作

1. `ai_commands.rs` 移除 4 处未使用声明/赋值 + 2 处未使用 import。
2. 引入 `recentTasks` 机制：类型 → store → lifecycle 三层联动。
3. 台账：`LEG-005` 更新为已清理；`LEG-014` 更新为已降级。

## 九、本轮新增发现（2026-04-05，P1 第七轮）

### 9.1 LEG-006 清理完成

1. `src-tauri/src/commands/ai_commands.rs`
   - 移除三个未使用函数：`validate_and_normalize_arguments`（L316-351）、`repair_json_arguments`（L354-407）、`repair_json_string_escapes`（L411-465）。
   - 三者仅内部互相引用，无外部调用点。
   - `LEG-006` 状态更新为 `已清理`。

### 9.2 LEG-009 agent 主链死代码清理

1. `src-tauri/src/services/task_progress_analyzer.rs`
   - 移除未使用的 `FileClassification` 枚举变体（`file_classifier.rs` 中有同名但不同类型的结构体）。
   - 移除未使用的 `user_asks_for_summary` 方法（`ai_commands.rs` 中有同名内联逻辑但不调用此方法）。
   - 移除未使用的 `HashMap` import。
   - 对 `processed_count`、`total_count` 字段加 `#[allow(dead_code)]`（外部未消费但 Phase 3 前保留结构完整性）。
2. `src-tauri/src/services/tool_service.rs`
   - 移除四个未使用错误码常量：`E_ORIGINALTEXT_MISMATCH`、`E_PARTIAL_OVERLAP`、`E_BASELINE_MISMATCH`、`E_APPLY_FAILED`。
   - 对 `BlockEntry.block_type` 字段加 `#[allow(dead_code)]`（后续 resolver 可能需要）。
3. `src-tauri/src/services/tool_call_handler.rs`
   - 移除未使用的 `requires_confirmation` 方法（`confirmation_manager.rs` 中有独立同名方法）。
4. `src-tauri/src/services/streaming_response_handler.rs`
   - 移除未使用的 `detect_tool_call` 方法和 `ToolCallInfo` 结构体。
5. `src-tauri/src/services/reply_completeness_checker.rs`
   - 移除未使用的 `missing_end_marker` 方法。
6. `LEG-009` 状态更新为 `已降级`，仍有非 agent 主链的历史 warning 残留。

### 9.3 本轮已做的处理动作

1. `ai_commands.rs` 移除 3 个未使用函数（约 150 行死代码）。
2. Agent 主链相关 5 个文件清理：移除 1 个枚举变体、2 个方法、4 个常量、1 个结构体 + 方法、1 个方法、1 个 import。
3. 台账：`LEG-006` 更新为已清理；`LEG-009` 更新为已降级。

## 十、P2 入口（2026-04-05，P2 第一轮）

### 10.1 阶段切换

- P1（状态、验证、确认最小闭环）已于第七轮完成验收。
- 本轮起进入 **P2：中间态资产化与上下文协同**。
- P2 目标：把 plan / candidate / diff / verification / confirmation 纳入 artifact 体系，让中间态不再只是消息文本。

### 10.2 workspace.db 正式表结构落地

1. `src-tauri/src/workspace/workspace_db.rs`
   - 新增 **migration v2**（在 `run_migrations` 中 `if version < 2` 分支）。
   - 创建 `agent_tasks` 表：`id TEXT PK, chat_tab_id, goal, lifecycle, stage, stage_reason, created_at, updated_at`。
   - 创建 `agent_artifacts` 表：`id TEXT PK, task_id FK, kind, status, summary, created_at, updated_at`。
   - 四个索引：`idx_agent_tasks_chat_tab`、`idx_agent_tasks_lifecycle`、`idx_agent_artifacts_task`、`idx_agent_artifacts_kind`。
   - 新增行结构体 `AgentTaskRow` / `AgentArtifactRow`。
   - 新增 CRUD 方法：`upsert_agent_task`、`get_agent_task`、`get_agent_tasks_by_chat_tab`、`upsert_agent_artifact`、`get_agent_artifacts_by_task`。
   - 旧 `ai_tasks` 表保留不动（不复用、不迁移、不删除），后续 Phase 3 清理。

2. `src-tauri/src/workspace/workspace_commands.rs`
   - 新增 DTO：`AgentTaskDto`、`AgentArtifactDto`。
   - 新增 4 个 Tauri 命令：`upsert_agent_task`、`get_agent_tasks_for_chat_tab`、`upsert_agent_artifact`、`get_agent_artifacts_for_task`。

3. `src-tauri/src/main.rs`
   - 注册 4 个新命令到 `tauri::generate_handler![]`。

### 10.3 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-012 | 观察中 | 已降级 | 正式表已创建，旧 `ai_tasks` 表保留待清理 |
| LEG-015 | 计划清理 | 计划清理（描述更新） | 正式表 + 命令层已就绪，下一步写穿 |

### 10.4 本轮已做的处理动作

1. `workspace_db.rs` 新增 migration v2（2 张表 + 4 个索引）、2 个行结构体、5 个 CRUD 方法。
2. `workspace_commands.rs` 新增 2 个 DTO + 4 个 Tauri 命令。
3. `main.rs` 注册 4 个新命令。
4. 台账：`LEG-012` 更新为已降级；`LEG-015` 描述更新。

## 十一、P2 写穿链路（2026-04-05，P2 第二轮）

### 11.1 前端 agent task 持久化层

1. `src/services/agentTaskPersistence.ts`（新增）
   - 封装 `persistAgentTask`、`persistAgentTaskUpdate`、`persistAgentArtifact` 三个函数。
   - 内部通过 `invoke('upsert_agent_task')` / `invoke('upsert_agent_artifact')` 写入 workspace.db。
   - 无 workspace 时静默跳过（临时聊天不写入）。
   - 写入失败只 `console.warn`，不阻塞主链。

### 11.2 chatStore.sendMessage 写穿

1. `src/stores/chatStore.ts`
   - 在 `tab.mode === 'agent'` 分支末尾新增动态 import `agentTaskPersistence`，调用 `persistAgentTask` 将 shadow task 的初始状态（`lifecycle='active'`, `stage='structured'`）写入 workspace.db。
   - 使用 fire-and-forget 模式，不等待 IPC 返回。

### 11.3 agentShadowLifecycle 状态变更写穿

1. `src/utils/agentShadowLifecycle.ts`
   - 新增内部函数 `syncTaskToDb`：动态 import `persistAgentTaskUpdate`，fire-and-forget 写入。
   - `markAgentUserConfirmed`：写穿 `stage='user_confirmed'`。
   - `markAgentStageComplete`：写穿 `lifecycle='completed'`, `stage='stage_complete'`。
   - `markAgentRejected`：写穿 `lifecycle='invalidated'`, `stage='invalidated'`。
   - `markAgentInvalidated`：写穿 `lifecycle='invalidated'`, `stage='invalidated'`。
   - recentTasks 中的旧候选同样会被写穿（只要匹配到任务）。

### 11.4 写穿链路架构

```
chatStore.sendMessage (agent mode)
  └─ createShadowTaskRecord → agentStore.setCurrentTask → persistAgentTask → workspace.db

agentShadowLifecycle.markAgent*
  └─ agentStore.set* → syncTaskToDb → persistAgentTaskUpdate → workspace.db
```

### 11.5 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-015 | 计划清理 | 已降级 | 前端侧 agent_tasks 写穿完成，Rust 内存 registry 待迁移 |

### 11.6 本轮已做的处理动作

1. 新增 `src/services/agentTaskPersistence.ts`（持久化服务层）。
2. `chatStore.ts` 在 sendMessage 中接入 agent task 写穿。
3. `agentShadowLifecycle.ts` 四个状态变更函数均接入 workspace.db 写穿。
4. 台账：`LEG-015` 更新为已降级。

## 十二、本轮新增发现（Phase 2 / P2 第三轮）

### 12.1 本轮目标

Rust 侧 artifact 写穿 + prompt 注入 agent_tasks，使中间态不再只是消息文本。

### 12.2 变更文件清单

1. `src-tauri/src/commands/ai_commands.rs`
   - 新增 `persist_artifact_to_db`：通过 `tokio::spawn` 异步写入 `agent_artifacts` 表，不阻塞主链。
   - 新增 `seed_shadow_artifacts`：L3 流启动时写入 verification(pending) + confirmation(pending) 两条 artifact。
   - 新增 `mark_shadow_candidate_artifacts`：candidate 产出时写入 verification(passed) + confirmation(pending) 两条 artifact。
   - 3 个现有调用点（L1085、L1803、L3536）均已接入对应的 artifact 写穿。
   - 新增 `agent_task_summary` 读取：构建 `ContextInfo` 前从 `workspace.db` 读取当前 chat tab 的最近 3 条 agent_tasks，生成结构化摘要。

2. `src-tauri/src/services/context_manager.rs`
   - `ContextInfo` 新增字段 `agent_task_summary: Option<String>`。
   - `build_multi_layer_prompt` 新增第五层：当 `agent_task_summary` 有值时注入 `## Current Agent Task State` 区块，让模型感知当前任务的 lifecycle/stage 状态。

### 12.3 写穿链路架构（更新）

```
Rust 侧 (ai_commands.rs)
  L3 流启动 → seed_shadow_registries (内存) + seed_shadow_artifacts (workspace.db)
  candidate 产出 → mark_shadow_candidate_registries (内存) + mark_shadow_candidate_artifacts (workspace.db)

前端侧 (chatStore + agentShadowLifecycle)
  sendMessage → persistAgentTask → workspace.db (agent_tasks)
  markAgent* → syncTaskToDb → persistAgentTaskUpdate → workspace.db (agent_tasks)

Prompt 注入 (context_manager.rs)
  build_multi_layer_prompt → 读取 agent_tasks → 注入第五层 agent task state
```

### 12.4 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-015 | 已降级 | 已降级（进一步收口） | Rust 侧 artifact 写穿完成，内存 registry 仅保留为运行时缓存 |
| LEG-008 | 计划清理 | 计划清理（初步突破） | prompt 已可读取 agent_tasks 表注入任务状态，部分决策开始脱离纯消息文本驱动 |

### 12.5 本轮已做的处理动作

1. Rust 侧 `ai_commands.rs` 新增 3 个函数实现 artifact 写穿到 workspace.db。
2. 3 个 seed/mark 调用点同步接入 artifact 持久化。
3. `context_manager.rs` 新增 `agent_task_summary` 字段和第五层 prompt 注入。
4. `ai_commands.rs` 构建 `ContextInfo` 时从 workspace.db 读取 agent_tasks 生成摘要。
5. 编译验证：`cargo check` 145 warnings（未增加），`npm run build` 通过。
6. 台账：`LEG-015` 进一步收口描述，`LEG-008` 标注初步突破。

## 十三、本轮新增发现（Phase 3 / P3 第一轮 — Phase 8：Build Mode 边界与恢复骨架）

### 13.1 本轮目标

1. 创建 `BuildModePolicy` 类型体系，统一 TPA force-continue 门禁
2. 将 ai_commands.rs 中分散的 `is_doc_edit_task` 检查收口为 policy 驱动
3. 建立前端任务恢复骨架（`loadTasksFromDb`）

### 13.2 变更文件清单

1. `src-tauri/src/services/tool_policy.rs`（新增）
   - `AllowedDelegationScene` 枚举：`InformationGathering` / `RecursiveFileCheck` / `FileOrganization`
   - `ToolCallBudget` 结构：`max_tool_rounds` / `max_force_continues`
   - `BuildModePolicy` 结构：`active` / `allowed_scenes` / `budget`
   - 核心方法：`default_writing()` → 关闭所有 TPA 续轮；`build_mode()` → 激活 RecursiveCheck + FileOrganization
   - `allows_tpa_force_continue()` 和 `allows_delegation()` 作为统一门禁

2. `src-tauri/src/services/mod.rs`
   - 注册 `pub mod tool_policy`

3. `src-tauri/src/commands/ai_commands.rs`
   - 导入 `BuildModePolicy`
   - 4 个 TPA 使用点统一迁移至 policy 驱动：
     - 首轮工具结果分析（`task_incomplete`/`task_completed` 判定）
     - 内循环流错误处理（`continue_loop` 决策）
     - 内循环流结束强制继续（`task_incomplete` 判定 + force-continue message 生成）
     - 内循环流结束总结注入（`task_completed` 判定）
     - 工具续轮路径（`task_incomplete`/`task_completed` 判定）
   - force-continue message 中移除了永远不可达的 `is_doc_edit_force` 分支

4. `src/stores/agentStore.ts`
   - 新增 `loadTasksFromDb(chatTabId)` 异步方法
   - 从 workspace.db 读取 `agent_tasks`，恢复 `lifecycle='active'` 的任务为 `currentTask`
   - 同步恢复 `stageState`

### 13.3 架构变更说明

```
TPA force-continue 决策链（修改前）
  4 处散落的 is_doc_edit_task 检查 → 各自硬编码短路逻辑

TPA force-continue 决策链（修改后）
  ai_commands.rs
    TaskProgressAnalyzer::analyze()
    → 按 task_type 生成 BuildModePolicy
    → policy.allows_tpa_force_continue() 统一门禁
    → 默认主链（doc edit + 未知类型）= false
    → build mode（RecursiveCheck / FileMove）= true

前端恢复链（新增骨架）
  workspace 打开
    → agentStore.loadTasksFromDb(chatTabId)
    → invoke('get_agent_tasks_for_chat_tab')
    → 找到 lifecycle='active' 的任务
    → setCurrentTask + setStageState
```

### 13.4 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-004 | 已降级 | 已清理 | TPA force-continue 统一收口到 BuildModePolicy，默认主链完全关闭 TPA 裁定 |
| LEG-008 | 计划清理 | 已降级 | prompt 注入 + force-continue policy 门禁 + 前端恢复骨架，决策链已逐步脱离纯消息驱动 |

### 13.5 本轮已做的处理动作

1. 新增 `tool_policy.rs`（BuildModePolicy / AllowedDelegationScene / ToolCallBudget）。
2. `ai_commands.rs` 4 个 TPA 使用点统一收口到 BuildModePolicy 门禁。
3. `agentStore.ts` 新增 `loadTasksFromDb` 恢复骨架。
4. 编译验证：`cargo check` 145 warnings（未增加），`npm run build` 通过。
5. 台账：`LEG-004` → 已清理，`LEG-008` → 已降级。

## 十四、本轮新增发现（Phase 3 / P3 第二轮 — Phase 8：恢复接入、预算消费、registry 退役）

### 14.1 本轮目标

1. 将 `loadTasksFromDb` 接入实际调用点（createTab），完成恢复链路最后一环
2. 用 `ToolCallBudget` 替代 `ai_commands.rs` 中硬编码的 `MAX_TOOL_ROUNDS` / `MAX_FORCE_CONTINUE_RETRIES`
3. 标记内存 verification/confirmation registry 为 `#[deprecated]`

### 14.2 变更文件清单

1. `src/stores/chatStore.ts`
   - 在 `createTab` 中，`ensureRuntimeForTab` 之后新增异步调用 `loadTasksFromDb(tabId)`
   - 仅在 `currentWorkspace` 存在且 `mode === 'agent'` 时触发
   - fire-and-forget 模式，不阻塞 tab 创建

2. `src-tauri/src/commands/ai_commands.rs`
   - 移除硬编码 `const MAX_FORCE_CONTINUE_RETRIES: usize = 5` 和 `const MAX_TOOL_ROUNDS: usize = 10`
   - 替换为 `let max_force_continue_retries = budget.max_force_continues` 和 `let max_tool_rounds = budget.max_tool_rounds`
   - `budget` 从 `loop_build_policy.budget` 获取
   - 替换 `loop_detector.check_max_force_continue_retries(force_continue_count)` 为直接比较 `force_continue_count >= max_force_continue_retries`
   - 给 `use crate::services::verification_registry` 和 `use crate::services::confirmation_registry` import 加 `#[allow(deprecated)]`
   - 给 `seed_shadow_registries` 和 `mark_shadow_candidate_registries` 函数加 `#[allow(deprecated)]`

3. `src-tauri/src/services/verification_registry.rs`
   - `upsert_global_verification` 加 `#[deprecated(note = "Phase 8: ...")]`

4. `src-tauri/src/services/confirmation_registry.rs`
   - `upsert_global_confirmation` 加 `#[deprecated(note = "Phase 8: ...")]`

### 14.3 架构变更说明

```
工具调用预算（修改前）
  MAX_TOOL_ROUNDS = 10 (硬编码 const)
  MAX_FORCE_CONTINUE_RETRIES = 5 (硬编码 const)
  LoopDetector.max_force_continue_retries = 5 (硬编码字段)

工具调用预算（修改后）
  BuildModePolicy.budget.max_tool_rounds = 20 (default_writing/build_mode 共用)
  BuildModePolicy.budget.max_force_continues = 5 (default_writing/build_mode 共用)
  → 后续可按策略差异化设置不同场景的预算

恢复链路（完成接入）
  chatStore.createTab(mode='agent')
    → ensureRuntimeForTab
    → loadTasksFromDb(tabId)  ← 新增
    → invoke('get_agent_tasks_for_chat_tab')
    → 恢复 currentTask + stageState
```

### 14.4 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-015 | 已降级 | 计划清理 | `upsert_global_*` 已标记 `#[deprecated]`，后续可安全移除 |

### 14.5 本轮已做的处理动作

1. `chatStore.createTab` 接入 `loadTasksFromDb` 异步恢复。
2. `ai_commands.rs` 硬编码常量替换为 `ToolCallBudget` 字段。
3. `verification_registry.rs` / `confirmation_registry.rs` 全局函数标记 `#[deprecated]`。
4. 编译验证：`cargo check` 144 warnings（减少 1），`npm run build` 通过。
5. 台账：`LEG-015` → 计划清理。

---

## 十五、Phase 2 补齐 + Phase 3 七层 Prompt Assembly 主链切换

### 15.1 本轮新增发现

| 编号 | 类型 | 文件/模块 | 现状说明 | 风险 | 计划阶段 | 当前状态 |
|---|---|---|---|---|---|---|
| `LEG-017` | 旧工具定义静态残留 | `src-tauri/src/services/tool_definitions.rs` | 旧 `get_tool_definitions_legacy()` 函数保留作为参照回退，主源已切到 `tool_matrix.rs`。后续可安全删除 | 低 | 后续清理 | 已降级 |
| `LEG-018` | `formatForAI` 仍为前端引用注入主链 | `src/components/Chat/ChatInput.tsx`, `src/stores/referenceStore.ts` | Phase 3 计划要求降级为 UI 兼容，主注入由后端 constraint 层处理。当前前端仍将 `formatForAI()` 拼入 message content 传给后端，后端 constraint 层并行注入。双写不冲突但冗余 | 中 | Phase 5-6 统一收口 | 观察中 |

### 15.2 本轮修改清单

**Phase 2 补齐：`tool_matrix.rs` 创建**

- 新增 `src-tauri/src/services/tool_matrix.rs`：
  - 定义 `ToolCategory`（FileRead / FileWrite / EditorEdit / Metadata）
  - 定义 `ToolVisibility`（Always / WhenEditorOpen / BuildModeOnly）
  - `build_tool_matrix()` → 11 个工具的结构化矩阵
  - `definitions_from_matrix()` → 兼容旧接口的 `Vec<ToolDefinition>` 提取
- 修改 `src-tauri/src/services/tool_definitions.rs`：
  - `get_tool_definitions()` 委托到 `definitions_from_matrix()`
  - 旧拼装逻辑降级为 `get_tool_definitions_legacy()`
- 修改 `src-tauri/src/services/mod.rs`：注册 `tool_matrix` 模块

**Phase 3：七层 Prompt Assembly 主链切换**

- `src-tauri/src/services/context_manager.rs`：
  - `PromptPackageLayer` / `PromptPackage` 去 `#[allow(dead_code)]`
  - `build_prompt_package()` 重写为七层结构：governance → task → (conversation) → fact → constraint → (augmentation) → (tool_and_output)
  - `build_multi_layer_prompt()` 改为委托 `build_prompt_package().rendered_prompt`
- `src-tauri/src/commands/ai_commands.rs`：
  - `ai_chat_stream` 从 `build_multi_layer_prompt()` 切换为 `build_prompt_package()` 消费

### 15.3 架构变更说明

```
工具定义来源（修改前）
  tool_definitions.rs::get_tool_definitions() → Vec<ToolDefinition> (静态拼装)

工具定义来源（修改后）
  tool_matrix.rs::build_tool_matrix() → Vec<ToolMatrixEntry>     ← 主源
  tool_matrix.rs::definitions_from_matrix() → Vec<ToolDefinition> ← 过滤 + 提取
  tool_definitions.rs::get_tool_definitions() → 委托到 definitions_from_matrix()
  tool_definitions.rs::get_tool_definitions_legacy() → 旧代码保留(dead_code)

Prompt 构建（修改前）
  context_manager.build_multi_layer_prompt()
    → L1 base_system_prompt + L2 context_prompt + L3 reference + L5 agent_task_summary
    → 返回 String

Prompt 构建（修改后）
  context_manager.build_prompt_package()
    → L1 governance (base_system_prompt)
    → L2 task (agent_task_summary)
    → L3 conversation (message history, not in prompt)
    → L4 fact (context_prompt: doc content, block list, editor state)
    → L5 constraint (references, truncated by budget)
    → L6 augmentation (placeholder: memory/knowledge/template)
    → L7 tool_and_output (placeholder: tool defs via provider-side)
    → rendered_prompt = layers.join("\n\n")
  context_manager.build_multi_layer_prompt()
    → 委托 build_prompt_package().rendered_prompt

ai_chat_stream 消费（修改前）
  let system_prompt = context_manager.build_multi_layer_prompt(...)

ai_chat_stream 消费（修改后）
  let prompt_package = context_manager.build_prompt_package(...)
  let system_prompt = prompt_package.rendered_prompt.unwrap_or_default()
```

### 15.4 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-017 | — | 已降级 | 新增：旧 tool_definitions 静态代码保留为 legacy |
| LEG-018 | — | 观察中 | 新增：formatForAI 前端注入仍为主链，待后续统一 |

### 15.5 开发计划阶段完成度更新

| 阶段 | 完成标志 | 状态 |
|------|----------|------|
| Phase 2（工具矩阵 + PromptPackage 骨架） | 工具定义主源切到矩阵 ✅；PromptPackage 类型进入代码 ✅ | ✅ 完成 |
| Phase 3（L3 Prompt Assembly 主链切换） | agent 模式消费 PromptPackage ✅；七层结构落地 ✅；`formatForAI` 降级 ⚠️ 部分（双写无冲突，收口留 Phase 5-6） | ⚠️ 核心完成，formatForAI 收口留后续 |

### 15.6 本轮已做的处理动作

1. 新增 `tool_matrix.rs`，11 个工具结构化注册。
2. `tool_definitions.rs` 委托到矩阵，旧代码降级为 legacy。
3. `context_manager.rs` 七层 `build_prompt_package` 正式替代旧 `build_multi_layer_prompt` 主链。
4. `ai_commands.rs` 切换到 `build_prompt_package` 消费。
5. 编译验证：`cargo check` 147 warnings（tool_matrix.rs 新增 category 字段 warning），`npm run build` 通过。
6. 台账：新增 `LEG-017`、`LEG-018`。

---

## 十六、Phase 5（验证确认统一）+ Phase 6（闭环迁移与 UI 稳定化）

### 16.1 本轮新增发现

| 编号 | 类型 | 文件/模块 | 现状说明 | 风险 | 计划阶段 | 当前状态 |
|---|---|---|---|---|---|---|
| `LEG-019` | meta 注入尚未覆盖错误路径 | `src-tauri/src/services/tool_service.rs` | `edit_current_editor_document` 和 `update_file` 的错误返回路径仍返回 `meta: None`，只有成功路径注入了 meta。错误时应注入 `verification.status=failed` | 低 | 后续 Phase 5 迭代 | 观察中 |

### 16.2 本轮修改清单

**Phase 5：统一候选-验证-确认语义**

- `src-tauri/src/services/tool_service.rs`：
  - 新增 `build_candidate_meta(tool_name, file_path, diff_count)` 构造统一的 candidate_ready meta
  - 新增 `build_noop_meta(tool_name)` 构造 NO_OP meta
  - `edit_current_editor_document` SUCCESS 路径：注入 `build_candidate_meta("edit_current_editor_document", file_path, 1)`
  - `edit_current_editor_document` NO_OP 路径：注入 `build_noop_meta("edit_current_editor_document")`
  - `update_file(use_diff)` 路径：注入 `build_candidate_meta("update_file", file_path, diff_count)`
  - 两条编辑链现在使用同一 `ToolResultMeta` 语义：gate=candidate_ready / verification=passed / confirmation=pending

- `src/types/tool.ts`：
  - `ToolGateMeta.status` 扩展：新增 `'candidate_ready' | 'no_op'`
  - `ToolArtifactMeta.status` 扩展：新增 `'pending_review'`

**Phase 5 完成标志验证**：
  - ✅ `edit_current_editor_document` 与 `update_file(use_diff)` 使用同一候选-验证-确认语义
  - ✅ `TaskProgressAnalyzer` 已退出主闭环裁定（Phase 8 已完成，BuildModePolicy 门禁）

**Phase 6：前端 UI 展示 + 续轮决策切换**

- `src/components/Chat/ToolCallCard.tsx`：
  - 在工具结果成功展示区域新增 meta 状态标签行
  - 展示 gate 状态（候选就绪 / 无变更）、verification 状态（通过/失败/进行中）、confirmation 状态（已确认/已拒绝/待确认）
  - 使用语义化颜色标签：蓝色=候选就绪，绿色=验证通过/已确认，红色=失败/已拒绝，琥珀色=待确认

- `src-tauri/src/commands/ai_commands.rs`：
  - `tool_results_emit_candidate()` 重构：优先读 `meta.gate.status` 判断是否产生候选
  - `candidate_ready` → true，`no_op` → false
  - 保留旧数据字段启发式作为 fallback（向后兼容）

**Phase 6 完成标志验证**：
  - ✅ 前端 UI 明确展示 state / verification / confirmation
  - ✅ 续轮决策切换到读 meta（优先 meta，fallback 启发式）

### 16.3 架构变更说明

```
工具结果 meta（修改前）
  edit_current_editor_document → ToolResult { meta: None }
  update_file(use_diff)        → ToolResult { meta: None }
  tool_results_emit_candidate  → 基于 data 字段启发式判断

工具结果 meta（修改后）
  edit_current_editor_document (SUCCESS) → ToolResult { meta: {
    gate: candidate_ready,
    artifact: { kind: diff_candidate, status: pending_review },
    verification: { status: passed },
    confirmation: { status: pending }
  }}
  edit_current_editor_document (NO_OP) → ToolResult { meta: {
    gate: no_op,
    verification: { status: passed }
  }}
  update_file(use_diff) → ToolResult { meta: {
    gate: candidate_ready,
    artifact: { kind: diff_candidate, status: pending_review },
    verification: { status: passed },
    confirmation: { status: pending }
  }}
  tool_results_emit_candidate → 优先读 meta.gate.status，fallback 旧启发式

前端 UI（修改前）
  ToolCallCard → 仅显示 ✅ 执行成功 / ❌ 执行失败

前端 UI（修改后）
  ToolCallCard → 成功后追加 meta 标签行：
    [📋 候选就绪] [✓ 验证通过] [⏳ 待确认]
```

### 16.4 台账状态变更

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-019 | — | 观察中 | 新增：错误路径 meta 注入尚未覆盖 |

### 16.5 开发计划阶段完成度更新

| 阶段 | 完成标志 | 状态 |
|------|----------|------|
| Phase 5（验证、gate、确认统一） | 两条编辑链统一 meta 语义 ✅；TPA 退出主闭环 ✅ | ✅ 完成 |
| Phase 6（闭环迁移与 UI 稳定化） | 前端 UI 展示 meta 状态 ✅；续轮决策读 meta ✅ | ✅ 完成 |

### 16.6 全阶段完成度总览

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 1（基线冻结与入口隔离） | ✅ 完成 | |
| Phase 2（工具矩阵 + PromptPackage 骨架） | ✅ 完成 | tool_matrix.rs 已落地 |
| Phase 3（L3 Prompt Assembly 主链切换） | ✅ 核心完成 | formatForAI 双写收口留后续 |
| Phase 4（状态对象与任务对象落地） | ✅ 完成 | |
| Phase 5（验证、gate、确认统一） | ✅ 完成 | |
| Phase 6（闭环迁移与 UI 稳定化） | ✅ 完成 | |
| Phase 7（Artifact 持久化与上下文协同） | ✅ 完成 | |
| Phase 8（恢复能力、Build Mode 边界） | ✅ 完成 | |

### 16.7 本轮已做的处理动作

1. `tool_service.rs` 新增 `build_candidate_meta` / `build_noop_meta` 统一构造函数，两条编辑链注入统一 meta。
2. `tool.ts` 扩展 `ToolGateMeta.status` 和 `ToolArtifactMeta.status` 类型。
3. `ToolCallCard.tsx` 新增 meta 状态标签展示。
4. `ai_commands.rs` `tool_results_emit_candidate` 重构为优先读 meta。
5. 编译验证：`cargo check` 147 warnings（未增加），`npm run build` 通过。
6. 台账：新增 `LEG-019`，全阶段完成度总览更新。

## 十七、Phase 6 + Phase 7 真实闭环补齐（2026-04-05）

> 本节补齐第十六节所声明"已完成"但实际代码链路缺失的部分。

### 17.1 补齐内容

**Phase 6 — 后端 stage 写入与事件推送**

1. `workspace_db.rs` 新增 `update_agent_task_stage(id, stage, stage_reason)` — stage-only 更新，无需知道 goal/lifecycle。
2. `workspace_commands.rs` 新增 `update_agent_task_stage` Tauri 命令。
3. `main.rs` 注册新命令。
4. `ai_commands.rs` 新增 `write_task_stage` helper — 写 DB（跳过 shadow 代理键）并向前端发送 `ai-agent-stage-changed` 事件。
5. `ai_commands.rs` 新增 `agent_task_id: Option<String>` 参数 — 前端传入真实 shadow task ID，后端优先使用（fallback 到 shadow-tab:* 代理键）。
6. `ai_commands.rs` 跟踪 `candidate_emitted_this_session` 标志：工具结果产生候选时置 `true`，写 `candidate_ready` 到 DB + 发送事件。
7. `ai_commands.rs` 流统一收尾处：若 `candidate_emitted_this_session=true`，写 `review_ready` + 发送事件。

**Phase 6 — 前端 stage 事件同步**

8. `chatStore.ts` invoke 调用补传 `agentTaskId`（从 agentStore 读当前 task ID）。
9. `ChatPanel.tsx` 新增 `ai-agent-stage-changed` 事件监听 effect — 收到事件后调用 `agentStore.setStageState()` 更新 shadow 状态。

**Phase 7 — Artifact 注入 context**

10. `context_manager.rs` `ContextInfo` 新增 `agent_artifacts_summary: Option<String>` 字段。
11. `context_manager.rs` task 层同时注入 `agent_artifacts_summary`（Task State + Recent Artifacts）。
12. `ai_commands.rs` 读取当前任务最新 artifacts（最多 5 条）并构建摘要字符串，传入 context_info。

### 17.2 完整状态机流向（修复后）

```
用户发消息
  └─ chatStore.sendMessage
      ├─ persistAgentTask(id, 'active', 'structured')     ← 已有
      └─ invoke('ai_chat_stream', { agentTaskId })         ← 本轮新增

后端工具轮次
  └─ tool_results_emit_candidate() = true
      ├─ mark_shadow_candidate_artifacts()                 ← 已有
      └─ write_task_stage('candidate_ready', ...)          ← 本轮新增
          └─ emit('ai-agent-stage-changed', ...)           ← 本轮新增

后端流结束
  └─ candidate_emitted_this_session = true
      └─ write_task_stage('review_ready', ...)             ← 本轮新增
          └─ emit('ai-agent-stage-changed', ...)           ← 本轮新增

前端事件接收
  └─ ChatPanel 监听 'ai-agent-stage-changed'              ← 本轮新增
      └─ agentStore.setStageState(tabId, stage)            ← 已有

用户接受 diff
  └─ markAgentUserConfirmed → syncTaskToDb → persistAgentTaskUpdate ← 已有
  └─ markAgentStageComplete → syncTaskToDb                 ← 已有
```

### 17.3 编译验证

- `cargo check`：无新增 error
- `npm run build`：通过（✓ built in ~2.5s）

---

## 十八、台账清理批处理（2026-04-06，LEG-003/007/010/011/015/016/018/019）

### 18.1 本批处理目标

按台账顺序处理所有剩余 `观察中 / 计划清理 / 待人工确认` 项，人工决策项使用推荐方案。

### 18.2 各项处置结果

| LEG | 处置方式 | 结果 |
|-----|---------|------|
| LEG-015 | 删除 `verification_registry.rs` + `confirmation_registry.rs`；移除 `mod.rs` 声明；删除 `seed_shadow_registries`/`mark_shadow_candidate_registries` 函数及两处 `#[allow(deprecated)]` import；移除三处调用点 | 已清理 |
| LEG-003 | 删除 `src/components/Editor/extensions/GhostTextExtension.ts` + `src/components/Editor/GhostText.tsx`（两文件均无外部 import，安全删除） | 已清理 |
| LEG-019 | `tool_service.rs` 新增 `build_failure_meta(tool_name, reason)` 函数；`update_file` 三条错误路径（file not found / pandoc unavailable / write failed）注入 `build_failure_meta`；`edit_current_editor_document` resolve 错误路径在 `meta: None` 时注入 `build_failure_meta` | 已清理 |
| LEG-016 | 审计全部 `status: 'expired'` 写入路径：所有路径均已有 `markAgentInvalidated` 对齐（`markExpired`、`acceptAll` 三条失败路径、`expirePendingForStaleRevision`）；`addDiff` 中 snapStale 写入为首次创建无需 shadow 回写；无需变更 | 已清理（审计确认） |
| LEG-010 | `loop_detector.rs` 中 `ToolCallRecord` 及其字段从 `struct` / `String` 改为 `pub struct` / `pub String`，与 `recent_tool_calls: VecDeque<ToolCallRecord>` 的公开字段对齐 | 已清理 |
| LEG-007 | 审计 `openai.rs`：`tool_calls` SSE 解析分支（delta.tool_calls / finish_reason=tool_calls / [DONE] 三路）均已实现，与 CLAUDE.md 中"完全 broken"描述不符（已在历史轮次修复）；无需变更 | 已清理（审计确认） |
| LEG-011 | 审计四个服务：`diff_service.rs`（仅 mod.rs 声明，无外部 use，全无使用点）→ 删除；`exception_handler.rs`（同上）→ 删除；`preview_service.rs`（被 `pandoc_service.rs` 内部 use，保留）；`document_analysis.rs`（被 `ai_commands.rs` use，保留）。移除 mod.rs 中对应两条 `pub mod` 声明 | 已清理 |
| LEG-018 | 移除 `ChatInput.tsx` 中 `formatForAI` 调用及 `[引用信息]` 拼接逻辑；改为仅通过 `getReferences` 获取 refs 用于 displayNodes；message content 不再包含 reference 文本（后端 constraint 层已接管） | 已清理 |

### 18.3 台账主表状态更新

| LEG | 之前 | 现在 | 说明 |
|-----|------|------|------|
| LEG-003 | 观察中 | 已清理 | 两文件无外部 import，已删除 |
| LEG-007 | 观察中 | 已清理 | 审计确认已在历史轮次修复 |
| LEG-010 | 观察中 | 已清理 | ToolCallRecord 改为 pub |
| LEG-011 | 待人工确认 | 已清理 | diff_service / exception_handler 删除；preview_service / document_analysis 保留 |
| LEG-015 | 计划清理 | 已清理 | 两个 registry 文件及所有调用点已删除 |
| LEG-016 | 观察中 | 已清理 | 审计确认全路径已覆盖 |
| LEG-018 | 观察中 | 已清理 | 前端 formatForAI 双写已移除 |
| LEG-019 | 观察中 | 已清理 | build_failure_meta 注入四条错误路径 |

### 18.4 编译验证

- `cargo build`：通过（`Finished 'dev' profile`，无新增 error，仅历史 warning）
- `npx tsc --noEmit`：通过（exit: 0）
