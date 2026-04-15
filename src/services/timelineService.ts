import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editorStore';
import { useChatStore } from '../stores/chatStore';
import { useDiffStore } from '../stores/diffStore';
import { useAgentStore } from '../stores/agentStore';
import { getAbsolutePath, getRelativePath } from '../utils/pathUtils';
import type { TimelineNode, TimelineRestorePreview, TimelineRestoreResult } from '../types/timeline';

interface OpenFileResult {
  content: string;
}

async function reloadOpenTabsForPaths(workspacePath: string, relativePaths: string[]): Promise<void> {
  const editorStore = useEditorStore.getState();

  for (const relativePath of relativePaths) {
    const absolutePath = getAbsolutePath(relativePath, workspacePath);
    const tab = editorStore.getTabByFilePath(absolutePath);
    if (!tab || tab.isDirty || tab.isReadOnly) continue;

    const ext = absolutePath.split('.').pop()?.toLowerCase() || 'txt';
    let content: string | null = null;

    try {
      if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) {
        const result = await invoke<OpenFileResult>('open_docx_with_cache', {
          workspacePath,
          filePath: getRelativePath(absolutePath, workspacePath),
        });
        content = result.content;
      } else if (['md', 'txt', 'html', 'htm'].includes(ext)) {
        const result = await invoke<OpenFileResult>('open_file_with_cache', {
          workspacePath,
          filePath: getRelativePath(absolutePath, workspacePath),
        });
        content = result.content;
      }

      if (content !== null) {
        editorStore.updateTabContent(tab.id, content);
        editorStore.markTabSaved(tab.id, content);
        try {
          const modifiedTime = await invoke<number>('get_file_modified_time', { path: absolutePath });
          editorStore.updateTabModifiedTime(tab.id, modifiedTime);
        } catch (error) {
          console.warn('[timelineService] 更新还原后文件修改时间失败:', error);
        }
      }
    } catch (error) {
      console.warn('[timelineService] 刷新已打开标签失败:', { relativePath, error });
    }
  }
}

function invalidateRestoreScope(workspacePath: string, relativePaths: string[]): void {
  const absolutePaths = relativePaths.map((relativePath) => getAbsolutePath(relativePath, workspacePath));
  useDiffStore.getState().invalidateForFilePaths(absolutePaths, 'timeline_restore_scope_reset');

  const chatTabs = useChatStore
    .getState()
    .tabs.filter((tab) => tab.workspacePath === workspacePath);
  const agentStore = useAgentStore.getState();
  for (const tab of chatTabs) {
    agentStore.resetRuntimeAfterRestore(tab.id, 'timeline_restore_scope_reset');
  }
}

async function ensureRestoreAllowed(workspacePath: string, preview: TimelineRestorePreview): Promise<void> {
  const editorStore = useEditorStore.getState();

  for (const relativePath of preview.node.impactScope) {
    const absolutePath = getAbsolutePath(relativePath, workspacePath);
    const tab = editorStore.getTabByFilePath(absolutePath);
    if (!tab) continue;

    if (tab.isDirty) {
      throw new Error(`文件存在未保存修改，无法还原：${relativePath}`);
    }

    try {
      const modified = await invoke<boolean>('check_external_modification', {
        path: absolutePath,
        lastModifiedMs: tab.lastModifiedTime,
      });
      if (modified) {
        throw new Error(`文件存在外部修改待处理，无法还原：${relativePath}`);
      }
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`检查外部修改失败：${relativePath}`);
    }
  }
}

export const timelineService = {
  async listNodes(workspacePath: string, limit = 50): Promise<TimelineNode[]> {
    return invoke<TimelineNode[]>('list_timeline_nodes', { workspacePath, limit });
  },

  async getRestorePreview(workspacePath: string, nodeId: string): Promise<TimelineRestorePreview> {
    return invoke<TimelineRestorePreview>('get_timeline_restore_preview', { workspacePath, nodeId });
  },

  async restoreNode(workspacePath: string, nodeId: string): Promise<TimelineRestoreResult> {
    const preview = await this.getRestorePreview(workspacePath, nodeId);
    await ensureRestoreAllowed(workspacePath, preview);

    const confirmed = window.confirm(
      [
        `将还原到时间轴节点：${preview.node.summary}`,
        '',
        `影响范围：${preview.node.impactScope.join('、') || '当前作用对象'}`,
        '',
        '该操作会覆盖当前项目逻辑状态。',
        '与受影响文件关联的 pending diff / candidate / task 现场会被失效清理。',
      ].join('\n')
    );

    if (!confirmed) {
      throw new Error('RESTORE_CANCELLED');
    }

    const result = await invoke<TimelineRestoreResult>('restore_timeline_node', { workspacePath, nodeId });
    invalidateRestoreScope(workspacePath, result.impactedPaths);
    await reloadOpenTabsForPaths(workspacePath, result.impactedPaths);
    return result;
  },
};
