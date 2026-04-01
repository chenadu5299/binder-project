# Binder Workspace 改造可落地实施方案

> 版本：v1.3 | 基于《Binder Workspace 改造完整技术方案》与当前代码实现；**v1.3** 更新实施状态、外部修改策略与 file_cache 覆盖范围
> 
> 核心约束：t-docx 分页编辑体验零影响，TipTap 层不动
>
> 说明：本文是 Workspace / 文件级 pending diff / 构建模式相关实施方案。凡涉及层次三对话编辑当前主链的目标文档、Resolver、diff 失效、提示词、非当前文件编辑路径，一律以 [对话编辑-主控设计文档.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/对话编辑-主控设计文档.md)、[对话编辑-统一整合方案（待确认版）.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/对话编辑-统一整合方案（待确认版）.md)、[层次三（对话编辑）提示词详细分析文档.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/层次三（对话编辑）提示词详细分析文档.md) 为准。本文中的 `update_file + use_diff` 方案不再作为层次三当前主口径。

---

## 一、改造目标与决策点确认

| # | 决策点 | 确认结论 |
|---|--------|----------|
| 1 | 持久化方案 | 新建 `.binder/workspace.db` |
| 2 | 文件依赖关系 | 本次包含，数据结构+逻辑全做 |
| 3 | 写盘时机 | AI 生成 diff 后不写盘，用户确认后才写 |
| 4 | Workspace 边界 | 文件夹模式（复用 `currentWorkspace`） |
| 5 | 外部修改冲突 | 复用 ExternalModificationDialog；加载外部更改时 pending diffs **静默失效**（与手动编辑 diff 区域行为一致），不提供「保留 diff」选项 ✅ 已实现 |
| 6 | 用户感知 | 先不动 UI，内部验证后再看 |
| 7 | originalText 匹配 | 段落顺序 + originalText 双重匹配 |
| 8 | 缓存内容 | **所有文件类型**均存 HTML + 路径 + mtime；DOCX 不持久化 blockId（每次 open 重解析）；md/txt 直接存 TipTap 编辑器 HTML（含 blockId，跨会话保持 ID 一致）✅ 已实现 |
| 9 | 批量确认交互 | 两种都要：单文件确认 + 一键全部确认 |
| 10 | 构建模式前置 | 当前版本需打基础：TruncationStrategy 可扩展、ToolErrorKind 错误类型（见 Phase 0.5） |

---

## 一点五、与《对话编辑-主控设计文档》对齐：路 A、快照与 blockId 连续性

> **主控文档**：`对话编辑-主控设计文档.md`（SSOT）。本节只列 **Workspace 侧必须承接的约束**；不重复主控全文。

### 1.5.1 路 A（未打开文件也可精准编辑）

在**用户未打开编辑器 tab** 时，若产品允许「一句话改某文件」，Workspace / 后端须能：

1. **读盘**（或读 `file_cache` 中与编辑器一致的 HTML 源）；  
2. **规范 HTML**（与 TipTap 导入规则对齐，docx/Pandoc 差异在改造中逐项收口）；  
3. **注入 `data-block-id`**（与编辑器块类型白名单一致），形成**可定位快照**；  
4. 在此快照上跑 **Resolver / 或消费模型给出的 anchor**，产出与《对话编辑-主控设计文档》第九节一致的 **canonical diff**。

**无视图则不冒充能定位**——见主控 §1.4；未建快照前不得声称块级精准。

### 1.5.2 快照与「随后打开编辑器」同源（主控 §6.3）

用户经路 A 产生 pending diff 后**再打开**同一文件时，打开流程**必须**复用与快照**同一套 blockId**（HTML 已持久化 id，或 `file_path + content_hash → id 映射` 在 load 时灌入）。**禁止**在内容未变时因重新解析而整套更换 UUID 且不合并映射——否则属主控定义的**缺陷类**问题。

### 1.5.3 与本方案后续 Phase 的挂接

| 建议挂接 | 说明 |
|----------|------|
| Phase 0.x / 1.x | `file_cache` 扩展：除 HTML + mtime 外，增加 **blockId 映射或带 id 的规范 HTML** 的存储策略（具体表结构在实现阶段写入本文 **Phase** 表） |
| 与 `open_file` / `addTab` | 前端打开文件时优先消费 **workspace 已存在的快照**，使编辑器首屏与路 A 一致 |
| 与 `update_file` + `use_diff` | 文件级 pending diff / Workspace 专项参考；不再作为层次三对话编辑当前主链 |
| **1.5.4** | `normalizeHtml` / `injectBlockIds` 唯一入口、结构指纹验收、docx 回归 |

详细任务拆解在后续修订中并入 **「三、实施阶段划分」** 对应 Phase，并互链主控 **P4**。

### 1.5.4 唯一 normalize 管道与「content_hash ≠ 结构等价」

**与《对话编辑-主控设计文档》中定位真源与 Workspace 管道约定一致**（原「统一优化开发步骤」§2.4 已合并入主控），Workspace 侧须遵守：

