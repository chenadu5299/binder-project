import React, { useState } from 'react';
import { CheckIcon, XMarkIcon, DocumentIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { WorkPlan } from '../../utils/workPlanParser';

interface WorkPlanCardProps {
    plan: WorkPlan;
    onConfirm: () => void;
    onCancel: () => void;
}

export const WorkPlanCard: React.FC<WorkPlanCardProps> = ({ plan, onConfirm, onCancel }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">执行计划</h4>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                    >
                        {isExpanded ? '收起' : '展开'}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                    >
                        <CheckIcon className="w-3 h-3" />
                        <span>开始执行</span>
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center gap-1"
                    >
                        <XMarkIcon className="w-3 h-3" />
                        <span>取消</span>
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="space-y-3 text-sm">
                    {plan.documents.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-blue-800 dark:text-blue-200">
                                <DocumentIcon className="w-4 h-4" />
                                <span className="font-semibold">需要读取的文件：</span>
                            </div>
                            <ul className="list-disc list-inside ml-2 space-y-1 text-blue-700 dark:text-blue-300">
                                {plan.documents.map((doc, idx) => (
                                    <li key={idx}>{doc}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {plan.websites.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-blue-800 dark:text-blue-200">
                                <GlobeAltIcon className="w-4 h-4" />
                                <span className="font-semibold">需要浏览的网站：</span>
                            </div>
                            <ul className="list-disc list-inside ml-2 space-y-1 text-blue-700 dark:text-blue-300">
                                {plan.websites.map((url, idx) => (
                                    <li key={idx}>
                                        <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline hover:text-blue-900 dark:hover:text-blue-100"
                                        >
                                            {url}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {plan.steps.length > 0 && (
                        <div>
                            <div className="font-semibold mb-2 text-blue-800 dark:text-blue-200">执行步骤：</div>
                            <ol className="list-decimal list-inside ml-2 space-y-1 text-blue-700 dark:text-blue-300">
                                {plan.steps.map((step, idx) => (
                                    <li key={idx}>{step}</li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {plan.documents.length === 0 && plan.websites.length === 0 && plan.steps.length === 0 && (
                        <div className="text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                            {plan.rawText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

