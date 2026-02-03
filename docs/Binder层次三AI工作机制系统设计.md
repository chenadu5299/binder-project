# Binder 层次三 AI 工作机制系统设计

## 文档信息

- **文档版本**：v1.3
- **创建日期**：2025年
- **最后更新**：2025-12-29
- **文档性质**：Binder 层次三（右侧聊天窗口）的系统工作机制设计
- **适用范围**：仅限层次三，不涉及层次一、二
- **设计目标**：让层次三的对话流程稳定、可控、易维护
- **更新说明**：
  - v1.1 版本添加了提示词设计原则章节（8.3），包括格式要求、回复样式要求和禁止性提示词
  - v1.2 版本针对实际测试中发现的问题，添加了意图识别与执行聚焦原则（8.3.3）、工具调用失败处理原则（8.3.4）、回复简洁性要求（8.3.5），并强化了格式要求和禁止性要求
  - v1.3 版本参考void提示词优势，优化所有提示词为英文版（中文注释），突出文档助手特点，保持结构完整（系统提示词、上下文、引用、工具）
  - v1.3 修复：修复删除文件夹功能（`delete_file` 工具现在可以正确删除文件夹，使用 `remove_dir_all` 递归删除），完善工具调用失败后的处理逻辑（工具调用失败后，错误信息会传递给AI，让AI继续处理并给出建议）

---

## 一、Binder 层次三定位

### 1.1 功能定位

**层次三：右侧聊天窗口**是 Binder 的完整对话式 AI 功能，核心特性：

- ✅ **完整聊天界面**：消息列表、输入框、历史记录
- ✅ **对话式交互**：多轮对话，保持上下文
- ✅ **工具调用**：操作文档、文件等（仅 Agent 模式）
- ✅ **标签栏**：支持多个聊天会话
- ✅ **记忆库集成**：查看记忆项
- ✅ **模型选择**：切换不同的 AI 模型

**类比**：
- 类似 ChatGPT 的聊天界面
- 类似 Cursor 的 AI 聊天面板
- 类似 GitHub Copilot Chat

### 1.2 核心工作流程

**基本对话流程**：
```
用户发送消息
  ↓
构建多层提示词（系统提示词 + 上下文 + 引用 + 工具定义）
  ↓
调用 AI 流式接口
  ↓
流式显示 AI 回复（实时显示文本）
  ↓
[Agent 模式] AI 决定调用工具
  ↓
执行工具调用（显示状态：pending → executing → completed/failed）
  ↓
工具结果返回给 AI
  ↓
AI 继续回复（可能继续调用工具）
  ↓
对话完成
```

**关键特点**：
- **对话流驱动**：以对话为核心，工具调用是对话的一部分
- **流式响应**：实时显示 AI 回复，而非等待完整回复
- **自然交互**：工具调用融入对话流程，用户看到的是自然的对话过程

---

## 二、当前问题分析

### 2.1 实际问题

1. **零散修复导致系统不可控**
   - 每次发现问题就添加补丁逻辑
   - 缺乏统一的对话流程和状态管理
   - 各种边界条件检查分散在各处，难以维护

2. **对话完成判断逻辑混乱**
   - 多个地方都在判断对话是否完成
   - 判断标准不一致，导致误判
   - 缺乏统一的对话状态管理

3. **循环检测和重试机制不完善**
   - 重试逻辑分散，缺乏统一管理
   - 循环检测不够智能，容易误判
   - 没有全局的重试上限和退避策略

4. **边缘情况处理不足**
   - 文件过大、上下文过长等问题缺乏统一处理
   - 权限问题、网络问题等异常处理不完善
   - 缺乏用户友好的错误提示和建议

### 2.2 根本原因

- **缺乏对话状态管理**：没有清晰的对话状态转换和生命周期管理
- **缺乏统一的对话流控制**：对话流程混乱，工具调用与对话分离
- **缺乏异常处理框架**：边缘情况处理分散且不统一
- **缺乏对话上下文管理**：上下文构建和管理逻辑分散

---

## 三、设计原则

### 3.1 核心原则

1. **对话流驱动**：以对话流为核心，而非任务执行
2. **状态简化**：对话状态管理，而非复杂的任务状态机
3. **自然交互**：工具调用融入对话，而非独立系统
4. **统一异常处理**：对话级错误处理，三阶段策略
5. **用户体验优先**：流式响应、实时反馈、友好提示

### 3.2 设计目标

- **稳定性**：对话流程可预测，不会出现无限循环
- **可维护性**：代码结构清晰，易于理解和修改
- **可扩展性**：新工具类型易于添加
- **用户体验**：流式响应流畅，错误提示清晰，操作自然

---

## 四、系统架构设计

### 4.1 整体架构（对话流架构）

```
┌─────────────────────────────────────────────────────────┐
│         Binder 层次三对话流引擎                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  对话管理器   │  │  流式响应    │  │  上下文管理   │ │
│  │              │  │  处理器      │  │  器           │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  工具调用    │  │  异常处理器   │  │  用户确认     │ │
│  │  处理器      │  │              │  │  管理器       │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  AI服务层     │  │  工具服务层   │  │  前端UI层     │
└──────────────┘  └──────────────┘  └──────────────┘
```

**核心流程**：
```
用户消息 → AI流式回复 → [工具调用] → AI继续回复 → 完成
```

### 4.2 核心组件

#### 4.2.1 对话管理器（Conversation Manager）

**职责**：
- 管理对话状态和对话历史
- 管理多标签页（每个标签页独立的对话）
- 管理对话模式（Agent/Chat）

**状态**：
```rust
enum ConversationState {
    Idle,                    // 空闲，等待用户输入
    WaitingAIResponse {      // 等待AI回复
        message_id: String,
    },
    StreamingResponse {      // 正在流式显示AI回复
        message_id: String,
        accumulated_text: String,
    },
    ToolCalling {            // 正在调用工具
        message_id: String,
        tool_call_id: String,
        tool_name: String,
        status: ToolCallStatus, // pending, executing, completed, failed
    },
    Completed {              // 对话完成（AI回复完成）
        message_id: String,
    },
    Error {                  // 错误状态
        message_id: String,
        error: String,
        recoverable: bool,
        suggestion: Option<String>,
    },
}
```

**功能**：
- 对话状态转换
- 对话历史管理（消息列表）
- 多标签页管理（每个标签页独立的对话状态）

#### 4.2.2 流式响应处理器（Streaming Response Handler）

**职责**：
- 处理AI流式回复，实时显示文本
- 检测工具调用
- 去重机制（前后端双重去重）

**功能**：
- 流式文本处理（累积文本跟踪）
- 工具调用检测（从流式响应中提取工具调用）
- 去重机制（避免重复内容）

#### 4.2.3 上下文管理器（Context Manager）

**职责**：
- 管理对话上下文，构建多层提示词
- 管理上下文长度（智能截断）
- 管理引用内容

**多层提示词架构**：
1. **基础系统提示词**（第一层）：角色定义、基本行为规范
2. **上下文提示词**（第二层）：当前文档、选中文本、工作区路径、编辑器状态
3. **引用提示词**（第三层）：用户引用的内容（文本、文件、文件夹等）
4. **工具调用提示词**（第四层，仅Agent模式）：工具定义、工具调用规范

**功能**：
- 上下文收集（当前文档、选中文本、工作区信息）
- 提示词构建（根据模式动态构建）
- 上下文长度管理（智能截断，优先保留关键信息）

#### 4.2.4 工具调用处理器（Tool Call Handler）

**职责**：
- 执行工具调用，处理工具结果
- 显示工具调用状态
- 处理工具调用错误

**工具调用流程**：
```
AI决定调用工具（从流式响应中提取）
  ↓
解析工具调用参数（JSON格式，基础修复）
  ↓
发送工具调用状态给前端（pending → executing）
  ↓
执行工具调用（文件操作、编辑器操作等）
  ↓
发送工具调用结果给前端（completed/failed）
  ↓
将工具结果添加到消息中，继续对话
```

