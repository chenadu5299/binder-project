// src/components/Editor/DocxPdfPreview.tsx
// DOCX PDF 预览组件（最终方案：LibreOffice + iframe + data URL）
//
// ⚠️ 重要：这是最终确定的预览方案，请勿修改核心逻辑
// 
// 方案说明：
// 1. 使用 LibreOffice 将 DOCX 转换为 PDF
// 2. 使用 iframe + data URL 方式加载 PDF
// 3. 依赖浏览器原生 PDF 查看器，支持滚动、选择、复制等功能
//
// 为什么这是最终方案：
// - ✅ 支持滚动浏览（浏览器原生）
// - ✅ 支持文本选择和复制（浏览器原生）
// - ✅ 支持浏览器原生搜索（Cmd+F）
// - ✅ 代码简洁，维护成本低
// - ✅ 与 FilePreview.tsx 保持一致的技术方案
//
// 禁止修改：
// - ❌ 不要改用 PDF.js Canvas 渲染（会导致无法滚动和选择文本）
// - ❌ 不要改用其他 PDF 渲染库
// - ❌ 不要添加自定义的页码导航（浏览器原生支持）
// - ❌ 不要添加自定义的搜索功能（浏览器原生支持 Cmd+F）
// - ❌ 不要添加自定义的缩放控制（浏览器原生支持）
//
// 允许修改：
// - ✅ 可以优化错误提示信息
// - ✅ 可以优化加载状态显示
// - ✅ 可以添加文件大小检查（但不要改变核心加载方式）
// - ✅ 可以优化转换进度显示
//
// 最后更新：2025-12-05
// 方案确定人：chenadu
// 状态：最终方案，已锁定

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PrinterIcon, PencilIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface DocxPdfPreviewProps {
  filePath: string;
}

interface PreviewProgressEvent {
  status: 'started' | 'converting' | 'completed' | 'failed';
  message: string;
  pdf_path?: string;
}

const DocxPdfPreview: React.FC<DocxPdfPreviewProps> = ({ filePath }) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  // 存储 Blob URL，用于清理
  const blobUrlRef = useRef<string | null>(null);
  
  // iframe 引用，用于打印功能
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
            // PDF 路径会在转换完成后通过 invoke 返回，这里只是进度更新
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

        // 步骤 1：调用后端转换 DOCX 为 PDF
        // ⚠️ 必须使用 preview_docx_as_pdf 命令，不要修改
        const pdfUrl = await invoke<string>('preview_docx_as_pdf', {
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
    
    // 清理：在组件卸载时释放 Blob URL（如果有）
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [filePath]);

  // 创建草稿功能（切换到编辑模式）
  const handleCreateDraft = async () => {
    if (!filePath) return;

    try {
      const draftPath = await invoke<string>('create_draft_docx', {
        originalPath: filePath,
      });

      // 打开草稿文件进行编辑（使用新方案：LibreOffice + ODT 解析）
      const htmlContent = await invoke<string>('open_docx_for_edit', {
        path: draftPath,
      });

      // 打开草稿文件到新标签页
      const { useEditorStore } = await import('../../stores/editorStore');
      const { addTab, setActiveTab } = useEditorStore.getState();
      
      // 从路径提取文件名
      const fileName = draftPath.split('/').pop() || draftPath.split('\\').pop() || '草稿.docx';
      
      const tabId = addTab(
        draftPath,
        fileName,
        htmlContent,
        false, // isReadOnly
        true,  // isDraft
        Date.now() // lastModifiedTime
      );
      
      setActiveTab(tabId);
      
      setError(null); // 清除错误状态
    } catch (err: unknown) {
      console.error('创建草稿失败:', err);
      setError(`创建草稿失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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

  // 错误状态 - 带创建草稿按钮
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-xl font-semibold mb-4">预览失败</div>
          <div className="text-gray-600 dark:text-gray-400 mb-6">{error}</div>
          
          {/* 操作按钮 */}
          <div className="flex flex-col space-y-3">
            <button
              onClick={handleCreateDraft}
              className="px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              创建草稿进行编辑
            </button>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                // 重新触发转换
                const event = new Event('retry');
                window.dispatchEvent(event);
              }}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              重试
            </button>
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-6">
            提示：创建草稿后，您可以在编辑模式下修改文档内容
          </div>
        </div>
      </div>
    );
  }

  // ⚠️ 核心渲染逻辑：使用 iframe + data URL 加载 PDF
  // 此逻辑已锁定，请勿修改：
  // - 必须使用 iframe（不要改用 Canvas 或其他方式）
  // - 必须使用 data URL（不要改用 file:// 或 Blob URL）
  // - 必须依赖浏览器原生 PDF 查看器（不要添加自定义渲染）
  // 
  // 为什么必须这样：
  // 1. iframe + data URL 是唯一支持滚动、选择、复制的方案
  // 2. 浏览器原生 PDF 查看器提供最佳用户体验
  // 3. 代码简洁，维护成本低
  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 预览工具栏 */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          {/* 左侧：文档信息和功能提示 */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              📄 预览模式
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

            {/* 创建草稿/编辑按钮 */}
            <button
              onClick={handleCreateDraft}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
              title="创建草稿进行编辑"
            >
              <PencilIcon className="w-4 h-4" />
              编辑
            </button>
          </div>
        </div>
      </div>

      {/* PDF 预览区域 */}
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-0"
          title="PDF 预览"
          onLoad={() => {
            setLoading(false);
          }}
          onError={() => {
            setError('PDF 加载失败，请检查文件是否损坏');
            setLoading(false);
          }}
        />
      </div>
    </div>
  );
};

export default DocxPdfPreview;
