# Binder（合页）项目介绍

## 文档头

- 结构编码：`PROD-C-R-03`
- 文档属性：`项目总览 / 当前代码实现全景介绍`
- 主责模块：`PROD`
- 文档职责：`对 Binder 当前代码实现的整体介绍；当前能力边界与实现状态说明；当前模块结构、技术栈、运行方式、已知限制的统一说明；面向项目理解、协作接入与现状认知的入口文档`
- 直接承接：无
- 使用边界：`本文描述的内容均以当前代码实现为唯一事实来源。所有结论均可在当前代码库中直接核对。本文不定义协议细节，不替代各专题主控文档，不作为需求或规划依据`
- 变更要求：`修改本文前必须先核对相应代码实现，不得依据设计文档或需求文档判断当前事实；数据须重新统计代码库`

---

## 文档信息

- **版本**：v4.0
- **更新日期**：2026年4月
- **项目版本**：0.1.0（来源：`package.json` / `src-tauri/Cargo.toml`）
- **数据来源**：当前代码库直接统计与核对（2026-04）；所有模块状态均基于代码实现，不基于设计文档

---

## 一、项目概览

### 1.1 基本信息

| 项目 | 信息 |
|------|------|
| **项目名称** | Binder（合页） |
| **产品形态** | 跨平台桌面应用（Tauri 2 + React 18） |
| **应用定位** | 面向创作者与知识工作者的 AI 驱动文档编辑器 |
| **当前版本** | 0.1.0 |

### 1.2 当前代码已形成完整链路的能力

以下能力在当前代码库中均有前后端完整调用链，可确认为已实现：

1. **多格式文档编辑**：Markdown、HTML、TXT（TipTap 富文本直接编辑）；DOCX（经 Pandoc 转换后在 TipTap 中编辑，保存时转回 DOCX）
2. **三层 AI 辅助**：
   - 层次一：辅助续写（Cmd+J，`ai_autocomplete` → DeepSeek）
   - 层次二：局部修改（Cmd+K，`ai_inline_assist` → DeepSeek）
   - 层次三：对话编辑（右侧聊天面板，`ai_chat_stream`，两种用户可见模式：agent / chat）
3. **AI 工具调用链**：对话 agent 模式下 AI 可调用文件读取、创建、更新、编辑器编辑、搜索等工具（DeepSeek 和 OpenAI 均已实现 SSE tool_calls 解析）
4. **Diff 系统**：AI 编辑产生的变更以 DiffEntry 形式存入 diffStore（以 filePath 为键），用户逐条或批量接受/拒绝，接受操作逆序执行写盘
5. **Workspace 数据库**（`.binder/workspace.db`，SQLite）：含文件 HTML 快照（file_cache）、待处理 Diff（pending_diffs）、文件依赖（file_dependencies）、Agent 任务（agent_tasks）、Agent Artifact（agent_artifacts）
6. **Agent 任务跟踪**：前端 agentStore 维护每个聊天 Tab 的运行时状态（currentTask、stageState、verification、confirmation、artifacts）；后端写入 agent_tasks/agent_artifacts 表，推送 `ai-agent-stage-changed` 事件；前端监听并同步 shadow 状态
7. **多格式预览**：DOCX、Excel、CSV、PDF、图片、演示文稿、音视频、HTML
8. **全文搜索**：SQLite FTS5（`.binder/search.db`）
9. **记忆库**：`.binder/workspace.db` + `user_memory.db`，分层记忆检索、注入与生命周期治理
10. **图片处理**：插入、WebP 压缩、聊天图片保存

### 1.3 当前代码可见预留结构或未形成完整能力的部分

| 内容 | 当前状态 |
|------|--------|
| **Agent 显式 plan 阶段**（draft→structured 用户确认） | 代码中无此阶段逻辑，对话编辑直接从用户消息进入执行链 |
| **知识库**（query_knowledge_base） | 协议有定义，代码中无完整实现 |
| **模板库** | 代码中无实现 |
| **Excel / 演示文稿编辑** | 当前仅预览，无编辑能力 |
| **Anthropic / Gemini / Local 等 Provider** | 代码中仅有 DeepSeek 和 OpenAI 两个 Provider 实现 |
| **记忆库与 Layer2/3 AI 集成** | 续写提示词中有记忆注入逻辑；Layer3 对话编辑中记忆注入尚未形成完整对接 |

---

## 二、功能模块技术选型与实现状态

### 2.1 文档编辑模块

