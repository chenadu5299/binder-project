# AI 聊天窗口引用功能完整技术方案

## 一、功能概述

### 1.1 核心目标

实现一个完善的多类型引用系统，支持用户在 AI 聊天窗口中引用多种资源，包括：
- 编辑器中的文本、图片、表格
- 文件树中的文件和文件夹
- 记忆库、知识库
- 聊天记录
- 外部文件和图片（拖拽）
- 链接

参考实现：Void Editor、Cursor 的引用系统设计

### 1.2 功能特性

- ✅ **多类型支持**：文本、文件、文件夹、图片、记忆库、知识库、聊天记录、链接
- ✅ **智能显示**：根据类型显示简洁的摘要信息，而非完整内容
- ✅ **多引用管理**：支持同时引用多个资源
- ✅ **快捷操作**：@ 符号快速选择引用
- ✅ **引用下拉框**：统一的引用管理界面
- ✅ **拖拽支持**：拖拽文件/文件夹到输入框自动创建引用
- ✅ **复制粘贴**：从编辑器复制文字自动识别为引用

---

## 二、引用类型定义

### 2.1 扩展后的引用类型

```typescript
// src/types/reference.ts

export enum ReferenceType {
    TEXT = 'text',              // 文本引用（编辑器复制的文字）
    FILE = 'file',              // 文件引用
    FOLDER = 'folder',          // 文件夹引用（新增）
    IMAGE = 'image',            // 图片引用
    TABLE = 'table',            // 表格引用（新增）
    MEMORY = 'memory',          // 记忆库引用
    KNOWLEDGE_BASE = 'kb',      // 知识库引用
    CHAT = 'chat',              // 聊天记录引用（新增）
    LINK = 'link',              // 链接引用
}

// 文件夹引用（新增）
export interface FolderReference extends BaseReference {
    type: ReferenceType.FOLDER;
    path: string;               // 文件夹路径
    name: string;               // 文件夹名称
    fileCount?: number;         // 包含的文件数量
    size?: number;              // 总大小
}

// 表格引用（新增）
export interface TableReference extends BaseReference {
    type: ReferenceType.TABLE;
    sourceFile: string;         // 来源文件
    tableData: any[][];         // 表格数据（二维数组）
    rowRange?: {                // 行范围
        start: number;
        end: number;
    };
    columnRange?: {             // 列范围
        start: number;
        end: number;
    };
}

// 聊天记录引用（新增）
export interface ChatReference extends BaseReference {
    type: ReferenceType.CHAT;
    chatTabId: string;          // 聊天标签页 ID
    chatTabTitle: string;       // 聊天标签页标题
    messageIds: string[];       // 引用的消息 ID 列表
    messageRange?: {            // 消息范围（可选）
        start: number;
        end: number;
    };
}

// 扩展知识库引用
export interface KnowledgeBaseReference extends BaseReference {
    type: ReferenceType.KNOWLEDGE_BASE;
    kbId: string;               // 知识库 ID
    kbName: string;             // 知识库名称
    query?: string;             // 查询关键词（可选）
    itemCount?: number;         // 匹配项数量
}
```

### 2.2 文本引用优化

```typescript
// 文本引用显示优化
export interface TextReference extends BaseReference {
    type: ReferenceType.TEXT;
    content: string;            // 引用的文本内容（完整内容，用于 AI）
    preview: string;            // 预览文本（前 100 字符）
    sourceFile: string;         // 来源文件路径（必需）
    fileName: string;           // 文件名（用于显示）
    lineRange: {                // 行号范围（必需）
        start: number;
        end: number;
    };
    charRange: {                // 字符范围（必需）
        start: number;
        end: number;
    };
    // 显示文本：基于位置信息
    displayText: string;        // 如："src/main.ts (行 10-15)"
}
```

---

## 三、引用显示方式

### 3.1 显示规则

| 引用类型 | 显示内容 | 示例 |
|---------|---------|------|
| **文本引用** | 文件名 + 位置信息 | `main.ts (行 10-15)` |
| **文件引用** | 文件名 | `README.md` |
| **文件夹引用** | 文件夹名 + 文件数 | `src/ (5 个文件)` |
| **图片引用** | 图片名 + 缩略图 | `screenshot.png` [缩略图] |
| **表格引用** | 文件名 + 表格范围 | `data.xlsx (A1:C10)` |
| **记忆库引用** | 记忆库名 + 项数 | `用户信息 (3 项)` |
| **知识库引用** | 知识库名 + 匹配数 | `API 文档 (5 项)` |
| **聊天记录引用** | 聊天标签名 + 位置 | `对话 #1 (消息 2-5)` |
| **链接引用** | 链接标题或 URL | `GitHub - OpenAI` |

### 3.2 显示组件优化

```typescript
// src/components/Chat/ReferenceTags.tsx

// 文本引用显示组件
const TextReferenceDisplay: React.FC<{ ref: TextReference }> = ({ ref }) => {
    // 只显示位置信息，不显示完整内容
    return (
        <div className="text-reference-tag">
            <DocumentIcon />
            <span>{ref.fileName}</span>
            <span className="location-info">
                (行 {ref.lineRange.start}-{ref.lineRange.end})
            </span>
            <button onClick={() => expandReference(ref.id)}>展开</button>
        </div>
    );
};

// 文件夹引用显示组件
const FolderReferenceDisplay: React.FC<{ ref: FolderReference }> = ({ ref }) => {
    return (
        <div className="folder-reference-tag">
            <FolderIcon />
            <span>{ref.name}</span>
            {ref.fileCount && (
                <span className="file-count">({ref.fileCount} 个文件)</span>
            )}
        </div>
    );
};

// 聊天记录引用显示组件
const ChatReferenceDisplay: React.FC<{ ref: ChatReference }> = ({ ref }) => {
    return (
        <div className="chat-reference-tag">
            <ChatBubbleIcon />
            <span>{ref.chatTabTitle}</span>
            <span className="message-range">
                (消息 {ref.messageRange?.start || 0}-{ref.messageRange?.end || 0})
            </span>
        </div>
    );
};
```

