# Binder知识库开发计划

## 文档头

- 结构编码：`AST-X-L-03`
- 文档属性：`落地计划`
- 主责模块：`AST`
- 文档职责：`Binder知识库开发计划 / 分期、依赖、任务包、风险与验收总计划`
- 上游约束：`AST-M-D-03`, `AST-M-D-02`, `AST-M-T-02`, `AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `AST-M-T-08`, `AST-M-P-01`, `AG-M-D-01`, `AG-M-T-04`, `WS-M-D-01`, `AST-M-D-01`, `TMP-M-D-01`, `CORE-C-D-04`, `AG-C-D-01`
- 直接承接：`AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `AST-M-T-08`
- 接口耦合：`AST-M-P-01`, `AG-M-T-04`, `WS-M-D-01`, `AST-M-D-01`, `TMP-M-D-01`
- 汇聚影响：`ENG-X-T-02`, `src-tauri/src/services`, `src/services`, `workspace.db`, `context_manager.rs`, `chatStore.ts`
- 扩散检查：`AST-M-D-03`, `AST-M-T-02`, `AST-M-T-03`, `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06`, `AST-M-T-07`, `AST-M-T-08`, `AST-M-P-01`
- 使用边界：`本文是知识库开发推进文档，不替代模块描述文档、机制文档和专项技术规范；本文回答开发顺序、依赖、风险、验收和任务拆分`
- 变更要求：`修改本文后，必须复核：AST-M-D-03 / AST-M-T-03~08 / AST-M-P-01 / AG-M-T-04 / WS-M-D-01`

---
> 文档层级：30_capabilities / 05_上下文资产系统 / 知识库开发计划  
> 上游主控：`A-AST-M-D-03_Binder知识库模块描述文档.md`、`A-AST-M-D-02_Binder Agent知识库协同主控文档.md`  
> 技术主控：`A-AST-M-T-03_Binder知识库技术主控文档.md`  
> 专项规范：`A-AST-M-T-04~08`  
> 参考调研：`R-AST-M-R-05_Binder知识库模块调研分析报告.md`

---

## 一、文档定位

本文是 Binder 知识库模块的**开发推进文档**。

本文回答：

1. 知识库模块应该按什么顺序开发。
2. 每个阶段的目标、范围、前置依赖、风险和验收是什么。
3. 哪些模块必须先做，哪些可以后做，哪些必须串行，哪些可以并行。
4. 与 Agent / workspace / memory / template / context injection 的协同开发顺序如何安排。
5. 哪些主题必须先文档冻结再开发，哪些可边开发边收敛。

本文不负责：

1. 改写知识库模块边界。
2. 改写显式引用、自动检索、层次三承接等冻结规则。
3. 替代 `AST-M-T-03~08` 的技术规范细节。
4. 直接给出代码实现细节全集。

---

## 二、当前前提与冻结约束

只保留会影响开发顺序与范围的前提：

1. 知识库是用户主导的文档级知识资产，不是自动记忆仓，不是企业搜索平台。
2. AI 不得默认自动把当前生成内容写入知识库。
3. 知识库默认只在层次三承接。
4. 用户显式引用优先于自动检索。
5. 自动检索知识库只做补强，不得覆盖当前文档事实与当前轮状态。
6. workspace 文件系统不等于知识库；项目文档不默认等于知识库条目。
7. 所有知识对象必须经过统一对象模型建模；所有写入必须经过 ingestion pipeline。
8. active version 是引用与检索的唯一版本真源。
9. 外部扩展不得绕过对象模型、执行链和用户控制边界。

### 2.1 已经可以直接进入开发排期的机制

以下主题已足够硬，可直接承接开发：

1. 五对象模型与状态语义：`AST-M-T-04`
2. query/result/citation/injection 协议：`AST-M-T-05`
3. ingestion/replace/delete/rebuild/retry/rollback 主链：`AST-M-T-06`
4. 自动检索与上下文消费边界：`AST-M-T-07`
5. 外部源与扩展边界：`AST-M-T-08`

### 2.2 仍需先补或回写后再开发的主题

以下主题不阻塞主链启动，但需要在实现前或实现早期回写：

1. `A-AST-M-T-02_知识库机制.md` 仍然是高层纲要，需回写与 `T-03~08` 的映射，不再承载重复细节。
2. 缺少专门的数据库 schema / migration 细化文档；主链开发时必须先补到实现文档或工程规范中。
3. 缺少 workspace UI/资源区知识库入口的实现细则文档；不阻塞后端主链，但阻塞完整交互闭环验收。

### 2.3 知识库主链与增强链

**知识库主链**：

1. 数据对象与持久层
2. 文档库 / 检索库双库结构
3. ingestion pipeline
4. replace / delete / rename / move pipeline
5. 状态机与状态回写
6. chunk / entry / document 检索与聚合
7. citation / provenance / source 协议
8. 引用对象与注入对象
9. 层次三自动检索接入

**增强链**：

1. verification 增强
2. 排序增强 / rerank / hybrid retrieval
3. 摘要层 / 结构摘要
4. 图增强
5. 外部源扩展
6. 同步增强
7. 构建模式 / 讨论构建深接入

### 2.4 当前开发的主矛盾

当前知识库开发的主矛盾不是“检索算法不够先进”，而是：

1. 主链对象和执行链尚未落地。
2. 文档级知识资产与 workspace 文件现场尚未被技术上隔开。
3. 引用、注入、版本、失效、回滚的一致性还没有工程闭环。