| 项目 | 技术选型 | 实现状态 | 说明 |
|------|----------|----------|------|
| **富文本引擎** | TipTap 3.11/3.13 + ProseMirror | ✅ 已实现 | StarterKit + Image、Link、Table、TaskList、TextStyle、Color、FontFamily、FontSize（自定义）、Underline、Subscript、Superscript、Highlight、TextAlign、Placeholder、CharacterCount |
| **分页模式** | tiptap-pagination-plus（file: 本地依赖，v3.0.5） | ✅ 已实现 | DOCX 编辑时 `layoutMode='page'`，A4 794×1123px，PageTopCaretExtension 处理光标 |
| **可编辑格式** | md / html / txt | ✅ 已实现 | TipTap 直接编辑；内容以 TipTap HTML 存储于 `file_cache` 保持 block ID |
| **DOCX 编辑** | Pandoc + TipTap | ✅ 已实现 | Pandoc DOCX→HTML，TipTap 编辑，Pandoc HTML→DOCX 保存；需 Pandoc 安装 |
| **保存** | documentService + Tauri | ✅ 已实现 | 文本 `write_file`；DOCX `save_docx`；保存后调用 `sync_workspace_file_cache_after_save` |
| **精确块定位** | BlockIdExtension | ✅ 已实现 | paragraph、heading、blockquote、codeBlock、listItem、tableCell 带 `data-block-id` UUID |
| **复制引用** | CopyReferenceExtension | ✅ 已实现 | 带 blockId + charOffset 四元组的精确文本引用 |
| **外部修改检测** | check_external_modification（5s 轮询） | ✅ 已实现 | ExternalModificationDialog 弹窗；选择加载后静默 expire 当前文件所有 pending diffs |

**DOCX 编辑完整流程**：
```
open_docx_for_edit → Pandoc DOCX→HTML → TipTap（layoutMode='page'）→ save_docx → Pandoc HTML→DOCX
```

**Tab 关闭/重开 Block ID 保持**：每次保存后 `sync_workspace_file_cache_after_save` 写入 `file_cache`；重开时 `open_file_with_cache` 按 mtime 校验，命中则返回含原 block ID 的 HTML。DOCX 不走此路径，每次 open 重新 Pandoc 解析，block ID 全部重新生成。

---

### 2.2 预览模块

| 格式 | 实现状态 | 技术路径 | 关键组件/命令 |
|------|----------|----------|--------------|
| **DOCX** | ✅ 已实现 | LibreOffice → PDF → iframe（PDF 缓存） | DocxPdfPreview / `preview_docx_as_pdf` |
| **Excel** | ✅ 已实现 | xlsx 解析（虚拟滚动）或 LibreOffice → PDF | ExcelTablePreview / `preview_excel_as_pdf` |
| **CSV** | ✅ 已实现 | PapaParse 解析 + @tanstack/react-virtual 虚拟滚动 | CsvPreview |
| **PDF** | ✅ 已实现 | `read_file_as_base64` → iframe | FilePreview |
| **图片** | ✅ 已实现 | `read_file_as_base64` → img | FilePreview |
| **演示文稿** | ✅ 已实现 | LibreOffice → PDF | PresentationPreview / `preview_presentation_as_pdf` |
| **音视频** | ✅ 已实现 | `read_file_as_base64` → Blob URL → video/audio | MediaPreview |
| **HTML** | ✅ 已实现 | Blob URL → iframe | FilePreview |

**预览缓存位置**：
- PDF 缓存：`{app_cache_dir}/pdf`
- 临时文件：`{app_cache_dir}/temp`
- LibreOffice 用户配置：`{app_cache_dir}/lo_user`

**LibreOffice 依赖说明**：DOCX、Excel、演示文稿预览依赖 LibreOffice；PDF、图片、CSV、音视频预览不依赖。

---

### 2.3 AI 模块

#### AI Provider 现状

| Provider | 实现状态 | 说明 |
|----------|----------|------|
| **DeepSeek** | ✅ 完整实现 | 流式响应、工具调用（SSE tool_calls 完整解析）均可用；HTTP/1.1 强制（避免 HTTP/2 连接问题）；请求超时 120s，连接超时 30s；支持 HTTP_PROXY / HTTPS_PROXY 环境变量 |
| **OpenAI** | ✅ 完整实现 | 流式响应与工具调用均可用；SSE 解析覆盖 delta.tool_calls、finish_reason=tool_calls、[DONE] 三路分支；tool_choice 参数已正确传递 |
| **Anthropic / Gemini / Local** | ❌ 未实现 | 仅有提及，代码中无对应 Provider 类 |

**API Key 管理**：系统 Keyring（`ai_save_api_key` / `ai_get_api_key`），不明文存储。

