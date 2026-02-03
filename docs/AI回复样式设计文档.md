# AI 回复样式设计文档

## 一、设计目标

优化 AI 在聊天窗口中的回复样式，让用户以最舒服的方式与 AI 交互，清晰区分：
- **AI 的自然语言回复**（回答用户问题）
- **工具执行的缩览**（AI 自动执行的操作）
- **需要授权的操作**（需要用户授权才能执行，如本地权限、网络权限等）

**核心原则**：
- **单次交互统一性**：用户的一次输入，AI 的所有回复和工具调用统一显示在一个消息气泡内
- **时间顺序排列**：回复文本和工具调用按时间顺序穿插显示，保持美观有序
- **交互定义明确**：交互仅指需要用户授权的操作，文本编辑使用 Diff 预览方式

## 二、当前问题分析

### 2.1 存在的问题

1. **回复混乱**：AI 的自然语言回复和工具调用结果混在一起，难以区分
2. **信息过载**：工具调用卡片显示过于详细，占用大量空间
3. **交互不清晰**：需要确认的命令和自动执行的命令没有明显区分
4. **视觉层次不明确**：用户关注的重点（AI 回复）和次要信息（工具执行）没有视觉区分

### 2.2 用户需求

- **AI 回复**：以自然语言方式清晰回答用户问题
- **工具执行**：只显示一行缩览，可点击展开查看简单描述
- **需要授权的操作**：用自然语言描述清楚，附带操作缩览，展示授权/拒绝按钮
- **回复与指令穿插**：当 AI 回复和工具调用穿插出现时，按时间顺序美观排列
- **单次交互统一**：用户一次输入，AI 的所有操作统一在一个消息气泡内显示

## 三、设计原则

### 3.1 信息层次

1. **主要信息**：AI 的自然语言回复（回答用户问题）
   - 突出显示，占用主要视觉空间
   - 使用清晰的段落和格式

2. **次要信息**：工具执行缩览
   - 紧凑显示，不占用过多空间
   - 可折叠/展开，默认折叠

3. **交互信息**：需要确认的命令
   - 明确标识，使用醒目的样式
   - 提供清晰的确认/取消按钮

### 3.2 视觉设计

- **AI 回复**：使用标准消息气泡样式，与用户消息区分
- **工具缩览**：使用紧凑的卡片样式，带图标和简要描述
- **确认命令**：使用强调样式（边框、背景色），突出交互按钮

## 四、三种回复类型设计

### 4.1 类型一：AI 自然语言回复

**用途**：回答用户问题、说明情况、描述计划等

**样式**：
- 标准消息气泡
- 清晰的段落格式
- 支持 Markdown 格式（标题、列表、代码块等）

**示例**：

```
用户：帮我整理项目文件

AI 回复：
我已经分析了项目目录，发现共有 42 个文件需要整理。

我建议按以下方式组织：
1. 文档类文件 → `项目文档/` 文件夹
2. 代码类文件 → `源代码/` 文件夹
3. 图片资源 → `资源/图片/` 文件夹

现在开始执行整理...
```

### 4.2 类型二：工具执行缩览

**用途**：显示 AI 自动执行的工具调用（无需用户确认）

**样式**：
- **默认状态**：一行缩览，显示工具图标、工具名称、简要描述、执行状态
- **展开状态**：点击后显示详细信息（参数、结果等）

**缩览格式**：
```
[图标] [工具名称] [简要描述] [状态图标]
```

**展开内容**：
- 执行参数（简化显示）
- 执行结果（关键信息，非完整 JSON）
- 可选的"查看详细信息"链接

**示例**：

**缩览状态**：
```
📁 列出文件 | 查看项目根目录 | ✅ 成功 (42 项)
```

**展开状态**：
```
📁 列出文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
路径: .
结果: 成功列出 42 个文件/文件夹
文件列表:
  • 新建文档.txt
  • empty.txt
  • Test999.docx
  ... (共 42 项)
[查看完整列表] [收起]
```

### 4.3 类型三：需要授权的操作

**用途**：需要用户授权才能执行的操作（如访问本地文件系统、访问网络、读取系统信息等）

**样式**：
- **自然语言描述**：用清晰的语言说明需要授权的操作
- **操作缩览**：显示操作的简要信息
- **授权按钮**：醒目的授权/拒绝按钮

**需要授权的操作类型**：
- 访问本地文件系统（读取/写入工作区外的文件）
- 访问网络（浏览网页、API 调用）
- 读取系统信息（系统配置、环境变量）
- 执行系统命令（需要额外权限的操作）

