# Binder知识库实现对齐与逻辑闭环审计报告

## 文档头

- 结构编码：`AST-M-R-06`
- 文档属性：`实现审计报告`
- 主责模块：`AST`
- 文档职责：`对 Binder 知识库当前代码实现做文档对齐审计、主链闭环审计、阶段达成审计与越界风险审计`
- 审计范围：`docs/A-AST-M-D-03`, `docs/A-AST-M-T-03`, `docs/A-AST-M-T-04`, `docs/A-AST-M-T-05`, `docs/A-AST-M-T-06`, `docs/A-AST-M-T-07`, `docs/A-AST-M-T-08`, `docs/A-AST-X-L-03`, `docs/A-AST-M-D-02`, `docs/A-AST-M-P-01`, `docs/A-AG-M-T-04`, `docs/A-WS-M-D-01` 与当前知识库相关 Rust/TS/Agent/workspace 代码
- 使用边界：`本报告以代码为主事实来源；文档只定义目标口径，不等于实现已经完成；本报告不改写知识库边界，不替代后续修复设计`

---

## 一、审计范围与判定标准

### 1.1 审计方法

1. 先抽取冻结文档中的对象模型、执行链、协议、自动检索边界、workspace->知识库 MVP 语义与 P0/P1 阶段闸门。
2. 再逐项反查当前代码是否存在真实落点、是否形成调用链、是否真正生效、是否只是类型或 UI 占位。
3. 最后判断当前实现到底是“主链真实成立”还是“表面能跑但未封板”。

### 1.2 判定标准

- `对齐`：文档要求已有代码落点，且已形成真实行为闭环。
- `部分对齐`：主方向正确，但字段、状态、调用链或边界条件仍不完整。
- `未对齐`：文档要求在当前代码中基本不存在。
- `伪对齐`：表面有结构、类型、字段或 UI，但没有真实行为或没有进入主链。
- `越界`：实现了不该拿来证明当前阶段完成的内容，或在前一阶段闸门未闭合前提前进入后置阶段能力。

### 1.3 执行摘要

1. 当前知识库不是“伪系统”，核心主链已经真实落地，尤其是 `ingest / replace / delete / query / citation / rebuild` 这些后端能力已经存在并通过本地测试。
2. 当前实现与文档体系的总体关系应判定为：`主链基本成形，但逐项对齐度只有部分对齐，尚不能判定为严格意义上的 P1 封板通过`。
3. 以 `AST-X-L-03` 的阶段闸门看：
   - P0：功能最小链路基本成立，但严格按文档逐项对齐仍未完全封板。
   - P1：已具备显式引用、自动检索、augmentation 注入、去重等可运行能力，但自动检索压制判定与协议收口仍不足，不能判定为完全通过。
4. 当前不存在明显的知识库边界污染。没有证据表明它被做成 memory、template、workspace 文件系统、历史系统或聊天问答附属物。
5. 当前最危险的问题不是“功能不存在”，而是以下三类逻辑缺口：
   - `T-07` 要求的自动检索压制条件没有真正闭合，当前主要是“取回之后去重”，而不是“取回之前完成充分抑制判定”。
   - `T-05` / `T-07` 要求的结构化 injection 协议在 `context_manager` 前被拍平成字符串，协议字段没有一路保真。
   - `T-04` 的五对象中 `KnowledgeFolder` 只停留在 schema/type 层，尚未进入真实主链，属于典型伪对齐。

---

## 二、文档对齐矩阵

