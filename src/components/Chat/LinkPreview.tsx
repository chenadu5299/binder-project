import React from 'react';
import { LinkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { LinkReference } from '../../types/reference';

interface LinkPreviewProps {
    linkRef: LinkReference;
    onRemove?: () => void;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ linkRef, onRemove }) => {

    const handleOpenLink = () => {
        window.open(linkRef.url, '_blank', 'noopener,noreferrer');
    };

    const domain = (() => {
        try {
            const url = new URL(linkRef.url);
            return url.hostname;
        } catch {
            return linkRef.url;
        }
    })();

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <div className="flex items-start gap-3">
                {/* 链接图标 */}
                <div className="flex-shrink-0 mt-1">
                    <LinkIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </div>

                {/* 链接信息 */}
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {domain}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-500 truncate">
                        {linkRef.url}
                    </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                        onClick={handleOpenLink}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="在新标签页中打开"
                    >
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </button>
                    {onRemove && (
                        <button
                            onClick={onRemove}
                            className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="移除引用"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

