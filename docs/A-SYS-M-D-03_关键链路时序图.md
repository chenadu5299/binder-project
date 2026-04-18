# 关键链路时序图

## 文档头

- 结构编码：`SYS-M-D-03`
- 文档属性：`运行时地图 / 时序层`
- 生成依据：代码事实
- 主索引：`A-SYS-M-D-01_当前实现运行时逻辑地图总览.md`
- 术语来源：`A-CORE-C-D-02_产品术语边界.md`

---

## 链路一：对话编辑主链（已打开文档）

**起点**：用户在 ChatInput 输入消息并发送  
**终点**：用户 accept/reject diff，diffStore 状态更新，agentStore 推进阶段  
**主链标记**：当前最完整的对话编辑闭环

```
用户              ChatInput        chatStore          后端(ai_chat_stream)     ChatPanel       ChatMessages      DiffActionService    agentStore
  │                  │                │                        │                   │                │                   │                │
  │── 输入文字+@引用 ──►│                │                        │                   │                │                   │                │
  │                  │── sendMessage ─►│                        │                   │                │                   │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │ 1. 构建 positioningCtx  │                   │                │                   │                │
  │                  │                │    (editor.getHTML()   │                   │                │                   │                │
  │                  │                │     = baseline L)      │                   │                │                   │                │
  │                  │                │ 2. setBaseline(fp, L)  │                   │                │                   │                │
  │                  │                │ 3. 过滤 messages:      │                   │                │                   │                │
  │                  │                │    排除[NEXT_ACTION]/  │                   │                │                   │                │
  │                  │                │    [TOOL_RESULTS]      │                   │                │                   │                │
  │                  │                │ 4. agent mode:         │                   │                │                   │                │
  │                  │                │    createShadowTask    │                   │                │                   │                │
  │                  │                │    setCurrentTask      │                   │                │                   │                │
  │                  │                │    setStageState('draft')                  │                │                   │                │
  │                  │                │── invoke('ai_chat_stream', {              │                │                   │                │
  │                  │                │    messages, currentEditorContent=L,      │                │                   │                │
  │                  │                │    documentRevision, enableTools,         │                │                   │                │
  │                  │                │    references, selectedText, ...}) ──────►│                │                   │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │ A. context_manager│                │                   │                │
  │                  │                │                        │    build_prompt_package:           │                   │                │
  │                  │                │                        │    [L1 governance]                 │                   │                │
  │                  │                │                        │    [L2 task state]                 │                   │                │
  │                  │                │                        │    [L4 fact: currentEditorContent] │                   │                │
  │                  │                │                        │    [L5 constraint: references]     │                   │                │
  │                  │                │                        │    [L6 memory augmentation]        │                   │                │
  │                  │                │                        │    [L7 knowledge augmentation]     │                   │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │ B. provider.chat_stream()          │                   │                │
  │                  │                │                        │    (DeepSeek 主链)                 │                   │                │
  │                  │                │                        │── emit("ai-chat-stream",          │                   │                │
  │                  │                │                        │    {chunk: "..."}) ──────────────►│                   │                │
  │                  │                │                        │                   │── appendToMessage / addContentBlock              │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │ C. 收到 tool_call:│                │                   │                │
  │                  │                │                        │    edit_current_editor_document    │                   │                │
  │                  │                │                        │    注入 current_content, baseline_id│               │                   │                │
  │                  │                │                        │── emit("ai-chat-stream",          │                   │                │
  │                  │                │                        │    {tool_call, status:"executing"})►│               │                   │                │
  │                  │                │                        │                   │── updateContentBlock(status: executing)          │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │ D. tool_service::resolve()        │                   │                │
  │                  │                │                        │    → 生成 DiffEntry:               │                   │                │
  │                  │                │                        │      diffId, startBlockId,        │                   │                │
  │                  │                │                        │      originalText, newText,       │                   │                │
  │                  │                │                        │      diffType, diff_area_id       │                   │                │
  │                  │                │                        │── emit("ai-chat-stream",          │                   │                │
  │                  │                │                        │    {tool_call, result: {diffs[]}})►│               │                   │                │
  │                  │                │                        │                   │── updateContentBlock(status: done, result)        │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │ E. 写入 role:"tool" 到 history    │                   │                │
  │                  │                │                        │    写入 role:"user" [NEXT_ACTION] │                   │                │
  │                  │                │                        │    继续下一轮 provider.chat_stream │                   │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │── emit({done:true})──────────────►│                   │                │
  │                  │                │                        │                   │── setMessageLoading(false)         │                │
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │                   │                │ 渲染 DiffCard     │                │
  │                  │                │                        │                   │                │ (contentBlocks 路径):             │                │
  │                  │                │                        │                   │                │ getDisplayDiffs(fp, toolCallId)    │                │
  │                  │                │                        │                   │                │                   │                │
  │── 点击 Accept ───────────────────────────────────────────────────────────────────────────────►│                │                   │                │
  │                  │                │                        │                   │                │── DiffActionService.acceptDiff(fp, diffId, editor)──►│
  │                  │                │                        │                   │                │                   │ buildAcceptReadRow
  │                  │                │                        │                   │                │                   │ → 验证 originalText
  │                  │                │                        │                   │                │                   │ → 解析 PM range
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │                   │                │                   │ applyDiffReplaceInEditor
  │                  │                │                        │                   │                │                   │                │
  │                  │                │                        │                   │                │                   │── diffStore.acceptDiff(fp, diffId)
  │                  │                │                        │                   │                │                   │── editorStore.updateTabContent(editor.getHTML())
  │                  │                │                        │                   │                │                   │   → documentRevision++
  │                  │                │                        │                   │                │                   │   → expirePendingForStaleRevision
  │                  │                │                        │                   │                │                   │── AgentTaskController.checkAndAdvanceStage ──►│
  │                  │                │                        │                   │                │                   │                │ 所有 diff 无 pending
  │                  │                │                        │                   │                │                   │                │ → 有 accepted → stage_complete
  │                  │                │                        │                   │                │                   │                │ → 写 agentStore.setStageState
```

