import React, { useMemo, useState } from 'react';
import type { DiffEntry, ExecutionExposure } from '../../stores/diffStore';
import { useDiffStore } from '../../stores/diffStore';
import { useChatStore } from '../../stores/chatStore';
import { useAgentStore } from '../../stores/agentStore';

const PANEL_TOGGLE_KEY = 'binder.debug.execution_panel';

function readExecutionPanelToggle(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PANEL_TOGGLE_KEY) === '1';
}

function writeExecutionPanelToggle(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PANEL_TOGGLE_KEY, enabled ? '1' : '0');
}

function dedupeAndSortExposures(list: ExecutionExposure[]): ExecutionExposure[] {
  const seen = new Set<string>();
  const deduped: ExecutionExposure[] = [];
  for (const item of list) {
    if (seen.has(item.exposureId)) continue;
    seen.add(item.exposureId);
    deduped.push(item);
  }
  return deduped.sort((a, b) => b.timestamp - a.timestamp);
}

function collectDiffExposures(
  byTab: Record<string, { baseline: string | null; baselineSetAt: number; diffs: Map<string, DiffEntry> }>,
  activeChatTabId: string | null,
): ExecutionExposure[] {
  if (!activeChatTabId) return [];
  const result: ExecutionExposure[] = [];
  for (const tab of Object.values(byTab)) {
    for (const diff of tab.diffs.values()) {
      if (diff.chatTabId !== activeChatTabId) continue;
      if (diff.executionExposure) {
        result.push(diff.executionExposure);
      }
    }
  }
  return result;
}

export const ExecutionPanel: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(() => readExecutionPanelToggle());
  const byTab = useDiffStore((s) => s.byTab);
  const activeChatTabId = useChatStore((s) => s.activeTabId);
  const activeRuntime = useAgentStore((s) =>
    activeChatTabId ? s.runtimesByTab[activeChatTabId] : undefined,
  );
  const exposures = useMemo(
    () => dedupeAndSortExposures(collectDiffExposures(byTab, activeChatTabId)),
    [byTab, activeChatTabId],
  );

  if (!enabled) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[1200] w-[540px] max-w-[calc(100vw-24px)] max-h-[42vh] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div>
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            ExecutionExposure ({exposures.length})
          </div>
          {activeRuntime?.currentTask && (
            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
              stage={activeRuntime.stageState.stage}
              {activeRuntime.verification ? ` · verification=${activeRuntime.verification.status}` : ''}
              {activeRuntime.confirmation ? ` · confirmation=${activeRuntime.confirmation.status}` : ''}
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-[11px] text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={() => {
            writeExecutionPanelToggle(false);
            setEnabled(false);
          }}
        >
          关闭
        </button>
      </div>
      <div className="max-h-[calc(42vh-36px)] overflow-auto">
        {exposures.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">暂无执行观测</div>
        ) : (
          <table className="w-full table-fixed text-[11px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-gray-500 dark:text-gray-300">
                <th className="px-2 py-1 w-[106px]">时间</th>
                <th className="px-2 py-1 w-[56px]">级别</th>
                <th className="px-2 py-1 w-[64px]">阶段</th>
                <th className="px-2 py-1 w-[140px]">错误码</th>
                <th className="px-2 py-1">message / targetFile</th>
              </tr>
            </thead>
            <tbody>
              {exposures.map((item) => (
                <tr key={item.exposureId} className="border-t border-gray-100 dark:border-gray-800 align-top">
                  <td className="px-2 py-1 text-gray-500 dark:text-gray-400">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-200">{item.level}</td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-200">{item.phase}</td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-200 break-all">{item.code}</td>
                  <td className="px-2 py-1 text-gray-600 dark:text-gray-300">
                    <div className="break-all">{item.message}</div>
                    <div className="break-all text-gray-400 dark:text-gray-500">{item.targetFile}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export function enableExecutionPanelDebug(): void {
  writeExecutionPanelToggle(true);
}
