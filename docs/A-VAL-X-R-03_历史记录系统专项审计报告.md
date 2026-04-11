# 历史记录系统专项审计报告

## 1. 审计目标与范围

### 1.1 本次审计目的

本次审计不是直接设计“历史记录系统”，而是基于当前代码库、当前文档、当前已有机制，判断 Binder 是否已经存在历史相关结构、这些结构各自负责什么、哪些只是相邻机制、哪些可以作为未来历史系统的基础，哪些若直接复用会造成结构性问题。

### 1.2 检查范围

本次审计覆盖以下范围：

1. 文档侧：`docs/`、`CLAUDE.md`、`CODEX.md`、`README.md`
2. 前端状态层：`src/stores/`
3. 前端 UI：`src/components/`
4. 前端服务与工具链：`src/services/`、`src/utils/`
5. 后端命令与服务：`src-tauri/src/commands/`、`src-tauri/src/services/`
6. Workspace 数据层：`src-tauri/src/workspace/`
7. 搜索、记忆、知识库等相邻系统：`search.db`、`memory_items`、`knowledge_*`

### 1.3 判定标准

本次审计采用以下判定口径：

1. “历史系统”要求至少具备持续记录、可追溯对象、相对稳定的定位或版本语义，而不是一次性 UI 提示。
2. “部分对齐”表示已经承担历史系统的一部分能力，但职责不完整。
3. “邻接但不同”表示经常与历史系统一起出现，但本身并不负责历史记录。
4. “可复用”表示适合作为未来历史系统的上游事件源、校验层或对象锚点。
5. “不建议复用”表示直接拿来当历史主存储或主模型会造成职责错位。

### 1.4 事实来源优先级

本次审计以当前代码实现为主事实来源。

当文档与代码不一致时：

1. 以代码为准
2. 文档差异单独列出
3. 不用文档推断不存在的实现

---

## 2. 当前项目内与“历史记录”相关的显式描述

### 2.1 明确提到“历史记录/历史分区”的文档

| 文档 | 当前表述 | 判定 |
|---|---|---|
| `docs/A-WS-M-D-01_workspace工作台协同主控文档.md` | 将“历史记录”定义为工作台五类资源入口之一，定位为“工作台级可观测操作历史入口” | 部分对齐，属于工作台入口定义，不是实现规范 |
| `docs/A-WS-M-T-04_资源管理.md` | 定义 `HistoryResource`，要求“历史记录按操作结果落库并受容量策略约束” | 部分对齐，属于资源层对象定义，但当前代码未落地 |
| `docs/R-WS-M-R-01_资源管理需求文档.md` | 旧体系中将“历史记录”作为资源区第三分区，并设想导入、导出、版本历史管理 | 零散提法，旧需求参考，不可直接视为当前实现 |
| `src/components/FileTree/HistorySection.tsx` | 直接命名为“历史记录”区域 | 显式历史入口，但实现极弱，只是本地占位 |

### 2.2 明确提到“撤销/重做/版本历史”的文档

| 文档 | 当前表述 | 判定 |
|---|---|---|
| `docs/R-PROD-C-R-01_Binder产品需求文档.md` | 提到“至少支持 50 步历史记录”“自动保存恢复”“备份和恢复” | 产品需求，未对应当前实现 |
| `docs/R-PROD-C-R-02_Binder产品开发方案.md` | 提到 `undo_redo_max_steps`、聊天历史、搜索历史记录 | 方案级设想，未落到当前主链 |
| `docs/R-ED-M-R-11_Excel功能需求文档.md` | 提到撤销/重做、版本历史查看与恢复 | Excel 需求层设想，当前仓库未见对应实现 |
| `docs/R-ED-M-R-10_分页模式光标与遮罩完整方案.md` | 提到“版本历史”章节 | 文档论述，不构成系统实现 |

### 2.3 明确提到 `revision / baseline / snapshot` 的文档

这些文档很多，但大多数并不是在定义历史系统，而是在定义当前轮 AI 编辑链路的定位真源和校验条件：

1. `docs/A-DE-M-D-01_对话编辑统一方案.md`
2. `docs/A-DE-M-T-01_diff系统规则.md`
3. `docs/A-DE-M-T-02_baseline状态协作.md`
4. `docs/A-SYS-I-P-01_数据结构定义.md`
5. `docs/A-SYS-M-T-01_数据流状态流.md`
6. `docs/R-DE-M-R-03_文档逻辑状态传递规范.md`

