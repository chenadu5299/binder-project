import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon, PencilIcon } from '@heroicons/react/24/outline';
import { useFileStore } from '../../stores/fileStore';
import { invoke } from '@tauri-apps/api/core';
import { DocumentDiffView } from './DocumentDiffView';
import { FileSelector } from './FileSelector';

interface EditModeProps {
    tabId: string;
    filePath?: string;
    content?: string;
    onClose: () => void;
    onApply: (modifiedContent: string) => void;
    onFileSelect: (filePath: string, content: string) => void;
}

export const EditMode: React.FC<EditModeProps> = ({
    filePath,
    content,
    onClose,
    onApply,
    onFileSelect,
}) => {
    const { currentWorkspace } = useFileStore();
    const [editText, setEditText] = useState('');
    const [showDiff, setShowDiff] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [currentFile, setCurrentFile] = useState(filePath || '');
    const [currentContent, setCurrentContent] = useState(content || '');

    useEffect(() => {
        if (filePath && content) {
            setCurrentFile(filePath);
            setCurrentContent(content);
        }
    }, [filePath, content]);

    useEffect(() => {
        setEditText('');
    }, [currentFile, currentContent]);

    const handleFileSelect = (selectedPath: string, selectedContent: string) => {
        setCurrentFile(selectedPath);
        setCurrentContent(selectedContent);
        onFileSelect(selectedPath, selectedContent);
    };

    const handleApply = async () => {
        if (!currentWorkspace || !editText.trim() || !currentFile || !currentContent) return;

        setIsApplying(true);
        try {
            // 显示 Diff 预览
            setShowDiff(true);
        } catch (error) {
            console.error('应用修改失败:', error);
        } finally {
            setIsApplying(false);
        }
    };

    const handleConfirmDiff = async (_level: 'paragraph' | 'document' | 'all', _paragraphId?: string) => {
        if (!currentWorkspace || !currentFile || !currentContent) return;

        try {
            // 使用 AI 生成修改后的内容
            const result = await invoke<string>('ai_inline_assist', {
                instruction: editText,
                text: currentContent,
                context: `文件路径: ${currentFile}\n\n原文件内容:\n${currentContent}`,
            });

            // 应用修改
            await invoke('update_file', {
                workspacePath: currentWorkspace,
                filePath: currentFile,
                content: result,
            });

            onApply(result);
            setShowDiff(false);
            onClose();
        } catch (error) {
            console.error('应用修改失败:', error);
        }
    };

    const handleRejectDiff = () => {
        setShowDiff(false);
    };

    // 如果显示 Diff，使用 DocumentDiffView
    if (showDiff && editText.trim() && currentFile && currentContent) {
        // 使用 AI 生成预览内容（这里简化处理，实际应该调用 AI）
        // 为了演示，我们直接使用原始内容作为新内容（实际应该调用 AI 生成）
        const previewContent = currentContent; // 实际应该调用 AI 生成

        return (
            <DocumentDiffView
                oldContent={currentContent}
                newContent={previewContent}
                filePath={currentFile}
                onConfirm={handleConfirmDiff}
                onReject={handleRejectDiff}
            />
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
            {/* 头部 */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <PencilIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium">快速编辑</span>
                    {currentFile && (
                        <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                            {currentFile}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="关闭编辑模式"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* 文件选择器 */}
            {!currentFile && (
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <FileSelector onSelect={handleFileSelect} />
                </div>
            )}

            {/* 文件预览区 */}
            {currentFile && currentContent && (
                <div className="flex-1 overflow-y-auto p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400">文件预览（只读）</div>
                        <button
                            onClick={() => {
                                setCurrentFile('');
                                setCurrentContent('');
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            重新选择文件
                        </button>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                        <pre className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
                            {currentContent}
                        </pre>
                    </div>
                </div>
            )}

            {/* 快速编辑框 */}
            {currentFile && currentContent && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        输入修改建议（AI 将根据建议修改文件）
                    </div>
                    <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="例如：在第 10 行添加错误处理，将变量名改为 camelCase..."
                        rows={4}
                        className="
                            w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                            focus:outline-none focus:ring-2 focus:ring-blue-500
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                            resize-none
                        "
                    />
                    <div className="flex items-center justify-end gap-2 mt-3">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!editText.trim() || isApplying}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <CheckIcon className="w-4 h-4" />
                            <span>{isApplying ? '处理中...' : '应用修改'}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

