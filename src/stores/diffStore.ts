/**
 * Phase 2a：对话编辑 Diff 独立存储
 * 见《对话编辑 Diff 数据格式规范》《AI功能优化开发计划-Phase2详细开发步骤》
 * Phase 2：Workspace 改造 - byFilePath、resolveFilePathDiffs
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { getRelativePath, normalizeWorkspacePath } from '../utils/pathUtils';
import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { applyDiffReplaceInEditor } from '../utils/applyDiffReplaceInEditor';
import {
  blockRangeToPMRange,
  findBlockByParaIndexAndText,
  findBlockByFuzzyNormalizedText,
} from '../utils/editorOffsetUtils';
import {
  editorMatchesContentSnapshot,
  editorMatchesBlockOrderSnapshot,
} from '../utils/contentSnapshotHash';
import { markAgentInvalidated, markAgentRejected } from '../utils/agentShadowLifecycle';

export type DiffEntryStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type DiffEntryType = 'replace' | 'delete' | 'insert';

/** P5：过期/失败时可解释原因（§九 expireReason） */
export type DiffExpireReason =
  | 'document_revision_mismatch'
  | 'document_revision_advanced'
  | 'content_snapshot_mismatch'
  | 'block_order_snapshot_mismatch'
  | 'original_text_mismatch'
  | 'pm_range_invalid'
  | 'block_resolve_failed'
  | 'apply_replace_failed'
  | 'overlapping_range';

export type ExecutionErrorCode =
  | 'E_ROUTE_MISMATCH'
  | 'E_TARGET_NOT_READY'
  | 'E_RANGE_UNRESOLVABLE'
  | 'E_ORIGINALTEXT_MISMATCH'
  | 'E_PARTIAL_OVERLAP'
  | 'E_BASELINE_MISMATCH'
  | 'E_APPLY_FAILED'
  | 'E_REFRESH_FAILED'
  | 'E_BLOCKTREE_NODE_MISSING'
  | 'E_BLOCKTREE_STALE'
  | 'E_BLOCKTREE_BUILD_FAILED';

export type ExecutionExposureLevel = 'info' | 'warn' | 'error';
export type ExecutionExposurePhase = 'route' | 'resolve' | 'validate' | 'apply' | 'refresh';

export interface ExecutionExposure {
  exposureId: string;
  level: ExecutionExposureLevel;
  phase: ExecutionExposurePhase;
  code: ExecutionErrorCode | string;
  message: string;
  targetFile: string;
  diffId?: string;
  baselineId?: string;
  routeSource?: 'selection' | 'reference' | 'block_search';
  timestamp: number;
}

const EXECUTION_ERROR_CODE_SET: ReadonlySet<string> = new Set([
  'E_ROUTE_MISMATCH',
  'E_TARGET_NOT_READY',
  'E_RANGE_UNRESOLVABLE',
  'E_ORIGINALTEXT_MISMATCH',
  'E_PARTIAL_OVERLAP',
  'E_BASELINE_MISMATCH',
  'E_APPLY_FAILED',
  'E_REFRESH_FAILED',
  'E_BLOCKTREE_NODE_MISSING',
  'E_BLOCKTREE_STALE',
  'E_BLOCKTREE_BUILD_FAILED',
]);

function forEachUniqueAgentPair(
  entries: Array<{ chatTabId?: string; agentTaskId?: string }>,
  visitor: (chatTabId: string, agentTaskId: string) => void,
) {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.chatTabId || !entry.agentTaskId) continue;
    const key = `${entry.chatTabId}:${entry.agentTaskId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visitor(entry.chatTabId, entry.agentTaskId);
  }
}

export function normalizeExecutionErrorCode(code: string | undefined): string {
  if (!code) return 'E_REFRESH_FAILED';
  return EXECUTION_ERROR_CODE_SET.has(code) ? code : 'E_REFRESH_FAILED';
}

function mapExpireReasonToExecutionCode(reason: DiffExpireReason): ExecutionErrorCode {
  switch (reason) {
    case 'document_revision_mismatch':
    case 'document_revision_advanced':
    case 'content_snapshot_mismatch':
    case 'block_order_snapshot_mismatch':
      return 'E_BASELINE_MISMATCH';
    case 'original_text_mismatch':
      return 'E_ORIGINALTEXT_MISMATCH';
    case 'pm_range_invalid':
    case 'block_resolve_failed':
      return 'E_RANGE_UNRESOLVABLE';
    case 'apply_replace_failed':
      return 'E_APPLY_FAILED';
    case 'overlapping_range':
      return 'E_PARTIAL_OVERLAP';
    default:
      return 'E_REFRESH_FAILED';
  }
}

function mapExpireReasonToPhase(reason: DiffExpireReason): ExecutionExposurePhase {
  switch (reason) {
    case 'apply_replace_failed':
      return 'apply';
    case 'document_revision_mismatch':
    case 'document_revision_advanced':
    case 'content_snapshot_mismatch':
    case 'block_order_snapshot_mismatch':
    case 'original_text_mismatch':
    case 'pm_range_invalid':
    case 'block_resolve_failed':
    case 'overlapping_range':
    default:
      return 'validate';
  }
}

/** Phase B：底部批量操作作用域（§6.6） */
export type DiffBulkScope =
  | 'current_chat_tab'
  | 'active_editor_tab'
  | 'last_assistant_message'
  | 'global';

/** Phase 2：后端 PendingDiffDto 对应结构（按文件路径存储） */
export interface FileDiffEntry {
  id: number;
  file_path: string;
  diff_index: number;
  original_text: string;
  new_text: string;
  para_index: number;
  diff_type: string;
  status: string;
  /** 归属的聊天 tab（用于 DiffAllActionsBar 仅处理当前对话） */
  chatTabId?: string;
  /** 产生该批 pending 的 update_file 工具调用 id，用于 workspace-pending 分桶，避免多轮串扰 */
  sourceToolCallId?: string;
  /** 归属助手消息 id（生命周期清理 / 按消息批量） */
  messageId?: string;
  /** Phase B/C：未能映射到编辑器装饰时保留在 byFilePath，供聊天内接受与「重新解析」 */
  resolveUnmapped?: boolean;
  /** Phase 2：候选归属的 Agent task id，用于确认/完成状态闭合 */
  agentTaskId?: string;
}

export interface DiffEntry {
  diffId: string;
  startBlockId: string;
  endBlockId: string;
  startOffset: number;
  endOffset: number;
  originalText: string;
  newText: string;
  type: DiffEntryType;
  status: DiffEntryStatus;
  acceptedAt?: number;
  /** Phase 3：用于全部接受时倒序排序（最新优先） */
  createdAt?: number;
  mappedFrom?: number;
  mappedTo?: number;
  /** 方案 A：关联到具体 tool call，避免多轮编辑时 diff 错配 */
  toolCallId?: string;
  /** 归属的聊天 tab（与 editor tabId 不同；批量操作按此过滤） */
  chatTabId?: string;
  /** Phase 2：候选归属的 Agent task id，用于确认/完成状态闭合 */
  agentTaskId?: string;
  /** 归属助手消息 id */
  messageId?: string;
  /** Phase C：展示用来源说明（消息/工具/轮次） */
  sourceLabel?: string;
  /** Phase B：同次写入批次版本（调试） */
  batchVersion?: number;
  /** Phase 3：workspace 来源时，对应后端的 diff_index */
  fileDiffIndex?: number;
  /** 问题7：接受后绿色背景的范围，用于 decoration */
  acceptedFrom?: number;
  acceptedTo?: number;
  /** 问题7：用户审阅确认后清除绿色，不再展示 */
  reviewConfirmed?: boolean;
  /** 生成 diff 时文档的 documentRevision（§2.1.1） */
  documentRevision?: number;
  positioningPath?: 'Anchor' | 'Resolver' | 'Legacy';
  /** P5：产生该条 diff 时所依据的 L 的 SHA-256（UTF-8） */
  contentSnapshotHash?: string;
  /** P5：产生 diff 时 L 中 data-block-id 文档序指纹（补结构级漂移） */
  blockOrderSnapshotHash?: string;
  /** P5：标为 expired 时的原因 */
  expireReason?: DiffExpireReason;
  /** DE-OBS-005：执行失败暴露，独立于 status 流转 */
  executionExposure?: ExecutionExposure;
  /** 与后端 `occurrence_index` / 全文文本第几处匹配对齐（0-based）；缺省等价于 0 */
  occurrenceIndex?: number;
  /** Resolver 精度：precise | block_level | document_level */
  diffType?: string;
}

/** Accept 前 revision 门禁：无快照版本或未传当前 tab 版本时不拦截（兼容旧 diff） */
export function canApplyDiffByRevision(
  entry: DiffEntry,
  tabDocumentRevision: number | undefined
): boolean {
  if (entry.documentRevision == null || tabDocumentRevision == null) return true;
  return entry.documentRevision === tabDocumentRevision;
}

/** §十三：单卡 / acceptAll 共用的 revision + L 快照 + 块序快照门禁；null 表示通过 */
export async function preApplySnapshotGatesForAccept(
  entry: DiffEntry,
  editor: Editor,
  tabDocumentRevision: number | undefined,
  _filePath?: string
): Promise<DiffExpireReason | null> {
  if (!canApplyDiffByRevision(entry, tabDocumentRevision)) {
    return 'document_revision_mismatch';
  }
  const html = editor.getHTML();
  if (!(await editorMatchesContentSnapshot(html, entry.contentSnapshotHash))) {
    return 'content_snapshot_mismatch';
  }
  if (!(await editorMatchesBlockOrderSnapshot(html, entry.blockOrderSnapshotHash))) {
    return 'block_order_snapshot_mismatch';
  }
  return null;
}

/** 单卡 Accept 快照门禁失败时的用户可见说明（与 preApplySnapshotGatesForAccept 返回值对应） */
export function userVisibleMessageForSnapshotGate(reason: DiffExpireReason): string {
  switch (reason) {
    case 'document_revision_mismatch':
      return '文档已在处理期间变更，本条修改已标记为过期';
    case 'content_snapshot_mismatch':
      return '当前文档与生成建议时的内容不一致，本条已标记为过期';
    case 'block_order_snapshot_mismatch':
      return '块结构顺序与生成建议时不一致，本条已标记为过期';
    case 'overlapping_range':
      return '本条与另一条待接受修改在文档上区间重叠，无法批量应用，已标记为过期';
    default:
      return '无法接受本条修改（状态已过期）';
  }
}

function normalizeExecutionExposure(input: unknown): ExecutionExposure | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const exposureId =
    typeof raw.exposureId === 'string' && raw.exposureId
      ? raw.exposureId
      : `exp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const level =
    raw.level === 'info' || raw.level === 'warn' || raw.level === 'error' ? raw.level : 'error';
  const phase =
    raw.phase === 'route' ||
    raw.phase === 'resolve' ||
    raw.phase === 'validate' ||
    raw.phase === 'apply' ||
    raw.phase === 'refresh'
      ? raw.phase
      : 'refresh';
  const code = normalizeExecutionErrorCode(
    typeof raw.code === 'string' ? raw.code : undefined
  );
  const message =
    typeof raw.message === 'string' && raw.message.trim().length > 0
      ? raw.message
      : 'execution exposure';
  const targetFile =
    typeof raw.targetFile === 'string' && raw.targetFile.trim().length > 0
      ? raw.targetFile
      : '<unknown>';
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
  const normalized: ExecutionExposure = {
    exposureId,
    level,
    phase,
    code,
    message,
    targetFile,
    timestamp,
  };
  if (typeof raw.diffId === 'string' && raw.diffId) normalized.diffId = raw.diffId;
  if (typeof raw.baselineId === 'string' && raw.baselineId) normalized.baselineId = raw.baselineId;
  if (
    raw.routeSource === 'selection' ||
    raw.routeSource === 'reference' ||
    raw.routeSource === 'block_search'
  ) {
    normalized.routeSource = raw.routeSource;
  }
  return normalized;
}

