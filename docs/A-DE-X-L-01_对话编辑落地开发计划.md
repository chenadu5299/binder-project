# 对话编辑落地开发计划（对齐执行版）

## 文档头

- 结构编码：`DE-X-L-01`
- 文档属性：`主结构`
- 主责模块：`DE`
- 文档职责：`对话编辑落地开发计划 / 落地、迁移与开发计划`
- 上游约束：`CORE-C-D-04`, `WS-M-D-01`, `AG-M-D-01`, `AG-M-T-01`, `ED-M-T-01`, `DE-M-D-01`, `DE-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-D-01`, `ED-M-T-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `DE-M-D-01`, `DE-M-T-01`
- 扩散检查：`DE-M-P-01`, `DE-M-T-02`
- 使用边界：`定义落地、迁移与开发承接，不承担规则主源与技术主源职责`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L4 / 四级落地计划文档`
> 文档类型：`落地计划 / 开发迁移承接`
> 当前状态：`Active`
> 受约束于：`A-DE-M-D-01`、`A-DE-M-T-01`、`A-DE-M-T-02`、`A-AG-M-T-03`、`A-AG-M-T-04`、`A-AST-M-P-01`、`A-AST-M-T-07`
> 可约束：`开发排期、阶段拆解、任务映射、验收准备`
> 可用于：`把既有 Active 规则转成阶段实施项、测试项和迁移清单`
> 不可用于：`成为规则主源、术语主定义来源、状态或协议字段的重新定义来源`
> 编制日期：2026-04-01  
> 对齐依据：`A-DE-M-D-01_对话编辑统一方案.md`、`A-DE-M-T-01_diff系统规则.md`、`A-DE-M-T-02_baseline状态协作.md`

---

## 零、对齐声明与使用方式

本文是“落地执行计划”，不是新的规则主源。规则语义仍由以下 Active 文档主定义：

1. `A-DE-M-D-01_对话编辑统一方案.md`（DE 模块主控与边界）。
2. `A-DE-M-T-01_diff系统规则.md`（Diff 专项规则与字段约束）。
3. `A-DE-M-T-02_baseline状态协作.md`（`L/baselineId/revision` 状态协作）。
4. `A-AG-M-T-03_任务规划执行.md` / `A-AG-M-T-04_Binder Agent技术主控文档.md`（`verification/confirmation/stage_complete/invalidated` 上位语义）。
5. `A-AST-M-P-01_上下文注入.md` / `A-AST-M-T-07_Binder知识库自动检索协同规范.md`（上下文注入顺序与知识检索边界）。

本文只做三件事：

1. 把 `DE-*` 规则转成可实施任务与代码锚点。
2. 把端到端主逻辑链转成可执行阶段计划。
3. 把验收门禁转成可测试矩阵与发布清单。
4. 若出现共享概念复述，均视为对上游 Active 文档的引用，不构成重新定义。

---

## 一、规则ID全量对齐矩阵（40/40）

> 口径：全部规则必须“可追溯到本计划章节 + 对应实施阶段 + 验收条目”。

