# 记忆服务数据库落地规范

## 文档头

- 结构编码：`AST-M-S-01`
- 文档属性：`专项落地规范`
- 主责模块：`AST`
- 文档职责：`记忆服务数据库落地规范 / 数据库表结构、Rust 数据结构骨架、存储集成点`
- 上游约束：`AST-M-D-01`, `AST-M-T-01`, `AST-X-L-01`
- 直接承接：`A-AST-X-L-02_记忆库功能开发计划.md`
- 接口耦合：`ENG-X-T-02`, `WS-M-T-01`
- 使用边界：`P0 实施直接参考文档；本文定义数据层，不定义业务逻辑`
- 决策依据：`D-03（记忆表合并进 workspace.db）`, `D-04（用户级记忆独立存储）`, `D-07（P0 FTS5 检索）`

---

## 一、总体存储架构

### 1.1 双数据库策略

根据决策 D-03 和 D-04，记忆系统使用两个数据库：

| 数据库 | 路径 | 包含内容 | 生命周期 |
|--------|------|---------|---------|
| `workspace.db` | `{workspace}/.binder/workspace.db` | `memory_items`（tab/content/workspace_long_term 层）、`memory_usage_logs` | 随工作区切换 |
| `user_memory.db` | Tauri `app_data_dir()` 下 | `user_memory_items` | 跨工作区持久 |

**P0 实施范围**：仅在 `workspace.db` 中实现 `memory_items` 和 `memory_usage_logs`。`user_memory.db` P0 只建表结构，不实现写入路径。

### 1.2 与 workspace.db 的集成点

`memory_service.rs` 通过 `workspace_path/.binder/workspace.db` 按需打开连接；schema 初始化由 migration + 运行时兜底双路径保证：

```rust
// workspace/workspace_db.rs：migration v3 统一补齐 memory schema
if version < 3 {
    crate::services::memory_service::ensure_workspace_memory_schema(&conn)?;
    conn.execute("INSERT INTO _schema_version (version) VALUES (3)", [])?;
}
```

`MemoryService::new` 仍会执行一次幂等 schema 兜底，避免 migration 漏跑导致主链断裂：

```rust
pub struct MemoryService {
    db: Arc<Mutex<Connection>>,   // 按 workspace_path 打开 workspace.db
    workspace_path: PathBuf,
}

pub fn new(workspace_path: &Path) -> Result<Self, String> {
    let conn = rusqlite::Connection::open(workspace_path.join(".binder").join("workspace.db"))?;
    ensure_workspace_memory_schema(&conn)?; // 运行时幂等兜底
    ...
}
```

---

## 二、memory_items 主表

### 2.1 完整字段定义

```sql
CREATE TABLE IF NOT EXISTS memory_items (
    -- 主键
    id              TEXT PRIMARY KEY,           -- UUID v4

    -- 分层与作用域（核心）
    layer           TEXT NOT NULL,              -- 枚举值见 2.2
    scope_type      TEXT NOT NULL,              -- 枚举值见 2.3
    scope_id        TEXT NOT NULL,              -- tab_id / workspace_path / user_id

    -- 实体信息
    entity_type     TEXT NOT NULL DEFAULT 'general',  -- 实体类型，见 2.4
    entity_name     TEXT NOT NULL,              -- 实体名称（用于去重与显示）
    content         TEXT NOT NULL,              -- 完整记忆内容
    summary         TEXT NOT NULL DEFAULT '',   -- 简短摘要（注入时优先使用）
    tags            TEXT NOT NULL DEFAULT '',   -- 空格分隔的 tag 列表（供 FTS5 索引）

    -- 来源追溯
    source_kind     TEXT NOT NULL,              -- 来源类型，见 2.5
    source_ref      TEXT NOT NULL DEFAULT '',   -- 来源引用（对话 ID、文件路径等）

    -- 质量与状态
    confidence      REAL NOT NULL DEFAULT 1.0,  -- 置信度 0.0-1.0
    freshness_status TEXT NOT NULL DEFAULT 'fresh',  -- 枚举值见 2.6
    readonly        INTEGER NOT NULL DEFAULT 1, -- 1=只读（系统生成）；0=可编辑（预留）
    access_count    INTEGER NOT NULL DEFAULT 0, -- 被注入次数（用于排序权重）
    last_accessed_at INTEGER,                   -- 最近一次注入时间（Unix 秒）

    -- 时间戳
    created_at      INTEGER NOT NULL,           -- 创建时间（Unix 秒）
    updated_at      INTEGER NOT NULL            -- 最后更新时间（Unix 秒）
);
```

