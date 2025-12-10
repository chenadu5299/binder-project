import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { 
  FolderIcon, 
  DocumentTextIcon, 
  ChatBubbleLeftRightIcon 
} from '@heroicons/react/24/outline';

const TitleBar: React.FC = () => {
  const { 
    fileTree, 
    editor,
    chat, 
    setFileTreeVisible,
    setEditorVisible,
    setChatVisible 
  } = useLayoutStore();

  return (
    <div 
      className="fixed top-0 right-0 flex items-center gap-1.5 px-3 py-1 z-[9999]"
      style={{
        WebkitAppRegion: 'no-drag',
        // macOS 标题栏高度，按钮垂直居中
        height: '28px',
      }}
    >
      {/* 文件树切换按钮 */}
      <button
        onClick={() => setFileTreeVisible(!fileTree.visible)}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center
          transition-all duration-200
          ${fileTree.visible 
            ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }
        `}
        title={fileTree.visible ? '隐藏文件树' : '显示文件树'}
      >
        <FolderIcon className="w-4 h-4" />
      </button>

      {/* 编辑器切换按钮 */}
      <button
        onClick={() => setEditorVisible(!editor.visible)}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center
          transition-all duration-200
          ${editor.visible 
            ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }
        `}
        title={editor.visible ? '隐藏编辑器' : '显示编辑器'}
      >
        <DocumentTextIcon className="w-4 h-4" />
      </button>

      {/* 聊天窗口切换按钮 */}
      <button
        onClick={() => setChatVisible(!chat.visible)}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center
          transition-all duration-200
          ${chat.visible 
            ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }
        `}
        title={chat.visible ? '隐藏聊天窗口' : '显示聊天窗口'}
      >
        <ChatBubbleLeftRightIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default TitleBar;