判定：

1. 这些文档明确描述了 `L / baseline / revision / snapshot`。
2. 这些结构服务的是“当前轮编辑定位、校验、失效控制”。
3. 它们不是正式的“历史记录系统”定义。

### 2.4 与历史概念容易混淆的显式文档

| 文档 | 容易混淆的点 | 实际语义 |
|---|---|---|
| 知识库文档，如 `docs/A-AST-M-T-03_Binder知识库技术主控文档.md` | 有 `active version`、`rollback`、`snapshot` | 这是知识库导入对象的版本体系，不是工作区文档历史 |
| 记忆库文档，如 `docs/A-AST-M-S-01_记忆服务数据库落地规范.md` | 有 `fresh/stale/expired/superseded`、可审计来源 | 这是记忆项治理，不是编辑历史 |
| Agent 文档，如 `docs/A-AG-M-T-03_任务规划执行.md` | 有“步骤可追溯、可回放” | 这是任务执行要求，当前只部分落地到 task/artifact，不是统一历史系统 |

结论：

当前文档中“历史记录”存在三类显式描述：

1. 工作台资源入口层的“历史记录分区”
2. 产品需求层的“撤销/重做/版本历史”设想
3. 编辑/知识库/任务系统中的 `revision/snapshot/version` 等相邻概念

它们没有在当前文档体系中收口成一个可执行的“历史记录系统”定义。

---

## 特别发现

### F-01：仓库里已经存在一个“伪历史系统”入口，但不是正式历史系统

`src/components/FileTree/HistorySection.tsx` 已经实现了一个“历史记录”面板，但其特点是：

1. 数据源是浏览器 `localStorage` 的 `binder-history`
2. 只在 `src/components/FileTree/ResourceToolbar.tsx` 中被调用
3. 当前只记录资源栏手动创建文件/文件夹及失败信息
4. 没有接入 `workspace.db`
5. 没有接入 AI 编辑、文件保存、diff 接受/拒绝、外部修改、任务执行

判定：

1. 这是一个“历史 UI 占位实现”
2. 不是正式历史系统
3. 是当前最容易误导后续建设的“伪历史结构”

### F-02：`pending diff + baseline/revision/snapshot gate` 已经形成“AI 变更历史雏形”

当前对话编辑主链已经具备以下历史相关能力：

1. diff 生成时绑定 `documentRevision`
2. diff 生成时绑定 `contentSnapshotHash`
3. diff 生成时绑定 `blockOrderSnapshotHash`
4. 接受/批量接受时做快照门禁与 `originalText` 校验
5. diff 有 `pending / accepted / rejected / expired` 状态

但当前问题是：

1. `accepted/rejected/expired` 只存在前端 `diffStore` 的内存态
2. `workspace.db.pending_diffs` 只保留未接受状态，并在接受/拒绝后直接删除
3. 没有持久化“已接受变更记录”或“历史事件表”

判定：

这是最接近未来“AI 变更历史系统”的现有主链，但目前仍停留在“候选审阅链”，不是正式历史系统。

### F-03：`agent_tasks / agent_artifacts` 已经形成“任务执行留痕雏形”

当前 `workspace.db` 中已存在正式表：

1. `agent_tasks`
2. `agent_artifacts`

并且：

1. `src/services/agentTaskPersistence.ts` 会写入 task/artifact
2. `src-tauri/src/commands/ai_commands.rs` 会写入 task stage、artifact summary
3. `src-tauri/src/services/context_manager.rs` 会把当前 task/artifact 摘要注入上下文

但当前问题是：

1. 它们记录的是“当前任务状态与近期 artifact”
2. 不是工作区统一历史
3. 不是文档变更历史
4. 没有统一事件时间线或回放视图

判定：

这是“任务执行历史”的局部结构，不应与文档历史混成一个系统。

### F-04：旧 `ai_tasks` 表是历史残留，不是当前基础

`workspace.db` migration v1 中保留了 `ai_tasks` 表，但当前主链不消费它，正式任务结构已转向 `agent_tasks / agent_artifacts`。

判定：

1. `ai_tasks` 是历史预留残留
2. 不建议直接复用为未来历史系统基础

---

## 3. 当前实现内与“历史记录”相关的实际结构

### 3.1 结构清单