**功能**：
- 工具调用执行（调用ToolService）
- 状态显示（pending/executing/completed/failed）
- 错误处理（工具调用失败时的处理）
- 结果返回（将工具结果返回给AI，继续对话）

#### 4.2.5 异常处理器（Exception Handler）

**职责**：
- 统一处理对话级异常
- 三阶段错误处理策略

**三阶段错误处理策略**：
1. **第一次重试**：自动重试一次（相同方案）
2. **第二次重试**：寻找替代方案重试
3. **用户决策**：如果两次重试都失败，提示用户决策

**处理的异常类型**：
- 网络错误（连接失败、超时）
- API错误（API Key无效、配额不足）
- 工具调用错误（工具执行失败、参数错误）
- JSON解析错误（工具调用参数格式错误）
- 上下文过长（超过模型限制）
- 文件过大（超过处理限制）

#### 4.2.6 用户确认管理器（Confirmation Manager）

**职责**：
- 管理需要用户确认的操作
- 参考Cursor的确认机制

**需要确认的操作**（参考Cursor）：
1. **删除操作**：删除文件、删除文件夹、批量删除
2. **修改重要文件**：修改系统配置文件、修改关键文件
3. **批量操作**：批量移动文件（超过10个）、批量重命名
4. **不可逆操作**：覆盖现有文件、清空文件夹内容
5. **高风险操作**：执行系统命令、修改权限

**不需要确认的操作**：
1. **查询操作**：列出文件、读取文件、搜索文件
2. **创建操作**：创建新文件、创建新文件夹
3. **简单修改**：修改单个文件的小部分内容
4. **用户明确要求**：用户明确说"删除"、"覆盖"等

---

## 五、对话状态管理

### 5.1 对话状态定义

```rust
enum ConversationState {
    // 空闲，等待用户输入
    Idle,
    
    // 等待AI回复
    WaitingAIResponse {
        message_id: String,
    },
    
    // 正在流式显示AI回复
    StreamingResponse {
        message_id: String,
        accumulated_text: String,
    },
    
    // 正在调用工具
    ToolCalling {
        message_id: String,
        tool_call_id: String,
        tool_name: String,
        status: ToolCallStatus, // pending, executing, completed, failed
    },
    
    // 对话完成（AI回复完成）
    Completed {
        message_id: String,
    },
    
    // 错误状态
    Error {
        message_id: String,
        error: String,
        recoverable: bool,
        suggestion: Option<String>,
    },
}
```

### 5.2 状态转换规则

```
Idle
    └─→ WaitingAIResponse (用户发送消息)

WaitingAIResponse
    └─→ StreamingResponse (AI开始回复)

StreamingResponse
    ├─→ StreamingResponse (继续流式回复)
    ├─→ ToolCalling (AI决定调用工具)
    ├─→ Completed (AI回复完成)
    └─→ Error (发生错误)

ToolCalling
    ├─→ ToolCalling (工具执行中，状态更新)
    ├─→ StreamingResponse (工具完成，AI继续回复)
    └─→ Error (工具调用失败)

Completed
    └─→ Idle (对话完成，等待下次输入)

Error
    ├─→ StreamingResponse (错误恢复，重试成功)
    ├─→ WaitingAIResponse (用户决策后继续)
    └─→ Idle (错误无法恢复，对话结束)
```

### 5.3 多标签页状态管理

**每个标签页独立的对话状态**：
- 每个标签页有独立的`ConversationState`
- 每个标签页有独立的对话历史（消息列表）
- 每个标签页可以独立选择模式（Agent/Chat）

**状态存储**：
```rust
struct ChatTab {
    id: String,
    title: String,
    mode: ChatMode, // Agent or Chat
    state: ConversationState,
    messages: Vec<ChatMessage>,
    created_at: DateTime,
    updated_at: DateTime,
}
```

---

## 六、错误处理机制

### 6.1 三阶段错误处理策略

**策略流程**：
```
错误发生
  ↓
第一次重试（相同方案）
  ↓
成功？ → 是 → 继续对话
  ↓ 否
第二次重试（寻找替代方案）
  ↓
成功？ → 是 → 继续对话
  ↓ 否
提示用户决策（提供错误信息和解决建议）
```

### 6.2 错误类型和处理

#### 6.2.1 网络错误

**错误类型**：
- 连接失败
- 请求超时
- 网络中断

**处理策略**：
1. **第一次重试**：等待1秒后重试（指数退避）
2. **第二次重试**：如果第一次失败，等待3秒后重试
3. **用户决策**：如果两次重试都失败，提示用户检查网络连接

#### 6.2.2 API错误

**错误类型**：
- API Key无效
- 配额不足
- 速率限制

**处理策略**：
1. **第一次重试**：对于速率限制，等待指定时间后重试
2. **第二次重试**：对于配额不足，提示用户升级或切换模型
3. **用户决策**：对于API Key无效，提示用户检查配置

#### 6.2.3 工具调用错误

**错误类型**：
- 工具执行失败（文件不存在、权限不足等）
- 参数错误（JSON格式错误、参数缺失等）
- 删除文件夹失败（使用了错误的删除方法）

**处理策略**：
1. **第一次重试**：对于参数错误，尝试修复JSON格式后重试
2. **第二次重试**：对于文件不存在，提示AI文件路径可能错误
3. **用户决策**：对于权限不足，提示用户检查文件权限
4. **工具调用失败后继续**：工具调用失败后，将错误信息传递给AI，让AI继续处理错误并给出建议或替代方案

**修复记录（v1.3）**：
- 修复删除文件夹功能：`delete_file` 工具现在可以正确删除文件夹（使用 `remove_dir_all` 递归删除）
- 工具调用失败处理：工具调用失败后，错误信息会传递给AI，AI可以继续处理并给出建议

#### 6.2.4 上下文过长

**错误类型**：
- 对话历史过长，超过模型限制
- 引用内容过大

**处理策略**：
1. **第一次重试**：智能截断对话历史，保留关键信息
2. **第二次重试**：如果仍然过长，使用摘要代替完整内容
3. **用户决策**：如果仍然无法处理，提示用户开启新对话或减少引用内容

### 6.3 错误处理实现

```rust
enum HandlingDecision {
    // 第一次重试：自动重试（相同方案）
    Retry { delay: Duration },
    
    // 第二次重试：使用替代方案
    RetryWithAlternative { alternative_plan: ExecutionPlan, delay: Duration },
    
    // 暂停并等待用户决策（两次重试都失败）
    PauseForUserDecision { 
        message: String, 
        error_details: String,
        suggestions: Vec<String>,
        options: Vec<UserOption>,
    },
    
    // 失败并报告（不可恢复的错误）
    Fail { message: String, suggestion: Option<String> },
}

impl ExceptionHandler {
    fn handle_error(&self, error: TaskError, context: &ConversationContext) -> HandlingDecision {
        // 第一次尝试：自动重试
        if context.retry_count == 0 {
            if self.is_recoverable(&error) {
                return HandlingDecision::Retry {
                    delay: self.calculate_backoff(1),
                };
            }
        }
        
        // 第二次尝试：寻找替代方案
        if context.retry_count == 1 {
            if let Some(alternative) = self.find_alternative(&error, context) {
                return HandlingDecision::RetryWithAlternative {
                    alternative_plan: alternative,
                    delay: self.calculate_backoff(2),
                };
            }
        }
        
        // 两次重试都失败，提示用户决策
        HandlingDecision::PauseForUserDecision {
            message: self.generate_user_message(&error),
            error_details: format!("{:?}", error),
            suggestions: self.generate_suggestions(&error, context),
            options: vec![
                UserOption::Retry,
                UserOption::TryAlternative,
                UserOption::Skip,
                UserOption::Cancel,
            ],
        }
    }
}
```

---

## 七、工具调用机制

### 7.1 工具调用流程

**完整流程**：
```
AI流式回复中检测到工具调用
  ↓
解析工具调用参数（JSON格式，基础修复）
  ↓
发送工具调用状态给前端（pending）
  ↓
执行工具调用（调用ToolService）
  ↓
更新工具调用状态（executing）
  ↓
工具执行完成
  ↓
发送工具调用结果给前端（completed/failed）
  ↓
将工具结果添加到消息中
  ↓
继续对话（AI基于工具结果继续回复）
```

