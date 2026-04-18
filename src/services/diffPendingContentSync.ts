/**
 * Diff 卡片状态机设计文档 §3.5：pending 状态下通过 ProseMirror transaction 监听目标区域，
 * 原文与 originalText 不一致时标记过期（取代全局 documentRevision 闸门）。
 */

import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { useDiffStore, buildExecutionAnchor, resolvePendingDiffRange } from '../stores/diffStore';
import { markVerificationFailed } from '../utils/agentShadowLifecycle';

let suppressPendingContentSyncDepth = 0;

/** 在应用 diff 替换/接受写入期间抑制监听，避免误将「刚替换完的区间」判为原文漂移。 */
export function withSuppressedPendingContentSync<T>(fn: () => T): T {
  suppressPendingContentSyncDepth++;
  try {
    return fn();
  } finally {
    suppressPendingContentSyncDepth--;
  }
}

export async function withSuppressedPendingContentSyncAsync<T>(fn: () => Promise<T>): Promise<T> {
  suppressPendingContentSyncDepth++;
  try {
    return await fn();
  } finally {
    suppressPendingContentSyncDepth--;
  }
}

export function isPendingContentSyncSuppressed(): boolean {
  return suppressPendingContentSyncDepth > 0;
}

/**
 * 对某文件全部 pending diff：解析区间并比对 doc.textBetween 与 originalText；
 * 不匹配或无法解析则标为 expired。
 */
export function syncPendingDiffsWithDocument(editor: Editor, filePath: string): void {
  if (suppressPendingContentSyncDepth > 0) return;
  const pending = useDiffStore.getState().getPendingDiffs(filePath);
  if (pending.length === 0) return;

  const doc = editor.state.doc;
  for (const entry of pending) {
    const fromTo = resolvePendingDiffRange(doc, filePath, entry);
    if (!fromTo) {
      useDiffStore.getState().updateDiff(filePath, entry.diffId, {
        status: 'expired',
        expireReason: 'block_resolve_failed',
      });
      if (entry.chatTabId && entry.agentTaskId) {
        markVerificationFailed(entry.chatTabId, entry.agentTaskId, 'diff_content_sync_unresolvable');
      }
      continue;
    }
    const docSize = doc.content.size;
    if (fromTo.from < 0 || fromTo.to > docSize || fromTo.from >= fromTo.to) {
      useDiffStore.getState().updateDiff(filePath, entry.diffId, {
        status: 'expired',
        expireReason: 'pm_range_invalid',
      });
      if (entry.chatTabId && entry.agentTaskId) {
        markVerificationFailed(entry.chatTabId, entry.agentTaskId, 'diff_content_sync_range');
      }
      continue;
    }
    const anchor = buildExecutionAnchor(filePath, entry);
    const currentText = doc.textBetween(fromTo.from, fromTo.to);
    if (currentText !== anchor.originalText) {
      useDiffStore.getState().updateDiff(filePath, entry.diffId, {
        status: 'expired',
        expireReason: 'original_text_mismatch',
      });
      if (entry.chatTabId && entry.agentTaskId) {
        markVerificationFailed(entry.chatTabId, entry.agentTaskId, 'diff_content_sync_text');
      }
    }
  }
}

/**
 * 在编辑器上注册 transaction 监听；仅 docChanged 时同步 pending diff。
 * 返回卸载函数。
 */
export function registerPendingDiffContentSync(editor: Editor, filePath: string): () => void {
  const onTr = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    if (suppressPendingContentSyncDepth > 0) return;
    syncPendingDiffsWithDocument(editor, filePath);
  };
  editor.on('transaction', onTr);
  return () => {
    editor.off('transaction', onTr);
  };
}
