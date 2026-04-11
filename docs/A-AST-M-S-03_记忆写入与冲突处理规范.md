# 记忆写入与冲突处理规范

## 文档头

- 结构编码：`AST-M-S-03`
- 文档属性：`专项落地规范`
- 主责模块：`AST`
- 文档职责：`记忆写入与冲突处理规范 / 写入触发规则、AI 提炼流程、异步队列、失败降级、MC-WRITE 规则完整行为定义`
- 上游约束：`AST-M-D-01`, `AST-M-T-01`, `AST-X-L-01`, `AST-M-S-01`
- 直接承接：`A-AST-X-L-02_记忆库落地开发计划.md`（待建）
- 接口耦合：`ENG-X-T-02`, `ai_commands.rs`, `memory_service.rs`
- 使用边界：`P0 实施直接参考；定义写入路径，不定义检索逻辑`
- 决策依据：`D-01（AI 提炼生成）`, `D-02（仅在文件保存时触发）`, `D-09（P0 系统规则写入）`, `D-10（P0 实施边界）`

---

## 一、写入触发规则（P0）

### 1.1 标签级记忆触发条件

| 触发事件 | 具体条件 | 触发函数 |
|---------|---------|---------|
| 对话轮次阈值 | chat tab 对话轮次达到 N 轮（P0 默认：每 5 轮触发一次） | `ai_commands.rs` 中每次 `ai_chat_stream` 完成后检查 |
| 轮次计数位置 | 计算 `messages` 数组中 `role=user` 的消息数 | 同上 |

**轮次计数规则**：
- 每次 `ai_chat_stream` 完成（done 事件发出后），检查当前 `tab_id` 的历史消息中 `role=user` 的消息数。
- 若数量为 5 的整数倍（5、10、15...），后台异步触发标签级记忆提炼任务。
- 触发后不等待结果（fire-and-forget），使用 `tokio::spawn`。

```rust
// ai_commands.rs 中 ai_chat_stream 完成后的检查逻辑
fn should_trigger_tab_memory_extraction(messages: &[ChatMessage], tab_id: &str) -> bool {
    const INTERVAL: usize = 5;
    let user_message_count = messages.iter()
        .filter(|m| m.role == "user")
        .count();
    user_message_count > 0 && user_message_count % INTERVAL == 0
}
```

### 1.2 项目内容记忆触发条件（D-02）

| 触发事件 | 具体条件 | 触发位置 |
|---------|---------|---------|
| 文件保存成功 | `sync_workspace_file_cache_after_save` 成功回调后 | `file_commands.rs` 或 `workspace.rs` 中的保存后钩子 |
| 文件类型限制 | 仅处理文本类文件（.md, .txt, .docx 等），不处理二进制文件 | 同上 |

**触发位置说明**：
```rust
// file_commands.rs 中 sync_workspace_file_cache_after_save 成功后
pub async fn sync_workspace_file_cache_after_save(
    file_path: String,
    // ...
    state: State<'_, AppState>,
) -> Result<(), String> {
    // ... 现有保存逻辑 ...

    // 新增：触发项目内容记忆提取（P0 新增）
    if is_text_file(&file_path) {
        let memory_service = state.memory_service.clone();
        let content = content_html.clone();
        let workspace_path = state.workspace_path.clone();
        tokio::spawn(async move {
            if let Err(e) = memory_service
                .trigger_content_memory_extraction(&file_path, &content, &workspace_path)
                .await
            {
                tracing::warn!("content memory extraction failed: {:?}", e);
                // 失败只记日志，不影响主流程
            }
        });
    }

    Ok(())
}
```

### 1.3 P0 明确不做的触发场景

- 文件打开时（D-02 明确禁止）
- 用户主动触发（P0 无 `save_memory` 工具）
- AI 执行完工具调用后（P2 阶段评估）
- 标签关闭时触发长期记忆升格（P1 阶段实现）

---

## 二、MC-WRITE 规则完整行为定义

### MC-WRITE-001：记忆写入默认后台异步，不阻塞主协作链

**行为定义**：
- 所有记忆写入操作必须在 `tokio::spawn` 异步任务中执行。
- 主对话链（`ai_chat_stream` 的响应流）不等待记忆写入完成。
- 写入任务通过 oneshot channel 或直接 fire-and-forget 方式调用。
- 写入失败时：记录 `tracing::warn!`，不向前端发送错误事件。

