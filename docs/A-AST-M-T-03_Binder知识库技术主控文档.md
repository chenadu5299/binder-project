# Binder知识库技术主控文档

## 文档头

- 结构编码：`AST-M-T-03`
- 文档属性：`主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库技术主控文档 / 技术机制、协议与落地承接总控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `AG-M-T-04`, `WS-M-D-01`, `AST-M-D-01`, `AST-M-D-02`, `AST-M-D-03`, `AST-M-P-01`, `AST-M-T-02`, `TMP-M-D-01`
- 直接承接：`AST-M-D-03`, `AST-M-T-02`
- 接口耦合：`AG-M-T-04`, `AST-M-P-01`, `WS-M-D-01`, `AST-M-D-01`, `TMP-M-D-01`
- 汇聚影响：`AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `AST-M-T-08`
- 扩散检查：`AST-M-D-02`, `AST-M-P-01`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `AST-M-T-08`
- 使用边界：`定义知识库技术主链、协议总控、状态机总览与专项分工；不替代专项文档的细节冻结`
- 变更要求：`修改本文后，必须复核：AST-M-D-03 / AST-M-T-02 / AST-M-D-02 / AST-M-P-01 / AST-M-T-04~08`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库技术主控  
> 上游主控：`A-AST-M-D-03_Binder知识库模块描述文档.md`、`A-AST-M-D-02_Binder Agent知识库协同主控文档.md`  
> 技术基础：`A-AST-M-T-02_知识库机制.md`、`A-AST-M-P-01_上下文注入.md`  
> 专项拆分：`A-AST-M-T-04_Binder知识库对象与状态机规范.md`、`A-AST-M-T-05_Binder知识库检索与引用协议.md`、`A-AST-M-T-06_Binder知识库导入与同步执行规范.md`、`A-AST-M-T-07_Binder知识库自动检索协同规范.md`、`A-AST-M-T-08_Binder知识库扩展边界规范.md`

---

## 一、文档定位与控制权威

本文是 Binder 知识库体系的**技术总控文档**。

本文负责：

1. 把 `A-AST-M-D-03` 的模块级边界落成技术主链。
2. 把 `A-AST-M-T-02` 的机制纲要扩成可执行的技术控制面。
3. 建立行为闭环、状态机、协议、执行链、失败恢复与扩展边界之间的总映射。
4. 为后续实现文档、开发计划、代码实现提供统一入口。

本文不替代：

1. `A-AST-M-D-03` 的模块定位与设计否决主语义。
2. `A-AST-M-D-02` 的知识库协同优先级裁定。
3. `A-AST-M-P-01` 的上下文注入顺序与预算裁定。
4. `A-AST-M-T-04~08` 的专项冻结细则。

---

## 二、冻结前提与不可改写约束

以下约束已由上游文档冻结，本文只允许承接，不得改写：

1. 知识库是用户主导的文档级知识资产。
2. AI 不得默认自动把当前生成内容写入知识库。
3. 知识库默认只在层次三承接。
4. 用户显式引用优先于自动检索。
5. 自动检索知识库只做补强，不得覆盖当前文档事实与当前轮状态。
6. 知识库必须与记忆库、模板库、当前轮 artifact 分层治理。
7. workspace 文件系统不等于知识库。
8. 项目文档不默认等于知识库条目。
9. 知识库不能被偷换成“向量数据库 + 聊天问答”。
10. 知识库不能提前被改造成企业搜索平台。
11. 任何未来扩展都不能绕开知识库对象模型与主执行链。

---

## 三、规则编号体系

本文采用以下规则域：

| 规则域 | 含义 | 主落点 |
|---|---|---|
| `KT-CORE-*` | 知识库技术主控总规则 | 本文 |
| `KT-OBJ-*` | 对象、字段语义、状态机规则 | `AST-M-T-04` |
| `KT-RET-*` | 检索、引用、溯源、稳定性规则 | `AST-M-T-05` |
| `KT-ING-*` | 导入、替换、删除、重建、同步执行链规则 | `AST-M-T-06` |
| `KT-CTX-*` | 自动检索与上下文协同规则 | `AST-M-T-07` |
| `KT-EXT-*` | 扩展边界与外部源接入规则 | `AST-M-T-08` |

### 3.1 主控规则矩阵