### 2.2 layer 枚举

| 值 | 含义 | 作用域键 |
|----|------|---------|
| `tab` | 标签级记忆 | `scope_id = tab_id` |
| `content` | 项目内容记忆 | `scope_id = workspace_path` |
| `workspace_long_term` | 工作区长期记忆 | `scope_id = workspace_path` |
| `user` | 用户级记忆 | `scope_id = user_id`（user_memory.db） |

### 2.3 scope_type 枚举

| 值 | 含义 |
|----|------|
| `tab` | 绑定到单个聊天标签 |
| `workspace` | 绑定到工作区路径 |
| `user` | 用户级（跨工作区） |

**约束**：`layer=tab` 时，`scope_type` 必须为 `tab`；`layer=content` 或 `layer=workspace_long_term` 时，`scope_type` 必须为 `workspace`。

---

### 2.3.1 tab 层 scope_id 的稳定性要求（联动 ENG-X-F-01）

> **前置依赖**：以下要求依赖 `A-ENG-X-F-01_ChatTab持久化UUID专项修复规范.md` 的实施。记忆库 P0 必须在该修复完成后才能启动。

**scope_id 格式要求**：
- `scope_type='tab'` 时，`scope_id` **必须是 RFC 4122 UUID**（格式：`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`）
- 来源：`chatStore` 的 `createTab` 使用 `crypto.randomUUID()` 生成，并通过 Zustand persist 持久化至 localStorage（键名：`binder-chat-tabs-storage`）
- tab 重命名时 UUID 不变；应用重启后 UUID 不变

**孤立 tab 记忆清理**：
- 应用启动后 workspace 加载完成时，前端调用 `mark_orphan_tab_memories_stale(active_tab_ids)` Tauri 命令
- 该命令将 `scope_type='tab'` 且 `scope_id` 不在 `active_tab_ids` 中的记忆降级为 `freshness_status='stale'`
- stale tab 记忆仍参与检索，但以降权方式返回（`0.5x` 权重）；30 天后由 P4 启动检查任务物理删除
- **不立即删除的理由**：孤立 tab 记忆的语义价值（如用户偏好）仍可作为弱参考，降级保留优于直接删除

```rust
/// 新增接口：标记孤立 tab 记忆为 stale
/// 在 workspace 加载完成后异步调用（非阻塞，失败只记日志）
pub async fn mark_orphan_tab_memories_stale(
    &self,
    active_tab_ids: &[String],
) -> Result<u64, MemoryError>  // 返回：被标记的记忆条数
```

### 2.4 entity_type 常见值

| 值 | 含义 | 适用 layer |
|----|------|-----------|
| `general` | 通用摘要，不归类 | 任意 |
| `preference` | 用户偏好或风格要求 | tab, user |
| `entity_person` | 人物实体 | content |
| `entity_place` | 地点实体 | content |
| `entity_concept` | 概念/术语 | content |
| `entity_object` | 对象/事物 | content |
| `outline` | 文档大纲摘要 | content |
| `constraint` | 用户明确的约束或禁止 | tab |
| `topic_summary` | 对话主题摘要 | tab, workspace_long_term |
| `project_pattern` | 项目工作模式与习惯 | workspace_long_term, user |

### 2.5 source_kind 枚举（冻结来源类型）

| 值 | 含义 |
|----|------|
| `conversation_summary` | 从多轮对话提炼的摘要 |
| `conversation_entity` | 从对话中提取的实体 |
| `document_extract` | 从文档内容提取的实体/事实 |
| `document_outline` | 文档大纲结构 |
| `document_detail_enrichment` | 大文档的按需深入内容 |
| `tab_deletion_summary` | 标签删除时的摘要 |
| `user_preference` | 从用户行为归纳的偏好 |

### 2.6 freshness_status 枚举与行为定义

