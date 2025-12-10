import React from 'react';
import { FolderOpenIcon, FolderPlusIcon } from '@heroicons/react/24/outline';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { fileService } from '../../services/fileService';
import { toast } from '../Common/Toast';

const FloatingActionButton: React.FC = () => {
  const { setCurrentWorkspace } = useFileStore();
  const { setFileTreeVisible, setEditorVisible, setChatVisible } = useLayoutStore();

  const handleOpenWorkspace = async () => {
    try {
      const path = await fileService.openWorkspaceDialog();
      if (path) {
        await fileService.openWorkspace(path);
        setCurrentWorkspace(path);
        // 打开工作区后，恢复默认布局（显示文件树、编辑器、聊天窗口）
        setFileTreeVisible(true);
        setEditorVisible(true);
        setChatVisible(true);
      }
    } catch (error) {
      console.error('打开工作区失败:', error);
      toast.error(`打开工作区失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const path = await fileService.openWorkspaceDialog();
      if (path) {
        await fileService.openWorkspace(path);
        setCurrentWorkspace(path);
        // 新建工作区后，恢复默认布局（显示文件树、编辑器、聊天窗口）
        setFileTreeVisible(true);
        setEditorVisible(true);
        setChatVisible(true);
      }
    } catch (error) {
      console.error('创建工作区失败:', error);
      toast.error(`创建工作区失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="fixed bottom-28 left-1/2 transform -translate-x-1/2 z-40 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={handleOpenWorkspace}
        className="flex flex-col items-center justify-center px-6 py-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-200 group"
      >
        <FolderOpenIcon className="w-8 h-8 text-gray-600 dark:text-gray-400 group-hover:text-blue-500 mb-2" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">打开工作区</span>
      </button>

      <button
        type="button"
        onClick={handleCreateWorkspace}
        className="flex flex-col items-center justify-center px-6 py-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-200 group"
      >
        <FolderPlusIcon className="w-8 h-8 text-gray-600 dark:text-gray-400 group-hover:text-blue-500 mb-2" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">新建工作区</span>
      </button>
    </div>
  );
};

export default FloatingActionButton;

