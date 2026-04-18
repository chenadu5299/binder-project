# 《对话编辑 / 引用系统 / 工作区边界 全面扩展检查报告》

## 文档头

- 结构编码：`SYS-M-D-06`
- 文档属性：`审计报告 / 只读`
- 生成依据：代码事实 + 文档交叉审计（2026-04-16）
- 检查范围：对话编辑主链、引用系统主链、工作区/当前文档/工具执行边界
- 主索引：`A-SYS-M-D-01_当前实现运行时逻辑地图总览.md`
- **禁止**：本报告不改代码、不改文档、不提交修复。只检查、归纳、对照。

---

## 1. 结论摘要

### 1.1 按三类归因分类

| 专题 | 主要归因 | 说明 |
|------|---------|------|
| stage_complete 推进主体越权 | **实现层跑偏** | 文档（A-CORE-C-D-05 / A-AG-M-T-05）定义清晰，代码实际存在 ChatMessages.tsx 越权写 agentStore |
| byTab / byFilePath 双轨状态机 | **架构层缺口** | 文档中无对两轨的统一数据模型定义，实现层两套并行且字段命名风格不一致 |
| contentBlocks / toolCalls 双路径渲染 | **架构层缺口 + 实现层跑偏** | 文档未定义两路共存的过渡规则，实现层两路并存且 ToolCallCard 旧路径部分"禁用但保留" |
| execute_failed 语义不统一 | **描述层冲突 + 实现层跑偏** | 文档定义为"业务事件"，代码实现为内存对象，未作为 DiffEntryStatus 枚举值，但文档在部分地方暗示其与 expired 的边界仍模糊 |
| 引用注入链：MEMORY/KB 模糊检索兜底 | **架构层缺口** | 文档（A-AST-M-T-07）有抑制规则，但未覆盖 Memory 引用的名称模糊搜索兜底场景 |
| 工作区切换不中断 stream | **架构层缺口** | 文档无此约束，实现层已有事实行为，需要补明确规则 |
| stage_complete 闭合条件不一致 | **描述层冲突** | A-DE-M-D-01 与 A-AG-M-T-05 的 stage_complete 条件集合不同 |
| selection vs reference 两套路径混用 | **描述层冲突 + 实现层跑偏** | 术语边界定义了精确四元组，但 TextReference 与编辑器选区之间的"互为回退"逻辑仅在代码中实现，文档未说明 |
| 当前文档问题滑向知识检索 | **架构层缺口** | A-AST-M-T-07 有抑制闸门规则，但代码中的 explicit_knowledge_suppression 实际行为需逐条验证 |

### 1.2 总体判断预告

三条主线均存在**架构层缺口 + 实现层跑偏**的叠加。主链基本可识别，但多处并行路径仍在生效，关键状态推进主体越权，协议字段部分退化为字符串。属于 **B 类：存在明显结构性问题，但仍可分阶段收口**。

---

## 2. 文档权威与自洽性检查

### 2.1 共享概念主定义表

| 概念 | 主定义文档 | 定义摘要 | 是否被实现正确消费 |
|------|-----------|---------|----------------|
| `canonical diff` / `DiffEntry` | `A-DE-M-T-01` §3.1 / `A-DE-X-L-01` §4.5 | 含 diffId/startBlockId/startOffset/endBlockId/endOffset/originalText/newText/type/diff_type/route_source | ✅ 主字段存在；`route_source` 在后端 resolve 中有，前端 positioningPath 不完全等价 |
| `stage_complete` 推进主体 | `A-CORE-C-D-05` §6.6–6.7 / `A-AG-M-T-05` §一 | **唯一合法主体为 AgentTaskController** | ⛔ ChatMessages.tsx useEffect 越权推进 review_ready / awaiting_user_review |
| `invalidated` | `A-CORE-C-D-05` §6.6 / `A-AG-M-T-05` §2.3 | 由 AgentTaskController.forceInvalidate 裁决 | ✅ AgentTaskController.forceInvalidate 实现对应；但 markAgentInvalidated 通过 agentShadowLifecycle 也可直接写 |
| `verification` vs `confirmation` | `A-CORE-C-D-05` §6.6 / `A-AG-M-T-04` §5.4 | verification=门禁裁决；confirmation=人类确认票 | ⚠️ chatStore.sendMessage 同时写 setVerification + setConfirmation（两者同时初始化，语义边界不清） |
| `execute_failed` | `A-CORE-C-D-05` §6.6 / `A-DE-M-T-01` §6.4 | **业务事件**，不等于 expired，不等于 DiffEntryStatus | ✅ 代码中是 `DiffExecuteFailedEvent` 内存对象；⚠️ 文档部分表述暗示某些门禁失败"直接走 expired 路径"，与"不等于 expired"存在字面张力 |
| `baselineId` / `baseline` / `logicalContent` | `A-DE-M-T-02` §3.1 / `A-CORE-C-D-05` §三 | baseline=本批 diff 基线；baselineId=本轮唯一标识；logicalContent=已生效内容 | ⚠️ `getLogicalContent` 已实现但主链未调用；positioningCtx.L 每轮覆盖（实现合理但文档旧描述"set once"未完全清理） |
| `accepted / rejected / expired` | `A-CORE-C-D-05` §6.6 / `A-DE-M-T-01` §4.2 | 业务状态，语义清晰 | ✅ diffStore 对应 |
| `byTab` / `byFilePath` | **A-AG-M-T-05 §2.3（一句）**；无独立数据模型定义 | byTab=编辑器 diff 池；byFilePath=workspace pending diff 池 | ⚠️ 无正式文档，字段 `byTab` 键实为 filePath（命名误导） |
| `update_file` vs `edit_current_editor_document` | `A-AG-M-P-02_Binder Agent工具矩阵.md` | update_file=未打开文件；edit_current_editor_document=已打开文档 | ✅ 工具矩阵有定义；A-DE-M-D-01 未并列定义（依赖外部文档） |
| `shadow runtime` | `A-CORE-C-D-02`（主定义）/ `A-CORE-C-D-05` §6.5 | 投影/镜像/辅助观测层，不是业务主真源 | ✅ agentStore runtimeMode:'shadow' 对应；⚠️ ChatMessages useEffect 使用 shadow runtime 数据推进 stage，与"不是业务主真源"定义冲突 |
| `candidate` | `A-CORE-C-D-02` / `A-AG-M-T-04` §6.3 / §8.1 | 候选结果工件 | ⚠️ 无独立业务定义，仅作为 AgentArtifactType 枚举值；与 candidate_ready stage 的语义关联仅在实现中体现 |
| `Reference` | `A-CORE-C-D-02` §3.3 | 用户显式结构化输入；含精确四元组 | ✅ types/reference.ts 覆盖；⚠️ TEXT 引用的 startBlockId 等字段标注 @deprecated（旧兼容字段仍存在） |
| `当前文档` / `当前文件` / `当前活动文件` | `A-CORE-C-D-02` §3.2 | 三者语义不同（焦点/参与轮/编辑器激活） | ⚠️ 代码中 currentFile 参数同时可能表达三种语义（由调用方上下文决定） |
| `route_source` | `A-DE-M-T-01` §3.1 / `A-DE-X-L-01` §4.5 | 定位路由来源标记 | ⚠️ 后端 resolve() 有 route_source；前端 DiffEntry.positioningPath（'Anchor'/'Resolver'/'Legacy'）与文档的 route_source 不完全对应 |