```rust
// 正确示例：fire-and-forget 写入
tokio::spawn(async move {
    if let Err(e) = memory_service.upsert_tab_memories(tab_id, items).await {
        tracing::warn!("tab memory write failed for tab {}: {:?}", tab_id, e);
    }
});

// 错误示例（禁止）：
// memory_service.upsert_tab_memories(tab_id, items).await?;  // 阻塞主链
```

### MC-WRITE-002：只有满足稳定性条件的对象才能升格为记忆项

**行为定义（P0 版本的简化稳定性判断）**：

P0 阶段不做完整 LLM-as-judge 分类（ADD/UPDATE/DELETE/NOOP），采用以下简化规则：

| 记忆类型 | 稳定性条件（P0） |
|---------|---------------|
| 标签级对话摘要 | 对话轮次 >= 5 轮；AI 提炼响应非空 |
| 项目内容实体 | 文件保存成功且文件非空；提取结果有实体 |
| 长期记忆 | P1 实现（P0 不触发） |
| 用户级记忆 | P2 实现 |

P1/P2 阶段引入 LLM-as-judge 完整分类时，使用 ADD/UPDATE/DELETE/NOOP 四类操作，见 §三。

### MC-WRITE-003：未确认 / 已失效 / 高噪声 artifact 不得直接入长期记忆

**行为定义**：
- 每条记忆写入前，必须带 `scope_type`、`scope_id`、`source_kind`、`source_ref` 字段；缺失任一字段视为无效，不写入，记录 warn 日志。
- 标签级记忆只能写入 `layer=tab`，不得直接写入 `layer=workspace_long_term`。
- 项目内容记忆只能写入 `layer=content`，不得直接写入其他层。
- `freshness_status='expired'` 的记忆不得作为写入模板复用（即不得复制一条 expired 记忆只改 id 写入）。

---

## 三、写入前的 LLM-as-judge 分类流程（P1 完整实现规范）

### 3.1 分类任务定义

P1 阶段在写入前，先检索相似记忆（Top-K），再通过轻量 AI 调用判断操作类型：

```
ADD    - 无相似记忆，直接新增
UPDATE - 存在相似记忆，且新内容更新/完善了旧内容
DELETE - 存在相似记忆，且新信息与旧信息矛盾（以新为准）
NOOP   - 与现有记忆高度重复，无需写入
```

### 3.2 相似记忆检索（写入前）

```rust
/// 写入前检索相似记忆，用于 LLM-as-judge 分类
/// P0 阶段跳过此步骤，直接 upsert
async fn find_similar_memories(
    conn: &Connection,
    candidate: &MemoryItemInput,
    top_k: usize,
) -> Result<Vec<MemoryItem>, MemoryError> {
    // 使用 entity_name + content 的前 100 字构造 FTS query
    let query = format!("{} {}", candidate.entity_name,
        candidate.content.chars().take(100).collect::<String>());
    let fts_query = sanitize_fts_query(&query);

    // 在同 scope_id + layer 下检索
    // ...（FTS5 查询逻辑，参考 A-AST-M-S-02 §七）
    todo!()
}
```

### 3.3 LLM-as-judge prompt 模板

```text
你是一个记忆库管理助手。请判断以下新记忆与现有记忆的关系。

## 新记忆候选
实体名：{entity_name}
内容：{content}

## 现有相似记忆（最多3条）
{similar_memories_list}

## 判断规则
- ADD：现有记忆中无此实体，或完全无相关记忆
- UPDATE：现有记忆存在，但新内容补充/修正了信息
- DELETE：新信息直接矛盾现有记忆中的关键事实（以新信息为准）
- NOOP：与现有记忆高度重复（相似度 > 80%），无新信息

## 输出格式（严格输出单行JSON）
{"action": "ADD|UPDATE|DELETE|NOOP", "target_id": "被 UPDATE/DELETE 的记忆 ID，ADD/NOOP 时为 null", "reason": "一句话说明"}
```

---

## 四、标签级记忆 AI 提炼流程

### 4.1 提炼 prompt 模板

