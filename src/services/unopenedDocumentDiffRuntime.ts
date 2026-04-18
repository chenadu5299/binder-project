/**
 * 未打开文档编辑 — 运行时协调层（单一主链）
 *
 * 职责：
 * - 接收 `update_file` 返回的 pending_diffs，并写入 byFilePath
 * - 统一处理历史消息水合（不再由 ChatMessages / ToolCallCard 直接写 store）
 * - 文件打开且 editor 就绪后自动触发 resolveFilePathDiffs
 * - 统一暴露 unresolved / resolved update_file 的 accept / reject / retry 入口
 *
 * 约束：
 * - 不引入第三套 pending diff 容器
 * - 不让 UI 组件持有 byFilePath 真源
 * - stage 裁决仍只通过 DiffActionService → AgentTaskController
 */

import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ToolCall } from '../types/tool';
import { useChatStore } from '../stores/chatStore';
import { useDiffStore, type FileDiffEntry } from '../stores/diffStore';
import { useEditorStore } from '../stores/editorStore';
import { useFileStore } from '../stores/fileStore';
import { AgentTaskController } from './AgentTaskController';
import { DiffActionService, type DiffActionResult } from './DiffActionService';
import { getAbsolutePath, normalizePath, normalizeWorkspacePath } from '../utils/pathUtils';
import { getPositioningRequestContextForChat } from '../utils/requestContext';

type RuntimeStop = () => void;

type IngestUpdateFileToolCallParams = {
  chatTabId: string;
  messageId?: string;
  toolCall: ToolCall;
  workspacePath?: string | null;
  notifyReady?: boolean;
};

type AcceptResolvedParams = {
  filePath: string;
  diffId: string;
  fileDiffIndex?: number;
  workspacePath: string;
  editor: Editor;
  tabDocumentRevision: number;
  chatTabId?: string;
  agentTaskId?: string;
};

type RejectResolvedParams = {
  filePath: string;
  diffId: string;
  fileDiffIndex?: number;
  chatTabId?: string;
  agentTaskId?: string;
};

type PendingDiffActionParams = {
  filePath: string;
  workspacePath: string;
  diffIndex: number;
  chatTabId?: string;
  agentTaskId?: string;
};

type ResolveWatchState = {
  pendingCount: number;
  pendingFingerprint: string;
  documentRevision: number;
  docSize: number;
  docFingerprint: string;
};

let runtimeActive = false;
let stopRuntimeListeners: RuntimeStop | null = null;
const resolveWatchByFilePath = new Map<string, ResolveWatchState>();
/** 允许最多 2 次：runtime 启动一次 + persist 从 localStorage 回填后再一次（禁止 subscribe 全量重放） */
const MAX_CHAT_HISTORY_HYDRATION_RUNS = 2;
let chatHistoryHydrationRunCount = 0;

