/**
 * 未打开文档编辑聚合面板：
 * 只做 byFilePath 导航与来源提示，不再承担正式审阅入口。
 */

import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useDiffStore } from '../../stores/diffStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/chatStore';
import { documentService } from '../../services/documentService';
import { toast } from '../Common/Toast';

export const PendingDiffPanel: React.FC = () => {
  const { currentWorkspace } = useFileStore();
  const byFilePath = useDiffStore((s) => s.byFilePath);
  const byFilePathResolveStats = useDiffStore((s) => s.byFilePathResolveStats);
  const getPendingFileCount = useDiffStore((s) => s.getPendingFileCount);
  const setActiveChatTab = useChatStore((s) => s.setActiveTab);

  const [expanded, setExpanded] = useState(false);

  const pendingFiles = Object.entries(byFilePath).filter(([, diffs]) => diffs.length > 0);
  const count = getPendingFileCount();

  if (!currentWorkspace || count === 0) return null;

  return (
    <div className="flex-shrink-0 border-t border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {count} 个文件有待审阅的修改
          </span>
        </div>
        {expanded ? (
          <ChevronUpIcon className="w-4 h-4 text-amber-600" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-amber-600" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
          {pendingFiles.map(([filePath, diffs]) => {
            const stats = byFilePathResolveStats[filePath];
            const total = diffs.length;
            const resolved = stats?.resolved ?? total;
            const unresolved = Math.max(total - resolved, 0);
            const fileName = filePath.split('/').pop() || filePath;
            const sourceEntry = diffs.find((entry) => entry.chatTabId || entry.messageId) ?? diffs[0];

            return (
              <div
                key={filePath}
                className="flex items-center justify-between py-2 px-2 rounded bg-white dark:bg-gray-800/50 border border-amber-200 dark:border-amber-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={filePath}>
                    {fileName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {total} 处待审阅
                    {unresolved > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 ml-1">
                        （{unresolved} 处未 resolve）
                      </span>
                    )}
                  </div>
                  {sourceEntry?.messageId && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      来源消息 · {sourceEntry.messageId.slice(-8)}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      void documentService.openFile(filePath).catch((error) => {
                        toast.error(`打开文件失败: ${error instanceof Error ? error.message : String(error)}`);
                      });
                    }}
                    className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    打开文件
                  </button>
                  {sourceEntry?.chatTabId && (
                    <button
                      onClick={() => {
                        setActiveChatTab(sourceEntry.chatTabId!);
                      }}
                      className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      查看对话
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-amber-200 dark:border-amber-700 text-[11px] text-amber-800 dark:text-amber-200">
            该面板仅做聚合导航；正式审阅入口在消息流 diff 卡。
          </div>
        </div>
      )}
    </div>
  );
};