1. **唯一入口**：凡生成或更新 `canonical_html_with_ids` 的路径，均为  
   `原始 HTML / Pandoc 输出 / 读盘文本` → **`normalizeHtml(...)`**（单实现、可版本号）→ **`injectBlockIds(...)`**（与前端 `BLOCK_NODE_NAMES` 白名单一致）→ 落 `file_cache` 或等价存储。  
   **禁止**：编辑器保存、Pandoc 直出、`read_file` 各写一套「随手打 id」逻辑。

2. **验收**：除字节级 `content_hash` 外，对关键路径增加 **结构指纹**（例如 canonical 后再 hash、或持久化块 id 有序列表并与打开编辑器首屏比对）。**同一 content_hash 不同块树** 在测试中须表现为**失败或强制重跑 normalize**，避免「看似统一、实际随机漂移」。

3. **与 Phase 挂接**：在 **「三、实施阶段划分」** 中新增或并入子任务：`normalizeHtml` crate/模块、与 `open_docx` / `read_file` 的接线点、回归用例（docx 往返）。

---

## 二、当前代码结构映射

### 2.1 后端（Rust）关键路径

| 功能 | 当前文件 | 当前实现 |
|------|----------|----------|
| 文件读取 | `commands/file_commands.rs` | `read_file_content(path)` L35 |
| 文件写入 | `commands/file_commands.rs` | `write_file(path, content)` L77 |
| DOCX 编辑打开 | `commands/file_commands.rs` | `open_docx_for_edit(path)` |
| update_file 工具 | `services/tool_service.rs` | `update_file()` L310-384，直接写盘 |
| edit_current_editor_document | `services/tool_service.rs` | `edit_current_editor_document()` L1217-1442 |
| Diff 计算 | `services/diff_service.rs` | 已有 DiffService |
| 上下文构建 | `services/context_manager.rs` | `build_multi_layer_prompt` |
| 命令注册 | `main.rs` | `invoke_handler` L50-110 |

### 2.2 前端（TypeScript）关键路径

| 功能 | 当前文件 | 当前实现 |
|------|----------|----------|
| 打开文件 | `services/documentService.ts` | `openFile` → `openFileWithStrategy` |
| 文本/MD/HTML 打开 | `documentService.ts` L363-434 | `invoke('read_file_content')` → `addTab` |
| DOCX 打开 | `documentService.ts` L436-490 | `invoke('open_docx_for_edit')` → `addTab` |
| diffStore | `stores/diffStore.ts` | `byTab`（keyed by filePath）+ `byFilePath`；`acceptFileDiffs`、`rejectFileDiffs`、`resolveFilePathDiffs` 均已实现 ✅ |
| editorStore | `stores/editorStore.ts` | `addTab(filePath, fileName, content, ...)` |
| 工具结果处理 | `ChatPanel.tsx` | `edit_current_editor_document` 写入 diffStore |
| 外部修改对话框 | `ExternalModificationDialog.tsx` | 两个选项：继续覆盖 / 加载更改；含 `hasPendingDiffs` / `onReloadKeepDiffs` props（暂不使用） |
| 外部修改处理 | `EditorPanel.tsx` | ✅ 已接入：5 s 轮询检测 mtime → 弹 `ExternalModificationDialog`；加载外部更改时静默 expire 所有 pending diffs |
| 应用关闭警告 | `MainLayout.tsx` | ✅ 已实现：`onCloseRequested` 检测 pending diffs，有则弹确认框 |
| 保存后缓存同步 | `documentService.ts` + `workspace_commands.rs` | ✅ 已实现：所有文件类型保存后调用 `sync_workspace_file_cache_after_save`；md/txt 存 TipTap HTML |

### 2.3 依赖库

- **rusqlite**：已存在（Cargo.toml L32），用于 workspace.db
- **similar**：已存在（Cargo.toml L42），用于 diff 计算

---

## 三、实施阶段划分

### Phase 0：基础设施 ✅ 已完成

**目标**：建立 workspace.db 与 WorkspaceStore 骨架，不改变现有流程。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 0.1 | 新建 `src-tauri/src/workspace/` | 创建目录 |
| 0.2 | 新建 `workspace_db.rs` | Schema 定义、初始化、WAL 模式 |
| 0.3 | 新建 `workspace_store.rs` | `WorkspaceDb` 结构体，`get_file_cache`、`upsert_file_cache` |
| 0.4 | `main.rs` | 添加 `workspace_db: Arc<Mutex<WorkspaceDb>>` 到 AppState（需新建或扩展现有 State） |
| 0.5 | 新建 `workspace_commands.rs` | 暴露 `open_file_with_cache`、`ai_edit_file_with_diff` 等命令（暂不接入主流程） |

**验收**：调用 `open_file_with_cache` 能返回内容；`ai_edit_file_with_diff` 能写入 pending_diffs 表。

---

### Phase 0.5：构建模式架构前置（0.5-1 天）⚠️ 必须当前版本完成

