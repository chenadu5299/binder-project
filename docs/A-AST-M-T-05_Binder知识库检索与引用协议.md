# Binder知识库检索与引用协议

## 文档头

- 结构编码：`AST-M-T-05`
- 文档属性：`专项主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库检索与引用协议 / query、result、citation、injection、稳定性与溯源协议冻结`
- 上游约束：`AST-M-D-03`, `AST-M-T-03`, `AST-M-T-04`, `AST-M-D-02`, `AST-M-P-01`, `AG-M-T-04`
- 直接承接：`AST-M-T-03`
- 接口耦合：`AST-M-T-04`, `AST-M-T-07`, `AG-M-T-04`, `AST-M-P-01`
- 汇聚影响：`AST-M-T-06`, `AST-M-T-07`
- 扩散检查：`AST-M-T-03`, `AST-M-T-04`, `AST-M-T-07`
- 使用边界：`冻结检索输入输出、引用与注入 payload、版本切换后的稳定性和失效语义；不替代执行链与对象状态机细节`
- 变更要求：`修改本文后，必须复核：AST-M-T-03 / AST-M-T-04 / AST-M-T-07 / AST-M-P-01`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库检索与引用专项  
> 上游总控：`A-AST-M-T-03_Binder知识库技术主控文档.md`  
> 对象基础：`A-AST-M-T-04_Binder知识库对象与状态机规范.md`  
> 上下文消费：`A-AST-M-T-07_Binder知识库自动检索协同规范.md`

---

## 一、文档定位

本文冻结 Binder 知识库的 query、result、citation、injection 协议，并定义稳定性、失效、去重、冲突裁决的协议口径。

本文负责：

1. 定义查询输入协议。
2. 定义 chunk / entry / document 三层结果协议。
3. 定义引用对象与注入对象协议。
4. 定义版本切换后的引用稳定性与失效语义。
5. 定义检索失败、降级与风险暴露的返回口径。

本文不负责：

1. 对象字段状态机定义。
2. ingestion / replace / delete 执行阶段。
3. 自动检索优先级裁定。

---

## 二、规则编号体系

| 规则ID | 含义 |
|---|---|
| `KT-RET-001` | query 必须显式带 scope、intent、strategy |
| `KT-RET-002` | 结果必须同时具备 chunk 命中、entry 聚合、document 溯源三层语义 |
| `KT-RET-003` | citation 必须绑定稳定版本与 provenance |
| `KT-RET-004` | injection payload 必须带风险与来源标签 |
| `KT-RET-005` | 版本切换、删除、冲突必须有稳定失效语义 |

---

## 三、Query 输入协议

