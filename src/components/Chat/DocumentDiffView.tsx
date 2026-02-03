import React, { useState } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DiffChange, calculateHybridDiff, mergeIntoParagraphs } from '../../utils/diffCalculator';
import { Change, diffChars } from 'diff';

// 定义 Diff 类型（与后端保持一致）
export interface Diff {
    diff_id: string;
    diff_area_id: string;
    diff_type: 'Edit' | 'Insertion' | 'Deletion';
    original_code: string;
    original_start_line: number;
    original_end_line: number;
    new_code: string;
    start_line: number;
    end_line: number;
    // ⚠️ 上下文信息：用于精确匹配定位
    context_before?: string | null; // 目标文本前面的上下文（50-100字符）
    context_after?: string | null;  // 目标文本后面的上下文（50-100字符）
    // ⚠️ 元素类型和标识符：用于表格、图片等复杂元素
    element_type?: 'text' | 'table' | 'image' | 'code_block' | string | null;
    element_identifier?: string | null; // 用于表格、图片等复杂元素
    // ⚠️ 前端添加的定位信息
    from?: number; // ProseMirror 位置
    to?: number;
    confidence?: number; // 匹配置信度
    strategy?: string; // 使用的匹配策略
}

interface DocumentDiffViewProps {
    diffAreaId?: string;  // 新增：diff area ID（可选，向后兼容）
    oldContent: string;
    newContent: string;
    filePath: string;
    diffs?: Diff[];  // 新增：后端计算的 diffs（可选，优先使用，向后兼容）
    onConfirm: (level: 'paragraph' | 'document' | 'all', paragraphId?: string) => void;
    onReject: () => void;
}

