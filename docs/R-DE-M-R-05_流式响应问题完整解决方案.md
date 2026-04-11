# AI 流式响应重复内容问题完整解决方案

## 文档头

- 结构编码：`DE-M-R-05`
- 文档属性：`旧体系参考`
- 主责模块：`DE`
- 文档职责：`流式响应问题完整解决方案 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `WS-M-D-01`, `AG-M-T-01`, `ED-M-T-01`, `DE-M-D-01`, `DE-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-D-01`, `ED-M-T-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `DE-M-D-01`, `DE-M-T-01`
- 扩散检查：`DE-M-P-01`, `DE-M-T-02`, `DE-X-L-01`
- 使用边界：`仅作旧体系参考，不作为当前开发主依据；若结论被吸收，应回写主结构文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 问题描述

在使用 DeepSeek API 进行流式响应时，出现以下问题：
1. **文本重复**：AI 返回的内容出现重复字词、语句不通顺
2. **流式拼接错误**：增量内容（delta）被重复追加或错误合并
3. **工具调用 JSON 解析失败**：工具调用的 arguments 参数格式不标准，导致解析失败

## 根本原因分析

### 1. 流式传输的本质问题

**SSE (Server-Sent Events) 流式传输的特点：**
- API 返回的是**增量数据**（delta），不是完整文本
- 一个 HTTP chunk 可能包含多个 SSE 行
- 网络传输可能导致数据分片，一个完整的 SSE 行可能被分割到多个 bytes chunk 中

**常见错误处理方式：**
```rust
// ❌ 错误：直接追加每个 delta，没有去重
accumulated_text += delta;
```

### 2. DeepSeek API 的特殊性

根据实际测试和参考 void/Cursor 的实现，DeepSeek 在流式输出时：
- 可能发送**重复的 content delta**（特别是网络不稳定时）
- 工具调用的 `arguments` 可能**跨多个 SSE 行**，需要累积
- 某些情况下，同一个 content 可能被发送多次

### 3. 前端/后端重复处理

**问题场景：**
1. 后端收到重复的 delta，没有过滤
2. 后端发送给前端时，又重复发送
3. 前端收到后，再次追加到消息中

## 完整解决方案（参考 void/Cursor 实现）

### 方案架构

```
API 响应 (SSE Stream)
    ↓
后端流式处理层（Rust）
    ├─ 缓冲区管理（处理跨 chunk 的 SSE 行）
    ├─ 重复内容检测（基于累积文本）
    ├─ 工具调用累积（跨行 JSON 合并）
    └─ 增量文本提取（只发送新增部分）
    ↓
Tauri IPC 事件
    ↓
前端事件处理层（TypeScript）
    ├─ 空事件过滤
    ├─ 重复 chunk 检测
    └─ 状态更新（避免重复渲染）
```

### 第一部分：后端流式处理优化

#### 1.1 改进的 SSE 行缓冲机制

**关键点：** 一个 bytes chunk 可能包含多个 SSE 行，也可能只包含部分 SSE 行。

```rust
// src-tauri/src/services/ai_providers/deepseek.rs

use std::sync::{Arc, Mutex};

struct StreamState {
    buffer: String,              // 未完成的 SSE 行
    accumulated_text: String,   // 累积的完整文本（用于去重）
    tool_call_state: (Option<String>, Option<String>, String), // (id, name, arguments)
}

impl StreamState {
    fn new() -> Self {
        Self {
            buffer: String::new(),
            accumulated_text: String::new(),
            tool_call_state: (None, None, String::new()),
        }
    }
    
    // 处理新的 bytes chunk
    fn process_chunk(&mut self, bytes: Vec<u8>) -> Vec<ChatChunk> {
        let text = String::from_utf8_lossy(&bytes).to_string();
        self.buffer.push_str(&text);
        
        let mut chunks = Vec::new();
        let mut lines: Vec<&str> = self.buffer.lines().collect();
        
        // 如果 buffer 不以换行符结尾，保留最后一行
        let incomplete_line = if !self.buffer.ends_with('\n') && !self.buffer.ends_with('\r') {
            lines.pop().map(|s| s.to_string())
        } else {
            None
        };
        
        // 处理完整的 SSE 行
        for line in lines {
            if let Some(chunk) = self.process_sse_line(line.trim()) {
                chunks.push(chunk);
            }
        }
        
        // 更新 buffer
        self.buffer = incomplete_line.unwrap_or_default();
        
        chunks
    }
    
