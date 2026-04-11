# 主流Agent工具矩阵调研

## 一、调研目的

本文用于回答两个问题：

1. 当前主流 Agent 平台如何组织工具矩阵。
2. Binder 应该吸收哪些共性，不该照搬哪些高风险能力。

调研基线日期：`2026-04-05`

---

## 二、调研范围

本次只采信官方公开文档中的当前口径，覆盖：

1. OpenAI Responses API / Tools
2. Anthropic Tool Use
3. Google Gemini Tools
4. Model Context Protocol

---

## 三、主流平台结论

## 3.1 OpenAI

OpenAI 当前官方工具体系已经形成“内建工具 + 自定义函数 + remote MCP”的组合。

官方工具页当前列出的可用工具包括：

1. `function calling`
2. `web search`
3. `file search`
4. `remote MCP`
5. `image generation`
6. `code interpreter`
7. `computer use`
8. `apply patch`
9. `shell`

对 Binder 的启发：

1. 工具矩阵应独立于业务 prompt 存在。
2. hosted tools、custom tools、remote tools 可以并列治理。
3. “模型可调用能力”与“系统可提供能力”应显式区分。

## 3.2 Anthropic

Anthropic 当前把工具明确分成两类：

1. `client tools`
2. `server tools`

其官方说明中，`client tools` 包括：

1. 用户自定义工具
2. Anthropic 定义但需要客户端实现的工具，如 `computer use`、`text editor`、`bash`

`server tools` 的代表是：

1. `web search`

对 Binder 的启发：

1. “是否由本地系统执行”必须进入工具矩阵设计。
2. 文本编辑工具应是独立类别，而不是混在通用文件写工具里。
3. 高风险工具必须有人在环，而不是默认自动执行。

## 3.3 Google Gemini

Gemini 当前主流工具能力包括：

1. `function calling`
2. `code execution`
3. `google_search` grounding
4. URL context

Gemini 的关键特点是：

1. function calling 提供 `AUTO / ANY / NONE` 模式。
2. `code execution` 与 `google_search` 可以组合使用。
3. grounding 结果会回传结构化 citation metadata。

对 Binder 的启发：

1. 工具调用要有明确的启用模式，而不是总是全开。
2. 检索/grounding 的结果应结构化回流，而不是只回自然语言。
3. 计算工具不应直接替代业务工具。

## 3.4 MCP

MCP 的核心区分非常重要：

1. `tools`：模型控制
2. `resources`：应用提供的上下文资源
3. `prompts`：用户控制的提示模板

MCP 官方同时强调：

1. 工具应支持发现和调用
2. 资源是 application-driven
3. prompts 是 user-controlled
4. 对 tool invocation 应有人在环

对 Binder 的启发：

1. 不能把所有上下文能力都做成工具。
2. memory / knowledge / template 的一部分更像 resources，而不是 tools。
3. Binder 的工具矩阵必须与 context matrix、prompt matrix 分离设计。

---

## 四、主流方案的共同收敛

综合以上平台，主流 Agent 工具矩阵已经收敛为以下几层：

1. `retrieval_grounding`
2. `custom_function_api`
3. `file_and_editor_ops`
4. `sandbox_compute`
5. `external_connectors`
6. `computer_environment_control`

共同治理特征是：

1. 工具目录单独维护
2. schema 明确
3. 高风险工具单独治理
4. 结果结构化回流
5. 人在环不是可选项

---

## 五、对 Binder 的结论

Binder 不应复制“通用代理”的完整高风险矩阵，而应采用“文档与工作区中心”的矩阵。

Binder 应优先建设：

1. `workspace_read`
2. `workspace_write`
3. `editor_structured_edit`
4. `workspace_graph`
5. `reference_retrieval`
6. `artifact_deposition`

Binder 不应默认建设：

1. `raw_shell`
2. `computer_use`
3. 通用 `code_execution`

原因不是这些能力“不先进”，而是它们不匹配 Binder 当前的主链价值与风险边界。

---

## 六、建议落地方式

1. 为 Binder 建立正式 `ToolMatrixEntry` 文档与代码结构。
2. 把“当前实现工具”与“目标矩阵工具”分开管理。
3. 对每个工具补齐：层次开放、风险等级、确认要求、artifact 影响。
4. memory / knowledge / template 先区分 resource 与 tool，再决定哪些进入模型工具目录。

---

## 七、官方来源

1. OpenAI Tools: `https://platform.openai.com/docs/guides/tools`
2. OpenAI Web Search: `https://platform.openai.com/docs/guides/tools-web-search`
3. OpenAI File Search: `https://platform.openai.com/docs/guides/tools-file-search/`
4. Anthropic Tool Use Overview: `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview`
5. Anthropic Tool Use Implementation: `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use`
6. Anthropic Text Editor Tool: `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/text-editor-tool`
7. Anthropic Bash Tool: `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/bash-tool`
8. Google Gemini Function Calling: `https://ai.google.dev/gemini-api/docs/function-calling`
9. Google Gemini Code Execution: `https://ai.google.dev/gemini-api/docs/code-execution`
10. Google Gemini Grounding with Google Search: `https://ai.google.dev/gemini-api/docs/google-search`
11. MCP Tools: `https://modelcontextprotocol.io/docs/concepts/tools`
12. MCP Resources: `https://modelcontextprotocol.io/docs/concepts/resources`
13. MCP Prompts: `https://modelcontextprotocol.io/specification/2025-06-18/server/prompts`