| 结构名称 | 所在位置 | 当前职责 | 是否承担历史能力 | 判定 | 可靠性 |
|---|---|---|---|---|---|
| `HistorySection` + `binder-history` | `src/components/FileTree/HistorySection.tsx` | 工作台历史面板占位，本地展示最近若干资源操作 | 极弱，仅记录少量手工操作 | 邻接但不同 | 低 |
| `addHistoryRecord` | `src/components/FileTree/HistorySection.tsx` | 向 localStorage 写入历史条目 | 只支持本地 append | 邻接但不同 | 低 |
| `diffStore.byTab` | `src/stores/diffStore.ts` | 打开文件的对话编辑 diff 池 | 承担短期 AI 变更状态链 | 部分对齐，可复用 | 中 |
| `diffStore.byFilePath` | `src/stores/diffStore.ts` | 未打开文件或 workspace 文件级 pending diff 容器 | 承担短期文件级变更候选 | 部分对齐，可复用 | 中 |
| `baseline / baselineSetAt / getLogicalContent` | `src/stores/diffStore.ts` | 维护逻辑态 `L` 与已接受 diff 重放 | 承担“同轮真源重建”能力 | 部分对齐，可复用 | 中 |
| `documentRevision` | `src/stores/editorStore.ts` | 编辑器内容变化版本戳 | 承担当前编辑态版本推进 | 部分对齐，可复用 | 中 |
| `RequestContext(targetFile,L,revision,baselineId)` | `src/utils/requestContext.ts` | AI 请求时显式传递定位真源 | 提供轮次绑定，不是历史存储 | 邻接但不同 | 高 |
| `positioning_snapshot` IPC | `src-tauri/src/commands/positioning_snapshot.rs` | 工具执行前重采当前编辑器 `L + revision` | 保障实时一致性 | 邻接但不同 | 高 |
| `file_cache` | `src-tauri/src/workspace/workspace_db.rs` | 存当前文件快照、内容哈希、mtime | 有快照语义，但只有当前态 | 邻接但不同，可复用 | 中 |
| `pending_diffs` | `src-tauri/src/workspace/workspace_db.rs` | 存未接受文件级 AI diff | 只保留 pending，不保留历史 | 部分对齐，可复用 | 中 |
| `file_dependencies` | `src-tauri/src/workspace/workspace_db.rs` | 存跨文件依赖 | 无历史职责 | 邻接但不同 | 高 |
| `agent_tasks` | `src-tauri/src/workspace/workspace_db.rs` | 存任务目标、stage、lifecycle | 任务过程留痕 | 部分对齐，可复用 | 中 |
| `agent_artifacts` | `src-tauri/src/workspace/workspace_db.rs` | 存 verification/confirmation 等 artifact 摘要 | 任务过程留痕 | 部分对齐，可复用 | 中 |
| `memory_items` / `memory_usage_logs` | `src-tauri/src/services/memory_service.rs` | 存记忆项与注入日志 | 知识沉淀，不是历史回放 | 邻接但不同 | 高 |
| `chatStore.messages` | `src/stores/chatStore.ts` | 当前会话消息与工具块展示 | 运行期对话留痕 | 邻接但不同 | 中 |
| `search.db.documents` / `documents_fts` | `src-tauri/src/services/search_service.rs` | 当前文档全文索引 | 无历史职责 | 未对齐 | 高 |
| `knowledge_documents(version)` | `src-tauri/src/services/knowledge/repository.rs` | 知识库条目版本化与 active version 切换 | 有版本体系，但作用域独立 | 邻接但不同，严格隔离 | 高 |
| `ai_tasks` 旧表 | `src-tauri/src/workspace/workspace_db.rs` | 遗留预留结构 | 未进入主链 | 不建议复用 | 低 |

### 3.2 关键调用链

#### A. 打开文件的 AI 编辑链

`chatStore.sendMessage`  
-> `buildPositioningRequestContext`  
-> `edit_current_editor_document`  
-> `tool_service.resolve`  
-> `ChatPanel` 把 diff 写入 `diffStore.byTab`  
-> 用户在 `DiffCard` / `DiffAllActionsBar` 接受或拒绝  
-> `editorStore.updateTabContent` / `chatStore.refreshPositioningContextForEditor`

判定：

1. 这是打开文件的“内存态候选变更链”
2. 不是持久化历史链

#### B. 未打开文件的 AI 编辑链