| 文档 | 要求 | 代码落点 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| `AST-M-D-03` | 知识库必须是独立的文档级知识资产，不能等同 memory/template/workspace/chat | `src-tauri/src/services/knowledge/repository.rs:421-454`, `src/components/FileTree/FileTree.tsx:328-345`, `src-tauri/src/commands/ai_commands.rs:725-764` | 对齐 | snapshot 读取严格限制在 workspace 内；显式存入与自动补强分离；未见自动落库或跨模块偷换职责。 |
| `AST-M-D-03` | 五对象主链必须成立 | `src-tauri/src/services/knowledge/types.rs:249-337`, `src-tauri/src/services/knowledge/repository.rs:98-188` | 部分对齐 | `KnowledgeBase / Entry / Document / Chunk` 是真实对象；`KnowledgeFolder` 只有表和类型，没有进入真实执行/消费链。 |
| `AST-M-T-03` | 先做对象主链、执行主链、消费主链，再做增强与扩展 | `src-tauri/src/services/knowledge/*`, `src/components/FileTree/KnowledgeSection.tsx:325-405`, `src-tauri/src/services/knowledge/source_adapter.rs:5-64`, `src-tauri/src/services/knowledge/query_service.rs:143-145` | 部分对齐 | 主链优先方向正确，但在 P1 严格未封板前已出现 policy/source adapter/hybrid 试点，阶段顺序不完全干净。 |
| `AST-M-T-04` | `KnowledgeBase` 需要承接更完整的根对象语义 | `src-tauri/src/services/knowledge/types.rs:249-255` | 部分对齐 | 当前 base 只有 `id/name/description/created_at/updated_at`，未承接更完整的边界/状态语义。 |
| `AST-M-T-04` | `KnowledgeFolder` 必须是正式对象而非占位 | `src-tauri/src/services/knowledge/types.rs:259-268`, `src-tauri/src/services/knowledge/repository.rs:106-116`, `src-tauri/src/services/knowledge/repository.rs:776-787` | 伪对齐 | 有表、有结构、有 `ensure_folder_exists`，但没有 create/list/move folder 的主链，也没有 UI/命令/查询承接。 |
| `AST-M-T-04` | `entry_id != file_path`，workspace 文件不能充当知识资产身份 | `src-tauri/src/services/knowledge/ingestion_service.rs:38-43`, `src-tauri/src/services/knowledge/repository.rs:478-501` | 对齐 | entry 使用独立 `ke_*` ID；workspace 文件只进入 `source_ref`。 |
| `AST-M-T-04` | `source_type/source_ref/sync_mode/visibility/access/verification/deletion/retrieval` 必须进入对象模型并影响行为 | `src-tauri/src/services/knowledge/types.rs:272-290`, `src-tauri/src/services/knowledge/lifecycle_service.rs:283-354`, `src-tauri/src/services/knowledge/query_service.rs:332-345`, `src-tauri/src/services/knowledge/repository.rs:1059-1073` | 部分对齐 | 大多数字段已入模并影响 query/augmentation；但 `ingestion_mode`、更细状态面和 folder/root 语义未完整进入。 |
| `AST-M-T-05` | query 必须返回 chunk / entry / document 三层结果 | `src-tauri/src/services/knowledge/query_service.rs:178-279` | 对齐 | 三层结果真实存在，并非占位。 |
| `AST-M-T-05` | query request 需要完整的范围与控制字段 | `src-tauri/src/services/knowledge/types.rs:581-591` | 部分对齐 | 只有 `knowledge_base_id / entry_id / document_id / limit` 等简化字段，缺 `folder_ids / explicit_entry_ids / 分层 limit` 等要求。 |
| `AST-M-T-05` | citation 必须稳定绑定 version/provenance，并暴露失效语义 | `src-tauri/src/services/knowledge/repository.rs:957-987`, `src-tauri/src/services/knowledge/mod.rs:260-323` | 部分对齐 | 已绑定 `version + provenance`，并能区分 `active/superseded/deleted/unavailable`；但协议字段是 `status`，不是文档口径中的更完整 `staleState`。 |
| `AST-M-T-05` | injection payload 需要保真透传来源、验证、优先级等协议语义 | `src-tauri/src/services/knowledge/types.rs:370-381`, `src-tauri/src/services/knowledge/repository.rs:989-1019`, `src-tauri/src/commands/ai_commands.rs:725-764` | 部分对齐 | 有 `retrieval_mode/risk_flags/citation/provenance`，但缺更完整的 `sourceLabel/verificationStatus/priorityTier` 等规范化字段。 |
| `AST-M-T-06` | ingestion 主链必须形成 `validate -> persist -> parse -> chunk -> index -> qualify -> ready` | `src-tauri/src/services/knowledge/ingestion_service.rs:10-193` | 部分对齐 | `validate/persist/parse/chunk/index/ready` 已成立；`qualify reference` 没有独立阶段或状态约束。 |
| `AST-M-T-06` | replace 必须在新版本 ready 且可引用后再切 active | `src-tauri/src/services/knowledge/ingestion_service.rs:195-387` | 部分对齐 | active 切换放在事务内，未出现外显脏切换；但没有独立 `reference_ready` 语义。 |
| `AST-M-T-06` | delete 必须形成 `pending_delete -> suppress -> remove -> commit` 且双库一致 | `src-tauri/src/services/knowledge/lifecycle_service.rs:10-139` | 部分对齐 | `pending_delete/remove/commit` 真实存在，chunk/document 同步处理；但 `suppress references` 只体现在 `retrieval_status` 改写，没有独立阶段语义。 |
| `AST-M-T-06` | rebuild / retry / rollback 必须可观测、可恢复 | `src-tauri/src/services/knowledge/recovery_service.rs:10-245`, `src-tauri/src/services/knowledge/mod.rs:325-446` | 部分对齐 | rebuild/retry 已有；rollback 主要是 stage log 式“记录成功回滚”，还不是更强的恢复状态机。 |
| `AST-M-T-07` | 自动检索只能 augmentation-only，不得写回文档或知识资产 | `src-tauri/src/services/context_manager.rs:546-564`, `src-tauri/src/commands/ai_commands.rs:725-764`, `src-tauri/src/commands/ai_commands.rs:1255-1307` | 对齐 | knowledge 只进入 augmentation 层；未见写回当前文档或知识对象。 |
| `AST-M-T-07` | 自动检索必须有显式引用优先、当前文档优先、充分抑制与去重 | `src-tauri/src/services/context_manager.rs:436-474`, `src-tauri/src/commands/ai_commands.rs:690-723`, `src-tauri/src/services/knowledge/query_service.rs:282-316` | 部分对齐 | 去重和显式 suppression key 已有；但 `should_trigger_knowledge_retrieval` 只做弱判定，未真正实现“显式引用已足够/仅当前文档/当前文档已足够”级别的抑制。 |
| `AST-M-T-07` | 结构化 augmentation payload 应一路进入上下文消费链 | `src-tauri/src/commands/ai_commands.rs:1255-1366`, `src/stores/chatStore.ts:40-43`, `src/components/Chat/ChatPanel.tsx:178-185`, `src-tauri/src/services/context_manager.rs:316-319` | 部分对齐 | 前端能拿到结构化 slices/warnings/metadata，但进入 `context_manager` 时是 `knowledge_context: Option<String>`，没有保留统一结构化协议直到消费末端。 |
| `AST-M-T-08` | 扩展只能经合法对象链进入，不能绕过 ingestion 直写检索库 | `src-tauri/src/services/knowledge/source_adapter.rs:5-64`, `src-tauri/src/services/knowledge/repository.rs:1027-1073` | 对齐 | 当前只有 `workspace_snapshot/manual_snapshot` 两类 adapter，没有 connector，也没有直接写检索库的路径。 |
| `AST-M-T-08` | 外部数据默认不进入自动检索 | `src-tauri/src/services/knowledge/source_adapter.rs:14-21`, `src-tauri/src/services/knowledge/query_service.rs:332-345` | 对齐 | 只有 `workspace_auto + workspace` 才进入 augmentation 范围。 |
| `AST-X-L-03` | P0 先做对象/双库/ingestion/query/citation/injection，不得被后置项拉歪 | `src-tauri/src/services/knowledge/ingestion_service.rs:10-440`, `src-tauri/src/services/knowledge/query_service.rs:97-279` | 部分对齐 | 主链已经存在，但 `Folder` 和协议完整度仍不足，不能说“逐项完全对齐”。 |
| `AST-X-L-03` | workspace -> 知识库 MVP 必须固定为 snapshot，且默认不自动同步 | `src/components/FileTree/FileTree.tsx:328-345`, `src-tauri/src/services/knowledge/repository.rs:421-454`, `src-tauri/src/services/knowledge/ingestion_service.rs:389-440` | 对齐 | 明确通过显式“存入知识库”走 `upsert_workspace_snapshot`，无自动同步链。 |
| `AST-X-L-03` | workspace rename/move/delete 后应记录 `source_ref` 失配并提示用户处理 | `src-tauri/src/services/knowledge/lifecycle_service.rs:183-244`, `src/components/FileTree/KnowledgeSection.tsx:409-477` | 未对齐 | 当前只有手动 `move_entry` / `replace from source`；没有外部文件变更后的 `source_ref` 失配识别与用户决策链。 |
| `AST-X-L-03` | P1 要形成显式引用 + augmentation + suppression/dedupe 的消费闭环 | `src/hooks/useMentionData.ts:91-128`, `src-tauri/src/commands/ai_commands.rs:1204-1366`, `src/components/Chat/ChatMessages.tsx:293-369` | 部分对齐 | 显式引用、拖拽、augmentation、去重已经存在；但 suppression 判定不够强，不能直接判定 P1 已完全封板。 |
| `AST-X-L-03` | 在前序闸门未完全闭合前，不应拿后置增强能力证明完成 | `src-tauri/src/services/knowledge/source_adapter.rs:5-64`, `src-tauri/src/services/knowledge/query_service.rs:143-145`, `src/components/FileTree/KnowledgeSection.tsx:347-405` | 越界 | 已出现 P3 风格的 policy/source adapter/hybrid 试点；这些实现本身不脏，但不能拿来冲抵 P1 未闭合的问题。 |
| `AST-M-D-02` | Agent 与知识库协同必须坚持显式引用高于自动检索 | `src-tauri/src/commands/ai_commands.rs:690-723`, `src-tauri/src/commands/ai_commands.rs:1293-1300` | 部分对齐 | 自动结果会被显式引用的 entry/document/citation 压制，但当前是“检索后压制”为主，不是“检索前充分抑制”。 |
| `AST-M-P-01` | 知识库 augmentation 应作为上下文注入层，不得改写事实层 | `src-tauri/src/services/context_manager.rs:522-564` | 对齐 | augmentation 位于事实层与引用层之后的 L6，不覆盖当前文档事实。 |
| `AG-M-T-04` | Agent 上下文装配应消费知识库但不能把其当最终裁定层 | `src-tauri/src/services/context_manager.rs:522-564`, `src-tauri/src/commands/ai_commands.rs:730-763` | 对齐 | knowledge prompt 明确声明“仅作 augmentation 补强”。 |
| `WS-M-D-01` | workspace 资源区需要承接显式存入与知识库消费，但不能把文件树等同知识库树 | `src/components/FileTree/FileTree.tsx:328-345`, `src/components/FileTree/KnowledgeSection.tsx:95-237` | 部分对齐 | 显式存入和知识库分区已分开；但 folder 树/失配治理未完成，工作台侧仍未形成更完整的知识资产管理语义。 |

