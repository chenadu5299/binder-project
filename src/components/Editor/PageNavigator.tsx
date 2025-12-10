// src/components/Editor/PageNavigator.tsx

import React, { useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface PageNavigatorProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const PageNavigator: React.FC<PageNavigatorProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const [inputPage, setInputPage] = useState(currentPage.toString());

  // 当 currentPage 变化时，更新输入框
  useEffect(() => {
    setInputPage(currentPage.toString());
  }, [currentPage]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPage(e.target.value);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(inputPage, 10);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setInputPage(currentPage.toString());
    }
  };

  const handleInputBlur = () => {
    const page = parseInt(inputPage, 10);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setInputPage(currentPage.toString());
    }
  };

  if (totalPages <= 1) {
    return null; // 单页文档不显示导航器
  }

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={handlePrevPage}
        disabled={currentPage <= 1}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="上一页"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </button>

      <form onSubmit={handleInputSubmit} className="flex items-center gap-1">
        <input
          type="number"
          min="1"
          max={totalPages}
          value={inputPage}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className="w-16 px-2 py-1 text-sm text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          / {totalPages}
        </span>
      </form>

      <button
        onClick={handleNextPage}
        disabled={currentPage >= totalPages}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="下一页"
      >
        <ChevronRightIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default PageNavigator;

