# 上下文装配与裁剪规范

## 文档头

- 结构编码：`AST-M-S-04`
- 文档属性：`专项落地规范`
- 主责模块：`AST`
- 文档职责：`上下文装配与裁剪规范 / ContextPackage 完整结构、全局注入顺序、token 预算、裁剪算法、记忆注入格式、工程骨架`
- 上游约束：`AST-M-P-01`, `AST-M-D-01`, `AST-M-T-01`, `AST-M-S-01`, `AST-M-S-02`
- 直接承接：`A-AST-X-L-02_记忆库功能开发计划.md`
- 接口耦合：`ENG-X-T-02`, `context_manager.rs`, `ai_commands.rs`
- 使用边界：`P0 实施直接参考；本文是 AST-M-P-01 的工程落地补全，不替代 AST-M-P-01 的原则定义`
- 决策依据：`D-10（P0 context 注入边界）`, `AST-M-P-01 §五（预算分配）`

---

## 一、ContextPackage 完整数据结构

### 1.1 ContextSlice 扩展字段定义

基于 `A-AST-M-P-01_上下文注入.md` §七 定义的基础字段，补充工程必需的扩展字段：

```rust
/// 上下文注入片段（对应 A-AST-M-P-01 §七的 ContextSlice）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSlice {
    // ── 基础字段（AST-M-P-01 §七定义，必须保留）──
    pub source_type: ContextSliceType,  // 来源类型枚举（见 §1.2）
    pub source_id: String,              // 唯一来源标识（tab_id / file_path / memory_id 等）
    pub content: String,                // 注入文本内容
    pub priority: i32,                  // 优先级数值（越小优先级越高，越晚被裁剪）
    pub token_cost_estimate: usize,     // token 估算（字符数 / 4，中英文混合）
    pub timestamp: i64,                 // 来源内容的时间戳（Unix 秒）

    // ── 扩展字段（本文新增，工程必需）──
    pub relevance_score: Option<f64>,   // 相关性得分，来自 FTS5 rank（记忆/知识库层专用）
    pub scope: Option<String>,          // 作用域标识（tab/content/workspace/user）
    pub freshness_status: Option<String>, // 来源的新鲜度（记忆层专用）
    pub source_label: Option<String>,   // 格式化来源标签，直接嵌入注入文本（如"[标签记忆]"）
    pub provenance: Option<String>,     // 来源溯源路径（文件路径/对话轮次/记忆 ID）
    pub priority_tier: PriorityTier,    // 预算层级，决定裁剪顺序（见 §1.3）
    pub is_protected: bool,             // 是否受保护（protected=true 的 slice 永远不被裁剪）
}

/// 上下文包（对应 A-AST-M-P-01 §七的 ContextPackage）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPackage {
    pub task_id: Option<String>,
    pub layer: String,                  // "l1" / "l2" / "l3"
    pub slices: Vec<ContextSlice>,
    pub total_budget: usize,            // 总 token 预算
    pub used_budget: usize,             // 已使用 token 数
    pub dropped_sources: Option<Vec<String>>,  // 被裁剪的 source_id 列表
    pub metadata: ContextPackageMetadata,
}

/// 包级别元数据
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ContextPackageMetadata {
    pub memory_timed_out: bool,         // 记忆检索是否超时降级
    pub memory_item_count: usize,       // 注入的记忆条目数
    pub truncation_applied: bool,       // 是否发生过裁剪
    pub min_context_applied: bool,      // 是否降级为最小可执行上下文
}
```

### 1.2 ContextSliceType 枚举（完整定义）

```rust
/// 上下文片段来源类型（与 A-AST-M-P-01 §三 注入来源对应）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ContextSliceType {
    // P0（永远保留）
    CurrentGoal,            // 当前轮用户目标
    SystemPrompt,           // 系统 prompt（governance）
    // P1（尽量保留）
    AgentTaskState,         // Agent 任务状态（stage, plan, artifacts）
    CurrentDocument,        // 当前文档内容（含块列表）
    ExplicitReference,      // 用户显式引用（文件、文本、图片、链接）
    TemplateAsset,          // 已选模板资产
    RecentHistory,          // 近期对话摘要
    // P2（按预算分配，超出则裁剪）
    MemoryItem,             // 记忆库检索结果
    KnowledgeBase,          // 知识库检索结果（未实现，占位）
    // P3（按需注入）
    WorkspaceDependencies,  // 工作区文件依赖关系
    PendingDiffStatus,      // 待处理 diff 状态
}

/// 预算层级（决定裁剪优先级）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum PriorityTier {
    /// 不可裁剪（system prompt、当前用户目标、当前文档定位信息）
    Protected = 0,
    /// 核心层（Agent 状态、当前文档主体、显式引用关键部分）
    Core = 1,
    /// 补强层（记忆库、知识库、历史摘要）—— 先裁剪
    Augmentation = 2,
    /// 可选层（模板资产非关键部分、工作区依赖）
    Optional = 3,
}
```

