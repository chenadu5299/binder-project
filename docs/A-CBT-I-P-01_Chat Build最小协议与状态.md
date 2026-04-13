# Chat Build最小协议与状态

## 文档头

- 结构编码：`CBT-I-P-01`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`定义 Chat Build 的最小状态流、最小控制协议、最小对象语义与责任边界`
- 上游约束：`CBT-C-D-01`, `CBT-M-D-01`, `CBT-M-T-01`
- 直接承接：`CBT-I-D-01`, `CBT-I-T-01`, `CBT-I-T-02`, `CBT-X-L-01`
- 接口耦合：`A-CBT-I-D-01`, `A-CBT-I-T-01`, `A-CBT-I-T-02`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`
- 扩散检查：`A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-CBT-I-D-01`, `A-CBT-I-T-01`, `A-CBT-I-T-02`, `A-CBT-I-S-01`, `A-CBT-I-S-02`, `A-CBT-I-S-03`, `A-CBT-X-L-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-PROD-C-L-01`
- 变更要求：`修改本文后，必须复核：A-CBT-M-D-01、A-CBT-M-T-01、A-CBT-I-D-01、A-CBT-I-T-01、A-CBT-I-T-02、A-CBT-I-S-01、A-CBT-I-S-02、A-CBT-I-S-03、A-CBT-X-L-01、A-PROD-C-D-04、A-SYS-C-T-01、A-TMP-M-D-02、A-AG-M-T-03、A-AG-M-T-05、A-PROD-C-L-01`
- 使用边界：`只定义当前版本最小协议，不展开未来多角色/真人协作方案`

---

## 一、文档定位

本文是 Chat Build 当前版本的最小协议文档。

本文只回答四件事：

1. Chat Build 最小状态流是什么。
2. 每个状态如何进入、如何退出。
3. 当前版本最小控制协议和对象语义是什么。
4. chat / Chat Build 控制层 / workspace / task-artifact / template runtime / reference 类基础设施各自承接什么。

本文不回答：

1. Discussion Build
2. 多角色 AI 协作
3. 真人讨论 / 分享 / 邀请
4. Project Object
5. 独立 build engine 完整架构

## 二、三条硬规则

以下规则是当前版本硬边界，所有相关文档必须一致：

1. 大纲确认是正式构建前的硬边界。
2. 构建一旦开始，不可被自然语义打断、修改或重定向。
3. 当前构建只生成新的项目资源，不修改既有内容。

## 三、规则矩阵与下游映射

本节是当前 Chat Build 的统一规则源头。

若下游文档涉及同一语义，应直接引用下列 `BR-CBT-*` 规则，而不是重新用自然语言定义一套新的主线规则。

| 规则 ID | 规则摘要 | 当前源头章节 | 主要约束文档 | 变更时必须复核 |
|---|---|---|---|---|
| `BR-CBT-VERIFY-001` | 大纲确认是正式构建前的硬边界 | §2, §5.3 | `A-CBT-C-D-01`, `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-AG-M-T-03`, `A-AG-M-T-05` | `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-CBT-I-T-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-AG-M-T-03`, `A-AG-M-T-05` |
| `BR-CBT-STATE-001` | `building` 态不可被自然语义打断、修改或重定向 | §2, §5.5 | `A-CBT-C-D-01`, `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-AG-M-T-03`, `A-AG-M-T-05` | `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-CBT-I-T-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-AG-M-T-03`, `A-AG-M-T-05` |
| `BR-CBT-ASSET-001` | 当前构建只生成新的项目资源，不修改既有内容 | §2, §7.3 | `A-CBT-C-D-01`, `A-CBT-M-T-01`, `A-CBT-I-D-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-AG-M-T-03`, `A-AG-M-T-05` | `A-CBT-M-T-01`, `A-CBT-I-D-01`, `A-CBT-I-T-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-PROD-C-L-01` |
| `BR-CBT-RUN-001` | 轻量确认层只负责是否进入大纲阶段，不替代大纲确认 | §5.1, §5.2 | `A-CBT-M-D-01`, `A-CBT-C-D-01`, `A-PROD-C-D-04`, `A-CBT-I-T-01` | `A-CBT-M-D-01`, `A-CBT-I-T-01`, `A-PROD-C-D-04` |
| `BR-CBT-STATE-002` | 手动中断只能结束当前运行，不等于需求已在原运行中改写成功 | §5.6, §5.7, §6.5, §6.6 | `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-CBT-I-T-01`, `A-PROD-C-D-04`, `A-TMP-M-D-02` | `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-CBT-I-T-01`, `A-PROD-C-D-04`, `A-TMP-M-D-02` |
| `BR-CBT-MODEL-001` | chat 在构建前是讨论界面，在构建中是状态 / 进度 / 过程展示与中断控制界面 | §5.5, §7.1 | `A-CBT-C-D-01`, `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-PROD-C-D-04`, `A-CBT-I-T-01` | `A-CBT-C-D-01`, `A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-PROD-C-D-04`, `A-CBT-I-T-01` |
| `BR-CBT-RUN-002` | template runtime 只提供过程约束与步骤骨架，不持有 Chat Build 控制权 | §7.5 | `A-CBT-I-D-01`, `A-TMP-M-D-02`, `A-AG-M-T-05`, `A-CBT-I-T-01` | `A-CBT-I-D-01`, `A-TMP-M-D-02`, `A-AG-M-T-05`, `A-CBT-I-T-01` |
| `BR-CBT-DATA-001` | workspace 写入边界只允许新增资源写入，不允许借 Chat Build 改写既有内容 | §7.3 | `A-CBT-I-D-01`, `A-CBT-I-T-01`, `A-SYS-C-T-01`, `A-AG-M-T-05` | `A-CBT-I-D-01`, `A-CBT-I-T-01`, `A-SYS-C-T-01`, `A-AG-M-T-05` |

## 四、最小状态流

当前版本最小状态流定义如下：

| 状态 | 含义 | 允许进入方式 | 允许退出方式 |
|---|---|---|---|
| `discussion` | 自由讨论态，尚未进入正式构建流程 | 默认初始态；上一轮结束后返回讨论 | 进入 `intent_pending` |
| `intent_pending` | 构建触发已成立，等待轻量确认是否进入大纲阶段 | 显式构建指令；显式按钮触发；系统识别到明确构建意图并请求确认 | 返回 `discussion`；进入 `outline_drafting` |
| `outline_drafting` | 系统正在形成本轮 Build Outline | `intent_pending` 确认进入大纲阶段 | 返回 `discussion`；进入 `outline_pending_confirm` |
| `outline_pending_confirm` | 大纲已产出，等待用户确认是否启动正式构建 | `outline_drafting` 完成 | 返回 `discussion`；重新进入 `outline_drafting`；进入 `building` |
| `building` | 正式构建执行态 | 用户确认大纲并显式开始构建 | 进入 `completed` / `failed` / `interrupted` |
| `interrupted` | 当前构建被用户手动中断后结束 | `building` 中触发手动中断 | 返回 `discussion` |
| `completed` | 当前构建成功完成 | `building` 正常完成 | 返回 `discussion` |
| `failed` | 当前构建因错误结束 | `building` 执行失败 | 返回 `discussion` |

状态闭环说明：

1. `discussion -> intent_pending -> outline_drafting -> outline_pending_confirm -> building` 是标准前进链。
2. `building` 之后只允许进入结束态，不允许回到前置中间态。
3. `interrupted`、`completed`、`failed` 都是本轮运行的结束态。
4. 任何新的需求变更都必须在返回 `discussion` 后重新开始。

## 五、最小控制协议

### 5.1 进入构建触发

进入 `intent_pending` 的条件至少满足其一：

1. 用户明确发出项目级生成指令。
2. 用户点击显式“开始构建”类入口。
3. 系统判断当前对话已形成明确构建目标，并请求用户确认进入构建流程。

### 5.2 轻量确认层（`BR-CBT-RUN-001`）

轻量确认层对应 `intent_pending`。

它只解决一个问题：

1. 当前是否进入大纲阶段。

它不解决：

1. 大纲本身是否已确认。
2. 正式构建是否已经启动。

### 5.3 大纲确认成立条件（`BR-CBT-VERIFY-001`）

`outline_pending_confirm -> building` 只能由以下动作触发：

1. 用户显式确认当前大纲。
2. 用户显式点击开始正式构建。

下列情况都不能视为大纲确认成立：

1. 用户继续补充需求但未确认。
2. 系统自行判断“应该可以开始”。
3. chat 中出现模糊正向表达但未形成明确启动动作。

### 5.4 正式构建启动

正式构建启动的成立条件是：

1. 当前状态为 `outline_pending_confirm`。
2. 已存在当前轮 Build Outline。
3. 用户已显式确认大纲并启动。

### 5.5 构建中的输入规则（`BR-CBT-STATE-001`, `BR-CBT-MODEL-001`）

当状态为 `building` 时：

1. 自然语言输入不改变当前构建目标。
2. 新的引用输入不注入当前运行中的构建目标。
3. chat 区域只承担状态、进度、过程说明与中断控制。
4. 如用户要修改目标，必须先结束当前运行，再回到 `discussion`。

### 5.6 手动中断（`BR-CBT-STATE-002`）

手动中断只能在 `building` 状态触发。

触发方式：

1. 显式点击中断/停止构建类控制。

触发结果：

1. 当前运行终止。
2. 当前状态进入 `interrupted`。
3. 当前运行不被自然语义改写为新目标。
4. 若用户要继续，必须回到 `discussion`，重新进入大纲阶段。

### 5.7 三种结束态（`BR-CBT-STATE-002`）

| 结束态 | 触发条件 | 含义 |
|---|---|---|
| `completed` | 正式构建正常完成 | 本轮目标按当前大纲完成 |
| `failed` | 正式构建遇到不可继续错误 | 本轮运行失败并停止 |
| `interrupted` | 用户主动手动中断 | 本轮运行被用户结束，不等于目标已修改 |

补充规则：

1. 三种结束态都意味着当前运行已结束。
2. 三种结束态之后都应返回 `discussion` 再开始新一轮。
3. `interrupted` 不等于“在原运行中改需求成功”。

## 六、最小对象定义

### 6.1 构建意图

`BuildIntent` 表示用户希望从当前对话进入项目级生成流程的意图对象。

最小语义：

1. 当前目标是否已达到“可以进入构建流程”的程度。
2. 当前是否需要先经过轻量确认。

### 6.2 大纲草案

`BuildOutlineDraft` 表示正式构建前的规划结果。

最小语义：

1. 本轮目标摘要
2. 预计产物范围
3. 执行骨架或主要阶段

它不是：

1. 最终产物
2. 自由可省略的中间文本

### 6.3 大纲确认结果

`OutlineConfirmationResult` 表示用户对当前大纲的决策结果。

最小语义：

1. `confirmed`
2. `revise_outline`
3. `return_to_discussion`

### 6.4 构建执行态

`BuildExecutionState` 表示当前正式构建运行中的核心可见状态。

最小语义：

1. 当前阶段
2. 当前进度
3. 当前动作或步骤
4. 当前运行状态

### 6.5 中断结果

`InterruptResult` 表示本轮运行因用户手动中断而结束。

最小语义：

1. 中断已生效
2. 当前运行已结束
3. 需要回到 `discussion` 才能开始新一轮

### 6.6 结束结果

`BuildTerminationResult` 表示 `completed` / `failed` / `interrupted` 三类结束结果。

最小语义：

1. 结束类型
2. 结束摘要
3. 是否允许回到讨论重新开始

## 七、最小责任边界

### 7.1 chat 交互层

chat 交互层负责：

1. 前置自由讨论
2. 构建触发入口
3. 大纲展示与确认
4. 构建中的状态 / 进度 / 过程说明展示
5. 中断控制入口

chat 交互层不负责：

1. 私自改写当前构建目标
2. 绕过大纲确认直接开始构建

### 7.2 Chat Build 控制层

Chat Build 控制层负责：

1. 状态切换
2. 大纲确认闸口
3. 正式构建启动条件
4. 冻结规则执行
5. 中断与结束判定

Chat Build 控制层不等于：

1. 多角色调度器
2. discussion room 状态机

### 7.3 workspace（`BR-CBT-ASSET-001`, `BR-CBT-DATA-001`）

workspace 负责：

1. 工作区边界
2. 新资源写入边界
3. 文件与资源容器

workspace 不负责：

1. 决定当前构建目标
2. 冻结规则本身

### 7.4 task / artifact

task / artifact 当前可承接：

1. 运行状态记录
2. 中间结果记录
3. 进度与结果暴露

它们当前不自动等于：

1. Chat Build 状态机
2. 完整产物落盘闭环

### 7.5 template runtime（`BR-CBT-RUN-002`）

template runtime 当前负责：

1. 提供过程约束
2. 提供阶段骨架
3. 提供执行步骤参考

它不负责：

1. 定义 Build Outline 硬边界
2. 决定是否开始正式构建

### 7.6 reference / memory / knowledge

reference / memory / knowledge 当前属于：

1. 输入侧
2. 上下文侧

它们不属于：

1. 控制侧
2. 状态裁定侧
3. 构建是否启动的决策侧

## 八、与现有 Active 文档的关系

1. `CBT-C-D-01` 冻结产品边界。
2. `CBT-M-D-01` 定义交互阶段与允许动作。
3. `CBT-M-T-01` 定义执行模型与硬边界。
4. 本文把这些规则收敛成最小状态与控制协议。
5. `CBT-I-D-01` 再把该协议映射到当前代码承接面。
6. `CBT-I-T-01` 把状态 / 控制规则映射到开发对象、实现责任与验收边界。
7. `CBT-I-T-02` 把规则和状态压成正式构建执行链与运行控制。
8. `CBT-I-S-01`、`CBT-I-S-02`、`CBT-I-S-03` 继续拆解 workspace 写入、中断机制和 chat/build 接管。
