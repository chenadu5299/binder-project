import React, { useState } from 'react';

interface KnowledgeSectionProps {
  isExpanded: boolean;
}

/**
 * 知识库区域：用于存储和处理用户上传的知识库内容
 */
const KnowledgeSection: React.FC<KnowledgeSectionProps> = ({ isExpanded }) => {
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
          placeholder="搜索知识库..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
        暂无知识库内容
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          上传文档后可在此管理与检索知识库
        </p>
      </div>
    </div>
  );
};

export default KnowledgeSection;
