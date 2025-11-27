import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { documentService } from '../../services/documentService';

interface Memory {
    id: string;
    document_path: string;
    entity_type: string;
    entity_name: string;
    content: string;
    metadata: any;
    source: string;
    confidence: number;
}

const MemoryTab: React.FC = () => {
    const { currentWorkspace } = useFileStore();
    const { activeTabId, tabs } = useEditorStore();
    const [memories, setMemories] = useState<Memory[]>([]);
    const [filteredMemories, setFilteredMemories] = useState<Memory[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newMemory, setNewMemory] = useState({
        entity_type: 'character',
        entity_name: '',
        content: '',
    });

    // 获取当前文档路径
    const currentDocumentPath = tabs.find(t => t.id === activeTabId)?.filePath || '';

    // 加载记忆
    const loadMemories = useCallback(async () => {
        if (!currentWorkspace) return;

        setIsLoading(true);
        try {
            const allMemories = await invoke<Memory[]>('get_all_memories', {
                workspacePath: currentWorkspace,
            });
            setMemories(allMemories);
            setFilteredMemories(allMemories);
        } catch (error) {
            console.error('加载记忆失败:', error);
        } finally {
            setIsLoading(false);
        }
    }, [currentWorkspace]);

    // 初始加载
    useEffect(() => {
        loadMemories();
    }, [loadMemories]);

    // 搜索过滤
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredMemories(memories);
            return;
        }

        const filtered = memories.filter(m => 
            m.entity_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.content.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setFilteredMemories(filtered);
    }, [searchQuery, memories]);

    // 添加记忆
    const handleAddMemory = useCallback(async () => {
        if (!currentWorkspace || !newMemory.entity_name.trim() || !newMemory.content.trim()) {
            return;
        }

        try {
            // 构造记忆对象（ID 会在后端生成）
            const memory = {
                id: '', // 后端会生成
                document_path: currentDocumentPath,
                entity_type: newMemory.entity_type,
                entity_name: newMemory.entity_name,
                content: newMemory.content,
                metadata: {},
                source: 'manual',
                confidence: 1.0,
            };

            await invoke('add_memory', {
                memory,
                workspacePath: currentWorkspace,
            });

            setShowAddDialog(false);
            setNewMemory({ entity_type: 'character', entity_name: '', content: '' });
            loadMemories();
        } catch (error) {
            console.error('添加记忆失败:', error);
            alert(`添加记忆失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [currentWorkspace, currentDocumentPath, newMemory, loadMemories]);

    // 删除记忆
    const handleDeleteMemory = useCallback(async (memoryId: string) => {
        if (!currentWorkspace || !confirm('确定要删除这条记忆吗？')) return;

        try {
            await invoke('delete_memory', {
                memoryId,
                workspacePath: currentWorkspace,
            });
            loadMemories();
        } catch (error) {
            console.error('删除记忆失败:', error);
            alert(`删除记忆失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [currentWorkspace, loadMemories]);

    // 打开文档
    const handleOpenDocument = useCallback(async (documentPath: string) => {
        if (!currentWorkspace) return;
        const fullPath = currentWorkspace + '/' + documentPath;
        await documentService.openFile(fullPath);
    }, [currentWorkspace]);

    const getEntityTypeLabel = (type: string) => {
        const labels: { [key: string]: string } = {
            'character': '人物',
            'event': '事件',
            'location': '地点',
            'concept': '概念',
            'relationship': '关系',
        };
        return labels[type] || type;
    };

    const getEntityTypeColor = (type: string) => {
        const colors: { [key: string]: string } = {
            'character': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            'event': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            'location': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
            'concept': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
            'relationship': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
        };
        return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
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
            {/* 标题栏 */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">记忆库</h3>
                    <button
                        onClick={() => setShowAddDialog(true)}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 
                                 flex items-center gap-1"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>添加记忆</span>
                    </button>
                </div>

                {/* 搜索栏 */}
                <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索记忆..."
                        className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                                 focus:outline-none focus:ring-2 focus:ring-blue-500
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* 记忆列表 */}
            <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500 dark:text-gray-400">加载中...</p>
                        </div>
                    </div>
                ) : filteredMemories.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500 dark:text-gray-400">
                            {searchQuery ? '未找到匹配的记忆' : '暂无记忆，点击"添加记忆"创建第一条记忆'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredMemories.map((memory) => (
                            <div
                                key={memory.id}
                                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg 
                                         hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className={`px-2 py-1 text-xs rounded ${getEntityTypeColor(memory.entity_type)}`}>
                                            {getEntityTypeLabel(memory.entity_type)}
                                        </span>
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                                            {memory.entity_name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteMemory(memory.id)}
                                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                    {memory.content}
                                </p>
                                {memory.document_path && (
                                    <button
                                        onClick={() => handleOpenDocument(memory.document_path)}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        来源: {memory.document_path.split('/').pop()}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 添加记忆对话框 */}
            {showAddDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-full mx-4">
                        <h4 className="text-lg font-semibold mb-4">添加记忆</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">实体类型</label>
                                <select
                                    value={newMemory.entity_type}
                                    onChange={(e) => setNewMemory({ ...newMemory, entity_type: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                >
                                    <option value="character">人物</option>
                                    <option value="event">事件</option>
                                    <option value="location">地点</option>
                                    <option value="concept">概念</option>
                                    <option value="relationship">关系</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">实体名称</label>
                                <input
                                    type="text"
                                    value={newMemory.entity_name}
                                    onChange={(e) => setNewMemory({ ...newMemory, entity_name: e.target.value })}
                                    placeholder="例如：张三、重要事件、地点名称..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">内容</label>
                                <textarea
                                    value={newMemory.content}
                                    onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                                    placeholder="描述这个实体的详细信息..."
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => {
                                    setShowAddDialog(false);
                                    setNewMemory({ entity_type: 'character', entity_name: '', content: '' });
                                }}
                                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                                         hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAddMemory}
                                disabled={!newMemory.entity_name.trim() || !newMemory.content.trim()}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                添加
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MemoryTab;

