# Binder Agent工具矩阵

## 文档头

- 结构编码：`AG-M-P-02`
- 文档属性：`主结构`
- 主责模块：`AG`
- 文档职责：`Binder Agent工具矩阵 / 工具目录、场景覆盖与开放策略主控`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `AG-M-T-01`, `AG-M-T-04`, `AG-M-P-01`
- 直接承接：`AG-X-L-01`, `DE-M-D-01`, `AST-M-D-01`, `AST-M-D-02`, `TMP-M-D-01`, `WS-M-T-05`
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`, `ED-M-T-04`, `WS-M-T-03`, `WS-M-T-04`
- 汇聚影响：`CORE-C-R-01`, `AG-M-P-01`, `AG-M-T-01`, `AG-M-T-02`, `AG-M-T-03`, `AG-M-T-04`
- 扩散检查：`AG-X-L-01`, `DE-M-D-01`
- 使用边界：`定义模型可调用工具目录、场景覆盖、风险分级与开放策略，不替代运行时协议和具体工具实现`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档层级：30_capabilities / 03_ai执行系统 / Agent 工具矩阵主控
> 文档角色：模型可调用工具目录与场景覆盖控制文档
> 上游主控：`A-AG-M-P-01_工具调用体系.md`、`A-AG-M-T-04_Binder Agent技术主控文档.md`
> 调研参考：`R-AG-M-R-07_主流Agent工具矩阵调研.md`

---

## 一、文档定位与控制权威

### 1.1 文档定位

本文定义 Binder Agent 中“模型可调用的工具矩阵”。
本文回答：

1. 哪些能力应该作为模型工具暴露。
2. 哪些能力不应做成模型工具，而应留在 context / resource / prompt / system guard。
3. Binder 为覆盖全部 Agent 场景，需要什么样的工具分类和最小矩阵。
4. 每类工具的层次开放策略、风险等级、确认要求和 artifact / verification / stage 影响是什么。

### 1.2 控制权威

本文是工具目录与场景覆盖的主控文档。
本文不替代：

1. `A-AG-M-P-01_工具调用体系.md` 的运行时协议。
2. 某个具体工具的代码实现。
3. 具体提示词文案。

但凡涉及以下问题，必须以本文为准：

1. 模型可调用工具列表
2. 工具分类与场景覆盖
3. 分层开放策略
4. 风险等级与确认要求

### 1.3 为什么必须单独成文

如果没有独立工具矩阵文档，会出现三个问题：

1. 工具清单只存在于 `tool_definitions.rs`，代码现状会被误读为最终架构。
2. 工具是否暴露给模型，无法和场景、风险、确认、artifact 语义联动治理。
3. 新增工具时无法判断是在补全 Binder 能力，还是在无边界扩张通用 Agent 能力。

---

## 二、工具矩阵的设计边界

### 2.1 不是所有能力都应做成模型工具

Binder 中的能力必须拆成三类：

1. `model_callable_tool`：允许模型在上下文内自主选择并调用。
2. `system_managed_resource`：由系统装配给模型，不允许模型主动执行。
3. `user_selected_prompt_or_command`：由用户显式触发，不属于模型工具目录。

### 2.2 Binder 的产品约束

Binder 不是通用桌面代理，也不是通用 DevOps 代理。  
Binder 的 Agent 工具矩阵必须优先服务：

1. 文档理解与工作区检索
2. 当前编辑器内的结构化改写
3. 工作区文件与资源管理
4. 验证、确认、沉淀前后的结构化对象流转

以下能力当前不应成为默认暴露工具：

1. 原始 bash
2. 无限制代码执行
3. 通用 computer use
4. 直接写入最终业务状态

### 2.3 Binder 的正确工具观

对 Binder 来说，正确的工具矩阵不是“工具越多越强”，而是：

1. 场景覆盖完整
2. 工具职责单一
3. schema 稳定
4. 高影响调用可确认
5. artifact / verification / stage 可回流

---

## 三、主流 Agent 工具矩阵调研结论

调研基线日期：`2026-04-05`

### 3.1 主流方案的共同收敛

综合 OpenAI、Anthropic、Google Gemini、MCP 的当前公开文档，主流 Agent 工具体系已经收敛到以下几类：

1. 检索与 grounding：`web search`、`file search`、URL / resource context
2. 自定义函数 / 业务 API：稳定 schema 的 function calling
3. 文件 / 编辑工具：text editor、文件读写、工作区修改
4. 计算 / 沙箱：code execution
5. 外部能力扩展：remote MCP / server tools / third-party connectors
6. 高风险环境代理：computer use、shell、bash

### 3.2 对 Binder 的直接启发

主流方案的共同点，不是“都给模型 raw shell”，而是：

1. 工具目录独立治理
2. tool schema 明确
3. 模型可调能力与系统资源能力分离
4. 高风险工具有人在环

Binder 因为是文档与工作区产品，应优先采用：

1. 文档/工作区定制工具
2. 结构化编辑工具
3. 检索与引用增强
4. 明确 confirmation / gate 的高影响写入链

而不是优先引入：

1. raw bash
2. 通用 computer use
3. 无边界代码执行

---

## 四、Binder Agent 场景覆盖图

### 4.1 场景分段

Binder Agent 的完整主链可拆成三段：

1. 左段：理解、检索、规划、范围判定
2. 中段：候选生成、局部改写、文件修改、diff 形成
3. 右段：验证、确认、沉淀、后续复用

### 4.2 场景对工具类型的需求

| 场景段 | 主要目标 | 优先工具类型 | 不应优先工具类型 |
|---|---|---|---|
| 左段 | 读懂当前任务、定位对象、收集上下文 | 工作区读工具、引用检索工具、关系图工具 | 高风险写工具、raw shell |
| 中段 | 形成 candidate / diff / 文件变更 | 编辑器内编辑工具、文件写工具、结构化变更工具 | 通用 computer use |
| 右段 | 形成 verification / confirmation / seed | 结构化沉淀工具、依赖/模板/记忆写入工具 | 直接 state 改写工具 |

### 4.3 哪些能力不应作为模型工具

以下对象应由系统管理，而不是作为模型工具直接开放：

1. `stage_transition`
2. `verification_record` 的最终判定
3. `confirmation_result`
4. UI 层状态写入
5. Diff 接受态最终落库

这些对象可以由工具结果影响，但不能被模型直接写死。

---

## 五、Binder 推荐工具分类

## 5.1 分类总表

| 类别 | 说明 | 是否默认暴露给模型 | 当前优先级 |
|---|---|---|---|
| `workspace_read` | 文件读取、目录浏览、工作区搜索 | 是 | P0 |
| `workspace_write` | 新建、更新、移动、重命名、删除 | 是，但高影响动作需确认 | P0 |
| `editor_structured_edit` | 当前编辑器内结构化改写 | 是 | P0 |
| `workspace_graph` | 文件依赖、引用关系、资源关系读取/写入 | 是 | P0 |
| `reference_retrieval` | 记忆、知识库、模板、引用检索 | 是 | P1 |
| `artifact_deposition` | memory seed、template seed、report seed 等沉淀 | 是，但需门禁 | P1 |
| `external_grounding` | web search、remote MCP、外部 connector | 否，按场景开 | P2 |
| `sandbox_compute` | 受限代码执行 / 转换任务 | 否，按专项立项 | P2 |
| `computer_use` | 桌面级 UI 代理 | 否 | 禁止默认接入 |
| `raw_shell` | 原始命令执行 | 否 | 禁止默认接入 |

## 5.2 当前实现已经具备的工具

| 工具名 | 分类 | 当前状态 | 说明 |
|---|---|---|---|
| `read_file` | `workspace_read` | 已实现 | 读取文件内容 |
| `list_files` | `workspace_read` | 已实现 | 浏览目录 |
| `search_files` | `workspace_read` | 已实现 | 文件名/路径搜索 |
| `create_file` | `workspace_write` | 已实现 | 新建文件 |
| `update_file` | `workspace_write` | 已实现 | 更新未打开文件 |
| `delete_file` | `workspace_write` | 已实现 | 删除文件/目录，高风险 |
| `move_file` | `workspace_write` | 已实现 | 移动文件/目录 |
| `rename_file` | `workspace_write` | 已实现 | 重命名 |
| `create_folder` | `workspace_write` | 已实现 | 新建目录 |
| `edit_current_editor_document` | `editor_structured_edit` | 已实现 | 编辑当前打开文档，关键工具 |
| `save_file_dependency` | `workspace_graph` | 已实现 | 保存文件依赖关系 |

## 5.3 当前缺失但应进入 Binder 矩阵的工具

以下工具不是“可有可无优化”，而是补齐 Binder Agent 全链路的重要缺口：

| 推荐工具名 | 分类 | 优先级 | 缺口说明 |
|---|---|---|---|
| `search_workspace_content` | `workspace_read` | P0 | 当前只有文件名/路径搜索，没有内容级检索 |
| `read_workspace_graph` | `workspace_graph` | P0 | 当前能写依赖，但缺图结构读取工具 |
| `query_memory_entries` | `reference_retrieval` | P1 | 右段沉淀和跨轮复用缺检索入口 |
| `query_knowledge_base` | `reference_retrieval` | P1 | 知识库协同主控已有，但缺模型工具位 |
| `query_template_library` | `reference_retrieval` | P1 | 模板协同已有，但缺模型可调用检索位 |
| `save_memory_seed` | `artifact_deposition` | P1 | 当前只能形成 artifact，缺正式沉淀工具 |
| `save_template_seed` | `artifact_deposition` | P1 | 模板生成后缺入库动作 |
| `create_report_seed` | `artifact_deposition` | P1 | 右段报告/沉淀类结果缺结构化出口 |

### 5.4 不建议默认纳入矩阵的能力

| 能力 | 原因 |
|---|---|
| `bash` / `shell` | 与 Binder 的文档中心产品定位不匹配，风险过高 |
| `computer_use` | 对桌面 UI 的操作面过大，缺确定性和可解释性 |
| 通用 `code_execution` | 需要独立沙箱、安全预算和结果治理，当前不是核心闭环 |
| 直接 `transition_stage` | 会破坏 system guard 与 human confirmation |

---

## 六、Binder 正式工具矩阵

## 6.1 矩阵字段定义

```ts
type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ToolExposureMode = 'default_on' | 'scenario_gated' | 'disabled';
type ToolLifecycle = 'implemented' | 'planned_p0' | 'planned_p1' | 'planned_p2' | 'rejected';