| 值 | 触发条件 | 在排序中的行为 |
|----|---------|--------------|
| `fresh` | 默认状态；`updated_at` 在最近 7 天内 | 正常权重 |
| `stale` | `updated_at` 超过 7 天未更新；或来源文档已修改但未重新提取 | 排序降权 0.5x |
| `expired` | 来源已删除（标签删除、文档删除）且未升格 | 不参与自动检索；仅显示于 UI |
| `superseded` | 同 scope+entity_name 下有更新版本 | 不参与自动检索 |

**freshness_status 的更新规则**：
- 文件保存重新提取后，对应 `scope_id + entity_name` 的旧记录状态改为 `superseded`，新记录状态为 `fresh`。
- 标签删除时，该 `tab_id` 对应所有记录状态改为 `expired`。
- 每次 `search_memories` 命中一条记录，其 `access_count++`，`last_accessed_at` 更新。

---

## 三、memory_usage_logs 表

### 3.1 表定义

```sql
CREATE TABLE IF NOT EXISTS memory_usage_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id       TEXT NOT NULL,              -- 被注入的记忆项 ID
    tab_id          TEXT NOT NULL,              -- 注入到哪个标签的对话
    query_text      TEXT NOT NULL DEFAULT '',   -- 本次检索使用的 query
    inject_position TEXT NOT NULL DEFAULT 'augmentation',  -- 注入层（augmentation/constraint）
    injected_at     INTEGER NOT NULL,           -- 注入时间（Unix 秒）

    FOREIGN KEY (memory_id) REFERENCES memory_items(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_memory ON memory_usage_logs(memory_id);
CREATE INDEX IF NOT EXISTS idx_usage_tab ON memory_usage_logs(tab_id);
```

---

## 四、FTS5 虚拟表

### 4.1 FTS5 表定义

```sql
-- FTS5 虚拟表：对 content、summary、tags、entity_name 建索引
CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts
USING fts5(
    content,
    summary,
    tags,
    entity_name,
    content='memory_items',    -- content 模式，数据存在主表
    content_rowid='rowid'
);

-- 触发器：保持 FTS 与主表同步
CREATE TRIGGER IF NOT EXISTS memory_items_fts_insert AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_items_fts(rowid, content, summary, tags, entity_name)
    VALUES (new.rowid, new.content, new.summary, new.tags, new.entity_name);
END;

CREATE TRIGGER IF NOT EXISTS memory_items_fts_delete AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_items_fts(memory_items_fts, rowid, content, summary, tags, entity_name)
    VALUES('delete', old.rowid, old.content, old.summary, old.tags, old.entity_name);
END;

CREATE TRIGGER IF NOT EXISTS memory_items_fts_update AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_items_fts(memory_items_fts, rowid, content, summary, tags, entity_name)
    VALUES('delete', old.rowid, old.content, old.summary, old.tags, old.entity_name);
    INSERT INTO memory_items_fts(rowid, content, summary, tags, entity_name)
    VALUES (new.rowid, new.content, new.summary, new.tags, new.entity_name);
END;
```

---

## 五、user_memory.db 用户级表（P0 仅建结构）

```sql
-- user_memory.db 中建立，P0 阶段只建表不写入
CREATE TABLE IF NOT EXISTS user_memory_items (
    id              TEXT PRIMARY KEY,
    layer           TEXT NOT NULL DEFAULT 'user',
    scope_type      TEXT NOT NULL DEFAULT 'user',
    scope_id        TEXT NOT NULL,              -- user_id（Tauri 应用唯一标识）
    entity_type     TEXT NOT NULL DEFAULT 'general',
    entity_name     TEXT NOT NULL,
    content         TEXT NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    tags            TEXT NOT NULL DEFAULT '',
    source_kind     TEXT NOT NULL DEFAULT 'user_preference',
    source_ref      TEXT NOT NULL DEFAULT '',
    confidence      REAL NOT NULL DEFAULT 1.0,
    freshness_status TEXT NOT NULL DEFAULT 'fresh',
    readonly        INTEGER NOT NULL DEFAULT 1,
    access_count    INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS user_memory_items_fts
USING fts5(
    content, summary, tags, entity_name,
    content='user_memory_items',
    content_rowid='rowid'
);
```

