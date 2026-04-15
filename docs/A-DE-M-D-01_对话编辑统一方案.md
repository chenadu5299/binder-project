# 对话编辑统一方案（可执行规范版）

## 文档头

- 结构编码：`DE-M-D-01`
- 文档属性：`主结构`
- 主责模块：`DE`
- 文档职责：`对话编辑统一方案 / 功能与规则主控`
- 上游约束：`CORE-C-D-04`, `WS-M-D-01`, `AG-M-D-01`, `AG-M-T-01`, `ED-M-T-01`
- 直接承接：`DE-M-P-01`, `DE-M-T-01`, `DE-M-T-02`, `DE-X-L-01`
- 接口耦合：`WS-M-D-01`, `ED-M-T-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `DE-M-T-01`
- 扩散检查：无
- 使用边界：`定义功能边界、模块规则与承接范围，不承担技术实现细节与开发排期`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L1 / 一级权威文档`
> 文档类型：`统一方案 / 模块主控`
> 当前状态：`Active`
> 受约束于：`A-CORE-C-D-02`、`A-CORE-C-D-04`、`A-CORE-C-D-05`、`A-AG-M-D-01`、`A-AG-M-T-03`、`A-AG-M-T-04`、`A-AST-M-P-01`、`A-AST-M-T-07`、`A-WS-M-D-01`
> 可约束：`A-DE-M-T-01`、`A-DE-M-T-02`、`A-DE-M-P-01`、`A-DE-X-L-01` 及 DE 相关实现/验收文档
> 可用于：`定义对话编辑的功能边界、执行主链、当前文档优先级、Diff 主链和与 Agent/Workspace/知识补强的协同边界`
> 不可用于：`替代术语主文档重定义共享概念；替代 Agent 上位文档重定义 verification/confirmation/stage_state 主语义；替代计划文档做排期`

---

## 一、文档定位与生效原则

本文件是“对话编辑系统”的工程执行入口，也是 DE 模块当前唯一 Active 主控口径。

生效原则（按优先级）：
1. `A-CORE-C-D-02_产品术语边界.md`：共享概念与字段主定义。
2. `A-CORE-C-D-04_系统设计原则总纲.md` / `A-CORE-C-D-05_状态单一真源原则.md`：全局原则与状态真源约束。
3. `A-AG-M-D-01_Binder Agent能力描述文档.md` / `A-AG-M-T-03_任务规划执行.md` / `A-AG-M-T-04_Binder Agent技术主控文档.md`：Agent 闭环、verification、confirmation、stage_state 上位口径。
4. `A-AST-M-P-01_上下文注入.md` / `A-AST-M-T-07_Binder知识库自动检索协同规范.md`：上下文注入顺序与知识检索边界。
5. 本文：对话编辑模块主链与模块边界主定义。
6. `A-DE-M-T-01_diff系统规则.md` / `A-DE-M-T-02_baseline状态协作.md` / `A-DE-M-P-01_对话编辑提示词.md`：对本文的专项细化与承接。
7. `R-DE-*` 文档只可作为历史参考，不再构成当前规则主源。

约束：
1. `当前文档事实层`、`项目文档层`、`显式当前文件锚点` 的项目级主定义以 `A-CORE-C-D-02_产品术语边界.md` 为准；本文只负责它们在 DE 主链中的执行语义，其他 DE 文档提及时不得重定义。
2. 本文所有“必须”条款使用 `MUST` 标记，未满足视为未完成。
3. 任一规则变更，必须同步更新本文“规则落地索引”和“验收矩阵”。

---

## 二、能力边界（做什么 / 不做什么）

系统负责：
1. 用户对话请求到 canonical diff 的完整生成链。
2. Diff 卡片决策（单卡/批量接受拒绝）与文档生效链。
3. 失效判定、失败暴露、执行观测的隔离协作。
4. 与编辑器、Workspace、AI执行层的契约对齐。

系统不负责：
1. 编辑器基础排版与通用编辑能力本体（归 ``A-ED-M-T-01_编辑器架构.md`/`A-ED-M-T-02_block模型.md`/`A-ED-M-T-03_分页系统.md`/`A-ED-M-T-04_docx能力.md``）。
2. Workspace 资源治理本体（归 ``A-WS-M-T-01_workspace架构.md`/`A-WS-M-T-02_多文档资源系统.md`/`A-WS-M-T-03_文件系统.md`/`A-WS-M-T-04_资源管理.md`/`A-WS-M-T-05_跨文档操作.md``）。
3. AI 三层全局编排本体（归 ``A-AG-M-T-01_ai执行架构.md`/`A-AG-M-T-02_prompt架构.md`/`A-AG-M-P-01_工具调用体系.md`/`A-AG-M-T-03_任务规划执行.md``）。

---

## 三、端到端执行主链（开发主流程）

### 3.1 主链阶段

1. 输入归一化：接收消息、选区/引用、目标文件上下文。
2. 上下文构建：生成 `RequestContext` 与定位线索。
3. Resolver 路由：零搜索 / 块内搜索 / 降级路径决策。
4. Diff 生成：输出 canonical diff（含 `route_source` 与 `originalText`）。
5. 前端呈现：聊天卡片 + 文档删除标记。
6. 用户决策：单卡/批量接受拒绝。
7. 生效执行：先读后写、稳定排序、统一刷新。
8. 观测与失效：失败暴露、失效标记、状态收敛。

### 3.2 阶段输入输出（I/O）