---

#### 三层 AI 能力

**层次一：辅助续写**

| 项目 | 说明 |
|------|------|
| 触发 | Cmd+J |
| 前端入口 | `useAutoComplete` hook → `AutoCompletePopover` 悬浮卡（Tab/Enter 应用，Esc 关闭） |
| 后端命令 | `ai_autocomplete` → `deepseek.rs::autocomplete_enhanced` |
| 输出 | 最多 3 条续写建议，`---` 分隔 |
| 上下文构建 | context_before（≤600 字符）、context_after（≤400 字符）、文档结构信息、记忆库信息（可选） |
| Prompt 结构 | `[文档概览]` + `[上下文内容]` + `[结构信息]` + `[记忆库信息]` + `[续写要求]` |

**层次二：局部修改**

| 项目 | 说明 |
|------|------|
| 触发 | Cmd+K |
| 前端入口 | `useInlineAssist` hook → `InlineAssistPanel` 弹窗 |
| 后端命令 | `ai_inline_assist` → `deepseek.rs::inline_assist` |
| 输出格式 | JSON `{ kind: "edit" \| "reply", text: "..." }` |
| 上下文构建 | instruction、选中文本、context_before/after（各 500 字符）、可选多轮 messages |
| 独立性 | 独立弹窗，独立提示词，无聊天历史，结果不进入对话 Diff 主链 |

**层次三：对话编辑**

| 项目 | 说明 |
|------|------|
| 触发 | 右侧聊天面板；两种模式：**agent**（工具调用启用）/ **chat**（纯对话） |
| 前端入口 | `chatStore` → `ChatPanel` → `ChatInput` / `InlineChatInput` |
| 后端命令 | `ai_chat_stream`（SSE 流式）→ `context_manager.rs::build_prompt_package` |
| 工具调用 | `tool_call_handler.rs` → `tool_service.rs`；结果写为 `role: "tool"` 消息，随后追加 `role: "user"` 的 `[NEXT_ACTION]` 控制消息驱动下一轮 |
| 流式取消 | `ai_cancel_chat_stream`，基于 oneshot channel |

**Prompt 构建（七层 PromptPackage）**：

`context_manager.rs::build_prompt_package()` 产出七层结构，当前代码中实际注入内容的层：

| 层 | Key | 内容 | 当前状态 |
|----|-----|------|---------|
| L1 | governance | 基础 system prompt（角色、规则、行为准则；agent / chat 两版差异） | ✅ 注入 |
| L2 | task | agent_task_summary（最近 3 条 agent 任务状态）+ agent_artifacts_summary（最多 5 条 artifact） | ✅ 有值时注入 |
| L3 | conversation | 消息历史（不在 system prompt 中，通过 messages 数组传递） | — |
| L4 | fact | 当前文档内容、编辑器状态、block 列表、选区信息 | ✅ 注入 |
| L5 | constraint | @mention 引用内容（按预算裁剪） | ✅ 有引用时注入 |
| L6 | augmentation | 占位符（记忆库/知识库，暂未接入） | — |
| L7 | tool_and_output | 占位符（工具 schema 通过 Provider 侧 function calling 传递） | — |

**主要工具（agent 模式下可用）**：

`read_file`、`create_file`、`update_file`（含 use_diff 模式）、`edit_current_editor_document`、`list_files`、`move_file`、`delete_file`、`search_documents`、`save_file_dependency`

**`edit_current_editor_document` 特殊说明**：AI 编辑已在编辑器中打开的文件时必须使用此命令（不得用 `update_file`），否则编辑器 DOM 状态与磁盘文件不同步。

**ToolResult.meta**：两条编辑链（`edit_current_editor_document` / `update_file`）成功时返回 candidate_ready meta（gate + verification=passed + confirmation=pending + artifact=diff_candidate）；NO_OP 时返回 no_op meta；错误路径返回 verification=failed meta。

**BuildModePolicy**：`tool_policy.rs` 中的统一 TPA force-continue 门禁。`default_writing()` 关闭 TPA 裁定（主写作链默认）；`build_mode()` 仅对 RecursiveCheck / FileOrganization 任务类型开放自动续轮。

---

#### Agent 任务跟踪（当前代码已实现部分）

当前代码中已形成完整链路的 Agent 跟踪能力：

