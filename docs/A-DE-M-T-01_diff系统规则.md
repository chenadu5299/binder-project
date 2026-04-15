# diff系统规则（可执行规范版）

## 文档头

- 结构编码：`DE-M-T-01`
- 文档属性：`主结构`
- 主责模块：`DE`
- 文档职责：`diff系统规则 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `WS-M-D-01`, `AG-M-T-01`, `ED-M-T-01`, `DE-M-D-01`
- 直接承接：`DE-M-P-01`, `DE-X-L-01`
- 接口耦合：`WS-M-D-01`, `ED-M-T-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `DE-M-D-01`
- 扩散检查：`DE-M-T-02`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L2 / 二级规则文档`
> 文档类型：`专项规则 / Diff 协议与执行规则`
> 当前状态：`Active`
> 受约束于：`A-CORE-C-D-02`、`A-CORE-C-D-05`、`A-DE-M-D-01`
> 可约束：`DE` 相关提示词、计划、实现和验收文档中的 Diff 协议与展示/执行规则
> 可用于：`定义 canonical diff、区间约束、展示规则、执行与失效规则`
> 不可用于：`重定义模块边界、当前文档优先级、Agent 上位状态语义`

---

## 一、文档定位与生效原则

本文定义对话编辑链路中 Diff 子系统的可执行规则，覆盖：
1. Diff 数据结构与区间语义。
2. 聊天侧/文档侧展示约束。
3. 单卡与批量执行一致性。
4. 失效与失败暴露隔离。

生效优先级：
1. `A-CORE-C-D-02_产品术语边界.md`（共享字段与术语主定义）。
2. `A-CORE-C-D-05_状态单一真源原则.md`（状态真源与执行/展示边界）。
3. `A-DE-M-D-01_对话编辑统一方案.md`（模块边界与 DE 统一规则）。
4. 本文（Diff 专项规则）。
5. `R-DE-*` 文档只作历史参考，不再构成当前 Diff 规则来源。

---

## 二、规则承接矩阵（主承接 / 协同承接）

| 规则ID | 承接级别 | 本文承接点 | 开发锚点 | 验收锚点 |
|---|---|---|---|---|
| DE-VIS-001 | 主承接 | 4.1 文档侧规则 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.2 |
| DE-VIS-002 | 主承接 | 4.2 聊天侧卡片规则 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.2 |
| DE-EXP-001 | 主承接 | 6 失效规则 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.3 |
| DE-OBS-005 | 主承接 | 6.3 失败与失效隔离 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.3 |
| DE-OUT-001 | 协同承接 | 3.1 canonical diff 字段 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.1 |
| DE-OUT-002 | 协同承接 | 3.2 区间关系约束 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.2 |
| DE-OUT-003 | 协同承接 | 3.3 跨 Block 语义 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.1 |
| DE-ORI-001 | 协同承接 | 3.4 originalText 规则 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.2 |
| DE-EXEC-001 | 协同承接 | 5.1 单卡执行 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.1 |
| DE-EXEC-002 | 协同承接 | 5.2 批量执行 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.2 |
| DE-EXEC-003 | 协同承接 | 5.3 diff 池一致性 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.2 |

说明：
1. “主承接”表示该规则的展示/交互细则由 `A-DE-M-T-01_diff系统规则.md` 给出。
2. “协同承接”表示主定义在 `A-DE-M-D-01_对话编辑统一方案.md`/`A-DE-M-T-02_baseline状态协作.md`，`A-DE-M-T-01_diff系统规则.md` 提供 Diff 视角落地约束。

---

## 三、Diff 数据契约（MUST）

### 3.1 canonical diff 字段

MUST：
1. 每条 diff 必须包含：`diffId/startBlockId/startOffset/endBlockId/endOffset/originalText/newText/type/diff_type/route_source`。
2. 字段缺失的 diff 条目不得进入渲染与执行链。
3. `route_source` 必须保留用于追踪路由来源。
4. 当输入来源为精确引用四元组且无显式选区时，`route_source` 必须为 `reference`，不得写成 `block_search`。

### 3.2 区间关系

MUST：
1. 同批 diff 只允许“无交集”或“完全包含”。
2. 严禁“部分重叠”区间同时进入执行计划。
3. 检测到非法重叠时，条目必须标记失败原因并暴露。

### 3.3 跨 Block 语义

MUST：
1. 单块与跨块统一使用同一锚点结构。
2. 跨块区间保持闭区间语义一致。
3. 跨块 diff 不得拆成部分重叠多条替代执行。

表格/代码块专项规则（来源：主控附录 A.3）：
1. 表格单元格内编辑优先保持单单元格闭区间；跨单元格编辑必须显式标记跨块。
2. 代码块编辑不得自动裁剪前后缩进；`originalText` 校验按原始空白字符逐字比较。
3. 表格块与代码块之间禁止自动合并为单条 diff，避免产生语义不连续区间。

### 3.4 originalText 规则

MUST：
1. `originalText` 由目标区间直接抽取，不允许模型自由重写。
2. 跨块抽取顺序固定：起始块尾段 -> 中间完整块 -> 结束块头段。
3. 执行前必须再次校验 `originalText` 与当前逻辑内容一致性。

### 3.5 DiffEntry 扩展字段约束（工程定型）

来源：主控附录 A.1/A.2。  
建议扩展字段：
1. `status`、`acceptedAt`
2. `mappedFrom`、`mappedTo`
3. `executionExposure`
4. `expireReason`

MUST：
1. 同一次工具返回中各 diff 区间不重叠。
2. `originalText` 必须与生成时逻辑态区间一致。
3. `route_source`、`baselineId`、`documentRevision(revision)` 属于主链执行字段，主定义以 `A-CORE-C-D-02_产品术语边界.md` 与 `A-DE-M-D-01_对话编辑统一方案.md` 为准，不得作为可缺省扩展字段处理。
4. 只有展示增强类扩展字段缺失时，才允许在不破坏主链语义的前提下临时兼容读取。
5. 上述临时兼容仅限旧存量 diff 记录的展示读取，不得作为新写入、新协议输出或执行链缺字段兜底；待旧记录迁移完成后应删除该兼容。

---

## 四、展示规则（MUST）

### 4.1 文档侧

MUST：
1. 文档侧只展示删除标记，不展示新增正文。
2. 删除标记仅由 diff 状态驱动，不得被聊天侧状态文本直接改写。
3. 失效后删除标记移除，且不触发阻断交互。

样式基线（来源：主控附录 B.1）：
1. 背景色：`#FCEBEB`
2. 文字色：`#A32D2D`
3. 删除线：`line-through`

