/**
 * §十三 RequestContext：发送侧目标文件 / L / revision / editorTabId 显式传递，接收侧与工具 file_path 对齐归桶。
 */
import type { EditorTab } from '../stores/editorStore';
import type { FileReference, Reference } from '../types/reference';
import { ReferenceType } from '../types/reference';
import { normalizeHtmlForBlockListInjection } from './blockListInjection';
import {
  normalizePath,
  normalizeWorkspacePath,
  getAbsolutePath,
  isSameDocumentForEdit,
} from './pathUtils';

export interface RequestContext {
  targetFile: string;
  L: string;
  revision: number;
  baselineId: string;
  editorTabId: string;
}

const positioningContextByChatTab = new Map<string, RequestContext | null>();

export function setPositioningRequestContextForChat(chatTabId: string, ctx: RequestContext | null): void {
  positioningContextByChatTab.set(chatTabId, ctx);
}

export function getPositioningRequestContextForChat(chatTabId: string | undefined | null): RequestContext | null {
  if (!chatTabId) return null;
  return positioningContextByChatTab.get(chatTabId) ?? null;
}

/**
 * 更新所有 targetFile 匹配 filePath 的 positioningCtx.L 为最新 HTML。
 * 由 diffStore 接受 diff 后调用，确保下一轮工具调用拿到最新内容。
 */
export function updatePositioningLForFilePath(filePath: string, newHtml: string): void {
  for (const [chatTabId, ctx] of positioningContextByChatTab.entries()) {
    if (ctx && ctx.targetFile === filePath) {
      positioningContextByChatTab.set(chatTabId, { ...ctx, L: newHtml });
    }
  }
}

/**
 * 与 sendMessage 一致：单文件引用且目标已打开 → 该 tab；否则活动 tab。
 */
export function determineInjectionEditorTab(
  currentWorkspace: string | null,
  activeEditorTab: EditorTab | null,
  refs: Reference[],
  getTabByFilePath: (path: string) => EditorTab | null
): { injectionTab: EditorTab | null; fileRefsForInjection: FileReference[] } {
  const fileRefsForInjection = refs.filter((r): r is FileReference => r.type === ReferenceType.FILE);
  let injectionTab = activeEditorTab;
  if (currentWorkspace && activeEditorTab && fileRefsForInjection.length === 1) {
    const refPath = fileRefsForInjection[0].path;
    if (!isSameDocumentForEdit(refPath, activeEditorTab.filePath)) {
      const wsNorm = normalizeWorkspacePath(currentWorkspace);
      const absRef = getAbsolutePath(normalizePath(refPath), wsNorm);
      const refEditorTab = getTabByFilePath(absRef);
      if (refEditorTab?.editor) {
        injectionTab = refEditorTab;
      }
    }
  }
  return { injectionTab, fileRefsForInjection };
}

/** 在已知 injectionTab 上构造 RequestContext（无有效路径/id 则 null） */
export async function buildPositioningRequestContext(injectionTab: EditorTab | null): Promise<RequestContext | null> {
  if (!injectionTab?.filePath?.trim() || !injectionTab.id) return null;
  const rawHtml = injectionTab.editor
    ? injectionTab.editor.getHTML()
    : (injectionTab.content ?? '');
  const normalized = normalizeHtmlForBlockListInjection(rawHtml);
  if (normalized.injected) {
    console.warn('[requestContext] current content missing data-block-id, injected block-ws ids for positioning chain', {
      file: injectionTab.filePath,
      blockCount: normalized.blockCount,
    });
  }
  return {
    targetFile: injectionTab.filePath,
    L: normalized.html,
    revision: injectionTab.documentRevision ?? 1,
    baselineId: `baseline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    editorTabId: injectionTab.id,
  };
}
