# Binder AI 功能三层架构设计

## 文档目的

明确 Binder 应用中三种 AI 功能的边界、实现方式和交互逻辑，确保架构清晰、实现独立。

**注意**：智能关联修改功能（原层次三）已放弃，不再开发。

---

## 一、三层架构概览

Binder 的 AI 功能分为三个独立的层次，每个层次有明确的职责和边界：

```
┌─────────────────────────────────────────────────────────┐
│  层次一：自动补全（自动续写）                              │
│  - 无 UI 窗口，幽灵文字显示                                │
│  - 快捷键触发（Cmd+J / Ctrl+J）                              │
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
- ✅ **快捷键触发**：用户通过快捷键（如 Cmd+J）主动触发，不再自动触发
- ✅ **幽灵文字**：在光标后方显示半透明的续写内容
- ✅ **非侵入式**：不打断用户写作流程

**类比**：
- 类似 VS Code 的代码补全
- 类似 GitHub Copilot 的代码建议
- 类似 Gmail 的智能撰写

### 2.2 触发机制

**触发方式**：快捷键触发（如 Cmd+J / Ctrl+J），用户主动触发，不再自动触发

**触发条件**（快捷键按下时检查）：
- 光标在文档中
- 光标位置有足够的上下文（至少 100 字符）
- 光标位置不是文档末尾（末尾不续写）
- 无选中文本

**触发逻辑**：
- 监听快捷键事件（如 Cmd+J / Ctrl+J）
- 用户按下快捷键后立即调用 AI 生成续写
- 显示幽灵文字

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

**性能要求**：
- 响应时间：< 2 秒（从触发到显示续写内容）
- 不阻塞编辑器操作
- 使用快速模型（GPT-3.5、Claude Haiku 等）
- 限制生成长度（20-50 字符）
- 快捷键触发（无自动触发，用户主动控制）

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
- 快捷键触发（无自动触发，用户主动控制）

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
- 层次一：快捷键触发，续写
- 层次二：手动触发（快捷键），执行指令

**与层次三的区别**：
- 层次二：单次操作，无历史
- 层次三：对话式，有历史

---

**注意**：智能关联修改功能（原层次三）已放弃，不再开发。

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
- 当用户在聊天中引用文本、文件、文件夹、图片、表格、聊天记录等时，显示引用内容的缩览
- 点击可以查看完整内容
- 支持删除引用

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
            <ReferenceTag key={idx} reference={ref} />
          ))}
        </div>
      )}
      <div className="message-content">{message.content}</div>
    </div>
  );
};
```

#### 4.2.5 聊天内容引用（重点功能）

**功能**：
- 支持跨标签页引用其他聊天的内容
- Agent 模式和 Chat 模式都可以互相引用
- 引用方式：复制粘贴引用（简化方案）

**实现**：
```typescript
// src/components/Chat/InlineChatInput.tsx
// 处理粘贴事件，识别聊天内容引用
const handlePaste = async (e: React.ClipboardEvent) => {
  const pastedText = e.clipboardData.getText();
  
  // 检查是否是聊天内容（通过全局变量或剪贴板数据）
  const chatSource = window.__binderClipboardSource;
  const chatTimestamp = window.__binderClipboardTimestamp;
  
  if (chatSource && Date.now() - chatTimestamp < 5000) {
    // 5秒内粘贴，识别为聊天引用
    const chatRef: ChatReference = {
      id: generateId(),
      type: ReferenceType.CHAT,
      createdAt: Date.now(),
      chatTabId: chatSource.tabId,
      chatTabTitle: chatSource.tabTitle,
      messageIds: chatSource.messageIds,
      messageRange: chatSource.messageRange,
    };
    
    // 插入引用标签
    insertReferenceTag(chatRef);
    e.preventDefault();
  }
};
```

#### 4.2.6 快捷应用到文档功能（Chat 模式）

**功能**：
- 在 AI 消息下方显示"应用到文档"按钮（仅 Chat 模式）
- 支持多种应用方式：插入、替换、追加、创建新文件
- 支持智能内容识别和部分应用

