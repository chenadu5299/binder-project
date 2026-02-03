import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { 
  FolderIcon, 
  DocumentTextIcon, 
  ChatBubbleLeftRightIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

const StatusBar: React.FC = () => {
  const { currentWorkspace } = useFileStore();
  const { 
    fileTree, 
    editor,
    chat, 
    setFileTreeVisible,
    setEditorVisible,
    setChatVisible 
  } = useLayoutStore();
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheTip, setCacheTip] = useState<string | null>(null);

  const handleClearPreviewCache = async () => {
    setCacheClearing(true);
    setCacheTip(null);
    try {
      const result = await invoke<string>('clear_preview_cache');
      setCacheTip(result);
      setTimeout(() => setCacheTip(null), 2500);
    } catch (e) {
      setCacheTip(e instanceof Error ? e.message : String(e));
      setTimeout(() => setCacheTip(null), 2500);
    } finally {
      setCacheClearing(false);
    }
  };

  return (
    <div className="relative h-7 px-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
      {/* 左侧：工作区路径 */}
      <div className="flex-1 min-w-0 mr-3">
        {currentWorkspace ? (
          <span 
            className="truncate block" 
            title={currentWorkspace}
          >
            {currentWorkspace}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">未选择工作区</span>
        )}
      </div>

      {/* 右侧：窗口切换按钮 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* 文件树切换按钮 */}
        <button
          onClick={() => setFileTreeVisible(!fileTree.visible)}
          className={`
            w-5 h-5 rounded flex items-center justify-center
            transition-all duration-150
            ${fileTree.visible 
              ? 'bg-blue-400/20 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }
          `}
          title={fileTree.visible ? '隐藏文件树' : '显示文件树'}
        >
          <FolderIcon className="w-3.5 h-3.5" />
        </button>

        {/* 编辑器切换按钮 */}
        <button
          onClick={() => setEditorVisible(!editor.visible)}
          className={`
            w-5 h-5 rounded flex items-center justify-center
            transition-all duration-150
            ${editor.visible 
              ? 'bg-blue-400/20 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }
          `}
          title={editor.visible ? '隐藏编辑器' : '显示编辑器'}
        >
          <DocumentTextIcon className="w-3.5 h-3.5" />
        </button>

        {/* 聊天窗口切换按钮 */}
        <button
          onClick={() => setChatVisible(!chat.visible)}
          className={`
            w-5 h-5 rounded flex items-center justify-center
            transition-all duration-150
            ${chat.visible 
              ? 'bg-blue-400/20 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }
          `}
          title={chat.visible ? '隐藏聊天窗口' : '显示聊天窗口'}
        >
          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
        </button>

        {/* 清除预览缓存（临时） */}
        <button
          onClick={handleClearPreviewCache}
          disabled={cacheClearing}
          className="w-5 h-5 rounded flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-50"
          title="清除预览缓存"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 清除缓存结果提示（短暂显示在状态栏左侧或用 tooltip） */}
      {cacheTip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-8 px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs shadow-lg z-50 max-w-[80vw] truncate">
          {cacheTip}
        </div>
      )}
    </div>
  );
};

export default StatusBar;

