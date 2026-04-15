import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChatMessage, useChatStore } from '../../stores/chatStore';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { ToolCallCard } from './ToolCallCard';
import { ToolCall, ToolResult } from '../../types/tool';
import { MessageContextMenu } from './MessageContextMenu';
import { WorkPlanCard } from './WorkPlanCard';
import { parseWorkPlan } from '../../utils/workPlanParser';
import { ToolCallSummary } from './ToolCallSummary';
import { AuthorizationCard } from './AuthorizationCard';
import { QuickApplyButton } from './QuickApplyButton';
import { generateAuthorizationDescription, isAwaitingAuthorization } from '../../utils/toolDescription';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { useDiffStore } from '../../stores/diffStore';
import { resolveEditorTabForEditResultWithRequestContext } from '../../utils/editToolTabResolve';
import { blockRangeToPMRange } from '../../utils/editorOffsetUtils';
import { DiffCard } from './DiffCard';
import { positionToLine } from '../../utils/editorOffsetUtils';
import { documentService } from '../../services/documentService';
import { toast } from '../Common/Toast';
import { useAgentStore } from '../../stores/agentStore';
import {
    createPendingConfirmationRecord,
    createShadowStageState,
} from '../../types/agent_state';
import { DiffActionService } from '../../services/DiffActionService';
import { DiffRetryController } from '../../services/DiffRetryController';
import type { KnowledgeInjectionSlice } from '../../types/knowledge';
import './InlineChatInput.css';

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
    const { getActiveTab } = useEditorStore();
    const agentRuntime = useAgentStore((s) => s.runtimesByTab[tabId]);
    useDiffStore((s) => s.byTab);
    
    const [contextMenu, setContextMenu] = useState<{
        message: ChatMessage;
        position: { x: number; y: number };
    } | null>(null);
    // 工作计划确认状态（按消息 ID 存储）
    const [confirmedPlans, setConfirmedPlans] = useState<Set<string>>(new Set());

    const buildAuthorizationRequest = (toolCall: ToolCall) => ({
        id: toolCall.id,
        type: 'file_system' as const,
        operation: toolCall.name,
        details: toolCall.arguments,
    });

    const resolveAuthorization = async (
        messageId: string,
        blockId: string,
        toolCall: ToolCall,
        action: 'confirm' | 'deny'
    ) => {
        if (!currentWorkspace) {
            toast.error('当前未绑定 workspace，无法执行确认操作。');
            return;
        }

        const recordId = toolCall.result?.meta?.confirmation?.recordId;
        if (!recordId) {
            toast.error('确认记录尚未准备好，请稍后重试。');
            return;
        }

        const nextArguments = {
            ...toolCall.arguments,
            _confirmation_action: action,
            _confirmation_id: recordId,
        };

        const nextToolCall: ToolCall = {
            ...toolCall,
            arguments: nextArguments,
            status: action === 'confirm' ? 'executing' : 'pending',
        };

        updateToolCall(tabId, messageId, toolCall.id, {
            arguments: nextArguments,
            status: action === 'confirm' ? 'executing' : 'pending',
        });
        updateContentBlock(tabId, messageId, blockId, {
            type: 'authorization',
            toolCall: nextToolCall,
            authorization: buildAuthorizationRequest(nextToolCall),
        });

        try {
            const command = action === 'confirm' ? 'execute_tool_with_retry' : 'execute_tool';
            const payload = {
                toolCall: {
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: nextArguments,
                },
                workspacePath: currentWorkspace,
                ...(action === 'confirm' ? { maxRetries: 3 } : {}),
            };

            const result = await invoke<ToolResult>(command, payload);
            const awaiting = result.meta?.gate?.status === 'awaiting_confirmation';
            const status: ToolCall['status'] = awaiting
                ? 'pending'
                : result.success
                    ? 'completed'
                    : 'failed';
            const finalToolCall: ToolCall = {
                ...toolCall,
                arguments: nextArguments,
                status,
                result,
                error: result.error,
            };
            const stillAwaiting = isAwaitingAuthorization(finalToolCall, currentWorkspace ?? undefined);

            updateToolCall(tabId, messageId, toolCall.id, {
                arguments: nextArguments,
                status,
                result,
                error: result.error,
            });
            updateContentBlock(tabId, messageId, blockId, {
                type: stillAwaiting ? 'authorization' : 'tool',
                toolCall: finalToolCall,
                authorization: stillAwaiting ? buildAuthorizationRequest(finalToolCall) : undefined,
            });

            if (action === 'deny') {
                toast.info('已拒绝该工具操作。');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateToolCall(tabId, messageId, toolCall.id, {
                status: 'failed',
                error: message,
            });
            updateContentBlock(tabId, messageId, blockId, {
                type: 'tool',
            });
            toast.error(`执行确认操作失败: ${message}`);
        }
    };

    useEffect(() => {
        if (!agentRuntime?.currentTask) return;
        if (!['structured', 'candidate_ready'].includes(agentRuntime.stageState.stage)) return;

        const hasRenderableCandidate = messages.some((message) =>
            (message.contentBlocks ?? []).some((block) => {
                const toolCall = block.toolCall;
                if (!toolCall?.result?.success) return false;
                if (toolCall.name === 'update_file') {
                    const data = typeof toolCall.result.data === 'object' && toolCall.result.data !== null
                        ? toolCall.result.data
                        : typeof toolCall.result.data === 'string'
                            ? (() => { try { return JSON.parse(toolCall.result.data); } catch { return {}; } })()
                            : {};
                    return Array.isArray(data.pending_diffs) && data.pending_diffs.length > 0;
                }
                if (toolCall.name === 'edit_current_editor_document') {
                    const data = typeof toolCall.result.data === 'object' && toolCall.result.data !== null
                        ? toolCall.result.data
                        : typeof toolCall.result.data === 'string'
                            ? (() => { try { return JSON.parse(toolCall.result.data); } catch { return {}; } })()
                            : {};
                    return !!data.diff_area_id && Array.isArray(data.diffs) && data.diffs.length > 0;
                }
                return false;
            })
        );

        if (!hasRenderableCandidate) return;

        const agentStore = useAgentStore.getState();
        const taskId = agentRuntime.currentTask.id;
        agentStore.setStageState(
            tabId,
            createShadowStageState(taskId, 'review_ready', 'candidate_rendered_for_user_review')
        );
        agentStore.setConfirmation(
            tabId,
            createPendingConfirmationRecord(taskId, 'awaiting_user_review')
        );
    }, [agentRuntime?.currentTask?.id, agentRuntime?.stageState.stage, messages, tabId]);
    
    // ⚠️ 关键修复：跟踪用户是否手动滚动过，以及是否应该自动滚动
    const userScrolledRef = useRef<boolean>(false);
    const isAutoScrollingRef = useRef<boolean>(false);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // 旧的 ChatMessages 二次 diff 同步路径已禁用。
    // edit_current_editor_document 的结果同步现在只保留 ChatPanel 单一路径。
    
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

    const renderKnowledgeAugmentation = (
        slices: KnowledgeInjectionSlice[] | undefined,
        decisionReason?: string | null,
        warnings?: { code: string; message: string }[],
        metadata?: {
            effectiveStrategy: string;
            rerankEnabled: boolean;
            verifiedOnlyApplied: boolean;
        } | null,
    ) => {
        const safeSlices = slices ?? [];
        const safeWarnings = warnings ?? [];
        if (safeSlices.length === 0 && safeWarnings.length === 0 && !decisionReason) {
            return null;
        }

        return (
            <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">知识补强</span>
                    {decisionReason && (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-sky-900/40">
                            decision={decisionReason}
                        </span>
                    )}
                    {metadata?.effectiveStrategy && (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-sky-900/40">
                            strategy={metadata.effectiveStrategy}
                        </span>
                    )}
                    {metadata?.rerankEnabled && (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-sky-900/40">
                            rerank
                        </span>
                    )}
                    {metadata?.verifiedOnlyApplied && (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-sky-900/40">
                            verified-only
                        </span>
                    )}
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-sky-900/40">
                        slices={safeSlices.length}
                    </span>
                </div>
                {safeSlices.length > 0 && (
                    <div className="mt-2 space-y-1">
                        {safeSlices.slice(0, 3).map((slice) => (
                            <div key={slice.sliceId} className="rounded-md bg-white/70 px-2 py-1 dark:bg-sky-900/30">
                                <div className="font-medium">{slice.title}</div>
                                <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-sky-700 dark:text-sky-200">
                                    <span>{slice.sourceRole === 'structure_reference' ? '结构参考' : '知识补强'}</span>
                                    <span>{slice.retrievalMode}</span>
                                    {slice.citation && <span>v{slice.citation.version}</span>}
                                    {slice.riskFlags.slice(0, 3).map((flag) => (
                                        <span key={flag} className="rounded-full bg-sky-100 px-1.5 py-0.5 dark:bg-sky-900/50">
                                            {flag}
                                        </span>
                                    ))}
                                </div>
                                {slice.sourceRole === 'structure_reference' && slice.structureMetadata?.sectionOutlineSummary && (
                                    <div className="mt-1 text-[11px] text-sky-800 dark:text-sky-100">
                                        {slice.structureMetadata.sectionOutlineSummary}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {safeWarnings.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {safeWarnings.map((warning) => (
                            <span
                                key={`${warning.code}:${warning.message}`}
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                title={warning.message}
                            >
                                {warning.code}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
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
                
                if (isAwaitingAuthorization(block.toolCall, currentWorkspace ?? undefined)) {
                    return (
                        <div key={block.id} className="mt-2">
                            <AuthorizationCard
                                request={block.authorization || buildAuthorizationRequest(block.toolCall)}
                                description={generateAuthorizationDescription(block.toolCall)}
                                onAuthorize={() => void resolveAuthorization(message.id, block.id, block.toolCall, 'confirm')}
                                onDeny={() => void resolveAuthorization(message.id, block.id, block.toolCall, 'deny')}
                            />
                        </div>
                    );
                }
                
                // 对话编辑：edit_current_editor_document（Phase 2a/3：diffStore + DiffCard）
                if (block.toolCall.name === 'edit_current_editor_document') {
                    const toolResult = block.toolCall.result;
                    if (!toolResult) {
                        return (
                            <div key={block.id} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                文档编辑数据不完整，无法显示预览。
                            </div>
                        );
                    }

                    let resultData: any = {};
                    if (toolResult.data !== undefined && toolResult.data !== null) {
                        resultData = typeof toolResult.data === 'string'
                            ? (() => { try { return JSON.parse(toolResult.data); } catch { return {}; } })()
                            : toolResult.data;
                    } else if (toolResult.diff_area_id || toolResult.old_content || toolResult.oldContent || toolResult.new_content || toolResult.newContent) {
                        resultData = toolResult;
                    } else if (toolResult.data === null) {
                        return (
                            <div key={block.id} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                文档编辑数据为空。{toolResult.error && <span className="mt-2 block text-xs">错误: {toolResult.error}</span>}
                            </div>
                        );
                    } else {
                        resultData = toolResult as any;
                    }

                    if (resultData.new_content === undefined && resultData.newContent === undefined) {
                        return (
                            <div key={block.id} className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                文档编辑数据不完整，缺少 new_content。
                            </div>
                        );
                    }

                    // Phase 2a/3：有 blockId 格式 diffs 时用 DiffCard 精准替换（P3：按 file_path 解析 tab）
                    const diffTab =
                        resolveEditorTabForEditResultWithRequestContext(resultData.file_path, tabId) ?? getActiveTab();
                    const toolCallId = block.toolCall?.id;
                    const displayDiffs =
                        diffTab && toolCallId
                            ? useDiffStore.getState().getDisplayDiffs(diffTab.filePath, toolCallId)
                            : [];

                    // 后端返回了 blockId 格式（diff_area_id + diffs），但 displayDiffs 可能为空：1) 首次渲染尚未 sync；2) 已全部接受
                    const hasBlockIdFormat = !!(resultData.diff_area_id && Array.isArray(resultData.diffs) && resultData.diffs.length > 0);

                    if (displayDiffs.length > 0 && diffTab?.editor) {
                        const diffStore = useDiffStore.getState();
                        const workspacePath = currentWorkspace ?? null;
                        const tabRev = diffTab.documentRevision ?? 1;
                        return (
                            <div key={block.id} className="mt-2 w-full space-y-2">
                                {displayDiffs.map((entry) => {
                                    const doc = diffTab.editor!.state.doc;
                                    const entryBrOpts = {
                                        occurrenceIndex: entry.occurrenceIndex,
                                        originalTextFallback: entry.originalText,
                                    };
                                    const range =
                                        entry.mappedFrom != null && entry.mappedTo != null
                                            ? { from: entry.mappedFrom, to: entry.mappedTo }
                                            : entry.status === 'accepted' && entry.acceptedFrom != null && entry.acceptedTo != null
                                              ? { from: entry.acceptedFrom, to: entry.acceptedTo }
                                              : blockRangeToPMRange(
                                                    doc,
                                                    entry.startBlockId,
                                                    entry.startOffset,
                                                    entry.endBlockId,
                                                    entry.endOffset,
                                                    entryBrOpts
                                                );
                                    const lineStart = range ? positionToLine(doc, range.from) : undefined;
                                    const lineEnd = range ? positionToLine(doc, Math.max(range.from, range.to - 1)) : undefined;
                                    return (
                                    <DiffCard
                                        key={entry.diffId}
                                        diff={entry}
                                        chatTabId={tabId}
                                        filePath={diffTab.filePath}
                                        workspacePath={workspacePath}
                                        lineStart={lineStart}
                                        lineEnd={lineEnd}
                                        onLocate={range ? () => {
                                            const { tabs, setActiveTab } = useEditorStore.getState();
                                            const tab = tabs.find((t) => t.filePath === diffTab.filePath);
                                            if (tab) {
                                                setActiveTab(tab.id);
                                                if (tab.editor) {
                                                    try {
                                                        const { node } = tab.editor.view.domAtPos(Math.min(range.from, tab.editor.state.doc.content.size - 1));
                                                        const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
                                                        if (el && el instanceof HTMLElement) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }
                                                    } catch {
                                                        useEditorStore.getState().setPendingScrollTo(tab.id, range.from, range.to);
                                                    }
                                                } else {
                                                    useEditorStore.getState().setPendingScrollTo(tab.id, range.from, range.to);
                                                }
                                            } else {
                                                documentService.openFile(diffTab.filePath).then(() => {
                                                    const t = useEditorStore.getState().tabs.find((tb) => tb.filePath === diffTab.filePath);
                                                    if (t) useEditorStore.getState().setPendingScrollTo(t.id, range.from, range.to);
                                                });
                                            }
                                        } : undefined}
                                        onAccept={async () => {
                                            const editor = diffTab.editor;
                                            if (!editor) return;
                                            const result = await DiffActionService.acceptDiff(
                                                diffTab.filePath,
                                                entry.diffId,
                                                editor,
                                                {
                                                    tabDocumentRevision: tabRev,
                                                    chatTabId: tabId,
                                                    agentTaskId: entry.agentTaskId,
                                                },
                                            );
                                            if (!result.success && result.toastMessage) {
                                                toast.warning(result.toastMessage);
                                            }
                                        }}
                                        onReject={() => {
                                            DiffActionService.rejectDiff(diffTab.filePath, entry.diffId, {
                                                chatTabId: tabId,
                                                agentTaskId: entry.agentTaskId,
                                            });
                                            diffTab.editor?.view.dispatch(diffTab.editor.state.tr);
                                        }}
                                        onRetry={async () => {
                                            const editor = diffTab.editor;
                                            if (!editor) return;
                                            await DiffRetryController.retryDiff(
                                                entry.diffId,
                                                editor,
                                                {
                                                    tabDocumentRevision: tabRev,
                                                    chatTabId: tabId,
                                                    agentTaskId: entry.agentTaskId,
                                                },
                                            );
                                        }}
                                    />
                                )})}
                            </div>
                        );
                    }

                    // 有 blockId 格式但 displayDiffs 为空：已全部接受或 sync 尚未完成
                    // 不显示「无法精准定位」错误，改为成功态或保留全文替换兜底
                    if (hasBlockIdFormat) {
                        // 若该 tool call 存在已接受的 diffs，说明用户已接受，显示成功
                        const tabDiffs = diffTab ? useDiffStore.getState().byTab[diffTab.filePath]?.diffs : undefined;
                        const hasAcceptedDiffs = tabDiffs
                            ? [...tabDiffs.values()].some(
                                  (d) => d.status === 'accepted' && (toolCallId == null || d.toolCallId === toolCallId)
                              )
                            : false;
                        if (hasAcceptedDiffs) {
                            return (
                                <div key={block.id} className="mt-2 w-full p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                                    <p className="text-xs text-green-700 dark:text-green-300">
                                        修改已应用。如需撤销可编辑文档后手动恢复。
                                    </p>
                                </div>
                            );
                        }
                        // 旧的全文替换兜底已禁用，不再从聊天卡片直接覆盖文档。
                        return (
                            <div key={block.id} className="mt-2 w-full p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                    旧版全文替换兜底已禁用；仅保留规范 diff 卡渲染。
                                </p>
                            </div>
                        );
                    }

                    // 无 blockId 规范 diff：旧版全文替换兜底已禁用。
                    return (
                        <div key={block.id} className="mt-2 w-full p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                旧版全文替换兜底已禁用；当前只接受 blockId 规范 diff。
                            </p>
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
                if (!block.toolCall || isAwaitingAuthorization(block.toolCall, currentWorkspace ?? undefined)) {
                return (
                    <div key={block.id} className="mt-2">
                        <AuthorizationCard
                            request={block.authorization || (block.toolCall ? buildAuthorizationRequest(block.toolCall) : {
                                id: block.id,
                                type: 'file_system',
                                operation: 'unknown',
                                details: {},
                            })}
                            description={block.toolCall ? generateAuthorizationDescription(block.toolCall) : (block.content || '需要授权')}
                            onAuthorize={() => block.toolCall ? void resolveAuthorization(message.id, block.id, block.toolCall, 'confirm') : undefined}
                            onDeny={() => block.toolCall ? void resolveAuthorization(message.id, block.id, block.toolCall, 'deny') : undefined}
                        />
                    </div>
                );
                }
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
                            {message.role === 'assistant' &&
                                renderKnowledgeAugmentation(
                                    message.knowledgeInjectionSlices,
                                    message.knowledgeDecisionReason,
                                    message.knowledgeQueryWarnings,
                                    message.knowledgeQueryMetadata,
                                )}

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
                                                    
                                                    if (!toolResult || !toolResult.success) return false;
                                                    
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
                                                    
                                                    if (!diffAreaId || !Array.isArray(diffs) || diffs.length === 0) return false;
                                                    
                                                    if (diffAreaId && seenDiffAreaIds.has(diffAreaId)) return false;
                                                    
                                                    if (diffAreaId) {
                                                        seenDiffAreaIds.add(diffAreaId);
                                                    }
                                                }
                                                
                                                // 对于其他工具调用，使用 toolCall.id 去重
                                                if ((block.type === 'tool' || block.type === 'authorization') && block.toolCall?.id) {
                                                    if (seenToolCallIds.has(block.toolCall.id)) return false;
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
                                /* 兼容旧格式：如果没有 contentBlocks，使用旧方式渲染。用户消息优先用 displayNodes（引用以标签形式） */
                                <div className={`break-words ${(message.displayContent ?? message.content)?.includes('❌ AI 功能未配置') ? 'text-red-600 dark:text-red-400' : ''}`}>
                                    {message.isLoading ? (
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                        </div>
                                    ) : message.role === 'user' && message.displayNodes && message.displayNodes.length > 0 ? (
                                        <span className="whitespace-pre-wrap">
                                            {message.displayNodes.map((node, i) =>
                                                node.type === 'text' ? (
                                                    <React.Fragment key={i}>{node.content}</React.Fragment>
                                                ) : (
                                                    <span key={i} className="message-ref-tag" title={node.displayText}>
                                                        <span className="ref-label">@{node.displayText}</span>
                                                    </span>
                                                )
                                            )}
                                        </span>
                                    ) : (
                                        (message.role === 'user' && message.displayContent != null ? message.displayContent : message.content) || null
                                    )}
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
                                            chatTabId={tabId}
                                            messageId={message.id}
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
