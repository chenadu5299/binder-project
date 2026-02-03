import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, useChatStore } from '../../stores/chatStore';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { ToolCallCard } from './ToolCallCard';
import { ToolResult } from '../../types/tool';
import { MessageContextMenu } from './MessageContextMenu';
import { WorkPlanCard } from './WorkPlanCard';
import { parseWorkPlan } from '../../utils/workPlanParser';
import { ToolCallSummary } from './ToolCallSummary';
import { AuthorizationCard } from './AuthorizationCard';
import { QuickApplyButton } from './QuickApplyButton';
import { DocumentDiffView } from './DocumentDiffView';
import { needsAuthorization, generateAuthorizationDescription } from '../../utils/toolDescription';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';

interface ChatMessagesProps {
    messages: ChatMessage[];
    onCopy?: (messageId: string) => void;
    tabId: string;
    onRegenerate?: (messageId: string) => void;
    onDelete?: (messageId: string) => void;
    mode?: 'agent' | 'chat'; // 聊天模式，用于决定是否显示工作计划
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({ 
    messages, 
    onCopy, 
    tabId,
    onRegenerate,
    onDelete,
    mode = 'agent', // 默认为 agent 模式
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { updateToolCall, regenerate, deleteMessage, updateContentBlock } = useChatStore();
    const { currentWorkspace } = useFileStore();
    
    // 文档编辑功能：确认编辑
    const handleConfirmEdit = async (
        diffAreaId: string,
        _level: 'paragraph' | 'document' | 'all', // MVP 阶段未使用，阶段二会使用
        _paragraphId: string | undefined, // MVP 阶段未使用，阶段二会使用
        newContent: string,
    ) => {
        try {
            const { getActiveTab, applyTabDiff } = useEditorStore.getState();
            const activeTab = getActiveTab();
            
            if (!activeTab) {
                throw new Error('编辑器已关闭，无法应用编辑');
            }
            
            // ⚠️ 关键修复：不应该使用 newContent 更新整个文档，而应该触发编辑器的 onApplyDiff
            // 编辑器的 onApplyDiff 会通过 diff 数据只应用修改的部分，保留原有格式
            // 通过 applyTabDiff 触发编辑器应用 diff
            applyTabDiff(activeTab.id);
            
            console.log('✅ [前端] 已触发编辑器应用 diff');
        } catch (error) {
            console.error('应用编辑失败:', error);
            // 显示错误提示（可选）
        }
    };
    
    // 文档编辑功能：拒绝编辑
    const handleRejectEdit = async (diffAreaId: string) => {
        try {
            // ⚠️ 新增：清除编辑器中的 diff 数据
            const { getActiveTab, clearTabDiff } = useEditorStore.getState();
            const activeTab = getActiveTab();
            if (activeTab) {
                clearTabDiff(activeTab.id);
            }
            
            // MVP 阶段：直接移除预览，不更新编辑器
            // 编辑器内容保持不变
            // diffAreaId 在阶段二会用于调用 Tauri Command
            console.log('❌ 已拒绝编辑，diff 已清除');
        } catch (error) {
            console.error('拒绝编辑失败:', error);
        }
    };
    const [contextMenu, setContextMenu] = useState<{
        message: ChatMessage;
        position: { x: number; y: number };
    } | null>(null);
    // 工作计划确认状态（按消息 ID 存储）
    const [confirmedPlans, setConfirmedPlans] = useState<Set<string>>(new Set());
    
    // ⚠️ 关键修复：跟踪用户是否手动滚动过，以及是否应该自动滚动
    const userScrolledRef = useRef<boolean>(false);
    const isAutoScrollingRef = useRef<boolean>(false);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // AI 返回文档修改结果时，立即同步 diff 到 EditorStore，使编辑器同步显示 diff 高亮（点击确认时才应用）
    useEffect(() => {
        const { getActiveTab, setTabDiff } = useEditorStore.getState();
        const activeTab = getActiveTab();
        if (!activeTab) return;
        // 从最新消息往旧找，取第一个带完整 diff 的 edit_current_editor_document 块
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (!msg.contentBlocks?.length) continue;
            for (const block of msg.contentBlocks) {
                if ((block.type !== 'tool' && block.type !== 'authorization') || block.toolCall?.name !== 'edit_current_editor_document') continue;
                const toolResult = block.toolCall?.result;
                if (!toolResult?.success) continue;
                let resultData: any = {};
                if (toolResult.data !== undefined && toolResult.data !== null) {
                    if (typeof toolResult.data === 'string') {
                        try { resultData = JSON.parse(toolResult.data); } catch { resultData = {}; }
                    } else if (typeof toolResult.data === 'object') resultData = toolResult.data;
                } else if (toolResult.diff_area_id || toolResult.old_content || toolResult.oldContent || toolResult.new_content || toolResult.newContent) {
                    resultData = toolResult;
                } else continue;
                const diffAreaId = resultData.diff_area_id || '';
                const diffs = resultData.diffs || [];
                const oldContent = resultData.old_content ?? resultData.oldContent ?? '';
                const newContent = resultData.new_content ?? resultData.newContent ?? '';
                if (diffAreaId && Array.isArray(diffs) && diffs.length > 0 && oldContent !== undefined && newContent !== undefined) {
                    setTabDiff(activeTab.id, diffAreaId, diffs, oldContent, newContent);
                    return;
                }
            }
        }
    }, [messages]);
    
    // 检查是否在底部附近（距离底部 100px 以内）
    const isNearBottom = (): boolean => {
        const container = scrollContainerRef.current;
        if (!container) return true;
        
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        return distanceFromBottom < 100; // 100px 阈值
    };
    
    // ⚠️ 关键修复：使用 instant 滚动避免滚动冲突，并添加防抖机制
    const scrollToBottom = (_behavior: ScrollBehavior = 'auto') => {
        if (messagesEndRef.current && scrollContainerRef.current) {
            // 如果正在滚动，取消之前的滚动
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
            
            // 如果已经设置了自动滚动标志，跳过（避免重复滚动）
            if (isAutoScrollingRef.current) {
                return;
            }
            
            isAutoScrollingRef.current = true;
            
            // ⚠️ 关键修复：直接设置 scrollTop，避免 scrollIntoView 的动画冲突
            const container = scrollContainerRef.current;
            container.scrollTop = container.scrollHeight;
            
            // 立即重置标志（因为直接设置 scrollTop 是同步的）
            requestAnimationFrame(() => {
                isAutoScrollingRef.current = false;
            });
        }
    };
    
    // ⚠️ 关键修复：防抖滚动函数，减少滚动频率
    const scrollDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const debouncedScrollToBottom = () => {
        if (scrollDebounceTimeoutRef.current) {
            clearTimeout(scrollDebounceTimeoutRef.current);
        }
        scrollDebounceTimeoutRef.current = setTimeout(() => {
            if (!userScrolledRef.current || isNearBottom()) {
                scrollToBottom('auto');
            }
        }, 50); // 50ms 防抖
    };
    
    // ⚠️ 关键修复：合并滚动逻辑，避免重复触发
    // 监听消息数组变化（新消息添加时）
    useEffect(() => {
        // 如果用户手动滚动过，检查是否在底部附近
        if (userScrolledRef.current) {
            if (isNearBottom()) {
                // 用户在底部附近，恢复自动滚动
                userScrolledRef.current = false;
                scrollToBottom('auto');
            }
            // 如果用户不在底部附近，不自动滚动
            return;
        }
        
        // 用户没有手动滚动，自动滚动
        requestAnimationFrame(() => {
            scrollToBottom('auto');
        });
    }, [messages.length]); // 只监听消息数量变化，不监听整个数组
    
    // ⚠️ 关键修复：监听最后一条消息的内容变化（流式更新时）
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastMessageContent = lastMessage?.content || '';
    const lastMessageId = lastMessage?.id || '';
    const lastMessageIsLoading = lastMessage?.isLoading || false;
    
    // 使用 useRef 来跟踪上次的内容长度，避免频繁滚动
    const lastContentLengthRef = useRef<number>(0);
    
    useEffect(() => {
        // 只在有消息、消息正在加载、且用户没有手动滚动时，才在内容更新时自动滚动
        if (lastMessage && lastMessageIsLoading && !userScrolledRef.current) {
            const currentContentLength = lastMessageContent.length;
            // 只有当内容长度增加时才滚动（避免内容减少时也滚动）
            if (currentContentLength > lastContentLengthRef.current) {
                lastContentLengthRef.current = currentContentLength;
                // 检查是否在底部附近，使用防抖滚动
                if (isNearBottom()) {
                    debouncedScrollToBottom();
                }
            }
        } else if (lastMessage && !lastMessageIsLoading) {
            // 消息加载完成，重置内容长度跟踪，并滚动到底部
            lastContentLengthRef.current = lastMessageContent.length;
            if (!userScrolledRef.current || isNearBottom()) {
                requestAnimationFrame(() => {
                    scrollToBottom('auto');
                });
            }
        }
        
        // 清理函数：组件卸载时清理 timeout
        return () => {
            if (scrollDebounceTimeoutRef.current) {
                clearTimeout(scrollDebounceTimeoutRef.current);
            }
        };
    }, [lastMessageContent, lastMessageId, lastMessageIsLoading]);
    
    // ⚠️ 关键修复：监听用户滚动事件
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        
        const handleScroll = () => {
            // 如果正在自动滚动，忽略滚动事件
            if (isAutoScrollingRef.current) {
                return;
            }
            
            // 检测用户是否手动滚动
            if (!isNearBottom()) {
                // 用户向上滚动了，标记为用户手动滚动
                userScrolledRef.current = true;
            } else {
                // 用户滚动到底部附近，恢复自动滚动
                userScrolledRef.current = false;
            }
        };
        
        container.addEventListener('scroll', handleScroll, { passive: true });
        
        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // 处理右键菜单
    const handleContextMenu = (e: React.MouseEvent, message: ChatMessage) => {
        e.preventDefault();
        setContextMenu({
            message,
            position: { x: e.clientX, y: e.clientY },
        });
    };

    const handleCopyMessage = (messageId: string) => {
        if (onCopy) {
            onCopy(messageId);
        } else {
            const message = messages.find(m => m.id === messageId);
            if (message) {
                navigator.clipboard.writeText(message.content).catch(console.error);
            }
        }
    };

    const handleRegenerateMessage = (messageId: string) => {
        if (onRegenerate) {
            onRegenerate(messageId);
        } else {
            regenerate(tabId);
        }
    };

    const handleDeleteMessage = (messageId: string) => {
        if (onDelete) {
            onDelete(messageId);
        } else {
            deleteMessage(tabId, messageId);
        }
    };

    // 渲染内容块
    const renderContentBlock = (block: any, _index: number, message: ChatMessage) => {
        switch (block.type) {
            case 'text':
                // 使用 inline 元素，避免不必要的换行，文本块之间无缝连接
                return (
                    <span key={block.id} className="whitespace-pre-wrap break-words">
                        {block.content}
                    </span>
                );
            case 'tool':
                if (!block.toolCall) return null;
                
                // 检查是否需要授权
                if (needsAuthorization(block.toolCall.name, block.toolCall.arguments, currentWorkspace ?? undefined)) {
                    return (
                        <div key={block.id} className="mt-2">
                            <AuthorizationCard
                                request={block.authorization || {
                                    id: block.toolCall.id,
                                    type: 'file_system',
                                    operation: block.toolCall.name,
                                    details: block.toolCall.arguments,
                                }}
                                description={generateAuthorizationDescription(block.toolCall)}
                                onAuthorize={() => {
                                    // TODO: 实现授权逻辑
                                    console.log('授权工具调用:', block.toolCall);
                                }}
                                onDeny={() => {
                                    // TODO: 实现拒绝逻辑
                                    console.log('拒绝工具调用:', block.toolCall);
                                }}
                            />
                        </div>
                    );
                }
                
                // 文本编辑使用 Diff 预览
                if (block.toolCall.name === 'edit_current_editor_document') {
                    console.log('📝 [前端] 检测到 edit_current_editor_document 工具调用', {
                        toolCall: block.toolCall,
                        result: block.toolCall.result,
                    });
                    
                    const toolResult = block.toolCall.result;
                    
                    // ⚠️ 调试：打印完整的 toolResult 结构（使用 JSON.stringify 确保能看到所有字段）
                    const toolResultStr = JSON.stringify(toolResult, null, 2);
                    console.log('🔍 [前端] 工具调用结果结构:', {
                        toolResult,
                        toolResultType: typeof toolResult,
                        toolResultKeys: toolResult ? Object.keys(toolResult) : [],
                        hasData: !!toolResult?.data,
                        dataType: typeof toolResult?.data,
                        dataValue: toolResult?.data,
                        dataKeys: toolResult?.data ? Object.keys(toolResult.data) : [],
                        // 打印完整的 toolResult 结构（用于调试）
                        toolResultString: toolResultStr,
                        // 检查是否是 success 字段
                        hasSuccess: 'success' in (toolResult || {}),
                        successValue: toolResult?.success,
                    });
                    
                    // ⚠️ 关键修复：确保从正确的位置获取数据
                    // 后端返回的数据结构：{ success: true, data: { diff_area_id, file_path, old_content, new_content, diffs } }
                    // 但是，如果 data 是字符串（JSON 字符串），需要先解析
                    // 另外，如果 toolResult 本身就是一个对象（而不是 { success, data } 结构），可能需要直接使用
                    let resultData: any = {};
                    
                    if (!toolResult) {
                        console.error('❌ [前端] toolResult 不存在');
                        return (
                            <div key={block.id} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                ⚠️ 文档编辑数据不完整，无法显示预览。工具调用结果不存在。
                            </div>
                        );
                    }
                    
                    // 检查 toolResult 的结构
                    // 情况 1: toolResult.data 存在（标准结构 { success, data, ... }）
                    if (toolResult.data !== undefined && toolResult.data !== null) {
                        console.log('✅ [前端] 使用标准结构 toolResult.data');
                        if (typeof toolResult.data === 'string') {
                            try {
                                resultData = JSON.parse(toolResult.data);
                            } catch (e) {
                                console.error('❌ [前端] 解析 data JSON 失败:', e);
                                resultData = {};
                            }
                        } else if (typeof toolResult.data === 'object') {
                            resultData = toolResult.data;
                        }
                    } 
                    // 情况 2: toolResult 本身可能就是 data（如果后端直接返回 data 对象，而不是包装在 ToolResult 中）
                    else if (toolResult.diff_area_id || toolResult.old_content || toolResult.oldContent || toolResult.new_content || toolResult.newContent) {
                        console.log('✅ [前端] toolResult 本身可能就是 data 对象，直接使用', {
                            hasDiffAreaId: !!toolResult.diff_area_id,
                            hasOldContent: !!(toolResult.old_content || toolResult.oldContent),
                            hasNewContent: !!(toolResult.new_content || toolResult.newContent),
                        });
                        resultData = toolResult;
                    }
                    // 情况 3: toolResult.data 是 null（Rust 的 Option::None 序列化为 null）
                    else if (toolResult.data === null) {
                        console.error('❌ [前端] toolResult.data 是 null，后端可能返回了错误或空数据', {
                            toolResult,
                            success: toolResult.success,
                            error: toolResult.error,
                            message: toolResult.message,
                        });
                        return (
                            <div key={block.id} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                ⚠️ 文档编辑数据不完整，无法显示预览。后端返回的数据为空。
                                {toolResult.error && <div className="mt-2 text-xs">错误: {toolResult.error}</div>}
                            </div>
                        );
                    }
                    // 情况 4: toolResult 是其他结构，尝试从不同位置获取
                    else {
                        console.warn('⚠️ [前端] toolResult.data 不存在，且 toolResult 也不是 data 对象', {
                            toolResultKeys: Object.keys(toolResult),
                            toolResult,
                        });
                        // 尝试从 toolResult 的其他字段获取
                        resultData = toolResult as any;
                    }
                    
                    const diffAreaId = resultData.diff_area_id || '';
                    const oldContent = resultData.old_content || resultData.oldContent || '';
                    const newContent = resultData.new_content || resultData.newContent || '';
                    const filePath = resultData.file_path || resultData.filePath || '当前文档';
                    const diffs = resultData.diffs || [];
                    
                    console.log('📝 [前端] 文档编辑数据:', {
                        diffAreaId,
                        filePath,
                        oldContentLength: oldContent.length,
                        newContentLength: newContent.length,
                        diffsCount: diffs.length,
                        resultDataKeys: Object.keys(resultData),
                        resultData,
                    });
                    
                    // ⚠️ 关键修复：检查数据完整性
                    // oldContent 和 newContent 可能是空字符串（如果文档为空），这是合法的
                    // 但如果字段不存在（undefined），才是真正的错误
                    if (oldContent === undefined || newContent === undefined) {
                        console.error('❌ [前端] 文档编辑数据字段缺失:', {
                            hasOldContent: oldContent !== undefined,
                            hasNewContent: newContent !== undefined,
                            oldContent,
                            newContent,
                            toolResult,
                            resultData,
                            resultDataKeys: Object.keys(resultData),
                        });
                        return (
                            <div key={block.id} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                ⚠️ 文档编辑数据不完整，无法显示预览。请检查工具调用结果。
                            </div>
                        );
                    }
                    
                    // 编辑器 diff 由 ChatPanel 在收到工具结果时设置（setTabDiff），避免在渲染中产生副作用
                    
                    return (
                        <div key={block.id} className="mt-2 w-full">
                            <DocumentDiffView
                                diffAreaId={diffAreaId}
                                oldContent={oldContent}
                                newContent={newContent}
                                filePath={filePath}
                                diffs={diffs}
                                onConfirm={async (level: 'paragraph' | 'document' | 'all', paragraphId?: string) => {
                                    console.log('✅ [前端] 用户确认编辑', { diffAreaId, level, paragraphId });
                                    await handleConfirmEdit(diffAreaId, level, paragraphId, newContent);
                                }}
                                onReject={async () => {
                                    console.log('❌ [前端] 用户拒绝编辑', { diffAreaId });
                                    await handleRejectEdit(diffAreaId);
                                }}
                            />
                        </div>
                    );
                }
                
                // 其他工具调用显示为缩览
                return (
                    <div key={block.id} className="mt-2">
                        <ToolCallSummary
                            toolCall={block.toolCall}
                            expanded={block.expanded || false}
                            onToggle={() => {
                                updateContentBlock(tabId, message.id, block.id, {
                                    expanded: !block.expanded,
                                });
                            }}
                        />
                    </div>
                );
            case 'authorization':
                return (
                    <div key={block.id} className="mt-2">
                        <AuthorizationCard
                            request={block.authorization!}
                            description={block.content || '需要授权'}
                            onAuthorize={() => {
                                // TODO: 实现授权逻辑
                                console.log('授权:', block.authorization);
                            }}
                            onDeny={() => {
                                // TODO: 实现拒绝逻辑
                                console.log('拒绝:', block.authorization);
                            }}
                        />
                    </div>
                );
            default:
                return null;
        }
    };
    
    return (
        <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
        >
            {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <div className="text-center">
                        <p className="text-lg font-semibold mb-2">开始新的对话</p>
                        <p className="text-sm">在下方输入框中输入消息，按 Enter 发送</p>
                    </div>
                </div>
            ) : (
                messages.map((message) => (
                    <div
                        key={message.id}
                        className={`
                            flex gap-3 group
                            ${message.role === 'user' ? 'justify-end' : 'justify-start'}
                        `}
                    >
                        {message.role === 'assistant' && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
                                AI
                            </div>
                        )}
                        
                        <div
                            className={`
                                max-w-[80%] rounded-lg p-4 cursor-context-menu
                                ${message.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                }
                            `}
                            onContextMenu={(e) => handleContextMenu(e, message)}
                        >
                            {/* 如果有 contentBlocks，使用新的渲染方式 */}
                            {message.contentBlocks && message.contentBlocks.length > 0 ? (
                                <div>
                                    {(() => {
                                        // ⚠️ 去重：确保同一个工具调用（edit_current_editor_document）只渲染一次
                                        // 使用 diffAreaId 或 toolCall.id 作为去重键
                                        const seenDiffAreaIds = new Set<string>();
                                        const seenToolCallIds = new Set<string>();
                                        
                                        const filteredBlocks = message.contentBlocks
                                            .sort((a, b) => a.timestamp - b.timestamp)
                                            .filter((block) => {
                                                // ⚠️ 关键修复：block.type 实际是 'tool' 或 'authorization'，不是 'tool_call'
                                                // 对于 edit_current_editor_document 工具调用，使用 diffAreaId 去重
                                                if ((block.type === 'tool' || block.type === 'authorization') && block.toolCall?.name === 'edit_current_editor_document') {
                                                    const toolResult = block.toolCall?.result;
                                                    
                                                    // ⚠️ 关键修复：如果 toolResult 不存在或没有 success，说明数据不完整，跳过（避免显示错误的 diff）
                                                    if (!toolResult || !toolResult.success) {
                                                        console.warn('⚠️ [前端] 工具调用结果不完整，跳过渲染', {
                                                            blockId: block.id,
                                                            toolCallId: block.toolCall?.id,
                                                            hasResult: !!toolResult,
                                                            success: toolResult?.success,
                                                        });
                                                        return false; // 跳过不完整的数据
                                                    }
                                                    
                                                    let resultData: any = {};
                                                    
                                                    if (toolResult?.data !== undefined && toolResult.data !== null) {
                                                        if (typeof toolResult.data === 'string') {
                                                            try {
                                                                resultData = JSON.parse(toolResult.data);
                                                            } catch (e) {
                                                                resultData = {};
                                                            }
                                                        } else if (typeof toolResult.data === 'object') {
                                                            resultData = toolResult.data;
                                                        }
                                                    } else if (toolResult?.diff_area_id || toolResult?.old_content || toolResult?.oldContent) {
                                                        resultData = toolResult;
                                                    }
                                                    
                                                    const diffAreaId = resultData.diff_area_id || '';
                                                    const diffs = resultData.diffs || [];
                                                    
                                                    // ⚠️ 关键修复：如果 diffAreaId 为空或 diffs 为空，说明数据不完整，跳过
                                                    if (!diffAreaId || !Array.isArray(diffs) || diffs.length === 0) {
                                                        console.warn('⚠️ [前端] diff 数据不完整，跳过渲染', {
                                                            blockId: block.id,
                                                            toolCallId: block.toolCall?.id,
                                                            hasDiffAreaId: !!diffAreaId,
                                                            diffsCount: Array.isArray(diffs) ? diffs.length : 0,
                                                        });
                                                        return false; // 跳过不完整的数据
                                                    }
                                                    
                                                    if (diffAreaId && seenDiffAreaIds.has(diffAreaId)) {
                                                        console.warn('⚠️ [前端] 检测到重复的 diff 预览，跳过渲染', {
                                                            diffAreaId,
                                                            blockId: block.id,
                                                            toolCallId: block.toolCall?.id,
                                                        });
                                                        return false; // 跳过重复的 diff
                                                    }
                                                    
                                                    if (diffAreaId) {
                                                        seenDiffAreaIds.add(diffAreaId);
                                                    }
                                                }
                                                
                                                // 对于其他工具调用，使用 toolCall.id 去重
                                                if ((block.type === 'tool' || block.type === 'authorization') && block.toolCall?.id) {
                                                    if (seenToolCallIds.has(block.toolCall.id)) {
                                                        console.warn('⚠️ [前端] 检测到重复的工具调用，跳过渲染', {
                                                            toolCallId: block.toolCall.id,
                                                            blockId: block.id,
                                                        });
                                                        return false; // 跳过重复的工具调用
                                                    }
                                                    seenToolCallIds.add(block.toolCall.id);
                                                }
                                                
                                                return true;
                                            });
                                        
                                        return filteredBlocks.map((block, index) => {
                                            // 检查前一个块是否是文本块，如果是，则不需要分隔
                                            const prevBlock = index > 0 ? filteredBlocks[index - 1] : null;
                                            const needsSeparator = index > 0 && block.type !== 'text' && prevBlock?.type === 'text';
                                            
                                            return (
                                                <React.Fragment key={block.id}>
                                                    {needsSeparator && (
                                                        <div className="border-t border-gray-200 dark:border-gray-600 my-2" />
                                                    )}
                                                    {renderContentBlock(block, index, message)}
                                                </React.Fragment>
                                            );
                                        });
                                    })()}
                                </div>
                            ) : (
                                /* 兼容旧格式：如果没有 contentBlocks，使用旧方式渲染 */
                                <div className={`whitespace-pre-wrap break-words ${message.content?.includes('❌ AI 功能未配置') ? 'text-red-600 dark:text-red-400' : ''}`}>
                                    {message.content || (message.isLoading ? (
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                        </div>
                                    ) : null)}
                                </div>
                            )}
                            
                            {/* 显示工作计划（简化版，仅 Agent 模式） */}
                            {mode === 'agent' && message.role === 'assistant' && message.content && !message.isLoading && !confirmedPlans.has(message.id) && (() => {
                                const plan = parseWorkPlan(message.content);
                                if (plan) {
                                    return (
                                        <WorkPlanCard
                                            plan={plan}
                                            onConfirm={async () => {
                                                // 标记为已确认，AI 可以继续执行
                                                setConfirmedPlans(prev => new Set(prev).add(message.id));
                                                // 发送确认消息给 AI，让 AI 继续执行
                                                const { sendMessage } = useChatStore.getState();
                                                try {
                                                    await sendMessage(tabId, '好的，开始执行');
                                                    console.log('✅ 用户确认执行计划，已发送确认消息');
                                                } catch (error) {
                                                    console.error('❌ 发送确认消息失败:', error);
                                                }
                                            }}
                                            onCancel={() => {
                                                // 标记为已确认（取消也视为已处理），隐藏计划卡片
                                                setConfirmedPlans(prev => new Set(prev).add(message.id));
                                            }}
                                        />
                                    );
                                }
                                return null;
                            })()}
                            
                            {/* 兼容旧格式：显示工具调用（如果没有 contentBlocks） */}
                            {!message.contentBlocks && message.toolCalls && message.toolCalls.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {message.toolCalls.map((toolCall) => (
                                        <ToolCallCard
                                            key={toolCall.id}
                                            toolCall={toolCall}
                                            onResult={(result: ToolResult) => {
                                                const activeTabId = useChatStore.getState().activeTabId;
                                                if (activeTabId) {
                                                    updateToolCall(activeTabId, message.id, toolCall.id, {
                                                        status: result.success ? 'completed' : 'failed',
                                                        result,
                                                        error: result.error,
                                                    });
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                            
                            {/* Chat 模式：快捷应用到文档按钮 */}
                            {mode === 'chat' && message.role === 'assistant' && message.content && !message.contentBlocks && (
                                <QuickApplyButton
                                    messageId={message.id}
                                    content={message.content}
                                />
                            )}
                            
                            {message.role === 'assistant' && message.content && (
                                <button
                                    onClick={() => handleCopyMessage(message.id)}
                                    className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                                >
                                    <ClipboardDocumentIcon className="w-3 h-3" />
                                    <span>复制</span>
                                </button>
                            )}
                        </div>
                        
                        {message.role === 'user' && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-semibold">
                                U
                            </div>
                        )}
                    </div>
                ))
            )}
            <div ref={messagesEndRef} />

            {/* 右键菜单 */}
            {contextMenu && (
                <MessageContextMenu
                    message={contextMenu.message}
                    position={contextMenu.position}
                    onClose={() => setContextMenu(null)}
                    onCopy={() => handleCopyMessage(contextMenu.message.id)}
                    onRegenerate={() => handleRegenerateMessage(contextMenu.message.id)}
                    onDelete={() => handleDeleteMessage(contextMenu.message.id)}
                    tabId={tabId}
                />
            )}
        </div>
    );
};


