/**
 * 响应后端 `positioning-request-editor-snapshot`，回传与 sendMessage 同源的 L + documentRevision（§2.1.1）。
 */
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { resolveEditorTabForEditResult } from './editToolTabResolve';
import { serializeForPositioning } from './serializeForPositioning';

type SnapshotRequestPayload = {
  request_id?: string;
  file_path?: string | null;
};

export async function setupPositioningEditorSnapshotListener(): Promise<() => void> {
  const unlisten = await listen<SnapshotRequestPayload>('positioning-request-editor-snapshot', async (event) => {
    const payload = event.payload;
    const requestId = payload?.request_id;
    if (!requestId) return;

    const submitEmpty = async () => {
      await invoke('positioning_submit_editor_snapshot', {
        requestId,
        html: null,
        documentRevision: null,
      });
    };

    try {
      const tab = resolveEditorTabForEditResult(payload.file_path ?? undefined);
      if (!tab?.editor) {
        await submitEmpty();
        return;
      }
      const html = serializeForPositioning(tab.editor, tab.filePath);
      const documentRevision = tab.documentRevision ?? 1;
      await invoke('positioning_submit_editor_snapshot', {
        requestId,
        html,
        documentRevision,
      });
    } catch (e) {
      console.error('[positioning] snapshot listener failed', e);
      try {
        await submitEmpty();
      } catch {
        /* ignore */
      }
    }
  });

  return () => {
    unlisten();
  };
}