`update_file(use_diff=true)`  
-> `tool_service` 读取 `workspace.db.file_cache` 或磁盘内容  
-> 生成 `workspace.db.pending_diffs`  
-> `ChatPanel` / `ToolCallCard` 写入 `diffStore.byFilePath`  
-> 用户在 `PendingDiffPanel` / `DiffAllActionsBar` 接受或拒绝  
-> `accept_file_diffs` / `reject_file_diffs`  
-> `pending_diffs` 被删除

判定：

1. 这是未打开文件的“数据库 pending 候选链”
2. 不是可追溯历史链

#### C. 文件快照链

`open_file_with_cache` / `open_docx_with_cache`  
-> `workspace.db.file_cache`  
-> `canonical_html_for_workspace_cache`  
-> 保存后 `sync_workspace_file_cache_after_save`

判定：

1. 这是“当前快照缓存链”
2. 不是版本快照历史链

#### D. 任务执行留痕链

`chatStore.sendMessage`  
-> `persistAgentTask`  
-> `ai_commands.rs` 中 `write_task_stage` / `persist_artifact_to_db`  
-> `workspace.db.agent_tasks / agent_artifacts`  
-> `context_manager.rs` 摘要注入

判定：

1. 这是“任务态留痕链”
2. 不是统一工作区历史系统

---

## 4. 历史记录功能的基础环境分析

### 4.1 编辑锚点基础

#### 已具备什么

1. `BlockIdExtension` 为块级节点分配 `data-block-id`
2. `editorOffsetUtils.ts` 已实现 `blockId + charOffset` 与 ProseMirror 位置互转
3. 支持单块和跨块区间
4. `anchorFromSelection` 能从当前选区提取精确锚点
5. `positioning_resolver.rs` 支持 `needle + occurrence_index + scope_block_id` 到 anchor 的解析

#### 缺什么

1. 缺少独立的“历史锚点稳定性协议”
2. 缺少“跨保存/跨重开/跨格式转换后的锚点可追溯性规则”
3. 缺少“历史事件引用哪个快照版本”的持久字段

#### 风险点

1. 对于打开文件的当前编辑链，`blockId + offset` 已足够支撑 diff 候选定位
2. 对于 DOCX，一旦经过 `DOCX -> HTML -> DOCX -> HTML` 重新转换，块结构和文本切分可能变化，旧锚点不保证长期稳定
3. 对于未打开文件链，当前主定位单位不是 block anchor，而是 `para_index + original_text`，与打开文件链并不一致

判定：

1. 当前锚点基础对“短周期 AI 候选审阅”是对齐的
2. 对“长期稳定历史定位”仅部分对齐

### 4.2 状态基础

#### 已具备什么

1. `diffStore` 已有 `pending / accepted / rejected / expired`
2. `baseline / baselineSetAt / getLogicalContent` 已定义逻辑态与显示态边界
3. `editorStore.documentRevision` 提供文档版本前进标记
4. `RequestContext` 已把 `targetFile/L/revision/baselineId/editorTabId` 传入 AI 链

#### 缺什么

1. 缺少统一历史状态对象，例如 `history_event`、`snapshot_id`、`causal_chain_id`
2. 缺少接受后的持久记录
3. 缺少统一“同一个文件的所有历史事件序列”

#### 风险点

1. 打开文件的 diff 状态主要存在前端内存，应用关闭后失去持久性
2. `getLogicalContent` 当前是重建能力，不是历史回放能力
3. `documentRevision` 是“当前态推进序号”，不是可检索版本链

判定：

1. 状态层对“当前轮 AI 变更控制”对齐
2. 对“历史记录系统主状态”未对齐

### 4.3 数据基础

#### 已具备什么

1. `workspace.db` 已经是统一工作区状态库
2. `file_cache` 有 `cached_content / content_hash / mtime`
3. `pending_diffs` 有文件级 pending 容器
4. `agent_tasks / agent_artifacts` 提供任务与 artifact 留痕
5. `memory_items / memory_usage_logs` 提供另一个 append-like 记录范式

#### 缺什么

1. 没有追加式历史表
2. 没有文档快照版本表
3. 没有接受/拒绝/失效的持久归档表
4. 没有统一操作日志表

#### 风险点

1. `file_cache` 每个文件只有当前行，反复覆盖，不能当版本历史
2. `pending_diffs` 在接受/拒绝后删除，不能当历史档案
3. `agent_tasks / agent_artifacts` 只覆盖任务过程，不覆盖普通用户编辑与文件保存
4. `search.db` 只索引当前内容，没有版本维度

