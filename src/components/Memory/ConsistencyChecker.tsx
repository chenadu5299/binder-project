import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import { ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { toast } from '../Common/Toast';

interface ConsistencyIssue {
    issue_type: string;
    description: string;
    affected_items: string[];
    severity: string;
}

const ConsistencyChecker: React.FC = () => {
    const { currentWorkspace } = useFileStore();
    const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
    const [isChecking, setIsChecking] = useState(false);

    const handleCheck = async () => {
        if (!currentWorkspace) {
            toast.warning('请先选择工作区');
            return;
        }

        setIsChecking(true);
        try {
            const result = await invoke<ConsistencyIssue[]>('check_memory_consistency', {
                workspacePath: currentWorkspace,
            });
            setIssues(result);
        } catch (error) {
            console.error('一致性检查失败:', error);
            toast.error(`一致性检查失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsChecking(false);
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity.toLowerCase()) {
            case 'high':
                return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
            case 'medium':
                return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
            case 'low':
                return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
            default:
                return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600';
        }
    };

    const getSeverityLabel = (severity: string) => {
        switch (severity.toLowerCase()) {
            case 'high':
                return '高';
            case 'medium':
                return '中';
            case 'low':
                return '低';
            default:
                return severity;
        }
    };

    return (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">一致性检查</h4>
                <button
                    onClick={handleCheck}
                    disabled={isChecking || !currentWorkspace}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isChecking ? '检查中...' : '检查一致性'}
                </button>
            </div>

            {issues.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        <span>发现 {issues.length} 个问题</span>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {issues.map((issue, index) => (
                            <div
                                key={index}
                                className={`p-3 rounded-md border ${getSeverityColor(issue.severity)}`}
                            >
                                <div className="flex items-start justify-between mb-1">
                                    <span className="text-xs font-medium">
                                        {getSeverityLabel(issue.severity)} - {issue.issue_type}
                                    </span>
                                </div>
                                <p className="text-sm mb-2">{issue.description}</p>
                                {issue.affected_items.length > 0 && (
                                    <div className="text-xs opacity-75">
                                        影响 {issue.affected_items.length} 个记忆项
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {issues.length === 0 && !isChecking && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <CheckCircleIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span>暂无问题</span>
                </div>
            )}
        </div>
    );
};

export default ConsistencyChecker;

