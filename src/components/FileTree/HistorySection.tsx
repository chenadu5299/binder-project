import React, { useState, useEffect } from 'react';

export interface HistoryRecord {
  id: string;
  type: 'create_file' | 'delete_file' | 'rename_file' | 'move_file' | 'copy_file' | 
        'create_folder' | 'delete_folder' | 'rename_folder' |
        'save_file' | 'edit_file' |
        'ai_create_file' | 'ai_edit_file' |
        'import_file' | 'export_workspace';
  target: string; // 文件或文件夹路径
  timestamp: number;
  success: boolean;
  error?: string;
}

interface HistorySectionProps {
  isExpanded: boolean;
}

const HistorySection: React.FC<HistorySectionProps> = ({ isExpanded }) => {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const MAX_RECORDS = 50;

  // 加载历史记录
  useEffect(() => {
    if (isExpanded) {
      loadHistory();
    }
  }, [isExpanded]);

  const loadHistory = async () => {
    try {
      // TODO: 从本地存储或数据库加载历史记录
      // 暂时使用 localStorage
      const stored = localStorage.getItem('binder-history');
      if (stored) {
        const records = JSON.parse(stored) as HistoryRecord[];
        setHistory(records.slice(0, MAX_RECORDS));
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  };

  const getTypeLabel = (type: HistoryRecord['type']): string => {
    const labels: Record<HistoryRecord['type'], string> = {
      create_file: '创建文件',
      delete_file: '删除文件',
      rename_file: '重命名文件',
      move_file: '移动文件',
      copy_file: '复制文件',
      create_folder: '创建文件夹',
      delete_folder: '删除文件夹',
      rename_folder: '重命名文件夹',
      save_file: '保存文件',
      edit_file: '编辑文件',
      ai_create_file: 'AI 创建文件',
      ai_edit_file: 'AI 修改文件',
      import_file: '导入文件',
      export_workspace: '导出工作区',
    };
    return labels[type] || type;
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="p-3">
      {history.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          暂无历史记录
        </div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {history.map((record) => (
            <div
              key={record.id}
              className={`p-2 rounded text-sm border ${
                record.success
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium ${
                      record.success 
                        ? 'text-gray-900 dark:text-gray-100' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {getTypeLabel(record.type)}
                    </span>
                    {!record.success && (
                      <span className="text-xs text-red-600 dark:text-red-400">失败</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 truncate" title={record.target}>
                    {record.target.split('/').pop() || record.target}
                  </div>
                  {record.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {record.error}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">
                  {formatTime(record.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 导出函数：添加历史记录
export const addHistoryRecord = (record: Omit<HistoryRecord, 'id' | 'timestamp'>) => {
  try {
    const stored = localStorage.getItem('binder-history');
    const history: HistoryRecord[] = stored ? JSON.parse(stored) : [];
    
    const newRecord: HistoryRecord = {
      ...record,
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    // 添加到开头
    history.unshift(newRecord);

    // 限制最多50条
    const limited = history.slice(0, 50);

    localStorage.setItem('binder-history', JSON.stringify(limited));
  } catch (error) {
    console.error('保存历史记录失败:', error);
  }
};

export default HistorySection;