| 能力 | 实现位置 | 说明 |
|------|---------|------|
| **per-tab 运行时状态** | `src/stores/agentStore.ts` | `AgentRuntimeRecord`：currentTask、recentTasks（最近 5 条）、stageState、verification、confirmation、artifacts |
| **任务持久化** | `src/services/agentTaskPersistence.ts` | 写入 `workspace.db::agent_tasks`（fire-and-forget） |
| **Artifact 写穿** | `src-tauri/src/commands/ai_commands.rs` | 流启动写 verification/confirmation pending；candidate 产出写 verification=passed |
| **Stage 写入与事件推送** | `ai_commands.rs::write_task_stage` | 写 DB + 发送 `ai-agent-stage-changed` Tauri 事件；shadow-tab: 代理键仅发事件不写 DB |
| **前端事件接收** | `src/components/Chat/ChatPanel.tsx` | 监听 `ai-agent-stage-changed` → `agentStore.setStageState()` |
| **Stage 流向** | 前后端联动 | `structured → candidate_ready → review_ready → user_confirmed → stage_complete` |
| **Shadow lifecycle** | `src/utils/agentShadowLifecycle.ts` | markAgentUserConfirmed / markAgentStageComplete / markAgentRejected / markAgentInvalidated；状态变更同步写 DB |
| **任务恢复** | `agentStore.loadTasksFromDb` | Tab 创建时从 `agent_tasks` 恢复 lifecycle=active 的任务 |
| **Prompt 注入** | `context_manager.rs` L2 task 层 | 读取最近 3 条 agent_tasks + 最多 5 条 artifacts 注入系统提示 |

当前代码中**未形成完整链路**（仅有设计文档，代码中无对应实现）：

- 显式 plan 阶段（draft→structured 的用户确认流程）
- 设计文档中描述的九状态 BA-STATE 正式状态机
- 知识库集成

---

### 2.4 Diff 系统

| 项目 | 技术选型 | 实现状态 | 说明 |
|------|----------|----------|------|
| **状态存储** | diffStore（Zustand），以 filePath 为键 | ✅ 已实现 | 多文件 diff 并存；DiffEntry 含 startBlockId、endBlockId、originalText、newText、agentTaskId |
| **文档内标记** | DiffDecorationExtension（ProseMirror Decoration.inline） | ✅ 已实现 | 红色删除线装饰，blockRangeToPMRange 定位 |
| **批量接受/拒绝** | accept_file_diffs / reject_file_diffs | ✅ 已实现 | 逆序执行保证位置偏移正确 |
| **单卡接受** | applyDiffReplaceInEditor | ✅ 已实现 | 含 originalText 校验 |
| **批量操作 UI** | PendingDiffPanel / DiffAllActionsBar | ✅ 已实现 | 按文件分组展示，支持批量操作 |
| **算法** | similar crate（后端）+ diff npm（前端） | ✅ 已实现 | 后端用于 canonical diff 计算；前端用于 diff 展示 |
| **失效处理** | markExpired，9 种 DiffExpireReason | ✅ 已实现 | 所有失效路径均接入 markAgentInvalidated shadow 回写 |
| **跨会话 block ID** | workspace.db file_cache | ✅ 已实现 | md/txt 跨 tab 关闭保持；DOCX 每次 open 重新生成 |

**Diff 失效场景**：
- 外部文件修改：用户选择"加载外部更改"时，当前文件所有 pending diffs 静默 expire
- 应用关闭：有 pending diffs 时弹确认框（重启后 block ID 重生成，diffs 失效）
- originalText 不匹配：编辑区域与 diff 记录不符时标记 expired + toast 提示

**已知问题**：`ToolCallCard.tsx` 存在一条接受路径仅标记 expired 而不提示用户（主要路径已有 toast），属于残余不一致。

---

### 2.5 文件与工作区

| 项目 | 技术选型 | 实现状态 | 说明 |
|------|----------|----------|------|
| **工作区配置** | `~/.config/binder/workspaces.json` | ✅ 已实现 | 最多保留 10 个最近工作区；fileStore 管理 currentWorkspace |
| **文件树** | build_file_tree + FileTreePanel | ✅ 已实现 | 递归扫描、拖拽、增删改移、右键菜单 |
| **文件监听** | notify crate + FileWatcherService | ✅ 已实现 | 监听工作区文件变动 |
| **外部修改检测** | check_external_modification（5s 轮询） | ✅ 已实现 | ExternalModificationDialog 弹窗 |
| **文件分类** | file_classifier + classify_files | ✅ 已实现 | organize_files 整理文件 |

**Workspace 数据库**（`.binder/workspace.db`，SQLite，migration v2）：

