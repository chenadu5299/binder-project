# 005_workspace对象生命周期

## 一、文档定位

本文定义 Binder MVP 的 Workspace 对象生命周期规范。  
目标是统一对象状态粒度、状态转换条件、失败回退路径和跨对象联动规则。

本文不定义具体数据库表结构与 UI 细节。

---

## 二、生命周期建模原则

1. 一个对象只允许一条主状态链，不并列多套口径。  
2. 状态转换必须绑定触发事件和守卫条件。  
3. 失败路径必须显式可见，不能隐式吞并。  
4. 业务状态流转与执行观测事件分离。  

---

## 三、对象生命周期总览

| 对象 | 主状态链 | 终态 |
|---|---|---|
| WorkspaceSession | `Unselected -> Selecting -> Active -> Switching -> Closed` | `Closed` |
| WorkspaceFile | `Discovered -> Cached -> Opened -> Dirty -> Saved -> Synced` | `Deleted`（分支终态） |
| FileSnapshot | `Missing -> Building -> Ready -> Stale -> Refreshing` | 无固定终态 |
| PendingDiff | `Generated -> Pending -> Accepted/Rejected/Expired` | `Accepted` / `Rejected` / `Expired` |
| ChatBinding | `Temporary -> Bound -> Restoring -> Active -> Detached` | `Detached` |
| TargetExecution | `Resolving -> Ready -> Executing -> Completed/Aborted` | `Completed` / `Aborted` |

---

## 四、对象级状态机

## 4.1 WorkspaceSession

状态定义：
1. `Unselected`：未选择工作区。  
2. `Selecting`：正在打开/创建工作区。  
3. `Active`：工作区可用，允许文件与 AI 操作。  
4. `Switching`：旧工作区卸载 + 新工作区加载。  
5. `Closed`：会话关闭或无活动工作区。  

转换规则：
- `Unselected -> Selecting`：用户执行“打开/创建工作区”。  
- `Selecting -> Active`：工作区路径校验与基础资源加载成功。  
- `Active -> Switching`：用户切换工作区。  
- `Switching -> Active`：新工作区完成初始化。  
- `Active -> Closed`：应用关闭或显式关闭工作区。  

守卫条件：
- 只有 `Active` 允许发起编辑执行链。  
- `Switching` 状态禁止新建编辑任务。  

---

## 4.2 WorkspaceFile

状态定义：
1. `Discovered`：文件树识别到文件。  
2. `Cached`：存在可用快照或缓存内容。  
3. `Opened`：文件已绑定编辑器标签页。  
4. `Dirty`：编辑后未保存。  
5. `Saved`：已成功落盘。  
6. `Synced`：落盘内容与缓存快照一致。  
分支：
- `ExternallyModified`：检测到磁盘外部修改。  
- `Deleted`：文件已不存在。  

转换规则：
- `Discovered -> Cached`：首次构建快照成功。  
- `Cached -> Opened`：用户打开文件或静默加载完成并绑定编辑器。  
- `Opened -> Dirty`：内容变更。  
- `Dirty -> Saved`：保存成功。  
- `Saved -> Synced`：缓存同步完成（如 file_cache 更新）。  
- `Opened/Dirty/Synced -> ExternallyModified`：mtime 检测发现外部变化。  
- 任意态 -> `Deleted`：文件删除事件确认。  

外部修改策略（MVP）：
- `ExternallyModified` 选择“加载更改”后：相关 pending diff 进入 `Expired`。  
- `ExternallyModified` 选择“继续覆盖”后：保持当前编辑内容，等待后续保存。  

---

## 4.3 FileSnapshot

状态定义：
1. `Missing`：无可用快照。  
2. `Building`：正在构建 canonical 快照。  
3. `Ready`：快照可用于定位与编辑。  
4. `Stale`：源文件变化导致快照过期。  
5. `Refreshing`：正在重建。  

转换规则：
- `Missing -> Building`：打开文件或执行前置加载触发。  
- `Building -> Ready`：`canonicalLoaded=true`。  
- `Ready -> Stale`：源内容变更（mtime/hash 不一致）。  
- `Stale -> Refreshing`：触发重建。  
- `Refreshing -> Ready`：重建成功。  

