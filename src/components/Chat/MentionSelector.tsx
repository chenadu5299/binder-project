import React, { useEffect, useRef, useState } from 'react';
import { DocumentIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import Fuse from 'fuse.js';

export interface MentionItem {
    id: string;
    name: string;
    path?: string;
    type: 'file' | 'memory' | 'knowledge';
}

interface MentionSelectorProps {
    query: string;
    type: 'file' | 'memory' | 'knowledge';
    items: MentionItem[];
    position: { top: number; left: number };
    onSelect: (item: MentionItem) => void;
    onClose: () => void;
}

export const MentionSelector: React.FC<MentionSelectorProps> = ({
    query,
    type,
    items,
    position,
    onSelect,
    onClose,
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // 使用 Fuse.js 进行模糊搜索
    const fuse = new Fuse(items, {
        keys: ['name', 'path'],
        threshold: 0.4, // 模糊匹配阈值
        includeScore: true,
    });
    
    const searchResults = query.trim()
        ? fuse.search(query).map(result => result.item).slice(0, 10)
        : items.slice(0, 10);
    
    // 键盘导航
    useEffect(() => {
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
                    onSelect(searchResults[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, searchResults, onSelect, onClose]);
    
    // 重置选中索引当搜索结果变化时
    useEffect(() => {
        setSelectedIndex(0);
    }, [query, searchResults.length]);
    
    // 滚动到选中项
    useEffect(() => {
        if (containerRef.current) {
            const selectedElement = containerRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [selectedIndex]);
    
    if (searchResults.length === 0) {
        return null;
    }
    
    const getIcon = () => {
        switch (type) {
            case 'file':
                return <DocumentIcon className="w-4 h-4" />;
            case 'memory':
                return <BookOpenIcon className="w-4 h-4" />;
            default:
                return null;
        }
    };
    
    return (
        <div
            ref={containerRef}
            className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[300px]"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
            }}
        >
            {searchResults.map((item, index) => (
                <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    className={`
                        w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700
                        ${index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                >
                    {getIcon()}
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {item.name}
                        </div>
                        {item.path && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {item.path}
                            </div>
                        )}
                    </div>
                </button>
            ))}
        </div>
    );
};