| 阶段 | 输入 | 输出 | 失败策略 |
|---|---|---|---|
| 输入归一化 | 用户消息、UI选区/引用、当前tab | 标准化输入对象 | 非法输入直接拒绝并暴露 |
| 上下文构建 | 标准化输入、编辑器快照 | `RequestContext` + 定位字段 | 缺关键字段拒绝执行 |
| Resolver 路由 | `RequestContext`、块树索引 | 路由决定 + 目标区间 | 允许线性回退，失败条目跳过 |
| Diff 生成 | 路由结果、原文片段 | canonical diff 列表 | 条目级失败不阻断整轮 |
| 前端呈现 | diff 列表 | 卡片状态 + 删除标记 | 呈现失败不改逻辑状态 |
| 用户决策 | 卡片操作 | 执行计划 | 失效项不可执行但可查看 |
| 生效执行 | 执行计划、最新文档 | 文档新版本 + 状态推进 | 局部失败继续执行并暴露 |
| 观测与失效 | 执行结果、版本信息 | Exposure 事件、失效结果 | 业务失败与失效展示隔离 |

---

## 四、分层可执行规范（MUST 条款）

### 4.1 输入层

MUST：
1. 输入必须归一化为“消息 + 位置线索 + 目标文件”三元组（`DE-CORE-001`）。
2. 若提供精确引用坐标，后续路由必须优先走零搜索（`DE-ROUTE-001`）。
3. 模型输入中禁止暴露 `blockId`，只能使用 `block_index`（`DE-CORE-002`）。
4. 非当前文档场景按需求链路分流，不能仅按“是否打开”硬拦截（`DE-SCENE-001/002`）。

验收：
1. 选区请求、引用请求、无选区请求三类输入都能生成统一结构。
2. 输入对象中无 `blockId` 明文字段。

输入格式定型（来源：主控 §4.1）：
1. 注入给模型的块列表必须采用可线性阅读格式，且只暴露 `block_index` 与文本内容。
2. 块类型推断固定：`h1/h2/h3 -> 标题`，`p -> 正文`，`li -> 列表`，其余标签归并为 `正文`。
3. 状态 C（仅光标）允许在块行尾标记 `"[光标位置]"`，但不得附带 `blockId`。

当前文档事实层定型（MUST）：
0. 术语归属：`当前文档`、`当前文档事实层`、`当前文件锚点`、`项目文档层` 的项目级主定义见 `A-CORE-C-D-02_产品术语边界.md`；本文只定义它们在 DE 主链中的执行含义，不改变主定义边界。
1. 当前打开文档属于“编辑事实层”，来源至少覆盖 `currentFile/currentEditorContent/selection/当前块结构`，不得依赖知识库入库后才可被 agent 理解。
2. 当前文档相关问题的默认优先级必须固定为：`当前文档事实层 -> 当前 workspace 项目文档层 -> 知识库/外部资料层`。
3. 若用户显式引用当前文件，系统可以避免重复注入正文，但不得吞掉该引用语义；后续路由必须能感知“当前文档被显式点名”。
4. 长文档仅注入摘要块不等于“当前文档已充分可见”；摘要不足时，必须先在当前文档内继续定位、抽取、补充注入，再决定是否扩大范围。
5. 旧口径中任何把“当前文档问题”直接滑向知识检索补偿链的实现，均视为过时实现，不再允许继续沿用。

验收补充：
1. 当前文档问题在未出现显式外扩意图前，不得直接触发知识检索。
2. 当前文档被显式引用后，请求上下文中必须保留“显式当前文件锚点”信号。
3. 长文档定位问题在摘要不足时，必须优先出现“文档内二次求解”行为，而不是直接外扩。

场景到路由对照（执行定型）：

| 场景 | 输入特征 | Resolver 路由 | 门禁 |
|---|---|---|---|
| 场景1：有显式选区 | `_sel_*` 完整 | 零搜索 | 直接执行 |
| 场景2：无选区，当前文档已开 | `cursor_*` + 块列表 | 块内搜索 | 直接执行 |
| 场景3：全文扫描任务 | 命中全文扫描意图词 | 块内逐块 | 禁 `rewrite_document` 偷懒 |
| 场景4：未激活但有缓存 | `targetFileResolved` + `canonicalLoaded` | 块内搜索 | 需门禁链全部通过 |
| 场景5：首次打开 html/htm/docx | 缓存预热后注入块树 | 块内搜索 | 需门禁链全部通过 |
| 场景6：首次打开 md/txt | 后端注入 `block-ws-*` | 块内搜索 | 需门禁链全部通过 |

意图状态切换（A/B/C）：
1. A（精确引用）-> 零搜索，且优先级高于 B/C。
2. B（显式选区）-> 零搜索；若 A/B 同时存在，使用时间戳更晚的坐标源并记录冲突事件。
3. C（仅光标）-> 块内搜索，不得伪造精确区间。

非当前文档门禁失败暴露（MUST）：
1. `targetFileResolved/canonicalLoaded/blockMapReady/contextInjected` 任一失败，必须阻断工具执行。
2. 阻断事件统一产出 `ExecutionExposure`，错误码限定为 `E_TARGET_NOT_READY` 或其子类。
3. 门禁失败属于执行前失败，不得写成 `expired` 业务状态。

### 4.2 定位与解析层（Resolver）

MUST：
1. 路由判定权只在 Resolver，不允许前端/提示词层提前分流（`DE-ROUTE-002`）。
2. 每条 diff 必须携带 `route_source`（`DE-ROUTE-003`）。
3. 降级顺序必须“精确定位 -> 块内搜索 -> 整块替换”，且仅降 `block_level`（`DE-DEG-001`）；该降级是受控执行策略，不是兜底式 fallback，不得跳过前置定位失败判定。
4. 全文扫描多块任务禁止以 `rewrite_document` 替代逐块编辑（`DE-DEG-002`）。
5. 树索引与 `baselineId` 强绑定；索引不可用时允许线性回退并跳过失败条目（`DE-TREE-001/002/003`）。

验收：
1. 同一请求中可追踪完整路由链与降级轨迹。
2. 树索引故障时能继续处理其余条目并输出失败明细。
3. 当前文档相关问题在扩大到 workspace 文档层或知识库层前，必须能观察到“当前文档优先/文档内继续求解”的路由意图。