**目标**：为构建模式打基础，避免后续改动扩散。仅做接口/结构定义，不改变现有行为。

| 能力 | 类型 | 说明 |
|------|------|------|
| 任务状态持久化 | 加逻辑 | ai_tasks 表已设计，构建模式来再加；**当前不需要** |
| 多文件原子性 | 加逻辑 | pending_diffs 天然软原子性，构建模式来再加 task_id 关联；**当前不需要** |
| 执行过程可观测 | 加逻辑 | ToolCallCard 已有，构建模式来再加进度条 UI；**当前不需要** |
| **上下文窗口管理** | **改架构** | 当前截断会丢掉早期任务目标，构建模式会提前暴露；**必须当前打基础** |
| **工具调用失败策略** | **改架构** | 当前全部重试后报错，构建模式需区分 Retryable/Skippable/Fatal；**必须当前打基础** |

| 步骤 | 文件 | 操作 |
|------|------|------|
| 0.5.1 | `context_manager.rs` | 新增 `TruncationStrategy` 枚举：`KeepRecent(usize)` / `SummarizeMiddle` / `KeepTaskGoal`；新增 `truncate_with_strategy(messages, strategy)`；**当前只实现 KeepRecent**，内部调用现有 `truncate_messages` 逻辑；ai_commands 中调用处改为 `truncate_with_strategy(..., KeepRecent(N))` |
| 0.5.2 | `tool_service.rs` | 新增 `ToolErrorKind` 枚举：`Retryable` / `Skippable` / `Fatal`；`ToolResult` 增加 `error_kind: Option<ToolErrorKind>`；各工具失败时根据错误类型设置 error_kind（当前版本可先全部设为 `None` 或 `Fatal`，构建模式来再细化分类） |
| 0.5.3 | 序列化/前端 | `ToolResult` 的 `error_kind` 需序列化到 JSON 返回给前端和 AI；构建模式任务调度层据此决定重试/跳过/中止 |

**验收**：`truncate_with_strategy` 可调用，现有截断行为不变；`ToolResult` 含 `error_kind` 字段，现有工具调用流程无回归。

**详见**：6.10 上下文截断策略可扩展性、6.11 工具错误类型标记。

---

### Phase 1：update_file 接入 diff 流程 ⏳ 未实现

**目标**：AI 修改未打开文件时，走 diff 流程，不立即写盘。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 1.1 | 新建 `src-tauri/src/workspace/diff_engine.rs` | `generate_pending_diffs(old, new)`，基于 similar 库，输出 `para_index + original_text + new_text` |
| 1.2 | `tool_service.rs` | 文件级 pending diff 历史方案：`update_file + use_diff`，不再作为层次三对话编辑当前主链 |
| 1.3 | `tool_definitions.rs` | 文件级 pending diff 历史方案参考 |
| 1.4 | `context_manager.rs` | 旧 prompt 规则参考，不再作为层次三当前口径 |
| 1.5 | `tool_service.rs` | 旧兜底逻辑参考，不再作为层次三当前口径 |

**注意**：`use_diff` 的判断不应放在 `ai_commands.rs`。命令层强行注入会导致 AI 调用意图与实际执行不一致，调试困难。正确做法是 prompt 明确规则 + tool_service 兜底。

**验收**：AI 修改未打开文件后，workspace.db 的 pending_diffs 表有记录；磁盘文件未被修改。

---

### Phase 2：前端 diffStore 扩展 + openFile 接入 ⚠️ 部分完成

**目标**：diffStore 支持 byFilePath；打开文件时加载 pending diffs 并 resolve 到 byTab。

| 步骤 | 文件 | 状态 | 操作 |
|------|------|------|------|
| 2.1 | `stores/diffStore.ts` | ✅ | 新增 `byFilePath`、`byFilePathResolveStats`；`setFilePathDiffs`、`getPendingFileCount` |
| 2.2 | `utils/editorOffsetUtils.ts` | ✅ | `findBlockByParaIndexAndText` 段落顺序+originalText 双重匹配 |
| 2.3 | `stores/diffStore.ts` | ✅ | `resolveFilePathDiffs(filePath, doc)` resolve byFilePath → byTab；返回 `{ resolved, total, unmapped }` |
| 2.4 | `workspace_commands.rs` | ✅ | `open_file_with_cache`、`sync_workspace_file_cache_after_save` 已实现（所有文件类型） |
| 2.5 | `main.rs` | ✅ | 相关命令均已注册 |
| 2.6 | `documentService.ts` | ⏳ | markdown/text/html 打开时 **尚未** 接入 `open_file_with_cache`；保存时已接入 `sync_workspace_file_cache_after_save` ✅ |
| 2.7 | `documentService.ts` | ⏳ | docx 编辑模式分支尚未接入 `open_docx_with_cache` |

**DOCX 额外复杂度**：pending_diffs 的 `original_text` 必须基于 Pandoc 转换后的 HTML 生成（见 6.7）。若 AI 通过 `read_file` 读到的是 docx 二进制，生成的 diff 与 TipTap 内 HTML 段落无法匹配。需在 context_manager 中明确：AI 读取 docx 时用 `open_docx_with_cache` 获取 HTML。