---

## 六、关键索引

```sql
-- 分层+作用域联合索引（最常用查询路径）
CREATE INDEX IF NOT EXISTS idx_memory_layer_scope
    ON memory_items(layer, scope_type, scope_id);

-- 实体名去重查询
CREATE INDEX IF NOT EXISTS idx_memory_entity
    ON memory_items(scope_id, entity_name, layer);

-- 时效性排序
CREATE INDEX IF NOT EXISTS idx_memory_updated
    ON memory_items(updated_at DESC);

-- freshness_status 过滤
CREATE INDEX IF NOT EXISTS idx_memory_freshness
    ON memory_items(freshness_status, layer);
```

---

## 七、关键 SQL 示例

### 7.1 写入（upsert）

```sql
-- 按 scope_id + entity_name + layer 做 upsert（用于项目内容记忆更新）
INSERT INTO memory_items (
    id, layer, scope_type, scope_id, entity_type, entity_name,
    content, summary, tags, source_kind, source_ref,
    confidence, freshness_status, readonly, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fresh', 1, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    content = excluded.content,
    summary = excluded.summary,
    tags = excluded.tags,
    freshness_status = 'fresh',
    updated_at = excluded.updated_at;

-- 将旧版本标记为 superseded（写入新版本前执行）
UPDATE memory_items
SET freshness_status = 'superseded', updated_at = ?
WHERE scope_id = ? AND entity_name = ? AND layer = ?
  AND freshness_status = 'fresh';
```

### 7.2 FTS5 检索（带 scope 过滤）

```sql
-- P0 检索：FTS5 关键词匹配 + scope 过滤 + 时效性排序
SELECT
    m.id, m.layer, m.scope_type, m.scope_id,
    m.entity_type, m.entity_name, m.content, m.summary,
    m.source_kind, m.source_ref, m.confidence,
    m.freshness_status, m.access_count, m.updated_at,
    rank AS fts_rank
FROM memory_items_fts
JOIN memory_items m ON memory_items_fts.rowid = m.rowid
WHERE memory_items_fts MATCH ?      -- FTS5 query
  AND m.scope_id IN (?, ?)          -- scope 过滤（tab_id + workspace_path）
  AND m.freshness_status IN ('fresh', 'stale')  -- 排除 expired/superseded
ORDER BY
    CASE m.layer
        WHEN 'tab' THEN 0
        WHEN 'content' THEN 1
        WHEN 'workspace_long_term' THEN 2
        ELSE 3
    END ASC,
    CASE m.freshness_status WHEN 'fresh' THEN 1.0 ELSE 0.5 END * m.confidence DESC,
    m.updated_at DESC
LIMIT ?;
```

### 7.3 标签删除时的批量 expire

```sql
-- 将 tab 的所有记忆标记为 expired
UPDATE memory_items
SET freshness_status = 'expired', updated_at = ?
WHERE scope_type = 'tab' AND scope_id = ?;
```

### 7.4 记录注入日志

```sql
INSERT INTO memory_usage_logs (id, memory_id, tab_id, query_text, inject_position, injected_at)
VALUES (?, ?, ?, ?, 'augmentation', ?);

-- 同步更新命中记录的 access_count
UPDATE memory_items
SET access_count = access_count + 1, last_accessed_at = ?
WHERE id = ?;
```

---

## 八、Rust 数据结构骨架

### 8.1 核心枚举

```rust
/// 记忆分层（与 memory_items.layer 字段对应）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryLayer {
    Tab,
    Content,
    WorkspaceLongTerm,
    User,
}

impl MemoryLayer {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryLayer::Tab => "tab",
            MemoryLayer::Content => "content",
            MemoryLayer::WorkspaceLongTerm => "workspace_long_term",
            MemoryLayer::User => "user",
        }
    }

    pub fn priority_rank(&self) -> u8 {
        // 数字越小排序越靠前（检索优先级）
        match self {
            MemoryLayer::Tab => 0,
            MemoryLayer::Content => 1,
            MemoryLayer::WorkspaceLongTerm => 2,
            MemoryLayer::User => 3,
        }
    }
}

/// 作用域类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryScopeType {
    Tab,
    Workspace,
    User,
}

/// 来源类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemorySourceKind {
    ConversationSummary,
    ConversationEntity,
    DocumentExtract,
    DocumentOutline,
    DocumentDetailEnrichment,
    TabDeletionSummary,
    UserPreference,
}

/// 新鲜度状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessStatus {
    Fresh,
    Stale,
    Expired,
    Superseded,
}
```

