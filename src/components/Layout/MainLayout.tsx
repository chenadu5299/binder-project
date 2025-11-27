import React, { useEffect } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import WelcomeDialog from './WelcomeDialog';
import FileTreePanel from '../FileTree/FileTreePanel';
import EditorPanel from '../Editor/EditorPanel';
import ChatPanel from '../Chat/ChatPanel';
import { fileService } from '../../services/fileService';

const MainLayout: React.FC = () => {
  const { showWelcomeDialog, setShowWelcomeDialog, fileTree, chat, setChatVisible } = useLayoutStore();
  const { currentWorkspace, setCurrentWorkspace } = useFileStore();

  // 如果没有工作区，强制显示欢迎对话框
  const shouldShowWelcome = showWelcomeDialog || !currentWorkspace;

  // 快捷键支持：Cmd+O (macOS) 或 Ctrl+O (Windows/Linux)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      // Cmd+O 或 Ctrl+O: 打开工作区
      if (modifier && e.key === 'o' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!currentWorkspace) {
          try {
            const path = await fileService.openWorkspaceDialog();
            if (path) {
              await fileService.openWorkspace(path);
              setCurrentWorkspace(path);
              setShowWelcomeDialog(false);
            }
          } catch (error) {
            console.error('快捷键打开工作区失败:', error);
            alert(`打开工作区失败: ${error}`);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentWorkspace, setCurrentWorkspace, setShowWelcomeDialog]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 flex">
      {/* 欢迎对话框 - 必须选择工作区才能关闭 */}
      {shouldShowWelcome && (
        <WelcomeDialog 
          onClose={() => {
            if (currentWorkspace) {
              setShowWelcomeDialog(false);
            }
          }} 
        />
      )}

      {/* 文件树：左侧固定 */}
      {fileTree.visible && (
        <div
          className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
          style={{ width: fileTree.width }}
        >
          <FileTreePanel />
        </div>
      )}

      {/* 编辑器：中间自适应，但宽度受限 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <EditorPanel />
      </div>

      {/* 聊天窗口：右侧固定 */}
      {chat.visible && (
        <div
          className="bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
          style={{ width: chat.width }}
        >
          <ChatPanel />
        </div>
      )}

      {/* 聊天窗口展开按钮（当窗口隐藏时显示） */}
      {!chat.visible && (
        <button
          onClick={() => setChatVisible(true)}
          className="fixed right-0 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white px-3 py-6 rounded-l-lg hover:bg-blue-700 transition-colors z-50 shadow-lg"
          title="打开 AI 聊天"
        >
          ▶
        </button>
      )}
    </div>
  );
};

export default MainLayout;