function makeDiffExecutionExposure(
  filePath: string,
  entry: DiffEntry,
  reason: DiffExpireReason
): ExecutionExposure {
  return {
    exposureId: `exp-${Date.now()}-${entry.diffId}`,
    level: 'warn',
    phase: mapExpireReasonToPhase(reason),
    code: mapExpireReasonToExecutionCode(reason),
    message: `diff expired: ${reason}`,
    targetFile: filePath,
    diffId: entry.diffId,
    timestamp: Date.now(),
  };
}

function dedupeExecutionExposures(existing: ExecutionExposure[], incoming: ExecutionExposure[]): ExecutionExposure[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((x) => x.exposureId));
  const merged = [...existing];
  for (const e of incoming) {
    if (seen.has(e.exposureId)) continue;
    seen.add(e.exposureId);
    merged.push(e);
  }
  return merged.sort((a, b) => a.timestamp - b.timestamp);
}

export function extractExecutionExposuresFromToolResultData(data: unknown): ExecutionExposure[] {
  if (data == null) return [];
  const parsed =
    typeof data === 'string'
      ? (() => {
          try {
            return JSON.parse(data);
          } catch {
            return null;
          }
        })()
      : data;
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;
  const list: ExecutionExposure[] = [];
  const single = normalizeExecutionExposure(obj.execution_exposure);
  if (single) list.push(single);
  if (Array.isArray(obj.execution_exposures)) {
    for (const item of obj.execution_exposures) {
      const normalized = normalizeExecutionExposure(item);
      if (normalized) list.push(normalized);
    }
  }
  return dedupeExecutionExposures([], list);
}

export interface AcceptReadOkRow {
  kind: 'ok';
  diff: DiffEntry;
  from: number;
  to: number;
}

export interface AcceptReadFailRow {
  kind: 'fail';
  diff: DiffEntry;
  reason: DiffExpireReason;
}

export type AcceptReadRow = AcceptReadOkRow | AcceptReadFailRow;

type AcceptReadOptions = {
  tabDocumentRevision?: number;
  filePath?: string;
};

type AcceptApplyResult = { applied: number; expired: number; anyApplied: boolean };

const toReadSortKey = (row: AcceptReadOkRow) => ({
  from: row.from,
  to: row.to,
  createdAt: row.diff.createdAt ?? 0,
  diffId: row.diff.diffId,
});

/** §9.1 读阶段：单卡/批量共用的候选解析+门禁校验 */
export async function buildAcceptReadRow(
  entry: DiffEntry,
  editor: Editor,
  options?: AcceptReadOptions
): Promise<AcceptReadRow> {
  const snapReason = await preApplySnapshotGatesForAccept(
    entry,
    editor,
    options?.tabDocumentRevision,
    options?.filePath
  );
  if (snapReason != null) {
    return { kind: 'fail', diff: entry, reason: snapReason };
  }

  const fromTo =
    entry.mappedFrom != null && entry.mappedTo != null
      ? { from: entry.mappedFrom, to: entry.mappedTo }
      : blockRangeToPMRange(
          editor.state.doc,
          entry.startBlockId,
          entry.startOffset,
          entry.endBlockId,
          entry.endOffset,
          {
            occurrenceIndex: entry.occurrenceIndex,
            originalTextFallback: entry.originalText,
          }
        );

  if (!fromTo) {
    console.warn('[对话编辑] accept-read: blockRangeToPMRange 返回 null', {
      diffId: entry.diffId,
      startBlockId: entry.startBlockId,
      endBlockId: entry.endBlockId,
    });
    return { kind: 'fail', diff: entry, reason: 'block_resolve_failed' };
  }

  const docSize = editor.state.doc.content.size;
  if (fromTo.from < 0 || fromTo.to > docSize || fromTo.from >= fromTo.to) {
    console.warn('[对话编辑] accept-read: 范围越界，跳过', {
      diffId: entry.diffId,
      from: fromTo.from,
      to: fromTo.to,
      docSize,
    });
    return { kind: 'fail', diff: entry, reason: 'pm_range_invalid' };
  }

  const currentText = editor.state.doc.textBetween(fromTo.from, fromTo.to);
  if (currentText !== entry.originalText) {
    console.warn('[对话编辑] accept-read: originalText 校验不匹配', {
      diffId: entry.diffId,
      originalPreview: entry.originalText.slice(0, 30),
      currentPreview: currentText.slice(0, 30),
    });
    return { kind: 'fail', diff: entry, reason: 'original_text_mismatch' };
  }

  return { kind: 'ok', diff: entry, from: fromTo.from, to: fromTo.to };
}