**关键分叉**：
- **F1**：`contentBlocks?.length > 0` → DiffCard 路径；否则 → ToolCallCard 路径（旧）
- **F2**：`edit_current_editor_document` 失败（resolve 错误）→ `execution_exposure` → DiffRetryController
- **F3**：`buildAcceptReadRow` 失败 → status: expired → markVerificationFailed → AgentTaskController.checkAndAdvanceStage（可能 → invalidated）

**主链实现风险**：`ChatMessages.tsx` useEffect 直接推进 `agentStore.setStageState`（UI 组件越权写 stage），与 `AgentTaskController.checkAndAdvanceStage` 存在双重推进可能。

---

## 链路二：打开文档编辑链（open_file_with_cache）

**起点**：用户打开文件（或 AI 打开文件准备编辑）  
**终点**：编辑器加载内容，blockId 稳定，可参与 diff 定位

```
用户/AI               documentService          workspace_commands        canonical_html           TipTap Editor
    │                       │                        │                        │                        │
    │── 打开文件 ────────────►│                        │                        │                        │
    │                       │── invoke('open_file_with_cache', {fp, ws}) ─────►│                        │
    │                       │                        │                        │                        │
    │                       │                        │ 1. mtime 检查:          │                        │
    │                       │                        │    file_cache[fp].mtime │                        │
    │                       │                        │    == fs.mtime?         │                        │
    │                       │                        │                        │                        │
    │                       │                        │ 缓存命中路径（md/txt）:   │                        │
    │                       │                        │── 返回 cached_content ──────────────────────────►│
    │                       │                        │   (TipTap HTML, 含 data-block-id)                │
    │                       │                        │   blockId 跨会话保持                              │
    │                       │                        │                        │                        │
    │                       │                        │ 缓存未命中/DOCX路径:     │                        │
    │                       │                        │── Pandoc 转换 ──────────►│                        │
    │                       │                        │   生成 canonical HTML  │                        │
    │                       │                        │   注入新 blockId        │                        │
    │                       │                        │   写入 file_cache       │                        │
    │                       │                        │── 返回 content ─────────────────────────────────►│
    │                       │                        │   + pending_diffs[] ──────────────────────────────►│（前端恢复 diff 展示）
    │                       │                        │   + routeScene(4/5/6)  │                        │
    │                       │                        │   + gates              │                        │
    │                       │                        │                        │                        │
    │                       │                        │                        │                        │ editorStore.addTab()
    │                       │                        │                        │                        │ 设置 content
    │                       │                        │                        │                        │ documentRevision = 1
    │                       │                        │                        │                        │
    │── 保存文件 ────────────►│── invoke('sync_workspace_file_cache_after_save') ──────────────────────►│
    │                       │                        │ 写 file_cache(content, mtime)                    │
```