### 8.2 MemoryItem 结构体

```rust
/// 记忆项（对应 memory_items 表的完整字段）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,                         // UUID v4
    pub layer: MemoryLayer,
    pub scope_type: MemoryScopeType,
    pub scope_id: String,                   // tab_id 或 workspace_path
    pub entity_type: String,                // 见文档第二章 2.4
    pub entity_name: String,
    pub content: String,
    pub summary: String,
    pub tags: String,                       // 空格分隔
    pub source_kind: MemorySourceKind,
    pub source_ref: String,
    pub confidence: f64,
    pub freshness_status: FreshnessStatus,
    pub readonly: bool,
    pub access_count: i64,
    pub last_accessed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 检索结果（包含 FTS rank 分数）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySearchResult {
    pub item: MemoryItem,
    pub relevance_score: f64,               // FTS rank 归一化值
    pub source_label: String,               // 格式："[tab]" / "[项目内容]" 等，供 prompt 注入使用
}
```

### 8.3 MemoryService 骨架

```rust
pub struct MemoryService {
    /// 与 workspace.db 共享的连接（已在 workspace 初始化时打开）
    db: Arc<Mutex<Connection>>,
    /// 用户级记忆数据库连接（P0 为 None）
    user_db: Option<Arc<Mutex<Connection>>>,
    /// 当前工作区路径（用于 scope_id 构造）
    workspace_path: PathBuf,
}

impl MemoryService {
    /// 使用已有 workspace.db 连接初始化（不创建新连接）
    pub fn new(
        db: Arc<Mutex<Connection>>,
        user_db: Option<Arc<Mutex<Connection>>>,
        workspace_path: PathBuf,
    ) -> Result<Self, MemoryError> {
        // 确保 memory 相关表已建立
        let conn = db.lock().map_err(MemoryError::lock_error)?;
        init_memory_tables(&conn)?;
        drop(conn);
        Ok(Self { db, user_db, workspace_path })
    }

    /// 检索记忆（核心接口，见 A-AST-M-S-02）
    pub async fn search_memories(
        &self,
        params: SearchMemoriesParams,
    ) -> Result<Vec<MemorySearchResult>, MemoryError> {
        // 实现见 A-AST-M-S-02
        todo!()
    }

    /// 写入标签级记忆（内部接口，由后台任务调用）
    pub async fn upsert_tab_memories(
        &self,
        tab_id: &str,
        items: Vec<MemoryItemInput>,
    ) -> Result<(), MemoryError> {
        todo!()
    }

    /// 写入项目内容记忆（内部接口，文件保存后触发）
    pub async fn upsert_project_content_memories(
        &self,
        file_path: &str,
        items: Vec<MemoryItemInput>,
    ) -> Result<(), MemoryError> {
        todo!()
    }

    /// 追加工作区长期记忆（仅追加，不修改）
    pub async fn append_long_term_memory(
        &self,
        item: MemoryItemInput,
    ) -> Result<(), MemoryError> {
        todo!()
    }

    /// 标签删除时批量 expire 并触发摘要写入
    pub async fn on_tab_deleted(
        &self,
        tab_id: &str,
        tab_name: &str,
        summary: &str,
    ) -> Result<(), MemoryError> {
        // 1. 将该 tab_id 所有记忆标记为 expired
        // 2. 后台异步生成 tab_deletion_summary 写入 workspace_long_term
        todo!()
    }

    /// 记录注入日志
    pub fn record_usage(
        &self,
        memory_ids: &[String],
        tab_id: &str,
        query_text: &str,
    ) -> Result<(), MemoryError> {
        todo!()
    }
}

/// 写入输入结构（用于各 upsert 接口）
#[derive(Debug, Clone)]
pub struct MemoryItemInput {
    pub layer: MemoryLayer,
    pub scope_type: MemoryScopeType,
    pub scope_id: String,
    pub entity_type: String,
    pub entity_name: String,
    pub content: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub source_kind: MemorySourceKind,
    pub source_ref: String,
    pub confidence: f64,
}

/// 错误类型
#[derive(Debug, thiserror::Error)]
pub enum MemoryError {
    #[error("数据库锁定失败: {0}")]
    LockError(String),
    #[error("数据库操作失败: {0}")]
    DbError(#[from] rusqlite::Error),
    #[error("序列化失败: {0}")]
    SerializeError(String),
}

impl MemoryError {
    fn lock_error(e: impl std::fmt::Display) -> Self {
        MemoryError::LockError(e.to_string())
    }
}
```

