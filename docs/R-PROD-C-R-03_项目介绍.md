# Binder（合页）项目介绍

## 文档声明

本文只依据当前仓库中的实际实现整理，事实来源限定为：

- `src/`
- `src-tauri/src/`
- `package.json`
- `src-tauri/Cargo.toml`

本文不引用其他设计文档，不把规划当作现状，不把历史方案当作当前实现。

## 文档信息

- 结构编码：`PROD-C-R-03`
- 文档属性：`项目总览 / 当前实现总览`
- 更新时间：`2026-04-13`
- 项目版本：`0.1.0`

## I. 项目概述

### 1.1 当前项目形态

Binder 当前是一个基于 Tauri 2 的本地桌面应用，核心形态是“工作区 + 编辑器 + AI 协作”的文档工作台。

应用正常布局由 `MainLayout` 组织，包含：

1. 左侧工作区面板。
2. 中央编辑 / 预览区。
3. 右侧聊天区。
4. 底部状态栏。
5. 有 pending diff 时出现的底部待确认修改面板。

### 1.2 当前主使用方式

从代码实现看，当前主链是：

1. 选择一个本地目录作为 workspace。
2. 在文件树中打开、创建、移动、重命名、删除或整理资源。
3. 在中间区域编辑文本 / HTML / 转换后的文档内容，或预览其他文件类型。
4. 在右侧聊天区以 `chat` 或 `agent` 模式与 AI 协作。
5. AI 修改先形成 diff 候选，再由用户确认写入。

### 1.3 无工作区状态

当前实现明确支持“无工作区聊天”：

1. 启动后没有 workspace 时显示欢迎页。
2. 欢迎页可以直接创建临时聊天标签。
3. 此时可进入全屏聊天模式。
4. 无 workspace 时 `agent` 工具链不会成为主路径，完整工作区能力也不会接通。

### 1.4 当前定位

当前代码更接近“本地个人文档工作台”，不是多人协同平台，也不是纯聊天产品。

## II. 项目规模概览

### 2.1 统计口径

本节只统计核心源码：

- 前端：`src/` 下的 `.ts`、`.tsx`、`.css`
- 后端：`src-tauri/src/` 下的 `.rs`

不纳入文档、图片、锁文件、构建产物、依赖目录和其他资源文件。

### 2.2 规模总览

| 指标 | 当前结果 |
|---|---:|
| 核心源码文件数 | 247 |
| 核心源码总行数 | 77,556 |
| 前端代码行数 | 37,277 |
| 后端代码行数 | 40,279 |
| 前端占比 | 48.1% |
| 后端占比 | 51.9% |

### 2.3 技术分布

| 类型 | 行数 | 占比 | 说明 |
|---|---:|---:|---|
| `TypeScript` | 13,254 | 17.1% | 状态、服务、工具、类型与部分组件逻辑 |
| `TSX` | 23,575 | 30.4% | React 界面主体 |
| `CSS` | 448 | 0.6% | 局部样式补充 |
| `Rust` | 40,279 | 51.9% | Tauri 后端、AI、工作区数据库、搜索、知识、模板、记忆等 |

### 2.4 主要代码区域

| 目录 | 文件数 | 行数 | 说明 |
|---|---:|---:|---|
| `src/components` | 96 | 24,895 | 前端 UI 主体 |
| `src/components/Editor` | 33 | 9,500 | 编辑器、预览、文档交互主链 |
| `src/components/Chat` | 27 | 9,125 | 聊天、工具卡片、引用、Chat Build、diff 审阅交互 |
| `src/stores` | 11 | 3,744 | Zustand 状态层 |
| `src/services` | 14 | 2,822 | 前端服务封装 |
| `src/utils` | 30 | 3,566 | 前端通用工具与协议适配 |
| `src-tauri/src/services` | 52 | 26,936 | Rust 服务主体 |
| `src-tauri/src/commands` | 11 | 9,462 | Tauri command 边界 |
| `src-tauri/src/workspace` | 7 | 3,490 | workspace 数据库、缓存、diff、时间轴恢复 |

## III. 当前界面与主模块

### 3.1 欢迎页

欢迎页当前已接入：

1. 应用标题区。
2. 直接发起聊天的输入框。
3. 打开工作区。
4. 选择目录作为新工作区。
5. API Key 配置入口。
6. 最近工作区列表。

这里的“新建工作区”本质上仍是选择一个目录并调用 `open_workspace`，不是单独的工程初始化向导。

