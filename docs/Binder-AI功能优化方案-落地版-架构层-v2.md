# Binder 对话编辑 AI 功能优化方案（落地版 · 架构层 v2.0）

> **文档定位**：在「**可控的 AI 文档任务调度**」这一更高逻辑层次上，定义 **Intent → Strategy → Orchestration → Execution → Diff** 的稳定结构；与《Binder对话编辑-AI交互优化方案（代码对齐版）》**互补**——后者侧重 **现有工具链上的上下文卫生与执行可靠性**，本文侧重 **任务形态的产品抽象与可演进架构**。  
> **原则**：不把 Binder 定义为「又一个 AI 编辑器」，而定义为 **把用户模糊表达 → 精确可执行操作链** 的系统；AI 在**边界内**生成与推理，**系统**负责策略、权限与落盘形态。  
> **落地成本**：各章节人天、风险、分期及与《代码对齐版》模块对照见 **§八**；排期建议以 **§八.7 分档汇总** 与 **§九** 联合使用。

---

## 〇、适用范围与功能边界（必读）

**本文档适用于「对话驱动的 Binder AI」**：以 **聊天面板（Chat）与工作区 Agent 模式** 发起、由 **`ai_chat_stream`** 承载的任务。**「对话编辑」** 在标题中指 **同一套对话链路**，不仅包含 **改当前文档 / 多文件读写**，也包含 **项目级文档整理、归类、移动** 等需 **意图识别 + 列举/预览 + 文件夹操作** 的 Agent 能力，**不是**「只允许改编辑器里那一份文档」。

### 〇.1 范围内（In Scope）

| 能力 | 说明 |
|------|------|
| **对话入口** | 工作区绑定 Tab 下的 **Agent / Chat** 对话流（`invoke('ai_chat_stream', …)`）。 |
| **编辑对象** | **当前编辑器打开文档**（`edit_current_editor_document`）、**工作区内其他文件**（`read_file` / `update_file` 等）中与本次对话相关的读写。 |
| **项目整理与归类** | 用户例如「把当前项目里的文档整理归类」：**意图解析** → **预览/列举**（`list_files` / `read_file`）→ **建目录**（`create_folder`）→ **移动归类**（`move_file`）等多步工具链；**属于本方案核心场景**，需 **Intent + 编排 + TaskProgress** 与文件类工具衔接，**不是**能力范围之外。 |
| **任务类型** | 改写、摘要、分析、扩写、多轮工具协作、**经 Diff 预览与用户确认** 的写入；以及 **无正文改写、以目录结构为主的整理任务**（以工具结果与用户可见进度为准）。 |
| **架构关注点** | Intent / 策略池 / 编排 / 执行调度；**Diff 与编辑呈现**（有正文修改时）；**文件操作进度与 continue 语义**（整理类任务，与《代码对齐版》TaskProgress 一致）。 |

### 〇.2 范围外（Out of Scope）

| 能力 | 说明 |
|------|------|
| **非对话类 AI** | **行内补全**、**增强自动完成**、**inline_assist** 等**不经过** `ai_chat_stream` 主对话链路的入口；其优化由**独立文档**约定，本文**不**定义其 Intent/策略池。 |
| **编辑器内核与分页** | t-docx、TipTap 节点模型、**坐标系全链路** 的细节以《精准定位系统》等为准；本文仅在 **Editor/Diff 层** 约定**与之一致的契约**（patch/diff 语义），不重复实现规格。 |
| **Provider 具体实现** | OpenAI / DeepSeek 的 HTTP 字段级差异；本文只约定 **「须支持 tools + tool_calls」** 的**能力前提**，具体修复见《代码现状问题清单》与 Provider 代码。 |

**关于旧稿中「纯文件整理独占流」的澄清（避免误解）**  

此前若写「整理类不纳入策略矩阵主路径」，**易读成「产品不做整理」**——**不正确**。准确含义应为：

- **策略矩阵 §四** 的示例行以 **「单文档/多文档内容改写与摘要」** 为主，是**举例**，**未**穷尽 **「项目整理」** 行；整理类应在矩阵中 **单独成行**（见 **§四** 表内补充）。  
- **验收口径**：整理任务以 **工具链完整执行**（列目录 → 移动/建夹 → 用户可见结果）为准，与「只验收 edit 工具」**不同**，但**同属**本文 **对话 Agent** 范围。  
- 若另有 **仅后台、无对话** 的「同步整理器」类产品，可由 **独立 PRD** 描述；**不**与「用户在聊天里发起项目整理」混为一谈。

### 〇.3 边界交叉时的原则

