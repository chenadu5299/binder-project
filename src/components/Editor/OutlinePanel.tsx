// src/components/Editor/OutlinePanel.tsx

import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface OutlineItem {
  level: number;
  text: string;
  page: number;
}

interface OutlinePanelProps {
  outline: OutlineItem[];
  currentPage: number;
  onItemClick: (item: OutlineItem) => void;
  onClose: () => void;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({
  outline,
  currentPage,
  onItemClick,
  onClose,
}) => {
  if (outline.length === 0) {
    return (
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">大纲</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="关闭"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
          暂无大纲
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">大纲</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="关闭"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {outline.map((item, index) => {
          const isActive = item.page === currentPage;
          const paddingLeft = (item.level - 1) * 16 + 8;
          const fontSize = item.level === 1 ? '14px' : item.level === 2 ? '13px' : '12px';
          const fontWeight = item.level <= 2 ? '600' : '400';

          return (
            <div
              key={index}
              onClick={() => onItemClick(item)}
              className={`px-2 py-1.5 rounded cursor-pointer transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              style={{
                paddingLeft: `${paddingLeft}px`,
                fontSize,
                fontWeight,
              }}
            >
              <div className="truncate">{item.text}</div>
              {item.page > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  第 {item.page} 页
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OutlinePanel;

