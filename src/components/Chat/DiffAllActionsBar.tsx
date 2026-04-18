/**
 * 问题3：全部接受/拒绝操作栏
 * Phase B：作用域枚举（本对话 / 当前编辑器 / 最后一条助手 / 全局二次确认）
 */

import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  useDiffStore,
  type DiffBulkScope,
} from '../../stores/diffStore';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/chatStore';
import { toast } from '../Common/Toast';
import { DiffActionService } from '../../services/DiffActionService';

const SCOPE_LABELS: Record<DiffBulkScope, string> = {
  current_chat_tab: '本对话',
  active_editor_tab: '当前编辑器',
  last_assistant_message: '最后一条助手',
  global: '全局（慎用）',
};

export const DiffAllActionsBar: React.FC = () => {
  const byTab = useDiffStore((s) => s.byTab);
  const byFilePath = useDiffStore((s) => s.byFilePath);
  const getPendingForBulk = useDiffStore((s) => s.getPendingForBulk);
  const editorTabs = useEditorStore((s) => s.tabs);
  const editorActiveTabId = useEditorStore((s) => s.activeTabId);
  const { currentWorkspace } = useFileStore();
  const chatTabs = useChatStore((s) => s.tabs);
  const activeChatTabId = useChatStore((s) => s.activeTabId);

  const [scope, setScope] = React.useState<DiffBulkScope>('current_chat_tab');

  const activeEditorTab = React.useMemo(
    () => editorTabs.find((t) => t.id === editorActiveTabId) ?? null,
    [editorTabs, editorActiveTabId]
  );

  const lastAssistantMessageId = React.useMemo(() => {
    if (!activeChatTabId) return null;
    const ct = chatTabs.find((t) => t.id === activeChatTabId);
    if (!ct) return null;
    for (let i = ct.messages.length - 1; i >= 0; i--) {
      if (ct.messages[i].role === 'assistant') return ct.messages[i].id;
    }
    return null;
  }, [chatTabs, activeChatTabId]);

  const pending = React.useMemo(() => {
    if (scope === 'global') {
      return getPendingForBulk('global', { chatTabId: null });
    }
    if (!activeChatTabId) {
      return { byTab: [], byFilePath: [], hasAny: false };
    }
    return getPendingForBulk(scope, {
      chatTabId: activeChatTabId,
      activeEditorTabId: editorActiveTabId,
      activeEditorFilePath: activeEditorTab?.filePath ?? null,
      messageId: lastAssistantMessageId,
    });
  }, [
    getPendingForBulk,
    scope,
    activeChatTabId,
    editorActiveTabId,
    activeEditorTab?.filePath,
    lastAssistantMessageId,
    byTab,
    byFilePath,
  ]);

  if (!pending.hasAny) return null;

  const canBulkWholeFile = (filePath: string, scopeRows: { diff_index: number }[]) => {
    const fullRows = useDiffStore.getState().byFilePath[filePath] ?? [];
    if (fullRows.length === 0 || scopeRows.length !== fullRows.length) return false;
    const idx = new Set(scopeRows.map((r) => r.diff_index));
    return fullRows.every((r) => idx.has(r.diff_index));
  };

  const confirmGlobal = (action: 'accept' | 'reject') =>
    window.confirm(
      action === 'accept'
        ? '将接受工作区内全部待确认修改（含其他对话），确定？'
        : '将拒绝工作区内全部待确认修改（含其他对话），确定？'
    );

  const handleAcceptAll = async () => {
    if (scope === 'global' && !confirmGlobal('accept')) return;
    {
      const storeState = useDiffStore.getState();
      console.log('[CROSS_FILE_TRACE][ACCEPT_ALL]', JSON.stringify({
        op: 'handleAcceptAll:start',
        scope,
        byTab: Object.fromEntries(
          Object.entries(storeState.byTab).map(([fp, tab]) => [
            fp,
            [...(tab?.diffs.values() ?? [])].filter((e) => e.status === 'pending').map((e) => ({
              diffId: e.diffId,
              status: e.status,
              agentTaskId: e.agentTaskId,
              chatTabId: e.chatTabId,
              toolCallId: e.toolCallId,
              originalText: e.originalText?.slice(0, 60),
              newText: e.newText?.slice(0, 60),
            })),
          ])
        ),
        byFilePath: Object.fromEntries(
          Object.entries(storeState.byFilePath).map(([fp, diffs]) => [
            fp,
            diffs.map((d) => ({
              diff_index: d.diff_index,
              agentTaskId: d.agentTaskId,
              chatTabId: d.chatTabId,
              originalText: d.original_text?.slice(0, 60),
              newText: d.new_text?.slice(0, 60),
            })),
          ])
        ),
      }));
    }
    try {
      let applied = 0;
      let expired = 0;
      let skippedFiles = 0;
      let backendWriteFailedFiles = 0;
      const refreshFilePaths = new Set<string>();
      for (const { filePath: tabFp, entries } of pending.byTab) {
        const tab = editorTabs.find((t) => t.filePath === tabFp);
        if (!tab?.editor) {
          console.warn('[ACCEPT_ALL] 找不到对应 editor，跳过 filePath:', tabFp,
            'known filepaths:', editorTabs.map((t) => t.filePath));
          continue;
        }
        // 关键：同文件同次批量必须一次事务执行，不能按 toolCallId 分批执行。
        const scopedDiffIds = [...new Set(entries.map((e) => e.diffId).filter(Boolean))];
        console.log('[CROSS_FILE_TRACE][ACCEPT_ENTRY]', JSON.stringify({
          sourceComponent: 'DiffAllActionsBar',
          method: 'DiffActionService.acceptAll',
          filePath: tabFp,
          diffIds: scopedDiffIds,
          sourcePool: 'byTab',
          route: 'editor_apply_batch',
          activeEditorFilePath: activeEditorTab?.filePath ?? null,
          chatTabId: activeChatTabId ?? null,
          scope,
        }));
        // 取首个有效的 chatTabId/agentTaskId 作为代表（同批 diff 通常属同一 task）
        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
        const result = await DiffActionService.acceptAll(
          tabFp,
          tab.editor,
          scopedDiffIds,
          {
            tabDocumentRevision: tab.documentRevision ?? 1,
            chatTabId: rep?.chatTabId,
            agentTaskId: rep?.agentTaskId,
          },
        );
        applied += result.applied;
        expired += result.expired;
        if (result.anyApplied) refreshFilePaths.add(tabFp);
        tab.editor.view.dispatch(tab.editor.state.tr);
      }
      // 所有文件批量处理完成后统一刷新一次，避免中途刷新导致后续同轮批量误判。
      const { refreshPositioningContextForEditor } = useChatStore.getState();
      for (const fp of refreshFilePaths) {
        refreshPositioningContextForEditor(fp);
      }
      for (const { filePath, entries } of pending.byFilePath) {
        if (!currentWorkspace) continue;
        if (!canBulkWholeFile(filePath, entries)) {
          skippedFiles++;
          continue;
        }
        const indices = [...new Set(entries.map((e) => e.diff_index))];
        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
        console.log('[CROSS_FILE_TRACE][ACCEPT_ENTRY]', JSON.stringify({
          sourceComponent: 'DiffAllActionsBar',
          method: 'DiffActionService.acceptFileDiffs',
          filePath,
          diffIndices: indices,
          sourcePool: 'byFilePath',
          route: 'backend_accept_file_diffs',
          activeEditorFilePath: activeEditorTab?.filePath ?? null,
          chatTabId: activeChatTabId ?? null,
          scope,
        }));
        try {
          await DiffActionService.acceptFileDiffs(filePath, currentWorkspace, {
            chatTabId: rep?.chatTabId,
            agentTaskId: rep?.agentTaskId,
            diffIndices: indices,
          });
          applied += entries.length;
        } catch (error) {
          backendWriteFailedFiles++;
          toast.error(
            `写盘失败（后端）: ${filePath.split('/').pop() || filePath} · ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (skippedFiles > 0) {
        toast.info(
          `有 ${skippedFiles} 个文件含其他作用域下的待确认项，已跳过整文件批量接受，请用单卡处理或切换作用域。`
        );
      }
      if (applied > 0 || expired > 0) {
        if (expired > 0) {
          toast.info(`部分修改因文档已变化或解析失败被跳过（共 ${expired} 处），其余 ${applied} 处已应用。`);
        } else {
          toast.success(`已应用 ${applied} 处修改（${SCOPE_LABELS[scope]}）`);
        }
      }
      if (backendWriteFailedFiles > 0) {
        toast.error(`后端写盘失败：${backendWriteFailedFiles} 个文件未完成写入。`);
      }
      if ((import.meta as any).env?.DEV) {
        console.debug('[diffStore] DIFF_BULK_ACTION accept', {
          scope,
          applied,
          expired,
          skippedFiles,
          backendWriteFailedFiles,
        });
      }
    } catch (e) {
      toast.error('批量接受中断：可能包含前端解析/应用异常。');
      console.error(e);
    }
  };

  const handleRejectAll = async () => {
    if (scope === 'global' && !confirmGlobal('reject')) return;
    try {
      let skippedFiles = 0;
      let backendRejectFailedFiles = 0;
      for (const { filePath: tabFp, entries } of pending.byTab) {
        const tab = editorTabs.find((t) => t.filePath === tabFp);
        for (const entry of entries) {
          DiffActionService.rejectDiff(tabFp, entry.diffId, {
            chatTabId: entry.chatTabId,
            agentTaskId: entry.agentTaskId,
          });
        }
        if (tab?.editor) {
          tab.editor.view.dispatch(tab.editor.state.tr);
        }
      }
      for (const { filePath, entries } of pending.byFilePath) {
        if (!currentWorkspace) continue;
        if (!canBulkWholeFile(filePath, entries)) {
          skippedFiles++;
          continue;
        }
        const rep = entries.find((e) => e.chatTabId && e.agentTaskId);
        try {
          await DiffActionService.rejectFileDiffs(filePath, currentWorkspace, {
            chatTabId: rep?.chatTabId,
            agentTaskId: rep?.agentTaskId,
          });
        } catch (error) {
          backendRejectFailedFiles++;
          toast.error(
            `后端队列清理失败: ${filePath.split('/').pop() || filePath} · ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (skippedFiles > 0) {
        toast.info(
          `有 ${skippedFiles} 个文件含其他来源的待确认项，已跳过整文件拒绝。`
        );
      }
      toast.info(`已拒绝全部修改（${SCOPE_LABELS[scope]}）`);
      if (backendRejectFailedFiles > 0) {
        toast.error(`后端拒绝队列处理失败：${backendRejectFailedFiles} 个文件未完成。`);
      }
      if ((import.meta as any).env?.DEV) {
        console.debug('[diffStore] DIFF_BULK_ACTION reject', {
          scope,
          skippedFiles,
          backendRejectFailedFiles,
        });
      }
    } catch (e) {
      toast.error('批量拒绝中断：包含前端处理异常。');
      console.error(e);
    }
  };

  return (
    <div className="flex-shrink-0 flex flex-col gap-1 px-4 py-2 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
          <span>作用域</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as DiffBulkScope)}
            className="text-[10px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1 py-0.5 max-w-[140px]"
          >
            {(Object.keys(SCOPE_LABELS) as DiffBulkScope[]).map((k) => (
              <option key={k} value={k}>
                {SCOPE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleAcceptAll}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          全部接受
        </button>
        <button
          type="button"
          onClick={handleRejectAll}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
          全部拒绝
        </button>
      </div>
      {scope === 'global' && (
        <p className="text-[10px] text-center text-amber-700 dark:text-amber-300">
          全局操作将影响所有对话与标签页，点击按钮时将再次确认。
        </p>
      )}
    </div>
  );
};