| 表 | 迁移版本 | 用途 | 关键字段 |
|----|---------|------|----------|
| `file_cache` | v1 | 文件 HTML 快照（含 block ID） | file_path、file_type、cached_content、content_hash、mtime |
| `pending_diffs` | v1 | 待处理 AI 编辑 Diff | file_path、original_text、new_text、diff_type、status |
| `file_dependencies` | v1 | 文件间依赖关系 | source_path、target_path、dependency_type |
| `ai_tasks` | v1 | 遗留表（v1 创建，当前不被主链消费） | task_id、status、affected_files |
| `agent_tasks` | v2 | Agent 任务状态持久化 | id、chat_tab_id、goal、lifecycle、stage、stage_reason |
| `agent_artifacts` | v2 | Agent 中间态 artifact | id、task_id、kind、status、summary |
| `_schema_version` | — | 数据库迁移版本管理 | version（当前最高 3） |

---

### 2.6 搜索模块

| 项目 | 技术选型 | 实现状态 | 说明 |
|------|----------|----------|------|
| **全文索引** | SQLite FTS5（`.binder/search.db`） | ✅ 已实现 | FTS5 虚拟表 `documents_fts`，unicode61 tokenizer |
| **索引构建** | `build_index_async` + walkdir | ✅ 已实现 | 递归扫描工作区，异步建索引 |
| **单文档索引** | `index_document` / `remove_document_index` | ✅ 已实现 | 增量更新 |
| **全文查询** | `search_documents` + SearchPanel | ✅ 已实现 | 全文匹配 |
| **前端模糊搜索** | Fuse.js | ✅ 已实现 | 文件名/路径模糊过滤 |
| **FTS5 兼容性** | unicode61 tokenizer | ⚠️ 已知问题 | 部分 SQLite 编译版本不支持 `remove_diacritics` 选项，导致索引初始化失败 |

---

### 2.7 记忆库

| 项目 | 实现状态 | 说明 |
|------|----------|------|
| **存储** | ✅ 已实现 | 工作区级记忆存放于 `.binder/workspace.db`；用户级记忆存放于 `user_memory.db` |
| **来源** | ✅ 已实现 | 系统规则写入（tab 提炼、content 提炼、tab 删除升格）；本阶段不暴露 `save_memory` 工具 |
| **操作命令** | ✅ 已实现 | `mark_orphan_tab_memories_stale`、`search_memories_cmd`、`on_tab_deleted_cmd`、`startup_memory_maintenance`、`expire_memory_item`、`expire_memory_layer`、`get_memory_user_data` |
| **一致性检查** | ❌ 未作为当前主链实现 | 旧 `check_memory_consistency` / `ConsistencyChecker` 已移除，避免伪入口 |
| **UI** | ✅ 已实现 | 当前主入口为 `MemoryTab`；旧 `MemorySection` 已移除 |
| **虚拟滚动** | ⚠️ 待优化 | 大量记忆时无虚拟滚动，列表性能待处理 |
| **与 Layer3 AI 集成** | ⚠️ 部分实现 | 续写（Layer1）提示词中有记忆注入逻辑；Layer3 对话编辑中记忆注入尚未形成完整对接 |

---

### 2.8 图片处理

| 项目 | 实现状态 | 说明 |
|------|----------|------|
| **插入** | ✅ 已实现 | `insert_image`；支持 base64 嵌入或相对路径 |
| **WebP 压缩** | ✅ 已实现 | `image_service.rs`；pandoc_service 中处理 DOCX 内图片 |
| **存在检查 / 删除** | ✅ 已实现 | `check_image_exists`、`delete_image` |
| **聊天图片** | ✅ 已实现 | `save_chat_image`，保存到工作区 |

---

## 三、技术栈

### 3.1 前端

以下版本来源于 `package.json`：

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^18.2.0 | UI 框架 |
| TypeScript | ^5.3.3 | 类型安全 |
| Vite | ^5.0.8 | 构建工具 |
| Zustand | ^4.4.7 | 状态管理 |
| TipTap | ^3.11.x / ^3.13.x（多扩展混版） | 富文本编辑框架 |
| tiptap-pagination-plus | file:（v3.0.5，本地 file: 依赖） | A4 分页扩展 |
| Tailwind CSS | ^3.4.0 | 样式 |
| @headlessui/react | ^1.7.17 | 无障碍 UI 组件 |
| @heroicons/react | ^2.1.1 | 图标 |
| @tanstack/react-virtual | ^3.13.13 | 虚拟滚动 |
| Fuse.js | ^7.1.0 | 前端模糊搜索 |
| PapaParse | ^5.5.3 | CSV 解析 |
| xlsx | ^0.18.5 | Excel 解析 |
| pdfjs-dist | ^3.11.174 | PDF 渲染 |
| diff | ^8.0.2 | 前端文本差异计算 |
| @tauri-apps/api | ^2.0.0 | Tauri IPC |
| @tauri-apps/plugin-dialog | ^2.4.2 | 文件对话框 |