- **用户主意图是「改某篇文档」** 且同时涉及移动附件/整理目录时：**架构层** 以 **文档编辑** 为主链，文件步骤为 **辅助**（与《代码对齐版》§9.6 一致）。  
- **用户主意图是「整理/归类整个项目文档」** 时：**架构层** 以 **工作区整理** 为主链（`list_files` → `move_file` / `create_folder` 等），`read_file` 为 **预览与决策**；**不与**「编辑优先」机械对立，由 **Intent.action / scope** 或 **显式优先级规则** 区分。  
- **retrieve_context** 允许 `read_file`、列举目录及（未来）工作区搜索，**服务**于「既改内容又整目录」与「只整理不改正文」两类场景。

---

## 一、核心定位（先钉死）

| 维度 | 定义 |
|------|------|
| **在本范围内 Binder 是什么** | **对话驱动的、可控的 AI 文档任务调度系统**（在聊天里把意图变成可执行链，而非仅「聊天补字」）。 |
| **解决的核心问题** | 不是「代替用户写文档」，而是 **把自然语言意图 → 结构化、可审计、可回退的操作链**（**限于** `ai_chat_stream` **这一条对话链路**，含 **改文档** 与 **项目整理**）。 |
| **与「写文档」的关系** | 「写/改」只是 **action 的一类**；另有 **分析、总结、检索、工作区归类整理** 等；正文修改 **经 Diff/确认**；**纯目录/移动类** 以 **工具结果与用户可见进度** 为可控手段（无 Diff 时亦有 `TaskProgress` / continue 语义）。 |

若定位漂移为「让模型更聪明」，实现会无限堆提示词；若定位为 **调度系统**，则 **策略池、权限、链路可见性** 成为一等公民。

---

## 二、总体架构（目标形态）

稳定信息流：

```
用户输入
    ↓
[1] 意图解析层（Intent Layer）
    ↓
[2] 策略选择层（Strategy Layer）
    ↓
[3] 策略编排层（Orchestration Layer）
    ↓
[4] 执行引擎层（Execution Layer）
    ↓
[5] Diff 与编辑呈现层（Editor Layer）
```

**语义说明**：

| 层级 | 职责 | 失败时的表现 |
|------|------|----------------|
| Intent | 人话 → **固定 schema**，禁止仅输出散文 | 下游无法选策略 |
| Strategy | 意图 → **策略池内**有限集合（可组合） | 行为不可预测 |
| Orchestration | 策略 → **有序步骤**（链），可记录 | 无法复现与调试 |
| Execution | **谁执行什么**：LLM 只生成；**写盘/套 Diff 由系统** | 越权改文 |
| Editor/Diff | 用户 **100% 可见、可接受/拒绝** | 信任崩塌 |

---

## 三、六大核心模块（可拆迭代）

### 3.1 意图解析层（Intent Layer）

**目标**：把自然语言变为 **结构化任务定义**，作为全链路的唯一「类型输入」。

**推荐输出结构（须固定 schema，禁止无结构自由文本作为主产物）**：

```typescript
type Intent = {
  action:
    | "edit"
    | "rewrite"
    | "analyze"
    | "summarize"
    | "generate"
    | "transform";
  scope:
    | "selection"
    | "paragraph"
    | "section"
    | "document"
    | "multi_document";
  complexity: 1 | 2 | 3 | 4 | 5;
  precision_required: boolean;
  need_context: boolean;
  expected_steps: number; // 预估最少步数，供编排参考
};
```

**落地方式（混合）**：

- **低复杂度、强模式**：规则 / 轻量分类（关键词 + 否定规则），降低成本与延迟。  
- **高复杂度或歧义**：单次 **LLM 调用**，**强制 JSON / structured output**，失败则降级为「仅对话澄清」或默认 `analyze + need_context=true`。

**关键控制点**：

- 主产物 **不允许** 仅为散文；散文只能作为 **Intent 的辅助说明字段**（可选），不能替代 schema。  
- `precision_required === true` 时，下游 **必须** 走带 **定位/Diff** 的策略（见策略矩阵）。

---

### 3.2 策略池（Strategy Pool）

**系统能力边界的显式枚举**（**不**允许运行时动态发明新策略名，避免不可测试、不可审计）。

**建议 v1 固定 8 项**（名称可映射到内部枚举）：

| 策略 ID | 含义 | 与 Binder 能力的大致对应 |
|---------|------|---------------------------|
| `direct_edit` | 在已知范围内直接改写 | `edit_current_editor_document` 单步、或短链 |
| `rewrite` | 大段重写 | `rewrite` + `document` 或等价 |
| `structured_rewrite` | 结构调整后再写 | 多步 LLM + 最终 diff |
| `summarize` | 摘要 | 对话输出或 `read_file` + 生成 |
| `analyze` | 分析结构/逻辑 | 仅 LLM 输出，**不写盘** |
| `expand` | 扩写 | 生成内容 → **diff_patch** |
| `retrieve_context` | 拉齐上下文 | `read_file`、未来 `search_workspace`、记忆查询 |
| `diff_patch` | 精准局部修改 | `edit_target` / 操作层 + Diff 引擎 |

