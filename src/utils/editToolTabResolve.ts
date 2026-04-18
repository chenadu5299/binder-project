/**
 * edit_current_editor_document 结果应挂到与 file_path 一致的编辑器 tab（P3、附录 D）
 * §十三：有 RequestContext 且 file_path 与 context.targetFile 一致时优先用 editorTabId 快路径。
 */
import type { EditorTab } from '../stores/editorStore';
import { useEditorStore } from '../stores/editorStore';
import { isSameDocumentForEdit } from './pathUtils';
import type { ToolCall } from '../types/tool';
import { getPositioningRequestContextForChat } from './requestContext';

export function resolveEditorTabForEditResult(filePath: string | undefined | null): EditorTab | null {
  const { tabs, getActiveTab } = useEditorStore.getState();
  if (filePath && String(filePath).trim() !== '') {
    const hit = tabs.find((t) => isSameDocumentForEdit(t.filePath, filePath));
    if (hit) return hit;
    console.warn('[editTool] 工具结果 file_path 无匹配编辑器 tab，跳过 diff 同步', { filePath });
    return null;
  }
  return getActiveTab();
}

/**
 * @param chatTabId 当前对话 tab id，用于读取最近一次 sendMessage 的 RequestContext
 */
export function resolveEditorTabForEditResultWithRequestContext(
  filePath: string | undefined | null,
  chatTabId: string | undefined | null
): EditorTab | null {
  const ctx = getPositioningRequestContextForChat(chatTabId);
  const fp = filePath != null && String(filePath).trim() !== '' ? String(filePath) : '';

  if (ctx && fp) {
    if (isSameDocumentForEdit(ctx.targetFile, fp)) {
      const tab = useEditorStore.getState().tabs.find((t) => t.id === ctx.editorTabId);
      if (tab) {
        return tab;
      }
      console.warn('[editTool] RequestContext.editorTabId 对应 tab 已关闭，回退路径解析', {
        editorTabId: ctx.editorTabId,
        filePath: fp,
      });
    } else {
      console.warn('[editTool] 工具 file_path 与 RequestContext.targetFile 不一致，回退路径解析', {
        filePath: fp,
        targetFile: ctx.targetFile,
      });
    }
  }

  return resolveEditorTabForEditResult(filePath);
}

export function inferPositioningPath(toolCall: Pick<ToolCall, 'arguments'> | undefined): 'Anchor' | 'Resolver' | 'Legacy' {
  const args = toolCall?.arguments as Record<string, unknown> | undefined;
  if (!args) return 'Legacy';
  const hasSelectionAnchor =
    typeof args._sel_start_block_id === 'string' &&
    typeof args._sel_end_block_id === 'string';
  if (hasSelectionAnchor) {
    return 'Anchor';
  }
  const mode = String(args.edit_mode ?? '').toLowerCase();
  const hasTarget = typeof args.target === 'string' && String(args.target).trim() !== '';
  if (mode === 'replace' && hasTarget) {
    return 'Resolver';
  }
  return 'Legacy';
}
