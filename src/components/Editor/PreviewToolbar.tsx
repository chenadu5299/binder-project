// src/components/Editor/PreviewToolbar.tsx

import React, { useState } from 'react';
import { 
  MagnifyingGlassIcon, 
  PrinterIcon, 
  PlusIcon, 
  MinusIcon,
  ArrowsPointingOutIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';

interface PreviewToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onSearch: (query: string) => void;
  onPrint: () => void;
  onToggleOutline: () => void;
  showOutline: boolean;
}

const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSearch,
  onPrint,
  onToggleOutline,
  showOutline,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {/* 缩放控制 */}
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="缩小"
          disabled={zoom <= 50}
        >
          <MinusIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium min-w-[60px] text-center text-gray-700 dark:text-gray-300">
          {zoom}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="放大"
          disabled={zoom >= 200}
        >
          <PlusIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onZoomReset}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-2"
          title="重置缩放"
        >
          <ArrowsPointingOutIcon className="w-5 h-5" />
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />

        {/* 搜索 */}
        {showSearch ? (
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                onSearch('');
              }}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              取消
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="搜索"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </button>
        )}

        {/* 打印 */}
        <button
          onClick={onPrint}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="打印"
        >
          <PrinterIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* 大纲切换 */}
        <button
          onClick={onToggleOutline}
          className={`p-1.5 rounded transition-colors ${
            showOutline
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="显示/隐藏大纲"
        >
          <ListBulletIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default PreviewToolbar;

