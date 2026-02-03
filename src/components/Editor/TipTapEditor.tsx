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
import { DOMParser } from '@tiptap/pm/model';
import { useEffect, useRef } from 'react';
import { useAutoComplete } from '../../hooks/useAutoComplete';
import { GhostTextExtension } from './extensions/GhostTextExtension';
import { CopyReferenceExtension } from './extensions/CopyReferenceExtension';
import { FontSize } from './extensions/FontSize';
import { DiffHighlightExtension } from './extensions/DiffHighlightExtension';
import { useEditorStore } from '../../stores/editorStore';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  editable?: boolean;
  onEditorReady?: (editor: any) => void;
  tabId?: string; // 添加 tabId 用于检测标签页切换
  autoCompleteEnabled?: boolean; // 自动续写功能启用状态
  documentPath?: string; // 文档路径（用于记忆库检索）
  workspacePath?: string; // 工作区路径（用于记忆库检索）
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  content,
  onChange,
  onSave,
  editable = true,
  onEditorReady,
  tabId,
  autoCompleteEnabled = true,
  documentPath,
  workspacePath,
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
      // ⚠️ 新增：添加 diff 高亮扩展
      DiffHighlightExtension.configure({
        getDiffs: () => {
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          const result = currentTab?.diffs || null;
          // ⚠️ 调试：打印获取的 diffs
          console.log('[TipTapEditor] getDiffs 被调用', {
            tabId,
            activeTabId: store.activeTabId,
            currentTabId: currentTab?.id,
            hasDiffs: !!(result && Array.isArray(result) && result.length > 0),
            diffsCount: Array.isArray(result) ? result.length : 0,
            allTabs: store.tabs.map(t => ({ id: t.id, hasDiffs: !!(t.diffs && t.diffs.length > 0), diffsCount: t.diffs?.length || 0 })),
          });
          return result;
        },
        getOldContent: () => {
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          // ⚠️ 关键修复：使用 ?? 而不是 ||，避免空字符串被转换为 null
          const result = currentTab?.oldContent ?? null;
          // ⚠️ 调试：打印获取的 oldContent
          console.log('[TipTapEditor] getOldContent 被调用', {
            tabId,
            activeTabId: store.activeTabId,
            currentTabId: currentTab?.id,
            hasOldContent: result !== null && result !== undefined,
            oldContentType: typeof result,
            oldContentLength: typeof result === 'string' ? result.length : 'N/A',
            oldContentValue: typeof result === 'string' ? result.substring(0, 50) : result,
          });
          return result;
        },
        getNewContent: () => {
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          // ⚠️ 关键修复：使用 ?? 而不是 ||，避免空字符串被转换为 null
          const result = currentTab?.newContent ?? null;
          // ⚠️ 调试：打印获取的 newContent
          console.log('[TipTapEditor] getNewContent 被调用', {
            tabId,
            activeTabId: store.activeTabId,
            currentTabId: currentTab?.id,
            hasNewContent: result !== null && result !== undefined,
            newContentType: typeof result,
            newContentLength: typeof result === 'string' ? result.length : 'N/A',
            newContentValue: typeof result === 'string' ? result.substring(0, 50) : result,
          });
          return result;
        },
        onApplyDiff: () => {
          // ⚠️ 关键修复：应用 diff 时，只应用 diff 中指定的修改部分，而不是替换整个文档
          // 这样可以保留原有的格式和样式
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          
          if (!currentTab || !editor) {
            console.warn('⚠️ [编辑器] 无法应用 diff：缺少必要数据');
            return;
          }
          
          if (!currentTab.diffs || currentTab.diffs.length === 0) {
            console.warn('⚠️ [编辑器] 无法应用 diff：缺少 diff 数据');
            return;
          }
          
          try {
            const { state, dispatch } = editor.view;
            const docSize = state.doc.content.size;
            const hasReplaceWhole = currentTab.diffs.some((d: { element_type?: string }) => d.element_type === 'replace_whole');
            
            // ⚠️ 整篇替换：使用 newContent 全文替换，不依赖 from/to
            if (hasReplaceWhole && currentTab.newContent) {
              const schema = state.schema;
              const parser = DOMParser.fromSchema(schema);
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = currentTab.newContent;
              const slice = parser.parseSlice(tempDiv);
              if (slice && slice.content.size > 0) {
                const from = 1;
                const to = Math.max(from, 1 + docSize);
                const tr = state.tr.replace(from, to, slice);
                dispatch(tr);
                store.clearTabDiff(currentTab.id);
                const clearTr = editor.view.state.tr.setMeta('diffCleared', true);
                editor.view.dispatch(clearTr);
                console.log('✅ [编辑器] 已应用整篇替换');
                return;
              }
            }
            
            let tr = state.tr;
            
            // ⚠️ 关键修复：按从后往前的顺序应用 diff，避免位置偏移
            // 先对 diffs 按位置排序（从后往前）
            const sortedDiffs = [...currentTab.diffs].sort((a, b) => {
              const aPos = a.to || a.from || 0;
              const bPos = b.to || b.from || 0;
              return bPos - aPos; // 从后往前排序
            });
            
            // ⚠️ 辅助函数：验证 diff 位置
            const validateDiffPosition = (diff: any, docSize: number): boolean => {
              const { from, to } = diff;
              
              // 1. 基本验证
              if (from === undefined || to === undefined || from < 1 || to > docSize || from >= to) {
                console.error('[validateDiffPosition] 位置无效:', { from, to, docSize });
                return false;
              }
              
              // 2. 长度验证：不允许修改超过文档 30%，避免误改全文
              const diffLength = to - from;
              if (diffLength > docSize * 0.3) {
                console.error('[validateDiffPosition] Diff 过长（超过文档 30%，拒绝应用以防误改全文）:', {
                  diffLength,
                  docSize,
                  percentage: ((diffLength / docSize) * 100).toFixed(1) + '%',
                  diff_id: diff.diff_id,
                });
                return false;
              }
              
              // 3. 置信度验证（如果有）
              if (diff.confidence !== undefined && diff.confidence < 0.7) {
                console.warn('[validateDiffPosition] 置信度过低:', {
                  confidence: diff.confidence,
                  diff_id: diff.diff_id,
                });
                // 置信度低不阻止应用，但记录警告
              }
              
              return true;
            };
            
            // 应用每个 diff
            for (const diff of sortedDiffs) {
              // ⚠️ 关键修复：增强位置验证
              if (!validateDiffPosition(diff, state.doc.content.size)) {
                console.error('⚠️ [编辑器] 跳过无效的 diff:', diff.diff_id);
                continue;
              }
              
              // ⚠️ 关键修复：在应用修改前，获取原节点的格式（marks）
              // 这样可以保留原有的粗体、斜体等格式
              const originalNode = state.doc.nodeAt(diff.from);
              const originalMarks = originalNode?.marks || [];
              
              // 根据 diff 类型应用修改
              if (diff.diff_type === 'Deletion') {
                // 删除：删除 original_code
                tr = tr.delete(diff.from, diff.to);
              } else if (diff.diff_type === 'Insertion') {
                // 插入：在 from 位置插入 new_code
                // ⚠️ 关键修复：插入时保留原有格式
                const newCode = diff.new_code || '';
                if (newCode.trim().length > 0) {
                  const schema = state.schema;
                  try {
                    // 检查是否是 HTML
                    const isHTML = newCode.trim().startsWith('<');
                    if (isHTML) {
                      // HTML 格式：使用 ProseMirror 的 DOMParser
                      const parser = DOMParser.fromSchema(schema);
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = newCode;
                      const nodes = parser.parse(tempDiv);
                      tr = tr.insert(diff.from, nodes.content);
                    } else {
                      // ⚠️ 关键修复：纯文本插入时应用原有 marks（格式）
                      // 这样可以保留粗体、斜体等格式
                      const textNode = schema.text(newCode, originalMarks);
                      // 检查插入位置是否在段落内
                      const $pos = state.doc.resolve(diff.from);
                      if ($pos.parent.type.name === 'paragraph') {
                        // 在段落内插入文本节点
                        tr = tr.insert(diff.from, textNode);
                      } else {
                        // 不在段落内，创建新段落
                        const paragraph = schema.nodes.paragraph.create({}, textNode);
                        tr = tr.insert(diff.from, paragraph);
                      }
                    }
                  } catch (error) {
                    console.warn('⚠️ [编辑器] 解析 new_code 失败，使用纯文本:', error);
                    // 降级：使用纯文本，但仍应用原有格式
                    const textNode = schema.text(newCode, originalMarks);
                    const $pos = state.doc.resolve(diff.from);
                    if ($pos.parent.type.name === 'paragraph') {
                      tr = tr.insert(diff.from, textNode);
                    } else {
                      const paragraph = schema.nodes.paragraph.create({}, textNode);
                      tr = tr.insert(diff.from, paragraph);
                    }
                  }
                }
              } else if (diff.diff_type === 'Edit') {
                // 编辑：先删除 original_code，再插入 new_code
                // ⚠️ 关键修复：删除前获取格式，插入时应用
                tr = tr.delete(diff.from, diff.to);
                const newCode = diff.new_code || '';
                if (newCode.trim().length > 0) {
                  try {
                    const schema = state.schema;
                    const isHTML = newCode.trim().startsWith('<');
                    if (isHTML) {
                      const parser = DOMParser.fromSchema(schema);
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = newCode;
                      const nodes = parser.parse(tempDiv);
                      tr = tr.insert(diff.from, nodes.content);
                    } else {
                      // ⚠️ 关键修复：纯文本插入时应用原有 marks（格式）
                      const textNode = schema.text(newCode, originalMarks);
                      const $pos = state.doc.resolve(diff.from);
                      if ($pos.parent.type.name === 'paragraph') {
                        tr = tr.insert(diff.from, textNode);
                      } else {
                        const paragraph = schema.nodes.paragraph.create({}, textNode);
                        tr = tr.insert(diff.from, paragraph);
                      }
                    }
                  } catch (error) {
                    console.warn('⚠️ [编辑器] 解析 new_code 失败，使用纯文本:', error);
                    // 降级：使用纯文本，但仍应用原有格式
                    const textNode = schema.text(newCode, originalMarks);
                    const $pos = state.doc.resolve(diff.from);
                    if ($pos.parent.type.name === 'paragraph') {
                      tr = tr.insert(diff.from, textNode);
                    } else {
                      const paragraph = schema.nodes.paragraph.create({}, textNode);
                      tr = tr.insert(diff.from, paragraph);
                    }
                  }
                }
              }
            }
            
            // 应用所有修改
            dispatch(tr);
            
            // 清除 diff 数据
            store.clearTabDiff(currentTab.id);
            
            // 触发视图刷新，确保 diff 高亮被清除
            const clearTr = editor.view.state.tr.setMeta('diffCleared', true);
            editor.view.dispatch(clearTr);
            
            console.log('✅ [编辑器] 已应用 diff，只修改了指定的部分，保留了原有格式');
          } catch (error) {
            console.error('❌ [编辑器] 应用 diff 失败:', error);
            // ⚠️ 关键修复：移除回退机制，避免全文替换导致样式丢失
            // 如果应用失败，只清除 Diff 标记，保持文档不变
            // 这样可以避免因为失败而替换整个文档，导致所有样式丢失
            console.warn('⚠️ [编辑器] 应用 diff 失败，清除 Diff 标记，保持文档不变');
            store.clearTabDiff(currentTab.id);
            const { state, dispatch } = editor.view;
            const tr = state.tr.setMeta('diffCleared', true);
            dispatch(tr);
            // 可选：通知用户
            // showNotification('部分修改应用失败，请重试');
          }
        },
        onRejectDiff: () => {
          // ⚠️ 关键修复：拒绝 diff 时，清除 diff 数据并触发视图刷新
          const store = useEditorStore.getState();
          const currentTab = tabId 
            ? store.tabs.find(t => t.id === tabId)
            : store.tabs.find(t => t.id === store.activeTabId);
          
          if (currentTab && editor) {
            // 清除 diff 数据
            store.clearTabDiff(currentTab.id);
            
            // ⚠️ 关键：触发插件状态更新，强制刷新视图
            // 通过发送一个带有 diffCleared meta 的 transaction 来触发插件清除装饰
            const { state, dispatch } = editor.view;
            const tr = state.tr.setMeta('diffCleared', true);
            dispatch(tr);
            
            console.log('❌ [编辑器] 已拒绝 diff，diff 高亮已清除，视图已刷新');
          }
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor, transaction }) => {
      // ⚠️ 关键修复：检测 applyDiff meta，如果存在，不触发 onChange
      // 实际的 onApplyDiff 调用在 DiffHighlightExtension 的 plugin 中处理
      const applyDiffMeta = transaction.getMeta('applyDiff');
      if (applyDiffMeta) {
        // onApplyDiff 会在 DiffHighlightExtension 的 plugin 中调用
        // 这里只需要跳过 onChange，避免触发不必要的更新
        return;
      }
      
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
    maxLength: 100, // 最大100字符（动态调整）
    enabled: autoCompleteEnabled, // 使用传入的启用状态
    documentPath, // 文档路径（用于记忆库检索）
    workspacePath, // 工作区路径（用于记忆库检索）
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
      
      // ⚠️ 新增：编辑器就绪后，检查是否有 diff 数据需要显示
      setTimeout(() => {
        const store = useEditorStore.getState();
        const activeTab = store.tabs.find(t => t.id === (tabId || store.activeTabId));
        if (activeTab?.diffs && activeTab.diffs.length > 0 && editor.view) {
          console.log('[TipTapEditor] 编辑器就绪，检查到 diff 数据，触发高亮');
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('diffUpdate', true);
          dispatch(tr);
        }
      }, 300);
    }
  }, [editor, onEditorReady, tabId]); // 添加 tabId 依赖，切换标签页时重新设置

  // 内容同步：只在外部内容变化时更新编辑器
  useEffect(() => {
    if (!editor) return;
    
    // ⚠️ 关键修复：检查是否有待应用的 diff，如果有，不应该使用 content 替换整个文档
    // diff 应该通过 onApplyDiff 来应用，只修改指定的部分，保留原有格式
    const store = useEditorStore.getState();
    const currentTab = tabId 
      ? store.tabs.find(t => t.id === tabId)
      : store.tabs.find(t => t.id === store.activeTabId);
    
    // 如果有待应用的 diff，不应该使用 content 替换整个文档
    // diff 应该通过 onApplyDiff 来应用，只修改指定的部分
    if (currentTab && currentTab.diffs && currentTab.diffs.length > 0) {
      console.log('[TipTapEditor] ⚠️ 检测到待应用的 diff，跳过 content 更新，等待 onApplyDiff 处理', {
        diffsCount: currentTab.diffs.length,
        diffAreaId: currentTab.diffAreaId,
      });
      return; // 不更新 content，让 onApplyDiff 来处理
    }
    
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
        
        // ⚠️ 新增：内容更新后，如果有 diff 数据，触发 diff 高亮更新
        const store = useEditorStore.getState();
        const activeTab = store.tabs.find(t => t.id === (tabId || store.activeTabId));
        if (activeTab?.diffs && activeTab.diffs.length > 0 && editor.view) {
          console.log('[TipTapEditor] 内容更新后，触发 diff 高亮更新');
          setTimeout(() => {
            if (editor && editor.view) {
              const { state, dispatch } = editor.view;
              const tr = state.tr;
              tr.setMeta('diffUpdate', true);
              dispatch(tr);
            }
          }, 100);
        }
      }, 0);
    }
  }, [content, editor, tabId]);

  // ⚠️ 新增：监听 diff 数据变化，更新编辑器 diff 高亮
  const currentTab = useEditorStore((state) => {
    const tab = tabId 
      ? state.tabs.find(t => t.id === tabId)
      : state.tabs.find(t => t.id === state.activeTabId);
    return tab ? {
      id: tab.id,
      diffAreaId: tab.diffAreaId,
      diffsCount: tab.diffs?.length || 0,
      hasDiffs: !!(tab.diffs && tab.diffs.length > 0),
      diffs: tab.diffs, // 添加完整的 diffs 用于调试
    } : null;
  });
  
  // 调试：监听 store 变化
  useEffect(() => {
    console.log('[TipTapEditor] currentTab 状态变化', {
      tabId,
      currentTab: currentTab ? {
        id: currentTab.id,
        diffAreaId: currentTab.diffAreaId,
        diffsCount: currentTab.diffsCount,
        hasDiffs: currentTab.hasDiffs,
      } : null,
      editor: !!editor,
    });
  }, [tabId, currentTab?.diffAreaId, currentTab?.diffsCount, editor]);
  
  useEffect(() => {
    if (!editor || !editor.view) {
      console.log('[TipTapEditor] 编辑器未就绪，跳过 diff 更新', { hasEditor: !!editor, hasView: !!(editor?.view) });
      return;
    }
    
    if (!currentTab) {
      console.log('[TipTapEditor] 未找到当前标签页', { tabId });
      return;
    }
    
    console.log('[TipTapEditor] 检查 diff 数据', {
      tabId: currentTab.id,
      hasDiffs: currentTab.hasDiffs,
      diffsCount: currentTab.diffsCount,
      diffAreaId: currentTab.diffAreaId,
    });
    
    if (currentTab.hasDiffs) {
      console.log('[TipTapEditor] ✅ diff 数据变化，更新高亮', {
        tabId: currentTab.id,
        diffAreaId: currentTab.diffAreaId,
        diffsCount: currentTab.diffsCount,
        diffs: currentTab.diffs?.map(d => ({
          type: d.diff_type,
          originalCode: d.original_code?.substring(0, 30),
          newCode: d.new_code?.substring(0, 30),
        })),
      });
      
      // 强制更新 diff 高亮插件
      setTimeout(() => {
        if (editor && editor.view) {
          const { state, dispatch } = editor.view;
          const tr = state.tr;
          tr.setMeta('diffUpdate', true);
          dispatch(tr);
          console.log('[TipTapEditor] ✅ 已分发 diff 更新事务');
        } else {
          console.warn('[TipTapEditor] ⚠️ 编辑器或视图不可用，无法分发事务');
        }
      }, 200); // 增加延迟，确保 store 更新完成
    } else {
      console.log('[TipTapEditor] ⚠️ 没有 diff 数据，跳过更新');
    }
  }, [editor, currentTab?.diffAreaId, currentTab?.diffsCount, currentTab?.hasDiffs]);

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
