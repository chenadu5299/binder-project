import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DiffResult } from '../../hooks/useInlineAssist';

interface DiffViewProps {
    diff: DiffResult;
    onAccept: () => void;
    onReject: () => void;
}

export const DiffView: React.FC<DiffViewProps> = ({ diff, onAccept, onReject }) => {
    // 简单的 Diff 显示（可以后续优化为更详细的逐行对比）
    const hasChanges = diff.original !== diff.modified;
    
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 min-w-[500px] max-w-[800px] max-h-[600px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">预览修改</h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onAccept}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                    >
                        <CheckIcon className="w-4 h-4" />
                        <span>接受</span>
                    </button>
                    <button
                        onClick={onReject}
                        className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-1"
                    >
                        <XMarkIcon className="w-4 h-4" />
                        <span>拒绝</span>
                    </button>
                </div>
            </div>
            
            {hasChanges ? (
                <div className="space-y-4">
                    <div>
                        <div className="text-sm font-semibold mb-2 text-red-600 dark:text-red-400">删除（原文本）：</div>
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
                            {diff.original}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm font-semibold mb-2 text-green-600 dark:text-green-400">添加（新文本）：</div>
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm">
                            {diff.modified}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    没有变化
                </div>
            )}
        </div>
    );
};