### 3.2 后端（Rust）

以下版本来源于 `src-tauri/Cargo.toml`：

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.0 | 桌面应用框架 |
| serde / serde_json | 1.0 | 序列化/反序列化 |
| tokio | 1.0 (features: full) | 异步运行时 |
| tokio-stream / tokio-util | 0.1 / 0.7 | 流式异步工具 |
| reqwest | 0.11 (json, stream) | HTTP 客户端（AI API） |
| keyring | 2.0 | 系统密钥链（API Key 存储） |
| notify | 6.0 | 文件系统监听 |
| rusqlite | 0.31 (bundled, FTS5) | SQLite 嵌入式数据库 |
| zip | 0.6 | ZIP/DOCX 解压 |
| quick-xml | 0.31 (serialize) | XML 解析（DOCX 内部） |
| similar | 2.4 | 高性能 Diff 算法 |
| image | 0.24 | 图片处理 |
| webp | 0.3 | WebP 编解码 |
| scraper | 0.18 | HTML 解析 |
| regex | 1.10 | 正则表达式 |
| walkdir | 2.4 | 目录递归遍历 |
| uuid | 1.0 (v4) | UUID 生成 |
| chrono | 0.4 (serde) | 时间处理 |
| base64 | 0.22.1 | Base64 编解码 |
| sha2 | 0.10 | 哈希校验 |
| once_cell | 1.19 | 全局单例 |
| async-trait | 0.1 | 异步 trait |
| dirs | 5.0 | 系统目录路径 |
| which | 5.0 | 外部工具查找 |

### 3.3 外部工具依赖

| 工具 | 用途 | 必要性 |
|------|------|--------|
| **Pandoc** | DOCX↔HTML 转换（编辑/保存）；AI 工具 read_file 读取 DOCX | DOCX 功能必须 |
| **LibreOffice** | DOCX / Excel / 演示文稿 → PDF 预览 | 相关预览必须；其他功能不依赖 |

---

## 四、代码规模

以下数据基于 2026-04 代码库直接统计（删除废弃文件后的当前状态）：

| 范围 | 行数 | 文件数 |
|------|------|--------|
| 前端 `src/`（.ts / .tsx） | ~32,755 | 153 |
| 后端 `src-tauri/src/`（.rs） | ~26,072 | 60 |
| **合计** | **~58,827** | **213** |

### 前端大文件（≥800 行）

| 文件 | 行数 | 说明 |
|------|------|------|
| `stores/diffStore.ts` | 1,633 | Diff 状态管理（最大前端文件） |
| `components/Chat/InlineChatInput.tsx` | 1,417 | 行内聊天输入 |
| `components/Chat/ChatPanel.tsx` | 1,083 | 聊天主面板 |
| `components/Chat/ChatInput.tsx` | 930 | 聊天输入框 |
| `components/Editor/EditorPanel.tsx` | 920 | 编辑器主面板 |
| `components/Editor/CsvPreview.tsx` | 901 | CSV 预览 |
| `components/Editor/ExcelTablePreview.tsx` | 879 | Excel 表格预览 |
| `components/Chat/ToolCallCard.tsx` | 840 | 工具调用卡片 |
| `stores/chatStore.ts` | 809 | 聊天状态管理 |

### 后端大文件（≥900 行）

| 文件 | 行数 | 说明 |
|------|------|------|
| `services/pandoc_service.rs` | 4,544 | DOCX↔HTML 转换（最大后端文件） |
| `commands/ai_commands.rs` | 4,125 | AI 命令全部入口 |
| `services/tool_service.rs` | 2,539 | 工具调用执行逻辑 |
| `commands/file_commands.rs` | 1,940 | 文件操作命令 |
| `services/libreoffice_service.rs` | 1,487 | LibreOffice 调用 |
| `services/ai_providers/deepseek.rs` | 1,140 | DeepSeek Provider |
| `services/context_manager.rs` | 946 | Prompt 构建（七层 PromptPackage） |

---

## 五、Tauri 命令（共 74 个）

以下命令均注册在 `main.rs::tauri::generate_handler![]` 中，当前统计 74 个：

### 文件命令（file_commands.rs，34 个）

