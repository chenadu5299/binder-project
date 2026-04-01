/**
 * @ 列表数据加载 Hook
 * Phase 1.2：五类（文件、记忆、知识库、模板库、聊天）懒加载
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useChatStore } from '../stores/chatStore';
import { flattenFileTree, filterFiles } from '../utils/fileTreeUtils';
import { memoryService } from '../services/memoryService';

export type MentionCategory = 'file' | 'memory' | 'kb' | 'template' | 'chat';

export interface MentionItem {
    id: string;
    name: string;
    path?: string;
    type: MentionCategory;
    /** 仅 chat 类型 */
    chatTabId?: string;
}

/** 五类配置（知识库、模板库未实现时占位） */
export const MENTION_CATEGORIES: { key: MentionCategory; label: string; disabled?: boolean }[] = [
    { key: 'file', label: '工作区文件' },
    { key: 'memory', label: '记忆库' },
    { key: 'kb', label: '知识库', disabled: true },
    { key: 'template', label: '模板库', disabled: true },
    { key: 'chat', label: '聊天标签' },
];

export function useMentionData() {
    const { fileTree, currentWorkspace } = useFileStore();
    const { tabs } = useChatStore();
    const [memoryItems, setMemoryItems] = useState<MentionItem[]>([]);
    const memoryItemsRef = useRef<MentionItem[]>([]);
    const [loadedCategories, setLoadedCategories] = useState<Set<MentionCategory>>(new Set());

    /** 文件项（同步） */
    const fileItems = (() => {
        if (!fileTree) return [];
        const flat = flattenFileTree(fileTree);
        const files = filterFiles(flat);
        return files.map(f => ({
            id: f.path,
            name: f.name,
            path: f.path,
            type: 'file' as const,
        }));
    })();

    /** 聊天标签（同步） */
    const chatItems: MentionItem[] = tabs.map(t => ({
        id: t.id,
        name: t.title,
        type: 'chat' as const,
        chatTabId: t.id,
    }));

    /** 懒加载记忆库 */
    const loadMemoryItems = useCallback(async (): Promise<MentionItem[]> => {
        if (!currentWorkspace) return [];
        if (loadedCategories.has('memory')) return memoryItems;
        try {
            const memories = await memoryService.getAllMemories(currentWorkspace);
            const memoryMap = new Map<string, number>();
            memories.forEach(m => {
                memoryMap.set(m.entity_name, (memoryMap.get(m.entity_name) || 0) + 1);
            });
            const items: MentionItem[] = Array.from(memoryMap.keys()).map(name => ({
                id: `memory-${name}`,
                name,
                type: 'memory' as const,
            }));
            setMemoryItems(items);
            setLoadedCategories(prev => new Set(prev).add('memory'));
            return items;
        } catch {
            return [];
        }
    }, [currentWorkspace, loadedCategories, memoryItems]);

    useEffect(() => {
        memoryItemsRef.current = [];
        setLoadedCategories(new Set());
        if (currentWorkspace) loadMemoryItems();
    }, [currentWorkspace]); // 工作区变化时重新加载

    /** 按类获取项（支持懒加载） */
    const getItemsByCategory = useCallback(
        async (category: MentionCategory): Promise<MentionItem[]> => {
            switch (category) {
                case 'file':
                    return fileItems;
                case 'memory':
                    return loadMemoryItems();
                case 'chat':
                    return chatItems;
                case 'kb':
                case 'template':
                    return []; // 占位
                default:
                    return [];
            }
        },
        [fileItems, memoryItems, chatItems, loadMemoryItems]
    );

    /** 构建 itemsByCategory 供 MentionSelector */
    const itemsByCategory: Record<MentionCategory, MentionItem[]> = {
        file: fileItems,
        memory: memoryItems,
        chat: chatItems,
        kb: [],
        template: [],
    };

    /** 所有已加载项（用于字符匹配） */
    const allItems: MentionItem[] = [
        ...fileItems,
        ...memoryItems,
        ...chatItems,
    ];

    return {
        allItems,
        fileItems,
        memoryItems,
        chatItems,
        itemsByCategory,
        getItemsByCategory,
        loadedCategories,
        loadMemoryItems,
    };
}
