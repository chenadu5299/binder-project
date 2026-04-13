import React, { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLayoutStore } from '../../stores/layoutStore';
import { useChatStore } from '../../stores/chatStore';
import { ChatTabs } from './ChatTabs';
import { ChatMessages } from './ChatMessages';
import { InlineChatInput } from './InlineChatInput';
import { ChatBuildPanel } from './ChatBuildPanel';
import { DiffAllActionsBar } from './DiffAllActionsBar';
import { PlusIcon } from '@heroicons/react/24/outline';
import { parseToolCalls, removeToolCalls } from '../../utils/toolCallParser';
import { ToolCall, MessageContentBlock } from '../../types/tool';
import { aggressiveJSONRepair } from '../../utils/jsonRepair';
import { buildContentBlocks } from '../../utils/contentBlockBuilder';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { useDiffStore } from '../../stores/diffStore';
import { convertLegacyDiffsToEntriesWithFallback } from '../../utils/diffFormatAdapter';
import { resolveEditorTabForEditResultWithRequestContext, inferPositioningPath } from '../../utils/editToolTabResolve';
import { sha256HexUtf8, blockOrderSnapshotHashFromHtml } from '../../utils/contentSnapshotHash';
import { needsAuthorization } from '../../utils/toolDescription';
import { useAgentStore } from '../../stores/agentStore';
import type { KnowledgeInjectionSlice, KnowledgeQueryMetadata, KnowledgeQueryWarning } from '../../types/knowledge';
import {
    createPassedVerificationRecord,
    createPendingConfirmationRecord,
    createShadowStageState,
} from '../../types/agent_state';

function normalizeToolResultData(result: any): Record<string, any> {
    if (!result) return {};
    if (typeof result.data === 'object' && result.data !== null) return result.data;
    if (typeof result.data === 'string') {
        try {
            return JSON.parse(result.data);
        } catch {
            return {};
        }
    }
    return typeof result === 'object' && result !== null ? result : {};
}

function hasCandidatePayload(toolName: string, result: any): boolean {
    if (!result?.success) return false;
    const resultData = normalizeToolResultData(result);
    if (toolName === 'update_file') {
        return Array.isArray(resultData.pending_diffs) && resultData.pending_diffs.length > 0;
    }
    if (toolName === 'edit_current_editor_document') {
        return !!resultData.diff_area_id && Array.isArray(resultData.diffs) && resultData.diffs.length > 0;
    }
    return false;
}

/** 计算累积文本末尾与 chunk 开头的最大重叠长度，用于流式去重（避免「我我理解理解」式重复） */
function getOverlapLength(accumulated: string, chunk: string): number {
    const maxLen = Math.min(accumulated.length, chunk.length);
    for (let len = maxLen; len > 0; len--) {
        if (accumulated.slice(-len) === chunk.slice(0, len)) return len;
    }
    return 0;
}

