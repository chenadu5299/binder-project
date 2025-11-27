import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { fileService } from '../../services/fileService';
import { documentService } from '../../services/documentService';
import FileTreeNode from './FileTreeNode';
import { listen } from '@tauri-apps/api/event';

export interface FileTreeRef {
  refresh: () => Promise<void>;
}

const FileTree = forwardRef<FileTreeRef>((_props, ref) => {
  const { currentWorkspace, fileTree, setFileTree, setSelectedFile, addOpenFile } = useFileStore();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

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
        alert(`打开文件失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // 不支持的文件类型，提示用户
      alert(`不支持的文件类型: ${ext || '未知'}`);
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
    <div className="h-full overflow-y-auto flex flex-col">
      {/* 工作区根目录显示 ⚠️ 关键：必须显示当前工作区 */}
      {currentWorkspace ? (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">📁 当前工作区</div>
          <div className="text-sm font-semibold text-blue-800 dark:text-blue-200 truncate" title={currentWorkspace}>
            {currentWorkspace.split('/').pop() || currentWorkspace}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 truncate" title={currentWorkspace}>
            {currentWorkspace}
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="text-xs text-yellow-700 dark:text-yellow-300 mb-1 font-medium">⚠️ 未选择工作区</div>
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            请先选择工作区才能创建文件
          </div>
        </div>
      )}

      {/* 文件树内容 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <div>加载文件树中...</div>
          </div>
        ) : fileTree ? (
          <FileTreeNode
            node={fileTree}
            level={0}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
            onSelectFile={handleFileSelect}
          />
        ) : (
          <div className="p-4 text-gray-500 dark:text-gray-400">
            文件树为空
          </div>
        )}
      </div>
    </div>
  );
});

FileTree.displayName = 'FileTree';

export default FileTree;