### 2.2 主文档 / 承接文档 / 历史文档关系

```
L1 主权威
  A-CORE-C-D-02（术语）
  A-CORE-C-D-05（状态单一真源）

L2 主控
  A-DE-M-D-01（对话编辑统一方案）
  A-AG-M-T-04（Agent 技术主控）
  A-WS-M-D-01（workspace 主控）

L3 专题主控
  A-DE-M-T-01（diff 系统规则）
  A-DE-M-T-02（baseline 状态协作）
  A-AG-M-T-05（AgentTaskController 设计）
  A-AG-M-T-03（任务规划执行）
  A-AST-M-T-07（知识自动检索协同）
  A-WS-M-T-05（跨文档操作）

历史 / 仅参考（不得作为主定义）
  R-DE-* 系列（已明确标注）
  R-AST-* 系列（已明确标注）
  R-WS-* 系列（已明确标注）
```

**已识别的关键缺失主控**：
- `byTab` / `byFilePath` 数据模型无专属主控文档（仅 A-ENG-X-T-04_diffstore设计.md 被 A-DE-M-D-01 引用，需确认是否 Active）
- `DiffRetryController` 的状态机规则无专属主控文档（仅 A-DE-M-T-01 §6 有部分设计）
- `contentBlocks` vs `toolCalls` 两路渲染的过渡规则无专属文档

### 2.3 文档冲突点清单

| 冲突编号 | 冲突描述 | 文档 A | 文档 B | 严重程度 |
|---------|---------|--------|--------|---------|
| DOC-C-01 | stage_complete 闭合条件不一致 | A-DE-M-D-01 DE-AGT-002：须"revision 已推进 + 无 constraint_failed/apply_failed 悬置" | A-AG-M-T-05 §2.3：只检查"所有 diff 终态 + 至少一个 accepted" | 高 |
| DOC-C-02 | execute_failed 路径矛盾 | A-DE-M-T-01 §6.3："任何层不得把失败直接映射为 expired" | A-DE-M-T-01 §6.6.1 注："门禁校验失败直接走 expired 路径" | 中（同文档内部） |
| DOC-C-03 | baseline 更新时机描述不一致 | 旧 CLAUDE.md（历史）写"set once per session" | 实际代码：每轮 sendMessage 覆盖；A-DE-M-T-02 §3.1 未明确写频率 | 低（旧文件，已注明） |
| DOC-C-04 | A-AG-M-T-04 无 Active 状态声明 | 文档头无「当前状态：Active」字段 | 同系列 DE / CORE / ATC 均有 | 低（元数据） |
| DOC-C-05 | 闭环判定落点描述 | A-AG-M-T-03 §9.3："闭环判定落在 diffStore.ts" | A-AG-M-T-05 / A-CORE-C-D-05："由 AgentTaskController + agentStore" | 中（历史表未更新） |

### 2.4 文档缺定义 / 描述盲区

| 盲区 | 现状 | 位置 |
|------|------|------|
| `byTab` 键实为 filePath 而非 tabId | 无任何文档明确说明这一命名反转 | A-ENG-X-T-04（未确认是否 Active）|
| `contentBlocks` vs `toolCalls` 共存规则 | 无过渡期规则文档 | 无 |
| `DiffRetryController` MAX_RETRY = 2 的设计依据 | 代码硬编码，无文档 | DiffRetryController.ts 第30行 |
| `positioningPath`（'Anchor'/'Resolver'/'Legacy'）与 `route_source` 的映射关系 | 无文档说明 | diff 协议文档未覆盖 |
| `FileDiffEntry` 与 `DiffEntry` 字段命名差异（下划线 vs 驼峰）的设计意图 | 无文档解释 | 无 |
| `template` 引用被 context_manager 过滤的设计意图 | 代码注释无，文档无明确说明 | referenceProtocolAdapter.ts |
| `MEMORY` 引用名称模糊搜索兜底 | A-AST-M-T-07 未覆盖此场景 | referenceProtocolAdapter.ts |

---

## 3. 对话编辑主链检查

### 3.1 真实主链图

```
sendMessage（agent mode）
  │
  ├─ [A] 已打开文档编辑链（主链 A）
  │   chatStore → invoke('ai_chat_stream')
  │   → context_manager（4+层 prompt）
  │   → provider.chat_stream（DeepSeek）
  │   → tool_call: edit_current_editor_document
  │   → tool_service.resolve() → ToolResult.data.diffs[]（不写 DB）
  │   → emit("ai-chat-stream", {tool_call, result})
  │   → ChatPanel → addContentBlock
  │   → ChatMessages → contentBlocks 路径 → DiffCard
  │   → 用户 accept: DiffActionService.acceptDiff
  │     → buildAcceptReadRow（4 道门禁）
  │     → applyDiffReplaceInEditor
  │     → diffStore.acceptDiff（byTab）
  │     → editorStore.updateTabContent → documentRevision++
  │     → AgentTaskController.checkAndAdvanceStage
  │       → 有 accepted → stage_complete
  │       → 全 rejected/expired → forceInvalidate
  │
  └─ [B] 未打开文档修改链（主链 B）
      → tool_call: update_file
      → tool_service → diff_engine → workspace_db.insert_pending_diffs（写 DB）
      → ToolResult.data.pending_diffs[]
      → 前端 diffStore.setFilePathDiffs（byFilePath）
      → ToolCallCard / PendingDiffPanel → FileDiffCard
      → 用户 accept: DiffActionService.acceptFileDiffs
        → invoke('accept_file_diffs') → 逆序写盘 → timeline node
        → AgentTaskController.handleFileDiffResolution
          → 有 accepted → stage_complete
          → 全 rejected → forceInvalidate
```

### 3.2 所有分叉表

