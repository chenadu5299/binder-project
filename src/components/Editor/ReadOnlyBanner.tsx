import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { invoke } from '@tauri-apps/api/core';
import { PencilIcon } from '@heroicons/react/24/outline';

interface ReadOnlyBannerProps {
  tabId: string;
}

const ReadOnlyBanner: React.FC<ReadOnlyBannerProps> = ({ tabId }) => {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
  const { enableEditMode, updateTabPath } = useEditorStore.getState();
  
  if (!tab || !tab.isReadOnly) return null;
  
  const handleEnableEdit = async () => {
    try {
      // ⚠️ 关键：如果文件是复杂格式，创建草稿副本
      if (!tab.isDraft) {
        const draftPath = await invoke<string>('create_draft_copy', { path: tab.filePath });
        // 更新标签页路径为草稿路径
        updateTabPath(tabId, draftPath);
      }
      
      // 启用编辑模式
      enableEditMode(tabId);
      
      // 更新编辑器为可编辑
      if (tab.editor) {
        tab.editor.setEditable(true);
      }
    } catch (error) {
      console.error('启用编辑模式失败:', error);
      alert(`启用编辑模式失败: ${error instanceof Error ? error.message : String(error)}`);
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

