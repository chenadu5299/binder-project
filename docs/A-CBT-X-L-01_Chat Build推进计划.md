# Chat Build推进计划

## 文档头

- 结构编码：`CBT-X-L-01`
- 文档属性：`Active 主线`
- 主责模块：`CBT`
- 文档职责：`定义 Chat Build 的开发对象、模块依赖、阶段划分、输出结果与规则级验收口径`
- 上游约束：`CBT-C-D-01`, `CBT-M-D-01`, `CBT-M-T-01`, `CBT-I-P-01`, `CBT-I-D-01`, `CBT-I-T-01`, `CBT-I-T-02`, `CBT-I-S-01`, `CBT-I-S-02`, `CBT-I-S-03`
- 直接承接：无
- 接口耦合：`A-PROD-C-L-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`
- 汇聚影响：`A-CORE-C-R-01`, `A-PROD-C-L-01`
- 扩散检查：`A-CBT-I-T-01`, `A-CBT-I-T-02`, `A-CBT-I-S-01`, `A-CBT-I-S-02`, `A-CBT-I-S-03`, `A-PROD-C-L-01`, `A-TMP-M-D-02`, `A-AG-M-T-03`, `A-AG-M-T-05`
- 变更要求：`修改本文后，必须复核：A-CBT-I-P-01、A-CBT-I-T-01、A-CBT-I-T-02、A-CBT-I-S-01、A-CBT-I-S-02、A-CBT-I-S-03、A-PROD-C-L-01、A-TMP-M-D-02、A-AG-M-T-03、A-AG-M-T-05`
- 使用边界：`本文只定义当前版本开发执行方案、对象依赖与阶段验收，不替代产品边界与规则源头`

---

## 一、文档定位

本文是 Chat Build 当前版本的**开发计划主文档**。

本文不再停留在“阶段方向说明”，而是直接回答：

1. 当前版本要开发哪些对象。
2. 这些对象之间如何依赖。
3. 分阶段应该交付什么。
4. 每阶段 Done Definition 是什么。
5. 每阶段要验证哪些 `BR-CBT-*` 规则。

## 二、开发对象清单

| 开发对象 | 当前职责 | 主要输入文档 | 输出结果 |
|---|---|---|---|
| Chat Build 控制层 | 意图接入、状态推进、确认闸口、运行结束判定 | `A-CBT-I-P-01`, `A-CBT-I-T-01`, `A-CBT-I-T-02` | `ChatBuildController` 骨架 |
| 状态管理模块 | 保存 UI 状态、运行状态、结束态快照 | `A-CBT-I-P-01`, `A-CBT-I-T-01`, `A-CBT-I-T-02` | `ChatBuildStateStore` + durable record 结构 |
| 执行链引擎 | Outline 确认后启动 step loop 并推进执行 | `A-CBT-I-T-02`, `A-AG-M-T-03`, `A-AG-M-T-05`, `A-TMP-M-D-02` | `BuildRunner` 骨架 |
| workspace 写入模块 | 新资源 root 创建、文件写入、元信息写入、冲突阻断 | `A-CBT-I-S-01`, `A-CBT-I-T-02`, `A-CBT-I-D-01` | `WorkspaceBuildWriter` |
| 中断控制模块 | 接收中断请求、传播到 runner、安全点停止、回写 interrupted | `A-CBT-I-S-02`, `A-CBT-I-T-02`, `A-CBT-I-T-01` | `BuildInterruptSignal` + `requestInterrupt()` |
| UI 状态展示层 | 构建前触发、构建中展示、构建后恢复 | `A-CBT-M-D-01`, `A-CBT-I-S-03`, `A-CBT-I-T-01` | chat/build UI 状态面板 |

## 三、模块依赖关系

当前最小实现必须按以下依赖顺序推进：

```text
状态层 → 控制层 → 执行链 → workspace
                 ↓
                UI
```

更细的模块依赖图：

```text
ChatBuildStateStore
  └─> ChatBuildController
        ├─> OutlineGenerator
        ├─> BuildRunner
        │     ├─> TemplateRuntimeAdapter
        │     ├─> WorkspaceBuildWriter
        │     └─> BuildInterruptSignal
        └─> TaskArtifactRecorder

ChatBuildController
  └─> Chat Build UI 状态展示层
```

依赖解释：

1. 状态层必须先存在，否则控制层没有真源。
2. 控制层必须先存在，否则执行链没有闸口与结束判定。
3. 执行链必须先于 workspace 写入集成，否则写入边界无法挂在 step loop 上。
4. UI 依赖状态层与控制层，但不应反向决定状态跃迁。

## 四、阶段拆分

当前版本按 `P0 -> P1 -> P2` 推进。

### 4.1 P0：执行链骨架 + 状态系统

开发对象：

1. Chat Build 控制层
2. 状态管理模块
3. Outline 生成 / 确认链
4. 执行链引擎骨架（无真实 workspace 写入）

输入文档：

1. `A-CBT-I-P-01`
2. `A-CBT-I-T-01`
3. `A-CBT-I-T-02`
4. `A-CBT-M-D-01`
5. `A-CBT-M-T-01`