| 分叉编号 | 分叉名称 | 入口 | 路径 A（现行主链） | 路径 B（旧/兼容/旁路） | 是否合理并存 | 风险 |
|---------|---------|------|-------------------|----------------------|------------|------|
| DE-F-01 | edit_current_editor_document vs update_file | tool_service.rs match 分支 | edit_current_editor_document → 不写 DB，byTab 路径 | update_file → 写 DB，byFilePath 路径 | ✅ 合理（两种场景） | AI 错误选工具 → 状态分叉 |
| DE-F-02 | contentBlocks vs toolCalls 渲染路径 | ChatMessages.tsx `contentBlocks?.length > 0` | contentBlocks → DiffCard（新路径） | toolCalls → ToolCallCard（旧路径） | ⛔ 不合理继续并存 | 同一工具结果可能走不同 UI 路径，accept 逻辑不一致 |
| DE-F-03 | DiffCard 渲染路径（byTab 来源） | ChatMessages 和 ToolCallCard 各有 DiffCard 渲染 | ChatMessages → contentBlocks → DiffCard | ToolCallCard → update_file → DiffCard（resolve 后） | ⚠️ 部分合理 | 同文件 diff 可能在两处同时展示 |
| DE-F-04 | AgentTaskController vs ChatMessages useEffect stage 推进 | agentStore.setStageState | AgentTaskController.checkAndAdvanceStage → stage_complete/invalidated | ChatMessages useEffect → review_ready/awaiting_user_review | ⛔ 越权 | stage 提前/重复推进；review_ready 后可能卡死 |
| DE-F-05 | DiffActionService vs 组件直接操作 diffStore | ToolCallCard.tsx 约437行/508行 | DiffActionService.rejectDiff | diffStore.removeFileDiffEntry 直接调用 | ⛔ 越权 | AgentTaskController 不被通知；stage 推进漏触发 |
| DE-F-06 | DiffRetryController 重试 vs 直接 expired | buildAcceptReadRow 失败时 | DiffRetryController 入队（E_APPLY_FAILED） | 门禁失败直接 expired（revision/snapshot 不匹配） | ✅ 合理（不同原因不同路径） | 但 MAX_RETRY=2 无文档依据 |
| DE-F-07 | WorkPlanCard sendMessage 确认 vs AgentTask 正式推进 | WorkPlanCard 点击"开始执行" | AgentTask 状态机推进（正式路径） | sendMessage('好的，开始执行')（兼容/旁路） | ⛔ 兼容链，非正式 | 确认不经 AgentTaskController；task state 未关联 |
| DE-F-08 | resolveAuthorization 直接 invoke 工具 | ChatMessages.tsx resolveAuthorization | 正常 ai_chat_stream 工具调用链 | 直接 invoke('execute_tool_with_retry') | ⚠️ 特殊场景 | 不经 task progress 分析；不产生 NEXT_ACTION |
| DE-F-09 | acceptAll 批量接受 vs 单条 acceptDiff | DiffAllActionsBar | DiffActionService.acceptAll | 同一底层逻辑，但 updateTabContent 时序不同 | ⚠️ 潜在 | 多次 revision++ 可能过早 expire 其他 pending diff |

### 3.3 状态推进主体表

| 状态 | 文档规定的唯一合法推进主体 | 实际代码中的推进方 | 越权方 |
|------|--------------------------|------------------|--------|
| `draft` | chatStore.sendMessage | chatStore.sendMessage | 无 |
| `structured` | 未明确定义（过渡态） | ChatMessages useEffect | — |
| `candidate_ready` | 未明确定义（过渡态） | ChatMessages useEffect | — |
| `review_ready` | 应为 AgentTaskController | **ChatMessages useEffect**（越权） | ChatMessages.tsx 167-207行 |
| `stage_complete` | AgentTaskController | AgentTaskController.checkAndAdvanceStage | 无直接越权；但前置 review_ready 已被越权写 |
| `invalidated` | AgentTaskController | AgentTaskController.forceInvalidate；markAgentInvalidated | markAgentInvalidated 直接写（通过 agentShadowLifecycle），但仅在 verification 失败时调用 |
| `verification failed` | 自动门禁 | markVerificationFailed（agentShadowLifecycle） | 无越权（仅写 verification 字段） |
| `confirmation: awaiting_user_review` | 未明确定义 | **ChatMessages useEffect**（越权） | ChatMessages.tsx 203-206行 |
| `confirmation: all_diffs_resolved` | AgentTaskController | AgentTaskController.checkAndAdvanceStage | 无越权 |

### 3.4 协议字段表（DiffEntry vs ToolResult.data）

| 字段 | DiffEntry（前端） | ToolResult.data.diffs[0]（后端） | 是否一致 |
|------|-----------------|--------------------------------|---------|
| `diffId` | ✅ | ✅ | ✅ |
| `startBlockId/endBlockId` | ✅ | ✅ | ✅ |
| `startOffset/endOffset` | ✅ | ✅ | ✅ |
| `originalText/newText` | ✅ | ✅ | ✅ |
| `type` | ✅ | ✅ | ✅ |
| `diffType` | ✅（camelCase） | ✅（snake_case diff_type） | ⚠️ 命名风格差异 |
| `route_source` | `positioningPath`（'Anchor'/'Resolver'/'Legacy'） | `route_source`（'selection'/'reference'/'block_search'等） | ⛔ 两套命名，语义不完全对应 |
| `new_content`（ToolResult） | 无此字段 | = 当前 HTML（非修改后） | ⛔ 语义误导（已知污染点） |
| `documentRevision` | ✅ | ✅ | ✅ |
| `baselineId` | ✅ | ✅ | ✅ |
| `executionExposure` | ✅ | ✅（error_code / execution_exposure） | ⚠️ 字段映射需确认 |

### 3.5 旧逻辑 / 兼容逻辑 / 伪逻辑清单

| 项目 | 类型 | 位置 | 是否仍在主链生效 |
|------|------|------|----------------|
| ToolCallCard 的 edit_current_editor_document UI | 废弃但保留 | ToolCallCard.tsx 205行/278行/541行 | **保留代码，handleExecute/handleConfirmDiff 直接返回错误** |
| WorkPlanCard 确认流程 | 兼容链（非正式 agent plan） | ChatMessages.tsx 885-910行 | **仍在渲染；用 sendMessage 确认** |
| toolCalls 渲染路径 | 兼容链 | ChatMessages.tsx 913-934行 | **旧消息仍走此路径** |
| GhostTextExtension.ts | 历史残留 | src/ TipTap 扩展 | 待 AutoCompletePopover 实装后删 |
| DiffHighlightExtension.ts | 历史残留 | src/ TipTap 扩展 | 待迁移 |
| displayContent 字段（ChatMessage） | @deprecated | chatStore.ts | 部分路径仍写入 |
| `[TOOL_RESULTS]` 前缀过滤 | 旧格式兼容 | ai_commands.rs / chatStore.sendMessage | **仍在主链过滤逻辑中生效** |
| TruncationStrategy 其他枚举 | 未实现 | context_manager.rs 1363-1383行 | 声明存在但回退到 truncate_messages(10) |

---

## 4. 引用系统主链检查

### 4.1 引用对象模型图

