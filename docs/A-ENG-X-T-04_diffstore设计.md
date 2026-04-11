# diffstore设计

## 文档头

- 结构编码：`ENG-X-T-04`
- 文档属性：`主结构`
- 主责模块：`ENG`
- 文档职责：`diffstore设计 / 模型、架构与机制主控`
- 上游约束：`SYS-C-T-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 直接承接：无
- 接口耦合：`SYS-I-P-01`, `SYS-I-P-02`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`
- 扩散检查：`ENG-X-T-01`, `ENG-X-T-02`, `ENG-X-T-03`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 一、文档定位

本文是工程实现层的 diffStore 设计主规范，定义 diff 数据在前端的存储模型、状态流转、批量执行与显示协作边界。  
本文承接展示交互补充与逻辑状态规范，补齐 store 结构约束层。

---

## 二、MVP 目标

1. 建立统一 diffStore 数据模型与索引方式。  
2. 建立统一状态机：pending/accepted/rejected/expired。  
3. 建立统一批量执行语义：先读后写、稳定排序、统一刷新。  

---

## 三、核心数据模型

## 3.1 DiffEntry（前端主对象）

```ts
interface DiffEntry {
  diffId: string
  filePath: string
  toolCallId?: string
  chatTabId?: string

  startBlockId: string
  startOffset: number
  endBlockId: string
  endOffset: number

  originalText: string
  newText: string
  type: 'replace' | 'delete' | 'insert'
  diffType?: 'precise' | 'block_level' | 'document_level'

  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  createdAt: number
  acceptedAt?: number
  mappedFrom?: number
  mappedTo?: number

  baselineId?: string
  documentRevision?: number
  routeSource?: 'selection' | 'reference' | 'block_search'
  executionExposure?: Record<string, unknown>
  contentSnapshotHash?: string
  expireReason?: 'content_modified' | 'original_text_mismatch' | 'range_unresolvable' | 'partial_overlap'
}
```

## 3.2 Store 索引模型

```ts
interface DiffStoreState {
  byTab: Record<string, {
    filePath: string
    diffs: Record<string, DiffEntry>
    documentRevision?: number
  }>
}
```

约束：

1. 主索引按 `filePath` 聚合，条目按 `diffId` 唯一。  
2. `chatTabId` 是筛选字段，不是主存储 key。  
3. 同一文件允许多条 pending diff 共存。  

## 3.3 扩展字段策略（工程约束）

来源：主控附录 A.1/A.2。  
约束：
1. `mappedFrom/mappedTo` 仅用于位置映射，不作为状态流转依据。
2. `routeSource` 用于链路回溯，不参与执行判定。
3. `executionExposure` 只承载观测，不替代业务状态。
4. `expireReason` 必须枚举化，禁止自由文本。

---

## 四、状态机与流转规则

## 4.1 状态定义

1. `pending`：待执行。  
2. `accepted`：已真实应用。  
3. `rejected`：用户拒绝。  
4. `expired`：内容/区间不再可执行。  

## 4.2 流转规则

1. `pending -> accepted`：校验通过并执行成功。  
2. `pending -> rejected`：用户拒绝。  
3. `pending -> expired`：执行前校验失败。  
4. 终态（accepted/rejected/expired）不可回到 pending。  

---

## 五、执行与校验链

## 5.1 单卡执行

1. 解析 block 区间到 PM range。  
2. 校验当前区间文本与 `originalText`。  
3. 应用替换并更新状态为 accepted。  

## 5.2 批量执行（accept all）

1. 读阶段：解析全部候选，筛除不可执行项。  
2. 写阶段：按稳定排序执行，不中途重算候选。  
3. 提交后统一刷新文档状态与装饰。  

稳定排序键：

`from desc -> to desc -> createdAt asc -> diffId asc`

## 5.3 失效判定

失效只看：

1. 目标内容是否变化。  
2. 目标区间是否可解析。  
3. 是否形成非法部分重叠。  

不以单独 `revision` 或 baseline 变化作为统一失效开关。  

## 5.4 Mapping 同步机制

来源：主控附录 B.2。  
约束：
1. 用户编辑文档后，先通过 ProseMirror `mapping` 更新 pending 条目 `mappedFrom/mappedTo`。
2. 接受链必须基于最新映射位置执行，避免旧坐标直接写入。
3. 批量执行仍遵循稳定排序键，不因映射更新改变排序语义。

---

## 六、显示协作边界

1. 文档侧：仅负责删除标记等装饰显示。  
2. 聊天侧：负责 diff 卡三态展示与操作入口。  
3. store：只负责状态与数据，不承载视觉实现逻辑。  

---

## 七、与逻辑状态协作

1. pending diff 不参与逻辑状态 `L`。  
2. 接受后才推进真实内容与 revision。  
3. baseline 仅标识生成基线，不替代失效判定。  
4. `getLogicalContent` 不得回放 pending diff。  

---

## 八、错误暴露与状态隔离

1. 状态流转（expired）与执行失败暴露（error event）必须隔离。  
2. 可观测对象记录失败原因，不替代业务状态决策。  
3. 批量执行允许“部分成功、部分失效”，主任务继续。  

---

## 九、MVP 验收口径

1. diffStore 结构支持多轮、多 tab、同文件共池管理。  
2. 单卡与批量执行行为一致，且排序稳定。  
3. 失效逻辑不再误伤无交集 diff。  
4. 展示层、状态层、观测层边界清晰。  

---

## 十、来源映射

## 10.1 关键代码路径索引（入口锚点）

1. store 主实现：`src/stores/diffStore.ts`  
2. 批量应用执行：`src/utils/applyDiffReplaceInEditor.ts`  
3. Diff 格式适配：`src/utils/diffFormatAdapter.ts`  
4. 文档装饰扩展：`src/components/Editor/extensions/DiffDecorationExtension.ts`  
5. 后端 diff 服务：`src-tauri/src/services/diff_service.rs`  
6. 后端工具编排：`src-tauri/src/services/tool_call_handler.rs`  

约束：
1. 入口锚点变更必须同步更新本节与 ``A-DE-M-D-01_对话编辑统一方案.md`` §9.1。  
2. 新增执行入口必须在 PR 中声明“读取阶段/写入阶段/刷新阶段”归属。  

1. `R-DE-M-R-04_Diff效果优化方案.md`：展示与交互侧约束来源。  
2. `R-DE-M-R-03_文档逻辑状态传递规范.md`：`L/baseline/revision` 与状态边界来源。  
3. `R-DE-M-R-01_对话编辑-主控设计文档.md` 附录 A/B：DiffEntry 扩展字段与 Mapping 约束来源。  