**验收**：打开有 pending diff 的文件时，文档内显示红色删除线；DiffCard 正常展示。

---

### Phase 3：工具结果处理 + 确认写盘 ✅ 已完成

**目标**：本节描述文件级 pending diff 历史方案。层次三对话编辑当前主链不再以 `update_file(use_diff=true)` 作为目标。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 3.1 | `ChatPanel.tsx` | 在工具结果处理分支（L426 附近）增加：若 `toolCall.name === 'update_file'` 且 `result.data?.pending_diffs` 存在，则 `setFilePathDiffs(filePath, pendingDiffs)`；若文件已打开则 `resolveFilePathDiffs` |
| 3.2 | `workspace_commands.rs` | 实现 `accept_file_diffs(file_path, diff_indices?)`：标记 accepted，**按 diff_index 倒序应用 diff** 得到最终内容；**docx 必须经 Pandoc 转 docx 后再写盘**（见 6.5），更新 file_cache |
| 3.3 | `main.rs` | 注册 `accept_file_diffs` |
| 3.4 | `diffStore.ts` | 新增 `acceptFileDiffs(filePath, indices?)`：调用 `invoke('accept_file_diffs')`，成功后清除 byFilePath[filePath] 的 pending 状态，若 tab 存在则刷新 byTab |
| 3.5 | `diffStore.ts` | 新增 `rejectFileDiffs(filePath)`：调用后端清除 pending（或仅前端清除 byFilePath） |
| 3.6 | `DiffCard` / `ToolCallCard` | 当 diff 来自 byFilePath 时，Accept 调用 `acceptFileDiffs` 而非 `acceptDiff` |

**验收**：用户点击 Accept 后，文件写入磁盘；pending 状态清除。

---

### Phase 4：ExternalModificationDialog 接入 ✅ 已完成（策略调整）

**目标**：外部修改时弹对话框；加载外部更改时 pending diffs 静默失效。

> **设计变更（v1.3）**：原计划提供「保留 pending diff」选项，但经产品决策调整为：外部文件内容被替换后，原 diff 的 originalText 必然与新内容不一致，继续保留无意义。与用户手动编辑 diff 区域的处理保持一致——静默 expire，不弹提示。

| 步骤 | 文件 | 状态 | 操作 |
|------|------|------|------|
| 4.1 | `ExternalModificationDialog.tsx` | ✅ | `hasPendingDiffs` / `onReloadKeepDiffs` props 已有（备用，当前不使用） |
| 4.2 | `EditorPanel.tsx` | ✅ | 5 s 轮询检测 mtime；检测到外部修改后弹 `ExternalModificationDialog` |
| 4.3 | `EditorPanel.tsx` | ✅ | `handleLoadExternalChanges`：对该文件所有 pending diffs 调用 `markExpired` → 重读磁盘内容 → 更新 mtime |
| 4.4 | `MainLayout.tsx` | ✅ | 应用关闭时注册 `onCloseRequested`；有 pending diffs 则弹确认框提醒 ID 失效风险 |

**验收**：外部修改后选择「加载更改」，diff 卡消失（静默失效）；选择「继续覆盖」，编辑器内容不变，mtime 更新。

---

### Phase 5：PendingDiffPanel + 依赖关系 ⚠️ 部分完成

**目标**：批量确认面板；文件依赖关系存储与查询。

| 步骤 | 文件 | 状态 | 操作 |
|------|------|------|------|
| 5.1 | `components/Editor/PendingDiffPanel.tsx` | ✅ | 已实现：展示 pending 文件；单文件全部接受/拒绝；匹配失败降级提示；挂载于 `MainLayout.tsx` |
| 5.2 | `MainLayout.tsx` | ✅ | `<PendingDiffPanel />` 已挂载 |
| 5.3 | `workspace_db.rs` | ⏳ | `file_dependencies` 表 CRUD 未实现 |
| 5.4 | `dependency_graph.rs` | ⏳ | 未创建 |
| 5.5 | `workspace_commands.rs` | ⏳ | `get_file_dependencies`、`save_file_dependency` 未暴露 |
| 5.6 | `context_manager.rs` | ⏳ | 依赖关系注入未实现 |
| 5.7 | 依赖推断触发 | ⏳ | 未定义触发时机 |

**验收**：PendingDiffPanel 显示待确认文件列表；一键全部确认可批量写盘；依赖关系在定义时机下能正确写入。

---

## 四、文件清单与新增/修改汇总

### 4.1 后端新增文件

| 路径 | 说明 |
|------|------|
| `src-tauri/src/workspace/mod.rs` | 模块导出 |
| `src-tauri/src/workspace/workspace_db.rs` | 数据库初始化、Schema、CRUD |
| `src-tauri/src/workspace/workspace_store.rs` | 高层 API（可选，若 workspace_db 已足够可合并） |
| `src-tauri/src/workspace/diff_engine.rs` | 未打开文件的 diff 生成 |
| `src-tauri/src/workspace/dependency_graph.rs` | 依赖关系图谱 |
| `src-tauri/src/workspace/workspace_commands.rs` | Tauri 命令层 |