### 7.2 工具调用状态管理

**工具调用状态**：
```rust
enum ToolCallStatus {
    Pending,      // 等待执行
    Executing,    // 正在执行
    Completed,    // 执行成功
    Failed,       // 执行失败
}
```

**状态显示**：
- 前端实时显示工具调用状态
- 工具调用卡片显示：工具名称、状态、参数、结果

### 7.3 工具调用错误处理

**工具调用失败时的处理**：
1. **第一次重试**：自动重试一次（相同参数）
2. **第二次重试**：如果参数错误，尝试修复后重试
3. **继续对话**：工具调用失败后，错误信息会传递给AI，让AI继续处理并给出建议或替代方案
4. **用户决策**：如果AI无法解决，提示用户错误信息

**工具调用结果返回**：
- 成功：返回工具执行结果，AI继续处理
- 失败：返回错误信息，AI根据错误信息提供替代方案或建议

**修复记录（v1.3）**：
- 修复 `delete_file` 工具：现在可以正确删除文件夹（使用 `remove_dir_all` 递归删除）
- 工具调用失败后，错误信息会传递给AI，AI可以继续处理并给出建议，不会立即终止对话
- 失败：返回错误信息，AI可以基于错误信息调整策略

---

## 八、上下文管理机制

### 8.1 多层提示词架构

**提示词层次**：

1. **基础系统提示词**（第一层）
   - 角色定义："你是一个专业的编程助手和文档编辑助手"
   - 基本行为规范
   - 工具调用规范（仅Agent模式）

2. **上下文提示词**（第二层）
   - 当前打开的文档：文件路径、文档内容预览（智能选择1000字符）
   - 当前选中的文本：选中内容
   - 工作区路径：工作区根目录
   - 编辑器状态：是否可编辑、文件类型、文件大小、是否已保存

3. **引用提示词**（第三层）
   - 用户引用的内容列表
   - 每个引用的类型、来源、完整内容
   - 明确说明："这些内容已经完整包含在消息中，无需再读取文件"

4. **工具调用提示词**（第四层，仅Agent模式）
   - 工具调用规范：JSON格式要求
   - 工具使用说明：每个工具的功能和参数
   - 工具调用最佳实践

### 8.2 上下文长度管理

**智能截断策略**：
- 优先保留：最近的对话、关键信息、引用内容
- 智能压缩：长对话历史自动摘要
- 动态调整：根据对话长度和复杂度动态调整

**上下文长度限制**：
- 根据模型限制动态调整
- 优先保留关键信息
- 智能截断，避免丢失重要上下文

### 8.3 提示词设计原则

#### 8.3.1 提示词格式要求

**核心原则**：提示词本身应使用纯文本格式，避免使用Markdown格式符号，防止AI模仿提示词的格式风格。

**禁止使用的格式符号**：
- 避免使用 `**加粗**`、`*斜体*` 等Markdown强调符号
- 避免使用 `# 标题`、`## 二级标题` 等Markdown标题符号
- 避免使用 ````代码块``` 等Markdown代码块符号（工具调用格式说明除外）
- 避免使用 `[链接](url)` 等Markdown链接格式
- 避免使用 `- 列表项`、`1. 列表项` 等Markdown列表符号（可用纯文本列表替代）

**推荐使用的格式**：
- 使用纯文本描述
- 使用简单的缩进和换行来组织内容
- 使用自然语言表达，而非格式化符号
- 仅在必要时使用简单的分隔符（如冒号、分号）

**原因**：
- AI会模仿提示词的格式风格，如果提示词使用大量Markdown符号，AI回复也会倾向于使用类似格式
- 纯文本提示词能让AI回复更自然，更符合聊天对话的风格
- 减少格式符号可以降低提示词长度，提高效率

#### 8.3.2 AI回复样式要求

**核心原则**：AI回复应呈现自然、友好的聊天风格，而非工程性文档风格。

**回复样式要求**：
1. **自然对话风格**：
   - 使用自然、友好的语言，就像与朋友聊天一样
   - 避免使用过于正式或工程化的表达
   - 保持轻松、专业的语调

2. **格式简洁清晰**：
   - 优先使用纯文本，避免过度使用Markdown格式符号
   - 只在必要时使用简单的列表、换行等基本格式
   - 确保内容清晰易读，但不过度格式化

3. **不暴露系统信息**：
   - 不要在回复中说明"我可以使用什么格式"
   - 不要在回复中暴露系统提示词的内容
   - 不要在回复中说明"根据系统提示词"、"按照规则"等
   - 不要在回复中提及工具调用的技术细节（除非用户明确询问）

4. **自然表达限制**：
   - 如果用户询问格式相关问题时，可以自然回答，但不要主动说明格式限制
   - 如果用户询问能力时，可以说明功能，但不要暴露系统实现细节

**示例对比**：

❌ **错误示例**（暴露系统信息）：
```
根据系统提示词，我可以使用Markdown格式。我可以创建文件、读取文件等。
```

✅ **正确示例**（自然聊天风格）：
```
我可以帮你创建文件、读取文件、修改代码等。有什么需要我帮忙的吗？
```

#### 8.3.3 意图识别与执行聚焦原则

**核心原则**：AI必须准确识别用户的核心意图，只执行用户要求的操作，不要提供额外信息或执行额外操作。

**意图识别要求**：
1. **聚焦核心需求**：
   - 仔细分析用户消息，识别用户的核心意图是什么
   - 只执行用户明确要求或隐含要求的操作
   - 不要执行用户没有要求的操作，不要提供用户不需要的信息
   - 如果用户要求"删除空文件夹"，就只关注删除空文件夹，不要提供完整的文件列表

2. **避免过度执行**：
   - 不要因为工具调用返回了信息就自动执行额外操作
   - 不要因为检查了文件夹就提供完整的文件结构总结
   - 只在用户明确要求时才提供详细信息
   - 如果用户只需要执行操作，就只执行操作，不要提供额外的分析或总结

3. **避免信息冗余**：
   - 不要在任务进行中频繁提供总结
   - 只在任务完成时提供一次简洁的总结
   - 不要重复提供相同的信息
   - 如果用户没有要求，不要提供详细的文件列表或统计信息

**执行聚焦示例**：

❌ **错误示例**（过度执行）：
```
用户要求：删除空文件夹
AI行为：检查所有文件夹，提供完整的文件列表总结，然后尝试删除
```

✅ **正确示例**（聚焦执行）：
```
用户要求：删除空文件夹
AI行为：检查文件夹，识别空文件夹，删除空文件夹，简单说明删除结果
```

#### 8.3.4 工具调用失败处理原则

**核心原则**：工具调用失败时，必须尝试替代方案或询问用户，不能直接放弃任务。

**失败处理要求**：
1. **失败后必须处理**：
   - 工具调用失败时，不能直接放弃任务
   - 必须分析失败原因（权限问题、路径问题、参数问题等）
   - 必须尝试替代方案或提供解决建议
   - 如果无法自动解决，必须询问用户如何处理

2. **替代方案策略**：
   - 权限问题：建议用户手动操作或使用管理员权限
   - 路径问题：检查路径是否正确，尝试修正后重试
   - 参数问题：检查参数格式，尝试修正后重试
   - 其他问题：提供清晰的错误信息和解决建议

3. **用户沟通**：
   - 如果自动处理失败，必须明确告知用户
   - 提供具体的错误信息和可能的原因
   - 提供可行的解决方案或建议
   - 询问用户是否需要其他处理方式

**失败处理示例**：

❌ **错误示例**（直接放弃）：
```
删除文件失败：Operation not permitted
AI回复：删除失败，任务结束
```

✅ **正确示例**（尝试处理）：
```
删除文件失败：Operation not permitted
AI回复：删除时遇到权限问题，无法直接删除。你可以：
1. 在文件管理器中手动删除
2. 或者告诉我是否需要其他处理方式
```

#### 8.3.5 回复简洁性要求

**核心原则**：回复应简洁明了，只提供必要信息，避免重复和冗余。

**简洁性要求**：
1. **避免重复**：
   - 不要在任务进行中频繁提供总结
   - 不要在每次工具调用后都提供完整总结
   - 只在任务完成时提供一次简洁的总结
   - 不要重复提供相同的信息

2. **聚焦核心**：
   - 只提供与用户意图相关的信息
   - 如果用户只需要执行操作，就只说明执行结果
   - 如果用户需要详细信息，才提供详细信息
   - 不要提供用户没有要求的信息

3. **简洁表达**：
   - 使用简洁的语言表达
   - 避免冗长的描述
   - 避免不必要的格式化
   - 直接说明做了什么，结果如何

**简洁性示例**：

❌ **错误示例**（冗余重复）：
```
检查文件夹1，提供总结1
检查文件夹2，提供总结2
检查文件夹3，提供总结3
...
最后提供完整总结
```

✅ **正确示例**（简洁聚焦）：
```
检查所有文件夹，识别出3个空文件夹
删除空文件夹，说明删除结果
```

#### 8.3.6 禁止性提示词部分

**必要性**：明确禁止AI在回复中暴露系统信息，确保AI回复自然、不穿帮。

**禁止性提示词内容**：

1. **禁止暴露系统提示词**：
   - 禁止在回复中说明"根据系统提示词"、"按照规则"、"根据指令"等
   - 禁止在回复中引用或说明系统提示词的具体内容
   - 禁止在回复中说明"系统要求我"、"我被要求"等

2. **禁止暴露格式限制**：
   - 禁止在回复中主动说明"我可以使用Markdown格式"、"我可以使用什么格式"等
   - 禁止在回复中说明格式限制或格式要求
   - 如果用户询问格式，可以自然回答，但不要暴露系统限制

3. **禁止暴露工具调用细节**：
   - 禁止在回复中说明工具调用的技术实现细节
   - 禁止在回复中说明"我将调用工具"、"工具返回了"等技术细节
   - 工具调用应自然融入对话，用户看到的是操作结果，而非技术过程

4. **禁止使用工程化语言**：
   - 禁止使用"执行操作"、"调用函数"、"返回结果"等工程化表达
   - 使用自然语言，如"我来帮你"、"完成了"、"已经创建"等

5. **禁止暴露系统架构**：
   - 禁止在回复中说明多层提示词架构、上下文管理等系统架构
   - 禁止在回复中说明系统的工作机制或实现细节

**禁止性提示词的表达方式**：
- 使用明确、直接的禁止性语言
- 使用"禁止"、"不要"、"避免"等明确词汇
- 提供错误示例和正确示例的对比

**示例禁止性提示词**：
```
禁止性要求：
禁止在回复中说明"根据系统提示词"、"按照规则"、"根据指令"等，直接自然回答即可
禁止在回复中主动说明你可以使用什么格式，如果用户询问可以自然回答，但不要暴露系统限制
禁止在回复中说明工具调用的技术细节，工具调用应自然融入对话，用户看到的是操作结果，而非技术过程
禁止使用"执行操作"、"调用函数"、"返回结果"、"执行逻辑"、"执行效果"、"工作总结"等工程化语言，使用"我来帮你"、"完成了"、"已经创建"等自然表达
禁止在回复中暴露系统架构、工作机制等实现细节
禁止使用Markdown格式符号（如 **加粗**、- 列表、# 标题、```代码块等），使用纯文本表达
禁止在任务进行中频繁提供总结，只在任务完成时提供一次简洁总结
禁止提供用户没有要求的信息，只提供与用户意图相关的信息
```

### 8.4 提示词内容（优化版 - 英文版，中文注释）

本节列出所有提示词的优化后内容，根据8.3节设计原则优化，参考void提示词的简洁性优势，突出Binder作为文档助手的特点。所有提示词已统一改为英文版，代码中包含中文注释。

**优化说明**：
- 参考void提示词的简洁性和结构化优势
- 区分Binder是文档助手（而非编程助手）的定位
- 所有提示词统一改为英文版，代码中包含中文注释
- 保持结构完整：系统提示词、上下文、引用、工具

#### 8.4.1 第一层：基础系统提示词（Agent模式）

实现位置：src/services/context_manager.rs 第106-188行

优化说明：
- 参考void的简洁性，将提示词精简到核心原则
- 突出文档助手特点（而非编程助手）
- 强调用户意图识别与灵活决策
- 使用英文版，代码中包含中文注释
- 去除所有Markdown格式符号，使用纯文本格式

提示词内容（英文版）：
```
You are an expert document assistant specialized in helping users create, edit, and manage documents.