```
用户操作                    前端对象                  IPC 协议                    后端对象
─────────────────────────────────────────────────────────────────────────────────────────
@文件                  FileReference              {type, source, content}    ReferenceInfo
                       {path, name, content?}                                {ref_type, source, content}
@文件片段              TextReference              {type, source, content,    ReferenceInfo
（选区）               {content, sourceFile,       textReference:             {ref_type, source, content,
                        textReference?:           {startBlockId,              text_reference: TextReferenceAnchorInfo}
                        {startBlockId,             startOffset,
                         startOffset,             endBlockId,
                         endBlockId,              endOffset}}
                         endOffset}}
@记忆库                MemoryReference            {type, source, content}    ReferenceInfo
                       {memoryId, name, items?}   items拼接字符串              {ref_type, source, content}
                                                   无items时name模糊搜索兜底
@知识库                KnowledgeBaseReference     {type, source, content,    ReferenceInfo
                       {kbId, kbName,              knowledgeBaseId,           {ref_type, source, content,
                        injectionSlices?,          knowledgeEntryId?}          knowledge_base_id...}
                        queryMetadata?}
@模板                  TemplateReference          {type, templateType}       ❌ context_manager 过滤掉
                                                                              （不进入 ReferenceInfo）
选区（编辑器）          不存在 referenceStore 对象  直接作为独立参数传入 IPC    直接参数：selectedText,
                                                   selectionStart/EndBlockId  selection_start_block_id等
```

### 4.2 输入来源 → 注入对象 → 执行对象的链路图

```
输入来源（UI）
  ├─ @file：ChatInput → referenceStore.addReference（FileReference）
  ├─ @file片段：ChatInput → referenceStore.addReference（TextReference，含textReference四元组）
  ├─ 编辑器选区（当前文档）：editorStore selection → chatStore.sendMessage 直接读取
  ├─ @记忆库：ChatInput → referenceStore.addReference（MemoryReference）
  ├─ @知识库：ChatInput → referenceStore.addReference（KnowledgeBaseReference）
  └─ @模板：ChatInput → referenceStore.addReference（TemplateReference）

                    ↓ chatStore.sendMessage

注入对象（IPC 参数）
  ├─ references[]：referenceStore → buildReferencesForProtocol → ReferenceProtocol[]
  │   （TextReference.textReference 保留四元组；File无内容时空content）
  ├─ currentEditorContent：positioningCtx.L（L4 层，当前文档全文）
  ├─ selectedText：editor.state.selection 文本
  ├─ selectionStart/EndBlockId + Offset：选区块锚点
  ├─ currentFile：当前文件路径
  └─ 回退逻辑：无选区 + 有精确TextReference → textReference四元组回填选区参数，selectedText=null

                    ↓ ai_chat_stream（后端）

执行对象（后端）
  ├─ L4 fact：build_context_prompt（currentFile + currentEditorContent + 选区/光标 + 块列表）
  │   ——不依赖 references，直接参数
  ├─ L5 constraint：build_reference_prompt（references → ReferenceInfo[]）
  │   TextReference：有 text_reference 则输出 Position 四元组；否则 line-level
  │   FileReference：输出 Source+Content 或提示用 read_file
  │   KB：输出 source+content（injectionSlices 或检索结果）
  │   ⚠️ Memory 无 items：名称模糊搜索（searchMemories，5条）→ 字符串注入
  └─ L6/L7 augmentation：记忆库 + 知识库自动检索（separate from references）
```

### 4.3 所有分叉表

| 分叉编号 | 分叉名称 | 路径 A | 路径 B | 风险 |
|---------|---------|--------|--------|------|
| REF-F-01 | 选区 vs TextReference 互为回退 | 编辑器选区直接读取（精确 PM position） | 无选区时用 TextReference 四元组回填（零搜索路径） | ⚠️ 回退时 selectedText=null，route_source=reference；仅有四元组的 TextRef 作为零搜索输入 |
| REF-F-02 | 当前文档隐式上下文 vs FileReference | L4 fact 直接注入（不经 referenceStore） | 当前文件也可能在 referenceStore 作为 FileReference | ⚠️ 后端会追加空 content 的 File 引用防重复，但 isCurrentFileRef 过滤可能漏边缘情况 |
| REF-F-03 | MEMORY 精确查询 vs 模糊搜索兜底 | memoryId 精确查（有 items） | searchMemories(name, 5)（无 items，模糊兜底） | ⛔ 用户精确引用记忆库，执行时降级为名称模糊搜索 |
| REF-F-04 | KB 显式引用 vs 自动检索 | injectionSlices（显式预取切片） | queryKnowledgeBase（检索执行） | ⚠️ 有 explicit_knowledge_suppression 抑制规则，但实际抑制效果需逐条验证 |
| REF-F-05 | Template 引用 vs 工作流执行 | context_manager 过滤掉（不进 ReferenceInfo） | 模板运行时单独编译链 | ⚠️ 过滤逻辑无注释，消费方需明确知道 template 不走引用注入链 |
| REF-F-06 | 精确四元组定位 vs line-level 定位 | TextReference 含 textReference（精确） | TextReference 无 textReference（line-level 字符串注入） | ⛔ 精确引用 → 精确结构化；无四元组引用 → 退化为字符串（定位精度丢失） |

### 4.4 丢结构 / 丢位置 / 丢路径的具体点

| 问题点 | 位置 | 退化描述 |
|--------|------|---------|
| TextReference 无 textReference 时退化 | build_reference_prompt | 精确字符级 → line-level 全文字符串 |
| MEMORY 引用无 items 时退化 | referenceProtocolAdapter.ts MEMORY case | 精确记忆库条目 → 名称模糊搜索 5 条结果字符串 |
| KB 引用无 injectionSlices 时退化 | referenceProtocolAdapter.ts KB case | 预取切片 → 实时检索执行（query + intent + mode） |
| Template 引用被过滤 | frontend_ref_to_reference_info（context_manager.rs） | 模板引用 → 不进入 prompt 注入链（单独路径） |
| knowledgeRetrievalMode 未映射到 ReferenceInfo | ai_commands.rs 反序列化 | IPC 字段 _knowledge_retrieval_mode → 不进 ReferenceInfo → 检索行为可能不受用户指定控制 |
| editTarget 字段仅用于回退逻辑 | ReferenceFromFrontend | 用于 extract_reference_anchor_for_zero_search；不进 ReferenceInfo |
| TextReference.startBlockId 等 @deprecated 字段 | src/types/reference.ts | 旧 blockId 字段标 @deprecated，仍保留，消费方行为不确定 |

### 4.5 标签系统现状与问题

- **ChatInput 展示的 @mention 标签**：使用 `displayText` 或 `fileName`/`name` 字段（展示标签）
- **执行时用的对象**：`referenceStore` 中的完整 `Reference` 对象（含结构化位置信息）
- **两者是否绑定**：通过 `id` 关联，同一 add 操作同时创建展示标签和 store 对象
- **风险**：展示标签删除时是否同步清除 store 对象？`removeReference` 需由 mention 删除事件触发；若 mention 被文本覆盖而未触发 remove，store 中残留引用会进入下一轮请求

### 4.6 旧引用协议 / 新引用协议 / 兼容协议并存清单

