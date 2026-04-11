# Binder知识库扩展边界规范

## 文档头

- 结构编码：`AST-M-T-08`
- 文档属性：`专项主结构`
- 主责模块：`AST`
- 文档职责：`Binder知识库扩展边界规范 / 外部源、workspace、构建模式、讨论构建与未来连接器的合法接入边界冻结`
- 上游约束：`AST-M-D-03`, `AST-M-T-03`, `AST-M-T-04`, `AST-M-T-06`, `WS-M-D-01`, `AG-M-D-01`, `TMP-M-D-01`
- 直接承接：`AST-M-T-03`
- 接口耦合：`AST-M-T-04`, `AST-M-T-06`, `WS-M-D-01`, `AG-M-D-01`
- 汇聚影响：无
- 扩散检查：`AST-M-T-03`, `AST-M-T-06`, `WS-M-D-01`
- 使用边界：`冻结未来扩展如何接入知识库而不污染本地知识资产语义；不替代对象状态机、执行链和上下文协议`
- 变更要求：`修改本文后，必须复核：AST-M-D-03 / AST-M-T-03 / AST-M-T-04 / AST-M-T-06 / WS-M-D-01`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库扩展边界专项  
> 上游总控：`A-AST-M-T-03_Binder知识库技术主控文档.md`  
> 状态基础：`A-AST-M-T-04_Binder知识库对象与状态机规范.md`  
> 执行基础：`A-AST-M-T-06_Binder知识库导入与同步执行规范.md`

---

## 一、文档定位

本文冻结 Binder 知识库未来扩展的合法对象映射、执行入口、用户控制边界与否决项。

本文负责：

1. 定义外部源如何映射为合法知识库对象。
2. 定义哪些扩展不得绕过对象模型与 ingestion pipeline。
3. 定义哪些外部数据默认不得进入自动检索范围。
4. 定义 workspace / build / discussion-build 的接入原则。

本文不负责：

1. 具体连接器的实现细节。
2. 企业级权限系统的完整设计。
3. query/result 协议细节。

---

## 二、规则编号体系

| 规则ID | 含义 |
|---|---|
| `KT-EXT-001` | 所有扩展源必须映射为合法知识对象链 |
| `KT-EXT-002` | 所有扩展写入必须经过 ingestion pipeline |
| `KT-EXT-003` | 外部数据默认不进入自动检索范围 |
| `KT-EXT-004` | 用户必须拥有扩展源启停和同步控制权 |
| `KT-EXT-005` | 未来扩展不得污染本地知识资产语义 |

---

## 三、外部源对象映射规则

### 3.1 合法映射原则

任何扩展源都必须被映射为以下合法对象链：

`source -> KnowledgeEntry -> KnowledgeDocument -> KnowledgeChunk`

如需分类结构，可再挂到：

`KnowledgeBase / KnowledgeFolder`

### 3.2 非法映射

以下做法一律非法：

1. 外部源直接产出 chunk，跳过 entry/document。
2. 外部源直接写检索库，不写文档库与元数据层。
3. 外部源只保留 URL 或临时句柄，不保留稳定 `source_ref`。

### 3.3 源类型建议

```rust
pub enum ExternalSourceKind {
    WorkspaceLinkedFile,
    ExternalConnectorDocument,
    ImportedArchive,
    ManualClipboardImport,
}
```

---

## 四、`source_type / source_ref / sync_mode` 约束

### 4.1 `source_type`

1. 必须明确对象的来源类别。
2. `source_type` 不只是展示信息，还决定允许的 sync 路径和用户控制边界。

### 4.2 `source_ref`

1. 必须是可审计、可持久、可复现的稳定来源键。
2. 不允许使用当前会话临时路径、临时 URL token、不可重放引用作为长期 `source_ref`。

### 4.3 `sync_mode`

1. `sync_mode` 必须显式设定，不允许默认推断。
2. `FollowSource / ExternalScheduled` 必须经过用户开启。
3. `Snapshot / None` 对象不得被后台同步任务静默刷新。

---

## 五、`visibility_scope / access_policy` 约束

### 5.1 可见性原则

1. 外部对象若无法映射为明确的 `visibility_scope`，不得接入知识库主链。
2. 可见性边界必须在对象层表达，而不是只在 UI 层提示。

### 5.2 访问控制原则

1. `access_policy` 至少要能区分：
   - 仅当前 workspace 可见
   - 仅显式启用后可检索
   - 因风险或权限冻结而不可自动消费
2. 自动检索必须尊重 `access_policy`，不得把不可见对象混入默认补强层。

---

## 六、用户控制边界

用户必须拥有以下控制权：

1. 启用某个扩展源。
2. 停用某个扩展源。
3. 决定是否跟随源同步。
4. 决定是否允许自动检索消费该源。
5. 决定是否将某类外部对象固定为 snapshot。

以下控制权不得交给系统默认自动决定：

1. 是否将外部源纳入自动检索。
2. 是否将外部更新覆盖当前 active version。
3. 是否把某类对象视为高可信证据。

---

## 七、与 workspace / build / discussion-build 的接入原则

### 7.1 与 workspace

1. workspace 文件可显式存入知识库。
2. workspace 文件默认不是知识条目。
3. workspace follow-source 仍然必须走 ingestion pipeline。

### 7.2 与构建模式

1. 构建模式可消费知识库结果作为背景资料。
2. 构建模式不得直接成为知识对象写入器。
3. 构建模式产物若想进入知识库，必须有显式用户确认入口。

### 7.3 与讨论构建

1. 讨论构建可读取知识结果，不得绕过对象模型写回知识库。
2. 讨论过程中产生的临时结论默认属于 artifact 或讨论状态，不属于知识条目。

---

## 八、明确否决项

以下任一情况成立，必须直接否决扩展设计：

1. 外部源直接写检索库。
2. 外部源默认加入自动检索范围。
3. 扩展接口削弱 `workspace_path` 边界。
4. 连接器模型反向要求知识库放弃本地知识资产语义。
5. 构建模式或讨论构建绕过用户确认直接写知识库。

---

## 九、关键接口草案

### 9.1 Rust Source Adapter 示例

```rust
pub trait KnowledgeSourceAdapter {
    fn source_kind(&self) -> ExternalSourceKind;
    fn build_entry_seed(&self) -> Result<KnowledgeEntrySeed, KnowledgeError>;
    fn build_document_seed(&self) -> Result<KnowledgeDocumentSeed, KnowledgeError>;
    fn sync_mode(&self) -> SyncMode;
}
```

### 9.2 TypeScript 扩展配置示例

```ts
export interface ExternalKnowledgeSourceConfig {
  sourceType: "workspace_linked_file" | "external_connector_document" | "imported_archive";
  sourceRef: string;
  syncMode: "none" | "manual" | "follow_source" | "external_scheduled";
  autoRetrievalEnabled: boolean;
  visibilityScope: "workspace" | "explicit_only";
}
```

---

## 十、验收标准

1. 任何未来扩展都能映射到合法对象链。
2. 任何未来同步都必须经过 ingestion pipeline。
3. 默认自动检索范围仍由用户可控。
4. workspace / build / discussion-build 的接入不会污染知识资产主语义。

---

## 十一、来源映射

1. `A-AST-M-T-03_Binder知识库技术主控文档.md`
2. `A-AST-M-T-04_Binder知识库对象与状态机规范.md`
3. `A-AST-M-T-06_Binder知识库导入与同步执行规范.md`
4. `A-AST-M-D-03_Binder知识库模块描述文档.md`
5. `A-WS-M-D-01_workspace工作台协同主控文档.md`
