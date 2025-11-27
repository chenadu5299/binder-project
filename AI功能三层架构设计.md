# Binder AI 功能三层架构设计

## 文档目的

明确 Binder 应用中三种 AI 功能的边界、实现方式和交互逻辑，确保架构清晰、实现独立。

---

## 一、三层架构概览

Binder 的 AI 功能分为三个独立的层次，每个层次有明确的职责和边界：

```
┌─────────────────────────────────────────────────────────┐
│  层次一：自动补全（自动续写）                              │
│  - 无 UI 窗口，幽灵文字显示                                │
│  - 自动触发（光标悬停）                                    │
│  - 类似代码补全体验                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  层次二：Inline Assist（Cmd+K 快捷键）                    │
│  - 独立输入框（非聊天窗口）                                 │
│  - 快捷键调出                                              │
│  - 反馈直接修改文本区域                                     │
│  - 无对话历史                                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  层次三：右侧聊天窗口                                       │
│  - 完整聊天界面                                             │
│  - 标签栏、记忆库、模型选择                                 │
│  - 对话历史、工具调用                                       │
│  - 可拖拽、可关闭                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 二、层次一：自动补全（自动续写）

### 2.1 功能定位

**核心特性**：
- ✅ **无 UI 窗口**：不占用任何面板空间
- ✅ **自动触发**：用户无需主动调用
- ✅ **幽灵文字**：在光标后方显示半透明的续写内容
- ✅ **非侵入式**：不打断用户写作流程

**类比**：
- 类似 VS Code 的代码补全
- 类似 GitHub Copilot 的代码建议
- 类似 Gmail 的智能撰写

### 2.2 触发机制

**触发条件**：
- 光标在文档中**静止不动**（无输入、无移动）
- 静止时间达到阈值：**5-10 秒**（可配置）
- 光标位置有足够的上下文（至少 100 字符）

**触发逻辑**：
```typescript
// src/hooks/useAutoComplete.ts
export const useAutoComplete = (editor: Editor | null) => {
  const [ghostText, setGhostText] = useState<string | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_THRESHOLD = 5000; // 5秒（可配置）
  
  useEffect(() => {
    if (!editor) return;
    
    // 监听光标位置变化
    const handleSelectionUpdate = () => {
      // 重置计时器
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        setGhostText(null); // 清除之前的幽灵文字
      }
      
      // 开始新的计时
      idleTimerRef.current = setTimeout(async () => {
        const { from } = editor.state.selection;
        
        // 获取光标前的上下文（前 2000 字符）
        const contextStart = Math.max(0, from - 2000);
        const contextBefore = editor.state.doc.textBetween(contextStart, from);
        
        // 调用 AI 生成续写
        const completion = await invoke<string>('ai_autocomplete', {
          context: contextBefore,
          position: from,
          maxLength: 50, // 限制长度
        });
        
        if (completion) {
          setGhostText(completion);
        }
      }, IDLE_THRESHOLD);
    };
    
    // 监听输入事件（重置计时器）
    const handleUpdate = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        setGhostText(null);
      }
    };
    
    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('update', handleUpdate);
    
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('update', handleUpdate);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [editor]);
  
  return { ghostText };
};
```

### 2.3 UI 实现

**幽灵文字显示**：
- 位置：光标正后方
- 样式：半透明灰色文字（opacity: 0.4）
- 字体：与编辑器字体相同
- 长度：建议 20-50 字符（不超过一行）

```typescript
// src/components/Editor/GhostText.tsx
export const GhostText: React.FC<{ text: string; position: number }> = ({ text, position }) => {
  if (!text) return null;
  
  return (
    <span 
      className="ghost-text"
      style={{
        opacity: 0.4,
        color: '#6b7280',
        fontStyle: 'italic',
        pointerEvents: 'none',
      }}
    >
      {text}
    </span>
  );
};
```

**交互方式**：
- **Tab 键**：接受补全，插入幽灵文字
- **继续输入**：自动清除幽灵文字
- **Esc 键**：手动清除幽灵文字
- **光标移动**：自动清除幽灵文字

### 2.4 后端实现

**Rust 后端接口**：
```rust
// src-tauri/src/services/ai_service.rs