---

## 四、引用管理下拉框

### 4.1 组件设计

```typescript
// src/components/Chat/ReferenceManager.tsx

interface ReferenceManagerProps {
    tabId: string;
    onSelect?: (ref: Reference) => void;
}

export const ReferenceManager: React.FC<ReferenceManagerProps> = ({ tabId, onSelect }) => {
    const { getReferences, addReference } = useReferenceStore();
    const references = getReferences(tabId);
    
    // 按类型分组
    const groupedRefs = useMemo(() => {
        const groups: Record<ReferenceType, Reference[]> = {
            [ReferenceType.TEXT]: [],
            [ReferenceType.FILE]: [],
            [ReferenceType.FOLDER]: [],
            [ReferenceType.IMAGE]: [],
            [ReferenceType.TABLE]: [],
            [ReferenceType.MEMORY]: [],
            [ReferenceType.KNOWLEDGE_BASE]: [],
            [ReferenceType.CHAT]: [],
            [ReferenceType.LINK]: [],
        };
        
        references.forEach(ref => {
            groups[ref.type].push(ref);
        });
        
        return groups;
    }, [references]);
    
    return (
        <div className="reference-manager">
            <div className="reference-manager-header">
                <h3>引用管理</h3>
                <button onClick={() => setShowAddDialog(true)}>+ 添加引用</button>
            </div>
            
            <div className="reference-categories">
                {/* 文本引用 */}
                {groupedRefs[ReferenceType.TEXT].length > 0 && (
                    <ReferenceCategory
                        title="文本引用"
                        icon={<DocumentIcon />}
                        references={groupedRefs[ReferenceType.TEXT]}
                        onSelect={onSelect}
                    />
                )}
                
                {/* 文件引用 */}
                {groupedRefs[ReferenceType.FILE].length > 0 && (
                    <ReferenceCategory
                        title="文件引用"
                        icon={<FolderIcon />}
                        references={groupedRefs[ReferenceType.FILE]}
                        onSelect={onSelect}
                    />
                )}
                
                {/* 文件夹引用 */}
                {groupedRefs[ReferenceType.FOLDER].length > 0 && (
                    <ReferenceCategory
                        title="文件夹引用"
                        icon={<FolderIcon />}
                        references={groupedRefs[ReferenceType.FOLDER]}
                        onSelect={onSelect}
                    />
                )}
                
                {/* 图片引用 */}
                {groupedRefs[ReferenceType.IMAGE].length > 0 && (
                    <ReferenceCategory
                        title="图片引用"
                        icon={<PhotoIcon />}
                        references={groupedRefs[ReferenceType.IMAGE]}
                        onSelect={onSelect}
                    />
                )}
                
                {/* 记忆库引用 */}
                {groupedRefs[ReferenceType.MEMORY].length > 0 && (
                    <ReferenceCategory
                        title="记忆库引用"
                        icon={<BookOpenIcon />}
                        references={groupedRefs[ReferenceType.MEMORY]}
                        onSelect={onSelect}
                    />
                )}
                
                {/* 聊天记录引用 */}
                {groupedRefs[ReferenceType.CHAT].length > 0 && (
                    <ReferenceCategory
                        title="聊天记录引用"
                        icon={<ChatBubbleIcon />}
                        references={groupedRefs[ReferenceType.CHAT]}
                        onSelect={onSelect}
                    />
                )}
                
                {/* 链接引用 */}
                {groupedRefs[ReferenceType.LINK].length > 0 && (
                    <ReferenceCategory
                        title="链接引用"
                        icon={<LinkIcon />}
                        references={groupedRefs[ReferenceType.LINK]}
                        onSelect={onSelect}
                    />
                )}
            </div>
            
            {/* 添加引用对话框 */}
            {showAddDialog && (
                <AddReferenceDialog
                    onClose={() => setShowAddDialog(false)}
                    onAdd={(ref) => {
                        addReference(tabId, ref);
                        setShowAddDialog(false);
                    }}
                />
            )}
        </div>
    );
};
```

### 4.2 添加引用对话框

```typescript
// src/components/Chat/AddReferenceDialog.tsx

interface AddReferenceDialogProps {
    onClose: () => void;
    onAdd: (ref: Reference) => void;
}

export const AddReferenceDialog: React.FC<AddReferenceDialogProps> = ({ onClose, onAdd }) => {
    const [activeTab, setActiveTab] = useState<'file' | 'memory' | 'chat' | 'link'>('file');
    
    return (
        <Modal onClose={onClose}>
            <div className="add-reference-dialog">
                <div className="dialog-tabs">
                    <button onClick={() => setActiveTab('file')}>文件/文件夹</button>
                    <button onClick={() => setActiveTab('memory')}>记忆库</button>
                    <button onClick={() => setActiveTab('chat')}>聊天记录</button>
                    <button onClick={() => setActiveTab('link')}>链接</button>
                </div>
                
                <div className="dialog-content">
                    {activeTab === 'file' && <FileSelector onSelect={onAdd} />}
                    {activeTab === 'memory' && <MemorySelector onSelect={onAdd} />}
                    {activeTab === 'chat' && <ChatSelector onSelect={onAdd} />}
                    {activeTab === 'link' && <LinkInput onSelect={onAdd} />}
                </div>
            </div>
        </Modal>
    );
};
```

---

## 五、@ 符号快捷选择

### 5.1 实现逻辑

