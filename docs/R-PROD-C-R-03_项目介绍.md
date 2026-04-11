# Binder（合页）项目介绍

## 文档声明

本文以当前代码实现为唯一事实来源，用于说明 Binder 当前项目的真实实现状态、能力边界、系统结构与技术架构。

本文不描述尚未落地的理想方案，不将规划能力视为现有能力，不以历史方案替代当前实现。仓库中的 PRD、方案文档和旧版介绍仅作为命名和背景核对材料；如与代码不一致，一律以当前代码为准。

## 文档信息

- 结构编码：`PROD-C-R-03`
- 文档属性：`项目总览 / 当前实现总览`
- 更新时间：`2026-04-11`
- 项目版本：`0.1.0`
- 前端代码范围：`src/`
- Tauri / Rust 代码范围：`src-tauri/src/`

## I. 项目概述

### 1.1 项目名称与当前定位

Binder（合页）当前是一套基于 Tauri 2 的桌面端文档工作台。它已经不是单一的富文本编辑器，但也还不是完整办公套件。当前主链围绕四类能力组织：

1. 本地工作区与文件树管理。
2. 基于 TipTap 的文档编辑与多格式预览。
3. 以 diff 审阅链为核心的 AI 辅助编辑。
4. 以工作区数据库为中心的缓存、时间轴、记忆、知识、模板与 Agent 运行时持久化。

### 1.2 当前产品形态

当前代码对应的产品形态是桌面应用，不是浏览器 SaaS，也不是云端协作系统。应用主界面由 `MainLayout` 组织，常态下包含：

1. 左侧工作区面板：文件树、记忆库、知识库、模板库、时间轴。
2. 中央编辑 / 预览区：编辑器、Office/PDF/媒体预览、文档分析等。
3. 右侧聊天区：`chat` 和 `agent` 两种模式。

### 1.3 当前主要服务对象

从当前能力边界看，Binder 更接近“面向知识工作者和内容创作者的本地文档工作台”，而不是通用企业协同平台。当前实现明显偏向单机、本地文件、个人工作区和 AI 审阅式改稿。

### 1.4 当前版本性质

当前版本应视为“演进中的桌面工作台 MVP”：

1. 文档编辑、AI 审阅链、工作区缓存、时间轴、记忆等主能力已落地。
2. 知识库和模板系统已有真实数据层与运行链，但产品化闭环仍不完全。
3. 搜索、构建型工作流、多 Provider 扩展等能力存在明显未收口部分。

## II. 项目基础规模概览

### 2.1 统计口径

本节统计以当前仓库核心源码为范围，前端按 `src/` 计，后端按 `src-tauri/src/` 计。纳入 `.ts`、`.tsx`、`.css`、`.rs` 四类源码文件，包含 `components`、`stores`、`services`、`hooks`、`utils`、`commands`、`workspace` 等主实现目录。未纳入 `node_modules`、`target`、`dist`、`build`、`.git`、缓存目录、文档文件、锁文件、配置文件、图片字体音视频等二进制或资源文件。

### 2.2 规模总览

| 指标 | 统计结果 |
|---|---|
| 核心源码文件数 | 239 |
| 核心源码总行数 | 74,599 |
| 前端代码行数 | 36,045 |
| 后端代码行数 | 38,554 |
| 前端占比 | 48.3% |
| 后端占比 | 51.7% |

从当前统计口径看，项目总体规模约 7.46 万行核心源码，前后端体量接近，Rust 后端略高于前端，整体更接近“前后端并重的桌面应用”而不是单纯 UI 工程。

### 2.3 技术分布概览

| 语言 / 技术类型 | 行数 | 占比 | 说明 |
|---|---|---|---|
| TypeScript / TSX | 35,595 | 47.7% | 前端主实现语言，覆盖 UI、编辑器、状态管理与前端服务编排 |
| Rust | 38,554 | 51.7% | Tauri 后端主实现语言，承担文件、数据库、AI、工具链与本地服务能力 |
| CSS | 450 | 0.6% | 前端样式补充，体量很小，不构成主要实现负担 |

当前主实现语言是 TypeScript / TSX 与 Rust 双主栈，CSS 只占极小比例。就代码体量而言，Binder 不是“前端很薄、后端很轻”的壳应用，而是前端交互层和本地后端服务层都已形成较完整实现。

### 2.4 主要代码区域分布

