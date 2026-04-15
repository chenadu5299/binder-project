# Binder知识库自动检索协同规范

## 文档头

- 结构编码：`AST-M-T-07`
- 文档属性：`专项主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库自动检索协同规范 / 层次三承接、显式引用与自动检索边界、上下文消费与风险暴露冻结`
- 上游约束：`AST-M-D-02`, `AST-M-D-03`, `AST-M-T-03`, `AST-M-T-05`, `AST-M-P-01`, `AST-M-D-01`, `TMP-M-D-01`, `AG-M-D-01`
- 直接承接：`AST-M-T-03`, `AST-M-T-05`
- 接口耦合：`AST-M-P-01`, `AG-M-T-04`, `AST-M-D-01`, `TMP-M-D-01`
- 汇聚影响：无
- 扩散检查：`AST-M-T-03`, `AST-M-T-05`, `AST-M-P-01`
- 使用边界：`冻结知识库自动检索如何在层次三中触发、降级、注入、暴露风险；不替代上下文注入全局优先级主控`
- 变更要求：`修改本文后，必须复核：AST-M-D-02 / AST-M-D-03 / AST-M-P-01 / AST-M-D-01 / TMP-M-D-01`

---
> 文档分级：`L2 / 二级规则文档`
> 文档类型：`专项规则 / 知识库自动检索协同`
> 当前状态：`Active`
> 受约束于：`A-CORE-C-D-02`、`A-AST-M-D-02`、`A-AST-M-D-03`、`A-AST-M-T-03`、`A-AST-M-T-05`、`A-AST-M-P-01`
> 可约束：`AST` 相关自动检索、注入、降级与风险暴露文档
> 可用于：`定义知识库自动检索的触发、抑制、降级、注入和风险暴露边界`
> 不可用于：`重定义当前文档事实层、项目文档层、显式引用主语义；替代知识库对象模型与检索协议主文档`
> 上游总控：`A-AST-M-T-03_Binder知识库技术主控文档.md`
> 协议基础：`A-AST-M-T-05_Binder知识库检索与引用协议.md`
> 注入边界：`A-AST-M-P-01_上下文注入.md`

---

## 一、文档定位

本文冻结 Binder 知识库自动检索如何在层次三中被触发、如何降级、如何进入上下文、如何暴露风险。

共享概念约束：
1. `当前文档`、`当前文档事实层`、`项目文档层`、`知识检索`、`知识增强` 的主定义以 `A-CORE-C-D-02_产品术语边界.md` 为准。
2. 本文只定义知识库自动检索如何作为后备补强层协同，不重新定义当前文档主链。

本文负责：

1. 定义层次三承接规则。
2. 定义显式引用与自动检索的协同边界。
3. 定义自动检索触发条件、降级条件、抑制条件。
4. 定义知识库自动检索结果进入 prompt/context 的 payload 约束。
5. 定义风险标记与可观测性。

本文不负责：

1. 修改全局优先级顺序。
2. 对象模型与执行链建模。
3. 企业搜索式多源自动问答策略。

---

## 二、规则编号体系

| 规则ID | 含义 |
|---|---|
| `KT-CTX-001` | 知识库默认只在层次三承接 |
| `KT-CTX-002` | 用户显式引用高于自动检索 |
| `KT-CTX-003` | 自动检索只做补强，不覆盖当前文档事实 |
| `KT-CTX-004` | 自动检索必须可降级、可风险标记、可观测 |
| `KT-CTX-005` | 自动检索消费必须走统一 context payload 协议 |

---

## 三、层次三承接规则

### 3.1 承接原则

1. 知识库自动检索默认只在层次三触发。
2. 层次一、层次二不得默认继承层次三知识库主链。
3. 层次三中的知识库结果只能进入 augmentation 层，不得改写 protected/core 层语义。

### 3.2 与其他上下文对象的优先级关系

自动检索知识库的固定相对位置是：

`当前轮目标 > 当前轮 Agent 状态 / artifact / 任务上下文 > 当前文档 / 选区 > 用户显式引用 > 已选模板资产 > 工作区相关 > 记忆库 > 知识库 > 历史摘要`

这意味着：

1. 当前文档先于知识库。
2. 显式引用先于知识库。
3. 记忆库自动检索先于知识库自动检索。
4. 知识库不是裁决层，只是补强层。

---

## 四、显式引用与自动检索的边界

### 4.1 显式引用规则

以下输入视为显式引用：

1. `@知识库`
2. `@知识条目`
3. 拖拽知识条目进入输入区
4. 用户在工作台中明确插入知识对象

显式引用后：

1. 该对象进入显式引用层。
2. 不再与自动检索知识库结果进行同层竞争。
3. 若同一 entry 又被自动检索命中，自动检索侧应去重，不得重复注入。

### 4.2 自动检索规则

自动检索只在以下条件下允许触发：

1. 当前为层次三任务。
2. 当前任务未被显式引用充分覆盖。
3. 当前任务具有知识补强价值。
4. 当前 workspace 中存在可检索知识对象。

### 4.3 显式引用压制规则

以下情况必须压制自动检索知识库：

1. 用户已显式引用且这些引用足以回答当前知识需求。
2. 当前文档已经提供确定事实，知识库只会产生噪声补充。
3. 用户消息显式要求仅依据当前文档或仅依据已引用材料。

---

## 五、自动检索触发与抑制条件

### 5.1 触发条件

建议最小触发谓词：