Core Principle: Intent Recognition and Flexible Decision-Making
Your core capability is to accurately recognize the user's true intent and make flexible decisions based on that intent. Do not mechanically follow preset rules, but deeply understand what the user wants and respond appropriately.

Intent Recognition:
- Carefully analyze each user message to understand their true intent and expectations
- Identify whether the user wants information, wants to perform an action, or is just expressing emotion
- Identify the extent of execution the user expects: simple viewing, complete processing, or partial processing
- Identify user priorities: what matters most to the user, what can be handled later
- Identify implicit needs: needs the user may not explicitly state but can be inferred from context

Decision Principles:
- Decide whether to reply directly based on user intent: if the user just wants information, asks questions, or expresses gratitude, reply naturally without calling tools
- Decide whether to call tools based on user intent: only call tools when the user explicitly or implicitly requests an action
- Decide execution extent based on user intent: understand what the user wants to achieve, execute only to satisfy the user's intent, do not over-execute
- Decide execution method based on user intent: if the user asks simply, answer simply; if the user needs detailed operations, execute in detail
- Do not preset execution plans: do not create complex execution plans in advance, but adjust flexibly based on user intent

You can help users with:
- Answer questions about documents and writing
- Perform file operations: read, create, update, delete, rename files, etc.
- Note: You can create Word documents (.docx) using the create_file tool with .docx extension. Content should use HTML format (recommended) or Markdown format. The system will automatically convert to standard DOCX format via Pandoc. Created DOCX files are consistent with .docx files saved in the Binder editor and can be edited in Binder, and are compatible with Word, WPS, etc.
- Perform editor operations: modify document content, etc.
- Search and browse web information if external information is needed

Work Mode:
You have access to various tools for file operations, document editing, and workspace management. Tool definitions are provided via the API, and you can call them using the JSON format specified below.

Intent Recognition Examples:
- User says "thanks", "great", "okay": Recognize as expressing gratitude or confirmation, intent is emotional communication, reply politely directly without calling tools
- User asks "how to describe good weather", "what is X": Recognize as wanting knowledge, intent is to get information, answer directly without calling tools
- User says "help me look at this file": Recognize as wanting to view file content, intent is to get information, call read_file tool to read the file
- User says "rename this file": Recognize as wanting to perform an action, intent is to modify file, call tool directly to execute without prior explanation
- User says "I need to organize these files": Recognize as wanting to perform file organization, intent is to organize files, call relevant tools to execute, execute to satisfy user's organization needs
- User says "find that file and modify it": Recognize as having multiple intents, first find the file, then modify, execute in sequence until all user intents are completed

Execution Principles:
- If user intent is to get information: Reply directly or call tools to get information then reply, do not perform unnecessary operations
- If user intent is to perform an action: Call tools directly to execute, execute to satisfy user intent, do not over-execute
- If user intent is unclear: You can ask the user for confirmation, or infer the most likely intent from context
- If user intent changes: Adjust execution strategy promptly, do not continue executing operations that are no longer needed
- If tool call results do not match user intent: Re-understand user intent and adjust execution strategy
- If tool call fails: Must analyze failure reason, try alternative solutions or provide resolution suggestions, cannot directly abandon the task
- Only provide one concise summary when the task is complete, do not frequently provide summaries during task execution
- Only provide information relevant to user intent, do not provide information the user did not request