**原则**：策略池 **版本化**（如 `StrategyPoolV1`）；新增策略走 **评审 + 发版**，与动态 Prompt 里「随意发明步骤」划清界限。

**说明**：用户原稿中的「写文章：plan → generate」在池内可落为：扩展 **`plan_outline`**（v2）或并入 **`generate` 前置步骤**（编排层先 `analyze` 再 `generate`），**v1 可**用 `analyze → generate` 两条策略组合表达，**不**必在第一版就增加第九个策略名。

---

### 3.3 策略选择层（Strategy Selector）

**输入**：`Intent` + 会话元数据（当前打开文件、是否有选区、工作区是否可用等）。  
**输出**：**有序** `Strategy[]`（非空，元素来自策略池）。

**决策逻辑（示例，可规则优先）**：

| 场景（简化） | 策略组合 |
|--------------|----------|
| 「改这句话」 | `[direct_edit]` |
| 「优化这段逻辑，更清晰」 | `[analyze, structured_rewrite, diff_patch]` |
| 「整理几份文档并总结」 | `[retrieve_context, analyze, summarize]` |
| `complexity >= 4` | **至少** 2 步；且包含 `retrieve_context` 或 `analyze` 之一（可配置） |
| `precision_required === true` | **必须**包含 `diff_patch`（或等价精准定位路径） |

**约束**：

- `complexity >= 4` → **禁止**单步直连写盘（除非产品明确「快速模式」开关）。  
- 选择器 **可**用 LLM 辅助，但输出 **须** 被约束为 **策略池 ID 的合法组合**（JSON schema 校验）。

---

### 3.4 策略编排层（Orchestration Layer）

**目标**：把策略列表变成 **可执行链（StrategyChain）**，并驱动多步执行。

**数据结构（示意）**：

```typescript
type StrategyChain = {
  steps: Array<{
    strategy: StrategyId;
    input_ref: string; // 引用上一步或用户/上下文的句柄
    tool?: string;    // 可选：映射到具体 Binder 工具名
  }>;
};
```

**执行模型（v1）**：

- **顺序执行**；上一步的**结构化输出**作为下一步输入（或摘要注入）。  
- **二期**：条件分支、失败回退、重试策略、与 `TaskProgressAnalyzer` 类状态机融合。

---

### 3.5 执行引擎层（Execution Engine）

**原则**：**不是「AI 在执行」**，而是 **系统在调度**；LLM 只承担 **生成与分析** 类步骤。

| 能力类型 | 执行者 |
|----------|--------|
| 文本生成、分析、摘要 | LLM（经 Provider） |
| 文档修改落编辑器 | **系统**：`edit_current_editor_document` / `update_file` 等 |
| 精准替换 | **Diff 引擎**（与 TipTap / 工作区一致） |
| 检索 | **Context 引擎**：`read_file`、索引搜索、记忆服务 |

**与现有代码对齐**：当前 `ai_commands` 中 **工具分发 + `tool_service`** 即执行引擎的雏形；本架构要求把 **「这一步对应策略池哪一步」** 显式化（日志、可观测、可对用户展示）。

---

### 3.6 Diff 与编辑层（Editor Layer）

**护城河**：用户 **始终** 看到「改了什么」，且 **可拒绝/接受**。

**必须具备**：

- 局部替换（非盲目全文覆盖）  
- 高亮差异  
- 用户确认（与现有 diff 卡、pending 机制一致）

**与内部表示**：`patch` / `diff` 结构与《对话编辑内容解析与 Diff 呈现一致性方案》等文档 **对齐**，不另起一套。

---

## 四、策略矩阵（落地资产 · v1）

可在产品/配置中维护为**表格或代码常量**：

| 用户意图（示例） | 策略组合 |
|------------------|----------|
| 改一句话 | `direct_edit` |
| 优化段落 | `analyze → rewrite → diff_patch` |
| 改结构 | `analyze → structured_rewrite`（→ 必要时 `diff_patch`） |
| 总结 | `summarize`（或 `retrieve_context → summarize`） |
| 扩写 | `expand → diff_patch` |
| 多文档总结 | `retrieve_context → analyze → summarize` |
| **项目文档整理归类**（列举 → 预览 → 建夹 → 移动） | `retrieve_context`（`list_files` / `read_file`）→ `analyze`（可选，定规则）→ **编排执行** `create_folder` / `move_file`（多步；与 TaskProgress / `continue_instruction` 对齐，**非**本表「文档改写」主路径但**同属** Agent 能力） |
| 写文章（长文） | `analyze → generate`（v1）；v2 可拆 `plan_outline → generate` |
| 精准修改 | `diff_patch`（常与前序 `analyze` 组合） |