```typescript
// src/components/Chat/ChatInput.tsx

// 检测 @ 语法并显示选择器
useEffect(() => {
    if (!textareaRef.current || !containerRef.current) return;
    
    const textarea = textareaRef.current;
    const selectionStart = textarea.selectionStart;
    const textBeforeCursor = input.substring(0, selectionStart);
    
    // 检测 @ 语法（从光标位置向前查找）
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    
    if (atMatch) {
        const query = atMatch[1];
        const atIndex = textBeforeCursor.lastIndexOf('@');
        
        // 检测是否是特殊类型：@文件:、@记忆库:、@聊天:
        const typeMatch = textBeforeCursor.match(/@(文件|记忆库|聊天|链接)[：:]([^\s@]*)$/);
        const mentionType = typeMatch 
            ? (typeMatch[1] === '文件' ? 'file' : 
               typeMatch[1] === '记忆库' ? 'memory' : 
               typeMatch[1] === '聊天' ? 'chat' : 'link')
            : 'file'; // 默认显示文件
        
        const mentionQuery = typeMatch ? typeMatch[2] : query;
        
        // 显示选择器
        setMentionState({
            show: true,
            query: mentionQuery,
            type: mentionType,
            position: calculateMentionPosition(textarea, atIndex),
        });
    } else {
        setMentionState(null);
    }
}, [input]);
```

### 5.2 选择器内容

```typescript
// src/components/Chat/MentionSelector.tsx

export const MentionSelector: React.FC<MentionSelectorProps> = ({ query, type, items, onSelect }) => {
    // 根据类型获取推荐项
    const getRecommendations = () => {
        switch (type) {
            case 'file':
                // 推荐最近打开的文件、当前工作区的文件
                return getRecommendedFiles(query);
            case 'memory':
                return getRecommendedMemories(query);
            case 'chat':
                return getRecommendedChats(query);
            case 'link':
                return getRecommendedLinks(query);
            default:
                return [];
        }
    };
    
    const recommendations = getRecommendations();
    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(query.toLowerCase())
    );
    
    return (
        <div className="mention-selector">
            {/* 推荐项 */}
            {recommendations.length > 0 && (
                <div className="mention-section">
                    <div className="section-title">推荐</div>
                    {recommendations.map(item => (
                        <MentionItem
                            key={item.id}
                            item={item}
                            onClick={() => onSelect(item)}
                        />
                    ))}
                </div>
            )}
            
            {/* 搜索结果 */}
            {filteredItems.length > 0 && (
                <div className="mention-section">
                    <div className="section-title">搜索结果</div>
                    {filteredItems.map(item => (
                        <MentionItem
                            key={item.id}
                            item={item}
                            onClick={() => onSelect(item)}
                        />
                    ))}
                </div>
            )}
            
            {/* 空状态 */}
            {recommendations.length === 0 && filteredItems.length === 0 && (
                <div className="mention-empty">未找到匹配项</div>
            )}
        </div>
    );
};
```

---

## 六、复制粘贴优化

### 6.1 编辑器复制增强

```typescript
// src/components/Editor/extensions/CopyReferenceExtension.ts

// 扩展复制功能，支持文本、图片、表格
export const CopyReferenceExtension = Extension.create({
    name: 'copyReference',
    
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('copyReference'),
                props: {
                    handleDOMEvents: {
                        copy: (view: EditorView, event: ClipboardEvent) => {
                            const { state } = view;
                            const { selection } = state;
                            const { from, to } = selection;
                            
                            if (from === to) return false;
                            
                            // 检测选中的内容类型
                            const selectedContent = detectSelectedContentType(view, from, to);
                            
                            if (selectedContent.type === 'text') {
                                // 处理文本复制（已有实现）
                                handleTextCopy(view, event, from, to);
                            } else if (selectedContent.type === 'image') {
                                // 处理图片复制
                                handleImageCopy(view, event, selectedContent);
                            } else if (selectedContent.type === 'table') {
                                // 处理表格复制
                                handleTableCopy(view, event, selectedContent);
                            }
                            
                            return false;
                        },
                    },
                },
            }),
        ];
    },
});

// 检测选中内容类型
function detectSelectedContentType(
    view: EditorView, 
    from: number, 
    to: number
): { type: 'text' | 'image' | 'table'; data?: any } {
    const { state } = view;
    const $from = state.doc.resolve(from);
    const node = $from.node();
    
    // 检查是否是图片节点
    if (node.type.name === 'image') {
        return { type: 'image', data: node.attrs };
    }
    
    // 检查是否是表格
    const tableNode = findAncestor(node, 'table');
    if (tableNode) {
        return { type: 'table', data: extractTableData(tableNode, from, to) };
    }
    
    // 默认是文本
    return { type: 'text' };
}
```

### 6.2 粘贴处理优化

```typescript
// src/components/Chat/ChatInput.tsx

const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    // 1. 检查是否有自定义的引用元数据（来自编辑器）
    const sourceData = e.clipboardData.getData('application/x-binder-source');
    if (sourceData) {
        try {
            const source = JSON.parse(sourceData);
            
            // 根据类型创建不同的引用
            if (source.type === 'text') {
                await handleTextReferencePaste(source, e);
            } else if (source.type === 'image') {
                await handleImageReferencePaste(source, e);
            } else if (source.type === 'table') {
                await handleTableReferencePaste(source, e);
            }
            
            e.preventDefault();
            return;
        } catch (error) {
            console.error('解析引用元数据失败:', error);
        }
    }
    
    // 2. 检查是否有图片
    for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                await handleImageFile(file);
            }
            return;
        }
    }
    
    // 3. 检查是否有外部文件
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
        e.preventDefault();
        for (const file of files) {
            await handleExternalFilePaste(file);
        }
        return;
    }
    
    // 4. 默认文本粘贴
    // （如果没有引用元数据，就是普通文本粘贴）
};
```

