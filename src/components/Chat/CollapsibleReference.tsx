import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Reference, ReferenceType, TextReference } from '../../types/reference';

interface CollapsibleReferenceProps {
    reference: Reference;
    maxLength?: number;  // 默认 500 字符
}

export const CollapsibleReference: React.FC<CollapsibleReferenceProps> = ({ 
    reference, 
    maxLength = 500 
}) => {
    const [expanded, setExpanded] = useState(false);
    
    // 只有文本引用需要折叠
    if (reference.type !== ReferenceType.TEXT) {
        return null;
    }
    
    const textRef = reference as TextReference;
    const shouldCollapse = textRef.content.length > maxLength;
    const displayText = shouldCollapse && !expanded
        ? textRef.content.substring(0, maxLength) + '...'
        : textRef.content;
    
    if (!shouldCollapse) {
        return <div className="reference-content">{displayText}</div>;
    }
    
    return (
        <div className="reference-content">
            <div className="whitespace-pre-wrap break-words">{displayText}</div>
            <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
            >
                {expanded ? (
                    <>
                        <ChevronUpIcon className="w-3 h-3" />
                        <span>收起</span>
                    </>
                ) : (
                    <>
                        <ChevronDownIcon className="w-3 h-3" />
                        <span>展开 ({textRef.content.length - maxLength} 字符)</span>
                    </>
                )}
            </button>
        </div>
    );
};