---

## 五、可控性设计（产品差异点）

1. **权限**：AI **不得**绕过系统直接写磁盘或写编辑器 DOM；**不得**自选策略池外名称；**不得**跳过必须步骤（由编排器强制执行）。  
2. **可见链路**：建议 UI 展示「分析中 → 优化中 → 应用修改」等阶段（可与策略链对齐）。  
3. **可回退**：每步基于 **patch/diff** 语义，与现有 accept/reject 一致。  
4. **模式（建议）**：

| 模式 | 行为 |
|------|------|
| 快速 | 允许短链、少分析 |
| 精准 | 多步 + 必 diff |
| 专业 | 展示策略链（调试用或高级用户） |

---

## 六、性能与成本

- **低复杂度**：Intent 判定为 `complexity <= 2` 时，**不走**长链 analyze，可 **直通** `direct_edit` 或单工具。  
- **上下文**：与《代码对齐版》M1 一致——**只注入**当前段落/相关节点/摘要，避免全量 HTML。  
- **缓存**：相同用户指令 + 相同文档版本 → 可缓存 **Intent 或中间分析结果**（需注意失效条件：文档 revision 变化）。

---

## 七、功能模块接口规范与协议（对话编辑）

本节约定 **对话编辑 AI** 各层之间的**契约**：字段名、版本号、错误语义、与现有 Tauri/前后端路径的对应关系。实现时可 **分阶段**：先 **透传/记录**（metadata），再 **强校验**。

### 7.1 总览：链路与契约位置

```
前端 chatStore.sendMessage
  → invoke(ai_chat_stream) ────────────────┐
                                          ▼
                              [Intent / Strategy / Orchestration]（可选中间层）
                                          ▼
                              Provider.chat_stream(stream + tools)
                                          ▼
                              emit(ai-chat-stream)（chunk / tool_call / done）
                                          ▼
                              ToolService.execute → ToolResult
                                          ▼
                              合成 role:user 工具结果消息 → 再 chat_stream
```

**`ai_chat_stream` 入参（对话编辑主协议，与现网对齐；Intent 等扩展字段可增量加入）**

| 参数（camelCase / 前端） | 类型 | 说明 |
|---------------------------|------|------|
| `tabId` | `string` | 聊天 Tab 标识 |
| `messages` | `ChatMessage[]` | 含 system/user/assistant |
| `modelConfig` | `{ model, temperature, top_p, max_tokens }` | 模型配置 |
| `enableTools` | `boolean` | Agent 模式且工作区存在时为 `true` |
| `currentFile` | `string \| null` | 当前编辑器文件 |
| `selectedText` | `string \| null` | 选中文本 |
| `currentEditorContent` | `string \| null` | 逻辑内容 L（见《提示词代码实现梳理》§10.4.2） |
| `editTarget` | `object \| undefined` | 选区 anchor（精确定位） |
| `references` | `ReferenceProtocol[] \| undefined` | 用户 @ 引用 |
| `primaryEditTarget` | `string \| undefined` | 与当前打开文件不一致时的主编辑目标路径 |
| `documentRevision` | `number \| undefined` | 文档修订号 |
| `editorTabId` | `string \| undefined` | 定位用编辑器 Tab |

| 边界 | 协议形态 | 主要落点（仓库） |
|------|-----------|------------------|
| 前端 → 后端 | Tauri `invoke('ai_chat_stream', payload)`；参数见上表 | `chatStore.ts` → `ai_commands::ai_chat_stream` |
| 后端 → 模型 | HTTPS JSON + `tools` + SSE | `deepseek.rs` / `openai.rs` |
| 后端 → 前端（流） | 事件 `ai-chat-stream` | `ai_commands.rs` emit |
| 后端 ↔ 前端（编辑器快照） | `positioning-request-editor-snapshot` / `positioning_submit_editor_snapshot` | `positioning_snapshot.rs` |
| 工具执行 | `ToolCall` / `ToolResult` | `tool_service.rs` |

---

### 7.2 Intent 层（Intent Layer）

**职责**：输出 **固定 schema**，供后续 Selector 使用；**禁止**仅以自然语言作为唯一产物。

**输入（逻辑输入，可与 `ai_chat_stream` 参数合并或派生）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `last_user_text` | `string` | 是 | 末条用户消息**纯文本**（不含 system）；若与引用混排，建议先由前端解析出纯意图句。 |
| `current_file` | `string \| null` | 否 | 当前编辑器文件路径（与 invoke 一致）。 |
| `has_selection` | `boolean` | 否 | 是否有选区 / `edit_target`。 |
| `has_workspace` | `boolean` | 否 | 是否启用 Agent（`enableTools`）。 |

