# 状态单一真源原则

## 文档头

- 结构编码：`CORE-C-D-05`
- 文档属性：`主结构`
- 主责模块：`CORE`
- 文档职责：`状态单一真源原则 / 功能与规则主控`
- 上游约束：无
- 直接承接：无
- 接口耦合：`SYS-C-T-01`
- 汇聚影响：`CORE-C-R-01`, `CORE-C-D-01`
- 扩散检查：`CORE-C-D-02`, `CORE-C-D-03`, `CORE-C-D-04`, `CORE-C-D-06`
- 使用边界：`定义功能边界、模块规则与承接范围，不承担技术实现细节与开发排期`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L1 / 一级权威文档`
> 文档类型：`全局状态原则 / 主控描述`
> 当前状态：`Active`
> 受约束于：`A-CORE-C-D-02_产品术语边界.md`
> 可约束：`全部 Active 描述层文档中的状态真源、投影态、执行态、展示态约束`
> 可用于：`定义状态拥有权、取值顺序、真源与非真源边界`
> 不可用于：`替代模块协议文档定义字段结构和阶段业务规则`

## 一、文档定位

本文定义 Binder MVP 的“状态单一真源”原则，解决跨模块状态漂移问题。  
目标：统一 Workspace、文档、任务、Diff、展示、观测六层状态语义与取值顺序。

本文是全局状态原则文档，不替代具体业务规则文档。

---

## 二、核心定义

## 2.1 什么是“单一真源”

在任一时刻、任一语义点，只允许存在一个可被执行链消费的状态来源。  
可有缓存、副本、展示投影，但这些都不是执行真源。

## 2.2 什么是“状态漂移”

同一语义在不同链路使用了不同来源，导致：
1. 生成基于 A  
2. 校验基于 B  
3. 应用基于 C  

这类状态不一致一律判定为架构缺陷。

---

## 三、状态域与真源映射（MVP）

| 状态域 | 真源对象 | 非真源（仅投影/缓存） |
|---|---|---|
| Workspace 活跃态 | `fileStore.currentWorkspace`（运行时） | 最近工作区列表、UI 标记 |
| 目标文件态 | `RequestContext.targetFile` | 当前激活编辑器 tab 推断值 |
| 文档逻辑内容态 | 目标文档真实内容（已生效内容） | pending 装饰后的展示内容 |
| 轮次定位态 | `L + baselineId + revision` | 临时重新抓取的 editor HTML（未绑定 baseline） |
| 快照可执行态 | `DocumentSnapshot(Ready)` | 历史缓存、过期快照 |
| Diff 业务态 | `pending/accepted/rejected/expired` 状态机 | toast 文案、卡片样式 |
| 执行态 | `EditingTask/ToolCallTask` 状态机 | 聊天文案推测状态 |
| 观测态 | `ExecutionExposure`/错误码事件 | 业务状态字段 |

---

## 四、全局硬规则

1. 一次编辑任务只允许一个 `targetFile` 真源。  
2. 一轮执行只允许一个 `baselineId`。  
3. `L` 必须由逻辑内容构建，不得包含 pending 假想结果。  
4. `revision` 只随真实内容变化推进。  
5. `baseline` 只标识来源，不承担统一失效开关职责。  
6. `pending` 不得参与逻辑内容重建。  
7. 失效状态与失败观测必须分离。  

---

## 五、取值顺序与回退链

## 5.1 目标文件取值顺序

1. 显式任务目标（用户指令/系统解析）  
2. 引用定位目标（精确引用）  
3. 当前活动文件（仅在前两者缺失时）  

禁止：在已有显式目标时被 UI 焦点覆盖。

## 5.2 逻辑内容取值顺序

1. 目标文档实时编辑器内容（真实已生效内容）  
2. 非当前打开文档的可用 canonical 快照  
3. 未打开文档的静默加载 canonical 快照  

禁止：直接使用展示层装饰内容作为逻辑内容。

## 5.3 执行前门禁

必须同时满足：
1. `targetFileResolved`  
2. `canonicalLoaded`  
3. `blockMapReady`  
4. `contextInjected`  

任一失败：本次执行中止，不进入工具执行态。

---

## 六、状态分层约束

## 6.1 业务状态层

面向用户任务语义：
- diff 状态  
- 文档逻辑状态  
- 任务完成状态

## 6.2 执行状态层

面向系统执行过程：
- tool_call pending/executing/completed/failed  
- batch 执行阶段状态

## 6.3 展示状态层

面向 UI 呈现：
- 删除线  
- 卡片折叠态  
- 面板显隐态

## 6.4 观测状态层

面向排障与追踪：
- 错误码  
- 事件日志  
- 调试面板信息

强约束：任一层不得越权改写另一层真源语义。

## 6.5 `shadow runtime` 与运行时投影边界

`shadow runtime` 的术语主定义见 `A-CORE-C-D-02_产品术语边界.md`。  
本文只裁决其状态边界，不重新定义其术语语义。

1. `shadow runtime` 是运行时镜像、投影或辅助观测层，不是业务主真源。
2. `shadow runtime` 可以汇聚局部运行进度、临时 gate 结果、UI 交互回声和调试态，但这些对象都不直接构成业务状态结论。
3. `shadow runtime` 可用于：
   - 运行时编排与中途恢复提示
   - UI 进度呈现与局部投影
   - 调试、排障与观测
4. `shadow runtime` 不得用于：
   - 单独推进 `stage_complete`
   - 单独产出 `verification`、`confirmation`、`invalidated` 的最终业务结论
   - 用局部 UI 完成态覆盖持久业务状态
   - 在业务状态与运行时投影冲突时反向改写业务真源
   - 将运行时内存状态写入持久化存储（数据库、磁盘）作为跨会话恢复依据
5. 若业务主状态与 `shadow runtime` 冲突，以业务真源为准；运行时投影必须回退为从属信息。
6. `shadow runtime` 的生命周期边界：仅限当前会话内存。应用重启或 tab 关闭后 shadow 状态归零，不得依赖 shadow 状态跨会话延续业务结论。

## 6.6 事件、业务状态、派生状态与展示态分类规则

以下分类用于裁决跨模块混用问题：

| 对象 | 分类 | 说明 |
|---|---|---|
| `accepted` | 业务状态 | 表示对象已进入正式接受结论 |
| `rejected` | 业务状态 | 表示对象已进入正式拒绝结论 |
| `expired` | 业务状态 | 表示对象因真源变化或规则失配而失效 |
| `invalidated` | 业务状态 | 表示上层链路或阶段结论失效，需要回退重建 |
| `stage_complete` | 业务状态 | 表示阶段业务闭合已成立 |
| `execute_failed` | 业务事件 | 表示执行链出现失败事件，并进入观测层；它本身不等于业务失效结论 |
| `verification failed` | 派生状态 | 由验证记录导出的门禁失败结论，不单独等于业务终态 |
| `confirmation pending` | 派生状态 | 表示仍有待处理的人类确认门禁，不等于拒绝、失效或完成 |
| toast / badge / panel highlighting | 展示态 | 只服务 UI 呈现，不得回写业务结论 |

强约束：

1. 业务事件不能直接等同业务状态。
2. 展示态不能反向定义业务状态。
3. 局部运行时失败不能直接等于持久业务失效，除非专项规则文档显式规定映射关系。
4. `execute_failed` 不等于 `expired`。
5. `verification failed` 不自动等于 `invalidated`；是否失效必须由 `AgentTaskController` 按规则裁决，不得由 diff 操作路径自动映射。
6. `stage_complete` 不得由纯 UI 状态、纯展示态或 `shadow runtime` 单独推进；唯一合法推进主体为 `AgentTaskController`，见 `A-AG-M-T-05_AgentTaskController设计.md`。
7. `accepted`、`rejected`、`expired` 的推进路径必须收敛至单一服务层入口（`DiffActionService`），UI 组件不得直接操作 `diffStore` 业务状态方法。

---

## 6.7 `stage_complete` 合法推进主体

`stage_complete` 是阶段业务闭合的正式结论，仅允许由 `AgentTaskController` 在满足以下全部条件后推进：

1. 某 `agentTaskId` 下所有 diff 已达终态（`accepted` / `rejected` / `expired`）。
2. 其中至少有一个 `accepted`。
3. 尚无更高优先级的 invalidated 信号覆盖。

推进链路：
```
diffStore 状态变更
  → AgentTaskController.checkAndAdvanceStage(agentTaskId)
    → 条件满足 → agentStore.setStageState('stage_complete')
    → 条件不满足 → 不动
