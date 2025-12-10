import React, { useState } from 'react';
import { FileTreeNode as FileTreeNodeType } from '../../types/file';
import FileIcon from './FileIcon';
import FileTreeContextMenu from './FileTreeContextMenu';

interface FileTreeNodeProps {
  node: FileTreeNodeType;
  level: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onOrganize?: (path: string) => void;
  onMoveFile?: (sourcePath: string, destinationPath: string) => void;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onRename,
  onDelete,
  onDuplicate,
  onOrganize,
  onMoveFile,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.is_directory) {
      onToggleExpand(node.path);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    // 设置拖拽数据
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.setData('application/file-path', node.path);
    e.dataTransfer.setData('application/is-directory', String(node.is_directory));
    
    // 设置拖拽图标
    if (e.dataTransfer.setDragImage) {
      const dragImage = document.createElement('div');
      dragImage.textContent = node.name;
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      dragImage.style.padding = '4px 8px';
      dragImage.style.background = 'rgba(59, 130, 246, 0.9)';
      dragImage.style.color = 'white';
      dragImage.style.borderRadius = '4px';
      dragImage.style.fontSize = '12px';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  };

  // 拖拽结束
  const handleDragEnd = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setIsDragOver(false);
    // 如果拖拽到文件树外部（如聊天窗口），不执行任何操作
    // dropEffect 会在目标区域设置
  };

  // 拖拽悬停（作为拖放目标）
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 只允许文件夹作为拖放目标
    if (!node.is_directory) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    
    // 检查是否有文件路径数据（在dragOver中无法使用getData，只能检查types）
    const hasFilePath = e.dataTransfer.types.includes('application/file-path');
    if (!hasFilePath) {
      e.dataTransfer.dropEffect = 'none';
      setIsDragOver(false);
      return;
    }
    
    // 注意：在dragOver中无法获取具体路径，所以无法检查是否拖到自己
    // 这个检查会在drop事件中进行
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  // 拖拽离开（作为拖放目标）
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开到非子元素时才清除状态
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  // 放置文件
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    // 在drop事件中可以获取数据
    const sourcePath = e.dataTransfer.getData('application/file-path');
    const isDirectory = e.dataTransfer.getData('application/is-directory') === 'true';
    
    if (!sourcePath || !onMoveFile) {
      console.log('❌ 拖拽数据无效:', { sourcePath, hasOnMoveFile: !!onMoveFile });
      return;
    }
    
    // 只允许文件夹作为拖放目标
    if (!node.is_directory) {
      console.log('❌ 目标不是文件夹');
      return;
    }
    
    // 不允许拖拽文件夹（暂时）
    if (isDirectory) {
      console.log('❌ 暂不支持移动文件夹');
      return;
    }
    
    // 检查是否尝试拖到自己
    if (sourcePath === node.path) {
      console.log('❌ 不能移动到自己的位置');
      return;
    }
    
    // 检查是否拖到自己的子目录（不能将文件拖到自己的子文件夹中）
    if (node.path.startsWith(sourcePath + '/')) {
      console.log('❌ 不能移动到自己的子目录');
      return;
    }
    
    // 检查是否拖到同一个位置（允许从子目录拖到父目录）
    const sourceParent = sourcePath.split('/').slice(0, -1).join('/');
    if (node.path === sourceParent) {
      console.log('❌ 文件已在目标文件夹中');
      return;
    }
    
    // 构建目标路径
    const fileName = sourcePath.split('/').pop() || '';
    const destinationPath = `${node.path}/${fileName}`;
    
    console.log('✅ 移动文件:', { sourcePath, destinationPath });
    
    // 执行移动
    onMoveFile(sourcePath, destinationPath);
  };

  return (
    <div
      className={node.is_directory ? '' : ''}
      onDragOver={node.is_directory ? handleDragOver : undefined}
      onDragLeave={node.is_directory ? handleDragLeave : undefined}
      onDrop={node.is_directory ? handleDrop : undefined}
    >
      <div
        className={`flex items-center px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
          !node.is_directory ? 'select-none' : ''
        } ${
          isDragging ? 'opacity-50' : ''
        } ${
          isDragOver && node.is_directory ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400 border-dashed' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {node.is_directory && (
          <span className="mr-1 text-xs text-gray-400">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        <FileIcon 
          isDirectory={node.is_directory} 
          isExpanded={isExpanded} 
          fileName={node.name}
        />
        <span className="ml-2 flex-1 truncate">{node.name}</span>
      </div>
      {isExpanded && hasChildren && (
        <div
          className={node.is_directory && isDragOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
          onDragOver={node.is_directory ? handleDragOver : undefined}
          onDragLeave={node.is_directory ? handleDragLeave : undefined}
          onDrop={node.is_directory ? handleDrop : undefined}
        >
          {node.children!.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
              onRename={onRename}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onOrganize={onOrganize}
              onMoveFile={onMoveFile}
            />
          ))}
        </div>
      )}
      
      {/* 右键菜单 */}
      {contextMenu && (onRename || onDelete || onDuplicate || onOrganize) && (
        <FileTreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filePath={node.path}
          isDirectory={node.is_directory}
          onRename={() => onRename?.(node.path)}
          onDelete={() => onDelete?.(node.path)}
          onDuplicate={onDuplicate ? () => onDuplicate(node.path) : undefined}
          onOrganize={onOrganize ? () => onOrganize(node.path) : undefined}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default FileTreeNode;

