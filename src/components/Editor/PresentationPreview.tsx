// src/components/Editor/PresentationPreview.tsx
// 演示文稿 PDF 预览组件（最终方案：LibreOffice + iframe + data URL）
//
// ⚠️ 重要：这是最终确定的预览方案，请勿修改核心逻辑
// 
// 方案说明：
// 1. 使用 LibreOffice 将演示文稿 (PPTX/PPT/PPSX/PPS/ODP) 转换为 PDF
// 2. 使用 iframe + data URL 方式加载 PDF
// 3. 依赖浏览器原生 PDF 查看器，支持滚动、选择、复制等功能
//
// 为什么这是最终方案：
// - ✅ 支持滚动浏览（浏览器原生）
// - ✅ 支持文本选择和复制（浏览器原生）
// - ✅ 支持浏览器原生搜索（Cmd+F）
// - ✅ 代码简洁，维护成本低
// - ✅ 与 DocxPdfPreview.tsx 保持一致的技术方案
//
// 最后更新：2025年
// 状态：最终方案，已锁定

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PrinterIcon, MagnifyingGlassIcon, LinkIcon } from '@heroicons/react/24/outline';

interface PresentationPreviewProps {
  filePath: string;
}

interface PreviewProgressEvent {
  status: 'started' | 'converting' | 'completed' | 'failed';
  message: string;
  pdf_path?: string;
}