export const DocumentDiffView: React.FC<DocumentDiffViewProps> = ({
    diffAreaId: _diffAreaId, // MVP 阶段未使用，阶段二会使用
    oldContent,
    newContent,
    filePath,
    diffs,
    onConfirm,
    onReject,
}) => {
    const [confirmedParagraphs, setConfirmedParagraphs] = useState<Set<string>>(new Set());
    
    // 将后端 diffs 转换为前端格式
    const convertBackendDiffsToFrontend = (backendDiffs: Diff[]): DiffChange[] => {
        const changes: DiffChange[] = [];
        
        for (const diff of backendDiffs) {
            if (diff.diff_type === 'Deletion') {
                // 删除操作：直接显示要删除的内容
                // ⚠️ 修复：不要按 \n 分割，直接使用 original_code（可能包含 HTML 标签）
                if (diff.original_code.trim().length > 0) {
                    changes.push({
                        type: 'delete',
                        line: diff.original_start_line - 1, // 转换为0-based
                        oldLines: [diff.original_code], // 直接使用，不分割
                        newLines: [],
                        charChanges: undefined,
                    });
                }
            } else if (diff.diff_type === 'Insertion') {
                // 插入操作：直接显示要添加的内容
                // ⚠️ 修复：不要按 \n 分割，直接使用 new_code（可能包含 HTML 标签）
                if (diff.new_code.trim().length > 0) {
                    changes.push({
                        type: 'insert',
                        line: diff.start_line - 1, // 转换为0-based
                        oldLines: [],
                        newLines: [diff.new_code], // 直接使用，不分割
                        charChanges: undefined,
                    });
                }
            } else if (diff.diff_type === 'Edit') {
                // 编辑操作（替换）
                // ⚠️ 整篇替换：后端标记 replace_whole 时只显示「全文(X字)」，避免大段乱序/乱码
                if (diff.element_type === 'replace_whole') {
                    const oldLen = diff.original_code.length;
                    const newLen = diff.new_code.length;
                    changes.push({
                        type: 'modify',
                        line: 0,
                        oldLines: [`全文（${oldLen} 字）将被整体替换`],
                        newLines: [`全文（${newLen} 字）`],
                        charChanges: undefined,
                    });
                } else {
                    // 普通 Edit：若内容太长只显示前 500 字符
                    const maxDisplayLength = 500;
                    const oldDisplay = diff.original_code.length > maxDisplayLength
                        ? diff.original_code.substring(0, maxDisplayLength) + '...'
                        : diff.original_code;
                    const newDisplay = diff.new_code.length > maxDisplayLength
                        ? diff.new_code.substring(0, maxDisplayLength) + '...'
                        : diff.new_code;
                    const oldLines = diff.original_code.includes('\n')
                        ? oldDisplay.split('\n').filter(l => l.trim().length > 0 || diff.original_code.includes('\n'))
                        : [oldDisplay];
                    const newLines = diff.new_code.includes('\n')
                        ? newDisplay.split('\n').filter(l => l.trim().length > 0 || diff.new_code.includes('\n'))
                        : [newDisplay];
                    const maxLines = 20;
                    changes.push({
                        type: 'modify',
                        line: diff.original_start_line - 1,
                        oldLines: oldLines.slice(0, maxLines),
                        newLines: newLines.slice(0, maxLines),
                        charChanges: undefined,
                    });
                }
            }
        }
        
        return changes;
    };
    
    // 优先使用后端计算的 diffs，如果没有则前端计算（向后兼容）
    let changes: DiffChange[];
    let paragraphs: ReturnType<typeof mergeIntoParagraphs>;
    
    if (diffs && diffs.length > 0) {
        // 使用后端计算的 diffs
        console.log('[DocumentDiffView] 使用后端 diffs', { diffsCount: diffs.length, diffs });
        changes = convertBackendDiffsToFrontend(diffs);
        paragraphs = mergeIntoParagraphs(changes);
    } else {
        // 向后兼容：前端计算
        console.log('[DocumentDiffView] 使用前端计算 diffs');
        changes = calculateHybridDiff(oldContent, newContent);
        paragraphs = mergeIntoParagraphs(changes);
    }
    
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
    
    // 渲染单个变化（紧凑模式）
    const renderChange = (change: DiffChange, index: number) => {
        return (
            <div key={index} className="mb-1.5">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    行 {change.line + 1}
                </div>
                {change.type === 'delete' && change.oldLines && (
                    <div className="p-1.5 bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500 rounded text-xs">
                        <div className="text-xs font-mono whitespace-pre-wrap break-words">
                            {change.charChanges ? renderCharDiff(change.charChanges) : change.oldLines.join('\n')}
                        </div>
                    </div>
                )}
                {change.type === 'insert' && change.newLines && (
                    <div className="p-1.5 bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500 rounded text-xs">
                        <div className="text-xs font-mono whitespace-pre-wrap break-words">
                            {change.charChanges ? renderCharDiff(change.charChanges) : change.newLines.join('\n')}
                        </div>
                    </div>
                )}
                {change.type === 'modify' && (
                    <div className="space-y-1">
                        {change.oldLines && change.oldLines.length > 0 && (
                            <div className="p-1.5 bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500 rounded text-xs">
                                <div className="text-xs text-red-600 dark:text-red-400 mb-0.5">删除：</div>
                                <div className="text-xs font-mono whitespace-pre-wrap break-words">
                                    {change.charChanges && change.charChanges.length > 0 ? (
                                        // 使用字符级 diff 显示实际变化
                                        renderCharDiff(change.charChanges.filter(c => c.removed || (!c.added && !c.removed)))
                                    ) : (
                                        // 显示行级变化，但限制显示行数
                                        change.oldLines.slice(0, 20).join('\n') + 
                                        (change.oldLines.length > 20 ? `\n... (还有 ${change.oldLines.length - 20} 行)` : '')
                                    )}
                                </div>
                            </div>
                        )}
                        {change.newLines && change.newLines.length > 0 && (
                            <div className="p-1.5 bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500 rounded text-xs">
                                <div className="text-xs text-green-600 dark:text-green-400 mb-0.5">添加：</div>
                                <div className="text-xs font-mono whitespace-pre-wrap break-words">
                                    {change.charChanges && change.charChanges.length > 0 ? (
                                        // 使用字符级 diff 显示实际变化
                                        renderCharDiff(change.charChanges.filter(c => c.added || (!c.added && !c.removed)))
                                    ) : (
                                        // 显示行级变化，但限制显示行数
                                        change.newLines.slice(0, 20).join('\n') + 
                                        (change.newLines.length > 20 ? `\n... (还有 ${change.newLines.length - 20} 行)` : '')
                                    )}
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
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm p-3 w-full max-w-full max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-white dark:bg-gray-800 pb-2 border-b border-gray-200 dark:border-gray-700 z-10">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">文档修改预览</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{filePath}</p>
                </div>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    <button
                        onClick={() => onConfirm('all')}
                        disabled={allParagraphsConfirmed}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <CheckIcon className="w-3 h-3" />
                        <span>确认</span>
                    </button>
                    <button
                        onClick={onReject}
                        className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-1"
                    >
                        <XMarkIcon className="w-3 h-3" />
                        <span>拒绝</span>
                    </button>
                </div>
            </div>
            
            {paragraphs.length === 0 ? (
                <div className="p-3 text-center text-xs text-gray-500 dark:text-gray-400">
                    没有变化
                </div>
            ) : (
                <div className="space-y-2">
                    {paragraphs.map((paragraph) => {
                        const isConfirmed = confirmedParagraphs.has(paragraph.id);
                        
                        return (
                            <div
                                key={paragraph.id}
                                className={`border rounded p-2 ${
                                    isConfirmed
                                        ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600'
                                        : 'border-gray-200 dark:border-gray-700'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                        行 {paragraph.startLine + 1}-{paragraph.endLine + 1} ({paragraph.changes.length} 处变化)
                                    </div>
                                    {!isConfirmed && (
                                        <button
                                            onClick={() => handleConfirmParagraph(paragraph.id)}
                                            className="px-1.5 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-0.5"
                                        >
                                            <CheckIcon className="w-2.5 h-2.5" />
                                            <span>确认</span>
                                        </button>
                                    )}
                                    {isConfirmed && (
                                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                            <CheckIcon className="w-2.5 h-2.5" />
                                            已确认
                                        </span>
                                    )}
                                </div>
                                
                                <div className="space-y-1">
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

