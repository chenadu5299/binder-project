# AI 三层架构设计文档

## 架构概述（再加一层，修改识别）

Binder 的 AI 功能采用三层独立架构，确保各功能互不干扰、逻辑清晰、功能稳定。

## 三层功能定义

### 1. 自动补全（Auto-completion）
- **触发方式**：自动触发（光标停留 7 秒）
- **交互方式**：无 UI，幽灵文字显示
- **功能**：自动续写文本
- **状态管理**：独立的 `useAutoComplete` hook
- **后端命令**：`ai_autocomplete`

### 2. Inline Assist（Cmd+K）
- **触发方式**：快捷键 Cmd+K
- **交互方式**：对话框 + Diff 视图
- **功能**：根据指令修改选中文本
- **状态管理**：独立的 `useInlineAssist` hook
- **后端命令**：`ai_inline_assist`

### 3. 聊天窗口（Full Chat）
- **触发方式**：用户主动发送消息
- **交互方式**：完整的聊天界面
- **功能**：对话、编辑文档、文件操作等
- **状态管理**：Zustand store (`useChatStore`)
- **后端命令**：`ai_chat_stream`（流式响应）

## 架构设计原则

### 1. 独立性原则
- 每个功能有独立的状态管理
- 每个功能有独立的后端命令
- 功能之间不共享状态（除了共享的 AIService）

### 2. 共享资源管理
- **AIService**：所有功能共享同一个 `AIServiceState`
- **Provider 选择**：每个功能独立选择提供商（优先 DeepSeek）
- **API Key 管理**：统一的 `APIKeyManager`

### 3. 错误处理
- 每个功能有独立的错误处理逻辑
- 网络错误自动重试（最多 3 次）
- 错误不影响其他功能

## 实现细节

### 后端架构

```
AIService (全局单例)
├── providers: HashMap<String, Arc<dyn AIProvider>>
│   ├── "openai" -> OpenAIProvider
│   └── "deepseek" -> DeepSeekProvider
├── queue: AIRequestQueue
└── key_manager: APIKeyManager

Commands:
├── ai_autocomplete -> 直接调用 provider.autocomplete()
├── ai_inline_assist -> 直接调用 provider.inline_assist()
└── ai_chat_stream -> 调用 provider.chat_stream()，流式返回
```

### 前端架构

```
自动补全层：
useAutoComplete hook
  └── 监听编辑器事件
  └── 7 秒后触发
  └── 调用 ai_autocomplete
  └── 显示幽灵文字

Inline Assist 层：
useInlineAssist hook
  └── Cmd+K 快捷键触发
  └── 调用 ai_inline_assist
  └── 显示 Diff 视图

聊天层：
useChatStore (Zustand)
  └── 监听 ai-chat-stream 事件
  └── 调用 ai_chat_stream
  └── 实时更新消息
```

## 关键修复点

### 1. API Key 保存后注册提供商
- **问题**：保存 DeepSeek API key 后，提供商没有被注册
- **修复**：`ai_save_api_key` 现在支持注册 OpenAI 和 DeepSeek

### 2. 聊天事件监听
- **问题**：事件监听在 store 中初始化，可能导致问题
- **修复**：在 `ChatPanel` 组件中初始化，确保正确清理

### 3. HTTP/2 连接错误
- **问题**：DeepSeek API 不支持 HTTP/2
- **修复**：强制使用 HTTP/1.1

### 4. 重试机制
- **问题**：网络错误导致功能失败
- **修复**：所有功能都添加了重试机制（最多 3 次）

## 测试检查清单

### 自动补全
- [ ] 输入文字后，光标停留 7 秒，显示幽灵文字
- [ ] 按 Tab 接受补全
- [ ] 按 Escape 取消补全
- [ ] 网络错误时自动重试

### Inline Assist
- [ ] 选中文本后按 Cmd+K，弹出对话框
- [ ] 输入指令并执行，显示 Diff 视图
- [ ] 接受/拒绝修改
- [ ] 网络错误时自动重试

### 聊天窗口
- [ ] 发送消息后，收到流式响应
- [ ] 消息实时更新
- [ ] 网络错误时显示错误信息
- [ ] 可以切换模型

## 注意事项

1. **不要共享状态**：三个功能的状态管理完全独立
2. **事件监听清理**：确保组件卸载时清理事件监听
3. **错误隔离**：一个功能的错误不应影响其他功能
4. **Provider 选择**：每个功能独立选择，优先 DeepSeek