| 规则ID | 规则摘要 | 本计划承接章节 | 实施阶段 | 验收锚点 |
|---|---|---|---|---|
| DE-CORE-001 | 两变量原则（内容+位置） | 2.1 / 5.1 | Phase-1/2 | 13.1 |
| DE-CORE-002 | 模型不接触 blockId | 4.4 / 5.2 | Phase-1/5 | 13.1 |
| DE-STATE-001 | 显示/逻辑双状态 | 7.5 / 9.1 | Phase-3/7 | 13.2 |
| DE-STATE-002 | pending 不改逻辑状态 | 7.5 / 9.2 | Phase-3/7 | 13.2 |
| DE-CTX-001 | RequestContext 四元组+baselineId | 4.1 | Phase-1 | 13.1 |
| DE-ROUTE-001 | 精确坐标必走零搜索 | 5.2 | Phase-2/5 | 13.1 |
| DE-ROUTE-002 | 分流判定权仅 Resolver | 5.1 | Phase-2 | 13.1 |
| DE-ROUTE-003 | 每条 diff 必有 route_source | 4.5 / 6.1 | Phase-2 | 13.1 |
| DE-SCENE-001 | 非当前文档按需求走 | 3.1 | Phase-6 | 13.3 |
| DE-SCENE-002 | 非当前文档四态门禁 | 3.2 | Phase-6 | 13.3 |
| DE-DEG-001 | 严格降级，仅到 block_level | 5.4 | Phase-2 | 13.1 |
| DE-DEG-002 | 全文扫描禁 rewrite_document 偷懒 | 5.5 | Phase-2 | 13.1 |
| DE-NOOP-001 | 无变化不产 diff 不推进 revision | 5.6 / 7.4 | Phase-2/3 | 13.2 |
| DE-PROTO-001 | edit_current_editor_document 输入协议 | 4.2 | Phase-1 | 13.1 |
| DE-PROTO-002 | 系统注入字段（含 baseline/_sel） | 4.3 | Phase-1 | 13.1 |
| DE-PROTO-003 | TextReference 四元组协议 | 4.4 | Phase-5 | 13.1 |
| DE-PROTO-004 | 废弃字段禁用 | 4.6 / 12.8 | Phase-1/8 | 13.4 |
| DE-OUT-001 | canonical diff 统一输出 | 4.5 / 6.1 | Phase-2 | 13.1 |
| DE-OUT-002 | 同批禁部分重叠 | 6.2 / 7.2 | Phase-3 | 13.2 |
| DE-OUT-003 | 跨 Block 闭区间一致 | 6.2 | Phase-3/4 | 13.2 |
| DE-ORI-001 | originalText 抽取/归一/校验统一 | 6.3 / 7.1 | Phase-2/3 | 13.2 |
| DE-VIS-001 | 文档侧仅删除标记 | 6.4 | Phase-3/7 | 13.2 |
| DE-VIS-002 | 卡片三态/历史折叠规则 | 6.5 | Phase-3/7 | 13.2 |
| DE-EXP-001 | 失效静默（不 toast） | 6.6 / 8.4 | Phase-7 | 13.2 |
| DE-EXEC-001 | 单卡接受校验链 | 7.1 | Phase-3 | 13.2 |
| DE-EXEC-002 | 全部接受先读后写+稳定排序 | 7.2 | Phase-3 | 13.2 |
| DE-EXEC-003 | 同一 diff 池规则 | 7.6 | Phase-3/7 | 13.2 |
| DE-EXEC-004 | 撤销隔离 | 7.7 | Phase-7 | 13.2 |
| DE-OBS-001 | 跳过继续 | 8.2 | Phase-7 | 13.3 |
| DE-OBS-002 | ExecutionExposure 模型 | 8.1 | Phase-7 | 13.3 |
| DE-OBS-003 | 标准错误码集合 | 8.3 | Phase-7 | 13.3 |
| DE-OBS-004 | 执行层/业务层完成判定 | 8.5 | Phase-7 | 13.3 |
| DE-OBS-005 | 失败暴露与失效隔离 | 8.4 | Phase-7 | 13.3 |
| DE-BASE-001 | 单一真源 L+revision+baselineId | 9.2 | Phase-1/4 | 13.2 |
| DE-BASE-002 | getLogicalContent 不回放 pending | 9.3 | Phase-1/3 | 13.2 |
| DE-TREE-001 | BlockTree 与 baselineId 绑定 | 9.4 | Phase-4 | 13.2 |
| DE-TREE-002 | 同 baselineId 共用同一索引 | 9.4 | Phase-4 | 13.2 |
| DE-TREE-003 | 树不可用可线性回退并暴露 | 9.5 | Phase-4/7 | 13.3 |
| DE-RISK-001 | 高风险链路固定控制 | 10 | Phase-2/3/4/7 | 13.4 |
| DE-PLAN-001 | 实施优先级 P0/P1/P2 | 12 | Phase-1~8 | 14 |
| DE-AGT-001 | 分层验证门禁序（BA-VERIFY 承接） | 7.3 | Phase-3 | 13.2 |
| DE-AGT-002 | stage_complete 闭合判定（BA-STATE 承接） | 7.3 | Phase-7 | 13.3 |
| DE-AGT-003 | diff artifact 最小字段（BA-ASSET 承接） | 7.3 | Phase-2 | 13.1 |
| DE-AGT-004 | plan 阶段占位（BA-STATE draft→structured） | 7.3 | Phase-9（待 AG P2） | — |

---

## 二、主逻辑链（必须按此链落地）

## 2.1 统一主链（输入到生效）

1. 入口信号识别：选区 / 精确引用 / 光标。  
2. 发送前构建 `RequestContext(targetFile,L,revision,baselineId,editorTabId)`。  
3. 生成工具调用参数：模型字段 + 系统注入字段。  
4. Resolver 统一分流：`selection/reference -> block_search -> block_level`。  
5. 后端输出 canonical diff（含 `diff_type` + `route_source`）。  
6. 前端渲染：聊天侧 Diff 卡 + 文档侧删除标记。  
7. 用户决策：单卡接受/拒绝，全部接受/拒绝。  
8. 生效执行：先读后写 + 稳定排序 + 统一刷新。  
9. 状态推进：accepted 推进逻辑态；pending 保持；冲突条目转 expired。  
10. 观测上报：`ExecutionExposure` 记录执行事件，不替代业务状态。

### 2.4 Prompt Assembly 承接链

对话编辑的提示词装配必须按以下链路落地：