| 协议 | 状态 | 位置 |
|------|------|------|
| `textReference`（四元组，新精确协议） | **主链** | TextReference.textReference / ReferenceInfo.text_reference |
| `editTarget`（旧回退协议） | **兼容链** | ReferenceFromFrontend.editTarget / extract_reference_anchor_for_zero_search |
| 旧 `startBlockId`/`endBlockId`/`blockId` 字段（直接在 TextReference 顶层） | **@deprecated** | src/types/reference.ts（仍保留，标注废弃） |
| `injectionSlices`（KB 预取切片，新协议） | **主链** | KnowledgeBaseReference.injectionSlices |
| `queryKnowledgeBase`（KB 实时检索，兼容） | **兼容链** | referenceProtocolAdapter.ts KB case |

---

## 5. 工作区 / 当前文档 / 工具执行边界检查

### 5.1 状态真源图

```
工作区路径真源链：
  fileStore.currentWorkspace（单一真源）
    ↓ sendMessage 时读取（每次 sendMessage 同步）
  chatStore tab.workspacePath（快照，每次 sendMessage 可更新）
    ↓ invoke 参数锁入
  ai_chat_stream 参数 workspace_path（请求级快照，整个 stream 不变）
    ↓ 传递给
  tool_service 执行时的 workspacePath（最终执行工作区）

当前文档真源链：
  editorStore.activeTabId（UI 焦点真源）
    ↓
  editorStore.tabs[activeTabId].editor（TipTap DOM 真源）
  editorStore.tabs[activeTabId].filePath（文件路径）
  editorStore.tabs[activeTabId].documentRevision（单调递增版本）
    ↓ sendMessage 时读取
  positioningCtx.L = editor.getHTML()（本轮 baseline 快照）
    ↓ 同时
  diffStore.setBaseline(filePath, L)
    ↓ invoke 参数
  ai_chat_stream 参数 currentEditorContent = L（本轮锁定值）
```

### 5.2 workspace / current document / target file / referenced file 边界图

| 概念 | 真源 | 更新时机 | 风险 |
|------|------|---------|------|
| 当前工作区 | `fileStore.currentWorkspace` | 用户手动切换（setCurrentWorkspace） | 已启动 stream 不受影响 |
| 当前活动文件 | `editorStore.activeTabId` → tab.filePath | 编辑器 tab 切换 | 不与 stream 关联 |
| 当前文档内容（L） | `positioningCtx.L` | 每次 sendMessage 时读 editor.getHTML() | 请求期间固定；用户编辑后下一轮才更新 |
| 目标文件（targetFile） | tool 调用参数 path | 每次 tool_call | AI 可能选择错误文件 |
| 已引用文件 | `referenceStore` FileReference | 用户 @引用时 | — |
| workspace_path（stream 内） | invoke 参数（快照） | 每次 sendMessage 时锁入 | ⛔ stream 期间不随 fileStore 变化 |

### 5.3 所有快照 / 缓存 / 派生值清单

| 快照/派生值 | 来源真源 | 生成时机 | 失效机制 |
|-----------|---------|---------|---------|
| `positioningCtx.L` | editorStore.editor | 每次 sendMessage | 下一轮 sendMessage 覆盖 |
| `chatStore tab.workspacePath` | fileStore.currentWorkspace | sendMessage 时 bindToWorkspace 或初始化 | 下次 sendMessage 时修正 |
| `file_cache.cached_content` | 文件系统 + Pandoc/编辑器 | save 后 sync_workspace_file_cache_after_save | mtime 变化 → open_file_with_cache 重新生成 |
| `diffStore.byTab.baseline` | editor.getHTML() | setBaseline（sendMessage 时） | 下次 sendMessage 覆盖 |
| `documentRevision` | 编辑行为 | updateTabContent 触发 +1 | 无回退机制 |
| `ai_chat_stream 参数` | 多个真源的快照 | invoke 时 | 整个 stream 生命周期固定 |
| `agentStore runtimesByTab` | sendMessage 创建 | session-only | app 重启清空 |

### 5.4 旧 workspace 泄漏的可能链路

**链路 1：stream 期间切换工作区**
```
用户打开工作区 A → sendMessage（workspacePath=A 锁入 stream）
→ 用户在 stream 运行中切换到工作区 B（fileStore.currentWorkspace=B）
→ 文件树显示 B 的文件
→ AI 执行工具（read_file/create_file/update_file）仍使用 workspacePath=A
→ 工具操作旧工作区文件
```
代码证据：`ai_commands.rs` 约1377-1385行（无 workspacePath 时用 watcher 工作区）；`tool_service.rs` 使用请求参数中的 `workspace_path`。

**链路 2：tab 残留旧 workspacePath**
```
用户在工作区 A 的 chat tab 发了消息（tab.workspacePath=A）
→ 切换到工作区 B
→ 不发新消息（tab.workspacePath 仍=A）
→ 下次 sendMessage 时 sendMessage 会修正（bindToWorkspace），但仍有时间窗口
```

**链路 3：workspace_path 为空时的后端回退**
```
前端发送 invoke 时 workspacePath=null
→ ai_chat_stream 后端：workspace_path 取 watcher.workspace 或 current_dir
→ 该值可能与 fileStore.currentWorkspace 不一致
```
代码证据：`ai_commands.rs` 约1377-1385行的 `workspace_path` 为空处理逻辑。

### 5.5 当前文档问题滑向检索的原因归类

| 场景 | 路径 | 原因类型 |
|------|------|---------|
| 知识库自动检索触发 | should_trigger_knowledge_retrieval 判断 → L7 augmentation | **规则判断问题**：抑制条件（explicit_knowledge_suppression、text_ref_granular_bonus 等）需逐条验证是否真正抑制 |
| 当前文档 L 过长 → 截断 | context_manager TruncationStrategy | **架构分层问题**：L4 事实层过大时被裁剪，AI 不得不依赖检索补全 |
| FileReference 无 content → 提示用 read_file | build_reference_prompt | **协议问题**：文件引用未预取内容，注入的只是路径，AI 需主动读文件 |
| TextReference 无 textReference → line-level 字符串 | 同上 | **精度退化问题**：结构化输入变字符串，AI 定位依赖字符串匹配 |

---

## 6. 危险机制清单

### 6.1 fallback / 兜底

| 机制 | 位置 | 是否污染主链 |
|------|------|------------|
| MEMORY 引用名称模糊搜索兜底 | referenceProtocolAdapter.ts MEMORY case | ⛔ 是（精确引用 → 模糊检索） |
| KB 无 injectionSlices 时实时检索兜底 | referenceProtocolAdapter.ts KB case | ⚠️ 部分（有显式引用但无预取时） |
| workspace_path 为空时用 watcher/cwd | ai_commands.rs 约1377行 | ⛔ 是（可能操作错误工作区） |
| TruncationStrategy 枚举其他值回退 truncate(10) | context_manager.rs 1363行 | ⚠️ 功能未完整实现，静默降级 |
| blockRangeToPMRange 失败时 mappedFrom/mappedTo 回退 | diffStore.ts buildAcceptReadRow | ✅ 合理门禁 |
| FileDiff 无法 resolve 时 resolveUnmapped=true 仍可整批确认 | diffStore.resolveFilePathDiffs | ⚠️ 允许用户确认未精确定位的 diff |

