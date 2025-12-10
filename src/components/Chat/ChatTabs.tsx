import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '../../stores/chatStore';

export const ChatTabs: React.FC = () => {
    const { tabs, activeTabId, setActiveTab, deleteTab } = useChatStore();
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    
    const handleTabClick = (tabId: string) => {
        setActiveTab(tabId);
    };
    
    const handleTabClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        deleteTab(tabId);
    };
    
    return (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto scrollbar-hide"
                style={{ scrollbarWidth: 'thin' }}
            >
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className={`
                            flex items-center gap-2 px-4 py-2 border-b-2 cursor-pointer
                            transition-colors min-w-[120px] max-w-[200px]
                            ${activeTabId === tab.id
                                ? 'border-blue-500 bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400'
                                : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }
                        `}
                    >
                        <span className="flex-1 truncate text-sm font-medium">
                            {tab.title}
                        </span>
                        <button
                            onClick={(e) => handleTabClose(e, tab.id)}
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity"
                            title="关闭标签页"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