function previewText(value: string | undefined, limit = 120): string {
  if (!value) return '';
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function parseToolResultData(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function resolveWorkspaceRoot(chatTabId: string, explicitWorkspacePath?: string | null): string | null {
  if (explicitWorkspacePath) return explicitWorkspacePath;
  const tab = useChatStore.getState().tabs.find((item) => item.id === chatTabId);
  return tab?.workspacePath ?? useFileStore.getState().currentWorkspace ?? null;
}

/** 将工具结果中的相对/工作区内路径解析为绝对路径。 */
export function resolveWorkspaceAbsolutePath(
  workspaceRoot: string | null | undefined,
  pathFromResult: string | undefined,
): string | undefined {
  if (!pathFromResult) return undefined;
  if (!workspaceRoot) return pathFromResult;
  return getAbsolutePath(normalizePath(pathFromResult), normalizeWorkspacePath(workspaceRoot));
}

function normalizePendingDiffEntries(
  pendingDiffs: FileDiffEntry[] | unknown[],
  fallbackPath: string,
): FileDiffEntry[] {
  return pendingDiffs.map((row: unknown) => {
    const entry = (typeof row === 'object' && row != null ? row : {}) as Record<string, unknown>;
    return {
      id: typeof entry.id === 'number' ? entry.id : Number(entry.id ?? 0),
      file_path:
        typeof entry.file_path === 'string' && entry.file_path ? entry.file_path : fallbackPath,
      diff_index:
        typeof entry.diff_index === 'number' ? entry.diff_index : Number(entry.diff_index ?? 0),
      original_text: typeof entry.original_text === 'string' ? entry.original_text : '',
      new_text: typeof entry.new_text === 'string' ? entry.new_text : '',
      para_index:
        typeof entry.para_index === 'number' ? entry.para_index : Number(entry.para_index ?? 0),
      diff_type: typeof entry.diff_type === 'string' && entry.diff_type ? entry.diff_type : 'replace',
      status: typeof entry.status === 'string' && entry.status ? entry.status : 'pending',
    };
  });
}

function getActiveEditorTabForFilePath(filePath: string) {
  const editorState = useEditorStore.getState();
  const activeTab = editorState.tabs.find((tab) => tab.id === editorState.activeTabId) ?? null;
  if (!activeTab?.editor?.state?.doc) return null;
  if (activeTab.filePath !== filePath) return null;
  return activeTab;
}

function makePendingFingerprint(rows: FileDiffEntry[] | undefined): string {
  if (!rows || rows.length === 0) return 'none';
  const normalized = [...rows]
    .sort((a, b) => a.diff_index - b.diff_index)
    .map((row) => `${row.diff_index}:${row.resolveUnmapped === true ? 'u' : 'r'}`)
    .join('|');
  return `${rows.length}:${normalized}`;
}

function buildDocFingerprint(doc: PMNode): string {
  const text = doc.textContent || '';
  const head = text.slice(0, 120);
  const tail = text.slice(-80);
  return `${text.length}:${head}:${tail}`;
}

function notifyDiffsReady(agentTaskId: string | undefined, chatTabId: string, shouldNotify: boolean): void {
  if (!shouldNotify) return;
  AgentTaskController.notifyDiffsReady(agentTaskId, chatTabId);
}

function ingestNormalizedPendingDiffs(
  filePath: string,
  normalizedRows: FileDiffEntry[],
  options: {
    chatTabId?: string;
    sourceToolCallId?: string;
    messageId?: string;
    agentTaskId?: string;
    notifyReady?: boolean;
  },
): number {
  if (normalizedRows.length === 0) return 0;

  const store = useDiffStore.getState();
  let rowsToWrite = normalizedRows;

  if (options.sourceToolCallId) {
    rowsToWrite = normalizedRows.filter((row) => {
      if (!Number.isFinite(row.diff_index)) return false;
      return (
        store.getWorkspaceDiffHydrationStatus(filePath, options.sourceToolCallId, row.diff_index) ===
        'missing'
      );
    });
  } else if ((store.byFilePath[filePath]?.length ?? 0) > 0) {
    rowsToWrite = [];
  }

  if (rowsToWrite.length === 0) {
    console.log('[CROSS_FILE_TRACE][INGEST]', JSON.stringify({
      op: 'ingestNormalizedPendingDiffs:skip_no_new_rows',
      filePath,
      sourceToolCallId: options.sourceToolCallId ?? null,
      messageId: options.messageId ?? null,
      incomingCount: normalizedRows.length,
      rowsToWrite: 0,
    }));
    // 收口要求：无新 rows 可写时不再触发 resolve，避免重复 resolve 覆盖现有展示。
    return 0;
  }

  console.log('[CROSS_FILE_TRACE][INGEST]', JSON.stringify({
    op: 'ingestNormalizedPendingDiffs:write',
    filePath,
    sourceToolCallId: options.sourceToolCallId ?? null,
    messageId: options.messageId ?? null,
    chatTabId: options.chatTabId ?? null,
    agentTaskId: options.agentTaskId ?? null,
    incomingCount: normalizedRows.length,
    rowsToWrite: rowsToWrite.length,
    rowsPreview: rowsToWrite.slice(0, 6).map((row) => ({
      file_path: row.file_path,
      diff_index: row.diff_index,
      para_index: row.para_index,
      original_text: previewText(row.original_text, 60),
      new_text: previewText(row.new_text, 60),
    })),
  }));

  store.setFilePathDiffs(filePath, rowsToWrite, {
    chatTabId: options.chatTabId,
    sourceToolCallId: options.sourceToolCallId,
    messageId: options.messageId,
    agentTaskId: options.agentTaskId,
  });

  const openedTab = getActiveEditorTabForFilePath(filePath);
  if (openedTab?.editor?.state?.doc) {
    const editorState = useEditorStore.getState();
    const activeTab = editorState.tabs.find((tab) => tab.id === editorState.activeTabId) ?? null;
    const docText = openedTab.editor.state.doc.textContent || '';
    console.log('[CROSS_FILE_TRACE][RESOLVE_ENTER]', JSON.stringify({
      trigger: 'ingestNormalizedPendingDiffs',
      filePath,
      tabId: openedTab.id,
      tabFilePath: openedTab.filePath,
      activeEditorTabId: activeTab?.id ?? null,
      activeEditorFilePath: activeTab?.filePath ?? null,
      docTextLength: docText.length,
      docPreview: previewText(docText, 120),
      pendingCount: rowsToWrite.length,
      firstDiffPreview: rowsToWrite.length > 0 ? {
        diff_index: rowsToWrite[0].diff_index,
        para_index: rowsToWrite[0].para_index,
        original_text: previewText(rowsToWrite[0].original_text, 80),
        new_text: previewText(rowsToWrite[0].new_text, 80),
      } : null,
    }));
    const result = store.resolveFilePathDiffs(filePath, openedTab.editor.state.doc);
    const unresolved = (useDiffStore.getState().byFilePath[filePath] ?? [])
      .filter((row) => row.resolveUnmapped)
      .slice(0, 8)
      .map((row) => ({
        diff_index: row.diff_index,
        para_index: row.para_index,
        original_text: previewText(row.original_text, 80),
      }));
    console.log('[CROSS_FILE_TRACE][RESOLVE_RESULT]', JSON.stringify({
      trigger: 'ingestNormalizedPendingDiffs',
      filePath,
      resolved: result.resolved,
      total: result.total,
      unmapped: result.unmapped ?? Math.max(0, result.total - result.resolved),
      unresolvedPreview: unresolved,
    }));
  }

  if (options.chatTabId) {
    notifyDiffsReady(options.agentTaskId, options.chatTabId, options.notifyReady ?? true);
  }

  return rowsToWrite.length;
}

function ingestUpdateFileToolCall(params: IngestUpdateFileToolCallParams): number {
  const { chatTabId, messageId, toolCall, notifyReady = true } = params;
  if (toolCall.name !== 'update_file' || !toolCall.result?.success) return 0;

  const workspaceRoot = resolveWorkspaceRoot(chatTabId, params.workspacePath);
  const resultData = parseToolResultData(toolCall.result.data);
  const pathFromResult = typeof resultData.path === 'string' ? resultData.path : undefined;
  const pendingDiffs = resultData.pending_diffs;
  if (!pathFromResult || !Array.isArray(pendingDiffs) || pendingDiffs.length === 0) return 0;

  const filePath = resolveWorkspaceAbsolutePath(workspaceRoot, pathFromResult);
  if (!filePath) return 0;

  const editorState = useEditorStore.getState();
  const activeTab = editorState.tabs.find((tab) => tab.id === editorState.activeTabId) ?? null;
  const reqCtx = getPositioningRequestContextForChat(chatTabId);
  console.log('[CROSS_FILE_TRACE][INGEST]', JSON.stringify({
    op: 'ingestUpdateFileToolCall',
    chatTabId,
    messageId: messageId ?? null,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    toolResultPath: pathFromResult,
    resolvedFilePath: filePath,
    pendingCount: pendingDiffs.length,
    pendingPreview: pendingDiffs.slice(0, 6).map((row: any) => ({
      file_path: typeof row?.file_path === 'string' ? row.file_path : null,
      diff_index: typeof row?.diff_index === 'number' ? row.diff_index : row?.diff_index ?? null,
      para_index: typeof row?.para_index === 'number' ? row.para_index : row?.para_index ?? null,
      original_text: previewText(typeof row?.original_text === 'string' ? row.original_text : '', 60),
    })),
    activeEditorTabId: activeTab?.id ?? null,
    activeEditorFilePath: activeTab?.filePath ?? null,
    requestContextTargetFile: reqCtx?.targetFile ?? null,
    finalByFilePathWriteTarget: filePath,
  }));

  return ingestNormalizedPendingDiffs(
    filePath,
    normalizePendingDiffEntries(pendingDiffs, pathFromResult),
    {
      chatTabId,
      sourceToolCallId: toolCall.id,
      messageId,
      agentTaskId: toolCall.agentTaskId,
      notifyReady,
    },
  );
}

/**
 * 兼容：从持久化/内存中的聊天消息恢复 update_file 的 pending 展示（仅 toolCalls 或 contentBlocks）。
 * 生产写入仍走 ingestNormalizedPendingDiffs 的去重键（getWorkspaceDiffHydrationStatus === 'missing'）。
 * 退出条件：旧消息格式下线且可一次性迁移后，可删除 toolCalls 分支。
 */
function hydrateChatHistoryDiffsOnce(): void {
  if (chatHistoryHydrationRunCount >= MAX_CHAT_HISTORY_HYDRATION_RUNS) return;
  chatHistoryHydrationRunCount += 1;

  const tabs = useChatStore.getState().tabs;
  const currentWorkspace = useFileStore.getState().currentWorkspace;

  for (const tab of tabs) {
    const workspacePath = tab.workspacePath ?? currentWorkspace;
    for (const message of tab.messages) {
      if (message.isLoading) continue;
      if (message.contentBlocks) {
        for (const block of message.contentBlocks) {
          if (block.type !== 'tool' || !block.toolCall) continue;
          ingestUpdateFileToolCall({
            chatTabId: tab.id,
            workspacePath,
            messageId: message.id,
            toolCall: block.toolCall,
            notifyReady: true,
          });
        }
        continue;
      }

      for (const toolCall of message.toolCalls ?? []) {
        ingestUpdateFileToolCall({
          chatTabId: tab.id,
          workspacePath,
          messageId: message.id,
          toolCall,
          notifyReady: true,
        });
      }
    }
  }
}

function cleanupResolveWatch(activeFilePaths: Set<string>) {
  for (const filePath of [...resolveWatchByFilePath.keys()]) {
    if (!activeFilePaths.has(filePath)) {
      resolveWatchByFilePath.delete(filePath);
    }
  }
}

function reconcileOpenedEditors(): void {
  const diffState = useDiffStore.getState();
  const activeFilePaths = new Set<string>();
  const editorState = useEditorStore.getState();
  const activeTab = editorState.tabs.find((tab) => tab.id === editorState.activeTabId) ?? null;

  // 收口规则：仅允许“当前激活且 filePath 一致”的 editor doc 驱动 resolve。
  // 非激活 tab 的 editor 引用可能是历史实例或已脱钩实例，不能作为执行真源。
  if (!activeTab?.editor?.state?.doc) {
    cleanupResolveWatch(activeFilePaths);
    return;
  }
  const filePath = activeTab.filePath;
  activeFilePaths.add(filePath);

  const pendingRows = diffState.byFilePath[filePath] ?? [];
  const pendingCount = pendingRows.length;
  if (pendingCount === 0) {
    resolveWatchByFilePath.delete(filePath);
    cleanupResolveWatch(activeFilePaths);
    return;
  }
  const pendingFingerprint = makePendingFingerprint(pendingRows);
  const documentRevision = activeTab.documentRevision ?? 1;
  const docSize = activeTab.editor.state.doc.content.size;
  const docFingerprint = buildDocFingerprint(activeTab.editor.state.doc);
  const previous = resolveWatchByFilePath.get(filePath);
  if (
    !previous ||
    previous.pendingCount !== pendingCount ||
    previous.pendingFingerprint !== pendingFingerprint ||
    previous.documentRevision !== documentRevision ||
    previous.docSize !== docSize ||
    previous.docFingerprint !== docFingerprint
  ) {
    const docText = activeTab.editor.state.doc.textContent || '';
    console.log('[CROSS_FILE_TRACE][RESOLVE_ENTER]', JSON.stringify({
      trigger: 'reconcileOpenedEditors',
      filePath,
      tabId: activeTab.id,
      tabFilePath: activeTab.filePath,
      activeEditorTabId: activeTab.id,
      activeEditorFilePath: activeTab.filePath,
      docTextLength: docText.length,
      docPreview: previewText(docText, 120),
      pendingCount,
      pendingFingerprint,
      documentRevision,
      docSize,
    }));
    const result = diffState.resolveFilePathDiffs(filePath, activeTab.editor.state.doc);
    const unresolved = (useDiffStore.getState().byFilePath[filePath] ?? [])
      .filter((row) => row.resolveUnmapped)
      .slice(0, 8)
      .map((row) => ({
        diff_index: row.diff_index,
        para_index: row.para_index,
        original_text: previewText(row.original_text, 80),
      }));
    console.log('[CROSS_FILE_TRACE][RESOLVE_RESULT]', JSON.stringify({
      trigger: 'reconcileOpenedEditors',
      filePath,
      resolved: result.resolved,
      total: result.total,
      unmapped: result.unmapped ?? Math.max(0, result.total - result.resolved),
      unresolvedPreview: unresolved,
    }));
  }

  resolveWatchByFilePath.set(filePath, {
    pendingCount,
    pendingFingerprint,
    documentRevision,
    docSize,
    docFingerprint,
  });

  cleanupResolveWatch(activeFilePaths);
}

function start(): RuntimeStop {
  if (runtimeActive && stopRuntimeListeners) {
    return stopRuntimeListeners;
  }

  runtimeActive = true;
  /** 正式主链：流式 update_file 仍由 ChatPanel → ingestUpdateFileToolCall 写入；此处仅「启动时一次」定点恢复历史 */
  hydrateChatHistoryDiffsOnce();
  reconcileOpenedEditors();

  let unsubPersistHydration: (() => void) | undefined;
  const storeWithPersist = useChatStore as typeof useChatStore & {
    persist?: { onFinishHydration?: (fn: () => void) => () => void };
  };
  if (typeof storeWithPersist.persist?.onFinishHydration === 'function') {
    unsubPersistHydration = storeWithPersist.persist.onFinishHydration(() => {
      hydrateChatHistoryDiffsOnce();
      reconcileOpenedEditors();
    });
  }

  const unsubscribeEditor = useEditorStore.subscribe(() => {
    reconcileOpenedEditors();
  });

  stopRuntimeListeners = () => {
    unsubPersistHydration?.();
    unsubscribeEditor();
    resolveWatchByFilePath.clear();
    runtimeActive = false;
    stopRuntimeListeners = null;
  };

  return stopRuntimeListeners;
}

/** 工作区 DB 打开带回的 workspace 层 pending_diffs（无 toolCall/message 元数据）。 */
function seedPendingDiffsFromWorkspaceOpen(
  filePath: string,
  pendingDiffs: FileDiffEntry[] | unknown[],
): void {
  if (!Array.isArray(pendingDiffs) || pendingDiffs.length === 0) return;
  ingestNormalizedPendingDiffs(
    filePath,
    normalizePendingDiffEntries(pendingDiffs, filePath),
    { notifyReady: false },
  );
}

/**
 * 文件已打开且 ProseMirror 文档可用时：若 byFilePath 有条目则 resolve。
 * 仍保留为显式入口，供需要即时重试 resolve 的交互复用。
 */
function tryResolvePendingDiffsForFilePath(
  filePath: string,
  doc: PMNode,
): {
  resolved: number;
  total: number;
  unmapped?: number;
  usedFallback?: number;
} | null {
  const store = useDiffStore.getState();
  const list = store.byFilePath[filePath];
  if (!list?.length) return null;
  const docText = doc.textContent || '';
  console.log('[CROSS_FILE_TRACE][RESOLVE_ENTER]', JSON.stringify({
    trigger: 'tryResolvePendingDiffsForFilePath',
    filePath,
    docTextLength: docText.length,
    docPreview: previewText(docText, 120),
    pendingCount: list.length,
  }));
  const result = store.resolveFilePathDiffs(filePath, doc);
  const unresolved = (useDiffStore.getState().byFilePath[filePath] ?? [])
    .filter((row) => row.resolveUnmapped)
    .slice(0, 8)
    .map((row) => ({
      diff_index: row.diff_index,
      para_index: row.para_index,
      original_text: previewText(row.original_text, 80),
    }));
  console.log('[CROSS_FILE_TRACE][RESOLVE_RESULT]', JSON.stringify({
    trigger: 'tryResolvePendingDiffsForFilePath',
    filePath,
    resolved: result.resolved,
    total: result.total,
    unmapped: result.unmapped ?? Math.max(0, result.total - result.resolved),
    unresolvedPreview: unresolved,
  }));
  return result;
}

async function acceptResolvedDiff(params: AcceptResolvedParams): Promise<DiffActionResult> {
  const editorBoundFilePath =
    useEditorStore.getState().tabs.find((tab) => tab.editor === params.editor)?.filePath ?? null;
  console.log('[CROSS_FILE_TRACE][ACCEPT_ENTRY]', JSON.stringify({
    sourceComponent: 'UnopenedDocumentDiffRuntime',
    method: 'acceptResolvedDiff',
    filePath: params.filePath,
    diffId: params.diffId,
    fileDiffIndex: params.fileDiffIndex ?? null,
    chatTabId: params.chatTabId ?? null,
    agentTaskId: params.agentTaskId ?? null,
    sourcePool: 'resolved(byTab + byFilePath)',
    route: 'DiffActionService.acceptResolvedDiffCard',
    editorBoundFilePath,
    workspacePath: params.workspacePath,
  }));
  return DiffActionService.acceptResolvedDiffCard(
    params.filePath,
    params.diffId,
    params.fileDiffIndex,
    params.workspacePath,
    params.editor,
    {
      tabDocumentRevision: params.tabDocumentRevision,
      chatTabId: params.chatTabId,
      agentTaskId: params.agentTaskId,
    },
  );
}

function rejectResolvedDiff(params: RejectResolvedParams): void {
  if (params.fileDiffIndex != null) {
    DiffActionService.rejectResolvedDiffCard(
      params.filePath,
      params.diffId,
      params.fileDiffIndex,
      {
        chatTabId: params.chatTabId,
        agentTaskId: params.agentTaskId,
      },
    );
    return;
  }

  DiffActionService.rejectDiff(params.filePath, params.diffId, {
    chatTabId: params.chatTabId,
    agentTaskId: params.agentTaskId,
  });
}

async function acceptPendingDiff(params: PendingDiffActionParams): Promise<void> {
  console.log('[CROSS_FILE_TRACE][ACCEPT_ENTRY]', JSON.stringify({
    sourceComponent: 'UnopenedDocumentDiffRuntime',
    method: 'acceptPendingDiff',
    filePath: params.filePath,
    diffIndex: params.diffIndex,
    chatTabId: params.chatTabId ?? null,
    agentTaskId: params.agentTaskId ?? null,
    sourcePool: 'byFilePath',
    route: 'DiffActionService.acceptFileDiffs',
    workspacePath: params.workspacePath,
  }));
  await DiffActionService.acceptFileDiffs(params.filePath, params.workspacePath, {
    chatTabId: params.chatTabId,
    agentTaskId: params.agentTaskId,
    diffIndices: [params.diffIndex],
  });
}

function rejectPendingDiff(params: PendingDiffActionParams): void {
  DiffActionService.rejectFileDiffEntry(
    params.filePath,
    params.diffIndex,
    params.workspacePath,
    {
      chatTabId: params.chatTabId,
      agentTaskId: params.agentTaskId,
    },
  );
}

function retryResolvePendingDiffs(filePath: string) {
  const tab = getActiveEditorTabForFilePath(filePath);
  if (!tab?.editor?.state?.doc) return null;
  const docText = tab.editor.state.doc.textContent || '';
  console.log('[CROSS_FILE_TRACE][RESOLVE_ENTER]', JSON.stringify({
    trigger: 'retryResolvePendingDiffs',
    filePath,
    tabId: tab.id,
    tabFilePath: tab.filePath,
    docTextLength: docText.length,
    docPreview: previewText(docText, 120),
    pendingCount: (useDiffStore.getState().byFilePath[filePath] ?? []).length,
  }));
  const result = useDiffStore.getState().retryResolveFilePathDiffs(filePath, tab.editor.state.doc);
  const unresolved = (useDiffStore.getState().byFilePath[filePath] ?? [])
    .filter((row) => row.resolveUnmapped)
    .slice(0, 8)
    .map((row) => ({
      diff_index: row.diff_index,
      para_index: row.para_index,
      original_text: previewText(row.original_text, 80),
    }));
  console.log('[CROSS_FILE_TRACE][RESOLVE_RESULT]', JSON.stringify({
    trigger: 'retryResolvePendingDiffs',
    filePath,
    resolved: result.resolved,
    total: result.total,
    unmapped: result.unmapped ?? Math.max(0, result.total - result.resolved),
    unresolvedPreview: unresolved,
  }));
  return result;
}

export const UnopenedDocumentDiffRuntime = {
  start,
  ingestUpdateFileToolCall,
  seedPendingDiffsFromWorkspaceOpen,
  tryResolvePendingDiffsForFilePath,
  resolveWorkspaceAbsolutePath,
  acceptResolvedDiff,
  rejectResolvedDiff,
  acceptPendingDiff,
  rejectPendingDiff,
  retryResolvePendingDiffs,
};
