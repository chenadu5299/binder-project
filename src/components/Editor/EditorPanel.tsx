import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { useDiffStore } from '../../stores/diffStore';
import { useLayoutStore } from '../../stores/layoutStore';
import EditorTabs from './EditorTabs';
import EditorToolbar from './EditorToolbar';
import TipTapEditor from './TipTapEditor';
import EditorStatusBar from './EditorStatusBar';
import FilePreview from './FilePreview';
import ExternalModificationDialog from './ExternalModificationDialog';
import { InlineAssistPanel } from './InlineAssistPanel';
import { InlineAssistPosition } from './InlineAssistPosition';
import DocumentAnalysisPanel from './DocumentAnalysisPanel';
import DocxPdfPreview from './DocxPdfPreview';
import PresentationPreview from './PresentationPreview';
import CsvPreview from './CsvPreview';
import MediaPreview from './MediaPreview';
import { useInlineAssist } from '../../hooks/useInlineAssist';
import { useAutoComplete } from '../../hooks/useAutoComplete';
import { AutoCompletePopover } from './AutoCompletePopover';
import { documentService } from '../../services/documentService';
import { toast } from '../Common/Toast';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { findBlockAtPos } from '../../utils/anchorFromSelection';

// 保存进度事件类型
interface SaveProgressEvent {
  file_path: string;
  status: 'started' | 'converting' | 'saving' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

// HTML 预览组件（使用 iframe 隔离样式，避免影响全局应用）
const HTMLPreview: React.FC<{ content: string }> = ({ content }) => {
  const htmlUrl = useMemo(() => {
    const htmlBlob = new Blob([content], { type: 'text/html' });
    return URL.createObjectURL(htmlBlob);
  }, [content]);
  
  // 组件卸载时清理 URL，避免内存泄漏
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(htmlUrl);
    };
  }, [htmlUrl]);
  
  return (
    <div className="h-full overflow-hidden">
      <iframe
        src={htmlUrl}
        className="w-full h-full border-0"
        title="HTML 预览"
        sandbox="allow-same-origin"
      />
    </div>
  );
};