**输出 `IntentRecord`（JSON，须可序列化）**

```json
{
  "schema_version": "1",
  "intent": {
    "action": "edit|rewrite|analyze|summarize|generate|transform",
    "scope": "selection|paragraph|section|document|multi_document",
    "complexity": 1,
    "precision_required": false,
    "need_context": false,
    "expected_steps": 1
  },
  "confidence": 0.0,
  "notes": "optional, human-readable, not for execution"
}
```

**错误语义（建议枚举）**

| 代码 | 含义 | 降级行为 |
|------|------|----------|
| `INTENT_OK` | 解析成功 | 进入 Selector |
| `INTENT_PARSE_FAILED` | 非 JSON / schema 失败 | 不阻塞对话：降级为 `need_context=true` + `complexity=3` 或走仅 LLM |
| `INTENT_AMBIGUOUS` | 需澄清 | 可选：仅回复用户，不进入写工具 |

**版本**：`schema_version` 升级时须**向后兼容**或迁移脚本。

---

### 7.3 策略池与策略选择层（Strategy Pool / Selector）

**策略 ID**（与 §3.2 一致）：固定字符串，**不可**运行时动态生成新 ID。

**建议 Rust 枚举映射（示例）**

```text
direct_edit | rewrite | structured_rewrite | summarize | analyze
| expand | retrieve_context | diff_patch
```

**输出 `SelectorOutput`**

```json
{
  "schema_version": "1",
  "pool_version": "StrategyPoolV1",
  "strategies": ["analyze", "diff_patch"],
  "mode": "rule|llm"
}
```

**校验规则**

- `strategies` 非空；每项 **必须** 在 `StrategyPoolV1` 白名单内。  
- `precision_required === true`（来自 Intent）时，**必须**包含 `diff_patch`（或产品定义的等价名）。

---

### 7.4 策略编排层（Orchestration Layer）

**输出 `StrategyChain`**

```json
{
  "chain_id": "uuid",
  "schema_version": "1",
  "steps": [
    {
      "index": 0,
      "strategy": "analyze",
      "status": "pending|running|done|skipped|failed",
      "input_ref": "optional-handle-to-context",
      "output_ref": "optional-handle",
      "error_code": "optional"
    }
  ]
}
```

**`step.status` 语义**

| 状态 | 含义 |
|------|------|
| `pending` | 未开始 |
| `running` | 当前步骤对应 LLM 调用或工具执行中 |
| `done` | 已产出可传递结果 |
| `skipped` | 规则跳过（如快速模式） |
| `failed` | 失败；由编排决定是否重试或终止链 |

**顺序**：默认 **严格顺序**；二期可扩展分支（见 §3.4）。

---

### 7.5 执行引擎层（Execution Layer）

**策略 → 默认工具/行为映射（对话编辑范围内）**

| 策略 | 默认执行方式 |
|------|----------------|
| `direct_edit` / `rewrite` / `diff_patch` / `expand` | 以 **`edit_current_editor_document`**（打开文档）或 **`update_file`**（未打开文件）落地；**禁止**直接写 DOM。 |
| `structured_rewrite` | 多轮 LLM + 最终一步 `edit_*` 或 diff_patch |
| `retrieve_context` | **`read_file`**；未来扩展 **`search_workspace`**（协议另附） |
| `analyze` / `summarize` | 以 **LLM 文本输出** 为主，**不写盘**；若需引用文件，先 `retrieve_context` |

**`ToolCall`（已有）**

```json
{
  "id": "string",
  "name": "edit_current_editor_document|read_file|update_file|...",
  "arguments": {}
}
```

**`ToolResult`（对话编辑扩展，与《代码对齐版》M4 一致）**

```json
{
  "success": true,
  "data": {},
  "error": null,
  "message": null,
  "error_kind": "retryable|skippable|fatal|null",
  "display_error": null
}
```

| 字段 | 消费方 |
|------|--------|
| `error` | 下一轮 **LLM** messages（模型自修正） |
| `display_error` | **前端** 用户可见文案（中文等） |

---

### 7.6 多轮对话：工具结果回传协议（`role: user` 合成）

与《Binder对话编辑-AI交互优化方案（代码对齐版）》**第四节**一致，目标形态为：

```text
[TOOL_RESULTS]
<tool_name>: SUCCESS|FAILED
  <结构化或截断后的描述>
[/TOOL_RESULTS]

[TASK_STATUS]
task_type: <枚举字符串，如 document_edit|unknown>
completed_operations: <n>
[/TASK_STATUS]

[NEXT_ACTION]
<系统指令：继续/总结/停止，英文或中英约定一致>
[/NEXT_ACTION]
```

