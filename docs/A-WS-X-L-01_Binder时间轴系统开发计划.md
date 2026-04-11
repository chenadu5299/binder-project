# Binder 时间轴系统开发计划

## 文档头

- 结构编码：`WS-X-L-01`
- 文档属性：`主结构`
- 主责模块：`WS`
- 文档职责：`Binder 时间轴系统开发计划 / 时间轴开发顺序、阶段拆分、测试验收与交付收口主控`
- 上游约束：`CORE-C-D-02`, `WS-M-D-01`, `WS-M-D-02`, `WS-M-T-06`, `WS-M-T-07`, `WS-M-T-08`, `WS-M-T-09`, `A-VAL-X-R-04`
- 直接承接：无
- 接口耦合：`DE-M-D-01`, `WS-M-T-03`, `WS-M-T-04`, `WS-M-T-05`, `SYS-I-P-01`
- 汇聚影响：`CORE-C-R-01`, `WS-M-D-01`, `WS-M-D-02`, `WS-M-T-06`, `WS-M-T-07`, `WS-M-T-08`, `WS-M-T-09`
- 扩散检查：`src/services/documentService.ts`, `src/stores/editorStore.ts`, `src/stores/fileStore.ts`, `src/components/FileTree/HistorySection.tsx`, `src/components/FileTree/ResourceToolbar.tsx`, `src-tauri/src/workspace/workspace_db.rs`, `src-tauri/src/workspace/workspace_commands.rs`, `src-tauri/src/commands/file_commands.rs`, `src-tauri/src/services/tool_service.rs`
- 使用边界：`定义时间轴系统的开发顺序、阶段目标、改动范围、验收要求和规则映射，不重写产品语义与技术主控规则`
- 变更要求：`修改本文后，必须复核时间轴描述文档、时间轴技术主控文档、专项规则文档、文档结构清单与测试映射`
- 规则映射要求：`本文规则统一使用 TL-PLAN-R-*，并映射到 TL-MAIN-R-* / TL-GEN-R-* / TL-STORE-R-* / TL-RESTORE-R-*`

---

## 阶段总表

| 阶段 | 阶段名称 | 目标 | 主要依赖 | 主要产出 | 是否可并行 |
|---|---|---|---|---|---|
| `P0` | 统一收口冻结 | 冻结成立入口清单、统一提交收口口径、阶段接口边界 | 上游文档已冻结 | `TimelineCommit` 接口口径、模块清单、测试映射骨架 | 否 |
| `P1` | 时间轴事实层 | 建立正式时间轴节点与断点载荷持久化基础 | `P0` | `workspace.db` 时间轴表、仓储接口、查询接口骨架 | 否 |
| `P2` | 节点生成链 | 建立统一准入判断、实际状态变化过滤、节点构造链 | `P1` | `TimelineCommit Adapter`、变化判定器、节点构造器 | 否 |
| `P3` | 成立入口接入 | 将真实成立入口接入统一时间轴生成主链 | `P2` | `saveFile` / `accept_file_diffs` / 资源操作 / 工具直写接入 | 部分并行 |
| `P4` | UI 承接迁移 | 让工作台“时间轴”标签读取正式事实层，退出 localStorage 占位主链 | `P1`、`P3` | 时间轴列表、时间轴节点详情、占位逻辑隔离 | 部分并行 |
| `P5` | 时间轴还原 | 建立还原预览、确认、执行、刷新、再入链 | `P1`、`P2`、`P3` | `restore_timeline_node` 主链、确认弹窗、还原后新节点 | 否 |
| `P6` | 兼容与清理 | 收口 50 条裁剪、旧占位清退、兼容边界与隔离规则 | `P3`、`P4`、`P5` | 正式上限生效、旧占位退出主链、兼容清理 | 部分并行 |
| `P7` | 测试与验收 | 完成功能、边界、隔离、恢复与验收验证 | `P3`、`P4`、`P5`、`P6` | 测试用例、验收清单、完成定义闭环 | 否 |

---

## 1. 计划目标与适用范围

### 1.1 本计划解决什么问题

本计划解决以下问题：

1. 时间轴系统按什么顺序进入开发。
2. 每一阶段先做什么、后做什么。
3. 每一阶段依赖什么、修改什么、产出什么。
4. 时间轴节点生成、时间轴列表、时间轴还原如何形成可开发闭环。
5. 开发与测试如何直接承接已冻结的文档规则。

### 1.2 本计划不解决什么问题

本计划不负责：

1. 重新定义时间轴产品语义。
2. 改写时间轴节点粒度与还原语义。
3. 把时间轴扩展到 AI 过程、task / artifact、外部同步或 cache 历史。
4. 替代数据库最终字段定稿文档和具体 UI 视觉稿。

### 1.3 本计划承接哪些文档

本计划直接承接以下文档：

1. [A-WS-M-D-02_Binder时间轴功能描述文档.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/A-WS-M-D-02_Binder时间轴功能描述文档.md)
2. [A-WS-M-T-06_Binder时间轴系统技术主控文档.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/A-WS-M-T-06_Binder时间轴系统技术主控文档.md)
3. [A-WS-M-T-07_时间轴节点生成与准入规则.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/A-WS-M-T-07_时间轴节点生成与准入规则.md)
4. [A-WS-M-T-08_时间轴存储模型与持久化.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/A-WS-M-T-08_时间轴存储模型与持久化.md)
5. [A-WS-M-T-09_时间轴还原执行链.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/A-WS-M-T-09_时间轴还原执行链.md)

### 1.4 本计划服务哪些角色

本计划服务于：

1. 开发任务拆分
2. 技术评审
3. 测试计划设计
4. 验收口径收口

---

## 2. 计划依据

### 2.1 必须遵守的总则

本计划开发全过程必须遵守以下总则：

