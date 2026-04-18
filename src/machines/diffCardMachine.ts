/**
 * Diff 卡片级状态机（设计文档 §3 + §7）。
 * pending 上 ACCEPT → working（校验 + 应用）→ applied | expired | applyRetryable | rejected。
 */

import { setup, fromPromise, createActor } from 'xstate';
import type { Editor } from '@tiptap/react';
import type { DiffEntry } from '../stores/diffStore';
import { buildAcceptReadRow } from '../stores/diffStore';
import { applyDiffReplaceInEditor } from '../utils/applyDiffReplaceInEditor';
import { useDiffStore } from '../stores/diffStore';
import { DiffRetryController } from '../services/DiffRetryController';
import { markVerificationFailed } from '../utils/agentShadowLifecycle';
import { withSuppressedPendingContentSyncAsync } from '../services/diffPendingContentSync';

export type DiffCardActorInput = {
  filePath: string;
  entry: DiffEntry;
  editor: Editor;
  tabDocumentRevision?: number;
  chatTabId?: string;
  agentTaskId?: string;
};

type DiffCardContext = DiffCardActorInput;

export type DiffCardActorEvents =
  | { type: 'ACCEPT' }
  | { type: 'CONTENT_CHANGED' }
  | { type: 'REJECT' };

type WorkOutput =
  | { outcome: 'applied' }
  | { outcome: 'expired' }
  | { outcome: 'apply_retryable' };

const acceptWork = fromPromise(async ({ input }: { input: DiffCardActorInput }): Promise<WorkOutput> => {
  const { filePath, entry, editor, tabDocumentRevision, chatTabId = '', agentTaskId } = input;

  const readRow = await buildAcceptReadRow(entry, editor, {
    filePath,
    tabDocumentRevision,
  });

  if (readRow.kind === 'fail') {
    const reason = readRow.reason;
    useDiffStore.getState().updateDiff(filePath, entry.diffId, {
      status: 'expired',
      expireReason: reason,
    });
    markVerificationFailed(chatTabId, agentTaskId, reason);
    return { outcome: 'expired' };
  }

  return withSuppressedPendingContentSyncAsync(async () => {
    const row = readRow;
    const ins = applyDiffReplaceInEditor(
      editor,
      { from: row.from, to: row.to },
      row.diff.newText,
      { focus: false, scrollIntoView: false },
    );
    if (!ins) {
      DiffRetryController.handleFailedEvent(
        {
          diffId: entry.diffId,
          code: 'E_APPLY_FAILED',
          retryable: true,
          route_source:
            entry.routeSource ?? (entry.positioningPath === 'Anchor' ? 'selection' : 'block_search'),
          agentTaskId,
          chatTabId,
          timestamp: Date.now(),
          retryCount: 0,
        },
        filePath,
        'apply_replace_failed',
      );
      return { outcome: 'apply_retryable' };
    }

    DiffRetryController._remove(entry.diffId);
    useDiffStore.getState().acceptDiff(filePath, entry.diffId, {
      from: ins.insertFrom,
      to: ins.insertTo,
    });
    return { outcome: 'applied' };
  });
});

export const diffCardMachine = setup({
  types: {
    context: {} as DiffCardContext,
    events: {} as DiffCardActorEvents,
    input: {} as DiffCardActorInput,
  },
  actors: {
    acceptWork,
  },
}).createMachine({
  id: 'diffCard',
  initial: 'pending',
  context: ({ input }) => ({ ...input }),
  states: {
    pending: {
      on: {
        ACCEPT: { target: 'working' },
        CONTENT_CHANGED: { target: 'expired' },
        REJECT: { target: 'rejected' },
      },
    },
    working: {
      invoke: {
        id: 'acceptWork',
        src: 'acceptWork',
        input: ({ context }) => ({
          filePath: context.filePath,
          entry: context.entry,
          editor: context.editor,
          tabDocumentRevision: context.tabDocumentRevision,
          chatTabId: context.chatTabId,
          agentTaskId: context.agentTaskId,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.outcome === 'applied',
            target: 'applied',
          },
          {
            guard: ({ event }) => event.output.outcome === 'expired',
            target: 'expired',
          },
          {
            guard: ({ event }) => event.output.outcome === 'apply_retryable',
            target: 'applyRetryable',
          },
          { target: 'expired' },
        ],
      },
    },
    applied: { type: 'final' },
    rejected: { type: 'final' },
    expired: { type: 'final' },
    applyRetryable: { type: 'final' },
  },
});

export type DiffCardTerminal = 'applied' | 'expired' | 'rejected' | 'apply_retryable';

export function runDiffCardAccept(input: DiffCardActorInput): Promise<DiffCardTerminal> {
  return new Promise((resolve) => {
    const actor = createActor(diffCardMachine, { input });
    let settled = false;
    const finish = (out: DiffCardTerminal) => {
      if (settled) return;
      settled = true;
      actor.stop();
      resolve(out);
    };
    actor.subscribe((snapshot) => {
      if (snapshot.status !== 'done') return;
      if (snapshot.matches('applied')) finish('applied');
      else if (snapshot.matches('applyRetryable')) finish('apply_retryable');
      else if (snapshot.matches('expired')) finish('expired');
      else if (snapshot.matches('rejected')) finish('rejected');
    });
    actor.start();
    actor.send({ type: 'ACCEPT' });
  });
}
