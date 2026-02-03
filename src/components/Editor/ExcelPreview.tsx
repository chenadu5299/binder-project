// src/components/Editor/ExcelPreview.tsx
// Excel PDF 预览组件（最终方案：LibreOffice + iframe + data URL）
//
// ⚠️ 重要：这是最终确定的预览方案，请勿修改核心逻辑
// 
// 方案说明：
// 1. 使用 LibreOffice 将 Excel (XLSX/XLS/ODS) 转换为 PDF
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
// 注意：CSV 文件不使用此组件，使用 CsvPreview 组件（直接解析 HTML 表格）
//
// 最后更新：2025年
// 状态：最终方案，已锁定

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PrinterIcon, MagnifyingGlassIcon, LinkIcon } from '@heroicons/react/24/outline';

interface ExcelPreviewProps {
  filePath: string;
}

interface PreviewProgressEvent {
  status: 'started' | 'converting' | 'completed' | 'failed';
  message: string;
  pdf_path?: string;
}

const ExcelPreview: React.FC<ExcelPreviewProps> = ({ filePath }) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  // 引用功能状态
  const [selectedText, setSelectedText] = useState<string>('');
  const [showReferenceButton, setShowReferenceButton] = useState(false);
  const [referenceButtonPosition, setReferenceButtonPosition] = useState({ x: 0, y: 0 });
  const [copySuccess, setCopySuccess] = useState(false);
  
  // iframe 引用，用于打印功能
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 获取文件名（不含路径）
  const fileName = useMemo(() => {
    return filePath.split('/').pop() || filePath.split('\\').pop() || 'file.xlsx';
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
            setLoading(true);
            setProgress(10);
          } else if (status === 'converting') {
            setProgress(50);
          } else if (status === 'completed') {
            setProgress(100);
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
  // 此逻辑已锁定，请勿修改加载方式（必须使用 iframe + data URL）
  useEffect(() => {
    const convertAndLoadPdf = async () => {
      if (!filePath) {
        setError('文件路径为空');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setProgress(0);
        setProgressMessage('正在预览...');

        // 步骤 1：调用后端转换 Excel 为 PDF
        // ⚠️ 必须使用 preview_excel_as_pdf 命令，不要修改
        const pdfUrl = await invoke<string>('preview_excel_as_pdf', {
          path: filePath,
        });

        if (!pdfUrl) {
          setError('PDF 转换失败：未返回文件路径');
          setLoading(false);
          return;
        }

        // 步骤 2：从 file:// URL 中提取实际文件路径
        let actualPath = pdfUrl;
        if (pdfUrl.startsWith('file://')) {
          // 移除 file:// 前缀并解码 URL
          actualPath = decodeURIComponent(pdfUrl.replace('file://', ''));
        }

        // 步骤 3：使用 Tauri 读取 PDF 文件为 base64
        // ⚠️ 必须使用 read_file_as_base64，不要改用其他方式
        const base64 = await invoke<string>('read_file_as_base64', {
          path: actualPath,
        });

        // 步骤 4：创建 data URL（使用 base64，绕过 CORS 限制）
        // ⚠️ 必须使用 data URL，不要改用 file:// 或 Blob URL
        // ⚠️ 必须使用 application/pdf MIME 类型
        const dataUrl = `data:application/pdf;base64,${base64}`;
        setPreviewUrl(dataUrl);
        setLoading(false);
        setProgress(100);
      } catch (err: unknown) {
        console.error('PDF 转换或加载失败:', err);
        setError(err instanceof Error ? err.message : String(err) || 'PDF 转换失败');
        setLoading(false);
        setProgress(0);
      }
    };

    convertAndLoadPdf();
  }, [filePath]);
  
  // 监听文本选择（用于引用功能）
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setShowReferenceButton(false);
        setSelectedText('');
        return;
      }
      
      const selectedText = selection.toString().trim();
      if (!selectedText) {
        setShowReferenceButton(false);
        setSelectedText('');
        return;
      }
      
      // 获取选中文本的位置
      const range = selection.getRangeAt(0);
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
    
    // 监听选择变化
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // 点击外部区域隐藏引用按钮
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowReferenceButton(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 生成引用格式
  const generateReference = useCallback((): string => {
    // Excel 引用格式：@文件名.xlsx!Sheet1!A1 或 @文件名.xlsx!A1
    // 注意：由于浏览器原生 PDF 查看器无法直接获取工作表名称和单元格位置，使用简化格式
    // 可以后续通过 PDF.js 或其他方式获取更精确的位置信息
    return `@${fileName}!第1页`;
  }, [fileName]);
  
  // 复制引用
  const handleCopyReference = useCallback(async () => {
    const referenceText = generateReference();
    
    try {
      await navigator.clipboard.writeText(referenceText);
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
  }, [generateReference]);

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
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-600 dark:text-gray-400 mb-2">{progressMessage || '加载中...'}</div>
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
              📊 Excel 预览模式
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
          title="Excel PDF 预览"
          onLoad={() => {
            setLoading(false);
          }}
          onError={() => {
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

export default ExcelPreview;