1. 时间轴只记录项目逻辑状态的已成立变更。
2. 时间轴节点粒度是状态断点粒度，不是操作日志粒度、diff 粒度或 task 粒度。
3. 还原面向状态断点，不是操作逆放，不是 diff 重放。
4. 成立入口成功不等于必然新增节点，只有相对上一已成立状态发生实际变化时才新增节点。
5. 当前阶段范围只覆盖工作区文件内容状态与资源结构状态。
6. 当前系统没有正式时间轴事实层，只有若干状态成立入口，因此必须先解决统一收口，再做展示和还原。

### 2.2 描述文档冻结结论

来自描述文档的冻结结论包括：

1. 时间轴的唯一主语是“项目逻辑状态的已成立变更”。
2. 当前阶段只覆盖工作区文件内容状态与资源结构状态。
3. 时间轴节点对应“一次已成立状态变更 + 一个可还原状态断点”。
4. 时间轴还原恢复的是状态断点，不是单次操作逆转。
5. 50 条上限只作用于正式时间轴节点。
6. 当前前端 UI 继续沿用“时间轴”标签，旧 `HistorySection` 只作为迁移承载壳。

### 2.3 技术主控与专项文档关键主张

当前技术主链已经冻结以下主张：

1. 时间轴必须通过统一的 `TimelineCommit Adapter` 收口。
2. 节点生成采用“基于成立点收口、并以实际状态变化过滤”为准的策略。
3. 正式时间轴事实层必须落在 `workspace.db`。
4. 正式存储采用“节点元信息 + 断点载荷”分层存储。
5. 时间轴还原成功且状态确实变化时，必须生成新节点。
6. pending diff、AI 过程、task / artifact、外部同步、cache 刷新都不得进入时间轴主链。

### 2.4 当前代码现实状态

当前代码已经存在以下真实成立入口：

1. `src/services/documentService.ts` 的 `saveFile`
2. `src-tauri/src/workspace/workspace_commands.rs` 的 `accept_file_diffs`
3. `src-tauri/src/commands/file_commands.rs` 的 `create_file`
4. `src-tauri/src/commands/file_commands.rs` 的 `create_folder`
5. `src-tauri/src/commands/file_commands.rs` 的 `rename_file`
6. `src-tauri/src/commands/file_commands.rs` 的 `delete_file`
7. `src-tauri/src/commands/file_commands.rs` 的 `duplicate_file`
8. `src-tauri/src/commands/file_commands.rs` 的 `move_file`
9. `src-tauri/src/services/tool_service.rs` 的 `update_file(use_diff=false)`
10. `src-tauri/src/services/tool_service.rs` 的 `create_file` 工具分支
11. `src-tauri/src/services/tool_service.rs` 的 `delete_file` / `move_file` / `rename_file` / `create_folder` 工具分支

当前代码的真实缺失项包括：

1. 没有正式时间轴事实层
2. 没有正式时间轴节点持久化
3. 没有状态断点还原执行链
4. 没有各成立入口的统一收口层
5. “时间轴”标签尚未承接正式事实层
6. `HistorySection` 仍使用 localStorage 占位逻辑

### 2.5 必须隔离的对象

以下对象必须在开发全过程中保持隔离，不得误接入时间轴主链：

1. `pending diff`
2. `DiffCard / FileDiffCard`
3. `agent_tasks / agent_artifacts`
4. `file_cache`
5. `baseline / revision / snapshot`
6. 外部修改同步
7. localStorage 占位时间轴

---

## 3. 总体开发策略

### 3.1 开发排序原则

开发顺序冻结为：

1. 先冻结统一收口接口和阶段边界
2. 再建立正式时间轴事实层
3. 再建立节点生成链
4. 再接入各成立入口
5. 再让 UI 承接正式时间轴列表
6. 再实现时间轴还原
7. 最后做裁剪、迁移、兼容和测试收口

这样排序的原因是：

1. 如果先做 UI，会继续沿用占位逻辑，时间轴仍会漂在事实层之外。
2. 如果先做还原，但没有断点载荷模型，还原会退化成操作逆放。
3. 如果不先做统一收口，多入口会各自生成节点，最终口径分裂。

### 3.2 关键路径说明

本次开发的关键路径是：

`P0 统一收口冻结 -> P1 时间轴事实层 -> P2 节点生成链 -> P3 成立入口接入 -> P5 时间轴还原 -> P7 测试与验收`

这条链是关键路径，原因是：

1. `P1` 不完成，UI 和还原都没有正式数据源。
2. `P2` 不完成，各入口不能统一判定“是否生成节点”。
3. `P3` 不完成，时间轴系统没有真实节点来源。
4. `P5` 不完成，时间轴只会展示，不具备核心用户动作。
5. `P7` 不完成，50 条上限、隔离边界和恢复稳定性无法正式验收。

### 3.3 并行性说明

可以并行的任务：

1. `P1` 后半段的前端查询接口骨架与 `P2` 的后端准入判断可以并行。
2. `P3` 中 `file_commands` 资源入口接入和 `tool_service` 直接写盘入口接入可以并行。
3. `P4` 的 UI 列表组件改造和 `P6` 的 localStorage 清退策略实现可以部分并行。

不能并行的任务：

1. `P1` 与 `P2` 不能倒置，先有事实层，后有稳定写入链。
2. `P2` 与 `P3` 不能倒置，先统一准入判断，后接入口。
3. `P5` 不能早于 `P1/P2/P3`，否则还原链无法基于正式节点和断点载荷工作。
4. `P7` 不能早于 `P6`，否则测试对象仍处于占位与正式实现混杂状态。

### 3.4 当前阶段主风险

当前阶段最大的开发风险是：

1. 多入口各自直接写时间轴，导致节点生成口径不一致。
2. `saveFile`、`accept_file_diffs`、资源操作、工具直写之间的“实际状态变化”判断口径不一致。
3. 把 `file_cache`、外部同步、pending diff 或 localStorage 占位误当时间轴事实源。
4. 还原链没有前置阻断，覆盖 dirty 编辑器或外部修改待处理状态。