### 4.2 后端修改文件

| 路径 | 修改点 |
|------|--------|
| `src-tauri/src/main.rs` | 添加 workspace 模块；注册新命令；AppState 增加 workspace_db |
| `src-tauri/src/services/tool_service.rs` | 文件级 pending diff 历史方案参考；层次三当前主链不依赖此处 |
| `src-tauri/src/services/tool_definitions.rs` | 文件级 pending diff 历史方案参考 |
| `src-tauri/src/services/context_manager.rs` | 文件级 pending diff 历史方案参考；层次三当前提示词主控以专项文档为准 |

### 4.3 前端新增文件

| 路径 | 说明 |
|------|------|
| `src/components/PendingDiffPanel.tsx` | 批量 diff 确认面板 |

### 4.4 前端修改文件

| 路径 | 修改点 |
|------|--------|
| `src/stores/diffStore.ts` | 新增 byFilePath、byFilePathResolveStats、setFilePathDiffs、resolveFilePathDiffs、acceptFileDiffs、rejectFileDiffs、getPendingFileCount |
| `src/utils/editorOffsetUtils.ts` | 新增 findBlockByParaIndexAndText |
| `src/services/documentService.ts` | markdown/text/html/docx 分支接入 open_file_with_cache / open_docx_with_cache |
| `src/components/Chat/ChatPanel.tsx` | update_file 结果处理：写入 byFilePath、resolve |
| `src/components/Editor/ExternalModificationDialog.tsx` | `hasPendingDiffs` / `onReloadKeepDiffs` props 已有（备用，当前不使用） ✅ |
| `src/components/Editor/EditorPanel.tsx` | ✅ 已实现：外部修改弹 dialog、加载时 expire diffs；editor 就绪时触发 resolveFilePathDiffs（见 6.2） |
| `src/components/Layout/MainLayout.tsx` | ✅ 已实现：应用关闭 pending diffs 警告（`onCloseRequested`） |

---

## 五、数据库 Schema（与方案一致）

```sql
-- file_cache
CREATE TABLE IF NOT EXISTS file_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    file_type TEXT NOT NULL,
    cached_content TEXT,
    content_hash TEXT,
    mtime INTEGER NOT NULL,
    workspace_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- pending_diffs
CREATE TABLE IF NOT EXISTS pending_diffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    diff_index INTEGER NOT NULL,
    original_text TEXT NOT NULL,
    new_text TEXT NOT NULL,
    para_index INTEGER NOT NULL,
    diff_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    FOREIGN KEY(file_path) REFERENCES file_cache(file_path) ON DELETE CASCADE
);

-- file_dependencies
CREATE TABLE IF NOT EXISTS file_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    dependency_type TEXT NOT NULL,
    description TEXT,
    workspace_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(source_path, target_path)
);

-- ai_tasks（可选，Phase 5 后实现）
CREATE TABLE IF NOT EXISTS ai_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    affected_files TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_cache_workspace ON file_cache(workspace_path);
CREATE INDEX IF NOT EXISTS idx_pending_diffs_file ON pending_diffs(file_path, status);
CREATE INDEX IF NOT EXISTS idx_dependencies_source ON file_dependencies(source_path);
CREATE INDEX IF NOT EXISTS idx_dependencies_target ON file_dependencies(target_path);
```

---

## 六、关键实现细节

### 6.1 AppState 与 workspace_db 初始化

当前 `main.rs` 无集中 AppState。需在 `setup` 中按 workspace 路径创建 WorkspaceDb。可选方案：

- **方案 A**：`manage(Arc::new(Mutex::new(None::<WorkspaceDb>)))`，在 `open_workspace` 时初始化
- **方案 B**：每次命令调用时根据 `workspace_path` 动态 `WorkspaceDb::new(workspace_path)` 并缓存

推荐方案 A，与 `open_workspace` 流程一致。

### 6.2 documentService 接入时机与 resolveFilePathDiffs 触发点

`openFileWithStrategy` 中，markdown/text/html 分支改造后：

```typescript
const workspacePath = useFileStore.getState().currentWorkspace;
const result = await invoke('open_file_with_cache', { filePath, workspacePath });
useEditorStore.getState().addTab(filePath, fileName, result.content, ...);
if (result.pendingDiffs?.length > 0) {
  useDiffStore.getState().setFilePathDiffs(filePath, result.pendingDiffs);
  // ⚠️ 不可用 queueMicrotask：editor 初始化在 React 渲染周期内，microtask 执行时 editor 可能尚未就绪，会导致 race condition
}
```

**resolveFilePathDiffs 必须在 editor 就绪后触发**，推荐两种方式之一：

