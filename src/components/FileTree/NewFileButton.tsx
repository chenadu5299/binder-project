import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  
  // 使用 ref 保存最新的状态值，避免闭包问题
  const pendingFileTypeRef = useRef<string | null>(null);
  const currentWorkspaceRef = useRef<string | null>(null);
  
  // 更新 ref 值
  useEffect(() => {
    pendingFileTypeRef.current = pendingFileType;
  }, [pendingFileType]);
  
  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);

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
    console.log('[NewFileButton] handleInputConfirm 被调用:', { 
      fileName, 
      pendingFileType: pendingFileTypeRef.current, 
      currentWorkspace: currentWorkspaceRef.current 
    });
    
    // 使用 ref 获取最新的值，避免闭包问题
    const fileType = pendingFileTypeRef.current;
    const workspace = currentWorkspaceRef.current;
    
    if (!fileType || !workspace) {
      console.warn('[NewFileButton] 缺少必要参数，提前返回:', { pendingFileType: fileType, currentWorkspace: workspace });
      setShowInputDialog(false);
      setPendingFileType(null);
      return;
    }

    const extension = fileType === 'folder' ? '' : `.${fileType}`;
    const filePath = `${workspace}/${fileName}${extension}`;

    console.log('[NewFileButton] 开始创建文件:', { fileType, filePath, currentWorkspace: workspace, fileName, extension });
    
    // 先关闭对话框
    setShowInputDialog(false);
    setPendingFileType(null);
    
    try {
      if (fileType === 'folder') {
        await fileService.createFolder(filePath);
        console.log('[NewFileButton] 文件夹创建成功');
      } else {
        console.log('[NewFileButton] 准备调用 fileService.createFile...');
        await fileService.createFile(filePath, fileType);
        console.log('[NewFileButton] ✅ fileService.createFile 调用成功');
        
        // 规范化路径（在记录元数据之前）
        const { normalizePath, normalizeWorkspacePath } = await import('../../utils/pathUtils');
        const normalizedFilePath = normalizePath(filePath);
        const normalizedWorkspacePath = normalizeWorkspacePath(workspace);
        
        console.log('[NewFileButton] 文件创建成功，准备记录元数据:', {
          originalPath: filePath,
          normalizedFilePath,
          normalizedWorkspacePath,
          source: 'new',
        });
        
        // 记录文件为 Binder 创建的文件（必须在打开文件之前完成）
        // ⚠️ 关键：确保元数据记录成功后再打开文件
        const { recordBinderFile } = await import('../../services/fileMetadataService');
        
        try {
          console.log('[NewFileButton] 准备调用 recordBinderFile...');
          // 同步等待元数据记录完成（带重试机制）
          await recordBinderFile(normalizedFilePath, 'new', normalizedWorkspacePath, 3);
          console.log('[NewFileButton] ✅ 元数据记录成功');
        } catch (error) {
          console.error('[NewFileButton] ❌ 记录文件元数据失败（将使用显式 source 标记）:', error);
          // 即使元数据记录失败，仍然传递 source: 'new'，确保能进入编辑模式
        }
        
        // 如果是 DOCX/MD/HTML 文件，创建后自动打开（标记为新建）
        if (['docx', 'md', 'html', 'txt'].includes(fileType)) {
          const { documentService } = await import('../../services/documentService');
          // 显式传递 source: 'new'，确保进入编辑模式
          // 即使元数据记录失败，也传递 source，因为这是新建按钮创建的文件
          console.log('[NewFileButton] 打开新建文件:', {
            filePath: normalizedFilePath,
            fileType,
            source: 'new',
          });
          await documentService.openFile(normalizedFilePath, { source: 'new' });
        }
      }
      
      // 刷新文件树
      if (fileTreeRef?.current) {
        await fileTreeRef.current.refresh();
      }
    } catch (error) {
      console.error('[NewFileButton] ❌ 创建文件失败:', error);
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
          onConfirm={(fileName) => {
            console.log('[NewFileButton] InputDialog onConfirm 包装函数被调用:', { fileName, handleInputConfirm: typeof handleInputConfirm });
            return handleInputConfirm(fileName);
          }}
          onCancel={handleInputCancel}
        />
      )}
    </>
  );
};

export default NewFileButton;