#[tauri::command]
pub async fn ai_autocomplete(
    context: String,
    position: usize,
    max_length: usize,
) -> Result<Option<String>, String> {
    // 构建提示词（简洁，只用于续写）
    let prompt = format!(
        "基于以下上下文，续写接下来的内容（不超过{}字）：\n\n{}",
        max_length,
        context
    );
    
    // 调用 AI（使用快速模型，如 GPT-3.5 或本地小模型）
    let response = ai_service
        .complete_fast(&prompt, max_length)
        .await?;
    
    Ok(Some(response))
}
```

### 2.5 边界和限制

**不共享的内容**：
- ❌ 不共享聊天历史
- ❌ 不共享对话上下文
- ❌ 不显示在聊天窗口中

**共享的内容**：
- ✅ 当前文档内容（作为上下文）
- ✅ 系统提示词（"你是一个写作助手"）
- ✅ AI 模型配置（但优先使用快速模型）

**性能考虑**：
- 使用快速模型（GPT-3.5、Claude Haiku 等）
- 限制生成长度（20-50 字符）
- 防抖机制（5-10 秒触发一次）

---

## 三、层次二：Inline Assist（Cmd+K 快捷键）

### 3.1 功能定位

**核心特性**：
- ✅ **独立输入框**：不是聊天窗口，是浮动的输入框
- ✅ **快捷键调出**：只能通过 Cmd+K（或 Ctrl+K）激活
- ✅ **直接修改文本**：反馈直接应用到选中的文本区域
- ✅ **无对话历史**：每次调用都是独立的，不保存历史

**类比**：
- 类似 VS Code 的 Quick Fix（Cmd+.）
- 类似 Cursor 的 Cmd+K 功能
- 类似 Notion 的 / 命令

### 3.2 触发机制

**触发条件**：
- 用户**选中文本**（可选，也可以不选）
- 按下 **Cmd+K**（macOS）或 **Ctrl+K**（Windows/Linux）
- 在光标位置或选中文本位置显示输入框

**触发逻辑**：
```typescript
// src/hooks/useInlineAssist.ts
export const useInlineAssist = (editor: Editor | null) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (!editor) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K 或 Ctrl+K
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        
        // 获取选中的文本
        const { from, to } = editor.state.selection;
        const selected = editor.state.doc.textBetween(from, to);
        
        setSelectedText(selected);
        setIsOpen(true);
        
        // 聚焦输入框
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editor]);
  
  const handleExecute = async () => {
    if (!inputValue.trim()) return;
    
    // 调用 AI 处理
    const result = await invoke<string>('ai_inline_assist', {
      instruction: inputValue,
      selectedText: selectedText,
      context: getEditorContext(editor),
    });
    
    // 直接应用到文本区域
    if (selectedText) {
      // 替换选中的文本
      editor.chain()
        .focus()
        .deleteSelection()
        .insertContent(result)
        .run();
    } else {
      // 在光标位置插入
      editor.chain()
        .focus()
        .insertContent(result)
        .run();
    }
    
    // 关闭输入框
    setIsOpen(false);
    setInputValue('');
  };
  
  return {
    isOpen,
    selectedText,
    inputValue,
    setInputValue,
    inputRef,
    handleExecute,
    setIsOpen,
  };
};
```

### 3.3 UI 实现

**输入框组件**：
- 位置：在选中文本下方或光标位置附近
- 样式：浮动输入框，带边框和阴影
- 内容：单行输入框 + 执行按钮

```typescript
// src/components/Editor/InlineAssistInput.tsx
export const InlineAssistInput: React.FC<{
  isOpen: boolean;
  selectedText: string;
  inputValue: string;
  setInputValue: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onExecute: () => void;
  onClose: () => void;
}> = ({ isOpen, selectedText, inputValue, setInputValue, inputRef, onExecute, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <div className="inline-assist-input" style={{
      position: 'absolute',
      zIndex: 1000,
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      minWidth: '400px',
    }}>
      {selectedText && (
        <div className="selected-text-preview" style={{
          marginBottom: '8px',
          padding: '8px',
          background: '#f3f4f6',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#6b7280',
        }}>
          选中文本：{selectedText.substring(0, 50)}...
        </div>
      )}
      
      <div className="input-group" style={{ display: 'flex', gap: '8px' }}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onExecute();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="输入指令，如：改得更正式、翻译成英文、总结这段文字..."
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
          }}
        />
        <button
          onClick={onExecute}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          执行
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
      
      <div className="hint" style={{
        marginTop: '8px',
        fontSize: '12px',
        color: '#9ca3af',
      }}>
        按 Enter 执行，Esc 取消
      </div>
    </div>
  );
};
```

**Diff 视图（可选）**：
- 如果是指令修改文本，可以显示 Diff 视图
- 红删绿增，对比修改前后
- 用户确认后应用

### 3.4 后端实现

**Rust 后端接口**：
```rust
// src-tauri/src/services/ai_service.rs

