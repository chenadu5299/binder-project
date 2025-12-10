import React, { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLayoutStore } from '../../stores/layoutStore';
import { useChatStore } from '../../stores/chatStore';
import { ChatTabs } from './ChatTabs';
import { ChatMessages } from './ChatMessages';
import { InlineChatInput } from './InlineChatInput';
import { ModelSelector } from './ModelSelector';
import MemoryTab from '../Memory/MemoryTab';
import SearchPanel from '../Search/SearchPanel';
import { PlusIcon, BookOpenIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { parseToolCalls, removeToolCalls } from '../../utils/toolCallParser';
import { ToolCall } from '../../types/tool';
import { aggressiveJSONRepair } from '../../utils/jsonRepair';

type TabType = 'chat' | 'memory' | 'search';

interface ChatPanelProps {
    isFullscreen?: boolean; // 是否为全屏模式（无工作区时）
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isFullscreen = false }) => {
    const { chat, setChatVisible } = useLayoutStore();
    const { tabs, activeTabId, createTab, setActiveTab } = useChatStore();
    const [activeSubTab, setActiveSubTab] = useState<TabType>('chat');
    // 待创建标签页的模式（用于没有标签页时的模式选择）
    const [pendingMode, setPendingMode] = useState<'agent' | 'chat'>('agent');
    
    // ⚠️ 关键修复：前端重复内容检测（二次防护）
    // 用于跟踪每个 tab 的累积文本，防止重复追加
    // 按照文档实现：前端累积文本用于二次去重防护
    const accumulatedTextRef = useRef<Map<string, string>>(new Map());

    // 暴露切换标签页的方法给外部使用（用于跳转功能）
    useEffect(() => {
        (window as any).switchToMemoryTab = () => {
            setActiveSubTab('memory');
        };
        return () => {
            delete (window as any).switchToMemoryTab;
        };
    }, []);

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
                        error?: string;
                        tool_call?: {
                            id: string;
                            name: string;
                            arguments: string | object;
                            status?: 'pending' | 'executing' | 'completed' | 'failed';
                            result?: any;
                            error?: string;
                        };
                    };
                    
                    // 关键修复：过滤空 chunk，避免处理空事件
                    const chunk = (payload.chunk || '').toString();
                    const isEmptyChunk = !payload.tool_call && chunk.length === 0 && !payload.done && !payload.error;
                    
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
                    
                    const { tabs, appendToMessage, updateMessage, setMessageLoading, addToolCall, updateToolCall } = useChatStore.getState();
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
                    
                    if (payload.error) {
                        // 错误处理
                        console.error('❌ 聊天流式响应错误:', payload.error);
                        if (lastMessage) {
                            updateMessage(payload.tab_id, lastMessage.id, 
                                lastMessage.content + '\n\n[错误: ' + payload.error + ']');
                            setMessageLoading(payload.tab_id, lastMessage.id, false);
                        }
                        return;
                    }
                    
                    if (payload.done) {
                        // 完成
                        console.log('✅ 聊天流式响应完成');
                        if (lastMessage) {
                            setMessageLoading(payload.tab_id, lastMessage.id, false);
                            
                            // 按照文档：流式响应完成，同步累积文本
                            const tabId = payload.tab_id;
                            const messageId = lastMessage.id;
                            const cacheKey = `${tabId}:${messageId}`;
                            const accumulated = accumulatedTextRef.current.get(cacheKey) || '';
                            if (accumulated && lastMessage.content !== accumulated) {
                                updateMessage(payload.tab_id, lastMessage.id, accumulated);
                            }
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
                                // 检查是否已存在该工具调用
                                const existingToolCall = lastMessage.toolCalls?.find(tc => tc.id === toolCallObj.id);
                                if (existingToolCall) {
                                    // 更新现有工具调用
                                    updateToolCall(payload.tab_id, lastMessage.id, toolCallObj.id, {
                                        arguments: parsedArguments,
                                        status: toolCallStatus,
                                        result: toolCall.result,
                                        error: toolCall.error,
                                    });
                                } else {
                                    // 添加新工具调用
                                    addToolCall(payload.tab_id, lastMessage.id, toolCallObj);
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
                                
                                // 如果有结果或错误，更新工具调用状态
                                if (toolCall.result) {
                                    updateToolCall(payload.tab_id, lastMessage.id, toolCallObj.id, {
                                        status: 'completed',
                                        result: toolCall.result,
                                    });
                                } else if (toolCall.error) {
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
                    if (!payload.tool_call && lastMessage && lastMessage.role === 'assistant' && lastMessage.isLoading !== false) {
                        // 关键修复：确保 chunk 不为空
                        if (!chunk || chunk.length === 0) {
                            return;
                        }
                        
                        // 按照文档实现：前端二次去重防护
                        const tabId = payload.tab_id;
                        const messageId = lastMessage.id;
                        const cacheKey = `${tabId}:${messageId}`;
                        const accumulated = accumulatedTextRef.current.get(cacheKey) || '';
                        
                        // 检查是否重复
                        if (accumulated.endsWith(chunk)) {
                            console.warn('⚠️ [前端] 检测到重复 chunk，跳过:', 
                                chunk.length > 50 ? chunk.substring(0, 50) + '...' : chunk);
                            return;
                        }
                        
                        // 更新累积文本
                        accumulatedTextRef.current.set(cacheKey, accumulated + chunk);
                        
                        // 检查是否包含工具调用（XML 格式）
                        const toolCalls = parseToolCalls(chunk);
                        if (toolCalls.length > 0) {
                            toolCalls.forEach(toolCall => {
                                addToolCall(payload.tab_id, lastMessage.id, toolCall);
                            });
                            const cleanChunk = removeToolCalls(chunk);
                            if (cleanChunk && cleanChunk.length > 0) {
                                appendToMessage(payload.tab_id, lastMessage.id, cleanChunk);
                            }
                        } else {
                            // 追加文本
                            appendToMessage(payload.tab_id, lastMessage.id, chunk);
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
        
        let unlistenFn: (() => void) | null = null;
        
        setupListener().then(unlisten => {
            unlistenFn = unlisten;
        });
        
        return () => {
            if (unlistenFn) {
                console.log('🔧 清理聊天事件监听');
                unlistenFn();
            }
            // 组件卸载，清理累积文本
            accumulatedTextRef.current.clear();
        };
    }, []); // 只在组件挂载时初始化一次
    
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
                    : 'w-96 border-l border-gray-200 dark:border-gray-700 flex-shrink-0' // 正常模式：固定宽度
            }`}
            style={{ 
                paddingRight: '2px', // 确保右侧内容不被遮挡
            }}
        >
            {/* 标题栏和标签切换 */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                {/* 标签切换栏 */}
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveSubTab('chat')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeSubTab === 'chat'
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        AI 聊天
                    </button>
                    <button
                        onClick={() => setActiveSubTab('memory')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeSubTab === 'memory'
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <BookOpenIcon className="w-4 h-4 inline-block mr-1" />
                        记忆库
                    </button>
                    <button
                        onClick={() => setActiveSubTab('search')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeSubTab === 'search'
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <MagnifyingGlassIcon className="w-4 h-4 inline-block mr-1" />
                        搜索
                    </button>
                </div>

                {/* 聊天标签栏（仅聊天模式显示） */}
                {activeSubTab === 'chat' && (
                    <div className="flex justify-between items-center p-3">
                        <h2 className="text-lg font-semibold">AI 聊天</h2>
                        <div className="flex items-center gap-2">
                            {activeTab && <ModelSelector tabId={activeTab.id} />}
                            <button
                                onClick={handleNewChat}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                title="新建对话"
                            >
                                <PlusIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleToggle}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                title="关闭面板"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {/* 内容区域 */}
            {activeSubTab === 'chat' && (
                <>
                    {/* 聊天标签栏 */}
                    {tabs.length > 0 && <ChatTabs />}
                    
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
                        {(activeTab ? activeTab.mode : pendingMode) === 'chat' && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                仅对话
                            </span>
                        )}
                    </div>
                    
                    {/* 消息区域 */}
                    {activeTab ? (
                        <>
                            {/* Agent 模式：移除独立编辑窗口，通过对话和工具调用来编辑 */}
                            <ChatMessages
                                messages={activeTab.messages}
                                onCopy={handleCopy}
                                tabId={activeTab.id}
                                onRegenerate={() => {
                                    const { regenerate } = useChatStore.getState();
                                    regenerate(activeTab.id);
                                }}
                                onDelete={(messageId) => {
                                    const { deleteMessage } = useChatStore.getState();
                                    deleteMessage(activeTab.id, messageId);
                                }}
                            />
                            {/* 使用内联引用输入框 */}
                            <InlineChatInput tabId={activeTab.id} />
                        </>
                    ) : (
                        <>
                            {/* 空状态：显示空消息区域和输入框 */}
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-gray-500 dark:text-gray-400">开始新的对话</p>
                            </div>
                            {/* 使用内联引用输入框 */}
                            <InlineChatInput 
                                tabId={null} 
                                pendingMode={pendingMode}
                                onCreateTab={(mode) => {
                                    const tabId = createTab(undefined, mode);
                                    setActiveTab(tabId);
                                }}
                            />
                        </>
                    )}
                </>
            )}
            
            {activeSubTab === 'memory' && (
                <MemoryTab />
            )}
            
            {activeSubTab === 'search' && (
                <SearchPanel />
            )}
        </div>
    );
};

export default ChatPanel;
