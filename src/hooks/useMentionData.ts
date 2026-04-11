/**
 * @ 列表数据加载 Hook
 * Phase 1.2：五类（文件、记忆、知识库、模板库、聊天）懒加载
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useChatStore } from '../stores/chatStore';
import { flattenFileTree, filterFiles } from '../utils/fileTreeUtils';
import { memoryService } from '../services/memoryService';
import { knowledgeService } from '../services/knowledge/knowledgeService';
import { templateService } from '../services/templateService';
import type { KnowledgeAssetKind } from '../types/knowledge';

export type MentionCategory = 'file' | 'memory' | 'kb' | 'template' | 'chat';

export interface MentionItem {
    id: string;
    name: string;
    path?: string;
    type: MentionCategory;
    /** 仅 memory 类型 */
    memoryId?: string;
    memoryContent?: string;
    /** 仅 chat 类型 */
    chatTabId?: string;
    /** 仅 kb 类型 */
    kbId?: string;
    entryId?: string;
    documentId?: string;
    /** 仅 template 类型 */
    templateId?: string;
    preview?: string;
    assetKind?: KnowledgeAssetKind;
}

/** 五类配置 */
export const MENTION_CATEGORIES: { key: MentionCategory; label: string; disabled?: boolean }[] = [
    { key: 'file', label: '工作区文件' },
    { key: 'memory', label: '记忆库' },
    { key: 'kb', label: '知识库' },
    { key: 'template', label: '模板库' },
    { key: 'chat', label: '聊天标签' },
];

export function useMentionData() {
    const { fileTree, currentWorkspace } = useFileStore();
    const { tabs } = useChatStore();
    const [memoryItems, setMemoryItems] = useState<MentionItem[]>([]);
    const [knowledgeItems, setKnowledgeItems] = useState<MentionItem[]>([]);
    const [templateItems, setTemplateItems] = useState<MentionItem[]>([]);
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
            const items: MentionItem[] = memories.map((m) => ({
                id: `memory-${m.id}`,
                name: m.entityName,
                type: 'memory' as const,
                memoryId: m.id,
                memoryContent: m.content,
            }));
            setMemoryItems(items);
            setLoadedCategories(prev => new Set(prev).add('memory'));
            return items;
        } catch {
            return [];
        }
    }, [currentWorkspace, loadedCategories, memoryItems]);

    /** 懒加载知识库条目 */
    const loadKnowledgeItems = useCallback(async (query?: string): Promise<MentionItem[]> => {
        if (!currentWorkspace) return [];
        if (!query && loadedCategories.has('kb') && knowledgeItems.length > 0) {
            return knowledgeItems;
        }
        try {
            const response = await knowledgeService.listEntries(currentWorkspace, {
                query: query ?? null,
                limit: 50,
            });
            const baseItem: MentionItem = {
                id: `kb-base-${response.knowledgeBase.id}`,
                name: response.knowledgeBase.name,
                type: 'kb' as const,
                kbId: response.knowledgeBase.id,
                preview: response.knowledgeBase.description ?? '整个知识库范围的显式引用',
            };
            const entryItems: MentionItem[] = response.items.map((item) => ({
                id: `kb-${item.entry.id}`,
                name: item.entry.title,
                type: 'kb' as const,
                kbId: response.knowledgeBase.id,
                entryId: item.entry.id,
                documentId: item.activeDocumentId ?? undefined,
                preview: item.preview,
                path: item.entry.sourceRef ?? undefined,
                assetKind: item.entry.assetKind,
            }));
            const items = [baseItem, ...entryItems];
            if (!query) {
                setKnowledgeItems(items);
                setLoadedCategories(prev => new Set(prev).add('kb'));
            }
            return items;
        } catch {
            return [];
        }
    }, [currentWorkspace, loadedCategories, knowledgeItems]);

    /** 懒加载工作流模板 */
    const loadTemplateItems = useCallback(async (): Promise<MentionItem[]> => {
        if (!currentWorkspace) return [];
        if (loadedCategories.has('template')) return templateItems;
        try {
            const templates = await templateService.listTemplates(currentWorkspace);
            const items: MentionItem[] = templates.map((item) => ({
                id: `template-${item.id}`,
                name: item.name,
                type: 'template' as const,
                templateId: item.id,
                path: item.projectId ?? undefined,
                preview: item.description ?? '工作流模板过程约束引用',
            }));
            setTemplateItems(items);
            setLoadedCategories(prev => new Set(prev).add('template'));
            return items;
        } catch {
            return [];
        }
    }, [currentWorkspace, loadedCategories, templateItems]);

    useEffect(() => {
        memoryItemsRef.current = [];
        setKnowledgeItems([]);
        setTemplateItems([]);
        setLoadedCategories(new Set());
        if (currentWorkspace) {
            loadMemoryItems();
            loadKnowledgeItems();
            loadTemplateItems();
        }
    }, [currentWorkspace]); // 工作区变化时重新加载

    /** 按类获取项（支持懒加载） */
    const getItemsByCategory = useCallback(
        async (category: MentionCategory): Promise<MentionItem[]> => {
            switch (category) {
                case 'file':
                    return fileItems;
                case 'memory':
                    return loadMemoryItems();
                case 'kb':
                    return loadKnowledgeItems();
                case 'chat':
                    return chatItems;
                case 'template':
                    return loadTemplateItems();
                default:
                    return [];
            }
        },
        [fileItems, memoryItems, knowledgeItems, chatItems, loadMemoryItems, loadKnowledgeItems, loadTemplateItems]
    );

    /** 构建 itemsByCategory 供 MentionSelector */
    const itemsByCategory: Record<MentionCategory, MentionItem[]> = {
        file: fileItems,
        memory: memoryItems,
        kb: knowledgeItems,
        chat: chatItems,
        template: templateItems,
    };

    /** 所有已加载项（用于字符匹配） */
    const allItems: MentionItem[] = [
        ...fileItems,
        ...memoryItems,
        ...knowledgeItems,
        ...templateItems,
        ...chatItems,
    ];

    return {
        allItems,
        fileItems,
        memoryItems,
        knowledgeItems,
        templateItems,
        chatItems,
        itemsByCategory,
        getItemsByCategory,
        loadedCategories,
        loadMemoryItems,
        loadKnowledgeItems,
        loadTemplateItems,
    };
}