const PresentationPreview: React.FC<PresentationPreviewProps> = ({ filePath }) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [totalPages] = useState<number>(0); // PDF 总页数（幻灯片数量）
  
  // 引用功能状态
  const [selectedText, setSelectedText] = useState<string>('');
  const [showReferenceButton, setShowReferenceButton] = useState(false);
  const [referenceButtonPosition, setReferenceButtonPosition] = useState({ x: 0, y: 0 });
  const [copySuccess, setCopySuccess] = useState(false);
  
  // iframe 引用，用于打印功能
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 用于调试：记录当前预览对应的 filePath/cacheKey
  const previewDebugRef = useRef<{ filePath: string; cacheKey: string } | null>(null);
  // 已有预览 URL 时，进度事件里的 started 不再把 loading 设为 true，避免盖住已显示的 PDF
  const hasPreviewUrlRef = useRef(false);
  // 用于在 effect 之间安全地标记取消状态（对齐 DocxPdfPreview 的实现，避免并发竞态）
  const isCancelledRef = useRef(false);
  
  // 获取文件名（不含路径）
  const fileName = useMemo(() => {
    return filePath.split('/').pop() || filePath.split('\\').pop() || 'file.pptx';
  }, [filePath]);

  // 监听预览进度事件
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen<PreviewProgressEvent>('preview-progress', (event) => {
          const { status, message } = event.payload;
          
          setProgressMessage(message);
          
          if (status === 'started') {
            // 已有 PDF 时不再把 loading 设为 true，避免并发/重复事件盖住已显示的预览
            if (!hasPreviewUrlRef.current) {
              setLoading(true);
              setProgress(10);
            }
          } else if (status === 'converting') {
            if (!hasPreviewUrlRef.current) setProgress(50);
          } else if (status === 'completed') {
            // 不在此处 setProgress(100)：等 invoke 返回并 setPreviewUrl 后再设为 100%，避免界面卡在「预览完成」却无内容
          } else if (status === 'failed') {
            setLoading(false);
            setError(message);
            setProgress(0);
          }
        });
      } catch (error) {
        console.error('初始化预览进度事件监听失败:', error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // ⚠️ 核心逻辑：调用后端转换命令并加载 PDF
  // 对齐 DocxPdfPreview 的实现，使用 read_file_as_base64 + data URL，保证行为稳定
  useEffect(() => {
    // 重置取消标志与预览标记
    isCancelledRef.current = false;
    hasPreviewUrlRef.current = false;

    const convertAndLoadPdf = async (retryCount = 0) => {
      console.log(`[PPT预览] 开始转换和加载 PDF，重试次数: ${retryCount}`);

      if (!filePath) {
        console.error('[PPT预览] 文件路径为空');
        setError('文件路径为空');
        setLoading(false);
        return;
      }

      try {
        console.log(`[PPT预览] 设置加载状态，重试次数: ${retryCount}`);
        setLoading(true);
        setError(null);
        setProgress(0);
        setProgressMessage(retryCount > 0 ? `正在重试预览... (${retryCount + 1})` : '正在预览...');

        // 步骤 1：调用后端转换演示文稿为 PDF
        // ⚠️ 必须使用 preview_presentation_as_pdf 命令，不要修改
        const requestTime = new Date().toISOString();
        console.log(`[PPT预览] 请求预览 filePath=${filePath} at ${requestTime}`);
        const pdfUrl = await invoke<string>('preview_presentation_as_pdf', {
          path: filePath,
        });
        const cacheKey = pdfUrl.replace(/^file:\/\//, '').split('/').pop()?.replace(/\.pdf$/, '') ?? '';
        console.log(`[PPT预览] 后端返回 PDF pdfUrl=${pdfUrl} cacheKey=${cacheKey} at ${new Date().toISOString()}`);

        if (isCancelledRef.current) {
          console.log('[PPT预览] 操作已取消');
          return;
        }

        if (!pdfUrl) {
          console.error('[PPT预览] PDF 转换失败：未返回文件路径');
          setError('PDF 转换失败：未返回文件路径');
          setLoading(false);
          return;
        }

        // 步骤 2：从 file:// URL 中提取实际文件路径
        let actualPath = pdfUrl;
        if (pdfUrl.startsWith('file://')) {
          actualPath = decodeURIComponent(pdfUrl.replace('file://', ''));
        }

        // 步骤 3：使用 Tauri 读取 PDF 文件为 base64（与 DocxPdfPreview 保持一致）
        setProgressMessage('正在加载 PDF 文件...');
        setProgress(75);
        console.log(`[PPT预览] 开始读取 PDF 文件 path=${actualPath}`);

        let base64: string;
        let readAttempts = 0;
        const maxReadAttempts = 3;
        const readRetryDelay = 300; // 300ms

        while (readAttempts < maxReadAttempts) {
          try {
            base64 = await invoke<string>('read_file_as_base64', {
              path: actualPath,
            });
            break;
          } catch (readError) {
            readAttempts++;
            if (readAttempts >= maxReadAttempts) {
              throw readError;
            }
            await new Promise(resolve => setTimeout(resolve, readRetryDelay));
          }
        }

        if (isCancelledRef.current) return;

        // 步骤 4：创建 data URL（使用 base64，绕过 CORS 限制）
        const dataUrl = `data:application/pdf;base64,${base64!}`;
        previewDebugRef.current = { filePath, cacheKey };
        hasPreviewUrlRef.current = true;
        console.log(
          `[PPT预览] 设置 data URL filePath=${filePath} base64Len=${base64!.length} cacheKey=${cacheKey} at ${new Date().toISOString()}`
        );
        setPreviewUrl(dataUrl);
        setLoading(false);
        setProgress(100);
      } catch (err: unknown) {
        if (isCancelledRef.current) {
          console.log('[PPT预览] 操作已取消，跳过错误处理');
          return;
        }

        const errorMessage = err instanceof Error ? err.message : String(err) || 'PDF 转换失败';
        console.error('[PPT预览] PDF 转换或加载失败:', err);

        const isFileNotFoundError =
          errorMessage.includes('PDF 文件未生成') ||
          errorMessage.includes('未返回文件路径') ||
          errorMessage.includes('文件不存在');

        if (isFileNotFoundError && retryCount < 2) {
          // 等待 500ms 后重试
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!isCancelledRef.current) {
            return convertAndLoadPdf(retryCount + 1);
          }
        }

        setError(errorMessage);
        setLoading(false);
        setProgress(0);
      }
    };

    convertAndLoadPdf();

    return () => {
      isCancelledRef.current = true;
    };
  }, [filePath]);
  
  // 监听文本选择（用于引用功能）
  // 优化：同时监听主窗口和 iframe 内的选择
  useEffect(() => {
    const handleSelectionChange = () => {
      let selection: Selection | null = null;
      let range: Range | null = null;
      let selectedText = '';
      
      // 方法 1：尝试从主窗口获取选择
      try {
        selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          range = selection.getRangeAt(0);
          selectedText = selection.toString().trim();
        }
      } catch (e) {
        // 忽略错误
      }
      
      // 方法 2：如果主窗口没有选择，尝试从 iframe 获取（同源情况下）
      if (!selectedText && iframeRef.current?.contentWindow) {
        try {
          const iframeWindow = iframeRef.current.contentWindow;
          const iframeSelection = iframeWindow.getSelection();
          if (iframeSelection && iframeSelection.rangeCount > 0) {
            selection = iframeSelection;
            range = iframeSelection.getRangeAt(0);
            selectedText = iframeSelection.toString().trim();
          }
        } catch (e) {
          // 跨域限制，无法访问 iframe 内容
          // 这种情况下，只能依赖主窗口的选择
        }
      }
      
      if (!selectedText || !range) {
        setShowReferenceButton(false);
        setSelectedText('');
        return;
      }
      
      // 获取选中文本的位置
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      
      if (containerRect) {
        setSelectedText(selectedText);
        setReferenceButtonPosition({
          x: rect.right - containerRect.left + 10,
          y: rect.top - containerRect.top + (rect.height / 2) - 20,
        });
        setShowReferenceButton(true);
      }
    };
    
    // 监听主窗口的选择变化
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // 监听 iframe 内的选择变化（如果可访问）
    if (iframeRef.current?.contentWindow) {
      try {
        const iframeWindow = iframeRef.current.contentWindow;
        iframeWindow.document.addEventListener('selectionchange', handleSelectionChange);
      } catch (e) {
        // 跨域限制，无法访问 iframe 内容
      }
    }
    
    // 点击外部区域隐藏引用按钮
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowReferenceButton(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    // 监听 iframe 内的点击（如果可访问）
    if (iframeRef.current?.contentWindow) {
      try {
        const iframeWindow = iframeRef.current.contentWindow;
        iframeWindow.document.addEventListener('mousedown', handleClickOutside);
      } catch (e) {
        // 跨域限制
      }
    }
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleClickOutside);
      
      // 清理 iframe 事件监听
      if (iframeRef.current?.contentWindow) {
        try {
          const iframeWindow = iframeRef.current.contentWindow;
          iframeWindow.document.removeEventListener('selectionchange', handleSelectionChange);
          iframeWindow.document.removeEventListener('mousedown', handleClickOutside);
        } catch (e) {
          // 跨域限制
        }
      }
    };
  }, []);
  
  // 生成引用格式
  const generateReference = useCallback((): string => {
    // 演示文稿引用格式：@文件名.pptx!幻灯片1 或 @文件名.pptx!第1页
    // 注意：由于浏览器原生 PDF 查看器无法直接获取幻灯片编号，使用简化格式
    // 可以后续通过 PDF.js 或其他方式获取更精确的位置信息
    return `@${fileName}!幻灯片1`;
  }, [fileName]);
  
  // 复制引用
  const handleCopyReference = useCallback(async () => {
    const referenceText = generateReference();
    
    // 创建引用元数据（用于聊天输入框识别）
    const sourceData = {
      filePath: filePath,
      fileName: fileName,
      lineRange: { start: 1, end: 1 }, // 演示文稿预览无法精确获取幻灯片编号，使用默认值
      charRange: { start: 0, end: selectedText.length },
    };
    
    const sourceJson = JSON.stringify(sourceData);
    
    try {
      // 方法 1：设置全局变量（主要方案，因为 clipboard 事件之间数据不共享）
      (window as any).__binderClipboardSource = sourceJson;
      (window as any).__binderClipboardTimestamp = Date.now();
      
      // 5 秒后清除全局变量
      setTimeout(() => {
        delete (window as any).__binderClipboardSource;
        delete (window as any).__binderClipboardTimestamp;
      }, 5000);
      
      // 方法 2：使用 ClipboardItem API（现代浏览器支持）
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          const clipboardItem = new ClipboardItem({
            'text/plain': new Blob([referenceText], { type: 'text/plain' }),
            'application/x-binder-source': new Blob([sourceJson], { type: 'application/json' }),
          });
          await navigator.clipboard.write([clipboardItem]);
        } catch (clipboardError) {
          // 如果 ClipboardItem 失败，只复制文本
          await navigator.clipboard.writeText(referenceText);
        }
      } else {
        // 降级方案：只复制文本
        await navigator.clipboard.writeText(referenceText);
      }
      
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
        setShowReferenceButton(false);
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = referenceText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        // 即使降级方案，也设置全局变量
        (window as any).__binderClipboardSource = sourceJson;
        (window as any).__binderClipboardTimestamp = Date.now();
        setTimeout(() => {
          delete (window as any).__binderClipboardSource;
          delete (window as any).__binderClipboardTimestamp;
        }, 5000);
        
        setCopySuccess(true);
        setTimeout(() => {
          setCopySuccess(false);
          setShowReferenceButton(false);
        }, 2000);
      } catch (e) {
        console.error('降级复制方案也失败:', e);
      }
      document.body.removeChild(textArea);
    }
  }, [generateReference, filePath, fileName, selectedText]);

  // 打印功能
  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      // 使用 iframe 内部的打印功能
      iframeRef.current.contentWindow.print();
    } else {
      // 如果 iframe 未加载，尝试使用当前窗口打印
      window.print();
    }
  };

  // 加载状态
  if (loading && !previewUrl) {
    // 后端先发「预览完成」时前端可能还在 read_file_as_base64，避免长时间只显示「预览完成」+ 转圈
    const loadingLabel =
      progressMessage && /完成|成功/.test(progressMessage)
        ? '正在加载 PDF 文件...'
        : (progressMessage || '加载中...');
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-600 dark:text-gray-400 mb-2">{loadingLabel}</div>
          {progress > 0 && (
            <div className="mt-2 w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-xl font-semibold mb-4">预览失败</div>
          <div className="text-gray-600 dark:text-gray-400 mb-6">{error}</div>
          
          {/* 重试按钮 */}
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              // 重新触发转换
              window.location.reload();
            }}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ⚠️ 核心渲染逻辑：使用 iframe + data URL 加载 PDF
  // 此逻辑已锁定，请勿修改：
  // - 必须使用 iframe（不要改用 Canvas 或其他方式）
  // - 必须使用 data URL（不要改用 file:// 或 Blob URL）
  // - 必须依赖浏览器原生 PDF 查看器（不要添加自定义渲染）
  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 预览工具栏 */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          {/* 左侧：文档信息和功能提示 */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              📊 演示文稿预览模式
            </span>
            
            {/* 功能提示（浏览器原生功能） */}
            <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1" title="使用 Cmd+F (Mac) 或 Ctrl+F (Windows) 搜索">
                <MagnifyingGlassIcon className="w-4 h-4" />
                <span>搜索</span>
              </div>
              <div className="flex items-center gap-1" title="使用浏览器原生缩放功能">
                <span>缩放</span>
              </div>
              <div className="flex items-center gap-1" title="选中文本后可生成引用">
                <LinkIcon className="w-4 h-4" />
                <span>引用</span>
              </div>
              {totalPages > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  共 {totalPages} 页
                </div>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center space-x-2">
            {/* 打印按钮 */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
              title="打印 (Cmd+P / Ctrl+P)"
            >
              <PrinterIcon className="w-4 h-4" />
              打印
            </button>
          </div>
        </div>
      </div>

      {/* PDF 预览区域 */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-0"
          title="演示文稿 PDF 预览"
          onLoad={() => {
            const info = previewDebugRef.current;
            console.log(
              `[PPT预览] iframe onLoad filePath=${info?.filePath ?? 'unknown'} cacheKey=${info?.cacheKey ?? 'unknown'} at ${new Date().toISOString()}`
            );
            setLoading(false);
          }}
          onError={(e) => {
            console.error('[PPT预览] iframe 加载错误', e);
            setError('PDF 加载失败，请检查文件是否损坏');
            setLoading(false);
          }}
        />
        
        {/* 引用按钮（悬浮） */}
        {showReferenceButton && selectedText && (
          <div
            className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-2"
            style={{
              left: `${referenceButtonPosition.x}px`,
              top: `${referenceButtonPosition.y}px`,
              transform: 'translateY(-50%)',
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={handleCopyReference}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
              title={`复制引用: ${generateReference()}`}
            >
              <LinkIcon className="w-4 h-4" />
              {copySuccess ? '已复制' : '复制引用'}
            </button>
            {selectedText && (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 px-1 max-w-xs truncate">
                {selectedText.substring(0, 30)}{selectedText.length > 30 ? '...' : ''}
              </div>
            )}
          </div>
        )}
        
        {/* 复制成功提示（全局提示） */}
        {copySuccess && (
          <div
            className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in"
            style={{ pointerEvents: 'none' }}
          >
            ✓ 已复制引用: {generateReference()}
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationPreview;