```
build_file_tree、read_file_content、read_file_as_base64、write_file、
create_file、create_folder、open_workspace_dialog、load_workspaces、
open_workspace、check_external_modification、get_file_modified_time、
get_file_size、move_file_to_workspace、move_file、rename_file、
delete_file、duplicate_file、check_pandoc_available、
open_docx_for_edit、preview_docx_as_pdf、preview_excel_as_pdf、
preview_presentation_as_pdf、create_draft_docx、create_draft_file、
save_docx、list_folder_files、save_external_file、
cleanup_temp_files、cleanup_expired_temp_files、cleanup_all_temp_files、
record_binder_file、get_binder_file_source、remove_binder_file_record、
clear_preview_cache
```

### AI 命令（ai_commands.rs + positioning_snapshot.rs，9 个）

```
ai_autocomplete、ai_inline_assist、ai_chat_stream、
ai_save_api_key、ai_get_api_key、ai_cancel_request、
ai_cancel_chat_stream、ai_analyze_document、
positioning_submit_editor_snapshot
```

### Workspace 命令（workspace_commands.rs，13 个）

```
open_file_with_cache、open_docx_with_cache、ai_edit_file_with_diff、
accept_file_diffs、reject_file_diffs、sync_workspace_file_cache_after_save、
get_file_dependencies、save_file_dependency、
upsert_agent_task、update_agent_task_stage、get_agent_tasks_for_chat_tab、
upsert_agent_artifact、get_agent_artifacts_for_task
```

### 图片命令（image_commands.rs，4 个）

```
insert_image、check_image_exists、delete_image、save_chat_image
```

### 搜索命令（search_commands.rs，4 个）

```
search_documents、index_document、remove_document_index、build_index_async
```

### 记忆库命令（memory_commands.rs，7 个）

```
mark_orphan_tab_memories_stale、search_memories_cmd、on_tab_deleted_cmd、
startup_memory_maintenance、expire_memory_item、expire_memory_layer、
get_memory_user_data
```

### 分类命令（classifier_commands.rs，2 个）

```
classify_files、organize_files
```

### 工具命令（tool_commands.rs，2 个）

```
execute_tool、execute_tool_with_retry
```

---

## 六、前端组件与 Store

### 6.1 主要组件

| 模块 | 主要组件 |
|------|---------|
| **Layout** | MainLayout、TitleBar、PanelResizer、WelcomeDialog |
| **Chat** | ChatPanel、ChatMessages、ChatInput、InlineChatInput、ToolCallCard、ToolCallSummary、DiffCard、DocumentDiffView、DiffAllActionsBar、FloatingActionButton、QuickApplyButton、EditMode、WorkPlanCard、FileDiffCard、AuthorizationCard、MentionSelector、ModelSelector、FileSelector、ReferenceManagerButton、InlineReferenceTag、CollapsibleReference、ChatTabs、MessageContextMenu |
| **Editor** | TipTapEditor、EditorPanel、EditorToolbar、EditorStatusBar、EditorTabs、DocxPdfPreview、ExcelTablePreview、CsvPreview、PresentationPreview、MediaPreview、PreviewToolbar、FilePreview、InlineAssistPanel、InlineAssistInput、AutoCompletePopover、MarginsModal、PageSizeDropdown、DocxPageNavigator、PageNavigator、OutlinePanel、DocumentAnalysisPanel、DiffView、ExternalModificationDialog |
| **FileTree** | FileTree、FileTreePanel、FileTreeNode、ResourceToolbar、SearchPanel、HistorySection、KnowledgeSection、InstructionSection、FileTreeContextMenu、NewFileButton、InputDialog、OrganizeFilesDialog、FileIcon、CollapsibleSection |
| **Memory** | MemoryTab、MemoryEditor、MemoryDetailPanel |
| **Common** | LoadingSpinner、Button、Modal、Toast、ErrorBoundary |
| **Settings** | APIKeyConfig、ThemeSelector |

### 6.2 TipTap Extensions（自定义）

| Extension | 用途 |
|-----------|------|
| BlockIdExtension | 为每个块节点注入 `data-block-id`，支持精确定位 |
| CopyReferenceExtension | 复制时携带 blockId + charOffset 四元组 |
| DiffDecorationExtension | ProseMirror Decoration.inline 渲染红色删除线 |
| FontSize | 字体大小调整 |
| PageTopCaretExtension | 分页模式光标处理 |
| BlankLineDebugExtension | 空行调试 |

### 6.3 Zustand Store（8 个）