| 规则ID | 含义 | 承接来源 | 落点文档 | 扩散检查 |
|---|---|---|---|---|
| `KT-CORE-001` | 所有知识对象必须经过统一对象模型建模 | `AST-M-D-03` §5 | 本文 / `AST-M-T-04` | `AST-M-T-06`, `AST-M-T-08` |
| `KT-CORE-002` | 所有写入必须经过 ingestion pipeline | `AST-M-D-03` §5.8/§7.7/§9 | 本文 / `AST-M-T-06` | `AST-M-T-08` |
| `KT-CORE-003` | active version 是引用与检索的唯一版本真源 | `AST-M-D-03` §5.10/§6.2 | 本文 / `AST-M-T-04` / `AST-M-T-05` | `AST-M-T-06` |
| `KT-CORE-004` | 检索结果必须具备稳定 provenance 与可引用资格判定 | `AST-M-D-03` §5.11/§6.6 | 本文 / `AST-M-T-05` | `AST-M-P-01`, `AST-M-T-07` |
| `KT-CORE-005` | 自动检索不得覆盖当前文档事实与显式引用 | `AST-M-D-02` / `AST-M-D-03` | 本文 / `AST-M-T-07` | `AST-M-P-01` |
| `KT-CORE-006` | 外部扩展不得绕过对象模型和主执行链 | `AST-M-D-03` §7.7/§9 | 本文 / `AST-M-T-08` | `AST-M-T-06` |

---

## 四、知识库技术总体架构

知识库技术架构采用固定分层：

1. **入口层**：上传文档、工作区显式存入、未来外部源同步入口。
2. **对象层**：`KnowledgeBase / KnowledgeFolder / KnowledgeEntry / KnowledgeDocument / KnowledgeChunk`。
3. **存储层**：
   - 文档库：保存原始文档与版本元数据。
   - 检索库：保存 chunk、倒排索引、元数据索引、可选向量/重排索引。
4. **执行链层**：ingestion、replace、delete、metadata reindex、rebuild、retry、rollback。
5. **消费层**：检索、引用、注入、打开原文、风险暴露、观测事件。
6. **协同层**：与 workspace、Agent、记忆库、模板库、构建模式的接口边界。

### 4.1 总体数据流

```text
用户上传 / 显式存入 / 外部同步入口
  -> 入口校验
  -> 对象建模（kb/folder/entry/document）
  -> 文档库存储
  -> 解析 / 分块 / 索引
  -> chunk 可引用资格判定
  -> query_knowledge_base
  -> chunk hit / entry aggregate / document trace
  -> 引用 / 自动注入 / 打开原文
```

### 4.2 技术边界

1. 入口层只负责接收来源与参数，不决定协同优先级。
2. 对象层只定义资产身份与状态，不直接处理 prompt 拼接。
3. 检索层只返回知识结果，不直接决定是否覆盖当前文档。
4. 上下文消费层只按 `AST-M-P-01` 和 `AST-M-T-07` 消费结果，不改写对象语义。

---

## 五、核心对象模型与技术语义总览

知识库技术主链的最小对象集合如下：

| 对象 | 技术职责 | 专项文档 |
|---|---|---|
| `KnowledgeBase` | 知识容器、owner/workspace 边界、可见性根 | `AST-M-T-04` |
| `KnowledgeFolder` | 分类层级、归属关系、管理结构 | `AST-M-T-04` |
| `KnowledgeEntry` | 用户可见条目、来源、验证、活跃版本 | `AST-M-T-04` |
| `KnowledgeDocument` | 原始文档版本、解析/索引状态、版本切换真源 | `AST-M-T-04` |
| `KnowledgeChunk` | 检索命中单位、引用定位单位、注入证据单位 | `AST-M-T-04` / `AST-M-T-05` |

### 5.1 必须升级为控制语义的字段

以下字段在 Binder 中不是“可有可无的 metadata”，而是技术控制点：

1. `source_type / source_ref`
2. `ingestion_mode / sync_mode`
3. `verification_status`
4. `visibility_scope / access_policy`
5. `active_version_id`
6. `provenance`
7. `deletion_status`
8. `retrieval_state`

它们分别控制：

1. 来源合法性与入口边界。
2. 同步权、更新权与执行链归属。
3. 排序权重、引用可信度、注入风险标记。
4. 自动检索资格与可见性边界。
5. 版本切换真源与引用稳定性。
6. 溯源完整度与审计能力。
7. 删除、恢复、下线与失效语义。
8. 能否检索、能否引用、能否自动注入。

---

## 六、状态机总览

知识库技术主链必须同时维护以下状态面：

1. **对象状态**：entry/document/chunk 当前处于何种生命周期。
2. **执行状态**：ingestion/replace/delete/rebuild 目前处于哪个阶段。
3. **资格状态**：一个对象能否被检索、引用、自动注入。
4. **一致性状态**：文档库与检索库是否仍处于一致视图。