因此，开发不能被以下事情带偏：

1. 提前做企业搜索 / 连接器广度。
2. 提前重投入向量平台、图增强、复杂 RAG。
3. 把知识库做成聊天问答产品附属物。

---

## 三、开发总策略

### 3.1 总目标

本轮开发的总目标是：

**先建立 Binder 知识库的对象主链、执行主链和消费主链，再做稳定性增强和扩展接口预留。**

### 3.2 核心策略

1. **主链优先**：先把对象、双库、执行链、引用链、注入链打通。
2. **稳定性优先于能力广度**：先保证 active version、citation、provenance、delete/rebuild 正确，再考虑 rerank、图增强、连接器。
3. **技术冻结先行**：对象状态机、query/result/citation payload、ingestion pipeline 先冻结再写代码。
4. **边界优先于体验扩展**：先防止知识库被 memory/template/artifact/workspace 污染，再做入口丰富和自动化增强。

### 3.3 为什么按这个顺序排

因为 Binder 的知识库一旦对象模型、active version、citation、delete/rebuild 设计漂移，后续：

1. 检索接口会反复改。
2. 注入 payload 会反复改。
3. workspace / Agent / context_manager / UI 都会返工。

所以真正不能晚做的是：

1. 对象状态机
2. 双库执行链
3. query/result/citation/injection 协议
4. 自动检索的边界

---

## 四、开发分期设计

## 4.1 P0：对象与主链建立

### 目标

建立知识库最小可运行主链：

1. 五对象持久层可落库
2. ingestion / replace / delete / rename / move 可执行
3. query_knowledge_base 可返回三层结果
4. 引用对象与注入对象协议可被消费

### 范围

1. `KnowledgeBase / Folder / Entry / Document / Chunk` 持久层
2. 文档库 / 检索库双库结构
3. ingestion / replace / delete / metadata reindex
4. active version switch
5. lexical retrieval + chunk/entry/document 聚合
6. citation / provenance 基础链

### 核心任务

1. 建立数据库 schema、索引和基础 repository 层。
2. 建立 ingestion pipeline、replace pipeline、delete pipeline。
3. 建立 query_knowledge_base 接口与 payload。
4. 建立基础引用对象 `KnowledgeCitation` 和 `KnowledgeInjectionSlice`。

### 前置依赖

1. `AST-M-T-04`, `AST-M-T-05`, `AST-M-T-06` 已冻结。
2. workspace_path 边界已在现有系统可用。

### 不纳入项

1. 自动检索接入 Agent
2. rerank / hybrid retrieval
3. 外部源扩展
4. 图增强 / 摘要层

### 风险

1. schema 先天缺字段会导致后续 payload 返工。
2. active version 切换语义若不严，会污染 citation 稳定性。

### 阶段闸门

#### 进入条件

1. `AST-M-T-04`、`AST-M-T-05`、`AST-M-T-06` 已冻结且字段口径一致。
2. `entry_id != file_path`、active version 唯一、双库映射主键已在文档层冻结。
3. workspace -> 知识库的 MVP 主路径已冻结为 `snapshot`，且默认不自动同步。

#### 退出条件

1. 五对象 schema、repository、执行阶段表已可稳定落库。
2. ingestion / replace / delete / rename / move / query 主链均已存在最小实现。
3. `query_knowledge_base` 已返回 chunk/entry/document 三层结果。
4. citation / injection payload 已能稳定绑定 version 与 provenance。

#### 阻断条件

1. schema 字段仍无法承接 version / deletion / retrieval / provenance。
2. active version 不能保证唯一。
3. workspace 文件与知识条目仍存在身份混用风险。
4. replace / delete 任一链路无法保证双库一致性。

#### 不得带入下一阶段的问题清单

1. 不能把 `file_path` 当作 entry 稳定身份。
2. 不能存在未定义的 replace 后旧引用处理策略。
3. 不能存在 delete 后 chunk 悬挂命中问题。
4. 不能在未完成三层结果协议前推进自动检索接入。

### 验收口径

1. 能导入一个文档形成 entry/document/chunk。
2. 能替换文档并正确切 active version。
3. 能删除 entry 并让对象退出默认引用资格。
4. query 返回 chunk/entry/document 三层结果。
5. citation 能稳定绑定 version 与 provenance。

## 4.2 P1：检索消费闭环成立

### 目标

让知识库真正被 Binder 层次三消费，而不是只具备静态存储能力。

### 范围

1. `@知识库` / `@知识条目` / 拖拽引用协议落地
2. context assembly 知识库 augmentation payload 对接
3. 自动检索触发 / 抑制 / 降级机制
4. 风险标记与 warnings

### 核心任务

1. 接入 chat 输入侧显式引用。
2. 接入 `context_manager.rs` 的知识库 augmentation 路径。
3. 实现 `should_trigger_knowledge_retrieval` 判定与观测事件。
4. 实现去重、显式引用压制、风险标记。

### 前置依赖

1. P0 主链成立。
2. `AST-M-T-07` 已冻结。
3. `AST-M-P-01` 的现有注入顺序不被改写。

### 不纳入项

1. 层次一、层次二接入
2. 复杂排序增强
3. 外部源自动参与检索

### 风险

1. 自动检索越权覆盖当前文档。
2. 显式引用和自动检索重复注入造成噪声。

### 阶段闸门

