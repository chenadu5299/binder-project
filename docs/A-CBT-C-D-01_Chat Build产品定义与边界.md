# Chat Build产品定义与边界

## 文档头

- 结构编码：`CBT-C-D-01`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`Chat Build 的产品定义、边界、与旧 BLD 体系的关系、当前版本排除项`
- 上游约束：`A-CORE-C-D-02`, `A-SYS-C-T-01`
- 直接承接：`CBT-M-D-01`, `CBT-M-T-01`, `CBT-I-P-01`, `CBT-I-D-01`, `CBT-X-L-01`
- 接口耦合：`A-PROD-C-D-04`, `A-SYS-C-T-01`, `A-CBT-I-P-01`, `A-CBT-I-T-01`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-D-04`, `A-SYS-C-T-01`
- 扩散检查：`A-CBT-M-D-01`, `A-CBT-M-T-01`, `A-CBT-I-P-01`, `A-CBT-I-D-01`, `A-CBT-I-T-01`, `A-CBT-X-L-01`, `A-PROD-C-L-01`
- 变更要求：`修改本文后，必须复核：A-CBT-M-D-01、A-CBT-M-T-01、A-CBT-I-P-01、A-CBT-I-D-01、A-CBT-I-T-01、A-CBT-X-L-01、A-PROD-C-D-04、A-SYS-C-T-01、A-PROD-C-L-01`
- 使用边界：`定义当前生效模型，不承担实现细节与工程排期`

---

## 一、文档定位

本文是当前版本唯一生效的 Chat Build 产品定义文档。

本文回答：

1. Chat Build 是什么。
2. Chat Build 不是什么。
3. Chat Build 与旧 Build Mode / Discussion Build 的关系是什么。
4. 当前版本的边界和排除项是什么。

## 二、当前唯一生效模型

当前版本唯一生效的构建模型是：

> `Chat Build：以自然对话完成需求收敛，经大纲确认后启动的单主控冻结式构建系统。`

这个定义包含四个关键点：

1. 前置阶段是自然对话，不是房间协作。
2. 当前以 chat 作为入口壳与交互表面，而不是独立构建页前提。
3. 真正启动构建前必须经过大纲确认。
4. 构建启动后由单主控执行，不进行多 AI 讨论。
5. 构建只生成新的项目资源，不修改既有内容。

## 三、Chat Build 是什么

Chat Build 是当前版本用于“从零生成一个新的项目资源集合”的产品路径。

它承接的用户问题是：

1. 用户目标明确，但还没有现成项目产物。
2. 用户需要先通过自然对话澄清目标、范围、约束和输入。
3. 用户希望在确认大纲后，由系统进入一次完整的项目级生成过程。

Chat Build 的核心闭环是：

`自由讨论 -> 构建触发 / 轻量确认 -> 大纲生成 -> 大纲确认 -> 正式构建 -> 产物完成 / 中断`

## 四、Chat Build 不是什么

Chat Build 不是：

1. 旧版 `Discussion Build` 的裁剪版本。
2. 多角色 AI 协作系统。
3. 真人参与的讨论房间。
4. 可边构建边修改需求的半交互式执行器。
5. 对既有文档做 Diff 改写的编辑模式扩展。
6. 已经在当前代码中完整实现的功能。

## 五、与编辑模式的关系

| 维度 | 对话编辑 | Chat Build |
|---|---|---|
| 目标 | 修改既有内容 | 生成新的项目资源 |
| 输入形态 | 当前文档、引用、局部编辑请求 | 自然对话、引用、构建目标 |
| 用户确认点 | Diff 决策 | 大纲确认 |
| 执行中允许什么 | 可继续互动与 refinement | 只允许查看进度或手动中断 |
| 输出 | 已有内容的受控修改 | 新的项目目录/资源集合 |

边界结论：

1. Chat Build 不是对话编辑的别名。
2. Chat Build 可以复用当前聊天与资源基础设施，但不等于共享完整执行语义。

## 六、与旧 BLD 文档体系的关系

旧 `R-BLD-*` 文档整体降级为 Reference。

原因不是它们“完全错误”，而是它们的中心前提不再是当前版本主线：

1. 它们以 Discussion Build / Multi-Actor Build 为主要扩展方向。
2. 它们大量依赖 Role AI、Participant、Discussion Room、Project Object 等当前未立项能力。
3. 它们描述的是未来态完整 Build Mode，而不是当前版本的 Chat Build。

因此：

1. 当前版本不得直接以旧 BLD 文档作为实现主线。
2. 当前版本必须以 `A-CBT-*` 正式主线文档序列为唯一主线。

## 七、当前版本边界

### 7.1 当前版本纳入

1. 自然对话中的构建意图识别或按钮触发。
2. 构建前的大纲生成与确认。
3. 大纲确认后的正式构建启动。
4. 构建中的进度、状态、过程展示。
5. 用户手动中断。
6. 生成新的项目资源。

### 7.2 当前版本明确不纳入

1. Discussion Build
2. Multi-Actor Build
3. 主控 AI + 角色 AI 协作体系
4. 真人参与者
5. 分享链接 / 邀请链接 / 外部协作
6. Discussion Room / Collaboration Room / Meeting Room
7. 构建中的自然语义改向
8. 构建时修改既有工作区内容

## 八、规则源头说明

本文中涉及的 Chat Build 核心规则，不在本文内二次定义规则编号。

当前统一规则源头以 [`A-CBT-I-P-01_Chat Build最小协议与状态.md`](./A-CBT-I-P-01_Chat%20Build%E6%9C%80%E5%B0%8F%E5%8D%8F%E8%AE%AE%E4%B8%8E%E7%8A%B6%E6%80%81.md) 中的 `BR-CBT-*` 规则矩阵为准，本文主要承认并使用：

1. `BR-CBT-VERIFY-001`：大纲确认硬边界
2. `BR-CBT-STATE-001`：构建开始后不可语义改向
3. `BR-CBT-ASSET-001`：只生成新资源，不修改既有内容
4. `BR-CBT-MODEL-001`：chat 在构建前后角色切换
5. `BR-CBT-DATA-001`：workspace 写入边界只允许新增资源

## 九、当前实现关系声明

当前文档是当前版本的产品主线，不等于当前代码已经完成 Chat Build。

当前代码现状更接近：

1. chat / agent 主链
2. template runtime
3. task / artifact 基座
4. workspace / reference / memory / knowledge / template 等通用基础设施

正式承接关系见：[`A-CBT-I-D-01_Chat Build与当前实现承接.md`](./A-CBT-I-D-01_Chat%20Build%E4%B8%8E%E5%BD%93%E5%89%8D%E5%AE%9E%E7%8E%B0%E6%89%BF%E6%8E%A5.md)

最小状态与控制协议见：[`A-CBT-I-P-01_Chat Build最小协议与状态.md`](./A-CBT-I-P-01_Chat%20Build%E6%9C%80%E5%B0%8F%E5%8D%8F%E8%AE%AE%E4%B8%8E%E7%8A%B6%E6%80%81.md)

开发控制与验收边界见：[`A-CBT-I-T-01_Chat Build状态控制与实现映射.md`](./A-CBT-I-T-01_Chat%20Build%E7%8A%B6%E6%80%81%E6%8E%A7%E5%88%B6%E4%B8%8E%E5%AE%9E%E7%8E%B0%E6%98%A0%E5%B0%84.md)
