# 上下文注入

## 文档头

- 结构编码：`AST-M-P-01`
- 文档属性：`主结构`
- 主责模块：`AST`
- 文档职责：`上下文注入 / 接口、协议与契约主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `WS-M-D-01`, `AST-M-D-01`, `AST-M-T-01`
- 直接承接：无
- 接口耦合：`AG-M-D-01`, `AG-M-T-04`, `WS-M-D-01`
- 汇聚影响：`CORE-C-R-01`, `AST-M-D-01`, `AST-M-T-01`
- 扩散检查：`AST-M-D-02`, `AST-M-T-02`
- 使用边界：`定义接口、协议与数据契约，不承担模块主规则裁定与开发计划`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L2 / 二级规则文档`
> 文档类型：`接口/协议规则 / 上下文注入主控`
> 当前状态：`Active`
> 受约束于：`A-CORE-C-D-02`、`A-CORE-C-D-05`、`A-AST-M-D-01`、`A-AST-M-D-02`
> 可约束：`AST` 相关注入、裁剪、预算、入口门禁与下游消费文档
> 可用于：`定义注入来源、优先级、预算、裁剪与门禁`
> 不可用于：`重定义当前文档事实层、项目文档层、显式引用、知识检索等共享概念主语义`
> 上游主控：`A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
> 同级协同：`A-AST-M-T-01_记忆模型.md`

## 一、文档定位

本文是记忆上下文系统中的上下文注入统一主规范，定义注入来源、优先级、预算分配、门禁与降级规则。  
本文承接前置协议与交互规范，补齐“注入策略层”。

共享概念约束：
1. `当前文档`、`当前文档事实层`、`当前文件锚点`、`项目文档层` 的主定义以 `A-CORE-C-D-02_产品术语边界.md` 为准。
2. 本文在注入顺序中引用这些概念，但不重新定义其业务边界。

---

## 二、MVP 目标

1. 建立统一的上下文注入顺序，避免不同入口各自拼接。  
2. 建立可执行的注入预算与裁剪规则，避免提示词失控。  
3. 建立注入失败可降级、可观测、不中断主任务的机制。  

---

## 三、注入来源与职责边界

## 3.1 注入来源

1. 用户显式引用（文本、文件、链接、记忆项、知识库条目、模板等）。  
2. 当前编辑上下文（选区、当前文档块列表、光标块、当前文件路径）。  
3. 当前轮 Agent 状态与 artifact（plan、scope、verification、confirmation、risk summary 等）。  
4. 已选模板资产（工作流模板）。  
5. 任务上下文（用户指令、当前轮会话状态、工具执行状态）。  
6. 记忆库检索结果（标签级记忆、项目内容记忆、长期记忆、用户级记忆）。  
7. 知识库检索结果。  
8. 聊天历史摘要。  

## 3.2 责任边界

1. 注入层只负责“传什么、按什么顺序传”，不做任务推理。  
2. 提示词层只负责“如何表达”，不改写注入优先级。  
3. 工具层只消费已注入上下文，不反向决定注入来源。  
4. 工作流模板进入上下文前，必须先完成结构解析与流程编译。  
5. 注入层传递给执行链的模板资产，不是原始模板文本，而是编译后的结构化流程表示。  
6. 知识库中的结构型资产进入上下文时，语义固定为结构参考，不得与工作流模板混层。  

---

## 四、优先级与注入顺序

统一顺序（MVP 固定）：

`当前轮用户目标 > 当前轮 Agent 状态 / artifact / 任务上下文 > 当前文档/选区 > 用户显式引用 > 已选模板资产 > 工作区相关 > 标签级记忆 > 项目内容记忆 > 长期记忆 > 用户级记忆 > 知识库 > 历史摘要`

执行约束：

1. 当前轮用户目标永远优先，不允许被旧轮结论、自动记忆或知识库覆盖。  
2. 当前轮 Agent 状态与 artifact 必须先于自动记忆检索进入上下文。  
3. 当前文档事实层必须先于项目文档层、记忆库、知识库进入上下文。  
4. 用户显式引用永远优先于自动检索结果。  
5. 已选模板资产作为过程约束层进入上下文，但不得替代事实来源。  
6. 已选模板资产进入上下文时，应使用编译后的结构化流程表示，而不是原始模板文本。  
7. 知识库中的结构型资产若进入上下文，应作为结构参考层消费，不得伪装为模板资产。  
8. 记忆库与知识库仅做补强，不得替代引用事实与当前轮现场状态。  
9. 历史对话只保留摘要，不注入全量历史。  

---

## 五、注入预算与裁剪策略

## 5.1 预算分配（MVP 推荐）

1. 当前轮用户目标 + 当前轮 Agent 状态 / artifact / 当前文档：55%  
2. 用户显式引用 + 已选模板资产：20%  
3. 记忆库：10%  
4. 知识库：10%  
5. 历史摘要：5%  

## 5.2 裁剪顺序

1. 先裁剪历史摘要。  
2. 再裁剪知识库结果。  
3. 再裁剪记忆库结果。  
4. 再裁剪已选模板资产中的非关键部分。  
5. 再裁剪工作区补强信息。  
6. 最后才考虑裁剪当前轮 Agent artifact 与任务上下文的非关键部分。  
7. 不裁剪当前轮用户目标、当前文档定位信息和用户显式引用。  
8. 引用注入时必须保留结构化字段（ref_type/source/text_reference），不得将结构化引用拍平为匿名文本片段。  
9. 引用正文仅通过 `references` 协议单通道进入后端，用户消息 `content` 中仅保留 `@{label}` 占位，不展开正文（`A-CORE-C-D-02` §五 第11条）。  

## 5.3 裁剪规则

1. 同来源按相关性与新鲜度排序后裁剪。  
2. 每条注入保留来源标签，禁止匿名文本块。  
3. 裁剪后仍超限时，触发“最小可执行上下文”降级。  

---

## 六、入口门禁与执行链

## 6.1 门禁状态链

1. `targetFileResolved`  
2. `canonicalLoaded`  
3. `blockMapReady`  
4. `contextInjected`  

未满足前置状态时，不得进入工具执行。

## 6.2 入口一致性

1. 三层共享同一优先级原则，但不共享同一上下文主链。  
2. 差异允许出现在“来源可用性”“预算上限”“是否进入 L3 多层装配链”。  
3. 严禁某入口绕过注入层直接拼接私有上下文。  
4. 未明确立项前，层次一、层次二不默认消费标签级对话记忆。  
5. 层次一、层次二不得继承层次三的多层提示词注入结果。  

---

## 七、注入协议（统一数据形态）

每个注入片段必须至少包含：

1. `source_type`  
2. `source_id`  
3. `content`  
4. `priority`  
5. `token_cost_estimate`  
6. `timestamp`  

推荐扩展：

1. `relevance_score`  
2. `scope`（tab/content/workspace/user）  
3. `freshness_status`  
4. `source_label`（格式化来源标签，直接嵌入注入文本）
5. `provenance`（来源溯源路径，供审计使用）
6. `priority_tier`（预算层级：protected/core/augmentation/optional）

统一上下文包最小结构如下：

```ts
interface ContextSlice {
  source_type: string;
  source_id: string;
  content: string;
  priority: number;
  token_cost_estimate: number;
  timestamp: number;
  scope?: 'tab' | 'content' | 'workspace' | 'user';
  // 扩展字段
  relevance_score?: number;
  freshness_status?: string;
  source_label?: string;       // "[标签记忆]" / "[项目内容]" 等
  provenance?: string;         // 来源路径（file_path / tab_id / memory_id）
  priority_tier?: 'protected' | 'core' | 'augmentation' | 'optional';
  is_protected?: boolean;      // true 时永远不被裁剪
}