**注意**：文本编辑操作（`edit_current_editor_document`）**不属于**需要授权的操作，应使用 Diff 预览方式，沿用旧的交互逻辑。

**示例**：

```
我需要访问您的本地文件系统来读取配置文件。

🔐 需要授权：访问本地文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
操作: 读取配置文件
路径: ~/.config/app/config.json
用途: 获取应用配置信息

[✅ 授权] [❌ 拒绝]
```

### 4.4 类型四：快捷应用到文档（Chat 模式专用）

**用途**：Chat 模式中，AI 回复的内容可以直接应用到当前文档

**样式**：
- **应用按钮**：在 AI 回复消息下方显示"应用到文档"按钮
- **应用选项**：点击后显示应用方式选择（插入/替换/追加/创建文件）
- **预览功能**：支持预览（Diff 视图）后再应用

**应用方式**：
- **插入到光标位置**：将内容插入到编辑器光标位置
- **替换选中文本**：如果有选中文本，替换为聊天内容
- **追加到文档末尾**：将内容追加到文档末尾
- **应用到工作区文档**：如果工作区中存在同名文档，直接应用；如果不存在，创建新文档

**格式和样式匹配**：
- 自动识别 AI 生成内容的格式（Markdown、HTML、纯文本等）
- 根据当前文档格式自动转换（t-docx、TXT、MD、HTML）
- 继承当前光标位置的样式（如 t-docx 中的段落样式）

**注意**：此功能仅在 Chat 模式下显示，Agent 模式使用工具调用方式。

**示例**：

```
以下是一段项目背景介绍：

本项目旨在通过创新的技术方案，解决传统文档编辑中的痛点问题。
我们采用现代化的架构设计，结合 AI 技术，为用户提供流畅、智能的文档编辑体验。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📄 应用到文档 ▼]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 五、回复与指令穿插显示设计

### 5.1 设计目标

当 AI 在执行任务过程中，回复文本和工具调用会穿插出现。需要确保：
1. **时间顺序**：严格按照实际发生的时间顺序显示
2. **视觉美观**：文本块和工具缩览有序排列，视觉协调
3. **统一消息**：用户一次输入，所有内容统一在一个消息气泡内
4. **清晰区分**：文本块和工具缩览有明显的视觉区分，但不突兀

### 5.2 视觉排列规则

#### 5.2.1 文本块样式

- **位置**：与消息气泡同宽，使用分隔线区分
- **样式**：标准文本样式，支持 Markdown
- **间距**：文本块之间使用 `mt-2` 间距

#### 5.2.2 工具缩览样式

- **位置**：独立一行，使用边框和背景色区分
- **样式**：紧凑的卡片样式
- **间距**：工具缩览前后使用 `my-2` 间距

#### 5.2.3 分隔线使用

- **文本块之间**：不显示分隔线（连续文本自然合并）
- **文本块与工具缩览之间**：显示细分隔线（`border-t border-gray-200 dark:border-gray-600`）
- **工具缩览之间**：不显示分隔线（使用间距区分）

### 5.3 排列示例

**场景**：AI 在执行任务时，先说明计划，然后执行工具，再说明结果

```
┌─────────────────────────────────────────┐
│ AI 回复文本块 1                          │
│ "我将为您创建项目结构..."                │
├─────────────────────────────────────────┤
│ 📁 创建文件夹 | 创建"frontend" | ✅ 成功 │
├─────────────────────────────────────────┤
│ AI 回复文本块 2                          │
│ "第一个文件夹创建完成。"                  │
├─────────────────────────────────────────┤
│ 📁 创建文件夹 | 创建"backend" | ✅ 成功  │
│ 📁 创建文件夹 | 创建"docs" | ✅ 成功    │
├─────────────────────────────────────────┤
│ AI 回复文本块 3                          │
│ "所有文件夹已创建，现在开始创建文件..."   │
├─────────────────────────────────────────┤
│ 📄 创建文件 | 创建"README.md" | ✅ 成功 │
└─────────────────────────────────────────┘
```

### 5.4 实现细节

#### 5.4.1 内容块合并规则

- **连续文本块**：如果相邻的多个内容块都是文本类型，自动合并为一个文本块
- **工具调用**：每个工具调用独立显示为一个工具缩览
- **授权卡片**：独立显示，不与其他内容合并

#### 5.4.2 时间戳处理

```typescript
// 内容块按时间戳排序
contentBlocks.sort((a, b) => a.timestamp - b.timestamp);

