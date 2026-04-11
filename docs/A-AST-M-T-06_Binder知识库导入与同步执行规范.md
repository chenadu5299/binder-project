# Binder知识库导入与同步执行规范

## 文档头

- 结构编码：`AST-M-T-06`
- 文档属性：`专项主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库导入与同步执行规范 / ingestion、replace、delete、reindex、rebuild、retry、rollback 主链冻结`
- 上游约束：`AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-D-03`, `AST-M-D-02`, `WS-M-D-01`
- 直接承接：`AST-M-T-03`, `AST-M-T-04`
- 接口耦合：`AST-M-T-05`, `AST-M-T-07`, `AST-M-T-08`, `AG-M-T-04`
- 汇聚影响：`AST-M-T-08`
- 扩散检查：`AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`
- 使用边界：`冻结执行阶段、状态回写、重试与回滚规则；不替代对象状态语义和上下文优先级裁定`
- 变更要求：`修改本文后，必须复核：AST-M-T-03 / AST-M-T-04 / AST-M-T-05 / AST-M-T-08`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库导入与同步执行专项  
> 上游总控：`A-AST-M-T-03_Binder知识库技术主控文档.md`  
> 状态基础：`A-AST-M-T-04_Binder知识库对象与状态机规范.md`  
> 协议依赖：`A-AST-M-T-05_Binder知识库检索与引用协议.md`

---

## 一、文档定位

本文冻结 Binder 知识库的 ingestion、replace、delete、metadata reindex、rebuild、retry、rollback、source sync 的执行链。

本文负责：

1. 定义执行阶段与阶段状态回写。
2. 定义 active version switch 的唯一合法路径。
3. 定义 delete / replace / rebuild 失败时的恢复策略。
4. 定义外部同步和 workspace follow-source 的执行边界。

本文不负责：

1. query/result/citation 协议。
2. 自动检索优先级。
3. 对象状态枚举本身的定义。

---

## 二、规则编号体系

| 规则ID | 含义 |
|---|---|
| `KT-ING-001` | 所有写入必须经过 ingestion pipeline |
| `KT-ING-002` | active version switch 必须在新版本 ready 后单点切换 |
| `KT-ING-003` | delete 必须先禁用引用资格，再删除索引和文档 |
| `KT-ING-004` | rebuild / retry / rollback 必须有阶段状态与错误码 |
| `KT-ING-005` | 外部同步不得绕过 execution pipeline |

---

## 三、执行阶段模型

### 3.1 Rust 阶段结构示例

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeExecutionStage {
    pub job_id: String,
    pub entry_id: String,
    pub document_id: Option<String>,
    pub action: KnowledgeExecutionAction,
    pub stage: KnowledgeExecutionStageKind,
    pub status: KnowledgeExecutionStatus,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub retry_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
}

pub enum KnowledgeExecutionAction {
    Ingest,
    Replace,
    Delete,
    MetadataReindex,
    Rebuild,
    Sync,
}

pub enum KnowledgeExecutionStageKind {
    ValidateSource,
    PersistDocument,
    Parse,
    Chunk,
    Index,
    QualifyReference,
    SwitchActiveVersion,
    SuppressReferences,
    DeleteIndex,
    DeleteDocument,
    CommitMetadata,
}

pub enum KnowledgeExecutionStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    RollbackNeeded,
    RolledBack,
}
```

---

## 四、Ingestion Pipeline

### 4.1 标准执行链

```text
validate source
  -> persist document
  -> parse
  -> chunk
  -> index
  -> qualify reference
  -> commit entry ready
```

### 4.2 执行约束

1. `persist document` 失败时，entry 不得进入 `processing` 之后的状态。
2. `parse/chunk/index` 任一步失败，系统必须回写 `error_code` 与 `retryable` 语义。
3. `qualify reference` 未完成前，chunk 不得进入 `ReferenceReady`。

### 4.3 伪代码示例

```rust
pub fn run_ingestion(job: &IngestKnowledgeRequest) -> Result<(), KnowledgeError> {
    write_stage(job, ValidateSource, Running)?;
    validate_source(job)?;
    write_stage(job, ValidateSource, Succeeded)?;

    let document = persist_document(job)?;
    parse_document(&document)?;
    let chunks = build_chunks(&document)?;
    index_chunks(&chunks)?;
    qualify_reference(&document, &chunks)?;
    commit_entry_ready(&document.entry_id, &document.document_id)?;

    Ok(())
}
```

---

## 五、Replace Pipeline

### 5.1 标准执行链

```text
create new version
  -> persist document
  -> parse
  -> chunk
  -> index
  -> qualify reference
  -> switch active version
  -> mark old version superseded
