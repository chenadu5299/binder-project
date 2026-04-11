# Binder知识库对象与状态机规范

## 文档头

- 结构编码：`AST-M-T-04`
- 文档属性：`专项主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库对象与状态机规范 / 五对象技术定义、状态语义、不变量与状态迁移冻结`
- 上游约束：`AST-M-D-03`, `AST-M-T-02`, `AST-M-T-03`, `AST-M-D-02`, `AG-M-T-04`
- 直接承接：`AST-M-T-03`
- 接口耦合：`AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`
- 汇聚影响：`AST-M-T-05`, `AST-M-T-06`, `AST-M-T-08`
- 扩散检查：`AST-M-T-03`, `AST-M-T-05`, `AST-M-T-06`
- 使用边界：`冻结对象字段语义、状态机、状态不变量和回滚前提；不替代查询协议和执行链细节`
- 变更要求：`修改本文后，必须复核：AST-M-T-03 / AST-M-T-05 / AST-M-T-06`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库对象与状态机专项  
> 上游总控：`A-AST-M-T-03_Binder知识库技术主控文档.md`  
> 对象来源：`A-AST-M-D-03_Binder知识库模块描述文档.md`  
> 执行协同：`A-AST-M-T-06_Binder知识库导入与同步执行规范.md`

---

## 一、文档定位

本文冻结 Binder 知识库五对象的技术定义、状态语义、状态迁移、不变量与最小恢复规则。

本文负责：

1. 定义 `KnowledgeBase / KnowledgeFolder / KnowledgeEntry / KnowledgeDocument / KnowledgeChunk` 的技术字段。
2. 定义 version / verification / deletion / retrieval / sync 等状态语义。
3. 定义对象级不变量和状态迁移合法性。
4. 为执行链、检索协议、上下文消费提供状态依据。

本文不负责：

1. query 协议的输入输出结构。
2. ingestion pipeline 的阶段执行顺序。
3. 自动检索触发与上下文优先级。

---

## 二、规则编号体系

| 规则ID | 含义 |
|---|---|
| `KT-OBJ-001` | 所有知识对象必须具备稳定主键与 workspace 边界 |
| `KT-OBJ-002` | 所有可引用对象必须具备 provenance 与 reference qualification |
| `KT-OBJ-003` | active version 是 entry 层唯一生效版本真源 |
| `KT-OBJ-004` | deletion / verification / retrieval / sync 必须是显式状态，不得隐式推断 |
| `KT-OBJ-005` | 状态迁移必须可观测、可校验、可回滚 |

---

## 三、五对象技术定义