1. `chatStore.ts` 收集 `currentTurnGoal`、`userLatestMessage`、tab 状态。  
2. `ai_commands.rs` 组装 `L3PromptAssemblyInput`。  
3. `context_manager.rs` 构建七层 `PromptPackage`。  
4. `provider.chat_stream` 只消费 `PromptPackage`，不再接受额外临时拼接文本。  
5. 提示词变更必须同步回归 `DE-M-P-01`、`AG-M-T-02`、`AST-M-P-01`。  

## 2.2 链路A（当前文档 + 选区/引用 + 零搜索）

1. 输入：显式选区或精确引用四元组。  
2. 注入：`_sel_*` 或 `TextReference(start/end BlockId+Offset)`。  
3. Resolver：强制零搜索，不退回块内搜索。  
4. 输出：`diff_type=precise`，`route_source=selection|reference`。  
5. 接受：`baselineId` 校验 -> 区间解析 -> `originalText` 校验 -> 应用。

## 2.3 链路B（无选区 / 多块扫描 / 非当前文档）

1. 输入：`block_index + target + occurrence_index`。  
2. 非当前文档先走门禁链（见 3.2）。  
3. Resolver：块内搜索，失败按严格降级到 `block_level`。  
4. 全文扫描必须逐块调用，禁止一次 `rewrite_document` 代替多块局部编辑。  
5. 用户“全部接受”执行同一批事务规则。

## 2.5 当前文档优先级与外扩顺序

1. 当前打开文档属于编辑事实层，不属于知识库依赖层。  
2. 当前文档相关请求必须优先在当前文档内完成理解、定位与求解。  
3. 若当前文档注入不足，先执行“当前文档内二次求解/补充注入/局部定位”，不得直接放行知识检索。  
4. 仅当当前文档与当前 workspace 项目文档层都不足时，才允许进入知识库/外部资料层。  
5. 若用户显式引用当前文件，可以去重正文注入，但必须保留“显式当前文件锚点”信号供后端路由使用。  
6. 旧口径中把“当前文档问题”直接交给知识检索补偿的实现视为过时路径，本计划不再承接。  

---

## 三、场景覆盖与门禁链

## 3.1 场景 1~6 对齐

1. 场景1：有选区 -> 零搜索 -> 精确 diff。  
2. 场景2：无选区、文件已开 -> 块内搜索。  
3. 场景3：全文扫描 -> 逐块调用，不允许偷懒重写整篇。  
4. 场景4：文件未开但有缓存 -> 静默加载缓存后执行。  
5. 场景5：文件未开且无缓存（html/htm/docx）-> 先 canonical 化再执行。  
6. 场景6：文件未开且无缓存（md/txt）-> 注入 `block-ws-{uuid}` 再执行。

统一口径：

1. 跟需求走，不跟“是否当前打开”状态走。  
2. 文件打开状态只影响就绪链，不影响“允许编辑”的判定。

## 3.2 非当前文档执行门禁（强制）

按固定顺序：

1. `targetFileResolved`  
2. `canonicalLoaded`  
3. `blockMapReady`  
4. `contextInjected`

门禁规则：

1. 任一未就绪，不得进入工具执行链。  
2. 必须产出 `E_TARGET_NOT_READY`（或子类）观测记录。  
3. 门禁失败属于执行前失败，不等同于 diff `expired`。

---

## 四、协议与字段契约（冻结后开发）

## 4.1 RequestContext（发送前）

```ts
interface RequestContext {
  targetFile: string;
  L: string;
  revision: number;
  baselineId: string;
  editorTabId: string;
}
```

强约束：

1. 每轮生成唯一 `baselineId`。  
2. 同一轮不得混用多份 `L`。  
3. `L` 以逻辑态序列化结果为准。

## 4.2 `edit_current_editor_document` 输入协议

```json
{
  "block_index": 1,
  "edit_mode": "replace | delete | insert | rewrite_block | rewrite_document",
  "target": "原始文本",
  "content": "新文本",
  "occurrence_index": 0
}
```

字段门禁：

1. `edit_mode != rewrite_document` 时，`block_index` 必填。  
2. `edit_mode in (replace/delete/insert)` 时，`target` 必填。  
3. `edit_mode=delete` 时，`content` 可省略。  
4. `occurrence_index` 默认 `0`，仅用于块内多命中 disambiguation。

## 4.3 系统注入字段

1. `current_file`  
2. `current_content`  
3. `document_revision`  
4. `baseline_id`  
5. `_sel_start_block_id` / `_sel_start_offset`  
6. `_sel_end_block_id` / `_sel_end_offset`  
7. `_sel_text`  
8. `cursor_block_id` / `cursor_offset`（仅无选区时作为上下文提示，不是强制目标）

## 4.4 精确引用协议（TextReference 四元组）

```ts
textReference: {
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
}
```

要求：

1. 无显式选区但有精确引用时，必须走零搜索。  
2. 展示可标注 `Block N`，但模型层不暴露 `blockId`。

## 4.5 canonical diff 输出（统一）