---

## 三、主链逻辑闭环审计

### 3.1 对象链

- 判定：`部分成立`
- 已成立：
  - `KnowledgeBase / Entry / Document / Chunk` 真实存在于 schema、Rust 类型和 query/write 主链中。
  - `entry_id != file_path` 已被严格落实。
- 未闭合：
  - `KnowledgeFolder` 只有 schema/type 校验，没有形成 create/list/query/UI/command 主链。
  - 根对象和 folder 对象的更完整状态/边界语义未落地。

### 3.2 执行链

- 判定：`部分成立`
- 已成立：
  - `ingestion -> parse -> chunk -> index -> ready` 可运行。
  - `replace -> version++ -> old superseded -> new active` 可运行。
  - `delete -> pending_delete -> remove -> commit` 可运行。
- 漏洞与缺口：
  - `qualify reference` / `reference_ready` 没有独立状态约束。
  - delete 的 `suppress references` 只是字段改写，没有单独阶段语义。
  - rollback 更像“记录已回滚”，不是更严格的恢复状态机。

### 3.3 检索链

- 判定：`部分成立`
- 已成立：
  - `query_knowledge_base` 返回 chunk/entry/document 三层结果。
  - verified 排序、warnings、metadata、hybrid 降级都真实生效。
- 漏洞与缺口：
  - request scope 简化过度，缺 `folder` 级范围与更细粒度结果控制。
  - 协议字段与 `T-05` 仍有明显收缩。