---

## 二、全局注入顺序表（L3 层完整排序）

基于 `A-AST-M-P-01_上下文注入.md` §四的优先级顺序，以下是工程实现的完整排序表：

| 顺序 | ContextSliceType | PriorityTier | 对应 prompt 层级 | 说明 |
|------|-----------------|-------------|----------------|------|
| 1 | `SystemPrompt` | Protected | L1 governance | 角色定义、工具规则 |
| 2 | `AgentTaskState` | Core | L2 task | plan/scope/verification |
| 3 | `CurrentDocument` | Core | L4 fact | 当前文件、块列表、选区 |
| 4 | `ExplicitReference` | Core | L5 constraint | 用户 @ 引用、文件引用 |
| 5 | `TemplateAsset` | Core | L5 constraint | 选择的模板约束 |
| 6 | `MemoryItem` | Augmentation | L6 augmentation | 记忆库检索结果 |
| 7 | `KnowledgeBase` | Augmentation | L6 augmentation | 知识库结果（未实现） |
| 8 | `RecentHistory` | Augmentation | L3 conversation | 对话历史摘要 |
| 9 | `WorkspaceDependencies` | Optional | - | 文件依赖补充 |
| 10 | `PendingDiffStatus` | Optional | - | Diff 状态提示 |

**priority 数值映射**（数字越小优先级越高）：

```rust
impl ContextSliceType {
    pub fn default_priority(&self) -> i32 {
        match self {
            ContextSliceType::SystemPrompt => 0,
            ContextSliceType::CurrentGoal => 1,
            ContextSliceType::AgentTaskState => 10,
            ContextSliceType::CurrentDocument => 20,
            ContextSliceType::ExplicitReference => 30,
            ContextSliceType::TemplateAsset => 35,
            ContextSliceType::MemoryItem => 50,
            ContextSliceType::KnowledgeBase => 55,
            ContextSliceType::RecentHistory => 60,
            ContextSliceType::WorkspaceDependencies => 70,
            ContextSliceType::PendingDiffStatus => 80,
        }
    }

    pub fn default_tier(&self) -> PriorityTier {
        match self {
            ContextSliceType::SystemPrompt | ContextSliceType::CurrentGoal => PriorityTier::Protected,
            ContextSliceType::AgentTaskState
            | ContextSliceType::CurrentDocument
            | ContextSliceType::ExplicitReference
            | ContextSliceType::TemplateAsset => PriorityTier::Core,
            ContextSliceType::MemoryItem
            | ContextSliceType::KnowledgeBase
            | ContextSliceType::RecentHistory => PriorityTier::Augmentation,
            ContextSliceType::WorkspaceDependencies
            | ContextSliceType::PendingDiffStatus => PriorityTier::Optional,
        }
    }
}
```

---

## 三、Token 预算分配（A-AST-M-P-01 §5.1 的工程落地）

### 3.1 预算分配表

| 层级 | 预算比例 | 对应 ContextSliceType | 典型 token 数（32K 总窗口）|
|------|---------|---------------------|--------------------------|
| 当前轮用户目标 + Agent 状态 + 当前文档 | 55% | SystemPrompt + CurrentGoal + AgentTaskState + CurrentDocument | ~9,900 |
| 用户显式引用 + 模板资产 | 20% | ExplicitReference + TemplateAsset | ~3,600 |
| 记忆库 | 10% | MemoryItem | ~1,800 |
| 知识库 | 10% | KnowledgeBase | ~1,800 |
| 历史摘要 | 5% | RecentHistory | ~900 |

