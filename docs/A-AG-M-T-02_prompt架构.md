# prompt架构

## 文档头

- 结构编码：`AG-M-T-02`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`prompt架构 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`
- 直接承接：`AG-M-P-01`, `AG-X-L-01`
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`, `AG-M-T-01`
- 扩散检查：`AG-M-T-03`, `AG-M-T-04`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：30_capabilities / 03_ai执行系统 / Prompt 架构主控  
> 文档角色：提示词构建控制文档  
> 上游主控：`A-AG-M-T-01_ai执行架构.md`、`A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`  
> 下游专项：`A-DE-M-P-01_对话编辑提示词.md`、`A-DE-M-P-02_辅助续写提示词.md`、`A-DE-M-P-03_局部修改提示词.md`

---

## 一、文档定位与控制权威

### 1.1 文档定位

本文定义 Binder AI 系统的**提示词架构主控口径**。  
本文回答：

1. 三层 AI 功能分别由谁负责构建提示词。
2. 层次三提示词主链应该放在哪、分几层、按什么顺序装配。
3. 当前对话、当前轮任务状态、显式引用、模板、记忆、知识库如何进入提示词。
4. 哪些内容允许跨层共享，哪些内容禁止跨层泄漏。
5. 提示词修改如何做治理、回归与影响评估。

### 1.2 控制权威

本文是提示词构建链的主控文档。  
本文不替代：

1. 各层具体提示词正文文案。
2. 模型厂商参数细节。
3. 具体业务功能的交互规则。

但涉及提示词构建职责边界、跨层泄漏、工具提示注入时，应以本文为准。
层次一/层次二/层次三的具体提示词正文，分别由 `A-DE-M-P-02_辅助续写提示词.md`、`A-DE-M-P-03_局部修改提示词.md`、`A-DE-M-P-01_对话编辑提示词.md` 承接。

---

## 二、适用范围与基本立场

### 2.1 适用范围

1. 层次一：辅助续写
2. 层次二：局部修改
3. 层次三：对话编辑

### 2.2 基本立场

1. 统一提示词架构，不等于统一提示词主链。
2. 三层提示词必须长期保持独立主构建位。
3. Agent 新优化只在明确需要时影响层次一、层次二。
4. ContextManager 只主导层次三，不自动上卷到层次一、层次二。

---

## 三、规则 ID 体系

本文采用统一编码体系：

1. `PR-*`：本文本地规则
2. `BA-*`：复用 Agent 上位规则
3. `DE-*`：如需引用对话编辑专项规则，直接复用原 ID

| 规则域 | 含义 |
|---|---|
| `PR-CORE` | 本文定义的文档定位、统一口径、适用范围规则 |
| `PR-L1` | 层次一提示词主链 |
| `PR-L2` | 层次二提示词主链 |
| `PR-L3` | 层次三提示词主链 |
| `PR-CTX` | 上下文采集与注入规则 |
| `PR-TOOL` | 工具定义注入规则 |
| `PR-GOV` | 本文定义的治理、回归、上下游边界规则 |

### 3.1 规则承接矩阵

| 规则ID | 规则名称 | 本文主定义位置 | 下游承接文档 |
|---|---|---|---|
| PR-CORE-001 | 统一提示词架构不等于统一提示词主链 | 4.1 | 层次一/二/三提示词细化文档 |
| BA-SCENE-005 | 三层 AI 交互必须保持独立触发、独立执行链、独立提示词主链 | 4.2 | `A-AG-M-T-01_ai执行架构.md`、`A-AG-M-D-01_Binder Agent能力描述文档.md` |
| PR-L1-001 | 层次一使用轻量单次构建链 | 5.1 | `A-DE-M-P-02_辅助续写提示词.md` |
| PR-L1-002 | 层次一不引入工具提示和聊天历史 | 5.1 | `A-DE-M-P-02_辅助续写提示词.md` |
| PR-L2-001 | 层次二使用局部修改独立构建链 | 5.2 | `A-DE-M-P-03_局部修改提示词.md` |
| PR-L2-002 | 层次二多轮消息仅服务弹窗局部链 | 5.2 | `A-DE-M-P-03_局部修改提示词.md` |
| PR-L3-001 | 层次三使用多层提示词构建链 | 5.3 | `A-DE-M-P-01_对话编辑提示词.md`、层次三提示词文档 |
| PR-L3-002 | 工具定义只在层次三默认注入 | 5.3 | `A-AG-M-P-01_工具调用体系.md`、`A-DE-M-P-01_对话编辑提示词.md` |
| PR-L3-003 | 当前对话与当前轮任务状态优先于自动记忆与知识补强 | 5.3/6.2 | `A-AST-M-P-01_上下文注入.md`、`A-DE-M-P-01_对话编辑提示词.md` |
| PR-L3-004 | 模板作为约束层进入提示词，不得覆盖事实层和当前对话目标 | 5.3/6.2 | `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`、`A-DE-M-P-01_对话编辑提示词.md` |
| PR-CTX-001 | 上下文按层次采集，不跨层越权注入 | 6.1 | `A-AST-M-P-01_上下文注入.md` |
| PR-CTX-002 | 引用和工作区上下文默认属于层次三增强项 | 6.2 | `A-AST-M-P-01_上下文注入.md`、`A-DE-M-P-01_对话编辑提示词.md` |
| PR-TOOL-001 | 工具定义注入必须与工具 schema 同步 | 7.1 | `A-AG-M-P-01_工具调用体系.md` |
| PR-GOV-001 | 提示词变更必须登记影响层与影响链 | 8.1 | `A-AG-X-L-01_Binder Agent落地开发计划.md` |
| PR-GOV-002 | 变更后必须执行三层回归 | 8.2 | `A-AG-X-L-01_Binder Agent落地开发计划.md` |

### 3.2 编码使用说明

本文采用以下编码原则：

1. `BA-*` 用于复用 Agent 上位规则。
2. `PR-*` 只用于本文首次定义的提示词架构规则。
3. 本文不再为“三层独立性”这类已由 `BA-*` 定义的规则另起本地 ID。

---

## 四、提示词架构总则

## 4.1 统一提示词架构的真实含义

统一提示词架构，只统一以下内容：

1. 提示词构建职责边界。
2. 上下文采集字段命名。
3. 注入链位置。
4. 回归治理口径。

不统一以下内容：

1. 各层系统提示词。
2. 各层上下文裁剪策略。
3. 各层工具提示。
4. 各层消息历史策略。

## 4.2 三层提示词独立性约束

1. 层次一、层次二、层次三各自有主构建位。
2. 不允许把三层全部并入单一构建器。
3. 不允许以统一术语为理由重写各层业务提示词。

---

## 五、三层提示词主链

## 5.1 层次一：辅助续写

### 5.1.1 主链定位

层次一是独立的轻量单次生成链。  
`T-02` 只定义其边界，不承载具体提示词正文。

### 5.1.2 硬约束

1. 单次构建。
2. 不注入工具层。
3. 不注入聊天历史。
4. 不消费层次三的 ContextManager 多层装配链。

### 5.1.3 详细承接位

层次一具体提示词正文、输出协议、案例样式，统一下沉到：

`A-DE-M-P-02_辅助续写提示词.md`

## 5.2 层次二：局部修改

### 5.2.1 主链定位

层次二是独立的局部修改链。  
`T-02` 只定义其边界，不承载具体提示词正文。

### 5.2.2 硬约束

1. 多轮消息只服务弹窗局部链。
2. 不引入对话编辑工具提示。
3. 不默认引入 Diff 主链语义。
4. 不消费层次三的任务态、artifact、gate 语义。

### 5.2.3 详细承接位

层次二具体提示词正文、局部范围协议、输出协议，统一下沉到：

`A-DE-M-P-03_局部修改提示词.md`

## 5.3 层次三：对话编辑

### 5.3.1 主构建位

`context_manager.rs` 多层构建链。

### 5.3.2 构建目标

层次三提示词链必须同时完成四件事：

1. 让模型准确理解当前轮用户目标与当前对话状态。
2. 让模型准确理解当前文档、显式引用与作用范围。
3. 让模型在模板、记忆、知识库的补强下生成更稳定方案，但不被补强层反向主导。
4. 让模型在工具、验证、确认、阶段语义约束下输出可执行结果。

### 5.3.3 输出形态

流式消息 + 条件化工具调用。

### 5.3.4 硬约束

1. 工具定义默认只在本层注入。
2. 当前对话与当前轮任务状态优先于自动记忆与知识补强。
3. 用户显式引用优先于自动检索结果。
4. 用户显式选择的模板作为约束层进入，不得覆盖事实层。
5. 记忆、知识库、模板都只能通过结构化摘要进入，不允许直接拼贴原始长文本。
6. 必须与对话编辑专项规则同步。

### 5.3.5 Agent 结构化输入契约

层次三提示词主链消费的 Agent 上位对象，至少应包含：

1. `current_turn_goal`
2. `stage_snapshot`
3. `active_plan`
4. `active_scope`
5. `verification_summary`
6. `confirmation_ticket` 或 `confirmation_result`
7. `pending_gates`
8. `explicit_references`
9. `selected_templates`
10. `memory_hits`
11. `knowledge_hits`

提示词层只消费系统整理后的结构化摘要，不直接拼接原始运行日志、全量聊天记录或未收口对象。

### 5.3.6 层次三七层提示词结构

层次三提示词主链固定拆为七层：

1. `governance_layer`
2. `task_layer`
3. `conversation_layer`
4. `fact_layer`
5. `constraint_layer`
6. `augmentation_layer`
7. `tool_and_output_layer`

### 5.3.7 七层职责与最佳形态

| 层 | 作用 | 最佳承载内容 | 禁止项 |
|---|---|---|---|
| `governance_layer` | 冻结角色、边界、完成观、禁止项 | system rule、完成判定、确认前置、工具使用红线 | 具体业务事实、聊天历史 |
| `task_layer` | 声明当前轮目标与任务态 | 当前轮目标、stage、plan、scope、verification、confirmation、pending gates | 旧轮噪声、历史闲聊 |
| `conversation_layer` | 保留当前标签近程对话连续性 | 本轮用户消息、上轮 assistant 结论、未决问题、当前问题焦点 | 全量历史照搬 |
| `fact_layer` | 注入当前任务的事实依据 | 当前文档、选区、显式引用文件/文本/链接、工作区必要事实 | 模板方法论、自动记忆猜测 |
| `constraint_layer` | 注入用户选定的约束资产 | 已选工作流模板摘要 | 事实断言、自动覆盖用户目标 |
| `augmentation_layer` | 以补强方式注入自动召回信息 | 标签记忆、项目记忆、知识库结果、历史摘要 | 覆盖当前对话和显式引用 |
| `tool_and_output_layer` | 约束工具与输出协议 | 工具定义、输出 JSON / 流式协议、禁止项、参数示例 | 模糊自然语言要求 |

### 5.3.8 当前对话优先级

层次三提示词链中的优先级冻结为：

`当前轮用户目标 > 当前轮任务状态 > 当前文档与选区 > 用户显式引用 > 用户显式选择模板 > 工作区相关事实 > 标签级记忆 > 项目级记忆 > 知识库补强 > 历史摘要`

冲突处理规则：

1. 自动记忆与知识库不得覆盖当前轮用户目标。
2. 模板不得覆盖当前文档事实与用户显式引用。
3. 历史摘要只能补充上下文，不得推翻当前轮指令。
4. 当前轮 `stage/verification/confirmation` 语义高于旧轮对话结论。

### 5.3.9 记忆、知识库、模板的正确交互

三者进入提示词时必须按不同语义进入不同层：

1. 记忆库：进入 `augmentation_layer`，作用是连续语义补强。
2. 知识库：进入 `augmentation_layer`，作用是事实和资料补强。
3. 模板库：进入 `constraint_layer`，作用是过程约束。

不得误用为：

1. 把模板当成事实来源。
2. 把记忆当成当前任务状态。
3. 把知识库条目当成当前轮确认结果。

### 5.3.10 七层最佳案例

`governance_layer` 最优案例：

```text
[Governance]
你是 Binder Agent。
你必须基于当前轮目标推进任务，而不是复述历史。
高影响改动先形成 candidate 或 diff，再进入 verification / confirmation。
未满足确认前置、scope 不清、gate 未通过时，不得宣称 stage_complete。
```

`task_layer` 最优案例：

```text
[TaskState]
current_turn_goal: 将第三节改写为正式项目汇报语气，只改第三节。
stage_snapshot: review_ready
active_plan: 1.抽取范围 2.生成候选 3.验证 4.确认
active_scope: current_file#section-3
verification_summary: 结构验证通过，事实保留检查通过
confirmation_summary: 待用户确认最终 diff
pending_gates: ["confirmation_ready"]
```

`conversation_layer` 最优案例：

```text
[CurrentConversation]
user_latest: 只改第三节，保留原事实，不要扩写。
assistant_last_committed: 已定位第三节并生成候选 diff，等待确认前不得落终态。
open_questions: 无
```

`fact_layer` 最优案例：

```text
[Facts]
current_document: 项目汇报.docx
selected_section: 第三节 当前原文如下 ...
explicit_references:
- docs/项目背景.md#第三节
- 用户贴入的原始数据表说明
```

`constraint_layer` 最优案例：

```text
[Constraints]
selected_workflow_template: 项目汇报流程-v3，按既定步骤完成信息整理、核对和成稿推进。
```

`augmentation_layer` 最优案例：

```text
[Augmentation]
tag_memory: 当前标签最近两轮都强调“不能改动事实，只改表达方式”。
project_memory: 本项目默认使用季度汇报口径。
knowledge_hits: 知识库条目《项目汇报语体规范》命中 2 条。
history_digest: 先前已否决“全文重写”方案。
```

`tool_and_output_layer` 最优案例：

```text
[ToolsAndOutput]
available_tools:
- edit_current_editor_document
- read_file