### 3.2 左侧工作区面板

`FileTreePanel` 当前固定挂载五个区块：

1. 工作区文件树。
2. 记忆库。
3. 知识库。
4. 模板库。
5. 时间轴。

顶部还有资源工具栏和搜索入口。

### 3.3 中央编辑区

中央区域按文件类型在“编辑”和“预览”之间切换，当前可见的主模块包括：

1. 编辑器标签页。
2. 编辑器工具栏。
3. TipTap 编辑器。
4. 编辑器状态栏。
5. 各类文件预览组件。
6. Inline Assist 面板。
7. 自动续写弹层。
8. 外部修改冲突对话框。
9. 文档分析面板。

### 3.4 右侧聊天区

聊天区当前包含：

1. 聊天标签页。
2. 消息列表。
3. 工具调用卡片与授权卡片。
4. 引用标签与引用管理。
5. 模型选择器。
6. Chat Build 面板。
7. Diff 汇总操作栏。

## IV. 当前能力总览

### 4.1 工作区与资源管理

当前已实现：

1. 打开 workspace。
2. 最近 workspace 列表读取与持久化。
3. 文件树构建。
4. 新建文件 / 文件夹。
5. 重命名、删除、复制、移动。
6. 拖拽导入文件到 workspace。
7. 基于分类器的文件分类与整理。

当前新建文件链已按“空白合法文件”收口：

1. 新建入口使用单一文件创建按钮展开类型菜单。
2. 新建文件默认不写入“新文档”等占位内容。
3. `.xlsx` / `.pptx` 等预览类文件会创建为可预览的合法空白 Office 文件。

工作区是多项能力的承接点。当前以下能力都依赖 workspace：

1. `workspace.db`
2. `search.db`
3. 时间轴
4. 知识库
5. 工作区记忆
6. Agent task / artifact 持久化
7. 文件缓存与 diff 基线

### 4.2 文件打开、编辑与预览

当前文件类型处理策略由 `documentService` 明确控制：

| 文件类型 | 当前策略 | 说明 |
|---|---|---|
| `.md` / `.txt` / `.html` | 直接编辑 | 进入 TipTap 编辑链 |
| `.docx` / `.doc` / `.odt` / `.rtf` | 转换后编辑或预览 | 编辑核心仍是 HTML + TipTap |
| `.xlsx` / `.xls` / `.ods` / `.csv` | 预览为主 | CSV 有表格链路；Excel/ODS 不进入正式编辑链 |
| `.pptx` / `.ppt` / `.ppsx` / `.pps` / `.odp` | 预览为主 | 转 PDF 预览 |
| `.pdf` | 预览 | 不可编辑 |
| 图片 | 预览 | 不可编辑 |
| 音频 / 视频 | 预览 | 不可编辑 |

### 4.3 文件来源与打开边界

当前代码区分三种文件来源：

1. `new`
2. `ai_generated`
3. `external`

实际打开规则是：

1. 文本类和 HTML 外部文件可以直接编辑。
2. Binder 创建或 AI 生成的文档类文件可以直接进编辑链。
3. 外部 `.docx/.doc/.odt/.rtf` 默认先预览，不直接进入编辑。
4. 外部文档存在草稿 / draft 路径，可以转入编辑链。

### 4.4 编辑器能力

当前编辑器基于 TipTap 3 和 ProseMirror，已经接入：

1. 基础富文本结构。
2. 图片、链接、表格、任务列表、颜色、下划线、上标、下标等扩展。
3. `tiptap-pagination-plus` 分页模式。
4. 自定义 `BlockIdExtension`。
5. `DiffDecorationExtension`。
6. `CopyReferenceExtension`。
7. `PageTopCaretExtension`。
8. `FontSize` 扩展。

当前编辑器还实现了：

1. `Cmd/Ctrl+J` 辅助续写。
2. `Cmd/Ctrl+K` 局部修改。
3. 外部文件修改轮询检测。
4. 编辑器内容更新事件监听。
5. 文档分析面板挂载。
6. 编辑缩放、分页和预览切换。

### 4.5 AI 协作能力

当前 AI 主链真实存在以下三层：

| 层级 | 入口 | 当前状态 |
|---|---|---|
| 辅助续写 | `Cmd/Ctrl+J` | 已实现 |
| 局部修改 | `Cmd/Ctrl+K` | 已实现 |
| 对话协作 | 右侧聊天区 | 已实现 |

### 4.6 AI Provider 与模型接入