---

## 4. 开发阶段拆分

### 4.1 `P0` 统一收口冻结

#### 阶段目标

冻结时间轴开发的统一收口策略、成立入口清单、统一提交对象和测试映射骨架，避免后续边做边改口径。

#### 依赖前提

1. 时间轴描述文档已冻结
2. 时间轴技术主控与专项文档已形成

#### 模块级改动范围

1. `docs/A-WS-X-L-01_Binder时间轴系统开发计划.md`
2. 视需要补充 `docs/A-WS-M-T-06_Binder时间轴系统技术主控文档.md`
3. 新增前端类型文件，例如 `src/types/timeline.ts`
4. 新增后端类型文件，例如 `src-tauri/src/workspace/timeline_types.rs`

#### 核心开发任务

1. 冻结真实成立入口清单
2. 冻结统一 `StateCommitCandidate / TimelineCommitRequest` 对象
3. 冻结入口到规则、规则到测试的映射骨架

#### 步骤拆分

##### `P0-1` 冻结成立入口注册表

- 目标：把当前真实成立入口固化为开发清单，不允许后续遗漏或私接。
- 依赖：无
- 修改范围：
  - `src/services/documentService.ts`
  - `src-tauri/src/workspace/workspace_commands.rs`
  - `src-tauri/src/commands/file_commands.rs`
  - `src-tauri/src/services/tool_service.rs`
- 完成标准：
  - 形成一份入口枚举表
  - 每个入口明确标记为“文件内容成立入口”或“资源结构成立入口”
  - 明确哪些入口绝不进入时间轴

##### `P0-2` 冻结统一提交对象

- 目标：定义统一的时间轴提交候选对象，供后续所有入口共用。
- 依赖：`P0-1`
- 修改范围：
  - `src/types/timeline.ts` 新增
  - `src-tauri/src/workspace/timeline_types.rs` 新增
- 完成标准：
  - 至少有 `file_content` 与 `resource_structure` 两类候选对象
  - 包含来源、作用对象、前态、后态、actor、workspace 识别信息
  - 不把 pending diff / cache / external_sync 放入合法来源集合

##### `P0-3` 冻结阶段与测试映射骨架

- 目标：明确每阶段对应哪些规则 ID、哪些测试点。
- 依赖：`P0-1`、`P0-2`
- 修改范围：
  - 本文规则映射章节
  - 测试用例骨架文档或任务清单
- 完成标准：
  - `P1-P7` 均能映射到主规则与专项规则
  - 形成功能、边界、隔离三类测试分类表

#### 预期产出

1. 成立入口注册表
2. 统一提交对象定义
3. 阶段到规则、规则到测试的映射骨架

#### 验收标准

1. 开发不再存在“某入口是否属于时间轴”的模糊地带
2. 后续阶段均以统一提交对象为输入
3. 测试可按阶段承接

#### 风险点

1. 成立入口漏列
2. 提交对象定义过弱，后续无法承接 restore payload

#### 是否可并行

否。`P0` 是后续全部阶段的前置冻结层。

---

### 4.2 `P1` 时间轴事实层

#### 阶段目标

建立正式时间轴事实层，包括节点表、断点载荷表、仓储接口和基础查询能力。

#### 依赖前提

`P0` 完成

#### 模块级改动范围

1. `src-tauri/src/workspace/workspace_db.rs`
2. `src-tauri/src/workspace/` 下新增 `timeline_repository.rs` 或 `timeline_service.rs`
3. `src-tauri/src/lib.rs` 或命令注册入口
4. `src/services/timelineService.ts` 新增
5. `src/stores/timelineStore.ts` 新增

#### 核心开发任务

1. 在 `workspace.db` 中新增时间轴节点和断点载荷存储
2. 建立节点插入、查询、裁剪、载荷读取接口
3. 让前端具备读取正式时间轴列表的基础接口

#### 步骤拆分

##### `P1-1` 新增时间轴节点表和断点载荷表

- 目标：在 `workspace.db` 中建立正式时间轴存储基础。
- 依赖：`P0-2`
- 修改范围：
  - `src-tauri/src/workspace/workspace_db.rs`
- 完成标准：
  - 存在 `timeline_nodes`
  - 存在 `timeline_restore_payloads`
  - 节点表与载荷表可独立查询、联合删除

##### `P1-2` 建立仓储接口

- 目标：提供正式的读写接口，替代 localStorage 占位数据源。
- 依赖：`P1-1`
- 修改范围：
  - `src-tauri/src/workspace/timeline_repository.rs` 新增
  - 或 `src-tauri/src/workspace/workspace_db.rs` 增补
- 完成标准：
  - 支持 `insertNode`
  - 支持 `listNodes`
  - 支持 `getNode`
  - 支持 `getPayload`
  - 支持 `trimToLimit`

##### `P1-3` 打通前端时间轴读取接口

- 目标：前端可从 Tauri 读取正式时间轴列表。
- 依赖：`P1-2`
- 修改范围：
  - `src-tauri/src/commands/timeline_commands.rs` 新增
  - `src/services/timelineService.ts` 新增
  - `src/stores/timelineStore.ts` 新增
- 完成标准：
  - 工作台可读取正式时间轴列表
  - 不依赖 localStorage
  - 读取接口支持按 workspace 维度查询

##### `P1-4` 实现 50 条裁剪基础能力

- 目标：确保正式节点写入后可稳定裁剪。
- 依赖：`P1-2`
- 修改范围：
  - `src-tauri/src/workspace/timeline_repository.rs`
  - `src-tauri/src/workspace/workspace_db.rs`
- 完成标准：
  - 插入节点后可保留最新 50 条
  - 被裁剪节点关联载荷同步清理

#### 预期产出

