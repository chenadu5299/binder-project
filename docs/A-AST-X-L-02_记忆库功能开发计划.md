# 记忆库功能完整开发计划

## 文档头

- 结构编码：AST-X-L-02
- 文档属性：落地计划
- 主责模块：AST
- 文档职责：记忆库功能完整开发计划 / 阶段划分、任务映射、规则承接、跨模块对接
- 上游约束：AST-X-L-01（收口决策），AST-M-D-01、AST-M-T-01、AST-M-P-01（主控）
- 直接承接：A-AST-M-S-01（数据库规范）、A-AST-M-S-02（检索规范）、A-AST-M-S-03（写入规范）、A-AST-M-S-04（注入规范）、A-AST-M-S-05（安全规范）、A-ENG-X-F-01（前置修复）
- 计划范围：P0.5（工程前置修复）→ P0（基础闭环）→ P1（增强治理）→ P2（深化演进）
- 修订说明：基于 D-01~D-13 全部已决策项生成，参考 A 体系五份专项规范文档完整内容；§十一 四个开发前缺口已于 2026-04-07 全部决策收口，无剩余待确认项；2026-04-08 完成关键断链修复回写（schema 初始化链、UUID+persist、tab/workspace 绑定、S-01 去重主键、Memory UI 入口、provider 缺失降级治理、entity_types 落地、include_user_memory 默认收口、content memory 删除/重命名治理）

---

## 一、计划总览

### 1.1 阶段总览表

| 阶段 | 名称 | 目标 | 核心输出 | 是否阻塞后续 | 主要风险 |
|------|------|------|---------|------------|---------|
| P0.5 | 工程前置修复 | 将 Chat Tab ID 改为稳定 UUID，引入 persist 持久化，为记忆库 scope_id 提供稳定主键 | chatStore 使用 RFC 4122 UUID + Zustand persist；孤立 tab 记忆清理接口可用 | 是（P0 依赖此阶段的稳定 tab ID） | onRehydrateStorage 时序竞态；localStorage 容量超限 |
| P0 | 基础闭环 | 建立最小可运行记忆闭环：能写入、能检索、能注入到 AI context | memory_items 表 + FTS5 可用；标签级/内容级记忆可写入；search_memories 可用；augmentation 层有记忆注入 | 是（P1 在 P0 基础上扩展） | AI 提炼调用量超预期；FTS5 中文分词效果差；token 预算溢出 |
| P1 | 增强治理 | 引入 LLM-as-judge 写入分类；实现受限升格链；实现 stale 治理；上线只读记忆面板 | 四分类冲突处理；on_tab_deleted 受限升格；startup_maintenance 清理；Memory 管理界面（只读） | 是（P2 依赖 P1 的升格链基础） | AI 分类误判导致有价值记忆被 NOOP 跳过；升格条件评估误差 |
| P2 | 深化演进 | 用户级记忆深化；强交互治理 UI；embedding 检索评估；记忆演化机制 | user_memory.db 实际写入；用户可编辑/屏蔽/合并记忆；语义检索（若引入） | 否（不阻塞后续功能） | embedding 模型本地化复杂度；用户编辑记忆与系统生成记忆一致性冲突 |

### 1.2 P0 进入前提清单

开始 P0 开发前，必须满足以下所有前提条件：

1. **ENG-X-F-01（Chat Tab UUID 持久化修复）已验收通过（2026-04-08 代码复核）**
   - chatStore 中 `createTab` 使用 `crypto.randomUUID()`
   - Zustand persist 中间件已接入，存储键名 `binder-chat-tabs-storage`
   - `mark_orphan_tab_memories_stale` Tauri 命令已注册
   - 六条验收标准（见 ENG-X-F-01 §八）均通过

2. **专项规范文档已存在且可参考**
   - `A-AST-M-S-01_记忆服务数据库落地规范.md` 已存在
   - `A-AST-M-S-02_记忆检索与Query构造规范.md` 已存在
   - `A-AST-M-S-03_记忆写入与冲突处理规范.md` 已存在
   - `A-AST-M-S-04_上下文装配与裁剪规范.md` 已存在
   - `A-AST-M-S-05_记忆注入安全规范.md` 已存在

3. **依赖基础设施已就绪**
   - `workspace.db` 已正常初始化（`workspace/workspace_db.rs` migration 可用）
   - `context_manager.rs` 的 `build_multi_layer_prompt` 有 augmentation 层占位

4. **旧接口已废弃或隔离**
   - 旧 `memories.db` 独立初始化路径已移除（或标记为待删除）
   - `delete_memory` 命令从对外暴露接口中移除（设计不允许用户单独删除记忆项）

### 1.3 2026-04-08 收口回写（实现对齐）

- `workspace.db` 的 memory schema 已收口到 `workspace_db.rs` migration v3 + `MemoryService::new` 运行时兜底，不再依赖手工建表。
- P0.5 UUID + persist 已落地：`chatStore` 使用稳定 UUID，`binder-chat-tabs-storage` 持久化 tab 元数据并在重启后恢复。
- 记忆主链作用域统一以 `tab.workspacePath` 为准；`ai_chat_stream` 新增 `workspace_path` 参数并优先使用。
- `on_tab_deleted_cmd` 在 provider 不可用时仅降级 AI 升格，不再跳过 tab 记忆生命周期治理。
- internal 编排 `user` 消息已从 5 轮提炼计数与 tab 删除升格计数中排除。
- S-01 去重改为真实 `memory_item.id` 契约；显式引用与自动注入可稳定去重。
- Memory UI 入口已切换到 `MemoryTab`，不再挂载旧 `MemorySection` 死命令链。
- 旧 `MemorySection.tsx`、`ConsistencyChecker.tsx` 已从仓库移除，避免遗留死命令入口继续误导开发与验收。
- `entity_types` 已进入 SQL 过滤；`include_user_memory` 默认关闭，需显式开启；`save_memory` 工具本阶段不暴露。
- 文件删除/重命名/移动已接入 content memory 失效或重绑定治理。

---

## 二、工程前置修复阶段（P0.5）

### 2.1 阶段目标

将 Chat Tab 的 tabId 改为稳定 UUID，并引入 Zustand persist 中间件，为记忆库 scope_id 提供稳定主键。此阶段必须在 P0 记忆业务逻辑前完成，是 P0 的硬性前置依赖。

### 2.2 进入前提

无（此阶段是最先执行的阶段，无前置依赖）。

### 2.3 主要任务列表

#### 任务 P0.5-1：修改 tabId 生成方式

- **所属文件**：`src/stores/chatStore.ts`
- **改动说明**：将 `createTab` 中的 `const tabId = \`chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}\`` 改为 `const tabId = crypto.randomUUID()`
- **承接文档/规则**：ENG-X-F-01 §三.2；D-05（tab ID 必须为 RFC 4122 UUID）
- **完成标志**：`useChatStore.getState().tabs[0].id` 格式匹配 `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

#### 任务 P0.5-2：定义 PersistedChatTab 类型

- **所属文件**：`src/stores/chatStore.ts`
- **改动说明**：新增 `PersistedChatTab` 接口，包含 `id`、`title`、`mode`、`workspacePath`、`isTemporary`、`createdAt`、`updatedAt`、`model` 字段；`ChatTab` 继承此类型，补充运行时字段 `messages`、`isLoading`、`streamingMessage` 等
- **承接文档/规则**：ENG-X-F-01 §三.1；D-05 持久化范围定义
- **完成标志**：`PersistedChatTab` 类型存在，`ChatTab extends PersistedChatTab`，两者职责明确分离

#### 任务 P0.5-3：引入 Zustand persist 中间件

- **所属文件**：`src/stores/chatStore.ts`
- **改动说明**：
  1. 新增 `import { persist, createJSONStorage } from 'zustand/middleware'`
  2. 将 `create<ChatState>((set, get) => {...})` 改为 `create<ChatState>()(persist((set, get) => {...}, {...}))`
  3. 配置 `name: 'binder-chat-tabs-storage'`，`storage: createJSONStorage(() => localStorage)`
  4. 配置 `partialize`：只持久化 `tabs`（仅元数据字段）和 `activeTabId`，不持久化 `messages`
- **承接文档/规则**：ENG-X-F-01 §三.3；D-05
- **完成标志**：localStorage 中存在 `binder-chat-tabs-storage` 键，且其 JSON 内容中 `tabs[0]` 不含 `messages` 字段

#### 任务 P0.5-4：实现 onRehydrateStorage 回调

- **所属文件**：`src/stores/chatStore.ts`
- **改动说明**：在 persist 配置中添加 `onRehydrateStorage: () => (state) => { if (state) { state.tabs = state.tabs.map(tab => ({ ...tab, messages: [] })); } }`，确保从 localStorage 恢复的 tab 元数据补充运行时字段
- **承接文档/规则**：ENG-X-F-01 §三.3
- **完成标志**：应用重启后，`useChatStore.getState().tabs` 非空，且每个 tab 的 `messages` 字段为空数组（不报错）

#### 任务 P0.5-5：实现后端 mark_orphan_tab_memories_stale 方法

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：新增 `pub async fn mark_orphan_tab_memories_stale(&self, active_tab_ids: &[String]) -> Result<u64, MemoryError>` 方法；SQL：将 `scope_type='tab'` 且 `scope_id` 不在 `active_tab_ids` 列表中的 `freshness_status='fresh'` 记录改为 `'stale'`，更新 `updated_at`，返回被标记的条数
- **承接文档/规则**：ENG-X-F-01 §五.1；A-AST-M-S-01 §2.3.1
- **完成标志**：方法签名存在，单元测试可验证：给定 3 条孤立 tab 记忆 + 1 条活跃 tab 记忆，调用后 3 条变 stale，1 条不变

#### 任务 P0.5-6：暴露 mark_orphan_tab_memories_stale 为 Tauri 命令

- **所属文件**：`src-tauri/src/commands/memory_commands.rs`，`src-tauri/src/main.rs`
- **改动说明**：
  1. 在 `memory_commands.rs` 新增 `#[tauri::command] pub async fn mark_orphan_tab_memories_stale(active_tab_ids: Vec<String>, workspace_path: String) -> Result<u64, String>`
  2. 在 `main.rs` 的 `tauri::generate_handler![...]` 中注册此命令
- **承接文档/规则**：ENG-X-F-01 §五.2
- **完成标志**：前端可通过 `invoke('mark_orphan_tab_memories_stale', { activeTabIds: [...], workspacePath })` 调用，不报错

#### 任务 P0.5-7：在工作区加载完成后触发孤立清理

- **所属文件**：`src/stores/fileStore.ts`
- **改动说明**：在 `setCurrentWorkspace` 成功设置后，非阻塞异步调用 `invoke('mark_orphan_tab_memories_stale', { activeTabIds, workspacePath })` 触发孤立 tab 记忆降级清理；activeTabIds 仅包含当前 workspace 绑定 tab；调用失败只 `console.warn`，不影响主流程
- **承接文档/规则**：ENG-X-F-01 §四.4；A-AST-M-S-01 §2.3.1
- **完成标志**：workspace 加载后，开发者工具 console 无 `mark_orphan_tab_memories_stale` 相关错误；若有孤立记忆（scope_id 不在活跃 tabs），数据库中其 freshness_status 变为 stale