Rust 侧 `AIService` 当前只真实注册两类 provider：

1. OpenAI
2. DeepSeek

前端当前内置模型选择项是：

1. `deepseek-chat`
2. `gpt-3.5-turbo`
3. `gpt-4`
4. `gpt-4-turbo`

API Key 当前通过系统 keyring 持久化，欢迎页和设置面板都能配置 OpenAI / DeepSeek 的 key。

### 4.7 聊天模式与工具调用

聊天标签有两种模式：

1. `chat`
2. `agent`

当前模式边界非常明确：

1. `chat` 模式按纯对话主链运行，不启用工具。
2. `agent` 模式才启用工具调用。
3. `agent` 模式要求 tab 绑定 workspace 才能形成完整能力闭环。

当前工具矩阵真实暴露的工具有：

1. `read_file`
2. `list_files`
3. `search_files`
4. `create_file`
5. `update_file`
6. `delete_file`
7. `move_file`
8. `rename_file`
9. `create_folder`
10. `edit_current_editor_document`
11. `save_file_dependency`

### 4.8 Diff 审阅链

AI 编辑当前遵循“先生成候选改动，再确认写入”的主原则。

当前已实现：

1. `pending_diffs` 持久化。
2. 前端 `diffStore` 运行时状态。
3. 编辑器内 diff 高亮。
4. 待确认修改面板。
5. 接受 / 拒绝 / 失效治理。
6. 应用关闭前针对未确认 diff 的拦截提醒。

这条链同时覆盖：

1. 当前正在编辑的文件。
2. 非当前文件的 workspace 级编辑。

### 4.9 Chat Build

当前仓库里已经有一条单独的 `Chat Build` 主链，不应再视为纯规划。

真实实现包括：

1. 从 `chat` 模式发起构建意图。
2. 基于最近对话生成 build outline。
3. 人工确认 outline 后进入正式构建。
4. 按步骤执行构建。
5. 在运行中显示当前步骤、状态和输出路径。
6. 支持中断请求。
7. 构建结束后展示完成 / 失败 / 中断总结。
8. 可直接打开生成资源。

当前边界也很明确：

1. `Chat Build` 只挂在 `chat` 模式下。
2. 正式构建要求已打开 workspace。
3. 它是单轮构建执行流，不是多 Agent 协同系统。

### 4.10 时间轴

时间轴当前已经进入主链。

已实现：

1. 节点列表读取。
2. 恢复预览。
3. 正式恢复。
4. 恢复前脏状态检查。
5. 恢复后刷新已打开标签页。

当前时间轴记录的事实主要是：

1. 文件内容变更。
2. 资源结构变更。

当前前端列表限制为最多 50 条，并以轮询方式刷新。

### 4.11 记忆库

记忆库当前不是占位模块，已经有真实数据层和 UI：

1. workspace 级记忆写入 `workspace.db`。
2. user 级记忆写入独立 `user_memory.db`。
3. FTS 检索。
4. 过期 / stale / superseded 状态治理。
5. 单项屏蔽与按层批量过期。
6. 标签页删除后的孤立记忆维护。
7. 启动时维护。
8. AI 对话链中的记忆检索与注入。

### 4.12 知识库

知识库当前也已接入实际使用链路：

1. 文件树中可以把工作区文件快照存入知识库。
2. `KnowledgeSection` 可以列出和搜索条目。
3. 支持显式知识库引用与拖拽引用。
4. 支持验证状态、访问策略、删除、替换、重建、重试、移动、重命名等操作。
5. 后端支持 chunk、citation、version、provenance 与自动检索注入。

当前更准确的说法是：知识库已经进入主链，但当前 UI 更偏“工作区文件快照入库 + 条目治理 + AI 注入”，不是完整的通用知识管理产品。

### 4.13 模板库

当前模板库真实定位是“工作流模板系统”，不是通用文档模板中心。

已实现：

1. 工作流模板创建。
2. 模板文档编辑与保存。
3. 模板状态切换。
4. 模板解析。
5. 模板编译。
6. RuntimeWorkflowPlan。
7. WorkflowExecutionRuntime。
8. 手动介入、恢复执行、推进步骤、标记失败等后端接口。

### 4.14 搜索

后端当前已实现全文搜索基础设施：

1. `search.db`
2. SQLite FTS5 索引
3. `search_documents`
4. `index_document`
5. `remove_document_index`
6. `build_index_async`

但当前用户主界面边界也很明确：