### 4.2 聊天侧

MUST：
1. 聊天侧承担完整 diff 信息展示（原文/新文/状态/定位）。
2. 卡片状态最小集：`pending/expired/accepted/rejected`。
3. 标题格式统一：`路径 + 标题 + 块号`；`document_level` 可省块号。
4. 历史卡片默认折叠策略保持一致，不允许按来源分叉。

diff_type 展示定型（来源：主控 §7.4）：
1. `precise`：正常展示，不加额外标签。
2. `block_level`：展示“块级替换”标签与降级说明。
3. `document_level`：展示“全文重写”标签。

### 4.3 展示一致性

MUST：
1. 同一 diff 在文档侧与聊天侧状态必须可对应追踪。
2. 展示失败不得推进业务状态。
3. UI 组件不允许本地生成与后端不一致的“推测状态”。

---

## 五、执行规则（MUST）

### 5.1 单卡执行

MUST：
1. 执行前校验目标区间与 `originalText`。
2. 校验失败进入失败暴露，不得静默吞掉。
3. 单卡成功后仅更新对应 diff 状态，不影响同批其他卡。

### 5.2 批量执行

MUST：
1. 批量执行采用“先读后写 + 稳定排序 + 统一刷新”。
2. 排序规则固定且可重放，确保多次执行结果一致。
3. 条目级失败不阻断整批；成功条目必须继续生效。

MUST（来源：主控附录 B.2）：
1. 用户编辑文档后必须通过 ProseMirror `mapping` 同步 `mappedFrom/mappedTo`，再执行接受链。