```text
你是 Binder 的记忆提炼助手。请从以下对话历史中提炼出值得记忆的关键信息。

## 对话历史（最近 {N} 轮）
{conversation_history}

## 提炼要求
请提炼以下类型的信息（JSON 数组格式，每条为一个对象）：
1. 用户表达的偏好（风格、格式、语气约束）
2. 用户明确拒绝或不希望的内容
3. 对话中提及的关键实体（人名、项目名、文档名）
4. 本次对话的主题摘要（一句话）

## 输出格式
```json
[
  {
    "entity_type": "preference|constraint|entity_person|entity_concept|topic_summary",
    "entity_name": "简短实体名或摘要标题",
    "content": "完整内容描述",
    "summary": "一句话摘要（15字以内）",
    "tags": "空格分隔的关键词",
    "confidence": 0.8
  }
]
```
仅输出 JSON 数组，不要其他文本。如无值得记忆的内容，输出空数组 `[]`。
```

### 4.2 提炼任务函数骨架

```rust
/// 标签级记忆提炼任务（后台异步执行）
/// 由 ai_commands.rs 在每 N 轮对话后触发
pub async fn memory_generation_task_tab(
    ai_service: Arc<AiService>,
    memory_service: Arc<MemoryService>,
    tab_id: String,
    conversation_history: Vec<ChatMessage>,
    workspace_path: String,
) {
    // 1. 准备对话历史文本（最近 20 轮）
    let recent_messages: Vec<&ChatMessage> = conversation_history
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .rev()
        .take(20)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    let history_text = recent_messages.iter()
        .map(|m| format!("[{}]: {}", m.role, m.content.chars().take(500).collect::<String>()))
        .collect::<Vec<_>>()
        .join("\n");

    // 2. 调用轻量 AI 提炼（使用简单 chat 调用，不流式）
    let prompt = build_tab_memory_extraction_prompt(&history_text);
    let extraction_result = ai_service
        .chat_simple(&prompt, 500)  // max_tokens=500，限制输出长度
        .await;

    match extraction_result {
        Err(e) => {
            tracing::warn!("tab memory extraction AI call failed: {:?}", e);
            return;  // 失败只记日志，不影响主流程
        }
        Ok(response_text) => {
            // 3. 解析 AI 输出（JSON 数组）
            let candidates: Vec<MemoryItemInput> = match parse_memory_candidates(
                &response_text, MemoryLayer::Tab, "tab", &tab_id,
                MemorySourceKind::ConversationSummary, &tab_id,
            ) {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("failed to parse memory candidates: {:?}", e);
                    return;
                }
            };

            if candidates.is_empty() {
                tracing::debug!("no memory candidates extracted for tab {}", tab_id);
                return;
            }

            // 4. 批量写入（upsert）
            if let Err(e) = memory_service.upsert_tab_memories(&tab_id, candidates).await {
                tracing::warn!("tab memory upsert failed: {:?}", e);
            } else {
                tracing::info!("extracted {} memory items for tab {}", candidates.len(), tab_id);
            }
        }
    }
}

/// 解析 AI 输出的 JSON 并构造 MemoryItemInput 列表
fn parse_memory_candidates(
    response_text: &str,
    layer: MemoryLayer,
    scope_type_str: &str,
    scope_id: &str,
    source_kind: MemorySourceKind,
    source_ref: &str,
) -> Result<Vec<MemoryItemInput>, serde_json::Error> {
    // 找到 JSON 数组部分（可能有前后杂文）
    let json_start = response_text.find('[').unwrap_or(0);
    let json_end = response_text.rfind(']').map(|i| i + 1).unwrap_or(response_text.len());
    let json_str = &response_text[json_start..json_end];

    #[derive(Deserialize)]
    struct RawCandidate {
        entity_type: String,
        entity_name: String,
        content: String,
        summary: Option<String>,
        tags: Option<String>,
        confidence: Option<f64>,
    }

    let raw: Vec<RawCandidate> = serde_json::from_str(json_str)?;

    let now = get_current_timestamp();
    Ok(raw.into_iter()
        .filter(|c| !c.entity_name.is_empty() && !c.content.is_empty())
        .map(|c| MemoryItemInput {
            layer: layer.clone(),
            scope_type: MemoryScopeType::from_str(scope_type_str).unwrap_or(MemoryScopeType::Tab),
            scope_id: scope_id.to_string(),
            entity_type: c.entity_type,
            entity_name: c.entity_name,
            content: c.content,
            summary: c.summary.unwrap_or_default(),
            tags: c.tags
                .unwrap_or_default()
                .split_whitespace()
                .map(String::from)
                .collect(),
            source_kind: source_kind.clone(),
            source_ref: source_ref.to_string(),
            confidence: c.confidence.unwrap_or(0.8),
        })
        .collect())
}
```