```rust
pub struct KnowledgeRetrievalDecision {
    pub enabled: bool,
    pub reason: String,
    pub risk_flags: Vec<String>,
}

pub fn should_trigger_knowledge_retrieval(input: &ContextDecisionInput) -> KnowledgeRetrievalDecision {
    if input.layer != "l3" {
        return disabled("layer_not_supported");
    }
    if input.explicit_knowledge_refs_sufficient {
        return disabled("explicit_refs_sufficient");
    }
    if !input.query_requires_external_knowledge {
        return disabled("knowledge_not_needed");
    }
    enabled("augmentation_needed")
}
```

### 5.2 抑制条件

以下情况必须直接抑制：

1. 当前任务明确限定“仅当前文档”。
2. 当前 workspace 没有可引用知识对象。
3. 检索预算不足，且当前文档/显式引用已足够。
4. 知识库索引状态异常或 query 超时。

### 5.3 降级条件

以下情况允许降级而不是报错中断：

1. hybrid/rerank 失败，降级 lexical。
2. verified 结果为空，降级混入 unverified 候选并带风险标记。
3. provenance 不完整，降级为 recall 候选，不作为 citation。

---

## 六、风险标记与可观测性

### 6.1 风险标记枚举

```ts
export type KnowledgeRiskFlag =
  | "unverified"
  | "superseded"
  | "citation_unavailable"
  | "scope_restricted"
  | "query_downgraded"
  | "conflict_unresolved";
```

### 6.2 风险标记规则

1. `unverified`：证据型任务中必须显示。
2. `superseded`：历史版本命中时必须显示。
3. `citation_unavailable`：只能作为 recall，不得作为 citation。
4. `conflict_unresolved`：存在多结果冲突但未能裁决时必须显示。

### 6.3 观测事件

建议记录以下事件：

1. `knowledge_retrieval_triggered`
2. `knowledge_retrieval_suppressed`
3. `knowledge_retrieval_downgraded`
4. `knowledge_retrieval_timeout`
5. `knowledge_result_conflict`
6. `knowledge_injection_applied`

---

## 七、Context Assembly 对接协议

### 7.1 注入 payload 结构示例

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeAugmentationSlice {
    pub source_type: String,           // "knowledge_base"
    pub source_id: String,             // chunk_id
    pub entry_id: String,
    pub document_id: String,
    pub content: String,
    pub source_label: String,          // "[知识库]"
    pub provenance: String,
    pub verification_status: String,
    pub risk_flags: Vec<String>,
    pub priority_tier: String,         // "augmentation"
}
```

### 7.2 注入约束

1. 所有知识库自动检索结果只能进入 `priority_tier = augmentation`。
2. 自动检索结果默认可被预算裁剪。
3. 自动检索结果不得冒充显式引用片段。
4. 自动检索结果若存在风险标记，必须在 content 或 source_label 层可见。

### 7.3 注入数量约束

建议默认限制：

1. `max_chunks = 5`
2. `max_entries = 3`
3. 总 token 预算默认不超过知识库层预算

---

## 八、与记忆库 / 模板库 / 当前文档 / artifact 的协同边界

### 8.1 与记忆库

1. 记忆库更偏语义连续性。
2. 知识库更偏文档证据。
3. 同任务下若记忆和知识冲突，默认不让知识覆盖记忆，更不让二者覆盖当前文档。

### 8.2 与模板库

1. 模板库提供约束。
2. 知识库提供内容。
3. 知识库自动检索不得替代模板约束，也不得把模板当作知识来源。

### 8.3 与当前文档 / artifact

1. 当前文档是当前任务事实现场。
2. artifact 是当前轮推进现场。
3. 知识库只能补强，不得覆盖二者。

---

## 九、关键接口示例

### 9.1 Rust 组装函数示例

```rust
pub fn build_knowledge_augmentation_slices(
    response: QueryKnowledgeBaseResponse
) -> Vec<KnowledgeAugmentationSlice> {
    response.chunks.into_iter().map(|hit| KnowledgeAugmentationSlice {
        source_type: "knowledge_base".into(),
        source_id: hit.chunk_id,
        entry_id: hit.entry_id,
        document_id: hit.document_id,
        content: hit.snippet,
        source_label: "[知识库]".into(),
        provenance: hit.provenance,
        verification_status: format!("{:?}", hit.verification_status),
        risk_flags: hit.risk_flags.into_iter().map(|v| format!("{:?}", v)).collect(),
        priority_tier: "augmentation".into(),
    }).collect()
}
```

### 9.2 TypeScript 判定示例

```ts
export function shouldUseKnowledgeAugmentation(input: {
  layer: "l1" | "l2" | "l3";
  explicitKnowledgeRefsSufficient: boolean;
  queryRequiresExternalKnowledge: boolean;
}) {
  return (
    input.layer === "l3" &&
    !input.explicitKnowledgeRefsSufficient &&
    input.queryRequiresExternalKnowledge
  );
}
```

---

## 十、设计否决条件

以下任一情况成立，必须直接否决自动检索协同设计：

1. 自动检索结果覆盖当前文档事实。
2. 自动检索结果覆盖显式引用。
3. 层次一、层次二默认承接层次三知识库自动检索主链。
4. 自动检索结果不带来源或风险标记即直接注入。
5. query timeout / index 异常时仍静默注入旧缓存结果冒充新结果。

---

## 十一、验收标准

1. 能明确判断何时触发、何时抑制、何时降级知识库自动检索。
2. 自动检索结果的 payload 与风险标记可直接供 `AST-M-P-01` 的 context assembly 消费。
3. 与 memory/template/current document/artifact 的优先级关系不冲突。
4. 任何设计都无法借自动检索越权改写显式引用或当前文档优先级。

---

## 十二、来源映射

1. `A-AST-M-T-03_Binder知识库技术主控文档.md`
2. `A-AST-M-T-05_Binder知识库检索与引用协议.md`
3. `A-AST-M-P-01_上下文注入.md`
4. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
5. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
6. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