判定：

1. 数据层具备建设历史系统的宿主环境
2. 数据层不具备现成历史主表
3. 若直接把现有表当历史主存储，会造成结构性错位

### 4.4 执行基础

#### 已具备什么

1. AI 编辑接受前有 `revision/content snapshot/block order/originalText` 多重校验
2. 外部修改检测已接入 `mtime`
3. 非当前文档执行有四态门禁：`targetFileResolved/canonicalLoaded/blockMapReady/contextInjected`
4. `ExecutionExposure` 已形成结构化失败暴露

#### 缺什么

1. 缺统一的历史事件流
2. 缺统一的动作入口枚举
3. 缺“用户编辑/AI 编辑/保存/外部修改/切换工作区”统一落账点

#### 风险点

1. 当前事件分散在 `editorStore`、`chatStore`、`diffStore`、`workspace_commands`、`file_commands`、`ai_commands`
2. 打开文件与未打开文件走两套主链，若未来历史系统在下游补抓，会天然分叉
3. 当前“失败暴露”和“业务失效”已分离，这是优点；但这些暴露多数仍在前端内存中

判定：

1. 执行层已具备较强校验基础
2. 未具备统一历史采集总线

### 4.5 UI / 交互基础

#### 已具备什么

1. `DiffCard` 能承载单条 AI 变更候选
2. `DiffAllActionsBar` 能承载批量决策
3. `PendingDiffPanel` 能承载未打开文件的文件级待确认变更
4. `HistorySection` 提供了“历史记录”分区容器
5. `AgentShadowStateSummary` 提供任务阶段摘要

#### 缺什么

1. 缺统一历史列表模型
2. 缺历史筛选、时间线、对象维度切换
3. 缺历史详情页或回放页
4. 缺用户可区分的“pending diff / 已接受历史 / 任务过程 / 资源操作历史”边界

#### 风险点

1. 直接把 `DiffCard` 当历史卡，会把“候选审阅”误当“历史归档”
2. 直接把 `HistorySection` 扩成总历史，而不拆分来源，会把资源操作、AI diff、任务状态、记忆注入混在一起

判定：

1. UI 层已有邻近容器
2. UI 层没有正式历史系统承载模型

### 4.6 一致性与可追溯性基础

#### 已具备什么

1. 文件主键稳定：`workspacePath + filePath`
2. 对话侧已有 `chatTabId / messageId`
3. diff 侧已有 `diffId / toolCallId / agentTaskId`
4. 请求侧已有 `baselineId / revision`
5. 快照侧已有 `content_hash / mtime`

#### 缺什么

1. 缺单个历史事件的统一 ID
2. 缺对象到历史事件的稳定外键关系
3. 缺“同一事件涉及快照、diff、任务、消息”的因果链记录

#### 风险点

1. 当前可追溯性是“多 ID 并存但没有统一收口”
2. 直接做历史 UI 时，很容易出现同一事实在多个模块里重复显示

判定：

1. 可追溯性基础部分对齐
2. 一致性收口仍未完成

---

## 5. 并行功能 / 雷同结构排查