```json
{
  "diffId": "uuid-v4",
  "startBlockId": "block-xxx",
  "startOffset": 0,
  "endBlockId": "block-xxx",
  "endOffset": 15,
  "originalText": "old",
  "newText": "new",
  "type": "replace | delete | insert",
  "diff_type": "precise | block_level | document_level",
  "route_source": "selection | reference | block_search"
}
```

## 4.6 废弃字段禁用清单

1. `scope`  
2. `anchor` / `edit_target.anchor`  
3. `instruction`  
4. `target_content`  
5. `element_identifier`

---

## 五、Resolver 主路径与降级策略

## 5.1 分流权归属

1. 分流判定权只在 Resolver。  
2. 前端和提示词不得做猜测式分流。  
3. 所有分流结果都要回写 `route_source`。

## 5.2 路由顺序（固定）

1. 有精确坐标：零搜索。  
2. `edit_mode=rewrite_document`：走全文重写分支（仅明确整篇任务允许）。  
3. `edit_mode=rewrite_block`：走整块重写分支。  
4. 无精确坐标且非 rewrite 分支：块内搜索。  
5. 块内 miss：触发受控 `block_level` 整块替换降级；该路径仅是 `A-DE-M-D-01_对话编辑统一方案.md` 明确授权的定位降级，不是默认兜底。  
6. 不可恢复错误：报错重试。

## 5.3 零搜索

1. 使用坐标直接定位，不再二次文本搜索。  
2. 输出 `diff_type=precise`。  
3. 来源可为选区或精确引用。

## 5.4 严格降级

1. 先尝试精确定位，再允许降级。  
2. 仅允许降级到对应块 `block_level`。  
3. 多块局部编辑禁止降级到 `document_level`。

严格降级白名单（必须）:

1. 表格结构片段。  
2. 代码块复杂结构。  
3. 特殊字符序列。  
4. 富文本嵌套样式片段。  
5. 数学公式样式文本。

## 5.5 全文重写边界

1. 仅用户明确要求整篇重写时允许 `rewrite_document`。  
2. 全文扫描任务必须逐块调用，不得用一次全文重写替代。

## 5.6 no-op 规则

编辑结果与原文完全一致时：

1. 不生成 diff。  
2. 不生成删除标记。  
3. 不生成卡片。  
4. 不推进 `documentRevision`。

---

## 六、Diff 产出与展示规则

## 6.1 Diff 结构规则

1. 同批 diff 禁止“部分重叠”，只允许无交集或完全包含。  
2. 跨 Block 区间使用闭区间一致语义。  
3. `originalText` 抽取/归一/校验使用统一语义。

## 6.2 跨 Block 规则

1. 必须输出完整 `start/endBlockId + offset`。  
2. 抽取顺序固定：起始块尾段 -> 中间完整块 -> 结束块前段。  
3. 执行链与生成链语义必须一致。

## 6.3 文档侧规则

1. 文档侧只承载删除标记。  
2. 新增文本仅聊天侧展示。  
3. Decoration 必须携带 `diffId` 并跟随 mapping 漂移。

## 6.4 聊天卡片规则

卡片最小字段：

1. 标题  
2. 文件信息  
3. 原文区  
4. 新文区  
5. 状态  
6. 接受/拒绝按钮

## 6.5 历史态与 diff_type 展示

1. 状态：`pending/accepted/rejected/expired`。  
2. `accepted/rejected` 默认折叠，可展开。  
3. `expired` 不折叠、灰色、不可操作。  
4. 标题定位统一显示块号，不显示行号。  
5. `document_level` 仅显示标题，不显示块号。  
6. `block_level` 显示“块级替换”标签与降级说明。  
7. `document_level` 显示“全文重写”标签。

## 6.6 失效静默

1. 不弹 toast。  
2. 不阻断用户流程。  
3. 文档侧删除标记及时清理。

---

## 七、接受/拒绝/生效状态机

## 7.1 单卡接受

执行链：

1. `baselineId` 校验。  
2. 区间解析。  
3. `originalText` 校验。  
4. 应用替换。  
5. 标记 accepted。  
6. 更新文档与版本。

## 7.2 全部接受（事务化）

读阶段：

1. 解析全部 pending diff。  
2. 校验 BlockTree 节点存在与跨块顺序。  
3. 基线校验。  
4. `originalText` 校验。  
5. 检测非法部分重叠。  
6. 失败条目标记 expired。

写阶段：

1. 稳定排序键：`from desc -> to desc -> createdAt asc -> diffId asc`。  
2. 逐条应用。  
3. 中途不重算候选集合。

提交后统一刷新：

1. DOM  
2. `L`  
3. `revision`  
4. decoration  
5. 分页状态

## 7.3 单卡拒绝 / 全部拒绝

1. 单卡拒绝：移除该条 pending。  
2. 全部拒绝：清空作用域 pending。  
3. 拒绝不推进逻辑状态。

## 7.4 生效推进

