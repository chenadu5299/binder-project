/**
 * Phase 2b / Phase 3：基于 blockId 的 Diff 删除标记
 * 从 diffStore 获取 diffs，优先使用 mappedFrom/mappedTo，否则 blockRangeToPMRange
 * appendTransaction：用户编辑时 mapping 跟随
 * 使用 Plugin state 存储 DecorationSet，通过 meta 事务刷新，确保视图正确更新
 * 见《对话编辑 Diff 前端实现规范》
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, StateField } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { blockRangeToPMRange, clampDocRangeToContainingBlock } from '../../../utils/editorOffsetUtils';
import { useDiffStore } from '../../../stores/diffStore';

const DIFF_DELETE_STYLE = 'background-color: #FCEBEB; color: #A32D2D; text-decoration: line-through;';
const DIFF_ACCEPTED_STYLE = 'background-color: rgba(34, 197, 94, 0.2);';
/** 问题5：避免「改一个词却标一整段」，单段 decoration 最大长度 */
const MAX_DECORATION_LEN = 2000;

export const diffDecorationPluginKey = new PluginKey('diffDecoration');
const DIFF_REFRESH_META = 'diffStoreRefresh';
const mappingFlushSeqByFile = new Map<string, number>();

export interface DiffDecorationOptions {
  getFilePath: () => string | null;
}

function getRangeForDiff(
  doc: import('@tiptap/pm/model').Node,
  d: import('../../../stores/diffStore').DiffEntry
): { from: number; to: number } | null {
  if (d.mappedFrom != null && d.mappedTo != null && d.mappedFrom < d.mappedTo) {
    return { from: d.mappedFrom, to: d.mappedTo };
  }
  return blockRangeToPMRange(
    doc,
    d.startBlockId,
    d.startOffset,
    d.endBlockId,
    d.endOffset,
    {
      occurrenceIndex: d.occurrenceIndex,
      originalTextFallback: d.originalText,
    }
  );
}

function computeDecorationSet(
  doc: import('@tiptap/pm/model').Node,
  filePath: string | null
): DecorationSet {
  if (!filePath) return DecorationSet.empty;
  const storeState = useDiffStore.getState();
  const tab = storeState.byTab[filePath];
  const docSize = doc.content.size;
  const decorations: Decoration[] = [];

  if (!tab) return DecorationSet.create(doc, decorations);

  for (const d of tab.diffs.values()) {
    // 问题8：expired 不显示灰色删除线
    if (d.status === 'expired') continue;
    // 问题7：accepted 且未审阅确认 → 绿色背景
    if (d.status === 'accepted' && !d.reviewConfirmed && d.acceptedFrom != null && d.acceptedTo != null) {
      let from = d.acceptedFrom;
      let to = d.acceptedTo;
      let len = to - from;
      if (len > MAX_DECORATION_LEN) {
        const clamped = clampDocRangeToContainingBlock(doc, from, to);
        if (clamped) {
          from = clamped.from;
          to = clamped.to;
          len = to - from;
        }
      }
      if (from >= 0 && to <= docSize && from < to && len <= MAX_DECORATION_LEN) {
        decorations.push(
          Decoration.inline(from, to, { style: DIFF_ACCEPTED_STYLE, 'data-diff-id': d.diffId })
        );
      } else if (len > MAX_DECORATION_LEN) {
        console.warn('[DiffDecoration] accepted range too large after block clamp, skipped', {
          diffId: d.diffId,
          len,
        });
      }
      continue;
    }
    // pending → 红色删除线（问题5：超长时先尝试块内裁剪，再跳过）
    if (d.status === 'pending') {
      const range = getRangeForDiff(doc, d);
      if (!range) continue;
      if (range.from < 0 || range.to > docSize || range.from >= range.to) continue;
      let from = range.from;
      let to = range.to;
      let len = to - from;
      if (len > MAX_DECORATION_LEN) {
        const clamped = clampDocRangeToContainingBlock(doc, from, to);
        if (clamped) {
          from = clamped.from;
          to = clamped.to;
          len = to - from;
        }
        if (len > MAX_DECORATION_LEN) {
          console.warn('[DiffDecoration] pending range too large after block clamp, skipped', {
            diffId: d.diffId,
            len,
          });
          continue;
        }
      }
      decorations.push(
        Decoration.inline(from, to, {
          style: DIFF_DELETE_STYLE,
          'data-diff-id': d.diffId,
        })
      );
    }
  }
  return DecorationSet.create(doc, decorations);
}