#### 进入条件

1. P0 已通过且 query/result/citation/injection 协议可用。
2. `AST-M-T-07` 已冻结，且与 `AST-M-P-01` 的注入顺序无冲突。
3. 显式引用对象已经可稳定进入聊天输入与 context payload。

#### 退出条件

1. 显式引用、拖拽引用、自动检索补强三条消费链已成立。
2. 自动检索仅进入 augmentation 层，不写回当前文档与知识资产。
3. 去重、压制、风险标记、观测事件已完整可用。

#### 阻断条件

1. 自动检索会覆盖显式引用。
2. 自动检索会覆盖当前文档事实或当前轮 artifact。
3. augmentation payload 无法区分显式来源与自动来源。
4. 去重与压制规则尚未落地。

#### 不得带入下一阶段的问题清单

1. 不能存在显式引用与自动检索重复注入未消解的问题。
2. 不能存在自动检索结果伪装成用户指定来源的问题。
3. 不能存在 query 失败时阻塞层次三主链的问题。

### 验收口径

1. 显式引用高于自动检索。
2. 自动检索结果只进入 augmentation 层。
3. query 超时、无结果、risk flags 均可暴露且不阻塞主链。

## 4.3 P2：稳定性与恢复增强

### 目标

把知识库从“可运行”提升为“可恢复、可维护、可演进”。

### 范围

1. retry / rollback / rebuild 完整链
2. metadata reindex 稳定化
3. citation 失效与 superseded 展示
4. verification_status 对排序、引用与注入的联动

### 核心任务

1. 建立执行阶段表与观测链。
2. 建立 delete / replace / rebuild 失败恢复逻辑。
3. 建立 verification boost 与风险标记联动。
4. 建立 stale/superseded/deleted citation 的 UI/协议口径。

### 前置依赖

1. P0 与 P1 完整打通。
2. 对象状态与执行阶段已经落地。

### 不纳入项

1. 图增强
2. 企业级连接器
3. 复杂多模态知识源

### 风险

1. rebuild 期间新旧索引切换错误。
2. 删除链中断造成“索引已删、文档仍活”或反向悬挂。

### 阶段闸门

#### 进入条件

1. P0、P1 已完成，执行阶段与观测链可用。
2. replace / delete / query / citation 的失败码和状态回写已稳定。
3. verification_status、superseded、deleted 等状态已进入对象模型。

#### 退出条件

1. retry / rollback / rebuild 链路可执行、可观测、可重试。
2. stale / superseded / deleted citation 均有稳定语义与展示口径。
3. verification_status 已真实影响排序、注入风险和默认引用资格。

#### 阻断条件

1. rebuild 期间无法保证 active version 与检索结果一致。
2. 删除或替换失败时无法恢复到上一个稳定版本。
3. 历史 citation 仍会被静默改写。

#### 不得带入下一阶段的问题清单

1. 不能存在 rollback 后状态与存储不一致的问题。
2. 不能存在 unavailable / superseded citation 无法识别的问题。
3. 不能存在 verification_status 仅存字段、不影响行为的问题。

### 验收口径

1. replace / delete / rebuild 失败都能回退或重试。
2. 历史 citation 不会被静默改写。
3. verification_status 真正影响排序和引用可信度。

## 4.4 P3：扩展接口预留与增强能力

### 目标

在不污染主链的前提下，为未来扩展留合法入口。

### 范围

1. 外部源 adapter 抽象
2. source_type/source_ref/sync_mode 用户控制面
3. hybrid retrieval / rerank 试点
4. 构建模式 / 讨论构建消费接口预留

### 核心任务

1. 设计并实现 `KnowledgeSourceAdapter` 抽象。
2. 加入 `sync_mode` 与 `visibility/access` 的用户控制路径。
3. 在 query 层试点 hybrid / rerank，不改写主协议。

### 前置依赖

1. P2 已完成。
2. `AST-M-T-08` 边界规则已冻结。

### 不纳入项

1. 企业统一搜索平台
2. 组织级权限系统
3. 默认跨源自动检索

### 风险

1. 外部源扩展绕过对象模型。
2. hybrid / rerank 反向影响稳定性口径。

### 阶段闸门

#### 进入条件

1. P2 已完成，主链、恢复链、消费链稳定。
2. `AST-M-T-08` 已冻结，且扩展边界未与现有对象模型冲突。
3. source_type/source_ref/sync_mode/visibility/access 语义已在实现层可承接。

#### 退出条件

1. 扩展接口只能经合法对象链与 ingestion pipeline 进入。
2. 新检索能力不会改写既有 query/result/citation/injection 协议。
3. 外部数据默认不进入自动检索范围，用户控制路径可用。

#### 阻断条件

1. 任一扩展路径绕过 `KnowledgeEntry / KnowledgeDocument / KnowledgeChunk`。
2. 外部数据可直接写检索库。
3. sync_mode 默认启用自动同步或自动纳入自动检索。

#### 不得带入下一阶段的问题清单

1. 不能存在扩展入口直接污染本地主链的问题。
2. 不能存在 source adapter 权限与可见性语义未定义的问题。
3. 不能存在 hybrid / rerank 改写稳定性口径的问题。

### 验收口径

1. 扩展源仍然被合法对象链承接。
2. 外部数据默认不自动进入自动检索范围。
3. 新检索能力不破坏既有 query/result/citation/injection 协议。

---

## 五、模块级开发拆解

