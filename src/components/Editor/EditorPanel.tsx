import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import EditorTabs from './EditorTabs';
import EditorToolbar from './EditorToolbar';
import TipTapEditor from './TipTapEditor';
import EditorStatusBar from './EditorStatusBar';
import FilePreview from './FilePreview';
import { InlineAssistPanel } from './InlineAssistPanel';
import { InlineAssistPosition } from './InlineAssistPosition';
import ExternalModificationDialog from './ExternalModificationDialog';
import DocumentAnalysisPanel from './DocumentAnalysisPanel';
import DocxPdfPreview from './DocxPdfPreview';
import ExcelPreview from './ExcelPreview';
import PresentationPreview from './PresentationPreview';
import CsvPreview from './CsvPreview';
import MediaPreview from './MediaPreview';
import { useInlineAssist } from '../../hooks/useInlineAssist';
import { documentService } from '../../services/documentService';
import { toast } from '../Common/Toast';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XMarkIcon } from '@heroicons/react/24/outline';

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
  const { currentWorkspace } = useFileStore();
  const { tabs, activeTabId, updateTabContent, markTabSaved, setTabEditor, setTabSaving, updateTabModifiedTime } = useEditorStore();
  const { analysis, setAnalysisVisible, editor, setEditorVisible } = useLayoutStore();
  
  // ⚠️ Week 17.1.2：外部修改检测状态
  const [externalModificationTab, setExternalModificationTab] = useState<string | null>(null);
  
  // 使用 useMemo 稳定 activeTab 引用
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);
  
  // Inline Assist 功能
  const inlineAssist = useInlineAssist(activeTab?.editor || null);


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
            // 更新 store 中的内容
            updateTabContent(payload.tabId, payload.content);
            toast.success('文档内容已更新');
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
  // ⚠️ 关键修复：添加防抖机制和有效性检查，避免重复弹出对话框
  useEffect(() => {
    if (tabs.length === 0) return;
    
    const checkInterval = setInterval(async () => {
      // 如果已经有外部修改对话框显示，跳过检查
      if (externalModificationTab) {
        return;
      }
      
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
          
          if (isModified && externalModificationTab !== tab.id) {
            // 显示外部修改对话框
            setExternalModificationTab(tab.id);
            break; // 一次只显示一个对话框
          }
        } catch (error) {
          console.error(`检查文件 ${tab.filePath} 外部修改失败:`, error);
        }
      }
    }, 5000); // 每 5 秒检查一次
    
    return () => clearInterval(checkInterval);
  }, [tabs, externalModificationTab]);
  
  // ⚠️ Week 17.1.2：处理外部修改对话框
  const handleContinueOverwrite = useCallback(async () => {
    if (!externalModificationTab) return;
    
    const tab = tabs.find(t => t.id === externalModificationTab);
    if (!tab) return;
    
    try {
      // 获取当前文件修改时间并更新，避免重复提示
      const newModifiedTime = await invoke<number>('get_file_modified_time', { path: tab.filePath });
      updateTabModifiedTime(tab.id, newModifiedTime);
      setExternalModificationTab(null);
    } catch (error) {
      console.error('更新文件修改时间失败:', error);
      setExternalModificationTab(null);
    }
  }, [externalModificationTab, tabs, updateTabModifiedTime]);
  
  const handleLoadChanges = useCallback(async () => {
    if (!externalModificationTab) return;
    
    const tab = tabs.find(t => t.id === externalModificationTab);
    if (!tab) return;
    
    try {
      // 重新加载文件内容
      const content = await invoke<string>('read_file_content', { path: tab.filePath });
      const newModifiedTime = await invoke<number>('get_file_modified_time', { path: tab.filePath });
      
      // 更新标签页内容和修改时间
      updateTabContent(tab.id, content);
      markTabSaved(tab.id);
      updateTabModifiedTime(tab.id, newModifiedTime);
      
      setExternalModificationTab(null);
    } catch (error) {
      console.error('加载外部更改失败:', error);
      toast.error('加载外部更改失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }, [externalModificationTab, tabs, updateTabContent, markTabSaved, updateTabModifiedTime]);
  
  const handleCompare = useCallback(() => {
    // TODO: 实现差异比较功能（Week 17 暂不实现）
    toast.info('差异比较功能将在后续版本中实现');
  }, []);
  
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
        toast.warning('文件是只读模式，无法保存');
        return;
      }
      
      setTabSaving(activeTab.id, true);
      // 使用编辑器中的最新内容
      await documentService.saveFile(activeTab.filePath, currentContent);
      // 同步更新 store 中的内容
      updateTabContent(activeTab.id, currentContent);
      markTabSaved(activeTab.id);
      // ⚠️ 关键修复：保存后更新文件修改时间，避免误判为外部修改
      try {
        const newModifiedTime = await invoke<number>('get_file_modified_time', { path: activeTab.filePath });
        updateTabModifiedTime(activeTab.id, newModifiedTime);
      } catch (error) {
        console.error('更新文件修改时间失败:', error);
      }
      console.log('✅ 文件保存成功');
    } catch (error) {
      console.error('❌ 保存失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`保存失败: ${errorMessage}`);
    } finally {
      setTabSaving(activeTab.id, false);
    }
  }, [activeTab, setTabSaving, markTabSaved, updateTabContent, updateTabModifiedTime]);
  
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
        // ⚠️ 关键修复：自动保存后更新文件修改时间，避免误判为外部修改
        try {
          const newModifiedTime = await invoke<number>('get_file_modified_time', { path: activeTab.filePath });
          updateTabModifiedTime(activeTab.id, newModifiedTime);
        } catch (error) {
          console.error('更新文件修改时间失败:', error);
        }
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

  // 保存进度监听
  useEffect(() => {
    const setupSaveProgressListener = async () => {
      try {
        const unlisten = await listen<SaveProgressEvent>('fs-save-progress', (event) => {
          const { file_path, status, progress, error } = event.payload;
          
          // 只处理当前标签页的文件
          if (activeTab && activeTab.filePath === file_path) {
            if (status === 'started') {
              setTabSaving(activeTab.id, true);
              toast.info('开始保存文件...');
            } else if (status === 'converting') {
              toast.info(`正在转换格式... ${progress}%`);
            } else if (status === 'saving') {
              toast.info(`正在保存... ${progress}%`);
            } else if (status === 'completed') {
              setTabSaving(activeTab.id, false);
              markTabSaved(activeTab.id);
              toast.success('文件保存成功');
            } else if (status === 'failed') {
              setTabSaving(activeTab.id, false);
              toast.error(`保存失败: ${error || '未知错误'}`);
            }
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
  }, [activeTab, setTabSaving, markTabSaved]);

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
      
      {/* 编辑器内容区域（包含编辑器和分析面板） */}
      <div className="flex-1 overflow-hidden flex" style={{ minWidth: 0 }}>
        {/* 编辑器内容 */}
        <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
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
            
            // DOCX 文件（编辑模式）：使用普通编辑器
            if (fileType === 'docx' && !activeTab.isReadOnly) {
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
                    autoCompleteEnabled={activeTab.autoCompleteEnabled ?? true}
                  />
                  
                  {/* Inline Assist 面板 */}
                  {inlineAssist.state.isVisible && activeTab.editor && (
                    <InlineAssistPosition editor={activeTab.editor}>
                      <InlineAssistPanel
                        state={inlineAssist.state}
                        onInstructionChange={(instruction) => {
                          inlineAssist.open(instruction, inlineAssist.state.selectedText);
                        }}
                        onExecute={inlineAssist.execute}
                        onClose={inlineAssist.close}
                        onApplyEdit={inlineAssist.applyEdit}
                      />
                    </InlineAssistPosition>
                  )}
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
                  autoCompleteEnabled={activeTab.autoCompleteEnabled ?? true}
                />
                
                {/* Inline Assist 面板 */}
                {inlineAssist.state.isVisible && activeTab.editor && (
                  <InlineAssistPosition editor={activeTab.editor}>
                    <InlineAssistPanel
                      state={inlineAssist.state}
                      onInstructionChange={(instruction) => {
                        inlineAssist.open(instruction, inlineAssist.state.selectedText);
                      }}
                      onExecute={inlineAssist.execute}
                      onClose={inlineAssist.close}
                      onApplyEdit={inlineAssist.applyEdit}
                    />
                  </InlineAssistPosition>
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
      
      {/* ⚠️ Week 17.1.2：外部修改对话框 */}
      {externalModificationTab && (() => {
        const tab = tabs.find(t => t.id === externalModificationTab);
        if (!tab) return null;
        
        return (
          <ExternalModificationDialog
            filePath={tab.filePath}
            onContinueOverwrite={handleContinueOverwrite}
            onLoadChanges={handleLoadChanges}
            onCompare={handleCompare}
            onCancel={() => setExternalModificationTab(null)}
          />
        );
      })()}
    </div>
  );
};

export default EditorPanel;

