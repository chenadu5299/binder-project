import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { invoke } from '@tauri-apps/api/core';
import { PencilIcon } from '@heroicons/react/24/outline';
import { toast } from '../Common/Toast';

interface ReadOnlyBannerProps {
  tabId: string;
}

const ReadOnlyBanner: React.FC<ReadOnlyBannerProps> = ({ tabId }) => {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
  const { enableEditMode, updateTabPath } = useEditorStore.getState();
  
  if (!tab || !tab.isReadOnly) return null;
  
  const handleEnableEdit = async () => {
    let draftPath: string | null = null;
    
    try {
      // ⚠️ 关键：如果文件是复杂格式（DOCX），创建草稿副本
      if (!tab.isDraft) {
        const ext = tab.filePath.split('.').pop()?.toLowerCase();
        
        if (ext === 'docx') {
          // DOCX 文件：创建草稿副本
          draftPath = await invoke<string>('create_draft_docx', { originalPath: tab.filePath });
          
          // 重新打开草稿文件（使用 Pandoc 转换）
          const htmlContent = await invoke<string>('open_docx_for_edit', { path: draftPath });
          
          // 批量更新状态，避免竞态条件
          const { updateTabContent, updateTabPath, enableEditMode } = useEditorStore.getState();
          updateTabPath(tabId, draftPath);
          updateTabContent(tabId, htmlContent);
          enableEditMode(tabId);
        } else if (ext === 'html') {
          // HTML 文件：创建草稿副本（保持格式）
          draftPath = await invoke<string>('create_draft_file', { originalPath: tab.filePath });
          
          // 读取原文件内容（保持完整 HTML 格式）
          const htmlContent = await invoke<string>('read_file_content', { path: draftPath });
          
          // 批量更新状态，避免竞态条件
          const { updateTabContent, updateTabPath, enableEditMode } = useEditorStore.getState();
          updateTabPath(tabId, draftPath);
          updateTabContent(tabId, htmlContent);
          enableEditMode(tabId);
        } else {
          // 其他文件类型（Markdown、TXT等）：直接启用编辑模式
          enableEditMode(tabId);
          if (tab.editor) {
            tab.editor.setEditable(true);
          }
          return;
        }
      } else {
        // 已经是草稿文件，直接启用编辑模式
        enableEditMode(tabId);
      }
      
      // 更新编辑器为可编辑（使用最新的 tab 引用）
      const updatedTab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
      if (updatedTab?.editor) {
        updatedTab.editor.setEditable(true);
        // 如果内容已更新，重新设置编辑器内容
        if (updatedTab.content !== tab.content) {
          updatedTab.editor.commands.setContent(updatedTab.content);
        }
      }
      
      toast.success('已创建草稿文件，可以开始编辑');
    } catch (error) {
      console.error('启用编辑模式失败:', error);
      
      // 错误清理：如果创建了草稿文件但后续步骤失败，尝试删除草稿文件
      if (draftPath) {
        try {
          await invoke('delete_file', { path: draftPath });
          console.log('已清理失败的草稿文件:', draftPath);
        } catch (cleanupError) {
          console.error('清理草稿文件失败:', cleanupError);
        }
      }
      
      toast.error(`启用编辑模式失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-yellow-800 dark:text-yellow-200">
          📄 此文件以只读模式打开。如需编辑，请点击"编辑"按钮创建草稿副本。
        </span>
      </div>
      <button
        onClick={handleEnableEdit}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
      >
        <PencilIcon className="w-4 h-4" />
        编辑
      </button>
    </div>
  );
};

export default ReadOnlyBanner;