### 6.2 deprecated / 旧链仍在主链生效

| 机制 | 位置 | 影响 |
|------|------|------|
| TextReference 顶层旧 blockId 字段（@deprecated） | types/reference.ts | 消费方行为不确定（是否仍有代码读取旧字段？） |
| displayContent 字段（@deprecated） | chatStore.ts ChatMessage | 部分路径仍写入，可能与 displayNodes 产生矛盾 |
| [TOOL_RESULTS] 前缀过滤 | ai_commands.rs / chatStore.sendMessage | 旧格式未清理，过滤逻辑仍在主链生效 |
| editTarget 兼容字段 | ReferenceFromFrontend | 旧回退协议仍在使用 |

### 6.3 UI 越权 / store 越权

| 越权 | 位置 | 覆盖的合法主体 |
|------|------|-------------|
| ChatMessages useEffect 直接 setStageState('review_ready') | ChatMessages.tsx 199-202行 | AgentTaskController |
| ChatMessages useEffect 直接 setConfirmation('awaiting_user_review') | ChatMessages.tsx 203-206行 | AgentTaskController |
| ToolCallCard 直接 diffStore.removeFileDiffEntry | ToolCallCard.tsx 437行、508行 | DiffActionService |
| AgentShadowStateSummary 通过 templateService 直接 setWorkflowExecution | AgentShadowStateSummary.tsx | AgentTaskController |
| DiffAllActionsBar 直接 editorStore.updateTabContent | DiffAllActionsBar.tsx | DiffActionService 内部调用（重复） |

### 6.4 shadow 相关

| 机制 | 位置 | 风险 |
|------|------|------|
| shadow runtime 数据被 ChatMessages useEffect 用于推进 stage | ChatMessages.tsx 167-207行 | shadow runtime 不应是业务推进依据 |
| shadow runtime session-only，重启丢失 | agentStore runtimesByTab | 重启后 loadTasksFromDb 恢复 active task 但 stage/confirmation 状态需重建 |
| runtimeMode 从 shadow → active 仅在 workflowExecution 时 | agentStore.setWorkflowExecution | 正常 agent task 永远是 shadow mode |

### 6.5 只展示却反向定义业务状态

| 机制 | 位置 | 具体问题 |
|------|------|---------|
| hasRenderableCandidate 基于 contentBlocks（展示数据）推进 stage | ChatMessages.tsx 171-193行 | 用 UI 渲染数据（message.contentBlocks 工具结果）判断是否应进入 review_ready；而不是用 diffStore 状态 |
| WorkPlanCard 渲染决定 task 是否启动 | ChatMessages.tsx 885行 / WorkPlanCard.tsx | 工作计划卡片是否渲染影响 task 确认流程 |

### 6.6 旧链仍被主链消费

| 机制 | 位置 | 具体问题 |
|------|------|---------|
| contentBlocks 路径 DiffCard onAccept/onReject 通过 props | ChatMessages.tsx → DiffCard.tsx | DiffCard 不直接绑定 store，依赖父组件传入的回调；ChatMessages 中回调已正确调用 DiffActionService，但 ToolCallCard 路径仍有直接 store 调用 |
| byTab 键名误导 | diffStore.ts | 字段名 byTab 但键为 filePath，历史命名未修正 |

---

## 7. 收口建议

> 本节只做建议，不改代码。

### 7.1 必须优先收口的 5 个点

**P1：消除 ChatMessages.tsx 越权推进 stage**

- 删除 ChatMessages.tsx 167-207行的 useEffect
- 在 diffStore 写入完成后的合适位置（如 addDiff 或 setFilePathDiffs 后）触发 AgentTaskController.checkAndAdvanceStage 或新增 `checkForReviewReady` 方法
- 将 `review_ready` 和 `awaiting_user_review` 的写入权移交 AgentTaskController
- **关联文档**：A-AG-M-T-05、A-CORE-C-D-05 §6.7

**P2：收口 DiffActionService 为 Diff 操作唯一入口（删除 ToolCallCard 直接调 diffStore）**

- ToolCallCard.tsx 约437行：`diffStore.removeFileDiffEntry` 替换为 `DiffActionService.rejectDiff`
- ToolCallCard.tsx 约508行：同上
- 确保 AgentTaskController.checkAndAdvanceStage 在所有 reject 路径中都被调用
- **关联文档**：A-AG-M-T-05 §3；A-CORE-C-D-05 §6.6 规则7

**P3：统一 byTab / byFilePath 的 Agent 状态裁决入口**

- `AgentTaskController.checkAndAdvanceStage` 目前已处理两路，但 `handleFileDiffResolution` 与 `checkAndAdvanceStage` 的调用时序需确保不重复
- 明确 `byFilePath` 条目删除后是否总是触发 `handleFileDiffResolution`（当前：DiffActionService.acceptFileDiffs / rejectFileDiffs 调用后会触发）
- 补充文档：给 byTab / byFilePath 写独立的数据模型文档

**P4：修复 MEMORY 引用的模糊搜索兜底**

- referenceProtocolAdapter.ts MEMORY case：无 items 时应返回错误/空或要求重新加载，而不是名称模糊搜索
- 或明确文档化这是设计允许的降级行为，并在 A-AST-M-T-07 中补充
- **关联文档**：A-AST-M-T-07（当前无此场景规则）

**P5：修复 workspace_path 为空时的后端回退行为**

- ai_commands.rs 约1377行：workspace_path 为空时的处理逻辑应明确报错或拒绝，而不是静默使用 watcher/cwd
- 前端：sendMessage 时 workspace 为空应有明确错误提示而非静默
- **关联文档**：A-WS-M-D-01；A-CORE-C-D-02 workspace_path 定义

### 7.2 可以延后的点

- contentBlocks / toolCalls 双路径合并（需等 Phase 1 完成 ToolCallCard 完整废弃）
- getLogicalContent 接入主链（当前 positioningCtx.L 等效，无紧迫性）
- OpenAI provider tool-calling 修复（不影响 DeepSeek 主链）
- GhostTextExtension / DiffHighlightExtension 删除（Phase 1a 完成后）
- DiffRetryController MAX_RETRY 文档化（小风险）

### 7.3 先删什么

1. ChatMessages.tsx 167-207行的 useEffect（stage 越权推进，替换为正确路径后删）
2. ToolCallCard.tsx 中 edit_current_editor_document 的"禁用但保留"代码（handleExecute 205行、handleConfirmDiff 278行、渲染 541行三处）
3. WorkPlanCard 的 sendMessage 确认路径（替换为正式 AgentTask 确认路径后删）
4. ChatMessage.displayContent 字段的写入路径（@deprecated 清理）