## 5.1 数据对象与持久层

### 开发内容

1. 五对象表结构
2. active version、verification、deletion、retrieval、sync 相关字段
3. 基础索引与唯一键

### 依赖关系

依赖 `AST-M-T-04`，是所有主链的最前置模块。

### 风险点

1. 字段不全导致执行链返工。
2. 唯一键设计不稳定导致 citation 失效。

### 完成标准

1. 能稳定表达五对象与状态面。
2. repository 层可以支持 ingestion/query/delete 主链。

## 5.2 文档库 / 检索库双库结构

### 开发内容

1. 原始文档保存
2. chunk 元数据与检索索引
3. document_id 与 active version 映射

### 依赖关系

依赖持久层与对象模型；必须早于 query 和 context 注入。

### 风险点

1. 双库视图长期分裂。
2. document 与 chunk 映射不稳定。

### 完成标准

1. 任一 chunk 都能回溯到 document/version。
2. 删除和替换不会留下悬挂映射。

## 5.3 Ingestion Pipeline

### 开发内容

1. validate -> persist -> parse -> chunk -> index -> qualify -> ready
2. 阶段状态回写
3. 错误码与 retryable 标识

### 依赖关系

依赖双库结构和对象状态机；是最早必须落地的执行链。

### 风险点

1. parse/index 失败时对象状态错误。
2. 引用资格提前暴露。

### 完成标准

1. ingest 可完整跑通。
2. 失败链能正确回写 `failed / rollback_needed` 等状态。

## 5.4 Replace / Delete / Rename / Move Pipeline

### 开发内容

1. replace 新版本生成与 active version switch
2. delete 的 pending_delete -> suppress -> remove -> commit
3. rename / move 的 metadata 变更与轻量 reindex

### 依赖关系

依赖 ingestion 主链和 active version 语义。

### 风险点

1. 新版本未 ready 就切 active
2. 删除链中断导致双库不一致

### 完成标准

1. old active version 在 replace 失败时保持不变
2. delete 后对象退出默认引用与自动注入链

## 5.5 状态机与状态回写

### 开发内容

1. entry/document/chunk 状态迁移
2. execution stage 持久化
3. invariant validation

### 依赖关系

与对象持久层并行设计，但必须先于执行链代码冻结。

### 风险点

1. 状态定义和执行链脱节
2. UI 和 API 读取到的状态口径不一致

### 完成标准

1. 行为闭环能映射到状态机
2. 状态机能映射到接口返回和错误恢复

## 5.6 Chunk / Entry / Document 检索与聚合

### 开发内容

1. lexical query
2. chunk 命中
3. entry 聚合
4. document trace

### 依赖关系

依赖 P0 ingestion 产生的 chunk 与 provenance。

### 风险点

1. 只返回 chunk，导致 UI 和 Agent 无法稳定消费
2. entry 聚合和 chunk hit 不一致

### 完成标准

1. query 返回三层结果
2. 任一命中都能唯一追溯

## 5.7 Citation / Provenance / Source 协议

### 开发内容

1. `KnowledgeCitation`
2. `KnowledgeInjectionSlice`
3. version/stale/deleted/unavailable 语义

### 依赖关系

依赖 query 协议与 active version 语义；必须早于 Agent 自动检索接入。

### 风险点

1. 历史引用被静默改写
2. provenance 缺失导致引用不可核验

### 完成标准

1. citation 稳定绑定 version 与 provenance
2. superseded/deleted/ unavailable 均有稳定协议语义

## 5.8 自动检索协同

### 开发内容

1. `G1`：触发判定
2. `G2`：augmentation 组装
3. `G3`：压制与去重
4. 风险标记和观测事件

### 子任务列表

1. `G1-1`：实现 `should_trigger_knowledge_retrieval`，产出触发判定函数与触发原因枚举，代码落点：`src-tauri/src/agent/context_manager.rs`、`src-tauri/src/agent/ai_chat_stream.rs`，协议依赖：`AST-M-T-07`、`AST-M-P-01`。
2. `G1-2`：实现降级条件与禁用条件，产出 timeout / empty / blocked / explicit_only 判定，代码落点：`src-tauri/src/agent/context_manager.rs`，协议依赖：`AST-M-T-07`。
3. `G2-1`：实现 augmentation payload builder，产出 `KnowledgeInjectionSlice[]` 组装器，代码落点：`src-tauri/src/agent/context_manager.rs`、`src/lib/types/ai.ts`，协议依赖：`AST-M-T-05`、`AST-M-T-07`。
4. `G2-2`：实现来源标签与风险标记，产出 `retrieval_mode`、`risk_flags`、`provenance` 透传，代码落点：`src-tauri/src/agent/context_manager.rs`、`src/stores/chatStore.ts`，协议依赖：`AST-M-T-05`、`AST-M-T-07`。
5. `G3-1`：实现显式引用压制，产出显式优先判定和 suppression keys，代码落点：`src-tauri/src/agent/context_manager.rs`、`src/lib/references`，协议依赖：`AST-M-T-05`、`AST-M-T-07`。
6. `G3-2`：实现去重与结果裁剪，产出去重规则、entry/document 级聚合裁剪，代码落点：`src-tauri/src/services/knowledge/query_service.rs`、`src-tauri/src/agent/context_manager.rs`，协议依赖：`AST-M-T-05`、`AST-M-T-07`。

### 实现冻结规则