// 如果时间戳相同，按类型优先级排序
// 优先级：text > tool > authorization
const typePriority = { text: 0, tool: 1, authorization: 2 };
contentBlocks.sort((a, b) => {
  if (a.timestamp === b.timestamp) {
    return typePriority[a.type] - typePriority[b.type];
  }
  return a.timestamp - b.timestamp;
});
```

## 六、具体实现方案

### 6.1 消息结构重组

**当前结构**：
```
消息气泡
  ├─ AI 回复文本
  └─ 工具调用卡片（完整显示，所有工具调用在文本下方）
```

**新结构**：
```
消息气泡
  ├─ 内容块列表（按时间顺序排列）
  │   ├─ 文本块 1（AI 回复）
  │   ├─ 工具缩览 1（工具执行）
  │   ├─ 文本块 2（AI 回复）
  │   ├─ 工具缩览 2（工具执行）
  │   ├─ 授权卡片（需要授权的操作）
  │   └─ 文本块 3（AI 回复）
  └─ ...
```

**关键改进**：
- **时间顺序**：文本和工具调用按实际发生时间穿插显示
- **统一消息**：用户一次输入，所有内容统一在一个消息气泡内
- **视觉区分**：文本块和工具缩览使用不同的视觉样式，但保持整体协调

### 5.2 工具调用分类

**自动执行工具**（显示为缩览）：
- `list_files` - 列出文件
- `read_file` - 读取文件（在工作区内）
- `search_files` - 搜索文件
- `create_folder` - 创建文件夹
- `move_file` - 移动文件
- `rename_file` - 重命名文件
- `delete_file` - 删除文件
- `create_file` - 创建文件
- `update_file` - 更新文件

**文本编辑工具**（使用 Diff 预览，沿用旧逻辑）：
- `edit_current_editor_document` - 编辑当前编辑器文档
  - 显示 Diff 预览（段落级别、文档级别）
  - 提供多层确认机制（段落确认、全部确认、跳过）
  - 确认后应用到编辑器
  - 支持格式和样式匹配（TXT、t-docx、MD、HTML）

**需要授权的工具**（显示为授权卡片）：
- `read_file` - 读取工作区外的文件（需要额外权限）
- `write_file` - 写入工作区外的文件（需要额外权限）
- `browse_web` - 浏览网页（需要网络权限）
- `execute_system_command` - 执行系统命令（需要系统权限）
- `read_system_info` - 读取系统信息（需要系统权限）

### 5.3 组件设计

#### 5.3.1 MessageContentBlock（消息内容块）

**用途**：统一管理消息中的文本块和工具调用，按时间顺序排列

**Props**:
```typescript
interface MessageContentBlock {
  id: string;
  type: 'text' | 'tool' | 'authorization';
  timestamp: number;
  content?: string; // 文本内容
  toolCall?: ToolCall; // 工具调用
  authorization?: AuthorizationRequest; // 授权请求
}
```

#### 5.3.2 ToolCallSummary（工具调用缩览）

**Props**:
```typescript
interface ToolCallSummaryProps {
  toolCall: ToolCall;
  expanded?: boolean;
  onToggle?: () => void;
}
```

**功能**：
- 显示一行缩览信息
- 点击展开/收起
- 显示执行状态（成功/失败/执行中）

#### 5.3.3 AuthorizationCard（授权卡片）

**Props**:
```typescript
interface AuthorizationCardProps {
  request: AuthorizationRequest;
  description: string; // 自然语言描述
  onAuthorize: () => void;
  onDeny: () => void;
}

interface AuthorizationRequest {
  id: string;
  type: 'file_system' | 'network' | 'system';
  operation: string;
  details: Record<string, any>;
}
```

**功能**：
- 显示自然语言描述
- 显示操作缩览
- 提供授权/拒绝按钮

#### 5.3.4 QuickApplyButton（快捷应用到文档按钮）

**Props**:
```typescript
interface QuickApplyButtonProps {
  messageId: string;
  content: string;
  onApply: (method: 'insert' | 'replace' | 'append' | 'create') => void;
  onPreview?: () => void;
}
```

**功能**：
- 仅在 Chat 模式下显示
- 显示应用方式选择菜单
- 支持预览（Diff 视图）
- 自动格式和样式匹配

### 5.4 消息渲染逻辑

#### 5.4.1 数据结构扩展

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // 保留用于兼容
  timestamp: number;
  isLoading?: boolean;
  toolCalls?: ToolCall[];
  
  // 新增：内容块列表（按时间顺序）
  contentBlocks?: MessageContentBlock[];
}

interface MessageContentBlock {
  id: string;
  type: 'text' | 'tool' | 'authorization';
  timestamp: number;
  content?: string; // 文本内容
  toolCall?: ToolCall; // 工具调用
  authorization?: AuthorizationRequest; // 授权请求
}
```

