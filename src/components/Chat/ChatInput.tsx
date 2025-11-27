import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '../../stores/chatStore';

interface ChatInputProps {
    tabId: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({ tabId }) => {
    const { sendMessage, regenerate, tabs } = useChatStore();
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tab = tabs.find(t => t.id === tabId);
    const hasMessages = tab && tab.messages.length > 0;
    const isStreaming = tab && tab.messages.some(m => m.isLoading);
    
    // 自动调整高度
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);
    
    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;
        
        const content = input.trim();
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        
        await sendMessage(tabId, content);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    
    const handleRegenerate = async () => {
        await regenerate(tabId);
    };
    
    return (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
            {hasMessages && !isStreaming && (
                <div className="mb-2 flex justify-end">
                    <button
                        onClick={handleRegenerate}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                    >
                        <ArrowPathIcon className="w-3 h-3" />
                        <span>重新生成</span>
                    </button>
                </div>
            )}
            
            <div className="flex items-end gap-2">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (Shift+Enter 换行)"
                    disabled={isStreaming}
                    rows={1}
                    className="
                        flex-1 resize-none px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-blue-500
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                        disabled:opacity-50 disabled:cursor-not-allowed
                        max-h-32 overflow-y-auto
                    "
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    className="
                        px-4 py-2 bg-blue-600 text-white rounded-lg
                        hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                        flex items-center gap-2 transition-colors
                    "
                >
                    <PaperAirplaneIcon className="w-5 h-5" />
                    <span>发送</span>
                </button>
            </div>
            
            {isStreaming && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>AI 正在思考...</span>
                </div>
            )}
        </div>
    );
};