1. accepted 才推进 `documentRevision`。  
2. 其余 pending 保留，命中冲突条件时转 expired。  
3. no-op 不推进 revision。

## 7.5 双状态模型

1. 显示状态：卡片+Decoration。  
2. 逻辑状态：仅 accepted 修改。  
3. pending/rejected/expired 不进入逻辑态。

## 7.6 同一 diff 池规则

1. 单轮多 diff、跨轮多 diff、跨标签多 diff，统一同一失效语义。  
2. 判定基准是“内容是否已修改”，不是“来自哪个轮次/标签”。

## 7.7 撤销隔离

1. Diff 系统不参与撤销栈。  
2. 撤销仅作用于真实写入内容。  
3. 撤销与 pending 重叠时，相关 pending 失效。

---

## 八、观测模型与错误治理

## 8.1 ExecutionExposure 结构

```ts
interface ExecutionExposure {
  exposureId: string;
  level: 'info' | 'warn' | 'error';
  phase: 'route' | 'resolve' | 'validate' | 'apply' | 'refresh';
  code: string;
  message: string;
  targetFile: string;
  diffId?: string;
  baselineId?: string;
  routeSource?: 'selection' | 'reference' | 'block_search';
  timestamp: number;
}
```

## 8.2 跳过继续规则

1. 局部失败不等于整轮失败。  
2. 单条失败标记 expired 后继续下一条。  
3. 批量失败只跳过失败条，不回滚已成功条。  
4. 仅事务前置条件失效时中断整批。

## 8.3 标准错误码

1. `E_ROUTE_MISMATCH`  
2. `E_TARGET_NOT_READY`  
3. `E_RANGE_UNRESOLVABLE`  
4. `E_ORIGINALTEXT_MISMATCH`  
5. `E_PARTIAL_OVERLAP`  
6. `E_BASELINE_MISMATCH`  
7. `E_APPLY_FAILED`  
8. `E_REFRESH_FAILED`  
9. `E_BLOCKTREE_NODE_MISSING`  
10. `E_BLOCKTREE_STALE`  
11. `E_BLOCKTREE_BUILD_FAILED`

## 8.4 失败暴露与失效隔离（强制）

1. 失效处理是业务状态流转（`pending -> expired`）。  
2. 失败暴露是观测事件上报。  
3. 两者可同时发生，但不得互相替代。

判定矩阵（必须允许）：

1. 仅失效无错误。  
2. 仅错误不失效。  
3. 失效且有错误。  
4. 无失效无错误（正常执行）。

## 8.5 完成判定

1. 执行层完成：可执行项已处理，失败项已跳过并暴露。  
2. 业务层完成：是否达成用户目标由结果内容判定。

---

## 九、baseline、逻辑态与 BlockTree 绑定

## 9.1 逻辑状态定义

逻辑状态 = baseline + 已接受修改的有序累积结果。

## 9.2 baseline 主链约束

1. 每轮发送前，以 `positioningCtx.L` 作为 baseline。  
2. 每轮必须生成唯一 `baselineId`。  
3. `baseline + revision + baselineId` 共同构成本轮定位真源。  
4. 不按轮次做批量失效，只按内容冲突与可执行性判定。  
5. 同一轮主链禁止临时改用“重新抓取的编辑器 HTML”替代 baseline 真源。

## 9.3 注入来源与 `getLogicalContent`

1. `current_content` 以 `positioningCtx.L` 为准。  
2. `getLogicalContent()` 仅是重建能力。  
3. 禁止将 pending 回放进逻辑状态。  
4. 同一 `baselineId` 下禁止混用多来源快照。

## 9.4 BlockTreeIndex 强绑定

1. 每轮发送前构建一次 BlockTreeIndex。  
2. 同 `baselineId` 下：生成/校验/单卡接受/全部接受共用同一索引。  
3. 禁止在接受阶段临时重建另一份树覆盖判定。

最小字段：

1. `blockId`  
2. `blockIndex`  
3. `path`  
4. `textStart`  
5. `textEnd`  
6. `textHash`

## 9.5 树回退规则

1. 树索引不可用允许线性回退。  
2. 回退失败条目按“跳过继续”转 expired。  
3. 同步暴露 `E_BLOCKTREE_*` 错误码。

## 9.6 格式保真规则

1. 定位允许基于纯文本。  
2. 应用必须保留原块结构、换行关系与样式关系。  
3. 精确替换无法稳定保真时，必须进入严格降级流程。  
4. 不允许因应用 diff 抹除颜色/背景/字体/段落等格式语义。

---

## 十、高风险链路固定控制

## 10.1 引用坐标保真

1. 坐标传递链固定：引用标签 -> 结构化字段 -> 后端注入 -> Resolver 消费。  
2. 禁止并行旁路二次推导坐标。

## 10.2 双路并存控制

1. 有精确坐标强制零搜索。  
2. 无精确坐标才允许块内搜索。  
3. 分流判定权仅 Resolver。

