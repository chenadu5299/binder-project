import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import EditorTabs from './EditorTabs';
import ReadOnlyBanner from './ReadOnlyBanner';
import EditorToolbar from './EditorToolbar';
import TipTapEditor from './TipTapEditor';
import FilePreview from './FilePreview';
import { InlineAssistInput } from './InlineAssistInput';
import { DiffView } from './DiffView';
import { InlineAssistPosition } from './InlineAssistPosition';
import { useInlineAssist } from '../../hooks/useInlineAssist';
import { documentService } from '../../services/documentService';

const EditorPanel: React.FC = () => {
  const { currentWorkspace } = useFileStore();
  const { tabs, activeTabId, updateTabContent, markTabSaved, setTabEditor, setTabSaving } = useEditorStore();
  
  // 使用 useMemo 稳定 activeTab 引用
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);
  
  // Inline Assist 功能
  const inlineAssist = useInlineAssist(activeTab?.editor || null);
  
  // Cmd+K 快捷键处理 - 使用 capture 阶段确保优先处理
  useEffect(() => {
    if (!activeTab?.editor || activeTab.isReadOnly) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      // 检查是否是 Cmd+K 或 Ctrl+K
      if (modifier && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🔧 Cmd+K 快捷键被触发');
        
        // 立即执行，不需要 setTimeout
        try {
          if (!activeTab?.editor) {
            console.log('⚠️ 编辑器未就绪');
            return;
          }
          
          const { from, to } = activeTab.editor.state.selection;
          const selectedText = activeTab.editor.state.doc.textBetween(from, to);
          
          console.log('📝 选中文本:', selectedText.substring(0, 50));
          
          // 打开 Inline Assist（无论是否有选中文本）
          inlineAssist.open('', selectedText || '');
        } catch (error) {
          console.error('❌ 打开 Inline Assist 失败:', error);
        }
      }
    };
    
    // 使用 capture 阶段，确保优先处理
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTab, inlineAssist]);
  
  // 使用 useCallback 稳定函数引用
  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.editor) {
      console.warn('⚠️ 保存失败: 没有活动的标签页或编辑器未就绪');
      return;
    }
    
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
        alert('文件是只读模式，无法保存');
        return;
      }
      
      setTabSaving(activeTab.id, true);
      // 使用编辑器中的最新内容
      await documentService.saveFile(activeTab.filePath, currentContent);
      // 同步更新 store 中的内容
      updateTabContent(activeTab.id, currentContent);
      markTabSaved(activeTab.id);
      console.log('✅ 文件保存成功');
    } catch (error) {
      console.error('❌ 保存失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`保存失败: ${errorMessage}`);
    } finally {
      setTabSaving(activeTab.id, false);
    }
  }, [activeTab, setTabSaving, markTabSaved, updateTabContent]);
  
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
    }
  }, [activeTab, setTabEditor]);

  // 获取文件类型
  const getFileType = (filePath: string): 'docx' | 'md' | 'html' | 'txt' | 'pdf' | 'image' => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'docx') return 'docx';
    if (ext === 'md') return 'md';
    if (ext === 'html') return 'html';
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
    return 'txt';
  };

  // 自动保存功能
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>('');

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
        if (activeTab.isReadOnly || !activeTab.editor) {
          console.warn('⚠️ 自动保存跳过: 文件是只读模式或编辑器未就绪');
          return;
        }
        
        // ⚠️ 关键修复：直接从编辑器获取最新内容
        const currentContent = activeTab.editor.getHTML();
        
        console.log('💾 自动保存文件:', {
          filePath: activeTab.filePath,
          contentLength: currentContent.length,
        });
        
        setTabSaving(activeTab.id, true);
        // 使用编辑器中的最新内容
        await documentService.saveFile(activeTab.filePath, currentContent);
        // 同步更新 store 中的内容
        updateTabContent(activeTab.id, currentContent);
        markTabSaved(activeTab.id);
        lastContentRef.current = currentContent;
        console.log('✅ 自动保存成功');
      } catch (error) {
        console.error('❌ 自动保存失败:', error);
        // 静默失败，不打扰用户，但记录错误
      } finally {
        setTabSaving(activeTab.id, false);
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [activeTab?.content, activeTab?.id, activeTab?.isDirty, activeTab?.isReadOnly, activeTab?.editor, setTabSaving, markTabSaved, updateTabContent]);

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
      <div className="flex-shrink-0">
        <EditorTabs />
      </div>
      
      {/* 只读模式提示栏 */}
      {activeTab && <ReadOnlyBanner tabId={activeTab.id} />}
      
      {/* 工具栏 */}
      {activeTab && (
        <EditorToolbar 
          editor={activeTab.editor} 
          fileType={getFileType(activeTab.filePath)}
          documentPath={activeTab.filePath}
        />
      )}
      
      {/* 编辑器内容 */}
      {activeTab ? (() => {
        const fileType = getFileType(activeTab.filePath);
        
        // PDF 和图片文件使用预览组件
        if (fileType === 'pdf' || fileType === 'image') {
          return (
            <div className="flex-1 overflow-hidden">
              <FilePreview filePath={activeTab.filePath} fileType={fileType} />
            </div>
          );
        }
        
        // HTML 文件：直接显示 HTML 内容（保持格式）
        if (fileType === 'html') {
          return (
            <div className="flex-1 overflow-y-auto p-4">
              <div 
                className="prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: activeTab.content }}
              />
            </div>
          );
        }
        
        // 其他文本文件使用编辑器
        return (
          <div className="flex-1 overflow-hidden relative">
            <TipTapEditor
              content={activeTab.content}
              onChange={handleContentChange}
              onSave={handleSave}
              editable={!activeTab.isReadOnly}
              onEditorReady={handleEditorReady}
              tabId={activeTab.id}
            />
            
            {/* Inline Assist 输入框 */}
            {inlineAssist.state.isVisible && !inlineAssist.state.diff && activeTab.editor && (
              <InlineAssistPosition editor={activeTab.editor}>
                <InlineAssistInput
                  instruction={inlineAssist.state.instruction}
                  selectedText={inlineAssist.state.selectedText}
                  onInstructionChange={(instruction) => {
                    inlineAssist.open(instruction, inlineAssist.state.selectedText);
                  }}
                  onExecute={inlineAssist.execute}
                  onClose={inlineAssist.close}
                  isLoading={inlineAssist.state.isLoading}
                />
              </InlineAssistPosition>
            )}
            
            {/* Diff 视图 */}
            {inlineAssist.state.diff && activeTab.editor && (
              <InlineAssistPosition editor={activeTab.editor}>
                <DiffView
                  diff={inlineAssist.state.diff}
                  onAccept={inlineAssist.accept}
                  onReject={inlineAssist.reject}
                />
              </InlineAssistPosition>
            )}
            
            {/* 错误提示 */}
            {inlineAssist.state.error && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                {inlineAssist.state.error}
              </div>
            )}
          </div>
        );
      })() : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">
            从文件树中选择文件开始编辑
          </p>
        </div>
      )}
    </div>
  );
};

export default EditorPanel;

