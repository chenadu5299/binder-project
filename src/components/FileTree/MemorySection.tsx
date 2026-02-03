import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';

interface Memory {
  id: string;
  document_path: string;
  entity_type: string;
  entity_name: string;
  content: string;
  metadata: Record<string, unknown>;
  source: string;
  confidence: number;
}

interface MemorySectionProps {
  isExpanded: boolean;
}

const MemorySection: React.FC<MemorySectionProps> = ({ isExpanded }) => {
  const { currentWorkspace } = useFileStore();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 加载记忆
  const loadMemories = useCallback(async () => {
    if (!currentWorkspace || !isExpanded) return;

    setIsLoading(true);
    try {
      const allMemories = await invoke<Memory[]>('get_all_memories', {
        workspacePath: currentWorkspace,
      });
      setMemories(allMemories);
    } catch (error) {
      console.error('加载记忆失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, isExpanded]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // 过滤记忆
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    
    const query = searchQuery.toLowerCase();
    return memories.filter(m => 
      m.entity_name.toLowerCase().includes(query) ||
      m.content.toLowerCase().includes(query)
    );
  }, [memories, searchQuery]);

  const getEntityTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'character': '人物',
      'event': '事件',
      'location': '地点',
      'concept': '概念',
      'relationship': '关系',
    };
    return labels[type] || type;
  };

  if (!isExpanded) {
    return null;
  }

  if (!currentWorkspace) {
    return (
      <div className="p-3 text-center text-gray-500 dark:text-gray-400 text-sm">
        请先选择工作区
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* 搜索框 */}
      <div className="mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索记忆..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* 记忆列表 */}
      {isLoading ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          加载中...
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          {searchQuery ? '未找到匹配的记忆' : '暂无记忆'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {filteredMemories.map((memory) => (
            <div
              key={memory.id}
              className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                    {getEntityTypeLabel(memory.entity_type)}
                  </span>
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                    {memory.entity_name}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mb-1">
                {memory.content}
              </p>
              {memory.document_path && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  来源: {memory.document_path.split('/').pop()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MemorySection;