**实现**：
```typescript
// src/components/Chat/QuickApplyButton.tsx
export const QuickApplyButton: React.FC<{
  message: ChatMessage;
  mode: 'chat' | 'agent';
}> = ({ message, mode }) => {
  if (mode !== 'chat') return null;
  
  const handleApply = async () => {
    // 识别内容类型（代码块、段落、列表等）
    const segments = parseMessageContent(message.content);
    
    // 显示应用选项对话框
    const option = await showApplyOptionsDialog({
      segments,
      hasEditor: hasOpenEditor(),
      hasSelection: hasSelectedText(),
    });
    
    if (option === 'insert') {
      await applyToEditor('insert', segments);
    } else if (option === 'replace') {
      await applyToEditor('replace', segments);
    } else if (option === 'append') {
      await applyToEditor('append', segments);
    } else if (option === 'create') {
      await createNewFile(segments);
    }
  };
  
  return (
    <button onClick={handleApply} className="quick-apply-button">
      应用到文档
    </button>
  );
};
```

### 4.3 聊天模式

**Agent 模式**：
- AI 可以调用工具执行操作（文件操作、搜索等）
- 适用于需要 AI 执行实际操作的场景（如创建文件、修改文档、搜索内容等）
- 工具调用过程对用户可见，需要用户确认后执行
- 支持文档修改的可视化展示（红绿标注：删除用红色，添加用绿色）
- 支持多层确认机制：
  - 段落级别确认：每个修改段落有独立的确认按钮
  - 文档级别确认：每个被修改的文档有确认按钮
  - 全部确认：一次性确认所有修改

**Chat 模式**：
- AI 仅进行对话，不调用工具
- 适用于纯对话场景（如咨询问题、获取建议、内容讨论等）
- 不执行任何文件系统操作
- 支持快捷应用到文档功能

**模式切换规则**：
- 创建新对话时可以选择模式（默认 Agent 模式）
- 聊天开始后（已有消息）不能切换模式（保持对话一致性）
- 每个标签页独立设置模式

### 4.4 引用系统功能

**支持引用类型**：
- **文本引用**：复制文档内容，自动识别来源文件和行号
- **文件引用**：拖拽文件到聊天窗口，或使用 `@文件名` 语法
- **文件夹引用**：拖拽文件夹到聊天窗口
- **图片引用**：拖拽图片到聊天窗口
- **表格引用**：选中表格并引用
- **记忆库引用**：使用 `@记忆库名称` 语法
- **聊天记录引用**：引用其他聊天标签页的聊天内容（支持跨标签页引用）
- **链接引用**：自动识别用户输入或复制的 URL
- **知识库引用**：引用知识库内容

**引用功能**：
- 在聊天输入中插入引用标签
- 引用管理器可视化
- 引用分组显示
- 删除引用
- 引用内容完整传递给 AI（不是路径，是完整内容）

**聊天内容引用（重点功能）**：

1. **跨标签页引用**：
   - Agent 模式和 Chat 模式都可以引用其他聊天标签页的内容
   - 支持引用单个消息或多个消息（消息范围）
   - 引用时显示来源标签页标题和消息范围
   - 引用内容完整传递给 AI，作为对话上下文

2. **引用方式**（简化方案）：
   - **复制粘贴引用**：在当前聊天中复制聊天内容，粘贴到其他聊天输入框时，自动识别为引用标签
   - **拖拽引用**：选中消息内容，拖拽到目标聊天输入框
   - **引用管理器**：在引用管理器中浏览所有聊天标签页，选择要引用的消息
   - **注意**：不再使用右键菜单和快捷键引用（避免操作复杂）

3. **引用显示**：
   - 引用标签显示：`💬 聊天记录: [标签页名称] (消息 1-3)`
   - 点击引用标签可查看完整引用内容
   - 引用内容在发送给 AI 时自动格式化

4. **互相引用场景**：
   - **Chat → Agent**：在 Chat 模式中讨论的内容，可以引用到 Agent 模式中执行操作
   - **Agent → Chat**：在 Agent 模式中执行的结果，可以引用到 Chat 模式中继续讨论
   - **Chat → Chat**：不同 Chat 标签页之间互相引用，便于对比和参考
   - **Agent → Agent**：不同 Agent 标签页之间互相引用，便于复用操作结果