1. **TipTapEditor 的 `onEditorReady` 回调**：在 `onEditorReady(editor)` 被调用时，检查当前 tab 的 filePath 是否有 pending diffs，若有则调用 `resolveFilePathDiffs(filePath, tabId)`。
2. **editorStore 的 `setTabEditor`**：在 `EditorPanel` 中，`setTabEditor` 被调用后（editor 已挂载），检查该 tab 的 filePath 是否有 pending diffs，若有则调用 `resolveFilePathDiffs`。

实现时需在 `EditorPanel` 或 `TipTapEditor` 内增加逻辑：当 `setTabEditor(tabId, editor)` 执行且 `editor` 非空时，从 `useDiffStore.byFilePath[tab.filePath]` 取 pending，若有则 `resolveFilePathDiffs(tab.filePath, tabId)`。

### 6.3 findBlockByParaIndexAndText 实现要点（含风险 3）

- 遍历 `doc.descendants`，收集带 `data-block-id` 的块，记录 `index`（段落顺序）
- 双重匹配：先按 `para_index ± SEARCH_RADIUS` 筛选，再在候选中找 `text.includes(originalText)`
- 退化：若无附近匹配，全文搜索 `originalText`，取离 `para_index` 最近的块
- 返回 `{ blockId, startOffset, endOffset }`，其中 `startOffset`/`endOffset` 为块内字符偏移

**风险 3**：短文本（如「错误处理」「参数说明」）在文档中多次出现时，SEARCH_RADIUS 内可能有多候选，退化取最近块不保证正确。匹配失败时需有降级体验（见 6.9）。

### 6.4 update_file 与 edit_current_editor_document 的协调

- **当前打开文件**：继续使用 `edit_current_editor_document`，不改为 update_file
- **非当前和未打开目标文档**：以《对话编辑-统一整合方案（待确认版）》为准，统一进入目标文档静默加载 + Resolver + canonical diff 主链，不再把 `update_file + use_diff=true` 作为当前对话编辑主口径
- Workspace 侧只承接目标文档静默加载、缓存、快照与同一 diff 池约束
- 本节保留 `update_file` 仅作为非对话编辑场景或其他文件级操作能力，不再作为层次三对话编辑主路径

### 6.5 accept_file_diffs 应用 diff 的实现（关键，含风险 4 + 5）

**必须按 diff_index 倒序执行**，与现有 `edit_current_editor_document` 的 reverse-chronological 逻辑一致。否则多个 diff 的位置偏移会互相干扰。

**风险 4**：diff_engine 基于 similar 库，默认是**行级 diff**（按 `\n` 分块），不是字符偏移。行级 diff 倒序应用是安全的——从后往前替换，前面 diff 的 original_text 位置不受影响。实现时需明确：按**行/段落**做 find-replace，不要按字符偏移计算。

```rust
// workspace_commands.rs 中 apply_accepted_diffs 伪代码

fn apply_accepted_diffs(ws_db: &WorkspaceDb, file_path: &str, diff_indices: Option<&[i64]>) -> Result<String, String> {
    let old_content = ws_db.get_file_cache(file_path)?.cached_content;  // 或从磁盘读取
    let diffs = ws_db.get_pending_diffs_to_apply(file_path, diff_indices)?;
    
    // 按 diff_index 倒序排序（行级 diff，倒序应用安全）
    let mut sorted = diffs.clone();
    sorted.sort_by(|a, b| b.diff_index.cmp(&a.diff_index));
    
    let mut result = old_content;
    for d in sorted {
        // 按 para_index 定位段落，或全文 find original_text，替换为 new_text
        result = apply_single_diff(&result, &d)?;
    }
    Ok(result)
}
```

**风险 5（严重）**：应用 diff 后得到的是 HTML。**docx 文件不能直接写 HTML 到磁盘**，否则会损坏文件。必须：HTML → Pandoc → docx，再写盘。

```rust
// accept_file_diffs 写盘逻辑

let final_content = apply_accepted_diffs(...)?;
let file_type = get_file_type(file_path);

if file_type == "docx" {
    // 必须：HTML → Pandoc → docx
    pandoc_service.convert_html_to_docx(&final_content, &Path::new(file_path))?;
} else {
    std::fs::write(file_path, final_content)?;
}
```

**实现要点**：
- 行级 diff 倒序应用；按 para_index 或全文 find 做替换
- 若 `original_text` 找不到，跳过并记录警告
- **docx 必须经 Pandoc 转 docx 后再写盘**

### 6.6 AppState 初始化与 workspace 恢复

方案 A 推荐在 `open_workspace` 时初始化 WorkspaceDb。**需处理边缘 case**：用户启动 Binder 后，上次的 workspace 会自动恢复，此时 `open_workspace` 可能不会被重新调用。

**解决**：在启动流程中，若存在「上次打开的 workspace」恢复逻辑，需在该恢复路径里同样触发 WorkspaceDb 初始化。需确认 `load_workspaces`、`open_workspace` 或等效的恢复入口，确保 WorkspaceDb 在首次使用前已按当前 workspace 路径初始化。

### 6.7 DOCX 的内容格式统一（风险 1 + 2）

