import React from 'react';
import { FileTreeNode as FileTreeNodeType } from '../../types/file';
import FileIcon from './FileIcon';

interface FileTreeNodeProps {
  node: FileTreeNodeType;
  level: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.is_directory) {
      onToggleExpand(node.path);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
          !node.is_directory ? 'select-none' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTreeNode;

