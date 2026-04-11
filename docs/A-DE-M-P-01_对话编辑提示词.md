# 对话编辑提示词（可执行规范版）

## 文档头

- 结构编码：`DE-M-P-01`
- 文档属性：`主结构`
- 主责模块：`DE`
- 文档职责：`对话编辑提示词 / 接口、协议与契约主控`
- 上游约束：`CORE-C-D-04`, `WS-M-D-01`, `AG-M-T-01`, `ED-M-T-01`, `DE-M-D-01`, `DE-M-T-01`
- 直接承接：`DE-X-L-01`
- 接口耦合：`WS-M-D-01`, `ED-M-T-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `DE-M-D-01`, `DE-M-T-01`
- 扩散检查：`DE-M-T-02`
- 使用边界：`定义接口、协议与数据契约，不承担模块主规则裁定与开发计划`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：30_capabilities / 01_对话编辑系统 / 提示词治理专项规范  
> 文档状态：执行标准（用于开发、联调、验收）  
> 规则主源：`R-DE-M-R-02_对话编辑-统一整合方案.md`

---

## 一、文档定位与生效原则

本文将对话编辑主规则转译为可执行提示词约束，目标是保证：
1. 提示词与业务规则长期同步。
2. 提示词与工具协议字段一致。
3. 提示词与执行/观测语义不冲突。
4. 提示词专项规则只承接层次三，不回卷层次一、层次二。

架构对齐约束：
1. 本文消费 `A-AG-M-T-02_prompt架构.md` 冻结的层次三七层提示词结构。
2. 本文只补对话编辑专项字段、定位、路由、工具协议，不改写七层装配优先级。
3. 当前对话目标、当前轮任务状态、显式引用优先级，以上位 `A-AG-M-T-02_prompt架构.md` 与 `A-AST-M-P-01_上下文注入.md` 为准。

生效优先级：
1. `R-DE-M-R-02_对话编辑-统一整合方案.md`（DE 规则主源）。
2. `R-DE-M-R-01_对话编辑-主控设计文档.md`（实现约束主源）。
3. 本文（提示词治理执行标准）。
4. `A-DE-M-D-01_对话编辑统一方案.md`（总纲门禁）。

---

## 二、规则承接矩阵（主承接 / 协同承接）

| 规则ID | 承接级别 | 本文承接点 | 开发锚点 | 验收锚点 |
|---|---|---|---|---|
| DE-CORE-001 | 主承接 | 4.1 任务建模约束 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.1 |
| DE-CTX-001 | 主承接 | 5.1 上下文字段要求 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.2 |
| DE-ROUTE-001 | 主承接 | 4.3 零搜索触发 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.1 |
| DE-ROUTE-002 | 主承接 | 4.4 Resolver 分流边界 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.1 |
| DE-OBS-002 | 主承接 | 6.2 失败暴露叙述 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.3 |
| DE-PROTO-001 | 协同承接 | 5.2 工具协议 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.2 |
| DE-PROTO-002 | 协同承接 | 5.2 系统注入字段 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.2 |
| DE-PROTO-003 | 协同承接 | 5.3 精确引用字段 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.2 |
| DE-PROTO-004 | 协同承接 | 5.4 禁用字段 | `A-DE-M-D-01_对话编辑统一方案.md`§9.1 | 8.2 |
| DE-STATE-002 | 协同承接 | 6.1 pending 语义 | `A-DE-M-D-01_对话编辑统一方案.md`§9.2 | 8.1 |

---

## 三、提示词系统目标（可验收）

1. 正确识别目标编辑文档与定位线索。
2. 正确触发零搜索与块内搜索语义。
3. 正确使用工具字段，不回流废弃字段。
4. 正确描述 pending/accepted/expired 语义。
5. 正确处理多块任务与跨文档任务叙述边界。

### 3.1 L3 装配输入映射

对话编辑提示词专项只消费上位 `L3PromptAssemblyInput` 中与对话编辑相关的字段：

1. `currentTurnGoal`
2. `userLatestMessage`
3. `stageSnapshot`
4. `activePlan`
5. `activeScope`
6. `currentDocument`
7. `explicitReferences`
8. `selectedTemplates`
9. `availableTools`

其中：

1. `memoryHits`、`knowledgeHits`、`historyDigest` 只作为补强，不得覆盖定位与路由字段。
2. `stageSnapshot`、`activePlan`、`activeScope` 只提供任务约束，不替代 DE 专项路由规则。

---

## 四、提示词分层执行规范（MUST）

### 4.0 与 L3 七层结构的映射

| L3 层 | DE 专项主要承接内容 |
|---|---|
| `governance_layer` | 内容+位置双变量、禁止接触 `blockId`、禁止伪造定位 |
| `task_layer` | 当前编辑目标、当前文件范围、当前阶段限制 |
| `conversation_layer` | 当前轮编辑意图、上一轮已提交结论、未决编辑问题 |
| `fact_layer` | `targetFile`、`L`、`revision`、选区、精确引用四元组 |
| `constraint_layer` | 对话编辑中的模板/技能仅作风格或流程约束 |
| `augmentation_layer` | 历史摘要、记忆、知识库仅作补强，不得主导定位 |
| `tool_and_output_layer` | `edit_current_editor_document` 协议、字段白名单、状态叙述 |

### 4.1 系统层（角色与硬约束）

MUST：
1. 明确“内容 + 位置”双变量任务模型。
2. 禁止模型推断不可用定位信息。
3. 禁止模型接触 `blockId`，仅可使用 `block_index`。

反例样例（必须拦截）：
1. 反例：`请把 block-123 的内容改为...`（直接引用 `blockId`）。
2. 反例：`如果找不到就猜测附近块继续改`（越权推断定位）。
3. 反例：`先把全文重写再微调`（绕过逐块编辑约束）。

正例样例（允许）：
1. `请在 block_index=3 内把 target="foo" 替换为 "bar"`。
2. `存在精确引用坐标时，直接按坐标执行，不做搜索推断`。

### 4.2 上下文层（目标文档与版本）

MUST：
1. 指定本轮目标文档来源于 `targetFile`。
2. 指定编辑基准来源于 `L` 与 `revision`。
3. 指定跨轮上下文不得复用旧 `baselineId`。

### 4.3 引用层（零搜索触发）

MUST：
1. 存在精确坐标时，必须触发零搜索语义。
2. 精确引用是定位真源，不可被普通引用覆盖。
3. 普通引用仅作语义补充，不可替代区间坐标。

### 4.4 工具路由层（分流边界）

MUST：
1. 分流判定权属于 Resolver，提示词不得越权分流。
2. 提示词只表达“应提供的线索”，不生成执行层路由结果。
3. 多块任务必须按逐块编辑语义描述，不得引导全量重写。

全文扫描意图识别词（来源：主控 §4.3）：
1. 中文模式：`所有` + `改/替换/修改/统一/翻译`、`全文` + 动词、`把所有X改成Y`。
2. 英文模式：`all occurrences`、`replace all`、`throughout the document`、`every instance of`。

### 4.5 工具后续层（结果叙述）

MUST：
1. 工具返回 pending 时，提示词不得叙述为“已应用”。
2. 失败暴露与失效处理叙述必须分离。
3. 批量场景下必须允许“部分成功 + 部分失败”叙述。

---

## 五、字段与协议白名单（MUST）

### 5.1 必须识别字段

1. `targetFile`
2. `L`
3. `revision`
4. `baselineId`
5. `current_file`
6. `current_content`
7. `document_revision`
8. `_sel_start_block_id`
9. `_sel_start_offset`
10. `_sel_end_block_id`
11. `_sel_end_offset`
12. `_sel_text`

### 5.2 工具协议约束

MUST：
1. 调用 `edit_current_editor_document` 时必须遵循当前协议结构。
2. 系统注入字段必须透传，不得在提示词中改名或省略。
3. 提示词示例必须与实际协议字段一致。

### 5.3 精确引用约束

MUST：
1. 精确引用字段按 `TextReference` 四元组表达。
2. 无四元组时不得伪造“精确坐标已知”。
3. 失真引用要回退为普通语义线索。

### 5.4 禁用字段清单

1. `scope`
2. `anchor`
3. `instruction`
4. `target_content`

MUST：
1. 禁用字段不得出现在模板、示例、few-shot、回归样例中。
2. 检测到禁用字段必须阻断发布。

### 5.5 系统提示词模板（定型）

来源：主控 §5.2。  
提示词模板必须包含以下约束语句（语义等价即可）：
1. 对打开文件的编辑一律使用 `edit_current_editor_document`。
2. 按块列表选择 `block_index`（0-based）。
3. `target` 必须是块内精确纯文本，不带 HTML。
4. 多处命中使用 `occurrence_index`。
5. 多块任务必须逐块调用，不得用 `rewrite_document` 代替局部多块编辑。
6. 禁止伪造块编号。

### 5.6 引用展示与定位协同（定型）

来源：主控 §7.3。  
MUST：
1. 引用展示建议采用 `[文本引用 · Block N]` 标识，便于模型理解块上下文。
2. 引用坐标（`startBlockId/startOffset/endBlockId/endOffset`）作为无显式选区时的一级定位输入。
3. 引用展示信息与执行定位信息分离：展示可读，定位以结构化坐标为准。

### 5.7 内容注入策略协同（定型）

来源：主控 §4.2。  
提示词层必须与注入策略协同，避免模型基于错误上下文选块：

| 任务类型 | 提示词协同要求 |
|---|---|
| 有选区或精确引用 | 明确“优先使用精确坐标上下文”，避免泛化搜索 |
| 文件系统操作 | 仅围绕文件名/路径描述，不推断正文块内容 |
| 全文扫描修改 | 明确要求逐块处理，禁止一次性局部任务全文重写 |
| 短文档 | 允许使用完整块列表进行整体定位 |
| 其他局部编辑 | 优先使用摘要块列表和标题块进行定位提示 |

MUST：
1. 提示词不得与系统注入策略冲突（例如摘要注入场景强制要求全文遍历）。
2. 注入策略变化后，提示词模板必须同步更新并通过回归矩阵。

### 5.8 对话编辑 PromptPackage 代码骨架

```rust
fn build_de_prompt_package(input: &L3PromptAssemblyInput) -> PromptPackage {
    let governance = build_de_governance_layer(input);
    let task = build_de_task_layer(input);
    let conversation = build_de_conversation_layer(input);
    let facts = build_de_fact_layer(input);
    let constraints = build_de_constraint_layer(input);
    let augmentation = build_de_augmentation_layer(input);
    let tool_and_output = build_de_tool_and_output_layer(input);

    PromptPackage {
        system: vec![governance, task],
        context: vec![conversation, facts, constraints, augmentation],
        tooling: Some(vec![tool_and_output]),
        outputContract: None,
    }
}
```

实现约束：

1. `build_de_fact_layer` 必须优先消费 `targetFile/L/revision/baselineId` 与精确引用字段。
2. `build_de_augmentation_layer` 不得输出任何会覆盖定位语义的文本。
3. `build_de_tool_and_output_layer` 必须与 `edit_current_editor_document` 当前协议完全一致。

---

## 六、状态与观测叙述规则（MUST）

### 6.1 状态叙述

MUST：
1. pending 表示“待确认”，不表示“已生效”。
2. accepted 才表示进入逻辑状态。
3. expired 表示业务失效，不表示执行异常。

### 6.2 观测叙述

MUST：
1. 失败暴露按 `ExecutionExposure` 语义描述。
2. 失败与失效必须在语言层显式区分。
3. 局部失败场景必须允许“继续处理其余条目”的叙述。

---

## 七、持续对齐机制（MUST）

### 7.1 变更触发条件

以下任一变更必须触发 `A-DE-M-P-01_对话编辑提示词.md` 对齐：
1. `R-DE-M-R-02_对话编辑-统一整合方案.md`
2. `R-DE-M-R-01_对话编辑-主控设计文档.md`
3. `A-DE-M-D-01_对话编辑统一方案.md`
4. `A-DE-M-T-01_diff系统规则.md`
5. `A-DE-M-T-02_baseline状态协作.md`

### 7.2 对齐执行步骤

1. 识别新增/废弃 DE 规则ID。
2. 检查提示词分层是否覆盖对应约束。
3. 检查字段示例与真实协议是否一致。
4. 检查禁用字段是否回流。
5. 输出“已对齐项 / 缺口项 / 责任人 / 截止时间”。

### 7.3 发布门禁

1. 未完成对齐检查不得发布。
2. 回归用例未通过不得发布。
3. 存在禁用字段不得发布。

---

## 八、回归检查矩阵

### 8.1 规则回归

1. “有精确坐标必走零搜索”可从提示词直接读出。
2. “分流判定权只在 Resolver”可从提示词直接读出。
3. “pending 非已应用”可从工具后续提示直接读出。

### 8.2 协议回归

1. 工具字段示例与当前协议完全一致。
2. 精确引用字段与四元组结构一致。
3. 不包含任何禁用字段。

### 8.3 语义回归

1. 失败暴露与失效处理语义分离。
2. 批量场景支持局部成功叙述。
3. 跨文档任务不串线目标文件。

---

## 九、与 `A-DE-M-D-01_对话编辑统一方案.md`/`A-DE-M-T-01_diff系统规则.md`/`A-DE-M-T-02_baseline状态协作.md` 的反向链接

1. 与 ``A-DE-M-D-01_对话编辑统一方案.md`` 对齐：输入层、路由层、观测层 MUST 条款。
2. 与 ``A-DE-M-T-01_diff系统规则.md`` 对齐：卡片状态、失效语义、失败暴露语义。
3. 与 ``A-DE-M-T-02_baseline状态协作.md`` 对齐：`L/revision/baselineId` 口径与 pending 语义。

---

## 十、关联文档

1. `A-DE-M-D-01_对话编辑统一方案.md`
2. `A-DE-M-T-01_diff系统规则.md`
3. `A-DE-M-T-02_baseline状态协作.md`
4. `A-AG-M-T-01_ai执行架构.md`
5. `R-DE-M-R-13_层次三（对话编辑）提示词详细分析文档.md`
6. `R-DE-M-R-02_对话编辑-统一整合方案.md`
7. `R-DE-M-R-01_对话编辑-主控设计文档.md`