**blockId 稳定性规则（来自代码）**：
- **md/txt**：每次 save 后写 file_cache；重开 tab 时 cache 命中 → 旧 blockId 保持
- **DOCX**：每次 open 重新 Pandoc 解析，blockId 重新生成（无法保持跨会话稳定）
- **应用关闭**：`MainLayout.tsx` onCloseRequested 若有 pending diff 弹确认（重启后 blockId 会变，diff 失效）
- **外部文件修改**：`EditorPanel.tsx` 每 5s mtime 检测 → `ExternalModificationDialog` → 加载外部更改 → `markExpired` 所有 pending diff

---

## 链路三：未打开文档修改链（update_file）

**起点**：AI 调用 `update_file` 工具修改未在编辑器中打开的文件  
**终点**：用户在 PendingDiffPanel 或 ToolCallCard 中 accept/reject，写盘或丢弃

```
AI tool_call          tool_service           workspace_db         前端 diffStore         PendingDiffPanel / ToolCallCard
     │                     │                     │                      │                          │
     │── update_file ───── ►│                     │                      │                          │
     │   {path, content}   │                     │                      │                          │
     │                     │ 1. 判断 use_diff:    │                      │                          │
     │                     │    文档型扩展名强制  │                      │                          │
     │                     │    use_diff=true     │                      │                          │
     │                     │                     │                      │                          │
     │                     │ 2. 读 old_content:   │                      │                          │
     │                     │    file_cache 或磁盘 │                      │                          │
     │                     │                     │                      │                          │
     │                     │ 3. diff_engine       │                      │                          │
     │                     │    generate_pending_diffs_for_file_type     │                          │
     │                     │── insert_pending_diffs ──────────────────► │                          │
     │                     │   {file_path, diff_index,                   │                          │
     │                     │    original_text, new_text,                 │                          │
     │                     │    para_index, diff_type}                   │                          │
     │                     │                     │                      │                          │
     │── ToolResult ────────►（emit to frontend）  │                      │                          │
     │   {success:true,    │                     │                      │                          │
     │    written:false,   │                     │                      │                          │
     │    pending_diffs[]}                        │                      │                          │
     │                     │                     │                      │                          │
     │                     │                     │── 前端接收 result:    │                          │
     │                     │                     │   setFilePathDiffs(fp, entries) ──────────────► │
     │                     │                     │                      │ byFilePath[fp] = entries  │
     │                     │                     │                      │                          │
     │                     │                     │                      │── 展示 FileDiffCard / DiffCard（若 editor 已打开则 resolve）
     │                     │                     │                      │                          │
     用户 accept ───────────────────────────────────────────────────────────────────────────────► │
                                                                         │── DiffActionService.acceptFileDiffs(fp, ws)
                                                                         │    → diffStore.acceptFileDiffs(fp, ws)
                                                                         │    → invoke('accept_file_diffs', {fp, ws, indices})
                                                                         │         后端逆序写盘
                                                                         │         record_file_content_timeline_node
                                                                         │    → AgentTaskController.handleFileDiffResolution({outcome:'accepted'})
```