---

## 七、拖拽功能优化

### 7.1 拖拽处理逻辑

```typescript
// src/components/Chat/ChatInput.tsx

const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 确保有标签页（没有则创建）
    let currentTabId = tabId;
    if (!currentTabId) {
        currentTabId = createTab(undefined, pendingMode);
        setActiveTab(currentTabId);
    }
    
    // 1. 检查是否是从文件树拖拽的文件/文件夹
    const filePath = e.dataTransfer.getData('application/file-path');
    const isDirectory = e.dataTransfer.getData('application/is-directory') === 'true';
    
    if (filePath) {
        if (isDirectory) {
            // 创建文件夹引用
            await handleFolderReference(filePath);
        } else {
            // 创建文件引用
            await handleFileTreeReference(filePath);
        }
        return;
    }
    
    // 2. 检查是否是外部文件/文件夹拖拽
    const items = Array.from(e.dataTransfer.items);
    const files = Array.from(e.dataTransfer.files);
    
    if (items.length > 0) {
        // 检查是否有目录
        for (const item of items) {
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry?.();
                if (entry?.isDirectory) {
                    // 处理文件夹拖拽
                    await handleExternalFolderDrop(entry);
                } else {
                    // 处理文件拖拽
                    await handleExternalFileDrop(entry);
                }
            }
        }
    }
    
    // 3. 处理图片文件
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            await handleImageFile(file);
        } else {
            await handleFileReference(file);
        }
    }
};
```

### 7.2 文件夹引用处理

```typescript
// 处理文件夹引用
const handleFolderReference = async (folderPath: string) => {
    try {
        // 获取文件夹信息
        const folderInfo = await invoke<{
            path: string;
            name: string;
            fileCount: number;
            size: number;
        }>('get_folder_info', { path: folderPath });
        
        const folderRef: FolderReference = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: ReferenceType.FOLDER,
            createdAt: Date.now(),
            path: folderInfo.path,
            name: folderInfo.name,
            fileCount: folderInfo.fileCount,
            size: folderInfo.size,
        };
        
        addReference(tabId || '', folderRef);
    } catch (error) {
        console.error('创建文件夹引用失败:', error);
    }
};
```

---

## 八、聊天记录引用

### 8.1 实现逻辑

```typescript
// src/components/Chat/ChatReferenceSelector.tsx

export const ChatReferenceSelector: React.FC<ChatReferenceSelectorProps> = ({ onSelect }) => {
    const { tabs } = useChatStore();
    
    return (
        <div className="chat-reference-selector">
            <div className="chat-list">
                {tabs.map(tab => (
                    <div key={tab.id} className="chat-tab-item">
                        <div className="chat-tab-header">
                            <span>{tab.title}</span>
                            <span className="message-count">
                                {tab.messages.length} 条消息
                            </span>
                        </div>
                        
                        {/* 消息列表 */}
                        <div className="message-list">
                            {tab.messages.map((msg, index) => (
                                <div
                                    key={msg.id}
                                    className="message-item"
                                    onClick={() => handleMessageSelect(tab.id, msg.id)}
                                >
                                    <span className="message-preview">
                                        {msg.content.substring(0, 50)}...
                                    </span>
                                    <span className="message-index">消息 {index + 1}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// 创建聊天记录引用
const handleMessageSelect = (chatTabId: string, messageId: string) => {
    const tab = tabs.find(t => t.id === chatTabId);
    if (!tab) return;
    
    const messageIndex = tab.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    // 允许选择多条消息（Shift+点击选择范围）
    const selectedMessages = getSelectedMessages(tab, messageIndex);
    
    const chatRef: ChatReference = {
        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: ReferenceType.CHAT,
        createdAt: Date.now(),
        chatTabId: tab.id,
        chatTabTitle: tab.title,
        messageIds: selectedMessages.map(m => m.id),
        messageRange: {
            start: selectedMessages[0].index,
            end: selectedMessages[selectedMessages.length - 1].index,
        },
    };
    
    onSelect(chatRef);
};
```

---

## 九、后端支持

### 9.1 文件信息获取

```rust
// src-tauri/src/commands/file_commands.rs

#[tauri::command]
pub async fn get_folder_info(
    path: String,
) -> Result<FolderInfo, String> {
    let folder_path = PathBuf::from(path);
    
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("文件夹不存在".to_string());
    }
    
    let mut file_count = 0;
    let mut total_size = 0u64;
    
    // 递归计算文件数量和大小
    fn count_files(dir: &Path, file_count: &mut usize, total_size: &mut u64) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                count_files(&path, file_count, total_size)?;
            } else {
                *file_count += 1;
                *total_size += path.metadata()?.len();
            }
        }
        Ok(())
    }
    
    count_files(&folder_path, &mut file_count, &mut total_size)
        .map_err(|e| format!("读取文件夹失败: {}", e))?;
    
    Ok(FolderInfo {
        path: path.clone(),
        name: folder_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("未知")
            .to_string(),
        file_count,
        size: total_size,
    })
}
```

### 9.2 文本位置计算

```rust
// src-tauri/src/services/text_location.rs

pub fn calculate_line_range(
    content: &str,
    char_start: usize,
    char_end: usize,
) -> (usize, usize) {
    let lines: Vec<&str> = content.lines().collect();
    let mut current_pos = 0;
    let mut start_line = 1;
    let mut end_line = 1;
    
    for (index, line) in lines.iter().enumerate() {
        let line_start = current_pos;
        let line_end = current_pos + line.len() + 1; // +1 for newline
        
        if char_start >= line_start && char_start < line_end {
            start_line = index + 1;
        }
        
        if char_end >= line_start && char_end <= line_end {
            end_line = index + 1;
            break;
        }
        
        current_pos = line_end;
    }
    
    (start_line, end_line)
}
```