1. 正式时间轴事实层
2. 节点与载荷基础仓储
3. 前端读取正式时间轴列表的 API 骨架

#### 验收标准

1. 可在空业务接入下手工插入和读取正式时间轴节点
2. 裁剪规则在仓储层生效
3. UI 不再依赖 localStorage 才能显示列表

#### 风险点

1. 表结构不足以承接 restore payload
2. 节点与载荷不同步写入导致事实层残缺

#### 是否可并行

前端读取接口骨架与仓储实现后半段可部分并行，但表结构与仓储接口必须先完成。

---

### 4.3 `P2` 节点生成链

#### 阶段目标

建立统一的 `TimelineCommit Adapter`、实际状态变化判断器和节点构造链。

#### 依赖前提

`P1` 完成

#### 模块级改动范围

1. `src-tauri/src/workspace/timeline_service.rs` 新增
2. `src-tauri/src/workspace/timeline_repository.rs`
3. `src/types/timeline.ts`
4. `src/services/timelineService.ts`

#### 核心开发任务

1. 统一不同入口的时间轴候选提交格式
2. 实现“实际状态变化过滤”
3. 构造节点元信息和断点载荷

#### 步骤拆分

##### `P2-1` 实现 `TimelineCommit Adapter`

- 目标：建立统一的时间轴提交入口。
- 依赖：`P1-2`
- 修改范围：
  - `src-tauri/src/workspace/timeline_service.rs`
- 完成标准：
  - 所有成立入口最终都能调用同一个适配层
  - 适配层不接受 pending diff / external_sync / cache_sync 来源

##### `P2-2` 实现文件内容变化判定器

- 目标：判断文件内容类提交是否形成实际状态变化。
- 依赖：`P2-1`
- 修改范围：
  - `src-tauri/src/workspace/timeline_service.rs`
  - 视需要新增内容规范化工具
- 完成标准：
  - 同内容重复保存不生成节点
  - 自动保存与手动保存使用同一判定器

##### `P2-3` 实现资源结构变化判定器

- 目标：判断资源结构类提交是否形成实际状态变化。
- 依赖：`P2-1`
- 修改范围：
  - `src-tauri/src/workspace/timeline_service.rs`
  - `src-tauri/src/commands/file_commands.rs`
- 完成标准：
  - 创建、删除、重命名、移动、复制按前后状态差异判定
  - 无实际结构变化的空操作不生成节点

##### `P2-4` 实现节点构造与断点载荷构造器

- 目标：把通过过滤的提交转换成可展示、可还原的正式节点。
- 依赖：`P2-2`、`P2-3`
- 修改范围：
  - `src-tauri/src/workspace/timeline_service.rs`
  - `src-tauri/src/workspace/timeline_repository.rs`
- 完成标准：
  - 一个成立动作默认生成一个节点
  - 多资源变化通过 `impact_scope` 收口到单节点
  - 节点可绑定对应载荷

#### 预期产出

1. 统一时间轴提交适配层
2. 实际状态变化过滤器
3. 正式节点构造器

#### 验收标准

1. 同一套准入规则可被 `saveFile`、资源操作、工具直写共用
2. 空操作不生成节点
3. 外部同步、cache sync、pending diff 不进入适配层主链

#### 风险点

1. 内容比较与结构比较口径不一致
2. 过度依赖前端状态，导致后端入口不能复用

#### 是否可并行

`P2-2` 和 `P2-3` 可并行，适配层和节点构造器必须串行收口。

---

### 4.4 `P3` 成立入口接入

#### 阶段目标

把全部真实成立入口接入统一时间轴节点生成链。

#### 依赖前提

`P2` 完成

#### 模块级改动范围

1. `src/services/documentService.ts`
2. `src-tauri/src/workspace/workspace_commands.rs`
3. `src-tauri/src/commands/file_commands.rs`
4. `src-tauri/src/services/tool_service.rs`
5. `src-tauri/src/commands/timeline_commands.rs`

#### 核心开发任务

1. 接入已打开文件保存链
2. 接入未打开文件 `accept_file_diffs`
3. 接入资源结构操作命令
4. 接入工具直写入口
5. 明确排除 pending diff 和外部同步

#### 步骤拆分

##### `P3-1` 接入 `saveFile`

- 目标：让已打开文件的成立点进入正式时间轴链。
- 依赖：`P2`
- 修改范围：
  - `src/services/documentService.ts`
  - `src/services/timelineService.ts`
  - 视需要新增 `commit_timeline_candidate` Tauri 命令
- 完成标准：
  - `saveFile` 成功后可构造文件内容候选并提交
  - 内容未变化时不生成节点
  - `sync_workspace_file_cache_after_save` 仍只承担 cache 同步，不承担时间轴写入

##### `P3-2` 接入 `accept_file_diffs`

- 目标：让未打开文件链的成立点进入正式时间轴链。
- 依赖：`P2`
- 修改范围：
  - `src-tauri/src/workspace/workspace_commands.rs`
  - `src-tauri/src/workspace/timeline_service.rs`
- 完成标准：
  - 写盘成功后进入时间轴提交适配层
  - pending diff 删除与 file_cache 更新不影响时间轴判断

##### `P3-3` 接入资源结构命令

- 目标：让 `create_file/create_folder/rename/delete/duplicate/move` 进入时间轴链。
- 依赖：`P2`
- 修改范围：
  - `src-tauri/src/commands/file_commands.rs`
  - `src-tauri/src/workspace/timeline_service.rs`
- 完成标准：
  - 成功的资源结构变化可生成节点
  - 失败操作不生成节点

##### `P3-4` 接入工具直写入口

- 目标：让 `tool_service` 中直接成立的工具写盘入口进入时间轴链。
- 依赖：`P2`
- 修改范围：
  - `src-tauri/src/services/tool_service.rs`
  - `src-tauri/src/workspace/timeline_service.rs`
