import React, { useRef, useState, useCallback } from 'react';
import FileTree, { FileTreeRef } from './FileTree';
import ResourceToolbar from './ResourceToolbar';
import CollapsibleSection from './CollapsibleSection';
import MemorySection from './MemorySection';
import KnowledgeSection from './KnowledgeSection';
import InstructionSection from './InstructionSection';
import HistorySection from './HistorySection';
import SearchPanel from './SearchPanel';
import { useFileStore } from '../../stores/fileStore';
import { FolderIcon, LightBulbIcon, BookOpenIcon, CommandLineIcon, ClockIcon } from '@heroicons/react/24/outline';

const FileTreePanel: React.FC = () => {
  const fileTreeRef = useRef<FileTreeRef>(null);
  const { currentWorkspace, fileTree } = useFileStore();
  
  // 区域展开/折叠状态
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [instructionExpanded, setInstructionExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  
  // 搜索状态
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const handleRefresh = async () => {
    if (fileTreeRef.current) {
      await fileTreeRef.current.refresh();
    }
  };

  const handleSearch = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  // 文件树搜索
  const searchFileTree = useCallback((query: string) => {
    if (!fileTree || !query.trim()) {
      setSearchResults([]);
      return;
    }

    const results: string[] = [];
    const searchLower = query.toLowerCase();

    const searchNode = (node: typeof fileTree) => {
      const fileName = node.path.split('/').pop() || '';
      if (fileName.toLowerCase().includes(searchLower)) {
        results.push(node.path);
      }
      if (node.children) {
        node.children.forEach(child => searchNode(child));
      }
    };

    searchNode(fileTree);
    setSearchResults(results);
  }, [fileTree]);

  const handleSearchQuery = (query: string) => {
    setSearchQuery(query);
    if (workspaceExpanded) {
      searchFileTree(query);
    }
    // 记忆库和历史记录的搜索在各自组件内部处理
  };

  // 确定搜索占位符
  const getSearchPlaceholder = () => {
    if (workspaceExpanded) return '搜索文件...';
    if (memoryExpanded) return '搜索记忆...';
    if (knowledgeExpanded) return '搜索知识库...';
    if (instructionExpanded) return '搜索指令...';
    if (historyExpanded) return '搜索历史记录...';
    return '搜索...';
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* 顶部工具栏 - 固定 */}
      <ResourceToolbar onSearch={handleSearch} onRefresh={handleRefresh} />

      {/* 搜索面板 */}
      {showSearch && (
        <SearchPanel
          isVisible={showSearch}
          onClose={() => {
            setShowSearch(false);
            setSearchQuery('');
            setSearchResults([]);
          }}
          onSearch={handleSearchQuery}
          placeholder={getSearchPlaceholder()}
        />
      )}

      {/* 工作区区域 - 中间可滚动区域 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <CollapsibleSection
          title="工作区"
          icon={<FolderIcon className="w-4 h-4" />}
          isExpanded={workspaceExpanded}
          onToggle={() => setWorkspaceExpanded(!workspaceExpanded)}
          flexGrow={true}
        >
          {currentWorkspace ? (
            <div className="flex-1 min-h-0 flex flex-col relative">
              {searchQuery && searchResults.length > 0 && (
                <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">
                  找到 {searchResults.length} 个结果
                </div>
              )}
              <FileTree ref={fileTreeRef} />
            </div>
          ) : (
            <div className="p-3 text-center text-gray-500 dark:text-gray-400 text-sm">
              请先选择工作区
            </div>
          )}
        </CollapsibleSection>
      </div>

      {/* 底部固定区域 - 记忆库、知识库、指令库、历史记录 */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
        {/* 记忆库区域 */}
        <CollapsibleSection
          title="记忆库"
          icon={<LightBulbIcon className="w-4 h-4" />}
          isExpanded={memoryExpanded}
          onToggle={() => setMemoryExpanded(!memoryExpanded)}
        >
          <MemorySection isExpanded={memoryExpanded} />
        </CollapsibleSection>

        {/* 知识库区域 */}
        <CollapsibleSection
          title="知识库"
          icon={<BookOpenIcon className="w-4 h-4" />}
          isExpanded={knowledgeExpanded}
          onToggle={() => setKnowledgeExpanded(!knowledgeExpanded)}
        >
          <KnowledgeSection isExpanded={knowledgeExpanded} />
        </CollapsibleSection>

        {/* 指令库区域 */}
        <CollapsibleSection
          title="指令库"
          icon={<CommandLineIcon className="w-4 h-4" />}
          isExpanded={instructionExpanded}
          onToggle={() => setInstructionExpanded(!instructionExpanded)}
        >
          <InstructionSection isExpanded={instructionExpanded} />
        </CollapsibleSection>

        {/* 历史记录区域 */}
        <CollapsibleSection
          title="历史记录"
          icon={<ClockIcon className="w-4 h-4" />}
          isExpanded={historyExpanded}
          onToggle={() => setHistoryExpanded(!historyExpanded)}
        >
          <HistorySection isExpanded={historyExpanded} />
        </CollapsibleSection>
      </div>
    </div>
  );
};

export default FileTreePanel;

