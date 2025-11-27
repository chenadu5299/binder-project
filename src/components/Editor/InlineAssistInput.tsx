import React, { useEffect, useRef } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';

interface InlineAssistInputProps {
    instruction: string;
    selectedText: string;
    onInstructionChange: (instruction: string) => void;
    onExecute: () => void;
    onClose: () => void;
    isLoading: boolean;
}

export const InlineAssistInput: React.FC<InlineAssistInputProps> = ({
    instruction,
    selectedText,
    onInstructionChange,
    onExecute,
    onClose,
    isLoading,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        // 自动聚焦输入框
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading && instruction.trim()) {
                onExecute();
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };
    
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-2 min-w-[400px] max-w-[600px]">
            <div className="flex items-center gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={instruction}
                    onChange={(e) => onInstructionChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入指令，例如：改得更委婉、翻译成英文、总结要点..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    disabled={isLoading}
                />
                <button
                    onClick={onExecute}
                    disabled={isLoading || !instruction.trim()}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>处理中...</span>
                        </>
                    ) : (
                        <>
                            <CheckIcon className="w-4 h-4" />
                            <span>执行</span>
                        </>
                    )}
                </button>
                <button
                    onClick={onClose}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
            {selectedText && (
                <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs text-gray-600 dark:text-gray-400 max-h-20 overflow-y-auto">
                    <div className="font-semibold mb-1">选中文本：</div>
                    <div className="truncate">{selectedText}</div>
                </div>
            )}
        </div>
    );
};