1. 自动检索结果只允许进入 augmentation 层，不得写入当前文档、当前轮 artifact 或知识资产。
2. 若显式引用已包含同一 `entry_id`、`document_id` 或稳定 citation key，自动检索结果必须被压制或去重。
3. 当前文档、当前轮状态和显式引用中的事实优先级高于自动检索结果；自动检索不得覆盖、替换或重写这些事实。
4. 自动检索结果必须显式标记 `retrieval_mode = automatic`，不得伪装成用户显式引用。

### 依赖关系

依赖 query/result/citation/injection 协议和 `AST-M-P-01`。

### 风险点

1. 自动检索越权
2. augmentation 噪声过大

### 完成标准

1. 层次三可消费知识库自动检索
2. 不会覆盖当前文档事实与显式引用

## 5.9 与 workspace 的接入点

### 开发内容

1. workspace 文件显式存入知识库
2. 资源区知识库入口
3. workspace_path 边界透传

### MVP 语义冻结

1. workspace -> 知识库的 MVP 主路径固定为 `snapshot`，即用户显式选择某个 workspace 文件后，将其当前内容快照写入 `KnowledgeDocument`，并创建独立 `KnowledgeEntry`。
2. `entry_id` 是知识资产稳定身份，绝不等于 `file_path`，也不得复用 workspace 文件路径作为对象主键。
3. workspace 文件发生 rename / move / delete 时，不自动修改既有 knowledge entry；系统只记录 `source_ref` 失配或失效状态，并提示用户选择“忽略 / 重新存入 / 替换版本 / 清理条目”。
4. MVP 默认禁止 workspace -> 知识库自动同步；任何同步都必须由用户显式触发，且必须走 ingestion / replace 主链。
5. 不允许把 workspace 目录扫描结果直接注册为 knowledge entries；只有显式存入动作才能生成 knowledge entry。

### 依赖关系

依赖 ingestion 主链和 entry/document 建模。

### 风险点

1. workspace 文件默认被误当知识条目
2. 当前 workspace 边界丢失

### 完成标准

1. 显式存入路径可用
2. workspace 文件与知识条目语义仍然分离

## 5.10 与 Agent 的接入点

### 开发内容

1. `query_knowledge_base` 接入 `ai_chat_stream`
2. 知识库 augmentation slice 接入 `context_manager.rs`
3. 显式引用标签接入聊天输入框

### 依赖关系

依赖 P1 协议完成。

### 风险点

1. Agent 层误把知识结果当事实裁定层
2. 自动检索结果和 memory/template 冲突

### 完成标准

1. 层次三可稳定消费
2. 注入顺序遵守 `AST-M-P-01`

## 5.11 错误恢复 / Retry / Rollback / Rebuild

### 开发内容

1. stage log
2. rollback / retry 调度
3. rebuild job
4. blocked / suppressed 恢复口径

### 依赖关系

依赖执行链和状态机。

### 风险点

1. replace/delete 中断后数据悬挂
2. rebuild 抢占 active index

### 完成标准

1. 失败链可观测
2. 重建不破坏现有引用稳定性

## 5.12 扩展接口预留

### 开发内容

1. source adapter 抽象
2. sync_mode 控制
3. visibility/access 预留

### 依赖关系

必须晚于主链稳定后进入。

### 风险点

1. 提前引入连接器逻辑污染本地主链
2. 自动把外部数据纳入检索范围

### 完成标准

1. 扩展入口合法但默认关闭
2. 无法绕过对象模型与主执行链

---

## 六、依赖关系与并行策略

### 6.1 必须串行的任务

1. 对象与状态机冻结 -> 持久层 schema -> ingestion pipeline
2. ingestion pipeline -> replace/delete/rebuild
3. query/result/citation/injection 协议 -> Agent 自动检索接入
4. 扩展接口边界冻结 -> 外部源 adapter 设计

### 6.2 可以并行的任务

1. 持久层 schema 与 repository 层实现，可与基础 parser/chunker 接口并行推进
2. query 协议实现，可与聊天输入侧显式引用 UI 对接并行推进
3. execution stage observability，可与 delete/rebuild 恢复逻辑并行推进

### 6.3 不应并行的任务

以下一旦并行容易产生协议冲突：

1. active version 设计与 replace pipeline 同时自由修改
2. citation payload 与 context injection payload 各自独立演化
3. 外部源扩展和主链 schema 同时随意扩字段

### 6.4 文档冻结顺序与开发顺序对应

1. 先冻结 `T-04`
2. 再冻结 `T-05`
3. 再冻结 `T-06`
4. 再冻结 `T-07`
5. 最后冻结 `T-08`

实现顺序与此对应，只允许在后续阶段做增量补充，不允许回头重写核心口径。

---

## 七、风险与治理策略

## 7.1 边界被 memory/template/artifact 污染

- 风险来源：知识库、记忆库、模板库、artifact 都会进入上下文系统。
- 影响：知识库主链被偷换成状态仓、记忆仓或模板仓。
- 预防措施：严格遵守 `AST-M-D-03`, `AST-M-D-02`, `AST-M-T-07`。
- 观测信号：设计中出现“自动归档结果”“将 plan 保存为知识条目”“模板内容作为证据来源”等表述。

## 7.2 workspace 文件系统与知识库语义混淆