const EditorPanel: React.FC = () => {
  const { currentWorkspace, markEditorSaveComplete } = useFileStore();
  const { tabs, activeTabId, updateTabContent, markTabSaved, setTabEditor, setTabSaving, updateTabModifiedTime, setInvalidCommandHint } = useEditorStore();
  useDiffStore((s) => s.byTab); // 问题7：订阅以在 diff 变化时重渲染审阅确认栏
  const { analysis, setAnalysisVisible: _setAnalysisVisible, editor: editorLayout, setEditorVisible } = useLayoutStore();
  const editorZoom = editorLayout?.zoom ?? 100;

  // 外部修改对话框状态
  const [externalModifiedTab, setExternalModifiedTab] = useState<{ id: string; filePath: string } | null>(null);

  // 使用 useMemo 稳定 activeTab 引用
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);
  
  // Inline Assist 功能（局部修改 Cmd+K）
  const inlineAssist = useInlineAssist(activeTab?.editor || null);

  // 辅助续写（Cmd+J）
  const autoComplete = useAutoComplete(activeTab?.editor ?? null, {
    documentPath: activeTab?.filePath ?? null,
    workspacePath: currentWorkspace ?? null,
    minContextLength: 50,
    maxLength: 80,
  });

  // 辅助续写错误提示
  useEffect(() => {
    if (autoComplete.state.error && !autoComplete.state.isLoading) {
      toast.error(autoComplete.state.error);
      autoComplete.clear();
    }
  }, [autoComplete.state.error, autoComplete.state.isLoading]);

  const editorZoomScrollRef = useRef<HTMLDivElement | null>(null);

  // Agent 模式：监听编辑器内容更新事件（来自 AI 工具调用）
  useEffect(() => {
    const setupListener = async () => {
      try {
        const unlisten = await listen('editor-update-content', (event: any) => {
          const payload = event.payload as {
            tabId: string;
            content: string;
          };

          const tab = tabs.find(t => t.id === payload.tabId);
          if (tab && tab.editor) {
            // 更新编辑器内容
            tab.editor.commands.setContent(payload.content);
            // 更新 store 中的内容（状态栏会显示未保存/已保存）
            updateTabContent(payload.tabId, payload.content);
          }
        });

        return unlisten;
      } catch (error) {
        console.error('初始化编辑器更新事件监听失败:', error);
        return () => {};
      }
    };

    let unlistenFn: (() => void) | null = null;
    setupListener().then(unlisten => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [tabs, updateTabContent]);
  
  // ⚠️ Week 17.1.2：定期检查外部修改（每 5 秒）
  // 检测到外部修改时弹出对话框让用户选择
  useEffect(() => {
    if (tabs.length === 0) return;

    const checkInterval = setInterval(async () => {
      // 如果对话框已弹出，跳过本轮检查
      if (externalModifiedTab) return;

      for (const tab of tabs) {
        // 只检查非脏文件（未修改的文件）
        if (tab.isDirty || !tab.filePath || tab.isReadOnly) continue;

        // ⚠️ 关键修复：如果 lastModifiedTime 为 0 或无效，跳过检查
        if (!tab.lastModifiedTime || tab.lastModifiedTime === 0) {
          continue;
        }

        try {
          const isModified = await invoke<boolean>('check_external_modification', {
            path: tab.filePath,
            lastModifiedMs: tab.lastModifiedTime,
          });

          if (isModified) {
            // 弹出对话框，让用户选择覆盖还是加载外部更改
            setExternalModifiedTab({ id: tab.id, filePath: tab.filePath });
            break;
          }
        } catch (error) {
          console.error(`检查文件 ${tab.filePath} 外部修改失败:`, error);
        }
      }
    }, 5000); // 每 5 秒检查一次

    return () => clearInterval(checkInterval);
  }, [tabs, externalModifiedTab]);

  // 外部修改对话框：继续覆盖（保持编辑器内容，仅更新 mtime）
  const handleContinueOverwrite = useCallback(async () => {
    if (!externalModifiedTab) return;
    const { id, filePath } = externalModifiedTab;
    setExternalModifiedTab(null);
    try {
      const newModifiedTime = await invoke<number>('get_file_modified_time', { path: filePath });
      updateTabModifiedTime(id, newModifiedTime);
    } catch (e) {
      console.error('更新文件修改时间失败:', e);
    }
  }, [externalModifiedTab, updateTabModifiedTime]);

  // 外部修改对话框：加载外部更改（重新读取磁盘内容，并使所有 pending diffs 失效）
  const handleLoadExternalChanges = useCallback(async () => {
    if (!externalModifiedTab) return;
    const { id, filePath } = externalModifiedTab;
    setExternalModifiedTab(null);
    try {
      // 使该文件所有 pending diffs 静默失效（与用户手动编辑 diff 区域的处理一致）
      const diffStore = useDiffStore.getState();
      const pendingDiffs = diffStore.getPendingDiffs(filePath);
      for (const d of pendingDiffs) {
        diffStore.markExpired(filePath, d.diffId);
      }
      // 重新从磁盘读取内容
      const ext = filePath.split('.').pop()?.toLowerCase();
      const isDocx = ['docx', 'doc', 'odt', 'rtf'].includes(ext || '');
      const newContent = isDocx
        ? await invoke<string>('open_docx_for_edit', { path: filePath })
        : await invoke<string>('read_file_content', { path: filePath });
      useEditorStore.getState().updateTabContent(id, newContent);
      // 更新 mtime
      const newModifiedTime = await invoke<number>('get_file_modified_time', { path: filePath });
      updateTabModifiedTime(id, newModifiedTime);
    } catch (e) {
      console.error('加载外部更改失败:', e);
      toast.error(`加载外部更改失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [externalModifiedTab, updateTabModifiedTime]);
  
  // Cmd+J（辅助续写）与 Cmd+K（局部修改）快捷键处理 - 使用 capture 阶段确保优先处理
  useEffect(() => {
    if (!activeTab?.editor || activeTab.isReadOnly) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      // Phase 0.1：光标未激活时提示
      if (!activeTab?.editor || !activeTab.editor.isFocused) {
        if (modifier && (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K')) {
          setInvalidCommandHint('指令无效');
        }
        return;
      }

      // Cmd+J：辅助续写
      if (modifier && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        e.stopPropagation();
        if (autoComplete.state.isVisible) {
          autoComplete.clear();
          autoComplete.trigger();
        } else {
          autoComplete.trigger();
        }
        return;
      }
      
      // Cmd+K：局部修改
      if (modifier && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        
        if (inlineAssist.state.isVisible) {
          inlineAssist.close();
          return;
        }
        
        try {
          const { from, to } = activeTab.editor.state.selection;
          let selectedText: string;
          let selectionRange: { from: number; to: number } | null;
          if (from === to) {
            // Phase 0.3：无选区时，用光标所在块的全文作为操作对象
            const blockFound = findBlockAtPos(activeTab.editor.state.doc, from);
            selectedText = blockFound ? blockFound.node.textContent : '';
            selectionRange = null;
          } else {
            selectedText = activeTab.editor.state.doc.textBetween(from, to);
            selectionRange = { from, to };
          }
          inlineAssist.open('', selectedText, selectionRange);
        } catch (error) {
          console.error('❌ 打开 Inline Assist 失败:', error);
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTab, inlineAssist, autoComplete, setInvalidCommandHint]);

  // 弹窗已打开时，监听选区变化并实时同步选中内容（先调出窗口再选中场景）
  useEffect(() => {
    if (!activeTab?.editor || !inlineAssist.state.isVisible || activeTab.isReadOnly) return;
    const editor = activeTab.editor;
    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      const newSelectedText = from === to ? '' : editor.state.doc.textBetween(from, to);
      const selectionRange = from !== to ? { from, to } : null;
      inlineAssist.updateSelectedText(newSelectedText, selectionRange);
    };
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => { editor.off('selectionUpdate', handleSelectionUpdate); };
  }, [activeTab, inlineAssist.state.isVisible, inlineAssist.updateSelectedText]);

  // 使用 useCallback 稳定函数引用
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>('');

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.editor) {
      console.warn('⚠️ 保存失败: 没有活动的标签页或编辑器未就绪');
      return;
    }
    
    // 手动保存时取消待执行的自动保存，避免同一内容被保存两次
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    // Race 1 修复：防止并发保存（自动保存进行中时跳过手动保存）
    if (activeTab.isSaving) return;

    try {
      // ⚠️ 关键修复：直接从编辑器获取最新内容，而不是从 store
      const currentContent = activeTab.editor.getHTML();
      
      console.log('💾 开始保存文件:', {
        filePath: activeTab.filePath,
        contentLength: currentContent.length,
        storeContentLength: activeTab.content.length,
        isReadOnly: activeTab.isReadOnly,
      });
      
      if (activeTab.isReadOnly) {
        console.warn('⚠️ 文件是只读模式，无法保存');
        toast.warning('文件是只读模式，无法保存');
        return;
      }
      
      setTabSaving(activeTab.id, true);
      // 使用编辑器中的最新内容
      await documentService.saveFile(activeTab.filePath, currentContent);
      // Race 2 修复：不调用 updateTabContent（避免用快照覆盖用户在 await 期间的新输入）
      // markTabSaved 记录实际写入磁盘的内容，isDirty 由 tab.content !== savedContent 重新计算
      markTabSaved(activeTab.id, currentContent);
      // 问题7：手动保存时触发审阅确认所有文档（清除绿色）
      useDiffStore.getState().markReviewConfirmed();
      // ⚠️ 关键修复：保存后更新文件修改时间，避免误判为外部修改
      try {
        const newModifiedTime = await invoke<number>('get_file_modified_time', { path: activeTab.filePath });
        updateTabModifiedTime(activeTab.id, newModifiedTime);
      } catch (error) {
        console.error('更新文件修改时间失败:', error);
      }
      if (currentWorkspace) markEditorSaveComplete(currentWorkspace);
      console.log('✅ 文件保存成功');
    } catch (error) {
      console.error('❌ 保存失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`保存失败: ${errorMessage}`);
    } finally {
      setTabSaving(activeTab.id, false);
    }
  }, [activeTab, setTabSaving, markTabSaved, updateTabContent, updateTabModifiedTime, currentWorkspace, markEditorSaveComplete]);
  
  // 使用 useCallback 稳定函数引用
  const handleContentChange = useCallback((content: string) => {
    if (activeTab) {
      updateTabContent(activeTab.id, content);
    }
  }, [activeTab, updateTabContent]);
  
  // 使用 useCallback 稳定函数引用，并检查编辑器是否已设置
  const handleEditorReady = useCallback((editor: any) => {
    if (activeTab && editor && activeTab.editor !== editor) {
      setTabEditor(activeTab.id, editor);
      // Phase 2：editor 就绪后 resolve pending diffs（6.2）
      const pending = useDiffStore.getState().byFilePath[activeTab.filePath];
      if (pending?.length && editor.state?.doc) {
        const { resolved, total, unmapped } = useDiffStore.getState().resolveFilePathDiffs(
          activeTab.filePath,
          editor.state.doc
        );
        const miss = unmapped ?? Math.max(0, total - resolved);
        if (miss > 0) {
          console.warn(`[EditorPanel] resolveFilePathDiffs: ${miss} 处未能映射到编辑器（可聊天内接受或重新解析）`, {
            filePath: activeTab.filePath,
            resolved,
            total,
            unmapped,
          });
        }
      }
    }
  }, [activeTab, setTabEditor]);

  // 获取文件类型
  const getFileType = (filePath: string): 'docx' | 'excel' | 'presentation' | 'md' | 'html' | 'txt' | 'pdf' | 'image' | 'audio' | 'video' => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'docx' || ext === 'doc' || ext === 'odt' || ext === 'rtf') return 'docx';
    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods' || ext === 'csv') return 'excel';
    if (ext === 'pptx' || ext === 'ppt' || ext === 'ppsx' || ext === 'pps' || ext === 'odp') return 'presentation';
    if (ext === 'md') return 'md';
    if (ext === 'html') return 'html';
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext || '')) return 'audio';
    if (['mp4', 'webm'].includes(ext || '')) return 'video';
    return 'txt';
  };

  // 自动保存功能（saveTimerRef、lastContentRef 已在 handleSave 上方声明）
  useEffect(() => {
    if (!activeTab || activeTab.isReadOnly || !activeTab.isDirty) {
      return;
    }

    // 清除之前的定时器
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 只有内容真正变化时才保存
    if (activeTab.content === lastContentRef.current) {
      return;
    }

    lastContentRef.current = activeTab.content;

    // 2 秒防抖后自动保存
    saveTimerRef.current = setTimeout(async () => {
      try {
        // 再次检查：避免重复保存（可能手动保存已完成）
        const store = useEditorStore.getState();
        const currentTab = store.tabs.find(t => t.id === activeTab.id);
        if (!currentTab || currentTab.isReadOnly || !currentTab.editor || !currentTab.isDirty || currentTab.isSaving) {
          return;
        }
        
        // ⚠️ 关键修复：直接从编辑器获取最新内容
        const currentContent = currentTab.editor.getHTML();
        
        console.log('💾 自动保存文件:', {
          filePath: currentTab.filePath,
          contentLength: currentContent.length,
        });
        
        setTabSaving(currentTab.id, true);
        await documentService.saveFile(currentTab.filePath, currentContent);
        // Race 2 修复：不调用 updateTabContent，避免快照覆盖 await 期间的新输入
        markTabSaved(currentTab.id, currentContent);
        try {
          const newModifiedTime = await invoke<number>('get_file_modified_time', { path: currentTab.filePath });
          updateTabModifiedTime(currentTab.id, newModifiedTime);
        } catch (error) {
          console.error('更新文件修改时间失败:', error);
        }
        const ws = useFileStore.getState().currentWorkspace;
        if (ws) useFileStore.getState().markEditorSaveComplete(ws);
        lastContentRef.current = currentContent;
        console.log('✅ 自动保存成功');
      } catch (error) {
        console.error('❌ 自动保存失败:', error);
      } finally {
        const store = useEditorStore.getState();
        const tab = store.tabs.find(t => t.id === activeTab.id);
        if (tab) setTabSaving(tab.id, false);
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [activeTab?.content, activeTab?.id, activeTab?.isDirty, activeTab?.isReadOnly, activeTab?.editor, setTabSaving, markTabSaved]);

  // 保存进度监听
  // Race 3 修复：不依赖 activeTab 闭包，改为从 store 按 file_path 实时查找 tab
  // 防止切换标签页后闭包过时导致事件打到错误 tab 或被静默丢弃
  useEffect(() => {
    const setupSaveProgressListener = async () => {
      try {
        const unlisten = await listen<SaveProgressEvent>('fs-save-progress', (event) => {
          const { file_path, status, error } = event.payload;
          const tab = useEditorStore.getState().tabs.find(t => t.filePath === file_path);
          if (!tab) return;
          if (status === 'started') {
            setTabSaving(tab.id, true);
          } else if (status === 'completed') {
            // markTabSaved 由各前端保存路径（handleSave / 自动保存）在 await 后调用，
            // 此处仅清除 isSaving 状态，避免用不明确的 savedContent 覆盖 lastSavedContent
            setTabSaving(tab.id, false);
          } else if (status === 'failed') {
            setTabSaving(tab.id, false);
            toast.error(`保存失败: ${error || '未知错误'}`);
          }
        });

        return unlisten;
      } catch (error) {
        console.error('初始化保存进度监听失败:', error);
        return () => {};
      }
    };

    let unlistenFn: (() => void) | null = null;
    setupSaveProgressListener().then(unlisten => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!currentWorkspace) {
    return (
      <div className="h-full bg-white dark:bg-gray-900 flex flex-col items-center justify-center">
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ 请先选择工作区才能开始使用
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white dark:bg-gray-900 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
      {/* 标签页栏 */}
      <div className="flex-shrink-0 relative">
        <EditorTabs />
        {/* 关闭按钮 */}
        <button
          onClick={() => setEditorVisible(false)}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors z-10"
          title="关闭编辑器"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      
      
      {/* 工具栏 */}
      {activeTab && (
        <EditorToolbar 
          editor={activeTab.editor} 
          fileType={getFileType(activeTab.filePath)}
          documentPath={activeTab.filePath}
        />
      )}

      {/* Phase 3：当前文件有 workspace pending diffs 时显示确认栏 */}
      {activeTab && currentWorkspace && (() => {
        const pending = useDiffStore.getState().byFilePath[activeTab.filePath];
        const stats = useDiffStore.getState().byFilePathResolveStats[activeTab.filePath];
        if (!pending?.length) return null;
        const total = pending.length;
        const resolved = stats?.resolved ?? total;
        const rep = pending.find((e) => e.chatTabId && e.agentTaskId);
        return (
          <div className="flex-shrink-0 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 flex items-center justify-between">
            <span className="text-xs text-amber-800 dark:text-amber-200">
              {resolved < total
                ? `${total} 处修改待确认（${total - resolved} 处未能精准显示）`
                : `${total} 处修改待确认`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const { DiffActionService } = await import('../../services/DiffActionService');
                    await DiffActionService.acceptFileDiffs(activeTab.filePath, currentWorkspace, {
                      chatTabId: rep?.chatTabId,
                      agentTaskId: rep?.agentTaskId,
                    });
                    const { updateTabContent } = useEditorStore.getState();
                    const ext = activeTab.filePath.split('.').pop()?.toLowerCase();
                    const isDocx = ['docx', 'doc', 'odt', 'rtf'].includes(ext || '');
                    const content = isDocx
                      ? await invoke<string>('open_docx_for_edit', { path: activeTab.filePath })
                      : await invoke<string>('read_file_content', { path: activeTab.filePath });
                    updateTabContent(activeTab.id, content);
                    const { toast } = await import('../Common/Toast');
                    toast.success('已应用修改并写入文件');
                  } catch (e) {
                    const { toast } = await import('../Common/Toast');
                    toast.error(`接受失败: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
                className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
              >
                全部接受
              </button>
              <button
                onClick={async () => {
                  try {
                    const { DiffActionService } = await import('../../services/DiffActionService');
                    await DiffActionService.rejectFileDiffs(activeTab.filePath, currentWorkspace, {
                      chatTabId: rep?.chatTabId,
                      agentTaskId: rep?.agentTaskId,
                    });
                    const { toast } = await import('../Common/Toast');
                    toast.info('已拒绝修改');
                  } catch (e) {
                    const { toast } = await import('../Common/Toast');
                    toast.error(`拒绝失败: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
                className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                全部拒绝
              </button>
            </div>
          </div>
        );
      })()}
      
      {/* 编辑器内容区域（包含编辑器和分析面板） */}
      <div className="flex-1 overflow-hidden flex" style={{ minWidth: 0 }}>
        {/* 编辑器内容（支持缩放，T-DOCX 时外部区域淡灰、滚动条固定） */}
        {(() => {
          const isTDocxEdit = activeTab && getFileType(activeTab.filePath) === 'docx' && !activeTab.isReadOnly;
          return (
        <div
          ref={editorZoomScrollRef}
          className={`flex-1 min-h-0 overflow-auto editor-zoom-scroll ${
            isTDocxEdit ? 'bg-[#f0f0f0] dark:bg-gray-700' : ''
          }`}
          style={{ minWidth: 0 }}
          data-zoomed={isTDocxEdit ? 'true' : undefined}
        >
          <div
            className="h-full"
            style={
              isTDocxEdit
                ? {
                    width: 794 * (editorZoom / 100),
                    minHeight: '100%',
                    margin: '0 auto',
                  }
                : undefined
            }
          >
            {activeTab ? (() => {
            const fileType = getFileType(activeTab.filePath);
            
            // PDF 和图片文件使用预览组件
            if (fileType === 'pdf' || fileType === 'image') {
              return (
                <div className="h-full overflow-hidden">
                  <FilePreview filePath={activeTab.filePath} fileType={fileType} />
                </div>
              );
            }
            
            // 音频和视频文件使用 MediaPreview 组件
            if (fileType === 'audio' || fileType === 'video') {
              return (
                <div className="h-full overflow-hidden">
                  <MediaPreview filePath={activeTab.filePath} fileType={fileType} />
                </div>
              );
            }
            
            // HTML 文件（只读模式）：使用 iframe 预览（隔离样式，避免影响全局）
            if (fileType === 'html' && activeTab.isReadOnly) {
              return <HTMLPreview content={activeTab.content} />;
            }
            
            // DOCX 文件（只读模式）：使用 DocxPdfPreview 组件（新方案：LibreOffice + PDF.js）
            if (fileType === 'docx' && activeTab.isReadOnly) {
              // ✅ 使用 DocxPdfPreview 组件（组件内部调用 preview_docx_as_pdf 命令获取 PDF）
              console.log('[EditorPanel] 渲染 DocxPdfPreview，文件路径:', activeTab.filePath);
              if (!activeTab.filePath) {
                console.error('[EditorPanel] activeTab.filePath 为空！');
                return (
                  <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-red-500">错误：文件路径为空</div>
                  </div>
                );
              }
              return <DocxPdfPreview filePath={activeTab.filePath} />;
            }
            
            // Excel 文件（只读模式）：使用表格预览组件（直接解析为 HTML 表格）
            // 注意：CSV 文件也使用 excel 类型，但会通过文件扩展名判断使用 CsvPreview
            if (fileType === 'excel' && activeTab.isReadOnly) {
              console.log('[EditorPanel] 渲染 Excel 表格预览，文件路径:', activeTab.filePath);
              if (!activeTab.filePath) {
                console.error('[EditorPanel] activeTab.filePath 为空！');
                return (
                  <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-red-500">错误：文件路径为空</div>
                  </div>
                );
              }
              
              // 检查是否为 CSV 文件（CSV 使用独立方案）
              const fileExt = activeTab.filePath.split('.').pop()?.toLowerCase();
              if (fileExt === 'csv') {
                // ✅ 使用 CsvPreview 组件
                return <CsvPreview filePath={activeTab.filePath} />;
              }
              
              // XLSX/XLS/ODS 使用表格预览方案（直接解析为 HTML 表格）
              // 第一阶段：基础解析和渲染
              const ExcelTablePreview = React.lazy(() => import('./ExcelTablePreview'));
              return (
                <React.Suspense
                  fallback={
                    <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                  }
                >
                  <ExcelTablePreview filePath={activeTab.filePath} />
                </React.Suspense>
              );
            }
            
            // 演示文稿文件（只读模式）：使用 PresentationPreview 组件（LibreOffice + PDF）
            if (fileType === 'presentation' && activeTab.isReadOnly) {
              console.log('[EditorPanel] 渲染 PresentationPreview，文件路径:', activeTab.filePath);
              if (!activeTab.filePath) {
                console.error('[EditorPanel] activeTab.filePath 为空！');
                return (
                  <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-red-500">错误：文件路径为空</div>
                  </div>
                );
              }
              return <PresentationPreview filePath={activeTab.filePath} />;
            }
            
            // DOCX 文件（编辑模式）：使用分页编辑器（页码导航在工具栏内）
            // 注意：分页模式纸张宽度固定(如794px)，不能用 overflow-hidden 裁剪，否则文字被遮挡
            // 统一逻辑：外层 zoom 包装始终有 width=794*(zoom/100)，使 scrollWidth 正确；zoom≠100 时内层 transform scale 实现视觉缩放
            // 100% 时也需显式 width，否则窗口小于 794px 时无法横向滚动到纸张边缘
            if (fileType === 'docx' && !activeTab.isReadOnly) {
              const docxContent = (
                <div className="h-full overflow-visible relative min-w-[794px]">
                  <TipTapEditor
                    content={activeTab.content}
                    onChange={handleContentChange}
                    onSave={handleSave}
                    editable={!activeTab.isReadOnly}
                    onEditorReady={handleEditorReady}
                    documentPath={activeTab.filePath}
                    workspacePath={currentWorkspace || undefined}
                    tabId={activeTab.id}
                    layoutMode="page"
                    editorZoom={editorZoom}
                  />
                  {/* Inline Assist 面板 */}
                  {inlineAssist.state.isVisible && activeTab.editor && (
                    <InlineAssistPosition editor={activeTab.editor}>
                      <InlineAssistPanel
                        state={inlineAssist.state}
                        onInstructionChange={(instruction) => {
                          inlineAssist.open(instruction, inlineAssist.state.selectedText, inlineAssist.state.selectionRange);
                        }}
                        onExecute={inlineAssist.execute}
                        onClose={inlineAssist.close}
                        onApplyEdit={inlineAssist.applyEdit}
                      />
                    </InlineAssistPosition>
                  )}
                  {/* 辅助续写悬浮卡（Cmd+J） */}
                  {autoComplete.state.isVisible && activeTab.editor && (
                    <AutoCompletePopover
                      suggestions={autoComplete.state.suggestions}
                      selectedIndex={autoComplete.state.selectedIndex}
                      position={autoComplete.state.position}
                      editor={activeTab.editor}
                      onSelect={autoComplete.selectIndex}
                      onApply={autoComplete.apply}
                      onClose={autoComplete.clear}
                    />
                  )}
                </div>
              );
              // 始终使用同一 wrapper 结构，避免 zoom 变化时 TipTapEditor 卸载导致模拟光标消失（焦点丢失）
              return (
                <div
                  style={{
                    transform: `scale(${editorZoom / 100})`,
                    transformOrigin: 'top left',
                    width: 794,
                    minHeight: '100%',
                  }}
                >
                  {docxContent}
                </div>
              );
            }
            
            // 所有文件：使用编辑器
            return (
              <div className="h-full overflow-hidden relative">
                <TipTapEditor
                  content={activeTab.content}
                  onChange={handleContentChange}
                  onSave={handleSave}
                  editable={!activeTab.isReadOnly}
                  onEditorReady={handleEditorReady}
                  documentPath={activeTab.filePath}
                  workspacePath={currentWorkspace || undefined}
                  tabId={activeTab.id}
                  editorZoom={editorZoom}
                />
                
                {/* Inline Assist 面板 */}
                {inlineAssist.state.isVisible && activeTab.editor && (
                  <InlineAssistPosition editor={activeTab.editor}>
                    <InlineAssistPanel
                      state={inlineAssist.state}
                      onInstructionChange={(instruction) => {
                        inlineAssist.open(instruction, inlineAssist.state.selectedText, inlineAssist.state.selectionRange);
                      }}
                      onExecute={inlineAssist.execute}
                      onClose={inlineAssist.close}
                      onApplyEdit={inlineAssist.applyEdit}
                    />
                  </InlineAssistPosition>
                )}

                {/* 辅助续写悬浮卡（Cmd+J） */}
                {autoComplete.state.isVisible && activeTab.editor && (
                  <AutoCompletePopover
                    suggestions={autoComplete.state.suggestions}
                    selectedIndex={autoComplete.state.selectedIndex}
                    position={autoComplete.state.position}
                    editor={activeTab.editor}
                    onSelect={autoComplete.selectIndex}
                    onApply={autoComplete.apply}
                    onClose={autoComplete.clear}
                  />
                )}
              </div>
            );
          })() : (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400">
                从文件树中选择文件开始编辑
              </p>
            </div>
          )}
          </div>
        </div>
          );
        })()}
        
        {/* 分析面板 */}
        {activeTab && analysis.visible && (
          <div
            className="flex-shrink-0 border-l border-gray-200 dark:border-gray-700"
            style={{ width: analysis.width }}
          >
            <DocumentAnalysisPanel
              documentPath={activeTab.filePath}
              content={activeTab.content}
            />
          </div>
        )}
      </div>

      {/* 问题7：审阅确认栏 - 仅当当前文档有已接受（绿底）待确认时显示，底部居中 */}
      {activeTab && activeTab.editor && !activeTab.isReadOnly && (() => {
        const acceptedForReview = useDiffStore.getState().getAcceptedForReview(activeTab.filePath);
        const allAcceptedForReview = useDiffStore.getState().getAcceptedForReview();
        if (acceptedForReview.length === 0) return null;
        return (
          <div className="flex-shrink-0 flex items-center justify-center gap-3 py-3 px-4 bg-gray-50 dark:bg-gray-800/90 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => useDiffStore.getState().markReviewConfirmed(activeTab.filePath)}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              审阅确认
            </button>
            {allAcceptedForReview.length > acceptedForReview.length && (
              <button
                onClick={() => useDiffStore.getState().markReviewConfirmed()}
                className="px-3 py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                审阅确认所有文档
              </button>
            )}
          </div>
        );
      })()}
      
      {/* 外部修改对话框 */}
      {externalModifiedTab && (() => {
        const hasPendingDiffs = (useDiffStore.getState().getPendingDiffs(externalModifiedTab.filePath).length) > 0;
        return (
          <ExternalModificationDialog
            filePath={externalModifiedTab.filePath}
            hasPendingDiffs={hasPendingDiffs}
            onContinueOverwrite={handleContinueOverwrite}
            onLoadChanges={handleLoadExternalChanges}
            onCancel={handleContinueOverwrite}
          />
        );
      })()}

      {/* 状态栏 */}
      {activeTab && (() => {
        const fileType = getFileType(activeTab.filePath);
        // 只在可编辑的文件类型或编辑器模式下显示状态栏
        // 排除预览模式（PDF、图片、HTML只读、DOCX只读、Excel只读、演示文稿只读、音频、视频）
        const isPreviewMode = activeTab.isReadOnly && (
          fileType === 'pdf' || 
          fileType === 'image' || 
          fileType === 'html' ||
          fileType === 'docx' ||
          fileType === 'excel' ||
          fileType === 'presentation' ||
          fileType === 'audio' ||
          fileType === 'video'
        );
        
        // 如果有编辑器实例，显示状态栏
        if (!isPreviewMode && activeTab.editor) {
          return <EditorStatusBar editor={activeTab.editor} />;
        }
        return null;
      })()}
      
    </div>
  );
};

export default EditorPanel;

