// 引用管理按钮组件（位于输入框左上角）

import React, { useState, useRef, useEffect } from 'react';
import { PaperClipIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useReferenceStore } from '../../stores/referenceStore';
import { Reference } from '../../types/reference';
import { getReferenceIcon, getReferenceDisplayText } from '../../utils/inlineContentParser';

interface ReferenceManagerButtonProps {
    tabId: string | null;
    onInsertReference: (refId: string) => void;
    onRemoveReference?: (refId: string) => void; // 新增：删除引用时的回调
}

export const ReferenceManagerButton: React.FC<ReferenceManagerButtonProps> = ({
    tabId,
    onInsertReference,
    onRemoveReference,
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { getReferences, removeReference } = useReferenceStore();
    
    const references = tabId ? getReferences(tabId) : [];
    
    // 点击外部关闭下拉框
    useEffect(() => {
        if (!showDropdown) return;
        
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setShowDropdown(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDropdown]);
    
    // 按类型分组引用
    const groupedRefs = React.useMemo(() => {
        const groups: Record<string, Reference[]> = {};
        references.forEach(ref => {
            const type = ref.type;
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(ref);
        });
        return groups;
    }, [references]);
    
    const handleInsert = (refId: string) => {
        onInsertReference(refId);
        setShowDropdown(false);
    };
    
    const handleRemove = (e: React.MouseEvent, refId: string) => {
        e.stopPropagation();
        if (tabId) {
            // 从 store 中删除引用
            removeReference(tabId, refId);
            // 同时从输入框中删除标签（如果存在）
            if (onRemoveReference) {
                onRemoveReference(refId);
            }
        }
    };
    
    // 即使没有标签页也显示按钮（但下拉框内容可能为空）
    return (
        <div className="reference-manager-button-wrapper">
            <button
                ref={buttonRef}
                onClick={() => setShowDropdown(!showDropdown)}
                className="reference-manager-button"
                title="管理引用"
                type="button"
            >
                <PaperClipIcon className="w-4 h-4" />
                {references.length > 0 && (
                    <span className="reference-count-badge">
                        {references.length}
                    </span>
                )}
                <ChevronDownIcon className="w-3 h-3" />
            </button>
            
            {showDropdown && (
                <div
                    ref={dropdownRef}
                    className="reference-manager-dropdown"
                >
                    <div className="dropdown-header">
                        <span className="dropdown-title">引用管理</span>
                        <span className="dropdown-count">
                            {references.length} 个引用
                        </span>
                    </div>
                    
                    <div className="dropdown-content">
                        {references.length === 0 ? (
                            <div className="empty-state">
                                <p className="empty-text">暂无引用</p>
                            </div>
                        ) : (
                            Object.entries(groupedRefs).map(([type, refs]) => (
                                <div key={type} className="reference-group">
                                    <div className="group-title">
                                        {getTypeLabel(type)}
                                    </div>
                                    {refs.map(ref => (
                                        <div
                                            key={ref.id}
                                            className="reference-item"
                                            onClick={() => handleInsert(ref.id)}
                                        >
                                            <span className="ref-icon">
                                                {getReferenceIcon(ref)}
                                            </span>
                                            <span className="ref-label">
                                                {getReferenceDisplayText(ref)}
                                            </span>
                                            <button
                                                className="ref-remove-btn-small"
                                                onClick={(e) => handleRemove(e, ref.id)}
                                                title="移除引用"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        'text': '📄 文本引用',
        'file': '📁 文件引用',
        'folder': '📁 文件夹引用',
        'image': '🖼️ 图片引用',
        'table': '📊 表格引用',
        'memory': '📚 记忆库引用',
        'chat': '💬 聊天记录引用',
        'link': '🔗 链接引用',
        'kb': '🧠 知识库引用',
    };
    return labels[type] || '📎 引用';
}

