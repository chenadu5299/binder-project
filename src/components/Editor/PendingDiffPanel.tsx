/**
 * Phase 5：批量 diff 确认面板
 * 展示 byFilePath 中所有 pending 文件；单文件确认 / 一键全部确认 / 全部拒绝
 */

import React, { useState } from 'react';
import { useDiffStore } from '../../stores/diffStore';
import { useFileStore } from '../../stores/fileStore';
import { ChevronDownIcon, ChevronUpIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { toast } from '../Common/Toast';
import { DiffActionService } from '../../services/DiffActionService';

export const PendingDiffPanel: React.FC = () => {
  const { currentWorkspace } = useFileStore();
  const byFilePath = useDiffStore((s) => s.byFilePath);
  const byFilePathResolveStats = useDiffStore((s) => s.byFilePathResolveStats);
  const getPendingFileCount = useDiffStore((s) => s.getPendingFileCount);

  const [expanded, setExpanded] = useState(false);

  const pendingFiles = Object.entries(byFilePath).filter(([, diffs]) => diffs.length > 0);
  const count = getPendingFileCount();

  if (!currentWorkspace || count === 0) return null;

  const handleAcceptAll = async () => {
    let ok = 0;
    let err = 0;
    for (const [filePath] of pendingFiles) {
      try {
        const entries = byFilePath[filePath] ?? [];
        // 取首个有效 agentTaskId/chatTabId 作为代表（workspace diffs 通常同属一个 task）
        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
        await DiffActionService.acceptFileDiffs(filePath, currentWorkspace ?? '', {
          chatTabId: rep?.chatTabId,
          agentTaskId: rep?.agentTaskId,
        });
        ok++;
      } catch (e) {
        err++;
        toast.error(`${filePath.split('/').pop()}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (ok > 0) toast.success(`已应用 ${ok} 个文件的修改`);
    if (err > 0) toast.error(`${err} 个文件应用失败`);
  };

  const handleRejectAll = async () => {
    for (const [filePath] of pendingFiles) {
      try {
        const entries = byFilePath[filePath] ?? [];
        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
        await DiffActionService.rejectFileDiffs(filePath, currentWorkspace ?? '', {
          chatTabId: rep?.chatTabId,
          agentTaskId: rep?.agentTaskId,
        });
      } catch (e) {
        toast.error(`${filePath.split('/').pop()}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    toast.info('已拒绝全部修改');
  };

  return (
    <div className="flex-shrink-0 border-t border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {count} 个文件有待确认的修改
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
            const failedCount = total - resolved;
            const fileName = filePath.split('/').pop() || filePath;

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
                    {total} 处修改
                    {failedCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 ml-1">
                        （{failedCount} 处未能显示，可确认后整体生效）
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        const entries = byFilePath[filePath] ?? [];
                        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
                        await DiffActionService.acceptFileDiffs(filePath, currentWorkspace ?? '', {
                          chatTabId: rep?.chatTabId,
                          agentTaskId: rep?.agentTaskId,
                        });
                        toast.success(`已应用 ${fileName} 的修改`);
                      } catch (e) {
                        toast.error(`接受失败: ${e instanceof Error ? e.message : String(e)}`);
                      }
                    }}
                    className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                  >
                    接受
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const entries = byFilePath[filePath] ?? [];
                        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
                        await DiffActionService.rejectFileDiffs(filePath, currentWorkspace ?? '', {
                          chatTabId: rep?.chatTabId,
                          agentTaskId: rep?.agentTaskId,
                        });
                        toast.info(`已拒绝 ${fileName} 的修改`);
                      } catch (e) {
                        toast.error(`拒绝失败: ${e instanceof Error ? e.message : String(e)}`);
                      }
                    }}
                    className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2 border-t border-amber-200 dark:border-amber-700">
            <button
              onClick={handleAcceptAll}
              className="px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700"
            >
              一键全部接受
            </button>
            <button
              onClick={handleRejectAll}
              className="px-3 py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              全部拒绝
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