## 10.3 跨 Block 一致性

1. offset 口径固定为块内纯文本字符偏移。  
2. `originalText` 拼接顺序固定。  
3. 应用边界语义必须与生成一致。

## 10.4 失效与展示时序

1. 条目进入 expired 的同一事务完成三件事：  
2. 文档标记清理。  
3. 卡片状态切换。  
4. 操作入口禁用。

## 10.5 revision 与多轮并存

1. revision 不是唯一失效条件。  
2. 仅按内容冲突与区间可执行性判定失效。  
3. 无交集 diff 保持有效。

## 10.6 历史卡片一致性

1. 待执行卡片：显示路径、标题+位置（全文仅标题）、完整内容、操作键。  
2. 失效卡片：显示路径、标题+位置（全文仅标题）、完整内容，灰态且不可操作。  
3. 已执行卡片：默认折叠，可展开查看完整内容。

---

## 十一、当前实现差距（与两份主文档对齐）

## 11.1 已实现基础

1. Resolver2 主路径已上线（`block_index + edit_mode`）。  
2. `_sel_*` 零搜索入参注入已具备。  
3. `diffStore.acceptAll` 已有读写分段雏形。  
4. `diff_type` 与 `expired` 基础展示已具备。  
5. HTML/DOCX canonical 管道已具备。

## 11.2 必须补齐缺口

1. `baselineId` 全链路（request -> resolver -> accept）缺失。  
2. `route_source` 未进入 canonical diff 实际输出。  
3. TextReference 四元组未打通。  
4. BlockTreeIndex 强绑定与复用未落地。  
5. ExecutionExposure 与错误码观测未系统化。  
6. md/txt `block-ws-{uuid}` 注入未落地。  
7. acceptAll 排序键未完全对齐。  
8. no-op 规则未硬门禁。  
9. 光标位置捕获（`cursor_block_id/cursor_offset`）未纳入发送链。  
10. 块列表注入机制未完全替换旧注入口径。  
11. 旧路径兼容仍在（`scope/target_content` 等）。
12. 分层验证门禁序（DE-AGT-001）：约束验证失败未标记 `constraint_failed`，未与正常 pending 区分。
13. stage_complete 闭合（DE-AGT-002）：revision 推进后无显式阶段闭合事件输出。
14. diff artifact 字段（DE-AGT-003）：`createdAt` 字段未覆盖全部写入路径；缺字段未硬性拦截。

---

## 十二、分阶段实施计划（8 阶段）

> 对齐主控 P0/P1/P2，并细化到文件级执行。

## 12.1 Phase-1（P0）：协议收口

目标：补齐 RequestContext/baseline 与工具协议冻结。

改造文件：

1. `src/utils/requestContext.ts`  
2. `src/stores/chatStore.ts`  
3. `src-tauri/src/commands/ai_commands.rs`  
4. `src-tauri/src/services/context_manager.rs`  
5. `src-tauri/src/services/tool_definitions.rs`  
6. `src/utils/blockListInjection.ts`

交付：

1. `baselineId` 透传。  
2. 系统注入字段与协议白名单固化。  
3. 块列表注入机制与旧口径收口。  
4. 废弃字段仅兼容不再生成。
5. `L3PromptAssemblyInput` 与 `PromptPackage` 类型定义冻结。

### 12.1.1 Phase-1 Prompt Assembly 子任务

1. 在 `src-tauri/src/commands/ai_commands.rs` 组装 `currentTurnGoal`、`userLatestMessage`、`stageSnapshot`、`activePlan`、`activeScope`。  
2. 在 `src-tauri/src/services/context_manager.rs` 输出七层 `PromptPackage`。  
3. 在 `src/stores/chatStore.ts` 固化当前轮目标与最近一轮已提交 assistant 结论。  
4. 在 `src-tauri/src/services/tool_matrix.rs` 过滤 `availableTools`。  
5. 禁止 provider 调用前再拼接临时 prompt 片段。  

## 12.2 Phase-2（P0）：Resolver 路由与降级

目标：零搜索/块内搜索/严格降级规则完成。

改造文件：

1. `src-tauri/src/services/tool_service.rs`  
2. `src-tauri/src/services/positioning_resolver.rs`

交付：

1. `route_source` 输出。  
2. 严格降级白名单与 `document_level` 禁止偷懒。  
3. no-op 门禁。
4. **DE-AGT-003**：diff 写入前补全 artifact 最小字段（`diffId/targetFile/route_source/revision/createdAt`），缺字段硬性拦截并输出 `E_APPLY_FAILED`。

## 12.3 Phase-3（P0）：接受机制事务化

目标：单卡+批量执行链一致化。

改造文件：

1. `src/stores/diffStore.ts`  
2. `src/utils/applyDiffReplaceInEditor.ts`  
3. `src/components/Chat/ChatMessages.tsx`

交付：