### 2.4 涉及模块

- **ENG**（前端工程）：chatStore.ts、fileStore.ts
- **AST**（后端记忆服务）：memory_service.rs、memory_commands.rs
- **MAIN**：main.rs（命令注册）

### 2.5 阶段产物

- `chatStore` 使用稳定 RFC 4122 UUID
- 应用重启后 tab 元数据从 localStorage 恢复，UUID 不变
- `mark_orphan_tab_memories_stale` Tauri 命令可被前端调用
- workspace 加载完成后孤立 tab 记忆被标记为 stale

### 2.6 验收标准

以下所有条件满足时视为 P0.5 验收通过（参考 ENG-X-F-01 §八）：

1. 应用重启后，已有 tabs 的 UUID 保持不变（创建 tab → 记录 UUID → 重启 → UUID 一致）
2. localStorage 中存在 `binder-chat-tabs-storage` 键
3. tab UUID 格式符合 RFC 4122（匹配标准 UUID 正则）
4. messages 不存入 localStorage（检查 localStorage JSON 内容不含 messages 字段）
5. `mark_orphan_tab_memories_stale` 接口可被调用，不报错
6. `activeTabId` 跨重启保持（切换 tab → 重启 → 同一 tab 仍为 active）
7. `memory_items` 表中不再出现 `chat-timestamp-random` 格式的 scope_id（P0 建表后验证）

### 2.7 主要风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `onRehydrateStorage` 时序：agentStore 依赖 tabId 在恢复时可能尚未就绪 | 运行时字段初始化顺序错误 | onRehydrateStorage 只补充 messages 等简单运行时字段，不调用 agentStore；agentStore 在首次渲染时懒初始化 |
| localStorage 容量问题（tab 数量过多） | 写入失败，persist 报错 | partialize 只持久化元数据（不含 messages），单个 tab 元数据约 200 字节，100 个 tab 也仅 20KB，不会超限 |
| 旧格式 tab ID 的历史记忆残留 | scope_id 不匹配，记忆永远孤立 | 启动时 mark_orphan_tab_memories_stale 统一处理所有不在活跃 tabs 列表中的 scope_id，无需区分旧格式 |

---

## 三、P0 基础闭环阶段

### 3.1 阶段目标

P0 只做一件事：让记忆系统具备最小可运行闭环——能写入、能检索、能注入到 AI context。不追求复杂自动化，以正确、稳定、可调试为第一优先级。具体参考 D-10 P0 实施边界决策。

### 3.2 进入前提

- P0.5（工程前置修复）必须验收通过（chat tab UUID 已稳定，孤立清理接口可用）
- A-AST-M-S-01~S-05 五份专项规范文档已存在
- workspace.db 连接池（`Arc<Mutex<Connection>>`）已在 AppState 中可访问

### 3.3 主要任务列表（详细）

#### 模块1：数据库层（memory_service.rs + workspace/workspace_db.rs）

**任务1.1：在 workspace.db migration 中创建/补齐 memory_items 表**

- **所属文件**：`src-tauri/src/workspace/workspace_db.rs`、`src-tauri/src/services/memory_service.rs`
- **改动说明**：通过 `WorkspaceDb::run_migrations()` 的 schema version 3 调用 `ensure_workspace_memory_schema(&conn)`，统一创建 `memory_items`；同时在 `MemoryService::new` 做运行时幂等兜底，避免 migration 漏跑时主链断裂
- **承接规则**：A-AST-M-S-01 §二（完整字段定义）；D-03（记忆表合并进 workspace.db）；MC-LAYER-002/003
- **完成标志**：workspace 初始化后 `SELECT name FROM sqlite_master WHERE type='table' AND name='memory_items'` 返回结果

**任务1.2：创建 memory_items_fts FTS5 虚拟表 + 同步触发器（幂等）**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（`WORKSPACE_MEMORY_DDL`）
- **改动说明**：在统一 DDL 中创建 `memory_items_fts`，并创建 `memory_items_fts_insert / memory_items_fts_update / memory_items_fts_delete` 三个触发器；migration 与运行时可重复执行且不报错
- **承接规则**：A-AST-M-S-01 §四；D-07（P0 FTS5 检索）
- **完成标志**：向 memory_items 插入一条记录后，`SELECT * FROM memory_items_fts WHERE memory_items_fts MATCH '测试'` 可返回对应记录

**任务1.3：创建 memory_usage_logs 表与索引**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（`WORKSPACE_MEMORY_DDL`）
- **改动说明**：在统一 DDL 中创建 `memory_usage_logs` 及相关索引（`idx_memory_usage_memory`、`idx_memory_usage_tab`）
- **承接规则**：A-AST-M-S-01 §三
- **完成标志**：`SELECT name FROM sqlite_master WHERE type='table' AND name='memory_usage_logs'` 返回结果

**任务1.4：用户级记忆保持阶段边界（默认不合并）**

- **所属文件**：`src-tauri/src/commands/memory_commands.rs`、`src/services/memoryService.ts`
- **改动说明**：`search_memories_cmd` 新增 `include_user_memory` 参数并默认 `false`；仅显式传 `true` 时才合并 user_memory 结果，避免 P0/P1 默认消费 user 层造成阶段口径偏移
- **承接规则**：D-04（用户级记忆存储在 Tauri app_data_dir）；§十一 问题2 决策
- **完成标志**：默认调用 `search_memories_cmd` 不合并 user_memory；仅显式开启时合并

**任务1.5：定义 Rust 数据结构**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（或单独的 `memory_models.rs`）
- **改动说明**：定义以下枚举和结构体（参考 A-AST-M-S-01 §八）：
  - `MemoryLayer`：Tab / Content / WorkspaceLongTerm / User
  - `MemoryScopeType`：Tab / Workspace / User
  - `FreshnessStatus`：Fresh / Stale / Expired / Superseded
  - `MemorySourceKind`：7 种来源类型枚举（ConversationSummary / ConversationEntity / DocumentExtract / DocumentOutline / DocumentDetailEnrichment / TabDeletionSummary / UserPreference）
  - `MemoryItem`：完整字段结构体（与数据库字段一一对应）
  - `MemoryItemInput`：写入时使用（不含 id/created_at/updated_at 等系统字段）
  - `MemoryError`：错误枚举（LockError / DbError / ParseError / ValidationError / Timeout 等）
- **承接规则**：A-AST-M-T-01 §四（数据模型）；A-AST-M-S-01 §二.2~二.6；MC-LAYER-003
- **完成标志**：所有类型可编译，实现 Serialize/Deserialize，MemoryLayer 有 `as_str()` 和 `priority_rank()` 方法

**任务1.6：关键索引创建（统一收口）**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（`WORKSPACE_MEMORY_DDL`）
- **改动说明**：统一创建 scope/entity/freshness/source_ref/usage 等索引，避免多处散落初始化
- **承接规则**：A-AST-M-S-01 §六
- **完成标志**：索引创建后可通过 `EXPLAIN QUERY PLAN` 确认检索路径使用了索引

#### 模块2：写入链（memory_service.rs）

**任务2.1：实现 queue_write 异步后台写入框架**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn queue_write_tab_memory(&self, tab_id: String, conversation_history: Vec<ChatMessage>)` 方法；内部使用 `tokio::spawn` fire-and-forget 调用 `memory_generation_task_tab`；写入失败时只记录 `tracing::warn!`，不向调用方返回错误（MC-WRITE-001 要求不阻塞主链）
- **承接规则**：MC-WRITE-001；A-AST-M-S-03 §二（异步后台行为定义）
- **完成标志**：调用 `queue_write_tab_memory` 后立即返回（不阻塞），后台任务可通过 tracing 日志观测到执行记录

**任务2.2：实现标签级记忆 AI 提炼任务**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn memory_generation_task_tab(ai_service, memory_service, tab_id, conversation_history, workspace_path)` 函数；逻辑：
  1. 取最近 20 轮 user/assistant 消息，格式化为对话历史文本
  2. 使用 A-AST-M-S-03 §四.1 的 prompt 模板调用 `ai_service.chat_simple(&prompt, 500)`（记忆提炼专用配置，D-11）
  3. 解析 AI 输出的 JSON 数组（A-AST-M-S-03 §四.2 的 `parse_memory_candidates` 函数）
  4. **输出校验**（`validate_memory_candidates`）：过滤掉 entity_name 为空 / content 超 500 字符 / confidence < 0.3 / content 包含疑似 prompt injection 的候选项（S-04 关键词列表）；校验失败的条目记录 warn 后跳过，不中断其余条目写入
  5. 调用 `upsert_tab_memories(&tab_id, validated_candidates)` 批量写入
  6. 任意步骤失败只 `tracing::warn!`，不 panic
- **承接规则**：D-01（AI 提炼生成）；D-09（P0 系统规则写入）；A-AST-M-S-03 §四；MC-WRITE-001
- **完成标志**：模拟 5 轮对话内容后调用此函数，数据库中出现对应 tab_id 的 memory_items 记录（layer='tab'）

**任务2.3：实现项目内容记忆 AI 提炼任务**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn memory_generation_task_content(ai_service, memory_service, file_path, content_html, workspace_path)` 函数；逻辑：
  1. 从 HTML 中提取纯文本（strip_html_tags），截取前 3000 字符
  2. 执行 S-04 内容安全过滤（filter_sensitive_content）
  3. 使用 A-AST-M-S-03 §五.1 的 prompt 模板调用 AI
  4. 解析 JSON 后执行 **输出校验**（`validate_memory_candidates`）：过滤 entity_name 为空 / content 超 500 字符 / confidence < 0.3 / 含 prompt injection 特征的候选项；校验失败条目跳过，不中断其余
  5. 调用 `upsert_project_content_memories(&file_path, validated_candidates)`
  6. 失败只记日志
- **承接规则**：D-01；D-02（仅在文件保存时触发）；A-AST-M-S-03 §五；S-04（内容安全过滤）
- **完成标志**：文件保存触发后，数据库中出现对应 file_path 的 content 层记忆（layer='content', source_ref=file_path）

**任务2.4：实现 upsert_tab_memories 写入逻辑**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn upsert_tab_memories(&self, tab_id: &str, items: Vec<MemoryItemInput>) -> Result<(), MemoryError>`；使用 `tokio::task::spawn_blocking`；对每条记录先将 scope_id+entity_name 的旧 fresh 记录标记为 superseded，再插入新记录（参考 A-AST-M-S-03 §六.1 完整代码骨架）；写入前验证字段完整性（MC-WRITE-003）
- **承接规则**：MC-WRITE-002；MC-WRITE-003；A-AST-M-S-03 §六.1；A-AST-M-S-01 §七.1
- **完成标志**：相同 tab_id + entity_name 写入两次后，只有一条 fresh 记录，旧记录变为 superseded

