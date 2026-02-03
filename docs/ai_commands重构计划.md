# ai_commands.rs 重构计划

## 重构目标

根据《Binder层次三AI工作机制系统设计.md》，将当前的2942行代码重构为模块化架构。

## 当前代码结构

- `ai_chat_stream` 函数：2942行，包含所有逻辑
- 内联的工具调用处理
- 内联的错误处理
- 内联的状态管理

## 目标架构

使用新创建的模块：
- `ConversationManager`：对话状态管理
- `StreamingResponseHandler`：流式响应处理
- `ContextManager`：上下文管理
- `ToolCallHandler`：工具调用处理
- `ExceptionHandler`：异常处理
- `LoopDetector`：循环检测
- `ReplyCompletenessChecker`：回复完整性检测
- `ConfirmationManager`：用户确认管理
- `TaskProgressAnalyzer`：任务完成度分析

## 重构步骤

### 第一步：引入新模块（已完成）
- ✅ 创建所有核心模块
- ✅ 在mod.rs中注册模块

### 第二步：重构流式响应处理
- 使用 `StreamingResponseHandler` 处理文本chunk
- 使用 `StreamingResponseHandler::detect_tool_call` 检测工具调用
- 移除内联的去重逻辑

### 第三步：重构工具调用处理
- 使用 `ToolCallHandler::parse_tool_arguments` 解析参数
- 使用 `ToolCallHandler::execute_tool_with_retry` 执行工具调用
- 使用 `ConfirmationManager::requires_confirmation` 检查是否需要确认

### 第四步：重构状态管理
- 使用 `ConversationManager` 管理对话状态
- 实现状态转换逻辑
- 移除内联的状态管理代码

### 第五步：重构任务完成度判断
- 使用 `TaskProgressAnalyzer::analyze` 分析任务完成度
- 移除内联的 `analyze_task_progress` 函数调用
- 使用 `TaskProgressAnalyzer` 的判断方法

### 第六步：重构循环检测
- 使用 `LoopDetector::detect_content_repetition` 检测内容重复
- 使用 `LoopDetector::detect_tool_call_loop` 检测工具调用循环
- 使用 `LoopDetector::check_max_force_continue_retries` 检查重试次数

### 第七步：重构回复完整性检测
- 使用 `ReplyCompletenessChecker::is_complete` 检查回复完整性
- 使用 `ReplyCompletenessChecker::has_summary` 检查是否有总结

### 第八步：重构异常处理
- 使用 `ExceptionHandler::handle_error` 处理错误
- 实现三阶段错误处理策略
- 移除内联的错误处理逻辑

### 第九步：重构上下文管理
- 使用 `ContextManager::build_multi_layer_prompt` 构建提示词
- 使用 `ContextManager::should_truncate` 检查是否需要截断
- 使用 `ContextManager::truncate_messages` 截断消息历史

### 第十步：清理和优化
- 移除未使用的代码
- 优化代码结构
- 添加注释和文档

## 注意事项

1. **保持向后兼容**：确保重构后的代码功能与原来一致
2. **逐步重构**：每次重构一小部分，确保可以编译通过
3. **充分测试**：每个步骤都要测试，确保功能正常
4. **保留日志**：保留原有的日志输出，便于调试