1. 先读后写固定化。  
2. 稳定排序键完整实现。  
3. 非法重叠统一 expired。
4. **DE-AGT-001**：约束验证失败（originalText 不匹配 / 区间冲突）的 diff 条目标记 `constraint_failed`，卡片展示与正常 pending 可区分；结构验证（门禁链）失败时阻断 diff 生成，不进入本阶段执行。

## 12.4 Phase-4（P1）：BlockTreeIndex 绑定

目标：`baselineId` 绑定索引与回退链。

改造文件：

1. `src-tauri/src/services/block_tree_index.rs`（新增）  
2. `src-tauri/src/services/tool_service.rs`

交付：

1. 同 baseline 共用同一索引。  
2. 树不可用可线性回退并暴露错误码。

## 12.5 Phase-5（P1）：引用协议升级

目标：TextReference 四元组 -> 零搜索链路。

改造文件：

1. `src/types/reference.ts`  
2. `src/utils/referenceHelpers.ts`  
3. `src/utils/referenceProtocolAdapter.ts`  
4. `src-tauri/src/commands/ai_commands.rs`  
5. `src/stores/chatStore.ts`

交付：

1. `@` 引用坐标作为一级定位输入。  
2. `route_source=reference` 全链路可见。  
3. 无选区场景光标坐标（`cursor_block_id/cursor_offset`）进入上下文链。

### 12.5.1 Phase-5 Hotfix（P0）：复制粘贴引用坐标保真

目标：修复“有引用标签但仍走块内搜索”的实现偏差，确保引用四元组不丢失。

改造文件：

1. `src/components/Chat/InlineChatInput.tsx`  
2. `src/components/Chat/ChatInput.tsx`  
3. `src/components/Editor/extensions/CopyReferenceExtension.ts`  
4. `src/utils/referenceHelpers.ts`  
5. `src/stores/referenceStore.ts`

交付：

1. 粘贴建引用时强制透传 `startBlockId/startOffset/endBlockId/endOffset`。  
2. 跨块引用保持跨块四元组，不退化为单块 `blockId`。  
3. 引用元数据缺失/过期时显式降级并可观测。  
4. 无显式选区场景稳定产出 `route_source=reference`。

## 12.6 Phase-6（P1）：非当前文档 + md/txt 注入

目标：场景4/5/6闭环与门禁落地。

改造文件：

1. `src-tauri/src/workspace/workspace_commands.rs`  
2. `src-tauri/src/workspace/canonical_html.rs`  
3. `src/services/documentService.ts`

交付：

1. 四态门禁与阻断机制。  
2. md/txt `block-ws-{uuid}` 注入。  
3. 与 TipTap blockId 连续性兼容。

## 12.7 Phase-7（P1）：观测与状态隔离

目标：ExecutionExposure + 失效隔离。

改造文件：

1. `src-tauri/src/services/tool_service.rs`  
2. `src-tauri/src/commands/ai_commands.rs`  
3. `src/stores/diffStore.ts`  
4. `src/components/Chat/DiffCard.tsx`  
5. `src/components/Debug/ExecutionPanel.tsx`

交付：

1. 统一错误码与观测结构。  
2. 跳过继续策略与完成判定。  
3. 临时执行面板与日志字段完全同构（可开关）。  
4. 静默失效策略保持。
5. **DE-AGT-002**：revision 推进后触发 stage_complete 判定（条件：revision 推进成功 + diff 池无悬置 constraint_failed/apply_failed 条目），结果写入 ExecutionExposure（`stageEvent: stage_complete`）。

## 12.8 Phase-8（P2）：旧路径清理与封板

目标：完成主控 P2 清理项并发布封板。

改造文件：

1. `src-tauri/src/services/tool_service.rs`  
2. `src-tauri/src/commands/ai_commands.rs`  
3. `src-tauri/src/services/tool_definitions.rs`  
4. `src/components/Editor/extensions/DiffDecorationExtension.ts`  
5. `src/utils/diffFormatAdapter.ts`

交付：

1. 废弃路径删除（`scope/edit_target/target_content` 等）。  
2. OpenAI provider `tool_calls` SSE 分支补全（主控 P2 项）。  
3. DiffDecorationExtension mapping 竞态修复（主控 P2 项）。  
4. 废弃代码统一删除。
5. 删除旧的对话编辑临时 prompt 拼接路径，仅保留 `PromptPackage` 主链。

## 12.9 Phase-CurrentDoc（P0）：当前文档事实层收口

目标：恢复当前文档作为 agent / 对话编辑的最高优先级事实源。

改造文件：

1. `src/stores/chatStore.ts`  
2. `src/utils/referenceProtocolAdapter.ts`  
3. `src-tauri/src/commands/ai_commands.rs`  
4. `src-tauri/src/services/context_manager.rs`

交付：

