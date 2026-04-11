# 记忆检索与 Query 构造规范

## 文档头

- 结构编码：`AST-M-S-02`
- 文档属性：`专项落地规范`
- 主责模块：`AST`
- 文档职责：`记忆检索与 Query 构造规范 / search_memories 完整接口定义、query 构造规则、检索骨架`
- 上游约束：`AST-M-T-01`, `AST-M-P-01`, `AST-X-L-01`, `AST-M-S-01`
- 直接承接：`A-AST-X-L-02_记忆库功能开发计划.md`
- 接口耦合：`ENG-X-T-02`, `context_manager.rs`, `memory_commands.rs`
- 使用边界：`P0 实施直接参考；定义检索接口，不定义写入逻辑`
- 决策依据：`D-06（query 构造规则）`, `D-07（P0 FTS5 检索）`, `D-10（P0 实施边界）`

---

## 一、search_memories 接口定义

### 1.1 完整函数签名（Rust）

```rust
/// 记忆检索参数
#[derive(Debug, Clone, Deserialize)]
pub struct SearchMemoriesParams {
    /// 检索 query 文本（由调用方按 §二 规则构造）
    pub query: String,

    /// 当前聊天标签 ID（用于检索 tab 层记忆）
    /// 若为 None，则跳过 tab 层检索（无 tabId 不检索标签级记忆，见 R-AST-M-R-03 §6.4）
    pub tab_id: Option<String>,

    /// 当前工作区路径（用于检索 content / workspace_long_term 层记忆）
    /// 若为 None，则跳过这两层检索
    pub workspace_path: Option<String>,

    /// 检索范围过滤（见 §三）
    /// 默认值：All（在有 tab_id / workspace_path 的情况下按 scope 自动过滤）
    pub scope: MemorySearchScope,

    /// 返回结果上限（默认 10，上限 50）
    pub limit: Option<usize>,

    /// 实体类型过滤（可选，不传则不过滤）
    pub entity_types: Option<Vec<String>>,
}

/// 检索范围枚举
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MemorySearchScope {
    /// 仅标签级记忆（需要 tab_id）
    Tab,
    /// 仅项目内容记忆（需要 workspace_path）
    Content,
    /// 仅工作区长期记忆（需要 workspace_path）
    WorkspaceLongTerm,
    /// 仅用户级记忆（P2，当前返回空）
    User,
    /// 按优先级顺序检索所有可用层（默认值）
    All,
}

/// 检索结果
#[derive(Debug, Clone, Serialize)]
pub struct MemorySearchResponse {
    pub items: Vec<MemorySearchResult>,
    pub total_found: usize,
    pub scope_used: Vec<String>,        // 实际检索了哪些层（用于 debug）
    pub timed_out: bool,                // 是否发生超时降级
}

/// 单条检索结果（见 A-AST-M-S-01 §8.2）
#[derive(Debug, Clone, Serialize)]
pub struct MemorySearchResult {
    pub item: MemoryItem,
    pub relevance_score: f64,           // FTS5 rank 归一化后的值 [0.0, 1.0]
    pub source_label: String,           // 格式化来源标签，供 prompt 使用
}
```

### 1.2 Tauri Command 签名

```rust
#[tauri::command]
pub async fn search_memories_cmd(
    query: String,
    tab_id: Option<String>,
    workspace_path: Option<String>,
    scope: Option<String>,              // 序列化为字符串：tab/content/workspace_long_term/all
    limit: Option<usize>,
    entity_types: Option<Vec<String>>,
    include_user_memory: Option<bool>,  // 默认 false，显式 true 才合并 user_memory
) -> Result<MemorySearchResponse, String> {
    let params = SearchMemoriesParams {
        query,
        tab_id,
        workspace_path,
        scope: scope.as_deref()
            .map(MemorySearchScope::from_str)
            .unwrap_or(MemorySearchScope::All),
        limit,
        entity_types,
    };

    let should_include_user = include_user_memory.unwrap_or(false);
    let mut resp = service.search_memories(params).await.map_err(|e| e.to_string())?;
    if should_include_user {
        resp.items = merge_with_user_memories(resp.items, &query, limit.unwrap_or(10), true).await;
    }
    Ok(resp)
}
```

### 1.3 前端 TypeScript 接口（与 Rust 对称）

