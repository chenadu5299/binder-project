import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useEffect, useRef } from 'react';
import { useAutoComplete } from '../../hooks/useAutoComplete';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  editable?: boolean;
  onEditorReady?: (editor: any) => void;
  tabId?: string; // 添加 tabId 用于检测标签页切换
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  content,
  onChange,
  onSave,
  editable = true,
  onEditorReady,
  tabId,
}) => {
  // 使用 ref 来跟踪是否正在从外部设置内容，避免无限循环
  const isSettingContentRef = useRef(false);
  const lastContentRef = useRef<string>(content);
  const lastTabIdRef = useRef<string | undefined>(tabId);
  
  // 创建编辑器实例（先不传入 extensions，稍后添加）
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 禁用 StarterKit 中的 Link 扩展，使用自定义配置的 Link
        link: false,
      }),
      Image.configure({
        inline: true,
        allowBase64: false,
        // ⚠️ 关键：配置图片路径解析，支持相对路径
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Link.configure({
        openOnClick: false,
      }),
    ],
    content,
    editable,
    // ⚠️ 关键：优化 onUpdate 触发频率，避免每次输入都触发保存
    onUpdate: ({ editor }) => {
      // 如果正在从外部设置内容，不触发 onChange
      if (isSettingContentRef.current) {
        return;
      }
      
      const html = editor.getHTML();
      // 只有内容真正变化时才触发 onChange
      if (html !== lastContentRef.current) {
        lastContentRef.current = html;
        onChange(html);
      }
    },
  });

  // 编辑器就绪时通知父组件（标签页切换时重置）
  useEffect(() => {
    if (tabId !== lastTabIdRef.current) {
      lastTabIdRef.current = tabId;
    }
  }, [tabId]);

  // 自动补全功能
  useAutoComplete(editor);
  
  // ⚠️ 暂时移除幽灵文字插件集成，避免错误
  // TODO: 后续通过 TipTap Extension 方式实现幽灵文字
  
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady, tabId]); // 添加 tabId 依赖，切换标签页时重新设置

  // 内容同步：只在外部内容变化时更新编辑器
  useEffect(() => {
    if (!editor) return;
    
    const currentContent = editor.getHTML();
    // 只有当外部内容与编辑器内容不同时才更新
    if (content !== currentContent && content !== lastContentRef.current) {
      isSettingContentRef.current = true;
      lastContentRef.current = content;
      // 使用 emitUpdate: false 避免触发 onUpdate
      editor.commands.setContent(content, { emitUpdate: false });
      // 使用 setTimeout 确保在下一个事件循环中重置标志
      setTimeout(() => {
        isSettingContentRef.current = false;
      }, 0);
    }
  }, [content, editor]);

  // 快捷键：Cmd/Ctrl + S 保存
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      if (modifier && e.key === 's') {
        e.preventDefault();
        onSave?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, onSave]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">加载编辑器中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <EditorContent 
        editor={editor} 
        className="flex-1 overflow-y-auto p-4 prose dark:prose-invert max-w-none focus:outline-none"
      />
    </div>
  );
};

export default TipTapEditor;