### 6.1 状态机绑定原则

1. 行为闭环必须能映射到具体状态迁移。
2. 状态迁移必须能映射到存储更新。
3. 存储更新必须能映射到接口返回与观测事件。
4. 任一环节缺状态位，视为机制未闭合。

### 6.2 最小状态集合

| 主题 | 最小状态语义 | 专项文档 |
|---|---|---|
| 版本状态 | `draft / stored / parsing / indexing / ready / superseded / deleted / failed` | `AST-M-T-04` |
| 验证状态 | `unverified / system_checked / user_verified / rejected` | `AST-M-T-04` |
| 删除状态 | `active / pending_delete / deleted / archived` | `AST-M-T-04` |
| 检索状态 | `not_indexed / indexed / reference_ready / suppressed / unavailable` | `AST-M-T-04` |
| 同步状态 | `manual / linked / snapshot / external_sync / sync_blocked` | `AST-M-T-04` |

---

## 七、核心处理链总览

### 7.1 导入链

```text
request received
  -> source validation
  -> object creation
  -> raw document persist
  -> parse
  -> chunk
  -> index
  -> reference qualification
  -> entry ready
```

### 7.2 替换链

```text
replace requested
  -> new document version persist
  -> parse / chunk / index new version
  -> validate new version reference readiness
  -> switch active_version_id
  -> mark old version superseded
```

### 7.3 删除链

```text
delete requested
  -> pending_delete state writeback
  -> disable reference_ready
  -> remove retrieval data
  -> remove or archive document data
  -> deleted state commit
```

### 7.4 移动 / 重命名链

```text
metadata change requested
  -> validate target scope
  -> update display / folder relation
  -> optional metadata reindex
  -> emit consistent result
```

### 7.5 检索 / 引用 / 注入链

```text
task query formed
  -> query_knowledge_base
  -> chunk hits
  -> entry aggregation
  -> document trace
  -> citation / injection packaging
  -> context consume or user reference consume
```

---

## 八、检索与引用协议总览

### 8.1 查询协议原则

1. 查询必须显式带 `workspace_path`。
2. 查询范围必须明确：`selected_kb / selected_folder / workspace_all / explicit_entry_ids`。
3. 查询意图必须可区分：`recall / citation / augmentation`。
4. 查询策略必须可观测：`lexical / hybrid / rerank_enabled / verified_only`。

### 8.2 结果协议原则

结果必须同时包含三层视图：

1. `chunk`：命中内容与定位锚点。
2. `entry`：用户可理解聚合视图。
3. `document`：原始证据与 active version 视图。

### 8.3 引用与注入协议原则

1. 引用对象必须指向稳定 `chunk_id / entry_id / document_id / version_id`。
2. 注入对象必须带 `source_label / provenance / verification_status / risk_flags`。
3. 若结果缺少 provenance 或 reference_ready 资格，不得进入默认引用/注入链。

详细冻结见：`A-AST-M-T-05_Binder知识库检索与引用协议.md`

---

## 九、稳定性与一致性约束

### 9.1 命中稳定性

1. 同一查询、同一 scope、同一 active version 集合下，结果必须相对稳定。
2. 排序变化必须可解释，且归因于版本、验证、可见性、索引或策略变化。

### 9.2 引用稳定性

1. 历史引用必须能定位其当时指向的版本。
2. 版本切换后，旧引用不得被静默改写为新版本内容。

### 9.3 双库一致性

1. 文档库与检索库视图不得长期分裂。
2. 若执行链中断，系统必须能判定对象是 `rollback_needed`、`retryable` 还是 `blocked`。

### 9.4 冲突裁决

1. chunk 冲突不能直接合并为单一事实。
2. entry 冲突优先按显式引用、当前文档、verification、version、provenance 裁决。

详细冻结见：`AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`

---

## 十、错误恢复与重建机制

错误恢复遵循统一原则：

1. 失败可暴露，主流程可继续。
2. active version 不得在失败链中被错误切换。
3. 删除链失败不得留下“文档已删、索引仍可引用”的悬挂状态。
4. 重建任务必须可重试、可阻断、可观测。

### 10.1 最小失败类型

1. `source_invalid`
2. `document_store_failed`
3. `parse_failed`
4. `chunk_failed`
5. `index_failed`
6. `reference_qualification_failed`
7. `active_version_switch_failed`
8. `delete_commit_failed`
9. `metadata_reindex_failed`

### 10.2 恢复模式

1. `retry`：阶段可重试。
2. `rollback`：回退到旧 active version 或旧 metadata 视图。
3. `rebuild`：重建 chunk/index 视图。
4. `block`：对象退出自动检索和默认引用。