- 风险来源：项目文档天然是知识来源候选。
- 影响：文件树与知识库对象模型混在一起，后续 delete/replace/citation 全部返工。
- 预防措施：显式存入、copy/link/snapshot 明确区分。
- 观测信号：实现中直接用 file_path 当 entry_id 或默认把文件夹映射成知识库树。

## 7.3 检索结果不稳定

- 风险来源：版本切换、排序策略变化、payload 不统一。
- 影响：引用和自动检索不可解释，Agent 行为漂移。
- 预防措施：固定 query/result/citation 协议，active version 单点切换。
- 观测信号：同 query 多次返回结果差异大且无法归因。

## 7.4 version / citation / provenance 语义不完整

- 风险来源：先做检索再补版本和 provenance。
- 影响：引用失效、历史结果被静默改写、无法审计。
- 预防措施：version/provenance 必须在 P0 就进入 schema 和协议。
- 观测信号：citation 只带文本片段，不带 document/version/provenance。

## 7.5 自动检索越权

- 风险来源：为了“效果更好”提前放大自动检索。
- 影响：覆盖当前文档事实、压过显式引用。
- 预防措施：只在层次三接入，augmentation-only，显式引用压制。
- 观测信号：prompt 中知识库段落优先于当前文档或显式引用。

## 7.6 替换 / 删除 / 重建链断裂

- 风险来源：双库一致性和回滚路径未做。
- 影响：索引悬挂、文档悬挂、active version 脏写。
- 预防措施：执行阶段状态回写、rollback/retry/rebuild 主链。
- 观测信号：replace/delete 后查询仍命中旧 chunk 或找不到原文。

## 7.7 扩展接口过早侵入

- 风险来源：过早接 connector / sync。
- 影响：主链复杂度暴增，scope 与 access 口径失控。
- 预防措施：P3 后置，默认关闭，adapter 抽象先于接入实现。
- 观测信号：MVP 阶段出现 external connector、scheduled sync、org-wide search 等需求抬头。

## 7.8 文档与实现脱节

- 风险来源：协议未冻结就并行写功能。
- 影响：接口、状态、schema 多头漂移。
- 预防措施：先文档冻结，再进入模块实现。
- 观测信号：同一字段在 Rust/TS/prompt/context 中命名不一致。

---

## 八、开发优先级与任务顺序

明确顺序如下：

1. 先冻结对象与状态机。
2. 再做持久层与双库结构。
3. 再做 ingestion pipeline。
4. 再做 replace / delete / metadata reindex / rebuild。
5. 再做 retrieval / citation / injection 协议实现。
6. 再接 workspace 显式存入与资源入口。
7. 再接 Agent 自动检索和 context assembly。
8. 最后做扩展接口预留与增强能力。

理由：

1. 这是从身份 -> 生命周期 -> 执行 -> 消费 -> 协同 -> 扩展的最小返工路径。
2. 任何颠倒顺序都会在 active version、citation、query payload 或自动检索边界上返工。

---

## 九、验收标准

## 9.1 P0 验收

### 功能验收

1. 可导入、替换、删除、重命名、移动知识对象。
2. 双库落地稳定。

### 协议验收

1. query 返回三层结构。
2. citation/injection payload 字段完整。

### 一致性验收

1. active version 唯一。
2. delete/replace 后无悬挂索引。

### 失败恢复验收

1. replace/delete 失败不会污染 active version。

### 协同验收

1. workspace 文件与知识条目语义仍分离。

### 反例验收

1. 禁止把 workspace 文件路径直接当作 `entry_id` 或知识条目身份。
2. 禁止 workspace 文件一进入工作区就自动成为知识条目。
3. 禁止 replace 后旧 citation 被静默重写到新 version。
4. 禁止 delete 后历史 chunk 仍可被默认 query 命中。

## 9.2 P1 验收

### 功能验收

1. `@知识条目`、拖拽引用、自动检索补强可用。

### 协议验收

1. augmentation payload 与 `AST-M-P-01` 对接成功。

### 一致性验收

1. 显式引用与自动检索去重正确。

### 失败恢复验收

1. 自动检索超时或失败时主流程可继续。

### 协同验收

1. 自动检索不覆盖当前文档和显式引用。

### 反例验收

1. 禁止自动检索覆盖显式引用。
2. 禁止自动检索覆盖当前文档事实。
3. 禁止自动检索结果伪装成用户显式引用。
4. 禁止显式引用对象被自动检索结果重复注入但未去重。

## 9.3 P2 验收

### 功能验收

1. rebuild / retry / rollback 可用。
2. verification_status 对排序与风险暴露生效。

### 协议验收

1. superseded / deleted / unavailable citation 语义稳定。

### 一致性验收

1. rebuild 不破坏原引用稳定性。

### 失败恢复验收

1. 所有关键执行链可恢复或可阻断。

### 协同验收

1. 与 Agent / workspace / context injection 的状态口径一致。

### 反例验收

1. 禁止 replace 后旧引用被静默改写。
2. 禁止 delete 后 chunk 仍能通过默认检索命中。
3. 禁止 rollback 成功后 active version 与检索结果仍不一致。
4. 禁止 verification_status 仅存字段而不影响排序、引用或风险标记。

## 9.4 P3 验收

### 功能验收

1. source adapter 可挂接。
2. sync_mode / visibility 用户控制可用。

### 协议验收

1. 新源仍遵守既有对象和 query/result/citation/injection 协议。

### 一致性验收

1. 外部源接入不破坏主链。

### 失败恢复验收