---

## 十、引用格式化（AI 可理解）

### 10.1 格式化逻辑（内联引用模式）

**核心原则**：后端必须接收完整引用信息，不能只接收标签 ID。

#### 10.1.1 内容解析流程

```typescript
// src/components/Chat/InlineChatInput.tsx

const handleSend = async () => {
    // 1. 从 contentEditable 解析节点数组（保持顺序）
    const editor = editorRef.current;
    if (!editor) return;
    
    const inputNodes = parseEditorContent(editor);
    
    // 2. 获取所有引用的完整信息
    const { getReferences } = useReferenceStore.getState();
    const allRefs = getReferences(tabId);
    const refMap = new Map(allRefs.map(ref => [ref.id, ref]));
    
    // 3. 格式化内容：将引用标签替换为完整信息
    const formattedContent = await formatNodesForAI(inputNodes, refMap);
    
    // 4. 发送完整内容到后端
    await sendMessage(tabId, formattedContent);
    
    // 5. 清空输入框
    clearEditor();
};
```

#### 10.1.2 节点解析

```typescript
// src/utils/inlineContentParser.ts

export interface InlineInputNode {
    type: 'text' | 'reference';
    id?: string;        // reference 类型的引用 ID
    content?: string;   // text 类型的文本内容
    order: number;      // 插入顺序
}

// 从 contentEditable 解析节点数组
export function parseEditorContent(editor: HTMLElement): InlineInputNode[] {
    const nodes: InlineInputNode[] = [];
    let order = 0;
    
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text.trim()) {
                nodes.push({
                    type: 'text',
                    content: text,
                    order: order++,
                });
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            
            // 检查是否是引用标签
            if (element.classList.contains('inline-reference-tag')) {
                const refId = element.getAttribute('data-ref-id');
                if (refId) {
                    nodes.push({
                        type: 'reference',
                        id: refId,
                        order: order++,
                    });
                }
            } else {
                // 递归处理子节点
                Array.from(node.childNodes).forEach(walk);
            }
        }
    };
    
    Array.from(editor.childNodes).forEach(walk);
    
    // 按顺序排序
    return nodes.sort((a, b) => a.order - b.order);
}
```

#### 10.1.3 格式化完整内容

```typescript
// src/utils/inlineContentFormatter.ts

export async function formatNodesForAI(
    nodes: InlineInputNode[],
    refMap: Map<string, Reference>
): Promise<string> {
    const parts = await Promise.all(
        nodes.map(async (node) => {
            if (node.type === 'text') {
                return node.content || '';
            } else if (node.type === 'reference' && node.id) {
                const ref = refMap.get(node.id);
                if (!ref) {
                    console.warn(`引用 ${node.id} 不存在`);
                    return '';
                }
                
                // ⚠️ 关键：将引用标签替换为完整信息
                return await formatReferenceForAI(ref);
            }
            return '';
        })
    );
    
    // 按顺序合并，保持用户输入的顺序
    // 文本和引用完整信息交替出现
    return parts.filter(Boolean).join('');
}

// 格式化单个引用为完整信息
async function formatReferenceForAI(ref: Reference): Promise<string> {
    switch (ref.type) {
        case ReferenceType.TEXT:
            const textRef = ref as TextReference;
            // ⚠️ 发送完整文本内容，而不是标签
            return `\n\n[文本引用: ${textRef.fileName} (行 ${textRef.lineRange.start}-${textRef.lineRange.end})]\n${textRef.content}\n\n`;
        
        case ReferenceType.FILE:
            const fileRef = ref as FileReference;
            let fileContent = fileRef.content;
            if (!fileContent && fileRef.path) {
                // 加载文件完整内容
                fileContent = await invoke<string>('read_file_content', {
                    path: fileRef.path,
                });
            }
            // ⚠️ 发送完整文件内容，而不是路径
            return `\n\n[文件引用: ${fileRef.name}]\n${fileContent || '[文件内容]'}\n\n`;
        
        case ReferenceType.FOLDER:
            const folderRef = ref as FolderReference;
            // 加载文件夹内所有文件内容
            const folderContent = await loadFolderContent(folderRef.path);
            // ⚠️ 发送文件夹完整内容
            return `\n\n[文件夹引用: ${folderRef.name} (${folderRef.fileCount} 个文件)]\n${folderContent}\n\n`;
        
        case ReferenceType.CHAT:
            const chatRef = ref as ChatReference;
            // 加载聊天记录完整内容
            const chatContent = await loadChatMessages(chatRef.chatTabId, chatRef.messageIds);
            // ⚠️ 发送聊天记录完整内容
            return `\n\n[聊天记录引用: ${chatRef.chatTabTitle} (消息 ${chatRef.messageRange?.start}-${chatRef.messageRange?.end})]\n${chatContent}\n\n`;
        
        // ... 其他类型
        default:
            return '';
    }
}

// 加载文件夹内容
async function loadFolderContent(folderPath: string): Promise<string> {
    const files = await invoke<string[]>('list_folder_files', {
        path: folderPath,
    });
    
    const contents = await Promise.all(
        files.map(async (filePath) => {
            try {
                const content = await invoke<string>('read_file_content', {
                    path: filePath,
                });
                const fileName = filePath.split('/').pop() || filePath;
                return `文件: ${fileName}\n${content}\n`;
            } catch (error) {
                return `文件: ${filePath}\n[读取失败]\n`;
            }
        })
    );
    
    return contents.join('\n---\n\n');
}

// 加载聊天记录内容
async function loadChatMessages(chatTabId: string, messageIds: string[]): Promise<string> {
    const { tabs } = useChatStore.getState();
    const tab = tabs.find(t => t.id === chatTabId);
    if (!tab) return '';
    
    const messages = tab.messages.filter(m => messageIds.includes(m.id));
    return messages.map((msg, index) => {
        return `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`;
    }).join('\n\n');
}
```