| 目录 | 文件数 | 行数 | 说明 |
|---|---|---|---|
| `src/components` | 95 | 24,680 | 前端界面主体，包含编辑器、聊天、文件树、预览等交互实现 |
| `src/components/Editor` | 33 | 9,533 | 编辑器主链、预览切换与文档交互核心 |
| `src/components/Chat` | 26 | 8,841 | 对话、Agent、工具卡片与审阅交互主链 |
| `src/stores` | 10 | 3,564 | Zustand 状态主链，承接文件、编辑器、聊天、diff、agent 等运行时状态 |
| `src/services` | 9 | 2,022 | 前端服务封装与 Tauri 调用编排 |
| `src/utils` | 30 | 3,596 | 前端通用工具、路径处理、定位与引用辅助 |
| `src-tauri/src/services` | 52 | 26,524 | 后端主体体量，集中在 AI、文档转换、知识、记忆、模板、搜索等服务 |
| `src-tauri/src/commands` | 11 | 8,248 | Tauri command 边界，负责前后端能力暴露 |
| `src-tauri/src/workspace` | 7 | 3,384 | 工作区数据库、缓存、diff、时间轴与恢复主链 |

如果按主链理解体量分布，前端的主要体量集中在 `components`，尤其是编辑器和聊天；后端的主要体量集中在 `services`，其次是 `commands` 与 `workspace`。这与项目当前形态一致：前端负责复杂交互与编辑器编排，后端负责文件系统、本地数据库、AI 调用和工作区事实层。

### 2.5 规模结论

在当前统计口径下，Binder 已具备中等以上桌面应用工程体量。代码主体由前端 TypeScript / TSX 与 Rust 后端双主栈构成，前端负责 UI、编辑器交互与状态编排，后端负责文件、数据库、AI、工作区与本地服务能力。从代码分布看，项目并非纯界面型应用，而是已经形成较完整本地桌面系统结构。

## III. 当前系统能力总览

### 3.1 已实现能力

| 能力域 | 当前状态 | 说明 |
|---|---|---|
| 工作区打开与最近工作区管理 | 已实现 | `open_workspace` 打开工作区，最近工作区写入 `~/.config/binder/workspaces.json` |
| 文件树与本地资源 CRUD | 已实现 | 新建、删除、移动、重命名、复制、拖拽与组织能力均有前后端链路 |
| Markdown / TXT / HTML 编辑 | 已实现 | 基于 TipTap 直接编辑 |
| DOCX 类文档编辑链 | 已实现 | `.docx/.doc/.odt/.rtf` 统一走文档转换链，编辑核心仍是 HTML + TipTap |
| 多格式预览 | 已实现 | PDF、图片、音视频、CSV、Excel、演示文稿、DOCX 预览均有链路 |
| AI 三层能力 | 已实现 | 续写、局部修改、对话式编辑均已接入 |
| AI 流式响应与工具调用 | 已实现 | OpenAI / DeepSeek 均支持 SSE 流式输出和 tool calls |
| Diff 审阅链 | 已实现 | 生成、展示、接受、拒绝、失效治理均已落地 |
| 外部文件修改检测 | 已实现 | 编辑中轮询检测并弹出冲突处理对话框 |
| 工作区缓存与 canonical 内容链 | 已实现 | `file_cache`、`content_hash`、`mtime`、block id 保真已接入主链 |
| 时间轴与恢复 | 已实现 | 可记录保存/结构变更节点，支持预览恢复和正式恢复 |
| Agent 任务 / Artifact 持久化 | 已实现 | `agent_tasks`、`agent_artifacts` 已进入主链 |
| 记忆库 | 已实现 | 工作区级和用户级记忆、检索、过期治理、上下文注入均有实现 |

### 3.2 部分实现或已接入但未完全闭环的能力

| 能力域 | 当前状态 | 说明 |
|---|---|---|
| 知识库 | 部分实现 | 数据层、查询、重建、策略更新、自动检索注入已实现；当前主 UI 更偏管理和引用，导入入口不完整 |
| 模板库 / 工作流模板 | 部分实现 | 已实现工作流模板、解析、编译、运行时；不是通用文档模板库 |
| 全文搜索 | 部分实现 | `search.db` 与 FTS5 后端存在，但主布局未挂载独立全文检索面板，完整索引构建也未完全进入用户主链 |
| Agent 工作流执行 | 部分实现 | 已有任务、Artifact、工作流执行状态和人工干预接口，但不是完整构建模式或多 Agent 系统 |
| 非当前文件精确编辑 | 部分实现 | 已有 block id、anchor、baseline 与门禁链，但精度仍受 canonical 映射和基线有效性约束 |

