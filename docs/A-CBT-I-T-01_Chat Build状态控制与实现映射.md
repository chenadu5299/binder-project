# Chat Build状态控制与实现映射

## 文档头

- 结构编码：`CBT-I-T-01`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`将 Chat Build 的状态、控制规则、实现责任与验收边界压成开发控制文档`
- 上游约束：`CBT-C-D-01`, `CBT-M-D-01`, `CBT-M-T-01`, `CBT-I-P-01`, `A-SYS-C-T-01`
- 直接承接：`CBT-I-T-02`, `CBT-I-S-01`, `CBT-I-S-02`, `CBT-I-S-03`, `CBT-X-L-01`
- 接口耦合：`A-PROD-C-D-04`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-L-01`
- 扩散检查：`A-CBT-I-D-01`, `A-CBT-X-L-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-PROD-C-L-01`
- 变更要求：`修改本文后，必须复核：A-CBT-I-P-01、A-CBT-I-D-01、A-CBT-X-L-01、A-PROD-C-D-04、A-SYS-C-T-01、A-TMP-M-D-02、A-AG-M-T-03、A-AG-M-T-05、A-PROD-C-L-01`
- 使用边界：`面向开发动作定义控制对象、实现责任与验收边界，不展开未来多角色或真人协作方案`

---

## 一、文档定位

本文是 Chat Build 当前版本的开发控制文档。

本文不重新定义产品主线，而是回答四件事：

1. 哪些状态 / 控制对象必须先做。
2. 哪些实现责任对象承接这些状态和控制。
3. 哪些行为必须被拦住。
4. 哪些状态切换和边界违反必须视为验收失败。

当前规则源头统一以 `A-CBT-I-P-01` 中的 `BR-CBT-*` 为准。

## 二、控制对象与开发顺序

| 开发对象 | 当前最小职责 | 依赖规则 | 主要承接对象 | 最小验收要求 |
|---|---|---|---|---|
| `discussion` | 允许自然讨论、引用输入、目标收敛 | `BR-CBT-MODEL-001` | chat 交互层 | 构建前可以继续对话，不误触发正式构建 |
| `intent_pending` | 接住构建触发并进入轻量确认层 | `BR-CBT-RUN-001` | Chat Build 控制层 + chat 交互层 | 构建触发后只能进入大纲或返回讨论 |
| `outline_drafting` | 生成本轮 Build Outline | `BR-CBT-RUN-001`, `BR-CBT-VERIFY-001` | Chat Build 控制层 + template runtime | 未确认前不得视为正式构建 |
| `outline_pending_confirm` | 持有用户确认闸口 | `BR-CBT-VERIFY-001` | Chat Build 控制层 + chat 交互层 | 必须显式确认才能进入 `building` |
| `building` | 冻结式正式构建运行 | `BR-CBT-STATE-001`, `BR-CBT-MODEL-001`, `BR-CBT-ASSET-001`, `BR-CBT-DATA-001` | Chat Build 控制层 + workspace + task/artifact | 自然语义输入不改向；写入只允许新增资源 |
| `interrupted` | 用户主动终止当前运行 | `BR-CBT-STATE-002` | Chat Build 控制层 + chat 交互层 | 中断后当前运行结束，不得原地改写目标 |
| `completed` | 本轮运行成功结束 | `BR-CBT-STATE-002`, `BR-CBT-ASSET-001` | Chat Build 控制层 + workspace + task/artifact | 成功态结束后返回讨论才能开始新一轮 |
| `failed` | 本轮运行因错误结束 | `BR-CBT-STATE-002` | Chat Build 控制层 + task/artifact | 失败态必须暴露且结束当前运行 |

当前开发顺序必须是：

1. 先把 `intent_pending -> outline_pending_confirm -> building` 这条控制链做出来。
2. 再补 `building -> interrupted/completed/failed`。
3. 最后再补 workspace / task-artifact / template runtime 的正式承接。

## 三、实现责任对象

### 3.1 chat 交互层

chat 交互层必须承接：

1. `discussion` 的自由对话。
2. `intent_pending` 的轻量确认入口。
3. `outline_pending_confirm` 的大纲展示与确认。
4. `building` 的状态 / 进度 / 过程说明与中断入口。

chat 交互层必须拦住：

1. 在 `building` 态把自然语言当作目标修改。
2. 绕过 `outline_pending_confirm` 直接进入 `building`。

### 3.2 Chat Build 控制层

Chat Build 控制层必须承接：

1. 状态切换。
2. 大纲确认闸口。
3. 构建启动条件。
4. 冻结规则执行。
5. 中断 / 完成 / 失败判定。

Chat Build 控制层必须拦住：

1. 缺失大纲确认直接启动。
2. `building` 态接受自然语义改向。
3. template runtime 越权持有控制权。

### 3.3 workspace 承接层

workspace 承接层必须承接：

1. 工作区边界。
2. 新资源写入容器。
3. 新目录 / 新文件 / 相关资源文件的承载。

workspace 承接层必须拦住：

1. 借 Chat Build 修改既有资源。
2. 由 workspace 自行决定构建目标或控制状态。

### 3.4 task / artifact 承接层

task / artifact 当前应承接：

1. 运行状态记录。
2. 中间结果暴露。
3. 结束态记录。

它们当前不应越权承担：

1. Chat Build 主状态机定义。
2. 构建启动闸口。
3. workspace 写入边界裁定。

### 3.5 template runtime 承接层

template runtime 当前应承接：

1. 过程约束。
2. 步骤骨架。
3. 运行阶段参考。

它必须服从：

1. `BR-CBT-RUN-002`
2. `BR-CBT-VERIFY-001`

它不得越权承担：

1. 是否启动正式构建的决策。
2. 大纲确认闸口。
3. 中断结果与结束态判定。

## 四、必须拦住的行为

| 禁止行为 | 违反规则 | 必须由谁拦住 | 验收失败标准 |
|---|---|---|---|
| 未经大纲确认直接进入正式构建 | `BR-CBT-VERIFY-001` | Chat Build 控制层 + chat 交互层 | 出现从 `discussion` / `outline_drafting` 直跳 `building` |
| `building` 态接受自然语义改向 | `BR-CBT-STATE-001` | Chat Build 控制层 + chat 交互层 | 构建中输入能改变当前目标 |
| 把中断理解为“原运行中改需求成功” | `BR-CBT-STATE-002` | Chat Build 控制层 | 中断后可在同一运行直接继续改向 |
| template runtime 持有 Chat Build 主控权 | `BR-CBT-RUN-002` | Chat Build 控制层 | 模板运行时自行决定开始构建或切换状态 |
| workspace 修改既有资源而不是新增资源 | `BR-CBT-ASSET-001`, `BR-CBT-DATA-001` | workspace 承接层 + Chat Build 控制层 | 正式构建链修改已有工作区文件 |

## 五、验收边界

| 验收对象 | 必须验证 | 未通过判定 |
|---|---|---|
| `discussion -> intent_pending` | 构建触发成立后必须进入轻量确认，不得直接开跑 | 触发后直接开始正式构建 |
| `outline_pending_confirm -> building` | 必须有显式确认动作 | 无确认动作进入 `building` |
| `building` 输入处理 | 自然语义输入不改变当前构建目标 | 构建中聊天可直接改向 |
| `building -> interrupted` | 只能由手动中断触发 | 普通聊天输入导致中断或改向 |
| `building -> completed/failed` | 结束态必须停止当前运行 | 结束后仍处于可继续原运行状态 |
| workspace 写入 | 只新增资源，不改既有内容 | 运行中修改已有文件 |
| template runtime 承接 | 只提供步骤约束，不持有控制权 | 模板运行时裁定闸口、中断、结束态 |

## 六、与现有文档的关系

1. `A-CBT-I-P-01` 定义规则源头与最小协议。
2. 本文把这些规则进一步映射到开发对象、实现责任与验收边界。
3. `A-CBT-I-T-02` 继续把这些控制要求压成可编码执行链与运行控制。
4. `A-CBT-I-S-01`、`A-CBT-I-S-02`、`A-CBT-I-S-03` 继续拆解 workspace 写入、中断机制和 chat/build 接管。
5. `A-CBT-I-D-01` 说明当前代码承接基础。
6. `A-CBT-X-L-01` 说明开发顺序、阶段和验收。
7. `A-TMP-M-D-02`、`A-AG-M-T-03`、`A-AG-M-T-05` 作为承接层必须服从本文规定的开发控制边界。