#### 10.1.4 示例：内容转换流程

**用户输入**：
```
hello [引用: main.ts] world [引用: utils.ts] end
```

**解析后的节点数组**：
```typescript
[
    { type: 'text', content: 'hello ', order: 1 },
    { type: 'reference', id: 'ref-123', order: 2 },
    { type: 'text', content: ' world ', order: 3 },
    { type: 'reference', id: 'ref-456', order: 4 },
    { type: 'text', content: ' end', order: 5 },
]
```

**格式化后的完整内容（发送给后端）**：
```
hello 

[文本引用: main.ts (行 10-15)]
function example() {
    console.log('hello');
}

 world 

[文件引用: utils.ts]
export function helper() {
    // ... 完整文件内容 ...
}

 end
```

**⚠️ 关键点**：
- 前端只显示标签：`[引用: main.ts]`
- 后端接收完整信息：文件路径、完整内容、位置信息等
- 保持用户输入的顺序：文字和引用信息交替出现

---

## 十一、UI 布局优化

### 11.1 输入框区域布局

```
┌─────────────────────────────────────────────┐
│ [引用管理按钮▼] 
┌────────────────────────                  ─┐ │
│ 这是一段文字                                │ │
│ [引用: main.ts] 继续输入                    │ │
│ 更多文字 [引用: utils.ts]                   │ │
│                                [发送]      │ │
│└──────────────────────                  ───┘ │
│                                     
└─────────────────────────────────────────────┘
```

**关键设计**：
- **引用管理按钮**：固定在输入框左上角，点击显示下拉框
- **内联引用标签**：引用标签作为内联元素，与文字穿插显示在输入框中
- **内容顺序**：保持用户输入/插入的顺序（文字和引用标签混合）

### 11.2 实现方式

使用 `contentEditable` div 替代 `textarea`，支持内联元素：

```typescript
// 内容结构
interface InputNode {
    type: 'text' | 'reference';
    id?: string;        // reference 类型的引用 ID
    content: string;    // text 类型的文本内容，reference 类型为空
}

// 示例：用户输入 "hello"，插入引用，输入 "world"
// 内容数组：
[
    { type: 'text', content: 'hello ' },
    { type: 'reference', id: 'ref-123' },
    { type: 'text', content: ' world' }
]
```

### 11.3 引用标签内联显示

```typescript
// 引用标签作为可编辑区域内的内联元素
<div contentEditable className="chat-input-editor">
    这是一段文字
    <span 
        contentEditable={false}
        className="inline-reference-tag"
        data-ref-id="ref-123"
    >
        📄 main.ts (行 10-15)
        <button onClick={removeRef}>×</button>
    </span>
    继续输入
</div>  
```

### 11.2 引用管理下拉框

```
┌─────────────────────────────────────────┐
│ 引用管理                    [+ 添加引用] │
├─────────────────────────────────────────┤
│ 📄 文本引用                              │
│   • main.ts (行 10-15)            [×]   │
│   • utils.ts (行 5-20)            [×]   │
├─────────────────────────────────────────┤
│ 📁 文件引用                              │
│   • README.md                     [×]   │
│   • config.json                   [×]   │
├─────────────────────────────────────────┤
│ 📁 文件夹引用                            │
│   • src/ (5 个文件)               [×]   │
├─────────────────────────────────────────┤
│ 💬 聊天记录引用                          │
│   • 对话 #1 (消息 2-5)            [×]   │
└─────────────────────────────────────────┘
```

---

## 十二、内联引用标签实现（关键）

### 12.1 核心设计理念

**问题**：传统方式将引用标签显示在输入框上方，无法保持用户输入顺序。

**解决方案**：引用标签作为内联元素穿插在输入文本中，使用 `contentEditable` 实现。

### 12.2 输入框结构

```typescript
// src/components/Chat/InlineChatInput.tsx

interface InlineInputNode {
    type: 'text' | 'reference';
    id?: string;           // reference 类型的引用 ID
    content?: string;      // text 类型的文本内容
    order: number;         // 插入顺序
}

// 示例用户操作序列：
// 1. 输入 "hello "
// 2. 插入引用 ref-123
// 3. 输入 " world"
// 4. 插入引用 ref-456
// 5. 输入 " end"

// 节点数组：
[
    { type: 'text', content: 'hello ', order: 1 },
    { type: 'reference', id: 'ref-123', order: 2 },
    { type: 'text', content: ' world', order: 3 },
    { type: 'reference', id: 'ref-456', order: 4 },
    { type: 'text', content: ' end', order: 5 },
]
```

### 12.3 ContentEditable 输入框实现