---

## 五、项目内容记忆提取流程

### 5.1 提取 prompt 模板

```text
你是 Binder 的文档分析助手。请从以下文档内容中提取关键信息，生成项目内容记忆。

## 文档路径
{file_path}

## 文档内容（前 3000 字符）
{content_excerpt}

## 提取要求
1. 命名实体（人物、地点、概念、术语、组织）
2. 文档结构摘要（如有章节则提取大纲）
3. 项目特定定义（专有名词及其定义）

## 输出格式
```json
[
  {
    "entity_type": "entity_person|entity_place|entity_concept|outline|entity_object",
    "entity_name": "实体名",
    "content": "详细描述",
    "summary": "一句话摘要",
    "tags": "关键词"
  }
]
```
仅输出 JSON，如无可提取内容则输出 `[]`。
```

### 5.2 提取任务函数骨架

```rust
/// 项目内容记忆提取任务（文件保存后触发）
pub async fn memory_generation_task_content(
    ai_service: Arc<AiService>,
    memory_service: Arc<MemoryService>,
    file_path: String,
    content_html: String,
    workspace_path: String,
) {
    // 1. 提取纯文本内容（去掉 HTML 标签）
    let plain_text = strip_html_tags(&content_html);
    if plain_text.trim().is_empty() {
        return;
    }

    // 2. 截取前 3000 字符（避免超出 AI 上下文限制）
    let excerpt: String = plain_text.chars().take(3000).collect();

    // 3. 构造 prompt 并调用 AI
    let prompt = build_content_memory_extraction_prompt(&file_path, &excerpt);
    let result = ai_service.chat_simple(&prompt, 800).await;

    match result {
        Err(e) => {
            tracing::warn!("content memory extraction failed for {}: {:?}", file_path, e);
        }
        Ok(response) => {
            let candidates = match parse_memory_candidates(
                &response,
                MemoryLayer::Content,
                "workspace",
                &workspace_path,
                MemorySourceKind::DocumentExtract,
                &file_path,
            ) {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("parse content memory candidates failed: {:?}", e);
                    return;
                }
            };

            if let Err(e) = memory_service
                .upsert_project_content_memories(&file_path, candidates)
                .await
            {
                tracing::warn!("content memory upsert failed: {:?}", e);
            }
        }
    }
}
```

---

## 六、upsert 写入逻辑（冲突处理）

### 6.1 P0 upsert 规则

P0 阶段采用基于 `scope_id + entity_name + layer` 的 upsert，不做 LLM-as-judge 分类：

```rust
impl MemoryService {
    pub async fn upsert_tab_memories(
        &self,
        tab_id: &str,
        items: Vec<MemoryItemInput>,
    ) -> Result<(), MemoryError> {
        let db = self.db.clone();
        let tab_id = tab_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(MemoryError::lock_error)?;
            let now = get_current_timestamp();

            for item in &items {
                // 验证字段完整性（MC-WRITE-003）
                if item.entity_name.is_empty() || item.content.is_empty() {
                    tracing::warn!("skip invalid memory item: entity_name or content empty");
                    continue;
                }

                let id = uuid::Uuid::new_v4().to_string();
                let tags_str = item.tags.join(" ");

                // 先将同 scope+entity_name 的 fresh 记录标记为 superseded
                conn.execute(
                    "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1
                     WHERE scope_type = 'tab' AND scope_id = ?2
                       AND entity_name = ?3 AND layer = 'tab'
                       AND freshness_status = 'fresh'",
                    rusqlite::params![now, tab_id, item.entity_name],
                )?;

                // 插入新记录
                conn.execute(
                    "INSERT INTO memory_items (
                        id, layer, scope_type, scope_id, entity_type, entity_name,
                        content, summary, tags, source_kind, source_ref,
                        confidence, freshness_status, readonly, created_at, updated_at
                     ) VALUES (?1, 'tab', 'tab', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'fresh', 1, ?11, ?11)",
                    rusqlite::params![
                        id, tab_id,
                        item.entity_type, item.entity_name,
                        item.content, item.summary, tags_str,
                        item.source_kind.as_str(), item.source_ref,
                        item.confidence, now,
                    ],
                )?;
            }
            Ok::<(), MemoryError>(())
        })
        .await
        .map_err(|e| MemoryError::LockError(e.to_string()))?
    }
}
```