1. 独立全文搜索面板组件存在。
2. 主布局没有挂载它。
3. 左侧当前默认使用的是文件树过滤搜索，不是全文搜索面板。

## V. 当前关键边界

### 5.1 不应写成“已实现”的能力

以下能力当前不应写成现状：

1. Excel 编辑。
2. 演示文稿编辑。
3. 多 Agent 协同工作流。
4. 多 provider 扩展体系。
5. 完整产品化的全文搜索入口。

### 5.2 当前编辑边界

当前最重要的编辑边界有三条：

1. 打开的当前文件必须走 `edit_current_editor_document`。
2. 非当前文件才走 `update_file` 或 workspace 级 diff 链。
3. AI 修改默认进入待确认状态，而不是直接改盘。

### 5.3 当前跨会话边界

当前跨重启保留的内容并不完整：

1. 聊天 tab 元数据会持久化到 `localStorage`。
2. 聊天消息不会以同等方式完整持久化。
3. Chat Build 会话状态是前端运行时状态。
4. 编辑器 tab 主要是运行时状态。
5. Agent task / artifact 可以从 workspace 数据库恢复，但不是完整会话回放。

### 5.4 当前外部依赖边界

文档与预览能力当前依赖外部工具：

1. Pandoc：文档转换与 DOCX 编辑链。
2. LibreOffice：Office 文档转 PDF 预览链。

这些依赖缺失时，会直接影响相应功能可用性。

## VI. 技术架构

### 6.1 前端技术栈

当前前端主栈为：

1. React 18
2. TypeScript
3. Vite
4. Zustand
5. TipTap 3 / ProseMirror
6. Tailwind CSS

配套库包括：

1. `pdfjs-dist`
2. `xlsx`
3. `papaparse`
4. `diff`
5. `@tauri-apps/api`

### 6.2 后端技术栈

当前后端主栈为：

1. Tauri 2
2. Rust
3. `rusqlite`
4. `reqwest`
5. `notify`
6. `keyring`
7. `tokio`

### 6.3 当前主要后端职责

Rust 侧当前承担：

1. 文件系统与 workspace 操作。
2. AI 请求、流式响应和工具调用。
3. workspace 数据库与 canonical 缓存。
4. diff、时间轴、恢复。
5. 搜索索引。
6. 记忆库。
7. 知识库。
8. 模板工作流运行时。
9. 文档转换与预览。

### 6.4 Tauri Command 边界

`main.rs` 当前注册了 104 个 Tauri command，覆盖：

1. 文件与工作区。
2. 图像处理。
3. AI。
4. 搜索。
5. 记忆。
6. 知识。
7. 分类整理。
8. 工具调用。
9. 模板。
10. workspace 缓存、diff、时间轴与 agent 持久化。

## VII. 持久化与本地存储

### 7.1 `workspace.db`

`workspace/.binder/workspace.db` 是当前项目的核心事实库。

当前代码中 `SCHEMA_VERSION = 8`，主表覆盖：

1. `file_cache`
2. `pending_diffs`
3. `file_dependencies`
4. `agent_tasks`
5. `agent_artifacts`
6. 记忆相关表
7. `timeline_nodes`
8. `timeline_restore_payloads`
9. 工作流模板与运行时相关表
10. 知识库相关表

### 7.2 其他存储

当前还能确认的本地存储包括：

1. `workspace/.binder/search.db`
2. `~/.config/binder/workspaces.json`
3. `{data_dir}/binder/user_memory.db`
4. `{data_dir}/binder/cache/preview`
5. `{data_dir}/binder/cache/odt`
6. 浏览器侧 `localStorage` 中的聊天 tab 元数据

## VIII. 当前项目总结

从当前代码实现看，Binder 已经形成一条相对完整的本地主链：

1. 以 workspace 为上下文边界。
2. 以 TipTap 编辑器和多格式预览为文档交互核心。
3. 以 `workspace.db` 为事实层。
4. 以 diff 审阅机制承接 AI 编辑。
5. 在此基础上继续叠加时间轴、记忆、知识、模板和 Chat Build。

如果只按当前实现描述，Binder 不是“所有文档都可编辑”的办公套件，也不是“多 Agent 自动编排平台”。它当前更准确的定义是：一个本地桌面文档工作台，已经把文件管理、文本 / 文档编辑、AI 对话协作、diff 审阅、时间轴恢复，以及知识 / 记忆 / 模板等能力接入到同一条 workspace 主链中。