```typescript
// src/components/Chat/InlineChatInput.tsx

export const InlineChatInput: React.FC<InlineChatInputProps> = ({ tabId, onSend }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = useState<InlineInputNode[]>([]);
    const { getReferences } = useReferenceStore();
    const references = getReferences(tabId);
    const refMap = useMemo(() => {
        return new Map(references.map(ref => [ref.id, ref]));
    }, [references]);
    
    // 渲染内容
    const renderContent = () => {
        return nodes.map((node, index) => {
            if (node.type === 'text') {
                return (
                    <span key={`text-${index}`} data-node-index={index}>
                        {node.content}
                    </span>
                );
            } else if (node.type === 'reference' && node.id) {
                const ref = refMap.get(node.id);
                if (!ref) return null;
                
                return (
                    <InlineReferenceTag
                        key={`ref-${node.id}`}
                        ref={ref}
                        nodeIndex={index}
                        onRemove={() => removeNode(index)}
                    />
                );
            }
            return null;
        });
    };
    
    // 插入引用标签
    const insertReference = (refId: string) => {
        const cursorPos = getCursorPosition();
        const newNode: InlineInputNode = {
            type: 'reference',
            id: refId,
            order: Date.now(),
        };
        
        // 在光标位置插入新节点
        const newNodes = [
            ...nodes.slice(0, cursorPos),
            newNode,
            ...nodes.slice(cursorPos),
        ];
        
        setNodes(newNodes);
        updateEditorContent();
    };
    
    // 处理输入
    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const text = e.currentTarget.textContent || '';
        // 解析 contentEditable 内容，更新 nodes
        const parsedNodes = parseEditorContent(e.currentTarget);
        setNodes(parsedNodes);
    };
    
    return (
        <div className="inline-chat-input-container">
            {/* 引用管理按钮（左上角） */}
            <ReferenceManagerButton 
                tabId={tabId}
                onInsertReference={insertReference}
            />
            
            {/* 内容可编辑区域 */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                className="inline-chat-input-editor"
                suppressContentEditableWarning
            >
                {renderContent()}
            </div>
            
            {/* 发送按钮 */}
            <button onClick={handleSend}>发送</button>
        </div>
    );
};
```

### 12.4 内联引用标签组件

```typescript
// src/components/Chat/InlineReferenceTag.tsx

interface InlineReferenceTagProps {
    ref: Reference;
    nodeIndex: number;
    onRemove: () => void;
}

export const InlineReferenceTag: React.FC<InlineReferenceTagProps> = ({ 
    ref, 
    nodeIndex, 
    onRemove 
}) => {
    const displayText = getReferenceDisplayText(ref);
    
    return (
        <span
            contentEditable={false}
            className="inline-reference-tag"
            data-ref-id={ref.id}
            data-node-index={nodeIndex}
        >
            {getIcon(ref.type)}
            <span className="ref-label">{displayText}</span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="ref-remove-btn"
            >
                ×
            </button>
        </span>
    );
};

// 获取引用显示文本
function getReferenceDisplayText(ref: Reference): string {
    switch (ref.type) {
        case ReferenceType.TEXT:
            const textRef = ref as TextReference;
            return `${textRef.fileName} (行 ${textRef.lineRange.start}-${textRef.lineRange.end})`;
        
        case ReferenceType.FILE:
            return (ref as FileReference).name;
        
        case ReferenceType.FOLDER:
            const folderRef = ref as FolderReference;
            return `${folderRef.name} (${folderRef.fileCount} 个文件)`;
        
        case ReferenceType.CHAT:
            const chatRef = ref as ChatReference;
            return `${chatRef.chatTabTitle} (消息 ${chatRef.messageRange?.start}-${chatRef.messageRange?.end})`;
        
        default:
            return '引用';
    }
}
```

### 12.5 内容解析和格式化

```typescript
// src/utils/inlineContentParser.ts

// 从 contentEditable 解析节点数组
export function parseEditorContent(editor: HTMLElement): InlineInputNode[] {
    const nodes: InlineInputNode[] = [];
    let order = 0;
    
    const walk = (node: Node, parentText: string = '') => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text.trim()) {
                nodes.push({
                    type: 'text',
                    content: text,
                    order: order++,
                });
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            
            // 检查是否是引用标签
            if (element.classList.contains('inline-reference-tag')) {
                const refId = element.getAttribute('data-ref-id');
                if (refId) {
                    nodes.push({
                        type: 'reference',
                        id: refId,
                        order: order++,
                    });
                }
            } else {
                // 递归处理子节点
                Array.from(node.childNodes).forEach(child => walk(child));
            }
        }
    };
    
    Array.from(editor.childNodes).forEach(node => walk(node));
    return nodes;
}

// 将节点数组格式化为 AI 可理解的完整内容
export async function formatNodesForAI(
    nodes: InlineInputNode[],
    refMap: Map<string, Reference>
): Promise<string> {
    const parts = await Promise.all(
        nodes.map(async (node) => {
            if (node.type === 'text') {
                return node.content || '';
            } else if (node.type === 'reference' && node.id) {
                const ref = refMap.get(node.id);
                if (!ref) return '';
                
                // 格式化引用为完整信息
                return await formatReferenceForAI(ref);
            }
            return '';
        })
    );
    
    // 按顺序合并，保持用户输入的顺序
    return parts.filter(Boolean).join('');
}
```

### 12.6 引用管理按钮（左上角）

```typescript
// src/components/Chat/ReferenceManagerButton.tsx

export const ReferenceManagerButton: React.FC<ReferenceManagerButtonProps> = ({
    tabId,
    onInsertReference,
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const { getReferences } = useReferenceStore();
    const references = getReferences(tabId);
    
    return (
        <div className="reference-manager-button-wrapper">
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="reference-manager-button"
                title="管理引用"
            >
                <PaperClipIcon className="w-4 h-4" />
                {references.length > 0 && (
                    <span className="reference-count-badge">
                        {references.length}
                    </span>
                )}
                <ChevronDownIcon className="w-3 h-3" />
            </button>
            
            {showDropdown && (
                <div className="reference-manager-dropdown">
                    <ReferenceManagerDropdown
                        tabId={tabId}
                        onInsertReference={(refId) => {
                            onInsertReference(refId);
                            setShowDropdown(false);
                        }}
                        onClose={() => setShowDropdown(false)}
                    />
                </div>
            )}
        </div>
    );
};
```

### 12.7 样式设计

