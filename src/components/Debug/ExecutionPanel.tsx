import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import {
  ExecutionExposure,
  extractExecutionExposuresFromToolResultData,
  useDiffStore,
} from '../../stores/diffStore';

const PANEL_TOGGLE_KEY = 'binder.debug.execution_panel';
let PANEL_OWNER_CLAIMED = false;

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

function collectBackendExposuresFromActiveTab(
  tabs: ReturnType<typeof useChatStore.getState>['tabs'],
  activeTabId: string | null
): ExecutionExposure[] {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return [];
  const result: ExecutionExposure[] = [];
  for (const message of tab.messages) {
    for (const block of message.contentBlocks ?? []) {
      if (block.type !== 'tool' && block.type !== 'authorization') continue;
      const exposures = extractExecutionExposuresFromToolResultData(block.toolCall?.result?.data);
      if (exposures.length > 0) {
        result.push(...exposures);
      }
    }
  }
  return result;
}

export const ExecutionPanel: React.FC = () => {
  const ownerRef = useRef(false);
  if (!ownerRef.current && !PANEL_OWNER_CLAIMED) {
    PANEL_OWNER_CLAIMED = true;
    ownerRef.current = true;
  }
  useEffect(() => {
    return () => {
      if (ownerRef.current) {
        PANEL_OWNER_CLAIMED = false;
      }
    };
  }, []);
  if (!ownerRef.current) return null;

  const [enabled, setEnabled] = useState<boolean>(() => readExecutionPanelToggle());
  const storeExposures = useDiffStore((s) => s.executionExposures);
  const chatTabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const backendExposures = useMemo(
    () => collectBackendExposuresFromActiveTab(chatTabs, activeTabId),
    [chatTabs, activeTabId]
  );
  const merged = useMemo(
    () => dedupeAndSortExposures([...storeExposures, ...backendExposures]),
    [storeExposures, backendExposures]
  );

  if (!enabled) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[1200] w-[540px] max-w-[calc(100vw-24px)] max-h-[42vh] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          ExecutionExposure ({merged.length})
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
        {merged.length === 0 ? (
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
              {merged.map((item) => (
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