实现定型（来源：主控 §6.2）：
1. 路由分支固定为：`零搜索 -> 块内搜索 -> 整块替换降级`，并保留 `rewrite_block / rewrite_document` 两个显式模式。
2. `block_index` 缺失或越界走错误分支；块内多次命中依赖 `occurrence_index`。
3. `rewrite_document` 仅允许全文任务；多块局部任务必须逐块调用。
4. `整块替换降级` 只允许在块内搜索 miss 且目标块已明确时触发；不得作为“无法定位时默认补全”或跨块任务的模糊替代路径。

分支失败用例矩阵（MUST）：

| 用例 | 触发条件 | 预期结果 |
|---|---|---|
| R-01 | `_sel_*` 坐标缺字段 | 不进入零搜索，返回 `E_RANGE_UNRESOLVABLE` |
| R-02 | `block_index` 越界 | 拒绝执行，返回 `E_RANGE_UNRESOLVABLE` |
| R-03 | 块内多次命中且无 `occurrence_index` | 返回 `E_ROUTE_MISMATCH`，不猜测目标 |
| R-04 | 树索引构建失败 | 线性回退；失败条目跳过并暴露 `E_BLOCKTREE_BUILD_FAILED` |
| R-05 | 非全文任务使用 `rewrite_document` | 阻断执行，返回 `E_ROUTE_MISMATCH` |

Resolver 状态图（文本定型）：
1. `INPUT_READY -> ZERO_SEARCH`（存在精确坐标）
2. `INPUT_READY -> BLOCK_SEARCH`（无精确坐标）
3. `BLOCK_SEARCH -> BLOCK_LEVEL_REWRITE`（块内定位失败）
4. `* -> ERROR_EXPOSED`（协议缺失、越界、不可恢复错误）

### 4.3 Diff 产出层

MUST：
1. 输出必须为 canonical diff 结构（`DE-OUT-001`）。
2. 同批 diff 禁止部分重叠，只允许无交集或完全包含（`DE-OUT-002`）。
3. 跨 Block 区间必须保持闭区间语义一致（`DE-OUT-003`）。
4. `originalText` 必须按统一抽取/归一/校验规则生成（`DE-ORI-001`）。
5. 内容无变化不得产出 diff，不得推进 revision（`DE-NOOP-001`）。

验收：
1. 构造重叠 diff 用例时，系统拒绝非法组合。
2. noop 请求不产生新 diff，不变更版本。

### 4.4 交互决策层

MUST：
1. 文档侧仅承载删除标记，新增内容只在聊天侧展示（`DE-VIS-001`）。
2. 卡片三态及历史折叠遵循统一规则（`DE-VIS-002`）。
3. 单卡接受执行前必须经过校验链（`DE-EXEC-001`）。
4. 批量接受必须“先读后写 + 稳定排序 + 统一刷新”（`DE-EXEC-002`）。
5. 同一 diff 池语义跨轮/跨标签一致（`DE-EXEC-003`）。

验收：
1. 单卡与批量执行结果一致且顺序可复现。
2. 新增文本不会直接写入文档展示层。

批量接受事务边界（MUST）：
1. 读阶段事务：冻结候选 diff 集，完成区间解析与 `originalText` 校验。
2. 写阶段事务：按稳定排序一次性写入；中途不得重新计算候选集。
3. 刷新阶段事务：统一提交 `documentRevision` 与装饰刷新，失败只影响刷新事件，不回滚已成功写入条目。

### 4.5 生效与观测层

MUST：
1. 执行失败采用“跳过继续”，局部失败不得中断整轮（`DE-OBS-001`）。
2. ExecutionExposure 必须按统一模型出参（`DE-OBS-002`）。
3. 错误码必须使用标准集合，含 BlockTree 相关错误（`DE-OBS-003`）。
4. 执行层完成与业务层完成分离判定（`DE-OBS-004`）。
5. 失败暴露与失效处理强隔离（`DE-OBS-005`）。
6. 失效展示静默，不弹阻断型 toast（`DE-EXP-001`）。

验收：
1. 局部失败时，成功条目仍生效且有结构化失败暴露。
2. 失效与执行失败在 UI 和事件层均可区分。

统一错误码最小集（来源：主控 §6.3）：
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

协议化错误返回模板（与 ``A-SYS-I-P-02_api协议.md``/``A-VAL-X-V-03_错误码规范.md`` 对齐）：
1. 返回包结构遵循 `A-SYS-I-P-02_api协议.md` §8 错误协议。
2. 错误码枚举与重试语义遵循 `A-VAL-X-V-03_错误码规范.md` §4/§6。
3. 推荐模板：

```json
{
  "ok": false,
  "error": {
    "code": "E_RANGE_UNRESOLVABLE",
    "layer": "TOOL",
    "retryable": true,
    "message": "block_index out of range",
    "exposure": {
      "diffId": "d-xxx",
      "routeSource": "block_search"
    }
  }
}
```

---

## 五、协议与数据契约（最小必备）

### 5.1 请求契约（MUST）

`RequestContext` 必含字段（`DE-CTX-001`）：
1. `targetFile`
2. `L`
3. `revision`
4. `baselineId`
5. `editorTabId`

定位相关补充字段：
1. `selection_start_block_id`
2. `selection_start_offset`
3. `selection_end_block_id`
4. `selection_end_offset`
5. `cursor_block_id`
6. `cursor_offset`
7. `selected_text`

工具协议：
1. 输入遵循 `edit_current_editor_document` 协议（`DE-PROTO-001`）。
2. 系统注入字段（含 baseline 与选择上下文）必须完整（`DE-PROTO-002`）。
3. 精确引用使用 `TextReference` 四元组（`DE-PROTO-003`）。
4. 禁止使用废弃字段（如 `scope/anchor`）`DE-PROTO-004`。

`edit_mode` 约束矩阵（MUST）：

