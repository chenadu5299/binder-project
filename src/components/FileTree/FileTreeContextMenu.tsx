import React, { useEffect, useRef } from 'react';
import { PencilIcon, TrashIcon, DocumentDuplicateIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface FileTreeContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  isDirectory: boolean;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onOrganize?: () => void;
  onClose: () => void;
}

const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({
  x,
  y,
  filePath,
  isDirectory,
  onRename,
  onDelete,
  onDuplicate,
  onOrganize,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 确保菜单不超出视口
  const [adjustedPosition, setAdjustedPosition] = React.useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // 调整水平位置
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (adjustedX < 10) {
        adjustedX = 10;
      }

      // 调整垂直位置
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }
      if (adjustedY < 10) {
        adjustedY = 10;
      }

      setAdjustedPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div
      ref={menuRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
      >
        <PencilIcon className="w-4 h-4" />
        重命名
      </button>

      {onDuplicate && !isDirectory && (
        <button
          onClick={() => {
            onDuplicate();
            onClose();
          }}
          className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <DocumentDuplicateIcon className="w-4 h-4" />
          复制
        </button>
      )}

      {onOrganize && !isDirectory && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => {
              onOrganize();
              onClose();
            }}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400"
          >
            <SparklesIcon className="w-4 h-4" />
            AI 智能分类
          </button>
        </>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

      <button
        onClick={() => {
          if (confirm(`确定要删除 "${fileName}" 吗？\n此操作不可撤销。`)) {
            onDelete();
            onClose();
          }
        }}
        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
      >
        <TrashIcon className="w-4 h-4" />
        删除
      </button>
    </div>
  );
};

export default FileTreeContextMenu;

