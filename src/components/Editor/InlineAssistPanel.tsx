import React, { useEffect, useRef } from 'react';
import { XMarkIcon, CheckIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { InlineAssistState, InlineAssistMessage } from '../../hooks/useInlineAssist';

interface InlineAssistPanelProps {
    state: InlineAssistState;
    onInstructionChange: (instruction: string) => void;
    onExecute: () => void;
    onClose: () => void;
    onApplyEdit: (messageId: string) => void;
}

export const InlineAssistPanel: React.FC<InlineAssistPanelProps> = ({
    state,
    onInstructionChange,
    onExecute,
    onClose,
    onApplyEdit,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        // 不自动聚焦输入框，避免编辑器失焦导致选区取消；选区保持可见，用户点击输入框即可输入
        // selectionRange 已存储，apply 时使用存储范围
    }, [state.phase, state.isVisible]);
    
    // 有 AI 回复时滚动到底部
    useEffect(() => {
        if (messagesEndRef.current && state.messages.some(m => m.role === 'assistant')) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [state.messages]);
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!state.isLoading && state.instruction.trim()) {
                onExecute();
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };
    
    // 渲染消息气泡
    const renderMessage = (message: InlineAssistMessage) => {
        const isUser = message.role === 'user';
        const isEdit = message.kind === 'edit';
        
        return (
            <div
                key={message.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
            >
                <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        isUser
                            ? 'bg-blue-500 text-white'
                            : isEdit
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                >
                    <div className="text-sm whitespace-pre-wrap break-words">
                        {message.text}
                    </div>
                    {isEdit && !isUser && (
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                onClick={() => onApplyEdit(message.id)}
                                disabled={message.applied}
                                className={`px-3 py-1.5 text-xs rounded flex items-center gap-1 ${
                                    message.applied
                                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                            >
                                <CheckIcon className="w-3 h-3" />
                                <span>{message.applied ? '已应用' : '应用'}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };
    
    // 统一布局：输入框固定在上方，内容区在下方（执行前后一致，输入框顶部稳定）
    const inputRow = (
        <div className="flex-shrink-0 flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
            <input
                ref={inputRef}
                type="text"
                value={state.instruction}
                onChange={(e) => onInstructionChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={state.phase === 'input-only' ? '输入指令，例如：改得更委婉、翻译成英文、总结要点...' : '继续输入指令...'}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                disabled={state.isLoading}
            />
            <button
                onClick={onExecute}
                disabled={state.isLoading || !state.instruction.trim()}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
                {state.isLoading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>处理中...</span>
                    </>
                ) : state.phase === 'input-only' ? (
                    <>
                        <CheckIcon className="w-4 h-4" />
                        <span>执行</span>
                    </>
                ) : (
                    <PaperAirplaneIcon className="w-4 h-4" />
                )}
            </button>
            <button
                onClick={onClose}
                title="关闭"
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
                <XMarkIcon className="w-4 h-4" />
            </button>
        </div>
    );

    // 内容区：选中文本 / AI 回复 / 加载中 / 错误（始终在输入框下方）
    const contentArea = (
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0" style={{ maxHeight: '280px' }}>
            {state.selectedText && (
                <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs text-gray-600 dark:text-gray-400 max-h-20 overflow-y-auto">
                    <div className="font-semibold mb-1">选中文本：</div>
                    <div className="whitespace-pre-wrap break-words">{state.selectedText}</div>
                </div>
            )}
            {state.phase === 'chat' && (() => {
                const latestAssistant = state.messages.filter(m => m.role === 'assistant').pop();
                if (latestAssistant) return renderMessage(latestAssistant);
                return null;
            })()}
            {state.isLoading && (
                <div className="flex justify-start mb-3">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            <span>思考中...</span>
                        </div>
                    </div>
                </div>
            )}
            {state.error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
                    {state.error}
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg min-w-[400px] max-w-[600px] flex flex-col" style={{ maxHeight: '400px' }}>
            {inputRow}
            {contentArea}
        </div>
    );
};