```

禁止以下路径直接推进 `stage_complete`：
- UI 组件（ToolCallCard、ChatMessages、DiffAllActionsBar、PendingDiffPanel 等）
- diffStore 内部方法
- Shadow runtime 自我闭合逻辑

---

## 七、典型反模式（禁止）

1. 用 `getLogicalContent` 回放 pending 后再参与执行校验。  
2. 接受第一条 diff 后立即改写同轮其余 diff 的基线语义。  
3. 将 `revision` 前进解释为“同文件其他 pending 全失效”。  
4. 用聊天回复文案表示“已应用”替代真实状态。  
5. 以 UI 卡片样式推断业务状态。  

---

## 八、冲突裁决

当状态来源冲突时，按顺序裁决：
1. 业务真源优先于展示状态  
2. 任务上下文真源优先于 UI 当前焦点  
3. 执行门禁失败优先于“继续尝试”  
4. 可追踪失败优先于静默吞并  

---

## 九、最小验证清单（MVP）

1. 同一轮内 `targetFile` 是否发生隐式切换。  
2. 同一轮内是否出现多个 baselineId。  
3. 逻辑内容构建是否误包含 pending。  
4. `revision` 是否只在真实内容变更时推进。  
5. 执行失败是否有观测事件，且不改写 diff 业务语义。  
6. 非当前文档执行是否严格经过四段门禁。  

---

## 十、与现有文档关系

> **本轮修订说明（2026-04-14）**：  
> 基于状态拥有权审计报告补充以下内容：  
> 1. §6.5 新增第 5、6 条：shadow runtime 禁止写入持久化存储、生命周期仅限会话内存。  
> 2. §6.6 强约束第 5 条细化：`verification failed → invalidated` 须由 `AgentTaskController` 裁决；第 6 条细化：`stage_complete` 唯一合法推进主体；新增第 7 条：`accepted`/`rejected`/`expired` 收敛至 `DiffActionService`。  
> 3. 新增 §6.7：`stage_complete` 合法推进主体定义与推进链路。  
> 对应新增文档：`A-AG-M-T-05_AgentTaskController设计.md`。

## 十一、与现有文档关系

来源文档：
1. `A-CORE-C-D-02_产品术语边界.md`（共享状态术语边界）  
2. `A-DE-M-T-02_baseline状态协作.md`（L/baseline/revision 专项规则）  
3. `R-DE-M-R-03_文档逻辑状态传递规范.md`（仅作历史背景）  

对齐文档：
1. `A-CORE-C-D-04_系统设计原则总纲.md`（全局原则优先级）  
2. `A-WS-C-T-01_workspace模型定义.md`（对象定义）  
3. `A-WS-C-T-02_workspace对象生命周期.md`（状态机）  
4. `A-WS-C-T-03_文档资源任务关系模型.md`（关系模型）  
5. `A-AG-M-T-05_AgentTaskController设计.md`（`stage_complete` / `invalidated` 推进主体设计）  

边界声明：
本文定义”状态真源原则”，不定义具体工具参数与 UI 交互细节。
