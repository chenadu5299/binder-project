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
  compareAcceptWriteOrder,
  collectIllegalPartialOverlapDiffIds,
  userVisibleMessageForSnapshotGate,
  type DiffExpireReason,
  type AcceptReadFailRow,
  type AcceptReadOkRow,
} from '../stores/diffStore';
import { useEditorStore } from '../stores/editorStore';
import { applyDiffReplaceInEditor } from '../utils/applyDiffReplaceInEditor';
import { markVerificationFailed } from '../utils/agentShadowLifecycle';
import { AgentTaskController } from './AgentTaskController';
import { DiffRetryController } from './DiffRetryController';

export type DiffActionResult =
  | { success: true; from: number; to: number }
  | { success: false; expireReason: DiffExpireReason; toastMessage?: string };

export type AcceptAllResult = {
  applied: number;
  expired: number;
  anyApplied: boolean;
};

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
    console.log('[CROSS_FILE_TRACE][ACTION]', JSON.stringify({
      op: 'acceptDiff',
      filePath,
      diffId,
      chatTabId,
      agentTaskId,
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
          route_source: entry.positioningPath === 'Anchor' ? 'reference' : 'block_search',
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

    // 推进 revision，触发 expirePendingForStaleRevision
    const tab = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
    if (tab) {
      useEditorStore.getState().updateTabContent(tab.id, editor.getHTML());
    }

    AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);

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
   * 批量接受（稳定排序，先读后写）。
   * 内部：逐条 buildAcceptReadRow → 过滤非法重叠 → 逆序 apply
   *       → 统一 checkAndAdvanceStage
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
    console.log('[CROSS_FILE_TRACE][ACTION]', JSON.stringify({
      op: 'acceptAll',
      filePath,
      diffIds,
      chatTabId,
      agentTaskId,
      tabDocumentRevision: options.tabDocumentRevision,
    }));
    const store = useDiffStore.getState();

    const pending = diffIds
      .map((id) => store.byTab[filePath]?.diffs.get(id))
      .filter((e): e is NonNullable<typeof e> => e != null && e.status === 'pending');

    if (pending.length === 0) return { applied: 0, expired: 0, anyApplied: false };

    // 读阶段
    const phaseRead = await Promise.all(
      pending.map((d) =>
        buildAcceptReadRow(d, editor, {
          tabDocumentRevision: options.tabDocumentRevision,
          filePath,
        }),
      ),
    );

    const failed = phaseRead.filter((x): x is AcceptReadFailRow => x.kind === 'fail');
    const okRows = phaseRead.filter((x): x is AcceptReadOkRow => x.kind === 'ok');
    const illegalOverlapIds = collectIllegalPartialOverlapDiffIds(okRows);
    const overlapExpired = okRows.filter((row) => illegalOverlapIds.has(row.diff.diffId));
    const executable = okRows.filter((row) => !illegalOverlapIds.has(row.diff.diffId));

    // 过期失败条目，写 verification
    for (const f of failed) {
      store.updateDiff(filePath, f.diff.diffId, { status: 'expired', expireReason: f.reason });
      markVerificationFailed(
        f.diff.chatTabId ?? chatTabId,
        f.diff.agentTaskId ?? agentTaskId,
        `accept_all_${f.reason}`,
      );
    }
    for (const row of overlapExpired) {
      store.updateDiff(filePath, row.diff.diffId, {
        status: 'expired',
        expireReason: 'overlapping_range',
      });
      markVerificationFailed(
        row.diff.chatTabId ?? chatTabId,
        row.diff.agentTaskId ?? agentTaskId,
        'accept_all_overlapping_range',
      );
    }

    // 写阶段：稳定排序（from desc → to desc → createdAt asc → diffId asc）
    const sortedApply = [...executable].sort(compareAcceptWriteOrder);
    let applied = 0;
    let expired = failed.length + overlapExpired.length;

    for (const row of sortedApply) {
      const ins = applyDiffReplaceInEditor(
        editor,
        { from: row.from, to: row.to },
        row.diff.newText,
        { focus: false, scrollIntoView: false },
      );
      if (!ins) {
        DiffRetryController.handleFailedEvent(
          {
            diffId: row.diff.diffId,
            code: 'E_APPLY_FAILED',
            retryable: true,
            route_source: row.diff.positioningPath === 'Anchor' ? 'reference' : 'block_search',
            agentTaskId: row.diff.agentTaskId ?? agentTaskId,
            chatTabId: row.diff.chatTabId ?? chatTabId,
            timestamp: Date.now(),
            retryCount: 0,
          },
          filePath,
          'apply_replace_failed',
        );
        expired++;
        continue;
      }
      store.acceptDiff(filePath, row.diff.diffId, {
        from: ins.insertFrom,
        to: ins.insertTo,
      });
      applied++;
    }

    AgentTaskController.checkAndAdvanceStage(agentTaskId, chatTabId, filePath);

    return { applied, expired, anyApplied: applied > 0 };
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
    await useDiffStore.getState().acceptFileDiffs(filePath, workspacePath, diffIndices);
    AgentTaskController.handleFileDiffResolution({ agentTaskId, chatTabId, outcome: 'accepted' });
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
};