**与链路一的主要区别**：
- `update_file` 写 workspace_db.pending_diffs；`edit_current_editor_document` 不写
- 接受后写盘（`accept_file_diffs`）；`edit_current_editor_document` 接受只改 TipTap DOM
- diff 定位精度：`para_index`（行级）vs `startBlockId/startOffset`（块级精准定位）

**最大风险**：`FileDiffEntry` 中无 `status` 字段，byFilePath 条目存在即为 pending；`AgentTaskController` 需靠 `hasFileDiffsForAgentTask` 轮询检测剩余状态，与 byTab 路径的状态合并依赖 `outcome` 参数显式传入。

---

## 链路四：引用注入链

**起点**：用户在 ChatInput 中输入 `@` 创建引用  
**终点**：引用内容注入 AI prompt 的 `[L5 constraint]` 层

```
用户               ChatInput         referenceStore      chatStore.sendMessage     context_manager
  │                   │                   │                      │                      │
  │── 输入 @ ─────────►│                   │                      │                      │
  │                   │── 打开 MentionSelector               │                      │
  │── 选择引用对象 ────►│                   │                      │                      │
  │                   │── addReference(tabId, ref) ──────────►│                      │
  │                   │                   │ referencesByTab[tabId].push(ref)           │
  │                   │                   │                      │                      │
  │── 发送消息 ─────────►│── sendMessage ────────────────────────►│                      │
  │                   │                   │                      │                      │
  │                   │                   │                      │ 1. dynamic import referenceStore
  │                   │                   │                      │    getReferences(tabId)
  │                   │                   │                      │    (可选 validRefIds 过滤)
  │                   │                   │                      │                      │
  │                   │                   │                      │ 2. determineInjectionEditorTab:
  │                   │                   │                      │    FILE 引用找对应 editor tab
  │                   │                   │                      │                      │
  │                   │                   │                      │ 3. TextReference 四元组回退:
  │                   │                   │                      │    若无选区 + 有 TextRef → 用作零搜索输入
  │                   │                   │                      │                      │
  │                   │                   │                      │── invoke('ai_chat_stream', {
  │                   │                   │                      │    references: [...],
  │                   │                   │                      │    currentFile, selectedText,
  │                   │                   │                      │    currentEditorContent, ...})
  │                   │                   │                      │                      │
  │                   │                   │                      │                      │ build_prompt_package:
  │                   │                   │                      │                      │ [L5 constraint]:
  │                   │                   │                      │                      │   build_reference_prompt:
  │                   │                   │                      │                      │   "The user has referenced..."
  │                   │                   │                      │                      │   每条含: type, Source, Position?, Content
  │                   │                   │                      │                      │
  │                   │                   │                      │                      │   truncate_references_to_budget:
  │                   │                   │                      │                      │   按 token 预算裁剪
  │                   │                   │                      │                      │   优先裁"自动注入的 current_file"
```

**引用类型与注入方式**：

| 引用类型（ReferenceType） | 代码中 type 值 | 注入方式 | 备注 |
|--------------------------|----------------|---------|------|
| TEXT | `'text'` | 直接注入选区文本 + 四元组锚点 | 可作为零搜索输入 |
| FILE | `'file'` | 注入文件路径；无 content 时提示可用 `read_file` | |
| FOLDER | `'folder'` | 注入文件夹路径 | |
| IMAGE | `'image'` | 注入图片引用 | |
| TABLE | `'table'` | 注入表格内容 | |
| MEMORY | `'memory'` | 注入记忆条目 | |
| KNOWLEDGE_BASE | `'kb'` | 注入知识库条目 | |
| CHAT | `'chat'` | 注入聊天记录 | |
| LINK | `'link'` | 注入链接 | |
| TEMPLATE | `'template'` | 注入模板 | |

**不一致点**：`referenceStore` 有 `TEMPLATE` 类型，但在 context_manager 的 build_reference_prompt 中不一定有对应的消费分支（待验证）。

---

## 链路五：Agent/Task 状态推进链

**起点**：`sendMessage`（agent 模式）创建 shadow task  
**终点**：`stage_complete` 或 `invalidated` 写入 agentStore