---

## 九、初始化函数骨架

```rust
/// 在 workspace.db 初始化时调用，确保 memory 相关表存在
pub fn init_memory_tables(conn: &Connection) -> rusqlite::Result<()> {
    // 1. memory_items 主表
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS memory_items (
            id TEXT PRIMARY KEY,
            layer TEXT NOT NULL,
            scope_type TEXT NOT NULL,
            scope_id TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT 'general',
            entity_name TEXT NOT NULL,
            content TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            source_kind TEXT NOT NULL,
            source_ref TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL DEFAULT 1.0,
            freshness_status TEXT NOT NULL DEFAULT 'fresh',
            readonly INTEGER NOT NULL DEFAULT 1,
            access_count INTEGER NOT NULL DEFAULT 0,
            last_accessed_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_layer_scope
            ON memory_items(layer, scope_type, scope_id);
        CREATE INDEX IF NOT EXISTS idx_memory_entity
            ON memory_items(scope_id, entity_name, layer);
        CREATE INDEX IF NOT EXISTS idx_memory_updated
            ON memory_items(updated_at);
        CREATE INDEX IF NOT EXISTS idx_memory_freshness
            ON memory_items(freshness_status, layer);
    "#)?;

    // 2. FTS5 虚拟表
    conn.execute_batch(r#"
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts
        USING fts5(
            content, summary, tags, entity_name,
            content='memory_items',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS memory_items_ai AFTER INSERT ON memory_items BEGIN
            INSERT INTO memory_items_fts(rowid, content, summary, tags, entity_name)
            VALUES (new.rowid, new.content, new.summary, new.tags, new.entity_name);
        END;

        CREATE TRIGGER IF NOT EXISTS memory_items_ad AFTER DELETE ON memory_items BEGIN
            INSERT INTO memory_items_fts(memory_items_fts, rowid, content, summary, tags, entity_name)
            VALUES('delete', old.rowid, old.content, old.summary, old.tags, old.entity_name);
        END;

        CREATE TRIGGER IF NOT EXISTS memory_items_au AFTER UPDATE ON memory_items BEGIN
            INSERT INTO memory_items_fts(memory_items_fts, rowid, content, summary, tags, entity_name)
            VALUES('delete', old.rowid, old.content, old.summary, old.tags, old.entity_name);
            INSERT INTO memory_items_fts(rowid, content, summary, tags, entity_name)
            VALUES (new.rowid, new.content, new.summary, new.tags, new.entity_name);
        END;
    "#)?;

    // 3. memory_usage_logs 表
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS memory_usage_logs (
            id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            tab_id TEXT NOT NULL,
            query_text TEXT NOT NULL DEFAULT '',
            inject_position TEXT NOT NULL DEFAULT 'augmentation',
            injected_at INTEGER NOT NULL,
            FOREIGN KEY (memory_id) REFERENCES memory_items(id)
        );

        CREATE INDEX IF NOT EXISTS idx_usage_memory ON memory_usage_logs(memory_id);
        CREATE INDEX IF NOT EXISTS idx_usage_tab ON memory_usage_logs(tab_id);
    "#)?;

    Ok(())
}
```

---

## 十、来源映射

1. `A-AST-M-T-01_记忆模型.md`：MemoryItem 最小字段集来源
2. `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`：D-03、D-04、D-07 决策来源
3. `R-AST-M-R-03_记忆库-主控设计文档.md`：接口协议与表结构参考（旧体系）
4. `src-tauri/src/services/memory_service.rs`：当前实现对比基础
