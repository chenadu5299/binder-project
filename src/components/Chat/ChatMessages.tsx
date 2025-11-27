import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../../stores/chatStore';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';

interface ChatMessagesProps {
    messages: ChatMessage[];
    onCopy?: (messageId: string) => void;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, onCopy }) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                                max-w-[80%] rounded-lg p-3
                                ${message.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                }
                            `}
                        >
                            <div className="whitespace-pre-wrap break-words">
                                {message.content || (message.isLoading ? (
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                ) : null)}
                            </div>
                            
                            {message.role === 'assistant' && message.content && (
                                <button
                                    onClick={() => onCopy?.(message.id)}
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
        </div>
    );
};

