import React, { useState } from 'react';

interface InstructionSectionProps {
  isExpanded: boolean;
}

/**
 * 指令库区域：用于存储用户预设的流程、模板，类似于 agent skills
 */
const InstructionSection: React.FC<InstructionSectionProps> = ({ isExpanded }) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="p-3">
      <div className="mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索指令..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
        暂无预设指令
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          可在此保存常用流程与模板，便于快速调用
        </p>
      </div>
    </div>
  );
};

export default InstructionSection;
