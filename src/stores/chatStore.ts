import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from './fileStore';
import { useEditorStore } from './editorStore';

import { ToolCall, MessageContentBlock, AuthorizationRequest } from '../types/tool';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string; // 保留用于兼容
    timestamp: number;
    isLoading?: boolean;
    toolCalls?: ToolCall[];  // 工具调用列表（保留用于兼容）
    // 新增：内容块列表（按时间顺序）
    contentBlocks?: MessageContentBlock[];
}

export type ChatMode = 'agent' | 'chat' | 'edit'; // Agent 模式：可调用工具；Chat 模式：仅对话；Edit 模式：编辑模式

export interface ChatTab {
    id: string;
    title: string;
    messages: ChatMessage[];
    model: string;
    mode: ChatMode; // 聊天模式：agent、chat 或 edit
    createdAt: number;
    updatedAt: number;
    // 新增字段：聊天记录绑定工作区
    workspacePath: string | null; // 绑定的工作区路径，null 表示临时状态
    isTemporary: boolean; // 是否为临时聊天（未绑定工作区）
    // 编辑模式字段（可选）
    editModeFile?: string; // 编辑模式下的文件路径
    editModeContent?: string; // 编辑模式下的文件内容
}

interface ChatState {
    tabs: ChatTab[];
    activeTabId: string | null;
    
