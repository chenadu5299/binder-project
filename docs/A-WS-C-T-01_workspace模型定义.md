# workspace模型定义

## 文档头

- 结构编码：`WS-C-T-01`
- 文档属性：`主结构`
- 主责模块：`WS`
- 文档职责：`workspace模型定义 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `SYS-C-T-01`, `WS-C-T-02`, `WS-C-T-03`, `WS-M-D-01`
- 直接承接：无
- 接口耦合：`AST-M-P-01`, `AG-M-P-01`, `SYS-I-P-01`
- 汇聚影响：`CORE-C-R-01`, `WS-M-D-01`
- 扩散检查：`WS-M-T-01`, `WS-M-T-02`, `WS-M-T-03`, `WS-M-T-04`, `WS-M-T-05`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 一、文档定位

本文定义 Binder MVP 的 Workspace 领域模型，作为“文件管理 + 编辑器 + AI 对话编辑”的统一运行容器规范。  
本文只定义对象、关系、生命周期、状态约束，不展开具体代码实现。

补充定位：

Workspace 在 Binder 中不是普通背景容器，而是系统的基础工作框架。  
因此，本文定义的对象模型不只服务于文件打开与保存，也服务于资源进入、任务承载、结果回流和跨能力协同。

---

## 二、建模目标（MVP）

1. 给出 Workspace 的独立对象模型（不再混在资源 UI 或单点实现文档里）。  
2. 明确核心对象生命周期，避免状态漂移和职责重叠。  
3. 对齐对话编辑主链：目标文件可定位、可缓存、可执行、可回收。  
4. 支持非当前文档静默加载与同一 diff 池语义。  
5. 为工作台级资源入口、任务承载和结果呈现提供统一归属模型。  

---

## 三、Workspace 领域对象模型

## 3.1 聚合根：Workspace

| 对象 | 定义 | 核心字段 |
|---|---|---|
| Workspace | 用户当前工作的本地项目容器 | `workspaceId`、`workspacePath`、`status`、`createdAt`、`openedAt` |

约束：
1. 同一运行实例只能有一个 Active Workspace。  
2. 所有文件、缓存、聊天、diff 都必须归属某个 Workspace。  
3. 所有资源入口、上下文资产和任务执行对象都必须首先落在某个 Workspace 语义下定义边界。  

## 3.2 核心实体

| 实体 | 职责 | 关键字段 |
|---|---|---|
| WorkspaceFile | 工作区内可管理文件对象 | `filePath`、`fileType`、`mtime`、`exists` |
| WorkspaceFolder | 工作区目录对象 | `folderPath`、`parentPath` |
| FileSnapshot | 文件可编辑快照（canonical） | `filePath`、`canonicalHtml`、`snapshotHash`、`sourceMtime` |
| EditorBinding | 文件与编辑器标签绑定关系 | `filePath`、`editorTabId`、`isActiveTab` |
| PendingDiffSet | 文件级待处理 diff 集合 | `filePath`、`diffCount`、`lastUpdatedAt` |
| ChatBinding | 会话与 workspace 绑定关系 | `chatTabId`、`workspacePath`、`targetFile?` |
| ResourceNode | 工作台资源入口对象抽象（工作区/记忆/知识库/模板/时间轴） | `resourceType`、`resourceId`、`scope` |
| ResourcePartition | 工作台资源分区对象 | `partitionType`、`isExpanded`、`isSearchActive` |

## 3.3 值对象（Value Objects）

| 值对象 | 定义 |
|---|---|
| WorkspacePath | 工作区绝对路径标识 |
| FileIdentity | 文件唯一身份（建议由 `workspacePath + filePath` 构成） |
| SnapshotVersion | 快照版本语义（`snapshotHash + sourceMtime`） |
| TargetReadiness | 非当前文档执行就绪态：`targetFileResolved/canonicalLoaded/blockMapReady/contextInjected` |
| ResourceScope | 资源作用域：`workspace | memory | knowledge | template | timeline` |

---

## 四、对象关系图（逻辑）

1. Workspace 1 -> N WorkspaceFile  
2. WorkspaceFile 1 -> 0..1 FileSnapshot（当前有效快照）  
3. WorkspaceFile 1 -> 0..N PendingDiff  
4. WorkspaceFile 1 -> 0..N EditorBinding（可多 tab）  
5. Workspace 1 -> N ChatBinding  
6. ChatBinding N -> 1 TargetFile（运行时可为空）  
7. Workspace 1 -> N ResourceNode  
8. Workspace 1 -> N ResourcePartition  

关系约束：
1. PendingDiff 必须绑定 FileIdentity，不允许悬空。  
2. FileSnapshot 不可跨 workspace 复用。  
3. ChatBinding 迁移到其他 workspace 时，原绑定全部失效重建。  
4. ResourceNode 必须归属于某个 ResourcePartition，不允许脱离工作台语义单独存在。  
5. 工作台分区可见性不等于任务注入优先级。  

---

## 五、生命周期模型

## 5.1 Workspace 生命周期

状态：
`Unselected -> Selecting -> Active -> Switching -> Closed`

说明：
1. `Unselected`：未选择工作区。  
2. `Selecting`：用户正在打开或创建工作区。  
3. `Active`：工作区已加载，可进行文件与 AI 操作。  
4. `Switching`：切换工作区过程态，旧 workspace 解绑，新 workspace 装载。  
5. `Closed`：当前进程内无活动 workspace。  

硬约束：
1. 仅 `Active` 允许进入 AI 编辑执行链。  
2. `Switching` 阶段禁止新建编辑任务。  

## 5.2 WorkspaceFile 生命周期

状态：
`Discovered -> Cached -> Opened -> Dirty -> Saved -> Synced`

补充分支：
- `ExternallyModified`（外部修改检测到）  
- `Deleted`（文件已移除）  

说明：
1. `Discovered`：文件树已识别到文件。  
2. `Cached`：存在可用 canonical 快照。  
3. `Opened`：已与编辑器实例绑定。  
4. `Dirty`：内容已改动未保存。  
5. `Saved`：落盘成功。  
6. `Synced`：快照与落盘状态一致。  
7. `ExternallyModified`：磁盘版本变化，等待用户策略决策。  

## 5.3 PendingDiff 生命周期

状态：
`Generated -> Pending -> Accepted | Rejected | Expired`

规则：
1. `Generated` 到 `Pending`：工具返回 canonical diff 后入池。  
2. `Accepted`：写入真实内容并推进 revision。  
3. `Rejected`：用户明确拒绝，退出待执行。  
4. `Expired`：区间无法稳定执行或内容已被改写导致失效。  

约束：
1. `Expired` 与执行失败观测不是同一概念，必须分离。  
2. `Pending` 不能直接改变逻辑状态。  

---

## 六、状态机与关键事件

## 6.1 关键领域事件

| 事件 | 触发对象 | 结果 |
|---|---|---|
| WorkspaceActivated | Workspace | 进入 Active，可处理编辑任务 |
| FileOpened | WorkspaceFile | 建立 EditorBinding |
| SnapshotBuilt | FileSnapshot | `canonicalLoaded=true` |
| DiffGenerated | PendingDiffSet | 新增 Pending 项 |
| DiffAccepted | PendingDiff | 文件内容更新、revision 前进 |
| ExternalChangeDetected | WorkspaceFile | 进入 `ExternallyModified` |
| WorkspaceSwitched | Workspace | 旧绑定失效、新绑定重建 |
| ResourcePartitionToggled | ResourcePartition | 工作台分区展开状态变化 |

## 6.2 非当前文档执行门禁（必须同时满足）

1. `targetFileResolved`  
2. `canonicalLoaded`  
3. `blockMapReady`  
4. `contextInjected`  

任一失败：本次任务不得进入工具执行链。

---

## 七、一致性约束

1. 单一目标文件约束：一次编辑请求只允许一个 `targetFile` 真源。  
2. 快照同源约束：定位与执行使用同一快照语义，不允许中途切换来源。  
3. 路径隔离约束：所有状态与缓存按 `workspacePath` 隔离。  
4. 生命周期前置约束：对象状态不满足时禁止越级操作（例如未 `canonicalLoaded` 即执行 diff）。  
5. 失效与暴露隔离：业务状态流转（expired）不得替代执行观测（error/event）。  
6. 工作台入口约束：资源进入系统时必须先落到明确的 ResourcePartition，不允许出现平行入口链。  
7. 工作台分区约束：当前激活分区只定义入口焦点，不直接定义任务目标和上下文优先级。  

---

## 八、与现有文档关系

1. 来源文档：  
- `R-WS-M-R-02_Workspace改造可落地实施方案.md`（结构与主流程）  
- `R-WS-M-R-01_资源管理需求文档.md`（资源对象语义与交互域）  
- `A-WS-M-D-01_workspace工作台协同主控文档.md`（工作台基础框架与资源入口语义）  

2. 对齐文档：  
- `A-CORE-C-D-01_产品定义总纲.md`（MVP 边界）  
- `A-SYS-C-T-01_系统总体架构.md`（系统基础层定位）  
- `A-WS-M-T-01_workspace架构.md`（Workspace 作为工作底座的架构定位）  
- `R-DE-M-R-02_对话编辑-统一整合方案.md`（编辑执行规则）  
- `R-DE-M-R-03_文档逻辑状态传递规范.md`（L/baseline/revision 语义）  

3. 边界声明：  
本文不定义 Diff 详细协议字段、不定义提示词结构、不定义具体 UI 组件样式。

---

## 九、MVP 验收标准（Workspace 维度）

1. 工作区切换后状态一致，不出现跨 workspace 污染。  
2. 非当前文档可通过就绪门禁稳定进入执行链。  
3. 文件外部修改处理与 pending diff 流程一致且可预期。  
4. 文件保存后快照可同步，后续定位可复用。  
5. 同一文件多轮 diff 可在同一池内正确流转（pending/accepted/rejected/expired）。  