**风险 1**：`read_file` 读取 docx 时，当前实现走 Pandoc 转 HTML。若与 `open_docx_with_cache` 的 HTML 输出有细微差异（表格、列表等），AI 基于 read_file 生成的 `original_text` 与 TipTap 内 HTML 渲染的段落可能对不上。

**风险 2**：AI 修改 docx 时，若输出 markdown 而 file_cache 存的是 HTML，diff_engine 对比两种格式会产生大量无意义 diff，original_text 无法匹配。

**约束（必须在 prompt 中明确）**：
1. **读取 docx**：AI 读取 docx 用于编辑时，**必须**通过 `open_docx_with_cache` 或等效接口获取 HTML，作为唯一内容来源。不要用 `read_file` 读 docx（除非 read_file 的 docx 分支与 open_docx_with_cache 输出完全一致，且需在实现时验证）。
2. **修改 docx 输出**：AI 调用 `update_file` 修改 docx 时，`content` 参数**必须**是 HTML 格式，与 file_cache 一致。禁止输出 markdown。
3. **diff_engine 对 docx**：按 HTML 段落结构（如 `<p>` 等块级元素）生成 diff，而非纯文本行。para_index 对应 HTML 块顺序。

### 6.8 依赖关系的 AI 推断触发时机

Phase 5 实现了依赖关系的存储和查询，但**触发时机**需明确，否则 `file_dependencies` 表会一直为空：

| 时机 | 说明 |
|------|------|
| **首次扫描** | workspace 打开时（或首次进入 Agent 模式时），可调用一次 `analyze_file_dependencies` 工具，AI 分析 workspace 内文件并写入依赖关系 |
| **增量更新** | 用户明确说「需求变了，帮我同步」「联动更新」等时，AI 调用 `save_file_dependency` 写入新推断的依赖 |
| **可选** | 每次 AI 修改某文件后，若该文件在依赖关系中为 source，可提示 AI 检查 target 文件是否需要同步修改 |

建议在 Phase 5 实现时，至少定义「首次扫描」和「用户显式请求时」两种触发路径。

### 6.10 上下文截断策略可扩展性（构建模式前置）

**问题**：当前 `truncate_messages` 保留系统消息 + 最近 N 条，中间全部丢弃。构建模式里早期消息包含完整任务目标（如「帮我做 XX 深度调研，包含 A、B、C、D 四个维度」），触到上下文窗口后会被截掉，AI 行为会漂移。Chat 模式对话较短暂未暴露，构建模式会提前爆发。

**方案**：将截断策略改为可扩展结构，当前版本只实现 `KeepRecent`，接口预留：

```rust
// context_manager.rs

pub enum TruncationStrategy {
    KeepRecent(usize),    // 当前逻辑，保留最近 N 条
    SummarizeMiddle,      // 构建模式用，压缩中间历史
    KeepTaskGoal,         // 构建模式用，强制保留第一条用户消息
}

impl ContextManager {
    pub fn truncate_with_strategy(
        &self,
        messages: &mut Vec<ChatMessage>,
        strategy: TruncationStrategy,
    ) {
        match strategy {
            TruncationStrategy::KeepRecent(n) => self.truncate_messages(messages, n),
            TruncationStrategy::SummarizeMiddle => { /* 构建模式实现 */ }
            TruncationStrategy::KeepTaskGoal => { /* 构建模式实现 */ }
        }
    }
}
```

**调用方**：ai_commands.rs 中所有 `truncate_messages` 改为 `truncate_with_strategy(..., TruncationStrategy::KeepRecent(keep_recent))`。构建模式来了直接传 `KeepTaskGoal` 或 `SummarizeMiddle`，无需改 context_manager 内部。

### 6.11 工具错误类型标记（构建模式前置）

**问题**：当前 `execute_tool_with_retry` 对所有失败统一重试后报错。构建模式需要区分：
- **Retryable**：网络超时等，可重试
- **Skippable**：搜索结果为空等，可跳过继续
- **Fatal**：权限/文件不存在等，应中止任务

当前全部走同一分支，构建模式里 AI 自己决定会消耗大量 token 且行为不可预测。

**方案**：给 ToolResult 加 `error_kind`，工具层显式标记，任务调度层据此决策：

```rust
// tool_service.rs

pub enum ToolErrorKind {
    Retryable,   // 网络/临时错误
    Skippable,   // 结果为空/不影响后续
    Fatal,       // 权限/不存在，应中止
}

pub struct ToolResult {
    pub success: bool,
    pub data: Option<Value>,
    pub error: Option<String>,
    pub error_kind: Option<ToolErrorKind>,  // 新增
}
```

**当前版本**：各工具失败时先统一设 `error_kind: Some(Fatal)` 或 `None`（保持兼容）。构建模式来了再按错误类型细化（如 read_file 文件不存在 → Fatal，search_files 无结果 → Skippable）。序列化到 JSON 返回前端和 AI，构建模式任务调度层根据 error_kind 决定下一步。