- 完成标准：
  - `update_file(use_diff=false)` 可生成节点
  - `update_file(use_diff=true)` 明确不生成节点
  - `tool create_file/delete_file/move_file/rename_file/create_folder` 可生成节点

##### `P3-5` 接入隔离验证

- 目标：在成立入口接入同时把不该接入的来源彻底隔离。
- 依赖：`P3-1` 至 `P3-4`
- 修改范围：
  - `src/stores/diffStore.ts`
  - `src-tauri/src/services/tool_service.rs`
  - `src/services/documentService.ts`
- 完成标准：
  - `acceptDiff` 不写时间轴
  - 外部同步、cache sync、localStorage 占位不写时间轴

#### 预期产出

1. 全部真实成立入口接入统一时间轴生成主链
2. 隔离对象在入口层被稳定排除

#### 验收标准

1. 所有列出的真实成立入口都能在实际变更时生成节点
2. 不真实变更、不成立动作和失败动作都不生成节点

#### 风险点

1. 前后端接入口径不统一
2. 工具直写链与手工保存链节点摘要口径不一致

#### 是否可并行

`P3-2`、`P3-3`、`P3-4` 可部分并行，但 `P3-1` 的前端保存链接入需要与统一提交对象保持一致。

---

### 4.5 `P4` UI 承接迁移

#### 阶段目标

让工作台“时间轴”标签承接正式时间轴事实层，停止依赖 localStorage 占位列表。

#### 依赖前提

`P1`、`P3` 至少完成正式读取与真实节点写入

#### 模块级改动范围

1. `src/components/FileTree/HistorySection.tsx`
2. `src/components/FileTree/ResourceToolbar.tsx`
3. `src/components/FileTree/FileTreePanel.tsx`
4. `src/services/timelineService.ts`
5. `src/stores/timelineStore.ts`

#### 核心开发任务

1. 时间轴列表读取与刷新
2. 时间轴节点展示语义承接
3. old localStorage 占位退出主渲染链
4. 为后续 restore 预留节点操作入口

#### 步骤拆分

##### `P4-1` 改造 `HistorySection` 数据源

- 目标：从正式时间轴事实层读取节点。
- 依赖：`P1-3`
- 修改范围：
  - `src/components/FileTree/HistorySection.tsx`
  - `src/stores/timelineStore.ts`
- 完成标准：
  - 列表来自正式节点查询接口
  - 不再以 `binder-history` 为主数据源

##### `P4-2` 清退 `ResourceToolbar` 占位写入

- 目标：彻底切断前端对 localStorage 占位时间轴的主写入路径。
- 依赖：`P4-1`
- 修改范围：
  - `src/components/FileTree/ResourceToolbar.tsx`
- 完成标准：
  - 新建文件/文件夹成功后不再写 localStorage 占位项
  - 时间轴展示只依赖正式事实层

##### `P4-3` 接入节点详情和操作入口

- 目标：让 UI 至少具备查看节点摘要、作用对象、时间和还原入口。
- 依赖：`P4-1`
- 修改范围：
  - `src/components/FileTree/HistorySection.tsx`
  - `src/services/timelineService.ts`
- 完成标准：
  - 节点列表与节点操作入口可用
  - 空态、加载态、错误态明确

#### 预期产出

1. 正式时间轴列表 UI
2. 占位 localStorage 退出主链
3. 为还原入口预留 UI 壳

#### 验收标准

1. 时间轴标签展示正式节点
2. localStorage 数据即使存在，也不影响正式时间轴列表
3. 节点数量显示与正式存储一致

#### 风险点

1. UI 仍残留占位数据混读
2. 列表刷新与工作区切换口径不稳定

#### 是否可并行

可以在 `P3` 后期与 `P6` 的占位清退部分并行，但不能早于正式查询接口完成。

---

### 4.6 `P5` 时间轴还原

#### 阶段目标

实现“选中节点 -> 确认 -> 还原 -> 刷新 -> 成功后新节点再入链”的正式时间轴还原主链。

#### 依赖前提

`P1`、`P2`、`P3` 完成，`P4` 至少具备节点展示和操作入口

#### 模块级改动范围

1. `src-tauri/src/commands/timeline_commands.rs`
2. `src-tauri/src/workspace/timeline_service.rs`
3. `src-tauri/src/workspace/workspace_db.rs`
4. `src/services/timelineService.ts`
5. `src/stores/timelineStore.ts`
6. `src/components/FileTree/HistorySection.tsx`
7. `src/stores/editorStore.ts`
8. `src/stores/fileStore.ts`

#### 核心开发任务

1. 还原预览接口
2. 确认弹窗和影响范围提示
3. 还原前 dirty 编辑器 / 外部修改阻断
4. 文件内容和资源结构恢复
5. 还原成功后的再入链和新节点生成

#### 步骤拆分

##### `P5-1` 实现还原预览接口

- 目标：为确认弹窗提供影响范围与覆盖提示。
- 依赖：`P1-2`
- 修改范围：
  - `src-tauri/src/commands/timeline_commands.rs`
  - `src/services/timelineService.ts`
- 完成标准：
  - 可读取节点摘要、作用对象、影响范围、是否可还原

##### `P5-2` 实现还原前阻断检查

- 目标：阻断不安全状态下的还原。
- 依赖：`P5-1`
- 修改范围：
  - `src/stores/editorStore.ts`
  - `src/stores/fileStore.ts`
  - `src/components/FileTree/HistorySection.tsx`
  - `src-tauri/src/commands/timeline_commands.rs`
- 完成标准：
  - 受影响文件存在未保存编辑态时阻断
  - 外部修改待处理态时阻断

##### `P5-3` 实现后端还原执行链

- 目标：恢复资源结构和文件内容。
- 依赖：`P5-2`
- 修改范围：
  - `src-tauri/src/workspace/timeline_service.rs`
  - `src-tauri/src/commands/timeline_commands.rs`
  - `src-tauri/src/commands/file_commands.rs`
  - `src-tauri/src/workspace/workspace_commands.rs`
