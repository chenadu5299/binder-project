import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { documentService } from '../../services/documentService';
import MemoryDetailPanel from './MemoryDetailPanel';
import MemoryEditor from './MemoryEditor';
import ConsistencyChecker from './ConsistencyChecker';
import { toast } from '../Common/Toast';

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
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
    const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
    const [showAddDialog, setShowAddDialog] = useState(false);

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

    // 过滤记忆（按类型和搜索查询）
    const filteredMemories = useMemo(() => {
        let filtered = memories;

        // 按类型筛选
        if (typeFilter) {
            filtered = filtered.filter(m => m.entity_type === typeFilter);
        }

        // 按搜索查询筛选
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(m => 
                m.entity_name.toLowerCase().includes(query) ||
                m.content.toLowerCase().includes(query) ||
                (m.metadata?.tags && Array.isArray(m.metadata.tags) && 
                 m.metadata.tags.some((tag: string) => tag.toLowerCase().includes(query)))
            );
        }

        return filtered;
    }, [memories, typeFilter, searchQuery]);

    // 保存记忆（新建或编辑）
    const handleSaveMemory = useCallback(async (memory: Memory) => {
        if (!currentWorkspace) return;

        try {
            // 如果是新建，设置文档路径
            if (!memory.document_path) {
                memory.document_path = currentDocumentPath;
            }

            await invoke('add_memory', {
                memory,
                workspacePath: currentWorkspace,
            });

            setShowAddDialog(false);
            setEditingMemory(null);
            loadMemories();
        } catch (error) {
            console.error('保存记忆失败:', error);
            toast.error(`保存记忆失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [currentWorkspace, currentDocumentPath, loadMemories]);

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
            toast.error(`删除记忆失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [currentWorkspace, loadMemories]);

    // 打开文档
    const handleOpenDocument = useCallback(async (documentPath: string) => {
        if (!currentWorkspace) return;
        const fullPath = currentWorkspace + '/' + documentPath;
        await documentService.openFile(fullPath);
    }, [currentWorkspace]);

    // 跳转到指定记忆项（用于从文档中跳转）
    const scrollToMemory = useCallback((memoryId: string) => {
        // 查找并选中对应的记忆项
        const memory = memories.find(m => m.id === memoryId);
        if (memory) {
            setSelectedMemory(memory);
            // 滚动到该记忆项（通过 DOM 操作）
            setTimeout(() => {
                const element = document.querySelector(`[data-memory-id="${memoryId}"]`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [memories]);

    // 暴露跳转方法给外部使用
    useEffect(() => {
        (window as any).scrollToMemory = scrollToMemory;
        return () => {
            delete (window as any).scrollToMemory;
        };
    }, [scrollToMemory]);

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
        <div className="h-full flex bg-white dark:bg-gray-800">
            {/* 主内容区域 */}
            <div className={`flex flex-col ${selectedMemory ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'w-full'}`}>
                {/* 一致性检查 */}
                <ConsistencyChecker />

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

                    {/* 筛选和搜索 */}
                    <div className="space-y-2">
                        {/* 类型筛选 */}
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="">全部类型</option>
                            <option value="character">人物</option>
                            <option value="event">事件</option>
                            <option value="location">地点</option>
                            <option value="concept">概念</option>
                            <option value="relationship">关系</option>
                        </select>

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
                                data-memory-id={memory.id}
                                onClick={() => setSelectedMemory(memory)}
                                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                                    selectedMemory?.id === memory.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
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
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteMemory(memory.id);
                                        }}
                                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">
                                    {memory.content}
                                </p>
                                {memory.metadata?.tags && Array.isArray(memory.metadata.tags) && memory.metadata.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {memory.metadata.tags.slice(0, 3).map((tag: string, index: number) => (
                                            <span
                                                key={index}
                                                className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                        {memory.metadata.tags.length > 3 && (
                                            <span className="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                +{memory.metadata.tags.length - 3}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {memory.document_path && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenDocument(memory.document_path);
                                        }}
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

                {/* 详情面板 */}
                {selectedMemory && (
                    <MemoryDetailPanel
                        memory={selectedMemory}
                        onClose={() => setSelectedMemory(null)}
                        onEdit={(memory) => {
                            setSelectedMemory(null);
                            setEditingMemory(memory);
                        }}
                    />
                )}
            </div>

            {/* 编辑对话框 */}
            {(showAddDialog || editingMemory) && (
                <MemoryEditor
                    memory={editingMemory}
                    onSave={handleSaveMemory}
                    onCancel={() => {
                        setShowAddDialog(false);
                        setEditingMemory(null);
                    }}
                />
            )}
        </div>
    );
};

export default MemoryTab;

