import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { XMarkIcon } from '@heroicons/react/24/outline';

const EditorTabs: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, removeTab } = useEditorStore();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = React.useState(false);
  const [showRightFade, setShowRightFade] = React.useState(false);
  
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === tabId);
    
    // ⚠️ 关键：关闭前检查未保存更改
    if (tab && tab.isDirty) {
      const confirmed = window.confirm(
        `文件 "${tab.fileName}" 有未保存的更改，确定要关闭吗？\n\n选择：\n- 确定：关闭并丢弃更改\n- 取消：返回编辑`
      );
      if (!confirmed) return;
    }
    
    removeTab(tabId);
  };
  
  // 检查滚动状态并更新渐变遮罩
  const updateFadeVisibility = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);
  
  // 鼠标滚轮横向滚动
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleWheel = (e: WheelEvent) => {
      // 横向滚动：按住 Shift 或内容可以横向滚动时
      if (e.shiftKey || container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
        updateFadeVisibility();
      }
    };
    
    const handleScroll = () => {
      updateFadeVisibility();
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('scroll', handleScroll);
    updateFadeVisibility(); // 初始检查
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [updateFadeVisibility, tabs.length]);
  
  if (tabs.length === 0) {
    return null;
  }
  
  return (
    <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden relative h-10">
      {/* 左侧渐变遮罩 - 只在可以向左滚动时显示 */}
      {showLeftFade && (
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-900 z-10 pointer-events-none" />
      )}
      
      {/* 可滚动的标签栏 */}
      <div 
        ref={scrollContainerRef}
        className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-hide h-full"
        style={{ minWidth: 0 }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-3 py-2 cursor-pointer border-b-2 transition-colors whitespace-nowrap flex-shrink-0
              ${activeTabId === tab.id 
                ? 'border-blue-500 bg-white dark:bg-gray-800' 
                : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
          <span className="text-sm">
            {tab.fileName}
            {/* ⚠️ 关键：脏标记 */}
            {tab.isDirty && <span className="text-orange-500 ml-1">*</span>}
            {/* 只读标记 */}
            {tab.isReadOnly && <span className="text-gray-400 ml-1 text-xs">[只读]</span>}
            {/* 草稿标记 */}
            {tab.isDraft && <span className="text-blue-400 ml-1 text-xs">[草稿]</span>}
          </span>
          <button
            onClick={(e) => handleCloseTab(tab.id, e)}
            className="ml-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title="关闭标签页"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      </div>
      
      {/* 右侧渐变遮罩 - 只在可以向右滚动时显示 */}
      {showRightFade && (
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 to-transparent dark:from-gray-900 z-10 pointer-events-none" />
      )}
    </div>
  );
};

export default EditorTabs;

