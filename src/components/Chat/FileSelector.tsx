import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { useFileStore } from '../../stores/fileStore';
import { flattenFileTree, filterFiles } from '../../utils/fileTreeUtils';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';

interface FileSelectorProps {
    onSelect: (filePath: string, content: string) => void;
}

export const FileSelector: React.FC<FileSelectorProps> = ({ onSelect }) => {
    const { fileTree, currentWorkspace } = useFileStore();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    // 获取文件列表
    const getFileList = () => {
        if (!fileTree) return [];
        const flatTree = flattenFileTree(fileTree);
        return filterFiles(flatTree);
    };

    const allFiles = getFileList();

    // 使用 Fuse.js 进行模糊搜索
    const fuse = new Fuse(allFiles, {
        keys: ['name', 'path'],
        threshold: 0.4,
    });

    const searchResults = searchQuery.trim()
        ? fuse.search(searchQuery).map(result => result.item).slice(0, 10)
        : allFiles.slice(0, 20);

    // 处理文件选择
    const handleSelectFile = async (file: { name: string; path: string }) => {
        if (!currentWorkspace) return;

        try {
            const content = await invoke<string>('read_file_content', {
                workspacePath: currentWorkspace,
                filePath: file.path,
            });

            onSelect(file.path, content);
            setIsOpen(false);
            setSearchQuery('');
        } catch (error) {
            console.error('读取文件失败:', error);
        }
    };

    // 键盘导航
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (searchResults[selectedIndex]) {
                    handleSelectFile(searchResults[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, selectedIndex, searchResults]);

    // 重置选中索引当搜索结果变化时
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchQuery, searchResults.length]);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-600"
            >
                <span className="text-sm">选择文件</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
                        {/* 搜索框 */}
                        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索文件..."
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                            />
                        </div>

                        {/* 文件列表 */}
                        <div className="overflow-y-auto flex-1">
                            {searchResults.length === 0 ? (
                                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                    没有找到文件
                                </div>
                            ) : (
                                searchResults.map((file, index) => (
                                    <button
                                        key={file.path}
                                        onClick={() => handleSelectFile(file)}
                                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                                            index === selectedIndex
                                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                                : ''
                                        }`}
                                    >
                                        <DocumentIcon className="w-4 h-4 text-gray-400" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{file.name}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {file.path}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