    // Actions
    createTab: (title?: string, mode?: ChatMode) => string;
    deleteTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    addMessage: (tabId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
    updateMessage: (tabId: string, messageId: string, content: string) => void;
    appendToMessage: (tabId: string, messageId: string, chunk: string) => void;
    setMessageLoading: (tabId: string, messageId: string, isLoading: boolean) => void;
    addToolCall: (tabId: string, messageId: string, toolCall: ToolCall) => void;
    updateToolCall: (tabId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
    // 内容块管理
    addContentBlock: (tabId: string, messageId: string, block: MessageContentBlock) => void;
    updateContentBlock: (tabId: string, messageId: string, blockId: string, updates: Partial<MessageContentBlock>) => void;
    setModel: (tabId: string, model: string) => void;
    setMode: (tabId: string, mode: ChatMode) => void; // 设置聊天模式
    clearMessages: (tabId: string) => void;
    deleteMessage: (tabId: string, messageId: string) => void;
    
    // AI 交互
    sendMessage: (tabId: string, content: string) => Promise<void>;
    regenerate: (tabId: string) => Promise<void>;
    
    // 临时聊天管理（v1.4.0 新增）
    getTemporaryTabs: () => ChatTab[];
    bindToWorkspace: (tabId: string, workspacePath: string) => void;
    clearTemporaryTabs: () => void;
}

export const useChatStore = create<ChatState>((set, get) => {
    // ⚠️ 关键修复：正确初始化事件监听（在 store 外部初始化）
    // 注意：事件监听应该在组件中初始化，而不是在 store 中
    // 这里先移除，在 ChatPanel 组件中初始化
    
    return {
        tabs: [],
        activeTabId: null,
        
        createTab: (title?: string, mode: ChatMode = 'agent') => {
            const tabId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // 检查是否有工作区
            let currentWorkspace: string | null = null;
            try {
                currentWorkspace = useFileStore.getState().currentWorkspace || null;
            } catch (e) {
                // 如果无法获取，默认为 null（临时聊天）
                console.warn('无法获取工作区状态，创建临时聊天:', e);
                currentWorkspace = null;
            }
            
            const newTab: ChatTab = {
                id: tabId,
                title: title || `新对话 ${get().tabs.length + 1}`,
                messages: [],
                model: 'deepseek-chat', // 默认模型
                mode: mode, // 默认 Agent 模式
                createdAt: Date.now(),
                updatedAt: Date.now(),
                workspacePath: currentWorkspace, // 工作区路径
                isTemporary: !currentWorkspace, // 没有工作区时为临时聊天
            };
            
            set({
                tabs: [...get().tabs, newTab],
                activeTabId: tabId,
            });
            
            console.log('✅ 创建聊天标签页:', {
                tabId,
                isTemporary: newTab.isTemporary,
                workspacePath: newTab.workspacePath,
                mode: newTab.mode,
            });
            
            return tabId;
        },
        
        deleteTab: (tabId: string) => {
            const { tabs, activeTabId } = get();
            const newTabs = tabs.filter(t => t.id !== tabId);
            
            set({
                tabs: newTabs,
                activeTabId: activeTabId === tabId
                    ? (newTabs.length > 0 ? newTabs[0].id : null)
                    : activeTabId,
            });
        },
        
        setActiveTab: (tabId: string) => {
            set({ activeTabId: tabId });
        },
        
        addMessage: (tabId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
            const { tabs } = get();
            const newMessage: ChatMessage = {
                ...message,
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
            };
            
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: [...t.messages, newMessage],
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        updateMessage: (tabId: string, messageId: string, content: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? { ...m, content }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        appendToMessage: (tabId: string, messageId: string, chunk: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? { ...m, content: m.content + chunk }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        setMessageLoading: (tabId: string, messageId: string, isLoading: boolean) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? { ...m, isLoading }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        addToolCall: (tabId: string, messageId: string, toolCall: ToolCall) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? {
                                        ...m,
                                        toolCalls: [...(m.toolCalls || []), toolCall],
                                    }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        updateToolCall: (tabId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? {
                                        ...m,
                                        // 更新 toolCalls 数组
                                        toolCalls: m.toolCalls?.map(tc =>
                                            tc.id === toolCallId
                                                ? { ...tc, ...updates }
                                                : tc
                                        ),
                                        // ⚠️ 关键修复：同时更新 contentBlocks 中的 toolCall
                                        contentBlocks: m.contentBlocks?.map(block =>
                                            (block.type === 'tool' || block.type === 'authorization') && block.toolCall?.id === toolCallId
                                                ? {
                                                    ...block,
                                                    toolCall: block.toolCall ? { ...block.toolCall, ...updates } : undefined,
                                                  }
                                                : block
                                        ),
                                    }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        // 内容块管理
        addContentBlock: (tabId: string, messageId: string, block: MessageContentBlock) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? {
                                        ...m,
                                        contentBlocks: [...(m.contentBlocks || []), block].sort((a, b) => a.timestamp - b.timestamp),
                                    }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        updateContentBlock: (tabId: string, messageId: string, blockId: string, updates: Partial<MessageContentBlock>) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.map(m =>
                                m.id === messageId
                                    ? {
                                        ...m,
                                        contentBlocks: m.contentBlocks?.map(block =>
                                            block.id === blockId
                                                ? { ...block, ...updates }
                                                : block
                                        ),
                                    }
                                    : m
                            ),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        setModel: (tabId: string, model: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? { ...t, model, updatedAt: Date.now() }
                        : t
                ),
            });
        },
        
        setMode: (tabId: string, mode: ChatMode) => {
            const { tabs } = get();
            const tab = tabs.find(t => t.id === tabId);
            
            // 如果标签页已经有消息（开始聊天后），不允许切换模式
            if (tab && tab.messages.length > 0) {
                console.warn('⚠️ 聊天已开始，无法切换模式');
                return;
            }
            
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? { ...t, mode, updatedAt: Date.now() }
                        : t
                ),
            });
        },
        
        clearMessages: (tabId: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? { ...t, messages: [], updatedAt: Date.now() }
                        : t
                ),
            });
        },
        
        deleteMessage: (tabId: string, messageId: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            messages: t.messages.filter(m => m.id !== messageId),
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        setTabMode: (tabId: string, mode: 'chat' | 'edit') => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? { ...t, mode, updatedAt: Date.now() }
                        : t
                ),
            });
        },
        
        setEditModeFile: (tabId: string, filePath: string, content: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? {
                            ...t,
                            mode: 'edit',
                            editModeFile: filePath,
                            editModeContent: content,
                            updatedAt: Date.now(),
                        }
                        : t
                ),
            });
        },
        
        sendMessage: async (tabId: string, content: string) => {
            const { tabs, addMessage, setMessageLoading } = get();
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;
            
            // 添加用户消息
            addMessage(tabId, {
                role: 'user',
                content,
            });
            
            // 添加助手消息（占位符）
            const assistantMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            addMessage(tabId, {
                role: 'assistant',
                content: '',
                isLoading: true,
            });
            
            try {
                // 重新获取最新的标签页状态（确保包含刚添加的消息）
                const { tabs: currentTabs } = get();
                const currentTab = currentTabs.find(t => t.id === tabId);
                if (!currentTab) {
                    throw new Error('标签页不存在');
                }
                
                // 构建消息列表（包含刚添加的用户消息，排除空的助手消息）
                const allMessages = currentTab.messages;
                const messages = allMessages
                    .filter(m => {
                        // 排除空的助手消息占位符
                        if (m.role === 'assistant' && m.id === assistantMessageId && !m.content) {
                            return false;
                        }
                        return true;
                    })
                    .map(m => ({
                        role: m.role as 'user' | 'assistant' | 'system',
                        content: m.content,
                    }));
                
                // 获取当前工作区路径（用于判断是否启用工具）
                const { currentWorkspace } = (await import('./fileStore')).useFileStore.getState();
                
                // ⚠️ 关键修复：获取当前编辑器打开的文件和选中的文本
                const { getActiveTab } = useEditorStore.getState();
                const activeEditorTab = getActiveTab();
                const currentFile = activeEditorTab?.filePath || null;
                
                // 获取选中的文本（如果有编辑器实例）
                let selectedText: string | null = null;
                let editTarget: { anchor: { block_id: string; start_offset: number; end_offset: number } } | null = null;
                if (activeEditorTab?.editor) {
                    const { from, to } = activeEditorTab.editor.state.selection;
                    if (from !== to) {
                        selectedText = activeEditorTab.editor.state.doc.textBetween(from, to);
                        // 精确定位：选区 → edit_target
                        const { createAnchorFromSelection } = await import('../utils/anchorFromSelection');
                        const anchor = createAnchorFromSelection(activeEditorTab.editor.state.doc, from, to);
                        if (anchor && currentFile) {
                            editTarget = { anchor: { block_id: anchor.blockId, start_offset: anchor.startOffset, end_offset: anchor.endOffset } };
                        }
                    }
                }
                // 若无选区 edit_target，检查引用：TextRef 含 blockId 且 pathMatch → edit_target
                if (!editTarget && currentFile) {
                    const { getReferences } = (await import('./referenceStore')).useReferenceStore.getState();
                    const refs = getReferences(tabId);
                    const { isSameDocumentForEdit } = await import('../utils/pathUtils');
                    const { ReferenceType } = await import('../types/reference');
                    const textRefWithBlock = refs.find(
                        (r): r is import('../types/reference').TextReference =>
                            r.type === ReferenceType.TEXT &&
                            'blockId' in r &&
                            r.blockId != null &&
                            r.startOffset != null &&
                            r.endOffset != null &&
                            isSameDocumentForEdit(r.sourceFile, currentFile)
                    );
                    if (textRefWithBlock) {
                        editTarget = {
                            anchor: {
                                block_id: textRefWithBlock.blockId!,
                                start_offset: textRefWithBlock.startOffset!,
                                end_offset: textRefWithBlock.endOffset!,
                            },
                        };
                    }
                }
                
                // 获取当前编辑器内容（用于文档编辑功能）
                const currentEditorContent = activeEditorTab?.content || null;
                
                // ⚠️ 关键修复：确保 tabId 正确传递
                console.log('📤 发送消息到后端:', { 
                    tabId, 
                    messageCount: messages.length,
                    allMessagesCount: allMessages.length,
                    hasWorkspace: !!currentWorkspace,
                    mode: currentTab.mode,
                    isTemporary: currentTab.isTemporary,
                    currentFile: currentFile,
                    hasSelectedText: !!selectedText,
                });
                
                // 调用后端流式聊天（根据模式决定是否启用工具）
                // 注意：如果没有工作区，工具调用应该禁用（临时聊天模式，只能是 chat 模式）
                const enableTools = currentTab.mode === 'agent' && !!currentWorkspace;
                
                await invoke('ai_chat_stream', {
                    tabId, // Tauri 会自动转换为 tab_id
                    messages: messages, // 消息列表已包含刚添加的用户消息
                    modelConfig: {
                        model: tab.model,
                        temperature: 0.7,
                        top_p: 1.0,
                        max_tokens: 2000,
                    },
                    enableTools: enableTools, // Agent 模式且有工作区时启用工具，否则禁用
                    currentFile: currentFile, // ⚠️ 关键修复：传递当前编辑器打开的文件路径
                    selectedText: selectedText, // ⚠️ 关键修复：传递当前选中的文本
                    currentEditorContent: currentEditorContent, // ⚠️ 文档编辑功能：传递当前编辑器内容
                    editTarget: editTarget ?? undefined, // 精确定位：blockId+offset，用于 edit_current_editor_document
                });
            } catch (error) {
                console.error('发送消息失败:', error);
                setMessageLoading(tabId, assistantMessageId, false);
                // 更新错误消息
                const { tabs: updatedTabs } = get();
                const updatedTab = updatedTabs.find(t => t.id === tabId);
                if (updatedTab) {
                    const errorMessage = updatedTab.messages.find(m => m.id === assistantMessageId);
                    if (errorMessage) {
                        // 提供更友好的错误信息
                        let errorText = '发送消息失败';
                        if (error instanceof Error) {
                            const errorMsg = error.message;
                            // 检测 API key 未配置错误
                            if (errorMsg.includes('未配置') && (errorMsg.includes('提供商') || errorMsg.includes('API key'))) {
                                errorText = '❌ AI 功能未配置\n\n请先配置 API Key 才能使用 AI 功能。\n\n配置方法：\n1. 点击右上角设置图标\n2. 选择"配置 API Key"\n3. 输入 DeepSeek 或 OpenAI 的 API Key\n\n或者：\n- 在欢迎页面点击"配置 API Key"按钮';
                            } else if (errorMsg.includes('网络错误') || errorMsg.includes('connection') || errorMsg.includes('网络') || errorMsg.includes('Connection refused') || errorMsg.includes('tcp connect')) {
                                errorText = '❌ 网络连接失败\n\n无法连接到 AI 服务器，可能的原因：\n1. 网络连接问题（请检查网络连接）\n2. 防火墙或代理设置阻止了连接\n3. 需要配置代理（如果使用代理）\n4. DNS 解析问题\n5. AI 服务器暂时不可用\n\n建议：\n- 检查网络连接\n- 检查防火墙设置\n- 如果使用代理，请配置代理\n- 稍后重试';
                            } else if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                                errorText = '请求超时，请稍后重试';
                            } else if (errorMsg.includes('API') || errorMsg.includes('api')) {
                                errorText = 'API 调用失败，请检查 API 密钥配置';
                            } else {
                                errorText = `错误: ${errorMsg}`;
                            }
                        }
                        get().updateMessage(tabId, assistantMessageId, `[${errorText}]`);
                    }
                }
            }
        },
        
        // 临时聊天管理方法（v1.4.0 新增）
        getTemporaryTabs: () => {
            const { tabs } = get();
            return tabs.filter(tab => tab.isTemporary);
        },
        
        bindToWorkspace: (tabId: string, workspacePath: string) => {
            const { tabs } = get();
            set({
                tabs: tabs.map(t =>
                    t.id === tabId
                        ? { ...t, workspacePath, isTemporary: false, updatedAt: Date.now() }
                        : t
                ),
            });
        },
        
        clearTemporaryTabs: () => {
            const { tabs, activeTabId } = get();
            const nonTemporaryTabs = tabs.filter(tab => !tab.isTemporary);
            set({
                tabs: nonTemporaryTabs,
                activeTabId: activeTabId && nonTemporaryTabs.find(t => t.id === activeTabId)
                    ? activeTabId
                    : (nonTemporaryTabs.length > 0 ? nonTemporaryTabs[0].id : null),
            });
        },
        
        regenerate: async (tabId: string) => {
            const { tabs, sendMessage } = get();
            const tab = tabs.find(t => t.id === tabId);
            if (!tab || tab.messages.length === 0) return;
            
            // 找到最后一条用户消息
            const userMessages = tab.messages.filter(m => m.role === 'user');
            const lastUserMessage = userMessages[userMessages.length - 1];
            
            if (!lastUserMessage) return;
            
            // 删除最后一条助手消息
            let lastAssistantIndex = -1;
            for (let i = tab.messages.length - 1; i >= 0; i--) {
                if (tab.messages[i].role === 'assistant') {
                    lastAssistantIndex = i;
                    break;
                }
            }
            
            if (lastAssistantIndex !== -1) {
                const newMessages = tab.messages.slice(0, lastAssistantIndex);
                set({
                    tabs: tabs.map(t =>
                        t.id === tabId
                            ? { ...t, messages: newMessages, updatedAt: Date.now() }
                            : t
                    ),
                });
            }
            
            // 重新发送最后一条用户消息
            await sendMessage(tabId, lastUserMessage.content);
        },
    };
});

