import { invoke } from '@tauri-apps/api/core';

export interface Memory {
    id: string;
    document_path: string;
    entity_type: string;
    entity_name: string;
    content: string;
    metadata: any;
    source: string;
    confidence: number;
}

export const memoryService = {
    /**
     * 获取所有记忆
     */
    async getAllMemories(workspacePath: string): Promise<Memory[]> {
        return await invoke<Memory[]>('get_all_memories', { workspacePath });
    },

    /**
     * 搜索记忆
     */
    async searchMemories(query: string, workspacePath: string): Promise<Memory[]> {
        return await invoke<Memory[]>('search_memories', { query, workspacePath });
    },

    /**
     * 根据实体名称查找记忆
     */
    async findMemoryByName(entityName: string, workspacePath: string): Promise<Memory | null> {
        const memories = await this.getAllMemories(workspacePath);
        return memories.find(m => m.entity_name === entityName) || null;
    },

    /**
     * 跳转到记忆库并选中指定记忆项
     */
    async jumpToMemory(memoryId: string, workspacePath: string): Promise<void> {
        // 确保聊天面板显示并切换到记忆库标签
        const { useLayoutStore } = await import('../stores/layoutStore');
        const layoutStore = useLayoutStore.getState();
        
        // 显示聊天面板（包含记忆库）
        if (!layoutStore.chat.visible) {
            layoutStore.setChatVisible(true);
        }

        // 切换到记忆库标签（需要在 ChatPanel 中实现）
        // 由于 ChatPanel 使用本地状态，我们需要通过事件或全局状态来实现
        // 暂时通过 window 对象暴露的方法来实现
        if ((window as any).scrollToMemory) {
            (window as any).scrollToMemory(memoryId);
        } else {
            // 如果方法不存在，等待一下再试
            setTimeout(() => {
                if ((window as any).scrollToMemory) {
                    (window as any).scrollToMemory(memoryId);
                }
            }, 500);
        }
    },
};

