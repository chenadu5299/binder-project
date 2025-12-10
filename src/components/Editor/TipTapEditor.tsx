import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { FontFamily } from '@tiptap/extension-font-family';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { useEffect, useRef } from 'react';
import { useAutoComplete } from '../../hooks/useAutoComplete';
import { GhostTextExtension } from './extensions/GhostTextExtension';
import { CopyReferenceExtension } from './extensions/CopyReferenceExtension';
import { FontSize } from './extensions/FontSize';
import { useEditorStore } from '../../stores/editorStore';

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
  
  // 获取当前标签页信息（用于复制引用功能）
  const { tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  // 创建编辑器实例
  const editor = useEditor({
    // 关键：配置编辑器以保留 HTML 属性和内联样式
    parseOptions: {
      preserveWhitespace: 'full',
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none',
      },
      // 确保解析时保留所有 HTML 属性（包括 style）
      transformPastedHTML: (html) => {
        // 保留原始 HTML，包括所有内联样式
        return html;
      },
    },
    extensions: [
      StarterKit.configure({
        // 禁用 StarterKit 中的 Link 扩展，使用自定义配置的 Link
        link: false,
        // 禁用 StarterKit 中的 Underline 扩展，使用自定义配置的 Underline
        underline: false,
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
      // 文本样式扩展
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      Subscript,
      Superscript,
      FontFamily,
      FontSize,
      // 背景颜色（高亮）
      Highlight.configure({
        multicolor: true,
      }),
      // 表格扩展
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      // 任务列表
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      // 添加幽灵文字扩展
      GhostTextExtension.configure({
        getGhostText: () => {
          const result = getGhostTextRef.current();
          console.log('[TipTapEditor] Extension getGhostText 被调用', { hasResult: !!result });
          return result;
        },
      }),
      // 添加复制引用扩展
      // 使用闭包动态获取最新的 tab 信息（从 store 实时读取）
      CopyReferenceExtension.configure({
        tabId: tabId,
        getFilePath: () => {
          // 从 store 动态获取最新的 tab 信息
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          return currentTab?.filePath || null;
        },
        getFileName: () => {
          // 从 store 动态获取最新的 tab 信息
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          return currentTab?.fileName || null;
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      // 添加日志：显示编辑器内容变化
      const html = editor.getHTML();
      const json = editor.getJSON();
      console.log('[TipTapEditor] 内容更新', {
        htmlLength: html.length,
        jsonLength: JSON.stringify(json).length,
        hasContent: html.trim().length > 0,
      });
      
      // 检查样式信息
      const { from, to } = editor.state.selection;
      const marks = editor.state.storedMarks || editor.state.selection.$from.marks();
      if (marks.length > 0) {
        console.log('[TipTapEditor] 当前选中文本的样式', {
          marks: marks.map(m => ({ type: m.type.name, attrs: m.attrs })),
        });
      }
      
      // 如果正在从外部设置内容，不触发 onChange
      if (isSettingContentRef.current) {
        return;
      }
      
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
      // 关键：使用 parseOptions 确保保留所有 HTML 属性和内联样式
      editor.commands.setContent(content, { 
        emitUpdate: false,
        parseOptions: {
          preserveWhitespace: 'full',
        },
      });
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