| edit_mode | 必填字段 | 允许场景 | 禁止项 |
|---|---|---|---|
| `replace` | `block_index + target + content` | 单块替换 | 不得跨块 |
| `delete` | `block_index + target` | 单块删除 | 不得传空 `target` |
| `insert` | `block_index + content` | 块内插入 | 不得伪造目标区间 |
| `rewrite_block` | `block_index + content` | 块级降级 | 不得用于全文任务 |
| `rewrite_document` | `content` | 全文任务（命中全文扫描意图） | 禁用于局部多块任务 |

### 5.2 输出契约（MUST）

1. 每条 diff 至少包含：目标区间、操作类型、`route_source`、`originalText`、执行所需标识。
2. 批量响应必须可稳定排序，保证重放一致性。
3. 输出与执行输入字段可逆映射（可从结果追溯来源区间）。

### 5.3 ContextInfo 后端契约扩展（MUST）

来源：主控 §7.1。  
MUST：
1. `ContextInfo` 必须携带完整选区坐标：`selection_start_block_id/start_offset/end_block_id/end_offset`。
2. 无选区时必须携带光标定位：`cursor_block_id/cursor_offset`。
3. 请求链路必须携带 `baseline_id/document_revision` 用于版本绑定。

字段 owner / consumer 矩阵（MUST）：

| 字段 | owner | consumer |
|---|---|---|
| `targetFile` | 前端路由层 | 后端 Resolver |
| `L` / `revision` | 文档状态层 | Resolver / 执行层 |
| `baselineId` | 后端上下文构建 | Resolver / diffStore |
| `_sel_*` | 编辑器选区采集 | Resolver 零搜索分支 |
| `cursor_*` | 编辑器光标采集 | 注入策略与块内搜索 |
| `selected_text` | 前端选区采集 | `originalText` 预校验 |

### 5.4 md/txt 后端 blockId 注入（MUST）

来源：主控 §8。  
MUST：
1. `open_file_with_cache` 处理 md/txt 且无 `data-block-id` 时，执行后端注入。
2. 注入策略为“按空行分段，每段生成 `<p data-block-id=\"block-ws-{uuid}\">`”。
3. 与编辑器 blockId 共存时优先保留已有唯一 `data-block-id`，避免覆盖。

TipTap 兼容性（来源：主控 §8.2）：
1. `BlockIdExtension` 检测到已有唯一 `data-block-id` 必须保留，不得重写。
2. 前缀区分规则固定：后端注入使用 `block-ws-*`，编辑器生成使用 `block-*`。
3. 打开后首次保存时，允许由编辑器 blockId 覆盖后端注入 blockId，但同一 revision 内必须保持单一来源。

性能边界与回滚（MUST）：
1. 单次注入块数超过 2000 时，必须分批处理并上报耗时观测。
2. 注入失败时回滚到原缓存内容，且输出 `E_APPLY_FAILED` 暴露事件。
3. 注入成功后写缓存前必须做唯一性校验，发现重复 blockId 直接阻断写入。

### 5.5 内容注入策略门禁（MUST）

来源：主控 §4.2。  

| 任务类型 | 识别条件 | 注入内容 | 生效级别 |
|---|---|---|---|
| 有选区或精确引用 | 存在精确区间坐标 | 坐标所在块 ± 前后各2块 | 强制 |
| 文件系统操作 | 含文件操作关键词 | 只注入文件名 | 保持不变 |
| 全文扫描修改 | 命中全文扫描意图 | 完整块列表 | 强制 |
| 短文档 | 纯文本总长 < 800字 | 完整块列表 | 建议 |
| 其他局部编辑 | 默认 | 摘要块列表（前10块 + 所有标题块） | 建议 |

MUST：
1. 强制生效项不得被模型输出覆盖或回退。
2. 全文扫描任务必须注入完整块列表，不允许退化为摘要块列表。
3. 文件系统操作仅注入文件名，不额外注入块正文。

块列表输入格式与类型推断（MUST）：
1. 块列表输出格式固定为 `Block <index> [类型]: <纯文本内容>`。
2. 块类型最小集合固定为：`标题/正文/列表`，未知类型归 `正文`。
3. 块文本必须先去 HTML 标签再截断，单块最大展示长度 500 字符。

### 5.6 前端选区/光标采集约束（MUST）

来源：主控 §7.2。  
MUST：
1. 选区场景必须从编辑器选区锚点提取完整坐标并写入 ContextInfo。
2. 光标场景（`from === to`）必须通过 `findBlockAtPos(doc, from)` 提取块信息。
3. 光标场景必须写入 `cursor_block_id + cursor_offset`，用于无选区上下文提示。

### 5.7 复制粘贴引用坐标保真链（MUST）

来源：主控 §2A/§7.3，统一整合方案 §4.1/§6.2。  
MUST：
1. 复制引用标签时，`TextReference` 必须保留四元组：`startBlockId/startOffset/endBlockId/endOffset`。
2. 粘贴生成引用标签时，前端不得只保留 `blockId` 单块别名；跨块引用必须保留 `startBlockId != endBlockId`。
3. 发送前若无显式选区，必须用引用四元组回填 `_sel_*` 进入零搜索链；不得直接退化为块内搜索。
4. 若引用元数据缺失或过期，必须显式标记为降级引用并输出可观测日志；不得伪装成精确引用。
5. `route_source=reference` 仅在 `_sel_*` 由引用四元组稳定回填后生效，禁止仅凭 UI 标签判定。

验收：
1. 同文档单块复制粘贴引用，执行链输出 `route_source=reference`。
2. 同文档跨块复制粘贴引用，执行链输出 `route_source=reference` 且区间为跨块闭区间。
3. 引用元数据失效时，链路可观测到降级，不得误报为 `reference`。

### 5.8 引用结构保真与传输约束（MUST）

