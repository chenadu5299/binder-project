import React, { useState, useRef, useEffect } from 'react';
import { 
  FolderPlusIcon, 
  DocumentPlusIcon, 
  ChevronDownIcon,
  MagnifyingGlassIcon,
  CloudIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import { useFileStore } from '../../stores/fileStore';
import { fileService } from '../../services/fileService';
import { toast } from '../Common/Toast';
import InputDialog from './InputDialog';
import { addHistoryRecord } from './HistorySection';

interface ResourceToolbarProps {
  onSearch?: () => void;
  onRefresh?: () => void;
}

const ResourceToolbar: React.FC<ResourceToolbarProps> = ({ onSearch, onRefresh }) => {
  const { currentWorkspace } = useFileStore();
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [pendingFileType, setPendingFileType] = useState<string | null>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // 文件类型选项
  const fileTypes = [
    { type: 'md', name: 'Markdown', icon: '📝' },
    { type: 'txt', name: '文本文件', icon: '📄' },
    { type: 'docx', name: 'Word 文档', icon: '📘' },
    { type: 'html', name: 'HTML', icon: '🌐' },
    { type: 'xlsx', name: 'Excel', icon: '📊' },
    { type: 'pptx', name: 'PowerPoint', icon: '📽️' },
  ];

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setShowFileMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 处理新建文件夹
  const handleCreateFolder = async () => {
    if (!currentWorkspace) {
      toast.warning('请先选择工作区');
      return;
    }

    setPendingFileType('folder');
    setShowInputDialog(true);
  };

  // 处理新建文件（单击）
  const handleCreateFileClick = () => {
    if (!currentWorkspace) {
      toast.warning('请先选择工作区');
      return;
    }

    // 检查是否是双击（300ms内）
    const now = Date.now();
    if (now - lastClickTime < 300) {
      // 双击：快速创建默认文件
      handleQuickCreateFile();
      setLastClickTime(0);
    } else {
      // 单击：显示菜单
      setShowFileMenu(!showFileMenu);
      setLastClickTime(now);
    }
  };

  // 快速创建默认文件（.txt）
  const handleQuickCreateFile = async () => {
    if (!currentWorkspace) return;

    setPendingFileType('txt');
    setShowInputDialog(true);
    setShowFileMenu(false);
  };

  // 选择文件类型
  const handleSelectFileType = (fileType: string) => {
    setPendingFileType(fileType);
    setShowInputDialog(true);
    setShowFileMenu(false);
  };

  // 确认创建文件/文件夹
  const handleInputConfirm = async (fileName: string) => {
    if (!pendingFileType || !currentWorkspace) {
      setShowInputDialog(false);
      return;
    }

    const fileType = pendingFileType;
    const extension = fileType === 'folder' ? '' : `.${fileType}`;
    const filePath = `${currentWorkspace}/${fileName}${extension}`;

    try {
      if (fileType === 'folder') {
        await fileService.createFolder(filePath);
        toast.success('文件夹创建成功');
        // 记录历史
        addHistoryRecord({
          type: 'create_folder',
          target: filePath,
          success: true,
        });
      } else {
        await fileService.createFile(filePath, fileType);
        toast.success('文件创建成功');
        // 记录历史
        addHistoryRecord({
          type: 'create_file',
          target: filePath,
          success: true,
        });

        // 与 NewFileButton 一致：记录元数据，便于从文件树打开时进入编辑模式
        const { normalizePath, normalizeWorkspacePath } = await import('../../utils/pathUtils');
        const normalizedFilePath = normalizePath(filePath);
        const normalizedWorkspacePath = normalizeWorkspacePath(currentWorkspace);
        try {
          const { recordBinderFile } = await import('../../services/fileMetadataService');
          await recordBinderFile(normalizedFilePath, 'new', normalizedWorkspacePath, 3);
        } catch (err) {
          console.warn('[ResourceToolbar] 记录文件元数据失败:', err);
        }
        // DOCX/MD/HTML/TXT 创建后自动打开并标记为新建
        if (['docx', 'md', 'html', 'txt'].includes(fileType)) {
          const { documentService } = await import('../../services/documentService');
          await documentService.openFile(normalizedFilePath, { source: 'new' });
        }
      }

      setShowInputDialog(false);
      setPendingFileType(null);
      
      // 刷新文件树
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('创建失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`创建失败: ${errorMessage}`);
      // 记录失败历史
      addHistoryRecord({
        type: fileType === 'folder' ? 'create_folder' : 'create_file',
        target: filePath,
        success: false,
        error: errorMessage,
      });
    }
  };

  const handleInputCancel = () => {
    setShowInputDialog(false);
    setPendingFileType(null);
  };

  const getFileTypeName = (fileType: string) => {
    if (fileType === 'folder') return '文件夹';
    const typeInfo = fileTypes.find(t => t.type === fileType);
    return typeInfo ? typeInfo.name : fileType;
  };

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {/* 新建文件夹按钮 */}
        <button
          onClick={handleCreateFolder}
          className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="新建文件夹"
        >
          <FolderPlusIcon className="w-5 h-5" />
        </button>

        {/* 新建文件按钮（复合图标） */}
        <div className="relative" ref={fileMenuRef}>
          <div className="flex items-center">
            <button
              onClick={handleCreateFileClick}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-l transition-colors"
              title="新建文件"
            >
              <DocumentPlusIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setShowFileMenu(!showFileMenu);
                setLastClickTime(0); // 重置双击计时
              }}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-r border-l border-gray-300 dark:border-gray-600 transition-colors"
              title="选择文件类型"
            >
              <ChevronDownIcon className="w-4 h-4" />
            </button>
          </div>

          {/* 文件类型下拉菜单 */}
          {showFileMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 min-w-[180px]">
              {fileTypes.map((fileType) => (
                <button
                  key={fileType.type}
                  onClick={() => handleSelectFileType(fileType.type)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm"
                >
                  <span>{fileType.icon}</span>
                  <span>{fileType.name} (.{fileType.type})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 搜索按钮 */}
        <button
          onClick={onSearch}
          className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="搜索"
        >
          <MagnifyingGlassIcon className="w-5 h-5" />
        </button>

        {/* 云存储按钮（占位） */}
        <button
          onClick={() => toast.info('云存储功能开发中')}
          className="p-2 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors opacity-50 cursor-not-allowed"
          title="云存储（开发中）"
          disabled
        >
          <CloudIcon className="w-5 h-5" />
        </button>

        {/* 拓展按钮（占位） */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="更多操作"
          >
            <EllipsisHorizontalIcon className="w-5 h-5" />
          </button>

          {/* 更多操作下拉菜单 */}
          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 min-w-[150px]">
              <button
                onClick={() => {
                  toast.info('导入文件功能开发中');
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
              >
                导入文件
              </button>
              <button
                onClick={() => {
                  toast.info('导出工作区功能开发中');
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
              >
                导出工作区
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700" />
              <button
                onClick={() => {
                  toast.info('设置功能开发中');
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
              >
                设置
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 输入对话框 */}
      {showInputDialog && pendingFileType && (
        <InputDialog
          title={`新建${getFileTypeName(pendingFileType)}`}
          message={`请输入${getFileTypeName(pendingFileType)}名称${pendingFileType === 'folder' ? '' : '（不含扩展名）'}:`}
          onConfirm={handleInputConfirm}
          onCancel={handleInputCancel}
        />
      )}
    </>
  );
};

export default ResourceToolbar;