```typescript
export interface SearchMemoriesParams {
    query: string;
    tabId?: string;
    workspacePath?: string;
    scope?: 'tab' | 'content' | 'workspace_long_term' | 'user' | 'all';
    limit?: number;
    entityTypes?: string[];
    includeUserMemory?: boolean; // 默认 false，P2 才建议显式开启
}

export interface MemorySearchResult {
    item: MemoryItem;
    relevanceScore: number;
    sourceLabel: string;
}

export interface MemorySearchResponse {
    items: MemorySearchResult[];
    totalFound: number;
    scopeUsed: string[];
    timedOut: boolean;
}

export interface MemoryItem {
    id: string;
    layer: 'tab' | 'content' | 'workspace_long_term' | 'user';
    scopeType: 'tab' | 'workspace' | 'user';
    scopeId: string;
    entityType: string;
    entityName: string;
    content: string;
    summary: string;
    tags: string;
    sourceKind: string;
    sourceRef: string;
    confidence: number;
    freshnessStatus: 'fresh' | 'stale' | 'expired' | 'superseded';
    readonly: boolean;
    accessCount: number;
    lastAccessedAt?: number;
    createdAt: number;
    updatedAt: number;
}

// memoryService.ts 中的调用封装
export const memoryService = {
    async searchMemories(params: SearchMemoriesParams): Promise<MemorySearchResponse> {
        return invoke<MemorySearchResponse>('search_memories_cmd', {
            query: params.query,
            tabId: params.tabId ?? null,
            workspacePath: params.workspacePath ?? null,
            scope: params.scope ?? 'all',
            limit: params.limit ?? 10,
            entityTypes: params.entityTypes ?? null,
            includeUserMemory: params.includeUserMemory ?? null,
        });
    }
};
```

---

## 二、Query 构造规则（D-06 决策落地）

### 2.1 query 构造公式

由 `context_manager.rs` 在调用 `search_memories` 前，按以下规则构造 query 字符串：

```
query = {用户当前消息文本，最多取前 200 字}
      + " [file: {current_file_path}]"           // 若有当前文件
      + " [selection: {selected_text前100字}]"   // 若有选区
```

**各部分截断规则**：

| 部分 | 最大长度 | 截断方式 |
|------|---------|---------|
| 用户消息 | 200 字符 | 按字符截断，保留到最近完整词 |
| 文件路径 | 无截断 | 仅取文件名部分（`path.file_name()`） |
| 选区文本 | 100 字符 | 按字符截断 |

**构造函数骨架**：

```rust
/// 从请求上下文中构造记忆检索 query
/// 由 context_manager.rs 调用，在 build_prompt_package 中调用前执行
pub fn build_memory_query(context: &ContextInfo) -> String {
    let mut parts = Vec::new();

    // 用户消息：取前 200 字符
    let msg = context.user_message.chars().take(200).collect::<String>();
    if !msg.is_empty() {
        parts.push(msg);
    }

    // 当前文件名（不含路径前缀，避免噪声）
    if let Some(ref file_path) = context.current_file {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(file_path.as_str());
        parts.push(format!("[file: {}]", file_name));
    }

    // 选区（若有）
    if let Some(ref selection) = context.selected_text {
        let truncated: String = selection.chars().take(100).collect();
        if !truncated.is_empty() {
            parts.push(format!("[selection: {}]", truncated));
        }
    }

    parts.join(" ")
}
```

### 2.2 FTS5 query 预处理

在将 query 传入 FTS5 前，需要做简单预处理，避免特殊字符导致语法错误：

```rust
/// 将原始 query 字符串处理为安全的 FTS5 match 语法
fn sanitize_fts_query(raw: &str) -> String {
    // 移除 FTS5 特殊字符（OR, AND, NOT, (, ), *, "等）
    // 将多个空格压缩为一个
    // 对中文分词，按字或词进行 OR 匹配（简化版）
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '[' || *c == ']' || *c == ':')
        .collect();

    // 构造 FTS5 query：各词之间用 OR 连接
    let terms: Vec<&str> = cleaned.split_whitespace()
        .filter(|t| t.len() >= 2)  // 过滤过短的词
        .take(10)                    // 最多 10 个词
        .collect();

    if terms.is_empty() {
        return String::new();
    }

    // FTS5 简单 OR 查询
    terms.join(" OR ")
}
```

---

## 三、scope 过滤规则

### 3.1 scope_ids 构造

根据请求中的 `tab_id` 和 `workspace_path`，动态构造允许检索的 `scope_id` 列表：

