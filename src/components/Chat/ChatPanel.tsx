import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLayoutStore } from '../../stores/layoutStore';
import { useChatStore } from '../../stores/chatStore';
import { ChatTabs } from './ChatTabs';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ModelSelector } from './ModelSelector';
import MemoryTab from '../Memory/MemoryTab';
import SearchPanel from '../Search/SearchPanel';
import { PlusIcon, BookOpenIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

type TabType = 'chat' | 'memory' | 'search';

const ChatPanel: React.FC = () => {
    const { chat, setChatVisible } = useLayoutStore();
    const { tabs, activeTabId, createTab, setActiveTab } = useChatStore();
    const [activeSubTab, setActiveSubTab] = useState<TabType>('chat');

    // 如果没有标签页，创建一个默认标签页
    useEffect(() => {
        if (tabs.length === 0 && chat.visible) {
            createTab();
        }
    }, [tabs.length, chat.visible, createTab]);

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
                    };
                    
                    console.log('📨 收到聊天流式响应:', { 
                        tab_id: payload.tab_id, 
                        chunk_length: payload.chunk.length,
                        done: payload.done,
                        has_error: !!payload.error 
                    });
                    
                    const { tabs, appendToMessage, updateMessage, setMessageLoading } = useChatStore.getState();
                    const tab = tabs.find(t => t.id === payload.tab_id);
                    if (!tab) {
                        console.warn('⚠️ 未找到对应的聊天标签页:', payload.tab_id);
                        return;
                    }
                    
                    const lastMessage = tab.messages[tab.messages.length - 1];
                    
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
                        }
                        return;
                    }
                    
                    // 追加内容
                    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isLoading !== false) {
                        appendToMessage(payload.tab_id, lastMessage.id, payload.chunk);
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
        };
    }, []); // 只在组件挂载时初始化一次

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
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 w-96 flex-shrink-0">
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
                    
                    {/* 消息区域 */}
                    {activeTab ? (
                        <>
                            <ChatMessages
                                messages={activeTab.messages}
                                onCopy={handleCopy}
                            />
                            <ChatInput tabId={activeTab.id} />
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-gray-500 dark:text-gray-400">创建新对话开始聊天</p>
                        </div>
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