5. **引用内容格式化**：
   - 引用时自动包含：标签页标题、消息角色（用户/AI）、消息内容、时间戳
   - **时间戳格式**：`[2025-01-15 14:30] (5 分钟前)`（同时显示绝对时间和相对时间）
   - 如果时间超过 24 小时，只显示绝对时间

### 4.5 工具调用功能（仅 Agent 模式）

**文件操作工具**：
- `read_file`：读取文件内容
- `create_file`：创建文件
- `update_file`：更新文件
- `delete_file`：删除文件
- `list_files`：列出目录
- `search_files`：搜索文件
- `move_file`：移动文件
- `rename_file`：重命名
- `create_folder`：创建文件夹

**编辑器操作工具**：
- `edit_current_editor_document`：编辑当前打开的文档（需用户确认）
- 工具调用结果自动应用到编辑器（通过事件通知）

**工具调用特性**：
- 自动执行文件操作（无需确认）
- 编辑器操作需用户确认
- 实时显示工具调用状态（pending/executing/completed/failed）
- JSON 参数修复机制

### 4.6 文档修改可视化功能（仅 Agent 模式）

**可视化展示**：
- 支持文档修改的可视化展示（红绿标注：删除用红色，添加用绿色）
- 支持行级别对比、段落级别对比、文档级别对比
- **在编辑区实现 diff 效果**（重要：Diff 视图应在编辑器中显示，而不是聊天窗口）

**多层确认机制**：
- **段落级别确认**：每个修改段落有独立的确认按钮
- **文档级别确认**：每个被修改的文档有确认按钮
- **全部确认**：一次性确认所有修改
- 支持跳过功能（跳过段落、跳过文档）

### 4.7 快捷应用到文档功能（Chat 模式重点功能）

**功能定位**：
- Chat 模式中，AI 回答的内容可能包含可以直接应用到文档的内容
- 提供快捷方式，让用户快速将聊天内容应用到当前文档
- 特别适用于：代码片段、文本内容、格式建议等

**快捷处理方式**：

1. **一键应用到文档按钮**：
   - 在 AI 消息下方显示"应用到文档"按钮（仅 Chat 模式）
   - 点击后弹出应用选项：
     - **插入到光标位置**：将内容插入到编辑器光标位置（需要编辑器已打开文档）
     - **替换选中文本**：如果有选中文本，替换为聊天内容（需要编辑器已打开文档）
     - **追加到文档末尾**：将内容追加到文档末尾（需要编辑器已打开文档）
     - **应用到工作区文档**：如果工作区中存在同名文档，直接应用到该文档；如果不存在，创建新文档（不可重复创建）

2. **智能内容识别**：
   - **代码块识别**：使用 Markdown 代码块语法（```语言\n代码\n```）
   - **文本段落识别**：按空行分割，每个段落作为一个可选项
   - **列表识别**：识别 Markdown 列表语法（-、*、1. 等）
   - **展示方式**：在应用预览中，用复选框标记每个可应用的段落，用户可以选择

3. **应用预览**：
   - 应用前显示预览（Diff 视图）
   - 用户可以确认或取消
   - 支持部分应用（选择要应用的段落）
   - **部分应用选择方式**：
     - 预览界面：显示所有可应用段落，用复选框选择
     - 消息中：支持选中文本后右键"应用选中内容"

4. **快捷键支持**：
   - `Cmd/Ctrl + Shift + A`：快速应用当前消息到文档
   - `Cmd/Ctrl + Shift + I`：快速插入到光标位置
   - `Cmd/Ctrl + Shift + T`：快速替换选中文本（修改快捷键，避免与引用冲突）

5. **右键菜单选项**：
   - 在消息上右键，显示"应用到文档"选项
   - 子菜单：插入到光标位置、替换选中文本、追加到文档末尾、创建新文件

6. **拖拽应用**：
   - 选中聊天消息内容，直接拖拽到编辑器
   - 自动插入到拖拽位置

7. **批量应用**：
   - 支持选择多个消息，批量应用到文档
   - 支持按顺序应用或合并应用
   - **合并应用规则**：
     - 默认方式：保持原有格式，按顺序拼接
     - 提供选项：用户可以选择是否合并为一个段落（用空行分隔）