```rust
fn build_scope_ids(params: &SearchMemoriesParams) -> Vec<String> {
    let mut scope_ids = Vec::new();
    match &params.scope {
        MemorySearchScope::Tab => {
            if let Some(ref tab_id) = params.tab_id {
                scope_ids.push(tab_id.clone());
            }
        }
        MemorySearchScope::Content | MemorySearchScope::WorkspaceLongTerm => {
            if let Some(ref ws) = params.workspace_path {
                scope_ids.push(ws.clone());
            }
        }
        MemorySearchScope::User => {
            // P0 暂不实现，返回空
        }
        MemorySearchScope::All => {
            if let Some(ref tab_id) = params.tab_id {
                scope_ids.push(tab_id.clone());
            }
            if let Some(ref ws) = params.workspace_path {
                scope_ids.push(ws.clone());
            }
        }
    }
    scope_ids
}
```

### 3.2 layer 与 scope 的关系约束

| scope 参数 | 检索哪些 layer | 需要的前提字段 |
|-----------|-------------|--------------|
| `tab` | `tab` | `tab_id` 不为 None |
| `content` | `content` | `workspace_path` 不为 None |
| `workspace_long_term` | `workspace_long_term` | `workspace_path` 不为 None |
| `user` | `user` | P0 返回空 |
| `all` | tab + content + workspace_long_term | 各自按前提字段决定 |

---

## 四、排序因子定义

### 4.1 排序优先级（从高到低）

1. **layer 优先级**：tab(0) > content(1) > workspace_long_term(2) > user(3)
2. **freshness 权重**：fresh(1.0x) > stale(0.5x) > 其他不参与
3. **FTS5 rank**：BM25 算法内置 rank，rank 值越小越相关（SQLite FTS5 的 rank 为负值，负数越大越相关）
4. **confidence 权重**：0.0-1.0
5. **access_count**：被注入次数越多，代表质量越被认可（轻微加权）

### 4.2 综合排序公式

```sql
ORDER BY
    -- 1. layer 优先级
    CASE m.layer
        WHEN 'tab' THEN 0
        WHEN 'content' THEN 1
        WHEN 'workspace_long_term' THEN 2
        ELSE 3
    END ASC,
    -- 2. freshness + confidence 加权后的 FTS rank
    (CASE m.freshness_status WHEN 'fresh' THEN 1.0 ELSE 0.5 END)
    * m.confidence
    * (1.0 + 0.1 * MIN(m.access_count, 10))  -- access_count 轻微加权，上限 10
    * (-fts.rank)                              -- FTS5 rank 负值转正
    DESC,
    -- 3. 时效性兜底
    m.updated_at DESC
```

---

## 五、top_k 默认值和上限

| 参数 | P0 值 | 说明 |
|------|-------|------|
| 默认 limit | 10 | 控制注入 token 数，10 条基本不超出 10% 预算 |
| 最大 limit | 50 | 调用方传入值超过 50 时截断为 50 |
| 单标签最大记录数 | 200 | per-tab 上限，超过时按 `updated_at DESC` 保留最新 200 条（参考 R-AST-M-R-03 §10.1） |

```rust
const DEFAULT_LIMIT: usize = 10;
const MAX_LIMIT: usize = 50;
const MAX_TAB_MEMORIES: usize = 200;

fn resolve_limit(requested: Option<usize>) -> usize {
    requested.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT)
}
```

---

## 六、500ms 超时与 fallback

### 6.1 超时实现骨架

```rust
use tokio::time::{timeout, Duration};

impl MemoryService {
    pub async fn search_memories(
        &self,
        params: SearchMemoriesParams,
    ) -> Result<MemorySearchResponse, MemoryError> {
        const TIMEOUT_MS: u64 = 500;

        let result = timeout(
            Duration::from_millis(TIMEOUT_MS),
            self.search_memories_inner(params),
        ).await;

        match result {
            Ok(inner_result) => inner_result,
            Err(_timeout_err) => {
                // 超时降级：返回空结果，不中断主任务
                tracing::warn!("memory search timed out after {}ms, using empty fallback", TIMEOUT_MS);
                Ok(MemorySearchResponse {
                    items: vec![],
                    total_found: 0,
                    scope_used: vec![],
                    timed_out: true,
                })
            }
        }
    }

    async fn search_memories_inner(
        &self,
        params: SearchMemoriesParams,
    ) -> Result<MemorySearchResponse, MemoryError> {
        // 实际的 FTS5 检索逻辑（同步数据库操作通过 spawn_blocking 包装）
        let db = self.db.clone();
        let params = params.clone();

        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            execute_fts_search(&conn, &params)
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }
}
```