1. 当前文件显式引用不再被简单吞掉，后端可感知“当前文件被显式点名”。  
2. 当前文档相关问题优先停留在当前文档事实层，不因未入知识库而外扩。  
3. 长文档摘要不足时先执行文档内二次求解，再考虑项目文档层。  
4. 自动知识检索只作为后备补充层，不再作为当前文档主链兜底。  
5. 当前文档、项目文档、知识库三层扩展语料路径区分清晰。  

---

## 十三、测试矩阵与验收门禁

## 13.1 协议与路由验收

1. RequestContext 含 `targetFile/L/revision/baselineId/editorTabId`。  
2. 精确坐标必走零搜索。  
3. 每条 diff 含 `route_source`。  
4. 协议禁用字段不会回流。
5. 复制粘贴的同文档单块引用在无显式选区下输出 `route_source=reference`。  
6. 复制粘贴的同文档跨块引用在无显式选区下输出 `route_source=reference` 且区间跨块正确。  
7. 引用元数据过期/损坏时可观测降级，且不得误标 `route_source=reference`。
8. **DE-AGT-003**：pending_diffs 中任意条目均含 `diffId/targetFile/route_source/revision/createdAt`；构造缺字段 diff，写入被拒绝并有 `E_APPLY_FAILED` 记录。
9. 显式 `@` 当前文件时，请求上下文中保留“current file explicitly referenced”信号，且不要求重复注入当前文档正文。

## 13.2 执行与状态验收

1. 单卡接受校验链完整。  
2. 全部接受遵循稳定排序键。  
3. pending 不进入逻辑态。  
4. 同一 diff 池规则在跨轮/跨标签一致。  
5. 撤销隔离生效。  
6. no-op 不产 diff 不推进 revision。
7. **DE-AGT-001**：构造 originalText 不匹配用例，卡片展示 `constraint_failed` 可与正常 pending 区分；构造门禁失败用例，diff 生成链被阻断并输出 `E_TARGET_NOT_READY`。

## 13.3 观测与门禁验收

1. 非当前文档四态门禁全部生效。  
2. 跳过继续行为正确。  
3. 错误码与 Exposure 可检索。  
4. 失败暴露与失效状态严格隔离。
5. **DE-AGT-002**：正常轮次完成时 ExecutionExposure 含 `stageEvent: stage_complete`；存在 `constraint_failed` 悬置条目时 `stage_complete` 不触发。
6. 长文档当前文档问题在摘要不足时，先触发文档内二次定位/补充注入，不直接进入知识检索。
7. 当前文档问题默认扩展顺序固定为“当前文档 -> workspace 项目文档 -> 知识库/外部资料”，不得跳层。

## 13.4 风险与清理验收

1. 严格降级白名单生效。  
2. 高风险链路控制项通过。  
3. P2 清理项全部完成。  
4. 旧协议路径无线上流量。

---

## 十四、排期建议（4 周）

1. 第1周：Phase-1 + Phase-2（协议与 Resolver 收口）。  
2. 第2周：Phase-3 + Phase-4（执行事务化与 BlockTree）。  
3. 第3周：Phase-5 + Phase-6（引用与非当前文档链路）。  
4. 第4周：Phase-7 + Phase-8（观测治理、清理封板）。

发布策略：

1. 每阶段独立 PR，禁止跨阶段大合并。  
2. P0 全过再进 P1。  
3. P2 前完成全量回归并冻结协议。

---

## 十五、最终上线 DoD

1. 规则对齐：`DE-*` 40 条 + `DE-AGT-001/002/003` 3 条（共 43 条）可追溯到实现和验收；DE-AGT-004 为 P3 占位，不计入当前 DoD。  
2. 主链一致：两条业务链（零搜索链 / 块搜索链）行为一致可复现。  
3. 状态一致：pending/accepted/rejected/expired 语义与展示一致。  
4. 执行一致：单卡与批量执行结果一致。  
5. 观测一致：ExecutionExposure 与错误码完整。  
6. 文档一致：计划、主控、统一方案三者口径一致。

---

## 十六、关联文档

1. `A-DE-M-D-01_对话编辑统一方案.md`
2. `A-DE-M-T-01_diff系统规则.md`
3. `A-DE-M-T-02_baseline状态协作.md`
4. `A-DE-M-P-01_对话编辑提示词.md`
5. `A-AG-M-D-01_Binder Agent能力描述文档.md`（DE-AGT-* 规则上位主控来源）
6. `A-AG-M-T-03_任务规划执行.md`
7. `A-AG-M-T-04_Binder Agent技术主控文档.md`
8. `A-AST-M-P-01_上下文注入.md`
9. `A-AST-M-T-07_Binder知识库自动检索协同规范.md`
10. `A-ENG-X-T-04_diffstore设计.md`
11. `R-DE-M-R-02_对话编辑-统一整合方案.md`（仅作历史参考）
12. `R-DE-M-R-01_对话编辑-主控设计文档.md`（仅作历史参考）