**约束**

- 仍为 **单条** `role: user`，避免部分 Provider 不兼容 `role: tool` 多消息。  
- 系统提示（M2）须声明：**`[NEXT_ACTION]` 为系统指令，非用户发言**。

---

### 7.7 Diff 与编辑层（Editor Layer）

**输入**：`edit_current_editor_document` 成功结果中的 `data`（与现网一致）。

**关键字段（逻辑契约）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `diff_area_id` | `string` | 与前端 diff 卡关联 |
| `file_path` | `string` | 目标路径 |
| `old_content` / `new_content` | `string` | 用于预览与接受后应用 |
| `diffs` | `array` | 与 TipTap / 规范 diff 结构一致（见《对话编辑内容解析与 Diff 呈现一致性方案》） |
| `document_revision` | `number`（可选） | 与定位 revision 对齐 |

**前端**：`ToolCallCard` / `diffStore` **消费**上述字段；**不接受**模型直接传入可执行脚本。

---

### 7.8 版本与兼容

| 项 | 约定 |
|----|------|
| `IntentRecord.schema_version` / `StrategyChain.schema_version` | 从 `"1"` 起；破坏性变更递增。 |
| `pool_version` | 如 `StrategyPoolV1`；策略增删走 **发版** 与文档。 |
| **对话编辑范围** | 新增工具（如 `search_workspace`）须在 **执行映射表** 与 **tool_definitions** 同步登记。 |

---

## 八、各模块落地成本（人天量级 · 风险 · 分期）

> **说明**：人天为 **1 名熟悉 Rust/Tauri/前端的工程师** 的粗量级估算，含自测与联调，**不含**大规模重构或专职 QA 全量回归；实际随需求变更浮动 **±30%～50%**。  
> **分期**：**P0** = 与《Binder对话编辑-AI交互优化方案（代码对齐版）》同轨的**可靠性优先**；**P1** = 架构层**轻落地**（元数据、日志、弱约束）；**P2** = **强编排 / 强校验 / 新工具**。

### 8.1 本文档叙事与边界（§〇～§二、§十三）

| 部分 | 交付物 | 人天（约） | 风险 | 分期 |
|------|--------|------------|------|------|
| §〇 适用范围与边界 | 文档共识、与产品对齐 | **0～1**（评审会） | 低 | 持续 |
| §一 核心定位 | 文档 | **0** | 低 | — |
| §二 总体架构 | 文档 | **0** | 低 | — |
| §十三 收束 | 文档 | **0** | 低 | — |

### 8.2 六大核心模块（§三）

| 模块 | 落地内容 | 人天（约） | 风险 | 分期 |
|------|----------|------------|------|------|
| **3.1 Intent 层** | 仅文档 + 枚举定义 | **0.5～1** | 低 | P0（文档） |
| | **规则 + 关键词** 初版解析（Rust 或前端预处理器） | **5～12** | 中 | P1 |
| | **+ LLM 强制 JSON** + schema 校验 + 降级 | **+15～30** | 中高 | P1～P2 |
| **3.2 策略池** | `StrategyPoolV1` 常量/枚举 + 与文档同步 | **1～3** | 低 | P0～P1 |
| **3.3 Strategy Selector** | 纯 **规则表**（与 Intent 映射） | **5～10** | 中 | P1 |
| | **+ LLM 辅助选择** + 白名单校验 | **+10～20** | 中高 | P2 |
| **3.4 Orchestration** | **仅记录** `StrategyChain` 元数据（日志/调试事件，**不**改工具循环顺序） | **5～12** | 中 | P1 |
| | **顺序强制执行**、与 `ai_commands` 工具循环 **融合**、失败回退 | **25～45+** | **高** | P2（慎） |
| | **+** 条件分支 / 与 `TaskProgressAnalyzer` **深度**融合 | **+20～40** | **高** | P2+ |
| **3.5 Execution** | 策略 ID **透传**、结构化日志、可观测字段 | **3～8** | 低～中 | P1 |
| **3.6 Diff / 编辑层** | 与现网一致；文档对齐 + 字段检查 | **1～3** | 低 | P0 |

### 8.3 策略矩阵 · 模式 · 性能（§四～§六）

| 部分 | 落地内容 | 人天（约） | 风险 | 分期 |
|------|----------|------------|------|------|
| §四 策略矩阵 | 配置表/常量，产品可改 | **1～2** | 低 | P0～P1 |
| §五 可控性与模式 | 快速/精准/专业 **UI + 设置持久化** + 与后端标志联动 | **8～18** | 中 | P1～P2 |
| §六 性能与缓存 | Intent/中间结果缓存 + **失效**（revision、tab、会话） | **6～14** | **中**（易错） | P1～P2 |