interface ContextPackage {
  taskId?: string;
  layer: 'l1' | 'l2' | 'l3';
  slices: ContextSlice[];
  totalBudget: number;
  usedBudget: number;
  droppedSources?: string[];
  // 扩展字段
  metadata?: {
    memoryTimedOut: boolean;     // 记忆检索是否超时降级
    memoryItemCount: number;     // 注入的记忆条目数
    truncationApplied: boolean;  // 是否发生过裁剪
    minContextApplied: boolean;  // 是否降级为最小可执行上下文
  };
}
```

**工程落地**：完整 Rust 结构定义见 `A-AST-M-S-04_上下文装配与裁剪规范.md` §一。

---

## 八、失败降级与暴露

## 8.1 降级原则

1. 注入失败不阻塞主任务。  
2. 注入失败时保留“用户引用 + 当前文档”最小执行集。  
3. 降级行为必须记录结构化事件。  

## 8.2 暴露码（注入域）

1. `E_CONTEXT_SOURCE_UNAVAILABLE`  
2. `E_CONTEXT_TIMEOUT`  
3. `E_CONTEXT_BUDGET_EXCEEDED`  
4. `E_CONTEXT_PRIORITY_CONFLICT`  
5. `E_CONTEXT_SCHEMA_INVALID`  

## 8.3 工程模块落位

| 职责 | 前端模块 | 后端模块 | 当前主责任 |
|---|---|---|---|
| 入口上下文采集 | `src/hooks/useAutoComplete.ts`、`src/hooks/useInlineAssist.ts`、`src/stores/chatStore.ts` | `src-tauri/src/commands/ai_commands.rs` | 收集当前文件、选区、会话、引用 |
| 多层上下文装配 | - | `src-tauri/src/services/context_manager.rs` | 组装当前文档、引用、Agent 状态与预算 |
| 记忆检索注入 | `src/services/memoryService.ts` | `src-tauri/src/services/memory_service.rs`、`src-tauri/src/commands/memory_commands.rs` | 提供标签/项目/长期记忆结果 |
| 提示词消费 | `src/stores/chatStore.ts` | `src-tauri/src/commands/ai_commands.rs` | 将 ContextPackage 送入 L1/L2/L3 提示词链 |

## 8.4 标准注入路径

```text
入口层采集 request context
  -> ai_commands.rs 规范化前端字段
  -> [P0 新增] memory_service.search_memories(query, {tabId, workspacePath, limit:10}) [500ms 超时]
  -> [P0 新增] format_memory_for_injection(results) → context_info.memory_augmentation
  -> context_manager.rs 组装 ContextSlice[]
  -> 按 priority_tier 和预算裁剪（Protected > Core > Augmentation > Optional）
  -> 形成 ContextPackage
  -> prompt 构建层消费
