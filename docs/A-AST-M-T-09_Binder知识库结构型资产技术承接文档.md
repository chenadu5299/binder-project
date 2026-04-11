# Binder知识库结构型资产技术承接文档

## 文档头

- 结构编码：`AST-M-T-09`
- 文档属性：`专项主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库结构型资产技术承接文档 / 将“结构型知识资产 / 结构型文档样本”落到知识库对象、协议、执行链与运行时消费`
- 上游约束：`AST-M-S-06`, `AST-M-D-03`, `AST-M-D-02`, `AST-M-T-02`, `AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `AST-M-T-08`, `AST-M-P-01`, `TMP-M-D-01`, `TMP-M-T-01`, `AG-M-T-04`, `WS-M-D-01`
- 直接承接：`AST-M-S-06`, `AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-07`
- 接口耦合：`AST-M-P-01`, `TMP-M-D-01`, `TMP-M-T-01`, `AG-M-T-04`, `WS-M-D-01`
- 汇聚影响：`src-tauri/src/services/knowledge`, `src-tauri/src/services/context_manager.rs`, `src-tauri/src/commands/ai_commands.rs`, `src/types/knowledge.ts`, `src/types/reference.ts`, `src/components/FileTree/KnowledgeSection.tsx`, `src/components/Chat`
- 扩散检查：`AST-M-D-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `TMP-M-D-01`, `TMP-M-T-01`, `AST-M-P-01`
- 使用边界：`本文只定义结构型知识资产的技术承接方案；不重写知识库主控，不重写模板库主控，不定义模板执行器，不推进 connector / external source / complex RAG`
- 变更要求：`修改本文后，必须复核：AST-M-S-06 / AST-M-T-04 / AST-M-T-05 / AST-M-T-06 / AST-M-T-07 / TMP-M-D-01 / TMP-M-T-01 / AST-M-P-01`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库结构型资产技术专项  
> 上游主控：`A-AST-M-S-06_Binder知识库结构型资产补充文档.md`、`A-AST-M-T-03_Binder知识库技术主控文档.md`  
> 协议基础：`A-AST-M-T-04_Binder知识库对象与状态机规范.md`、`A-AST-M-T-05_Binder知识库检索与引用协议.md`、`A-AST-M-T-07_Binder知识库自动检索协同规范.md`  
> 边界对照：`A-TMP-M-D-01_Binder Agent模板协同主控文档.md`、`A-TMP-M-T-01_模板机制.md`

---

## 一、文档定位

本文是 Binder 知识库中“结构型知识资产”能力的技术承接文档。

本文负责：

1. 把 `AST-M-S-06` 中冻结的结构型知识资产结论落到技术对象、字段、metadata、query、injection 与自动检索边界。
2. 定义当前知识库代码实现如何以最小侵入方式承接 `structure_asset`。
3. 明确哪些扩展位可复用，哪些现有实现不能直接复用，避免把结构型资产重新抹平成普通知识文档或 workflow template。

本文不替代：