```
chatStore.sendMessage     agentStore        AI执行链       DiffActionService     AgentTaskController
       │                     │                 │                  │                    │
       │ agent mode →        │                 │                  │                    │
       │── createShadowTaskRecord ─────────────►│                 │                    │
       │── setCurrentTask ───────────────────►│                  │                    │
       │── setStageState('draft') ───────────►│                  │                    │
       │── setVerification(pending) ─────────►│                  │                    │
       │── setConfirmation(pending) ─────────►│                  │                    │
       │── persistAgentTask（异步）            │                  │                    │
       │                     │                 │                  │                    │
       │── ai_chat_stream ────────────────────►│                  │                    │
       │                     │ emit tool_calls │                  │                    │
       │                     │                 │                  │                    │
       │                     │                 │ 工具执行结果      │                    │
       │                     │                 │── ContentBlock 渲染（ChatMessages）    │
       │                     │                 │                  │                    │
       │                     │ ⚠️ ChatMessages useEffect:         │                    │
       │                     │ stageState=='structured'+'candidate_ready'              │
       │                     │ + 有 update_file/edit 结果 →      │                    │
       │                     │ setStageState('review_ready') ←── UI 直接越权写        │
       │                     │ setConfirmation('awaiting_user_review')                 │
       │                     │                 │                  │                    │
       用户 accept/reject diff──────────────────────────────────►│                    │
                             │                 │                  │── checkAndAdvanceStage(agentTaskId, chatTabId)
                             │                 │                  │                    │
                             │                 │                  │ 查询所有 agentTaskId 的 DiffEntry：
                             │                 │                  │                    │ byTab + byFilePath
                             │                 │                  │                    │
                             │                 │                  │                    │ 有 pending？→ return（等待）
                             │                 │                  │                    │
                             │                 │                  │                    │ 无 pending：
                             │                 │                  │                    │   有 accepted → stage_complete：
                             │                 │                  │                    │   agentStore.setConfirmation(all_diffs_resolved)
                             │                 │                  │                    │   agentStore.setCurrentTask(lifecycle:completed)
                             │                 │                  │                    │   agentStore.setStageState(stage_complete)
                             │                 │                  │                    │
                             │                 │                  │                    │   全 rejected/expired → forceInvalidate:
                             │                 │                  │                    │   markAgentInvalidated
                             │                 │                  │                    │   → agentStore.setStageState(invalidated, reason)
```

**Shadow runtime 在链路中的位置**：
- 新建 tab → `agentStore.ensureRuntimeForTab` → `runtimeMode: 'shadow'`
- `sendMessage` 写入 shadow task，但 **不立即持久化**
- `persistAgentTask` 异步调 `invoke('persist_agent_task')` 写 workspace_db.agent_tasks
- `runtimeMode: 'active'` 只在有 workflow execution 时设置

**stage 推进的双重路径（越权问题）**：
- 正式路径：`DiffActionService` → `AgentTaskController.checkAndAdvanceStage` → `agentStore.setStageState`
- 旁路：`ChatMessages.tsx` useEffect 直接调 `agentStore.setStageState`（review_ready）和 `setConfirmation`（awaiting_user_review）

---

## 链路六：工作区切换链

**起点**：用户切换工作区（点击工作区切换按钮）  
**终点**：文件树刷新，chatStore 新建/绑定 tab，旧 tab 内的工具调用路径可能仍指向旧工作区

```
用户              MainLayout         fileStore         chatStore          agentStore          AI 执行（仍在运行的 stream）
  │                  │                  │                  │                  │                        │
  │── 切换工作区 ─────►│                  │                  │                  │                        │
  │                  │── setCurrentWorkspace(newPath) ──────►│                 │                        │
  │                  │                  │ mark_orphan_tab_memories_stale       │                        │
  │                  │                  │ startup_memory_maintenance           │                        │
  │                  │                  │                  │                  │                        │
  │                  │                  │── FileTree 刷新   │                  │                        │
  │                  │                  │                  │                  │                        │
  │                  │                  │                  │ sendMessage 里检测工作区:              │
  │                  │                  │                  │ runtimeWorkspace = fileStore.currentWorkspace
  │                  │                  │                  │ 若与 tab.workspacePath 不一致：        │
  │                  │                  │                  │ bindToWorkspace(tabId, newPath)        │
  │                  │                  │                  │                  │                        │
  │                  │                  │                  │ ⚠️ 已在运行的 ai_chat_stream:           │
  │                  │                  │                  │                  │ tabWorkspacePath 已在   │
  │                  │                  │                  │                  │ invoke 参数中锁定        │
  │                  │                  │                  │                  │ → 工具写入目标仍为旧工作区│
```

