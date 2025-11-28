import React, { useState } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DiffChange, calculateHybridDiff, mergeIntoParagraphs } from '../../utils/diffCalculator';
import { Change } from 'diff';

interface DocumentDiffViewProps {
    oldContent: string;
    newContent: string;
    filePath: string;
    onConfirm: (level: 'paragraph' | 'document' | 'all', paragraphId?: string) => void;
    onReject: () => void;
}

export const DocumentDiffView: React.FC<DocumentDiffViewProps> = ({
    oldContent,
    newContent,
    filePath,
    onConfirm,
    onReject,
}) => {
    const [confirmedParagraphs, setConfirmedParagraphs] = useState<Set<string>>(new Set());
    
    // 计算 Diff
    const changes = calculateHybridDiff(oldContent, newContent);
    const paragraphs = mergeIntoParagraphs(changes);
    
    // 渲染字符级变化
    const renderCharDiff = (charChanges: Change[] | undefined) => {
        if (!charChanges) return null;
        
        return charChanges.map((change, index) => {
            if (change.added) {
                return (
                    <span
                        key={index}
                        className="bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-100 px-0.5"
                    >
                        {change.value}
                    </span>
                );
            } else if (change.removed) {
                return (
                    <span
                        key={index}
                        className="bg-red-200 dark:bg-red-900/40 text-red-900 dark:text-red-100 px-0.5 line-through"
                    >
                        {change.value}
                    </span>
                );
            } else {
                return <span key={index}>{change.value}</span>;
            }
        });
    };
    
    // 渲染单个变化
    const renderChange = (change: DiffChange, index: number) => {
        return (
            <div key={index} className="mb-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    行 {change.line + 1}
                </div>
                {change.type === 'delete' && change.oldLines && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded">
                        <div className="text-sm font-mono whitespace-pre-wrap">
                            {change.charChanges ? renderCharDiff(change.charChanges) : change.oldLines.join('\n')}
                        </div>
                    </div>
                )}
                {change.type === 'insert' && change.newLines && (
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded">
                        <div className="text-sm font-mono whitespace-pre-wrap">
                            {change.charChanges ? renderCharDiff(change.charChanges) : change.newLines.join('\n')}
                        </div>
                    </div>
                )}
                {change.type === 'modify' && (
                    <div className="space-y-2">
                        {change.oldLines && (
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded">
                                <div className="text-xs text-red-600 dark:text-red-400 mb-1">删除：</div>
                                <div className="text-sm font-mono whitespace-pre-wrap">
                                    {change.charChanges ? renderCharDiff(change.charChanges.filter(c => c.removed)) : change.oldLines.join('\n')}
                                </div>
                            </div>
                        )}
                        {change.newLines && (
                            <div className="p-2 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded">
                                <div className="text-xs text-green-600 dark:text-green-400 mb-1">添加：</div>
                                <div className="text-sm font-mono whitespace-pre-wrap">
                                    {change.charChanges ? renderCharDiff(change.charChanges.filter(c => c.added)) : change.newLines.join('\n')}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };
    
    // 确认段落
    const handleConfirmParagraph = (paragraphId: string) => {
        setConfirmedParagraphs(prev => new Set(prev).add(paragraphId));
        onConfirm('paragraph', paragraphId);
    };
    
    const allParagraphsConfirmed = paragraphs.every(p => confirmedParagraphs.has(p.id));
    
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 min-w-[600px] max-w-[900px] max-h-[700px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-gray-800 pb-2 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <h3 className="text-lg font-semibold">文档修改预览</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{filePath}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onConfirm('all')}
                        disabled={allParagraphsConfirmed}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <CheckIcon className="w-4 h-4" />
                        <span>确认全部</span>
                    </button>
                    <button
                        onClick={() => onConfirm('document')}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                    >
                        <CheckIcon className="w-4 h-4" />
                        <span>确认文档</span>
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
            
            {paragraphs.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    没有变化
                </div>
            ) : (
                <div className="space-y-4">
                    {paragraphs.map((paragraph) => {
                        const isConfirmed = confirmedParagraphs.has(paragraph.id);
                        
                        return (
                            <div
                                key={paragraph.id}
                                className={`border rounded-lg p-4 ${
                                    isConfirmed
                                        ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600'
                                        : 'border-gray-200 dark:border-gray-700'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        段落 {paragraph.startLine + 1} - {paragraph.endLine + 1}
                                        {' '}
                                        ({paragraph.changes.length} 处变化)
                                    </div>
                                    {!isConfirmed && (
                                        <button
                                            onClick={() => handleConfirmParagraph(paragraph.id)}
                                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                                        >
                                            <CheckIcon className="w-3 h-3" />
                                            <span>确认段落</span>
                                        </button>
                                    )}
                                    {isConfirmed && (
                                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                            <CheckIcon className="w-3 h-3" />
                                            已确认
                                        </span>
                                    )}
                                </div>
                                
                                <div className="space-y-2">
                                    {paragraph.changes.map((change, index) => renderChange(change, index))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

