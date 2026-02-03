// 工具调用缩览组件

import React, { useState } from 'react';
import { ToolCall } from '../../types/tool';
import { 
    DocumentIcon, 
    FolderIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import { generateToolDescription } from '../../utils/toolDescription';

interface ToolCallSummaryProps {
    toolCall: ToolCall;
    expanded?: boolean;
    onToggle?: () => void;
}

export const ToolCallSummary: React.FC<ToolCallSummaryProps> = ({ 
    toolCall, 
    expanded = false,
    onToggle 
}) => {
    const [isExpanded, setIsExpanded] = useState(expanded);

    const handleToggle = () => {
        setIsExpanded(!isExpanded);
        if (onToggle) {
            onToggle();
        }
    };

    const getToolIcon = () => {
        switch (toolCall.name) {
            case 'list_files':
                return <FolderIcon className="w-4 h-4 text-blue-500" />;
            case 'read_file':
                return <DocumentIcon className="w-4 h-4 text-gray-500" />;
            case 'create_file':
                return <PlusIcon className="w-4 h-4 text-green-500" />;
            case 'update_file':
                return <PencilIcon className="w-4 h-4 text-yellow-500" />;
            case 'delete_file':
                return <TrashIcon className="w-4 h-4 text-red-500" />;
            case 'search_files':
                return <MagnifyingGlassIcon className="w-4 h-4 text-purple-500" />;
            case 'move_file':
                return <ArrowPathIcon className="w-4 h-4 text-blue-500" />;
            case 'rename_file':
                return <PencilIcon className="w-4 h-4 text-orange-500" />;
            case 'create_folder':
                return <FolderIcon className="w-4 h-4 text-blue-500" />;
            default:
                return <DocumentIcon className="w-4 h-4 text-gray-500" />;
        }
    };

    const getStatusIcon = () => {
        switch (toolCall.status) {
            case 'completed':
                return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
            case 'failed':
                return <XCircleIcon className="w-4 h-4 text-red-500" />;
            case 'executing':
                return <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />;
            default:
                return <ClockIcon className="w-4 h-4 text-gray-400" />;
        }
    };

    const getStatusText = () => {
        switch (toolCall.status) {
            case 'completed':
                if (toolCall.name === 'list_files' && toolCall.result?.data?.files) {
                    const fileCount = Array.isArray(toolCall.result.data.files) 
                        ? toolCall.result.data.files.length 
                        : 0;
                    return `✅ 成功 (${fileCount} 项)`;
                }
                return '✅ 成功';
            case 'failed':
                return '❌ 失败';
            case 'executing':
                return '⏳ 执行中';
            default:
                return '⏸️ 等待';
        }
    };

    const description = generateToolDescription(toolCall);

    return (
        <div 
            className={`
                border border-blue-200 dark:border-blue-800 rounded-lg 
                bg-blue-50 dark:bg-blue-900/20 
                transition-all duration-200
                ${isExpanded ? 'p-3' : 'px-3 py-2'}
                cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30
            `}
            onClick={handleToggle}
        >
            {/* 缩览行 */}
            <div className="flex items-center gap-2 text-xs">
                {getToolIcon()}
                <span className="font-medium text-gray-900 dark:text-gray-100 flex-1">
                    {description}
                </span>
                <div className="flex items-center gap-1">
                    {getStatusIcon()}
                    <span className="text-gray-600 dark:text-gray-400">
                        {getStatusText()}
                    </span>
                </div>
            </div>

            {/* 展开内容 */}
            {isExpanded && (
                <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800 space-y-2">
                    {/* 参数信息 */}
                    {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
                        <div className="text-xs">
                            <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">参数:</div>
                            <div className="pl-2 space-y-1">
                                {Object.entries(toolCall.arguments).map(([key, value]) => (
                                    <div key={key} className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{key}:</span>{' '}
                                        <span className="text-gray-500 dark:text-gray-500">
                                            {typeof value === 'object' 
                                                ? JSON.stringify(value).substring(0, 50) + '...'
                                                : String(value).substring(0, 50)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 执行结果 */}
                    {toolCall.result && (
                        <div className="text-xs">
                            <div className={`font-medium mb-1 ${
                                toolCall.result.success 
                                    ? 'text-green-700 dark:text-green-300' 
                                    : 'text-red-700 dark:text-red-300'
                            }`}>
                                {toolCall.result.success ? '✅ 执行成功' : '❌ 执行失败'}
                            </div>
                            {toolCall.result.message && (
                                <div className="text-gray-600 dark:text-gray-400 pl-2">
                                    {toolCall.result.message}
                                </div>
                            )}
                            {toolCall.result.error && (
                                <div className="text-red-600 dark:text-red-400 pl-2">
                                    {toolCall.result.error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 错误信息 */}
                    {toolCall.error && (
                        <div className="text-xs text-red-600 dark:text-red-400">
                            <div className="font-medium mb-1">错误:</div>
                            <div className="pl-2">{toolCall.error}</div>
                        </div>
                    )}

                    {/* 收起按钮 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggle();
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        收起
                    </button>
                </div>
            )}
        </div>
    );
};