/** §9.1 写阶段稳定排序：from desc -> to desc -> createdAt asc -> diffId asc */
export function compareAcceptWriteOrder(a: AcceptReadOkRow, b: AcceptReadOkRow): number {
  if (a.from !== b.from) return b.from - a.from;
  if (a.to !== b.to) return b.to - a.to;
  const ak = toReadSortKey(a);
  const bk = toReadSortKey(b);
  if (ak.createdAt !== bk.createdAt) return ak.createdAt - bk.createdAt;
  return ak.diffId.localeCompare(bk.diffId);
}

function isStrictContain(lhs: AcceptReadOkRow, rhs: AcceptReadOkRow): boolean {
  return lhs.from <= rhs.from && lhs.to >= rhs.to;
}

/** DE-OUT-002：仅禁止“非法部分重叠”，完全包含允许 */
export function collectIllegalPartialOverlapDiffIds(rows: AcceptReadOkRow[]): Set<string> {
  const sorted = [...rows].sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    const ak = toReadSortKey(a);
    const bk = toReadSortKey(b);
    if (ak.createdAt !== bk.createdAt) return ak.createdAt - bk.createdAt;
    return ak.diffId.localeCompare(bk.diffId);
  });
  const expired = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const left = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const right = sorted[j];
      if (right.from >= left.to) break;
      const intersects = left.to > right.from && right.to > left.from;
      if (!intersects) continue;
      if (isStrictContain(left, right) || isStrictContain(right, left)) continue;
      expired.add(left.diff.diffId);
      expired.add(right.diff.diffId);
    }
  }

  return expired;
}

async function executeAcceptAllForPending(
  filePath: string,
  pending: DiffEntry[],
  editor: Editor,
  tabDocumentRevision: number | undefined,
  updateDiff: DiffStoreState['updateDiff'],
  acceptDiff: DiffStoreState['acceptDiff']
): Promise<AcceptApplyResult> {
  const phaseRead: AcceptReadRow[] = [];
  for (const d of pending) {
    phaseRead.push(
      await buildAcceptReadRow(d, editor, {
        tabDocumentRevision,
        filePath,
      })
    );
  }

  const failed = phaseRead.filter((x): x is AcceptReadFailRow => x.kind === 'fail');
  const okRows = phaseRead.filter((x): x is AcceptReadOkRow => x.kind === 'ok');
  const illegalOverlapIds = collectIllegalPartialOverlapDiffIds(okRows);
  const overlapExpired = okRows.filter((row) => illegalOverlapIds.has(row.diff.diffId));
  const executable = okRows.filter((row) => !illegalOverlapIds.has(row.diff.diffId));

  for (const f of failed) {
    updateDiff(filePath, f.diff.diffId, { status: 'expired', expireReason: f.reason });
    if (f.diff.chatTabId && f.diff.agentTaskId) {
      markAgentInvalidated(f.diff.chatTabId, f.diff.agentTaskId, `accept_all_${f.reason}`);
    }
  }
  for (const row of overlapExpired) {
    updateDiff(filePath, row.diff.diffId, {
      status: 'expired',
      expireReason: 'overlapping_range',
    });
    if (row.diff.chatTabId && row.diff.agentTaskId) {
      markAgentInvalidated(row.diff.chatTabId, row.diff.agentTaskId, 'accept_all_overlapping_range');
    }
  }

  const sortedApply = [...executable].sort(compareAcceptWriteOrder);
  let applied = 0;
  let expired = failed.length + overlapExpired.length;

  for (const row of sortedApply) {
    const inserted = applyDiffReplaceInEditor(
      editor,
      { from: row.from, to: row.to },
      row.diff.newText,
      { focus: false, scrollIntoView: false }
    );
    if (!inserted) {
      console.warn('[对话编辑] acceptAll: applyDiffReplaceInEditor 失败', { diffId: row.diff.diffId });
      updateDiff(filePath, row.diff.diffId, { status: 'expired', expireReason: 'apply_replace_failed' });
      if (row.diff.chatTabId && row.diff.agentTaskId) {
        markAgentInvalidated(row.diff.chatTabId, row.diff.agentTaskId, 'accept_all_apply_failed');
      }
      expired++;
      continue;
    }
    acceptDiff(filePath, row.diff.diffId, { from: inserted.insertFrom, to: inserted.insertTo });
    applied++;
  }

  return { applied, expired, anyApplied: applied > 0 };
}