1. `A-AST-M-S-06_Binder知识库结构型资产补充文档.md` 的概念与边界主控。
2. `A-AST-M-D-03_Binder知识库模块描述文档.md` 的知识库模块定位。
3. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` 与 `A-TMP-M-T-01_模板机制.md` 的工作流模板主控。
4. `A-AST-M-T-04~08` 的既有专项冻结规则。

---

## 二、上下游关系与控制权威

### 2.1 上游控制来源

本专项的上游控制来自以下文档：

1. `AST-M-S-06`
   - 冻结结构型知识资产的概念、否决句、强边界。
2. `AST-M-D-03` / `AST-M-D-02`
   - 冻结知识库作为用户主导文档级知识资产的主定位，以及显式引用高于自动检索的协同边界。
3. `AST-M-T-04` / `AST-M-T-05` / `AST-M-T-06` / `AST-M-T-07`
   - 冻结对象、协议、执行链与自动检索规则。
4. `TMP-M-D-01` / `TMP-M-T-01`
   - 冻结模板库继续只承接工作流模板。

### 2.2 本文承接但不改写的规则

本文只承接，不得改写以下规则：

1. 知识库仍然是用户主导的文档级知识资产系统。
2. 结构型知识资产不新增第六对象。
3. `structure_asset` 不得进入事实知识补强、证据链和 citation 体系。
4. workflow template 不并入知识库。
5. `structure_asset` 默认不参与普通事实检索和默认自动补强。

### 2.3 本文影响的工程模块

本文直接影响以下实现模块：

1. `src-tauri/src/services/knowledge/types.rs`
2. `src-tauri/src/services/knowledge/repository.rs`
3. `src-tauri/src/services/knowledge/ingestion_service.rs`
4. `src-tauri/src/services/knowledge/query_service.rs`
5. `src-tauri/src/services/context_manager.rs`
6. `src-tauri/src/commands/ai_commands.rs`
7. `src/types/knowledge.ts`
8. `src/types/reference.ts`
9. `src/services/knowledge/knowledgeService.ts`
10. `src/components/FileTree/KnowledgeSection.tsx`
11. `src/components/Chat/*`

---

## 三、规则映射表

| 规则编号 | 规则内容 | 来源文档 | 落点模块 | 扩散检查 |
|---|---|---|---|---|
| `SA-CORE-001` | 不新增第六对象，结构型资产必须通过现有五对象主链承接 | `AST-M-S-06` §5.1 | `knowledge/types.rs`, `repository.rs`, `ingestion_service.rs` | `AST-M-T-04`, `AST-M-T-06` |
| `SA-CORE-002` | 系统必须存在稳定资产类型位，用于区分 `standard` 与 `structure_asset` | `AST-M-S-06` §5.2 | `types.rs`, `repository.rs`, `knowledge.ts` | `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-07` |
| `SA-CORE-003` | 资产类型位必须影响 ingestion、query、augmentation、UI 与自动检索过滤 | `AST-M-S-06` §5.2 | `ingestion_service.rs`, `query_service.rs`, `context_manager.rs`, `KnowledgeSection.tsx` | `AST-M-T-05`, `AST-M-T-07`, `AST-M-P-01` |
| `SA-OBJ-001` | 结构型资产 metadata 必须存在统一 schema，并进入 active document metadata | `AST-M-S-06` §5.3 | `types.rs`, `ingestion_service.rs`, `repository.rs` | `AST-M-T-04`, `AST-M-T-06` |
| `SA-OBJ-002` | `structure_asset` 沿用现有 version / provenance / replace / delete 主链 | `AST-M-S-06` §5.4 | `ingestion_service.rs`, `repository.rs` | `AST-M-T-04`, `AST-M-T-06` |
| `SA-RET-001` | 普通知识检索与结构参考检索必须分流，禁止统一召回后再让模型理解 | `AST-M-S-06` §6.1, §6.5 | `query_service.rs`, `knowledge.ts` | `AST-M-T-05`, `AST-M-T-07` |
| `SA-RET-002` | `structure_asset` 默认不参与普通事实检索 | `AST-M-S-06` §6.5 | `query_service.rs`, `ai_commands.rs` | `AST-M-T-05`, `AST-M-T-07` |
| `SA-RET-003` | `structure_asset` 不得作为 citation/evidence 候选 | `AST-M-S-06` §6.5, §7.2.1 | `repository.rs`, `query_service.rs`, `types.rs`, `knowledge.ts` | `AST-M-T-05` |
| `SA-CTX-001` | `structure_asset` 进入上下文时必须标记为 `structure_reference` | `AST-M-S-06` §7.3 | `types.rs`, `knowledge.ts`, `context_manager.rs`, `ai_commands.rs` | `AST-M-P-01`, `AST-M-T-07` |
| `SA-CTX-002` | `structure_asset` 不得进入事实冲突判断，不得伪装为 verified fact | `AST-M-S-06` §7.2.1 | `query_service.rs`, `context_manager.rs` | `AST-M-T-05`, `AST-M-T-07` |
| `SA-CTX-003` | `structure_asset` 默认不参与自动检索/自动注入；只有显式引用或明确结构任务时才允许例外候选 | `AST-M-S-06` §7.6 | `context_manager.rs`, `ai_commands.rs`, `query_service.rs` | `AST-M-T-07`, `AST-M-P-01` |
| `SA-BND-001` | workflow template 不得并入知识库 | `AST-M-S-06` §4.2 | `knowledge/*`, `reference.ts`, `KnowledgeSection.tsx` | `TMP-M-D-01`, `TMP-M-T-01` |
| `SA-BND-002` | 结构型资产不是模板执行器、变量模板或强槽位绑定器 | `AST-M-S-06` §3.2, §9.2 | 技术方案总则 | `TMP-M-T-01`, `AG-M-T-04` |

---

## 四、技术总体方案

### 4.1 总体承接原则

结构型知识资产采用以下承接路径：

1. 不新增第六对象。
2. 通过现有 `KnowledgeEntry` 承接资产类型位。
3. 通过现有 `KnowledgeDocument.metadata_json` 承接结构 metadata。
4. 通过 query 请求分流与 injection role 分流，完成运行时语义区分。
5. 通过当前显式引用主链优先落地，自动检索保持默认关闭或强限制。

### 4.2 对当前代码的最小侵入式扩展路径

当前代码里已有两个可复用扩展位：

1. `knowledge_entries.entry_type`
2. `knowledge_documents.metadata_json`

但这两个扩展位不能被直接视为“已经支持结构型资产”，因为：

1. 当前 `entry_type` 在 `ingestion_service.rs` 中被写成 `"snapshot"`，语义上更接近导入方式残留，而不是资产类型位。
2. 当前 `metadata_json` 虽然可写，但还没有结构型资产的稳定 schema，也没有进入 query / injection 规则判断。

因此本专项的最小改造原则是：

1. **新增稳定资产类型位，不复用当前 `entry_type` 的语义。**
2. `metadata_json` 可以继续复用，但必须建立 `structure_asset` 的稳定 metadata schema。
3. `intent` 继续保留 `recall | citation | augmentation` 语义，不直接改写成 `content | structure_reference`。
4. 新增独立的 `query_mode` 或等价字段，用于区分内容检索与结构参考检索。

### 4.3 当前实现基线判断

基于当前代码，实现基线如下：

1. `types.rs`
   - 已有 `KnowledgeEntry.entry_type`、`KnowledgeDocument.metadata_json`、`KnowledgeInjectionSlice`。
   - 尚无 `KnowledgeAssetKind`、`source_role`、结构 metadata 类型。
2. `repository.rs`
   - 已有 schema 迁移、metadata/provenance 读写、citation/injection 构造。
   - 当前 `build_citation` 和 `build_injection_slice` 默认把所有条目都当成事实知识对象。
3. `query_service.rs`
   - 已有 `intent`、`strategy`、automatic access filter、dedupe。
   - 尚无 asset kind filter、query mode、structure-specific ranking。
4. `context_manager.rs`
   - 已能保持 `KnowledgeInjectionSlice[]` 结构化到最终消费点。
   - 但尚无 `structure_reference` 专用格式化逻辑。
5. `ai_commands.rs`
   - 已有知识库自动检索决策与统一 query 入口。
   - 但默认会把自动检索视为普通知识补强，没有结构型任务分流。
6. 前端
   - 已有知识库列表、显式引用、知识注入展示链。
   - 但没有 `structure_asset` 的类型 badge、reference role 展示或显式“结构参考”语义。

---

## 五、对象模型扩展方案

### 5.1 核心结论

结构型知识资产通过现有 `KnowledgeEntry` 承接，不新增平行对象。

必须新增稳定资产类型位：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeAssetKind {
    Standard,
    StructureAsset,
}
```

### 5.2 字段落位

#### 5.2.1 Entry 层新增字段

建议新增到 `knowledge_entries`：

1. `asset_kind TEXT NOT NULL DEFAULT 'standard'`

语义：

1. `standard`
   - 普通知识资产
2. `structure_asset`
   - 结构型知识资产

该字段是强控制字段，必须进入：

1. repository 映射
2. query 过滤
3. injection role 判断
4. UI 展示
5. 自动检索过滤

#### 5.2.1.1 强制检查点

`asset_kind` 不是被动标签，而是强控制位。

以下检查点必须存在，且每个路径都必须显式检查 `asset_kind`：

1. ingestion validation
   - 校验 `asset_kind` 与请求 payload 是否一致。
2. query filter
   - 在进入 SQL/检索候选前先按 `asset_kind` 分流。
3. citation 构建
   - `structure_asset` 必须直接阻断 citation 构建。
4. injection 构建
   - `structure_asset` 必须走 `structure_reference` 分支，而不是事实知识分支。
5. context_manager 渲染
   - 必须按 `source_role` 区分结构参考与事实知识的渲染。
6. auto retrieval trigger
   - 自动检索决策和自动 query 请求都必须检查 `asset_kind` 过滤。
7. 前端展示
   - 列表、引用、消息展示都必须读取并展示 `asset_kind`，不得把结构型资产渲染成普通知识来源。

若以上任一检查点缺失，则视为结构型资产能力未闭合，不得判定为已完成承接。

#### 5.2.2 Document 层 metadata schema

结构型资产的 metadata 沿用 `knowledge_documents.metadata_json`，但必须符合稳定 schema：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeStructureMetadata {
    pub document_form: String,
    pub structure_purpose: String,
    pub applicable_scenarios: Vec<String>,
    pub section_outline_summary: String,
    pub slot_hints: Vec<String>,
    pub source_nature: String,
    pub structure_tags: Option<Vec<String>>,
    pub style_scope: Option<String>,
    pub usage_notes: Option<String>,
    pub sample_origin: Option<String>,
}
```

### 5.3 必填与可选

MVP 必填项：

1. `document_form`
2. `structure_purpose`
3. `applicable_scenarios`
4. `section_outline_summary`
5. `slot_hints`
6. `source_nature`

MVP 可选项：

1. `structure_tags`
2. `style_scope`
3. `usage_notes`
4. `sample_origin`

### 5.4 当前 `entry_type` 的处理

当前代码中的 `entry_type` 不能直接改造成 `asset_kind`，原因是：

1. 它当前被写入 `"snapshot"`。
2. 它的现有语义已与 `sync_mode / source_type` 部分重叠。

技术处理建议：

1. `entry_type` 暂不作为新规则控制字段。
2. 新增 `asset_kind` 作为真正的稳定控制位。
3. `entry_type` 后续可保留为兼容字段，或在未来迁移中降级为历史兼容字段。

---

## 六、ingestion 与存储方案

### 6.1 用户入口

用户将一份文档标记为结构型知识资产的最小入口包括：

1. 上传/存入知识库时显式选择“结构参考资产”
2. workspace snapshot 存入知识库时显式选择“结构参考资产”
3. 对已有知识条目执行“转为结构型资产”时，通过 replace 或 metadata update 完成

### 6.2 请求对象扩展

当前 `KnowledgeIngestRequest` / `KnowledgeReplaceRequest` / `KnowledgeWorkspaceSnapshotUpsertRequest` 需要增加：

```rust
pub struct KnowledgeIngestRequest {
    pub asset_kind: Option<KnowledgeAssetKind>,
    pub structure_metadata: Option<KnowledgeStructureMetadata>,
    // existing fields...
}
```

规则：

1. `asset_kind = standard` 时，`structure_metadata` 必须为空。
2. `asset_kind = structure_asset` 时，`structure_metadata` 必须存在，且 MVP 必填字段齐全。
3. 不允许只传 metadata 而不传 `asset_kind`，再靠后端猜测。

### 6.3 ingestion pipeline 处理规则

`AST-M-T-06` 的执行链不变，补的是 validate 与 persist 阶段约束：

1. `validate`
   - 校验 `asset_kind`
   - 若为 `structure_asset`，校验 metadata schema 完整性
2. `persist entry`
   - 写入 `asset_kind`
3. `persist document`
   - 将 `structure_metadata` 写入 `metadata_json`
4. `chunk/index`
   - 不改变主链，但后续 query 可读取 metadata 做 structure ranking
5. `ready`
   - 版本、provenance、replace/delete 逻辑沿用现有主链

### 6.4 metadata 入库示例

```rust
let document_metadata = match request.asset_kind.unwrap_or(KnowledgeAssetKind::Standard) {
    KnowledgeAssetKind::Standard => request.metadata.clone(),
    KnowledgeAssetKind::StructureAsset => Some(serde_json::to_value(
        request.structure_metadata.clone().expect("validated")
    )?),
};

tx.execute(
    "INSERT INTO knowledge_entries (..., asset_kind, ...)
     VALUES (..., ?asset_kind, ...)",
    params![asset_kind.as_str()],
)?;

tx.execute(
    "INSERT INTO knowledge_documents (..., metadata_json, ...)
     VALUES (..., ?metadata_json, ...)",
    params![serde_json::to_string(&document_metadata)?],
)?;
```

### 6.5 active version / provenance

结构型资产沿用当前知识库主链：

1. active version 仍然是唯一版本真源。
2. provenance 仍然绑定 document。
3. replace / delete / rebuild / rollback 仍按现有主链运行。

不得做的事情：

1. 不得为结构型资产单独造版本系统。
2. 不得绕过 ingestion pipeline 直接改 metadata 或直接写检索库。

---

## 七、检索协议方案

### 7.1 协议设计原则

当前 `AST-M-T-05` 中的 `intent = recall | citation | augmentation` 不应被重写，因为它控制的是输出协议用途。

结构型资产需要新增的是：

1. `query_mode`
2. `asset_kind_filter`

而不是改写既有 `intent` 语义。

### 7.2 请求扩展方案

推荐扩展为：

```rust
pub enum KnowledgeQueryMode {
    Content,
    StructureReference,
}

pub enum KnowledgeAssetKindFilter {
    Standard,
    StructureAsset,
    All,
}

pub struct KnowledgeQueryRequest {
    pub intent: Option<KnowledgeQueryIntent>,
    pub query_mode: Option<KnowledgeQueryMode>,
    pub asset_kind_filter: Option<KnowledgeAssetKindFilter>,
    pub structure_document_form: Option<String>,
    pub structure_purpose: Option<String>,
    // existing fields...
}
```

### 7.3 默认行为

默认规则必须写死：

1. `query_mode = content` 且未显式指定 filter 时，默认 `asset_kind_filter = standard`
2. `query_mode = structure_reference` 时，默认 `asset_kind_filter = structure_asset`
3. `intent = citation` 时，`asset_kind_filter` 不允许为 `structure_asset`
4. MVP 公共 query 接口默认不暴露 `All`

### 7.3.1 `All` 的限制性约束

`KnowledgeAssetKindFilter::All` 不是常规业务入口，只能视为受限维护模式保留位。

强限制如下：

1. `intent = citation` 时，禁止 `asset_kind_filter = all`
2. `intent = augmentation` 时，默认禁止 `asset_kind_filter = all`
3. `require_verified = true` 时，禁止 `asset_kind_filter = all`
4. MVP 前端与公共调用层不得暴露 `All`
5. 若未来保留 `All`，也只能用于内部列表、迁移校验、运营排查等非事实主链场景

若当前阶段不需要内部维护模式，工程实现可以直接不提供 `All`。

### 7.4 结构型资产排序

结构参考检索的 MVP 排序建议：

1. `document_form` 匹配优先
2. `structure_purpose` 匹配优先
3. `applicable_scenarios` overlap
4. `section_outline_summary` lexical overlap
5. title/source_ref lexical overlap

不应进入结构排序的因子：

1. 事实 verification boost
2. citation availability
3. fact conflict resolution

### 7.5 结果 payload 表达

建议给 query 结果补以下字段：

```rust
pub struct KnowledgeEntryHit {
    pub entry: KnowledgeEntry,
    pub asset_kind: KnowledgeAssetKind,
    pub source_role: String, // "fact_knowledge" | "structure_reference"
    pub structure_metadata: Option<KnowledgeStructureMetadata>,
    // existing fields...
}
```

`structure_asset` 的结果约束：

1. 可作为 entry/document 级参考结果返回。
2. 不得作为 citation 候选。
3. MVP 推荐不返回 `chunk_hits`。
4. 结构型资产默认只返回 entry/document 级结果。

这是推荐的主方案，因为 `chunk` 是天然证据粒度，保留 `chunk_hits` 容易让模型和前端误把结构样本当事实片段。

若未来必须保留 chunk 级片段，只能采用严格受限方案：

1. chunk 必须显式标记 `is_structure_snippet = true`
2. chunk 必须显式标记 `not_evidence = true`
3. chunk 不得附带 citation
4. chunk 不得进入事实冲突判断
5. chunk 只能用于结构预览，不得进入事实引用链

### 7.6 示例

结构参考显式查询：

```json
{
  "query": "周报 框架",
  "intent": "recall",
  "queryMode": "structure_reference",
  "assetKindFilter": "structure_asset",
  "limit": 5
}
```

事实检索：

```json
{
  "query": "active version citation provenance",
  "intent": "citation",
  "queryMode": "content",
  "assetKindFilter": "standard",
  "requireVerified": true
}
```

---

## 八、注入协议方案

### 8.1 当前协议缺口

当前 `KnowledgeInjectionSlice` 强绑定：

1. `citation`
2. `retrieval_mode`
3. `risk_flags`
4. `provenance`

这对事实知识注入成立，但对 `structure_asset` 不成立，因为：

1. `structure_asset` 不得生成 citation
2. `structure_asset` 的 role 是 `structure_reference`，不是 `fact_knowledge`

系统级否决句：

**`structure_asset` 在任何情况下不得参与事实知识推理链，包括但不限于引用、验证、冲突判断与证据生成。**

### 8.2 扩展后的最小协议

建议改为：

```rust
pub enum KnowledgeSourceRole {
    FactKnowledge,
    StructureReference,
}

pub struct KnowledgeInjectionSlice {
    pub slice_id: String,
    pub entry_id: String,
    pub document_id: String,
    pub chunk_id: Option<String>,
    pub asset_kind: KnowledgeAssetKind,
    pub source_role: KnowledgeSourceRole,
    pub title: String,
    pub source_label: String,
    pub content: String,
    pub retrieval_mode: String,
    pub risk_flags: Vec<String>,
    pub citation: Option<KnowledgeCitation>,
    pub provenance: KnowledgeProvenance,
    pub structure_metadata: Option<KnowledgeStructureMetadata>,
    pub source_status: String,
    pub source_status_message: Option<String>,
}
```

### 8.3 强约束

1. `asset_kind = structure_asset` 时，`source_role` 必须为 `structure_reference`
2. `source_role = structure_reference` 时，`citation` 必须为 `None`
3. `source_role = structure_reference` 时，`risk_flags` 不得再使用事实证据风险语义作为主标签
4. workflow template 的注入协议不得复用这套结构参考协议

### 8.4 prompt/context 最小 payload

结构型资产进入 prompt/context 的最小 payload 应包括：

1. `source_role = structure_reference`
2. `asset_kind = structure_asset`
3. `title`
4. `document_form`
5. `structure_purpose`
6. `section_outline_summary`
7. `slot_hints`
8. `content` 或结构摘要内容
9. `provenance`

### 8.5 context_manager 保真规则

`context_manager.rs` 当前已经能保持 `KnowledgeInjectionSlice[]` 结构化直到最终 prompt 拼装点，这一能力应继续沿用。

需要补的是：

1. `build_knowledge_augmentation_prompt()` 根据 `source_role` 分开格式化
2. `fact_knowledge` 与 `structure_reference` 分开输出标签
3. 不得把 `structure_reference` 渲染成“证据来源”或“知识依据”

### 8.6 示例

```json
{
  "sliceId": "kis:kd_1:kcg_2",
  "entryId": "ke_1",
  "documentId": "kd_1",
  "assetKind": "structure_asset",
  "sourceRole": "structure_reference",
  "title": "周报范本",
  "sourceLabel": "知识库结构参考",
  "content": "建议结构：摘要 / 本周进展 / 风险 / 下周计划",
  "retrievalMode": "explicit",
  "riskFlags": [],
  "citation": null,
  "provenance": {
    "sourceType": "workspace_snapshot",
    "sourceRef": "docs/weekly_report.md",
    "workspacePath": "/workspace/demo",
    "snapshotMode": "snapshot",
    "checksum": "sha256:..."
  },
  "structureMetadata": {
    "documentForm": "weekly_report",
    "structurePurpose": "standardized_output",
    "applicableScenarios": ["周报", "项目同步"],
    "sectionOutlineSummary": "摘要 / 本周进展 / 风险 / 下周计划",
    "slotHints": ["本周目标", "风险项", "下周计划"],
    "sourceNature": "sample"
  }
}
```

---

## 九、自动检索与边界规则

### 9.1 MVP 默认规则

为了避免污染当前事实知识链，MVP 规则必须写死：

1. `structure_asset` 默认不参与普通事实补强。
2. `structure_asset` 默认不参与自动检索。
3. `structure_asset` 默认不参与自动注入。

这不是“暂时建议”，而是阶段冻结规则：

1. MVP：完全关闭 `structure_asset` 自动召回。
2. P2 及以后：只有在单独立项并冻结结构型自动召回规则后，才允许受控开启。

### 9.2 显式选择优先

MVP 首选路径是：

1. 用户在知识库列表中显式选择结构型资产
2. 通过 `@知识条目` 或拖拽进入引用链
3. 以 `structure_reference` 语义进入上下文

这是当前代码基础上最小、最稳的承接路径。

### 9.3 若未来放开自动召回的前提

若后续阶段要放开 `structure_asset` 自动召回，必须同时满足：

1. 当前任务类型明确为生成、改写或结构重组
2. 当前任务不是证据型、核验型、事实问答型任务
3. query mode 明确为 `structure_reference`
4. 注入结果仍只能进入 augmentation，且 `source_role = structure_reference`
5. 必须新增单独的观测与降级码，不能复用普通知识自动检索的成功口径

### 9.4 自动检索伪代码

```rust
fn resolve_asset_filter_for_auto_retrieval(task: &TaskSignal) -> KnowledgeAssetKindFilter {
    if task.is_evidence_task || task.is_fact_qa_task || task.is_verification_task {
        return KnowledgeAssetKindFilter::Standard;
    }

    if task.has_explicit_structure_reference {
        return KnowledgeAssetKindFilter::StructureAsset;
    }

    if task.is_generation_task || task.is_rewrite_task || task.is_structure_reorg_task {
        // MVP 仍建议默认返回 Standard，后续阶段再择机开放 StructureAsset 自动召回
        return KnowledgeAssetKindFilter::Standard;
    }

    KnowledgeAssetKindFilter::Standard
}
```

### 9.5 当前代码的最小改法

当前最小改法不是立刻做双路自动检索，而是：

1. 在 `ai_commands.rs` 发起自动 query 时默认加 `asset_kind_filter = standard`
2. 结构型资产仅通过显式引用路径进入
3. 把结构型自动召回作为后续扩展，而不是当前 MVP 主链

这样可以避免对现有 P1 自动检索主链做系统级返工。

---

## 十、前端/UI 最小承接

### 10.1 知识库列表

`KnowledgeSection.tsx` 需要最小补以下能力：

1. 条目 badge
   - `普通知识`
   - `结构参考`
2. 结构型资产的 preview 优先展示 `section_outline_summary`
3. 不把结构型资产的状态文案渲染成“证据来源”

### 10.2 显式选择路径

现有显式引用链已经存在：

1. `KnowledgeSection.tsx` 拖拽
2. `useMentionData.ts` 的 `@知识条目`
3. `buildKnowledgeReference()` 查询并构造 `KnowledgeBaseReference`

最小承接方案是：

1. 继续复用现有入口
2. 给 `KnowledgeBaseReference` 增加 `assetKind` 与 `sourceRole`
3. 若引用对象是结构型资产，则引用 UI 展示“结构参考”而不是“知识引用”

### 10.3 消息展示

`ChatMessages.tsx` 需要按 `sourceRole` 分开显示：

1. `fact_knowledge`
   - 知识补强
2. `structure_reference`
   - 结构参考

不得做的事情：

1. 不得把结构型资产与事实知识混成一个“知识库补强”列表且无角色区分。

### 10.4 前端误用保护

前端必须提供最小误用保护，避免用户把结构型资产误读为事实知识来源：

1. `structure_asset` 在列表和消息中必须显示为“结构参考”，不得显示为“知识来源”或“证据来源”
2. `structure_asset` 不参与“复制引用链接”或等价 citation 导出动作
3. `structure_asset` 不参与“引用跳转”或等价 evidence drill-down 动作
4. `structure_asset` 的交互文案应是“作为结构参考使用”，而不是“作为知识引用使用”

---

## 十一、当前代码改造点清单

### 11.1 Rust 侧必改文件

1. `src-tauri/src/services/knowledge/types.rs`
   - 新增 `KnowledgeAssetKind`
   - 新增 `KnowledgeStructureMetadata`
   - 扩展 `KnowledgeQueryRequest`
   - 扩展 `KnowledgeInjectionSlice`
2. `src-tauri/src/services/knowledge/repository.rs`
   - migration 增加 `asset_kind`
   - entry/document 映射
   - `build_citation()` 对 `structure_asset` 做强阻断
   - 新增 `build_structure_reference_slice()` 或在 `build_injection_slice()` 中按 `asset_kind` 分流
3. `src-tauri/src/services/knowledge/ingestion_service.rs`
   - ingest/replace/upsert 请求接收 `asset_kind + structure_metadata`
   - validate 结构 metadata
   - persist `asset_kind`
4. `src-tauri/src/services/knowledge/query_service.rs`
   - query mode / asset filter / structure ranking
   - `structure_asset` 排除 citation intent
5. `src-tauri/src/services/context_manager.rs`
   - 最终 prompt 组装按 `source_role` 分流
6. `src-tauri/src/commands/ai_commands.rs`
   - 自动检索默认加 `asset_kind_filter = standard`
   - 显式结构引用保留 `structure_reference` 语义

### 11.2 TypeScript 侧必改文件

1. `src/types/knowledge.ts`
   - 镜像 `KnowledgeAssetKind`
   - 镜像 `KnowledgeStructureMetadata`
   - 扩展 query / injection 类型
2. `src/types/reference.ts`
   - `KnowledgeBaseReference` 增加 `assetKind` / `sourceRole`
3. `src/services/knowledge/knowledgeService.ts`
   - 承接扩展后的请求/响应
4. `src/utils/knowledgeReference.ts`
   - 显式引用查询时保留 `assetKind` / `sourceRole`
5. `src/components/FileTree/KnowledgeSection.tsx`
   - 资产类型 badge 与结构摘要展示
6. `src/components/Chat/ChatMessages.tsx`
   - 结构参考与知识补强分开展示

### 11.3 目前不该动的模块

当前不建议动：

1. `KnowledgeFolder` 主链
2. source adapter / external source
3. rebuild / rollback 主链
4. hybrid retrieval 框架本身
5. 模板库 workflow 对象模型

这些都不是本专项的最小承接面。

---

## 十二、关键代码示例

### 12.1 Rust struct / enum 扩展

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeAssetKind {
    Standard,
    StructureAsset,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntry {
    pub id: String,
    pub knowledge_base_id: String,
    pub asset_kind: KnowledgeAssetKind,
    // existing fields...
}
```

### 12.2 TypeScript type 扩展

```ts
export type KnowledgeAssetKind = 'standard' | 'structure_asset';
export type KnowledgeSourceRole = 'fact_knowledge' | 'structure_reference';

export interface KnowledgeStructureMetadata {
  documentForm: string;
  structurePurpose: string;
  applicableScenarios: string[];
  sectionOutlineSummary: string;
  slotHints: string[];
  sourceNature: string;
  structureTags?: string[];
  styleScope?: string;
  usageNotes?: string;
  sampleOrigin?: string;
}
```

### 12.3 Query request 示例

```ts
export interface KnowledgeQueryRequest {
  query?: string | null;
  intent?: 'recall' | 'citation' | 'augmentation' | null;
  queryMode?: 'content' | 'structure_reference' | null;
  assetKindFilter?: 'standard' | 'structure_asset' | 'all' | null;
  requireVerified?: boolean | null;
}
```

### 12.4 Injection payload 示例

```ts
export interface KnowledgeInjectionSlice {
  sliceId: string;
  entryId: string;
  documentId: string;
  assetKind: KnowledgeAssetKind;
  sourceRole: KnowledgeSourceRole;
  title: string;
  sourceLabel: string;
  content: string;
  retrievalMode: 'manual_query' | 'explicit' | 'automatic';
  riskFlags: string[];
  citation?: KnowledgeCitation | null;
  provenance: KnowledgeProvenance;
  structureMetadata?: KnowledgeStructureMetadata | null;
}
```

### 12.5 自动检索过滤伪代码

```rust
if request.intent == Some(KnowledgeQueryIntent::Augmentation) {
    if request.asset_kind_filter.is_none() {
        request.asset_kind_filter = Some(KnowledgeAssetKindFilter::Standard);
    }
}
```

### 12.6 ingestion metadata 写入示例

```rust
fn validate_structure_metadata(
    asset_kind: &KnowledgeAssetKind,
    structure_metadata: &Option<KnowledgeStructureMetadata>,
) -> Result<(), KnowledgeServiceError> {
    if matches!(asset_kind, KnowledgeAssetKind::StructureAsset) && structure_metadata.is_none() {
        return Err(KnowledgeServiceError {
            code: KnowledgeErrorCode::InvalidInput,
            message: "structure_asset 缺少 structure_metadata".to_string(),
        });
    }
    Ok(())
}
```

---

## 十三、MVP 范围与否决项

### 13.1 MVP 做什么

本期 MVP 只做：

1. 在知识库对象模型中新增稳定 `asset_kind`
2. 为 `structure_asset` 建立稳定 metadata schema
3. 支持显式结构参考检索与显式结构参考注入
4. 前端列表与引用链可区分 `structure_asset`
5. 自动检索默认排除 `structure_asset`

### 13.2 本期不做什么

本期不做：

1. workflow template 并入知识库
2. 模板执行器
3. 变量替换模板系统
4. 结构型资产的复杂自动召回
5. 为结构型资产新建独立对象系统

### 13.3 必须否决的方案

以下方案必须直接否决：

1. 继续复用 `entry_type = "snapshot"` 作为结构型资产类型位
2. 把 `structure_asset` 混入 `intent = citation` 主链
3. 让 `structure_asset` 默认进入所有 automatic augmentation
4. 把 `structure_asset` 做成模板执行器或 workflow template 子类型
5. 用“统一召回 -> 再排序 -> 让模型自己判断”替代强分流

---

## 十四、验收口径

对象语义验收：

1. `asset_kind` 是否成为稳定控制字段
2. `structure_metadata` 是否有稳定 schema
3. `structure_asset` 是否沿用现有 version / provenance 主链

检索语义验收：

1. 普通知识检索是否默认排除 `structure_asset`
2. `structure_asset` 是否不能进入 citation/evidence 候选
3. 结构参考查询是否具备独立 query mode / filter

注入语义验收：

1. `structure_asset` 是否以 `structure_reference` 进入上下文
2. `citation` 是否对 `structure_asset` 置空或阻断
3. UI / prompt 是否区分结构参考与事实知识

边界验收：

1. workflow template 是否继续留在模板库
2. 结构型资产是否没有变成模板执行器
3. 自动检索是否没有被结构型资产污染

---

## 十五、来源映射

1. `A-AST-M-S-06_Binder知识库结构型资产补充文档.md`
2. `A-AST-M-D-03_Binder知识库模块描述文档.md`
3. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
4. `A-AST-M-T-02_知识库机制.md`
5. `A-AST-M-T-03_Binder知识库技术主控文档.md`
6. `A-AST-M-T-04_Binder知识库对象与状态机规范.md`
7. `A-AST-M-T-05_Binder知识库检索与引用协议.md`
8. `A-AST-M-T-06_Binder知识库导入与同步执行规范.md`
9. `A-AST-M-T-07_Binder知识库自动检索协同规范.md`
10. `A-AST-M-T-08_Binder知识库扩展边界规范.md`
11. `A-AST-M-P-01_上下文注入.md`
12. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
13. `A-TMP-M-T-01_模板机制.md`
14. `A-AG-M-T-04_Binder Agent技术主控文档.md`
15. `A-WS-M-D-01_workspace工作台协同主控文档.md`
