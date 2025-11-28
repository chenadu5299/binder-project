import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useEffect, useRef } from 'react';
import { useAutoComplete } from '../../hooks/useAutoComplete';
import { GhostTextExtension } from './extensions/GhostTextExtension';

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
  
  // 使用 ref 存储 getGhostText 函数，供 Extension 使用
  const getGhostTextRef = useRef<() => { text: string; position: number } | null>(() => null);
  
  // 创建编辑器实例
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
      // 添加幽灵文字扩展
      GhostTextExtension.configure({
        getGhostText: () => {
          const result = getGhostTextRef.current();
          console.log('[TipTapEditor] Extension getGhostText 被调用', { hasResult: !!result });
          return result;
        },
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

  // 自动补全功能 Hook（必须在 editor 创建后调用）
  const autoComplete = useAutoComplete({
    editor,
    triggerDelay: 7000, // 7秒延迟
    minContextLength: 50, // 最小50字符
    maxLength: 50, // 最大50字符
    enabled: true, // 启用自动续写
  });

  // 调试：监听自动续写状态
  useEffect(() => {
    console.log('[TipTapEditor] 自动续写状态变化', {
      isVisible: autoComplete.state.isVisible,
      isLoading: autoComplete.state.isLoading,
      hasText: !!autoComplete.state.text,
      position: autoComplete.state.position,
      editor: !!editor,
    });
  }, [autoComplete.state.isVisible, autoComplete.state.isLoading, autoComplete.state.text, autoComplete.state.position, editor]);

  // 更新 getGhostTextRef 并强制更新插件
  useEffect(() => {
    getGhostTextRef.current = autoComplete.getGhostText;
    console.log('[TipTapEditor] 更新 getGhostTextRef', { 
      hasGhostText: !!autoComplete.state.text,
      isVisible: autoComplete.state.isVisible,
      position: autoComplete.state.position 
    });
    
    // 当幽灵文字状态变化时，强制更新插件装饰
    if (editor && editor.view && autoComplete.state.isVisible) {
      console.log('[TipTapEditor] 强制更新插件装饰');
      // 使用 setTimeout 确保状态已经更新
      setTimeout(() => {
        if (editor && editor.view) {
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('ghostTextUpdate', true);
          dispatch(tr);
          console.log('[TipTapEditor] 已分发事务更新插件');
        }
      }, 0);
    }
  }, [editor, autoComplete.getGhostText, autoComplete.state.isVisible, autoComplete.state.text, autoComplete.state.position]);

  // 编辑器就绪时通知父组件（标签页切换时重置）
  useEffect(() => {
    if (tabId !== lastTabIdRef.current) {
      lastTabIdRef.current = tabId;
    }
  }, [tabId]);
  
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