### 3.4 引用链

- 判定：`部分成立`
- 已成立：
  - 显式 `@知识库/@条目` 与拖拽引用可以进入聊天输入。
  - query 结果可以生成 citation/injection，并在前端消息上展示。
- 漏洞与缺口：
  - injection 协议在进入 `context_manager` 前被拍平成字符串。
  - citation/injection 字段比文档冻结口径更薄，属于“能用但未完全对齐”。

### 3.5 自动检索链

- 判定：`存在逻辑漏洞`
- 已成立：
  - `trigger -> retrieve -> build augmentation -> dedupe -> inject` 链路真实存在。
  - augmentation-only、timeout 降级、显式引用去重都存在。
- 核心漏洞：
  - `should_trigger_knowledge_retrieval` 只根据消息长度、编辑态、文件操作意图和“显式引用+短消息”做弱抑制。
  - 文档要求的“显式引用已足够”“当前文档已足够”“only current doc”这类高优先级抑制尚未落地。
  - 当前更像“先检索，再裁剪”，而不是“先判断是否该检索”。

### 3.6 workspace 接入链

- 判定：`部分成立`
- 已成立：
  - workspace 文件只能通过显式 `snapshot` 存入知识库。
  - `source_ref` 使用 workspace 相对路径，且读取被限制在当前 workspace 边界内。
  - 二次存入相同 `source_ref` 会走显式 replace 链，而不是自动同步。