详细冻结见：`A-AST-M-T-06_Binder知识库导入与同步执行规范.md`

---

## 十一、扩展接口边界

知识库允许预留接口，但不允许越界。

### 11.1 允许的扩展

1. workspace 文件的显式存入。
2. 外部知识源映射为合法知识对象。
3. 构建模式和讨论构建消费知识结果。
4. 未来混合检索与重排增强。

### 11.2 不允许的扩展

1. 外部源绕过对象模型直接写检索库。
2. 外部源默认进入自动检索范围。
3. 扩展接口削弱用户主导和显式引用优先。
4. 以连接器需求反向改写本地知识资产语义。

详细冻结见：`A-AST-M-T-08_Binder知识库扩展边界规范.md`

---

## 十二、设计否决条件

以下任一情况成立，必须直接否决技术设计：

1. 任何实现允许 AI 默认写入知识库。
2. 任何实现允许当前轮 artifact 直接落知识库主链。
3. 任何实现允许自动检索结果覆盖当前文档事实或显式引用。
4. 任何实现把知识库当作任务状态恢复层。
5. 任何实现允许外部同步链绕过 entry/document 对象建模与 ingestion pipeline。
6. 任何实现把 workspace 文件默认视为知识库条目。
7. 任何实现把知识库主链改造为企业统一搜索平台。

---

## 十三、验收标准

技术文档体系合格的最低标准是：

1. 能把行为闭环映射到对象状态机。
2. 能把状态机映射到接口与执行阶段。
3. 能把接口映射到存储结构与版本真源。
4. 能明确失败时的 retry / rollback / rebuild 规则。
5. 能明确 query/result/citation/injection payload 结构。
6. 能明确自动检索与显式引用的边界。
7. 能明确未来扩展接口的合法路径与否决项。

---

## 十四、与专项文档映射表

| 文档 | 负责什么 | 不负责什么 |
|---|---|---|
| `AST-M-T-04` | 五对象技术定义、状态语义、状态机、不变量 | 查询协议、ingestion 执行链细节 |
| `AST-M-T-05` | query/result/citation/injection 协议、稳定性与失效语义 | 执行阶段回写、同步策略 |
| `AST-M-T-06` | ingestion/replace/delete/rebuild/retry/rollback 主链 | 上下文优先级裁定 |
| `AST-M-T-07` | 自动检索触发、降级、风险标记、上下文消费 | 对象建模、外部源对象映射 |
| `AST-M-T-08` | 外部源、扩展接口、用户控制边界、否决项 | 检索排序和引用 payload 细节 |

---

## 十五、关键点代码示例

### 15.1 Rust 服务主接口草案

```rust
pub trait KnowledgeService {
    fn ingest(&self, req: IngestKnowledgeRequest) -> Result<IngestJobAccepted, KnowledgeError>;
    fn replace_document(&self, req: ReplaceKnowledgeDocumentRequest) -> Result<ReplaceJobAccepted, KnowledgeError>;
    fn delete_entry(&self, req: DeleteKnowledgeEntryRequest) -> Result<DeleteJobAccepted, KnowledgeError>;
    fn query(&self, req: QueryKnowledgeBaseRequest) -> Result<QueryKnowledgeBaseResponse, KnowledgeError>;
    fn rebuild(&self, req: RebuildKnowledgeIndexRequest) -> Result<RebuildJobAccepted, KnowledgeError>;
}
```

### 15.2 TypeScript 前端接口草案

```ts
export interface KnowledgeModuleApi {
  ingest(req: IngestKnowledgeRequest): Promise<IngestJobAccepted>;
  replaceDocument(req: ReplaceKnowledgeDocumentRequest): Promise<ReplaceJobAccepted>;
  deleteEntry(req: DeleteKnowledgeEntryRequest): Promise<DeleteJobAccepted>;
  query(req: QueryKnowledgeBaseRequest): Promise<QueryKnowledgeBaseResponse>;
  rebuild(req: RebuildKnowledgeIndexRequest): Promise<RebuildJobAccepted>;
}
```

---

## 十六、来源映射

1. `A-AST-M-D-03_Binder知识库模块描述文档.md`
2. `A-AST-M-T-02_知识库机制.md`
3. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
4. `A-AST-M-P-01_上下文注入.md`
5. `A-AG-M-D-01_Binder Agent能力描述文档.md`
6. `A-AG-M-T-04_Binder Agent技术主控文档.md`
7. `A-WS-M-D-01_workspace工作台协同主控文档.md`
8. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
9. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
