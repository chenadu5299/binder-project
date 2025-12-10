import React, { useState, useEffect } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { fileService } from '../../services/fileService';
import { Workspace } from '../../types/workspace';
import { toast } from '../Common/Toast';

interface RecentWorkspacesProps {
  onClose: () => void;
}

const RecentWorkspaces: React.FC<RecentWorkspacesProps> = ({ onClose }) => {
  const [recentWorkspaces, setRecentWorkspaces] = useState<Workspace[]>([]);
  const { setCurrentWorkspace } = useFileStore();
  const { setFileTreeVisible, setEditorVisible, setChatVisible } = useLayoutStore();

  useEffect(() => {
    loadRecentWorkspaces();
  }, []);

  const loadRecentWorkspaces = async () => {
    try {
      const workspaces = await fileService.loadWorkspaces();
      setRecentWorkspaces(workspaces);
    } catch (error) {
      console.error('加载最近工作区失败:', error);
    }
  };

  const handleOpenWorkspace = async (workspacePath: string) => {
    try {
      await fileService.openWorkspace(workspacePath);
      setCurrentWorkspace(workspacePath);
      // 打开工作区后，恢复默认布局（显示文件树、编辑器、聊天窗口）
      setFileTreeVisible(true);
      setEditorVisible(true);
      setChatVisible(true);
      onClose();
    } catch (error) {
      console.error('打开工作区失败:', error);
      toast.error('打开工作区失败');
    }
  };

  if (recentWorkspaces.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">最近的工作区</h2>
        {recentWorkspaces.length > 5 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            查看全部 ({recentWorkspaces.length})
          </span>
        )}
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {recentWorkspaces.slice(0, 5).map((workspace, index) => (
          <button
            key={index}
            onClick={() => handleOpenWorkspace(workspace.path)}
            className="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 group"
          >
            <div className="font-medium text-gray-900 dark:text-white group-hover:text-blue-500">
              {workspace.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
              {workspace.path}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentWorkspaces;

