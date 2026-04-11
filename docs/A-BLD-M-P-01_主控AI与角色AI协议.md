# 主控 AI 与角色 AI 协议

## 文档头

- 结构编码：`BLD-M-P-01`
- 文档属性：`主结构`
- 主责模块：`BLD`
- 文档职责：`Master AI 与 Role AI 之间的任务分发协议、上下文传递规范、结果回流格式`
- 上游约束：`BLD-M-T-01`, `BLD-M-T-02`
- 直接承接：`A-BLD-M-P-02`
- 接口耦合：`A-BLD-M-T-04`
- 汇聚影响：`A-BLD-M-T-01`
- 扩散检查：`A-BLD-M-P-02`
- 使用边界：`定义 AI 间协议格式，不承担提示词具体内容（见 BLD-M-P-02）`
- 变更要求：`修改本文后，必须复核：A-BLD-M-P-02、A-BLD-M-T-04`

---

## 一、文档定位

本文定义构建模式 AI 体系的协议层：

1. Master AI 如何向 Role AI 分发上下文。
2. Role AI 的输出格式规范。
3. Master AI 收束摘要的输出格式规范。
4. Master AI 执行步骤的工具调用协议。

---

## 二、Master AI 向 Role AI 分发上下文

### 2.1 触发时机

Master AI 在以下时机向 Role AI 分发上下文：

1. 讨论组创建时，将初始上下文推送给各 Role AI。
2. 讨论过程中，Master AI 在收束前将最新讨论摘要推送给 Role AI。
3. 发起人新增引用资源时，Master AI 将资源内容推送给相关 Role AI。

### 2.2 上下文包结构

Master AI 向 Role AI 分发的上下文包：

```json
{
  "context_version": "<uuid>",
  "discussion_room_id": "<uuid>",
  "room_type": "open | internal",
  "role_config": {
    "role_name": "<角色名称>",
    "role_description": "<角色描述>",
    "access_level": "none | project_summary | full"
  },
  "discussion_summary": {
    "recent_messages": [...],
    "current_consensus": [...],
    "current_divergence": [...],
    "current_proposals": [...]
  },
  "project_context": {
    "enabled": true | false,
    "summary": "<脱敏后的项目摘要>",
    "referenced_files": [...]
  },
  "task": {
    "type": "respond | analyze | summarize",
    "instruction": "<具体任务指令>"
  }
}
```

> 待定：`access_level` 的具体权限细节（`full` 是否可访问原始文件内容？）

> 待定：`project_context.summary` 的脱敏规则与生成方式。

### 2.3 内部讨论组的脱敏要求

当 `room_type = internal` 且 `project_context.enabled = true` 时，Master AI 必须：

1. 在传递项目内容给 Role AI 之前执行脱敏处理。
2. 脱敏规则：自动替换姓名、联系方式、地址等敏感信息。
3. 脱敏处理在 Master AI 侧完成，Role AI 只接收脱敏后的内容。

> 待定：脱敏规则的完整实现方案（正则？NER 模型？）

---

## 三、Role AI 输出格式

### 3.1 输出类型

Role AI 在讨论组中只输出一种形式：**自然语言消息**，以其角色名称发送到讨论组消息流。

Role AI 不输出结构化数据，不输出工具调用，不输出文件内容。

### 3.2 消息结构

```json
{
  "sender_type": "role_ai",
  "sender_id": "<role_ai_id>",
  "sender_name": "<角色名称>",
  "content": "<自然语言消息内容>",
  "timestamp": "<ISO 8601>",
  "context_version": "<对应的上下文版本>"
}
```

### 3.3 输出内容限制

Role AI 的输出内容必须符合：

1. 只提供分析、建议、专业意见。
2. 不包含"我来帮你生成..."、"我可以执行..."等承诺执行的表述。
3. 不输出文件内容（完整文档正文）。
4. 不输出工具调用指令。

> 待定：是否需要在 Role AI 的系统提示中明确禁止上述行为？（见 `A-BLD-M-P-02`）

---

## 四、Master AI 收束摘要格式

### 4.1 收束摘要结构

Master AI 输出的收束摘要为结构化内容，在讨论组消息流中以特殊样式展示（标注"主控 AI 整理"）：

```json
{
  "summary_id": "<uuid>",
  "summary_version": "<number>",
  "generated_at": "<ISO 8601>",
  "based_on_message_count": <number>,
  "consensus": [
    {
      "point": "<共识内容>",
      "supported_by": ["<participant_name>", ...]
    }
  ],
  "divergence": [
    {
      "topic": "<分歧点描述>",
      "positions": [
        { "holder": "<participant_name>", "stance": "<观点描述>" }
      ]
    }
  ],
  "proposals": [
    {
      "proposal_id": "A | B | C ...",
      "title": "<方案标题>",
      "description": "<方案描述>",
      "pros": ["<优点>"],
      "cons": ["<缺点>"]
    }
  ]
}
```

### 4.2 摘要版本管理

每次 Master AI 输出新的收束摘要，`summary_version` 自增。

确认操作绑定到具体的 `summary_id`，不会跨版本延续。

---

## 五、Master AI 执行阶段工具调用协议

### 5.1 工具调用框架

Master AI 在执行阶段使用 provider-side function calling（与编辑模式 Agent 相同的调用方式，但工具集独立）。

### 5.2 核心工具定义

> 待定：构建模式工具集完整定义（见 `A-BLD-M-T-01` 第 3.2 节）

工具调用结果格式：

```json
{
  "tool_name": "<工具名>",
  "call_id": "<uuid>",
  "status": "success | failed",
  "result": { ... },
  "error": "<错误描述 | null>"
}
```

### 5.3 文件生成工具调用规范

每个步骤（文件生成）对应一个主要工具调用：

```json
{
  "tool_name": "generate_project_file",
  "parameters": {
    "file_path": "<相对路径>",
    "file_type": "main_doc | sub_doc | data | resource",
    "format": "md | docx | txt",
    "title": "<文档标题>",
    "content_instruction": "<内容生成指令>",
    "reference_files": ["<依赖文件路径>"],
    "template_ref": "<模板ID | null>"
  }
}
```

### 5.4 步骤完成确认

每个步骤完成后，Master AI 向执行引擎报告完成状态：

```json
{
  "step_status": "completed | failed",
  "file_path": "<相对路径>",
  "actual_tokens_used": <number>,
  "error": "<错误描述 | null>"
}
```

---

## 六、Build Outline 生成协议

### 6.1 输入

Master AI 生成 Build Outline 时，输入包含：

```json
{
  "user_description": "<用户描述>",
  "user_requirements": "<用户需求>",
  "references": [
    {
      "type": "workspace_file | template",
      "id": "<资源ID>",
      "content_summary": "<内容摘要>"
    }
  ],
  "discussion_conclusion": {
    "consensus": [...],
    "adopted_proposal": { ... }
  }
}
```

> 说明：`discussion_conclusion` 仅在讨论构建路径中非空。

### 6.2 输出

Master AI 输出的 Build Outline 格式见 `A-BLD-M-T-03_项目实体模型.md` 第四节。

---

## 七、关联文档

1. `A-BLD-M-T-01_构建模式AI架构.md`（AI 层级定义）
2. `A-BLD-M-T-02_讨论组状态机与协作机制.md`（收束触发时机）
3. `A-BLD-M-T-04_构建执行引擎.md`（工具调用执行上下文）
4. `A-BLD-M-P-02_构建模式提示词架构.md`（提示词内容）