output_contract:
- 若需要编辑当前打开文档，优先形成 diff 并走确认链。
- 若只需解释，直接输出自然语言回复。
- 若调用工具，参数必须严格符合 schema。
```

### 5.3.11 层次三标准装配骨架

```rust
fn build_l3_prompt(input: &L3PromptAssemblyInput) -> PromptPackage {
    let governance = build_governance_layer(input);
    let task = build_task_layer(input);
    let conversation = build_conversation_layer(input);
    let facts = build_fact_layer(input);
    let constraints = build_constraint_layer(input);
    let augmentation = build_augmentation_layer(input);
    let tool_and_output = build_tool_and_output_layer(input);

    PromptPackage {
        system: vec![governance, task],
        context: vec![conversation, facts, constraints, augmentation],
        tooling: Some(tool_and_output),
    }
}
```

### 5.3.12 L3PromptAssemblyInput 冻结结构

```ts
interface L3PromptAssemblyInput {
  taskId: string;
  tabId: string;
  currentTurnGoal: string;
  userLatestMessage: string;
  assistantLastCommitted?: string;
  openQuestions?: string[];
  stageSnapshot: {
    state: string;
    reason?: string;
  };
  activePlan?: {
    summary: string;
    steps: Array<{ id: string; title: string; doneWhen: string[] }>;
  };
  activeScope: {
    summary: string;
    targetFile?: string;
    blockRange?: string;
  };
  verificationSummary?: string;
  confirmationSummary?: string;
  pendingGates: string[];
  currentDocument: {
    file: string;
    selection?: string;
    cursor?: string;
    blockSummaries?: string[];
  };
  explicitReferences: Array<{
    sourceType: 'file' | 'text' | 'link' | 'knowledge' | 'template';
    label: string;
    summary: string;
  }>;
  selectedTemplates: Array<{
    kind: 'workflow_template';
    name: string;
    summary: string;
  }>;
  memoryHits: Array<{ level: 'tag' | 'project' | 'workspace' | 'user'; summary: string }>;
  knowledgeHits: Array<{ title: string; summary: string }>;
  historyDigest?: string;
  availableTools: Array<{ name: string; summary: string }>;
}
```

冻结要求：

1. `currentTurnGoal` 是 L3 装配第一优先字段，不允许缺失。
2. `stageSnapshot`、`activePlan`、`activeScope` 由系统对象生成，不允许模型反推。
3. `explicitReferences`、`selectedTemplates`、`memoryHits`、`knowledgeHits` 必须分槽，不允许混合成单一 `references[]`。
4. `availableTools` 必须来自正式工具矩阵过滤后的可见工具集。

### 5.3.13 PromptPackage 冻结结构

```ts
interface PromptPackage {
  system: string[];
  context: string[];
  tooling?: string[];
  outputContract?: string[];
}
```

冻结要求：

1. `system` 只允许承载 `governance_layer` 与 `task_layer`。
2. `context` 只允许承载 `conversation/fact/constraint/augmentation` 四层。
3. `tooling` 只允许承载 `tool_and_output_layer`。
4. 下游 provider 调用前，不得再二次拼接未登记文本块。

### 5.3.14 L3 装配模块落位

| 职责 | 前端模块 | 后端模块 | 输出 |
|---|---|---|---|
| 收集当前轮消息与 tab 状态 | `src/stores/chatStore.ts` | - | `currentTurnGoal`、`userLatestMessage`、`tabId` |
| 收集当前文档与选区摘要 | `src/stores/chatStore.ts` | `src-tauri/src/commands/ai_commands.rs` | `currentDocument` |
| 组装任务态对象 | - | `src-tauri/src/commands/ai_commands.rs` | `stageSnapshot`、`activePlan`、`activeScope` |
| 组装补强对象 | `src/services/memoryService.ts` | `src-tauri/src/services/context_manager.rs` | `memoryHits`、`knowledgeHits`、`historyDigest` |
| 组装模板约束 | - | `src-tauri/src/services/context_manager.rs` | `selectedTemplates` |
| 过滤工具可见集 | - | `src-tauri/src/services/tool_matrix.rs`、`src-tauri/src/services/tool_definitions.rs` | `availableTools` |
| 生成 PromptPackage | - | `src-tauri/src/services/context_manager.rs` | `PromptPackage` |

### 5.3.15 层次三装配执行路径

```text
chatStore.sendMessage
  -> ai_commands.rs 规范化当前轮请求
  -> build_l3_prompt_input
  -> context_manager.rs::build_l3_prompt_package
  -> provider.chat_stream(prompt_package)
  -> tool_call / text_delta / verification / confirmation 事件回流