export interface DiffStoreState {
  /** 按 filePath 隔离，每个文件独立 diff 数据 */
  byTab: Record<string, { baseline: string | null; baselineSetAt: number; diffs: Map<string, DiffEntry> }>;
  /** Phase 2：按文件路径存储的 pending diffs（来自 open_file_with_cache / open_docx_with_cache） */
  byFilePath: Record<string, FileDiffEntry[]>;
  /** Phase 2：resolve 统计；Phase B 增加 unmapped / usedFallback */
  byFilePathResolveStats: Record<
    string,
    { resolved: number; total: number; unmapped?: number; usedFallback?: number }
  >;
  /** DE-OBS-002：ExecutionExposure 观测流（独立于 diff 状态机） */
  executionExposures: ExecutionExposure[];
  recordExecutionExposures: (exposures: ExecutionExposure[]) => void;
  clearExecutionExposures: () => void;
  addDiffs: (filePath: string, entries: DiffEntry[]) => void;
  replaceDiffs: (filePath: string, entries: DiffEntry[], baseline?: string | null) => void;
  /** 方案 A：按 toolCallId 设置 diff；仅覆盖该 toolCall 下 pending/expired，保留 accepted/rejected */
  setDiffsForToolCall: (
    filePath: string,
    toolCallId: string,
    entries: DiffEntry[],
    baseline?: string | null,
    chatTabId?: string,
    messageId?: string,
    meta?: {
      sourceLabel?: string;
      batchVersion?: number;
      agentTaskId?: string;
      documentRevision?: number;
      positioningPath?: 'Anchor' | 'Resolver' | 'Legacy';
      /** 写入时编辑器 tab 当前版本；与 documentRevision 不一致则本条标 expired */
      currentTabRevision?: number;
      /** P5：与 L 对齐的内容快照哈希 */
      contentSnapshotHash?: string;
      /** P5：块 id 文档序指纹 */
      blockOrderSnapshotHash?: string;
    }
  ) => void;
  setBaseline: (filePath: string, html: string) => void;
  getBaseline: (filePath: string) => string | null;
  acceptDiff: (filePath: string, diffId: string, range?: { from: number; to: number }) => void;
  rejectDiff: (filePath: string, diffId: string) => void;
  getPendingDiffs: (filePath: string, toolCallId?: string) => DiffEntry[];
  /** Phase 3：用于展示的 diffs（pending + expired）。toolCallId 可选，不传则返回该文件全部 */
  getDisplayDiffs: (filePath: string, toolCallId?: string) => DiffEntry[];
  getDiff: (filePath: string, diffId: string) => DiffEntry | undefined;
  /** Phase 3：部分更新 diff（mappedFrom/mappedTo/status 等） */
  updateDiff: (
    filePath: string,
    diffId: string,
    partial: Partial<
      Pick<
        DiffEntry,
        | 'mappedFrom'
        | 'mappedTo'
        | 'status'
        | 'acceptedFrom'
        | 'acceptedTo'
        | 'reviewConfirmed'
        | 'expireReason'
        | 'executionExposure'
      >
    >
  ) => void;
  /** 问题7：审阅确认，清除绿色。filePath 不传则全部文档 */
  markReviewConfirmed: (filePath?: string) => void;
  /** 问题7：获取有待审阅确认的 accepted diffs（有绿色需清除） */
  getAcceptedForReview: (filePath?: string) => DiffEntry[];
  updateDiffMapping: (filePath: string, diffId: string, mappedFrom: number, mappedTo: number) => void;
  markExpired: (filePath: string, diffId: string) => void;
  /** 文档版本前进后，将 pending 且快照 revision 不一致的 diff 标为 expired */
  expirePendingForStaleRevision: (filePath: string, currentDocumentRevision: number) => void;
  /** Phase 3：全部接受（倒序执行；revision + contentSnapshotHash + originalText 校验）。toolCallId 可选 */
  acceptAll: (
    filePath: string,
    editor: Editor,
    toolCallId?: string,
    tabDocumentRevision?: number
  ) => Promise<{ applied: number; expired: number; anyApplied: boolean }>;
  /** Phase 3：按给定 diffId 子集执行一次批量接受（同文件一次事务，避免按 toolCall 分批）。 */
  acceptAllByDiffIds: (
    filePath: string,
    editor: Editor,
    diffIds: string[],
    tabDocumentRevision?: number
  ) => Promise<{ applied: number; expired: number; anyApplied: boolean }>;
  /** Phase 3：全部拒绝。toolCallId 可选 */
  rejectAll: (filePath: string, toolCallId?: string) => void;
  clear: (filePath: string) => void;
  /** Phase 2：设置文件 pending diffs；可选标注 chatTabId / sourceToolCallId（来自 AI 工具回调时传入） */
  setFilePathDiffs: (
    filePath: string,
    pendingDiffs: FileDiffEntry[],
    options?: { chatTabId?: string; sourceToolCallId?: string; messageId?: string; agentTaskId?: string }
  ) => void;
  /** Phase 2：获取有 pending diff 的文件数量 */
  getPendingFileCount: () => number;
  /** 聚合所有 pending（byTab + byFilePath），用于全部接受/拒绝操作栏。返回是否有任意 pending */
  getAllPending: () => { byTab: Array<{ filePath: string; entries: DiffEntry[] }>; byFilePath: Array<{ filePath: string; entries: FileDiffEntry[] }>; hasAny: boolean };
  /** 仅聚合指定聊天 tab 的 pending（无 chatTabId 的条目不参与，避免跨对话批量误操作） */
  getAllPendingForChatTab: (chatTabId: string) => {
    byTab: Array<{ filePath: string; entries: DiffEntry[] }>;
    byFilePath: Array<{ filePath: string; entries: FileDiffEntry[] }>;
    hasAny: boolean;
  };
  /** Phase B：指定助手消息下的 pending */
  getPendingForMessage: (
    chatTabId: string,
    messageId: string
  ) => {
    byTab: Array<{ filePath: string; entries: DiffEntry[] }>;
    byFilePath: Array<{ filePath: string; entries: FileDiffEntry[] }>;
    hasAny: boolean;
  };
  /** Phase B：按作用域取待批量集合（global 需由 UI 二次确认后再调用） */
  getPendingForBulk: (
    scope: DiffBulkScope,
    ctx: {
      chatTabId: string | null;
      activeEditorTabId?: string | null;
      activeEditorFilePath?: string | null;
      messageId?: string | null;
    }
  ) => {
    byTab: Array<{ filePath: string; entries: DiffEntry[] }>;
    byFilePath: Array<{ filePath: string; entries: FileDiffEntry[] }>;
    hasAny: boolean;
  };
  /** Phase B：删除消息时清理关联 Diff / 文件 pending 行 */
  cleanupDiffsForMessage: (chatTabId: string, messageId: string) => void;
  /** Phase B：关闭聊天 tab 时清理该对话下所有 Diff 索引 */
  cleanupDiffsForChatTab: (chatTabId: string) => void;
  /** Phase C：清除 unmapped 标记后再次尝试 resolve */
  retryResolveFilePathDiffs: (filePath: string, doc: PMNode) => {
    resolved: number;
    total: number;
    unmapped?: number;
    usedFallback?: number;
  };
  /** Phase 2：将 byFilePath 的 diffs resolve 到 byTab（按 filePath 键），需传入 doc */
  resolveFilePathDiffs: (
    filePath: string,
    doc: PMNode
  ) => {
    resolved: number;
    total: number;
    unmapped?: number;
    usedFallback?: number;
  };
  /** Phase 3：接受文件 diffs 并写盘 */
  acceptFileDiffs: (filePath: string, workspacePath: string, diffIndices?: number[]) => Promise<void>;
  /** Phase 3：拒绝文件 diffs */
  rejectFileDiffs: (filePath: string, workspacePath: string) => Promise<void>;
  /** 从 byFilePath 移除单条 diff（仅前端，用于单卡拒绝） */
  removeFileDiffEntry: (filePath: string, diffIndex: number) => void;
  /** 标记某文件的 diffs 已全部处理（接受/拒绝后），用于 UI 显示「修改已应用」 */
  isFileDiffsCleared: (filePath: string) => boolean;
}

const clearedFilePaths = new Set<string>();

/** byTab 中 workspace 文件 pending 的 toolCallId（按 update_file 工具调用 id 分桶，避免多轮覆盖） */
export function makeWorkspacePendingToolCallId(filePath: string, sourceToolCallId?: string): string {
  if (sourceToolCallId) return `workspace-pending:${filePath}:tc:${sourceToolCallId}`;
  return `workspace-pending:${filePath}`;
}

function matchesWorkspacePendingForFile(toolCallId: string | undefined, filePath: string): boolean {
  if (!toolCallId) return false;
  const p = `workspace-pending:${filePath}`;
  return toolCallId === p || toolCallId.startsWith(`${p}:tc:`);
}