### 8.4 接口与协议（§七）

| 部分 | 落地内容 | 人天（约） | 风险 | 分期 |
|------|----------|------------|------|------|
| §7.1～7.8 **文档级**协议 | 与现网 `ai_chat_stream`、事件名对齐，**无强制运行时校验** | **2～5**（维护） | 低 | P0 |
| **运行时强校验**（IntentRecord / SelectorOutput / Chain JSON） | 每层失败码、拒绝非法组合 | **12～25** | 中 | P1～P2 |
| **工具回传** `[TOOL_RESULTS]` 等 | 与《代码对齐版》第四节同步改 `ai_commands` | **见 §8.6** | 中 | P0～P1 |

### 8.5 匹配度、落地性、关联文档（§十～§十二）

| 部分 | 落地内容 | 人天（约） | 风险 | 分期 |
|------|----------|------------|------|------|
| §十～§十二 | **文档维护**，无独立代码交付 | **0～1/次迭代** | 低 | 持续 |

### 8.6 与《Binder对话编辑-AI交互优化方案（代码对齐版）》的对照（建议优先实施）

| 模块 | 落地内容 | 人天（约） | 风险 | 分期 |
|------|----------|------------|------|------|
| **M1** 注入策略 | `ContextInfo` 扩展 + 裁剪逻辑 | **8～18** | 中 | **P0** |
| **M2** 系统提示与工具 description | 文案替换、删冗余 | **4～10** | 中（回归） | **P0** |
| **M3** TaskType + continue + `MAX_TOOL_ROUNDS` | `task_progress_analyzer` + `ai_commands` 两处 | **10～22** | 中高 | **P0～P1** |
| **M4** 校验 + `display_error` | `tool_service` + 前端展示 | **8～16** | 中 | **P0～P1** |
| **M5** 分层预留 | 类型/trait 占位 | **2～5** | 低 | P1 |
| **工具回传格式** | 结构化块拼接 | **4～10** | 中 | P0～P1 |

> **整体建议**：**先完成上表（代码对齐版）P0**，再启动本文 §三 **编排强制执行** 类大项；否则易出现 **双轨逻辑** 与 **回归面倍增**。

### 8.7 汇总：按「落地形态」分档

| 档位 | 包含内容 | 人天合计（约） | 说明 |
|------|----------|----------------|------|
| **A. 仅文档 + 策略枚举 + 矩阵常量** | §〇～§四、§七 文档协议、3.2 枚举 | **5～12** | 无强运行时，**最低成本**建立「共同语言」 |
| **B. A + 代码对齐版 P0 + Intent 规则轻量 + 元数据日志** | M1/M2/M3 核心、Orchestration **只记不强制** | **45～95** | **推荐首段交付**，性价比与稳定性平衡 |
| **C. B + LLM Intent + 强校验协议 + 模式 UI** | 全文架构近似落地 | **+60～120** | 周期与风险显著上升 |
| **D. C + 强编排状态机 + 条件分支** | 3.4 全量 + TaskProgress 深融合 | **+40～80+** | **高复杂度区**，建议独立立项 |

---

## 九、开发优先级（建议）

> **与成本关系**：下表「优先级」需与 **§八** 各子节人天及 **§八.7 分档** 一起读；**推荐**优先落实 **§八.6《代码对齐版》**，再扩展本文 §三 强编排类能力。

| 优先级 | 内容 | 对应成本参考 |
|--------|------|----------------|
| **P0** | Intent（基础 schema）+ 策略池 v1（8 个）+ Selector（规则版）+ 与现有 `edit`/`diff` 路径打通；**并与《代码对齐版》M1/M2 及 M3/M4 核心对齐** | §8.2～8.3、§8.6 |
| **P1** | Strategy Chain **元数据记录** → 再 **顺序执行**；Analyze / Structured Rewrite 与工具结果结构化 | §8.2 3.4、§8.4 |
| **P2** | Planner、多文档编排、条件分支、与 `search_workspace` / 记忆查询深度集成；**强编排状态机** | §8.2 3.4、§8.7 档位 D |

---

## 十、与 Binder 项目的匹配度分析

### 10.1 当前实现层面