| 结构 | 当前职责 | 与历史系统是否重叠 | 判断 | 是否可复用 | 是否需隔离 | 赘余风险 |
|---|---|---|---|---|---|---|
| `pending diffs` | 待确认 AI 修改候选 | 重叠一部分 | 部分对齐 | 可复用为“候选层” | 需要与正式历史层分离 | 高 |
| `DiffCard / FileDiffCard` | 展示待确认或已处理的 diff | 重叠 UI 形态 | 邻接但不同 | 可复用部分视觉与交互 | 需要隔离 | 高 |
| accept/reject 机制 | 驱动候选转已接受/拒绝/失效 | 重叠事件源 | 部分对齐 | 可复用为事件源 | 不应与历史存储合并 | 中 |
| `file_cache` | 当前文件快照缓存 | 有 snapshot 味道 | 邻接但不同 | 可复用为当前基线 | 必须隔离 | 高 |
| `content_hash / mtime` | 一致性校验 | 只提供校验 | 邻接但不同 | 可复用 | 不必单独隔离 | 低 |
| `agent_tasks` | 当前任务目标与阶段 | 与任务历史重叠 | 部分对齐 | 可复用到任务历史分支 | 需要与文档历史隔离 | 中 |
| `agent_artifacts` | 任务确认/验证/阶段产物摘要 | 与任务历史重叠 | 部分对齐 | 可复用 | 需要与文档历史隔离 | 中 |
| `memory_items` | 记忆沉淀与检索 | 名义上都是“过去信息” | 邻接但不同 | 不建议复用为历史主链 | 必须隔离 | 高 |
| `chatStore.messages` | 会话消息历史 | 与聊天历史重叠 | 邻接但不同 | 仅可作为来源引用 | 需要隔离 | 中 |
| workspace 状态 | 打开工作区、打开文件、当前标签、刷新等 | 只反映当前态 | 邻接但不同 | 可作为事件源 | 需要隔离 | 低 |
| 外部修改检测 | 发现磁盘与内存不一致 | 与“工作区事件历史”有交集 | 部分对齐 | 可复用为事件源 | 需要隔离 | 中 |
| `file_dependencies` | 依赖关系 | 不承担历史 | 未对齐 | 一般不复用 | 可隔离 | 低 |
| `ExecutionExposure` | 结构化失败暴露 | 与审计日志相邻 | 部分对齐 | 可复用为观测事件子流 | 需要与业务历史区分 | 中 |
| `knowledge_documents(version)` | 知识库文档版本化 | 与“版本”概念重叠 | 邻接但不同 | 不建议跨域复用 | 必须严格隔离 | 高 |
| `ai_tasks` 旧表 | 历史预留残留 | 容易被误当任务历史基座 | 邻接但不同 | 不建议复用 | 应隔离或清理 | 中 |

### 5.1 逐项判断

#### `pending diffs`

1. 它是未来历史系统最重要的上游事件源之一。
2. 但它本身只描述“待用户决策的候选修改”。
3. `workspace.db.pending_diffs` 接受/拒绝后会被删除，不能直接充当历史档案。

判定：部分对齐，可复用，不建议直接当历史主表。

#### `diff cards`

1. 它们是“审阅容器”。
2. 核心职责是帮助用户决定接受/拒绝，而不是查看既往时间线。

判定：邻接但不同，可复用部分 UI，不建议直接等同于历史卡。

#### accept / reject 机制

1. 它们是强事件源。
2. 后续若做历史系统，应把这里作为“事件写入点”而不是“历史存储点”。

判定：部分对齐，可复用。

#### `file_cache`

1. 当前只有每文件一条当前快照。
2. 用它做历史系统会让“当前缓存”和“历史版本”混成一张表。

判定：邻接但不同，只适合作为当前基线，不建议直接复用为历史表。

#### `agent_tasks / agent_artifacts`

1. 它们已经承担任务留痕。
2. 若未来做“任务执行历史”，可以直接扩展。
3. 若未来做“文档版本历史”，不应把二者当主表。

判定：部分对齐，可复用，但需要明确为“任务历史分支”。

#### `memory`

1. 记忆是提炼过的稳定知识，不是按时间顺序回放的原始历史。
2. 把历史系统做到记忆库里会立即导致用户无法区分“事实沉淀”和“过程留痕”。

判定：邻接但不同，不建议复用，必须隔离。

#### chat 历史

1. 当前消息历史主要服务当前会话展示。
2. `chatStore` 持久化时只保留 tab 元数据，不保留 `messages`。
3. 因此它甚至不是完整持久化聊天历史。

判定：邻接但不同，不足以承担正式历史系统。

#### 外部修改检测

1. 它是很好的工作区事件源。
2. 但当前只负责弹窗与让相关 diff 过期。

判定：部分对齐，可复用为未来历史事件。

### 5.2 总结判断

Binder 当前已经存在若干“伪历史系统”或“局部历史结构”：

1. `HistorySection`：伪历史系统，只负责极少量本地资源操作展示，不负责真实工作区历史
2. `pending diff + byTab/byFilePath`：局部历史结构，只负责 AI 变更候选与短期状态流转，不负责长期归档
3. `agent_tasks / agent_artifacts`：局部历史结构，只负责任务过程留痕，不负责文档变更历史
4. `knowledge_documents(version)`：平行版本系统，只负责知识库版本，不负责工作区编辑历史

---

## 6. 文档描述与实际实现的偏差

### 6.1 文档说了但代码没做

