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
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
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

  return (
    <div>
      <div
        className={`flex items-center px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
          !node.is_directory ? 'select-none' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
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
        <div>
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