### 6.2 fallback 规则

| 失败场景 | 处理方式 | 是否阻断主任务 |
|---------|---------|--------------|
| 检索超时（> 500ms） | 返回空结果，timed_out=true | 否 |
| 数据库锁定 | 返回空结果，记录 warn 日志 | 否 |
| FTS5 查询语法错误 | 降级为 LIKE 模糊查询 | 否 |
| query 为空字符串 | 直接返回空结果 | 否 |
| tab_id 和 workspace_path 均为 None | 直接返回空结果 | 否 |

---

## 七、完整 Rust 检索实现骨架

```rust
fn execute_fts_search(
    conn: &rusqlite::Connection,
    params: &SearchMemoriesParams,
) -> Result<MemorySearchResponse, MemoryError> {
    // 1. 构造可用的 scope_ids
    let scope_ids = build_scope_ids(params);
    if scope_ids.is_empty() {
        return Ok(MemorySearchResponse {
            items: vec![],
            total_found: 0,
            scope_used: vec![],
            timed_out: false,
        });
    }

    // 2. 预处理 FTS5 query
    let fts_query = sanitize_fts_query(&params.query);
    if fts_query.is_empty() {
        // query 为空时降级为"最近更新的 N 条"
        return fetch_recent_memories(conn, &scope_ids, params);
    }

    // 3. 构造 layer 过滤条件
    let layer_filter: Vec<&str> = match &params.scope {
        MemorySearchScope::Tab => vec!["tab"],
        MemorySearchScope::Content => vec!["content"],
        MemorySearchScope::WorkspaceLongTerm => vec!["workspace_long_term"],
        MemorySearchScope::User => return Ok(MemorySearchResponse::empty()),  // P0 返回空
        MemorySearchScope::All => vec!["tab", "content", "workspace_long_term"],
    };

    // 4. 构造 SQL（动态 IN 子句）
    let scope_placeholders: String = scope_ids.iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2))  // ?2, ?3, ...
        .collect::<Vec<_>>()
        .join(", ");

    let layer_placeholders: String = layer_filter.iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2 + scope_ids.len()))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        r#"
        SELECT
            m.id, m.layer, m.scope_type, m.scope_id,
            m.entity_type, m.entity_name, m.content, m.summary,
            m.source_kind, m.source_ref, m.confidence,
            m.freshness_status, m.readonly, m.access_count,
            m.last_accessed_at, m.created_at, m.updated_at,
            rank AS fts_rank
        FROM memory_items_fts
        JOIN memory_items m ON memory_items_fts.rowid = m.rowid
        WHERE memory_items_fts MATCH ?1
          AND m.scope_id IN ({scope_placeholders})
          AND m.layer IN ({layer_placeholders})
          AND m.freshness_status IN ('fresh', 'stale')
        ORDER BY
            CASE m.layer
                WHEN 'tab' THEN 0
                WHEN 'content' THEN 1
                WHEN 'workspace_long_term' THEN 2
                ELSE 3
            END ASC,
            (CASE m.freshness_status WHEN 'fresh' THEN 1.0 ELSE 0.5 END) * m.confidence * (-rank) DESC,
            m.updated_at DESC
        LIMIT ?{limit_placeholder}
        "#,
        scope_placeholders = scope_placeholders,
        layer_placeholders = layer_placeholders,
        limit_placeholder = 2 + scope_ids.len() + layer_filter.len(),
    );

    // 5. 绑定参数并执行
    let limit = resolve_limit(params.limit);
    let mut stmt = conn.prepare(&sql)?;

    // 参数绑定（fts_query, scope_ids..., layer_filter..., limit）
    let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    param_values.push(Box::new(fts_query));
    for sid in &scope_ids {
        param_values.push(Box::new(sid.clone()));
    }
    for l in &layer_filter {
        param_values.push(Box::new(l.to_string()));
    }
    param_values.push(Box::new(limit as i64));

    let params_refs: Vec<&dyn rusqlite::ToSql> = param_values.iter()
        .map(|b| b.as_ref())
        .collect();

    let results = stmt.query_map(params_refs.as_slice(), |row| {
        map_row_to_memory_item(row)
    })?
    .filter_map(|r| r.ok())
    .collect::<Vec<_>>();

    // 6. 计算 relevance_score（FTS rank 归一化）
    let max_rank = results.iter()
        .map(|(_, rank)| rank.abs())
        .fold(f64::NEG_INFINITY, f64::max);

    let items: Vec<MemorySearchResult> = results.into_iter()
        .map(|(item, rank)| {
            let relevance_score = if max_rank > 0.0 {
                rank.abs() / max_rank
            } else {
                0.0
            };
            let source_label = format_source_label(&item);
            MemorySearchResult { item, relevance_score, source_label }
        })
        .collect();

    let total = items.len();
    Ok(MemorySearchResponse {
        items,
        total_found: total,
        scope_used: layer_filter.iter().map(|s| s.to_string()).collect(),
        timed_out: false,
    })
}

/// 格式化来源标签（供 prompt 注入使用）
fn format_source_label(item: &MemoryItem) -> String {
    match item.layer {
        MemoryLayer::Tab => "[标签记忆]".to_string(),
        MemoryLayer::Content => "[项目内容]".to_string(),
        MemoryLayer::WorkspaceLongTerm => "[工作区长期]".to_string(),
        MemoryLayer::User => "[用户偏好]".to_string(),
    }
}
```