| 文档说法 | 当前代码现状 | 判定 |
|---|---|---|
| `A-WS-M-T-04_资源管理.md` 要求“历史记录按操作结果落库并受容量策略约束” | 当前只有 `HistorySection.tsx` 的 localStorage，本地 50 条上限，未落 `workspace.db` | 未对齐 |
| 工作台/资源管理文档把“历史记录”当正式资源分区 | UI 有分区，但没有正式后端历史模型 | 部分对齐 |
| 产品/方案文档提出 50 步撤销重做、版本历史、历史记录搜索 | 当前无专门撤销/重做 UI、无版本历史表、无历史搜索实现 | 未对齐 |
| 若干旧需求文档提出导入导出、版本管理、云端历史 | 当前未见历史主链实现 | 未对齐 |

### 6.2 代码有了但文档容易低估或没写清

| 当前代码事实 | 文档情况 | 判定 |
|---|---|---|
| `diffStore` 已有 `pending/accepted/rejected/expired` 与 snapshot gate | 文档大量写 diff 规则，但未把它明确标为“AI 变更历史雏形” | 部分对齐 |
| `agent_tasks / agent_artifacts` 已正式落库 | 文档有说明，但容易被工作台“历史记录”概念掩盖 | 部分对齐 |
| `ExecutionExposure` 已经形成结构化失败暴露链 | 文档强调观测，但 UI/持久化边界尚未收口 | 部分对齐 |
| `chatStore` 不持久化 `messages` | 旧文档对“聊天历史”的理解容易比当前实现更强 | 部分对齐 |

### 6.3 文档表达容易误导的点

1. “历史记录分区”容易让人误以为 Binder 已经有正式历史系统，代码并非如此。
2. `revision` 容易被误读为“版本历史编号”，当前它只是当前内容推进戳。
3. `snapshot` 容易被误读为“历史快照版本”，当前大多数 snapshot 只服务当前轮定位或当前缓存。
4. 知识库里的 `version / rollback / snapshot` 容易被误当成工作区文档历史能力，实际上是独立子系统。

### 6.4 明确的文档与代码不一致项

1. `CLAUDE.md` 中关于 DOCX “无 canonical cache、每次打开 block ID 重建”的说法，已与当前 `open_docx_with_cache`、`sync_workspace_file_cache_after_save` 主链不一致。
2. 资源/工作台文档中“历史记录落库”已被写成主结构要求，但当前代码只实现了 localStorage 占位。

---

## 7. 结论：Binder 当前是否适合建设历史记录系统

### 7.1 当前是否有基础

有基础，但基础是不完整且分裂的。

更准确地说：

1. Binder 已具备建设“AI 变更审计型历史系统”的主要前置条件
2. Binder 已具备建设“任务执行留痕历史”的局部前置条件
3. Binder 不具备直接建设“稳定的全量文档版本历史系统”的现成基础

### 7.2 当前更适合做哪一类历史系统

当前更适合的不是传统 Git 式或 Word 式“版本历史”，而是：

**以 AI 变更历史为主、任务执行历史为辅的混合型审计历史系统。**

原因：

1. 现有最强的数据源来自 `pending diff / accept-reject / snapshot gate`
2. 其次是 `agent_tasks / agent_artifacts`
3. 当前并不存在稳定的全量版本快照链

### 7.3 当前最不应该重复建设的部分

最不应该重复建设的是：

1. `pending diff` 审阅链
2. `file_cache` 当前快照链
3. `agent_tasks / agent_artifacts` 任务留痕链

原因：

如果未来另做一个“历史系统”去再次保存一套 pending、再次做一套任务状态、再次维护一套当前快照，会立即出现两个“都像历史”的系统。

### 7.4 当前若直接上历史记录系统，最大结构性风险是什么

最大结构性风险是：

**把“候选 diff”“当前缓存”“任务留痕”“记忆沉淀”“聊天展示”这些不同职责的结构，误收口成一个名为历史记录的总容器。**

具体会导致：

1. 数据源重复
2. 打开文件链和未打开文件链历史口径不一致
3. 用户无法区分“待确认修改”和“已发生历史”
4. 用户无法区分“任务过程”和“文档演进”
5. 后续会出现两个看起来都像版本历史的系统

结论性判断：

1. 当前适合单独立项做历史系统
2. 但前提是先把边界拆清
3. 不应直接在现有 `HistorySection` 或 `file_cache` 上补丁式扩张

---

## 8. 后续建议（审计后的克制建议）

### 8.1 先补哪些基础