来源：`A-CORE-C-D-02` §3.3 引用结构保真、§五 第 8–11 条。  
MUST：
1. 后端 IPC 接收层必须将前端 `ReferenceFromFrontend` 转换为 `RichReferenceInfo`（含 `ref_type`/`source`/`content`/`text_reference`/`knowledge_*`），不得丢弃 `text_reference` 四元组和知识库细粒度 ID。
2. `build_reference_prompt` 输出每条引用必须包含：类型标题（如 `Text reference`）、`Source: {path}`、位置信息（若有 `text_reference`）和 `Content:`；无 text_reference 时必须附加明确提示，告知模型该引用为行级或文件级精度。
3. 引用正文仅通过 `references` 协议单通道注入后端；前端用户消息 `content` 中不得展开引用正文。引用标签在 `content` 中以 `@{label}` 占位形式出现，不展开。
4. 行级 `@` 引用（`createTextReference`）创建时，若目标文件已在编辑器中打开且有 block 结构，必须尝试从编辑器 DOM 解析对应行的 `data-block-id` 并填入 `textReference` 四元组。若解析失败或文件未打开，允许不填四元组，但 `build_reference_prompt` 必须明确标注该引用为行级精度。
5. `agent_task_summary` 和 `agent_artifacts_summary` 在以下任一条件满足时不得注入：(a) 存在精确选区坐标（`_sel_*` 完整）；(b) 存在同文件 TextReference 引用且用户消息长度 < 100 字符。

验收：
1. 行级 TextReference 在编辑器已打开时，`RichReferenceInfo.text_reference` 字段非空。
2. prompt 中每条引用可见 `Source:` 行。
3. 局部编辑场景（有精确引用 + 短消息）不出现旧任务摘要。

---

## 六、状态模型与一致性约束

MUST：
1. 双状态模型强制生效：显示状态与逻辑状态隔离（`DE-STATE-001`）。
2. 用户沉默不等于接受，pending 不改变逻辑状态（`DE-STATE-002`）。
3. 单一真源使用 `L + revision + baselineId`（`DE-BASE-001`）。
4. `getLogicalContent` 仅用于重建，不得回放 pending（`DE-BASE-002`）。
5. 撤销系统与 Diff 执行隔离，Diff 不参与撤销栈（`DE-EXEC-004`）。

验收：
1. 连续多轮对话下，逻辑状态只受“已接受”操作影响。
2. 撤销编辑器操作不反向改写 diff 池状态。

---

## 七、文档分工与双向链接规则

### 7.1 分工

1. `A-DE-M-D-01_对话编辑统一方案.md`：主链执行标准、跨模块契约、验收门槛（本文）。
2. `A-DE-M-T-01_diff系统规则.md`：Diff 展示/交互/执行专题细则。
3. `A-DE-M-T-02_baseline状态协作.md`：状态与基线协作细则。
4. `A-DE-M-P-01_对话编辑提示词.md`：提示词与工具调用约束细则。

### 7.2 双向链接规则（MUST）

1. `A-DE-M-D-01_对话编辑统一方案.md` 中每个规则域必须指向对应专项文档。
2. `A-DE-M-T-01_diff系统规则.md`/`A-DE-M-T-02_baseline状态协作.md`/`A-DE-M-P-01_对话编辑提示词.md` 的专题规则必须回链 `A-DE-M-D-01_对话编辑统一方案.md` 与 DE 规则ID。
3. 出现跨文档冲突时，以 DE 主源为准并同步修订所有引用文档。

### 7.3 与 Agent 主控的对齐规则（DE-AGT-* 系列）

依据 `A-AG-M-D-01_Binder Agent能力描述文档.md` §5.6.4（BA-SCENE-002），DE（层次三/对话编辑）是 Binder Agent 体系的**主要承接位**。

对齐原则：DE 自身 DE-* 规则不被 Agent 文档覆盖；以下 DE-AGT-* 为新增承接规则，以叠加方式进入 DE 体系，不改写现有执行主链。

---

**DE-AGT-001**（承接 BA-VERIFY-001/002/003）：分层验证门禁序

MUST：
1. 结构验证（门禁链：targetFileResolved / canonicalLoaded / blockMapReady / contextInjected，DE-SCENE-002）必须先于约束验证执行。
2. 结构验证任一项失败，必须立即阻断执行，不得进入 Diff 生成阶段，输出 `E_TARGET_NOT_READY` 或其子类。
3. 约束验证（originalText 校验 DE-ORI-001 + 区间冲突检测 DE-OUT-002）失败时，diff 条目必须标记为 `constraint_failed`，不得直接进入卡片呈现（review_ready）状态。

验收：
1. 构造门禁任一项失败用例，diff 生成链被阻断，可观测到 `E_TARGET_NOT_READY` 记录。
2. 构造 originalText 不匹配用例，卡片展示 `constraint_failed` 标记，可与正常 pending 卡片区分。

---

**DE-AGT-002**（承接 BA-STATE-001/003，BA-RUN-001）：stage_complete 闭合判定

MUST：
0. `stage_complete`、`verification`、`confirmation`、`invalidated` 的术语主定义以 `A-AG-M-T-04_Binder Agent技术主控文档.md` 与 `A-AG-M-T-03_任务规划执行.md` 为准；本文仅定义对话编辑链如何满足这些上位条件。
1. 一轮对话编辑完成后，stage_complete 判定必须同时满足：(a) 本轮 revision 已成功推进；(b) 当前 diff 池中无 `constraint_failed` 或 `apply_failed` 的悬置条目。
2. 仅 revision 推进不等于 stage_complete；系统不得将"diff 池清空"或"模型输出结束"等同于阶段闭合。
3. stage_complete 判定结果必须输出可观测事件（ExecutionExposure 中含 `stageEvent: stage_complete`），不得仅以 UI 静默表达。

验收：
1. 正常轮次完成，ExecutionExposure 中可观测到 `stage_complete` 事件，含本轮 revision 与 diffIds。
2. 存在 `constraint_failed` 条目时，`stage_complete` 不触发，系统停留在 review_ready。