**已知"文件树已切换，agent 仍操作旧工作区"根因**：

`sendMessage` 在 `invoke('ai_chat_stream')` 时已将 `workspacePath` 锁入请求参数。切换工作区只更新 `fileStore.currentWorkspace`，不会中断正在运行的 stream。后端 tool_service 执行工具时使用的 `workspacePath` 来自原始请求，指向旧工作区。

**工作区路径的真源链**：
```
fileStore.currentWorkspace（单一真源）
  ↓ sendMessage 时读取
chatStore tab.workspacePath（派生 / 快照）
  ↓ invoke 参数
ai_chat_stream 参数 workspacePath（锁定值 / 请求级快照）
  ↓
tool_service 执行时的 workspace（请求快照，不随 fileStore 更新）
```

**当前代码中工作区状态同步的边界**：
- `fileStore.currentWorkspace` 是全局真源
- `chatStore tab.workspacePath` 只在 `sendMessage` 时同步（`bindToWorkspace`）
- **已在运行的请求不受工作区切换影响**（既是安全设计，也是边界风险）

---

## 链路七：内联辅助链（Cmd+K）

**起点**：用户在编辑器中选中文本，按 Cmd+K  
**终点**：AI 返回修改建议，用户 accept/ignore

```
用户            useInlineAssist        chatStore(参数构建)    ai_commands::ai_inline_assist
  │                  │                        │                        │
  │── Cmd+K ─────────►│                        │                        │
  │                  │ 读取 editor 选区        │                        │
  │                  │ 读取文档上下文          │                        │
  │                  │── invoke('ai_inline_assist', {
  │                  │    instruction,          │                        │
  │                  │    text: selectedText,   │                        │
  │                  │    context: docContext,  │                        │
  │                  │    messages: 历史消息}) ─────────────────────────►│
  │                  │                        │                        │ inline_assist:
  │                  │                        │                        │ 历史消息拼 context
  │                  │                        │                        │ → provider.inline_assist()
  │                  │                        │                        │ → JSON { kind:'edit'|'reply', text }
  │◄─────────────── 返回建议 ─────────────────────────────────────────────│
  │                  │ InlineAssistPanel 展示  │                        │
  │── Accept ─────────►│                        │                        │
  │                  │ 直接替换编辑器选区       │                        │
```

**与对话编辑主链的主要区别**：
- 无工具调用；无 diff 池；不经过 `DiffActionService`
- 直接在编辑器中替换（无 accept/reject 两步）
- 无 Agent task 状态推进

---

## 链路八：续写辅助链（Cmd+J）

**起点**：用户在编辑器光标位置按 Cmd+J  
**终点**：AutoCompletePopover 展示 3 条建议，用户选择或 Esc

```
用户          useAutoComplete          ai_commands::ai_autocomplete
  │                 │                          │
  │── Cmd+J ────────►│                          │
  │                 │ 读取光标前后上下文        │
  │                 │── invoke('ai_autocomplete', {
  │                 │    contextBefore,          │
  │                 │    contextAfter,           │
  │                 │    position,               │
  │                 │    editorState,            │
  │                 │    memoryItems}) ──────────►│
  │                 │                          │ autocomplete_enhanced:
  │                 │                          │ 按 "---" 切分 → take(3)
  │◄─── 返回建议[] ──────────────────────────────│
  │                 │ AutoCompletePopover 展示  │
  │── 选择建议 ──────►│                          │
  │                 │ 插入编辑器文本            │
```
