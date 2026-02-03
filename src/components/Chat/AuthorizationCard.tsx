// 授权卡片组件

import React from 'react';
import { AuthorizationRequest } from '../../types/tool';
import { 
    ShieldCheckIcon,
    XCircleIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';

interface AuthorizationCardProps {
    request: AuthorizationRequest;
    description: string; // 自然语言描述
    onAuthorize: () => void;
    onDeny: () => void;
}

export const AuthorizationCard: React.FC<AuthorizationCardProps> = ({
    request,
    description,
    onAuthorize,
    onDeny
}) => {
    const getPermissionTypeText = () => {
        switch (request.type) {
            case 'file_system':
                return '文件系统访问（工作区外）';
            case 'network':
                return '网络访问';
            case 'system':
                return '系统权限';
            default:
                return '权限请求';
        }
    };

    return (
        <div className="border-2 border-yellow-400 dark:border-yellow-600 rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
            {/* 自然语言描述 */}
            <div className="mb-3 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {description}
            </div>

            {/* 操作缩览 */}
            <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-2">
                    <ShieldCheckIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        需要授权：{request.operation}
                    </span>
                </div>
                
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    {request.details && Object.entries(request.details).map(([key, value]) => (
                        <div key={key}>
                            <span className="font-medium">{key}:</span>{' '}
                            <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                    ))}
                    <div>
                        <span className="font-medium">权限类型:</span>{' '}
                        <span>{getPermissionTypeText()}</span>
                    </div>
                </div>
            </div>

            {/* 授权按钮 */}
            <div className="flex gap-2">
                <button
                    onClick={onAuthorize}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg 
                               flex items-center justify-center gap-2 transition-colors"
                >
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="font-medium">授权</span>
                </button>
                <button
                    onClick={onDeny}
                    className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 
                               text-gray-900 dark:text-gray-100 rounded-lg 
                               flex items-center justify-center gap-2 transition-colors"
                >
                    <XCircleIcon className="w-5 h-5" />
                    <span className="font-medium">拒绝</span>
                </button>
            </div>
        </div>
    );
};