稳定排序键定型（来源：主控 §9.1/B.2）：
1. `from` 降序
2. `to` 降序
3. `createdAt` 升序
4. `diffId` 升序

### 5.3 diff 池一致性

MUST：
1. 同一 diff 池在跨轮/跨标签下语义一致。
2. 不允许根据 UI 分组拆分成多套执行语义。
3. 执行链与展示链对 diffId 的索引口径一致。

---

## 六、失效与失败隔离（MUST）

### 6.1 失效规则

MUST：
1. 失效属于业务状态，不等于执行异常。
2. 失效处理采用静默策略，不弹阻断型 toast。
3. 失效卡允许查看上下文信息，不允许继续执行。

### 6.2 失败暴露规则

MUST：
1. 执行失败必须输出结构化失败信息（错误码、原因、条目定位）。
2. 失败信息进入观测链，不直接改写失效状态。
3. 失败与失效在 UI 上可区分。

失败/失效双事件埋点（MUST）：
1. 执行失败必须发 `diff.execute_failed`，字段至少包含 `diffId/code/retryable/route_source`。
2. 业务失效必须发 `diff.expired`，字段至少包含 `diffId/expireReason/documentRevision`。
3. 同一 diff 在同一轮中最多出现一个终态事件；禁止同帧同时上报 `execute_failed` 与 `expired`。

### 6.3 强制隔离

MUST：
1. “失败暴露”与”失效处理”必须两条独立分支。
2. 任何层不得把失败直接映射为 expired。
3. 任何层不得把 expired 直接映射为执行失败。

### 6.4 `execute_failed` 事件对象定义

`DiffExecuteFailedEvent` 为独立业务事件对象，不替代 `ExpiredReason` 或 `ExecutionExposure`，也不等于 `DiffEntryStatus`。

必须字段：

```typescript
interface DiffExecuteFailedEvent {
  diffId: string;
  code: ExecutionErrorCode;        // 错误码，见 diffStore ExecutionErrorCode 枚举
  retryable: boolean;              // 是否允许重试
  route_source: 'selection' | 'reference' | 'block_search';
  agentTaskId?: string;
  chatTabId?: string;
  timestamp: number;
  retryCount: number;              // 当前已重试次数，初始为 0
}
```

产生点：apply 失败路径（`preApplySnapshotGatesForAccept` 失败、`applyDiffReplaceInEditor` 失败、`originalText` 校验失败）。产生 `DiffExecuteFailedEvent` 后交由 `DiffRetryController` 消费，不直接推进 diff 状态。

### 6.5 `DiffRetryController` 消费规则

`DiffRetryController` 是 `execute_failed` 事件的唯一合法消费方。消费规则：

```
retryable = true && retryCount < MAX_RETRY（当前定为 2）
  → 将 diff 加入重试队列，绑定 agentTaskId
  → 下一轮 sendMessage 或手动触发时重新执行
  → retryCount += 1

retryable = false || retryCount >= MAX_RETRY
  → diffStore.updateDiff(status: 'expired', expireReason: 对应原因)
  → markVerificationFailed(chatTabId, agentTaskId, reason)  // 注意：不直接触发 invalidated
  → 生成 ExecutionExposure 写入观测层
```

MUST：
1. `execute_failed` 事件不得直接推进 `expired`；仅 `DiffRetryController` 在重试耗尽后才推进。
2. `DiffRetryController` 触发 `markVerificationFailed`，不直接触发 `markAgentInvalidated`；`invalidated` 由 `AgentTaskController` 按规则裁决。
3. 重试队列按 `diffId` 去重；同一 diff 在重试期间不允许再次进入执行链。
4. 重试触发点：本期仅实现手动触发（DiffCard 重试按钮）；`sendMessage` 自动触发作为后续迭代。

### 6.6 工程实现规范（Implementation Spec）

#### 6.6.1 `retryable` 判定表