```

### 8.4.1 注入时序完整定义

以 L3 层次三（对话编辑）为例：

```
t=0  前端 invoke('ai_chat_stream', {tabId, messages, context, references})
t=1  ai_commands.rs 接收并规范化字段，构建 ContextInfo
t=2  build_memory_query(context_info) 构造检索 query（D-06 规则）
t=3  memory_service.search_memories() 异步检索（500ms 超时）
t=3+Δ  检索完成（或超时降级为空结果）
t=4  format_memory_for_injection() → memory_augmentation 文本
t=5  context_manager.build_prompt_package(context_info, enable_tools)
       L1 governance (SystemPrompt) → 渲染
       L2 task (AgentTaskState) → 渲染
       L4 fact (CurrentDocument) → 渲染
       L5 constraint (ExplicitReference + TemplateAsset) → 渲染
       L6 augmentation (MemoryItem) → 渲染（消费 memory_augmentation 字段）
t=6  provider.chat_stream(system_prompt, messages) → 流式输出
t=7  (后台 spawn) record_usage(memory_ids, tab_id)
t=8  (后台 spawn，若轮次满 5N) memory_generation_task_tab()
```

### 8.4.2 最小可执行上下文定义

当裁剪后仍超过 120% token 预算时，降级为最小可执行上下文：

| 保留的 ContextSlice | 原因 |
|--------------------|------|
| `SystemPrompt` | 角色和规则不可省略 |
| `CurrentGoal`（用户当前消息） | 用户意图不可省略 |
| `CurrentDocument` 中的文件路径行 | 最小定位信息 |
| `ExplicitReference` 的第一条 | 防止用户最新引用被丢弃 |

降级时发出 `E_CONTEXT_BUDGET_EXCEEDED` 暴露码，记录 `warn!` 日志。

**工程落地**：完整裁剪算法见 `A-AST-M-S-04_上下文装配与裁剪规范.md` §四。

## 8.5 裁剪算法骨架

```rust
fn trim_context_slices(mut slices: Vec<ContextSlice>, total_budget: usize) -> ContextPackage {
    slices.sort_by_key(|slice| slice.priority);

    let mut used_budget = 0usize;
    let mut kept = Vec::new();
    let mut dropped = Vec::new();

    for slice in slices {
        if used_budget + slice.token_cost_estimate <= total_budget {
            used_budget += slice.token_cost_estimate;
            kept.push(slice);
        } else {
            dropped.push(slice.source_id);
        }
    }

    ContextPackage {
        task_id: None,
        layer: "l3".to_string(),
        slices: kept,
        total_budget,
        used_budget,
        dropped_sources: Some(dropped),
    }
}
```

## 8.6 关键注入内容设计

层次三注入内容必须优先包含：

1. 当前轮用户目标：`current_turn_goal`
2. 当前轮 Agent 对象：`stage_snapshot`、`active_plan`、`scope`、`verification`、`confirmation`
3. 当前文档定位信息：`current_file`、`selected_text`、`cursor_block_id`、`cursor_offset`
4. 用户显式引用：文件、文本、链接、图片、模板、知识条目
5. 用户显式选择模板：工作流模板
6. 自动补强对象：记忆、知识库、历史摘要

推荐注入文本骨架：

```text
[CurrentGoal]
goal: {current_turn_goal}

