/**
 * DiffActionService — accepted/rejected/acceptAll 推进路径的唯一合法入口。
 *
 * 设计来源：A-AG-M-T-05_AgentTaskController设计.md §三
 * 受约束于：A-CORE-C-D-05_状态单一真源原则.md §6.6 规则7
 *
 * 所有 UI 组件（ToolCallCard、ChatMessages、DiffAllActionsBar、PendingDiffPanel）
 * 只调用本服务，不再直接调用 diffStore.acceptDiff / rejectDiff 或任何 markAgent* 函数。
 */

import type { Editor } from '@tiptap/react';
import {
  useDiffStore,
  buildAcceptReadRow,
  userVisibleMessageForSnapshotGate,
  type DiffExpireReason,
} from '../stores/diffStore';
import { runAcceptAllOrchestrator } from '../machines/acceptAllOrchestrator';
import { useAgentStore } from '../stores/agentStore';
import { useEditorStore } from '../stores/editorStore';
import { applyDiffReplaceInEditor } from '../utils/applyDiffReplaceInEditor';
import { markVerificationFailed } from '../utils/agentShadowLifecycle';
import { AgentTaskController } from './AgentTaskController';
import { DiffRetryController } from './DiffRetryController';
import { createPassedVerificationRecord } from '../types/agent_state';

export type DiffActionResult =
  | { success: true; from: number; to: number }
  | { success: false; expireReason: DiffExpireReason; toastMessage?: string };

export type AcceptAllResult = {
  applied: number;
  expired: number;
  anyApplied: boolean;
};

function resolveEditorBoundFilePath(editor: Editor): string | null {
  const tabs = useEditorStore.getState().tabs;
  const matched = tabs.find((tab) => tab.editor === editor);
  return matched?.filePath ?? null;
}