```

### 5.2 Active Version Switch 规则

1. 只有新 document 到达 `Ready + ReferenceReady` 后，才允许 `SwitchActiveVersion`。
2. `SwitchActiveVersion` 必须是单事务或等价单点提交。
3. 切换失败时，旧 active version 必须保持不变。

### 5.3 伪代码示例

```rust
pub fn switch_active_version(entry_id: &str, new_doc_id: &str, old_doc_id: &str) -> Result<(), KnowledgeError> {
    begin_tx()?;
    set_document_active(new_doc_id, true)?;
    set_document_active(old_doc_id, false)?;
    set_entry_active_document(entry_id, new_doc_id)?;
    set_document_version_status(old_doc_id, VersionStatus::Superseded)?;
    commit_tx()?;
    Ok(())
}
```

---

## 六、Delete Pipeline

### 6.1 标准执行链

```text
mark pending_delete
  -> suppress references
  -> delete index data
  -> delete or archive document
  -> mark deleted
```

### 6.2 执行约束

1. `pending_delete` 写回后，对象必须立即退出默认引用与自动注入。
2. `delete index data` 完成前，不得回写 `deleted`。
3. `delete or archive document` 失败时，不得伪装为完整删除。

### 6.3 伪代码示例

```rust
pub fn run_delete(entry_id: &str) -> Result<(), KnowledgeError> {
    set_entry_deletion_status(entry_id, DeletionStatus::PendingDelete)?;
    suppress_reference_ready(entry_id)?;
    delete_entry_index_data(entry_id)?;
    delete_or_archive_documents(entry_id)?;
    set_entry_deletion_status(entry_id, DeletionStatus::Deleted)?;
    Ok(())
}
```

---

## 七、Metadata Reindex 与 Rebuild

### 7.1 Metadata Reindex

用于：

1. 重命名 entry
2. 移动 folder
3. 调整可见性、验证状态、排序相关 metadata

约束：

1. Metadata reindex 不得改写文档内容。
2. Metadata reindex 失败时，不得污染 active version。

### 7.2 Full Rebuild

用于：

1. index 损坏
2. chunk 重新切分
3. parser/reranker 版本升级

约束：

1. rebuild 期间可保留旧 active index 继续服务，直到新 index ready。
2. rebuild 完成前，新索引不得提前抢占默认服务资格。

---

## 八、Retry / Rollback / Recovery

### 8.1 Retry 条件

以下失败默认可重试：

1. parser 临时失败
2. index 写入失败
3. metadata reindex 失败
4. 外部同步拉取失败

### 8.2 Rollback 条件

以下失败必须触发 rollback 或保持旧视图：

1. replace 链在 active version switch 前失败
2. delete 链在 index 删除后、document 删除前失败
3. rebuild 链在新索引资格判定前失败

### 8.3 Recovery 规则

1. rollback 后必须记录 `RolledBack` 状态。
2. 需要人工介入的对象必须进入 `Blocked` 或等价状态，不得继续自动消费。

---

## 九、Source Sync 与外部源边界

### 9.1 Sync 执行规则

1. 外部源同步必须先形成合法 `KnowledgeEntry / KnowledgeDocument`，再进入 pipeline。
2. 跟随源更新不得直接改写 chunk 索引。
3. 同步任务必须显式绑定 `sync_mode` 和 `source_ref`。

### 9.2 用户控制边界

1. 未经用户启用的外部源不得自动进入检索范围。
2. `SyncMode::Blocked` 对象不得被后台任务继续刷新。

---

## 十、错误码建议

| 错误码 | 含义 |
|---|---|
| `E_KB_SOURCE_INVALID` | 来源非法或缺少 source_ref |
| `E_KB_PERSIST_FAILED` | 文档库存储失败 |
| `E_KB_PARSE_FAILED` | 解析失败 |
| `E_KB_CHUNK_FAILED` | 分块失败 |
| `E_KB_INDEX_FAILED` | 索引失败 |
| `E_KB_REFERENCE_QUALIFY_FAILED` | 引用资格判定失败 |
| `E_KB_ACTIVE_SWITCH_FAILED` | active version 切换失败 |
| `E_KB_DELETE_COMMIT_FAILED` | 删除提交失败 |
| `E_KB_REBUILD_FAILED` | 重建失败 |

---

## 十一、TypeScript 调用示例

```ts
await invoke("ingest_knowledge_document", {
  workspacePath,
  kbId,
  folderId,
  displayName,
  sourceType: "workspace_file",
  sourceRef: filePath,
  ingestionMode: "snapshot",
  syncMode: "none"
});
```

---

## 十二、验收标准

1. ingestion / replace / delete / rebuild / metadata reindex 均有明确阶段和状态回写。
2. active version switch 只有唯一合法路径。
3. retry / rollback / recovery 条件明确。
4. 外部同步链无法绕过 execution pipeline。

---

## 十三、来源映射

1. `A-AST-M-T-03_Binder知识库技术主控文档.md`
2. `A-AST-M-T-04_Binder知识库对象与状态机规范.md`
3. `A-AST-M-T-05_Binder知识库检索与引用协议.md`
4. `A-AST-M-D-03_Binder知识库模块描述文档.md`