**总预算估算**：`max_context_tokens = total_window * 0.8`（保留 20% 给模型输出）

### 3.2 记忆层 token 预算计算

```rust
/// 计算记忆层可用的 token 预算
pub fn calculate_memory_budget(total_context_tokens: usize) -> usize {
    // 10% 的总上下文 token
    (total_context_tokens * 10) / 100
}

/// 估算记忆条目的 token 消耗（以 summary 为主，不注入全量 content）
pub fn estimate_memory_token_cost(item: &MemorySearchResult) -> usize {
    // summary 优先（注入 summary 而非 content）
    let text = if !item.item.summary.is_empty() {
        &item.item.summary
    } else {
        &item.item.content
    };
    // 1 token ≈ 4 字符（中英文混合）
    (text.chars().count() + item.item.entity_name.chars().count() + 20) / 4
}
```

---

## 四、裁剪算法（A-AST-M-P-01 §8.5 的完整版）

### 4.1 裁剪顺序

按 `A-AST-M-P-01` §5.2 定义的裁剪顺序：

1. 先裁剪 `RecentHistory`（历史摘要）
2. 再裁剪 `KnowledgeBase`（知识库）
3. 再裁剪 `MemoryItem`（记忆库）
4. 再裁剪 `TemplateAsset` 的非关键部分
5. 再裁剪 `WorkspaceDependencies`
6. 最后考虑裁剪 `AgentTaskState` 的非关键部分
7. 永远不裁剪：`SystemPrompt`、`CurrentGoal`、`CurrentDocument` 定位信息、`ExplicitReference`

### 4.2 完整裁剪函数

```rust
/// 对 ContextSlice 列表执行预算裁剪，返回 ContextPackage
pub fn trim_context_slices(
    mut slices: Vec<ContextSlice>,
    total_budget: usize,
    layer: &str,
    task_id: Option<String>,
) -> ContextPackage {
    // 1. 按 priority 升序排列（数字小的优先保留）
    slices.sort_by(|a, b| a.priority.cmp(&b.priority));

    let mut used_budget = 0usize;
    let mut kept: Vec<ContextSlice> = Vec::new();
    let mut dropped: Vec<String> = Vec::new();
    let mut truncation_applied = false;

    // 2. 第一遍：保留所有 Protected 和 Core 层（不管预算）
    let (protected_slices, remaining_slices): (Vec<_>, Vec<_>) = slices
        .into_iter()
        .partition(|s| s.is_protected || s.priority_tier <= PriorityTier::Core);

    for s in &protected_slices {
        used_budget += s.token_cost_estimate;
    }
    kept.extend(protected_slices);

    // 3. 第二遍：按 priority 顺序填入 Augmentation / Optional 层（受预算限制）
    let mut augmentation_slices = remaining_slices;
    augmentation_slices.sort_by(|a, b| a.priority.cmp(&b.priority));

    for s in augmentation_slices {
        if used_budget + s.token_cost_estimate <= total_budget {
            used_budget += s.token_cost_estimate;
            kept.push(s);
        } else {
            truncation_applied = true;
            dropped.push(s.source_id.clone());
        }
    }

    // 4. 检查是否需要降级为最小可执行上下文
    let min_context_applied = used_budget > total_budget * 12 / 10;  // 超过 120% 时触发
    if min_context_applied {
        // 极端情况：只保留 SystemPrompt + CurrentGoal + CurrentDocument 定位信息
        kept.retain(|s| {
            s.is_protected
            || matches!(s.source_type,
                ContextSliceType::SystemPrompt |
                ContextSliceType::CurrentGoal |
                ContextSliceType::CurrentDocument
            )
        });
        used_budget = kept.iter().map(|s| s.token_cost_estimate).sum();
    }

    ContextPackage {
        task_id,
        layer: layer.to_string(),
        slices: kept,
        total_budget,
        used_budget,
        dropped_sources: if dropped.is_empty() { None } else { Some(dropped) },
        metadata: ContextPackageMetadata {
            truncation_applied,
            min_context_applied,
            ..Default::default()
        },
    }
}
```

---

## 五、augmentation 层的记忆注入格式

### 5.1 标准注入文本模板