### 7.4 先隔离什么

1. `[TOOL_RESULTS]` 前缀过滤逻辑：隔离为单独函数 `isLegacyInternalMessage`，便于后续删除
2. toolCalls 渲染路径：加明确注释标记"此路径仅用于旧消息展示，新消息不走此路径"
3. editTarget 兼容字段：在 ReferenceFromFrontend 中加 @deprecated 注释

### 7.5 先统一什么

1. `byTab` 键名：统一文档和代码理解（键是 filePath，不是 tabId）
2. DiffEntry.positioningPath vs ToolResult route_source：统一到 route_source 命名
3. FileDiffEntry 字段命名：下划线风格统一为驼峰（original_text → originalText）
4. stage_complete 闭合条件：A-DE-M-D-01 DE-AGT-002 与 A-AG-M-T-05 §2.3 的条件集合需对齐

### 7.6 哪些地方绝不能再继续叠加修补

1. **ChatMessages.tsx 不能再加任何 stage 相关的 useEffect**：所有 stage 推进必须走 AgentTaskController
2. **不能再在 UI 组件中直接调用 diffStore.acceptDiff / rejectDiff / removeFileDiffEntry**：必须经 DiffActionService
3. **不能再给 [NEXT_ACTION] / [TOOL_RESULTS] 字符串前缀机制扩展新语义**：应迁移到 provider-native tool result
4. **不能再给 ChatMessage 同时有 toolCalls 和 contentBlocks 的共存场景添加特殊处理**：应收口到 contentBlocks 唯一路径
5. **不能在 workspace 为空时用 watcher/cwd 兜底**：应明确报错，不能静默使用错误工作区

---

## 8. 必须回答的关键问题

### 8.1 对话编辑

**1. stage_complete 的唯一推进主体，现在在代码事实里到底是不是唯一？**

**不是唯一。** 正式路径：AgentTaskController.checkAndAdvanceStage（L202–165行）→ setStageState('stage_complete')。但存在越权路径：ChatMessages.tsx useEffect（167-207行）直接 setStageState('review_ready') + setConfirmation('awaiting_user_review')，推进了 stage_complete 的前置状态，绕过了 AgentTaskController 的裁决。`stage_complete` 本身当前无直接越权写入，但其前置 `review_ready` 已被越权。

**2. invalidated 是否已经脱离 UI / shadow runtime 越权？**

**基本脱离，但有间接路径。** `forceInvalidate` → `markAgentInvalidated`（agentShadowLifecycle.ts 72-93行）→ 直接写 setStageState('invalidated')。调用方：AgentTaskController.forceInvalidate（正式）+ agentStore.resetRuntimeAfterRestore（外部强制，合理）。无 UI 直接写 `invalidated`。但 markAgentInvalidated 是工具函数，任何模块都可以调用，无访问控制。

**3. accepted/rejected/expired/execute_failed 的语义是否已经统一？**

**基本统一，有残余问题。** accepted/rejected/expired 均为 DiffEntryStatus 枚举，语义清晰。execute_failed 是 DiffExecuteFailedEvent 内存对象，不是状态枚举，设计正确。残余问题：A-DE-M-T-01 §6.3（"不得直接映射为 expired"）与 §6.6.1（"门禁失败直接走 expired"）存在字面张力，需统一解释为"例外条款"。

**4. byTab 和 byFilePath 是不是两套并行状态机？**

**是的，两套并行。** byTab（DiffEntry，有完整状态字段）和 byFilePath（FileDiffEntry，无状态字段，存在即 pending）确实是两套并行的 diff 状态管理。AgentTaskController 跨两套查询状态，handleFileDiffResolution 依赖显式传入的 outcome 参数而非状态字段。这是架构层的并行，不是 bug，但增加了复杂度。

**5. 已打开文档和未打开文档的 diff 展示链，是否已经统一？**

**未统一。** 已打开：byTab → DiffCard（ChatMessages contentBlocks 路径）。未打开：byFilePath → FileDiffCard（ToolCallCard 或 PendingDiffPanel）。两条链的展示组件、接受路径、agent 推进方式均不同。尚无统一的展示层抽象。

**6. update_file 为什么还能绕开消息流 diff 语义？**

因为 update_file 走 workspace_db.pending_diffs（行级 diff，无 blockId），而消息流 diff 语义基于 DiffEntry（块级精准定位）。两套 diff 系统设计时就分离，update_file 对应未打开文件场景，edit_current_editor_document 对应已打开文件场景。问题在于：AI 可能选择错误工具，且无前端强制校验。

**7. execute_failed 到底是事件、状态、还是 UI 展示信号？实现是否一致？**

**实现是内存对象（TypeScript interface），文档设计为业务事件，UI 展示为 ExecutionExposure。** `DiffExecuteFailedEvent`（diffStore.ts 54-64行）是在 DiffActionService 中同步构造并传给 DiffRetryController 的内存对象。UI 展示通过 `ExecutionExposure`（diffStore.ts 77-88行）写入 DiffEntry，DiffCard 读取显示重试条。三者语义链是清晰的：事件→队列→展示信号，但文档（A-DE-M-T-01 §6.4）将其统称为"业务事件"，与代码的 interface 命名有轻微表述差异。

**8. 批量接受 / 批量拒绝 / 文件级接受 / 单卡接受 是否仍存在旁路？**

存在一处旁路：**ToolCallCard.tsx 的 removeFileDiffEntry 直调**（约437行、508行），拒绝 FileDiffCard 时不通过 DiffActionService，AgentTaskController 不被通知。其余三种（DiffActionService.acceptAll / rejectDiff / acceptFileDiffs / rejectFileDiffs）均通过 DiffActionService 路由。

### 8.2 引用系统

**1. @file(行) 最终在系统里到底是什么对象？**

`TextReference`（referenceStore），含 `content`（正文字符串）、`sourceFile`（路径）、`lineRange?`（行范围）、`textReference?`（四元组 blockId+offset）。有 textReference 时：后端 ReferenceInfo 保留四元组，prompt 输出精确 Position。无 textReference 时：退化为 line-level 全文字符串，仅 source 路径可用。**是否真正携带精确行信息取决于 UI 创建时是否写入 textReference 字段。**

**2. 当前文档选中内容引用，是否真正带着路径和详细位置信息走到了链路末端？**

**走到了，但有条件。** selectedText + selectionStartBlockId + selectionStartOffset + selectionEndBlockId + selectionEndOffset 均作为独立参数传入 invoke。后端 build_context_prompt 在 L4 层用这些参数构建精确选区描述。但 TextReference 无 textReference 时，引用退化为字符串，不携带块锚点。

**3. selection 与 reference 是同一对象模型的两种来源，还是两套系统？**

**两套系统，但有互为回退机制。** selection 来自编辑器 ProseMirror state，作为独立 IPC 参数传入。reference 来自 referenceStore，经 buildReferencesForProtocol 序列化。互为回退：无有效选区时，若有同文件精确 TextReference，则用其四元组回填选区参数（selectedText=null，route_source=reference）。这是设计允许的，但文档未说明此回退机制。

