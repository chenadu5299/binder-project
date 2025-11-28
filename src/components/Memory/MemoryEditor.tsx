import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
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

interface MemoryEditorProps {
    memory: Memory | null;
    onSave: (memory: Memory) => void;
    onCancel: () => void;
}

const MemoryEditor: React.FC<MemoryEditorProps> = ({ memory, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        entity_type: 'character',
        entity_name: '',
        content: '',
        attributes: {} as Record<string, string>,
        relationships: [] as Array<{ relation_type: string; target_name: string; description?: string }>,
        tags: [] as string[],
    });

    const [newAttributeKey, setNewAttributeKey] = useState('');
    const [newAttributeValue, setNewAttributeValue] = useState('');
    const [newRelationship, setNewRelationship] = useState({ relation_type: '', target_name: '', description: '' });
    const [newTag, setNewTag] = useState('');

    useEffect(() => {
        if (memory) {
            setFormData({
                entity_type: memory.entity_type,
                entity_name: memory.entity_name,
                content: memory.content,
                attributes: memory.metadata?.attributes || {},
                relationships: memory.metadata?.relationships || [],
                tags: memory.metadata?.tags || [],
            });
        } else {
            setFormData({
                entity_type: 'character',
                entity_name: '',
                content: '',
                attributes: {},
                relationships: [],
                tags: [],
            });
        }
    }, [memory]);

    const handleSave = () => {
        if (!formData.entity_name.trim() || !formData.content.trim()) {
            toast.warning('请填写实体名称和内容');
            return;
        }

        const updatedMemory: Memory = {
            id: memory?.id || '',
            document_path: memory?.document_path || '',
            entity_type: formData.entity_type,
            entity_name: formData.entity_name,
            content: formData.content,
            metadata: {
                attributes: formData.attributes,
                relationships: formData.relationships,
                tags: formData.tags,
            },
            source: memory?.source || 'manual',
            confidence: memory?.confidence || 1.0,
        };

        onSave(updatedMemory);
    };

    const handleAddAttribute = () => {
        if (!newAttributeKey.trim() || !newAttributeValue.trim()) return;
        setFormData({
            ...formData,
            attributes: {
                ...formData.attributes,
                [newAttributeKey]: newAttributeValue,
            },
        });
        setNewAttributeKey('');
        setNewAttributeValue('');
    };

    const handleRemoveAttribute = (key: string) => {
        const newAttributes = { ...formData.attributes };
        delete newAttributes[key];
        setFormData({ ...formData, attributes: newAttributes });
    };

    const handleAddRelationship = () => {
        if (!newRelationship.relation_type.trim() || !newRelationship.target_name.trim()) return;
        setFormData({
            ...formData,
            relationships: [...formData.relationships, { ...newRelationship }],
        });
        setNewRelationship({ relation_type: '', target_name: '', description: '' });
    };

    const handleRemoveRelationship = (index: number) => {
        setFormData({
            ...formData,
            relationships: formData.relationships.filter((_, i) => i !== index),
        });
    };

    const handleAddTag = () => {
        if (!newTag.trim()) return;
        if (formData.tags.includes(newTag)) return;
        setFormData({
            ...formData,
            tags: [...formData.tags, newTag],
        });
        setNewTag('');
    };

    const handleRemoveTag = (tag: string) => {
        setFormData({
            ...formData,
            tags: formData.tags.filter(t => t !== tag),
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] mx-4 flex flex-col">
                {/* 标题栏 */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {memory ? '编辑记忆' : '新建记忆'}
                        </h3>
                        <button
                            onClick={onCancel}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* 基本信息 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            实体类型
                        </label>
                        <select
                            value={formData.entity_type}
                            onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            实体名称 *
                        </label>
                        <input
                            type="text"
                            value={formData.entity_name}
                            onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                            placeholder="例如：张三、重要事件、地点名称..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            内容 *
                        </label>
                        <textarea
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            placeholder="描述这个实体的详细信息..."
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                    </div>

                    {/* 属性 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            属性
                        </label>
                        <div className="space-y-2">
                            {Object.entries(formData.attributes).map(([key, value]) => (
                                <div key={key} className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{key}:</span>
                                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{value}</span>
                                    <button
                                        onClick={() => handleRemoveAttribute(key)}
                                        className="text-red-600 dark:text-red-400 text-sm"
                                    >
                                        删除
                                    </button>
                                </div>
                            ))}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newAttributeKey}
                                    onChange={(e) => setNewAttributeKey(e.target.value)}
                                    placeholder="属性名"
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                />
                                <input
                                    type="text"
                                    value={newAttributeValue}
                                    onChange={(e) => setNewAttributeValue(e.target.value)}
                                    placeholder="属性值"
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                />
                                <button
                                    onClick={handleAddAttribute}
                                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                    添加
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 关系 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            关系
                        </label>
                        <div className="space-y-2">
                            {formData.relationships.map((rel, index) => (
                                <div key={index} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-sm font-medium">{rel.relation_type}</span>
                                            <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                                                → {rel.target_name}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveRelationship(index)}
                                            className="text-red-600 dark:text-red-400 text-sm"
                                        >
                                            删除
                                        </button>
                                    </div>
                                    {rel.description && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{rel.description}</p>
                                    )}
                                </div>
                            ))}
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={newRelationship.relation_type}
                                    onChange={(e) => setNewRelationship({ ...newRelationship, relation_type: e.target.value })}
                                    placeholder="关系类型（如：父子、朋友）"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                />
                                <input
                                    type="text"
                                    value={newRelationship.target_name}
                                    onChange={(e) => setNewRelationship({ ...newRelationship, target_name: e.target.value })}
                                    placeholder="目标实体名称"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                />
                                <input
                                    type="text"
                                    value={newRelationship.description}
                                    onChange={(e) => setNewRelationship({ ...newRelationship, description: e.target.value })}
                                    placeholder="关系描述（可选）"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                />
                                <button
                                    onClick={handleAddRelationship}
                                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                    添加关系
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 标签 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            标签
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {formData.tags.map((tag, index) => (
                                <span
                                    key={index}
                                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded flex items-center gap-1"
                                >
                                    {tag}
                                    <button
                                        onClick={() => handleRemoveTag(tag)}
                                        className="text-red-600 dark:text-red-400"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleAddTag();
                                    }
                                }}
                                placeholder="输入标签后按回车添加"
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                            />
                            <button
                                onClick={handleAddTag}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                            >
                                添加
                            </button>
                        </div>
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                                 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!formData.entity_name.trim() || !formData.content.trim()}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MemoryEditor;

