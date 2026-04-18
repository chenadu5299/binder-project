/**
 * 编排级「接受全部」流程（设计文档 §4）。
 * preparing：收集 pending、按 createdAt 倒序、非法部分重叠预检；
 * processing：按队列串行调度子卡（runDiffCardAccept），避免批量读阶段后统一写导致的 revision 闸门误伤。
 */

import type { Editor } from '@tiptap/react';
import {
  buildAcceptReadRow,
  collectIllegalPartialOverlapDiffIds,
  type AcceptReadFailRow,
  type AcceptReadOkRow,
} from '../stores/diffStore';
import { useDiffStore } from '../stores/diffStore';
import { markVerificationFailed } from '../utils/agentShadowLifecycle';
import { useEditorStore } from '../stores/editorStore';
import { runDiffCardAccept } from './diffCardMachine';

export type AcceptAllOrchestratorResult = {
  applied: number;
  expired: number;
  anyApplied: boolean;
};

export type AcceptAllOrchestratorOptions = {
  filePath: string;
  editor: Editor;
  diffIds: string[];
  tabDocumentRevision?: number;
  chatTabId?: string;
  agentTaskId?: string;
};

/**
 * 按 §4.4：队列按 createdAt 倒序（后生成的先应用，减少 offset 连锁）；
 * 非法部分重叠在 preparing 阶段整批标过期（与既有 DE-OUT-002 一致）。
 */
export async function runAcceptAllOrchestrator(
  options: AcceptAllOrchestratorOptions,
): Promise<AcceptAllOrchestratorResult> {
  const { filePath, editor, diffIds, tabDocumentRevision, chatTabId = '', agentTaskId = '' } = options;
  const store = useDiffStore.getState();

  const pending = diffIds
    .map((id) => store.byTab[filePath]?.diffs.get(id))
    .filter((e): e is NonNullable<typeof e> => e != null && e.status === 'pending');

  if (pending.length === 0) {
    return { applied: 0, expired: 0, anyApplied: false };
  }

  // preparing：并行读阶段，用于非法部分重叠检测
  const phaseRead = await Promise.all(
    pending.map((d) =>
      buildAcceptReadRow(d, editor, {
        tabDocumentRevision,
        filePath,
      }),
    ),
  );

  const failed = phaseRead.filter((x): x is AcceptReadFailRow => x.kind === 'fail');
  const okRows = phaseRead.filter((x): x is AcceptReadOkRow => x.kind === 'ok');
  const illegalOverlapIds = collectIllegalPartialOverlapDiffIds(okRows);
  const overlapExpired = okRows.filter((row) => illegalOverlapIds.has(row.diff.diffId));

  for (const f of failed) {
    store.updateDiff(filePath, f.diff.diffId, { status: 'expired', expireReason: f.reason });
    markVerificationFailed(f.diff.chatTabId ?? chatTabId, f.diff.agentTaskId ?? agentTaskId, `accept_all_${f.reason}`);
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

  const executableIds = new Set(
    okRows.filter((row) => !illegalOverlapIds.has(row.diff.diffId)).map((r) => r.diff.diffId),
  );

  // processing：createdAt 大的优先（倒序）
  const queue = [...pending]
    .filter((e) => executableIds.has(e.diffId))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  let applied = 0;
  let expired = failed.length + overlapExpired.length;

  for (const entry of queue) {
    const latest = useDiffStore.getState().byTab[filePath]?.diffs.get(entry.diffId);
    if (!latest || latest.status !== 'pending') {
      expired++;
      continue;
    }

    const outcome = await runDiffCardAccept({
      filePath,
      entry: latest,
      editor,
      tabDocumentRevision,
      chatTabId: latest.chatTabId ?? chatTabId,
      agentTaskId: latest.agentTaskId ?? agentTaskId,
    });

    if (outcome === 'applied') {
      applied++;
    } else {
      expired++;
    }
  }

  if (applied > 0) {
    const tab = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
    if (tab) {
      useEditorStore.getState().updateTabContent(tab.id, editor.getHTML());
    }
  }

  return { applied, expired, anyApplied: applied > 0 };
}
