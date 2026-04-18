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
import CharacterCount from '@tiptap/extension-character-count';
import { useEffect, useRef } from 'react';
import { CopyReferenceExtension } from './extensions/CopyReferenceExtension';
import { BlockIdExtension } from './extensions/BlockIdExtension';
import { FontSize } from './extensions/FontSize';
import { DiffDecorationExtension } from './extensions/DiffDecorationExtension';
import { SelectionHighlightExtension } from './extensions/SelectionHighlightExtension';
import { PageTopCaretExtension } from './extensions/PageTopCaretExtension';
import { BlankLineDebugExtension } from './extensions/BlankLineDebugExtension';
import { useEditorStore } from '../../stores/editorStore';
import { useDiffStore } from '../../stores/diffStore';
import { registerPendingDiffContentSync } from '../../services/diffPendingContentSync';
import { PaginationPlus } from 'tiptap-pagination-plus';
interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  editable?: boolean;
  onEditorReady?: (editor: any) => void;
  tabId?: string; // 添加 tabId 用于检测标签页切换
  documentPath?: string; // 文档路径（用于记忆库检索）
  workspacePath?: string; // 工作区路径（用于记忆库检索）
  layoutMode?: 'page' | 'flow'; // 分页模式：page=T-DOCX 分页编辑，flow=流式布局
  editorZoom?: number; // 编辑窗口缩放比例，用于控制滚动条位置
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  content,
  onChange,
  onSave,
  editable = true,
  onEditorReady,
  tabId,
  documentPath: _documentPath,
  workspacePath: _workspacePath,
  layoutMode = 'flow',
  editorZoom: _editorZoom = 100,
}) => {
  // 使用 ref 来跟踪是否正在从外部设置内容，避免无限循环
  const isSettingContentRef = useRef(false);
  const lastContentRef = useRef<string>(content);
  const lastTabIdRef = useRef<string | undefined>(tabId);
  
  
  // 获取当前标签页信息（用于复制引用功能）
  useEditorStore();
  
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
        allowBase64: true,  // ✅ 允许 base64 data URL
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
      // 字数统计扩展
      CharacterCount,
      // 块 ID 扩展（精确定位系统）
      BlockIdExtension,
      // T-DOCX 分页模式：使用 tiptap-pagination-plus（A4 纸张，Word 风格）
      ...(layoutMode === 'page'
        ? [
            BlankLineDebugExtension.configure({ layoutMode: 'page' }),
            PaginationPlus.configure({
              pageHeight: 1123,
              pageWidth: 794,
              pageGap: 24,
              pageGapBorderSize: 1,
              pageGapBorderColor: '#e5e5e5',
              pageBreakBackground: '#f0f0f0',
              marginTop: 95,
              marginBottom: 95,
              marginLeft: 76,
              marginRight: 76,
              contentMarginTop: 10,
              contentMarginBottom: 10,
              footerRight: '',
              footerLeft: '',
              headerRight: '',
              headerLeft: '',
              customHeader: {},
              customFooter: {},
            }) as any,
            PageTopCaretExtension,
          ]
        : []),
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
      // Phase 2b：基于 blockId 的 Diff 删除标记（diffStore）
      DiffDecorationExtension.configure({
        getFilePath: () => {
          const store = useEditorStore.getState();
          const currentTab = tabId
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          return currentTab?.filePath ?? null;
        },
      }),
      // 失焦选区幽灵高亮：editor 失焦后保留视觉选区
      SelectionHighlightExtension,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      // 如果正在从外部设置内容，不触发 onChange
      if (isSettingContentRef.current) {
        return;
      }
      
      // 只有内容真正变化时才触发 onChange
      const html = editor.getHTML();
      if (html !== lastContentRef.current) {
        lastContentRef.current = html;
        onChange(html);
      }
    },
  }, [tabId, layoutMode]); // 切换标签页或布局模式时重建编辑器

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
  }, [editor, onEditorReady, tabId]);

  // Diff 卡定位：当有 pendingScrollTo 且匹配当前 tab 时，滚动到指定位置
  const pendingScrollTo = useEditorStore((s) => s.pendingScrollTo);
  useEffect(() => {
    if (!editor || !tabId || !pendingScrollTo || pendingScrollTo.tabId !== tabId) return;
    const { from } = pendingScrollTo;
    useEditorStore.getState().clearPendingScrollTo();
    try {
      const pos = Math.min(from, editor.state.doc.content.size - 1);
      const { node } = editor.view.domAtPos(pos >= 0 ? pos : 0);
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      if (el && el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {
      // 忽略
    }
  }, [editor, tabId, pendingScrollTo]);

  // Diff 卡片状态机：pending 区间随文档事务与 originalText 对齐，漂移则失效
  useEffect(() => {
    if (!editor || !tabId) return;
    const filePath = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.filePath;
    if (!filePath) return;
    return registerPendingDiffContentSync(editor, filePath);
  }, [editor, tabId]);

  // Phase 2b：diffStore 更新时强制刷新文档内 Diff 装饰（红色删除线）
  // ProseMirror decorations 仅在视图更新时重算，diffStore 变化不会触发，需主动 dispatch
  useEffect(() => {
    if (!editor || !tabId) return;
    const refresh = () => {
      if (editor.isDestroyed) return;
      const tr = editor.state.tr.setMeta('diffStoreRefresh', true);
      editor.view.dispatch(tr);
    };
    const unsub = useDiffStore.subscribe(refresh);
    const filePath = useEditorStore.getState().tabs.find(t => t.id === tabId)?.filePath ?? null;
    if (filePath && useDiffStore.getState().getDisplayDiffs(filePath).length > 0) {
      requestAnimationFrame(refresh);
    }
    return unsub;
  }, [editor, tabId]);

  // 内容同步：只在外部内容变化时更新编辑器
  useEffect(() => {
    if (!editor) return;
    
    const currentContent = editor.getHTML();
    // 只有当外部内容与编辑器内容不同时才更新
    if (content !== currentContent && content !== lastContentRef.current) {
      const store = useEditorStore.getState();
      const currentTab = tabId
        ? store.tabs.find((t) => t.id === tabId)
        : store.tabs.find((t) => t.id === store.activeTabId);
      const activeEditorTab = store.tabs.find((t) => t.id === store.activeTabId) ?? null;
      if (currentTab?.filePath) {
        console.log('[CROSS_FILE_TRACE][DOC_REBUILD_INVALIDATE_RANGES]', JSON.stringify({
          targetFilePath: currentTab.filePath,
          sourceReason: 'tiptap_set_content_external_sync',
          oldRevision: currentTab.documentRevision ?? null,
          newRevision: null,
          hasPendingByFilePath: (useDiffStore.getState().byFilePath[currentTab.filePath]?.length ?? 0) > 0,
          hasResolvedByTab: (useDiffStore.getState().byTab[currentTab.filePath]?.diffs.size ?? 0) > 0,
          triggeredByActiveTab: activeEditorTab?.id === currentTab.id,
        }));
        useDiffStore.getState().invalidateDocRangesForFile(
          currentTab.filePath,
          'tiptap_set_content_external_sync',
        );
      }
      console.log('[CROSS_FILE_TRACE][SET_CONTENT]', JSON.stringify({
        sourceFile: 'TipTapEditor.tsx',
        sourceFunction: 'content_sync_useEffect',
        reason: 'external_sync',
        targetTabId: currentTab?.id ?? tabId ?? null,
        targetFilePath: currentTab?.filePath ?? null,
        oldRevision: currentTab?.documentRevision ?? null,
        newRevision: null,
        contentLength: content.length,
        contentPreview: content.slice(0, 120),
        activeEditorFilePath: activeEditorTab?.filePath ?? null,
      }));
      console.warn('[对话编辑] TipTapEditor setContent 被触发，可能覆盖文档导致 Diff 失效', {
        contentLen: content.length,
        currentContentLen: currentContent.length,
        lastContentLen: lastContentRef.current.length,
        tabId,
      });
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
      // Bug1 修复：tiptap-pagination-plus 分页扩展在初始化时为首页布局会插入占位空段落，
      // 该段落含换行/空格、每次加载 blockId 不同。在 setContent 之后、分页扩展稳定后删除。
      setTimeout(() => {
        try {
          const { state, view } = editor;
          const doc = state.doc;
          let endPos = 1;
          for (let i = 0; i < doc.childCount; i++) {
            const node = doc.child(i);
            if (node.textContent.trim() === '') {
              endPos += node.nodeSize;
            } else {
              break;
            }
          }
          if (endPos > 1) {
            view.dispatch(state.tr.delete(1, endPos));
          }
        } catch {
          // 编辑器可能已销毁
        }
      }, 100);
      setTimeout(() => {
        isSettingContentRef.current = false;
      }, 0);
    }
  }, [content, editor, tabId]);

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

  // 分页模式：所有滚动由 editor-zoom-scroll 统一处理，避免与 EditorContent 的 overflow-y-auto 产生重复/重合滚动条
  // 流式模式：EditorContent 自身 overflow-y-auto
  const scrollOnEditor = layoutMode !== 'page';

  // 分页模式下去掉水平 padding，避免与页边距叠加导致边距为 0 时文字被遮挡
  const contentPadding = layoutMode === 'page' ? 'py-4 px-0' : 'p-4';
  // 分页模式下纸张居中显示
  const contentLayout = layoutMode === 'page' ? 'flex justify-center' : '';
  return (
    <div className={`flex flex-col relative ${scrollOnEditor ? 'h-full' : 'min-h-full'}`}>
      <EditorContent 
        editor={editor} 
        className={`flex-1 ${contentPadding} ${contentLayout} prose dark:prose-invert max-w-none focus:outline-none ${
          scrollOnEditor ? 'overflow-y-auto' : 'overflow-visible min-h-full'
        }`}
      />
    </div>
  );
};

export default TipTapEditor;
