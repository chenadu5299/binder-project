import { invoke } from '@tauri-apps/api/core';

// ── 类型定义（与 Rust 后端对称，A-AST-M-S-02 §1.3） ──────────────────────────

export interface MemoryItem {
    id: string;
    layer: 'tab' | 'content' | 'workspace_long_term' | 'user';
    scopeType: 'tab' | 'workspace' | 'user';
    scopeId: string;
    entityType: string;
    entityName: string;
    content: string;
    summary: string;
    tags: string;
    sourceKind: string;
    sourceRef: string;
    confidence: number;
    freshnessStatus: 'fresh' | 'stale' | 'expired' | 'superseded';
    readonly: boolean;
    accessCount: number;
    lastAccessedAt?: number;
    createdAt: number;
    updatedAt: number;
}

export interface SearchMemoriesParams {
    query: string;
    tabId?: string;
    workspacePath?: string;
    scope?: 'tab' | 'content' | 'workspace_long_term' | 'user' | 'all';
    limit?: number;
    entityTypes?: string[];
    includeUserMemory?: boolean;
}

export interface MemorySearchResult {
    item: MemoryItem;
    relevanceScore: number;
    sourceLabel: string;
}

export interface MemorySearchResponse {
    items: MemorySearchResult[];
    totalFound: number;
    scopeUsed: string[];
    timedOut: boolean;
}

// ── 服务方法 ──────────────────────────────────────────────────────────────────

export const memoryService = {
    /**
     * 检索记忆库（P0 FTS5 检索，500ms 超时降级）
     */
    async searchMemories(params: SearchMemoriesParams): Promise<MemorySearchResponse> {
        return invoke<MemorySearchResponse>('search_memories_cmd', {
            query: params.query,
            tabId: params.tabId ?? null,
            workspacePath: params.workspacePath ?? null,
            scope: params.scope ?? 'all',
            limit: params.limit ?? 10,
            entityTypes: params.entityTypes ?? null,
            includeUserMemory: params.includeUserMemory ?? null,
        });
    },

    /**
     * 标记孤立 tab 记忆为 stale（P0.5 启动清理）
     */
    async markOrphanTabMemoriesStale(
        activeTabIds: string[],
        workspacePath: string,
    ): Promise<number> {
        return invoke<number>('mark_orphan_tab_memories_stale', {
            activeTabIds,
            workspacePath,
        });
    },

    /**
     * P2: 将指定记忆项标记为 expired（用户主动屏蔽）
     */
    async expireMemoryItem(memoryId: string, workspacePath: string): Promise<void> {
        return invoke<void>('expire_memory_item', {
            memoryId,
            workspacePath,
        });
    },

    /**
     * P2: 批量屏蔽指定 layer 的所有记忆
     */
    async expireMemoryLayer(layer: string, workspacePath: string): Promise<number> {
        return invoke<number>('expire_memory_layer', { layer, workspacePath });
    },

    /**
     * P2: 获取用户 ID 和 user_memory.db 路径
     */
    async getMemoryUserData(): Promise<{ userId: string; userDbPath: string }> {
        return invoke<{ userId: string; userDbPath: string }>('get_memory_user_data');
    },

    /**
     * 获取所有记忆（兼容旧接口，使用空 query 检索全部）
     */
    async getAllMemories(workspacePath: string): Promise<MemoryItem[]> {
        const resp = await this.searchMemories({
            query: ' ',
            workspacePath,
            limit: 200,
        });
        return resp.items.map(r => r.item);
    },
};