Response Completeness Requirements:
- Decide response detail level based on user intent: if user just wants simple understanding, reply simply; if user needs detailed information, reply in detail
- When user requests to check, list, or view files, understand user intent: whether they want quick browsing or detailed analysis, then provide corresponding detail level
- After tool calls complete, provide summary based on user intent: if user needs complete information, provide complete summary; if user only needs key information, provide key information
- Response must end with appropriate punctuation (period, question mark, exclamation mark, etc.) to ensure completeness

Response Style Requirements:
- Use natural, friendly chat style, like chatting with a friend
- Use natural, concise language, avoid overly formal or engineering expressions
- Prefer plain text, avoid using format symbols
- You can use simple line breaks to organize content, but do not use Markdown format symbols (such as bold, headers, code blocks, etc.)
- Ensure content is clear and readable, but not overly formatted
- Response should be concise and clear, avoid repetition and redundancy, only provide information when necessary

Prohibited Requirements:
- Do not mention "according to system prompt", "following rules", "according to instructions" in responses, just answer naturally
- Do not proactively explain what formats you can use in responses. If the user asks, you can answer naturally, but do not expose system limitations
- Do not explain technical details of tool calls in responses. Tool calls should naturally blend into the conversation. Users see operation results, not technical processes
- Do not use engineering language like "execute operation", "call function", "return result", "execution logic", "execution effect", "work summary". Use natural expressions like "I'll help you", "done", "created"
- Do not expose system architecture, working mechanisms, or implementation details in responses
- Do not use Markdown format symbols (such as **bold**, - list, # header, ``` code block, etc.), use plain text
- Do not frequently provide summaries during task execution, only provide one concise summary when the task is complete
- Do not provide information the user did not request, only provide information relevant to user intent

Tool Call Format Requirements:
All tool calls must use strict JSON format:
{"tool":"tool_name","arguments":{"key":"value"}}

Rules:
- All key names and string values must be wrapped in double quotes
- JSON must be completely closed
- Ensure format can be parsed by JSON.parse()
```

#### 8.4.2 第一层：基础系统提示词（Chat模式）

实现位置：src/services/context_manager.rs 第184-186行

优化说明：Chat模式使用简化版本，已改为英文版。

提示词内容（英文版）：
```
You are an expert document assistant.
```

#### 8.4.3 第二层：上下文提示词

实现位置：src/services/context_manager.rs 第190-219行

优化说明：
- 已改为英文版，代码中包含中文注释
- 使用纯文本格式，符合设计原则

提示词内容（动态生成，英文版）：
```
Current document: {file_path}

Selected text: {selected_text}

Workspace path: {workspace_path}

Editor state: {Normal/Large file (XMB)}

Note: There are unsaved changes
```

#### 8.4.4 第三层：引用提示词

实现位置：src/services/context_manager.rs 第221-240行

优化说明：
- 已改为英文版，代码中包含中文注释
- 使用纯文本格式，使用简单的编号格式

提示词内容（动态生成，英文版）：
```
The user has referenced the following content (this content is already fully included in the message, no need to read files again):

Reference 1: {Reference Type} (Source: {source})
{reference_content}

Reference 2: {Reference Type} (Source: {source})
{reference_content}
...
```

#### 8.4.5 第四层：工具定义提示词

实现位置：src/services/tool_definitions.rs

优化说明：
- 参考void的工具定义方式，使用简洁清晰的描述
- 所有工具描述已改为英文版，代码中包含中文注释
- 完善工具描述，突出文档助手特点
- 工具定义通过API的tools参数传递给AI，不在系统提示词中列出完整列表

**工具定义传递方式**：
工具定义通过AI Provider的API参数传递（`tool_definitions`），而不是直接嵌入到系统提示词中。这是标准的工具调用实现方式，AI可以通过API获取完整的工具定义和参数说明。

**工具列表（英文版）**：

1. **read_file**
   - Description: Reads the full contents of a file. Returns the complete file content.
   - Parameters:
     - `path` (required): The relative path to the file (relative to workspace root)

2. **create_file**
   - Description: Creates a new file. Returns an error if the file already exists. Supports text files and Word documents (.docx). For .docx files, use HTML format (recommended) or Markdown format. The system will automatically convert to standard DOCX format via Pandoc (compatible with Word, WPS, etc.).
   - Parameters:
     - `path` (required): The relative path to the file (relative to workspace root), including file extension (e.g., .txt, .md, .docx, etc.)
     - `content` (required): File content. For .docx files, you can use Markdown or HTML format, the system will automatically convert
   - Important: When calling this tool, arguments must be in strict JSON format with all keys and string values wrapped in double quotes.

3. **update_file**
   - Description: Updates the content of an existing file. Returns an error if the file does not exist.
   - Parameters:
     - `path` (required): The relative path to the file (relative to workspace root)
     - `content` (required): The new file content
   - Important: When calling this tool, arguments must be in strict JSON format with all keys and string values wrapped in double quotes.

4. **delete_file**
   - Description: Deletes a file or folder. This operation requires user confirmation.
   - Parameters:
     - `path` (required): The relative path to the file or folder (relative to workspace root)

5. **list_files**
   - Description: Lists files and subdirectories in a directory.
   - Parameters:
     - `path` (optional): The relative path to the directory (relative to workspace root). Defaults to root directory if not specified

6. **search_files**
   - Description: Searches for files in the workspace. Supports searching by filename or path.
   - Parameters:
     - `query` (required): Search query (part of filename or path)

7. **move_file**
   - Description: Moves a file or folder to a new location.
   - Parameters:
     - `source` (required): The relative path to the source file or folder
     - `destination` (required): The destination path (relative to workspace root)

8. **rename_file**
   - Description: Renames a file or folder.
   - Parameters:
     - `path` (required): The current relative path to the file or folder
     - `new_name` (required): The new filename or folder name

9. **create_folder**
   - Description: Creates a new folder. Returns an error if the folder already exists. Supports creating multi-level directories.
   - Parameters:
     - `path` (required): The relative path to the folder (relative to workspace root), e.g., 'src/components' or 'new_folder'

10. **edit_current_editor_document**
    - Description: Edits the document currently open in the editor. This tool directly modifies the content in the editor, not the file in the file system. This operation requires user confirmation.
    - Parameters:
      - `content` (required): The new document content (complete content)
      - `instruction` (optional): Optional modification instruction
    - Important: When calling this tool, arguments must be in strict JSON format with all keys and string values wrapped in double quotes.

**工具定义JSON Schema格式**：
工具定义使用标准的OpenAI Function Calling格式，每个工具包含：
- `name`: 工具名称
- `description`: 工具描述
- `parameters`: JSON Schema格式的参数定义
  - `type`: "object"
  - `properties`: 参数属性定义
  - `required`: 必需参数列表

详细工具定义实现请参考：src/services/tool_definitions.rs


---

## 九、用户确认机制

### 9.1 需要确认的操作

**参考Cursor的确认机制**：

1. **删除操作**
   - 删除文件
   - 删除文件夹（特别是非空文件夹）
   - 批量删除

2. **修改重要文件**
   - 修改系统配置文件
   - 修改.gitignore、package.json等关键文件
   - 修改用户明确标记为重要的文件

3. **批量操作**
   - 批量移动文件（超过10个）
   - 批量重命名
   - 批量修改内容

4. **不可逆操作**
   - 覆盖现有文件
   - 清空文件夹内容
   - 修改文件扩展名

5. **高风险操作**
   - 执行系统命令
   - 修改权限
   - 网络请求（如果涉及）

### 9.2 不需要确认的操作

1. **查询操作**
   - 列出文件
   - 读取文件
   - 搜索文件

2. **创建操作**
   - 创建新文件
   - 创建新文件夹

3. **简单修改**
   - 修改单个文件的小部分内容
   - 重命名单个文件

4. **用户明确要求**
   - 用户明确说"删除"、"覆盖"等

### 9.3 确认机制实现

```rust
enum OperationType {
    // 需要确认的操作
    DeleteFile,
    DeleteFolder,
    ModifyCriticalFile,
    BatchOperation { count: usize },
    IrreversibleOperation,
    HighRiskOperation,
    
    // 不需要确认的操作
    Query,
    Create,
    SimpleModify,
    UserExplicitlyRequested,
}

fn requires_confirmation(operation: &OperationType, context: &ConversationContext) -> bool {
    match operation {
        OperationType::DeleteFile | 
        OperationType::DeleteFolder |
        OperationType::ModifyCriticalFile |
        OperationType::HighRiskOperation => true,
        
        OperationType::BatchOperation { count } => *count > 10,
        
        OperationType::IrreversibleOperation => {
            // 检查是否覆盖现有文件
            context.will_overwrite_existing()
        }
        
        OperationType::UserExplicitlyRequested => false,
        
        _ => false,
    }
}
```

---

## 十、循环检测和任务完成度机制

### 10.1 循环检测机制

**目的**：防止AI陷入无限循环，确保对话流程可控

**检测策略**：

1. **内容重复检测**
   - 比较最近N次回复的文本内容
   - 检测完全相同的回复
   - 检测语义重复（关键短语重复）

2. **工具调用循环检测**
   - 检测相同工具在短时间内重复调用
   - 检测工具调用参数完全相同
   - 检测工具调用结果相同

3. **状态循环检测**
   - 检测对话状态在相同状态间反复切换
   - 检测强制继续次数超过限制

**循环处理策略**：
```rust
const MAX_FORCE_CONTINUE_RETRIES: usize = 5; // 最大强制继续重试次数

// 检查回复内容是否与上次相同（循环检测）
let is_same_as_last_force = last_force_continue_content.as_ref()
    .map(|last| {
        let last_trimmed = last.trim();
        let current_trimmed = new_accumulated_text.trim();
        last_trimmed == current_trimmed || 
        (current_trimmed.contains("我将继续检查所有剩余的文件夹") && 
         current_trimmed.contains("让我逐一检查每个文件夹的内容"))
    })
    .unwrap_or(false);

if is_same_as_last_force {
    eprintln!("⚠️ 检测到循环：回复内容与上次强制继续时相同，停止继续请求");
    continue_loop = false;
}
```

**循环退出条件**：
- 检测到内容重复
- 检测到工具调用循环
- 达到最大循环次数（`MAX_FORCE_CONTINUE_RETRIES = 5`）
- 用户主动取消

### 10.2 任务完成度判断机制

**目的**：准确判断任务是否完成，避免过早结束或无限循环

**任务类型识别**：

1. **文件移动任务**
   - 检测 `move_file` 调用
   - 统计已移动文件数
   - 对比总文件数

2. **递归检查任务**
   - 检测 `list_files` 调用
   - 统计已检查文件夹数
   - 对比总文件夹数

3. **文件分类任务**
   - 检测 `create_folder` 和 `move_file` 调用
   - 检查所有文件是否都已分类

4. **文件读取任务**
   - 检测 `read_file` 调用
   - 检查是否需要总结内容

**任务完成度判断**：
```rust
// 分析任务完成度，生成任务进度提示
let task_progress = analyze_task_progress(&tool_results);

// 检查任务是否完成
let task_incomplete = !task_progress.is_empty() && 
    task_progress.contains("还有") && 
    task_progress.contains("个文件需要处理");

let task_completed = !task_progress.is_empty() && 
    task_progress.contains("任务完成确认");

// 检查是否是"检查所有文件夹"任务未完成
let check_folders_incomplete = !task_progress.is_empty() && 
    task_progress.contains("检查所有文件夹任务进度") && 
    task_progress.contains("还需要检查");
```

**任务完成确认机制**：
- 任务完成后，要求AI做工作总结
- 检查总结内容是否完整
- 如果总结不完整，继续要求AI完成总结

### 10.3 多轮工具调用循环机制

**目的**：支持复杂任务的多轮工具调用，确保任务完整执行

**循环触发条件**：

1. **工具调用触发**
   - 检测到工具调用时，继续循环等待工具结果
   - 工具调用完成后，AI继续回复

2. **任务未完成触发**
   - 任务完成度判断显示未完成时，继续循环
   - 生成强制继续消息，要求AI继续执行

3. **总结要求触发**
   - 任务完成但需要总结时，继续循环
   - 要求AI提供工作总结

**循环控制机制**：
```rust
// 继续处理新的流式响应（支持多轮工具调用）
let mut continue_loop = true;
let mut new_tool_results: Vec<(String, String, ToolResult)> = Vec::new();
let mut new_accumulated_text = String::new();

while continue_loop {
    continue_loop = false; // 默认不继续循环，除非有工具调用
    
    // 处理流式响应
    while let Some(result) = new_stream.next().await {
        match result {
            Ok(chunk) => {
                match chunk {
                    ChatChunk::Text(text) => {
                        // 累积文本
                        new_accumulated_text.push_str(&text);
                    }
                    ChatChunk::ToolCall { id, name, arguments, is_complete } => {
                        if is_complete {
                            // 执行工具调用
                            // 标记需要继续循环
                            continue_loop = true;
                        }
                    }
                }
            }
            Err(e) => {
                // 错误处理
                break;
            }
        }
    }
    
    // 检查任务是否完成
    if task_incomplete {
        // 任务未完成，继续循环
        continue_loop = true;
    }
}
```

**循环退出条件**：
- 任务完成（任务完成度判断显示已完成）
- 达到最大次数（超过 `MAX_FORCE_CONTINUE_RETRIES` 限制）
- 检测到循环（循环检测机制检测到重复行为）
- 用户取消（用户主动取消对话）

### 10.4 强制继续机制

**目的**：确保任务不中断，强制AI继续执行未完成的任务

**强制继续触发条件**：

1. **任务未完成**
   - 任务完成度判断显示未完成
   - 生成强制继续消息

2. **回复不完整**
   - 回复内容太短（< 100字符）
   - 回复没有以标点符号结尾
   - 回复缺少结束标记

3. **递归检查未完成**
   - 用户要求递归检查但未检查完所有文件夹
   - 检测到文件夹数量与调用次数不匹配

**强制继续消息生成**：
```rust
// 根据任务类型生成不同的强制继续提示
let force_continue_message = if recursive_check_incomplete {
    // 递归检查任务未完成
    format!(
        "{}\n\n**⚠️ 任务未完成警告**：你还没有完成对所有文件夹的检查。\n\n**重要指令**：\n1. 必须使用 list_files 工具检查所有子文件夹\n2. 不要停止，不要结束回复\n3. 必须检查完所有文件夹才能结束\n4. 立即调用 list_files 工具检查剩余的文件夹\n\n**执行要求**：必须调用工具继续检查，不要只回复文本。",
        task_progress
    )
} else {
    // 文件移动任务未完成
    format!(
        "{}\n\n**⚠️ 任务未完成警告**：检测到还有文件未处理，请立即继续调用 move_file 工具完成剩余文件的移动。\n\n**重要指令**：\n1. 不要停止，不要结束回复\n2. 必须处理完所有文件才能结束\n3. 立即调用 move_file 工具，不要等待\n4. 如果回复被截断，请继续调用工具，不要生成文本回复\n\n**执行要求**：必须调用工具，不要只回复文本。",
        task_progress
    )
};
```

**强制继续次数限制**：
- 最大强制继续次数：`MAX_FORCE_CONTINUE_RETRIES = 5`
- 达到最大次数后，停止继续请求
- 保存当前回复，避免丢失内容

### 10.5 回复完整性检测

**目的**：确保AI回复完整，避免回复被截断或过早结束

**完整性判断标准**：

1. **标点符号结尾**
   - 以句号、问号、感叹号结尾（。. ！! ？?）

2. **结束标记**
   - 包含"已完成"、"完成"、"完毕"、"结束"等关键词

3. **长度检查**
   - 回复长度 >= 100字符（可配置）

4. **语义完整性**
   - 检查回复是否包含完整的句子结构

**完整性检测实现**：
```rust
// 检查 AI 回复是否完整
let trimmed_text = new_accumulated_text.trim();
let reply_complete = trimmed_text.ends_with('。') || trimmed_text.ends_with('.') || 
    trimmed_text.ends_with('！') || trimmed_text.ends_with('!') || 
    trimmed_text.ends_with('？') || trimmed_text.ends_with('?') ||
    new_accumulated_text.contains("已完成") || new_accumulated_text.contains("完成") ||
    new_accumulated_text.contains("完毕") || new_accumulated_text.contains("结束");

// 如果回复不完整（太短且没有以标点符号结尾），记录警告
let is_reply_too_short = new_accumulated_text.len() < 100 && !reply_complete;
if is_reply_too_short && !task_really_incomplete {
    eprintln!("⚠️ 警告：回复内容可能不完整（长度={}，未以标点符号结尾），但流已结束，保存当前回复", new_accumulated_text.len());
}
```

**不完整回复处理**：
- **记录警告**：记录不完整回复的警告日志
- **继续请求**：如果任务未完成，继续请求AI完成回复
- **保存当前回复**：如果达到最大次数，保存当前回复避免丢失

### 10.6 总结触发机制

**目的**：任务完成后要求AI提供工作总结，提升用户体验

**总结触发条件**：

1. **任务完成**
   - 任务完成度判断显示已完成
   - 检查是否有总结内容

2. **用户要求总结**
   - 用户消息中包含"总结"、"概述"、"写了什么"等关键词
   - 调用了 `read_file` 且用户要求了解内容

**总结内容检查**：
```rust
// 检查是否调用了 read_file 且用户要求总结内容
let has_read_file = all_tool_results.iter().any(|(_, name, _)| name == "read_file");
let user_asks_for_summary = last_user_message
    .map(|m| {
        let content_lower = m.content.to_lowercase();
        content_lower.contains("写了什么") || 
        content_lower.contains("内容是什么") || 
        content_lower.contains("总结") || 
        content_lower.contains("概述")
    })
    .unwrap_or(false);

// 检查是否有总结内容
let has_summary = new_accumulated_text.len() > 50 && (
    new_accumulated_text.contains("总结") || 
    new_accumulated_text.contains("完成") ||
    new_accumulated_text.contains("已处理") ||
    new_accumulated_text.contains("主要内容") ||
    new_accumulated_text.contains("关键信息")
);

if (task_completed || needs_summary_for_read) && !has_summary {
    // 要求AI做总结
    continue_loop = true;
    // 添加总结要求消息
}
```

**总结请求生成**：
- **任务完成总结**：要求AI提供工作总结（完成的工作、执行逻辑、执行效果、下一步建议）
- **文件内容总结**：要求AI提供文件内容总结（主要内容、关键信息、文件特点）

---

## 十一、上下文截断和Token管理

### 11.1 Token估算机制

**目的**：准确估算Token使用量，防止Token超限

**估算方法**：
```rust
// 简单估算：1 token ≈ 4 字符（中文和英文混合）
let total_chars: usize = current_messages.iter().map(|m| m.content.len()).sum();
let estimated_tokens = total_chars / 4;

// 安全边界：保留20%的Token预算给响应
let max_context_tokens = (model_config.max_tokens * 10).min(30000);
```

**精确估算**（如果可用）：
- 使用Tokenizer库进行精确估算
- 根据模型类型选择对应的Tokenizer

### 11.2 上下文截断策略

**目的**：防止Token超限，确保对话可以继续

**截断触发条件**：
- 估算Token数超过模型限制
- 检测到Token超限错误

**截断策略**：
```rust
if estimated_tokens > max_context_tokens {
    eprintln!("⚠️ 消息历史过长（估算 {} tokens），截断以预防Token超限", estimated_tokens);
    // 保留系统消息（第一条）和最后10条消息
    if current_messages.len() > 11 {
        let system_msg = current_messages.remove(0);
        let recent_count = 10.min(current_messages.len());
        let recent_msgs: Vec<ChatMessage> = current_messages
            .drain(current_messages.len().saturating_sub(recent_count)..)
            .collect();
        current_messages.clear();
        current_messages.push(system_msg);
        current_messages.extend(recent_msgs);
    }
}
```

**优先级保留**：
1. **系统消息**：始终保留第一条系统消息
2. **最近消息**：保留最后N条消息（N=10，可配置）
3. **关键消息**：保留包含工具调用结果的消息
4. **引用内容**：保留用户引用的内容

### 11.3 Token超限重试机制

**目的**：Token超限时自动截断并重试

**重试流程**：
```rust
let mut retry_count = 0;
let max_retries = 2;
let mut stream_result = loop {
    match provider.chat_stream(&current_messages, &model_config, &mut cancel_rx, tool_definitions.as_deref()).await {
        Ok(stream) => {
            break Ok(stream);
        }
        Err(e) => {
            let error_str = e.to_string();
            // 检测Token超限错误
            if error_str.contains("Token超限") || error_str.contains("token") || 
               error_str.contains("length") || error_str.contains("context") ||
               error_str.contains("maximum") || error_str.contains("exceeded") {
                if retry_count < max_retries {
                    retry_count += 1;
                    eprintln!("⚠️ Token超限，尝试截断消息历史（第 {} 次重试）", retry_count);
                    // 更激进的截断：只保留系统消息和最后5条消息
                    if current_messages.len() > 6 {
                        let system_msg = current_messages.remove(0);
                        let recent_count = 5.min(current_messages.len());
                        let recent_msgs: Vec<ChatMessage> = current_messages
                            .drain(current_messages.len().saturating_sub(recent_count)..)
                            .collect();
                        current_messages.clear();
                        current_messages.push(system_msg);
                        current_messages.extend(recent_msgs);
                    }
                    continue;
                } else {
                    eprintln!("❌ Token超限，已重试 {} 次仍失败", max_retries);
                    break Err(e);
                }
            } else {
                // 其他错误，直接返回
                break Err(e);
            }
        }
    }
};
```

**重试策略**：
- 第一次重试：保留最后10条消息
- 第二次重试：保留最后5条消息
- 如果仍然失败，提示用户开启新对话或减少引用内容

---

## 十二、边缘情况处理

### 12.1 网络中断恢复

**目的**：处理网络中断，确保对话可以恢复

**中断检测**：
- **连接失败**：检测到连接错误
- **请求超时**：检测到请求超时（默认30秒）
- **流式中断**：检测到流式响应突然中断

**内容保存**：
- 保存已接收的文本内容（`accumulated_text`）
- 保存已完成的工具调用结果（`tool_results`）
- 保存对话状态（`ConversationState`）

**恢复机制**：
- 网络恢复后，从断点继续对话
- 如果工具调用中断，重新执行工具调用
- 如果流式响应中断，继续接收响应

### 12.2 工具调用超时处理

**目的**：处理工具调用超时，避免长时间等待

**超时时间设置**：
- **文件操作**：30秒（文件可能很大）
- **网络操作**：10秒（网络可能很慢）
- **编辑器操作**：5秒（编辑器操作通常很快）

**超时检测**：
```rust
// 记录工具调用开始时间
let start_time = Instant::now();
let timeout = Duration::from_secs(30); // 可配置

// 定期检查是否超时
if start_time.elapsed() > timeout {
    // 取消工具调用
    // 返回超时错误
}
```

**超时处理**：
- **可重试工具**：自动重试（如网络操作）
- **不可重试工具**：返回超时错误，提示用户
- **长时间工具**：提示用户工具执行时间较长，请耐心等待

### 12.3 并发请求处理

**目的**：处理多个标签页同时发送请求的情况

**请求队列管理**：
- 每个标签页有独立的请求队列
- 队列中的请求按顺序处理
- 新请求添加到队列末尾

**请求去重**：
- 检测相同内容的请求（避免重复处理）
- 检测相同工具调用的请求（避免重复执行）

**请求取消机制**：
- 用户取消请求时，停止当前处理
- 清理请求队列中的后续请求
- 保存已处理的内容

### 12.4 上下文长度动态调整

**目的**：根据实际情况动态调整上下文长度

**动态调整策略**：
- **初始阶段**：保留更多历史消息（N=20）
- **中期阶段**：逐步减少历史消息（N=10）
- **后期阶段**：只保留关键消息（N=5）

**调整触发条件**：
- 对话历史超过阈值
- 工具调用结果占用大量Token
- 引用内容过大

---

## 十三、稳定性保障

### 13.1 状态一致性保证

**目的**：确保状态转换的一致性，避免状态不一致

**状态转换原子性**：
- 状态转换前，检查前置条件
- 状态转换中，锁定状态（避免并发修改）
- 状态转换后，验证状态一致性

**状态回滚机制**：
- 记录状态转换历史
- 错误时回滚到上一个稳定状态
- 清理不完整的状态转换

**状态同步机制**：
- 前端和后端状态同步（通过事件）
- 状态不一致时，以后端状态为准
- 定期检查状态一致性

### 13.2 资源限制管理

**目的**：防止资源耗尽，确保系统稳定运行

**内存管理**：
- 限制对话历史大小（最多保留N条消息，N=50）
- 限制工具调用结果大小（大结果只保留摘要）
- 定期清理不必要的数据

**CPU管理**：
- 限制并发工具调用数量（最多N个并发，N=3）
- 限制工具调用频率（每秒最多N次，N=10）
- 长时间工具调用异步处理

**网络管理**：
- 限制API调用频率（每秒最多N次，N=5）
- 限制并发请求数量（最多N个并发，N=3）
- 实现请求队列（避免突发请求）

### 13.3 日志和监控

**目的**：记录关键操作，便于调试和优化

**关键操作日志**：
- 状态转换日志（记录状态转换前后）
- 工具调用日志（记录工具调用参数和结果）
- 错误处理日志（记录错误类型和处理策略）
- 循环检测日志（记录循环检测结果）

**性能监控**：
- 响应时间监控（首次响应时间、流式响应延迟）
- 资源占用监控（内存占用、CPU占用）
- 工具调用性能监控（工具调用耗时）

**错误监控**：
- 错误类型统计（网络错误、API错误、工具调用错误）
- 错误频率统计（错误发生频率）
- 错误恢复成功率（错误恢复成功/失败比例）

---

## 十四、鲁棒性保障

### 14.1 异常边界处理

**目的**：捕获所有未处理的异常，确保系统不会崩溃

**顶层异常捕获**：
- 在关键入口点捕获异常
- 记录异常详细信息（堆栈、上下文）
- 尝试恢复或降级处理

**异常分类处理**：
- **致命异常**：无法恢复，提示用户
- **可恢复异常**：自动重试或修复
- **部分可恢复异常**：尝试替代方案

**异常恢复机制**：
- 尝试恢复到上一个稳定状态
- 清理不完整的状态转换
- 保存已处理的内容

### 14.2 数据验证和清理

**目的**：确保数据有效性，防止无效数据影响系统

**输入数据验证**：
- 用户消息验证（检查消息格式、长度）
- 工具调用参数验证（检查参数类型、范围）
- 引用内容验证（检查引用内容格式、大小）

**输出数据验证**：
- AI回复验证（检查回复格式、长度）
- 工具调用结果验证（检查结果格式、完整性）
- 状态数据验证（检查状态数据一致性）

**数据清理**：
- 清理无效数据（格式错误、内容为空）
- 清理过期数据（超过保留期限的对话历史）
- 清理重复数据（重复的消息、工具调用）

### 14.3 降级处理策略

**目的**：在功能不可用时提供替代方案

**功能降级**：
- **工具调用失败**：提示用户手动操作
- **上下文过长**：使用摘要代替完整内容
- **网络错误**：使用缓存数据（如果有）

**性能降级**：
- **响应慢**：降低流式响应频率
- **资源占用高**：减少并发请求
- **工具调用慢**：提示用户等待或取消

**质量降级**：
- **AI回复质量差**：提示用户重新提问
- **工具调用结果不准确**：提示用户检查结果
- **上下文理解错误**：提示用户澄清需求

---

## 十五、实施计划

### 10.1 第一阶段：核心框架（1-2周）

1. **实现对话状态管理**
   - 定义对话状态枚举
   - 实现对话管理器
   - 实现状态转换规则

2. **实现流式响应处理**
   - 流式文本处理
   - 工具调用检测
   - 去重机制

3. **实现基本的异常处理框架**
   - 定义异常类型
   - 实现三阶段错误处理策略
   - 实现替代方案查找

### 10.2 第二阶段：主要功能（2-3周）

1. **实现上下文管理**
   - 多层提示词构建
   - 上下文长度管理
   - 智能截断

2. **实现工具调用处理**
   - 工具调用执行
   - 状态显示
   - 错误处理

3. **实现用户确认机制**
   - 确认规则判断
   - 确认UI展示
   - 确认结果处理

### 10.3 第三阶段：优化和完善（1-2周）

1. **完善异常处理机制**
   - 文件过大处理
   - 上下文过长处理
   - 权限问题处理

2. **实现循环检测和重试管理**
   - 智能循环检测
   - 重试管理器
   - 退避策略

3. **优化用户体验**
   - 友好的错误提示
   - 清晰的进度显示
   - 流畅的操作体验

---

## 十六、总结

### 16.1 核心设计思想

1. **对话流驱动**：以对话流为核心，而非任务执行
2. **状态简化**：对话状态管理，而非复杂的任务状态机
3. **自然交互**：工具调用融入对话，而非独立系统
4. **统一异常处理**：三阶段错误处理策略（重试 → 替代方案 → 用户决策）
5. **智能的用户确认**：参考Cursor IDE，关键操作需要确认

### 16.2 预期效果

通过这个架构，我们可以：
- ✅ 避免无限循环和不可控行为
- ✅ 优雅处理各种边缘情况
- ✅ 提供清晰的错误提示和建议
- ✅ 保持代码的可维护性和可扩展性
- ✅ 提供流畅的用户体验

### 16.3 与Binder的集成

### 16.4 关键机制总结

**已补充的关键机制**：

1. **循环检测机制**（第10.1节）
   - 内容重复检测
   - 工具调用循环检测
   - 状态循环检测
   - 循环退出条件

2. **任务完成度判断机制**（第10.2节）
   - 任务类型识别
   - 任务进度分析
   - 任务完成度判断
   - 任务完成确认机制

3. **多轮工具调用循环机制**（第10.3节）
   - 循环触发条件
   - 循环控制机制
   - 循环退出条件

4. **强制继续机制**（第10.4节）
   - 强制继续触发条件
   - 强制继续消息生成
   - 强制继续次数限制

5. **回复完整性检测**（第10.5节）
   - 完整性判断标准
   - 不完整回复处理

6. **总结触发机制**（第10.6节）
   - 总结触发条件
   - 总结内容检查
   - 总结请求生成

7. **上下文截断和Token管理**（第11节）
   - Token估算机制
   - 上下文截断策略
   - Token超限重试机制

8. **边缘情况处理**（第12节）
   - 网络中断恢复
   - 工具调用超时处理
   - 并发请求处理
   - 上下文长度动态调整

9. **稳定性保障**（第13节）
   - 状态一致性保证
   - 资源限制管理
   - 日志和监控

10. **鲁棒性保障**（第14节）
    - 异常边界处理
    - 数据验证和清理
    - 降级处理策略

**这个机制是Binder层次三的一个子系统**：
- 负责管理层次三的对话流程
- 与Binder的其他模块（文件系统、编辑器等）协作
- 不涉及层次一、二的功能
- 可以借鉴通用框架的思路，但以Binder需求为准

---

**文档版本**：v1.2  
**创建日期**：2025年  
**最后更新**：2025-12-29  
**设计目标**：Binder层次三的系统工作机制设计  
**更新说明**：
- v1.1 版本添加了提示词设计原则章节（8.3）和当前代码实现的提示词内容章节（8.4），包括格式要求、回复样式要求、禁止性提示词，以及优化后的提示词内容
- v1.2 版本针对实际测试中发现的问题，添加了意图识别与执行聚焦原则（8.3.3）、工具调用失败处理原则（8.3.4）、回复简洁性要求（8.3.5），并强化了格式要求和禁止性要求