interface ToolMatrixEntry {
  name: string;
  category: string;
  lifecycle: ToolLifecycle;
  exposureMode: ToolExposureMode;
  allowedLayers: Array<'l1' | 'l2' | 'l3' | 'build_mode'>;
  supportedScenes: string[];
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  emitsArtifact: boolean;
  affectsVerification: boolean;
  affectsStage: boolean;
  ownerModule: string;
}
```

## 6.2 推荐矩阵

| 工具名 | 生命周期 | 开放方式 | 允许层次 | 风险 | 确认 | artifact / verification / stage |
|---|---|---|---|---|---|---|
| `read_file` | `implemented` | `default_on` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `list_files` | `implemented` | `default_on` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `search_files` | `implemented` | `default_on` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `search_workspace_content` | `planned_p0` | `default_on` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `create_file` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `medium` | 视场景而定 | 是 / 否 / 否 |
| `create_folder` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `medium` | 否 | 是 / 否 / 否 |
| `update_file` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `high` | 是 | 是 / 是 / 是 |
| `move_file` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `high` | 是 | 是 / 否 / 否 |
| `rename_file` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `medium` | 是 | 是 / 否 / 否 |
| `delete_file` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `critical` | 是 | 是 / 是 / 是 |
| `edit_current_editor_document` | `implemented` | `default_on` | `l3` | `high` | 是 | 是 / 是 / 是 |
| `save_file_dependency` | `implemented` | `scenario_gated` | `l3`, `build_mode` | `medium` | 否 | 是 / 否 / 否 |
| `read_workspace_graph` | `planned_p0` | `default_on` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `query_memory_entries` | `planned_p1` | `scenario_gated` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `query_knowledge_base` | `planned_p1` | `scenario_gated` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `query_template_library` | `planned_p1` | `scenario_gated` | `l3`, `build_mode` | `low` | 否 | 否 / 否 / 否 |
| `save_memory_seed` | `planned_p1` | `scenario_gated` | `l3`, `build_mode` | `medium` | 是 | 是 / 否 / 否 |
| `save_template_seed` | `planned_p1` | `scenario_gated` | `l3`, `build_mode` | `medium` | 是 | 是 / 否 / 否 |
| `create_report_seed` | `planned_p1` | `scenario_gated` | `l3`, `build_mode` | `medium` | 否 | 是 / 否 / 否 |
| `web_search` | `planned_p2` | `scenario_gated` | `l3`, `build_mode` | `medium` | 否 | 否 / 否 / 否 |
| `remote_mcp_tool` | `planned_p2` | `scenario_gated` | `l3`, `build_mode` | `high` | 视 connector 而定 | 视工具而定 |

### 6.3 对 L1 / L2 的明确边界

以下规则冻结：

1. 层次一不暴露任何模型工具。
2. 层次二不默认暴露 Binder Agent 工具矩阵。
3. 若未来层次二接入工具，只能接入局部、低风险、明确范围的专项工具，不得直接复用 L3 全量矩阵。

---

## 七、工具暴露规则

## 7.1 模型可见工具集生成规则

模型可见工具集不得直接等于“系统实现的全部工具”。  
必须按以下条件裁剪：

1. 当前层次
2. 当前场景
3. 当前任务阶段
4. 当前风险预算
5. 当前上下文是否足以支撑安全调用

### 7.2 暴露裁剪代码骨架

```rust
pub fn build_model_visible_tools(ctx: &ToolExposureContext) -> Vec<ToolDefinition> {
    tool_matrix()
        .into_iter()
        .filter(|entry| entry.exposure_mode != ToolExposureMode::Disabled)
        .filter(|entry| entry.allowed_layers.contains(&ctx.layer))
        .filter(|entry| scene_matches(entry, &ctx.scene))
        .filter(|entry| risk_allowed(entry, ctx))
        .map(|entry| build_tool_definition(entry))
        .collect()
}
```

### 7.3 暴露裁剪上下文

```ts
interface ToolExposureContext {
  layer: 'l1' | 'l2' | 'l3' | 'build_mode';
  scene: 'plan' | 'execute' | 'verify' | 'confirm' | 'deposit';
  stageState: string;
  scopeSummary: string;
  allowExternalTools: boolean;
}
```

---

## 八、关键节点规则

## 8.1 高影响写工具规则

以下工具一律视为高影响写工具：

1. `update_file`
2. `delete_file`
3. `move_file`
4. `edit_current_editor_document`
5. `save_memory_seed`
6. `save_template_seed`

这些工具必须满足：

1. 有明确 scope
2. 有 artifact
3. 能回流 verification 或 confirmation 信息
4. 不得直接跳过 `confirm -> transition`

## 8.2 读工具规则

读工具应满足：

1. 默认低风险
2. 不改写业务状态
3. 返回结果可进入 context package 或 tool result

## 8.3 沉淀类工具规则

memory / knowledge / template 相关工具必须区分：

1. `query_*`：检索类，可直接暴露
2. `save_*_seed`：沉淀类，高于检索类风险
3. 最终入库动作：必须经确认或 system policy

---

## 九、工程模块设计

## 9.1 工程模块落位

| 模块 | 责任 |
|---|---|
| `src-tauri/src/services/tool_definitions.rs` | 输出模型可见 `ToolDefinition[]` |
| `src-tauri/src/services/tool_service.rs` | 执行具体工具 |
| `src-tauri/src/services/tool_call_handler.rs` | 执行重试与门禁 |
| `src-tauri/src/services/tool_matrix.rs` | 存放正式 `ToolMatrixEntry[]` 与过滤逻辑 |
| `src-tauri/src/services/tool_policy.rs` | 计算当前层次 / 场景下的暴露策略 |
| `src/stores/chatStore.ts` | 消费 tool_call 事件与结果 |
| `src/components/Chat/ToolCallCard.tsx` | 展示调用状态、确认提示、错误与结果 |

## 9.2 推荐代码结构

```rust
pub enum ToolCategory {
    WorkspaceRead,
    WorkspaceWrite,
    EditorStructuredEdit,
    WorkspaceGraph,
    ReferenceRetrieval,
    ArtifactDeposition,
    ExternalGrounding,
}