| ExecutionErrorCode | retryable | 说明 |
|---|---|---|
| `E_APPLY_FAILED` | true | 编辑器 DOM 临时不可用，下次可能成功 |
| `E_BLOCKTREE_STALE` | true | 块树过期，刷新后可重试 |
| `E_BLOCKTREE_NODE_MISSING` | true | 块节点缺失，可能因 DOM 时序导致，可重试 |
| `E_BLOCKTREE_BUILD_FAILED` | true | 块树构建失败，可重试 |
| `E_ORIGINALTEXT_MISMATCH` | false | 文档已变更，原文不匹配，不可重试 |
| `E_RANGE_UNRESOLVABLE` | false | 区间无法解析，diff 已失效 |
| `E_PARTIAL_OVERLAP` | false | 非法重叠，协议错误，不可重试 |
| `E_BASELINE_MISMATCH` | false | 基线不一致，文档版本已变 |
| `E_ROUTE_MISMATCH` | false | 路由来源不匹配 |
| `E_TARGET_NOT_READY` | false | 目标未准备好，归类为 expire |
| `E_REFRESH_FAILED` | false | 刷新失败，兜底错误码，不可重试 |

注：`preApplySnapshotGatesForAccept` 校验失败路径（`originalText` 不匹配、区间无法解析等）**不产生** `DiffExecuteFailedEvent`，直接走 `expired` 路径（此类失败为文档语义失效，非执行失败）。只有 `applyDiffReplaceInEditor` 调用失败才产生 `DiffExecuteFailedEvent`。

#### 6.6.2 DiffEntry 重试期间的状态

- diff 加入重试队列期间，`DiffEntry.status` **保持 `pending`**，不新增状态枚举。
- `DiffEntry.executionExposure` 在首次失败时写入（用于 DiffCard 展示失败信息与重试按钮）。
- `checkAndAdvanceStage` 遇到 `pending` diff 时不推进，天然兼容重试期间不推进 stage。

#### 6.6.3 `DiffRetryController` 接口与存储

```typescript
// src/services/DiffRetryController.ts
// 内存单例，session-only，无持久化。

interface RetryQueueEntry {
  event: DiffExecuteFailedEvent;
  filePath: string;
}

interface DiffRetryController {
  /**
   * 消费 execute_failed 事件。
   * retryable=true && retryCount < MAX_RETRY → 加入队列，写 executionExposure 到 diffStore
   * 否则 → 推进 expired + markVerificationFailed + checkAndAdvanceStage
   */
  handleFailedEvent(
    event: DiffExecuteFailedEvent,
    filePath: string,
    expireReason: DiffExpireReason,
  ): void;

  /**
   * 手动触发单条 diff 重试（DiffCard 重试按钮调用）。
   * 内部：event.retryCount += 1 → DiffActionService.acceptDiff()
   * 成功 → 从队列移除
   * 再次失败 → 回调 handleFailedEvent（retryCount 已递增）
   */
  retryDiff(
    diffId: string,
    editor: Editor,
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<void>;

  /** 查询 diff 是否在重试队列中（DiffCard 据此展示重试 UI） */
  isInRetry(diffId: string): boolean;

  /** 移除（重试成功或耗尽后由内部调用，外部不直接调用） */
  _remove(diffId: string): void;
}

const MAX_RETRY = 2;
```

存储：`DiffRetryController` 为模块级单例，持有 `retryQueue: Map<diffId, RetryQueueEntry>`，无需 Zustand 或持久化。

#### 6.6.4 DiffCard 重试 UI 规范

- 触发条件：`diff.status === 'pending' && DiffRetryController.isInRetry(diff.diffId)`
- 展示：diff 卡顶部显示橙色警告横条，文案：`执行失败（${diff.executionExposure.code}）`，附"重试执行"按钮。
- 正常的"接受/拒绝"按钮**保留**（用户可选择直接拒绝而非重试）。
- "重试执行"点击 → `DiffRetryController.retryDiff(diff.diffId, editor, options)`。
- 重试过程中按钮显示加载态，禁止并发触发。

#### 6.6.5 `DiffActionService` 侧变更