---

**DE-AGT-003**（承接 BA-ASSET-001）：diff artifact 最小字段

MUST：
1. 每条写入 pending_diffs 的 diff 必须携带以下 artifact 最小字段：
   - `diffId`：全局唯一稳定标识（UUID v4）
   - `targetFile`：来源文件路径
   - `route_source`：执行路径来源（已由 DE-ROUTE-003 要求）
   - `revision`：产生时绑定的文档版本号
   - `createdAt`：产生时间戳（ISO 8601）
2. 缺少任一字段的 diff 不得写入 pending_diffs，必须拒绝并输出 `E_APPLY_FAILED`。

验收：
1. pending_diffs 中任意条目均可查到上述五个字段。
2. 构造缺字段 diff，写入被拒绝并有 `E_APPLY_FAILED` 观测记录。

---

**DE-AGT-004**（承接 BA-STATE `draft→structured`）：plan 阶段 —— 占位，P3 待承接

当前 DE 从用户消息直接进入执行链，跳过了 BA-STATE 的 `draft → structured` 转换（目标/范围/约束结构化阶段）。

现状约束（MUST）：
1. 在 plan 阶段未实现前，DE 不得声称已满足 BA-STATE `structured` 状态。
2. 当前轮次的任务范围由用户消息隐式确定，系统不得代替用户声明范围已明确。

待实现（AG P2 后承接）：
1. 在执行链前增加 scope 结构化阶段，在满足目标/范围/约束条件前阻断 execute 阶段。
2. 形成显式的 plan 产物对象，进入 DE-AGT-003 的 artifact 链。

---

## 八、规则落地索引（`A-DE-M-D-01_对话编辑统一方案.md` 承载与分流）

> 说明：本节提供全量规则ID的“功能锚点 + 开发锚点 + 验收锚点”索引，作为开发与联调的唯一检索入口。

### 8.1 全量规则ID锚点矩阵