```rust
/// 将记忆检索结果格式化为注入文本
pub fn format_memory_for_injection(results: &MemorySearchResponse) -> String {
    if results.items.is_empty() {
        return String::new();
    }

    let mut output = String::from("[记忆库信息]\n");

    for result in &results.items {
        let item = &result.item;
        let label = &result.source_label;  // "[标签记忆]" / "[项目内容]" 等

        // 注入 summary（不注入全量 content）
        let text = if !item.summary.is_empty() {
            item.summary.as_str()
        } else {
            // summary 为空时取 content 前 100 字
            &item.content.chars().take(100).collect::<String>()
        };

        output.push_str(&format!(
            "- {} {}（{}）：{}\n",
            label,
            item.entity_name,
            item.entity_type,
            text,
        ));
    }

    output.push_str("[/记忆库信息]\n");
    output
}
```

**注入示例**：

```text
[记忆库信息]
- [标签记忆] 写作风格（preference）：保持正式语气，避免第一人称叙述
- [标签记忆] 数据引用约束（constraint）：第三节的市场数据引用不要删除
- [项目内容] 李明（entity_person）：男主角，性格内敛，在第一章出场
- [项目内容] 上界算法（entity_concept）：本项目定义的专有名词，指递归上限优化策略
[/记忆库信息]
```

### 5.2 注入规则

- 注入 `summary` 优先，不注入全量 `content`（避免 token 浪费）
- 每条记忆项必须带 `source_label`（`[标签记忆]` / `[项目内容]` 等），禁止匿名注入
- `freshness_status=stale` 的记忆注入时加标注：`（信息可能已过时）`
- 若 `results.timed_out=true`，注入注释：`[记忆库检索超时，本轮使用空记忆]`

---

## 六、context_manager.rs 中的骨架

### 6.1 build_prompt_package 的 L6 augmentation 层实现位置

```rust
// context_manager.rs → build_prompt_package
// 在 L5 constraint 层之后，L7 tool_and_output 之前

// L6 augmentation: 记忆库注入
// ⚠️ 注意：memory_augmentation 字段由 ai_commands.rs 在调用前预先填充
// context_manager.rs 本身不发起异步记忆检索，只消费已准备好的注入文本
if let Some(ref memory_text) = context.memory_augmentation {
    if !memory_text.is_empty() {
        layers.push(PromptPackageLayer {
            key: "augmentation".to_string(),
            title: "Memory Augmentation".to_string(),
            content: memory_text.clone(),
        });
    }
}
```

### 6.2 ContextInfo 扩展（需要在 context_manager.rs 中新增字段）

```rust
// context_manager.rs 中的 ContextInfo 结构体新增字段
pub struct ContextInfo {
    // ... 现有字段（保持不变）...

    /// [新增] 记忆库注入文本（由 ai_commands.rs 在调用 build_prompt_package 前填充）
    /// 格式：已经是 format_memory_for_injection() 的输出结果
    /// 若为 None：跳过 L6 augmentation 记忆注入
    pub memory_augmentation: Option<String>,
}
```

---

## 七、ai_commands.rs 中记忆检索的调用节点

### 7.1 调用位置（在 context 构建阶段）

```rust
// ai_commands.rs → ai_chat_stream 命令中的调用节点
// 位置：context_info 构建完成后，context_manager.build_prompt_package 调用前

// ====== 记忆检索（P0 新增）======
let memory_augmentation = {
    let memory_query = build_memory_query_from_context(&context_info);
    let search_params = SearchMemoriesParams {
        query: memory_query,
        tab_id: Some(tab_id.clone()),
        workspace_path: Some(workspace_path.to_string_lossy().to_string()),
        scope: MemorySearchScope::All,
        limit: Some(10),
        entity_types: None,
    };

    // 有 500ms 超时，失败时返回空结果（MC-WRITE-001 / MC-READ-001 规则）
    let response = memory_service
        .search_memories(search_params)
        .await
        .unwrap_or_default();

    // 记录注入日志（异步，不等待）
    if !response.items.is_empty() {
        let ids: Vec<String> = response.items.iter()
            .map(|r| r.item.id.clone())
            .collect();
        let ms_clone = memory_service.clone();
        let tab_clone = tab_id.clone();
        tokio::spawn(async move {
            let _ = ms_clone.record_usage(&ids, &tab_clone, "").await;
        });
    }

    format_memory_for_injection(&response)
};

context_info.memory_augmentation = if memory_augmentation.is_empty() {
    None
} else {
    Some(memory_augmentation)
};
// ====== 记忆检索结束 ======

// 然后调用 context_manager
let system_prompt = context_manager.build_multi_layer_prompt(&context_info, enable_tools);
```