export const DiffActionService = {
  /**
   * 接受单条 diff（编辑器路径）。
   * 内部：buildAcceptReadRow → applyDiffReplaceInEditor
   *       → diffStore.acceptDiff → AgentTaskController.checkAndAdvanceStage
   * （A-AG-M-T-05 §3.3）
   */
  async acceptDiff(
    filePath: string,
    diffId: string,
    editor: Editor,
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<DiffActionResult> {
    const { chatTabId = '', agentTaskId } = options;
    const editorBoundFilePath = resolveEditorBoundFilePath(editor);
    console.log('[CROSS_FILE_TRACE][ACTION]', JSON.stringify({
      op: 'acceptDiff',
      filePath,
      diffId,
      chatTabId,
      agentTaskId,
    }));
    console.log('[CROSS_FILE_TRACE][ACCEPT_ROUTE]', JSON.stringify({
      method: 'acceptDiff',
      filePath,
      chatTabId,
      agentTaskId: agentTaskId ?? null,
      sourceDiffPool: 'byTab',
      hasEditorInstance: !!editor,
      editorBoundFilePath,
      downstream: ['buildAcceptReadRow', 'applyDiffReplaceInEditor', 'diffStore.acceptDiff'],
      backendApplyTargetFilePath: null,
    }));
    const entry = useDiffStore.getState().byTab[filePath]?.diffs.get(diffId);
    if (!entry) {
      return { success: false, expireReason: 'block_resolve_failed' };
    }

    // 读阶段：门禁校验 + 区间解析 + originalText 验证
    const readRow = await buildAcceptReadRow(entry, editor, {
      tabDocumentRevision: options.tabDocumentRevision,
      filePath,
    });

    if (readRow.kind === 'fail') {
      const reason = readRow.reason;
      useDiffStore.getState().updateDiff(filePath, diffId, {
        status: 'expired',
        expireReason: reason,
      });
      markVerificationFailed(chatTabId, agentTaskId, reason);
      AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
      const toastMessage = userVisibleMessageForSnapshotGate(reason) ?? undefined;
      return { success: false, expireReason: reason, toastMessage };
    }

    // 写阶段：应用编辑器替换
    const ins = applyDiffReplaceInEditor(
      editor,
      { from: readRow.from, to: readRow.to },
      entry.newText,
    );
    if (!ins) {
      // apply 失败 → 产生 DiffExecuteFailedEvent 交由 DiffRetryController 裁决
      // （A-DE-M-T-01 §6.5/§6.6.5：不直接推进 expired，由 controller 决定入队或耗尽）
      DiffRetryController.handleFailedEvent(
        {
          diffId,
          code: 'E_APPLY_FAILED',
          retryable: true,
          route_source: entry.routeSource ?? (entry.positioningPath === 'Anchor' ? 'selection' : 'block_search'),
          agentTaskId,
          chatTabId,
          timestamp: Date.now(),
          retryCount: 0,
        },
        filePath,
        'apply_replace_failed',
      );
      return { success: false, expireReason: 'apply_replace_failed' };
    }

    // apply 成功：从重试队列移除（可能是重试路径进来的）
    DiffRetryController._remove(diffId);

    useDiffStore.getState().acceptDiff(filePath, diffId, {
      from: ins.insertFrom,
      to: ins.insertTo,
    });

    // 推进 tab 内容与 documentRevision（不再用于批量接受时同文件其它 diff 的过期闸门，见 diffPendingContentSync）
    const tab = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
    if (tab) {
      useEditorStore.getState().updateTabContent(tab.id, editor.getHTML());
    }

    AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
    DiffActionService.reconcileVerificationAfterSuccess(chatTabId, agentTaskId);

    return { success: true, from: ins.insertFrom, to: ins.insertTo };
  },

  /**
   * 拒绝单条 diff。
   * 内部：diffStore.rejectDiff → AgentTaskController.checkAndAdvanceStage
   * （A-AG-M-T-05 §3.4）
   *
   * reject 是用户主动决策，不等于 verification failed，
   * 所以不调用 markVerificationFailed。
   */
  rejectDiff(
    filePath: string,
    diffId: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    } = {},
  ): void {
    const { chatTabId = '', agentTaskId } = options;
    useDiffStore.getState().rejectDiff(filePath, diffId);
    AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
  },

  /**
   * 批量接受：编排器 preparing（重叠预检）+ processing（createdAt 倒序串行 runDiffCardAccept）。
   */
  async acceptAll(
    filePath: string,
    editor: Editor,
    diffIds: string[],
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<AcceptAllResult> {
    const { chatTabId = '', agentTaskId } = options;
    const editorBoundFilePath = resolveEditorBoundFilePath(editor);
    console.log('[CROSS_FILE_TRACE][ACTION]', JSON.stringify({
      op: 'acceptAll',
      filePath,
      diffIds,
      chatTabId,
      agentTaskId,
      tabDocumentRevision: options.tabDocumentRevision,
    }));
    console.log('[CROSS_FILE_TRACE][ACCEPT_ROUTE]', JSON.stringify({
      method: 'acceptAll',
      filePath,
      chatTabId,
      agentTaskId: agentTaskId ?? null,
      sourceDiffPool: 'byTab',
      hasEditorInstance: !!editor,
      editorBoundFilePath,
      downstream: ['runAcceptAllOrchestrator', 'diffCardMachine'],
      backendApplyTargetFilePath: null,
    }));

    const result = await runAcceptAllOrchestrator({
      filePath,
      editor,
      diffIds,
      tabDocumentRevision: options.tabDocumentRevision,
      chatTabId,
      agentTaskId,
    });

    AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
    DiffActionService.reconcileVerificationAfterSuccess(chatTabId, agentTaskId);

    return result;
  },

  /**
   * 接受一个已 resolve（byTab + byFilePath 双轨）的 diff 卡片。
   *
   * 应用场景：`update_file` 进入 contentBlocks 后、文件已打开并 resolve 为 DiffCard。
   * 执行顺序：
   *   1. acceptDiff —— 接受 byTab diff
   *   2. acceptFileDiffs —— 清除对应 byFilePath 条目并写回 workspace
   */
  async acceptResolvedDiffCard(
    filePath: string,
    diffId: string,
    fileDiffIndex: number | undefined,
    workspacePath: string,
    editor: Editor,
    options: {
      tabDocumentRevision: number;
      chatTabId?: string;
      agentTaskId?: string;
    },
  ): Promise<DiffActionResult> {
    console.log('[CROSS_FILE_TRACE][ACCEPT_ROUTE]', JSON.stringify({
      method: 'acceptResolvedDiffCard',
      filePath,
      chatTabId: options.chatTabId ?? '',
      agentTaskId: options.agentTaskId ?? null,
      sourceDiffPool: 'byTab + byFilePath(resolved)',
      hasEditorInstance: !!editor,
      editorBoundFilePath: resolveEditorBoundFilePath(editor),
      downstream: ['acceptDiff', 'acceptFileDiffs'],
      backendApplyTargetFilePath: filePath,
      fileDiffIndex: fileDiffIndex ?? null,
    }));
    const result = await DiffActionService.acceptDiff(filePath, diffId, editor, options);
    if (!result.success) return result;
    if (fileDiffIndex == null || fileDiffIndex < 0) {
      return result;
    }
    await DiffActionService.acceptFileDiffs(filePath, workspacePath, {
      chatTabId: options.chatTabId,
      agentTaskId: options.agentTaskId,
      diffIndices: [fileDiffIndex],
    });
    return result;
  },

  /**
   * 拒绝一个已 resolve（byTab + byFilePath 双轨）的 diff 卡片。
   *
   * 应用场景：DiffCard（已 resolve 状态）onReject 按钮 —— 此时 byFilePath 和 byTab 各有一条记录。
   * 内部：
   *   1. diffStore.removeFileDiffEntry — 移除 byFilePath 条目
   *   2. diffStore.rejectDiff — 标记 byTab 条目为 rejected
   *   3. AgentTaskController.checkAndAdvanceStage
   */
  rejectResolvedDiffCard(
    filePath: string,
    diffId: string,
    fileDiffIndex: number,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    } = {},
  ): void {
    const { chatTabId = '', agentTaskId } = options;
    if (fileDiffIndex < 0) {
      useDiffStore.getState().rejectDiff(filePath, diffId);
      AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
      return;
    }
    useDiffStore.getState().removeFileDiffEntry(filePath, fileDiffIndex);
    useDiffStore.getState().rejectDiff(filePath, diffId);
    AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);
  },

  /**
   * 拒绝单条未 resolve 的 workspace file diff（仅 byFilePath 路径）。
   *
   * 应用场景：FileDiffCard onReject — 此时只有 byFilePath 条目，无对应 byTab diff。
   * 内部：
   *   1. diffStore.removeFileDiffEntry — 移除 byFilePath 条目
   *   2. AgentTaskController.handleFileDiffResolution(rejected)
   */
  rejectFileDiffEntry(
    filePath: string,
    fileDiffIndex: number,
    _workspacePath: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    } = {},
  ): void {
    const { chatTabId = '', agentTaskId } = options;
    useDiffStore.getState().removeFileDiffEntry(filePath, fileDiffIndex);
    AgentTaskController.handleFileDiffResolution({ agentTaskId, chatTabId, outcome: 'rejected' });
  },

  /**
   * 接受 workspace 文件 diff（byFilePath 路径，调用后端 accept_file_diffs）。
   * 内部委托给 diffStore.acceptFileDiffs，完成后触发 checkAndAdvanceStage。
   */
  async acceptFileDiffs(
    filePath: string,
    workspacePath: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
      diffIndices?: number[];
    } = {},
  ): Promise<void> {
    const { chatTabId = '', agentTaskId, diffIndices } = options;
    console.log('[CROSS_FILE_TRACE][ACTION]', JSON.stringify({
      op: 'acceptFileDiffs',
      filePath,
      workspacePath,
      chatTabId,
      agentTaskId,
      diffIndices,
    }));
    console.log('[CROSS_FILE_TRACE][ACCEPT_ROUTE]', JSON.stringify({
      method: 'acceptFileDiffs',
      filePath,
      chatTabId,
      agentTaskId: agentTaskId ?? null,
      sourceDiffPool: 'byFilePath',
      hasEditorInstance: false,
      editorBoundFilePath: null,
      downstream: ['diffStore.acceptFileDiffs', 'AgentTaskController.handleFileDiffResolution'],
      backendApplyTargetFilePath: filePath,
      diffIndices: diffIndices ?? null,
    }));
    await useDiffStore.getState().acceptFileDiffs(filePath, workspacePath, diffIndices);
    AgentTaskController.handleFileDiffResolution({ agentTaskId, chatTabId, outcome: 'accepted' });
    DiffActionService.reconcileVerificationAfterSuccess(chatTabId, agentTaskId);
  },

  /**
   * 拒绝 workspace 文件 diff。
   * 内部委托给 diffStore.rejectFileDiffs。
   * rejectFileDiffs 移除条目后不再调用 markAgentRejected（见 diffStore 变更说明）。
   */
  async rejectFileDiffs(
    filePath: string,
    workspacePath: string,
    options: {
      chatTabId?: string;
      agentTaskId?: string;
    } = {},
  ): Promise<void> {
    const { chatTabId = '', agentTaskId } = options;
    console.log('[CROSS_FILE_TRACE][ACTION]', JSON.stringify({
      op: 'rejectFileDiffs',
      filePath,
      workspacePath,
      chatTabId,
      agentTaskId,
    }));
    await useDiffStore.getState().rejectFileDiffs(filePath, workspacePath);
    AgentTaskController.handleFileDiffResolution({ agentTaskId, chatTabId, outcome: 'rejected' });
  },

  reconcileVerificationAfterSuccess(
    chatTabId: string | undefined,
    agentTaskId: string | undefined,
  ): void {
    if (!chatTabId || !agentTaskId) return;
    const runtime = useAgentStore.getState().runtimesByTab[chatTabId];
    if (!runtime?.currentTask || runtime.currentTask.id !== agentTaskId) return;

    const hasOutstandingDiffFailure = Object.values(useDiffStore.getState().byTab).some((tab) =>
      [...tab.diffs.values()].some(
        (entry) =>
          entry.agentTaskId === agentTaskId &&
          (entry.status === 'expired' || entry.executionExposure != null),
      ),
    );
    if (hasOutstandingDiffFailure) return;

    useAgentStore
      .getState()
      .setVerification(chatTabId, createPassedVerificationRecord(agentTaskId, 'diff_errors_cleared'));
  },
};