export const useDiffStore = create<DiffStoreState>((set, get) => ({
  byTab: {},
  byFilePath: {},
  byFilePathResolveStats: {},
  executionExposures: [],

  recordExecutionExposures: (exposures) => {
    if (!Array.isArray(exposures) || exposures.length === 0) return;
    const normalized = exposures
      .map((e) => normalizeExecutionExposure(e))
      .filter((e): e is ExecutionExposure => e != null);
    if (normalized.length === 0) return;
    set((state) => ({
      executionExposures: dedupeExecutionExposures(state.executionExposures, normalized),
    }));
  },

  clearExecutionExposures: () => {
    set({ executionExposures: [] });
  },

  addDiffs: (filePath, entries) => {
    set((state) => {
      const tab = state.byTab[filePath] ?? { baseline: null, baselineSetAt: 0, diffs: new Map() };
      const newMap = new Map(tab.diffs);
      const baseTime = Date.now();
      entries.forEach((e, i) => {
        newMap.set(e.diffId, {
          ...e,
          status: 'pending' as DiffEntryStatus,
          createdAt: baseTime + i,
        });
      });
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, diffs: newMap } },
      };
    });
  },

  /** 替换该文件的 diffs（新批次时先清空再添加） */
  replaceDiffs: (filePath, entries, baseline?: string | null) => {
    set((state) => {
      const tab = state.byTab[filePath] ?? { baseline: null, baselineSetAt: 0, diffs: new Map() };
      const newMap = new Map<string, DiffEntry>();
      const baseTime = Date.now();
      entries.forEach((e, i) => {
        newMap.set(e.diffId, {
          ...e,
          status: 'pending' as DiffEntryStatus,
          createdAt: baseTime + i,
        });
      });
      const newBaseline = baseline !== undefined ? baseline : tab.baseline;
      return {
        byTab: {
          ...state.byTab,
          [filePath]: { baseline: newBaseline, baselineSetAt: tab.baselineSetAt, diffs: newMap },
        },
      };
    });
  },

  /** 方案 A：按 toolCallId 设置 diff；仅移除该 toolCall 下 pending/expired，保留用户已 accept/reject */
  setDiffsForToolCall: (filePath, toolCallId, entries, baseline, chatTabId, messageId, meta) => {
    const bv = meta?.batchVersion ?? Date.now();
    if ((import.meta as any).env?.DEV) {
      console.debug('[diffStore] DIFF_BATCH_UPSERT', {
        filePath,
        toolCallId,
        count: entries.length,
        chatTabId,
        messageId,
      });
    }
    const snapRev = meta?.documentRevision;
    const tabRev = meta?.currentTabRevision;
    const snapStale = snapRev != null && tabRev != null && snapRev !== tabRev;

    set((state) => {
      const tab = state.byTab[filePath] ?? { baseline: null, baselineSetAt: 0, diffs: new Map() };
      const newMap = new Map(tab.diffs);
      const exposureBatch: ExecutionExposure[] = [];
      for (const [id, e] of newMap.entries()) {
        if (
          e.toolCallId === toolCallId &&
          (e.status === 'pending' || e.status === 'expired')
        ) {
          newMap.delete(id);
        }
      }
      const baseTime = Date.now();
      entries.forEach((e, i) => {
        const normalizedExposure = normalizeExecutionExposure(e.executionExposure);
        const staleExposure = snapStale
          ? makeDiffExecutionExposure(filePath, { ...e, diffId: e.diffId }, 'document_revision_mismatch')
          : null;
        const finalExposure = staleExposure ?? normalizedExposure ?? undefined;
        if (finalExposure) {
          exposureBatch.push(finalExposure);
        }
        newMap.set(e.diffId, {
          ...e,
          toolCallId,
          chatTabId: chatTabId ?? e.chatTabId,
          agentTaskId: meta?.agentTaskId ?? e.agentTaskId,
          messageId: messageId ?? e.messageId,
          sourceLabel: meta?.sourceLabel ?? e.sourceLabel,
          batchVersion: bv,
          documentRevision: snapRev ?? e.documentRevision,
          positioningPath: meta?.positioningPath ?? e.positioningPath,
          contentSnapshotHash: meta?.contentSnapshotHash ?? e.contentSnapshotHash,
          blockOrderSnapshotHash: meta?.blockOrderSnapshotHash ?? e.blockOrderSnapshotHash,
          status: (snapStale ? 'expired' : 'pending') as DiffEntryStatus,
          expireReason: snapStale ? ('document_revision_mismatch' as const) : undefined,
          executionExposure: finalExposure,
          createdAt: baseTime + i,
        });
      });
      const newBaseline = baseline !== undefined ? baseline : tab.baseline;
      return {
        byTab: {
          ...state.byTab,
          [filePath]: { baseline: newBaseline, baselineSetAt: tab.baselineSetAt, diffs: newMap },
        },
        executionExposures: dedupeExecutionExposures(state.executionExposures, exposureBatch),
      };
    });

    if (snapStale) {
      const resolvedChatTabId = chatTabId ?? entries[0]?.chatTabId;
      const resolvedAgentTaskId = meta?.agentTaskId ?? entries[0]?.agentTaskId;
      if (resolvedChatTabId && resolvedAgentTaskId) {
        markAgentInvalidated(resolvedChatTabId, resolvedAgentTaskId, 'diff_batch_stale_revision');
      }
    }
  },

  setBaseline: (filePath, html) => {
    set((state) => {
      const tab = state.byTab[filePath] ?? { baseline: null, baselineSetAt: 0, diffs: new Map() };
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, baseline: html, baselineSetAt: Date.now() } },
      };
    });
  },

  getBaseline: (filePath) => {
    return get().byTab[filePath]?.baseline ?? null;
  },

  acceptDiff: (filePath, diffId, range?: { from: number; to: number }) => {
    set((state) => {
      const tab = state.byTab[filePath];
      if (!tab) return state;
      const entry = tab.diffs.get(diffId);
      if (!entry) return state;
      const newMap = new Map(tab.diffs);
      newMap.set(diffId, {
        ...entry,
        status: 'accepted',
        acceptedAt: Date.now(),
        acceptedFrom: range?.from,
        acceptedTo: range?.to,
      });
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, diffs: newMap } },
      };
    });
  },

  rejectDiff: (filePath, diffId) => {
    const entry = get().byTab[filePath]?.diffs.get(diffId);
    set((state) => {
      const tab = state.byTab[filePath];
      if (!tab) return state;
      const current = tab.diffs.get(diffId);
      if (!current) return state;
      const newMap = new Map(tab.diffs);
      newMap.set(diffId, { ...current, status: 'rejected' });
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, diffs: newMap } },
      };
    });
    if (entry?.chatTabId && entry.agentTaskId) {
      markAgentRejected(entry.chatTabId, entry.agentTaskId, 'diff_rejected');
    }
  },

  getPendingDiffs: (filePath, toolCallId?: string) => {
    const tab = get().byTab[filePath];
    if (!tab) return [];
    let list = [...tab.diffs.values()].filter((e) => e.status === 'pending');
    if (toolCallId != null) list = list.filter((e) => e.toolCallId === toolCallId);
    return list;
  },

  getDisplayDiffs: (filePath, toolCallId?: string) => {
    const tab = get().byTab[filePath];
    const allDiffs = tab ? [...tab.diffs.values()] : [];
    let list = tab
      ? allDiffs
          .filter((e) => e.status === 'pending' || e.status === 'expired' || e.status === 'accepted')
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      : [];
    if (toolCallId != null) list = list.filter((e) => e.toolCallId === toolCallId);
    return list;
  },

  getDiff: (filePath, diffId) => {
    return get().byTab[filePath]?.diffs.get(diffId);
  },

  updateDiff: (filePath, diffId, partial) => {
    set((state) => {
      const tab = state.byTab[filePath];
      if (!tab) return state;
      const entry = tab.diffs.get(diffId);
      if (!entry) return state;
      const newMap = new Map(tab.diffs);
      const nextEntry: DiffEntry = { ...entry, ...partial };
      let exposureToRecord =
        normalizeExecutionExposure(partial.executionExposure ?? nextEntry.executionExposure) ?? null;
      if (
        nextEntry.status === 'expired' &&
        nextEntry.expireReason != null &&
        exposureToRecord == null
      ) {
        exposureToRecord = makeDiffExecutionExposure(filePath, nextEntry, nextEntry.expireReason);
      }
      if (exposureToRecord != null) {
        nextEntry.executionExposure = exposureToRecord;
      }
      newMap.set(diffId, nextEntry);
      const nextExposures =
        exposureToRecord != null
          ? dedupeExecutionExposures(state.executionExposures, [exposureToRecord])
          : state.executionExposures;
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, diffs: newMap } },
        executionExposures: nextExposures,
      };
    });
  },

  updateDiffMapping: (filePath, diffId, mappedFrom, mappedTo) => {
    set((state) => {
      const tab = state.byTab[filePath];
      if (!tab) return state;
      const entry = tab.diffs.get(diffId);
      if (!entry) return state;
      const newMap = new Map(tab.diffs);
      newMap.set(diffId, { ...entry, mappedFrom, mappedTo });
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, diffs: newMap } },
      };
    });
  },

  markExpired: (filePath, diffId) => {
    const entry = get().byTab[filePath]?.diffs.get(diffId);
    get().updateDiff(filePath, diffId, { status: 'expired' });
    if (entry?.chatTabId && entry.agentTaskId) {
      markAgentInvalidated(entry.chatTabId, entry.agentTaskId, 'diff_expired');
    }
  },

  expirePendingForStaleRevision: (filePath, currentDocumentRevision) => {
    // Collect entries that will be expired before mutating state,
    // so we can call markAgentInvalidated (LEG-016 补齐: stale-revision expire 路径)
    const tab = get().byTab[filePath];
    if (!tab) return;
    const toInvalidate: Array<{ chatTabId: string; agentTaskId: string }> = [];
    for (const [, e] of tab.diffs.entries()) {
      if (e.status !== 'pending') continue;
      if (e.documentRevision != null && e.documentRevision !== currentDocumentRevision) {
        if (e.chatTabId && e.agentTaskId) {
          toInvalidate.push({ chatTabId: e.chatTabId, agentTaskId: e.agentTaskId });
        }
      }
    }

    set((state) => {
      const tab = state.byTab[filePath];
      if (!tab) return state;
      const newMap = new Map(tab.diffs);
      let changed = false;
      const newExposureBatch: ExecutionExposure[] = [];
      for (const [id, e] of newMap.entries()) {
        if (e.status !== 'pending') continue;
        if (e.documentRevision != null && e.documentRevision !== currentDocumentRevision) {
          const exposure = makeDiffExecutionExposure(
            filePath,
            { ...e, diffId: e.diffId || id },
            'document_revision_advanced'
          );
          newMap.set(id, {
            ...e,
            status: 'expired',
            expireReason: 'document_revision_advanced',
            executionExposure: exposure,
          });
          newExposureBatch.push(exposure);
          changed = true;
        }
      }
      if (!changed) return state;
      return {
        byTab: { ...state.byTab, [filePath]: { ...tab, diffs: newMap } },
        executionExposures: dedupeExecutionExposures(state.executionExposures, newExposureBatch),
      };
    });

    // Shadow invalidation after state update
    for (const { chatTabId, agentTaskId } of toInvalidate) {
      markAgentInvalidated(chatTabId, agentTaskId, 'diff_expired_stale_revision');
    }
  },

  acceptAll: async (filePath, editor, toolCallId, tabDocumentRevision) => {
    const pending = get().getPendingDiffs(filePath, toolCallId);
    const { updateDiff, acceptDiff } = get();
    return executeAcceptAllForPending(
      filePath,
      pending,
      editor,
      tabDocumentRevision,
      updateDiff,
      acceptDiff
    );
  },

  acceptAllByDiffIds: async (filePath, editor, diffIds, tabDocumentRevision) => {
    const idSet = new Set(diffIds.filter(Boolean));
    if (idSet.size === 0) {
      return { applied: 0, expired: 0, anyApplied: false };
    }
    const pending = get()
      .getPendingDiffs(filePath)
      .filter((d) => idSet.has(d.diffId));
    const { updateDiff, acceptDiff } = get();
    return executeAcceptAllForPending(
      filePath,
      pending,
      editor,
      tabDocumentRevision,
      updateDiff,
      acceptDiff
    );
  },

  rejectAll: (filePath, toolCallId?: string) => {
    const pending = get().getPendingDiffs(filePath, toolCallId);
    for (const d of pending) {
      get().rejectDiff(filePath, d.diffId);
    }
  },

  setFilePathDiffs: (filePath, pendingDiffs, options) => {
    clearedFilePaths.delete(filePath);
    if (pendingDiffs.length === 0) {
      set((state) => {
        const next = { ...state.byFilePath };
        delete next[filePath];
        const nextStats = { ...state.byFilePathResolveStats };
        delete nextStats[filePath];
        return { byFilePath: next, byFilePathResolveStats: nextStats };
      });
      return;
    }
    const chatTabId = options?.chatTabId;
    const sourceToolCallId = options?.sourceToolCallId;
    const messageId = options?.messageId;
    const agentTaskId = options?.agentTaskId;
    const tagged = pendingDiffs.map((row) => ({
      ...row,
      ...(chatTabId != null ? { chatTabId } : {}),
      ...(sourceToolCallId != null ? { sourceToolCallId } : {}),
      ...(messageId != null ? { messageId } : {}),
      ...(agentTaskId != null ? { agentTaskId } : {}),
    }));
    set((state) => ({
      byFilePath: { ...state.byFilePath, [filePath]: tagged },
    }));
  },

  getPendingFileCount: () => {
    return Object.keys(get().byFilePath).filter((fp) => (get().byFilePath[fp]?.length ?? 0) > 0).length;
  },

  getAllPending: () => {
    const { byTab, byFilePath } = get();
    const byTabList: Array<{ filePath: string; entries: DiffEntry[] }> = [];
    for (const [fp, tab] of Object.entries(byTab)) {
      const entries = [...(tab?.diffs.values() ?? [])].filter((e) => e.status === 'pending');
      if (entries.length > 0) byTabList.push({ filePath: fp, entries });
    }
    const byFilePathList: Array<{ filePath: string; entries: FileDiffEntry[] }> = [];
    for (const [fp, entries] of Object.entries(byFilePath)) {
      if ((entries?.length ?? 0) > 0) byFilePathList.push({ filePath: fp, entries: entries ?? [] });
    }
    return {
      byTab: byTabList,
      byFilePath: byFilePathList,
      hasAny: byTabList.length > 0 || byFilePathList.length > 0,
    };
  },

  getAllPendingForChatTab: (chatTabId) => {
    const { byTab, byFilePath } = get();
    const byTabList: Array<{ filePath: string; entries: DiffEntry[] }> = [];
    for (const [fp, tab] of Object.entries(byTab)) {
      const entries = [...(tab?.diffs.values() ?? [])].filter(
        (e) => e.status === 'pending' && e.chatTabId === chatTabId
      );
      if (entries.length > 0) byTabList.push({ filePath: fp, entries });
    }
    const byFilePathList: Array<{ filePath: string; entries: FileDiffEntry[] }> = [];
    for (const [fp, entries] of Object.entries(byFilePath)) {
      const filtered = (entries ?? []).filter((e) => e.chatTabId === chatTabId);
      if (filtered.length > 0) byFilePathList.push({ filePath: fp, entries: filtered });
    }
    return {
      byTab: byTabList,
      byFilePath: byFilePathList,
      hasAny: byTabList.length > 0 || byFilePathList.length > 0,
    };
  },

  getPendingForMessage: (chatTabId, messageId) => {
    const { byTab, byFilePath } = get();
    const byTabList: Array<{ filePath: string; entries: DiffEntry[] }> = [];
    for (const [fp, tab] of Object.entries(byTab)) {
      const entries = [...(tab?.diffs.values() ?? [])].filter(
        (e) =>
          e.status === 'pending' &&
          e.chatTabId === chatTabId &&
          e.messageId === messageId
      );
      if (entries.length > 0) byTabList.push({ filePath: fp, entries });
    }
    const byFilePathList: Array<{ filePath: string; entries: FileDiffEntry[] }> = [];
    for (const [fp, entries] of Object.entries(byFilePath)) {
      const filtered = (entries ?? []).filter(
        (e) => e.chatTabId === chatTabId && e.messageId === messageId
      );
      if (filtered.length > 0) byFilePathList.push({ filePath: fp, entries: filtered });
    }
    return {
      byTab: byTabList,
      byFilePath: byFilePathList,
      hasAny: byTabList.length > 0 || byFilePathList.length > 0,
    };
  },

  getPendingForBulk: (scope, ctx) => {
    const empty = {
      byTab: [] as Array<{ filePath: string; entries: DiffEntry[] }>,
      byFilePath: [] as Array<{ filePath: string; entries: FileDiffEntry[] }>,
      hasAny: false,
    };
    const { chatTabId, activeEditorFilePath, messageId } = ctx;
    switch (scope) {
      case 'global':
        return get().getAllPending();
      case 'current_chat_tab': {
        if (!chatTabId) return empty;
        return get().getAllPendingForChatTab(chatTabId);
      }
      case 'active_editor_tab': {
        if (!chatTabId || !activeEditorFilePath) return empty;
        const byTabList: Array<{ filePath: string; entries: DiffEntry[] }> = [];
        const tab = get().byTab[activeEditorFilePath];
        if (tab) {
          const entries = [...tab.diffs.values()].filter(
            (e) => e.status === 'pending' && e.chatTabId === chatTabId
          );
          if (entries.length > 0) byTabList.push({ filePath: activeEditorFilePath, entries });
        }
        const byFilePathList: Array<{ filePath: string; entries: FileDiffEntry[] }> = [];
        if (activeEditorFilePath) {
          const rows = get().byFilePath[activeEditorFilePath] ?? [];
          const filtered = rows.filter((e) => e.chatTabId === chatTabId);
          if (filtered.length > 0) {
            byFilePathList.push({ filePath: activeEditorFilePath, entries: filtered });
          }
        }
        const hasAny = byTabList.length > 0 || byFilePathList.length > 0;
        return { byTab: byTabList, byFilePath: byFilePathList, hasAny };
      }
      case 'last_assistant_message': {
        if (!chatTabId || !messageId) return empty;
        return get().getPendingForMessage(chatTabId, messageId);
      }
      default:
        return empty;
    }
  },

  cleanupDiffsForMessage: (chatTabId, messageId) => {
    if ((import.meta as any).env?.DEV) {
      console.debug('[diffStore] DIFF_LIFECYCLE_CLEANUP message', { chatTabId, messageId });
    }
    const toInvalidate: Array<{ chatTabId: string; agentTaskId: string }> = [];
    const { byTab, byFilePath } = get();
    for (const tab of Object.values(byTab)) {
      if (!tab) continue;
      for (const e of tab.diffs.values()) {
        if (e.chatTabId === chatTabId && e.messageId === messageId && e.status === 'pending') {
          if (e.agentTaskId) toInvalidate.push({ chatTabId, agentTaskId: e.agentTaskId });
        }
      }
    }
    for (const rows of Object.values(byFilePath)) {
      for (const e of rows ?? []) {
        if (e.chatTabId === chatTabId && e.messageId === messageId) {
          if (e.agentTaskId) toInvalidate.push({ chatTabId, agentTaskId: e.agentTaskId });
        }
      }
    }

    set((state) => {
      const nextByTab = { ...state.byTab };
      for (const [fp, tab] of Object.entries(nextByTab)) {
        if (!tab) continue;
        const newMap = new Map(tab.diffs);
        for (const [id, e] of newMap.entries()) {
          if (e.chatTabId === chatTabId && e.messageId === messageId) {
            newMap.delete(id);
          }
        }
        nextByTab[fp] = { ...tab, diffs: newMap };
      }
      const nextByFilePath = { ...state.byFilePath };
      const nextStats = { ...state.byFilePathResolveStats };
      for (const fp of Object.keys(nextByFilePath)) {
        const rows = nextByFilePath[fp] ?? [];
        const filtered = rows.filter(
          (e) => !(e.chatTabId === chatTabId && e.messageId === messageId)
        );
        if (filtered.length === 0) {
          delete nextByFilePath[fp];
          delete nextStats[fp];
        } else {
          nextByFilePath[fp] = filtered;
        }
      }
      return { byTab: nextByTab, byFilePath: nextByFilePath, byFilePathResolveStats: nextStats };
    });

    forEachUniqueAgentPair(toInvalidate, (cid, aid) => {
      markAgentInvalidated(cid, aid, 'diff_cleanup_message_deleted');
    });
  },

  cleanupDiffsForChatTab: (chatTabId) => {
    if ((import.meta as any).env?.DEV) {
      console.debug('[diffStore] DIFF_LIFECYCLE_CLEANUP chatTab', { chatTabId });
    }
    const toInvalidate: Array<{ chatTabId: string; agentTaskId: string }> = [];
    const { byTab, byFilePath } = get();
    for (const tab of Object.values(byTab)) {
      if (!tab) continue;
      for (const e of tab.diffs.values()) {
        if (e.chatTabId === chatTabId && e.status === 'pending') {
          if (e.agentTaskId) toInvalidate.push({ chatTabId, agentTaskId: e.agentTaskId });
        }
      }
    }
    for (const rows of Object.values(byFilePath)) {
      for (const e of rows ?? []) {
        if (e.chatTabId === chatTabId) {
          if (e.agentTaskId) toInvalidate.push({ chatTabId, agentTaskId: e.agentTaskId });
        }
      }
    }

    set((state) => {
      const nextByTab = { ...state.byTab };
      for (const [fp, tab] of Object.entries(nextByTab)) {
        if (!tab) continue;
        const newMap = new Map(tab.diffs);
        for (const [id, e] of newMap.entries()) {
          if (e.chatTabId === chatTabId) newMap.delete(id);
        }
        nextByTab[fp] = { ...tab, diffs: newMap };
      }
      const nextByFilePath = { ...state.byFilePath };
      const nextStats = { ...state.byFilePathResolveStats };
      for (const fp of Object.keys(nextByFilePath)) {
        const rows = nextByFilePath[fp] ?? [];
        const filtered = rows.filter((e) => e.chatTabId !== chatTabId);
        if (filtered.length === 0) {
          delete nextByFilePath[fp];
          delete nextStats[fp];
        } else {
          nextByFilePath[fp] = filtered;
        }
      }
      return { byTab: nextByTab, byFilePath: nextByFilePath, byFilePathResolveStats: nextStats };
    });

    forEachUniqueAgentPair(toInvalidate, (cid, aid) => {
      markAgentInvalidated(cid, aid, 'diff_cleanup_chat_tab_closed');
    });
  },

  retryResolveFilePathDiffs: (filePath, doc) => {
    const rows = get().byFilePath[filePath] ?? [];
    if (rows.length === 0) return { resolved: 0, total: 0 };
    const cleared = rows.map((r) => {
      const { resolveUnmapped: _, ...rest } = r;
      return rest as FileDiffEntry;
    });
    set((state) => ({
      byFilePath: { ...state.byFilePath, [filePath]: cleared },
    }));
    return get().resolveFilePathDiffs(filePath, doc);
  },

  resolveFilePathDiffs: (filePath, doc) => {
    const entries = get().byFilePath[filePath] ?? [];
    const total = entries.length;
    if (total === 0) {
      return { resolved: 0, total: 0 };
    }
    const sourceToolCallId = entries[0]?.sourceToolCallId;
    const workspaceKey = makeWorkspacePendingToolCallId(filePath, sourceToolCallId);
    const chatTabId = entries[0]?.chatTabId;
    const messageId = entries[0]?.messageId;
    const resolvedEntries: DiffEntry[] = [];
    const keptOnFile: FileDiffEntry[] = [];
    let usedFallback = 0;
    for (const e of entries) {
      let found = findBlockByParaIndexAndText(doc, e.para_index, e.original_text);
      let viaFallback = false;
      if (!found) {
        const fuzzy = findBlockByFuzzyNormalizedText(doc, e.original_text);
        if (fuzzy) {
          found = fuzzy;
          viaFallback = true;
        }
      }
      if (found) {
        if (viaFallback) usedFallback++;
        const { resolveUnmapped: _ru, ...rest } = e;
        keptOnFile.push(rest as FileDiffEntry);
        resolvedEntries.push({
          diffId: `workspace-${e.id}`,
          startBlockId: found.blockId,
          endBlockId: found.blockId,
          startOffset: found.startOffset,
          endOffset: found.endOffset,
          originalText: e.original_text,
          newText: e.new_text,
          type: 'replace' as DiffEntryType,
          status: 'pending' as DiffEntryStatus,
          toolCallId: workspaceKey,
          chatTabId: e.chatTabId ?? chatTabId,
          messageId: e.messageId ?? messageId,
          fileDiffIndex: e.diff_index,
        });
      } else {
        keptOnFile.push({
          ...e,
          resolveUnmapped: true,
        });
      }
    }
    const resolved = resolvedEntries.length;
    const unmapped = keptOnFile.filter((r) => r.resolveUnmapped).length;
    get().setDiffsForToolCall(
      filePath,
      workspaceKey,
      resolvedEntries,
      undefined,
      chatTabId,
      messageId,
      { sourceLabel: `workspace:${filePath}` }
    );
    if ((import.meta as any).env?.DEV) {
      console.debug('[diffStore] DIFF_RESOLVE_RESULT', {
        filePath,
        resolved,
        total,
        unmapped,
        usedFallback,
      });
    }
    set((state) => {
      const nextByFilePath = { ...state.byFilePath };
      const nextStats = { ...state.byFilePathResolveStats };
      if (keptOnFile.length === 0) {
        delete nextByFilePath[filePath];
        delete nextStats[filePath];
      } else {
        nextByFilePath[filePath] = keptOnFile;
        nextStats[filePath] = { resolved, total, unmapped, usedFallback };
      }
      return { byFilePath: nextByFilePath, byFilePathResolveStats: nextStats };
    });
    return { resolved, total, unmapped, usedFallback };
  },

  acceptFileDiffs: async (filePath, workspacePath, diffIndices) => {
    const ws = normalizeWorkspacePath(workspacePath);
    const relPath = getRelativePath(filePath, ws);
    await invoke('accept_file_diffs', {
      workspacePath: ws,
      filePath: relPath,
      diffIndices: diffIndices ?? undefined,
    });
    clearedFilePaths.add(filePath);
    set((state) => {
      const next = { ...state.byFilePath };
      delete next[filePath];
      const nextStats = { ...state.byFilePathResolveStats };
      delete nextStats[filePath];
      return { byFilePath: next, byFilePathResolveStats: nextStats };
    });
    set((state) => {
      const next = { ...state.byTab };
      for (const fp of Object.keys(next)) {
        const tab = next[fp];
        if (!tab) continue;
        const newMap = new Map(tab.diffs);
        for (const [id, e] of newMap.entries()) {
          if (matchesWorkspacePendingForFile(e.toolCallId, filePath)) newMap.delete(id);
        }
        next[fp] = { ...tab, diffs: newMap };
      }
      return { byTab: next };
    });
  },

  rejectFileDiffs: async (filePath, workspacePath) => {
    const entries = get().byFilePath[filePath] ?? [];
    const ws = normalizeWorkspacePath(workspacePath);
    const relPath = getRelativePath(filePath, ws);
    await invoke('reject_file_diffs', { workspacePath: ws, filePath: relPath });
    clearedFilePaths.add(filePath);
    set((state) => {
      const next = { ...state.byFilePath };
      delete next[filePath];
      const nextStats = { ...state.byFilePathResolveStats };
      delete nextStats[filePath];
      return { byFilePath: next, byFilePathResolveStats: nextStats };
    });
    set((state) => {
      const next = { ...state.byTab };
      for (const fp of Object.keys(next)) {
        const tab = next[fp];
        if (!tab) continue;
        const newMap = new Map(tab.diffs);
        for (const [id, e] of newMap.entries()) {
          if (matchesWorkspacePendingForFile(e.toolCallId, filePath)) newMap.delete(id);
        }
        next[fp] = { ...tab, diffs: newMap };
      }
      return { byTab: next };
    });
    forEachUniqueAgentPair(entries, (chatTabId, agentTaskId) => {
      markAgentRejected(chatTabId, agentTaskId, 'file_diffs_rejected');
    });
  },

  isFileDiffsCleared: (filePath) => clearedFilePaths.has(filePath),

  removeFileDiffEntry: (filePath, diffIndex) => {
    const row = get().byFilePath[filePath]?.find((e) => e.diff_index === diffIndex);
    set((state) => {
      const entries = state.byFilePath[filePath] ?? [];
      const currentRow = entries.find((e) => e.diff_index === diffIndex);
      const workspaceKey = makeWorkspacePendingToolCallId(filePath, currentRow?.sourceToolCallId);
      const filtered = entries.filter((e) => e.diff_index !== diffIndex);
      const nextByFilePath = { ...state.byFilePath };
      const nextStats = { ...state.byFilePathResolveStats };
      if (filtered.length === 0) {
        delete nextByFilePath[filePath];
        delete nextStats[filePath];
      } else {
        nextByFilePath[filePath] = filtered;
      }
      const nextByTab = { ...state.byTab };
      for (const fp of Object.keys(nextByTab)) {
        const tab = nextByTab[fp];
        if (!tab) continue;
        const newMap = new Map(tab.diffs);
        for (const [id, e] of newMap.entries()) {
          if (e.toolCallId === workspaceKey && e.fileDiffIndex === diffIndex) newMap.delete(id);
        }
        nextByTab[fp] = { ...tab, diffs: newMap };
      }
      if (filtered.length > 0) {
        const total = filtered.length;
        const resolved = Object.values(nextByTab).reduce((acc, t) => {
          return (
            acc +
            [...(t?.diffs.values() ?? [])].filter((e) => e.toolCallId === workspaceKey).length
          );
        }, 0);
        nextStats[filePath] = { resolved, total };
      }
      return { byFilePath: nextByFilePath, byFilePathResolveStats: nextStats, byTab: nextByTab };
    });
    if (row?.chatTabId && row.agentTaskId) {
      markAgentRejected(row.chatTabId, row.agentTaskId, 'file_diff_entry_rejected');
    }
  },

  markReviewConfirmed: (filePath?: string) => {
    set((state) => {
      const next = { ...state.byTab };
      for (const fp of Object.keys(next)) {
        if (filePath != null && fp !== filePath) continue;
        const tab = next[fp];
        if (!tab) continue;
        const newMap = new Map(tab.diffs);
        for (const [id, e] of newMap.entries()) {
          if (e.status === 'accepted' && !e.reviewConfirmed) {
            newMap.set(id, { ...e, reviewConfirmed: true });
          }
        }
        next[fp] = { ...tab, diffs: newMap };
      }
      return { byTab: next };
    });
  },

  getAcceptedForReview: (filePath?: string) => {
    const { byTab } = get();
    const result: DiffEntry[] = [];
    for (const [fp, tab] of Object.entries(byTab)) {
      if (filePath != null && fp !== filePath) continue;
      for (const e of tab.diffs.values()) {
        if (e.status === 'accepted' && !e.reviewConfirmed && e.acceptedFrom != null && e.acceptedTo != null) {
          result.push(e);
        }
      }
    }
    return result;
  },

  clear: (filePath) => {
    set((state) => {
      const next = { ...state.byTab };
      delete next[filePath];
      return { byTab: next };
    });
  },
}));