- 未闭合：
  - 缺少 workspace 文件被外部 rename/move/delete 后的 `source_ref` 失配记录与提示链。
  - 当前只有手动“从源文件替换”，没有文档要求的“忽略/重新存入/替换版本/清理条目”决策面。

### 3.7 稳定性与恢复链

- 判定：`部分成立`
- 已成立：
  - citation 绑定 `version + provenance`。
  - replace 后旧版本 citation 不被静默改写。
  - rebuild/retry 已形成基本恢复链。
- 未闭合：
  - rollback 是轻量 stage 级恢复，不是更强的稳定态回退框架。
  - failure handling 的状态面仍偏轻，`blocked / manual_intervention` 一类治理语义不足。

### 3.8 边界防污染链

- 判定：`已成立`
- 审计结论：
  - 没有证据表明知识库被做成 memory、template 或聊天问答附属物。
  - 没有证据表明 workspace 文件树被直接当作知识库树。
  - 没有证据表明当前知识库实现错误承接了历史系统主职责。
  - 历史专项审计明确指出 `HistorySection/localStorage`、`pending diff`、`agent_tasks/artifacts` 等只是伪历史或邻接结构；当前知识库代码没有把这些结构偷偷并入知识库主链。

---

## 四、关键缺口清单

| 问题类型 | 问题描述 | 影响 | 对应代码位置 | 对应文档要求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| 伪完成项 | `KnowledgeFolder` 只有 schema/type，没有真实主链 | 五对象模型未真正闭环，P0 文档对齐度被高估 | `src-tauri/src/services/knowledge/types.rs:259-268`, `src-tauri/src/services/knowledge/repository.rs:106-116`, `src-tauri/src/services/knowledge/repository.rs:776-787` | `AST-M-T-04`, `AST-X-L-03` | 高 |
| 断链项 | ingestion 缺 `qualify reference` / `reference_ready` 语义 | entry 在 ready 后直接进入 query，可引用资格没有独立闸门 | `src-tauri/src/services/knowledge/ingestion_service.rs:151-177` | `AST-M-T-06` | 高 |
| 高风险逻辑漏洞 | 自动检索压制判定过弱，主要靠检索后去重 | 容易把“本不该检索”的请求先检索一遍，P1 边界不够硬 | `src-tauri/src/services/context_manager.rs:436-474`, `src-tauri/src/commands/ai_commands.rs:1238-1307` | `AST-M-T-07`, `AST-X-L-03` | 高 |
| 断链项 | 结构化 injection 到 `context_manager` 前被拍平成字符串 | 协议字段没有一路保真，后续很难严格落实 `T-05/T-07` | `src-tauri/src/services/context_manager.rs:316-319`, `src-tauri/src/commands/ai_commands.rs:725-764` | `AST-M-T-05`, `AST-M-P-01`, `AST-M-T-07` | 高 |
| 部分实现 | query request 范围控制与协议字段过薄 | 检索协议对齐度不足，后续消费面与扩展面都容易返工 | `src-tauri/src/services/knowledge/types.rs:581-591` | `AST-M-T-05` | 中 |
| 部分实现 | citation/injection 只有简化字段，未完全达成文档协议 | 前端、Agent、审计展示可解释性不足 | `src-tauri/src/services/knowledge/types.rs:354-381`, `src-tauri/src/services/knowledge/repository.rs:957-1019` | `AST-M-T-05` | 中 |
| 未对齐 | workspace 文件 rename/move/delete 后的 `source_ref` 失配治理不存在 | workspace->知识库 MVP 语义没有完整闭环，用户无法看到失配状态和补救选项 | `src-tauri/src/services/knowledge/lifecycle_service.rs:183-244`, `src/components/FileTree/KnowledgeSection.tsx:409-477` | `AST-X-L-03`, `WS-M-D-01` | 高 |
| 部分实现 | delete 没有独立“suppress references”阶段语义 | 状态机和执行链对齐度不足，可观测性偏弱 | `src-tauri/src/services/knowledge/lifecycle_service.rs:32-109` | `AST-M-T-06` | 中 |
| 越界项 | P1 未完全闭合前已出现 hybrid/source adapter/policy 控制 | 阶段顺序被提前拉伸，容易掩盖主链未闭合问题 | `src-tauri/src/services/knowledge/query_service.rs:143-145`, `src-tauri/src/services/knowledge/source_adapter.rs:5-64`, `src/components/FileTree/KnowledgeSection.tsx:347-405` | `AST-X-L-03` | 中 |