#### 5.4.2 消息渲染逻辑

```typescript
// 伪代码
function renderMessage(message: ChatMessage) {
  // 如果有 contentBlocks，使用新的渲染方式
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    return (
      <MessageBubble>
        {message.contentBlocks
          .sort((a, b) => a.timestamp - b.timestamp) // 按时间排序
          .map(block => {
            switch (block.type) {
              case 'text':
                return (
                  <TextBlock key={block.id} content={block.content} />
                );
              case 'tool':
                if (needsAuthorization(block.toolCall.name)) {
                  return (
                    <AuthorizationCard
                      key={block.id}
                      request={block.authorization}
                      description={generateDescription(block.toolCall)}
                      onAuthorize={() => handleAuthorize(block.toolCall)}
                      onDeny={() => handleDeny(block.toolCall)}
                    />
                  );
                } else if (block.toolCall.name === 'edit_current_editor_document') {
                  // 文本编辑使用 Diff 预览，沿用旧逻辑
                  return (
                    <DocumentDiffView
                      key={block.id}
                      toolCall={block.toolCall}
                      onConfirm={handleConfirmEdit}
                      onCancel={handleCancelEdit}
                    />
                  );
                } else {
                  return (
                    <ToolCallSummary
                      key={block.id}
                      toolCall={block.toolCall}
                    />
                  );
                }
              case 'authorization':
                return (
                  <AuthorizationCard
                    key={block.id}
                    request={block.authorization}
                    description={generateDescription(block.authorization)}
                    onAuthorize={() => handleAuthorize(block.authorization)}
                    onDeny={() => handleDeny(block.authorization)}
                  />
                );
            }
          })}
      </MessageBubble>
    );
  }
  
  // 兼容旧格式：如果没有 contentBlocks，使用旧方式渲染
  return (
    <MessageBubble>
      <AIContent content={message.content} />
      {message.toolCalls?.map(tc => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
      {/* Chat 模式：快捷应用到文档按钮 */}
      {mode === 'chat' && message.role === 'assistant' && message.content && (
        <QuickApplyButton
          messageId={message.id}
          content={message.content}
          onApply={handleQuickApply}
          onPreview={handlePreviewApply}
        />
      )}
    </MessageBubble>
  );
}
```

#### 5.4.3 内容块构建逻辑

```typescript
// 在后端或前端构建内容块
function buildContentBlocks(
  textChunks: string[],
  toolCalls: ToolCall[]
): MessageContentBlock[] {
  const blocks: MessageContentBlock[] = [];
  let textIndex = 0;
  let toolIndex = 0;
  
  // 按时间戳合并文本块和工具调用
  const allItems: Array<{type: 'text' | 'tool', timestamp: number, data: any}> = [];
  
  textChunks.forEach((chunk, index) => {
    allItems.push({
      type: 'text',
      timestamp: Date.now() + index * 10, // 模拟时间戳
      data: chunk
    });
  });
  
  toolCalls.forEach((tc, index) => {
    allItems.push({
      type: 'tool',
      timestamp: tc.timestamp || Date.now() + index * 10,
      data: tc
    });
  });
  
  // 按时间戳排序
  allItems.sort((a, b) => a.timestamp - b.timestamp);
  
  // 构建内容块
  allItems.forEach((item, index) => {
    if (item.type === 'text') {
      blocks.push({
        id: `text-${index}`,
        type: 'text',
        timestamp: item.timestamp,
        content: item.data
      });
    } else {
      blocks.push({
        id: item.data.id,
        type: 'tool',
        timestamp: item.timestamp,
        toolCall: item.data
      });
    }
  });
  
  return blocks;
}
```

## 七、详细示例

### 6.1 示例一：文件整理任务

**用户输入**：
```
帮我整理项目文件，按类型分类
```

**AI 回复显示**：