**任务2.5：实现 upsert_project_content_memories 写入逻辑**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn upsert_project_content_memories(&self, file_path: &str, items: Vec<MemoryItemInput>) -> Result<(), MemoryError>`；先将该 file_path 来源的旧 content 记忆（source_ref=file_path, layer='content'）标记为 superseded；再批量插入新记录（参考 A-AST-M-S-03 §六.2 完整代码骨架）
- **承接规则**：A-AST-M-S-03 §六.2；A-AST-M-T-01 §5.2（项目内容记忆随文档变化更新）
- **完成标志**：同一文件保存两次后，旧内容记忆变为 superseded，新记录为 fresh

**任务2.6：在 sync_workspace_file_cache_after_save 中接入写入触发**

- **所属文件**：`src-tauri/src/commands/file_commands.rs`（或 workspace.rs 中的保存后钩子）
- **改动说明**：在 `sync_workspace_file_cache_after_save` 成功执行后：
  1. 检查文件类型（`is_text_file(file_path)`），非文本文件直接跳过
  2. **写入节流守卫**：查询该 file_path 上次提取时间（`SELECT updated_at FROM memory_items WHERE source_ref=? AND layer='content' ORDER BY updated_at DESC LIMIT 1`），若距上次不足 60 秒则跳过本次触发（记录 debug 日志 `content memory extraction skipped: cooldown`）
  3. 若通过守卫，`tokio::spawn` 异步触发 `memory_generation_task_content`（fire-and-forget，失败只 `tracing::warn!`）
- **承接规则**：D-02（仅在文件保存时触发，禁止在文件打开时触发）；MC-WRITE-001；问题1决策（写入节流）
- **完成标志**：60 秒内连续保存同一文件，后台日志只出现一次 `content memory extraction` 触发，其余均为 `cooldown` 跳过日志

#### 模块3：检索链（memory_service.rs + memory_commands.rs）

**任务3.1：实现 search_memories 接口**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn search_memories(&self, params: SearchMemoriesParams) -> Result<MemorySearchResponse, MemoryError>`；
  1. 构造 scope_ids 列表（A-AST-M-S-02 §三.1 的 `build_scope_ids` 函数）
  2. 清理 FTS5 query（A-AST-M-S-02 §二.2 的 `sanitize_fts_query` 函数）
  3. 执行 A-AST-M-S-01 §七.2 定义的 FTS5 检索 SQL（含 scope 过滤 + freshness 过滤 + 综合排序公式）
  4. 应用 500ms 超时（`tokio::time::timeout`）；超时则返回空结果并设置 `timed_out=true`
  5. 返回 `MemorySearchResponse`（items + total_found + scope_used + timed_out）
- **承接规则**：A-AST-M-S-02 §一（完整接口签名）；A-AST-M-S-02 §四（排序因子）；D-07（FTS5 检索）；MC-READ-001
- **完成标志**：调用 `search_memories` 在有数据时能返回结果，500ms 超时时返回空列表不报错

**任务3.2：实现 build_memory_query 函数**

- **所属文件**：`src-tauri/src/services/context_manager.rs`（或 memory_service.rs）
- **改动说明**：实现 `pub fn build_memory_query(context: &ContextInfo) -> String`；逻辑：用户消息取前 200 字符 + 当前文件名（只取文件名部分）+ 选区文本前 100 字符（若有）（参考 A-AST-M-S-02 §二.1 的完整代码骨架）
- **承接规则**：D-06（query 构造规则）；A-AST-M-S-02 §二
- **完成标志**：给定不同输入组合，输出的 query 格式符合规范；中文字符不会触发字节索引 panic（使用 chars() 而非字节切片）

**任务3.3：实现 500ms 超时 + 空结果 fallback**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（search_memories 内部）
- **改动说明**：在 `search_memories` 的 DB 查询外包裹 `tokio::time::timeout(Duration::from_millis(500), async_db_query)`；超时时返回 `MemorySearchResponse { items: vec![], timed_out: true, ... }`，记录 `tracing::warn!("memory search timed out")`
- **承接规则**：A-AST-M-S-02 §五（top_k 和超时定义）；AST-M-T-01 §6.3（检索失败按空结果降级）
- **完成标志**：注入人工延迟时，search_memories 在 500ms 后返回 timed_out=true 的空结果

**任务3.4：暴露 search_memories_cmd 为 Tauri 命令**

- **所属文件**：`src-tauri/src/commands/memory_commands.rs`，`src-tauri/src/main.rs`
- **改动说明**：新增 `#[tauri::command] pub async fn search_memories_cmd(query, tab_id, workspace_path, scope, limit, entity_types, include_user_memory)` 命令（参考 A-AST-M-S-02 §一.2 完整签名）；在 `main.rs` 注册；默认 `include_user_memory=false`
- **承接规则**：A-AST-M-S-02 §一.2
- **完成标志**：前端可通过 `invoke('search_memories_cmd', {...})` 调用，不报错

**任务3.5：确保 mark_orphan_tab_memories_stale 命令正常注册**

- **所属文件**：`src-tauri/src/commands/memory_commands.rs`（已在 P0.5 实现）
- **改动说明**：验证 P0.5 完成的命令在 main.rs 中已注册，无需重复实现
- **承接规则**：ENG-X-F-01 §五.2；A-AST-M-S-01 §2.3.1
- **完成标志**：编译通过，命令可调用

#### 模块4：注入链（ai_commands.rs + context_manager.rs）

**任务4.1：在 ai_chat_stream 预检索并注入 augmentation**

- **所属文件**：`src-tauri/src/commands/ai_commands.rs`、`src-tauri/src/services/context_manager.rs`
- **改动说明**：在 `build_multi_layer_prompt`（或 `build_prompt_package`）的 augmentation 层构建代码中：
  1. **检索 gating**：在 `ai_chat_stream` 中按轻量规则判断（如用户消息过短）是否跳过检索；跳过时不发起 DB 查询
  2. 调用 `build_memory_query(context)` 构造 query
  3. 调用 `MemoryService::new(workspace_path)?.search_memories(params).await` 获取记忆结果
  4. 格式化为 ContextSlice（source_type=MemoryItem, priority_tier=Augmentation）
  5. 注入失败时静默降级（空 slice，不中断主任务）

  `should_retrieve_memory(context)` 规则（轻量，无 AI 调用）：
  ```rust
  fn should_retrieve_memory(ctx: &ContextInfo) -> bool {
      // 用户消息过短（如"好"、"继续"），跳过检索
      if ctx.user_message.chars().count() < 5 { return false; }
      // 该 tab 对话轮次 < 2 且无当前文件，记忆库大概率为空
      if ctx.turn_count < 2 && ctx.current_file_path.is_none() { return false; }
      true
  }
  ```
- **承接规则**：A-AST-M-S-04 §二（全局注入顺序表）；D-10（context 注入是 P0 核心交付）；MC-READ-001；MC-READ-002；问题2决策（检索 gating）
- **完成标志**：用户发送单字消息（如"好"）时不触发检索；正常消息时出现记忆检索/注入日志

**任务4.2：实现记忆结果格式化与 token 预算裁剪**

- **所属文件**：`src-tauri/src/services/context_manager.rs`（或 memory_service.rs 中的 format 函数）
- **改动说明**：
  1. 实现 `fn format_memory_results_to_context_slice(results: &[MemorySearchResult], budget_chars: usize) -> ContextSlice`；格式遵循 A-AST-M-S-05 §二 定义的 `[记忆库信息]...[/记忆库信息]` 包裹格式；每条记忆使用 `format_memory_item_line`（含 source_label、entity_name、entity_type、stale 标注）
  2. **Token 预算裁剪**（`trim_memory_to_budget`）：按优先级排序（tab > content > workspace_long_term，fresh > stale）；从高到低依次累加 token 估算（`chars().count() / 2`，保守估算，详见§十一问题3）；累加超过 `budget_chars` 时截断，不注入剩余条目；截断时记录 `MEMORY_INJECT_TRUNCATED` 日志（含原始数量和保留数量）
  ```rust
  // 裁剪骨架
  fn trim_memory_to_budget(items: Vec<MemorySearchResult>, budget_chars: usize) -> Vec<MemorySearchResult> {
      let mut used = 0usize;
      items.into_iter().filter(|item| {
          let cost = item.content.chars().count() / 2; // 保守估算
          if used + cost <= budget_chars { used += cost; true } else { false }
      }).collect()
  }
  ```
- **承接规则**：S-02（注入格式）；S-03（来源标签）；A-AST-M-S-04 §三（token 预算，augmentation 层 10%）；A-AST-M-S-04 §四（裁剪算法，参照两遍扫描策略）；中级缺口4决策
- **完成标志**：格式化输出包含 `[记忆库信息]` 和 `[/记忆库信息]` 标签；当记忆总量超预算时日志出现 `MEMORY_INJECT_TRUNCATED`，prompt 中记忆块不超过预算字符数

**任务4.3：记忆注入失败时静默降级**

- **所属文件**：`src-tauri/src/services/context_manager.rs`
- **改动说明**：将 `search_memories` 调用包裹在 `match` 或 `if let Ok` 中；失败时返回空的 augmentation slice，记录 `tracing::warn!("memory inject fallback: {:?}", e)`；不向调用方传播错误
- **承接规则**：AST-M-P-01 §8.1（注入失败不阻塞主任务）；MC-READ-002
- **完成标志**：memory_service 故意返回错误时，AI 对话仍正常继续，console 无 panic

**任务4.4：注入时执行显式引用去重（S-01，真实主键）**

- **所属文件**：`src-tauri/src/commands/ai_commands.rs`
- **改动说明**：在组装 augmentation 前，获取当前 references 中类型为 Memory 的真实 `memory_item.id` 列表；从自动检索结果中过滤掉已显式引用的同主键项（避免重复注入）
- **承接规则**：S-01（显式引用优先于自动记忆检索）；MC-READ-001
- **完成标志**：同一条记忆项被用户 @ 引用后，不再出现在自动检索注入的 `[记忆库信息]` 块中

**任务4.5：记录注入日志（memory_usage_logs）**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（record_memory_usage 方法）
- **改动说明**：注入成功后，**必须使用 `tokio::spawn` fire-and-forget**（不能在 prompt 构建热路径上同步写 DB）；后台任务逻辑：
  ```rust
  // 热路径中只 spawn，不 await
  let ids: Vec<String> = injected_items.iter().map(|i| i.id.clone()).collect();
  let svc = memory_service.clone();
  tokio::spawn(async move {
      if let Err(e) = svc.record_memory_usage(&ids, &tab_id).await {
          tracing::warn!("memory usage log failed: {:?}", e);
      }
  });
  ```
  `record_memory_usage` 内部：对每个 memory_id 执行 `INSERT INTO memory_usage_logs` + `UPDATE memory_items SET access_count = access_count + 1`（A-AST-M-S-01 §七.4 的 SQL）
- **承接规则**：A-AST-M-S-01 §三（memory_usage_logs 表定义）；A-AST-M-S-01 §2.6（access_count 更新）；MC-WRITE-001（不阻塞主链）；中级缺口3决策（热路径不同步写 DB）
- **完成标志**：一次 AI 对话后，memory_usage_logs 中出现对应 memory_id 的记录，且 memory_items.access_count 递增；prompt 构建总耗时不因 DB 写入而增加（日志中可观测 augmentation 层耗时）

