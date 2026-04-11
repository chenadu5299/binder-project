/**
 * @ 选择器 - Phase 1.2
 * 五类树状、点选/字符匹配、Tab 作用于候选项、空匹配展示空
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    DocumentIcon,
    BookOpenIcon,
    ChatBubbleLeftIcon,
    CubeIcon,
    SparklesIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import Fuse from 'fuse.js';
import {
    MentionItem,
    MentionCategory,
    MENTION_CATEGORIES,
} from '../../hooks/useMentionData';

export type { MentionItem };

interface MentionSelectorProps {
    query: string;
    /** 点选模式：展示五类树；字符匹配：展示跨五类匹配结果 */
    itemsByCategory: Record<MentionCategory, MentionItem[]>;
    getItemsByCategory: (cat: MentionCategory) => Promise<MentionItem[]>;
    position: { top: number; left: number; containerWidth?: number };
    onSelect: (item: MentionItem) => void;
    onClose: () => void;
}

export const MentionSelector: React.FC<MentionSelectorProps> = ({
    query,
    itemsByCategory,
    getItemsByCategory,
    position,
    onSelect,
    onClose,
}) => {
    const isPointMode = !query.trim();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [expandedCategory, setExpandedCategory] = useState<MentionCategory | null>(null);
    const [categoryItems, setCategoryItems] = useState<MentionItem[]>([]);
    const [loadingCategory, setLoadingCategory] = useState<MentionCategory | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 点选模式：候选项 = 五类 + 当前展开类下的项
    const pointModeOptions = expandedCategory
        ? categoryItems
        : MENTION_CATEGORIES.filter(c => !c.disabled);

    // 字符匹配模式：跨五类 Fuse 搜索
    const allItems = React.useMemo(() => {
        const list: MentionItem[] = [];
        (['file', 'memory', 'kb', 'template', 'chat'] as MentionCategory[]).forEach(cat => {
            list.push(...(itemsByCategory[cat] || []));
        });
        return list;
    }, [itemsByCategory]);

    const fuse = React.useMemo(
        () =>
            new Fuse(allItems, {
                keys: ['name', 'path'],
                threshold: 0.4,
                includeScore: true,
            }),
        [allItems]
    );

    const charMatchResults = query.trim()
        ? fuse.search(query).map(r => r.item).slice(0, 15)
        : [];

    const isItem = (x: unknown): x is MentionItem =>
        typeof x === 'object' && x !== null && 'id' in x && 'type' in x;

    // 展开某类时懒加载
    const handleExpandCategory = useCallback(
        async (cat: MentionCategory) => {
            if (MENTION_CATEGORIES.find(c => c.key === cat)?.disabled) return;
            setLoadingCategory(cat);
            try {
                const items = await getItemsByCategory(cat);
                setCategoryItems(items);
                setExpandedCategory(cat);
                setSelectedIndex(0);
            } finally {
                setLoadingCategory(null);
            }
        },
        [getItemsByCategory]
    );

    // 折叠回五类（loadingCategory 用于展示加载状态）
    const handleCollapse = useCallback(() => {
        setExpandedCategory(null);
        setCategoryItems([]);
        setSelectedIndex(0);
    }, []);

    // 键盘：上下、Enter、Tab、Esc
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const list = isPointMode ? pointModeOptions : charMatchResults;
            const n = list.length;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % Math.max(n, 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (n ? (prev - 1 + n) % n : 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (isPointMode && !expandedCategory) {
                    const cat = list[selectedIndex];
                    if (cat && 'key' in cat) {
                        handleExpandCategory((cat as { key: MentionCategory }).key);
                    }
                } else {
                    const item = list[selectedIndex];
                    if (item && isItem(item)) {
                        onSelect(item);
                    }
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                if (n > 0) {
                    setSelectedIndex(prev => (prev + 1) % n);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (expandedCategory) {
                    handleCollapse();
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        expandedCategory,
        categoryItems,
        isPointMode,
        charMatchResults,
        selectedIndex,
        onSelect,
        onClose,
        handleExpandCategory,
        handleCollapse,
    ]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query, expandedCategory, charMatchResults.length]);

    useEffect(() => {
        if (containerRef.current) {
            const el = containerRef.current.children[selectedIndex] as HTMLElement;
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [selectedIndex]);

    const getCategoryIcon = (cat: MentionCategory) => {
        switch (cat) {
            case 'file': return <DocumentIcon className="w-4 h-4 flex-shrink-0" />;
            case 'memory': return <BookOpenIcon className="w-4 h-4 flex-shrink-0" />;
            case 'kb': return <CubeIcon className="w-4 h-4 flex-shrink-0" />;
            case 'template': return <SparklesIcon className="w-4 h-4 flex-shrink-0" />;
            case 'chat': return <ChatBubbleLeftIcon className="w-4 h-4 flex-shrink-0" />;
            default: return <DocumentIcon className="w-4 h-4 flex-shrink-0" />;
        }
    };

    const getItemIcon = (item: MentionItem) => {
        switch (item.type) {
            case 'file': return <DocumentIcon className="w-4 h-4 flex-shrink-0" />;
            case 'memory': return <BookOpenIcon className="w-4 h-4 flex-shrink-0" />;
            case 'kb': return <CubeIcon className="w-4 h-4 flex-shrink-0" />;
            case 'template': return <SparklesIcon className="w-4 h-4 flex-shrink-0" />;
            case 'chat': return <ChatBubbleLeftIcon className="w-4 h-4 flex-shrink-0" />;
            default: return <DocumentIcon className="w-4 h-4 flex-shrink-0" />;
        }
    };

    // 统一样式：光标上方显示，宽度受聊天窗口限制
    const baseStyle: React.CSSProperties = {
        top: position.top,
        left: position.left,
        transform: 'translateY(calc(-100% - 4px))',
        maxWidth: position.containerWidth
            ? `${Math.max(200, position.containerWidth - position.left - 16)}px`
            : undefined,
    };

    if (isPointMode && !expandedCategory) {
        // 点选模式：五类树
        return (
            <div
                ref={containerRef}
                className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden min-w-[200px]"
                style={baseStyle}
            >
                <div className="py-1">
                    {MENTION_CATEGORIES.map((cat, index) => {
                        const isDisabled = cat.disabled;
                        const isLoading = loadingCategory === cat.key;
                        return (
                            <button
                                key={cat.key}
                                onClick={() => !isDisabled && handleExpandCategory(cat.key)}
                                disabled={isDisabled || isLoading}
                                className={`
                                    w-full px-3 py-2 text-left flex items-center gap-2
                                    ${index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                            >
                                {getCategoryIcon(cat.key)}
                                <span className="flex-1 text-sm">{cat.label}</span>
                                {isLoading && <span className="text-xs text-gray-400 animate-pulse">加载中...</span>}
                                {isDisabled && !isLoading && <span className="text-xs text-gray-400">未实现</span>}
                                {!isDisabled && !isLoading && <ChevronRightIcon className="w-4 h-4" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (isPointMode && expandedCategory) {
        // 点选模式：展开后的项列表
        return (
            <div
                ref={containerRef}
                className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[200px]"
                style={baseStyle}
            >
                <button
                    onClick={handleCollapse}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 border-b dark:border-gray-600"
                >
                    <ChevronRightIcon className="w-4 h-4 rotate-180" />
                    <span className="text-sm">返回</span>
                </button>
                <div className="py-1">
                    {categoryItems.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            暂无数据
                        </div>
                    ) : (
                        categoryItems.map((item, index) => (
                            <button
                                key={item.id}
                                onClick={() => onSelect(item)}
                                className={`
                                    w-full px-3 py-2 text-left flex items-center gap-2
                                    ${index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                                `}
                            >
                                {getItemIcon(item)}
                                <div className="flex-1 min-w-0 truncate">
                                    <div className="text-sm font-medium">{item.name}</div>
                                    {item.path && (
                                        <div className="text-xs text-gray-500 truncate">{item.path}</div>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // 字符匹配模式
    return (
        <div
            ref={containerRef}
            className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[200px]"
            style={baseStyle}
        >
            <div className="py-1">
                {charMatchResults.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                        未找到匹配项
                    </div>
                ) : (
                    charMatchResults.map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => onSelect(item)}
                            className={`
                                w-full px-3 py-2 text-left flex items-center gap-2
                                ${index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                            `}
                        >
                            {getItemIcon(item)}
                            <div className="flex-1 min-w-0 truncate">
                                <div className="text-sm font-medium">{item.name}</div>
                                {item.path && (
                                    <div className="text-xs text-gray-500 truncate">{item.path}</div>
                                )}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};