`DiffActionService.acceptDiff` 中，`applyDiffReplaceInEditor` 失败路径改为：
```
失败 → 构造 DiffExecuteFailedEvent(code='E_APPLY_FAILED', retryable=true, retryCount=0)
     → DiffRetryController.handleFailedEvent(event, filePath, 'apply_replace_failed')
     → return { success: false, expireReason: 'apply_replace_failed' }
（不再直接调用 updateDiff(expired) + markVerificationFailed + checkAndAdvanceStage）
```

`DiffRetryController.handleFailedEvent` 内部决定是入队（retryable）还是立即过期（不可重试/耗尽）。

---

## 七、禁用清单

1. 禁止将跨块任务自动降级为 `rewrite_document`。
2. 禁止用全文字符串搜索替代区间协议执行。
3. 禁止文档侧与聊天侧展示口径分叉。
4. 禁止把失败暴露事件写成业务失效状态。
5. 禁止绕过排序直接并发写入同一重叠区间。

---

## 八、测试与验收矩阵

### 8.1 功能验收

1. 单块 diff 生成、渲染、执行可通过。
2. 跨块 diff 生成、渲染、执行可通过。
3. 单卡接受/拒绝、批量接受/拒绝可通过。

### 8.2 一致性验收

1. 同批 diff 的排序与执行结果可重放。
2. 非法重叠 diff 被拦截且有失败暴露。
3. 文档侧与聊天侧状态对齐一致。
4. 复制粘贴生成的精确引用在无显式选区场景下，diff 的 `route_source` 必须稳定为 `reference`。

### 8.3 观测验收

1. 局部失败时整批继续执行。
2. 失败与失效有独立事件与展示。
3. 失效处理全程静默不阻断。
4. `diff.execute_failed` 与 `diff.expired` 两类事件字段完整且可按 `diffId` 关联追踪。
5. `retryable=true` 的 `execute_failed` 事件在下一轮触发后可观察到重试执行行为。
6. `retryable=false` 或重试耗尽的 diff 最终转为 `expired`，不遗留"永久 pending"状态。
7. `execute_failed` 与 `expired` 不在同帧对同一 diffId 同时上报。

---

---

> **本轮修订说明（2026-04-14）**：  
> 1. §6.4 新增：`DiffExecuteFailedEvent` 对象定义（独立业务事件，含 `retryable`/`retryCount` 字段）。  
> 2. §6.5 新增：`DiffRetryController` 消费规则，定义重试条件、上限（MAX_RETRY=2）、与 `expired`/`invalidated` 的推进边界。  
> 3. §8.3 新增第 5-7 条观测验收项。  
> 关键边界：`DiffRetryController` 触发 `markVerificationFailed`，不直接触发 `markAgentInvalidated`；后者由 `AgentTaskController` 裁决。

## 九、与 `A-DE-M-D-01_对话编辑统一方案.md`/`A-DE-M-T-02_baseline状态协作.md`/`A-DE-M-P-01_对话编辑提示词.md` 的反向链接

1. 与 ``A-DE-M-D-01_对话编辑统一方案.md`` 对齐：主链阶段、执行门禁、上线验收。
2. 与 ``A-DE-M-T-02_baseline状态协作.md`` 对齐：状态语义、`baseline/revision` 判定边界。
3. 与 ``A-DE-M-P-01_对话编辑提示词.md`` 对齐：提示词不得把 pending 描述为已生效。

---

## 十、关联文档

> 新增关联：

1. `A-DE-M-D-01_对话编辑统一方案.md`
2. `A-DE-M-T-02_baseline状态协作.md`
3. `A-DE-M-P-01_对话编辑提示词.md`
4. `A-CORE-C-D-02_产品术语边界.md`
5. `A-CORE-C-D-05_状态单一真源原则.md`
6. `A-AG-M-T-05_AgentTaskController设计.md`（`invalidated` 裁决主体；`markVerificationFailed` 与 `markAgentInvalidated` 边界）
7. `R-DE-M-R-02_对话编辑-统一整合方案.md`（仅作历史参考）
8. `R-DE-M-R-01_对话编辑-主控设计文档.md`（仅作历史参考）
9. `R-DE-M-R-06_跨 Block Diff 实现方案.md`（仅作历史参考）
10. `R-DE-M-R-04_Diff效果优化方案.md`（仅作历史参考）