```
我已经分析了项目目录，发现共有 42 个文件需要整理。

我建议按以下方式组织：
1. 文档类文件（.md, .txt, .docx）→ `项目文档/` 文件夹
2. 代码类文件（.js, .ts, .rs）→ `源代码/` 文件夹
3. 图片资源（.png, .jpg）→ `资源/图片/` 文件夹
4. 其他文件 → `其他/` 文件夹

现在开始执行整理...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 列出文件 | 查看项目根目录 | ✅ 成功 (42 项)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 创建文件夹 | 创建"项目文档"文件夹 | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 创建文件夹 | 创建"源代码"文件夹 | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 创建文件夹 | 创建"资源/图片"文件夹 | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 移动文件 | 移动"项目计划.md"到"项目文档/" | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 移动文件 | 移动"README.md"到"项目文档/" | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
... (更多文件移动操作)

整理完成！已成功将 42 个文件按类型分类到相应文件夹。
```

### 6.2 示例二：文本编辑操作（使用 Diff 预览）

**用户输入**：
```
优化当前文档的第 3 段，让它更专业
```

**AI 回复显示**：

```
我已经分析了当前文档的第 3 段内容，准备进行以下优化：

**优化内容**：
- 原内容：使用更简洁的表达方式
- 新内容：采用更专业的术语和结构
- 改进点：增强逻辑性，提升专业性

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 编辑文档（Diff 预览）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
文件: 项目计划.md
操作: 优化第 3 段内容

[显示 Diff 预览]
  原: "这个项目的主要目标是..."
  新: "本项目旨在通过系统化的方法实现..."

[✅ 确认修改] [❌ 取消]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**注意**：文本编辑使用 Diff 预览方式，沿用旧的交互逻辑，不属于需要授权的操作。

### 6.2.1 示例二补充：需要授权的操作

**用户输入**：
```
帮我读取系统配置文件 ~/.config/app/settings.json
```

**AI 回复显示**：

```
我需要访问您系统目录中的配置文件。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 需要授权：访问系统文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
操作: 读取系统配置文件
路径: ~/.config/app/settings.json
权限类型: 文件系统访问（工作区外）
用途: 获取应用配置信息

[✅ 授权] [❌ 拒绝]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.3 示例三：文件搜索任务

**用户输入**：
```
查找所有包含"配置"的文件
```

**AI 回复显示**：

```
正在搜索包含"配置"的文件...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 搜索文件 | 关键词: "配置" | ✅ 成功 (5 项)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

找到 5 个相关文件：

1. **config.json** - 项目配置文件
2. **settings.md** - 配置说明文档
3. **src/config.ts** - 配置模块源代码
4. **docs/配置指南.md** - 配置指南文档
5. **test/config.test.js** - 配置测试文件

需要我打开或查看某个文件吗？
```

### 6.4 示例四：复杂任务（回复与指令穿插）

**用户输入**：
```
帮我创建一个新的项目结构，包含前端、后端和文档三个文件夹
```

**AI 回复显示**（按时间顺序穿插）：

```
我将为您创建一个标准的项目结构，包含前端、后端和文档三个主要文件夹。

**计划**：
1. 创建 `frontend/` 文件夹
2. 创建 `backend/` 文件夹
3. 创建 `docs/` 文件夹
4. 在每个文件夹中创建基础的 README.md 文件

开始执行...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 创建文件夹 | 创建"frontend"文件夹 | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

第一个文件夹创建完成。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 创建文件夹 | 创建"backend"文件夹 | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 创建文件夹 | 创建"docs"文件夹 | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

所有文件夹已创建，现在开始创建 README 文件...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 创建文件 | 创建"frontend/README.md" | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 创建文件 | 创建"backend/README.md" | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 创建文件 | 创建"docs/README.md" | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

项目结构创建完成！

已创建：
- frontend/ 文件夹及 README.md
- backend/ 文件夹及 README.md
- docs/ 文件夹及 README.md

您现在可以开始在各个文件夹中添加项目文件了。
```

**关键点**：
- 回复文本和工具调用按时间顺序穿插显示
- 每个工具调用后可能有 AI 的简短回复
- 所有内容统一在一个消息气泡内
- 视觉上清晰区分文本块和工具缩览

### 6.5 示例五：需要授权的网络访问

**用户输入**：
```
帮我搜索一下最新的 React 18 特性
```

**AI 回复显示**：

```
我需要访问网络来搜索最新的 React 18 特性信息。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 需要授权：访问网络
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
操作: 浏览网页搜索信息
目标: 搜索 React 18 最新特性
权限类型: 网络访问
用途: 获取最新的技术文档和资料

[✅ 授权] [❌ 拒绝]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**用户点击授权后**：

```
已获得授权，开始搜索...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 浏览网页 | 搜索"React 18 特性" | ✅ 成功
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

根据搜索结果，React 18 的主要特性包括：

1. **自动批处理（Automatic Batching）**
   - 自动将多个状态更新批处理，提升性能