function collectDecorationRangesByDiffId(set: DecorationSet): Map<string, { from: number; to: number }> {
  const ranges = new Map<string, { from: number; to: number }>();
  for (const deco of set.find()) {
    if (deco.from >= deco.to) continue;
    const spec = deco.spec as Record<string, unknown>;
    const diffId = spec?.['data-diff-id'];
    if (typeof diffId !== 'string' || !diffId) continue;
    ranges.set(diffId, { from: deco.from, to: deco.to });
  }
  return ranges;
}

export const DiffDecorationExtension = Extension.create<DiffDecorationOptions>({
  name: 'diffDecoration',

  addOptions() {
    return {
      getFilePath: () => null,
    };
  },

  addProseMirrorPlugins() {
    const getFilePath = this.options.getFilePath;

    const diffDecorationState: StateField<DecorationSet> = {
      init(_config, state) {
        return computeDecorationSet(state.doc, getFilePath());
      },
      apply(tr, oldSet, _oldState, newState) {
        const filePath = getFilePath();
        const hasRefresh = tr.getMeta(DIFF_REFRESH_META);
        if (hasRefresh || tr.docChanged) {
          return computeDecorationSet(newState.doc, filePath);
        }
        return oldSet.map(tr.mapping, tr.doc);
      },
    };

    return [
      new Plugin({
        key: diffDecorationPluginKey,
        state: {
          init: diffDecorationState.init,
          apply: diffDecorationState.apply,
        },
        props: {
          decorations(state) {
            return diffDecorationPluginKey.getState(state) ?? DecorationSet.empty;
          },
        },
        appendTransaction(transactions, oldState) {
          const docChangedTrs = transactions.filter((tr) => tr.docChanged);
          if (docChangedTrs.length === 0) return null;
          const filePath = getFilePath();
          if (!filePath) return null;

          const { updateDiff, getPendingDiffs, getAcceptedForReview } = useDiffStore.getState();
          const pending = getPendingDiffs(filePath);
          const acceptedForReview = getAcceptedForReview(filePath);
          const oldDecorations = (diffDecorationPluginKey.getState(oldState) as DecorationSet) ?? DecorationSet.empty;
          const decoratedRangesByDiffId = collectDecorationRangesByDiffId(oldDecorations);
          const updates: Array<{
            diffId: string;
            partial: { status?: 'expired'; mappedFrom?: number; mappedTo?: number; acceptedFrom?: number; acceptedTo?: number };
          }> = [];

          for (const d of pending) {
            const rangeOpts = {
              occurrenceIndex: d.occurrenceIndex,
              originalTextFallback: d.originalText,
            };
            const decoratedRange = decoratedRangesByDiffId.get(d.diffId);
            let from =
              d.mappedFrom ??
              decoratedRange?.from ??
              blockRangeToPMRange(
                oldState.doc,
                d.startBlockId,
                d.startOffset,
                d.endBlockId,
                d.endOffset,
                rangeOpts
              )?.from ??
              -1;
            let to =
              d.mappedTo ??
              decoratedRange?.to ??
              blockRangeToPMRange(
                oldState.doc,
                d.startBlockId,
                d.startOffset,
                d.endBlockId,
                d.endOffset,
                rangeOpts
              )?.to ??
              -1;
            if (from < 0 || to < 0 || from >= to) {
              updates.push({ diffId: d.diffId, partial: { status: 'expired' } });
              continue;
            }
            for (const tr of docChangedTrs) {
              from = tr.mapping.map(from, -1);
              to = tr.mapping.map(to, 1);
            }
            if (from >= to) {
              updates.push({ diffId: d.diffId, partial: { status: 'expired' } });
            } else {
              updates.push({ diffId: d.diffId, partial: { mappedFrom: from, mappedTo: to } });
            }
          }

          for (const d of acceptedForReview) {
            const decoratedRange = decoratedRangesByDiffId.get(d.diffId);
            let from = d.acceptedFrom ?? decoratedRange?.from;
            let to = d.acceptedTo ?? decoratedRange?.to;
            if (from == null || to == null) continue;
            for (const tr of docChangedTrs) {
              from = tr.mapping.map(from, -1);
              to = tr.mapping.map(to, 1);
            }
            if (from >= 0 && to > from) {
              updates.push({ diffId: d.diffId, partial: { acceptedFrom: from, acceptedTo: to } });
            }
          }

          if (updates.length > 0) {
            const seq = (mappingFlushSeqByFile.get(filePath) ?? 0) + 1;
            mappingFlushSeqByFile.set(filePath, seq);
            queueMicrotask(() => {
              if (mappingFlushSeqByFile.get(filePath) !== seq) {
                return;
              }
              for (const { diffId, partial } of updates) {
                updateDiff(filePath, diffId, partial);
              }
            });
          }

          return null;
        },
      }),
    ];
  },
});
