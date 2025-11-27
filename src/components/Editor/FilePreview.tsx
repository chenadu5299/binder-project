import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FilePreviewProps {
  filePath: string;
  fileType: 'pdf' | 'image';
}

const FilePreview: React.FC<FilePreviewProps> = ({ filePath, fileType }) => {
  const [previewUrl, setPreviewUrl] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  React.useEffect(() => {
    // ⚠️ 关键：使用 base64 方式加载文件，绕过 WebView 的安全限制
    const loadFile = async () => {
      try {
        const base64 = await invoke<string>('read_file_as_base64', { path: filePath });
        
        // 根据文件类型设置 MIME 类型
        let mimeType = 'application/octet-stream';
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (fileType === 'image') {
          mimeType = ext === 'png' ? 'image/png' :
                     ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                     ext === 'gif' ? 'image/gif' :
                     ext === 'webp' ? 'image/webp' :
                     ext === 'svg' ? 'image/svg+xml' : 'image/png';
        } else if (fileType === 'pdf') {
          mimeType = 'application/pdf';
        }
        
        const dataUrl = `data:${mimeType};base64,${base64}`;
        setPreviewUrl(dataUrl);
        setError('');
      } catch (err) {
        console.error('加载文件失败:', err);
        setError(`加载文件失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    
    loadFile();
  }, [filePath, fileType]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
        <div className="text-center text-red-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
        <div className="text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (fileType === 'image') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4">
        <img 
          src={previewUrl} 
          alt="预览" 
          className="max-w-full max-h-full object-contain"
          onError={() => {
            console.error('图片加载失败:', filePath);
            setError('图片加载失败，请检查文件是否损坏');
          }}
        />
      </div>
    );
  }

  if (fileType === 'pdf') {
    return (
      <div className="h-full w-full">
        <iframe
          src={previewUrl}
          className="w-full h-full border-0"
          title="PDF 预览"
          onError={() => {
            setError('PDF 加载失败，请检查文件是否损坏');
          }}
        />
      </div>
    );
  }

  return null;
};

export default FilePreview;

