# Chat Build与当前实现承接

## 文档头

- 结构编码：`CBT-I-D-01`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`说明 Chat Build 与当前代码基础设施的真实承接关系与缺口`
- 上游约束：`CBT-C-D-01`, `CBT-M-D-01`, `CBT-M-T-01`
- 直接承接：`CBT-I-T-01`, `CBT-I-T-02`, `CBT-I-S-01`, `CBT-I-S-02`, `CBT-I-S-03`, `CBT-X-L-01`
- 接口耦合：`A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-SYS-C-T-01`, `A-CBT-I-T-02`, `A-CBT-I-S-01`, `A-CBT-I-S-02`, `A-CBT-I-S-03`
- 汇聚影响：`A-CORE-C-R-01`, `A-CBT-X-L-01`
- 扩散检查：`A-CBT-I-T-01`, `A-CBT-I-T-02`, `A-CBT-I-S-01`, `A-CBT-I-S-02`, `A-CBT-I-S-03`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-PROD-C-L-01`
- 变更要求：`修改本文后，必须复核：A-CBT-I-T-01、A-CBT-I-T-02、A-CBT-I-S-01、A-CBT-I-S-02、A-CBT-I-S-03、A-TMP-M-D-02、A-AG-M-T-03、A-AG-M-T-05、A-PROD-C-L-01`
- 使用边界：`本文只描述承接关系，不把通用基础设施写成已实现功能`

---

## 一、当前代码现状总判断

当前代码没有正式 Chat Build 主链。

当前代码更接近以下基础设施组合：

1. chat / agent 主链
2. template runtime
3. task / artifact 基座
4. workspace / reference / memory / knowledge / template 等通用基础设施

因此，Chat Build 当前是：

1. 已建立文档主线
2. 尚未完成代码主链
3. 但已有较强承接基础

## 二、可复用的基础设施

### 2.1 chat / agent 主链

当前代码已有 chat / agent 运行主链。

它可承接：

1. 构建前的自然对话阶段
2. 构建意图识别前的收敛阶段
3. 现有 AI 请求发送入口

它不等于：

1. Chat Build 已实现
2. 大纲确认链已存在
3. 构建中冻结式状态流已存在

### 2.2 template runtime

当前代码已有 workflow template 的 parse / compile / runtime 机制。

它可承接：

1. 大纲后的过程约束
2. 阶段性执行骨架
3. 运行时步骤推进的基础能力

它不等于：

1. Chat Build 执行引擎
2. Chat Build 大纲确认系统
3. 独立的项目级构建调度器

### 2.3 task / artifact 基座

当前代码已有 `agent_tasks` / `agent_artifacts` 及其前后端访问能力。

它可承接：

1. Chat Build 运行状态
2. 中间产物
3. 进度与结果暴露

它不等于：

1. Chat Build 专属任务模型
2. Chat Build 状态机
3. 产物落盘闭环已存在

### 2.4 workspace / reference / memory / knowledge / template

这些基础设施可承接：

1. 构建输入组织
2. 显式引用
3. 资源检索
4. 模板约束输入
5. 工作区内资源落盘边界

它们不等于：

1. Chat Build 工作流已存在
2. Chat Build 只生成新资源的落盘规则已完成

## 三、当前代码中必须避免的误判

### 3.1 通用基础设施不等于 Chat Build 已实现

当前代码中已有：

1. 聊天主链
2. 工作台
3. 模板运行时
4. task / artifact

但这些都只是承接基础，不是 Chat Build 主链完成。

### 3.2 template runtime 不等于构建引擎

模板运行时当前仍附着在现有 Agent 链路内。

它只能说明：

1. 已有“过程约束”与“步骤推进”基础

不能说明：

1. 已有独立 Chat Build 执行器

### 3.3 workspace 不等于构建工作流

workspace 当前提供的是：

1. 工作区边界
2. 文件读写约束
3. 资源与时间轴基础

它不自动推出：

1. Build Outline
2. Chat Build 状态流
3. 构建中的冻结控制

## 四、当前缺口

若要从当前代码走向 Chat Build，仍缺少以下正式主链：

1. Chat Build 专属入口
2. 构建意图成立后的正式状态流
3. Build Outline 生成与确认链
4. 构建启动后的冻结控制
5. 构建中进度 / 状态展示层
6. 手动中断控制
7. “只生成新资源、不修改既有内容”的正式写入链

## 五、为什么这套文档没有写成未来空中楼阁

本文明确区分了三层：

1. 当前代码已有的通用基础设施
2. 这些基础设施对 Chat Build 的承接价值
3. 当前仍不存在的正式主链

因此，当前 Active 文档的作用不是“宣称已完成”，而是：

1. 冻结正确方向
2. 阻止旧 BLD 文档继续污染实现认知
3. 给后续实现建立真实承接面

## 六、控制映射入口

本文只回答“当前代码能承接什么”。

若需要继续回答：

1. 哪些状态 / 控制对象要先做
2. 哪些对象互相依赖
3. 哪些行为必须被拦住
4. 哪些验收点必须验证

则应继续以 [`A-CBT-I-T-01_Chat Build状态控制与实现映射.md`](./A-CBT-I-T-01_Chat%20Build%E7%8A%B6%E6%80%81%E6%8E%A7%E5%88%B6%E4%B8%8E%E5%AE%9E%E7%8E%B0%E6%98%A0%E5%B0%84.md) 为开发控制入口。

若需要继续回答：

1. 执行链如何真正从 chat 输入跑到 workspace 写入
2. 中断如何传播并结束当前运行
3. workspace 写入如何只新增资源
4. chat 与 build 如何在构建前后切换控制权

则应继续以以下文档为实现级入口：

1. [`A-CBT-I-T-02_Chat Build执行链与运行控制.md`](./A-CBT-I-T-02_Chat%20Build%E6%89%A7%E8%A1%8C%E9%93%BE%E4%B8%8E%E8%BF%90%E8%A1%8C%E6%8E%A7%E5%88%B6.md)
2. [`A-CBT-I-S-01_Workspace写入策略与资源边界.md`](./A-CBT-I-S-01_Workspace%E5%86%99%E5%85%A5%E7%AD%96%E7%95%A5%E4%B8%8E%E8%B5%84%E6%BA%90%E8%BE%B9%E7%95%8C.md)
3. [`A-CBT-I-S-02_构建中断机制.md`](./A-CBT-I-S-02_%E6%9E%84%E5%BB%BA%E4%B8%AD%E6%96%AD%E6%9C%BA%E5%88%B6.md)
4. [`A-CBT-I-S-03_Chat与Build接管机制.md`](./A-CBT-I-S-03_Chat%E4%B8%8EBuild%E6%8E%A5%E7%AE%A1%E6%9C%BA%E5%88%B6.md)