### 6.2 项目内容记忆 upsert 特殊规则

```rust
pub async fn upsert_project_content_memories(
    &self,
    file_path: &str,
    items: Vec<MemoryItemInput>,
) -> Result<(), MemoryError> {
    let db = self.db.clone();
    let workspace_path = self.workspace_path.to_string_lossy().to_string();
    let file_path = file_path.to_string();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(MemoryError::lock_error)?;
        let now = get_current_timestamp();

        // 将该文件来源的旧 content 记忆标记为 superseded（source_ref = file_path）
        conn.execute(
            "UPDATE memory_items SET freshness_status = 'superseded', updated_at = ?1
             WHERE layer = 'content' AND scope_id = ?2
               AND source_ref = ?3 AND freshness_status = 'fresh'",
            rusqlite::params![now, workspace_path, file_path],
        )?;

        for item in &items {
            let id = uuid::Uuid::new_v4().to_string();
            let tags_str = item.tags.join(" ");
            conn.execute(
                "INSERT INTO memory_items (
                    id, layer, scope_type, scope_id, entity_type, entity_name,
                    content, summary, tags, source_kind, source_ref,
                    confidence, freshness_status, readonly, created_at, updated_at
                 ) VALUES (?1, 'content', 'workspace', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'fresh', 1, ?11, ?11)",
                rusqlite::params![
                    id, workspace_path,
                    item.entity_type, item.entity_name,
                    item.content, item.summary, tags_str,
                    item.source_kind.as_str(), file_path,
                    item.confidence, now,
                ],
            )?;
        }
        Ok::<(), MemoryError>(())
    })
    .await
    .map_err(|e| MemoryError::LockError(e.to_string()))?
}
```

---

## 七、失败降级规则

| 失败场景 | 处理方式 | 日志级别 | 是否影响主任务 |
|---------|---------|---------|--------------|
| AI 提炼调用超时/失败 | 放弃本次写入 | `warn!` | 否 |
| AI 输出 JSON 解析失败 | 放弃本次写入 | `warn!` | 否 |
| 数据库写入失败（锁定） | 放弃本次写入 | `warn!` | 否 |
| 字段验证失败（空 entity_name/content） | 跳过该条，继续其他 | `warn!` | 否 |
| 生成任务崩溃（panic） | Tokio task 级别 panic，不影响主线程 | `error!` | 否 |

**关键原则**：记忆写入是增强功能，任何失败都不得影响用户的主对话体验。

---

## 八、写入操作与 freshness_status 联动矩阵

| 操作 | 对现有记录的影响 | 新记录 freshness_status |
|------|---------------|----------------------|
| 首次写入 | 无 | `fresh` |
| 同实体名更新（tab 层） | 旧记录→`superseded` | `fresh` |
| 文件重新保存（content 层） | 同 source_ref 旧记录→`superseded` | `fresh` |
| 标签删除 | 该 tab_id 所有记录→`expired` | 无新记录 |
| 时间超过 7 天未更新 | 由后台定期任务→`stale`（P1 实现） | - |

---

---

## 十、记忆提炼 AI 独立配置规范（D-11 / P2 决策落地）

> **决策来源**：D-11（A-AST-X-L-01 §五，2026-04-07 收口）

### 10.1 设计意图

记忆提炼任务（标签级摘要提炼、项目内容实体提取）属于**后台轻量任务**，不需要使用与主对话相同的强力模型（如 `deepseek-reasoner`）。使用独立配置可以：
- 降低记忆生成的 token 成本（轻量模型已足够）
- 避免记忆提炼任务占用主对话 provider 的并发额度
- 为未来更换提炼模型提供灵活性

### 10.2 配置键名