#### 模块5：前端协议层（memoryService.ts）

**任务5.1：更新 Memory TypeScript 接口定义**

- **所属文件**：`src/services/memoryService.ts`
- **改动说明**：将旧的 `Memory` 接口替换为 A-AST-M-S-02 §一.3 定义的 `MemoryItem` 接口（layer, scopeType, scopeId, entityType, entityName, content, summary, tags, sourceKind, sourceRef, confidence, freshnessStatus, readonly, accessCount, lastAccessedAt, createdAt, updatedAt）；同时定义 `SearchMemoriesParams`、`MemorySearchResult`、`MemorySearchResponse` 接口
- **承接规则**：A-AST-M-S-02 §一.3（前端 TypeScript 接口，与后端对称）
- **完成标志**：TypeScript 编译通过，旧 `document_path` 字段不再存在于接口定义中

**任务5.2：更新 memoryService.ts 中的 invoke 调用**

- **所属文件**：`src/services/memoryService.ts`
- **改动说明**：实现 `memoryService.searchMemories(params: SearchMemoriesParams): Promise<MemorySearchResponse>`，内部调用 `invoke('search_memories_cmd', {...})`（参考 A-AST-M-S-02 §一.3 代码骨架）；移除旧的 `add_memory`、`delete_memory`、`get_all_memories` Tauri 命令链。若前端仍保留 `getAllMemories()` 便捷方法，应明确基于 `searchMemories()` 适配，而非继续调用旧命令。
- **承接规则**：A-AST-M-S-02 §一.3；D-10
- **完成标志**：前端可通过 `memoryService.searchMemories({query: '...', tabId: '...'})` 调用，类型推断正确

**任务5.3：从 chatStore 中采集 tab UUID 并传递给后端记忆接口**

- **所属文件**：`src/stores/chatStore.ts`（或调用记忆接口的上层组件）
- **改动说明**：在 `sendMessage` 或触发记忆检索的位置，从 `useChatStore.getState().activeTabId` 获取当前 UUID，作为 `tabId` 参数传给 `search_memories_cmd`；此处 tabId 已是 RFC 4122 UUID（P0.5 保证）
- **承接规则**：A-AST-M-S-01 §2.3.1（scope_id 格式要求）；D-05
- **完成标志**：发送消息时传给后端的 tabId 为 UUID 格式，不再是 `chat-timestamp-random` 格式

#### 模块6：ai_commands.rs 调用链

**任务6.1：在 ai_chat_stream 流程中触发记忆检索**

- **所属文件**：`src-tauri/src/commands/ai_commands.rs`
- **改动说明**：在构建 prompt 前（调用 `context_manager.build_multi_layer_prompt` 前），确保 `tab_id` 和 `workspace_path` 已传入 context_manager，使其能调用 `search_memories`；若 context_manager 已改造（任务4.1），此处主要是参数传递
- **承接规则**：D-10（context 注入是 P0 核心交付）
- **完成标志**：ai_chat_stream 流程完整执行，记忆注入已进入 prompt（可通过日志验证）

**任务6.2：在轮次计数达到阈值时触发后台记忆生成任务**

- **所属文件**：`src-tauri/src/commands/ai_commands.rs`
- **改动说明**：在 `ai_chat_stream` 完成（done 事件发出）后，调用 `should_trigger_tab_memory_extraction(&messages, &tab_id)` 检查是否达到 5 轮阈值；若达到则 `tokio::spawn` 异步调用 `memory_generation_task_tab`（fire-and-forget，不等待结果）（参考 A-AST-M-S-03 §一.1 的代码骨架）
- **承接规则**：D-09（P0 系统规则写入，每 5 轮触发）；A-AST-M-S-03 §一.1；MC-WRITE-001
- **完成标志**：对话达到第 5、10、15 轮时，后台日志出现 `tab memory extraction triggered`

**任务6.3：实现 should_trigger_tab_memory_extraction 函数**

- **所属文件**：`src-tauri/src/commands/ai_commands.rs`（或 memory_service.rs）
- **改动说明**：实现 `fn should_trigger_tab_memory_extraction(messages: &[ChatMessage], tab_id: &str) -> bool`；统计 messages 中 `role="user"` 的消息数，当数量为 5 的正整数倍时返回 true（参考 A-AST-M-S-03 §一.1 代码）
- **承接规则**：A-AST-M-S-03 §一.1
- **完成标志**：单元测试：4 条 user 消息返回 false，5 条返回 true，10 条返回 true

#### 模块7：错误码与日志

**任务7.1：定义 MemoryError 枚举**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：定义 `pub enum MemoryError { LockError(String), DbError(rusqlite::Error), ParseError(serde_json::Error), ValidationError(String), Timeout, AiCallFailed(String) }`；实现 `Display` 和 `From` 转换
- **承接规则**：A-AST-M-S-01 §八（错误类型）
- **完成标志**：所有 memory_service 方法返回 `Result<T, MemoryError>`，错误可转为 String 供 Tauri 命令返回

**任务7.2：实现结构化日志事件**

- **所属文件**：`src-tauri/src/services/memory_service.rs`，`context_manager.rs`
- **改动说明**：在关键操作点使用 `tracing::info!` 或 `tracing::warn!` 输出结构化日志，事件类型见 §十.1；关键字段：tab_id、timestamp、操作类型、数量/耗时/原因
- **承接规则**：本文 §十.1 日志事件清单
- **完成标志**：执行一次完整的对话后，可在日志中观测到 MEMORY_WRITE_QUEUED、MEMORY_SEARCH_TRIGGERED、MEMORY_INJECT_SUCCESS 等事件

**任务7.3：实现 memory.enabled 调试开关**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（或 config 层）
- **改动说明**：在 AppConfig 或 MemoryService 初始化时，读取 `memory.enabled` 配置项（默认 true）；若为 false，search_memories 和 queue_write 直接返回空结果/无操作；不改变主对话链行为
- **承接规则**：本文 §十.2 调试开关定义
- **完成标志**：设置 `memory.enabled=false` 后，记忆相关操作全部跳过，主对话不受影响

### 3.4 涉及模块

- **后端**：memory_service.rs、memory_commands.rs、context_manager.rs、ai_commands.rs、workspace/workspace_db.rs
- **前端**：memoryService.ts、chatStore.ts（轮次计数采集、tab UUID 传递）
- **数据库**：workspace.db（memory_items + memory_usage_logs + FTS5）、user_memory.db（只建表结构）

### 3.5 承接规则 ID

| 规则 ID | 来源文档 | 在 P0 的落地位置 |
|---------|---------|----------------|
| MC-CORE-001 | AST-M-D-01 §4.1 | augmentation 层独立于存储层，context_manager 不直接操作 DB |
| MC-LAYER-001 | AST-M-D-01 §4.2 | AI 对话中间态不进入 memory_items 表 |
| MC-LAYER-002 | AST-M-D-01 §5.2 | tab 层记忆绑定 tab_id，P0 标签级记忆实现 |
| MC-LAYER-003 | AST-M-D-01 §5.3 | layer 枚举分层存储，禁止混写 |
| MC-WRITE-001 | AST-M-D-01 §6.1 | 所有写入在 tokio::spawn 中执行，不阻塞 ai_chat_stream |
| MC-WRITE-002 | AST-M-D-01 §6.2 | P0 简化稳定性条件：对话>=5轮、AI提炼非空 |
| MC-WRITE-003 | AST-M-D-01 §6.3 | 写入前验证 scope_type/scope_id/source_kind/source_ref 四字段 |
| MC-READ-001 | AST-M-D-01 §7.1 | S-01 实现：显式 @ 引用进 L5，自动检索进 L6，去重 |
| MC-READ-002 | AST-M-D-01 §7.2 | S-02 实现：记忆注入位置晚于文档层，带 [记忆库信息] 标签 |
| S-01 | AST-M-S-05 §一 | context_manager 中过滤已显式引用的记忆项 |
| S-02 | AST-M-S-05 §二 | 注入使用 [记忆库信息] 包裹块，不匿名注入 |
| S-03 | AST-M-S-05 §三 | 每条记忆带 source_label 来源标签 |
| S-04 | AST-M-S-05 §四 | 内容提取前过滤系统指令、API 密钥等敏感内容 |

### 3.6 关联文档

- `A-AST-M-S-01_记忆服务数据库落地规范.md`（数据库规范）
- `A-AST-M-S-02_记忆检索与Query构造规范.md`（检索规范）
- `A-AST-M-S-03_记忆写入与冲突处理规范.md`（写入规范，P0 部分）
- `A-AST-M-S-04_上下文装配与裁剪规范.md`（注入规范）
- `A-AST-M-S-05_记忆注入安全规范.md`（安全规范 S-01~S-04）
- `A-ENG-X-F-01_ChatTab持久化UUID专项修复规范.md`（前置修复）
- `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`（规则来源）
- `A-AST-M-T-01_记忆模型.md`（数据模型来源）
- `A-AST-M-P-01_上下文注入.md`（注入协议来源）
- `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`（决策来源 D-01~D-13）

### 3.7 阶段产物

- `memory_items` 表 + FTS5 虚拟表 + 触发器在 `workspace.db` 中可用
- `memory_usage_logs` 表在 `workspace.db` 中可用
- 标签级记忆可写入（每 5 轮对话触发 AI 提炼）
- 项目内容记忆可写入（文件保存后触发，只处理文本文件）
- `search_memories_cmd` Tauri 命令可用（FTS5 + scope 过滤 + 500ms 超时）
- `context_manager.rs` augmentation 层有记忆注入（带 [记忆库信息] 来源标签）
- 写入/检索/注入失败均有 fallback，不中断主对话链
- `user_memory.db` 表结构已建，但 P0 不写入数据

### 3.8 验收标准（可量化）

以下条件全部满足时视为 P0 验收通过：

1. 对话 5 轮后，`memory_items` 表中出现对应 `scope_id=当前tab_uuid` 的 `layer='tab'` 记录
2. 保存一个文本文件后，`memory_items` 表中出现对应 `source_ref=文件路径` 的 `layer='content'` 记录
3. `search_memories_cmd` 在 500ms 内返回结果或返回 `timed_out=true` 的空列表，不报错
4. AI 对话触发后，tracing 日志中可观测到 `MEMORY_SEARCH_TRIGGERED` 和 `MEMORY_INJECT_SUCCESS` 或 `MEMORY_INJECT_FALLBACK` 事件
5. AI 回复的 prompt（通过 debug 日志输出）包含 `[记忆库信息]` 块（有记忆时）
6. 记忆写入失败时主对话不中断（故意让 AI 调用失败，验证对话正常）
7. `memory_items` 表中所有 tab 层记忆的 `scope_id` 均为 RFC 4122 UUID 格式（不出现 `chat-timestamp-random` 旧格式）
8. 注入记忆时每条记忆有 `[标签记忆]` 或 `[项目内容]` 前缀来源标签（S-03）
9. 相同 `scope_id + entity_name` 的记忆写入两次后，只有一条 `freshness_status='fresh'`，旧记录为 `superseded`
10. 用户 @ 引用一条记忆后，该记忆不再出现在 augmentation 层的自动注入中（S-01 去重）