2. **并发特性（Concurrent Features）**
   - 支持并发渲染，提供更好的用户体验

3. **Suspense 改进**
   - 更好的加载状态管理和错误处理

...（更多内容）
```

### 6.6 示例六：快捷应用到文档（Chat 模式）

**用户输入**（Chat 模式）：
```
帮我写一段关于项目背景的介绍文字
```

**AI 回复显示**：

```
以下是一段项目背景介绍：

本项目旨在通过创新的技术方案，解决传统文档编辑中的痛点问题。
我们采用现代化的架构设计，结合 AI 技术，为用户提供流畅、智能的文档编辑体验。
项目团队拥有丰富的技术积累和产品经验，致力于打造业界领先的文档编辑器。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📄 应用到文档 ▼]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**点击"应用到文档"按钮后**：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 应用到文档
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
选择应用方式：

○ 插入到光标位置
○ 替换选中文本
○ 追加到文档末尾
○ 应用到工作区文档（创建新文件）

[预览] [应用] [取消]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**关键点**：
- 仅在 Chat 模式下显示"应用到文档"按钮
- 按钮位于 AI 回复消息下方
- 支持多种应用方式选择
- 支持预览（Diff 视图）后再应用
- 自动匹配当前文档格式和样式

### 6.7 示例七：文档编辑的多层确认（Agent 模式）

**用户输入**（Agent 模式）：
```
帮我优化整个文档，让它更专业
```

**AI 回复显示**：

