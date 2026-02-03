import React, { ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  defaultExpanded?: boolean;
  flexGrow?: boolean; // 是否使用 flex-1 占据空间
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  flexGrow = false,
}) => {
  return (
    <div className={`${flexGrow ? 'flex-1 min-h-0' : ''} flex flex-col border-b border-gray-200 dark:border-gray-700`}>
      {/* 标题栏 */}
      <div
        onClick={onToggle}
        className="flex-shrink-0 px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
      >
        {/* 展开/折叠图标 */}
        {isExpanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        )}
        
        {/* 区域图标 */}
        {icon && <span className="text-gray-600 dark:text-gray-400">{icon}</span>}
        
        {/* 区域名称 */}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
          {title}
        </span>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;