1. 外部同步失败不会污染本地 active version。

### 协同验收

1. build / discussion-build 只是消费知识，不越权写知识。

### 反例验收

1. 禁止外部源绕过对象模型直接进入检索库。
2. 禁止外部数据默认自动纳入自动检索范围。
3. 禁止扩展接口把 workspace 文件默认等价成知识条目。
4. 禁止新增排序或扩展能力破坏既有 citation 稳定性。

---

## 十、推荐开发任务包

## 10.1 任务包 A：知识对象持久层骨架

- 目标：落五对象 schema、repository、基本状态字段。
- 涉及模块：`workspace.db` / `src-tauri/src/services`
- 依赖：`T-04`
- 产出：表结构、Rust model、repository API
- 风险：字段不全导致后续返工
- 是否需先冻结协议：是

## 10.2 任务包 B：双库与 ingestion 主链

- 目标：完成 ingest 流程与 chunk/index 生成。
- 涉及模块：document store / retrieval store / parser / chunker
- 依赖：任务包 A
- 产出：ingestion pipeline、stage log、错误码
- 风险：引用资格提前暴露
- 是否需先冻结协议：是

### 子任务列表

1. `B1`：文档库存储链。
   产出：`KnowledgeDocument` 落库、blob/path 存储策略、checksum 计算。
   代码落点：`src-tauri/src/services/knowledge/repository`、`src-tauri/src/services/knowledge/document_store.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-06`。
2. `B2`：解析与分块链。
   产出：parser、chunker、`KnowledgeChunk` 批量写入、chunk 定位锚点。
   代码落点：`src-tauri/src/services/knowledge/parser`、`src-tauri/src/services/knowledge/chunker`、`src-tauri/src/services/knowledge/retrieval_store.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-06`。
3. `B3`：执行阶段与状态回写。
   产出：stage log、`pending -> processing -> ready/failed` 回写、失败码。
   代码落点：`src-tauri/src/services/knowledge/execution_stage.rs`、`src-tauri/src/services/knowledge/jobs/ingest_job.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-06`。
4. `B4`：引用资格控制。
   产出：只有 ready/active version 进入默认 query 范围的过滤规则。
   代码落点：`src-tauri/src/services/knowledge/query_service.rs`、`src-tauri/src/services/knowledge/repository`。
   依赖协议：`AST-M-T-04`、`AST-M-T-05`、`AST-M-T-06`。

## 10.3 任务包 C：replace/delete/rebuild 主链

- 目标：完成 active version switch、delete、rollback/rebuild
- 涉及模块：execution stage / version manager / delete manager
- 依赖：任务包 B
- 产出：replace/delete/rebuild job
- 风险：双库一致性断裂
- 是否需先冻结协议：是

### 子任务列表

1. `C1`：replace 与 active version switch。
   产出：新版本写入、切换前校验、切换后旧版本降级为 superseded。
   代码落点：`src-tauri/src/services/knowledge/version_manager.rs`、`src-tauri/src/services/knowledge/jobs/replace_job.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-05`、`AST-M-T-06`。
2. `C2`：delete 主链。
   产出：entry/document/chunk 双库删除或 tombstone 逻辑、默认检索剔除规则。
   代码落点：`src-tauri/src/services/knowledge/delete_manager.rs`、`src-tauri/src/services/knowledge/jobs/delete_job.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-06`。
3. `C3`：metadata reindex / rebuild。
   产出：轻量 reindex、全量 rebuild、阶段回写与锁控制。
   代码落点：`src-tauri/src/services/knowledge/reindex_service.rs`、`src-tauri/src/services/knowledge/jobs/rebuild_job.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-06`。
4. `C4`：retry / rollback。
   产出：失败恢复策略、回滚条件、回滚后状态修复。
   代码落点：`src-tauri/src/services/knowledge/execution_stage.rs`、`src-tauri/src/services/knowledge/recovery.rs`。
   依赖协议：`AST-M-T-04`、`AST-M-T-06`。

## 10.4 任务包 D：query/result/citation/injection 协议实现

- 目标：实现 query API 和三层结果 payload
- 涉及模块：query service / citation validator / TS types
- 依赖：任务包 B、C
- 产出：`query_knowledge_base`、payload types
- 风险：chunk/entry/document 不一致
- 是否需先冻结协议：是

### 子任务列表

1. `D1`：query 输入协议。
   产出：`KnowledgeQueryRequest`、filter/sort/options、错误码。
   代码落点：`src-tauri/src/services/knowledge/query_service.rs`、`src/lib/types/knowledge.ts`。
   依赖协议：`AST-M-T-05`。
2. `D2`：三层结果组装。
   产出：chunk 命中、entry 聚合、document 溯源返回结构。
   代码落点：`src-tauri/src/services/knowledge/query_service.rs`、`src-tauri/src/services/knowledge/result_assembler.rs`。
   依赖协议：`AST-M-T-05`。
3. `D3`：citation validator。
   产出：citation key、version 校验、superseded/deleted/unavailable 识别。
   代码落点：`src-tauri/src/services/knowledge/citation_validator.rs`、`src/lib/types/references.ts`。
   依赖协议：`AST-M-T-04`、`AST-M-T-05`。
4. `D4`：injection payload。
   产出：`KnowledgeInjectionSlice`、provenance/source/risk flags 透传。
   代码落点：`src/lib/types/ai.ts`、`src-tauri/src/services/knowledge/injection_builder.rs`。
   依赖协议：`AST-M-T-05`、`AST-M-T-07`。