| Store | 职责 |
|-------|------|
| `chatStore` | 聊天 tab、消息列表、ChatMode（`'agent' \| 'chat'`）、流式状态、工具调用块 |
| `diffStore` | 以 filePath 为键的 DiffEntry 列表；ExecutionExposure 日志 |
| `editorStore` | 编辑器 tab、TipTap Editor 实例引用、dirty/saving 状态、documentRevision |
| `fileStore` | 当前工作区路径、文件树状态 |
| `agentStore` | 每个聊天 tab 的 AgentRuntimeRecord（currentTask、stageState、verification、confirmation、artifacts、recentTasks） |
| `referenceStore` | 行内 @mention 引用列表 |
| `layoutStore` | 面板尺寸、侧边栏可见性 |
| `themeStore` | 主题选择 |

### 6.4 主要 Hook

| Hook | 用途 |
|------|------|
| `useAutoComplete` | 辅助续写触发与 AutoCompletePopover 控制 |
| `useInlineAssist` | 局部修改弹窗控制 |
| `useMentionData` | @mention 数据获取 |
| `usePaginationFromEditor` | 分页状态从编辑器提取 |

---

## 七、构建与运行

### 7.1 必要环境

| 工具 | 要求 | 说明 |
|------|------|------|
| Node.js | ≥ 18 | 前端构建 |
| Rust | ≥ 1.70 | 后端编译 |
| Pandoc | 任意可用版本 | DOCX 编辑/保存必须 |
| LibreOffice | 可选 | DOCX/Excel/演示文稿预览，无则相关预览不可用 |

### 7.2 命令

```bash
# 安装依赖（首次 clone 后必须运行）
npm install

# 开发模式（同时启动 Tauri + Vite 开发服务器）
npm run tauri:dev

# 构建前端（包含先构建本地分页库 tiptap-pagination-plus）
npm run build

# 仅构建本地分页库
npm run build:pagination

# 打包桌面应用
npm run tauri:build
```

---

## 八、当前已知问题与边界

以下内容均基于当前代码库直接核对确认：

### 功能性问题

| 问题 | 位置 | 说明 |
|------|------|------|
| **无全局工具调用轮次上限** | `services/loop_detector.rs` | LoopDetector 可被参数微变绕过计数；max_force_continue_retries 不限制单轮工具调用数，可能在异常条件下形成无限工具链 |
| **ToolResult.new_content 语义不一致** | `services/tool_service.rs` | Anchor/Resolver 路径返回当前文档 HTML，Legacy 路径返回完整新 HTML，两路语义不统一 |
| **ToolCallCard 一条接受路径不提示** | `components/Chat/ToolCallCard.tsx` | 有一条接受路径仅标记 expired 而不 toast 提示用户；主要路径已有提示，属残余不一致 |
| **Tauri save 回调竞态（残余）** | EditorPanel.tsx + editorStore | 主要竞态已修复；isSaving 短暂误清的残余影响极小 |

### 功能限制

| 限制 | 说明 |
|------|------|
| **FTS5 tokenizer 兼容性** | 部分 SQLite 编译版本不支持 `unicode61 remove_diacritics=2`，导致索引初始化失败 |
| **DOCX block ID 不跨 session 保留** | 每次 open 重新 Pandoc 解析，block ID 全部重新生成；应用关闭后 pending diffs 对应 block ID 失效 |
| **记忆库无虚拟滚动** | 大量记忆时列表性能差 |
| **Excel / 演示文稿无编辑** | 当前仅预览 |
| **单 Provider 主链** | 当前主写作链仅经测试的 Provider 为 DeepSeek；OpenAI 工具调用链代码已实现但实际集成程度需单独验证 |

---

## 九、相关文档

以下文档为各专题设计/规划文档，仅作阅读索引。**本文档不依据以下文档判断当前实现事实**：

| 文档 | 定位 |
|------|------|
| `A-AG-X-L-01_Binder Agent落地开发计划.md` | Agent 分阶段落地计划 |
| `R-DE-M-R-01_对话编辑-主控设计文档.md` | 对话编辑实现细节（Resolver、canonical diff、块列表） |
| `R-DE-M-R-03_文档逻辑状态传递规范.md` | getLogicalContent / baseline 逻辑状态规范 |
| `R-WS-M-R-02_Workspace改造可落地实施方案.md` | Workspace 改造方案 |
| `AI功能优化开发计划.md` / `AI功能优化开发计划（下）.md` | AI Phase 0–3 开发计划 |
| `A-VAL-X-R-02_代码遗留与清理台账.md` | 代码遗留项登记与清理追踪 |
| `R-ED-M-R-08_分页功能说明.md` | 分页实现说明 |

---

**文档更新时间**：2026年4月