1. 先补统一历史事件模型，最少区分：资源操作、AI 候选变更、AI 变更决策、文件保存、外部修改、任务阶段事件
2. 先补“已接受/已拒绝/已失效 diff”的持久层，而不是只保留 pending
3. 先补打开文件链与未打开文件链的统一事件口径

### 8.2 哪些现有结构应优先复用

1. 复用 `diffId / toolCallId / messageId / chatTabId / agentTaskId / baselineId / revision`
2. 复用 `ExecutionExposure` 作为失败暴露子流
3. 复用 `agent_tasks / agent_artifacts` 作为任务历史分支

### 8.3 哪些概念必须先拆清

1. `历史` 不等于 `pending diff`
2. `版本` 不等于 `revision`
3. `记忆` 不等于 `历史`
4. `任务过程` 不等于 `文档变更`
5. `当前快照缓存` 不等于 `历史快照`

### 8.4 是否应单独立项

应单独立项。

原因：

1. 当前涉及工作台、编辑器、AI、workspace.db、任务系统、UI 分区
2. 不属于单文件增强或单表扩展
3. 如果不单独立项，极易继续把“历史”分散进不同模块

### 8.5 是否需要新增专项约束文档

需要。

最少应有一份专门文档先冻结：

1. 历史系统边界与非目标
2. 历史对象分类
3. 与 diff / version / memory / task / knowledge 的隔离关系

---

## 附录A：《历史记录系统候选边界草表（审计视角）》

| 对象/结构 | 当前职责 | 是否建议纳入未来历史系统 | 原因 | 与哪个现有模块最容易冲突 |
|---|---|---|---|---|
| `pending_diffs` | 待确认 AI 变更 | 建议纳入，但仅作为候选层 | 是最核心的上游事件源之一 | `DiffCard` / `diffStore.byTab` |
| `accepted/rejected/expired diff` | 当前只在前端内存态存在 | 建议纳入 | 这是最接近真实 AI 变更历史的对象 | `diffStore` |
| `file_cache` 当前行 | 当前快照缓存 | 不建议直接纳入 | 它是 current state cache，不是历史版本链 | `workspace.db.file_cache` |
| `documentRevision` | 当前编辑态推进戳 | 建议作为辅助字段纳入，不建议单独成系统 | 可做事件版本标签，但不能独立承担版本历史 | `editorStore` |
| `baselineId / contentSnapshotHash / blockOrderSnapshotHash` | 当前轮定位与校验 | 建议作为事件元数据纳入 | 对历史可校验性有价值 | `requestContext` / `diffStore` |
| `DiffCard` | 待确认 AI 修改审阅 UI | 不建议直接纳入 | 它是展示容器，不是历史对象 | `历史列表 UI` |
| `PendingDiffPanel` | 文件级待确认修改 UI | 不建议直接纳入 | 只适合候选审阅 | `历史列表 UI` |
| `agent_tasks` | 当前任务目标与阶段 | 建议纳入任务历史分支 | 适合任务执行历史，不适合文档版本历史 | `历史系统主表` |
| `agent_artifacts` | verification/confirmation 摘要 | 建议纳入任务历史分支 | 可作为任务过程证据 | `agent_tasks` |
| `memory_items` | 提炼后的长期记忆 | 不建议纳入 | 语义是沉淀知识，不是过程留痕 | `历史系统` / `记忆库` |
| `chatStore.messages` | 当前会话消息展示 | 不建议直接纳入 | 运行态消息并不稳定持久 | `聊天记录` |
| 外部修改事件 | 检测磁盘变化 | 建议纳入 | 是工作区事件历史的重要来源 | `WorkspaceFile` 状态 |
| 文件保存事件 | 落盘成功 | 建议纳入 | 是真实版本推进时刻 | `documentService.saveFile` / `sync_workspace_file_cache_after_save` |
| 资源创建/删除/重命名 | 工作区资源操作 | 建议纳入 | 属于工作台操作历史 | `HistorySection` |
| `HistorySection` localStorage 记录 | 本地少量 UI 历史 | 不建议直接纳入 | 实现过轻，易误导 | 工作台历史分区 |
| `knowledge_documents(version)` | 知识库版本化 | 不建议纳入 | 作用域独立，必须隔离 | 知识库系统 |
| `ai_tasks` 旧表 | 历史残留预留表 | 不建议纳入 | 已被正式结构替代 | `agent_tasks` |