### 3.3 未实现、仅预留或不应写成现状的能力

| 能力域 | 当前状态 | 说明 |
|---|---|---|
| Excel / 演示文稿编辑 | 未实现 | 当前仅预览，不存在正式编辑链 |
| 完整多 Provider 体系 | 未实现 | 真实接入只有 OpenAI 与 DeepSeek；Anthropic、Gemini、Local 仅停留在注释或预留层 |
| 完整构建模式 / 多 Agent 协同 | 未实现 | 仅有部分策略和运行时结构，不应描述为正式主链 |
| 通用知识平台 / 模板平台 | 未实现 | 当前实现仍是工作区内的局部系统，不是完整平台产品 |

### 3.4 已废弃、历史残留或不应再作为现行能力描述的内容

| 项目 | 当前判断 | 说明 |
|---|---|---|
| `ai_tasks` 旧表 | 历史残留 | `workspace.db` 仍保留旧表，但主链使用 `agent_tasks` |
| `src/components/Chat/EditMode.tsx` | 历史残留 | 文件存在，但当前主界面未挂载，不应作为当前聊天编辑主链描述 |
| 独立全文搜索面板 | 未接入主布局 | `src/components/Search/SearchPanel.tsx` 存在，但当前挂载的是文件树过滤面板而非该组件 |
| “模板库承接 skills / 通用模板” | 不成立 | 当前挂载的模板库明确只承接工作流模板 |

## IV. 文件与文档能力

### 4.1 当前支持边界

Binder 当前不是“所有 Office 文档都可编辑”的系统，而是按三类链路处理文件：

| 文件类型 | 当前处理方式 | 说明 |
|---|---|---|
| `.md` / `.txt` / `.html` | 直接编辑 | 直接进入 TipTap 编辑链 |
| `.docx` / `.doc` / `.odt` / `.rtf` | 转换后编辑 | 统一映射为文档转换链，编辑核心仍为 HTML |
| `.xlsx` / `.xls` / `.ods` / `.csv` | 预览为主 | CSV 有表格预览； Excel/ODS 走解析或预览链，不进入正式编辑器主链 |
| `.pptx` / `.ppt` / `.ppsx` / `.pps` / `.odp` | 预览为主 | 通过 LibreOffice 转 PDF 预览 |
| `.pdf` | 预览 | 不可编辑 |
| 图片 / 音频 / 视频 | 预览 | 不可编辑 |

### 4.2 文件打开策略

`documentService` 会先识别文件类型，再结合文件来源决定“直接编辑”还是“只读预览”。

当前来源判断分为：

1. `new`：Binder 原生创建。
2. `ai_generated`：AI 工具链创建。
3. `external`：外部导入或未记录元数据的文件。

当前实际规则是：

1. 文本类文件即使来源为 `external`，也允许直接编辑。
2. 文档转换类文件如果来源为 `external`，默认先进入预览，只能在强制编辑或草稿路径下进入编辑链。
3. Binder 自己创建或 AI 生成的文档文件，可以直接进入编辑链。

### 4.3 打开、保存与缓存复用

当前保存链不是单纯写磁盘，而是“写盘 + 缓存同步 + 时间轴记录”三段式：

1. 前端保存调用 `documentService.saveFile`。
2. 文本类文件写盘后调用 `sync_workspace_file_cache_after_save` 更新 `file_cache`。
3. 保存成功后调用 `record_saved_file_timeline_node` 记录时间轴节点。

这意味着 `workspace.db` 中的缓存不是旁路缓存，而是编辑保真、AI 基线和时间轴的一部分。

### 4.4 外部修改检测

当前主链对“已打开且可编辑且未脏”的标签页做 5 秒轮询。检测到磁盘变更后，会弹出 `ExternalModificationDialog`，允许：

1. 继续覆盖。
2. 重新加载磁盘内容。
3. 比较差异。
4. 取消。

如果用户选择重新加载，当前文件的 pending diffs 会被主动失效处理。

## V. 编辑器系统与文档编辑机制

### 5.1 编辑器基础架构

前端编辑器基于 TipTap 3 和 ProseMirror，当前实际启用的核心能力包括：

1. `StarterKit` 基础文档模型。
2. 图片、链接、表格、任务列表、文本样式、颜色、下划线、上标、下标等扩展。
3. `tiptap-pagination-plus` 分页模式，主要服务 DOCX 编辑链。
4. 多个 Binder 自定义扩展：`BlockIdExtension`、`DiffDecorationExtension`、`CopyReferenceExtension`、`PageTopCaretExtension`、`FontSize` 等。

