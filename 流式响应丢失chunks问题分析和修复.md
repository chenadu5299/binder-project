# 流式响应只返回第一个 chunk 导致后续内容丢失的问题

## 问题描述

用户报告：AI 回复只有两个字（"你好"）就结束了，明显是有问题的。

## 根本原因

在 `src-tauri/src/services/ai_providers/deepseek.rs` 的流式处理逻辑中：

1. **一个 bytes chunk 可能包含多个 SSE 行**：网络传输时，多个 SSE 行可能被打包在一个 HTTP chunk 中
2. **当前逻辑收集了多个 chunks**：代码处理所有 SSE 行，并将每个 content delta 收集到 `result_chunks` 中
3. **但只返回第一个 chunk**：第 624-642 行的逻辑只返回第一个非空的 chunk，导致后续的 chunks 丢失

### 问题代码

```rust
// 收集了多个 chunks
let mut result_chunks: Vec<ChatChunk> = Vec::new();
// ... 处理所有 SSE 行，添加到 result_chunks ...

// 但只返回第一个
if !result_chunks.is_empty() {
    if let Some(tool_call) = result_chunks.iter().find(...) {
        Ok(tool_call.clone())  // 只返回第一个工具调用
    } else {
        if let Some(text_chunk) = result_chunks.iter().find(...) {
            Ok(text_chunk.clone())  // 只返回第一个文本 chunk
        }
    }
}
```

## 解决方案

### 已实现的方案：合并所有文本 chunks

由于 `flat_map` 需要 StreamExt trait，且在当前架构下实现较复杂，我们采用了更简单的方案：**合并所有文本 chunks 为一个**。

### 实现逻辑

```rust
// 合并所有文本 chunks 为一个，避免丢失内容
if !result_chunks.is_empty() {
    // 优先返回工具调用
    if let Some(tool_call) = result_chunks.iter().find(|c| matches!(c, ChatChunk::ToolCall { .. })) {
        Ok(tool_call.clone())
    } else {
        // 合并所有文本 chunks 为一个
        let all_text: String = result_chunks.iter()
            .filter_map(|c| {
                if let ChatChunk::Text(text) = c {
                    if !text.is_empty() {
                        Some(text.as_str())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
        
        if !all_text.is_empty() {
            Ok(ChatChunk::Text(all_text))
        } else {
            Ok(ChatChunk::Text(String::new()))
        }
    }
}
```

### 优势

1. **简单直接**：不需要复杂的 Stream 转换
2. **不丢失内容**：所有文本 chunks 都会被合并
3. **保持顺序**：chunks 的顺序会被保留在合并后的文本中

### 注意事项

- 工具调用会优先返回（如果有的话）
- 空的文本 chunks 会被过滤
- 重复检测逻辑保持不变（在添加 chunks 时已经处理）

## 测试建议

请重新测试 AI 聊天窗口，观察：
1. AI 回复是否完整（不再只有两个字）
2. 文本顺序是否正确
3. 是否还有内容丢失的问题

