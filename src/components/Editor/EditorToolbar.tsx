import React from 'react';
import { Editor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  LinkIcon,
  PhotoIcon,
  DocumentTextIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useLayoutStore } from '../../stores/layoutStore';
import { toast } from '../Common/Toast';

interface EditorToolbarProps {
  editor: Editor | null;
  fileType: 'docx' | 'md' | 'html' | 'txt' | 'pdf' | 'image';
  documentPath?: string;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, fileType, documentPath }) => {
  const { analysis, setAnalysisVisible } = useLayoutStore();
  
  if (!editor) return null;
  
  // PDF 和图片文件不显示工具栏
  if (fileType === 'pdf' || fileType === 'image') {
    return null;
  }

  // 根据文件类型显示不同的工具栏按钮
  const showFullToolbar = fileType === 'docx' || fileType === 'html';

  return (
    <div className="flex items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* 基础格式 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.chain().focus().toggleBold().run();
        }}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive('bold') ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="粗体 (Cmd+B)"
      >
        <BoldIcon className="w-5 h-5" />
      </button>
      
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.chain().focus().toggleItalic().run();
        }}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive('italic') ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="斜体 (Cmd+I)"
      >
        <ItalicIcon className="w-5 h-5" />
      </button>

      {/* 标题 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleHeading({ level: 1 }).run();
            }}
            className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${
              editor.isActive('heading', { level: 1 }) ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="标题 1"
          >
            <DocumentTextIcon className="w-5 h-5" />
            <span className="ml-1 text-xs">H1</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleHeading({ level: 2 }).run();
            }}
            className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${
              editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="标题 2"
          >
            <DocumentTextIcon className="w-5 h-5" />
            <span className="ml-1 text-xs">H2</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().toggleHeading({ level: 3 }).run();
            }}
            className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${
              editor.isActive('heading', { level: 3 }) ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title="标题 3"
          >
            <DocumentTextIcon className="w-5 h-5" />
            <span className="ml-1 text-xs">H3</span>
          </button>
        </>
      )}

      {/* 列表 */}
      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.chain().focus().toggleBulletList().run();
        }}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive('bulletList') ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="无序列表"
      >
        <ListBulletIcon className="w-5 h-5" />
      </button>

      {/* 链接和图片 */}
      {showFullToolbar && (
        <>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const url = window.prompt('请输入链接地址:');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="插入链接"
          >
            <LinkIcon className="w-5 h-5" />
          </button>
          
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { invoke } = await import('@tauri-apps/api/core');
                
                const selected = await open({
                  multiple: false,
                  filters: [{
                    name: 'Images',
                    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
                  }],
                });
                
                if (!selected || typeof selected !== 'string') {
                  return;
                }
                
                if (!documentPath) {
                  toast.warning('无法插入图片：未指定文档路径');
                  return;
                }
                
                // 调用后端插入图片
                const relativePath = await invoke<string>('insert_image', {
                  documentPath,
                  imageSource: selected,
                });
                
                // 在编辑器中插入图片（使用相对路径）
                editor.chain().focus().setImage({ src: relativePath }).run();
              } catch (error) {
                console.error('插入图片失败:', error);
                toast.error(`插入图片失败: ${error instanceof Error ? error.message : String(error)}`);
              }
            }}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="插入图片"
          >
            <PhotoIcon className="w-5 h-5" />
          </button>
        </>
      )}

      {/* 分析面板切换按钮 */}
      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAnalysisVisible(!analysis.visible);
        }}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          analysis.visible ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        title="切换文档分析面板"
      >
        <ChartBarIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default EditorToolbar;