### 5.2 分页编辑现状

分页能力真实存在，但当前主要服务于 DOCX/类 DOCX 文档的页面化编辑视图。其本质仍然是 HTML 文档在 TipTap 中编辑，不是原生 Word 布局引擎，也不保证与 Office 完全一致。

### 5.3 Block ID、anchor 与精确定位现状

Binder 当前已经落地的是“块级稳定标识 + 偏移定位”链路：

1. 块级节点会注入 `data-block-id`。
2. 选区会被转换为 `{ startBlockId, startOffset, endBlockId, endOffset }` 形式的 anchor。
3. 引用复制和 AI 精确编辑都依赖这套 block id / offset 机制。

当前尚未落地的是更高阶的语义级定位系统。也就是说，当前精确编辑能力以 HTML 块和字符偏移为基准，不是语义 AST、版心布局或跨格式统一语义锚点。

### 5.4 打开文件与未打开文件的处理差异

这是当前系统中必须明确的一条主边界。

对于已经在编辑器中打开的当前文件：

1. AI 看到的是当前编辑器 HTML、当前 revision、当前 baseline、当前选区与光标信息。
2. 编辑必须走 `edit_current_editor_document`，不能绕过编辑器直接写磁盘。
3. 这样才能保证编辑器状态、diff 卡和磁盘状态一致。

对于未打开文件或非当前文件：

1. 前端会调用 `open_file_with_cache` / `open_docx_with_cache`。
2. 后端要求通过四个门禁：`target_file_resolved`、`canonical_loaded`、`block_map_ready`、`context_injected`。
3. 返回内容以 canonical HTML 和 `file_cache` 为主，并附带该文件的 `pending_diffs`。

因此，当前系统已经明确区分“当前编辑器上下文”与“非当前文件 canonical 上下文”两条链路，二者不能混写。

## VI. Diff 机制与审阅链

### 6.1 当前主原则

Binder 当前的 AI 编辑主链不是“AI 直接改正文”。主链原则是：

1. AI 产出候选改动。
2. 候选改动以 diff 形式进入待审阅状态。
3. 用户接受后才真正写盘。

这条原则同时适用于当前文件编辑和非当前文件编辑，只是生成 diff 的入口不同。

### 6.2 Diff 的生成、存储与展示

当前 diff 体系由两层组成：

1. 持久化层：`workspace.db.pending_diffs`。
2. 运行时层：前端 `diffStore`。

`diffStore` 比数据库记录更“强”，它额外维护：

1. `baselineId`。
2. `documentRevision`。
3. `contentSnapshotHash`。
4. `blockOrderSnapshotHash`。
5. `pending / accepted / rejected / expired` 等状态。

编辑器内的可视化由 `DiffDecorationExtension` 负责。当前 UI 既有文档内高亮，也有按文件分组的 diff 卡面板。

### 6.3 接受、拒绝与逻辑基线

当前 pending diffs 不是孤立 patch，而是“绑定到某一基线快照”的候选操作。基线变化后，原 diff 就可能失效。

当前接受链大致为：

1. 从 `file_cache` 或当前基线内容加载待应用正文。
2. 逆序应用 diff，避免位置偏移污染后续 patch。
3. 写回磁盘或转换回文档格式。
4. 清理对应 `pending_diffs`。
5. 更新 `file_cache`。
6. 写入时间轴节点。

### 6.4 失效场景

以下情况会触发 pending diff 失效或需要失效治理：

1. 用户自己继续编辑，导致 `documentRevision` 变化。
2. 外部文件被修改并选择重新加载。
3. 应用退出后重新启动，旧 diff 的 block 定位不再可靠。
4. `originalText` 与当前正文无法匹配。
5. block 顺序或内容快照已经改变。

因此，pending diffs 和逻辑基线是强绑定关系，不应理解为独立于当前内容状态的长期补丁。

### 6.5 当前精度边界

当前 diff 已经能做到块级定位和审阅，但其精度仍受以下边界限制：

1. 依赖 block id 和 canonical HTML，不是语义结构差分。
2. 对 DOCX 等转换型文档，重新打开后 block id 可能重建，跨会话稳定性弱于原生文本类文件。
3. 结构性大改、外部覆盖和内容重排会更容易导致 diff 失效。

## VII. AI 功能架构