```

### 5.3.16 设计评审否决条件

以下任一情况成立，都应直接否决：

1. L3 装配输入缺少 `currentTurnGoal`。
2. 记忆、知识库、模板仍以单一 `references` 槽混合注入。
3. provider 调用前仍临时追加“隐式系统提示”。
4. `availableTools` 直接等于实现全量工具，而不是过滤后的模型可见工具集。
5. `conversation_layer` 使用全量聊天历史代替摘要和当前轮焦点。

---

## 六、上下文采集与注入规则

## 6.1 通用规则

1. 上下文按层次采集，不跨层越权注入。
2. 字段命名允许统一，但语义归属不得混淆。
3. 当前对话优先级必须显式体现在提示词装配顺序中。
4. L1/L2 只消费各自独立上下文，不得隐式继承 L3 的多层装配结果。

统一注入包最小结构如下：

```ts
interface PromptContextPackage {
  layer: 'l1' | 'l2' | 'l3';
  currentTurnGoal?: string;
  conversationDigest?: string;
  currentDocumentSummary?: string;
  selectionSummary?: string;
  stageSnapshotSummary?: string;
  activePlanSummary?: string;
  scopeSummary?: string;
  verificationSummary?: string;
  confirmationSummary?: string;
  explicitReferenceSummaries?: string[];
  selectedTemplateSummaries?: string[];
  memorySummaries?: string[];
  knowledgeSummaries?: string[];
  pendingGateSummaries?: string[];
}
```

## 6.2 分层上下文规则

| 层次 | 默认上下文 | 默认不注入内容 |
|---|---|---|
| 层次一 | 光标上下文、格式信息 | 工具定义、聊天历史、工作区引用 |
| 层次二 | instruction、局部文本、局部上下文、弹窗 messages | 工具定义、对话编辑全链历史 |
| 层次三 | 当前轮目标、任务态、当前对话、当前文档、显式引用、模板、记忆、知识库、工具定义 | 全量历史原文、未裁剪运行日志 |

层次三注入优先级冻结为：

1. `current_turn_goal`
2. `stage / plan / scope / verification / confirmation`
3. `current_document / selection`
4. `explicit_references`
5. `selected_templates`
6. `workspace_related_facts`
7. `tag_memory / project_memory`
8. `knowledge_hits`
9. `history_digest`

## 6.4 构建链模块落位

| 层次 | 前端主构建位 | 后端主构建位 | 调用命令 |
|---|---|---|---|
| 层次一 | `src/hooks/useAutoComplete.ts` | `src-tauri/src/commands/ai_commands.rs::ai_autocomplete` | `invoke('ai_autocomplete')` |
| 层次二 | `src/hooks/useInlineAssist.ts` | `src-tauri/src/commands/ai_commands.rs::ai_inline_assist` | `invoke('ai_inline_assist')` |
| 层次三 | `src/stores/chatStore.ts` | `src-tauri/src/services/context_manager.rs` + `src-tauri/src/commands/ai_commands.rs::ai_chat_stream` | `invoke('ai_chat_stream')` |

## 6.5 PromptContextPackage 装配骨架

```rust
fn build_prompt_context_package(ctx: &ContextInfo, stage: Option<&AgentStageSnapshot>) -> PromptContextPackage {
    PromptContextPackage {
        layer: "l3".to_string(),
        current_turn_goal: ctx.current_turn_goal.clone(),
        conversation_digest: ctx.conversation_digest.clone(),
        current_document_summary: ctx.current_file.clone(),
        selection_summary: ctx.selected_text.clone(),
        stage_snapshot_summary: stage.map(|s| format!("{:?}", s.state)),
        active_plan_summary: stage.and_then(|_| ctx.active_plan_summary.clone()),
        scope_summary: ctx.scope_summary.clone(),
        verification_summary: ctx.verification_summary.clone(),
        confirmation_summary: ctx.confirmation_summary.clone(),
        explicit_reference_summaries: Some(ctx.references.iter().map(|r| r.source.clone()).collect()),
        selected_template_summaries: ctx.selected_templates.clone(),
        memory_summaries: ctx.memory_hits.clone(),
        knowledge_summaries: ctx.knowledge_hits.clone(),
        pending_gate_summaries: ctx.pending_gates.clone(),
    }
}
```

## 6.3 Agent 新优化的层次影响

| 层次 | 当前允许吸收的优化 | 当前不应改动的部分 |
|---|---|---|
| 层次一 | 统一术语、字段命名、必要上下文采集增强 | 不改为多阶段提示词，不引入工具提示 |
| 层次二 | 更清晰的 scope/约束表述、局部确认语义 | 不改为对话编辑提示词，不默认引入 Diff/工具主链提示 |
| 层次三 | 七层提示词装配、当前对话优先级、模板/记忆/知识库分层注入 | 仍需遵守层次三专项规则 |

---

## 七、工具定义注入规则

## 7.1 默认注入规则

1. 工具定义默认只在层次三注入。
2. 任何想把工具定义带入层次一或层次二的设计，都必须单独决策和单独立项。

## 7.2 注入同步规则

1. 工具 schema 变化，工具提示必须同步。
2. 工具提示变化，不得改变运行时工具契约。

## 7.3 AI 支持方案与调用方式

| 层次 | AI 能力 | 调用方式 | 模型形态 | 当前模块 |
|---|---|---|---|---|
| 层次一 | 单次续写生成 | `invoke('ai_autocomplete')` | 快速 completion / chat | `useAutoComplete.ts` + `ai_commands.rs` |
| 层次二 | 局部改写 / 局部对话 | `invoke('ai_inline_assist')` | 单轮 chat | `useInlineAssist.ts` + `ai_commands.rs` |
| 层次三 | 流式对话 + 可选工具调用 | `invoke('ai_chat_stream')` | streaming chat + tool definitions | `chatStore.ts` + `context_manager.rs` + `ai_commands.rs` |

---

## 八、提示词治理与回归

## 8.1 变更登记规则

每次提示词变更必须登记：

1. 影响层
2. 影响链路
3. 是否影响工具提示
4. 是否影响上下文字段
5. 是否影响 `stage/artifact/verification/confirmation/gate` 注入语义

## 8.2 回归规则

变更后必须执行：

1. 层次一回归
2. 层次二回归
3. 层次三回归
4. 跨层命名一致性检查

## 8.3 提示词治理否决条件

以下情况应直接否决：

1. 未登记影响层就修改主提示词。
2. 以统一为名合并三层主构建器。
3. 层次一、层次二默认接入层次三工具提示。

---

## 九、与上下游文档的控制关系

| 文档 | 关系 |
|---|---|
| `A-AG-M-T-01_ai执行架构.md` | `A-AG-M-T-01_ai执行架构.md` 定义总体执行分层，本文承接提示词子架构 |
| `A-AG-M-P-01_工具调用体系.md` | 本文定义工具提示协作口径，`A-AG-M-P-01_工具调用体系.md` 定义运行时契约 |
| `A-AG-M-T-03_任务规划执行.md` | `A-AG-M-T-03_任务规划执行.md` 定义任务闭环，不直接改写提示词主链 |
| `A-AST-M-P-01_上下文注入.md` | 定义注入顺序、预算和裁剪，本文定义提示词层消费顺序和分层角色 |
| `A-AST-M-D-01_Binder Agent记忆协同主控文档.md` | 定义记忆协同边界，本文规定记忆只作为 augmentation layer 进入 L3 |
| `A-AST-M-D-02_Binder Agent知识库协同主控文档.md` | 定义知识库协同边界，本文规定知识库只作为资料补强进入 L3 |
| `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` | 定义模板协同边界，本文规定模板只作为 constraint layer 进入 L3 |
| `A-DE-M-P-01_对话编辑提示词.md` | 层次三具体提示词治理承接位 |
| `A-DE-M-P-02_辅助续写提示词.md` | 层次一具体提示词治理承接位 |
| `A-DE-M-P-03_局部修改提示词.md` | 层次二具体提示词治理承接位 |
| `A-AG-M-D-01_Binder Agent能力描述文档.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md` | 提供 Agent 上位语义，本文负责消费这些语义进入提示词构建链 |

---

## 十、MVP 验收口径

1. 三层提示词主链独立存在。
2. `T-02` 不再混放 L1/L2 具体提示词正文。
3. ContextManager 不越界到层次一、层次二。
4. 层次三七层提示词结构、优先级和交互关系可独立解释。
5. 工具提示默认只在层次三注入。
6. 提示词变更具备影响登记与回归口径。

---

## 十一、来源映射

1. `R-AG-M-R-12_AI功能三层架构设计.md`
2. `R-AG-M-R-05_AI功能需求文档.md`
3. `R-AG-M-R-06_AI功能需求协议.md`
4. `A-AG-M-D-01_Binder Agent能力描述文档.md`
5. `A-AG-M-T-04_Binder Agent技术主控文档.md`
6. `A-DE-M-P-01_对话编辑提示词.md`