### 3.1 Rust 结构体示例

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBase {
    pub kb_id: String,
    pub workspace_path: String,
    pub owner_scope: OwnerScope,
    pub name: String,
    pub visibility_scope: VisibilityScope,
    pub access_policy: AccessPolicy,
    pub status: KnowledgeBaseStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeFolder {
    pub folder_id: String,
    pub kb_id: String,
    pub parent_folder_id: Option<String>,
    pub display_name: String,
    pub order_key: i64,
    pub status: FolderStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEntry {
    pub entry_id: String,
    pub kb_id: String,
    pub folder_id: Option<String>,
    pub display_name: String,
    pub source_type: SourceType,
    pub source_ref: String,
    pub ingestion_mode: IngestionMode,
    pub sync_mode: SyncMode,
    pub verification_status: VerificationStatus,
    pub active_document_id: Option<String>,
    pub deletion_status: DeletionStatus,
    pub retrieval_state: RetrievalState,
    pub status: EntryStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeDocument {
    pub document_id: String,
    pub entry_id: String,
    pub version_number: i32,
    pub storage_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub checksum: String,
    pub parse_status: ParseStatus,
    pub index_status: IndexStatus,
    pub verification_status: VerificationStatus,
    pub version_status: VersionStatus,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeChunk {
    pub chunk_id: String,
    pub document_id: String,
    pub entry_id: String,
    pub ordinal: i32,
    pub heading_path: Vec<String>,
    pub page_anchor: Option<String>,
    pub block_anchor: Option<String>,
    pub content: String,
    pub provenance: ProvenancePath,
    pub retrieval_state: RetrievalState,
    pub verification_status: VerificationStatus,
    pub created_at: i64,
    pub updated_at: i64,
}
```

### 3.2 TypeScript 类型示例

```ts
export interface KnowledgeEntryView {
  entryId: string;
  kbId: string;
  folderId?: string;
  displayName: string;
  sourceType: SourceType;
  sourceRef: string;
  verificationStatus: VerificationStatus;
  activeDocumentId?: string;
  deletionStatus: DeletionStatus;
  retrievalState: RetrievalState;
}
```

---

## 四、状态语义定义

### 4.1 `SourceType`

```rust
pub enum SourceType {
    ManualUpload,
    WorkspaceFile,
    ExternalConnector,
    GeneratedImport,
}
```

语义约束：

1. `WorkspaceFile` 必须结合 `IngestionMode::Copy | Link | Snapshot` 使用。
2. `ExternalConnector` 必须同时具备 `source_ref + sync_mode + access_policy`。
3. `GeneratedImport` 不得默认由 AI 直接产生，必须有用户确认入口。

### 4.2 `IngestionMode`

```rust
pub enum IngestionMode {
    Copy,
    Link,
    Snapshot,
}
```

语义约束：

1. `Copy` 表示知识库拥有独立文档副本。
2. `Link` 表示知识库跟踪外部或 workspace 文件，但仍必须通过 ingestion pipeline 更新索引。
3. `Snapshot` 表示固定版本导入，后续不得静默同步。

### 4.3 `SyncMode`

```rust
pub enum SyncMode {
    None,
    Manual,
    FollowSource,
    ExternalScheduled,
    Blocked,
}
```

语义约束：

1. `None` 表示彻底静态对象。
2. `Manual` 表示只允许用户显式触发更新。
3. `FollowSource` 表示允许跟踪 workspace/external 源，但必须经 pipeline。
4. `Blocked` 表示同步资格被治理规则暂时冻结。

### 4.4 `VerificationStatus`

```rust
pub enum VerificationStatus {
    Unverified,
    SystemChecked,
    UserVerified,
    Rejected,
}
```

控制语义：

1. `UserVerified` 在检索排序中可稳定加权。
2. `Rejected` 的对象不得进入默认自动检索与默认引用链。
3. `Unverified` 在证据型任务中必须带风险标记。

### 4.5 `DeletionStatus`

```rust
pub enum DeletionStatus {
    Active,
    PendingDelete,
    Deleted,
    Archived,
}
```

控制语义：

1. `PendingDelete` 对象必须立即退出 `reference_ready` 资格。
2. `Deleted` 对象不得继续产生新引用。
3. `Archived` 对象可用于审计，不得默认回到自动检索。

### 4.6 `RetrievalState`

```rust
pub enum RetrievalState {
    NotIndexed,
    Indexed,
    ReferenceReady,
    Suppressed,
    Unavailable,
}
```

控制语义：

1. `Indexed` 不等于 `ReferenceReady`。
2. 只有 provenance 完整、定位锚点完整且 active version 合法时，chunk 才能进入 `ReferenceReady`。
3. `Suppressed` 表示对象存在但被风险、删除、冲突或治理规则压制。

### 4.7 `VersionStatus`

```rust
pub enum VersionStatus {
    Draft,
    Stored,
    Parsing,
    Chunking,
    Indexing,
    Ready,
    Superseded,
    Failed,
}
```

---

## 五、状态不变量

### 5.1 Entry 层不变量

1. 每个 `KnowledgeEntry` 在任一时刻最多只有一个 `active_document_id`。
2. `deletion_status != Active` 时，entry 不得保持 `retrieval_state = ReferenceReady`。
3. `active_document_id` 为空时，entry 不得视为 `Ready`。

### 5.2 Document 层不变量

1. `is_active = true` 的 document，其 `version_status` 必须为 `Ready`。
2. `version_status = Failed` 的 document 不得被切为 active。
3. `Superseded` document 可被追溯，但不得继续承担默认引用资格。

### 5.3 Chunk 层不变量

1. `ReferenceReady` chunk 必须同时具备 `entry_id / document_id / provenance / content`。
2. chunk 所属 document 若不是 active 或合法历史版本，则该 chunk 不得作为默认引用结果。
3. 删除或 superseded 链上的 chunk 不得继续暴露为默认自动注入结果。

---

## 六、状态迁移图

### 6.1 导入状态迁移

```text
Entry: pending_ingest -> processing -> ready | failed
Document: draft -> stored -> parsing -> chunking -> indexing -> ready | failed
Chunk: not_indexed -> indexed -> reference_ready | suppressed
```

### 6.2 替换状态迁移

```text
Old Document: ready -> superseded
New Document: draft -> stored -> parsing -> chunking -> indexing -> ready
Entry: active_document_id(old) -> active_document_id(new)
```

约束：

1. 新 document 未到 `Ready` 之前，old document 不得离开 `Ready`。
2. active version switch 必须是单点切换，不得出现双 active。

### 6.3 删除状态迁移

```text
Entry: active -> pending_delete -> deleted | archived
Document: ready/superseded -> pending_delete -> deleted | archived
Chunk: reference_ready/indexed -> suppressed -> unavailable
```

### 6.4 Metadata 变更状态迁移

```text
Entry metadata: stable -> mutating -> stable
Optional reindex: not_needed | metadata_reindexing -> stable
```

---

## 七、失败恢复与回滚约束

### 7.1 导入失败

1. 若 document 存储失败，entry 不得进入 `ready`。
2. 若 parse/index 失败，entry 必须停留在 `processing` 或 `failed`，不得暴露可引用结果。

### 7.2 替换失败

1. 新版本失败时，old active version 必须继续保持可用。
2. `active_document_id` 不得切换到失败版本。

### 7.3 删除失败

1. 若索引删除失败，entry 必须保留 `pending_delete`，不得伪装成删除完成。
2. 若文档删除失败但索引已删，系统必须保留可恢复路径或重试任务记录。

---

## 八、关键状态结构代码示例

### 8.1 Rust 不变量校验示例

```rust
pub fn validate_entry_invariants(entry: &KnowledgeEntry, active_doc: Option<&KnowledgeDocument>) -> Result<(), String> {
    if entry.status == EntryStatus::Ready && active_doc.is_none() {
        return Err("ready entry must have active document".into());
    }

    if entry.deletion_status != DeletionStatus::Active && entry.retrieval_state == RetrievalState::ReferenceReady {
        return Err("deleted or pending_delete entry cannot remain reference_ready".into());
    }

    Ok(())
}
```

### 8.2 TypeScript 状态守卫示例

```ts
export function canAutoInject(entry: KnowledgeEntryView): boolean {
  return (
    entry.deletionStatus === "active" &&
    entry.retrievalState === "reference_ready" &&
    entry.verificationStatus !== "rejected"
  );
}
```

---

## 九、验收标准

1. 五对象字段与状态语义可直接支撑执行链和检索协议。
2. active version、verification、deletion、retrieval、sync 均有明确控制语义。
3. 导入、替换、删除、metadata 变更均能映射到状态迁移。
4. 不变量足以判定“对象是否合法进入引用或注入链”。

---

## 十、来源映射

1. `A-AST-M-T-03_Binder知识库技术主控文档.md`
2. `A-AST-M-D-03_Binder知识库模块描述文档.md`
3. `A-AST-M-T-02_知识库机制.md`
4. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