### 7.1 当前 AI 分层

当前代码里真实存在三层 AI 能力：

| 层级 | 入口 | 当前状态 | 说明 |
|---|---|---|
| 层次一：辅助续写 | `Cmd/Ctrl+J` | 已实现 | 基于当前上下文生成续写建议 |
| 层次二：局部修改 | `Cmd/Ctrl+K` | 已实现 | 对选中文本做局部改写或回复 |
| 层次三：对话编辑 | 右侧聊天区 | 已实现 | 支持 `chat` 与 `agent` 两种模式 |

### 7.2 Provider 接入结构

当前后端 `AIService` 实际注册的 Provider 只有：

1. OpenAI。
2. DeepSeek。

二者都支持：

1. 流式文本输出。
2. SSE tool calls 解析。
3. API Key 通过系统 keyring 保存。

Anthropic、Gemini、本地模型等不应写成现有能力。

### 7.3 Tool calling 与流式响应

AI 对话主链由 `ai_chat_stream` 驱动，后端包含：

1. `context_manager`：构建 prompt package 和上下文注入。
2. Provider：发起流式请求。
3. `streaming_response_handler`：处理增量文本。
4. `tool_call_handler`：解析、修复和执行工具调用。
5. `tool_service`：把工具调用落到文件 / 编辑器 / 工作区能力上。

当前工具集已覆盖读取、列文件、搜索文件、创建、更新、删除、移动、重命名、创建文件夹、编辑当前编辑器文档和保存文件依赖。

### 7.4 Agent 模式与 chat 模式边界

当前聊天区有两种用户可见模式：

1. `chat`：纯对话，不启用工具。
2. `agent`：可启用工具，但要求聊天 tab 绑定工作区。

也就是说，工具调用不是全局总开关，而是“`agent` 模式 + 已绑定工作区”共同成立时才进入主链。

### 7.5 AI 与编辑器、工作区、文件系统的关系

当前 AI 并不是游离系统，而是绑定到工作区事实层上的：

1. 当前编辑内容、选区、光标和 revision 会进入 prompt。
2. `workspace.db` 中的任务、Artifact、缓存、记忆、知识检索结果会进入上下文。
3. 真正落盘的文件修改仍要经过 diff 审阅链或工具执行链。

### 7.6 Agent task / artifact 的真实位置

Agent task 与 artifact 当前不是单纯前端态，而是工作区主链的一部分：

1. 前端 `agentStore` 维护 tab 级运行时视图。
2. 后端写入 `agent_tasks`、`agent_artifacts`。
3. 阶段变更通过 Tauri 事件推送给前端。
4. 当前活跃任务可在重新进入聊天 tab 时从数据库恢复。

### 7.7 当前未完成边界

以下内容不应被写成“已完成的 AI 系统能力”：

1. 完整构建模式。
2. 完整多 Agent 协作。
3. 通用外部工具生态。
4. 所有知识 / 模板 / 任务系统都已经形成产品闭环。

## VIII. Workspace / 工作台 / 文件管理系统

### 8.1 工作区的真实定位

当前 Binder 已经形成“工作台型系统”的雏形。工作区不是单纯目录选择器，而是以下能力的汇聚点：

1. 文件树与资源操作。
2. 工作区数据库与搜索索引。
3. 时间轴、记忆、知识、模板、Agent 持久化。
4. 文件监听和增量索引。

### 8.2 左侧工作台结构

当前 `FileTreePanel` 已挂载的工作台区块包括：

1. 工作区文件树。
2. 记忆库面板。
3. 知识库面板。
4. 模板库面板。
5. 时间轴面板。

这说明工作区左栏已经超出传统文件树，成为多个子系统的统一入口。

### 8.3 文件管理与资源组织

文件管理主链已经覆盖：

1. 新建文件 / 文件夹。
2. 删除、移动、重命名、复制。
3. 工作区导入。
4. 基于分类器的整理与归类。

这部分能力由前端 `fileService` 和后端 `file_commands`、`classifier_commands` 共同完成。

### 8.4 工作区与当前打开文件的关系

当前所有强主链能力都更偏“工作区内文件”：

1. `workspace.db`、`search.db`、知识条目、时间轴都依赖工作区路径。
2. 未绑定工作区时仍可进入聊天，但 Agent 工具链会被限制。
3. 临时聊天与无工作区状态是真实存在的，但能力边界明显收缩。

### 8.5 当前持久化边界