- 完成标准：
  - 资源结构先恢复
  - 文件内容后恢复
  - UI 和 `file_cache` 刷新

##### `P5-4` 实现还原成功后的再入链

- 目标：还原成功后，如果状态确实变化，生成新节点。
- 依赖：`P5-3`
- 修改范围：
  - `src-tauri/src/workspace/timeline_service.rs`
  - `src-tauri/src/workspace/timeline_repository.rs`
- 完成标准：
  - 还原成功且状态变化时写入新节点
  - 还原失败时不写新节点
  - 状态未变化时不写新节点

##### `P5-5` 接通前端还原入口

- 目标：从时间轴列表进入正式还原流程。
- 依赖：`P5-1` 至 `P5-4`
- 修改范围：
  - `src/components/FileTree/HistorySection.tsx`
  - `src/services/timelineService.ts`
  - `src/stores/timelineStore.ts`
- 完成标准：
  - 用户能完成“选节点 -> 还原 -> 确认 -> 执行”
  - 还原成功后列表自动刷新

#### 预期产出

1. 正式时间轴还原主链
2. 确认弹窗和影响范围提示
3. 还原成功后的新节点再入链

#### 验收标准

1. 时间轴可恢复到正确状态断点
2. 还原不是 diff 重放，也不是操作逆放
3. 恢复成功后状态变化被新节点收口

#### 风险点

1. DOCX / HTML 还原稳定性不足
2. 还原覆盖 dirty 编辑器或外部修改待处理态
3. 恢复成功但新节点写入失败时的用户提示不清晰

#### 是否可并行

否。还原链依赖正式节点、正式载荷和正式入口接入全部稳定后再做。

---

### 4.7 `P6` 兼容与清理

#### 阶段目标

收口 50 条上限、旧占位逻辑清退、兼容边界处理与实现级清理。

#### 依赖前提

`P3`、`P4`、`P5` 完成主要主链

#### 模块级改动范围

1. `src-tauri/src/workspace/workspace_db.rs`
2. `src-tauri/src/workspace/timeline_repository.rs`
3. `src/components/FileTree/HistorySection.tsx`
4. `src/components/FileTree/ResourceToolbar.tsx`
5. `src/services/timelineService.ts`

#### 核心开发任务

1. 上限裁剪收口
2. 占位逻辑清退
3. 兼容旧 localStorage 数据但不导入
4. 工作区切换、空工作区、空列表等边界收口

#### 步骤拆分

##### `P6-1` 固化 50 条正式节点裁剪时机

- 目标：把裁剪规则从仓储能力收口为实现级正式行为。
- 依赖：`P1-4`
- 修改范围：
  - `src-tauri/src/workspace/timeline_repository.rs`
  - `src-tauri/src/workspace/workspace_db.rs`
- 完成标准：
  - 每次正式插入节点后执行裁剪
  - 裁剪只针对正式节点

##### `P6-2` 完成旧占位清退

- 目标：让占位逻辑完全退出正式主链。
- 依赖：`P4-2`
- 修改范围：
  - `src/components/FileTree/HistorySection.tsx`
  - `src/components/FileTree/ResourceToolbar.tsx`
- 完成标准：
  - 不导入旧 `binder-history`
  - 不再把占位数据作为正式时间轴来源
  - 视实现策略执行一次性清理或彻底忽略

##### `P6-3` 收口兼容与空态行为

- 目标：处理空工作区、无节点、工作区切换、被裁剪节点等边界行为。
- 依赖：`P6-1`、`P6-2`
- 修改范围：
  - `src/stores/timelineStore.ts`
  - `src/components/FileTree/HistorySection.tsx`
  - `src/services/timelineService.ts`
- 完成标准：
  - 工作区切换时列表正确刷新
  - 节点被裁剪后不再出现在列表与还原入口中
  - 无节点时空态清晰

#### 预期产出

1. 50 条上限正式生效
2. 占位逻辑退出主链
3. 兼容边界收口

#### 验收标准

1. 旧占位数据不污染正式时间轴
2. 50 条上限只针对正式时间轴节点
3. 裁剪与还原功能不冲突

#### 风险点

1. 被裁剪节点仍残留孤立载荷
2. 工作区切换时读取到错误 workspace 的节点

#### 是否可并行

`P6-2` 与 `P6-3` 可部分并行，但 `P6-1` 应先稳定。

---

### 4.8 `P7` 测试与验收

#### 阶段目标

覆盖功能、边界、隔离、恢复与兼容测试，形成正式验收闭环。

#### 依赖前提

`P3`、`P4`、`P5`、`P6` 完成

#### 模块级改动范围

1. 前端测试目录
2. Tauri / Rust 测试目录
3. 验收清单文档或测试矩阵

#### 核心开发任务

1. 完成节点生成链测试
2. 完成时间轴 UI 展示测试
3. 完成时间轴还原测试
4. 完成隔离规则测试
5. 完成 50 条上限和占位清退测试

#### 步骤拆分

##### `P7-1` 功能测试

- 目标：验证时间轴主链功能正确。
- 依赖：`P3`、`P4`、`P5`
- 修改范围：
  - 自动化测试
  - 手工验收清单
- 完成标准：
  - 不同成立入口都能生成正确节点
  - 时间轴列表正确展示节点
  - 还原可恢复到正确状态断点

##### `P7-2` 边界测试

- 目标：验证空操作、自动保存、多资源变化和复杂资源操作。
- 依赖：`P3`、`P5`、`P6`
- 修改范围：
  - 自动化测试
  - 手工验收清单
- 完成标准：
  - 空操作不生成节点
  - 自动保存遵守相同过滤规则
  - 多资源变化按单节点 + `impact_scope` 收口
  - 资源移动、删除、复制、文件夹删除可正确还原