**4. current document implicit context 与 explicit reference 是否存在定义冲突？**

**存在重叠但已有处理机制。** 当前文档（L4）和显式 FILE 引用当前文件（L5）可能同时存在。isCurrentFileRef 过滤机制会在 buildReferencesForProtocol 中跳过与当前文件相同的 FILE/TEXT 引用，防止重复注入。后端也会追加空 content 的 current_file 占位引用。机制存在但边界不完全清晰，尤其是"相同文件"的判断可能有边缘情况。

**5. 引用标签是显示标签，还是执行标识，还是两者兼有？**

**两者兼有，但通过 id 关联，存在解绑风险。** ChatInput 中 mention 标签是 ProseMirror 节点，关联 referenceStore 中的对象（通过 id）。删除 mention 节点时应触发 removeReference。如果 mention 被非正常方式删除（如整段文本替换），store 中的引用可能残留，进入下一轮请求。

**6. 引用在 prompt 注入时是否丢失结构化信息？**

**部分丢失。** 保留：ref_type、source、content（字符串）、text_reference 四元组（仅 TEXT）、knowledge_base_id 等（KB）。丢失：knowledgeRetrievalMode（未映射到 ReferenceInfo）、editTarget（仅用于零搜索回退）、TEMPLATE（直接过滤）、TextReference 的 @deprecated 旧 blockId 字段。

**7. 引用对象在 tool 执行时是否还能精准服务定位？**

**仅 TEXT 引用（含有效 textReference）能精准服务 tool 定位。** 其他类型（FILE、KB 等）在 prompt 中以字符串形式存在，AI 需通过自然语言理解映射到工具参数。这是设计上的局限（tool 执行定位依赖 edit_current_editor_document 的 blockId 参数，不依赖引用对象）。

**8. 是否存在"精确引用输入，模糊检索执行"的逻辑污染？**

**存在，至少三处。** 1）MEMORY 引用无 items → 名称模糊搜索（5条结果）。2）KB 引用无 injectionSlices → 实时检索（intent+query+mode）。3）TextReference 无 textReference → line-level 字符串（丢失块锚点）。其中场景1最严重，因为用户明确选择了某个记忆库条目，但执行时可能检索到完全不同的记忆。

### 8.3 工作区边界

**1. 当前工作区的单一真源到底是谁？**

**fileStore.currentWorkspace**，这是单一真源。但注意：无 ACL，任何 UI 事件（QuickActions、WelcomeDialog、Cmd+O 快捷键等）均可调用 setCurrentWorkspace。无防护机制阻止 stream 运行中切换。

**2. 为什么会出现"UI 已切新工作区，但 agent 仍操作旧工作区"的链路可能？**

`ai_chat_stream` 调用时将 workspace_path 锁入请求参数，整个 stream 生命周期使用该固定值。fileStore.currentWorkspace 更新不会影响正在运行的 stream。此外，workspace_path 为空时，后端回退使用 watcher 工作区（可能与 UI 显示不一致）。这是已知设计问题，无禁止机制。

**3. chat tab 的 workspacePath 到底是不是危险快照？**

**是危险快照。** tab.workspacePath 在 createTab 时绑定 fileStore.currentWorkspace，在 sendMessage 时可能 bindToWorkspace 更新。但两次 sendMessage 之间，如果用户切换了工作区，tab.workspacePath 仍保留旧值。下次 sendMessage 会修正，但这个时间窗口内的 tab 状态是过时的。

**4. stream 生命周期内 workspace 切换是否被禁止/隔离？**

**既未禁止，也未隔离。** 没有任何机制阻止用户在 stream 运行时切换工作区，也没有机制在切换时发出警告或取消 stream。这是一个架构缺口，需要明确策略。

**5. 当前文档事实层 / workspace 文档层 / 知识增强层的边界是否清楚？**

**文档层定义清楚，实现层有抑制机制但未完全验证。** A-AST-M-T-07 定义了优先级和抑制规则。代码中有 explicit_knowledge_suppression、text_ref_granular_bonus 等抑制闸门。但这些闸门的具体触发条件和是否真正有效需要集成测试验证。

**6. 当前文档问题为什么还会滑向 workspace/knowledge 检索？**

三个原因：1）精确引用退化（无 textReference 的 TEXT 引用退化为字符串）；2）抑制闸门条件未完全覆盖所有场景（如 MEMORY 模糊搜索）；3）知识自动检索的触发阈值可能过低（should_trigger_knowledge_retrieval 的权重系数需实验验证）。

**7. 这是规则判断问题，还是架构分层问题？**

**两者都有。** 规则判断问题：MEMORY 兜底搜索（应改为报错）、KB 引用无预取时的降级策略需明确规则。架构分层问题：L4/L5/L6/L7 层的 token 预算分配无动态调整机制，L4 过大时只能截断，不能智能压缩。

---

## 《结构判断》

### 结论：B — 存在明显结构性问题，但仍可分阶段收口

**理由如下：**

**主链可识别，骨架是对的。** 三条主链（对话编辑、引用、工作区边界）均有可识别的主干路径，关键服务（DiffActionService、AgentTaskController、context_manager）的设计意图正确，主要接口存在。

**存在明显的结构性越权，但数量有限且位置明确。** 越权推进点集中在：ChatMessages.tsx useEffect（stage 越权）、ToolCallCard.tsx 两处（diff 操作越权）。这是有限的、可定位的越权，不是系统性的结构错误。

**并行路径（双路渲染、双轨 diff 池）是历史遗留，有收口路径。** contentBlocks/toolCalls 双路径是演进过程中的过渡态，不是设计错误；byTab/byFilePath 双轨对应不同场景，有设计合理性，但缺乏文档主控。

**协议退化是真实风险，但有局限范围。** 引用精度退化（MEMORY、KB、TextReference 无四元组）是具体的、可修复的问题点，不是全局性的协议设计错误。

**不构成 C 类的原因：** 主状态推进链路（AgentTaskController → agentStore → stage_complete/invalidated）设计正确且已实现；diff 操作唯一入口（DiffActionService）已建立；工作区真源（fileStore.currentWorkspace）清晰。这些骨架是对的。

**为什么不是 A 类：** ChatMessages useEffect 越权是结构性越权（不是 bug，是设计缺口），在修复前继续添加功能有积累风险；MEMORY 引用模糊搜索兜底会在不可预期时触发；workspace_path 为空的后端回退可能导致工具操作错误工作区。这些不是"收口型修复"，需要明确架构决策。

**建议优先级：** P1（ChatMessages stage 越权）> P2（DiffActionService 收口）> P5（workspace_path 空值处理）> P4（MEMORY 兜底）> P3（双轨 diff 文档化）。P1 和 P2 收口完成后，主链的单一推进主体约束才真正成立。