当前聊天 tab 元数据会通过 Zustand `persist` 写入 `localStorage`，但消息内容本身不在同一层完整持久化。编辑器标签页则主要是运行时内存状态，不构成同等级的跨重启恢复系统。

## IX. 搜索、缓存、索引与依赖管理

### 9.1 文件缓存

`workspace.db.file_cache` 是当前系统的一条主链，不只是性能缓存。它承担：

1. canonical HTML 快照保存。
2. `content_hash` 和 `mtime` 校验。
3. block id 保真。
4. 非当前文件 AI 编辑的基线输入。

文本类文件保存后会直接把带 block id 的 HTML 写回缓存；转换型文档会写 canonical 内容。

### 9.2 content hash / mtime 机制

当前缓存与一致性治理依赖两类信号：

1. 磁盘时间戳 `mtime`。
2. 缓存内容哈希 `content_hash`。

前者用于快速判定文件是否被外部改写，后者用于更细粒度地判断缓存是否仍可作为 AI 与恢复链的可信基线。

### 9.3 搜索索引现状

后端已实现：

1. `.binder/search.db`。
2. SQLite FTS5 文档索引。
3. `search_documents`、`index_document`、`remove_document_index`、`build_index_async` 命令。

但当前主链仍有两个边界：

1. 主布局中实际挂载的是文件树过滤输入，不是独立全文检索面板。
2. 完整递归建索引虽有 `build_index_async`，但主界面未形成明显的统一触发链。

因此，搜索应定性为“后端与局部 UI 已有实现，但完整产品主链未完全收口”。

### 9.4 文件依赖

当前系统已实现 `file_dependencies` 持久化，并且 AI 工具链中存在 `save_file_dependency`。这说明 Binder 已经开始记录文件间依赖关系，但目前更像底层事实层，而不是完整可视化依赖管理产品。

### 9.5 临时目录与预览缓存

当前本地缓存和临时文件至少分布在以下位置：

| 路径 | 用途 |
|---|---|
| `workspace/.binder/workspace.db` | 工作区主数据库 |
| `workspace/.binder/search.db` | 工作区全文索引 |
| `~/.config/binder/workspaces.json` | 最近工作区列表 |
| `{data_dir}/binder/user_memory.db` | 用户级跨工作区记忆 |
| `{data_dir}/binder/cache/preview` | 预览缓存 |
| `{data_dir}/binder/cache/odt` | 文档转换中间缓存 |

## X. 历史、时间轴、恢复机制

### 10.1 当前是否已真实落地

时间轴不是文档方案残留，而是已经进入主链的能力。前端已有 `HistorySection`，后端已有：

1. `list_timeline_nodes`
2. `get_timeline_restore_preview`
3. `restore_timeline_node`

以及 `timeline_nodes`、`timeline_restore_payloads` 持久化表。

### 10.2 当前记录的事实类型

当前时间轴围绕两类事实记录：

1. `file_content`：文件内容变更。
2. `resource_structure`：文件/目录结构变更。

保存文件、创建文件、创建文件夹等操作都会进入时间轴。

### 10.3 恢复预览与正式恢复

当前恢复链不是直接覆盖，而是：

1. 先读取恢复预览。
2. 检查当前状态是否允许恢复。
3. 真正恢复时若内容发生变化，会再写入新的 restore 节点。

时间轴节点当前还有上限裁剪，代码常量为 50 条。

### 10.4 恢复边界

当前恢复的是“逻辑文件状态”和“资源结构状态”，而不是整个应用会话。不会一并恢复的内容包括：

1. 聊天消息运行时。
2. Agent 对话过程。
3. 待处理 diff 的完整运行时上下文。
4. 任意 UI 局部状态。

因此，时间轴已经可用，但作用域是“工作区事实恢复”，不是全量会话回放。

## XI. 记忆库 / 知识库 / 模板库的当前状态

### 11.1 记忆库

记忆库当前已经落地到“数据层 + 主链注入 + 基础 UI 管理”层级。

已实现部分：

1. 工作区级记忆写入 `workspace.db`。
2. 用户级记忆写入 `{data_dir}/binder/user_memory.db`。
3. FTS 检索、使用日志、层级优先级与过期治理。
4. `MemoryTab` 面板浏览、筛选、逐条过期、按层过期。
5. AI 对话链中的记忆检索与注入。
6. 标签关闭后的 stale 维护和启动时维护。

当前边界：

1. 记忆系统已进入主链，但还不是独立成熟产品。
2. 更复杂的知识图谱、长期策略编排等不应写成现状。

