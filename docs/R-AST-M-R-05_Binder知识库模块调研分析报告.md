# Binder 知识库模块调研分析报告

## 文档头

- 结构编码：`AST-M-R-05`
- 文档属性：`参考`
- 主责模块：`AST`
- 文档职责：`Binder知识库模块调研分析报告 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `WS-M-D-01`, `AST-M-D-01`, `AST-M-D-02`, `AST-M-P-01`, `AST-M-T-02`, `AG-M-T-04`
- 直接承接：`A-AST-M-D-03_Binder知识库模块描述文档.md`
- 使用边界：`仅作知识库模块边界澄清、路线判断与机制补强参考；结论被采纳时，应回写 A 体系主结构与机制文档`
- 调研时间：2026 年 4 月

---

## 一、执行摘要

本文不是泛泛的 RAG 综述，而是围绕 **Binder 当前知识库控制文档** 做的模块级调研与适配判断。

结论先行：

1. **Binder 的知识库最接近“用户主导的文档级知识资产系统 + 可溯源检索补强层”**，而不是泛化企业搜索平台。
2. **Binder 的知识库不能做成记忆库扩展**，因为二者在来源、治理权、可编辑性、生命周期和协同位置上都不同。
3. **Binder 的知识库不能做成模板库或当前轮状态仓**，因为知识库负责“内容与证据”，模板库负责“过程约束”，artifact 负责“当前轮推进与收口”。
4. 当前 `KnowledgeBase / KnowledgeFolder / KnowledgeEntry / KnowledgeDocument / KnowledgeChunk` 五对象骨架 **对 MVP 是正确的**，但还不够，需要补 `source`、`version`、`status`、`visibility/access policy`、`verification`、`sync semantics`、`provenance` 等语义。
5. 双库结构方向正确，但当前机制文档还没有把 **替换、删除、失败回滚、重建索引、版本切换、软删除/硬删除** 说清楚。
6. 检索不应只停留在“返回 chunks”，而应形成 **chunk 命中、entry 聚合、document 溯源** 的三层结果语义。
7. Binder 应借鉴 Notion、Slite、Glean、Onyx、RAPTOR、GraphRAG、LightRAG、ColBERTv2、Self-RAG 的局部能力，但必须在 Binder 语境下裁剪后承接。
8. 必须直接否决的路线包括：
   - 把知识库偷换成“向量数据库 + 聊天问答”
   - 把所有项目文档默认等价为知识库条目
   - 以企业搜索为名，把 Binder 主战场从文档工作台扭成跨 SaaS 连接器平台
   - 让 AI 默认自动把生成结果写入知识库

---

## 二、Binder 当前约束抽取

### 2.1 知识库的本质定位

基于 `A-AST-M-D-02` 与 `A-AST-M-T-02`，Binder 知识库的本质是：

**由用户主动导入、主动存入、主动组织、可被 AI 检索消费的文档级知识资产系统。**

它解决的是：

1. 用户已有资料、项目资料、外部资料如何成为可检索知识。
2. AI 在需要时如何从这些资料中取证、召回片段、补强上下文。
3. 用户如何对这些知识资产进行命名、归类、移动、替换、删除。

它不解决的是：

1. 当前轮状态托管。
2. 主观偏好沉淀。
3. 工作流或方法论约束。
4. 企业全域搜索平台的统一身份、统一权限和统一动作编排。

### 2.2 与记忆库的边界

知识库与记忆库必须分层治理。

| 维度 | 知识库 | 记忆库 |
|---|---|---|
| 来源 | 用户导入、用户存入、项目文档显式存入 | AI 从对话/文档提取 |
| 管理权 | 用户主导 | 系统主导 |
| 可编辑性 | 可命名、可移动、可替换、可删除 | 默认不可手改 |
| 内容类型 | 文档级知识、证据、资料片段 | 语义记忆、概念、结构、长期偏好 |
| 协同位置 | 自动检索补强层 | 自动检索补强层，但优先于知识库 |
| 风险 | 资料老化、来源不清 | 记忆污染、过拟合用户历史 |

结论：

1. 知识库不是记忆库的“可编辑版”。
2. 记忆库不能承接知识库的资产管理职责。
3. 知识库不负责“自动记住”，记忆库不负责“文档资产管理”。

### 2.3 与模板库的边界

模板库是用户主导的约束资产，知识库是用户主导的内容资产。

| 维度 | 知识库 | 模板库 |
|---|---|---|
| 核心作用 | 提供内容、证据、文档知识 | 提供过程约束 |
| AI 消费方式 | 检索后注入 | 显式选择或接受建议后作为约束注入 |
| 用户动作 | 导入、存入、替换、管理 | 创建、选择、编辑、保存 |
| 失真风险 | 证据不稳、引用不清 | 约束误用、方法越权 |

结论：

1. 知识库不是模板库的“内容填充版”。
2. 模板库不应承担事实来源，知识库也不应承担过程约束。

### 2.4 与当前轮 artifact 的边界

`A-AST-M-D-01` 与 `A-AG-M-T-04` 已经明确：

1. 当前轮 `artifact` 是当前轮推进对象，不是知识库。
2. knowledge entry 不是 plan、candidate、diff、verification、confirmation 的存储层。
3. artifact 可以进入上下文，但其优先级高于自动检索知识库。

结论：

1. 不能把当前轮中间态默认落到知识库。
2. 不能让知识库承担“当前轮可恢复状态”的职责。
3. 不能把知识库写成“项目日志仓”。

### 2.5 与 workspace / 项目文档的边界

知识库位于 workspace 工作台内部，但不等于整个工作区文件系统。

| 对象 | 语义 |
|---|---|
| workspace 文件系统 | 当前项目真实工作现场 |
| 项目文档 | 文件系统中的文档资源 |
| 知识库 | 用户挑选后进入长期管理与检索链的知识资产 |

约束如下：

1. 所有资源默认按 `workspace_path` 隔离。
2. 项目文档只有在用户显式执行“存入知识库”时，才应成为知识库条目。
3. “工作台里可见”不等于“自动进入知识库”。
4. “属于当前项目”不等于“自动具有长期知识价值”。

### 2.6 显式引用与自动检索的优先级

Binder 已冻结的约束是：

1. 用户显式引用高于自动检索。
2. 当前文档 / 当前轮状态高于自动检索知识库。
3. 自动检索知识库只做补强。

按 `A-AST-M-P-01` 与 `A-AST-M-D-02`，知识库自动检索位于：

`当前轮用户目标 > 当前轮 Agent 状态 / artifact / 任务上下文 > 当前文档 / 选区 > 用户显式引用 > 已选模板资产 > 工作区相关 > 记忆库 > 知识库 > 历史摘要`

### 2.7 是否允许自动落库

不允许默认自动落库。

允许的主路径只有：

1. 用户上传文档。
2. 用户点击存入。
3. 用户拖拽项目文档进入知识库。
4. 用户确认替换已有条目。

禁止：

1. AI 自动把生成结果写入知识库。
2. 系统自动全量收编项目文档。
3. AI 自动把任意引用内容归档成知识条目。

### 2.8 哪些能力属于知识库，哪些不属于

**属于知识库的能力**：

1. 知识资产容器管理。
2. 文档导入 / 替换 / 删除 / 移动 / 重命名。
3. 文档库存储与检索库存储的双库映射。
4. 分块、索引、检索、结果溯源。
5. `@知识库`、拖拽知识条目、自动检索补强。

**不属于知识库的能力**：

1. 当前轮状态机。
2. 长期偏好记忆。
3. 模板约束执行。
4. 工作流引擎。
5. 企业统一身份与组织权限平台。
6. 黑箱式自动行动系统。

---

## 三、外部方案调研综述

### 3.1 成熟产品

#### 3.1.1 Notion Enterprise Search

Notion 当前把知识系统做成了“搜索 + 答案 + 研究报告”的统一入口。

值得关注的点：

1. 支持多源连接，强调“search across apps”。
2. 强调“verified content and citations”。
3. 强调权限跟随与来源可控。
4. 研究模式已经从搜索走向多源分析报告生成。

对 Binder 的启发：

1. **结果可验证、可带引用** 是知识系统可信度的基本门槛。
2. **用户选择搜索范围** 很重要，不能把全部源默认混进来。
3. “研究报告”能力可以成为 Binder 的上层消费方，但不应反向定义知识库本体。

不应直接照搬的点：

1. Notion 是云工作空间产品，天然有多应用连接器场景。
2. Binder 当前是文档工作台，不应优先投入跨 SaaS 连接器广度。

#### 3.1.2 Slite Ask

Slite 的优势不在“技术最重”，而在“知识治理语义很清晰”。

值得关注的点：

1. 强调 verified docs。
2. 已验证文档在 Ask 和 Search 中优先。
3. 主张把“可信文档”排在“可搜文档”之前。

对 Binder 的启发：

1. Binder 知识库需要 `verification_status` 或等价字段。
2. 排序不应只看语义相关性，还要看“是否可信、是否最新、是否适合当前任务”。
3. 对证据型知识系统来说，**治理优先级** 与 **检索优先级** 应发生联动。

#### 3.1.3 Glean

Glean 代表的是“企业搜索到 AI 工作平台”的演进路线。

值得关注的点：

1. 100+ tools、real-time indexing、permissions-aware。
2. 强调个性化、知识图谱、连接器和 actions。
3. 产品语义已经从 search 走向 action。

对 Binder 的启发：

1. 若 Binder 未来扩展到外部知识连接，必须提前预留 `source`、`sync`、`visibility/access` 语义。
2. 但 Binder 不能直接复制 Glean 路线，因为 Glean 的主矛盾是企业跨系统搜与用，Binder 的主矛盾是文档工作台中的受控创作与证据补强。

必须否决的点：

1. 以“知识库”之名提前引入企业搜索级连接器、RBAC、组织图谱、动作平台。
2. 让知识库设计被“组织级跨源检索”反向主导。

### 3.2 开源方案

#### 3.2.1 Onyx

Onyx 给 Binder 的主要价值，不是它的聊天 UI，而是它对连接、权限、同步、文档来源的机制化表达。

值得关注的点：

1. `ConnectorCredentialPair` 作为连接与同步管理对象。
2. `AccessType` 区分 `PUBLIC / PRIVATE / SYNC`。
3. `InputType` 区分 `LOAD_STATE / POLL / EVENT / SLIM_RETRIEVAL`。
4. `DocumentBase` 中保留 `source`、`metadata`、`title`、`external_access` 等字段。

对 Binder 的启发：

1. 即使 Binder P0 不做完整连接器，也应在知识库对象上保留 `source_type`、`source_ref`、`sync_mode`、`visibility_scope/access_policy`。
2. 文档级知识系统若不提前留出来源和同步语义，后续扩展会非常痛苦。
3. 但 Binder 不应把连接器系统设为知识库 MVP 的主轴。

#### 3.2.2 LightRAG

LightRAG 代表的是“更轻量但更强调结构与图”的 RAG 方向。

值得关注的点：

1. 强调 simple and fast。
2. 已支持 reranker、citation、document deletion、KG regeneration。
3. 在工程上承认“删除文档会影响图与检索结构，需要主动重建”。

对 Binder 的启发：

1. Binder 的机制文档必须补 `删除 / 替换 / 重建索引 / 失败回滚`。
2. 一旦知识库不仅有 chunk 索引，还有摘要、结构或图派生物，删除与替换不能只删原文件。
3. citation 不是 UI 附加项，而是结果对象设计的一部分。

#### 3.2.3 开源企业搜索 / RAG 系统共性

调研共识很明确：

1. 连接器、权限、来源、同步频率、可溯源引用，才是知识系统真正难的部分。
2. “能回答”很容易，“稳定、可信、可治理”很难。
3. 很多系统把“向量检索”当核心，但真正影响产品可用性的，往往是对象语义和治理闭环。

### 3.3 论文与前沿研究

#### 3.3.1 RAPTOR

RAPTOR 的关键价值是：

1. 不只检索底层 chunk，还构建多层摘要树。
2. 让系统既能取局部证据，也能取文档整体抽象。

对 Binder 的判断：

1. **可承接**：作为 P2/P3 的长文档摘要树、知识库总览、entry 级摘要层。
2. **不应作为 P0 默认主链**：因为 Binder 当前更缺对象治理和可溯源结果，不是先缺抽象树。

#### 3.3.2 GraphRAG 与相关综述

GraphRAG 的价值在于：

1. 适合跨文档、多实体关系、主题发现、全局概念梳理。
2. 对复杂语义发现比朴素 chunk RAG 更强。

对 Binder 的判断：

1. **可承接**：未来用于大型知识库的概念关系发现、知识图谱导航、全局主题摘要。
2. **需改造后承接**：不能让图结构取代原始文档溯源；图只能是辅助索引层。
3. **P0/P1 不应默认采用**：成本高、治理复杂、调试成本大。

#### 3.3.3 ColBERTv2

ColBERTv2 的关键价值是 late interaction。

对 Binder 的判断：

1. 当 Binder 将来引入语义检索时，late interaction 或强 rerank 思路比“单向量粗召回”更适合长文档与证据片段检索。
2. 但这属于检索增强层，不是知识库本体边界。

#### 3.3.4 Self-RAG

Self-RAG 的关键价值是：

1. 检索不必无脑固定触发。
2. 生成阶段需要自我反思与引用质量意识。

对 Binder 的判断：

1. **思想可借**：是否触发知识库检索、是否继续扩检、答案是否证据充分，可形成 query-time policy。
2. **实现不直接照搬**：Binder 不需要训练 reflection-token 模型，而应采用规则化门禁与可观测策略。

#### 3.3.5 引用可靠性相关研究

对 Binder 影响最大的结论不是“再加一个 RAG 算法”，而是：

1. 生成式答案的 citations 很容易“看起来像真有依据”，但并不总是充分或准确。
2. 所以 Binder 的知识库结果必须先做到 **可溯源对象正确**，再谈“答案引用看起来漂亮”。

这直接支持以下设计：

1. chunk 必须带稳定 `source` 与定位锚点。
2. entry/document 必须能回溯到原始文档版本。
3. 引用结果必须能被 UI 明确打开、定位、核验。

---

## 四、对比矩阵

| 对象 | 核心强项 | 对 Binder 可借鉴 | 对 Binder 需改造后承接 | Binder 应否决 |
|---|---|---|---|---|
| Notion Enterprise Search | 多源搜索、引用与报告生成 | citations、source control、research mode 作为上层消费 | 多源连接与网页搜索需晚于本地知识资产治理 | 把知识库做成 SaaS 全域搜索入口 |
| Slite Ask | verified docs、治理优先级 | verification_status、可信内容排序加权 | 团队验证流可简化为本地/项目级“已校验”语义 | 只做“问答前台”不做资产管理 |
| Glean | 权限、连接器、实时索引、搜索到行动 | source/sync/access 语义预留 | connector/action 只做未来接口，不做 MVP 主轴 | 企业搜索/企业行动平台路线直接移植 |
| Onyx | 连接器模型、access_type、input_type、自托管 | source、sync_mode、visibility/access_policy、文档来源字段 | 多连接器治理可缩成单工作区本地知识源 + 保留接口 | 以连接器平台为知识库核心 |
| LightRAG | 结构化 RAG、citation、删除重建、rerank | citation、删除后重建、结果 traceability | 图结构、KG regeneration 仅作增强层 | 把图索引当 Binder 知识库本体 |
| RAPTOR | 层级摘要树 | entry/doc summary layer、长文档概览 | 仅在大型知识库和复杂查询下启用 | P0 就引入高成本层级摘要链 |
| GraphRAG | 关系发现、全局主题理解 | 大型知识库主题发现、概念导航 | 图只能做增强，不可替代原文与引用 | 默认图化全部知识库 |
| ColBERTv2 | 高精度 late interaction | 语义 rerank 的潜在路线 | 仅在语义检索阶段引入 | 把复杂向量检索放到 MVP 之前 |
| Self-RAG | 自适应检索、自反思 | query-time retrieval policy、citation sufficiency checks | 以规则替代训练范式 | 为 Binder 训练专有 Self-RAG 主链 |

---

## 五、围绕 Binder 的关键判断

### 5.1 Binder 的知识库最接近什么，不接近什么

最接近：

1. 用户主导的项目资料库。
2. 文档级知识资产管理器。
3. 可溯源检索补强层。

不接近：

1. 企业统一搜索平台。
2. 聊天问答机器人外接向量库。
3. 记忆库的可编辑变体。
4. 工作流模板中心。
5. 当前轮状态恢复仓。

### 5.2 为什么不能直接做成泛化企业搜索

原因不在“以后永远不需要”，而在“当前产品主矛盾不同”。

Binder 当前主矛盾是：

1. 文档工作台中的受控创作。
2. 当前文档事实与证据补强的协同。
3. 用户可管理知识资产与 AI 消费之间的平衡。

而泛化企业搜索优先解决的是：

1. 跨应用连接器。
2. 组织身份与权限映射。
3. 统一搜索入口与企业动作平台。

如果 Binder 现在直接走企业搜索路线，会导致：

1. 核心资源被连接器和权限系统吞掉。
2. 文档级引用、命名、替换、删除、版本、traceability 等真正重要的 Binder 能力被延后。
3. 知识库从“工作台内的受控资产”变成“跨系统搜一切”的模糊层。

### 5.3 为什么不能做成记忆库扩展

因为知识库与记忆库的根语义不同：

1. 知识库的所有权在用户。
2. 记忆库的主写入权在系统。
3. 知识库可管理、可替换、可删除。
4. 记忆库是语义沉淀，不是文档资产管理。

一旦把知识库并到记忆库，会出现：

1. 资产管理语义消失。
2. 自动提炼与手工导入混在一起。
3. 证据型知识与偏好型记忆互相污染。

### 5.4 为什么不能做成模板库或当前轮状态仓

不能做成模板库，是因为：

1. 模板负责过程约束，知识库负责内容。
2. 模板是过程约束，知识库是资料与证据。

不能做成当前轮状态仓，是因为：

1. 当前轮 artifact 需要高频更新、失效、替换、确认。
2. 知识库需要稳定、可管理、可长期复用。

### 5.5 当前五对象模型是否足够

结论：**骨架足够，语义不够。**

目前五对象模型的优点：

1. 已经把“资产容器、文档对象、检索对象”分开。
2. 已经具备双库建模基础。

当前不足：

1. `KnowledgeBase` 缺 `workspace_path / owner_scope / visibility_scope / status` 细化。
2. `KnowledgeEntry` 缺 `source_type / source_ref / ingestion_mode / verification_status / active_version_id`。
3. `KnowledgeDocument` 缺 `document_version / checksum / parser_version / supersedes / superseded_by / deletion_status`。
4. `KnowledgeChunk` 缺 `heading_path / page_anchor / block_anchor / citation_label / retrieval_state`。
5. 全链路缺 `sync_policy / rollback semantics / provenance path`。

### 5.6 双库结构是否合理

合理，但必须补机制。

建议定义：

1. **新增**：先建 entry/document 元数据，再写原始文档，再建索引任务。
2. **替换**：新版本索引成功后再切换 active version；失败则旧版本继续服务。
3. **删除**：先 tombstone 元数据，再删检索数据，再删文档实体；任一步失败都应可恢复或重试。
4. **重命名**：只改 display，不改 document identity。
5. **移动**：只改归属元数据，不默认重建内容索引；若排序依赖路径语义，可触发轻量 metadata reindex。

### 5.7 检索应支持哪些粒度

建议三层粒度并存：

1. `chunk`：检索主命中单位，用于引用与注入。
2. `entry`：结果聚合单位，用于 UI、排序与稳定消费。
3. `document`：原始证据与版本追溯单位。

这意味着：

1. 不应只返回 chunks。
2. 也不应只返回 entry title。
3. UI、引用、注入要消费不同粒度的结果。

### 5.8 检索策略应如何定义

Binder 推荐路线：

1. P0/P1：结构优先 + 关键词/FTS + 元数据过滤 + 简单 rerank。
2. P2：混合检索与更强 rerank。
3. P3：层级摘要、图增强或晚交互模型按场景接入。

排序建议至少考虑：

1. query 相关性。
2. 标题命中。
3. heading/path 命中。
4. entry verification 状态。
5. 版本与新鲜度。
6. 用户是否显式选中当前 kb/folder。

### 5.9 如何做到稳定、可引用、可溯源、可注入

必须同时满足：

1. `chunk` 带稳定 `chunk_id`。
2. `entry/document` 带稳定 ID 与 active version。
3. 引用对象能回到原始文档位置。
4. 注入对象保留 `source_label`、`provenance`、`citation anchor`。
5. UI 能打开来源、查看上下文、核验原文。

### 5.10 为什么知识库只应是层次三承接对象

因为层次三才是完整协作链。

层次一、层次二的主矛盾是：

1. 窄范围编辑。
2. 低时延。
3. 独立提示词与独立运行链。

若把知识库默认下压到层次一/二，会导致：

1. 噪声增加。
2. 作用范围变模糊。
3. 破坏三层独立性。

### 5.11 为什么显式引用必须高于自动检索

因为 Binder 遵守“禁止隐式猜测”。

显式引用意味着：

1. 用户已经表达了当前任务最可信的输入合同。
2. 系统不能用自动补强结果反向改写用户意图。

### 5.12 为什么自动检索只能补强，不能覆盖当前文档事实

因为 Binder 是文档工作台，不是外部问答站。

当前文档是：

1. 当前任务现场。
2. 当前编辑目标。
3. 当前事实裁决的第一来源。

知识库中的资料可能更广，但不一定更当前、更适用、更权威于当前工作现场。

### 5.13 Binder 是文档工作台，不是聊天问答工具，这会带来什么设计影响

这会直接改变知识库设计重心：

1. 更强调 entry/document 管理，不只强调问答。
2. 更强调引用、定位、打开、替换、删除，不只强调“回答一句话”。
3. 更强调“被编辑系统消费”，不只强调“被聊天框消费”。
4. 更强调与 workspace、当前文档、构建流程的边界，不只强调跨源问答。

### 5.14 如何为未来模块留接口而不越界

建议预留接口，不提前承诺实现：

1. 与 workspace：`source_type=workspace_file`、`source_ref=file_path`、`import_mode=copy/link/snapshot`。
2. 与记忆库：只共享注入协议与来源标签，不共享资产对象。
3. 与模板库：知识库提供内容，模板库提供约束。
4. 与构建模式 / 讨论构建：知识库作为证据与背景输入，不作为流程驱动器。
5. 与未来连接器：保留 `connector_id / sync_mode / visibility_scope`，但不以此重写当前知识库主线。

---

## 六、对当前 AST-M-T-02 的缺口分析

当前 `A-AST-M-T-02_知识库机制.md` 的问题不是方向错，而是**机制颗粒度明显不足**。

### 6.1 已经正确的部分

1. 知识库 / 分类 / 条目 / 文档 / chunk 的对象分层。
2. 双库结构。
3. 导入、删除、替换、移动、重命名的基本语义。
4. 检索接口与结果必须可溯源的方向。

### 6.2 缺失的关键章节

1. 对象字段扩展定义。
2. 文档版本与 active version 切换语义。
3. `source_type / source_ref / ingestion_mode / sync_mode`。
4. `verification_status / visibility_scope / access_policy`。
5. 索引任务状态、失败重试、回滚与 tombstone 规则。
6. chunk 级 citation anchor 与原文定位规则。
7. 检索粒度、排序、rerank、去重与结果聚合协议。
8. 替换 / 删除 / 移动时的检索库一致性保证。
9. 与 workspace 文件的 copy/link/snapshot 边界。
10. 与构建模式、讨论构建、未来连接器的接口保留位。

### 6.3 推荐补强方向

推荐把 `A-AST-M-T-02` 从“机制纲要”扩成“可落地机制主控”，至少新增：

1. 对象语义层。
2. 生命周期与状态机层。
3. 双库一致性与回滚层。
4. 检索与结果对象层。
5. 引用 / 注入消费层。
6. 治理与扩展接口层。

---

## 七、结论与建议

### 7.1 Binder 应借鉴什么

应借鉴：

1. Notion 的 citations、source control、research 结果消费方式。
2. Slite 的 verified docs 治理思路。
3. Glean / Onyx 的 source、sync、visibility/access 语义。
4. LightRAG 的 citation、rerank、删除后重建意识。
5. RAPTOR 的层级摘要思路。
6. GraphRAG 的复杂关系发现思路。
7. ColBERTv2 的高精度 rerank方向。
8. Self-RAG 的“按需检索 + 自检”思想。

### 7.2 哪些设计可直接承接

可直接承接：

1. 用户主导资产。
2. verified / trusted ranking bias。
3. citations 与 provenance。
4. source / sync / visibility 字段预留。
5. chunk-hit + entry-group + document-trace 三层结果语义。

### 7.3 哪些设计需改造后承接

需改造后承接：

1. 企业搜索连接器模型。
2. 图增强检索。
3. 层级摘要树。
4. 强语义 rerank。
5. query-time 自适应检索策略。

### 7.4 哪些路线必须直接否决

必须否决：

1. 知识库 = 向量数据库 + 聊天 UI。
2. 知识库 = 记忆库扩展。
3. 知识库 = 模板库扩展。
4. 知识库 = 当前轮状态仓。
5. 默认全量收编 workspace 文件。
6. 以企业搜索为目标倒逼 Binder 重构成跨 SaaS 平台。
7. 让 AI 默认自动写入知识库。

### 7.5 推荐的 Binder 路线

建议路线：

1. 先冻结模块边界。
2. 再补机制文档字段、状态、生命周期与检索协议。
3. MVP 先做“可管理资产 + 稳定检索 + 可溯源引用 + 层次三消费”。
4. P1 再补验证状态、版本切换、失败回滚、结构化排序。
5. P2 以后再评估混合检索、摘要树、图增强与连接器扩展。

---

## 八、来源清单

### 8.1 Binder 内部文档

1. `docs/A-AST-M-T-02_知识库机制.md`
2. `docs/A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
3. `docs/A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
4. `docs/A-AST-M-P-01_上下文注入.md`
5. `docs/A-WS-M-D-01_workspace工作台协同主控文档.md`
6. `docs/A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
7. `docs/A-AG-M-D-01_Binder Agent能力描述文档.md`
8. `docs/A-AG-M-T-04_Binder Agent技术主控文档.md`
9. `docs/A-CORE-C-D-04_系统设计原则总纲.md`
10. `docs/R-AG-C-D-01_Binder-Agent指导方案（Guiding Architecture & Design Doctrine）.md`
11. `docs/R-PROD-C-R-03_项目介绍.md`

### 8.2 外部产品与开源资料

1. Notion Enterprise Search  
   https://www.notion.com/product/enterprise-search
2. Slite Customer Support / Ask  
   https://slite.com/solutions/customer-support
3. Glean Workplace Search AI  
   https://www.glean.com/product/ai-search
4. Onyx 产品页  
   https://onyx.app/
5. Onyx Core Concepts 文档  
   https://docs.onyx.app/developers/core_concepts
6. LightRAG GitHub  
   https://github.com/HKUDS/LightRAG

### 8.3 外部论文与研究

1. RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval  
   https://huggingface.co/papers/2401.18059
2. Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection  
   https://openreview.net/forum?id=hSyW5go0v8
3. ColBERTv2: Effective and Efficient Retrieval via Lightweight Late Interaction  
   https://huggingface.co/papers/2112.01488
4. GraphRAG: Unlocking LLM discovery on narrative private data  
   https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/
5. Graph Retrieval-Augmented Generation: A Survey  
   https://huggingface.co/papers/2408.08921
6. A Survey of Graph Retrieval-Augmented Generation for Customized Large Language Models  
   https://huggingface.co/papers/2501.13958
7. Evaluating Verifiability in Generative Search Engines  
   https://www.emergentmind.com/articles/2304.09848