守卫条件：
- 非当前文档执行链要求 `FileSnapshot=Ready`。  
- `Stale` 状态不得进入执行阶段。  

---

## 4.4 PendingDiff

状态定义：
1. `Generated`：工具返回 diff 但未入池。  
2. `Pending`：待用户决策。  
3. `Accepted`：已执行并生效。  
4. `Rejected`：用户拒绝。  
5. `Expired`：失效，不可执行。  

转换规则：
- `Generated -> Pending`：入 diff 池成功。  
- `Pending -> Accepted`：通过单卡或批量接受执行成功。  
- `Pending -> Rejected`：用户拒绝。  
- `Pending -> Expired`：内容/区间不再可稳定执行。  

约束：
- `Pending` 不推进逻辑内容版本。  
- `Accepted` 才推进真实内容版本。  
- `Expired` 不弹业务打断提示（按对话编辑统一方案语义）。  

---

## 4.5 ChatBinding

状态定义：
1. `Temporary`：未绑定工作区的临时会话。  
2. `Bound`：绑定到 workspacePath。  
3. `Restoring`：从工作区存储恢复会话。  
4. `Active`：可参与当前对话编辑。  
5. `Detached`：会话解绑或归档。  

转换规则：
- `Temporary -> Bound`：用户把会话并入当前工作区。  
- `Bound -> Restoring`：启动或切换时加载历史会话。  
- `Restoring -> Active`：恢复成功。  
- `Active -> Detached`：删除会话、切换解绑、工作区关闭。  

约束：
- `Active` 会话必须与当前 `workspacePath` 一致。  
- workspace 切换后，旧绑定会话不可继续作为当前编辑上下文。  

---

## 4.6 TargetExecution（执行门禁对象）

状态定义：
1. `Resolving`：解析目标文件与上下文。  
2. `Ready`：门禁全部通过。  
3. `Executing`：执行工具调用。  
4. `Completed`：执行完成。  
5. `Aborted`：执行中断。  

Ready 守卫（四条件）：
1. `targetFileResolved`  
2. `canonicalLoaded`  
3. `blockMapReady`  
4. `contextInjected`  

任一条件不满足：`Resolving -> Aborted`。  

---

## 五、跨对象联动规则

1. WorkspaceSession 进入 `Switching` 时：  
所有 `TargetExecution` 必须转 `Aborted`。  

2. WorkspaceFile 进入 `ExternallyModified` 且用户选择“加载更改”时：  
关联 `PendingDiff(Pending)` 全部转 `Expired`。  

3. PendingDiff 转 `Accepted` 时：  
触发 WorkspaceFile `Dirty -> Saved -> Synced` 路径（按实际保存策略）。  

4. FileSnapshot 从 `Ready -> Stale` 时：  
新的 `TargetExecution` 不得进入 `Executing`。  

5. ChatBinding `Detached` 时：  
该会话不能继续作为当前编辑执行上下文来源。  

---

## 六、失败与回退语义

1. 状态流转失败优先回到上一个稳定态，不允许悬空状态。  
2. `TargetExecution` 失败只影响当前执行实例，不直接污染 WorkspaceSession。  
3. `PendingDiff` 的 `Expired` 是业务状态，不等于执行异常事件。  
4. 执行异常统一走观测通道（日志/错误码），不改写生命周期定义。  

---

## 七、最小验收清单（MVP）

1. 切换工作区时不出现跨 workspace 状态串用。  
2. 非当前文档执行在门禁不全时必定中断，不进入执行态。  
3. 外部修改加载后，pending diff 一致转失效。  
4. 同一文件多轮 diff 的状态迁移可追踪且无歧义。  
5. 会话绑定关系在恢复与切换后保持一致。  

---

## 八、与现有文档的关系

1. 来源参考：  
- `Workspace改造可落地实施方案.md`（阶段流转和执行策略）  
- `binder开发协同.md`（协同事件与状态字段）  

2. 对齐文档：  
- `004_workspace模型定义.md`（对象模型主定义）  
- `对话编辑-统一整合方案.md`（Diff 主链规则）  
- `文档逻辑状态传递规范.md`（逻辑状态边界）  

3. 边界声明：  
本文不替代对话编辑协议，不定义提示词，不定义 UI 组件交互细节。