### 11.2 知识库

知识库当前已经不是“只有方案没有实现”的状态。它至少已落地到以下层级：

1. `workspace.db` 中的知识 schema、entry、document、chunk、execution stage。
2. 文档导入 / 替换 / 删除 / 重建 / 重试 / 移动 / 重命名。
3. 自动检索策略汇总与 AI 上下文注入切片。
4. `KnowledgeSection` 中的列表、搜索、显式引用、验证状态和策略更新。

当前边界：

1. 当前 UI 更偏管理和引用，不是完整知识运营台。
2. 用户可见的导入入口和主链收口仍不充分。
3. 不应把它描述成“完整知识库产品”。

### 11.3 模板库

当前模板库已经有真实实现，但其真实定位是“工作流模板系统”，不是通用模板中心。

已实现部分：

1. `workflow_templates` 与 `workflow_template_documents` 存储。
2. 模板文档编辑、保存、状态更新。
3. 模板解析、编译和缓存。
4. 运行时工作流计划和执行状态持久化。
5. 手动介入、恢复执行、标记失败、推进步骤。
6. 与 Agent shadow runtime 的有限集成。

当前边界：

1. 当前模板库只承接工作流模板。
2. 不承接文档模板，也不应写成 skills 系统。
3. 当前工作流执行仍是局部运行时能力，不是完整业务编排平台。

## XII. 前后端技术架构

### 12.1 前端主要技术栈

| 层 | 技术 | 角色 |
|---|---|---|
| 桌面前端框架 | React 18 + TypeScript + Vite | UI 与应用壳层 |
| 状态管理 | Zustand | 文件、编辑器、聊天、diff、agent、时间轴、模板、引用等状态管理 |
| 编辑器 | TipTap 3 + ProseMirror | 文档编辑核心 |
| 样式 | Tailwind CSS | UI 样式实现 |
| 预览 / 数据处理 | `pdfjs-dist`、`xlsx`、`papaparse`、`diff` 等 | PDF、表格、差异展示等 |

### 12.2 前端分层关系

当前前端大体按以下层次组织：

1. UI 层：`components/`
2. 状态层：`stores/`
3. 调用封装层：`services/`
4. 领域工具层：`utils/`、`hooks/`、`types/`

其中最关键的 store 包括：

1. `fileStore`
2. `editorStore`
3. `chatStore`
4. `diffStore`
5. `agentStore`
6. `timelineStore`
7. `templateStore`
8. `referenceStore`

### 12.3 Tauri Command 边界

当前 `main.rs` 已注册 103 个 Tauri command，已覆盖：

1. 文件与工作区。
2. 图像处理。
3. AI。
4. 搜索。
5. 记忆。
6. 知识。
7. 分类器。
8. 工具调用。
9. 模板。
10. 工作区缓存、diff、时间轴、Agent 持久化。

这意味着 Tauri command 层已经不是薄壳，而是 Binder 前后端契约的主入口。

### 12.4 Rust 服务层职责

Rust 侧当前主要职责可以概括为：

| 层 | 主要模块 | 责任 |
|---|---|---|
| AI 服务层 | `ai_service`、`ai_providers/*`、`context_manager`、`tool_call_handler`、`tool_service` | 模型调用、上下文构建、工具执行 |
| 文档与预览服务层 | `pandoc_service`、`libreoffice_service`、`preview_service` | 文档转换、Office/PDF 预览 |
| 工作区事实层 | `workspace_db`、`workspace_commands`、`timeline_support`、`canonical_html` | 缓存、diff、时间轴、Agent 持久化 |
| 检索与知识层 | `search_service`、`memory_service`、`knowledge/*`、`template/service` | 搜索、记忆、知识、模板工作流 |
| 环境与文件层 | `workspace`、`file_watcher`、`file_commands` | 工作区管理、文件监听、文件操作 |

### 12.5 关键第三方依赖

当前系统对外部依赖有明确分工：

1. SQLite / `rusqlite`：本地持久化。
2. Pandoc：DOCX 类文档与 HTML 转换。
3. LibreOffice：Office 文档转 PDF 预览。
4. `notify`：文件监听。
5. `keyring`：API Key 安全存储。
6. OpenAI / DeepSeek API：模型推理。

## XIII. 数据持久化与本地存储结构

### 13.1 `workspace.db` 的真实角色

`workspace/.binder/workspace.db` 是当前项目的核心事实库，不只是缓存库。当前 schema 已演进到 `SCHEMA_VERSION = 8`，覆盖：

