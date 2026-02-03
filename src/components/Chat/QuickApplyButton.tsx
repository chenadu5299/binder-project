// 快捷应用到文档按钮组件（Chat 模式专用）

import React, { useState } from 'react';
import { 
    DocumentArrowDownIcon,
    ChevronDownIcon
} from '@heroicons/react/24/outline';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';
import { documentService } from '../../services/documentService';
import { DocumentDiffView } from './DocumentDiffView';

interface QuickApplyButtonProps {
    messageId: string;
    content: string;
    onApply?: (method: 'insert' | 'replace' | 'append' | 'create', content: string) => void;
    onPreview?: (content: string) => void;
}

export const QuickApplyButton: React.FC<QuickApplyButtonProps> = ({
    messageId,
    content,
    onApply,
    onPreview
}) => {
    const { getActiveTab } = useEditorStore();
    const { currentWorkspace } = useFileStore();
    const [showMenu, setShowMenu] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState<'insert' | 'replace' | 'append' | 'create' | null>(null);
    const [oldContent, setOldContent] = useState<string | null>(null);

    const activeTab = getActiveTab();
    const hasActiveTab = !!activeTab;

    const handleMethodSelect = async (method: 'insert' | 'replace' | 'append' | 'create') => {
        setSelectedMethod(method);
        setShowMenu(false);

        // 如果是替换或插入，需要获取当前内容用于 Diff 预览
        if ((method === 'replace' || method === 'insert') && activeTab) {
            setOldContent(activeTab.content);
            setShowDiff(true);
        } else if (method === 'append' && activeTab) {
            setOldContent(activeTab.content);
            setShowDiff(true);
        } else {
            // 创建新文件，直接应用
            handleApply(method, content);
        }
    };

    const handleApply = async (method: 'insert' | 'replace' | 'append' | 'create', newContent: string) => {
        try {
            if (method === 'create') {
                // 创建新文件
                if (!currentWorkspace) {
                    console.error('无法创建文件：未设置工作区');
                    return;
                }
                // 这里需要用户输入文件名，暂时使用默认名称
                const fileName = `新文档_${Date.now()}.md`;
                const filePath = `${currentWorkspace}/${fileName}`;
                await documentService.createFile(filePath, newContent);
                await documentService.openFile(filePath);
            } else if (activeTab) {
                // 应用到当前编辑器
                let finalContent = '';
                if (method === 'insert') {
                    // 插入到光标位置
                    finalContent = activeTab.content + '\n\n' + newContent;
                } else if (method === 'replace') {
                    // 替换选中文本（如果有）或整个文档
                    finalContent = newContent;
                } else if (method === 'append') {
                    // 追加到文档末尾
                    finalContent = activeTab.content + '\n\n' + newContent;
                }

                // 通过事件通知编辑器更新
                const { emit } = await import('@tauri-apps/api/event');
                await emit('editor-update-content', {
                    tabId: activeTab.id,
                    content: finalContent,
                });
            }

            if (onApply) {
                onApply(method, newContent);
            }

            setShowDiff(false);
            setOldContent(null);
        } catch (error) {
            console.error('应用到文档失败:', error);
        }
    };

    const handleConfirmDiff = async () => {
        if (selectedMethod && content) {
            await handleApply(selectedMethod, content);
        }
    };

    const handleRejectDiff = () => {
        setShowDiff(false);
        setOldContent(null);
        setSelectedMethod(null);
    };

    // 如果显示 Diff 预览
    if (showDiff && oldContent !== null && selectedMethod) {
        let newContent = '';
        if (selectedMethod === 'insert') {
            newContent = oldContent + '\n\n' + content;
        } else if (selectedMethod === 'replace') {
            newContent = content;
        } else if (selectedMethod === 'append') {
            newContent = oldContent + '\n\n' + content;
        }

        return (
            <DocumentDiffView
                oldContent={oldContent}
                newContent={newContent}
                filePath={activeTab?.filePath || '当前文档'}
                onConfirm={handleConfirmDiff}
                onReject={handleRejectDiff}
            />
        );
    }

    return (
        <div className="relative mt-3">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 
                           text-white rounded-lg text-sm font-medium transition-colors"
            >
                <DocumentArrowDownIcon className="w-4 h-4" />
                <span>应用到文档</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* 应用方式菜单 */}
            {showMenu && (
                <>
                    <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-gray-800 
                                    rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                        <div className="p-2 space-y-1">
                            {hasActiveTab ? (
                                <>
                                    <button
                                        onClick={() => handleMethodSelect('insert')}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 
                                                   hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    >
                                        插入到光标位置
                                    </button>
                                    <button
                                        onClick={() => handleMethodSelect('replace')}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 
                                                   hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    >
                                        替换选中文本
                                    </button>
                                    <button
                                        onClick={() => handleMethodSelect('append')}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 
                                                   hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    >
                                        追加到文档末尾
                                    </button>
                                </>
                            ) : null}
                            <button
                                onClick={() => handleMethodSelect('create')}
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 
                                           hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            >
                                {hasActiveTab ? '应用到工作区文档' : '创建新文档'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

