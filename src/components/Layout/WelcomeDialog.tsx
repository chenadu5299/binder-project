import React, { useState, useEffect } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { fileService } from '../../services/fileService';
import APIKeyConfig from '../Settings/APIKeyConfig';
import { KeyIcon } from '@heroicons/react/24/outline';
import { Workspace } from '../../types/workspace';
import { toast } from '../Common/Toast';

interface WelcomeDialogProps {
  onClose: () => void;
}

const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ onClose }) => {
  const [recentWorkspaces, setRecentWorkspaces] = useState<Workspace[]>([]);
  const [showAPIKeyConfig, setShowAPIKeyConfig] = useState(false);
  const { setCurrentWorkspace } = useFileStore();

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

  const handleOpenWorkspace = async () => {
    try {
      const path = await fileService.openWorkspaceDialog();
      if (path) {
        await fileService.openWorkspace(path);
        setCurrentWorkspace(path);
        onClose();
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
        onClose();
      }
    } catch (error) {
      console.error('创建工作区失败:', error);
      toast.error(`创建工作区失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">欢迎使用 Binder</h1>
        </div>
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ 请先选择工作区才能开始使用。工作区是您文档存储的文件夹位置。
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <button
            type="button"
            onClick={handleOpenWorkspace}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            打开工作区
          </button>
          <button
            type="button"
            onClick={handleCreateWorkspace}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            新建工作区
          </button>
          <button
            type="button"
            onClick={() => setShowAPIKeyConfig(true)}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <KeyIcon className="w-5 h-5" />
            配置 API Key（使用 AI 功能）
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">最近的工作区</h2>
          {recentWorkspaces.length > 0 ? (
            <div className="space-y-2">
              {recentWorkspaces.map((workspace, index) => (
                <button
                  key={index}
                  onClick={async () => {
                    try {
                      await fileService.openWorkspace(workspace.path);
                      setCurrentWorkspace(workspace.path);
                      onClose();
                    } catch (error) {
                      console.error('打开工作区失败:', error);
                      toast.error('打开工作区失败');
                    }
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <div className="font-medium">{workspace.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{workspace.path}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              暂无最近工作区
            </div>
          )}
        </div>
      </div>

      {/* API Key 配置对话框 */}
      {showAPIKeyConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div onClick={(e) => e.stopPropagation()}>
            <APIKeyConfig onClose={() => setShowAPIKeyConfig(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default WelcomeDialog;
