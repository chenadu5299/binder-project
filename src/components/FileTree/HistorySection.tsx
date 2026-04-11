import React, { useEffect } from 'react';
import { toast } from '../Common/Toast';
import { useFileStore } from '../../stores/fileStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { timelineService } from '../../services/timelineService';
import type { TimelineNode } from '../../types/timeline';

interface HistorySectionProps {
  isExpanded: boolean;
}

const MAX_RECORDS = 50;

const OPERATION_LABELS: Record<string, string> = {
  save_file: '保存文件',
  accept_file_diffs: '接受待确认修改',
  create_file: '创建文件',
  create_folder: '创建文件夹',
  rename_file: '重命名资源',
  delete_file: '删除资源',
  duplicate_file: '复制文件',
  move_file: '移动资源',
  update_file: '直接更新文件',
  restore: '时间轴还原',
};

const getOperationLabel = (node: TimelineNode): string => {
  return OPERATION_LABELS[node.operationType] || node.summary || node.operationType;
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const HistorySection: React.FC<HistorySectionProps> = ({ isExpanded }) => {
  const { currentWorkspace } = useFileStore();
  const { nodes, isLoading, error, loadNodes, clear } = useTimelineStore();

  useEffect(() => {
    if (!isExpanded || !currentWorkspace) {
      clear();
      return;
    }

    void loadNodes(currentWorkspace, MAX_RECORDS);
    const timer = window.setInterval(() => {
      void loadNodes(currentWorkspace, MAX_RECORDS);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isExpanded, currentWorkspace, loadNodes, clear]);

  const handleRestore = async (nodeId: string) => {
    if (!currentWorkspace) {
      toast.warning('请先选择工作区');
      return;
    }

    try {
      await timelineService.restoreNode(currentWorkspace, nodeId);
      await loadNodes(currentWorkspace, MAX_RECORDS);
      toast.success('时间轴还原成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'RESTORE_CANCELLED') return;
      toast.error(`时间轴还原失败: ${message}`);
    }
  };

  if (!isExpanded) return null;

  if (!currentWorkspace) {
    return (
      <div className="p-3 text-center text-gray-500 dark:text-gray-400 text-sm py-8">
        请先选择工作区
      </div>
    );
  }

  return (
    <div className="p-3">
      {isLoading && nodes.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          正在加载时间轴...
        </div>
      ) : error ? (
        <div className="text-center text-red-500 dark:text-red-400 text-sm py-8">
          加载时间轴失败：{error}
        </div>
      ) : nodes.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          暂无时间轴节点
        </div>
      ) : (
        <div className="space-y-2 max-h-[240px] overflow-y-auto">
          {nodes.map((node) => (
            <div
              key={node.nodeId}
              className="p-2 rounded text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {getOperationLabel(node)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {node.actor === 'system_restore'
                        ? 'restore'
                        : node.actor === 'ai'
                          ? 'ai'
                          : 'user'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {node.summary}
                  </div>
                  {node.impactScope.length > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate" title={node.impactScope.join('\n')}>
                      影响范围：{node.impactScope.join('、')}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">
                    {formatTime(node.createdAt)}
                  </div>
                  {node.restorable && (
                    <button
                      onClick={() => void handleRestore(node.nodeId)}
                      className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20"
                    >
                      还原
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const addTimelineNode = () => {
  // deprecated: 正式时间轴已切换到 workspace.db 事实层
};

export default HistorySection;