```
我已经分析了整个文档，准备进行以下优化：

**优化计划**：
1. 优化第 1 段：增强逻辑性
2. 优化第 3 段：提升专业性
3. 优化第 5 段：改进表达方式

开始执行优化...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 编辑文档（段落级别确认）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
文件: 项目计划.md

**段落 1 修改**：
  原: "这个项目的主要目标是..."
  新: "本项目旨在通过系统化的方法实现..."
  [✅ 确认] [⏭️ 跳过] [❌ 取消]

**段落 3 修改**：
  原: "我们计划使用..."
  新: "我们将采用..."
  [✅ 确认] [⏭️ 跳过] [❌ 取消]

**段落 5 修改**：
  原: "最后，我们希望..."
  新: "最终，我们的目标是..."
  [✅ 确认] [⏭️ 跳过] [❌ 取消]

[✅ 全部确认] [❌ 全部取消]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**关键点**：
- 支持段落级别的独立确认
- 支持跳过某个段落的修改
- 支持一次性确认所有修改
- Diff 视图清晰显示修改内容

## 八、视觉设计规范

### 7.1 颜色方案

- **AI 回复气泡**：浅灰色背景（`bg-gray-100 dark:bg-gray-700`）
- **文本块**：与消息气泡同色，使用分隔线区分（`border-t border-gray-200 dark:border-gray-600`）
- **工具缩览**：浅蓝色边框（`border-blue-200 dark:border-blue-800`），浅蓝色背景（`bg-blue-50 dark:bg-blue-900/20`）
- **授权卡片**：黄色边框（`border-yellow-400 dark:border-yellow-600`），黄色背景（`bg-yellow-50 dark:bg-yellow-900/20`）
- **快捷应用按钮**：蓝色按钮（`bg-blue-500 hover:bg-blue-600`），仅在 Chat 模式显示
- **Diff 预览**：沿用旧样式（绿色/红色高亮）
- **成功状态**：绿色图标（`text-green-500`）
- **失败状态**：红色图标（`text-red-500`）
- **执行中状态**：蓝色图标 + 旋转动画（`text-blue-500 animate-spin`）

### 7.2 间距规范

- **消息气泡内边距**：`p-4`
- **文本块间距**：`mt-2`（文本块之间）
- **工具缩览间距**：`space-y-2`（工具缩览之间）
- **工具缩览内边距**：`px-3 py-2`
- **授权卡片内边距**：`p-4`
- **快捷应用按钮**：`mt-3`（位于消息下方）
- **内容块分隔线**：`border-t border-gray-200 dark:border-gray-600`（文本块与工具缩览之间）

### 7.3 字体规范

- **AI 回复文本**：`text-sm` 或 `text-base`
- **工具缩览文本**：`text-xs`
- **确认命令描述**：`text-sm font-medium`
- **按钮文字**：`text-sm font-medium`

## 九、交互行为

### 8.1 工具缩览交互

1. **默认状态**：显示一行缩览
2. **悬停效果**：背景色加深，显示"点击展开"提示
3. **点击展开**：显示详细信息，按钮变为"收起"
4. **再次点击**：收起详细信息

### 8.2 授权卡片交互

1. **显示状态**：始终展开，突出显示
2. **授权按钮**：点击后执行操作，显示执行结果
3. **拒绝按钮**：点击后隐藏授权卡片，不执行操作
4. **执行后**：授权卡片变为工具缩览样式，显示执行结果

### 8.3 文本编辑交互（Diff 预览）

1. **显示状态**：工具调用后自动显示 Diff 预览
2. **多层确认机制**：
   - 段落级别确认：每个修改段落有独立的确认按钮
   - 文档级别确认：一次性确认所有修改
   - 跳过功能：支持跳过某个段落的修改
3. **确认按钮**：点击后应用到编辑器
4. **取消按钮**：点击后关闭 Diff 预览
5. **沿用旧逻辑**：使用 `DocumentDiffView` 组件
6. **格式匹配**：自动匹配当前文档格式（TXT、t-docx、MD、HTML）

### 8.4 快捷应用到文档交互（Chat 模式）

1. **显示条件**：仅在 Chat 模式下，AI 回复消息下方显示按钮
2. **应用方式选择**：点击按钮后显示应用方式菜单
3. **预览功能**：支持预览（Diff 视图）后再应用
4. **格式转换**：自动识别和转换内容格式，匹配当前文档格式
5. **样式继承**：应用时继承当前光标位置的样式
6. **部分应用**：支持选择部分内容应用（如代码块、段落等）

### 8.5 内容块动画

- **文本块出现**：使用淡入效果（`animate-fade-in`）
- **工具缩览展开/收起**：使用 `transition-all duration-200` 平滑过渡
- **状态变化**：使用淡入淡出效果
- **执行中**：使用旋转动画表示加载状态
- **内容块分隔**：使用分隔线（`border-t`）区分不同内容块

## 十、实现优先级

### 9.1 第一阶段（核心功能）

1. ✅ 实现 `MessageContentBlock` 数据结构
2. ✅ 实现 `ToolCallSummary` 组件（工具缩览）
3. ✅ 实现 `AuthorizationCard` 组件（授权卡片）
4. ✅ 实现 `QuickApplyButton` 组件（快捷应用到文档，Chat 模式）
5. ✅ 实现内容块按时间顺序穿插显示
6. ✅ 修改消息渲染逻辑，支持内容块列表
7. ✅ 实现展开/收起功能
8. ✅ 保持文本编辑的 Diff 预览逻辑（旧逻辑，支持多层确认）
9. ✅ 实现格式和样式匹配（TXT、t-docx、MD、HTML）

### 9.2 第二阶段（优化体验）

1. 优化工具缩览的描述生成（更友好的自然语言）
2. 优化快捷应用的内容识别算法（代码块、段落、列表等）
3. 添加动画效果
4. 优化移动端显示
5. 添加批量操作支持（多个工具调用合并显示）
6. 优化 Diff 预览的显示效果（段落级别、文档级别）

### 9.3 第三阶段（高级功能）

1. 支持自定义工具分类（哪些需要确认）
2. 支持工具执行历史查看
3. 支持撤销/重做操作
4. 支持工具执行结果导出

## 十一、技术实现要点

### 10.1 工具描述生成

需要为每个工具生成友好的自然语言描述：

```typescript
function generateToolDescription(toolCall: ToolCall): string {
  const { name, arguments: args } = toolCall;
  
  switch (name) {
    case 'list_files':
      return `查看目录: ${args.path || '.'}`;
    case 'create_folder':
      return `创建文件夹: ${args.path}`;
    case 'move_file':
      return `移动文件: ${args.source} → ${args.destination}`;
    case 'read_file':
      return `读取文件: ${args.path}`;
    // ... 其他工具
    default:
      return `执行操作: ${name}`;
  }
}
```

### 10.2 授权请求描述生成

对于需要授权的操作，需要生成更详细的描述：

```typescript
function generateAuthorizationDescription(toolCall: ToolCall): string {
  const { name, arguments: args } = toolCall;
  
  switch (name) {
    case 'read_file':
      if (isOutsideWorkspace(args.path)) {
        return `我需要访问系统文件：${args.path}\n\n这将允许我读取工作区外的文件内容。`;
      }
      break;
    case 'browse_web':
      return `我需要访问网络来${args.purpose || '获取信息'}。\n\n目标网址：${args.url}`;
    case 'execute_system_command':
      return `我需要执行系统命令：${args.command}\n\n这将允许我执行系统级别的操作。`;
    // ... 其他需要授权的工具
    default:
      return `需要授权执行: ${name}`;
  }
  
  return '';
}

