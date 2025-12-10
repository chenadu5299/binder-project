import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { fileService } from '../../services/fileService';
import { documentService } from '../../services/documentService';
import FileTreeNode from './FileTreeNode';
import OrganizeFilesDialog from './OrganizeFilesDialog';
import LoadingSpinner from '../Common/LoadingSpinner';
import { toast } from '../Common/Toast';
import { listen } from '@tauri-apps/api/event';

export interface FileTreeRef {
  refresh: () => Promise<void>;
}

const FileTree = forwardRef<FileTreeRef>((_props, ref) => {
  const { currentWorkspace, fileTree, setFileTree, setSelectedFile, addOpenFile } = useFileStore();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [organizeFiles, setOrganizeFiles] = useState<string[] | null>(null);

  const loadFileTree = async () => {
    if (!currentWorkspace) return;
    setIsLoading(true);
    try {
      const tree = await fileService.buildFileTree(currentWorkspace, 5);
      setFileTree(tree);
      // 默认展开根目录
      setExpandedPaths(new Set([tree.path]));
    } catch (error) {
      console.error('加载文件树失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 导出刷新函数供外部调用
  useImperativeHandle(ref, () => ({
    refresh: loadFileTree,
  }));

  useEffect(() => {
    if (currentWorkspace) {
      loadFileTree();
    }
  }, [currentWorkspace]);

  // 监听文件系统变化事件
  useEffect(() => {
    if (!currentWorkspace) return;

    let unlisten: (() => void) | null = null;

    // 监听文件树变化事件
    listen<string>('file-tree-changed', (event) => {
      // 检查事件的工作区路径是否匹配当前工作区
      if (event.payload === currentWorkspace) {
        console.log('检测到文件系统变化，自动刷新文件树');
        loadFileTree();
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    }).catch((error) => {
      console.error('监听文件系统事件失败:', error);
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [currentWorkspace]);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path);
    
    // 检查文件类型，决定如何打开
    const ext = path.split('.').pop()?.toLowerCase();
    
    // 支持的文件类型：docx, md, html, txt, pdf, 图片
    const supportedTypes = ['docx', 'md', 'html', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    
    if (ext && supportedTypes.includes(ext)) {
      try {
        // 在编辑器中打开文件（如果已打开会自动切换）
        await documentService.openFile(path);
        // 添加到打开文件列表
        addOpenFile(path);
      } catch (error) {
        console.error('打开文件失败:', error);
        toast.error(`打开文件失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // 不支持的文件类型，提示用户
      toast.warning(`不支持的文件类型: ${ext || '未知'}`);
    }
  };

  // ⚠️ Week 18.1：处理文件拖拽（仅外部文件）
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 检查是否是从文件树内部拖拽的文件（如果是，不处理）
    const hasFilePath = e.dataTransfer.types.includes('application/file-path');
    if (hasFilePath) {
      // 文件树内部拖拽，让子节点处理
      return;
    }
    
    // 只处理外部文件拖拽
    if (currentWorkspace) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // 检查是否是从文件树内部拖拽的文件（如果是，让子节点处理）
    const hasFilePath = e.dataTransfer.types.includes('application/file-path');
    if (hasFilePath) {
      // 这是文件树内部的拖拽，让 FileTreeNode 处理
      console.log('📁 文件树内部拖拽，由子节点处理');
      return;
    }

    if (!currentWorkspace) {
      toast.warning('请先选择工作区');
      return;
    }

    const items = Array.from(e.dataTransfer.items);
    const files: File[] = [];

    // 处理拖拽的文件（外部文件）
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length === 0) {
      return;
    }

    // 处理每个文件
    for (const file of files) {
      try {
        // 在 Tauri 环境中，从外部拖拽的文件需要通过 FileReader 读取
        // 然后写入到工作区
        const destPath = `${currentWorkspace}/${file.name}`;
        
        // 读取文件内容
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 尝试作为文本文件读取，如果失败则作为二进制文件处理
        let content: string;
        try {
          content = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
        } catch {
          // 如果是二进制文件，使用 base64 编码
          const base64 = btoa(String.fromCharCode(...uint8Array));
          content = base64;
        }
        
        // 写入文件到工作区
        await fileService.writeFile(destPath, content);
        
        console.log(`✅ 文件已导入: ${file.name}`);
          } catch (error) {
            console.error(`❌ 导入文件失败: ${file.name}`, error);
            toast.error(`导入文件失败: ${file.name} - ${error instanceof Error ? error.message : String(error)}`);
          }
    }

    // 刷新文件树
    await loadFileTree();
  };

  // ⚠️ Week 18.2：处理文件重命名
  const handleRename = async (filePath: string) => {
    const newName = prompt('请输入新名称:', filePath.split('/').pop() || '');
    if (!newName || newName.trim() === '') {
      return;
    }

    try {
      await fileService.renameFile(filePath, newName.trim());
      await loadFileTree();
    } catch (error) {
      console.error('重命名文件失败:', error);
      toast.error(`重命名文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ⚠️ Week 18.2：处理文件删除
  const handleDelete = async (filePath: string) => {
    try {
      await fileService.deleteFile(filePath);
      await loadFileTree();
    } catch (error) {
      console.error('删除文件失败:', error);
      toast.error(`删除文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ⚠️ Week 18.2：处理文件复制
  const handleDuplicate = async (filePath: string) => {
    try {
      await fileService.duplicateFile(filePath);
      await loadFileTree();
    } catch (error) {
      console.error('复制文件失败:', error);
      toast.error(`复制文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ⚠️ Week 20：处理 AI 智能分类
  const handleOrganize = (filePath: string) => {
    setOrganizeFiles([filePath]);
  };

  // 处理文件移动（拖拽）
  const handleMoveFile = async (sourcePath: string, destinationPath: string) => {
    if (!currentWorkspace) {
      toast.warning('请先选择工作区');
      return;
    }
    
    try {
      await fileService.moveFile(sourcePath, destinationPath, currentWorkspace);
      toast.success(`文件已移动到: ${destinationPath.split('/').pop()}`);
      // 刷新文件树（会通过 file-tree-changed 事件自动刷新，但这里也手动刷新确保同步）
      await loadFileTree();
    } catch (error) {
      console.error('移动文件失败:', error);
      toast.error(`移动文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        请选择工作区
      </div>
    );
  }

  return (
    <div
      className={`h-full flex flex-col ${
        isDragOver ? 'border-2 border-blue-500 border-dashed bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 文件树内容 - 可滚动区域 */}
      <div 
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ 
          minHeight: 0, // 关键：允许 flex 子元素缩小，使滚动生效
          paddingLeft: '2px',
          paddingRight: '2px'
        }}
      >
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <LoadingSpinner size="md" text="加载文件树中..." />
          </div>
        ) : fileTree ? (
          <FileTreeNode
            node={fileTree}
            level={0}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
            onSelectFile={handleFileSelect}
            onRename={handleRename}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onOrganize={handleOrganize}
            onMoveFile={handleMoveFile}
          />
        ) : (
          <div className="p-4 text-gray-500 dark:text-gray-400">
            文件树为空
          </div>
        )}
      </div>

      {/* ⚠️ Week 20：AI 智能分类整理对话框 */}
      {organizeFiles && (
        <OrganizeFilesDialog
          filePaths={organizeFiles}
          onClose={() => setOrganizeFiles(null)}
          onComplete={async () => {
            await loadFileTree();
          }}
        />
      )}
    </div>
  );
});

FileTree.displayName = 'FileTree';

export default FileTree;