---

## 五、P0 / P1 阶段达成审计

### 5.1 P0 达成审计

- 结论：`功能验收基本成立，但严格口径下未完全封板`

#### 已满足

1. 能导入文档并生成 chunk。
2. 能替换文档并切 active version。
3. 能删除 entry 并让默认 query 不再命中。
4. query 返回 chunk/entry/document 三层结果。
5. citation 已稳定绑定 version 与 provenance。
6. workspace snapshot 显式存入、`entry_id != file_path`、默认不自动同步都已成立。

#### 未满足

1. 五对象里 `KnowledgeFolder` 没有真正进入主链，严格上不能算五对象全部落地。
2. `T-06` 的 `qualify reference` 没有独立阶段或状态，不符合执行链完整口径。
3. `T-05` 协议是“可运行的简化版”，不是逐项完整对齐版。

#### 判断

- 如果只按 `AST-X-L-03` 的最小功能验收看，P0 已非常接近通过。
- 如果按“文档要求 -> 代码落点”的严格实现审计看，P0 仍应审计为 `未完全封板`。

### 5.2 P1 达成审计

- 结论：`未真正封板通过`

#### 已满足

1. 显式知识引用、拖拽引用、`@知识库/@条目` 已可用。
2. 自动检索只进入 augmentation，不写回当前文档或知识资产。
3. entry/document/citation 级去重和显式 suppression keys 已存在。
4. query 超时/失败/空结果可以降级，不阻塞聊天主链。

#### 未满足

1. 自动检索的触发/抑制判定没有达到 `T-07` 要求的强边界。
2. 显式引用优先更多体现在“检索后压制”，不是“检索前充分抑制”。
3. augmentation 协议没有一路结构化消费到 `context_manager` 末端。

