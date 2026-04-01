/**
 * 对话编辑 Diff 适配器（Phase-8 封板）
 *
 * 仅接受 Resolver2 规范格式，不再支持旧字段别名或 fallback：
 * diffId/startBlockId/endBlockId/startOffset/endOffset/originalText/newText/type
 */

import type { Editor } from '@tiptap/react';
import type { DiffEntry } from '../stores/diffStore';

interface CanonicalDiff {
  diffId?: string;
  startBlockId?: string;
  endBlockId?: string;
  startOffset?: number;
  endOffset?: number;
  originalText?: string;
  newText?: string;
  type?: 'replace' | 'delete' | 'insert';
  occurrenceIndex?: number;
  diff_type?: string;
}

function asNonNegativeInt(input: unknown, fallback: number): number {
  if (typeof input !== 'number' || Number.isNaN(input) || input < 0) return fallback;
  return Math.floor(input);
}

export function convertLegacyDiffToEntry(d: CanonicalDiff, index: number): DiffEntry | null {
  if (!d || typeof d !== 'object') return null;
  if (!d.startBlockId || !d.endBlockId) return null;

  const type = d.type === 'delete' || d.type === 'insert' ? d.type : 'replace';
  const occurrenceIndex =
    typeof d.occurrenceIndex === 'number' && !Number.isNaN(d.occurrenceIndex)
      ? Math.floor(d.occurrenceIndex)
      : undefined;

  return {
    diffId: d.diffId ?? `diff_${index}_${crypto.randomUUID()}`,
    startBlockId: d.startBlockId,
    endBlockId: d.endBlockId,
    startOffset: asNonNegativeInt(d.startOffset, 0),
    endOffset: asNonNegativeInt(d.endOffset, 0),
    originalText: typeof d.originalText === 'string' ? d.originalText : '',
    newText: typeof d.newText === 'string' ? d.newText : '',
    type,
    status: 'pending',
    ...(occurrenceIndex !== undefined ? { occurrenceIndex } : {}),
    ...(typeof d.diff_type === 'string' && d.diff_type ? { diffType: d.diff_type } : {}),
  };
}

export function convertLegacyDiffsToEntries(diffs: CanonicalDiff[]): DiffEntry[] {
  const result: DiffEntry[] = [];
  for (let i = 0; i < diffs.length; i++) {
    const entry = convertLegacyDiffToEntry(diffs[i], i);
    if (entry) result.push(entry);
  }
  return result;
}

export function convertLegacyDiffsToEntriesWithFallback(
  diffs: CanonicalDiff[],
  _editor: Editor | null
): DiffEntry[] {
  return convertLegacyDiffsToEntries(diffs);
}