##### `P7-3` 隔离测试

- 目标：证明非时间轴对象没有误入主链。
- 依赖：`P3`、`P6`
- 修改范围：
  - 自动化测试
  - 手工验收清单
- 完成标准：
  - pending diff 不入时间轴
  - reject / expired 不入时间轴
  - AI / task / artifact 不入时间轴
  - cache sync / refresh / 外部同步不入时间轴

##### `P7-4` 恢复与兼容测试

- 目标：验证 restore 失败处理、裁剪兼容、旧占位隔离。
- 依赖：`P5`、`P6`
- 修改范围：
  - 自动化测试
  - 手工验收清单
- 完成标准：
  - 还原失败不写新节点
  - 还原成功但时间轴写入失败时状态保持已恢复
  - 旧占位数据不导入、不干扰正式时间轴

#### 预期产出

1. 时间轴测试矩阵
2. 手工验收清单
3. 自动化测试覆盖

#### 验收标准

1. 功能、边界、隔离、恢复四类测试全部通过
2. 时间轴完成定义达成

#### 风险点

1. DOCX 类恢复用例不稳定
2. 多入口测试覆盖不足

#### 是否可并行

否。需要在主链全部稳定后统一收口。

---

## 5. 关键决策点

### 5.1 时间轴节点断点表达方式

当前建议：

1. 使用“节点元信息 + 断点载荷”分层表达
2. 不使用纯操作日志
3. 不复用 `file_cache` 充当断点存储

执行口径：

1. 在 `P1` 固化表结构
2. 在 `P2` 固化节点构造和载荷构造

专项验证位置：

1. `P5` restore 用例
2. `P7-4` 恢复与兼容测试

### 5.2 还原后是否写入新节点

当前建议：

1. 还原成功且状态实际变化时，必须写入新节点
2. 还原成功但状态未变化时，不写入新节点

执行口径：

1. 在 `P5-4` 落地
2. 走统一 `TimelineCommit Adapter` 再入链

专项验证位置：

1. `P5`
2. `P7-1`
3. `P7-4`

### 5.3 自动保存是否参与时间轴生成

当前建议：

1. 自动保存纳入时间轴，但必须与手动保存使用同一“实际状态变化过滤”规则

执行口径：

1. 自动保存不单独开口径
2. 自动保存只要内容未变，就不生成节点

专项验证位置：

1. `P2-2`
2. `P7-2`

### 5.4 多资源变化是一节点还是多节点

当前建议：

1. 单次成立动作默认生成单个节点
2. 多资源变化通过 `impact_scope` 收口

执行口径：

1. 在 `P2-4` 固化
2. 在 `P5-3` 按整个影响范围还原

专项验证位置：

1. `P7-2`

### 5.5 旧 localStorage 占位数据如何处理

当前建议：

1. 不导入正式时间轴
2. 不迁移旧占位数据
3. 正式时间轴只读取 `workspace.db`

执行口径：

1. `P4` 切换正式数据源
2. `P6` 清退占位写入和混读

专项验证位置：

1. `P7-4`

### 5.6 50 条裁剪策略按什么时机执行

当前建议：

1. 每次正式写入节点成功后立即执行裁剪
2. 裁剪与载荷清理同收口

执行口径：

1. 在 `P1-4` 完成基础能力
2. 在 `P6-1` 固化为正式行为

专项验证位置：

1. `P7-4`

---

## 6. 风险与前置校验

### 6.1 多入口写入导致时间轴口径不一致

风险：

1. 各入口各自写节点
2. 节点摘要、actor、变化判断口径不一致

前置校验：

1. 所有入口必须先经过 `P2` 的统一适配层
2. `P3` 不允许私接时间轴写入

### 6.2 未保存编辑态误入时间轴

风险：

1. 把编辑器内未保存内容误当已成立状态

前置校验：

1. 只以 `saveFile` 成功作为已打开文件链成立点
2. restore 前对 dirty 编辑器做阻断

### 6.3 外部同步误入时间轴

风险：

1. 外部修改 reload / refresh 被写成时间轴节点

前置校验：

1. 外部同步来源不进入 `TimelineCommit Adapter`
2. `file_cache` / `mtime` / `content_hash` 更新不作为时间轴信号

### 6.4 `file_cache` 被误当时间轴源

风险：

1. 当前态缓存被误扩展成历史版本链

前置校验：

1. 正式断点载荷单独存储
2. `file_cache` 仅作当前态和一致性辅助

### 6.5 restore 执行失败后的状态一致性

风险：

1. 资源结构或文件内容恢复到一半失败

前置校验：

1. 做好 preflight 检查
2. 当前阶段不承诺全量事务回滚
3. 失败时不写新节点，并明确提示当前状态

### 6.6 DOCX / HTML / 富文本还原稳定性

风险：

1. 格式转换链造成还原结果不稳定

前置校验：

1. `P5` 必须沿用当前保存链的真实转换能力
2. `P7` 中单列 DOCX 恢复用例

### 6.7 上限裁剪与 restore 兼容性

风险：

1. 被裁剪节点的载荷残留
2. UI 仍展示不可恢复节点

前置校验：

1. 裁剪与载荷清理绑定
2. 查询层只展示现存正式节点

---

## 7. 测试与验收计划

### 7.1 功能测试

功能测试至少覆盖：

1. `saveFile` 生成正确节点
2. `accept_file_diffs` 生成正确节点
3. `create_file/create_folder/rename/delete/duplicate/move` 生成正确节点
4. `update_file(use_diff=false)` 和工具创建文件生成正确节点
5. 时间轴列表正确展示节点
6. restore 恢复到正确状态断点

### 7.2 边界测试

边界测试至少覆盖：

1. 自动保存
2. 连续保存但内容不变
3. 多文件 / 多资源变化
4. 文件夹删除及其子项恢复
5. 资源移动 / 删除 / 复制
6. DOCX / HTML 恢复
7. 节点被裁剪后的列表和 restore 行为