#[tauri::command]
pub async fn ai_inline_assist(
    instruction: String,
    selected_text: String,
    context: String,
) -> Result<String, String> {
    // 构建提示词
    let prompt = if selected_text.is_empty() {
        format!(
            "基于以下上下文，执行指令：{}\n\n上下文：\n{}",
            instruction,
            context
        )
    } else {
        format!(
            "对以下文本执行指令：{}\n\n文本：\n{}\n\n上下文：\n{}",
            instruction,
            selected_text,
            context
        )
    };
    
    // 调用 AI
    let response = ai_service
        .complete(&prompt)
        .await?;
    
    Ok(response)
}
```

### 3.5 边界和限制

**不共享的内容**：
- ❌ 不共享聊天历史
- ❌ 不显示在聊天窗口中
- ❌ 不保存对话记录

**共享的内容**：
- ✅ 当前文档内容（作为上下文）
- ✅ 选中文本（作为输入）
- ✅ 系统提示词
- ✅ AI 模型配置

**与层次一的区别**：
- 层次一：自动触发，续写
- 层次二：手动触发（快捷键），执行指令

**与层次三的区别**：
- 层次二：单次操作，无历史
- 层次三：对话式，有历史

---

## 四、层次三：右侧聊天窗口

### 4.1 功能定位

**核心特性**：
- ✅ **完整聊天界面**：有消息列表、输入框、历史记录
- ✅ **对话式交互**：可以多轮对话，保持上下文
- ✅ **工具调用**：可以操作文档、文件等
- ✅ **标签栏**：支持多个聊天会话
- ✅ **记忆库集成**：可以查看记忆项
- ✅ **模型选择**：可以切换不同的 AI 模型

**类比**：
- 类似 ChatGPT 的聊天界面
- 类似 Cursor 的 AI 聊天面板
- 类似 GitHub Copilot Chat

### 4.2 功能模块

#### 4.2.1 聊天标签栏

**功能**：
- 支持多个独立的聊天会话
- 每个标签代表一个聊天线程
- 可以创建、切换、关闭标签

**实现**：
```typescript
// src/components/Chat/ChatTabs.tsx
export const ChatTabs: React.FC = () => {
  const [tabs, setTabs] = useState<ChatTab[]>([
    { id: '1', title: '新聊天', isActive: true },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  
  const createNewTab = () => {
    const newTab: ChatTab = {
      id: Date.now().toString(),
      title: '新聊天',
      isActive: false,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };
  
  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return; // 至少保留一个标签
    
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter(t => t.id !== tabId);
      setActiveTabId(remainingTabs[0].id);
    }
  };
  
  return (
    <div className="chat-tabs">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`chat-tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTabId(tab.id)}
        >
          <span>{tab.title}</span>
          <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>
            ×
          </button>
        </div>
      ))}
      <button onClick={createNewTab}>+</button>
    </div>
  );
};
```

#### 4.2.2 记忆库标签

**功能**：
- 在标签栏中添加记忆库标签（图标：🧠）
- 点击切换到记忆库面板
- 显示记忆项列表和详情

**实现**：
```typescript
// src/components/Chat/MemoryTab.tsx
export const MemoryTab: React.FC = () => {
  return (
    <div className="chat-tab memory-tab">
      <span>🧠 记忆库</span>
    </div>
  );
};
```

#### 4.2.3 模型选择

**功能**：
- 在聊天窗口标题栏显示当前模型
- 点击可以切换模型
- 每个聊天标签可以独立选择模型

**实现**：
```typescript
// src/components/Chat/ModelSelector.tsx
export const ModelSelector: React.FC<{ chatId: string }> = ({ chatId }) => {
  const [currentModel, setCurrentModel] = useState('gpt-4');
  const [isOpen, setIsOpen] = useState(false);
  
  const models = [
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'claude-3', name: 'Claude 3' },
    { id: 'gemini', name: 'Gemini' },
  ];
  
  return (
    <div className="model-selector">
      <button onClick={() => setIsOpen(!isOpen)}>
        {models.find(m => m.id === currentModel)?.name}
      </button>
      {isOpen && (
        <div className="model-dropdown">
          {models.map(model => (
            <div
              key={model.id}
              onClick={() => {
                setCurrentModel(model.id);
                setIsOpen(false);
              }}
            >
              {model.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

#### 4.2.4 引用内容显示

**功能**：
- 当用户在聊天中引用文本或文件时，显示引用内容的缩览
- 点击可以查看完整内容

**实现**：
```typescript
// src/components/Chat/MessageWithReference.tsx
export const MessageWithReference: React.FC<{
  message: ChatMessage;
}> = ({ message }) => {
  return (
    <div className="chat-message">
      {message.references && message.references.length > 0 && (
        <div className="references">
          {message.references.map((ref, idx) => (
            <div key={idx} className="reference-preview">
              {ref.type === 'text' ? (
                <div>
                  <span className="ref-label">引用文本：</span>
                  <span className="ref-content">{ref.content.substring(0, 50)}...</span>
                </div>
              ) : (
                <div>
                  <span className="ref-label">引用文件：</span>
                  <span className="ref-file">{ref.fileName}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="message-content">{message.content}</div>
    </div>
  );
};
```

### 4.3 后端实现

**Rust 后端接口**：
```rust
// src-tauri/src/services/ai_service.rs

#[tauri::command]
pub async fn ai_chat_stream(
    messages: Vec<ChatMessage>,
    context: ChatContext,
    model: String,
) -> Result<(), String> {
    // 构建完整的对话上下文
    let system_prompt = build_system_prompt(&context);
    
    // 调用 AI（流式响应）
    let mut stream = ai_service
        .stream_chat(&model, &system_prompt, &messages)
        .await?;
    
    // 流式返回
    while let Some(chunk) = stream.next().await {
        app_handle.emit("chat-chunk", chunk)?;
    }
    
    Ok(())
}

fn build_system_prompt(context: &ChatContext) -> String {
    format!(
        "你是一个专业的写作助手。\n\n\
        当前文档：{}\n\
        选中文本：{}\n\
        你可以帮助用户编辑文档、回答问题、提供建议等。",
        context.current_file,
        context.selected_text.unwrap_or_default()
    )
}
```

### 4.4 边界和限制

**共享的内容**：
- ✅ 当前文档内容（作为上下文）
- ✅ 选中文本（可以引用）
- ✅ 系统提示词
- ✅ AI 模型配置
- ✅ 记忆库数据

**不共享的内容**：
- ❌ 不共享自动补全的触发逻辑
- ❌ 不共享 Inline Assist 的输入框

**与层次一、二的区别**：
- 层次一、二：单次操作，无历史
- 层次三：对话式，有完整历史记录

---

## 五、三层架构的共享内容

### 5.1 共享的上下文数据

虽然三种功能独立实现，但可以共享以下内容：

1. **当前文档内容**：
   - 自动补全：作为续写上下文
   - Inline Assist：作为指令执行的上下文
   - 聊天窗口：作为对话的上下文

2. **选中文本**：
   - Inline Assist：作为要处理的文本
   - 聊天窗口：可以作为引用内容

3. **系统提示词**：
   - 所有层次都使用相同的系统提示词基础
   - 但可以根据层次调整（自动补全更简洁，聊天更详细）

4. **AI 模型配置**：
   - 所有层次都可以使用相同的模型配置
   - 但自动补全优先使用快速模型

### 5.2 共享的服务接口

**Rust 后端统一接口**：
```rust
// src-tauri/src/services/ai_service.rs

pub struct AIService {
    // 统一的模型管理
    model_manager: ModelManager,
    // 统一的上下文构建
    context_builder: ContextBuilder,
}

impl AIService {
    // 层次一：自动补全
    pub async fn autocomplete(&self, context: &str) -> Result<String, Error> {
        // 使用快速模型
        self.model_manager.get_fast_model()
            .complete(context, max_length: 50)
            .await
    }
    
    // 层次二：Inline Assist
    pub async fn inline_assist(&self, instruction: &str, text: &str, context: &str) -> Result<String, Error> {
        // 使用标准模型
        self.model_manager.get_current_model()
            .complete_with_instruction(instruction, text, context)
            .await
    }
    
    // 层次三：聊天
    pub async fn chat_stream(&self, messages: &[Message], context: &ChatContext) -> Result<Stream, Error> {
        // 使用标准模型，流式响应
        self.model_manager.get_current_model()
            .stream_chat(messages, context)
            .await
    }
}
```

### 5.3 不共享的内容

**严格隔离**：
- ❌ 自动补全的触发逻辑不共享
- ❌ Inline Assist 的输入框不共享
- ❌ 聊天窗口的 UI 组件不共享
- ❌ 聊天历史不共享给其他层次

---

## 六、实现原则

### 6.1 独立性原则

1. **代码隔离**：
   - 每个层次有独立的组件目录
   - 每个层次有独立的 Hook
   - 每个层次有独立的后端接口

2. **状态隔离**：
   - 自动补全：使用独立的 state（ghostText）
   - Inline Assist：使用独立的 state（isOpen, inputValue）
   - 聊天窗口：使用独立的 state（messages, tabs）

3. **事件隔离**：
   - 自动补全：监听 selectionUpdate、update 事件
   - Inline Assist：监听 Cmd+K 快捷键
   - 聊天窗口：监听用户输入和发送事件

### 6.2 共享原则

1. **数据共享**：
   - 通过统一的 Context API 获取文档内容
   - 通过统一的 ModelManager 管理模型
   - 通过统一的 AIService 调用 AI

2. **配置共享**：
   - 系统提示词配置
   - 模型配置
   - 用户偏好设置

### 6.3 性能原则

1. **自动补全**：
   - 使用快速模型
   - 限制生成长度
   - 防抖机制

2. **Inline Assist**：
   - 使用标准模型
   - 单次请求，不流式

3. **聊天窗口**：
   - 使用标准模型
   - 流式响应
   - 支持工具调用

---

## 七、目录结构

```
src/
├── components/
│   ├── Editor/
│   │   ├── GhostText.tsx          # 层次一：幽灵文字组件
│   │   ├── InlineAssistInput.tsx   # 层次二：输入框组件
│   │   └── TipTapEditor.tsx       # 编辑器主组件
│   └── Chat/
│       ├── ChatWindow.tsx          # 层次三：聊天窗口
│       ├── ChatTabs.tsx            # 标签栏
│       ├── ChatMessageList.tsx    # 消息列表
│       ├── ChatInput.tsx           # 输入框
│       ├── ModelSelector.tsx       # 模型选择
│       ├── MemoryTab.tsx           # 记忆库标签
│       └── MessageWithReference.tsx # 引用内容显示
├── hooks/
│   ├── useAutoComplete.ts          # 层次一：自动补全 Hook
│   ├── useInlineAssist.ts          # 层次二：Inline Assist Hook
│   └── useChat.ts                  # 层次三：聊天 Hook
└── services/
    ├── aiService.ts                # 统一的 AI 服务接口
    └── contextService.ts            # 上下文构建服务
```

---

## 八、开发计划

### 阶段一：层次一（自动补全）
- Week 13-14：实现自动补全
  - 实现触发逻辑（光标悬停检测）
  - 实现幽灵文字显示
  - 实现 Tab/Esc 交互
  - 集成快速模型

### 阶段二：层次二（Inline Assist）
- Week 15：实现 Inline Assist
  - 实现 Cmd+K 快捷键
  - 实现输入框组件
  - 实现直接修改文本逻辑
  - 可选：实现 Diff 视图

### 阶段三：层次三（聊天窗口）
- Week 16-18：实现聊天窗口
  - 实现聊天界面
  - 实现标签栏
  - 实现模型选择
  - 实现记忆库集成
  - 实现引用内容显示
  - 实现工具调用

---

## 九、总结

### 9.1 三层架构的核心区别

| 特性 | 层次一（自动补全） | 层次二（Inline Assist） | 层次三（聊天窗口） |
|------|-------------------|------------------------|-------------------|
| **触发方式** | 自动（光标悬停） | 快捷键（Cmd+K） | 手动打开窗口 |
| **UI 形式** | 幽灵文字 | 浮动输入框 | 完整聊天界面 |
| **交互方式** | Tab 接受 | Enter 执行 | 对话式交互 |
| **历史记录** | 无 | 无 | 有 |
| **工具调用** | 无 | 无 | 有 |
| **模型选择** | 快速模型 | 标准模型 | 标准模型（可切换） |

### 9.2 实现原则

1. ✅ **独立性**：每个层次独立实现，不相互依赖
2. ✅ **清晰性**：每个层次有明确的职责和边界
3. ✅ **共享性**：共享上下文数据和配置，但不共享实现逻辑
4. ✅ **性能**：根据层次选择合适的模型和响应方式

### 9.3 关键点

- **层次一**：完全自动，无 UI 窗口，类似代码补全
- **层次二**：快捷键调出，单次操作，直接修改文本
- **层次三**：完整对话，有历史，有工具调用，有标签栏

---

**文档版本**：v1.0  
**创建日期**：2025年  
**基于**：Binder产品开发方案.md + UI问题分析