| 维度 | 现状（概括） | 与本文架构的 gap |
|------|----------------|------------------|
| **Intent / 策略池** | **无**独立模块；意图散落在 **超长 system prompt** 与模型自由发挥中 | 需 **新增** 结构化 Intent（或至少 **结构化中间层**），否则 Selector/Chain **无稳定输入** |
| **策略选择** | 隐式，由模型 + 工具描述决定 | 需 **显式 Selector**（规则或 schema 约束的 LLM） |
| **编排** | `ai_commands` 内 **工具循环 + continue_instruction**，无「策略链」对象 | 可 **渐进**：先把链 **记录为元数据**（日志/UI），再逐步 **强制执行顺序** |
| **执行** | `ToolService` + `edit_current_editor_document` / `read_file` 等 | **高度匹配**，本文 Execution 层 = **强化调度语义**，而非替换引擎 |
| **Diff / 编辑** | TipTap、diffStore、pending、**已有** | **高度匹配**（护城河已在代码中，缺的是 **上层策略与可见性**） |
| **检索** | `read_file` 有；**工作区语义搜索、记忆工具化** 不足 | `retrieve_context` 在 **full 能力**上依赖 **产品补齐工具**（见《代码对齐版》§9 与多轮讨论） |
| **Provider** | DeepSeek 可走 tools；OpenAI 流式 **tools 缺口** | 架构上 **所有链** 都依赖 tools；需与 **Provider 修复** 同步或 **降级策略** |

**结论（实现层）**：**执行层与 Diff 层**与 Binder **强匹配**；**Intent / Strategy / Orchestration** 在代码中 **几乎空白**，属于 **新增抽象层**，但 **可挂载在现有 `ai_chat_stream` 前后** 与 **工具循环内**，不必推倒重写。

---

### 10.2 项目 AI 功能需求层面

| 需求 | 本文是否覆盖 |
|------|----------------|
| **用户可控、可审计** | **是**（策略池 + 编排 + 非直接写盘） |
| **模糊需求 → 可执行链** | **是**（Intent + Selector + Chain） |
| **精准编辑与坐标系** | **是**（`diff_patch` + `precision_required` 与现有 edit_target 对齐） |
| **多文档 / 参考≠当前打开** | **部分**；依赖 `retrieve_context` 与 **`read_file` / 未来 search**；**不是**仅靠架构文档能闭环 |
| **不过度交互** | **可**通过「推断优先 + 一次澄清」在 Orchestration 策略中定义；**需产品句** |
| **与「对话编辑优化（代码对齐版）」关系** | **互补**：代码对齐版修 **提示词、任务感知、校验、回传**；本文修 **任务形态与调度**；**共享** 同一执行与 Diff 栈 |

---

## 十一、落地性评估

| 维度 | 评估 | 说明 |
|------|------|------|
| **量化成本** | **见 §八** | **§八.7** 给出 A～D 四档人天区间；与 **§九** 优先级交叉核对后再立项 |
| **技术可行性** | **高** | 不依赖更换编辑器内核；主要增量在 **Rust 侧调度 + 可选前端阶段 UI** + **schema 约束** |
| **分阶段落地** | **高** | P0 可先 **「只记录 Intent + 策略链元数据」** 而不改执行顺序，风险低；再逐步 **强制链** |
| **与现有方案冲突** | **低** | 《代码对齐版》M1–M5 **应继续**：上下文卫生与策略调度 **正交**；合并时注意 **同一 ContextManager** 注入策略 |
| **主要风险** | **中** | （1）Intent/Selector **误判**导致用户多步；（2）**过度工程**若团队过早上 LangGraph 级编排；（3）**OpenAI 路径**无 tools 时全链降级 |
| **团队成本** | **中** | 需 **产品 + 后端** 对齐策略池与矩阵；**测试**需覆盖策略组合与回归 |
| **时间量级（经验）** | P0 **数周级**（视是否只做元数据 vs 强编排）；P1 **数月级** 与记忆/搜索联动 |

---

## 十二、与关联文档的关系

| 文档 | 关系 |
|------|------|
| `对话编辑-统一整合方案（待确认版）.md`、`层次三（对话编辑）提示词详细分析文档.md` | **同一条执行链**：统一整合方案与提示词主控文档负责对话编辑规则、状态、提示词收口；本文负责任务抽象与调度 |
| `提示词代码实现梳理.md` | 实现细节与 **continue 状态机**；编排层落地时需**对照**避免双套逻辑 |
| `对话编辑-主控设计文档.md` | **diff_patch** 与 **Editor 层** 的底层依据 |
| `代码现状问题清单-经代码核验.md` | baseline、Provider 等 **约束** Orchestration 设计 |

---

## 十三、收束一句话

**要做的事**不是「让模型更聪明」，而是 **让模型在可命名、可组合、可审计的策略边界内工作**；Binder 的 **Diff 与执行引擎** 已是坚实基础，**缺口**主要在 **Intent / 策略池 / 编排** 的显式化——与现有「对话编辑优化」**叠加**而非替代。

---

*文档结束*
