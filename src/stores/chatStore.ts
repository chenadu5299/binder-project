import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from './fileStore';
import { useEditorStore } from './editorStore';
import { useDiffStore } from './diffStore';

import { ToolCall, MessageContentBlock } from '../types/tool';
import type { DisplayNode } from '../utils/inlineContentParser';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string; // 发给 AI 的完整内容（含展开的引用）
    timestamp: number;
    /** 消息记录展示用：结构化节点，引用以标签形式渲染（设计文档 2.6） */
    displayNodes?: DisplayNode[];
    /** @deprecated 兼容旧版，优先用 displayNodes */
    displayContent?: string;
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
    sendMessage: (tabId: string, content: string, options?: { validRefIds?: string[]; displayNodes?: DisplayNode[]; displayContent?: string }) => Promise<void>;
    regenerate: (tabId: string) => Promise<void>;
    
    // 临时聊天管理（v1.4.0 新增）
    getTemporaryTabs: () => ChatTab[];
    bindToWorkspace: (tabId: string, workspacePath: string) => void;
    clearTemporaryTabs: () => void;

    /** diff 接受后刷新对应 filePath 的 positioningCtx.L，使下一轮工具调用拿到最新内容 */
    refreshPositioningContextForEditor: (filePath: string) => void;
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
            useDiffStore.getState().cleanupDiffsForChatTab(tabId);
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
            useDiffStore.getState().cleanupDiffsForChatTab(tabId);
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
            useDiffStore.getState().cleanupDiffsForMessage(tabId, messageId);
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
        
        sendMessage: async (tabId: string, content: string, options?: { validRefIds?: string[]; displayNodes?: DisplayNode[]; displayContent?: string }) => {
            const { tabs, addMessage, setMessageLoading } = get();
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;
            
            // 添加用户消息（displayNodes 用于消息记录以标签形式展示）
            addMessage(tabId, {
                role: 'user',
                content,
                ...(options?.displayNodes != null && options.displayNodes.length > 0 && { displayNodes: options.displayNodes }),
                ...(options?.displayNodes == null && options?.displayContent != null && { displayContent: options.displayContent }),
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
                
                // P3 + §十三：注入 tab 与 RequestContext 同源（determineInjectionEditorTab）
                const { getActiveTab, getTabByFilePath } = useEditorStore.getState();
                const activeEditorTab = getActiveTab();
                const { getReferences } = (await import('./referenceStore')).useReferenceStore.getState();
                const refs = getReferences(tabId);
                const validRefIdSet = options?.validRefIds?.length
                    ? new Set(options.validRefIds)
                    : undefined;
                const effectiveRefs = validRefIdSet
                    ? refs.filter((r) => validRefIdSet.has(r.id))
                    : refs;
                const { determineInjectionEditorTab, buildPositioningRequestContext, setPositioningRequestContextForChat } =
                    await import('../utils/requestContext');
                const { injectionTab, fileRefsForInjection } = determineInjectionEditorTab(
                    currentWorkspace,
                    activeEditorTab,
                    refs,
                    getTabByFilePath
                );

                const selectionSameAsInjectionTab =
                    !!activeEditorTab &&
                    !!injectionTab &&
                    activeEditorTab.id === injectionTab.id;

                const currentFile = injectionTab?.filePath ?? activeEditorTab?.filePath ?? null;

                // 选区锚点仅当活动 tab 即注入 tab 时采用（否则活动 tab 选区与目标 L 无关）
                let selectedText: string | null = null;
                // §7.1 选区坐标（选区场景）
                let selectionStartBlockId: string | null = null;
                let selectionStartOffset: number | null = null;
                let selectionEndBlockId: string | null = null;
                let selectionEndOffset: number | null = null;
                // §7.1 光标坐标（无选区场景）
                let cursorBlockId: string | null = null;
                let cursorOffset: number | null = null;
                if (selectionSameAsInjectionTab && activeEditorTab?.editor) {
                    const { from, to } = activeEditorTab.editor.state.selection;
                    const { createAnchorFromSelection } = await import('../utils/anchorFromSelection');
                    if (from !== to) {
                        selectedText = activeEditorTab.editor.state.doc.textBetween(from, to);
                        const anchor = createAnchorFromSelection(activeEditorTab.editor.state.doc, from, to);
                        if (anchor && currentFile) {
                            // §7.1：同步填入选区完整坐标字段
                            selectionStartBlockId = anchor.startBlockId;
                            selectionStartOffset = anchor.startOffset;
                            selectionEndBlockId = anchor.endBlockId;
                            selectionEndOffset = anchor.endOffset;
                        }
                    } else {
                        // §7.2：无选区时捕获光标位置（cursor-only mode）
                        const cursorAnchor = createAnchorFromSelection(activeEditorTab.editor.state.doc, from, from);
                        if (cursorAnchor) {
                            cursorBlockId = cursorAnchor.startBlockId;
                            cursorOffset = cursorAnchor.startOffset;
                        }
                    }
                }
                // 12.5：无显式选区时，@ 文本引用四元组作为一级定位输入（route_source=reference）
                if (
                    selectionStartBlockId == null ||
                    selectionStartOffset == null ||
                    selectionEndBlockId == null ||
                    selectionEndOffset == null
                ) {
                    const { ReferenceType } = await import('../types/reference');
                    const { extractTextReferenceAnchor } = await import('../utils/referenceProtocolAdapter');
                    const { isSameDocumentForEdit } = await import('../utils/pathUtils');
                    const preciseTextRef = effectiveRefs.find((ref) => {
                        if (ref.type !== ReferenceType.TEXT) return false;
                        const tr = ref as import('../types/reference').TextReference;
                        if (!extractTextReferenceAnchor(tr)) return false;
                        if (!currentFile) return true;
                        return isSameDocumentForEdit(tr.sourceFile, currentFile);
                    }) as import('../types/reference').TextReference | undefined;

                    if (preciseTextRef) {
                        const anchor = extractTextReferenceAnchor(preciseTextRef);
                        if (anchor) {
                            selectionStartBlockId = anchor.startBlockId;
                            selectionStartOffset = anchor.startOffset;
                            selectionEndBlockId = anchor.endBlockId;
                            selectionEndOffset = anchor.endOffset;
                            // 关键：reference 路径强制不注入 selectedText，Resolver 才会稳定标 route_source=reference
                            selectedText = null;
                            console.debug('[chatStore] 使用 TextReference 四元组作为零搜索输入', {
                                sourceFile: preciseTextRef.sourceFile,
                                startBlockId: anchor.startBlockId,
                                endBlockId: anchor.endBlockId,
                            });
                        }
                    }
                }
                // 旧的 editTarget 构造链已禁用。
                // 选区/引用定位统一走 selectedText + selectionStart/EndBlockId + selectionStart/EndOffset。
                
                // P1 + §十三：L/revision 与 RequestContext 一致；baseline 仅用于 diff 卡 UI（首送写入）
                const positioningCtx = await buildPositioningRequestContext(injectionTab);
                setPositioningRequestContextForChat(tabId, positioningCtx);

                let currentEditorContent: string | null = injectionTab?.content ?? activeEditorTab?.content ?? null;
                let documentRevision: number | undefined;
                if (positioningCtx && injectionTab?.id) {
                    const { useDiffStore } = await import('./diffStore');
                    // 每轮发送消息时更新 baseline 为当前文档状态（positioningCtx.L），
                    // getLogicalContent 只应用 baselineSetAt 之后接受的 diffs，避免跨轮偏移错误
                    useDiffStore.getState().setBaseline(injectionTab.filePath, positioningCtx.L);
                    currentEditorContent = positioningCtx.L;
                    documentRevision = positioningCtx.revision;
                } else if (injectionTab) {
                    documentRevision = injectionTab.documentRevision ?? 1;
                }
                
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
                    baselineId: positioningCtx?.baselineId,
                });
                
                // 调用后端流式聊天（根据模式决定是否启用工具）
                // 注意：如果没有工作区，工具调用应该禁用（临时聊天模式，只能是 chat 模式）
                // Phase 0/1.1：引用功能 - 转为协议格式（refs 已在上方取过）
                const { buildReferencesForProtocol } = await import('../utils/referenceProtocolAdapter');
                const references = await buildReferencesForProtocol(refs, currentFile, validRefIdSet);

                const enableTools = currentTab.mode === 'agent' && !!currentWorkspace;

                // primaryEditTarget：仅自动推导（§6.9），不由用户点选；意图识别交给模型与提示词在后续优化
                // 规则：恰好一个文件引用且与当前活动编辑器文档不是同一文件 → 传工作区相对路径，后端跳过向 edit_current_editor_document 注入当前编辑器内容
                // primaryEditTarget：与**活动**编辑器文档比较（非注入后 currentFile），供后端在「仅引用、目标未打开」时跳过错误注入
                let primaryEditTarget: string | undefined;
                if (currentWorkspace && activeEditorTab?.filePath) {
                    if (fileRefsForInjection.length === 1) {
                        const { normalizePath, normalizeWorkspacePath, getAbsolutePath, getRelativePath, isSameDocumentForEdit } =
                            await import('../utils/pathUtils');
                        const refPath = fileRefsForInjection[0].path;
                        if (!isSameDocumentForEdit(refPath, activeEditorTab.filePath)) {
                            const wsNorm = normalizeWorkspacePath(currentWorkspace);
                            const absRef = getAbsolutePath(normalizePath(refPath), wsNorm);
                            primaryEditTarget = getRelativePath(absRef, wsNorm);
                        }
                    }
                }
                
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
                    references: references.length > 0 ? references : undefined, // Phase 0：引用协议
                    ...(primaryEditTarget != null ? { primaryEditTarget } : {}),
                    ...(documentRevision != null ? { documentRevision } : {}),
                    ...(positioningCtx?.baselineId ? { baselineId: positioningCtx.baselineId } : {}),
                    ...(positioningCtx ? { editorTabId: positioningCtx.editorTabId } : {}),
                    // §7.1：选区完整坐标
                    ...(selectionStartBlockId != null ? { selectionStartBlockId } : {}),
                    ...(selectionStartOffset != null ? { selectionStartOffset } : {}),
                    ...(selectionEndBlockId != null ? { selectionEndBlockId } : {}),
                    ...(selectionEndOffset != null ? { selectionEndOffset } : {}),
                    // §7.1：光标坐标
                    ...(cursorBlockId != null ? { cursorBlockId } : {}),
                    ...(cursorOffset != null ? { cursorOffset } : {}),
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

        refreshPositioningContextForEditor: (filePath: string) => {
            const tab = useEditorStore.getState().getTabByFilePath(filePath);
            if (!tab?.editor) return;
            const newHtml = tab.editor.getHTML();
            // 更新 positioningContextByChatTab Map（requestContext 模块级变量）
            import('../utils/requestContext').then(({ updatePositioningLForFilePath }) => {
                updatePositioningLForFilePath(filePath, newHtml);
            });
            useDiffStore.getState().setBaseline(filePath, newHtml);
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
                const removedAssistant = tab.messages[lastAssistantIndex];
                if (removedAssistant?.id) {
                    useDiffStore.getState().cleanupDiffsForMessage(tabId, removedAssistant.id);
                }
                const newMessages = tab.messages.slice(0, lastAssistantIndex);
                set({
                    tabs: tabs.map(t =>
                        t.id === tabId
                            ? { ...t, messages: newMessages, updatedAt: Date.now() }
                            : t
                    ),
                });
            }
            
            // 重新发送最后一条用户消息（保留 displayNodes/displayContent）
            await sendMessage(tabId, lastUserMessage.content, {
                displayNodes: lastUserMessage.displayNodes,
                displayContent: lastUserMessage.displayContent,
            });
        },
    };
});