```toml
# 建议的配置键名（在应用配置中定义）
memory_extraction_provider = "deepseek"       # 提炼使用的 provider
memory_extraction_model    = "deepseek-chat"  # 提炼使用的模型
```

### 10.3 配置读取位置

- 配置在 `memory_service.rs` 初始化时从应用配置读取，**不硬编码**
- `MemoryService::new()` 初始化时接收可选的 `extraction_config: Option<ExtractionConfig>`

```rust
/// 记忆提炼专用 AI 配置
#[derive(Debug, Clone)]
pub struct ExtractionConfig {
    pub provider: String,   // 如 "deepseek", "openai"
    pub model: String,      // 如 "deepseek-chat"
    pub max_tokens: u32,    // 默认：500（标签级）/ 800（内容级）
}
```

### 10.4 默认降级规则

| 配置状态 | 实际行为 |
|---------|---------|
| 已配置 `memory_extraction_provider` + `memory_extraction_model` | 使用指定配置调用 AI 提炼 |
| 仅配置 provider，未配置 model | 使用该 provider 的轻量版模型（DeepSeek 默认为 `deepseek-chat`，OpenAI 默认为 `gpt-4o-mini`） |
| 完全未配置（`None`） | 复用主对话 provider，但 model 强制降级为轻量版（不使用 `deepseek-reasoner` 等推理模型） |

### 10.5 在提炼任务骨架中的应用

`§四 4.2` 的 `memory_generation_task_tab` 函数中：

```rust
// 调用轻量 AI 提炼（使用记忆提炼专用配置，而非主对话配置）
let extraction_result = memory_service
    .call_extraction_ai(&prompt, max_tokens)   // 内部使用 ExtractionConfig
    .await;
```

与 `§五 5.2` 的 `memory_generation_task_content` 同理，均走 `call_extraction_ai`，不复用主对话的 `ai_service.chat_simple`（后者使用主对话配置）。

---

## 十一、P1 受限升格规则（D-12 / P3 决策落地）

> **决策来源**：D-12（A-AST-X-L-01 §五，2026-04-07 收口）
> **替代原则**：本节取代 D-09 中"标签关闭时升格到长期记忆"的通用描述，提供精确的受限升格规则。

### 11.1 受限升格定义

P1 阶段 `on_tab_deleted` 触发长期记忆升格时，采用**受限升格**模式（而非无条件全量升格）：
- **最多生成一条**工作区长期摘要候选（`layer='workspace_long_term'`）
- 必须满足所有条件才写入；任一条件不满足则放弃（不生成长期记忆）

### 11.2 写入条件（三条全部满足）

| 条件 | 具体要求 | 说明 |
|------|---------|------|
| 条件 1：对话轮次 | 该 tab 的对话轮次 `>= 5`（`role=user` 的消息数 >= 5） | 少于 5 轮的对话内容不足以摘要 |
| 条件 2：关联工作区 | `workspacePath != null`（非临时聊天） | 临时聊天无明确工作区，不升格 |
| 条件 3：AI 置信度 | AI 提炼返回的摘要 `confidence >= 0.6` | 低置信度摘要宁可不写入 |

**任一条件不满足时**：不生成长期记忆；该 tab 的 `memory_items` 由标准生命周期（`expired` → 30 天后物理删除）自然衰减。

### 11.3 升格生成的摘要属性

```rust
// 受限升格写入的记忆项属性
MemoryItemInput {
    layer: MemoryLayer::WorkspaceLongTerm,
    scope_type: MemoryScopeType::Workspace,
    scope_id: workspace_path.clone(),       // 工作区路径
    entity_type: "topic_summary".to_string(),
    entity_name: tab_title.clone(),         // 使用 tab 标题作为实体名
    source_kind: MemorySourceKind::TabDeletionSummary,
    source_ref: tab_id.clone(),             // 溯源到原 tab
    readonly: false,                        // 允许后续 LLM-as-judge 更新
    // content / summary / confidence 由 AI 提炼结果填充
}
```

### 11.4 on_tab_deleted 更新后的执行流程