### 6.9 resolveFilePathDiffs 匹配失败时的降级体验（风险 3）

当 `findBlockByParaIndexAndText` 无法为某条 diff 找到 block 时：
- **不渲染**该 diff 的红色删除线，但 **pending 状态保留**（仍在 byFilePath 中）
- **resolveFilePathDiffs** 返回 `{ resolved, total }`，并写入 `diffStore.byFilePathResolveStats[filePath]`（或等效状态），供 PendingDiffPanel 读取
- **PendingDiffPanel** 对每个文件显示：若 `unresolvedCount > 0`，则提示「X 处修改未能显示，确认后整体生效」
- **用户操作**：用户仍可点击「确认此文件」，后端 `accept_file_diffs` 会按 original_text 全文 find 应用 diff，写盘生效；只是文档内看不到红色删除线预览

---

## 七、风险与回退策略

| 风险 | 防护 |
|------|------|
| open_file_with_cache 失败 | 捕获异常时 fallback 到 `read_file_content` |
| workspace.db 损坏 | 打开失败时静默降级，走原有读盘流程 |
| resolveFilePathDiffs 匹配失败 | 不渲染红色删除线，保留 pending；PendingDiffPanel 显示「X 处修改未能显示，确认后整体生效」；用户仍可确认，后端全文 find 应用 |
| DOCX 缓存与 Pandoc 不一致 | docx 单独走 `open_docx_with_cache`，mtime 校验；过期则重新转换 |

---

## 八、验收检查表

- [ ] Phase 0：workspace.db 可创建，open_file_with_cache 可调用
- [ ] Phase 0.5：TruncationStrategy 可调用，ToolResult 含 error_kind；现有行为无回归
- [ ] Phase 1：AI 修改未打开文件后，pending_diffs 表有数据，磁盘未变
- [ ] Phase 2：打开有 pending 的文件，红色删除线显示
- [ ] Phase 3：Accept 后文件写盘，pending 清除（含多 diff 倒序应用正确性）
- [ ] Phase 4：外部修改后选「保留 pending」，重新加载后 diff 仍存在
- [ ] Phase 5：PendingDiffPanel 显示，一键全部确认生效；依赖关系在定义时机下写入
- [ ] t-docx 分页编辑无回归
- [ ] **多轮对话中 edit_current_editor_document 流程无回归**（diff 写入 byTab、红色删除线渲染、Accept/Reject 交互、originalText 校验）
- [ ] **docx 确认写盘**：HTML → Pandoc → docx，不直接写 HTML 到 .docx

---

## 九、推演风险点与修复汇总

| # | 风险 | 严重程度 | 修复措施 |
|---|------|----------|----------|
| 1 | read_file 与 open_docx_with_cache 的 docx 内容格式可能不一致 | 高 | prompt 规定：AI 读取 docx 用于编辑时，必须用 open_docx_with_cache 获取 HTML（6.7） |
| 2 | AI 修改 docx 输出 markdown，与 file_cache 的 HTML 不一致 | 高 | prompt 规定：update_file 修改 docx 时 content 必须是 HTML；diff_engine 对 docx 按 HTML 段落结构处理（6.7） |
| 3 | 短文本重复导致 findBlockByParaIndexAndText 匹配错误或失败 | 中 | 匹配失败时保留 pending；PendingDiffPanel 显示「X 处修改未能显示，确认后整体生效」；用户仍可确认（6.3、6.9） |
| 4 | diff 为行级非字符偏移，实现时易按字符偏移错误处理 | 中 | 6.5 明确：similar 行级 diff，倒序应用安全；按行/段落 find-replace |
| 5 | docx 应用 diff 后直接写 HTML 到 .docx 会损坏文件 | **严重** | accept_file_diffs 对 docx 必须：HTML → Pandoc → docx 再写盘（6.5、Phase 3.2） |

---

## 十、构建模式能力与当前版本范围

| # | 能力 | 类型 | 当前版本 | 说明 |
|---|------|------|----------|------|
| 1 | 任务状态持久化（检查点） | 加逻辑 | 不需要 | ai_tasks 表已设计，构建模式来再加写入/恢复逻辑 |
| 2 | 多文件协调原子性 | 加逻辑 | 不需要 | pending_diffs 天然软原子性，构建模式来再加 task_id 批量提交 |
| 3 | 执行过程可观测（进度） | 加逻辑 | 不需要 | ToolCallCard 已有，构建模式来再加「第 N/M 步」进度 UI |
| 4 | 上下文窗口管理 | **改架构** | **必须打基础** | Phase 0.5：TruncationStrategy 可扩展，当前只实现 KeepRecent（6.10） |
| 5 | 工具调用失败策略 | **改架构** | **必须打基础** | Phase 0.5：ToolErrorKind + ToolResult.error_kind，当前可先统一 Fatal（6.11） |

**原则**：加逻辑的可延后，改架构的必须当前做。否则构建模式来了需改 context_manager 内部 + 所有调用方，或需反向解析错误字符串，改动扩散且脆弱。