## 10.5 任务包 E：workspace 入口与显式存入

- 目标：从 workspace 文件显式创建知识条目
- 涉及模块：workspace resource UI / Tauri command / store
- 依赖：任务包 B
- 产出：显式存入链路
- 风险：workspace 文件和知识条目混淆
- 是否需先冻结协议：否，依赖主链冻结即可

## 10.6 任务包 F：显式引用与聊天输入接入

- 目标：实现 `@知识条目` 与拖拽引用
- 涉及模块：chat input / mention data / reference types
- 依赖：任务包 D
- 产出：Knowledge citation reference UI/协议
- 风险：引用对象字段不完整
- 是否需先冻结协议：是

## 10.7 任务包 G：自动检索协同接入

- 目标：把知识库 augmentation 接入层次三
- 涉及模块：`context_manager.rs` / `ai_chat_stream` / chatStore
- 依赖：任务包 D、F
- 产出：trigger/suppress/downgrade 路径
- 风险：自动检索越权
- 是否需先冻结协议：是

### 子任务列表

1. `G1`：触发判定。
   产出：触发条件、抑制条件、降级条件、观测事件。
   代码落点：`src-tauri/src/agent/context_manager.rs`、`src-tauri/src/agent/ai_chat_stream.rs`。
   依赖协议：`AST-M-T-07`、`AST-M-P-01`。
2. `G2`：augmentation 组装。
   产出：自动检索 `KnowledgeInjectionSlice[]`、来源标记、risk flags。
   代码落点：`src-tauri/src/agent/context_manager.rs`、`src/lib/types/ai.ts`。
   依赖协议：`AST-M-T-05`、`AST-M-T-07`。
3. `G3`：压制与去重。
   产出：显式引用优先规则、重复结果压制、entry/document 级去重。
   代码落点：`src-tauri/src/agent/context_manager.rs`、`src-tauri/src/services/knowledge/query_service.rs`。
   依赖协议：`AST-M-T-05`、`AST-M-T-07`。

### 实施限制

1. `G1` 未完成前，不得接入真正的自动检索执行。
2. `G2` 只能写 augmentation payload，不得直接写 prompt 主事实层。
3. `G3` 未完成前，不得把自动检索与显式引用同时放量上线。

## 10.8 任务包 H：恢复与稳定性增强

- 目标：补齐 retry/rollback/rebuild/observability
- 涉及模块：execution stage / rebuild scheduler / telemetry
- 依赖：任务包 C、D、G
- 产出：失败恢复链与观测事件
- 风险：恢复链污染主状态
- 是否需先冻结协议：是

## 10.9 任务包 I：扩展接口预留

- 目标：留出 source adapter、sync_mode、visibility/access 承接位
- 涉及模块：source adapter / config / policy
- 依赖：任务包 H
- 产出：可关闭的扩展入口
- 风险：扩展过早侵入主链
- 是否需先冻结协议：是

---

## 十一、附录

## 11.1 对开发最关键的依赖图

```text
AST-M-D-03
  -> AST-M-T-03
     -> AST-M-T-04
     -> AST-M-T-05
     -> AST-M-T-06
     -> AST-M-T-07
     -> AST-M-T-08

AST-M-T-04 -> schema / repository / state machine
AST-M-T-05 -> query / citation / injection payload
AST-M-T-06 -> ingest / replace / delete / rebuild jobs
AST-M-T-07 -> layer3 retrieval / context assembly
AST-M-T-08 -> source adapter / sync policy / external boundary
```

## 11.2 仍建议补强后再开发的文档

1. `A-AST-M-T-02_知识库机制.md`：建议补“与 T-03~08 的分工映射”。
2. 后续应补一份工程级 schema / migration 文档或实现规范。
3. 若要做前端完整资源区交互，建议补 workspace 知识库入口实现规范。

## 11.3 推荐的实现先后顺序摘要

1. schema / state
2. ingest
3. replace/delete/rebuild
4. query/citation/injection
5. workspace entry
6. explicit reference
7. auto retrieval
8. stability / recovery
9. extension hooks

## 11.4 若继续拆实施计划，可再拆为

1. 后端数据与执行链实施计划
2. 检索协议与 Agent 接入实施计划
3. workspace UI 与资源区接入实施计划
4. 稳定性与恢复专项实施计划

---

## 十二、来源映射

1. `A-AST-M-D-03_Binder知识库模块描述文档.md`
2. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
3. `A-AST-M-T-02_知识库机制.md`
4. `A-AST-M-T-03_Binder知识库技术主控文档.md`
5. `A-AST-M-T-04_Binder知识库对象与状态机规范.md`
6. `A-AST-M-T-05_Binder知识库检索与引用协议.md`
7. `A-AST-M-T-06_Binder知识库导入与同步执行规范.md`
8. `A-AST-M-T-07_Binder知识库自动检索协同规范.md`
9. `A-AST-M-T-08_Binder知识库扩展边界规范.md`
10. `A-AST-M-P-01_上下文注入.md`
11. `A-AG-M-D-01_Binder Agent能力描述文档.md`
12. `A-AG-M-T-04_Binder Agent技术主控文档.md`
13. `A-WS-M-D-01_workspace工作台协同主控文档.md`
14. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
15. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`
16. `R-AST-M-R-05_Binder知识库模块调研分析报告.md`