**编辑器未打开文档时的处理**：
- 编辑器未打开文档时，"应用到文档"按钮仍然显示
- **应用逻辑**：
  - 如果工作区中存在同名文档，直接应用到该文档（不可重复创建）
  - 如果工作区中不存在同名文档，创建新文档
  - 其他选项（插入、替换、追加）需要编辑器已打开文档才能使用

### 4.8 聊天记录管理

**聊天记录绑定**：
- 聊天记录绑定到工作区（每个工作区独立的聊天记录）
- 支持保存聊天记录到工作区
- 支持加载工作区的聊天记录
- 支持临时聊天（未绑定工作区的聊天，退出时提示保存）
- 支持聊天合并（打开工作区时，可选择合并临时聊天到工作区）

**实现**：
```typescript
// src/services/chatStorageService.ts
export const saveChatToWorkspace = async (
  workspacePath: string,
  chatTab: ChatTab,
  messages: ChatMessage[]
) => {
  const chatData = {
    tabId: chatTab.id,
    title: chatTab.title,
    mode: chatTab.mode,
    messages,
    createdAt: chatTab.createdAt,
    updatedAt: Date.now(),
  };
  
  await invoke('save_chat_to_workspace', {
    workspacePath,
    chatData,
  });
};

export const loadChatsFromWorkspace = async (
  workspacePath: string
): Promise<ChatTab[]> => {
  return await invoke('load_chats_from_workspace', {
    workspacePath,
  });
};
```

### 4.9 记忆库功能

**记忆库标签**：
- 在标签栏中添加记忆库标签（图标：🧠）
- 点击切换到记忆库面板
- 显示记忆项列表和详情

**记忆库功能**：
- 支持长文档场景的上下文记忆
- 支持记忆库标签（用户可标记重要上下文）
- 支持记忆库检索（AI 可检索相关记忆）

**实现**：
```typescript
// src/components/Chat/MemoryPanel.tsx
export const MemoryPanel: React.FC = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  
  useEffect(() => {
    loadMemories();
  }, []);
  
  const loadMemories = async () => {
    const loaded = await invoke<Memory[]>('get_memories');
    setMemories(loaded);
  };
  
  return (
    <div className="memory-panel">
      <div className="memory-list">
        {memories.map(memory => (
          <MemoryItem key={memory.id} memory={memory} />
        ))}
      </div>
    </div>
  );
};
```

### 4.10 多层提示词架构

**提示词层次**：

1. **基础系统提示词**（第一层）：
   - 角色定义："你是一个专业的编程助手和文档编辑助手"
   - 基本行为规范

2. **上下文提示词**（第二层）：
   - 当前打开的文档：文件路径、文档内容预览（智能选择 1000 字符）
   - **文档内容预览选择规则**：
     - 优先选择：光标位置附近的内容（前后各 400 字符）
     - 如果光标位置内容不足，补充文档开头内容
     - 如果文档有标题结构，优先包含当前段落所在章节的内容
   - 当前选中的文本：选中内容
   - 工作区路径：工作区根目录
   - **当前编辑器状态**：包括以下信息
     - 是否可编辑（只读/可编辑）
     - 文件类型（.md、.t-docx、.html 等）
     - 文件大小（如果 > 1MB，提示"大文件"）
     - 是否已保存（如果有未保存更改，提示"有未保存更改"）

3. **引用提示词**（第三层）：
   - 用户引用的内容列表
   - 每个引用的类型、来源、完整内容
   - 明确说明："这些内容已经完整包含在消息中，无需再读取文件"

4. **工具调用提示词**（第四层，仅 Agent 模式）：
   - 工具调用规范：JSON 格式要求
   - 工具使用说明：每个工具的功能和参数
   - 工具调用最佳实践

**提示词构建逻辑**：
- 根据聊天模式（Agent/Chat）动态构建
- 根据是否有引用内容动态添加引用提示词
- 根据当前文档状态动态添加上下文提示词

### 4.11 后端实现