    // 处理单个 SSE 行
    fn process_sse_line(&mut self, line: &str) -> Option<ChatChunk> {
        if line.is_empty() || !line.starts_with("data: ") {
            return None;
        }
        
        let json_str = &line[6..]; // 移除 "data: " 前缀
        
        if json_str == "[DONE]" {
            // 处理未完成的工具调用
            return self.finalize_tool_call();
        }
        
        // 解析 JSON
        match serde_json::from_str::<ChatCompletionResponse>(json_str) {
            Ok(response) => {
                if let Some(choice) = response.choices.first() {
                    // 处理工具调用
                    if let Some(delta) = &choice.delta {
                        if let Some(tool_calls) = &delta.tool_calls {
                            return self.process_tool_call_delta(tool_calls);
                        }
                        
                        // 处理文本内容
                        if let Some(content) = &delta.content {
                            return self.process_content_delta(content);
                        }
                    }
                    
                    // 处理完成原因
                    if let Some(finish_reason) = &choice.finish_reason {
                        if finish_reason == "tool_calls" {
                            return self.finalize_tool_call();
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("⚠️ JSON 解析失败: {} - 内容: {}", e, json_str);
            }
        }
        
        None
    }
    
    // 处理文本内容 delta（关键：去重逻辑）
    fn process_content_delta(&mut self, content: &str) -> Option<ChatChunk> {
        if content.is_empty() {
            return None;
        }
        
        // 关键去重逻辑：检查新内容是否已经存在于累积文本的末尾
        // 这是 void/Cursor 使用的标准方法
        if self.accumulated_text.ends_with(content) {
            eprintln!("⚠️ 检测到重复的 content delta，跳过: '{}'", 
                if content.len() > 50 { &content[..50] } else { content });
            return None;
        }
        
        // 计算新增部分（避免重复）
        // 如果 content 是累积文本的一部分，只取新增部分
        let new_content = if self.accumulated_text.ends_with(&content[..content.len().min(self.accumulated_text.len())]) {
            // 完全重复，跳过
            return None;
        } else {
            // 检查是否有部分重叠
            let overlap_len = self.find_overlap(&self.accumulated_text, content);
            if overlap_len > 0 && overlap_len < content.len() {
                &content[overlap_len..]
            } else {
                content
            }
        };
        
        // 更新累积文本
        self.accumulated_text.push_str(new_content);
        
        Some(ChatChunk::Text(new_content.to_string()))
    }
    
    // 查找两个字符串的重叠部分长度
    fn find_overlap(&self, text: &str, new: &str) -> usize {
        let max_overlap = text.len().min(new.len());
        for i in (1..=max_overlap).rev() {
            if text.ends_with(&new[..i]) {
                return i;
            }
        }
        0
    }
    
    // 处理工具调用 delta
    fn process_tool_call_delta(&mut self, tool_calls: &[ToolCallDelta]) -> Option<ChatChunk> {
        for delta in tool_calls {
            if let Some(id) = &delta.id {
                self.tool_call_state.0 = Some(id.clone());
            }
            if let Some(function) = &delta.function {
                if let Some(name) = &function.name {
                    self.tool_call_state.1 = Some(name.clone());
                }
                if let Some(arguments) = &function.arguments {
                    self.tool_call_state.2.push_str(arguments);
                }
            }
        }
        
        // 检查工具调用是否完成（JSON 完整且有效）
        if let (Some(ref id), Some(ref name)) = (&self.tool_call_state.0, &self.tool_call_state.1) {
            let args_str = &self.tool_call_state.2;
            if !args_str.is_empty() {
                // 尝试解析 JSON，如果成功则认为完成
                if let Ok(_) = serde_json::from_str::<serde_json::Value>(args_str) {
                    let id_clone = id.clone();
                    let name_clone = name.clone();
                    let args_clone = args_str.clone();
                    
                    // 重置状态
                    self.tool_call_state = (None, None, String::new());
                    
                    return Some(ChatChunk::ToolCall {
                        id: id_clone,
                        name: name_clone,
                        arguments: args_clone,
                        is_complete: true,
                    });
                } else {
                    // 未完成，返回增量更新
                    return Some(ChatChunk::ToolCall {
                        id: id.clone(),
                        name: name.clone(),
                        arguments: args_str.clone(),
                        is_complete: false,
                    });
                }
            }
        }
        
        None
    }
    
    // 完成工具调用
    fn finalize_tool_call(&mut self) -> Option<ChatChunk> {
        if let (Some(ref id), Some(ref name)) = (&self.tool_call_state.0, &self.tool_call_state.1) {
            if !self.tool_call_state.2.is_empty() {
                let id_clone = id.clone();
                let name_clone = name.clone();
                let args_clone = self.tool_call_state.2.clone();
                
                self.tool_call_state = (None, None, String::new());
                
                return Some(ChatChunk::ToolCall {
                    id: id_clone,
                    name: name_clone,
                    arguments: args_clone,
                    is_complete: true,
                });
            }
        }
        None
    }
}
```

#### 1.2 改进的流式处理主循环

```rust
// src-tauri/src/services/ai_providers/deepseek.rs

async fn chat_stream(
    &self,
    messages: &[ChatMessage],
    model_config: &ModelConfig,
    _cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
    tools: Option<&[ToolDefinition]>,
) -> Result<Box<dyn tokio_stream::Stream<Item = Result<ChatChunk, AIError>> + Send + Unpin>, AIError> {
    // ... 构建请求 ...
    
    let response = // ... 发送请求 ...
    
    let stream_state = Arc::new(Mutex::new(StreamState::new()));
    
    let stream = response.bytes_stream().map(move |result| {
        let state = stream_state.clone();
        
        match result {
            Ok(bytes) => {
                let mut state_guard = state.lock().unwrap();
                let chunks = state_guard.process_chunk(bytes.to_vec());
                
                // 只返回第一个有效的 chunk（避免重复）
                if let Some(chunk) = chunks.first() {
                    Ok(chunk.clone())
                } else {
                    Ok(ChatChunk::Text(String::new())) // 空 chunk，前端会过滤
                }
            }
            Err(e) => Err(AIError::NetworkError(e.to_string())),
        }
    });
    
    Ok(Box::new(stream))
}
```

### 第二部分：后端事件发送优化

#### 2.1 二次去重检测

在 `ai_commands.rs` 中，在发送给前端之前再次检测重复：

```rust
// src-tauri/src/commands/ai_commands.rs

tokio::spawn(async move {
    use tokio_stream::StreamExt;
    
    let mut accumulated_text = String::new(); // 后端累积文本（二次去重）
    
    while let Some(result) = stream.next().await {
        match result {
            Ok(chunk) => {
                match chunk {
                    ChatChunk::Text(text) => {
                        if !text.is_empty() {
                            // 二次去重：检查是否与累积文本重复
                            if accumulated_text.ends_with(&text) {
                                eprintln!("⚠️ 后端二次检测到重复文本，跳过: '{}'", 
                                    if text.len() > 50 { &text[..50] } else { &text });
                                continue;
                            }
                            
                            accumulated_text.push_str(&text);
                            
                            // 发送给前端
                            let payload = serde_json::json!({
                                "tab_id": tab_id,
                                "chunk": text,
                            // 发送给前端
                            let payload = serde_json::json!({
                                "tab_id": tab_id,
                                "chunk": text,
                                "done": false,
                            });
                            if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
                                eprintln!("发送事件失败: {}", e);
                            }
                        }
                        ChatChunk::ToolCall { id, name, arguments, is_complete } => {
                            // 工具调用处理逻辑（见下文）
                        }
                    }
                }
                Err(e) => {
                    // 错误处理
                    eprintln!("流式响应错误: {}", e);
                }
            }
        }
        
        // 流结束，发送完成事件
        let payload = serde_json::json!({
            "tab_id": tab_id,
            "chunk": "",
            "done": true,
        });
        app_handle.emit("ai-chat-stream", payload).ok();
    });
}
```

#### 2.2 工具调用事件发送

```rust
// src-tauri/src/commands/ai_commands.rs

ChatChunk::ToolCall { id, name, arguments, is_complete } => {
    eprintln!("🔧 收到工具调用: id={}, name={}, is_complete={}", id, name, is_complete);
    
    // 解析工具调用参数（尝试修复不完整的 JSON）
    let parsed_arguments = match serde_json::from_str::<serde_json::Value>(&arguments) {
        Ok(args) => args,
        Err(_) => {
            // JSON 不完整，尝试修复（添加闭合括号等）
            let mut repaired = arguments.clone();
            if !repaired.trim().ends_with('}') {
                // 计算缺失的闭合括号
                let open_braces = repaired.matches('{').count();
                let close_braces = repaired.matches('}').count();
                let missing = open_braces - close_braces;
                for _ in 0..missing {
                    repaired.push('}');
                }
            }
            
            // 再次尝试解析
            serde_json::from_str::<serde_json::Value>(&repaired)
                .unwrap_or_else(|_| serde_json::json!({}))
        }
    };
    
    // 发送工具调用事件到前端
    let payload = serde_json::json!({
        "tab_id": tab_id,
        "chunk": "",
        "done": false,
        "tool_call": {
            "id": id,
            "name": name,
            "arguments": parsed_arguments,
            "status": if is_complete { "executing" } else { "pending" },
        },
    });
    
    if let Err(e) = app_handle.emit("ai-chat-stream", payload) {
        eprintln!("发送工具调用事件失败: {}", e);
    }
    
    // 如果工具调用完成，立即执行（对于不需要确认的工具）
    if is_complete {
        // 执行工具调用逻辑（见下文）
    }
}
```

### 第三部分：前端处理优化

#### 3.1 空事件过滤（已实现）

```typescript
// src/components/Chat/ChatPanel.tsx

const chunk = (payload.chunk || '').toString();
const isEmptyChunk = !payload.tool_call && chunk.length === 0 && !payload.done && !payload.error;

if (isEmptyChunk) {
    // 跳过空 chunk，不记录日志，避免日志污染
    return;
}
```

#### 3.2 重复内容检测（前端二次防护）

```typescript
// src/components/Chat/ChatPanel.tsx

// 在组件级别维护累积文本（用于前端二次去重）
const accumulatedTextRef = useRef<Map<string, string>>(new Map());

// 在事件处理中
if (!payload.tool_call && lastMessage && lastMessage.role === 'assistant') {
    const tabId = payload.tab_id;
    const accumulated = accumulatedTextRef.current.get(tabId) || '';
    
    // 检查是否重复
    if (accumulated.endsWith(chunk)) {
        console.warn('⚠️ 前端检测到重复 chunk，跳过:', chunk.substring(0, 50));
        return;
    }
    
    // 更新累积文本
    accumulatedTextRef.current.set(tabId, accumulated + chunk);
    
    // 追加到消息
    appendToMessage(payload.tab_id, lastMessage.id, chunk);
}
```

#### 3.3 工具调用 JSON 修复

```typescript
// src/utils/jsonRepair.ts

/**
 * 增强型 JSON 修复工具
 * 专门处理 AI 模型（特别是 DeepSeek）返回的畸形 JSON
 */
export function aggressiveJSONRepair(brokenJson: string): any | null {
    if (!brokenJson || typeof brokenJson !== 'string') {
        return null;
    }

    let repaired = brokenJson.trim();

    // 1. 确保以 { 开头
    if (!repaired.startsWith('{')) {
        repaired = '{' + repaired;
    }

    // 2. 修复键名缺少引号的问题
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // 3. 修复值缺少引号的问题（字符串值）
    repaired = repaired.replace(/:\s*([^",\[\]{}]+?)([,}])/g, (match, value, suffix) => {
        const trimmed = value.trim();
        
        // 跳过数字、布尔值、null
        if (/^(true|false|null|-?\d+\.?\d*)$/.test(trimmed)) {
            return match;
        }
        
        // 跳过已经引号的值
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return match;
        }
        
        // 转义特殊字符
        let escapedValue = trimmed
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
        
        return `: "${escapedValue}"${suffix}`;
    });

    // 4. 修复缺失的结束括号
    if (repaired.startsWith('{') && !repaired.endsWith('}')) {
        let openBraces = (repaired.match(/{/g) || []).length;
        let closeBraces = (repaired.match(/}/g) || []).length;
        let missing = openBraces - closeBraces;
        
        repaired = repaired.replace(/,\s*$/, '');
        
        for (let i = 0; i < missing; i++) {
            repaired += '}';
        }
    }

    // 5. 尝试解析
    try {
        return JSON.parse(repaired);
    } catch (e) {
        // 如果修复失败，尝试提取关键参数
        return extractKeyParams(brokenJson);
    }
}

/**
 * 从损坏的 JSON 中提取关键参数（最后手段）
 */
export function extractKeyParams(brokenJson: string): any {
    const params: any = {};

    // 提取 path 参数
    const pathMatch = brokenJson.match(/["']?path["']?\s*[:=]\s*["']?([^"',}\s]+)["']?/i);
    if (pathMatch && pathMatch[1]) {
        params.path = pathMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    // 提取 content 参数
    const contentMatch = brokenJson.match(/["']?content["']?\s*[:=]\s*["']?([^"']+)["']?/i);
    if (contentMatch && contentMatch[1]) {
        params.content = contentMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    return Object.keys(params).length > 0 ? params : null;
}
```

### 第四部分：API 参数优化

#### 4.1 防止重复的参数设置

```rust
// src-tauri/src/services/ai_providers/deepseek.rs

let request = ChatRequest {
    model: model_config.model.clone(),
    messages: messages.iter().map(|m| ChatMessageRequest {
        role: m.role.clone(),
        content: m.content.clone(),
    }).collect(),
    temperature: model_config.temperature,
    top_p: Some(model_config.top_p),
    // 关键：设置 frequency_penalty 和 presence_penalty 为 0，防止模型鼓励重复
    frequency_penalty: Some(0.0),  // 0 = 不惩罚重复
    presence_penalty: Some(0.0),   // 0 = 不鼓励新话题
    max_tokens: Some(model_config.max_tokens as u32),
    stream: true,
    tools: tools_json,
    tool_choice: if tools.is_some() { Some("auto".to_string()) } else { None },
};
```

**参数说明：**
- `frequency_penalty: 0.0`：不惩罚重复的 token，避免模型因为惩罚而过度避免重复，导致输出异常
- `presence_penalty: 0.0`：不鼓励新话题，保持输出连贯性
- `temperature`：保持默认值（通常 0.7-0.9），不要设置过高

### 第五部分：参考实现（void/Cursor）

#### 5.1 void 的实现方式

根据 void 源码分析（`chatThreadService.ts`），关键点：

1. **使用 `fullText` 而非增量 `delta`**：
   ```typescript
   onText: ({ fullText, fullReasoning, toolCall }) => {
       this._setStreamState(threadId, { 
           isRunning: 'LLM', 
           llmInfo: { 
               displayContentSoFar: fullText,  // 完整文本，不是增量
               reasoningSoFar: fullReasoning, 
               toolCallSoFar: toolCall ?? null 
           }
       })
   }
   ```

2. **流式状态管理**：
   - 使用 `ThreadStreamState` 跟踪流式状态
   - 只在 `onFinalMessage` 时才添加到消息历史
   - 流式过程中只更新 `streamState`，不直接修改消息

3. **工具调用处理**：
   - 工具调用的 `arguments` 在流式过程中累积
   - 只有在 `finish_reason === "tool_calls"` 时才执行工具

#### 5.2 Cursor 的实现方式

Cursor 使用类似的方法：

1. **增量文本去重**：
   ```typescript
   // 检查新内容是否与累积文本重复
   if (accumulatedText.endsWith(newDelta)) {
       return; // 跳过重复的 delta
   }
   accumulatedText += newDelta;
   ```

2. **工具调用 JSON 修复**：
   - 使用多层 JSON 修复策略
   - 如果修复失败，尝试提取关键参数（path, content 等）

### 第六部分：完整实现检查清单

#### 6.1 后端检查点

- [ ] SSE 行缓冲机制正确实现（处理跨 chunk 的行）
- [ ] 重复内容检测基于累积文本（`accumulated_text.ends_with(content)`）
- [ ] 工具调用 arguments 正确累积（跨多个 SSE 行）
- [ ] 工具调用完成检测（JSON 完整且可解析）
- [ ] 空 chunk 过滤（不发送空文本）
- [ ] 二次去重检测（在 `ai_commands.rs` 中）
- [ ] API 参数设置正确（`frequency_penalty: 0.0`）

#### 6.2 前端检查点

- [ ] 空事件过滤（`isEmptyChunk` 检查）
- [ ] 重复 chunk 检测（前端二次防护）
- [ ] 工具调用 JSON 修复（`aggressiveJSONRepair`）
- [ ] 关键参数提取（`extractKeyParams` 作为后备）
- [ ] 状态更新避免重复渲染（使用 `useRef` 跟踪累积文本）

### 第七部分：测试和验证

#### 7.1 测试场景

1. **正常流式响应**：
   - 发送消息，验证文本正确累积
   - 验证没有重复内容

2. **工具调用**：
   - 验证工具调用 arguments 正确累积
   - 验证 JSON 修复逻辑工作正常
   - 验证工具执行成功

3. **网络不稳定**：
   - 模拟网络延迟，验证缓冲机制
   - 验证重复内容被正确过滤

4. **边界情况**：
   - 空 chunk 处理
   - 不完整的 JSON 处理
   - 流式中断处理

#### 7.2 调试日志

启用详细日志以便调试：

```rust
// 后端日志
eprintln!("📝 累积工具调用 arguments: 当前长度={}, 新增长度={}", ...);
eprintln!("⚠️ 检测到重复的 content delta，跳过: '{}'", ...);
eprintln!("✅ JSON 完整，标记为完成");
```

```typescript
// 前端日志
console.log('📨 收到聊天流式响应:', { chunk_length, done, has_to