// 内联引用标签组件（显示在输入框内）

import React from 'react';
import { Reference } from '../../types/reference';
import { getReferenceDisplayText, getReferenceIcon } from '../../utils/inlineContentParser';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface InlineReferenceTagProps {
    ref: Reference;
    nodeIndex: number;
    onRemove: () => void;
}

export const InlineReferenceTag: React.FC<InlineReferenceTagProps> = ({ 
    ref, 
    nodeIndex, 
    onRemove 
}) => {
    const displayText = getReferenceDisplayText(ref);
    const icon = getReferenceIcon(ref);
    
    const handleRemove = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
    };
    
    return (
        <span
            contentEditable={false}
            className="inline-reference-tag"
            data-ref-id={ref.id}
            data-node-index={nodeIndex}
            onClick={(e) => {
                // 阻止点击事件冒泡，避免影响光标位置
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <span className="ref-icon">{icon}</span>
            <span className="ref-label">{displayText}</span>
            <button
                onClick={handleRemove}
                className="ref-remove-btn"
                title="移除引用"
            >
                <XMarkIcon className="w-3 h-3" />
            </button>
        </span>
    );
};