```rust
pub async fn on_tab_deleted(
    &self,
    tab_id: &str,
    tab_title: &str,
    workspace_path: Option<&str>,
    message_count: usize,         // role=user 的消息数（用于条件1校验）
) -> Result<(), MemoryError> {
    // Step 1: 将该 tab 所有记忆标记为 expired（无条件执行）
    // UPDATE memory_items SET freshness_status='expired' WHERE scope_type='tab' AND scope_id=?

    // Step 2: 受限升格条件检查
    let workspace = match workspace_path {
        Some(p) if !p.is_empty() => p,
        _ => return Ok(()),  // 条件2不满足，不升格
    };
    if message_count < 5 {
        return Ok(());       // 条件1不满足，不升格
    }

    // Step 3: 后台异步 AI 提炼（fire-and-forget）
    tokio::spawn(async move {
        let summary = call_extraction_ai_for_tab_summary(...).await;
        if let Some(s) = summary {
            if s.confidence >= 0.6 {  // 条件3
                memory_service.append_long_term_memory(MemoryItemInput {
                    // 见 11.3 升格属性
                }).await.ok();
            }
        }
    });

    Ok(())
}
```

---

## 十二、P1 stale 清理懒执行策略（D-13 / P4 决策落地）

> **决策来源**：D-13（A-AST-X-L-01 §五，2026-04-07 收口）

### 12.1 策略定义

**不做常驻高频定时器**，采用**懒执行 + 启动检查**：

- 每次应用启动（workspace 加载完成后），执行一次 stale 清理任务
- 清理逻辑为后台异步（`tokio::spawn`），不阻塞启动流程
- 失败不中断启动，错误只记录日志（`tracing::warn!`）

### 12.2 清理规则

| 清理对象 | 条件 |
|---------|------|
| `freshness_status='stale'` 的记忆 | `updated_at < NOW() - 30天（2592000秒）` |
| `freshness_status='expired'` 的记忆 | `updated_at < NOW() - 30天` |
| `freshness_status='superseded'` 的记忆 | `updated_at < NOW() - 7天`（快速清理，superseded 无保留价值） |

**不清理**：
- `freshness_status='fresh'` 的记忆（正常状态）
- 距 `updated_at` 未超期的 stale/expired 记忆（保留窗口期）

### 12.3 实现骨架

```rust
/// 启动维护任务：清理过期 stale/expired 记忆（每次启动执行一次）
/// 在 workspace 加载完成后调用，不阻塞启动流程
pub async fn startup_maintenance(&self) -> Result<u64, MemoryError> {
    let db = self.db.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(MemoryError::lock_error)?;
        let now = get_current_timestamp();
        let stale_threshold = now - 30 * 24 * 3600;     // 30 天
        let superseded_threshold = now - 7 * 24 * 3600;  // 7 天

        let deleted = conn.execute(
            "DELETE FROM memory_items
             WHERE (freshness_status IN ('stale', 'expired') AND updated_at < ?1)
                OR (freshness_status = 'superseded' AND updated_at < ?2)",
            rusqlite::params![stale_threshold, superseded_threshold],
        )?;

        tracing::info!("startup_maintenance: 清理过期记忆 {} 条", deleted);
        Ok::<u64, MemoryError>(deleted as u64)
    })
    .await
    .map_err(|e| MemoryError::LockError(e.to_string()))?
}
```

### 12.4 调用位置

**后端**：在 `workspace/mod.rs` 或 `file_commands.rs` 的工作区加载成功后，异步触发：

```rust
// workspace 加载成功后（伪代码）
tokio::spawn(async move {
    if let Err(e) = memory_service.startup_maintenance().await {
        tracing::warn!("startup_maintenance failed: {:?}", e);
    }
});
```

**前端**：前端同时在 `fileStore.openWorkspace` 成功后调用 `mark_orphan_tab_memories_stale`（见 `A-ENG-X-F-01 §四`）。两者可并行，无先后依赖。

---

## 九、来源映射

1. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`：MC-WRITE-001~003 规则定义来源
2. `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`：D-01、D-02、D-09、D-11、D-12、D-13 决策来源
3. `R-AST-M-R-03_记忆库-主控设计文档.md`：§5 功能逻辑链参考
4. `A-AST-M-S-01_记忆服务数据库落地规范.md`：数据结构定义
5. `A-AST-M-S-02_记忆检索与Query构造规范.md`：sanitize_fts_query 函数引用
6. `A-ENG-X-F-01_ChatTab持久化UUID专项修复规范.md`：孤立 tab 记忆清理接口定义