### 3.9 主要风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 后台 AI 提炼调用量超预期（每 5 轮触发一次） | API 成本增加，影响体验 | D-11 要求使用独立轻量 model；P0 默认使用 deepseek-chat 而非 reasoner |
| FTS5 对中文分词效果差（逐字匹配效率低） | 检索召回率低，记忆注入效果差 | sanitize_fts_query 对中文按 OR 连接单字；P2 引入 embedding 作为补充 |
| augmentation 层注入后 token 预算溢出 | AI 上下文超限，请求失败 | A-AST-M-S-04 §四的裁剪算法保证 MemoryItem 在预算内；summary 优先于 content 注入 |
| AI 提炼任务与主对话竞争 AI 配额 | 主对话响应延迟增加 | D-11 独立 AI 配置口；提炼任务使用轻量 model，不影响主对话 API |

### 3.10 与 P1 的承接关系

P0 完成后，P1 可安全接入的能力：
- P0 的 `memory_items` 表和 FTS5 基础设施可直接被 P1 的 LLM-as-judge 写入流程使用
- P0 的 `upsert_tab_memories` 可在 P1 中被升格链复用
- P0 的 `mark_orphan_tab_memories_stale` 可扩展为 P1 的 stale 治理基础
- P0 的 augmentation 层注入框架可在 P1 中扩展为带 access_count 权重的增强排序
- P0 的 `memory_usage_logs` 为 P1 的 access_count 加权提供数据基础

---

## 四、P1 增强治理阶段

### 4.1 阶段目标

在 P0 基础闭环的基础上，引入写入质量管控（LLM-as-judge 分类）、受限升格链（tab 删除触发）、stale 治理（懒执行清理）、以及只读记忆管理界面。提升记忆系统的质量与可观测性。

### 4.2 进入前提

- P0 验收通过，基础闭环已可运行
- `memory_items` 表、FTS5、`memory_usage_logs` 均已建立
- `search_memories_cmd` 已可用，augmentation 层有记忆注入

### 4.3 主要任务列表

#### 模块1：写入增强（LLM-as-judge，D-11 配置口）

**任务P1-1.1：实现独立 AI 配置口（ExtractionConfig 结构）**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（或 config 模块）
- **改动说明**：定义 `ExtractionConfig { provider: String, model: String }` 结构体；在 `MemoryService::new` 中从应用配置读取 `memory_extraction_provider` 和 `memory_extraction_model`；未配置时默认使用主对话 provider，但强制切换至轻量 model（如 `deepseek-chat`，避免 reasoner 等高成本模型）
- **承接规则**：D-11（独立 AI 配置口）；A-AST-M-S-03 §十
- **完成标志**：可通过应用配置独立设置记忆提炼使用的 AI 模型，不影响主对话

**任务P1-1.2：实现 LLM-as-judge ADD/UPDATE/DELETE/NOOP 四分类**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `find_similar_memories(conn, candidate, top_k=3)` 函数；实现 `llm_judge_action(ai_service, candidate, similar_memories)` 函数（使用 A-AST-M-S-03 §三.3 的 prompt 模板）；在 `upsert_tab_memories` 和 `upsert_project_content_memories` 中，在写入前先检索相似记忆，再调用 LLM 分类，根据分类结果执行 ADD/UPDATE/DELETE/NOOP 操作
- **承接规则**：MC-WRITE-002（P1 完整稳定性判断）；A-AST-M-S-03 §三
- **完成标志**：写入一条与现有高相似度记忆，LLM 判定为 NOOP，不新增记录

**任务P1-1.3：在写入前用相似记忆检索做冲突判断**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：将 P0 的直接 upsert 改为"先检索 → 再判断 → 再写入"三步流程；检索步骤使用 `find_similar_memories`（基于 FTS5，同 scope_id + layer 范围内）；判断步骤调用 LLM-as-judge；写入步骤根据判断结果执行
- **承接规则**：A-AST-M-S-03 §三.2
- **完成标志**：重复触发同一场景的记忆生成不会无限累积记录数量

#### 模块2：升格链（D-12 受限升格）