[TaskState]
stage: {stage_snapshot}
plan: {active_plan}
scope: {scope_summary}
verification: {verification_summary}
confirmation: {confirmation_summary}

[CurrentDocument]
file: {current_file}
selection: {selected_text}
cursor: {cursor_block_id}:{cursor_offset}

[References]
Reference 1: {ref_type_name} (Source: {source_path})
Position: block {start_block_index} offset {start_offset} - block {end_block_index} offset {end_offset}
Content:
{reference_content}

Reference 2: ...

[Templates]
{template_summaries}

[Augmentation]
{memory_summaries}
{knowledge_summaries}
{history_digest}
```

## 8.7 AI 支持方案与调用方式

| 层次 | 注入入口 | 消费位置 | 当前调用链 |
|---|---|---|---|
| 层次一 | `useAutoComplete.ts` 收集前后文 | `ai_autocomplete` | `invoke('ai_autocomplete')` |
| 层次二 | `useInlineAssist.ts` 收集选区与局部上下文 | `ai_inline_assist` | `invoke('ai_inline_assist')` |
| 层次三 | `chatStore.ts` 收集会话、引用、编辑器状态 | `ContextManager.build_multi_layer_prompt` | `invoke('ai_chat_stream')` |

---

## 九、与其他文档映射

1. 与 `A-AG-M-T-01_ai执行架构.md`：注入层是执行前统一输入编排层。  
2. 与 `A-AG-M-T-02_prompt架构.md`：注入结果进入 prompt 结构化拼装。  
3. 与 `A-AST-M-T-01_记忆模型.md`：记忆模型定义“存什么”，本文定义“怎么注入”。  
4. 与 `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`：`A-AST-M-D-01_Binder Agent记忆协同主控文档.md` 定义“当前轮状态 / 对话记忆 / 记忆库如何协同”，本文负责把协同后的对象按统一顺序注入。  
5. 与 `A-DE-M-P-01_对话编辑提示词.md`：对话编辑场景遵守本文优先级与预算规则。  
6. 与 `A-AG-M-T-04_Binder Agent技术主控文档.md`：Agent 场景中的 plan、artifact、verification、state snapshot 等对象进入上下文时，遵守本文注入优先级与预算规则。  

---

## 十、MVP 验收口径

1. 三个入口（续写/局改/对话编辑）注入顺序一致。  
2. 预算裁剪规则可复现，且显式引用不被裁剪掉关键定位信息。  
3. 注入失败后主任务可继续执行，并产生统一暴露码。  
4. 与 `A-AG-M-T-01_ai执行架构.md`/`A-AG-M-T-02_prompt架构.md`/`A-AST-M-T-01_记忆模型.md`/`A-AST-M-D-01_Binder Agent记忆协同主控文档.md`/`A-DE-M-P-01_对话编辑提示词.md` 文档口径一致。  

---

## 十一、来源映射

1. `R-AG-M-R-08_AI功能前置协议与标准.md`：前置约束、注入优先级、协议基线来源。  
2. `R-AG-M-R-09_AI与其他功能交互规范.md`：上下文交互边界、入口状态与实现现状来源。  
3. `A-AG-M-T-04_Binder Agent技术主控文档.md`：Agent 上下文对象承接口径来源。  
