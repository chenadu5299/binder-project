import React, { useEffect, useCallback, useRef } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/chatStore';
import WelcomePage from '../Welcome/WelcomePage';
import FileTreePanel from '../FileTree/FileTreePanel';
import EditorPanel from '../Editor/EditorPanel';
import ChatPanel from '../Chat/ChatPanel';
import FloatingActionButton from '../Chat/FloatingActionButton';
import PanelResizer from './PanelResizer';
import StatusBar from '../StatusBar/StatusBar';
import { ToastContainer, useToastStore, toast } from '../Common/Toast';
import { fileService } from '../../services/fileService';

const MainLayout: React.FC = () => {
  const {
    showWelcomeDialog,
    setShowWelcomeDialog,
    fileTree,
    editor,
    chat,
    setChatVisible,
    setFileTreeVisible,
    setEditorVisible,
    setFileTreeWidth,
    setChatWidth,
  } = useLayoutStore();
  const { currentWorkspace, setCurrentWorkspace } = useFileStore();
  const { toasts, removeToast } = useToastStore();
  const { tabs } = useChatStore();

  // 检查是否有临时聊天标签页
  const hasTemporaryChats = tabs.filter(tab => tab.isTemporary).length > 0;

  // 如果没有工作区且没有临时聊天，显示欢迎页面
  // 如果已经有临时聊天，即使没有工作区也不显示欢迎页面
  const shouldShowWelcome = showWelcomeDialog || (!currentWorkspace && !hasTemporaryChats);
  
  // 应用启动时清理过期的临时文件
  useEffect(() => {
    if (currentWorkspace) {
      // 延迟执行，避免阻塞应用启动
      const timer = setTimeout(async () => {
        try {
          const { cleanupExpiredTempFiles } = await import('../../utils/tempFileCleanup');
          await cleanupExpiredTempFiles(currentWorkspace, 24); // 清理 24 小时前的文件
        } catch (error) {
          console.error('❌ 清理过期临时文件失败:', error);
        }
      }, 2000); // 2 秒后执行
      
      return () => clearTimeout(timer);
    }
  }, [currentWorkspace]); // 只在工作区变化时执行
  
  // 调试日志
  useEffect(() => {
    const temporaryTabs = tabs.filter(tab => tab.isTemporary);
    console.log('🔍 欢迎页面显示状态:', {
      showWelcomeDialog,
      currentWorkspace,
      hasTemporaryChats,
      temporaryTabsCount: temporaryTabs.length,
      shouldShowWelcome,
      fileTreeVisible: fileTree.visible,
      editorVisible: editor.visible,
      chatVisible: chat.visible,
    });
  }, [showWelcomeDialog, currentWorkspace, hasTemporaryChats, shouldShowWelcome, fileTree.visible, editor.visible, chat.visible, tabs]);

  // 判断是否为全屏聊天模式（没有工作区，且只显示聊天窗口）
  const isFullscreenChatMode = !currentWorkspace && !fileTree.visible && !editor.visible && chat.visible;

  // 处理开始对话（从欢迎页面）
  const handleStartChat = useCallback(() => {
    setShowWelcomeDialog(false); // 关闭欢迎页面
    // 面板状态已在 WelcomeChatInput 中设置
  }, [setShowWelcomeDialog]);

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
            toast.error(`打开工作区失败: ${error}`);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentWorkspace, setCurrentWorkspace, setShowWelcomeDialog]);

  // 文件树初始宽度（拖动开始时的宽度）
  const fileTreeStartWidthRef = useRef<number | null>(null);
  // 聊天窗口初始宽度（拖动开始时的宽度）
  const chatStartWidthRef = useRef<number | null>(null);

  // 处理文件树宽度调整（向右拖增大，向左拖减小）
  const handleFileTreeResize = useCallback((deltaX: number) => {
    // 如果是第一次调用，记录初始宽度
    if (fileTreeStartWidthRef.current === null) {
      fileTreeStartWidthRef.current = fileTree.width;
    }
    
    const minWidth = 150;
    const maxWidth = 600;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, fileTreeStartWidthRef.current + deltaX));
    setFileTreeWidth(newWidth);
  }, [fileTree.width, setFileTreeWidth]);

  // 处理聊天窗口宽度调整（向右拖减小，向左拖增大，所以取负）
  const handleChatResize = useCallback((deltaX: number) => {
    // 如果是第一次调用，记录初始宽度
    if (chatStartWidthRef.current === null) {
      chatStartWidthRef.current = chat.width;
    }
    
    const minWidth = 250;
    const maxWidth = 800;
    
    // 计算可用空间（窗口宽度减去文件树宽度，如果有的话）
    const availableWidth = window.innerWidth - (fileTree.visible ? fileTree.width : 0);
    const effectiveMaxWidth = Math.min(maxWidth, Math.max(minWidth, availableWidth - 20)); // 留出20px余量
    
    const newWidth = Math.max(minWidth, Math.min(effectiveMaxWidth, chatStartWidthRef.current - deltaX));
    setChatWidth(newWidth);
  }, [chat.width, fileTree.width, fileTree.visible, setChatWidth]);

  // 重置拖动起始宽度
  const resetDragState = useCallback(() => {
    fileTreeStartWidthRef.current = null;
    chatStartWidthRef.current = null;
  }, []);

  // 响应式处理：窗口大小变化时，确保聊天窗口不会超出可用空间
  useEffect(() => {
    const handleResize = () => {
      if (!chat.visible || isFullscreenChatMode) return;
      
      // 计算可用空间
      const availableWidth = window.innerWidth - (fileTree.visible ? fileTree.width : 0);
      const minWidth = 250;
      
      // 如果聊天窗口宽度超过可用空间，自动缩小
      if (chat.width > availableWidth - 20) {
        const newWidth = Math.max(minWidth, availableWidth - 20);
        setChatWidth(newWidth);
      }
    };

    window.addEventListener('resize', handleResize);
    // 初始检查
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, [chat.visible, chat.width, fileTree.visible, fileTree.width, isFullscreenChatMode, setChatWidth]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      {/* 欢迎页面 - 全屏覆盖 */}
      {shouldShowWelcome && (
        <WelcomePage
          onClose={() => {
            if (currentWorkspace) {
              setShowWelcomeDialog(false);
            }
          }}
          onStartChat={handleStartChat}
        />
      )}

      {/* 主内容区域 - 欢迎页面显示时不渲染 */}
      {!shouldShowWelcome && (
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          {/* 全屏聊天模式（没有工作区时） */}
          {isFullscreenChatMode ? (
            <>
              {/* 全屏聊天窗口 */}
              <div className="flex-1 min-w-0 overflow-hidden relative">
                <ChatPanel isFullscreen={true} />
              </div>
              {/* 悬浮操作按钮（只在没有工作区时显示） */}
              {!currentWorkspace && <FloatingActionButton />}
              {/* Toast 通知 */}
              <ToastContainer toasts={toasts} onClose={removeToast} />
            </>
          ) : (
            <>
              {/* 文件树：左侧固定 */}
              {fileTree.visible && (
                <div
                  className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0 relative"
                  style={{ width: fileTree.width, height: '100%' }}
                >
                  <FileTreePanel />
                </div>
              )}

              {/* 文件树与编辑器之间的分隔条 */}
              {fileTree.visible && (
                <PanelResizer
                  direction="horizontal"
                  onResize={handleFileTreeResize}
                  onResizeEnd={resetDragState}
                />
              )}

              {/* 编辑器：中间自适应 */}
              {editor.visible ? (
                <div className="flex-1 min-w-0 overflow-hidden relative" style={{ height: '100%' }}>
                  <EditorPanel />
                </div>
              ) : (
                <div className="flex-1 min-w-0 overflow-hidden relative flex items-center justify-center bg-gray-50 dark:bg-gray-900" style={{ height: '100%' }}>
                  <div className="text-center">
                    <p className="text-gray-500 dark:text-gray-400 mb-2">编辑器已关闭</p>
                    <button
                      onClick={() => setEditorVisible(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      显示编辑器
                    </button>
                  </div>
                </div>
              )}

              {/* 编辑器与聊天窗口之间的分隔条 */}
              {chat.visible && fileTree.visible && editor.visible && (
                <PanelResizer
                  direction="horizontal"
                  onResize={handleChatResize}
                  onResizeEnd={resetDragState}
                />
              )}

              {/* 聊天窗口：右侧固定（有工作区时） */}
              {chat.visible && !isFullscreenChatMode && (
                <div
                  className="bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0 relative"
                  style={{ 
                    width: chat.width, 
                    height: '100%',
                    maxWidth: '100%', // 确保不会超出父容器
                    minWidth: '250px', // 最小宽度
                  }}
                >
                  <ChatPanel />
                </div>
              )}

              {/* Toast 通知 */}
              <ToastContainer toasts={toasts} onClose={removeToast} />
            </>
          )}
        </div>
      )}

      {/* 底部状态栏 - 横跨整个应用窗口 */}
      {!shouldShowWelcome && (
        <StatusBar />
      )}
    </div>
  );
};

export default MainLayout;