> 2026-04-08 实现回写：`entity_types` 已在 FTS 主查询与 `fetch_recent_memories` fallback 查询两条路径中生效（`entity_type IN (...)`）；禁止再保留“参数透传但 SQL 不消费”的伪契约状态。

---

## 八、在 context_manager.rs 中的调用位置

### 8.1 调用时机

在 `build_prompt_package` 的 L6 augmentation 层（当前为 placeholder），**在 L5 constraint 层之后**注入记忆检索结果：

```rust
// context_manager.rs → build_prompt_package 中
// L6 augmentation: 记忆库注入
// 调用时机：constraint 层构建完成后，tool_and_output 层之前
// 当前为 placeholder，实现时在此处添加以下代码：

// ⚠️ 注意：search_memories 是 async，但 build_prompt_package 当前是同步函数
// 实现时需要将 build_prompt_package 改为 async，或将记忆检索提前到 ai_commands.rs 中执行
// 推荐方案：见 §8.2
```

### 8.2 推荐调用架构（ai_commands.rs 先行检索）

由于 `build_prompt_package` 是同步函数，且记忆检索是异步操作，P0 推荐以下调用架构：

```rust
// ai_commands.rs 中的 ai_chat_stream 命令入口
pub async fn ai_chat_stream(
    // ... 参数
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Step 1: 先执行记忆检索（异步，有 500ms 超时）
    let memory_query = build_memory_query_from_request(&context);
    let memory_results = state.memory_service
        .search_memories(SearchMemoriesParams {
            query: memory_query,
            tab_id: Some(tab_id.clone()),
            workspace_path: Some(workspace_path.clone()),
            scope: MemorySearchScope::All,
            limit: Some(10),
            entity_types: None,
        })
        .await
        .unwrap_or_default();  // 超时/失败时使用空结果

    // Step 2: 将检索结果格式化为文本，注入 ContextInfo
    let memory_augmentation = format_memory_for_injection(&memory_results);
    context_info.memory_augmentation = Some(memory_augmentation);

    // Step 3: context_manager 装配 prompt（同步）
    let prompt = context_manager.build_multi_layer_prompt(&context_info, enable_tools);

    // ...后续 AI 调用
}
```

### 8.3 ContextInfo 的扩展字段

```rust
// context_manager.rs 中的 ContextInfo 需新增字段
pub struct ContextInfo {
    // ... 现有字段 ...

    /// 记忆库检索结果（已格式化为注入文本，由 ai_commands.rs 在调用前填充）
    /// 若为 None，L6 augmentation 层跳过记忆注入
    pub memory_augmentation: Option<String>,
}
```

---

## 九、检索结果返回结构完整定义

```rust
impl MemorySearchResponse {
    fn empty() -> Self {
        Self {
            items: vec![],
            total_found: 0,
            scope_used: vec![],
            timed_out: false,
        }
    }
}

impl Default for MemorySearchResponse {
    fn default() -> Self {
        Self::empty()
    }
}
```

---

## 十、来源映射

1. `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`：D-06（query 构造）、D-07（FTS5）、D-10（P0 边界）
2. `R-AST-M-R-03_记忆库-主控设计文档.md`：§7.1 接口协议、§6 检索协议、§10.1 性能指标
3. `A-AST-M-T-01_记忆模型.md`：检索顺序、降级规则
4. `A-AST-M-S-01_记忆服务数据库落地规范.md`：数据结构定义（同级文档）