输出结果：

1. `discussion -> intent_pending -> outline_drafting -> outline_pending_confirm -> building -> completed/failed` 的最小状态链
2. `ChatBuildController` 骨架
3. `ChatBuildStateStore` 骨架
4. `BuildRunner` dry-run 骨架

Done Definition：

1. 用户可以从 chat 触发构建意图。
2. 系统可以生成并展示 Build Outline。
3. 用户确认后可以进入 `building`。
4. 没有 workspace 写入也能跑通一次 dry-run 的 completed / failed 结束态。

规则级验收口径：

1. `BR-CBT-RUN-001`  
验证轻量确认层只决定是否进入大纲，不替代确认。
2. `BR-CBT-VERIFY-001`  
验证未确认大纲不能进入 `building`。
3. `BR-CBT-MODEL-001`  
验证构建前后 chat 角色已经切换。

### 4.2 P1：workspace 写入 + 中断机制

开发对象：

1. workspace 写入模块
2. 中断控制模块
3. task / artifact 结束态记录
4. `_build_meta.json` / `_build_steps.json` 写入

输入文档：

1. `A-CBT-I-T-02`
2. `A-CBT-I-S-01`
3. `A-CBT-I-S-02`
4. `A-CBT-I-D-01`
5. `A-AG-M-T-05`

输出结果：

1. 独立 build root 写入
2. partial build 标记
3. interrupted 传播与回写
4. completed / failed / interrupted 三种结束态持久化

Done Definition：

1. 正式构建可按 step 写入新增资源。
2. 已存在资源不会被覆盖。
3. 用户可以在 `building` 态触发中断。
4. 中断后保留已完成写入，未完成写入不提交。
5. `_build_meta.json` 正确标记 `completed` / `failed` / `interrupted`。

规则级验收口径：

1. `BR-CBT-ASSET-001`  
验证正式构建只生成新资源，不修改既有内容。
2. `BR-CBT-DATA-001`  
验证 workspace writer 只在新增资源边界内工作。
3. `BR-CBT-STATE-002`  
验证中断只结束当前运行，不改写目标。

### 4.3 P2：UI 展示层 + 接管收口

开发对象：

1. UI 状态展示层
2. Chat / Build 接管机制
3. 进度展示
4. 完成 / 失败 / 中断结果摘要

输入文档：

1. `A-CBT-M-D-01`
2. `A-CBT-M-T-01`
3. `A-CBT-I-S-03`
4. `A-CBT-I-T-01`
5. `A-CBT-I-T-02`

输出结果：

1. 构建中 chat 降权且不干扰当前运行
2. 进度、状态、过程说明展示
3. 结束态后恢复讨论入口

Done Definition：

1. `building` 态 UI 中看不到自由需求改写通道。
2. 用户可以查看进度、步骤、过程说明。
3. 用户可通过明确中断入口停止运行。
4. 结束态后能够重新回到讨论并发起下一轮。

规则级验收口径：

1. `BR-CBT-STATE-001`  
验证构建中自然语义输入不改向。
2. `BR-CBT-MODEL-001`  
验证 chat 在构建前、中、后角色切换成立。
3. `BR-CBT-STATE-002`  
验证中断结束态展示与恢复逻辑成立。

## 五、阶段依赖与先后关系

阶段依赖必须严格遵守：

1. 不得跳过 P0 直接做 workspace 写入。
2. 不得在 P1 前实现“真实写入但无中断”。
3. 不得在 P2 前实现“自由文本参与 building 态控制”。

依赖关系如下：

```text
P0 完成后才能开始 P1
P1 完成后才能开始 P2
```

原因：

1. P0 决定状态真源与闸口。
2. P1 决定结果落盘与安全结束。
3. P2 决定用户可见行为与交互收口。

## 六、当前版本禁止实现项

以下能力在当前计划中禁止抢跑：

1. Discussion Build
2. Multi-Actor Build
3. 主控 AI / 角色 AI 协作
4. 构建中自由文本继续改需求
5. workspace 覆盖式写入
6. template runtime 越权接管正式构建控制权

## 七、里程碑验收总表

| 阶段 | 必须跑通 | 必须拦住 |
|---|---|---|
| `P0` | 意图触发、大纲生成、大纲确认、dry-run 执行 | 未经确认直接进入 `building` |
| `P1` | 新资源写入、中断回写、partial 标记 | 覆盖既有资源、未完成步骤被误提交 |
| `P2` | 进度展示、chat/build 接管、结束态恢复 | `building` 态自由语义改向 |

## 八、当前版本完成标准

当前 Chat Build 最小运行版本完成，至少必须满足：

1. 可以从 chat 进入构建触发。
2. 可以生成并确认大纲。
3. 可以启动一次单主控正式构建。
4. 可以按步骤写入新增资源。
5. 可以手动中断。
6. 可以得到 `completed` / `failed` / `interrupted` 三种结束态。
7. 可以在结束后返回讨论重新开始。