1. `file_cache`
2. `pending_diffs`
3. `file_dependencies`
4. `agent_tasks`
5. `agent_artifacts`
6. `memory_items` 及相关表
7. `timeline_nodes`、`timeline_restore_payloads`
8. `workflow_templates`、`workflow_template_documents`
9. 模板解析 / 编译缓存
10. 运行时工作流计划与执行状态

### 13.2 业务对象与持久化映射

| 持久化对象 | 主要表 / 文件 | 业务作用 |
|---|---|---|
| 文件 canonical 缓存 | `file_cache` | 打开复用、block id 保真、AI 基线 |
| 待审阅改动 | `pending_diffs` | Diff 审阅主链 |
| 文件依赖 | `file_dependencies` | 文件关系事实层 |
| Agent 任务 | `agent_tasks` | 任务恢复与阶段跟踪 |
| Agent Artifact | `agent_artifacts` | 中间产物记录 |
| 工作区记忆 | `memory_items`、`memory_usage_logs` | 记忆检索与注入 |
| 时间轴 | `timeline_nodes`、`timeline_restore_payloads` | 历史预览与恢复 |
| 知识库 | `knowledge_*` 系列表 | 知识条目、文档、切片、执行阶段 |
| 工作流模板 | `workflow_*` 系列表 | 模板与运行时执行 |

### 13.3 其他本地存储

除工作区数据库外，当前系统还有几类独立本地存储：

1. `workspace/.binder/search.db`：工作区全文索引。
2. `~/.config/binder/workspaces.json`：最近工作区。
3. `{data_dir}/binder/user_memory.db`：用户级记忆。
4. `{data_dir}/binder/cache/preview` 等缓存目录：预览和转换缓存。
5. 浏览器侧 `localStorage`：聊天 tab 元数据持久化。

## XIV. 当前系统边界、未完成项与风险说明

### 14.1 当前系统边界

当前 Binder 的真实边界应明确为：

1. 它是本地桌面文档工作台，不是完整协同办公平台。
2. 它能编辑文本类和文档转换类文件，但不能把所有 Office 类型都写成“可编辑”。
3. 它已有知识、模板、记忆、时间轴等系统，但这些系统成熟度并不一致。
4. 它的 AI 主链以“生成候选改动并交由用户审阅”为原则，不是无确认自动改正文。

### 14.2 未完成项

当前仍应明确写为未完成或待收口的部分包括：

1. 全文搜索完整产品化闭环。
2. 知识库导入与使用路径的统一入口。
3. 模板 / 工作流系统的更完整产品化。
4. Excel / 演示文稿编辑能力。
5. 多 Provider 扩展。
6. 构建模式或多 Agent 协作主链。

### 14.3 当前风险点

当前代码层面最需要注意的风险包括：

1. diff 依赖 block id、baseline 和快照一致性，跨会话与跨格式稳定性有限。
2. DOCX 类文档依赖 Pandoc，预览依赖 LibreOffice，外部环境缺失会直接影响功能可用性。
3. 搜索后端和 UI 挂载状态不完全一致，容易让文档描述高于现状。
4. 代码中仍保留旧表、旧组件和未接入组件，撰写现行文档时必须主动剔除。
5. 时间轴恢复的是工作区逻辑事实，不是完整应用会话恢复。

### 14.4 历史包袱与治理点

当前仓库中存在一批“仍在代码里但不应再进入主叙述”的残留：

1. 旧 `ai_tasks` 表。
2. 未接入主链的 `EditMode.tsx`。
3. 未挂载到主布局的独立全文检索面板。
4. 若干注释中的旧阶段命名和旧设计术语。

后续继续治理时，应优先区分“保留作为迁移兼容”与“继续作为现行能力维护”这两类代码。

## XV. 当前项目总结

从当前代码实现看，Binder 已经形成了一条清晰主链：以工作区为载体，以 TipTap 编辑器和本地文件系统为事实面，以 `workspace.db` 为核心持久化层，以 diff 审阅链承接 AI 编辑，并在其上逐步接入时间轴、记忆、知识、模板与 Agent 运行时能力。

当前项目的真实状态不是“理想中的 AI 办公套件”，也不是“只有编辑器雏形”。更准确的判断是：它已经具备一个本地 AI 文档工作台的核心骨架，并且若干扩展系统已真实落地，但这些扩展系统的成熟度、闭环程度和用户入口仍不一致，仍需要继续收口和治理。