| 规则ID | 功能覆盖 | 执行锚点（精确） | 开发锚点 | 验收锚点 |
|---|---|---|---|---|
| DE-CORE-001 | 双变量任务建模 | `A-DE-M-D-01_对话编辑统一方案.md`§4.1；`A-DE-M-P-01_对话编辑提示词.md`§4.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1；`A-DE-M-P-01_对话编辑提示词.md`§8.1 |
| DE-CORE-002 | 模型不接触 blockId | `A-DE-M-D-01_对话编辑统一方案.md`§4.1；`A-DE-M-P-01_对话编辑提示词.md`§4.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1；`A-DE-M-P-01_对话编辑提示词.md`§8.1 |
| DE-STATE-001 | 双状态隔离 | `A-DE-M-T-02_baseline状态协作.md`§5.1；`A-DE-M-D-01_对话编辑统一方案.md`§6 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.2；`A-DE-M-D-01_对话编辑统一方案.md`§10.2 |
| DE-STATE-002 | pending 不改逻辑状态 | `A-DE-M-T-02_baseline状态协作.md`§5.2；`A-DE-M-P-01_对话编辑提示词.md`§6.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.2；`A-DE-M-P-01_对话编辑提示词.md`§8.1 |
| DE-CTX-001 | RequestContext 必备字段 | `A-DE-M-D-01_对话编辑统一方案.md`§5.1；`A-DE-M-P-01_对话编辑提示词.md`§5.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1；`A-DE-M-P-01_对话编辑提示词.md`§8.2 |
| DE-ROUTE-001 | 精确坐标优先零搜索 | `A-DE-M-D-01_对话编辑统一方案.md`§4.1/4.2；`A-DE-M-P-01_对话编辑提示词.md`§4.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1；`A-DE-M-P-01_对话编辑提示词.md`§8.1 |
| DE-ROUTE-002 | 分流判定权在 Resolver | `A-DE-M-D-01_对话编辑统一方案.md`§4.2；`A-DE-M-P-01_对话编辑提示词.md`§4.4 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-P-01_对话编辑提示词.md`§8.1 |
| DE-ROUTE-003 | diff 必带 route_source | `A-DE-M-D-01_对话编辑统一方案.md`§4.2；`A-DE-M-T-01_diff系统规则.md`§3.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-T-01_diff系统规则.md`§8.2 |
| DE-SCENE-001 | 非当前文档按需求走 | `A-DE-M-D-01_对话编辑统一方案.md`§4.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-SCENE-002 | 非当前文档就绪门禁链 | `A-DE-M-D-01_对话编辑统一方案.md`§4.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-DEG-001 | 严格降级阶梯 | `A-DE-M-D-01_对话编辑统一方案.md`§4.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-DEG-002 | 多块任务禁全文重写偷懒 | `A-DE-M-D-01_对话编辑统一方案.md`§4.2；`A-DE-M-P-01_对话编辑提示词.md`§4.4 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-NOOP-001 | 无变化不产 diff/不推进 revision | `A-DE-M-T-02_baseline状态协作.md`§5.4；`A-DE-M-D-01_对话编辑统一方案.md`§4.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.2 |
| DE-PROTO-001 | edit_current_editor_document 协议 | `A-DE-M-D-01_对话编辑统一方案.md`§5.1；`A-DE-M-P-01_对话编辑提示词.md`§5.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-P-01_对话编辑提示词.md`§8.2 |
| DE-PROTO-002 | 系统注入字段完整 | `A-DE-M-D-01_对话编辑统一方案.md`§5.1；`A-DE-M-P-01_对话编辑提示词.md`§5.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-P-01_对话编辑提示词.md`§8.2 |
| DE-PROTO-003 | TextReference 四元组 | `A-DE-M-D-01_对话编辑统一方案.md`§5.1；`A-DE-M-P-01_对话编辑提示词.md`§5.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-P-01_对话编辑提示词.md`§8.2 |
| DE-PROTO-004 | 废弃字段禁用 | `A-DE-M-D-01_对话编辑统一方案.md`§5.1；`A-DE-M-P-01_对话编辑提示词.md`§5.4 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-P-01_对话编辑提示词.md`§8.2 |
| DE-OUT-001 | canonical diff 统一输出 | `A-DE-M-D-01_对话编辑统一方案.md`§4.3；`A-DE-M-T-01_diff系统规则.md`§3.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-T-01_diff系统规则.md`§8.1 |
| DE-OUT-002 | 同批 diff 禁部分重叠 | `A-DE-M-D-01_对话编辑统一方案.md`§4.3；`A-DE-M-T-01_diff系统规则.md`§3.2；`A-DE-M-T-02_baseline状态协作.md`§6.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-01_diff系统规则.md`§8.2 |
| DE-OUT-003 | 跨 Block 闭区间一致 | `A-DE-M-D-01_对话编辑统一方案.md`§4.3；`A-DE-M-T-01_diff系统规则.md`§3.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-01_diff系统规则.md`§8.1 |
| DE-ORI-001 | originalText 抽取/归一/校验 | `A-DE-M-D-01_对话编辑统一方案.md`§4.3；`A-DE-M-T-01_diff系统规则.md`§3.4；`A-DE-M-T-02_baseline状态协作.md`§4.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-T-01_diff系统规则.md`§8.2 |
| DE-VIS-001 | 文档侧仅删除标记 | `A-DE-M-T-01_diff系统规则.md`§4.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-01_diff系统规则.md`§8.2 |
| DE-VIS-002 | 卡片三态与折叠规则 | `A-DE-M-T-01_diff系统规则.md`§4.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-01_diff系统规则.md`§8.2 |
| DE-EXP-001 | 失效静默 | `A-DE-M-T-01_diff系统规则.md`§6.1；`A-DE-M-D-01_对话编辑统一方案.md`§4.5 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-01_diff系统规则.md`§8.3 |
| DE-EXEC-001 | 单卡接受校验链 | `A-DE-M-D-01_对话编辑统一方案.md`§4.4；`A-DE-M-T-01_diff系统规则.md`§5.1 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-EXEC-002 | 批量接受时序与排序 | `A-DE-M-D-01_对话编辑统一方案.md`§4.4；`A-DE-M-T-01_diff系统规则.md`§5.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1；`A-DE-M-T-01_diff系统规则.md`§8.2 |
| DE-EXEC-003 | 同一 diff 池语义一致 | `A-DE-M-D-01_对话编辑统一方案.md`§4.4；`A-DE-M-T-01_diff系统规则.md`§5.3；`A-DE-M-T-02_baseline状态协作.md`§6.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.2 |
| DE-EXEC-004 | 撤销隔离 | `A-DE-M-D-01_对话编辑统一方案.md`§6；`A-DE-M-T-02_baseline状态协作.md`§6.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.2 |
| DE-OBS-001 | 跳过继续 | `A-DE-M-D-01_对话编辑统一方案.md`§4.5；`A-DE-M-T-01_diff系统规则.md`§5.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.3 |
| DE-OBS-002 | ExecutionExposure 统一观测 | `A-DE-M-D-01_对话编辑统一方案.md`§4.5；`A-DE-M-P-01_对话编辑提示词.md`§6.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.3 |
| DE-OBS-003 | 标准错误码集合 | `A-DE-M-D-01_对话编辑统一方案.md`§4.5 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.3 |
| DE-OBS-004 | 执行层/业务层完成判定 | `A-DE-M-D-01_对话编辑统一方案.md`§4.5 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | `A-DE-M-D-01_对话编辑统一方案.md`§10.3 |
| DE-OBS-005 | 失败暴露与失效隔离 | `A-DE-M-D-01_对话编辑统一方案.md`§4.5；`A-DE-M-T-01_diff系统规则.md`§6.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-01_diff系统规则.md`§8.3 |
| DE-BASE-001 | L+revision+baselineId 单一真源 | `A-DE-M-D-01_对话编辑统一方案.md`§6；`A-DE-M-T-02_baseline状态协作.md`§3/4 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.1 |
| DE-BASE-002 | getLogicalContent 仅重建 | `A-DE-M-D-01_对话编辑统一方案.md`§6；`A-DE-M-T-02_baseline状态协作.md`§5.3 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-T-02_baseline状态协作.md`§8.2 |
| DE-TREE-001 | 树索引与 baselineId 强绑定 | `A-DE-M-D-01_对话编辑统一方案.md`§4.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-TREE-002 | 同 baselineId 共用同一索引 | `A-DE-M-D-01_对话编辑统一方案.md`§4.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-D-01_对话编辑统一方案.md`§10.1 |
| DE-TREE-003 | 树不可用线性回退+跳过暴露 | `A-DE-M-D-01_对话编辑统一方案.md`§4.2；`A-DE-M-T-01_diff系统规则.md`§5.2 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | `A-DE-M-D-01_对话编辑统一方案.md`§10.3 |
| DE-RISK-001 | 高风险链路固定控制 | `A-DE-M-D-01_对话编辑统一方案.md`§9.3；统一方案§13 | `A-DE-M-D-01_对话编辑统一方案.md`§9.3 | `A-DE-M-D-01_对话编辑统一方案.md`§10.4 |
| DE-PLAN-001 | 实施优先级 | `A-DE-M-D-01_对话编辑统一方案.md`§9；统一方案§14 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1/9.2/9.3 | `A-DE-M-D-01_对话编辑统一方案.md`§10.4 |

### 8.2 未覆盖分支承接表（收口）