### 3.1 Rust 结构示例

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryKnowledgeBaseRequest {
    pub workspace_path: String,
    pub kb_ids: Option<Vec<String>>,
    pub folder_ids: Option<Vec<String>>,
    pub explicit_entry_ids: Option<Vec<String>>,
    pub query: String,
    pub intent: QueryIntent,
    pub retrieval_strategy: RetrievalStrategy,
    pub require_verified: bool,
    pub limit_chunks: usize,
    pub limit_entries: usize,
    pub limit_documents: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QueryIntent {
    Recall,
    Citation,
    Augmentation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RetrievalStrategy {
    LexicalOnly,
    Hybrid,
    HybridWithRerank,
}
```

### 3.2 TypeScript 结构示例

```ts
export interface QueryKnowledgeBaseRequest {
  workspacePath: string;
  kbIds?: string[];
  folderIds?: string[];
  explicitEntryIds?: string[];
  query: string;
  intent: "recall" | "citation" | "augmentation";
  retrievalStrategy: "lexical_only" | "hybrid" | "hybrid_with_rerank";
  requireVerified: boolean;
  limitChunks: number;
  limitEntries: number;
  limitDocuments: number;
}
```

### 3.3 输入约束

1. `workspace_path` 必须始终存在，不允许默认跨 workspace 搜索。
2. `intent` 必须显式区分，不能用同一种结果协议同时兼顾 recall、citation、augmentation。
3. `require_verified=true` 时，未验证对象可被召回为候选，但不得进入默认首选结果集。
4. `explicit_entry_ids` 存在时，检索必须优先限定在显式选定条目集合中。

---

## 四、Query 返回协议

### 4.1 总体返回结构

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryKnowledgeBaseResponse {
    pub chunks: Vec<KnowledgeChunkHit>,
    pub entries: Vec<KnowledgeEntryAggregate>,
    pub documents: Vec<KnowledgeDocumentTrace>,
    pub warnings: Vec<KnowledgeQueryWarning>,
    pub metadata: KnowledgeQueryMetadata,
}
```

### 4.2 Chunk 命中对象

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeChunkHit {
    pub chunk_id: String,
    pub entry_id: String,
    pub document_id: String,
    pub version_number: i32,
    pub score: f64,
    pub title: String,
    pub snippet: String,
    pub heading_path: Vec<String>,
    pub page_anchor: Option<String>,
    pub block_anchor: Option<String>,
    pub provenance: String,
    pub verification_status: VerificationStatus,
    pub risk_flags: Vec<KnowledgeRiskFlag>,
}
```

### 4.3 Entry 聚合对象

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEntryAggregate {
    pub entry_id: String,
    pub kb_id: String,
    pub display_name: String,
    pub active_document_id: String,
    pub top_chunk_ids: Vec<String>,
    pub aggregate_score: f64,
    pub verification_status: VerificationStatus,
    pub retrieval_state: RetrievalState,
}
```

### 4.4 Document 溯源对象

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeDocumentTrace {
    pub document_id: String,
    pub entry_id: String,
    pub version_number: i32,
    pub storage_path: String,
    pub checksum: String,
    pub is_active: bool,
    pub version_status: VersionStatus,
}
```

### 4.5 结果协议约束

1. `chunks` 负责命中与引用。
2. `entries` 负责聚合与 UI 消费。
3. `documents` 负责溯源与版本真源。
4. 任意 `chunk` 若无法在 `entries` 与 `documents` 中找到对应项，则返回结构非法。

---

## 五、Citation 协议

### 5.1 引用对象定义

```ts
export interface KnowledgeCitation {
  type: "knowledge";
  chunkId: string;
  entryId: string;
  documentId: string;
  versionNumber: number;
  sourceLabel: string;
  title: string;
  snippet: string;
  headingPath: string[];
  pageAnchor?: string;
  blockAnchor?: string;
  provenance: string;
  verificationStatus: VerificationStatus;
  staleState: "fresh" | "superseded" | "deleted" | "unavailable";
}
```

### 5.2 引用约束

1. Citation 必须绑定 `versionNumber`。
2. Citation 必须绑定 `provenance`。
3. Citation 只能引用 `ReferenceReady` 的 chunk。
4. 若 chunk 所属 document 已不是 active version，citation 不得被静默重写；必须显示 `staleState`。

---

## 六、Injection 协议

### 6.1 注入对象定义

```ts
export interface KnowledgeInjectionSlice {
  sourceType: "knowledge_base";
  sourceId: string;
  entryId: string;
  documentId: string;
  chunkId: string;
  content: string;
  sourceLabel: string;
  provenance: string;
  verificationStatus: VerificationStatus;
  riskFlags: string[];
  priorityTier: "augmentation";
}
```

### 6.2 注入约束

1. 注入内容必须带 `sourceLabel` 和 `provenance`。
2. 未验证内容若进入证据型任务上下文，必须带风险标记。
3. `deleted / unavailable / suppressed` 对象不得进入默认自动注入。

---

## 七、稳定性与失效协议

### 7.1 命中稳定性

1. 相同 query、相同 scope、相同 active version 集合下，top-k 结果应相对稳定。
2. 排序变化必须在 `metadata.reason` 中可归因，例如：
   - `verification_boost_changed`
   - `active_version_switched`
   - `visibility_changed`
   - `rerank_enabled`

### 7.2 引用稳定性

1. 历史引用必须保留其当时版本信息。
2. 历史版本被 superseded 后，旧 citation 仍可展示，但必须标记 `staleState="superseded"`。
3. 文档被删除后，旧 citation 仅可用于审计或 UI 提示，不得继续作为默认自动注入对象。

### 7.3 版本切换后的失效规则

| 场景 | Citation 行为 | 自动注入行为 |
|---|---|---|
| 新版本 ready，旧版本 superseded | 旧 citation 标记 superseded | 默认只用新 active version |
| 文档 deleted | 旧 citation 标记 deleted | 自动注入禁用 |
| chunk 重建但原锚点失效 | 旧 citation 标记 unavailable | 自动注入禁用 |

### 7.4 冲突裁决规则

1. 多个 chunk 命中冲突时，返回并列候选，不直接拼装为统一事实。
2. 多个 entry 冲突时，优先级为：
   - 显式选定 entry
   - active version
   - verification_status
   - provenance 完整度
   - score
3. 若仍不可裁决，返回 `warnings += conflict_unresolved`。

---

## 八、失败与降级协议

### 8.1 `warnings` 枚举示例

```rust
pub enum KnowledgeQueryWarning {
    VerificationMissing,
    ActiveVersionMissing,
    CitationUnavailable,
    ConflictUnresolved,
    QueryDowngradedToLexical,
    ScopeRestricted,
}
```

### 8.2 降级规则

1. rerank 失败时可降级到 hybrid 或 lexical，但必须在 `warnings` 中暴露。
2. provenance 不完整的结果可作为 recall 候选，但不得作为默认 citation。
3. query 超时可返回空结果或部分结果，但必须带超时 warning。

---

## 九、关键 payload 示例

### 9.1 返回 JSON 示例

```json
{
  "chunks": [
    {
      "chunk_id": "kbchunk_01",
      "entry_id": "kbentry_01",
      "document_id": "kbdoc_02",
      "version_number": 2,
      "score": 0.91,
      "title": "项目约束说明",
      "snippet": "知识库默认只在层次三承接。",
      "heading_path": ["架构边界", "知识库"],
      "page_anchor": null,
      "block_anchor": "block-8a2c",
      "provenance": "kb://proj/kbentry_01/kbdoc_02#block-8a2c",
      "verification_status": "user_verified",
      "risk_flags": []
    }
  ],
  "entries": [],
  "documents": [],
  "warnings": [],
  "metadata": {
    "strategy": "hybrid_with_rerank",
    "reason": "verification_boost_changed"
  }
}
```

### 9.2 Rust citation 验证示例

```rust
pub fn validate_citation(hit: &KnowledgeChunkHit, trace: &KnowledgeDocumentTrace) -> Result<(), String> {
    if hit.version_number != trace.version_number {
        return Err("citation version mismatch".into());
    }
    if hit.provenance.is_empty() {
        return Err("citation provenance missing".into());
    }
    Ok(())
}
```

---

## 十、验收标准

1. query/result/citation/injection 的字段与语义可直接供 Rust/TS 实现承接。
2. 三层结果协议完整，不存在“只返回 chunk 文本”的模糊口径。
3. 版本切换、删除、冲突与降级都有稳定返回规则。
4. provenance、verification、risk flags 能同时影响引用与注入。

---

## 十一、来源映射

1. `A-AST-M-T-03_Binder知识库技术主控文档.md`
2. `A-AST-M-T-04_Binder知识库对象与状态机规范.md`
3. `A-AST-M-D-03_Binder知识库模块描述文档.md`
4. `A-AST-M-P-01_上下文注入.md`
