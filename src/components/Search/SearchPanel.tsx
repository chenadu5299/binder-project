import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { documentService } from '../../services/documentService';
import { toast } from '../Common/Toast';

interface SearchResult {
    path: string;
    title: string;
    snippet: string;
    rank: number;
}

const SearchPanel: React.FC = () => {
    const { currentWorkspace } = useFileStore();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = useCallback(async () => {
        if (!query.trim() || !currentWorkspace) return;

        setIsSearching(true);
        setHasSearched(true);

        try {
            const searchResults = await invoke<SearchResult[]>('search_documents', {
                query: query.trim(),
                limit: 50,
                workspacePath: currentWorkspace,
            });

            setResults(searchResults);
        } catch (error) {
            console.error('搜索失败:', error);
            toast.error(`搜索失败: ${error instanceof Error ? error.message : String(error)}`);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [query, currentWorkspace]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSearch();
        }
        if (e.key === 'Escape') {
            setQuery('');
            setResults([]);
            setHasSearched(false);
        }
    };

    const handleResultClick = useCallback(async (result: SearchResult) => {
        if (!currentWorkspace) return;

            const fullPath = currentWorkspace + '/' + result.path;
        await documentService.openFile(fullPath);
    }, [currentWorkspace]);

    const handleClear = () => {
        setQuery('');
        setResults([]);
        setHasSearched(false);
    };

    if (!currentWorkspace) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                <p>请先选择工作区</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-800">
            {/* 搜索栏 */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="搜索文档内容... (Enter 搜索, Esc 清除)"
                            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     focus:outline-none focus:ring-2 focus:ring-blue-500
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        {query && (
                            <button
                                onClick={handleClear}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={isSearching || !query.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSearching ? '搜索中...' : '搜索'}
                    </button>
                </div>
            </div>

            {/* 搜索结果 */}
            <div className="flex-1 overflow-y-auto p-4">
                {isSearching ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500 dark:text-gray-400">正在搜索...</p>
                        </div>
                    </div>
                ) : hasSearched ? (
                    results.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-500 dark:text-gray-400">未找到匹配的文档</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                找到 {results.length} 个结果
                            </div>
                            {results.map((result, index) => (
                                <div
                                    key={index}
                                    onClick={() => handleResultClick(result)}
                                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg 
                                             hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer 
                                             transition-colors"
                                >
                                    <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">
                                        {result.title}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        {result.path}
                                    </div>
                                    <div 
                                        className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2"
                                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                                    />
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-gray-500 dark:text-gray-400">
                            <MagnifyingGlassIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>输入关键词搜索文档内容</p>
                            <p className="text-xs mt-2">支持全文搜索，使用 FTS5 索引</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchPanel;