```css
/* src/components/Chat/InlineChatInput.css */

.inline-chat-input-container {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.reference-manager-button-wrapper {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
}

.reference-manager-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    cursor: pointer;
}

.inline-chat-input-editor {
    flex: 1;
    min-height: 40px;
    max-height: 200px;
    padding: 8px 32px 8px 40px; /* 左侧留空间给按钮 */
    border: 1px solid #d1d5db;
    border-radius: 8px;
    overflow-y: auto;
    line-height: 1.5;
}

.inline-reference-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    margin: 0 2px;
    background: #dbeafe;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    font-size: 12px;
    color: #1e40af;
    user-select: none;
}

.inline-reference-tag .ref-remove-btn {
    margin-left: 4px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #64748b;
}
```

---

## 十三、后端处理逻辑（完整信息）

### 13.1 后端接收的数据格式

**⚠️ 重要**：后端接收的 `content` 字段应该是**格式化后的完整内容**，而不是标签 ID。

#### 13.1.1 发送前的处理

```typescript
// src/components/Chat/InlineChatInput.tsx

const handleSend = async () => {
    // 1. 解析输入框内容为节点数组
    const inputNodes = parseEditorContent(editorRef.current);
    
    // 2. 获取所有引用的完整信息（从 store）
    const { getReferences } = useReferenceStore.getState();
    const allRefs = getReferences(tabId);
    const refMap = new Map(allRefs.map(ref => [ref.id, ref]));
    
    // 3. 格式化：将引用标签替换为完整信息
    const fullContent = await formatNodesForAI(inputNodes, refMap);
    
    // 4. 发送完整内容（不发送标签 ID）
    await invoke('ai_chat_stream', {
        tabId,
        messages: [
            ...previousMessages,
            { 
                role: 'user', 
                content: fullContent  // ⚠️ 完整内容，包含所有引用信息
            },
        ],
        // ...
    });
};
```

#### 13.1.2 后端接收的示例

```rust
// 后端接收到的 messages 示例
[
    {
        "role": "user",
        "content": "hello \n\n[文本引用: main.ts (行 10-15)]\nfunction example() {\n    console.log('hello');\n}\n\n world \n\n[文件引用: utils.ts]\nexport function helper() {\n    // ... 完整文件内容 ...\n}\n\n end"
    }
]
```

**⚠️ 关键点**：
- 后端接收的是**格式化后的完整文本**
- 包含所有引用的完整内容（文件内容、文本内容等）
- 不包含任何标签 ID 或引用 ID
- AI 可以直接理解和使用这些信息

### 13.2 引用信息格式化规则

| 引用类型 | 前端显示 | 后端接收 |
|---------|---------|---------|
| **文本引用** | `main.ts (行 10-15)` | `[文本引用: main.ts (行 10-15)]\n完整文本内容` |
| **文件引用** | `README.md` | `[文件引用: README.md]\n完整文件内容` |
| **文件夹引用** | `src/ (5 个文件)` | `[文件夹引用: src/ (5 个文件)]\n所有文件内容` |
| **聊天记录引用** | `对话 #1 (消息 2-5)` | `[聊天记录引用: 对话 #1 (消息 2-5)]\n完整聊天内容` |

### 13.3 实现检查清单

- [ ] 前端解析 contentEditable 内容为节点数组
- [ ] 根据引用 ID 获取完整引用信息（从 store）
- [ ] 格式化时加载引用完整内容（文件内容、聊天内容等）
- [ ] 保持用户输入顺序（文字和引用信息交替）
- [ ] 发送给后端的是完整格式化内容，不包含标签 ID
- [ ] 后端直接接收可理解的文本，无需解析标签

---

## 十四、实现优先级

### 阶段一：核心功能（必需）
1. ✅ 文本引用显示优化（位置信息）
2. ✅ 文件引用支持
3. ✅ 文件夹引用支持
4. ✅ 拖拽文件/文件夹到输入框
5. ✅ 复制编辑器文字自动识别引用
6. ✅ 多引用附件支持

### 阶段二：快捷功能（重要）
7. ✅ @ 符号快捷选择（文件、记忆库）
8. ✅ 引用管理下拉框
9. ✅ 图片引用优化

### 阶段三：高级功能（可选）
10. ⏳ 聊天记录引用
11. ⏳ 表格引用
12. ⏳ 知识库引用
13. ⏳ 外部文件拖拽优化

---

## 十三、参考实现

### 13.1 Void Editor
- **引用显示**：简洁的标签形式，显示文件名和位置
- **@ 快捷选择**：输入 @ 后显示文件、代码片段选择器
- **引用管理**：侧边栏显示所有引用

### 13.2 Cursor
- **智能引用**：自动识别代码上下文
- **引用预览**：悬停显示引用内容预览
- **引用搜索**：快速搜索和过滤引用

---

## 十四、技术要点

### 14.1 性能优化
- 引用内容按需加载（大文件不立即读取）
- 引用列表使用虚拟滚动（如果引用很多）
- 引用格式化异步处理

### 14.2 错误处理
- 文件不存在时显示错误提示
- 引用无效时自动移除
- 网络错误时重试机制

### 14.3 用户体验
- 拖拽时显示视觉反馈
- 引用添加/移除动画
- 键盘快捷键支持（如 Ctrl+Shift+R 打开引用管理）

---

## 十五、测试要点

### 15.1 功能测试
- [ ] 从编辑器复制文本，粘贴到输入框，自动创建引用
- [ ] 拖拽文件树文件到输入框，创建文件引用
- [ ] 拖拽文件夹到输入框，创建文件夹引用
- [ ] 输入 @ 符号，显示文件选择器
- [ ] 引用标签显示正确（文件名、位置信息）
- [ ] 移除引用功能正常
- [ ] 多引用同时存在时显示正确

### 15.2 边界测试
- [ ] 大文件引用（>10MB）
- [ ] 大量引用（>20 个）
- [ ] 无效文件路径
- [ ] 无权限访问的文件
- [ ] 网络断开时的外部资源

---

**文档版本**：v1.0.0  
**最后更新**：2025-01-XX  
**维护者**：AI 功能组

