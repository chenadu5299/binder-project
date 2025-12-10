import React, { useState, useRef, useEffect } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { fileService } from '../../services/fileService';
import { FileTreeRef } from './FileTree';
import InputDialog from './InputDialog';
import { toast } from '../Common/Toast';

interface NewFileButtonProps {
  fileTreeRef?: React.RefObject<FileTreeRef>;
}

const NewFileButton: React.FC<NewFileButtonProps> = ({ fileTreeRef }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [pendingFileType, setPendingFileType] = useState<string | null>(null);
  const { currentWorkspace } = useFileStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateFileClick = (fileType: string) => {
    if (!currentWorkspace) {
      toast.warning('请先选择工作区！请点击"打开工作区"或"新建工作区"按钮选择文件夹。');
      setIsOpen(false);
      return;
    }

    // 显示输入对话框
    setPendingFileType(fileType);
    setShowInputDialog(true);
    setIsOpen(false);
  };

  const handleInputConfirm = async (fileName: string) => {
    if (!pendingFileType || !currentWorkspace) {
      setShowInputDialog(false);
      return;
    }

    const fileType = pendingFileType;
    const extension = fileType === 'folder' ? '' : `.${fileType}`;
    const filePath = `${currentWorkspace}/${fileName}${extension}`;

    try {
      console.log('开始创建:', { fileType, filePath, currentWorkspace });
      
      if (fileType === 'folder') {
        await fileService.createFolder(filePath);
      } else {
        await fileService.createFile(filePath, fileType);
        
        // 如果是 DOCX/MD/HTML 文件，创建后自动打开（标记为新建）
        if (['docx', 'md', 'html', 'txt'].includes(fileType)) {
          const { documentService } = await import('../../services/documentService');
          await documentService.openFile(filePath, { source: 'new' });
        }
      }
      
      setShowInputDialog(false);
      setPendingFileType(null);
      
      // 刷新文件树
      if (fileTreeRef?.current) {
        await fileTreeRef.current.refresh();
      }
    } catch (error) {
      console.error('创建文件失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`创建${fileType === 'folder' ? '文件夹' : '文件'}失败: ${errorMessage}`);
    }
  };

  const handleInputCancel = () => {
    setShowInputDialog(false);
    setPendingFileType(null);
  };

  const getFileTypeName = (fileType: string) => {
    return fileType === 'folder' ? '文件夹' 
      : fileType === 'docx' ? 'Word 文档' 
      : fileType === 'md' ? 'Markdown 文件' 
      : 'HTML 文件';
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
        >
          + 新建
        </button>
        {isOpen && (
          <div 
            className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 min-w-[150px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateFileClick('docx');
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              📄 新建文档 (.docx)
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateFileClick('md');
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              📝 新建 Markdown (.md)
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateFileClick('html');
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              🌐 新建 HTML (.html)
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700" />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateFileClick('folder');
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              📁 新建文件夹
            </button>
          </div>
        )}
      </div>
      
      {showInputDialog && pendingFileType && (
        <InputDialog
          title={`新建${getFileTypeName(pendingFileType)}`}
          message={`请输入${getFileTypeName(pendingFileType)}名称（不含扩展名）:`}
          onConfirm={handleInputConfirm}
          onCancel={handleInputCancel}
        />
      )}
    </>
  );
};

export default NewFileButton;