**任务P1-2.1：实现 on_tab_deleted 受限升格逻辑**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn on_tab_deleted(&self, tab_id: &str, user_message_count: usize, workspace_path: Option<&str>)`；逻辑：
  1. 检查三条件：轮次 >= 5、有关联工作区（workspace_path != None）、AI 提炼返回置信度 >= 0.6
  2. 若三条件均满足：调用 AI 生成一条 `workspace_long_term` 层摘要候选，写入 memory_items
  3. 任一条件不满足：不生成长期记忆
  4. 无论是否升格：将该 tab_id 所有 memory_items 标记为 expired
- **承接规则**：D-12（受限升格三条件）；MC-WRITE-002；A-AST-M-S-03 §十一；A-AST-M-T-01 §5.3（标签删除 → 标签级记忆删除）
- **完成标志**：删除一个有 6 轮对话、有工作区的 tab，数据库中出现一条 workspace_long_term 记录；该 tab 的 tab 层记忆均变为 expired

**任务P1-2.2：在前端 deleteTab 中触发 on_tab_deleted**

- **所属文件**：`src/stores/chatStore.ts`，以及对应的 Tauri 命令
- **改动说明**：在 `deleteTab` 前，异步调用 `invoke('on_tab_deleted_cmd', { tabId, userMessageCount, workspacePath })`；调用完成后再执行 store 内的 tab 删除操作；失败只 console.warn
- **承接规则**：A-AST-M-D-01 §6.4（标签删除 → 记忆升格）；D-12
- **完成标志**：前端删除 tab 时，后端 on_tab_deleted 被触发，日志可观测

#### 模块3：stale 治理（D-13）

**任务P1-3.1：实现 startup_maintenance 清理函数**

- **所属文件**：`src-tauri/src/services/memory_service.rs`
- **改动说明**：实现 `pub async fn startup_maintenance(&self)`；SQL：删除 `freshness_status IN ('stale', 'expired') AND updated_at < (now - 30天)` 的记忆；保留 superseded 记录 7 天；使用 `tokio::spawn` 异步调用（失败只 `tracing::warn!`，不中断启动）
- **承接规则**：D-13（懒执行 + 启动检查）；A-AST-M-S-03 §十二
- **完成标志**：应用启动后日志中出现 startup_maintenance 执行记录；30 天+ 的 stale 记忆被物理删除

**任务P1-3.2：在 workspace 加载完成后触发 startup_maintenance**

- **所属文件**：`src-tauri/src/commands/workspace_commands.rs`（或 fileStore.ts 触发对应 Tauri 命令）
- **改动说明**：workspace 加载完成后（与孤立 tab 清理类似），后台异步调用 `state.memory_service.startup_maintenance()`；使用 tokio::spawn，不阻塞 workspace 加载完成事件
- **承接规则**：D-13；A-AST-M-D-01 §6.4.2（失效链工程细节）
- **完成标志**：workspace 加载时，日志中出现 startup_maintenance 触发记录

**任务P1-3.3：检索前懒判定 stale 降权**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（search_memories 内部）
- **改动说明**：P0 的排序 SQL 已包含 `CASE m.freshness_status WHEN 'fresh' THEN 1.0 ELSE 0.5 END` 的 stale 降权；P1 补充：若 `updated_at < now - 7天` 且 `freshness_status='fresh'`，在检索返回前（非 DB 层）将其标记为 stale 并更新 DB（或在返回时附加 stale 标注）
- **承接规则**：A-AST-M-T-01 §4.1.3（7 天未更新触发 stale）；A-AST-M-D-01 §6.4.2
- **完成标志**：超过 7 天未更新的 fresh 记忆在检索结果中显示 stale 标注或降权

#### 模块4：前端展示（D-08 P1 部分）

**任务P1-4.1：重构 MemoryTab 组件为只读记忆树**

- **所属文件**：`src/components/Memory/MemoryTab.tsx`（或新建文件）
- **改动说明**：废弃旧的按 document_path 分组显示；改为按 layer 分组展示（标签记忆 / 项目内容 / 工作区长期记忆 / 用户偏好）；每个分组下按 entity_type 细分；显示 freshness_status 标识（fresh/stale/expired 用不同颜色或图标区分）；显示 source 来源标注；P1 只读，不允许编辑
- **承接规则**：D-08（P1 只读 UI）；A-AST-M-T-01 §3.1（四层记忆模型）
- **完成标志**：MemoryTab 面板能正确展示 layer='tab' 和 layer='content' 的记忆项，freshness_status 有可视区分

**任务P1-4.2：实现记忆搜索功能（面板内）**

- **所属文件**：`src/components/Memory/MemoryTab.tsx`
- **改动说明**：添加搜索输入框，调用 `memoryService.searchMemories` 展示过滤结果；搜索时传入当前工作区路径和活跃 tab_id 作为 scope 过滤
- **承接规则**：R-AST-M-R-01（记忆面板搜索功能）
- **完成标志**：面板搜索可过滤展示的记忆项

#### 模块5：检索增强

**任务P1-5.1：实现 access_count 权重增强排序**

- **所属文件**：`src-tauri/src/services/memory_service.rs`（search_memories 的 SQL）
- **改动说明**：P0 的排序 SQL 已包含 `access_count` 轻微加权；P1 确认公式正确（参考 A-AST-M-S-02 §四.2：`(1.0 + 0.1 * MIN(access_count, 10)) * (-fts.rank)`）；确保每次命中后 access_count 正确递增（任务4.5 中的 UPDATE 语句）
- **承接规则**：A-AST-M-S-02 §四（排序因子）；A-AST-M-S-01 §2.6（access_count 更新规则）
- **完成标志**：被多次命中的记忆项在后续检索中排名提升

**任务P1-5.2：实现 S-05 外部文档来源记忆标注规则**

- **所属文件**：`src-tauri/src/services/context_manager.rs`（format_memory_item_line 函数）
- **改动说明**：source_kind 为 document_extract / document_outline 时，source_label 包含文件名（`[项目内容 · {file_name}]`）；不得将 entity_type 前缀为 `entity_*` 的记忆与 `preference/constraint` 类记忆混放
- **承接规则**：S-05（P1 扩展规则）；A-AST-M-S-05 §五
- **完成标志**：项目内容记忆在 prompt 中显示 `[项目内容 · 文件名.md]` 格式标注

**任务P1-5.3：实现 S-06 注入时锚定指令模板（超过 5 条时）**

- **所属文件**：`src-tauri/src/services/context_manager.rs`（format_memory_results_to_context_slice）
- **改动说明**：当 search_memories 返回超过 5 条记忆时，在 `[记忆库信息]` 块开头加入 A-AST-M-S-05 §六定义的锚定指令（防止 AI 将历史记忆误认为当前现场事实）
- **承接规则**：S-06（P1 锚定指令，A-AST-M-S-05 §六）
- **完成标志**：注入记忆超过 5 条时，prompt 中包含"以下内容来自历史对话或文档分析的记忆提炼，供参考..."的锚定说明

### 4.4 涉及模块

- **后端**：memory_service.rs（升格、stale 治理、LLM-as-judge）、context_manager.rs（锚定指令）、ai_commands.rs（on_tab_deleted 触发）
- **前端**：chatStore.ts（deleteTab 触发 on_tab_deleted）、MemoryTab.tsx（只读 UI 重构）、memoryService.ts（搜索接口）
- **数据库**：workspace.db（startup_maintenance 清理逻辑）

### 4.5 承接规则 ID

| 规则 ID | 在 P1 的落地位置 |
|---------|----------------|
| MC-WRITE-002（完整版） | LLM-as-judge ADD/UPDATE/DELETE/NOOP 分类 |
| MC-LAYER-003 | on_tab_deleted 升格：tab 层 → workspace_long_term 层 |
| MC-GOV-002 | 记忆层治理不下压到层次一/二 |
| S-05 | 项目内容记忆注入带文件名标注 |
| S-06 | 超 5 条记忆注入时加锚定指令 |
| D-12 | 受限升格三条件（轮次>=5, 有工作区, 置信度>=0.6） |
| D-13 | 懒执行 + 启动检查清理策略 |

### 4.6 关联文档

- `A-AST-M-S-03_记忆写入与冲突处理规范.md`（P1/P2 章节：LLM-as-judge、升格链、stale 清理）
- `A-AST-M-S-05_记忆注入安全规范.md`（S-05~S-06 P1 扩展规则）
- `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`（D-11~D-13 详细决策）

### 4.7 阶段产物

- LLM-as-judge 四分类写入流程（ADD/UPDATE/DELETE/NOOP）
- `on_tab_deleted` 受限升格逻辑（三条件验证后最多写入一条 workspace_long_term 记忆）
- `startup_maintenance()` 启动清理任务（30 天+ stale/expired 记忆物理删除）
- 只读记忆管理界面（按 layer 分组，展示 freshness_status 和来源标注）
- access_count 权重增强排序
- S-05~S-06 安全规则实现

### 4.8 验收标准（可量化）

1. 删除一个有 6+ 轮对话、有工作区的 tab，数据库中出现一条 workspace_long_term 层记忆
2. 删除一个只有 3 轮对话的 tab，不生成 workspace_long_term 记忆
3. 写入一条与现有相似度 > 80% 的重复记忆，LLM 判定 NOOP，数据库记录数不增加
4. 应用启动后，30 天以上的 stale/expired 记忆被物理删除（通过日志验证）
5. MemoryTab 面板能按 layer 展示记忆项，fresh/stale 有可视区分
6. 注入记忆超过 5 条时，prompt 中出现锚定指令文本
7. 被注入 10+ 次的记忆项在检索结果中排名高于同层未被注入的记忆

### 4.9 主要风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM-as-judge 误判为 NOOP 导致有价值记忆丢失 | 用户感知记忆缺失 | 保守阈值设置；NOOP 只跳过写入，不删除现有记录；通过日志可审查 |
| 升格条件置信度评估不准确 | 低质量摘要进入长期记忆 | 受限模式：最多一条，且 confidence >= 0.6；P2 引入用户确认机制 |
| stale 清理误删有价值记忆 | 用户体验下降 | 30 天缓冲期；superseded 保留 7 天；只删除 stale/expired，不删除 fresh |

### 4.10 与 P2 的承接关系

P1 完成后，P2 可安全接入的能力：
- P1 的 `workspace_long_term` 升格链为 P2 的用户级记忆演化提供数据基础
- P1 的只读 UI 框架可扩展为 P2 的可编辑 UI
- P1 的 stale 治理机制可扩展支持 user_memory.db 中的用户级记忆清理
- P1 的 LLM-as-judge 框架可复用于 P2 的用户级记忆合并与演化

---

## 五、P2 深化演进阶段

### 5.1 阶段目标

P2 是记忆系统的深化演进阶段，聚焦于用户级记忆实际写入、强交互治理 UI、语义检索评估，以及记忆演化机制。P2 不阻塞其他功能模块的演进。

### 5.2 主要方向

#### 方向1：用户级记忆深化

- 在 `user_memory.db` 中实现实际写入路径（P0 只建了表结构）
- 跨工作区行为模式识别：当同一用户在多个工作区表现出稳定偏好时，触发用户级记忆提炼
- 实现 `user_id` 生成策略（Tauri `app_data_dir` 路径 hash 或独立 UUID 持久化）
- 跨工作区记忆检索：`scope=user` 时从 `user_memory.db` 检索

#### 方向2：强交互治理 UI

- 在 MemoryTab 中支持用户"屏蔽"记忆（将 readonly=0 + 设置 freshness_status='expired'）
- 支持用户"合并"两条相似记忆（手动 UPDATE）
- 支持批量操作（按 layer/entity_type 批量屏蔽）
- 搜索功能增强（跨层检索、按时间范围过滤）
- P0/P1 MemoryTab 只读界面的完整功能扩展

#### 方向3：Embedding / Hybrid Retrieval 评估与引入

- 评估本地轻量 embedding 模型（如 BGE-m3、nomic-embed-text）的可行性
- 若引入：在 `memory_items` 表中增加 embedding 向量列（或独立 embedding 存储）
- 实现 FTS5 + 向量相似度的混合检索（重排）
- 不引入外部向量数据库（D-07 原则：不使用 pgvector、qdrant 等外部服务）

#### 方向4：记忆演化机制

- 实现关联记忆更新：当一条记忆更新时，检索语义相关记忆并评估是否需要联动更新
- 实现记忆关系图（MemoryEdge，A-AST-M-T-01 §4.3 定义）
- 工具主动写入：评估是否为 AI 提供 `save_memory` 工具（MemGPT 模式），允许 AI 在执行过程中主动触发记忆保存

#### 方向5：复杂冲突处理

- P1 的 LLM-as-judge 扩展至支持跨层冲突检测（tab 层记忆与 content 层记忆矛盾时的处理）
- 用户确认机制：对高置信度的 DELETE 操作在 UI 中提示用户确认

#### 方向6：知识库与记忆库协同

- `A-AST-M-T-02_知识库机制.md` 定义了知识库与记忆库并列的上下文增强体系
- P2 确认两者在 augmentation 层的 token 预算分配（10%/10% 各自独立）
- 实现知识库检索结果注入（`KnowledgeBase` ContextSliceType，当前为占位）

---

## 六、模块任务映射表（全局）

| 模块 | 所属阶段 | 任务 | 输入 | 输出 | 依赖 |
|------|---------|------|------|------|------|
| workspace/workspace_db.rs + memory_service.rs | P0 | 创建 memory_items 表 + FTS5 + 触发器 | A-AST-M-S-01 §二/四 SQL 定义 | migration v3 + 运行时兜底均可确保 schema 存在 | workspace.db 连接 |
| memory_service.rs | P0 | 创建 memory_usage_logs 表 | A-AST-M-S-01 §三 SQL 定义 | memory_usage_logs 表 + usage 索引 | WORKSPACE_MEMORY_DDL |
| memory_service.rs | P0 | 创建关键索引 | A-AST-M-S-01 §六 | scope/entity/freshness/source_ref/usage 查询索引 | memory_items 表已存在 |
| memory_service.rs | P0 | 定义 Rust 数据结构 | A-AST-M-T-01 §四、A-AST-M-S-01 §八 | MemoryLayer/MemoryScopeType/FreshnessStatus/MemorySourceKind/MemoryItem/MemoryItemInput/MemoryError 枚举和结构体 | 无 |
| memory_service.rs | P0 | 实现 upsert_tab_memories | A-AST-M-S-03 §六.1 代码骨架 | tab 层记忆写入逻辑（superseded + insert） | memory_items 表、workspace.db 连接 |
| memory_service.rs | P0 | 实现 upsert_project_content_memories | A-AST-M-S-03 §六.2 代码骨架 | content 层记忆写入逻辑 | memory_items 表、workspace.db 连接 |
| memory_service.rs | P0 | 实现 memory_generation_task_tab | A-AST-M-S-03 §四 函数骨架 | 标签级记忆 AI 提炼任务（后台异步） | ai_service、upsert_tab_memories |
| memory_service.rs | P0 | 实现 memory_generation_task_content | A-AST-M-S-03 §五 函数骨架 | 项目内容记忆 AI 提炼任务（后台异步） | ai_service、upsert_project_content_memories、S-04 内容过滤 |
| memory_service.rs | P0 | 实现 search_memories | A-AST-M-S-02 §一完整签名 + §三 scope 过滤 | FTS5 检索接口（含 500ms 超时、空结果 fallback） | memory_items_fts、memory_items 表 |
| memory_service.rs | P0 | 实现 mark_orphan_tab_memories_stale | ENG-X-F-01 §五.1；A-AST-M-S-01 §2.3.1 | 孤立 tab 记忆降级为 stale，返回被标记条数 | memory_items 表 |
| memory_commands.rs | P0 | 暴露 search_memories_cmd Tauri 命令 | A-AST-M-S-02 §一.2 命令签名 | search_memories_cmd 可被前端调用 | memory_service.search_memories |
| memory_commands.rs | P0.5 | 暴露 mark_orphan_tab_memories_stale 命令 | ENG-X-F-01 §五.2 | mark_orphan_tab_memories_stale 命令可被前端调用 | memory_service.mark_orphan_tab_memories_stale |
| ai_commands.rs | P0 | 实现 build_memory_query | A-AST-M-S-02 §二.1 代码骨架 | query 字符串（用户消息 + 文件名 + 选区） | 请求上下文字段 |
| ai_commands.rs + context_manager.rs | P0 | augmentation 层接入 search_memories | A-AST-M-S-04 §二 注入顺序表；D-10 | augmentation 层有记忆注入 | memory_service.search_memories |
| ai_commands.rs | P0 | 实现 format_memory_for_injection | A-AST-M-S-04 §五；S-02；S-03 注入格式 | 带 [记忆库信息] 标签的注入文本 | MemorySearchResult 列表 |
| ai_commands.rs | P0 | S-01 显式引用去重 | A-AST-M-S-05 §一 代码骨架 | 以真实 `memory_item.id` 去重，显式引用项不重复进入 augmentation | references 列表、memory_results 列表 |
| memory_service.rs | P0 | 记录 memory_usage_logs | A-AST-M-S-01 §七.4 SQL | 注入记录写入、access_count 递增 | memory_usage_logs 表 |
| ai_commands.rs | P0 | 轮次阈值检查 + 触发 tab 记忆提炼 | A-AST-M-S-03 §一.1 代码骨架 | 每 5 轮触发 memory_generation_task_tab（fire-and-forget） | chatStore 消息历史、memory_service |
| file_commands.rs | P0 | sync_workspace_file_cache_after_save 接入记忆触发 | A-AST-M-S-03 §一.2 代码骨架 | 文件保存后触发 memory_generation_task_content | memory_service、ai_service |
| memoryService.ts | P0 | 更新 MemoryItem 接口 | A-AST-M-S-02 §一.3 TypeScript 接口 | 新的 MemoryItem / SearchMemoriesParams / MemorySearchResponse TypeScript 类型 | 无 |
| memoryService.ts | P0 | 更新 searchMemories 调用 | A-AST-M-S-02 §一.3 代码骨架 | 前端 searchMemories 可用，调用 search_memories_cmd | memory_commands.rs 中的命令 |
| chatStore.ts | P0.5 | tabId 改为 UUID | ENG-X-F-01 §三.2 | createTab 生成 RFC 4122 UUID | crypto.randomUUID() |
| chatStore.ts | P0.5 | 引入 persist 中间件 | ENG-X-F-01 §三.3 | tab 元数据持久化至 localStorage | zustand/middleware persist |
| chatStore.ts | P0.5 | 定义 PersistedChatTab 类型 | ENG-X-F-01 §三.1 | PersistedChatTab 与 ChatTab 类型分离 | 无 |
| chatStore.ts | P0.5 | onRehydrateStorage 回调 | ENG-X-F-01 §三.3 | 恢复后 messages 初始化为空数组 | persist 中间件 |
| fileStore.ts | P0.5 | setCurrentWorkspace 后触发孤立清理 | ENG-X-F-01 §四.4 | mark_orphan_tab_memories_stale 在 workspace 加载后调用（仅当前 workspace tabs） | memory_commands.rs 命令 |
| memory_service.rs | P1 | ExtractionConfig 独立 AI 配置口 | D-11；A-AST-M-S-03 §十 | 记忆提炼使用独立 provider/model 配置 | 应用配置读取 |
| memory_service.rs | P1 | LLM-as-judge 四分类 | A-AST-M-S-03 §三 | ADD/UPDATE/DELETE/NOOP 写入分类 | ai_service、find_similar_memories |
| memory_service.rs | P1 | on_tab_deleted 受限升格 | D-12；A-AST-M-S-03 §十一 | 三条件验证 + workspace_long_term 层记忆写入（最多一条） | upsert_project_content_memories（复用）、ai_service |
| memory_service.rs | P1 | startup_maintenance 清理 | D-13；A-AST-M-S-03 §十二 | 30 天+ stale/expired 记忆物理删除 | workspace.db 连接 |
| context_manager.rs | P1 | S-06 锚定指令（>5 条时） | A-AST-M-S-05 §六 | 超 5 条记忆注入时加锚定说明文本 | format_memory_results_to_context_slice |
| MemoryTab.tsx | P1 | 只读记忆树 UI 重构 | D-08 P1；A-AST-M-T-01 §3.1 | 按 layer 分组展示，freshness_status 可视 | memoryService.searchMemories |

---

## 七、规则承接表

| 规则 ID | 来源文档 | 规则含义 | 落地阶段 | 落地模块 | 验收方式 |
|---------|---------|---------|---------|---------|---------|
| MC-CORE-001 | AST-M-D-01 §4.1 | 记忆协同层独立于存储模型和注入策略层 | P0 | context_manager.rs（不直接操作 DB，通过 memory_service） | 代码审查：context_manager 不引用 rusqlite |
| MC-LAYER-001 | AST-M-D-01 §4.2/5.1 | 当前轮 Agent 状态与 artifact 默认不等于记忆库 | P0 | memory_service.rs（写入前验证 source_kind 不为 agent_artifact） | 代码审查：无 agent 中间态直接写入 memory_items 的路径 |
| MC-LAYER-002 | AST-M-D-01 §5.2 | 对话记忆是标签级持续语义层，不等于原始聊天历史 | P0 | memory_generation_task_tab（AI 提炼，不直接存储消息） | 验证 memory_items 中无 content='原始消息文本' 的记录 |
| MC-LAYER-003 | AST-M-D-01 §5.3 | 项目/工作区/用户记忆必须分层治理，不得混写 | P0 | memory_service.rs 中 upsert_tab_memories / upsert_project_content_memories 分离 | 验证 tab 层写入只写 layer='tab'，不写 layer='workspace_long_term' |
| MC-WRITE-001 | AST-M-D-01 §6.1 | 记忆写入默认后台异步，不阻塞主协作链 | P0 | memory_service.rs 所有写入操作使用 tokio::spawn | 故意让 AI 提炼延迟 2 秒，验证主对话响应不受影响 |
| MC-WRITE-002 | AST-M-D-01 §6.2 | 只有满足稳定性条件的对象才能升格为记忆项 | P0（简化）/ P1（完整） | P0：轮次>=5 + 非空；P1：LLM-as-judge 四分类 | 1 轮对话不触发写入；5 轮触发后数据库有记录 |
| MC-WRITE-003 | AST-M-D-01 §6.3 | 未确认/已失效/高噪声 artifact 不得直接入长期记忆 | P0 | memory_service.rs 写入前字段完整性验证 | 缺少 scope_type 的写入被拒绝，记录 warn 日志 |
| MC-READ-001 | AST-M-D-01 §7.1 | 显式引用与当前轮状态优先于自动记忆检索 | P0 | S-01 实现：context_manager.rs 中显式引用去重 | 用户 @ 引用的记忆不重复出现在 augmentation 层 |
| MC-READ-002 | AST-M-D-01 §7.2 | 记忆检索只做补强，不得覆盖当前文档事实与用户显式引用 | P0 | S-02 实现：记忆注入位置在 L6，晚于 L4 文档层和 L5 显式引用层 | 代码审查：augmentation 层 priority > fact 层和 constraint 层 |
| MC-GOV-001 | AST-M-D-01 §8.1 | 三文档分工明确（存什么/怎么注入/如何协调） | P0 | 三文档已存在且定位清晰 | 文档审查：无职责混乱 |
| MC-GOV-002 | AST-M-D-01 §8.2 | 未明确作用于层次一/二的记忆优化不默认下压 | P0 | context_manager 中层次一/二代码路径不引用 memory_service | 代码审查：只有 build_multi_layer_prompt（L3）调用 search_memories |
| S-01 | AST-M-S-05 §一 | 显式引用优先于自动记忆检索 | P0 | context_manager.rs：augmentation 层过滤已显式引用的记忆 ID | 显式引用记忆后，该记忆不出现在 [记忆库信息] 块 |
| S-02 | AST-M-S-05 §二 | 自动检索记忆不得覆盖当前文档事实 | P0 | context_manager.rs：[记忆库信息]...[/记忆库信息] 标签包裹 | 检查 prompt：记忆内容有明确块标签，不混入文档块 |
| S-03 | AST-M-S-05 §三 | 记忆注入必须带来源标签与作用域标注 | P0 | format_memory_item_line 函数输出带 source_label | 检查 prompt：每条记忆有 [标签记忆] 或 [项目内容] 前缀 |
| S-04 | AST-M-S-05 §四 | 文档内容提取时的指令类内容过滤 | P0 | memory_generation_task_content 中 filter_sensitive_content | 含 ignore previous instructions 的文档不生成对应记忆 |
| S-05 | AST-M-S-05 §五 | 外部文档来源的记忆标注规则 | P1 | format_memory_item_line 扩展，document_extract 来源带文件名 | 项目内容记忆显示 [项目内容 · 文件名] 格式 |
| S-06 | AST-M-S-05 §六 | 注入时的锚定指令模板（>5 条时） | P1 | format_memory_results_to_context_slice 扩展 | 超过 5 条注入时，[记忆库信息] 块开头有锚定说明 |

---

## 八、文档关联关系表

| 文档 | 文档角色 | 在计划中的作用 | 对应阶段 | 是否需回写 |
|------|---------|--------------|---------|----------|
| A-AST-M-D-01 | 主控 | MC-* 规则来源；协同对象边界定义 | 全阶段 | 是（各阶段规则落地后标注落地状态） |
| A-AST-M-T-01 | 记忆模型 | 数据模型（MemoryItem 字段集）来源；四层分层定义；生命周期规则 | P0（数据结构）、P1（升格链） | 否（已完整，无需修改） |
| A-AST-M-P-01 | 上下文注入 | 注入顺序（10% 预算给记忆）、ContextPackage 结构、降级暴露码 | P0（注入链） | 否（已完整） |
| A-AST-X-L-01 | 收口文档 | D-01~D-13 全部决策来源；每个阶段的实施边界定义 | 全阶段 | 是（D-01~D-13 实施完成后逐条标注） |
| A-AST-M-S-01 | 专项规范：数据库 | memory_items 完整 SQL、FTS5 定义、Rust 数据结构骨架 | P0（模块1） | 否（已完整） |
| A-AST-M-S-02 | 专项规范：检索 | search_memories 完整签名、query 构造、排序公式、超时定义 | P0（模块3） | 否（已完整） |
| A-AST-M-S-03 | 专项规范：写入 | 写入触发规则、AI 提炼 prompt、upsert 骨架、P1 LLM-as-judge、升格链、stale 清理 | P0（模块2）、P1 | 否（已完整） |
| A-AST-M-S-04 | 专项规范：注入 | ContextSlice/ContextPackage 完整结构、裁剪算法、注入文本模板 | P0（模块4） | 否（已完整） |
| A-AST-M-S-05 | 专项规范：安全 | S-01~S-06 安全规则完整行为定义 | P0（S-01~S-04）、P1（S-05~S-06） | 否（已完整） |
| A-ENG-X-F-01 | 专项修复 | P0.5 实施依据；chatStore UUID 修复完整规范 | P0.5 | 是（验收通过后标注完成状态） |
| R-AST-M-R-01 | 旧体系参考 | P0/P1/P2 功能优先级原始定义参考；树状 UI 设计参考（P1 UI 实现时参考） | P0（优先级）、P1（UI） | 否（旧体系文档不修改） |
| R-AST-M-R-03 | 旧体系参考 | 接口协议冻结参考（search_memories 历史签名）；数据库表结构历史参考 | P0（接口兼容性确认） | 否（旧体系文档不修改） |

---

## 九、跨模块对接表

| 对接 ID | 模块 A | 模块 B | 对接内容 | 所属阶段 | 依赖规则/文档 |
|---------|--------|--------|---------|---------|-------------|
| INT-MEM-CTX-01 | memory_service | context_manager | search_memories 检索结果 → ContextSlice → augmentation 层注入 | P0 | AST-M-S-02（检索接口）、AST-M-S-04（注入顺序）、S-02/S-03（注入格式）|
| INT-MEM-AICMD-01 | ai_commands | memory_service | ai_chat_stream 轮次计数达阈值 → tokio::spawn memory_generation_task_tab | P0 | AST-M-S-03 §一.1（触发规则）、MC-WRITE-001 |
| INT-MEM-FE-01 | chatStore | memory_service | tab UUID（crypto.randomUUID()）→ scope_id（标签级记忆绑定） | P0.5 + P0 | ENG-X-F-01（UUID 修复）、AST-M-S-01 §2.3.1 |
| INT-MEM-WS-01 | file_commands/workspace | memory_service | 文件保存成功事件（sync_workspace_file_cache_after_save）→ memory_generation_task_content | P0 | AST-M-S-03 §一.2（触发条件）、D-02 |
| INT-MEM-REF-01 | referenceStore / context_manager | memory_service | 用户 @ 引用的记忆项 ID → augmentation 层去重（S-01 过滤） | P0 | AST-M-S-05 §一（S-01 实现）、MC-READ-001 |
| INT-MEM-ORPHAN-01 | fileStore（openWorkspace） | memory_commands | workspace 加载完成 → invoke mark_orphan_tab_memories_stale（孤立 tab 降级） | P0.5 | ENG-X-F-01 §四.4、AST-M-S-01 §2.3.1 |
| INT-MEM-LOG-01 | context_manager（注入成功） | memory_service | 注入的记忆项 ID → memory_usage_logs INSERT + access_count++ | P0 | AST-M-S-01 §七.4（注入日志 SQL） |
| INT-MEM-DB-01 | workspace/workspace_db.rs + memory_service.rs | memory_service | migration v3 初始化 + MemoryService 运行时兜底，确保 workspace.db memory schema 可用 | P0 | AST-M-S-01 §一.2（与 workspace.db 的集成点）、D-03 |
| INT-MEM-CHAT-01 | chatStore（deleteTab） | memory_service / ai_commands | tab 删除事件 → on_tab_deleted（受限升格 + expired 标记） | P1 | D-12、AST-M-S-03 §十一 |
| INT-MEM-MAINT-01 | workspace 加载完成事件 | memory_service | 应用启动 workspace 加载 → startup_maintenance（清理 30天+ stale/expired） | P1 | D-13、AST-M-S-03 §十二 |
| INT-MEM-UI-01 | MemoryTab.tsx | memoryService.ts | 面板搜索输入 → searchMemories（tab_id + workspace_path 过滤） → 结果展示 | P1 | AST-M-S-02（搜索接口）、D-08 P1 UI |
| INT-MEM-JUDGE-01 | memory_service（写入前）| ai_service | MemoryItemInput 候选 → find_similar_memories → llm_judge_action → ADD/UPDATE/DELETE/NOOP | P1 | AST-M-S-03 §三（LLM-as-judge）、D-11（独立 AI 配置）|
| INT-MEM-BUDGET-01 | context_manager（裁剪） | ContextPackage | MemoryItem ContextSlice + Augmentation 层 10% 预算 → trim_context_slices | P0 | AST-M-S-04 §三（token 预算）、AST-M-P-01 §五.1 |
| INT-MEM-SAFE-01 | memory_generation_task_content | filter_sensitive_content | 文档原始 HTML → strip_html_tags → filter_sensitive_content → AI 提炼 | P0 | AST-M-S-05 §四（S-04 内容安全过滤）|

---

## 十、调试与观测规范

### 10.1 结构化日志事件清单

以下事件使用 `tracing::info!` 或 `tracing::warn!` 记录，格式：`[MEMORY_{EVENT}] {字段列表}`

| 事件名 | 级别 | 触发时机 | 关键字段 |
|--------|------|---------|---------|
| MEMORY_WRITE_QUEUED | info | 记忆候选已加入后台写入任务 | tab_id / file_path, layer, entity_count |
| MEMORY_WRITE_SUCCESS | info | 记忆成功写入 memory_items | layer, entity_name, scope_id, is_supersede |
| MEMORY_WRITE_SKIPPED | info | LLM-as-judge 判定 NOOP，跳过写入 | entity_name, reason |
| MEMORY_WRITE_FAILED | warn | 写入失败（DB 错误、验证失败等）| layer, scope_id, error_code, reason |
| MEMORY_EXTRACTION_STARTED | info | AI 提炼任务开始（后台） | tab_id / file_path, trigger_type |
| MEMORY_EXTRACTION_FAILED | warn | AI 提炼调用失败 | tab_id / file_path, error_msg |
| MEMORY_SEARCH_TRIGGERED | info | 检索被触发（每次 ai_chat_stream 前） | query_length, tab_id, workspace_path, scope |
| MEMORY_SEARCH_RESULT | info | 检索返回结果 | hit_count, layers_searched, elapsed_ms |
| MEMORY_SEARCH_TIMEOUT | warn | 检索超时（>500ms）| query_preview, elapsed_ms |
| MEMORY_INJECT_SUCCESS | info | 注入成功（augmentation 层） | item_count, token_cost, layer_distribution |
| MEMORY_INJECT_FALLBACK | warn | 注入降级（检索失败/空结果/预算不足）| reason, fallback_type |
| MEMORY_INJECT_TRUNCATED | info | 记忆被裁剪（token 预算不足）| original_count, kept_count, budget_used |
| MEMORY_STALE_MARKED | info | 记忆被标记为 stale | count, reason（orphan_tab / 7day_timeout）|
| MEMORY_EXPIRED_MARKED | info | 记忆被标记为 expired | count, reason（tab_deleted / source_deleted）|
| MEMORY_ORPHAN_CLEANUP | info | 孤立 tab 记忆清理完成 | staled_count, active_tab_count |
| MEMORY_MAINTENANCE_RUN | info | startup_maintenance 执行完成 | deleted_count, superseded_kept_count, elapsed_ms |
| MEMORY_UPGRADE_TRIGGERED | info | on_tab_deleted 升格任务触发 | tab_id, user_message_count, has_workspace |
| MEMORY_UPGRADE_SUCCESS | info | 升格成功（workspace_long_term 写入）| entity_name, confidence |
| MEMORY_UPGRADE_SKIPPED | info | 升格跳过（三条件不满足）| tab_id, failed_condition |

### 10.2 调试开关

在 `AppConfig`（或 `.binder/config.toml`）中定义以下配置项：

| 配置键 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `memory.enabled` | bool | true | 是否启用整个记忆系统（false 时所有操作为空操作，主对话不受影响） |
| `memory.write_enabled` | bool | true | 是否启用写入（false 时只检索注入，不触发 AI 提炼；用于排查注入效果）|
| `memory.inject_enabled` | bool | true | 是否注入到 context（false 时只写入，不注入；用于排查 token 预算问题）|
| `memory.debug_log` | bool | false | 是否输出详细调试日志（true 时额外输出 query 内容、SQL 等敏感信息）|
| `memory.extraction_interval` | usize | 5 | 标签级记忆提炼轮次间隔（生产默认 5，调试可设为 1）|

### 10.3 错误码清单

| 错误码 | 含义 | 影响范围 | 处理方式 |
|--------|------|---------|---------|
| MEM_WRITE_001 | 写入队列背压（背景任务堆积） | 记忆可能延迟或丢失 | 静默跳过，记录 warn 日志，不影响主对话 |
| MEM_WRITE_002 | AI 提炼调用失败（网络/API 限速）| 本次提炼无记忆生成 | 重试 1 次（指数退避 500ms），失败则跳过本次提炼 |
| MEM_WRITE_003 | JSON 解析失败（AI 返回格式错误）| 本次提炼无记忆生成 | 记录 warn + AI 原始响应前 200 字，不重试 |
| MEM_WRITE_004 | 字段完整性验证失败（MC-WRITE-003）| 该条记忆不写入 | 记录 warn + 缺失字段名，跳过该条 |
| MEM_WRITE_005 | DB 锁超时（连接池争用）| 本次写入失败 | 等待 100ms 后重试 1 次，失败则放弃 |
| MEM_SEARCH_001 | 检索超时（>500ms）| 本轮无记忆注入 | 返回 `timed_out=true` 空列表，不报错 |
| MEM_SEARCH_002 | FTS5 query 为空（query 构造失败）| 检索被跳过 | 返回空列表，记录 debug 日志 |
| MEM_SEARCH_003 | DB 查询失败 | 本轮无记忆注入 | fallback 空列表，记录 warn 日志 |
| MEM_INJECT_001 | Token 预算溢出（记忆过多）| 部分记忆被裁剪 | 按优先级裁剪（tab > content > workspace_long_term），保留最高分 |
| MEM_INJECT_002 | 注入格式化失败 | 本轮无记忆注入 | fallback 空 ContextSlice，记录 warn 日志 |
| MEM_UPGRADE_001 | 升格 AI 调用失败 | 本次升格无记忆写入 | 记录 warn，不重试（下次标签删除会重试） |
| MEM_UPGRADE_002 | 升格置信度不足（< 0.6）| 升格被跳过 | 记录 info MEMORY_UPGRADE_SKIPPED，不写入 |
| MEM_MAINT_001 | startup_maintenance DB 操作失败 | 清理未完成 | 记录 warn，不中断应用启动 |

---

## 十一、已决策收口项（2026-04-07）

以下4个问题已由产品负责人逐条确认，结论直接写入本计划，无剩余待确认项。

### 问题1：项目内容记忆阶段 → **已决策：P0**

- **决策**：项目内容记忆（文件保存触发提取）纳入 **P0**。
- **影响任务**：任务2.3、2.5、2.6 保持 P0 归属不变。
- **说明**：D-01 中"放P1"的描述指的是完整的大纲优先/按需深入策略（高级功能），基础文件保存触发提取属于 P0 必须项。本计划的 P0 任务安排已正确，无需调整。

### 问题2：user_memory.db 初始化时机 → **已决策：P0 传 None，P2 再实现**

- **决策**：P0 阶段 `MemoryService` 的 `user_db` 字段传 `None`，不初始化 user_memory.db，不建表。用户级记忆数据库的初始化完全延迟至 P2 阶段。
- **影响任务**：任务1.4 从"建表结构"改为"预留 user_db: Option<...> 字段，P0 传 None"，不执行任何 user_memory.db 建表操作。
- **代码约束**：MemoryService 中所有涉及 user_db 的操作路径，P0 阶段需在入口处用 `if self.user_db.is_some()` 守卫，避免 None 解引用。

### 问题3：token 估算公式 → **已决策：字符数/2**

- **决策**：P0 阶段 `estimate_token_cost` 统一采用 **字符数/2** 作为保守估算（不区分中英文）。
- **影响任务**：任务4.2 中 `token_cost_estimate` 的计算逻辑使用 `content.chars().count() / 2`。
- **代码注释要求**：实现时必须加注释说明：`// 保守估算：字符数/2（中文约1字1token，英文约4字1token），P1 可精确化`。
- **P1 扩展点**：P1 可引入更准确的分语言估算（识别中文字符比例后加权计算），但 P0 不做。

### 问题4：轮次计数的完成定义 → **已决策：用户中断不计入**

- **决策**：轮次计数只在 **AI 正常完成**（收到 `done` 事件，非用户中断）时递增。用户中断（cancel）和错误退出均不计入轮次。
- **影响任务**：任务6.2 中 `increment_turn_count(tab_id)` 的调用位置必须在 `done` 分支内，不在 `cancel` 或 `error` 分支。
- **代码约束**：`ai_commands.rs` 的流式处理中，需明确区分三种退出路径：
  ```rust
  match event_type {
      "done"   => { increment_turn_count(tab_id); /* 触发记忆检查 */ }
      "cancel" => { /* 不计轮次，清理流状态 */ }
      "error"  => { /* 不计轮次，记录错误日志 */ }
  }
  ```
- **边界说明**：工具调用中间轮（AI 调用工具后继续执行）不单独计入轮次，整个 `ai_chat_stream` 调用完整结束才算一轮。