pub struct ToolMatrixEntry {
    pub name: &'static str,
    pub category: ToolCategory,
    pub lifecycle: ToolLifecycle,
    pub exposure_mode: ToolExposureMode,
    pub risk_level: ToolRiskLevel,
    pub requires_confirmation: bool,
    pub allowed_layers: &'static [AiLayer],
}
```

## 9.3 工具矩阵与运行时的分工

1. `tool_matrix.rs` 决定“应不应该暴露”
2. `tool_definitions.rs` 决定“暴露给模型的 schema 长什么样”
3. `tool_service.rs` 决定“工具怎么执行”
4. `tool_call_handler.rs` 决定“失败、重试、门禁怎么处理”

---

## 十、阶段化落地顺序

### 10.1 P0

必须完成：

1. 把当前已实现工具全部登记到正式矩阵
2. 新增 `search_workspace_content`
3. 新增 `read_workspace_graph`
4. 把高影响工具的 confirmation / artifact / stage 回流补齐

### 10.2 P1

建议完成：

1. `query_memory_entries`
2. `query_knowledge_base`
3. `query_template_library`
4. `save_memory_seed`
5. `save_template_seed`
6. `create_report_seed`

### 10.3 P2

按专项立项决定：

1. `web_search`
2. `remote_mcp_tool`
3. 受限 `sandbox_compute`

---

## 十一、设计评审否决条件

以下任一情况成立，都应视为不符合 Binder Agent 工具矩阵要求：

1. 工具只在代码里存在，未进入正式矩阵。
2. 工具没有分类、风险等级和开放策略。
3. 高影响写工具没有 confirmation 规则。
4. 把 system resource 或 business state 直接当成模型工具开放。
5. 为了追求“通用 Agent 能力”而默认引入 raw shell 或 computer use。

---

## 十二、MVP 验收口径

1. Binder 已有工具全部进入正式矩阵。
2. 工具矩阵能覆盖左段、中段、右段主要 Agent 场景。
3. 模型可见工具集不再直接等于实现全集。
4. 高影响工具具备 scope、artifact、verification、confirmation 协同。
5. 文档足以指导后续开发计划和工具扩展评审。

---

## 十三、来源与参考

1. `R-AG-M-R-07_主流Agent工具矩阵调研.md`
2. `A-AG-M-P-01_工具调用体系.md`
3. `A-AG-M-T-04_Binder Agent技术主控文档.md`
4. `A-DE-M-D-01_对话编辑统一方案.md`
5. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
6. `A-AST-M-D-02_Binder Agent知识库协同主控文档.md`
7. `A-TMP-M-D-01_Binder Agent模板协同主控文档.md`