interface ChatPanelProps {
    isFullscreen?: boolean; // 是否为全屏模式（无工作区时）
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isFullscreen = false }) => {
    const { chat, setChatVisible } = useLayoutStore();
    const { tabs, activeTabId, createTab, setActiveTab } = useChatStore();
    const { currentWorkspace } = useFileStore();
    // 待创建标签页的模式（用于没有标签页时的模式选择）
    const [pendingMode, setPendingMode] = useState<'agent' | 'chat'>('agent');
    
    // ⚠️ 关键修复：前端重复内容检测（二次防护）
    // 用于跟踪每个 tab 的累积文本，防止重复追加
    // 按照文档实现：前端累积文本用于二次去重防护
    const accumulatedTextRef = useRef<Map<string, string>>(new Map());
    
    // 内容块构建：跟踪每个消息的文本块和工具调用
    const textChunksRef = useRef<Map<string, Array<{ content: string; timestamp: number }>>>(new Map());
    const toolCallsRef = useRef<Map<string, ToolCall[]>>(new Map());

    // 移除自动创建标签页的逻辑，用户需要手动创建或通过输入触发创建

    // 如果没有活动标签页，设置第一个为活动标签页
    useEffect(() => {
        if (tabs.length > 0 && !activeTabId) {
            setActiveTab(tabs[0].id);
        }
    }, [tabs, activeTabId, setActiveTab]);

    // ⚠️ 关键修复：初始化聊天流式响应事件监听
    useEffect(() => {
        console.log('🔧 初始化聊天流式响应事件监听');
        
        const setupListener = async () => {
            try {
                const unlisten = await listen('ai-chat-stream', (event: any) => {
                    const payload = event.payload as {
                        tab_id: string;
                        chunk: string;
                        done: boolean;
                        /** 后端流状态机：cancelled 时不应再写入 assistant / 不提前构建 summary 块 */
                        stream_state?: 'streaming' | 'completed' | 'cancelled';
                        error?: string;
                        tool_call?: {
                            id: string;
                            name: string;
                            arguments: string | object;
                            status?: 'pending' | 'executing' | 'completed' | 'failed';
                            result?: any;
                            error?: string;
                        };
                        knowledge_retrieval?: {
                            triggered: boolean;
                            decision_reason?: string | null;
                            injection_slices?: KnowledgeInjectionSlice[];
                            warnings?: KnowledgeQueryWarning[];
                            metadata?: KnowledgeQueryMetadata | null;
                        };
                    };
                    
                    // 关键修复：过滤空 chunk，避免处理空事件
                    const chunk = (payload.chunk || '').toString();
                    const hasKnowledgePayload = !!payload.knowledge_retrieval;
                    const isEmptyChunk = !payload.tool_call && !hasKnowledgePayload && chunk.length === 0 && !payload.done && !payload.error;
                    
                    if (isEmptyChunk) {
                        // 跳过空 chunk，不记录日志，避免日志污染
                        return;
                    }
                    
                    // 如果只有 tool_call 但没有其他内容，也要检查 tool_call 是否有效
                    if (payload.tool_call && !payload.tool_call.id) {
                        // 无效的 tool_call，跳过
                        return;
                    }
                    
                    console.log('📨 收到聊天流式响应:', { 
                        tab_id: payload.tab_id, 
                        chunk_length: chunk.length,
                        done: payload.done,
                        has_error: !!payload.error,
                        has_tool_call: !!payload.tool_call
                    });
                    
                    const { tabs, appendToMessage, updateMessage, setMessageLoading, addToolCall, updateToolCall, addContentBlock, updateContentBlock, setKnowledgeAugmentation } = useChatStore.getState();
                    const tab = tabs.find(t => t.id === payload.tab_id);
                    if (!tab) {
                        // ⚠️ 关键修复：如果找不到 tab，可能是 tab 被删除了，或者 tab_id 不匹配
                        // 尝试查找所有 tab，看看是否有匹配的
                        const allTabIds = tabs.map(t => t.id);
                        console.warn('⚠️ 未找到对应的聊天标签页:', payload.tab_id, '当前所有 tab IDs:', allTabIds);
                        
                        // 如果没有任何 tab，可能是初始化问题，直接返回
                        if (tabs.length === 0) {
                            console.warn('⚠️ 没有任何标签页，跳过处理');
                            return;
                        }
                        
                        // 如果 tab_id 不匹配，可能是后端使用了错误的 tab_id
                        // 尝试使用当前活动的 tab（作为后备方案）
                        const activeTab = tabs.find(t => t.id === activeTabId);
                        if (activeTab && activeTab.messages.length > 0) {
                            console.warn('⚠️ 使用活动标签页作为后备:', activeTab.id);
                            // 不直接使用，因为可能导致消息混乱
                            // 直接返回，等待正确的 tab_id
                        }
                        return;
                    }
                    
                    const lastMessage = tab.messages[tab.messages.length - 1];
                    if (!lastMessage) {
                        console.warn('⚠️ 标签页没有消息:', payload.tab_id);
                        return;
                    }

                    if (payload.knowledge_retrieval) {
                        setKnowledgeAugmentation(payload.tab_id, lastMessage.id, {
                            slices: payload.knowledge_retrieval.injection_slices ?? [],
                            warnings: payload.knowledge_retrieval.warnings ?? [],
                            metadata: payload.knowledge_retrieval.metadata ?? null,
                            decisionReason: payload.knowledge_retrieval.decision_reason ?? null,
                        });
                    }
                    
                    // ⚠️ 关键修复：先检查 done，再检查 error
                    // 因为取消时会同时有 done: true 和 error
                    if (payload.done) {
                        const isCancelled =
                            payload.stream_state === 'cancelled' ||
                            (!!payload.error && payload.error.includes('取消'));
                        console.log('✅ 聊天流式响应完成', isCancelled ? '(已取消)' : '', {
                            stream_state: payload.stream_state,
                        });
                        if (lastMessage) {
                            // ⚠️ 关键修复：无论是否取消，都要更新 isLoading 状态
                            // 同时更新所有正在加载的消息（防止遗漏）
                            const { tabs: tabsForUpdate } = useChatStore.getState();
                            const tabForUpdate = tabsForUpdate.find(t => t.id === payload.tab_id);
                            if (tabForUpdate) {
                                // 更新所有正在加载的消息状态
                                tabForUpdate.messages.forEach(msg => {
                                    if (msg.isLoading) {
                                        setMessageLoading(payload.tab_id, msg.id, false);
                                    }
                                });
                            } else {
                                // 如果找不到 tab，至少更新最后一条消息
                                setMessageLoading(payload.tab_id, lastMessage.id, false);
                            }

                            const tabId = payload.tab_id;
                            const messageId = lastMessage.id;
                            const cacheKey = `${tabId}:${messageId}`;

                            // 取消：仅标记 [已取消]，不把累积文本写入 assistant，不构建 summary 内容块
                            if (isCancelled) {
                                if (lastMessage.content && !lastMessage.content.includes('[已取消]')) {
                                    updateMessage(
                                        payload.tab_id,
                                        lastMessage.id,
                                        lastMessage.content + '\n\n[已取消]'
                                    );
                                }
                                setTimeout(() => {
                                    textChunksRef.current.delete(cacheKey);
                                    toolCallsRef.current.delete(cacheKey);
                                    accumulatedTextRef.current.delete(cacheKey);
                                }, 1000);
                                return;
                            }

                            // 按照文档：流式响应完成，同步累积文本
                            const accumulated = accumulatedTextRef.current.get(cacheKey) || '';
                            if (accumulated && lastMessage.content !== accumulated) {
                                updateMessage(payload.tab_id, lastMessage.id, accumulated);
                            }

                            // 检查并补充缺失的内容块
                            const { tabs: currentTabs } = useChatStore.getState();
                            const currentTab = currentTabs.find(t => t.id === tabId);
                            const currentMessage = currentTab?.messages.find(m => m.id === messageId);

                            if (currentMessage) {
                                if (currentMessage.contentBlocks && currentMessage.contentBlocks.length > 0) {
                                    const hasTextBlock = currentMessage.contentBlocks.some(b => b.type === 'text');
                                    if (!hasTextBlock && accumulated) {
                                        const textBlock: MessageContentBlock = {
                                            id: `text-${currentMessage.timestamp}`,
                                            type: 'text',
                                            timestamp: currentMessage.timestamp,
                                            content: accumulated,
                                        };
                                        addContentBlock(tabId, messageId, textBlock);
                                    }
                                } else {
                                    const textChunks = textChunksRef.current.get(cacheKey) || [];
                                    const toolCalls = toolCallsRef.current.get(cacheKey) || [];

                                    if (textChunks.length > 0 || toolCalls.length > 0 || accumulated) {
                                        const finalTextChunks = [...textChunks];
                                        if (accumulated && textChunks.length === 0) {
                                            finalTextChunks.push({
                                                content: accumulated,
                                                timestamp: currentMessage.timestamp,
                                            });
                                        }

                                        const contentBlocks = buildContentBlocks(
                                            finalTextChunks,
                                            toolCalls,
                                            currentWorkspace || undefined
                                        );

                                        contentBlocks.forEach(block => {
                                            addContentBlock(tabId, messageId, block);
                                        });
                                    }
                                }
                            }

                            setTimeout(() => {
                                textChunksRef.current.delete(cacheKey);
                                toolCallsRef.current.delete(cacheKey);
                                accumulatedTextRef.current.delete(cacheKey);
                            }, 1000);
                        }
                        return;
                    }

                    // ⚠️ 关键修复：处理仅有 error 但没有 done 的情况（例如后端连接中断/超时）
                    if (payload.error && !payload.done) {
                        console.warn('⚠️ 聊天流式响应出现错误（未收到 done）:', payload.error);

                        // 将当前标签页下所有正在加载的消息置为非加载状态，避免按钮卡在“停止”
                        const { tabs: tabsForError } = useChatStore.getState();
                        const tabForError = tabsForError.find(t => t.id === payload.tab_id);
                        if (tabForError) {
                            tabForError.messages.forEach(msg => {
                                if (msg.isLoading) {
                                    setMessageLoading(payload.tab_id, msg.id, false);
                                }
                            });
                        } else {
                            // 找不到 tab 时，至少更新最后一条消息
                            setMessageLoading(payload.tab_id, lastMessage.id, false);
                        }

                        // 附加错误提示（避免重复追加）
                        if (lastMessage.content && !lastMessage.content.includes('[已取消]') && !lastMessage.content.includes('[错误]')) {
                            updateMessage(payload.tab_id, lastMessage.id, `${lastMessage.content}\n\n[错误] ${payload.error}`);
                        }

                        return;
                    }
                    
                    // 处理工具调用
                    if (payload.tool_call) {
                        const toolCall = payload.tool_call;
                        
                        // 如果 arguments 是空字符串，跳过（避免解析错误）
                        if (typeof toolCall.arguments === 'string' && toolCall.arguments.trim() === '') {
                            console.warn('⚠️ 工具调用 arguments 为空，跳过处理:', toolCall.id, toolCall.name);
                            return;
                        }
                        
                        try {
                            // 安全解析 arguments
                            let parsedArguments: any = toolCall.arguments;
                            if (typeof toolCall.arguments === 'string') {
                                const argsStr = toolCall.arguments.trim();
                                
                                // 只有在工具调用完成或失败时才尝试解析 JSON
                                // executing 状态时，arguments 可能不完整，不应该解析
                                if (toolCall.status === 'completed' || toolCall.status === 'failed' || toolCall.result || toolCall.error) {
                                    // 尝试解析 JSON
                                    try {
                                        parsedArguments = JSON.parse(argsStr);
                                    } catch (e) {
                                        console.warn('工具调用 arguments JSON 解析失败，使用增强修复工具:', e, '原始:', argsStr);
                                        
                                        // 使用增强的 JSON 修复工具
                                        const repaired = aggressiveJSONRepair(argsStr);
                                        if (repaired) {
                                            parsedArguments = repaired;
                                            console.log('✅ JSON 修复成功:', parsedArguments);
                                        } else {
                                            console.error('❌ JSON 修复失败，使用空对象');
                                            parsedArguments = {};
                                        }
                                    }
                                } else {
                                    // 工具调用进行中（pending 或 executing），arguments 可能不完整，暂时使用空对象
                                    parsedArguments = {};
                                }
                            }
                            
                            // 确定工具调用状态
                            let toolCallStatus: 'pending' | 'executing' | 'completed' | 'failed' = 'pending';
                            if (toolCall.status) {
                                // 使用后端发送的 status
                                if (toolCall.status === 'completed' || toolCall.status === 'failed') {
                                    toolCallStatus = toolCall.status;
                                } else if (toolCall.status === 'executing') {
                                    toolCallStatus = 'executing';
                                } else {
                                    toolCallStatus = 'pending';
                                }
                            } else if (toolCall.result) {
                                toolCallStatus = 'completed';
                            } else if (toolCall.error) {
                                toolCallStatus = 'failed';
                            }
                            
                            const toolCallObj: ToolCall = {
                                id: toolCall.id || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                name: toolCall.name,
                                arguments: parsedArguments,
                                status: toolCallStatus,
                                agentTaskId: useAgentStore.getState().runtimesByTab[payload.tab_id]?.currentTask?.id,
                                timestamp: Date.now(),
                                result: toolCall.result,
                                error: toolCall.error,
                            };
                            
                            console.log('🔧 处理工具调用:', {
                                id: toolCallObj.id,
                                name: toolCallObj.name,
                                status: toolCallObj.status,
                                arguments: parsedArguments,
                                argumentsLength: typeof toolCall.arguments === 'string' ? toolCall.arguments.length : 'object',
                                hasResult: !!toolCall.result,
                                result: toolCall.result,
                                hasError: !!toolCall.error,
                                error: toolCall.error,
                            });
                            
                            // 添加工具调用到消息
                            if (lastMessage) {
                                const tabId = payload.tab_id;
                                const messageId = lastMessage.id;
                                const cacheKey = `${tabId}:${messageId}`;
                                
                                // 检查是否已存在该工具调用
                                const existingToolCall = lastMessage.toolCalls?.find(tc => tc.id === toolCallObj.id);
                                if (existingToolCall) {
                                    // 更新现有工具调用
                                    updateToolCall(tabId, messageId, toolCallObj.id, {
                                        arguments: parsedArguments,
                                        status: toolCallStatus,
                                        result: toolCall.result,
                                        error: toolCall.error,
                                    });
                                    
                                    // 更新工具调用引用
                                    const toolCalls = toolCallsRef.current.get(cacheKey) || [];
                                    const index = toolCalls.findIndex(tc => tc.id === toolCallObj.id);
                                    if (index >= 0) {
                                        toolCalls[index] = { ...toolCalls[index], ...toolCallObj };
                                    } else {
                                        toolCalls.push(toolCallObj);
                                    }
                                    toolCallsRef.current.set(cacheKey, toolCalls);
                                    
                                    // 更新内容块中的工具调用
                                    const { tabs: currentTabs } = useChatStore.getState();
                                    const currentTab = currentTabs.find(t => t.id === tabId);
                                    const currentMessage = currentTab?.messages.find(m => m.id === messageId);
                                    if (currentMessage?.contentBlocks) {
                                        const blockIndex = currentMessage.contentBlocks.findIndex(b => 
                                            (b.type === 'tool' || b.type === 'authorization') && b.toolCall?.id === toolCallObj.id
                                        );
                                        if (blockIndex >= 0) {
                                            updateContentBlock(tabId, messageId, currentMessage.contentBlocks[blockIndex].id, {
                                                toolCall: toolCallObj,
                                            });
                                        }
                                    }
                                } else {
                                    // 添加新工具调用
                                    addToolCall(tabId, messageId, toolCallObj);
                                    
                                    // 添加到工具调用引用
                                    const toolCalls = toolCallsRef.current.get(cacheKey) || [];
                                    toolCalls.push(toolCallObj);
                                    toolCallsRef.current.set(cacheKey, toolCalls);
                                    
                                    // 实时添加工具调用内容块
                                    const needsAuth = needsAuthorization(toolCallObj.name, toolCallObj.arguments, currentWorkspace || undefined);
                                    
                                    const contentBlock: MessageContentBlock = {
                                        id: toolCallObj.id,
                                        type: needsAuth ? 'authorization' : 'tool',
                                        timestamp: toolCallObj.timestamp,
                                        toolCall: toolCallObj,
                                        ...(needsAuth && {
                                            authorization: {
                                                id: toolCallObj.id,
                                                type: 'file_system', // 可以根据工具类型判断
                                                operation: toolCallObj.name,
                                                details: toolCallObj.arguments,
                                            },
                                        }),
                                    };
                                    addContentBlock(tabId, messageId, contentBlock);
                                }
                                
                                // 差异化确认逻辑：只有 edit_current_editor_document 需要确认
                                // 其他文件操作（create_file, delete_file, update_file 等）自动执行
                                const needsConfirmation = toolCallObj.name === 'edit_current_editor_document';
                                
                                if (!needsConfirmation && toolCallStatus === 'executing' && !toolCall.result && !toolCall.error) {
                                    // 自动执行不需要确认的工具
                                    console.log('🚀 自动执行工具调用（无需确认）:', toolCallObj.name);
                                    // 工具已经在后端执行，这里只是标记状态
                                    // 实际执行由后端完成，前端只需要等待结果
                                }
                                
                                // ⚠️ 关键修复：如果有结果或错误，更新工具调用状态
                                // 注意：updateToolCall 现在会同时更新 toolCalls 和 contentBlocks
                                if (toolCall.result) {
                                    console.log('✅ [前端] 更新工具调用结果:', {
                                        toolCallId: toolCallObj.id,
                                        hasResult: !!toolCall.result,
                                        result: toolCall.result,
                                    });
                                    updateToolCall(payload.tab_id, lastMessage.id, toolCallObj.id, {
                                        status: 'completed',
                                        result: toolCall.result,
                                    });
                                    if (hasCandidatePayload(toolCallObj.name, toolCall.result)) {
                                        const agentStore = useAgentStore.getState();
                                        const runtime = agentStore.runtimesByTab[payload.tab_id];
                                        const taskId = runtime?.currentTask?.id ?? null;
                                        const currentStage = runtime?.stageState.stage;
                                        if (taskId && ['draft', 'structured', 'candidate_ready'].includes(currentStage ?? 'draft')) {
                                            agentStore.setStageState(
                                                payload.tab_id,
                                                createShadowStageState(taskId, 'candidate_ready', `${toolCallObj.name}:candidate_emitted`)
                                            );
                                            agentStore.setVerification(
                                                payload.tab_id,
                                                createPassedVerificationRecord(taskId, `${toolCallObj.name}:candidate_verified`)
                                            );
                                            agentStore.setConfirmation(
                                                payload.tab_id,
                                                createPendingConfirmationRecord(taskId, `${toolCallObj.name}:awaiting_review_render`)
                                            );
                                        }
                                    }
                                    // AI 通过 create_file/update_file 创建或更新文件时，立即记录元数据（便于从文件树打开时进入编辑模式）
                                    if (
                                        (toolCallObj.name === 'create_file' || toolCallObj.name === 'update_file') &&
                                        toolCall.result?.success &&
                                        currentWorkspace
                                    ) {
                                        const rawData = toolCall.result.data;
                                        let pathForRecord: string | undefined;
                                        if (typeof rawData === 'object' && rawData !== null && typeof rawData.path === 'string') {
                                            pathForRecord = rawData.path;
                                        } else if (typeof rawData === 'string') {
                                            try {
                                                pathForRecord = JSON.parse(rawData)?.path;
                                            } catch {
                                                pathForRecord = undefined;
                                            }
                                        }
                                        if (pathForRecord) {
                                            (async () => {
                                                try {
                                                    const { recordBinderFile } = await import('../../services/fileMetadataService');
                                                    const { normalizePath, normalizeWorkspacePath, getAbsolutePath } = await import('../../utils/pathUtils');
                                                    const normalizedPath = normalizePath(pathForRecord!);
                                                    const normalizedWorkspacePath = normalizeWorkspacePath(currentWorkspace);
                                                    const filePath = getAbsolutePath(normalizedPath, normalizedWorkspacePath);
                                                    await recordBinderFile(filePath, 'ai_generated', normalizedWorkspacePath, 3);
                                                } catch (e) {
                                                    console.warn('[ChatPanel] 记录 AI 文件元数据失败:', e);
                                                }
                                            })();
                                        }
                                    }
                                    // Phase 3：update_file 返回 pending_diffs 时写入 byFilePath
                                    if (
                                        toolCallObj.name === 'update_file' &&
                                        toolCall.result?.success &&
                                        currentWorkspace
                                    ) {
                                        const rawData = toolCall.result.data;
                                        const data = typeof rawData === 'object' && rawData !== null
                                            ? rawData
                                            : typeof rawData === 'string'
                                                ? (() => { try { return JSON.parse(rawData); } catch { return {}; } })()
                                                : {};
                                        const pendingDiffs = data.pending_diffs;
                                        const pathFromResult = data.path;
                                        if (Array.isArray(pendingDiffs) && pendingDiffs.length > 0 && pathFromResult) {
                                            (async () => {
                                                try {
                                                    const { normalizePath, normalizeWorkspacePath, getAbsolutePath } = await import('../../utils/pathUtils');
                                                    const normalizedPath = normalizePath(pathFromResult);
                                                    const normalizedWorkspacePath = normalizeWorkspacePath(currentWorkspace);
                                                    const filePath = getAbsolutePath(normalizedPath, normalizedWorkspacePath);
                                                    useDiffStore.getState().setFilePathDiffs(filePath, pendingDiffs, {
                                                        chatTabId: payload.tab_id,
                                                        sourceToolCallId: toolCallObj.id,
                                                        messageId: lastMessage.id,
                                                        agentTaskId: toolCallObj.agentTaskId,
                                                    });
                                                    const tab = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
                                                    if (tab?.editor?.state?.doc) {
                                                        useDiffStore.getState().resolveFilePathDiffs(filePath, tab.editor.state.doc);
                                                    }
                                                } catch (e) {
                                                    console.warn('[ChatPanel] 处理 update_file pending_diffs 失败:', e);
                                                }
                                            })();
                                        }
                                    }
                                    // 文档编辑工具：收到结果时同步到编辑器 store 与 diffStore（Phase 2a）
                                    if (toolCallObj.name === 'edit_current_editor_document' && toolCall.result?.success) {
                                        const resultData = typeof toolCall.result?.data === 'object' && toolCall.result?.data != null
                                            ? toolCall.result.data
                                            : typeof toolCall.result?.data === 'string'
                                                ? (() => { try { return JSON.parse(toolCall.result.data); } catch { return {}; } })()
                                                : toolCall.result;
                                        const diffAreaId = resultData.diff_area_id || '';
                                        const diffs = resultData.diffs || [];
                                        const oldContent = resultData.old_content ?? resultData.oldContent ?? '';
                                        const newContent = resultData.new_content ?? resultData.newContent ?? '';
                                        if (diffAreaId && Array.isArray(diffs) && diffs.length > 0 && oldContent !== undefined && newContent !== undefined) {
                                            const targetTab = resolveEditorTabForEditResultWithRequestContext(
                                                resultData.file_path,
                                                payload.tab_id
                                            );
                                            if (targetTab && toolCallObj.id) {
                                                const entries = convertLegacyDiffsToEntriesWithFallback(diffs, targetTab.editor ?? null);
                                                if (entries.length > 0) {
                                                    void (async () => {
                                                        const docRev =
                                                            typeof resultData.document_revision === 'number'
                                                                ? resultData.document_revision
                                                                : typeof resultData.documentRevision === 'number'
                                                                  ? resultData.documentRevision
                                                                  : undefined;
                                                        const curRev = targetTab.documentRevision ?? 1;
                                                        const contentSnapshotHash = await sha256HexUtf8(String(oldContent));
                                                        const blockOrderSnapshotHash = await blockOrderSnapshotHashFromHtml(String(oldContent));
                                                        useDiffStore.getState().setDiffsForToolCall(
                                                            targetTab.filePath,
                                                            toolCallObj.id,
                                                            entries,
                                                            oldContent,
                                                            payload.tab_id,
                                                            lastMessage.id,
                                                            {
                                                                sourceLabel: `助手消息 · ${toolCallObj.name}`,
                                                                agentTaskId: toolCallObj.agentTaskId,
                                                                documentRevision: docRev,
                                                                currentTabRevision: curRev,
                                                                positioningPath: inferPositioningPath(toolCallObj),
                                                                contentSnapshotHash,
                                                                blockOrderSnapshotHash,
                                                            }
                                                        );
                                                    })();
                                                }
                                            }
                                        }
                                    }
                                } else if (toolCall.error) {
                                    console.log('❌ [前端] 更新工具调用错误:', {
                                        toolCallId: toolCallObj.id,
                                        error: toolCall.error,
                                    });
                                    updateToolCall(payload.tab_id, lastMessage.id, toolCallObj.id, {
                                        status: 'failed',
                                        error: toolCall.error,
                                    });
                                }
                            }
                        } catch (e) {
                            console.error('处理工具调用失败:', e, toolCall);
                        }
                    }
                    
                    // 追加内容（只有在没有工具调用事件时才处理 chunk）
                    // ⚠️ 关键修复：检查消息是否仍在加载中，如果已经停止加载（用户点击了停止），不再追加内容
                    if (!payload.tool_call && lastMessage && lastMessage.role === 'assistant') {
                        // 重新获取最新状态，检查消息是否仍在加载
                        const { tabs: latestTabs } = useChatStore.getState();
                        const latestTab = latestTabs.find(t => t.id === payload.tab_id);
                        const latestMessage = latestTab?.messages.find(m => m.id === lastMessage.id);
                        
                        // 如果消息已经停止加载（用户点击了停止），不再追加内容
                        if (latestMessage && latestMessage.isLoading === false) {
                            console.log('⚠️ 消息已停止加载，跳过 chunk 处理');
                            return;
                        }
                        // 关键修复：确保 chunk 不为空
                        if (!chunk || chunk.length === 0) {
                            return;
                        }
                        
                        // 按照文档实现：前端二次去重防护
                        const tabId = payload.tab_id;
                        const messageId = lastMessage.id;
                        const cacheKey = `${tabId}:${messageId}`;
                        const accumulated = accumulatedTextRef.current.get(cacheKey) || '';
                        
                        // 检查是否重复（优化：只检查真正的重复，避免误判正常文本）
                        const chunkLength = chunk.length;
                        if (chunkLength > 0) {
                            // 检查1：chunk是否完全等于累积文本的末尾（这是真正的重复）
                            if (accumulated.endsWith(chunk)) {
                                // 只在开发环境显示警告，避免日志过多
                                if (process.env.NODE_ENV === 'development') {
                                    console.warn('⚠️ [前端] 检测到重复 chunk（完全重复），跳过:', 
                                        chunk.length > 50 ? chunk.substring(0, 50) + '...' : chunk);
                                }
                                return;
                            }
                            
                            // 检查2：对于短文本（<=3个字符），只检查是否在最后10个字符内重复出现
                            // 这样可以避免误判正常的标点符号或短词重复
                            if (chunkLength <= 3) {
                                const lastPart = accumulated.slice(-Math.min(10, accumulated.length));
                                // 如果短文本在最后部分出现了3次或更多，才认为是重复
                                const occurrences = (lastPart.match(new RegExp(chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                                if (occurrences >= 3) {
                                    if (process.env.NODE_ENV === 'development') {
                                        console.warn('⚠️ [前端] 检测到重复 chunk（短文本重复），跳过:', 
                                            chunk.length > 50 ? chunk.substring(0, 50) + '...' : chunk);
                                    }
                                    return;
                                }
                            } else {
                                // ⚠️ 关键修复：对于长文本，检查是否在最后部分重复出现（防止部分重复）
                                // 只检查最后 chunkLength * 3 的范围（从5改为3，更严格），避免误判
                                const checkLength = Math.min(chunkLength * 3, Math.max(20, accumulated.length * 0.1));
                                if (checkLength > 0) {
                                    const lastPart = accumulated.slice(-checkLength);
                                    // ⚠️ 关键修复：如果chunk在最后部分出现了2次或更多（从3改为2，更严格），才认为是重复
                                    const occurrences = (lastPart.match(new RegExp(chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                                    if (occurrences >= 2) {
                                        if (process.env.NODE_ENV === 'development') {
                                            console.warn('⚠️ [前端] 检测到重复 chunk（部分重复），跳过:', 
                                                chunk.length > 50 ? chunk.substring(0, 50) + '...' : chunk);
                                        }
                                        return;
                                    }
                                }
                            }
                            
                            // 移除检查3（历史重复检查），因为正常文本中词或短语重复出现是正常的
                            // 只保留完全重复和频繁重复的检查
                        }
                        
                        // 检查是否包含工具调用（XML 格式），确定「展示用文本」
                        const parsedToolCalls = parseToolCalls(chunk);
                        const displayText = parsedToolCalls.length > 0 ? removeToolCalls(chunk) : chunk;
                        // 重叠去重：若展示用文本开头与累积文本末尾重叠，只追加非重叠部分（解决「我我理解理解」式重复）
                        const overlapLen = getOverlapLength(accumulated, displayText);
                        const toAppend = overlapLen > 0 ? displayText.slice(overlapLen) : displayText;
                        const newAccumulated = accumulated + toAppend;
                        
                        accumulatedTextRef.current.set(cacheKey, newAccumulated);
                        if (toAppend.length === 0) return;
                        
                        if (parsedToolCalls.length > 0) {
                            parsedToolCalls.forEach(toolCall => {
                                addToolCall(payload.tab_id, lastMessage.id, toolCall);
                            });
                            appendToMessage(payload.tab_id, lastMessage.id, toAppend);
                            const textChunks = textChunksRef.current.get(cacheKey) || [];
                            const chunkTimestamp = Date.now();
                            textChunks.push({ content: toAppend, timestamp: chunkTimestamp });
                            textChunksRef.current.set(cacheKey, textChunks);
                            const { tabs: currentTabs } = useChatStore.getState();
                            const currentTab = currentTabs.find(t => t.id === payload.tab_id);
                            const currentMessage = currentTab?.messages.find(m => m.id === lastMessage.id);
                            if (currentMessage?.contentBlocks) {
                                const sortedBlocks = [...currentMessage.contentBlocks].sort((a, b) => a.timestamp - b.timestamp);
                                const lastTextBlock = [...sortedBlocks].reverse().find(b => b.type === 'text');
                                if (lastTextBlock) {
                                    const timeDiff = chunkTimestamp - lastTextBlock.timestamp;
                                    if (timeDiff < 1000) {
                                        updateContentBlock(payload.tab_id, lastMessage.id, lastTextBlock.id, {
                                            content: (lastTextBlock.content || '') + toAppend,
                                        });
                                    } else {
                                        const textBlock: MessageContentBlock = {
                                            id: `text-${chunkTimestamp}`,
                                            type: 'text',
                                            timestamp: chunkTimestamp,
                                            content: toAppend,
                                        };
                                        addContentBlock(payload.tab_id, lastMessage.id, textBlock);
                                    }
                                } else {
                                    const textBlock: MessageContentBlock = {
                                        id: `text-${chunkTimestamp}`,
                                        type: 'text',
                                        timestamp: chunkTimestamp,
                                        content: toAppend,
                                    };
                                    addContentBlock(payload.tab_id, lastMessage.id, textBlock);
                                }
                            } else {
                                const textBlock: MessageContentBlock = {
                                    id: `text-${chunkTimestamp}`,
                                    type: 'text',
                                    timestamp: chunkTimestamp,
                                    content: toAppend,
                                };
                                addContentBlock(payload.tab_id, lastMessage.id, textBlock);
                            }
                        } else {
                            appendToMessage(payload.tab_id, lastMessage.id, toAppend);
                            const textChunks = textChunksRef.current.get(cacheKey) || [];
                            const chunkTimestamp = Date.now();
                            textChunks.push({ content: toAppend, timestamp: chunkTimestamp });
                            textChunksRef.current.set(cacheKey, textChunks);
                            const { tabs: currentTabs } = useChatStore.getState();
                            const currentTab = currentTabs.find(t => t.id === payload.tab_id);
                            const currentMessage = currentTab?.messages.find(m => m.id === lastMessage.id);
                            if (currentMessage?.contentBlocks) {
                                const sortedBlocks = [...currentMessage.contentBlocks].sort((a, b) => a.timestamp - b.timestamp);
                                const lastTextBlock = [...sortedBlocks].reverse().find(b => b.type === 'text');
                                if (lastTextBlock) {
                                    const timeDiff = chunkTimestamp - lastTextBlock.timestamp;
                                    if (timeDiff < 1000) {
                                        updateContentBlock(payload.tab_id, lastMessage.id, lastTextBlock.id, {
                                            content: (lastTextBlock.content || '') + toAppend,
                                        });
                                    } else {
                                        const textBlock: MessageContentBlock = {
                                            id: `text-${chunkTimestamp}`,
                                            type: 'text',
                                            timestamp: chunkTimestamp,
                                            content: toAppend,
                                        };
                                        addContentBlock(payload.tab_id, lastMessage.id, textBlock);
                                    }
                                } else {
                                    const textBlock: MessageContentBlock = {
                                        id: `text-${chunkTimestamp}`,
                                        type: 'text',
                                        timestamp: chunkTimestamp,
                                        content: toAppend,
                                    };
                                    addContentBlock(payload.tab_id, lastMessage.id, textBlock);
                                }
                            } else {
                                const textBlock: MessageContentBlock = {
                                    id: `text-${chunkTimestamp}`,
                                    type: 'text',
                                    timestamp: chunkTimestamp,
                                    content: toAppend,
                                };
                                addContentBlock(payload.tab_id, lastMessage.id, textBlock);
                            }
                        }
                    }
                });
                
                // 返回清理函数
                return unlisten;
            } catch (error) {
                console.error('❌ 初始化聊天事件监听失败:', error);
                return () => {}; // 返回空的清理函数
            }
        };
        
        let cancelled = false;
        let unlistenFn: (() => void) | null = null;

        setupListener().then(unlisten => {
            if (cancelled) {
                // Strict Mode / HMR cleanup already ran before .then() resolved — immediately release
                unlisten?.();
            } else {
                unlistenFn = unlisten;
            }
        });

        return () => {
            cancelled = true;
            if (unlistenFn) {
                console.log('🔧 清理聊天事件监听');
                unlistenFn();
            }
            // 组件卸载，清理累积文本
            accumulatedTextRef.current.clear();
        };
    }, []); // 只在组件挂载时初始化一次

    // Phase 6: 监听后端 stage 变更事件，同步更新 agentStore shadow 状态
    useEffect(() => {
        let cancelled = false;
        let unlistenFn: (() => void) | null = null;

        listen('ai-agent-stage-changed', (event: any) => {
            const { tabId, taskId, stage, stageReason } = event.payload as {
                tabId: string;
                taskId: string;
                stage: string;
                stageReason?: string;
            };
            const agentStore = useAgentStore.getState();
            const runtime = agentStore.runtimesByTab[tabId];
            if (!runtime?.currentTask) return;
            // 只在 task ID 匹配时更新（避免跨任务污染）
            if (runtime.currentTask.id !== taskId && !taskId.startsWith('shadow-tab:')) return;
            agentStore.setStageState(tabId, {
                taskId: runtime.currentTask.id,
                stage: stage as any,
                updatedAt: Date.now(),
                stageReason: stageReason,
            });
        }).then(unlisten => {
            if (cancelled) {
                unlisten();
            } else {
                unlistenFn = unlisten;
            }
        });

        return () => {
            cancelled = true;
            unlistenFn?.();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let unlistenFn: (() => void) | null = null;

        listen('ai-workflow-execution-updated', (event: any) => {
            const { tabId, taskId, runtime } = event.payload as {
                tabId: string;
                taskId: string;
                runtime: any;
            };
            const agentStore = useAgentStore.getState();
            const currentRuntime = agentStore.runtimesByTab[tabId];
            if (!currentRuntime?.currentTask) return;
            if (currentRuntime.currentTask.id !== taskId && !taskId.startsWith('shadow-tab:')) {
                return;
            }
            agentStore.setWorkflowExecution(tabId, runtime);
        }).then(unlisten => {
            if (cancelled) {
                unlisten();
            } else {
                unlistenFn = unlisten;
            }
        });

        return () => {
            cancelled = true;
            unlistenFn?.();
        };
    }, []);

    // 按照文档：清理已完成消息的累积文本
    useEffect(() => {
        tabs.forEach(tab => {
            const assistantMessages = tab.messages.filter(m => m.role === 'assistant');
            assistantMessages.forEach((msg, idx) => {
                const cacheKey = `${tab.id}:${msg.id}`;
                if (msg.isLoading === false && idx < assistantMessages.length - 1) {
                    accumulatedTextRef.current.delete(cacheKey);
                }
            });
        });
    }, [tabs]);

    const handleToggle = () => {
        setChatVisible(!chat.visible);
    };

    const handleNewChat = () => {
        createTab();
    };

    const handleCopy = (messageId: string) => {
        if (!activeTabId) return;
        const tab = tabs.find(t => t.id === activeTabId);
        if (!tab) return;
        const message = tab.messages.find(m => m.id === messageId);
        if (!message) return;
        
        navigator.clipboard.writeText(message.content).catch(console.error);
    };

    // 如果窗口隐藏，不渲染任何内容（展开按钮在 MainLayout 中渲染）
    if (!chat.visible) {
        return null;
    }

    const activeTab = activeTabId ? tabs.find(t => t.id === activeTabId) : null;

    return (
        <div 
            className={`h-full flex flex-col bg-white dark:bg-gray-800 relative ${
                isFullscreen 
                    ? 'w-full' // 全屏模式：占据整个宽度
                    : 'w-full border-l border-gray-200 dark:border-gray-700 flex-shrink-0' // 正常模式：使用父容器宽度（由 MainLayout 控制）
            }`}
            style={{ 
                paddingRight: '2px', // 确保右侧内容不被遮挡
            }}
        >
            {/* 标签栏和功能按钮（合并到标题栏位置） */}
            <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center">
                    {/* 左侧：聊天标签区域（可滚动） */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        {tabs.length > 0 ? (
                            <ChatTabs />
                        ) : (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                暂无对话
                            </div>
                        )}
                    </div>
                    
                    {/* 右侧：功能按钮区域（固定宽度，不受标签影响） */}
                    <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <button
                            onClick={handleNewChat}
                            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="新建对话"
                        >
                            <PlusIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleToggle}
                            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="关闭面板"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            </div>
            
            {/* 内容区域 */}
            <>
                    
                    {/* 模式切换按钮（始终显示，未创建标签页时使用 pendingMode） */}
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">模式:</span>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                <button
                                    onClick={() => {
                                        if (activeTab) {
                                            const { setMode } = useChatStore.getState();
                                            setMode(activeTab.id, 'chat');
                                        } else {
                                            setPendingMode('chat');
                                        }
                                    }}
                                    disabled={activeTab ? activeTab.messages.length > 0 : false}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                        (activeTab ? activeTab.mode : pendingMode) === 'chat'
                                            ? 'bg-blue-500 text-white'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${
                                        (activeTab && activeTab.messages.length > 0)
                                            ? 'opacity-50 cursor-not-allowed'
                                            : 'cursor-pointer'
                                    }`}
                                    title={activeTab && activeTab.messages.length > 0 ? '聊天已开始，无法切换模式' : '切换为 Chat 模式（仅对话，不调用工具）'}
                                >
                                    Chat
                                </button>
                                <button
                                    onClick={() => {
                                        if (activeTab) {
                                            const { setMode } = useChatStore.getState();
                                            setMode(activeTab.id, 'agent');
                                        } else {
                                            setPendingMode('agent');
                                        }
                                    }}
                                    disabled={activeTab ? activeTab.messages.length > 0 : false}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                        (activeTab ? activeTab.mode : pendingMode) === 'agent'
                                            ? 'bg-blue-500 text-white'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${
                                        (activeTab && activeTab.messages.length > 0)
                                            ? 'opacity-50 cursor-not-allowed'
                                            : 'cursor-pointer'
                                    }`}
                                    title={activeTab && activeTab.messages.length > 0 ? '聊天已开始，无法切换模式' : '切换为 Agent 模式（可调用工具）'}
                                >
                                    Agent
                                </button>
                            </div>
                        </div>
                        {(activeTab ? activeTab.mode : pendingMode) === 'agent' && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                可以调用工具
                            </span>
                        )}
                        {/* 隐晦的工作状态提示：在标题栏显示小图标 */}
                        {activeTab && activeTab.messages.some(m => m.isLoading) && (
                            <div className="flex items-center gap-1.5 ml-auto">
                                <div className="relative w-1.5 h-1.5">
                                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-pulse"></div>
                                </div>
                            </div>
                        )}
                        {(activeTab ? activeTab.mode : pendingMode) === 'chat' && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                仅对话
                            </span>
                        )}
                    </div>
                    
                    {/* 消息区域 */}
                    {activeTab ? (
                        <>
                            <ChatBuildPanel tab={activeTab} />
                            {/* Agent 模式：移除独立编辑窗口，通过对话和工具调用来编辑 */}
                            <ChatMessages
                                messages={activeTab.messages}
                                onCopy={handleCopy}
                                tabId={activeTab.id}
                                mode={activeTab.mode}
                                onRegenerate={() => {
                                    const { regenerate } = useChatStore.getState();
                                    regenerate(activeTab.id);
                                }}
                                onDelete={(messageId) => {
                                    const { deleteMessage } = useChatStore.getState();
                                    deleteMessage(activeTab.id, messageId);
                                }}
                            />
                            {/* 问题3：全部接受/拒绝操作栏，紧贴输入框上方、吸底 */}
                            <DiffAllActionsBar />
                            {/* 使用内联引用输入框 */}
                            <InlineChatInput tabId={activeTab.id} />
                        </>
                    ) : (
                        <>
                            {/* 空状态：显示空消息区域和输入框 */}
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-gray-500 dark:text-gray-400">开始新的对话</p>
                            </div>
                            <DiffAllActionsBar />
                            <InlineChatInput 
                                tabId={null} 
                                pendingMode={pendingMode}
                                onCreateTab={(mode) => {
                                    const tabId = createTab(undefined, mode);
                                    setActiveTab(tabId);
                                    return tabId; // 返回 tabId，让 InlineChatInput 可以立即使用
                                }}
                            />
                        </>
                    )}
            </>
        </div>
    );
};

export default ChatPanel;
