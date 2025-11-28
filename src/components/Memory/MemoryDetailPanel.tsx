import React from 'react';
import { XMarkIcon, PencilIcon, LinkIcon } from '@heroicons/react/24/outline';
import { documentService } from '../../services/documentService';
import { useFileStore } from '../../stores/fileStore';

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

interface MemoryDetailPanelProps {
    memory: Memory;
    onClose: () => void;
    onEdit?: (memory: Memory) => void;
}

const MemoryDetailPanel: React.FC<MemoryDetailPanelProps> = ({ memory, onEdit, onClose }) => {
    const { currentWorkspace } = useFileStore();

    const handleOpenDocument = async () => {
        if (!currentWorkspace || !memory.document_path) return;
        const fullPath = currentWorkspace + '/' + memory.document_path;
        await documentService.openFile(fullPath);
    };

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

    // 从 metadata 中提取扩展信息
    const attributes = memory.metadata?.attributes || {};
    const relationships = memory.metadata?.relationships || [];
    const tags = memory.metadata?.tags || [];

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
            {/* 标题栏 */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">记忆详情</h3>
                    <div className="flex items-center gap-2">
                        {onEdit && (
                            <button
                                onClick={() => onEdit(memory)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                title="编辑"
                            >
                                <PencilIcon className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="关闭"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 基本信息 */}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 text-xs rounded ${getEntityTypeColor(memory.entity_type)}`}>
                            {getEntityTypeLabel(memory.entity_type)}
                        </span>
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">
                            {memory.entity_name}
                        </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        置信度: {(memory.confidence * 100).toFixed(0)}%
                    </p>
                    {memory.source === 'ai_suggested' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">AI 建议</p>
                    )}
                </div>

                {/* 描述内容 */}
                <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">描述</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {memory.content}
                    </p>
                </div>

                {/* 属性 */}
                {Object.keys(attributes).length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">属性</h4>
                        <div className="space-y-2">
                            {Object.entries(attributes).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[80px]">
                                        {key}:
                                    </span>
                                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                                        {String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 关系 */}
                {relationships.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">关系</h4>
                        <div className="space-y-2">
                            {relationships.map((rel: any, index: number) => (
                                <div key={index} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                            {rel.relation_type || '关系'}:
                                        </span>
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            {rel.target_name || rel.target_id}
                                        </span>
                                    </div>
                                    {rel.description && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {rel.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 标签 */}
                {tags.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">标签</h4>
                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag: string, index: number) => (
                                <span
                                    key={index}
                                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 来源文档 */}
                {memory.document_path && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">来源</h4>
                        <button
                            onClick={handleOpenDocument}
                            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <LinkIcon className="w-4 h-4" />
                            <span className="truncate max-w-[200px]" title={memory.document_path}>
                                {memory.document_path.split('/').pop() || memory.document_path}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MemoryDetailPanel;