| 分支 | 主承接文档 | 协同文档 | 说明 |
|---|---|---|---|
| 展示视觉细节（卡片折叠/标记样式） | `A-DE-M-T-01_diff系统规则.md`§4 | `A-DE-M-D-01_对话编辑统一方案.md`§4.4 | `A-DE-M-T-01_diff系统规则.md` 主定义，`A-DE-M-D-01_对话编辑统一方案.md` 仅保留门禁 |
| 逻辑状态推进与 baseline 协作 | `A-DE-M-T-02_baseline状态协作.md`§4/§5 | `A-DE-M-D-01_对话编辑统一方案.md`§6 | `A-DE-M-T-02_baseline状态协作.md` 主定义，`A-DE-M-D-01_对话编辑统一方案.md` 保留边界 |
| 提示词模板与字段白名单 | `A-DE-M-P-01_对话编辑提示词.md`§5 | `A-DE-M-D-01_对话编辑统一方案.md`§5 | `A-DE-M-P-01_对话编辑提示词.md` 主定义，`A-DE-M-D-01_对话编辑统一方案.md` 保留协议约束 |
| store 内字段映射与批执行索引 | `A-ENG-X-T-04_diffstore设计.md`§3/§5 | `A-DE-M-T-01_diff系统规则.md`§5 | `A-ENG-X-T-04_diffstore设计.md` 主定义，`A-DE-M-T-01_diff系统规则.md` 保留执行语义 |

---

## 九、开发实施顺序（可直接排期）

### 9.1 P0（必须先完成）

1. 输入与协议收口：`DE-CTX-001`, `DE-PROTO-001~004`
2. 路由主链收口：`DE-ROUTE-001~003`, `DE-DEG-001/002`
3. Diff 基础出参：`DE-OUT-001`, `DE-ORI-001`
4. 单卡执行链：`DE-EXEC-001`
5. 观测最小集：`DE-OBS-001~003`

代码入口锚点（实现定型）：
1. 后端 Resolver：`src-tauri/src/services/positioning_resolver.rs`
2. 工具执行编排：`src-tauri/src/services/tool_call_handler.rs`
3. Diff 生成与执行：`src-tauri/src/services/diff_service.rs`
4. 请求命令入口：`src-tauri/src/commands/ai_commands.rs` / `src-tauri/src/commands/tool_commands.rs`
5. 前端上下文构建：`src/utils/requestContext.ts` / `src/stores/chatStore.ts`
6. 前端执行与装饰：`src/stores/diffStore.ts` / `src/utils/applyDiffReplaceInEditor.ts` / `src/components/Editor/extensions/DiffDecorationExtension.ts`

### 9.2 P1

1. 批量执行与排序一致性：`DE-EXEC-002`
2. 树索引与回退机制：`DE-TREE-001~003`
3. 状态协作收口：`DE-STATE-001/002`, `DE-BASE-001/002`, `DE-NOOP-001`
4. 场景门禁收口：`DE-SCENE-001/002`
5. 区间与批执行一致性：`DE-OUT-002/003`, `DE-EXEC-003/004`
6. 失效隔离：`DE-OBS-005`, `DE-EXP-001`

### 9.3 P2

1. 高风险链路加固：`DE-RISK-001`
2. 跨模块回归与规则巡检自动化
3. 历史卡片与展示一致性完善

废弃路径清理台账（来源：主控 §10，MUST）：

| 废弃项 | 替代路径 | 清理状态 |
|---|---|---|
| `scope` / `anchor` 协议字段 | `TextReference` 四元组 + `_sel_*` | 已禁用；仅在历史协议读取窗口中临时兼容读取，不得写回、不得作为新请求输出，待旧记录迁移后删除 |
| 通过提示词决定路由分支 | Resolver 路由层（`A-DE-M-D-01_对话编辑统一方案.md`§4.2） | 已替换 |
| 局部多块任务走 `rewrite_document` | 逐块 `edit_current_editor_document` | 已替换 |
| 失败事件直接映射 `expired` | `ExecutionExposure` 独立事件流 | 已替换 |

---

## 十、验收矩阵（上线门禁）

### 10.1 功能门禁

1. 选区编辑、引用编辑、无选区编辑三路径全部通过。
2. 单卡接受、单卡拒绝、批量接受、批量拒绝全部通过。
3. 跨 Block 编辑与降级路径可复现。

### 10.2 一致性门禁

1. 同请求重放结果一致（排序与结果一致）。
2. pending 不影响逻辑状态。
3. revision 仅在有效生效后推进。

### 10.3 观测门禁

1. 局部失败必有结构化暴露。
2. 执行失败与失效展示可区分。
3. 错误码符合标准集合。

### 10.4 文档门禁

1. 每条 P0/P1 规则在 `A-DE-M-D-01_对话编辑统一方案.md`/`A-DE-M-T-01_diff系统规则.md`/`A-DE-M-T-02_baseline状态协作.md`/`A-DE-M-P-01_对话编辑提示词.md` 至少有一个“主定义+反向链接”。
2. 无 `MUST` 条款的章节视为未完成。
3. 无验收口径的规则视为未落地。

---

## 十一、关联文档（执行时必读）

1. `A-DE-M-T-01_diff系统规则.md`
2. `A-DE-M-T-02_baseline状态协作.md`
3. `A-DE-M-P-01_对话编辑提示词.md`
4. `A-AG-M-T-03_任务规划执行.md`
5. `A-AG-M-T-04_Binder Agent技术主控文档.md`
6. `A-AST-M-P-01_上下文注入.md`
7. `A-AST-M-T-07_Binder知识库自动检索协同规范.md`
8. `A-SYS-C-T-01_系统总体架构.md`
9. `A-WS-M-T-01_workspace架构.md`
10. `R-DE-M-R-02_对话编辑-统一整合方案.md`（仅作历史参考）
11. `R-DE-M-R-01_对话编辑-主控设计文档.md`（仅作历史参考）
8. `A-SYS-M-T-01_数据流状态流.md`
9. `A-AG-M-T-01_ai执行架构.md`
10. `A-WS-M-T-02_多文档资源系统.md`
11. `A-AG-M-D-01_Binder Agent能力描述文档.md`（上位主控，BA-* 规则承接来源）