#### 非阻断债项

1. `risk_flags / warnings` 的独立聊天 UI 不应作为 P1 阻断项；而且当前代码已经有基本展示。
2. `@知识库` 根对象不应作为 P1 缺陷；而且当前代码已实现根对象拖拽和 mention。

#### 判断

- 当前实现不是“表面能跑但完全空心”。
- 但它也不是文档冻结口径下的 `P1 封板通过`。
- 更准确的判断应是：`P1 已形成可运行消费链，但未完成严格封板`。

---

## 六、越界与污染风险审计

### 6.1 历史系统污染

- 判定：`未发现污染`
- 依据：
  - 历史专项审计已明确，`HistorySection/localStorage`、`pending diff`、`agent_tasks/artifacts`、`knowledge_documents(version)` 分别属于伪历史、候选链、任务链或平行版本链，不能混当历史系统。
  - 当前知识库实现没有把这些历史邻接结构纳入知识库主链。

### 6.2 记忆库 / 模板库污染

- 判定：`未发现污染`
- 依据：
  - 自动检索与 memory 注入在 `ContextManager` 中并列但分层。
  - 知识库没有承担模板或长期记忆的写入职责。

### 6.3 workspace 文件系统污染

- 判定：`基本守住，但治理链未闭合`
- 依据：
  - workspace 文件不会自动成为知识条目。
  - 只有显式 snapshot ingest 才能创建或更新 knowledge entry。
  - 但 workspace 外部变更后的 `source_ref` 失配治理没有实现完全。

### 6.4 企业搜索 / 连接器语义侵入

- 判定：`未发现污染`
- 依据：
  - 当前 adapter 只承接 `workspace_snapshot/manual_snapshot`。
  - 没有 connector、没有外部数据直写检索库、没有默认跨源自动检索。

### 6.5 阶段越界风险

- 判定：`存在轻度越界`
- 说明：
  - `source adapter / policy / hybrid retrieval` 已经进入代码。
  - 这些实现目前没有破坏主链，但在 P1 严格未封板前提前出现，会掩盖真正的封板阻断项。

---

## 七、结论与修复建议

### 7.1 最终结论

1. 当前实现不能判定为“只是表面能跑”。核心知识库主链已经真实存在。
2. 当前实现也不能判定为“严格意义上的 P1 已封板通过”。
3. 最准确的结论是：
   - `P0 已形成真实可运行主链，但严格对齐口径下未完全封板。`
   - `P1 已形成真实消费链，但自动检索边界和协议收口仍未闭合，因此不应判定为正式通过。`

### 7.2 当前阻断项

1. 补强 `should_trigger_knowledge_retrieval`，把“显式引用已足够 / 当前文档已足够 / only current doc / blocked”做成真正的前置抑制，而不是仅靠后置去重。
2. 把 `KnowledgeInjectionSlice[]` 的结构化协议保留到 `context_manager` 消费末端，不要过早拍平成字符串。
3. 处理 `KnowledgeFolder` 伪对齐问题。
   - 要么明确延期并从当前阶段口径里剥离。
   - 要么补齐 create/list/move/query/UI 的最小主链。
4. 补 workspace `source_ref` 失配治理。
   - 至少要能识别外部 rename/move/delete 后的失配状态。
   - 至少要能给用户明确的补救动作。

### 7.3 可挂账债项

1. citation/injection 协议字段与文档完全一致化。
2. 更细的 rollback/blocked/manual intervention 状态面。
3. 更完整的 query scope 控制字段。

### 7.4 当前不要修的东西

1. 不要继续扩大 connector、企业搜索、复杂 RAG。
2. 不要用 hybrid/rerank 或更多 UI 装饰掩盖 P1 主链缺口。
3. 不要把历史、记忆、模板、workspace 变化监听强行并入知识库主链。

### 7.5 审计结论一句话

**当前知识库实现已经不是空壳，但仍应判定为“P1 可运行、未封板”；最主要的问题不是缺功能，而是自动检索边界、协议保真和 workspace 失配治理还没有真正闭环。**
