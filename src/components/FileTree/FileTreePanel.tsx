import React, { useRef } from 'react';
import FileTree, { FileTreeRef } from './FileTree';
import NewFileButton from './NewFileButton';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { FolderIcon, XMarkIcon } from '@heroicons/react/24/outline';

const FileTreePanel: React.FC = () => {
  const fileTreeRef = useRef<FileTreeRef>(null);
  const { currentWorkspace } = useFileStore();
  const { setFileTreeVisible } = useLayoutStore();

  // 获取工作区名称（从路径中提取）
  const getWorkspaceName = (path: string | null): string => {
    if (!path) return '未选择工作区';
    try {
      const pathParts = path.split('/');
      return pathParts[pathParts.length - 1] || path;
    } catch {
      return path;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 工作区信息显示 */}
      {currentWorkspace && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 relative">
          <div className="flex items-center gap-2 text-sm">
            <FolderIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={currentWorkspace}>
                当前工作区: {getWorkspaceName(currentWorkspace)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={currentWorkspace}>
                {currentWorkspace}
              </div>
            </div>
          </div>
          {/* 关闭按钮 */}
          <button
            onClick={() => setFileTreeVisible(false)}
            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="关闭文件树"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      
      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <NewFileButton fileTreeRef={fileTreeRef} />
      </div>
      <div className="flex-1 overflow-hidden">
        <FileTree ref={fileTreeRef} />
      </div>
    </div>
  );
};

export default FileTreePanel;