### 7.3 隔离测试

隔离测试至少覆盖：

1. pending diff 不入时间轴
2. reject / expired diff 不入时间轴
3. AI / task / artifact 不入时间轴
4. cache sync / refresh 不入时间轴
5. 外部修改同步不入时间轴
6. localStorage 占位历史不入正式时间轴

### 7.4 还原链测试

还原链测试至少覆盖：

1. restore 前确认弹窗
2. dirty 编辑器阻断
3. 外部修改待处理阻断
4. restore 成功后写入新节点
5. restore 成功但状态未变时不写入新节点
6. restore 失败时不写入新节点
7. restore 成功但时间轴写入失败时的提示和状态保持

### 7.5 阶段验收映射

1. `P1` 验收重点：事实层与 50 条裁剪基础能力
2. `P2` 验收重点：实际状态变化过滤
3. `P3` 验收重点：多入口统一生成
4. `P4` 验收重点：UI 承接正式列表
5. `P5` 验收重点：restore 主链与再入链
6. `P6` 验收重点：占位清退与兼容边界
7. `P7` 验收重点：功能、边界、隔离、恢复全部通过

---

## 8. 开发完成定义

以下条件全部成立，才视为本次时间轴系统开发计划完成：

1. 正式时间轴事实层已建立
2. 正式时间轴节点持久化已建立
3. 全部真实成立入口已接入统一时间轴提交链
4. 时间轴列表 UI 已承接正式事实层
5. 时间轴 restore 主链可用
6. restore 成功且状态变化时可生成新节点
7. 非时间轴对象被正确隔离
8. 50 条正式时间轴节点上限生效
9. 旧 localStorage 占位逻辑已迁移或隔离，不再进入主链
10. 功能、边界、隔离、恢复测试通过

---

## 9. 规则 ID 映射与承接关系

### 9.1 开发计划规则

| 规则 ID | 规则内容 | 承接来源 | 作用阶段 | 影响模块 | 测试重点 |
|---|---|---|---|---|---|
| `TL-PLAN-R-01` | 必须先建立统一提交收口，再接入多入口，不得各入口散写时间轴 | `TL-MAIN-R-03` | `P0`、`P2`、`P3` | `documentService` / `workspace_commands` / `file_commands` / `tool_service` | 多入口一致性 |
| `TL-PLAN-R-02` | 必须先建立正式时间轴事实层，再做 UI 承接和还原 | `TL-STORE-R-01`、`TL-STORE-R-02` | `P1`、`P4`、`P5` | `workspace_db` / UI | 事实层先行 |
| `TL-PLAN-R-03` | 节点生成必须采用“成立点收口 + 实际状态变化过滤” | `TL-MAIN-R-04`、`TL-GEN-R-02` | `P2`、`P3` | 全成立入口 | 空操作过滤 |
| `TL-PLAN-R-04` | pending diff、AI、task、外部同步、cache 不得进入时间轴开发主链 | `TL-MAIN-R-08`、`TL-GEN-R-03`、`TL-GEN-R-04` | `P2`、`P3`、`P6` | Diff / AI / Cache / External Sync | 隔离测试 |
| `TL-PLAN-R-05` | 还原必须基于状态断点，不得退化成逆操作回滚 | `TL-MAIN-R-06`、`TL-RESTORE-R-01` | `P5` | Restore | 还原语义 |
| `TL-PLAN-R-06` | 还原成功且状态变化时必须生成新节点 | `TL-MAIN-R-07`、`TL-RESTORE-R-05` | `P5` | Restore / Persistence | 再入链 |
| `TL-PLAN-R-07` | 50 条上限只作用于正式节点，且裁剪必须同步清理载荷 | `TL-MAIN-R-09`、`TL-STORE-R-04`、`TL-STORE-R-05` | `P1`、`P6` | DB / UI | 裁剪兼容 |
| `TL-PLAN-R-08` | 旧 localStorage 占位逻辑必须退出正式时间轴主链，不导入正式事实层 | `TL-MAIN-R-10`、`TL-STORE-R-06` | `P4`、`P6` | UI / Storage | 占位清退 |

### 9.2 阶段与规则映射

| 阶段 | 主要承接规则 | 主要测试点 |
|---|---|---|
| `P0` | `TL-PLAN-R-01` | 入口清单与规则映射完整性 |
| `P1` | `TL-PLAN-R-02`、`TL-PLAN-R-07` | 事实层、节点表、载荷表、裁剪基础 |
| `P2` | `TL-PLAN-R-01`、`TL-PLAN-R-03`、`TL-PLAN-R-04` | 准入过滤、空操作过滤、排除项 |
| `P3` | `TL-PLAN-R-01`、`TL-PLAN-R-03`、`TL-PLAN-R-04` | 多入口节点生成一致性 |
| `P4` | `TL-PLAN-R-02`、`TL-PLAN-R-08` | UI 读取正式列表、占位退出主链 |
| `P5` | `TL-PLAN-R-05`、`TL-PLAN-R-06` | restore、阻断、再入链 |
| `P6` | `TL-PLAN-R-07`、`TL-PLAN-R-08` | 裁剪、清理、兼容 |
| `P7` | 全部 | 功能、边界、隔离、恢复验收 |

---

## 10. 结论

Binder 时间轴系统的开发不能从 UI 列表开始，也不能从 restore 按钮开始。

本次开发的正确顺序必须是：

1. 先冻结统一收口
2. 再建立正式事实层
3. 再建立统一节点生成链
4. 再接入真实成立入口
5. 再承接 UI
6. 再实现 restore
7. 最后做裁剪、迁移、兼容和测试收口

只有这样，时间轴系统才不会重新滑回“占位历史列表”或“diff 审阅衍生物”，而能真正落成：

**Binder 项目逻辑状态的正式时间轴系统。**