**Rust 后端接口**：
```rust
// src-tauri/src/commands/ai_commands.rs

#[tauri::command]
pub async fn ai_chat_stream(
    tab_id: String,
    messages: Vec<ChatMessage>,
    model_config: ModelConfig,
    enable_tools: bool,
    context: ChatContext,
) -> Result<(), String> {
    // 构建多层提示词
    let system_prompt = build_multi_layer_prompt(&context, enable_tools);
    
    // 格式化引用内容
    let formatted_messages = format_messages_with_references(messages);
    
    // 调用 AI（流式响应）
    let mut stream = ai_service
        .stream_chat(&model_config, &system_prompt, &formatted_messages, enable_tools)
        .await?;
    
    // 流式返回（前端和后端双重去重）
    let mut accumulated_text = String::new();
    while let Some(chunk) = stream.next().await {
        // 去重逻辑
        if !accumulated_text.ends_with(&chunk.text) {
            accumulated_text.push_str(&chunk.text);
            app_handle.emit("ai-chat-stream", chunk)?;
        }
    }
    
    Ok(())
}

fn build_multi_layer_prompt(context: &ChatContext, enable_tools: bool) -> String {
    // 第一层：基础系统提示词
    let mut prompt = String::from("你是一个专业的编程助手和文档编辑助手。\n\n");
    
    // 第二层：上下文提示词
    prompt.push_str(&format!(
        "当前文档：{}\n\
         选中文本：{}\n\
         工作区路径：{}\n\
         编辑器状态：{}\n\n",
        context.current_file.unwrap_or_default(),
        context.selected_text.unwrap_or_default(),
        context.workspace_path,
        format_editor_state(&context.editor_state)
    ));
    
    // 第三层：引用提示词（如果有引用）
    if let Some(refs) = &context.references {
        prompt.push_str("用户引用了以下内容（这些内容已经完整包含在消息中，无需再读取文件）：\n");
        for ref_item in refs {
            prompt.push_str(&format!("- {}: {}\n", ref_item.type_name(), ref_item.preview()));
        }
        prompt.push_str("\n");
    }
    
    // 第四层：工具调用提示词（仅 Agent 模式）
    if enable_tools {
        prompt.push_str(&get_tool_calling_prompt());
    }
    
    prompt
}
```

**流式响应处理**：
- 前端和后端双重去重
- 累积文本跟踪
- 空 chunk 过滤
- 工具调用实时处理

### 4.12 性能要求

**响应时间**：
- 首次响应：< 3 秒
- 流式显示延迟：< 100ms
- 工具调用响应：< 2 秒

**资源占用**：
- 内存占用：< 100MB（聊天历史）
- CPU 占用：< 50%（AI 处理）

### 4.13 边界和限制

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

### 6.1 共享的上下文数据

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

5. **工作区信息**：
   - 聊天窗口：用于工具调用

### 6.2 共享的服务接口

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
    pub async fn chat_stream(
        &self,
        messages: &[Message],
        context: &ChatContext,
        enable_tools: bool,
    ) -> Result<Stream, Error> {
        // 使用标准模型，流式响应
        self.model_manager.get_current_model()
            .stream_chat(messages, context, enable_tools)
            .await
    }
}
```

### 6.3 不共享的内容

**严格隔离**：
- ❌ 自动补全的触发逻辑不共享
- ❌ Inline Assist 的输入框不共享
- ❌ 聊天窗口的 UI 组件不共享
- ❌ 聊天历史不共享给其他层次

---

## 七、实现原则

### 7.1 独立性原则

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

### 7.2 共享原则

1. **数据共享**：
   - 通过统一的 Context API 获取文档内容
   - 通过统一的 ModelManager 管理模型
   - 通过统一的 AIService 调用 AI

2. **配置共享**：
   - 系统提示词配置
   - 模型配置
   - 用户偏好设置

### 7.3 性能原则

1. **自动补全**：
   - 使用快速模型
   - 限制生成长度
   - 快捷键 Cmd+J/Ctrl+J 触发

2. **Inline Assist**：
   - 使用标准模型
   - 单次请求，不流式

3. **聊天窗口**：
   - 使用标准模型
   - 流式响应
   - 支持工具调用

---

## 八、目录结构

```
src/
├── components/
│   ├── Editor/
│   │   ├── GhostText.tsx              # 层次一：幽灵文字组件
│   │   ├── InlineAssistInput.tsx      # 层次二：输入框组件
│   │   └── TipTapEditor.tsx           # 编辑器主组件
│   └── Chat/
│       ├── ChatWindow.tsx              # 层次三：聊天窗口
│       ├── ChatTabs.tsx                # 标签栏
│       ├── ChatMessageList.tsx         # 消息列表
│       ├── InlineChatInput.tsx         # 输入框（支持引用）
│       ├── ReferenceManagerButton.tsx  # 引用管理器
│       ├── ReferenceTags.tsx            # 引用标签显示
│       ├── QuickApplyButton.tsx        # 快捷应用到文档按钮
│       ├── ToolCallCard.tsx            # 工具调用卡片
│       ├── DocumentDiffView.tsx        # 文档修改 Diff 视图
│       ├── ModelSelector.tsx           # 模型选择
│       ├── MemoryTab.tsx               # 记忆库标签
│       └── MessageWithReference.tsx    # 引用内容显示
├── hooks/
│   ├── useAutoComplete.ts              # 层次一：自动补全 Hook
│   ├── useInlineAssist.ts              # 层次二：Inline Assist Hook
│   └── useChat.ts                      # 层次三：聊天 Hook
└── services/
    ├── aiService.ts                    # 统一的 AI 服务接口
    └── contextService.ts               # 上下文构建服务