function needsAuthorization(toolName: string, args: any): boolean {
  // 判断是否需要授权
  switch (toolName) {
    case 'read_file':
      return isOutsideWorkspace(args.path);
    case 'write_file':
      return isOutsideWorkspace(args.path);
    case 'browse_web':
      return true;
    case 'execute_system_command':
      return true;
    default:
      return false;
  }
}
```

### 10.3 状态管理

需要在消息中添加内容块和工具调用的显示状态：

```typescript
interface ChatMessage {
  // ... 现有字段
  contentBlocks?: MessageContentBlock[]; // 内容块列表
  toolCalls?: Array<{
    // ... 现有字段
    expanded?: boolean; // 是否展开（用于工具缩览）
    authorized?: boolean; // 是否已授权（用于授权卡片）
  }>;
}

interface MessageContentBlock {
  id: string;
  type: 'text' | 'tool' | 'authorization';
  timestamp: number;
  content?: string;
  toolCall?: ToolCall;
  authorization?: AuthorizationRequest;
  expanded?: boolean; // 是否展开（用于工具缩览）
}
```

### 10.4 内容块构建时机

内容块应该在以下时机构建：

1. **流式接收时**：每收到一个文本块或工具调用，立即添加到内容块列表
2. **工具执行完成时**：更新对应工具调用的状态
3. **授权完成时**：将授权卡片转换为工具缩览
4. **文本块合并**：连续的文本块自动合并为一个文本块

```typescript
// 在 ChatPanel 中处理流式响应
function handleStreamChunk(chunk: StreamChunk) {
  if (chunk.type === 'text') {
    // 添加文本块（如果上一个也是文本块，则合并）
    const lastBlock = getLastContentBlock();
    if (lastBlock && lastBlock.type === 'text') {
      // 合并到上一个文本块
      updateContentBlock(lastBlock.id, {
        content: lastBlock.content + chunk.text
      });
    } else {
      // 创建新的文本块
      addContentBlock({
        type: 'text',
        content: chunk.text,
        timestamp: Date.now()
      });
    }
  } else if (chunk.type === 'tool_call') {
    // 添加工具调用块
    addContentBlock({
      type: 'tool',
      toolCall: chunk.toolCall,
      timestamp: chunk.toolCall.timestamp || Date.now()
    });
  }
}
```

### 10.5 格式和样式匹配

在应用内容到文档时，需要自动匹配当前文档格式：

```typescript
function matchDocumentFormat(content: string, currentFormat: string): string {
  switch (currentFormat) {
    case 'txt':
      // 去除所有格式标记，保留纯文本
      return stripMarkdown(stripHTML(content));
    case 't-docx':
      // 将 Markdown 或 HTML 转换为 t-docx 支持的样式
      return convertToDocxFormat(content);
    case 'md':
      // 保留或转换为 Markdown 语法
      return normalizeMarkdown(content);
    case 'html':
      // 保留或转换为 HTML 格式
      return normalizeHTML(content);
    default:
      return content;
  }
}
```

## 十二、测试用例

### 11.1 基础功能测试

1. **工具缩览显示**：验证工具调用正确显示为缩览格式
2. **展开/收起**：验证点击可以展开和收起详细信息
3. **确认命令**：验证需要确认的命令正确显示确认卡片
4. **状态更新**：验证工具执行状态正确更新（执行中 → 成功/失败）

### 11.2 交互测试

1. **多工具调用**：验证多个工具调用正确显示为列表
2. **长列表滚动**：验证工具列表过长时可以正确滚动
3. **响应式布局**：验证在不同屏幕尺寸下正确显示
4. **暗色模式**：验证在暗色模式下样式正确

### 11.3 边界情况测试

1. **工具执行失败**：验证失败状态正确显示
2. **工具执行超时**：验证超时状态正确处理
3. **大量工具调用**：验证性能（如 100+ 个工具调用）
4. **特殊字符**：验证文件名包含特殊字符时正确显示

## 十三、后续优化方向

1. **智能合并**：将相同类型的工具调用合并显示（如"移动了 10 个文件"）
2. **进度显示**：对于长时间运行的任务，显示进度条
3. **批量确认**：支持批量确认多个命令
4. **执行历史**：支持查看和重放工具执行历史
5. **自定义样式**：允许用户自定义工具显示的样式和格式

---

**文档版本**：v1.0  
**创建日期**：2025-01-23  
**最后更新**：2025-01-23