> 2026-04-08 实现回写：
> - S-01 去重已在 `ai_commands.rs` 按真实 `memory_item.id`（`Reference.source`）执行，不再依赖显示名推断。
> - 注入日志调用为 `record_memory_usage(memory_ids, tab_id)`，保持异步 fire-and-forget。
> - `search_memories_cmd` 的 `include_user_memory` 默认关闭，层次三链路默认不合并 user 记忆，需显式开启。

### 7.2 调用链时序

```
ai_chat_stream() 被前端触发
    ↓
构建 ContextInfo（file, selection, agent_state 等）
    ↓
build_memory_query_from_context()  ← [按 D-06 规则构造 query]
    ↓
memory_service.search_memories()   ← [500ms 超时，失败返回空]
    ↓
format_memory_for_injection()      ← [格式化为注入文本]
    ↓
context_info.memory_augmentation = Some(text)
    ↓
context_manager.build_prompt_package()  ← [同步，消费 memory_augmentation]
    ↓ L6 augmentation 层注入记忆文本
AI Provider 流式调用
    ↓
(后台) tokio::spawn: record_usage()    ← [记录注入日志，不等待]
(后台) 检查轮次，若达阈值: spawn memory_generation_task_tab()
```

---

## 八、最小可执行上下文（降级场景）

降级触发条件：裁剪后仍超出 120% 预算时（极端情况）。

降级时保留的最小集合：
1. `SystemPrompt`（完整）
2. 当前文件路径（`CurrentDocument` 中的 `current_file` 行）
3. 用户当前消息（`CurrentGoal`）
4. 用户显式引用中的第一个引用（防止用户刚发出的引用被丢掉）

降级时必须触发暴露码 `E_CONTEXT_BUDGET_EXCEEDED`（见 `A-AST-M-P-01` §8.2），记录 `warn!` 日志：

```rust
if pkg.metadata.min_context_applied {
    tracing::warn!(
        "context budget exceeded, falling back to minimum context. \
         used: {} tokens, budget: {}",
        pkg.used_budget, pkg.total_budget
    );
    // 可选：向前端发送 context_degraded 事件
}
```

---

## 九、前端采集层字段闭合检查

| 采集层 | 采集字段 | 传入后端字段 | 用于记忆的字段 |
|--------|---------|------------|--------------|
| `chatStore.ts` | `tabId`, `messages`, `mode` | `tab_id`, `messages`, `chat_mode` | `tab_id`（scope_id） |
| `useAutoComplete.ts` | `currentFile`, `selectedText`, `cursorBlock` | `current_file`, `selected_text`, `cursor_block_id` | 不传记忆（层次一不接入） |
| `useInlineAssist.ts` | `currentFile`, `selectedText` | `current_file`, `selected_text` | 不传记忆（层次二不接入） |
| `ai_commands.rs` | 以上全部 | `ContextInfo` | `tab_id`, `current_file`, `selected_text` → `build_memory_query` |

**关键约束**：
- `chatStore` 的 `tabId` 必须是跨重启稳定的 UUID（D-05 决策），这是记忆 scope_id 绑定的基础。
- 层次一（续写）和层次二（局改）不传 `tab_id` 给记忆检索，不触发记忆注入（`A-AST-M-P-01` §6.2）。
- 层次三（对话编辑）通过 `ai_chat_stream` 路径，必须传 `tab_id`。

---

## 十、来源映射

1. `A-AST-M-P-01_上下文注入.md`：注入顺序、预算分配、裁剪顺序（本文的工程落地依据）
2. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`：MC-READ-001、MC-READ-002 规则（注入优先级的协同依据）
3. `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`：D-10（P0 context 注入边界）
4. `A-AST-M-S-01_记忆服务数据库落地规范.md`：MemorySearchResult、MemoryItem 结构定义
5. `A-AST-M-S-02_记忆检索与Query构造规范.md`：search_memories 调用接口
6. `src-tauri/src/services/context_manager.rs`：现有 ContextInfo / PromptPackage 结构（本文补全其 L6 层）