```

---

## 九、开发计划

### 9.1 阶段一：层次一（自动补全）
- Week 13-14：实现自动补全
  - 实现触发逻辑（光标悬停检测）
  - 实现幽灵文字显示
  - 实现 Tab/Esc 交互
  - 集成快速模型

### 9.2 阶段二：层次二（Inline Assist）
- Week 15：实现 Inline Assist
  - 实现 Cmd+K 快捷键
  - 实现输入框组件
  - 实现直接修改文本逻辑
  - 可选：实现 Diff 视图

### 9.3 阶段三：层次三（聊天窗口）
- Week 18-20：实现聊天窗口
  - 实现聊天界面
  - 实现标签栏
  - 实现模型选择
  - 实现记忆库集成
  - 实现引用系统（包括聊天内容引用）
  - 实现工具调用
  - 实现文档修改可视化（在编辑区显示 Diff）
  - 实现快捷应用到文档功能（Chat 模式）
  - 实现多层提示词架构

---

## 十、总结

### 10.1 三层架构的核心区别

| 特性 | 层次一（自动补全） | 层次二（Inline Assist） | 层次三（聊天窗口） |
|------|-------------------|------------------------|-------------------|
| **触发方式** | 快捷键（Cmd+J） | 快捷键（Cmd+K） | 手动打开窗口 |
| **UI 形式** | 幽灵文字 | 浮动输入框 | 完整聊天界面 |
| **交互方式** | Tab 接受 | Enter 执行 | 对话式交互 |
| **历史记录** | 无 | 无 | 有 |
| **工具调用** | 无 | 无 | 有（仅 Agent 模式） |
| **模型选择** | 快速模型 | 标准模型 | 标准模型（可切换） |
| **操作类型** | 单次续写 | 单次操作 | 对话式操作 |

### 10.2 实现原则

1. ✅ **独立性**：每个层次独立实现，不相互依赖
2. ✅ **清晰性**：每个层次有明确的职责和边界
3. ✅ **共享性**：共享上下文数据和配置，但不共享实现逻辑
4. ✅ **性能**：根据层次选择合适的模型和响应方式

### 10.3 关键点

- **层次一**：快捷键触发，无 UI 窗口，类似代码补全
- **层次二**：快捷键调出，单次操作，直接修改文本
- **层次三**：完整对话，有历史，有工具调用，有标签栏，支持引用和快捷应用

### 10.4 成本控制说明

**功能层面**：
- 不限制用户调用次数，以实现功能为主

**成本控制位置**：
- 应在用户管理系统层面统一处理
  - Token 限额管理
  - 使用量统计和监控
  - 订阅管理和配额控制
  - 用户级别的使用限制

**现阶段**：
- 专注于功能实现，成本控制由用户管理系统统一处理

---

**文档版本**：v2.0  
**创建日期**：2025年  
**最后更新**：2025年（根据 AI功能需求文档.md 更新为三层架构）  
**基于**：AI功能需求文档.md + Binder产品开发方案.md