/**
 * Phase 2b：获取文档逻辑状态（baseline + 正序应用已接受 diffs）
 * 走 ProseMirror doc 路径，见《文档逻辑状态传递规范》
 */
export function getLogicalContent(editor: Editor, filePath: string): string {
  const { byTab } = useDiffStore.getState();
  const tab = byTab[filePath];
  if (!tab?.baseline) return editor.getHTML();

  const accepted = [...tab.diffs.values()]
    .filter((d) => d.status === 'accepted' && (d.acceptedAt ?? 0) >= tab.baselineSetAt)
    .sort((a, b) => (a.acceptedAt ?? 0) - (b.acceptedAt ?? 0));
  if (accepted.length === 0) return tab.baseline;

  const schema = editor.schema;
  const parser = DOMParser.fromSchema(schema);
  const htmlEl = new window.DOMParser().parseFromString(tab.baseline, 'text/html').body;
  let doc = parser.parse(htmlEl);
  if (!doc) return tab.baseline;

  let state = EditorState.create({ doc, schema });
  for (const d of accepted) {
    const range = blockRangeToPMRange(state.doc, d.startBlockId, d.startOffset, d.endBlockId, d.endOffset, {
      occurrenceIndex: d.occurrenceIndex,
      originalTextFallback: d.originalText,
    });
    if (!range) continue;
    const tr = state.tr.replaceWith(range.from, range.to, schema.text(d.newText));
    state = state.apply(tr);
  }

  const ser = DOMSerializer.fromSchema(schema);
  const dom = ser.serializeNode(state.doc);
  const div = document.createElement('div');
  div.appendChild(dom);
  return div.innerHTML || tab.baseline;
}
