import React from 'react';
import { XMarkIcon, DocumentIcon, PhotoIcon, LinkIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import { Reference, ReferenceType, TextReference, FileReference, ImageReference, MemoryReference, LinkReference, FolderReference, ChatReference } from '../../types/reference';
import { CollapsibleReference } from './CollapsibleReference';
import { LinkPreview } from './LinkPreview';

interface ReferenceTagsProps {
    references: Reference[];
    onRemove: (refId: string) => void;
}

export const ReferenceTags: React.FC<ReferenceTagsProps> = ({ references, onRemove }) => {
    if (references.length === 0) return null;
    
    const getIcon = (type: ReferenceType) => {
        switch (type) {
            case ReferenceType.FILE:
                return <DocumentIcon className="w-4 h-4" />;
            case ReferenceType.IMAGE:
                return <PhotoIcon className="w-4 h-4" />;
            case ReferenceType.LINK:
                return <LinkIcon className="w-4 h-4" />;
            case ReferenceType.MEMORY:
                return <BookOpenIcon className="w-4 h-4" />;
            default:
                return null;
        }
    };
    
    const getLabel = (ref: Reference): string => {
        switch (ref.type) {
            case ReferenceType.TEXT: {
                const textRef = ref as TextReference;
                // 显示位置信息而非完整内容
                if (textRef.displayText) {
                    return textRef.displayText;
                }
                return `${textRef.fileName || '未知文件'} (行 ${textRef.lineRange?.start || 0}-${textRef.lineRange?.end || 0})`;
            }
            case ReferenceType.FILE: {
                const fileRef = ref as FileReference;
                return fileRef.name;
            }
            case ReferenceType.FOLDER: {
                const folderRef = ref as import('../../types/reference').FolderReference;
                return `${folderRef.name} (${folderRef.fileCount || 0} 个文件)`;
            }
            case ReferenceType.IMAGE: {
                const imageRef = ref as ImageReference;
                return imageRef.name;
            }
            case ReferenceType.MEMORY: {
                const memoryRef = ref as MemoryReference;
                return `${memoryRef.name} (${memoryRef.itemCount || 0} 项)`;
            }
            case ReferenceType.CHAT: {
                const chatRef = ref as import('../../types/reference').ChatReference;
                return `${chatRef.chatTabTitle} (消息 ${chatRef.messageRange?.start || 0}-${chatRef.messageRange?.end || 0})`;
            }
            case ReferenceType.LINK: {
                const linkRef = ref as LinkReference;
                return linkRef.title || linkRef.url.substring(0, 30) + (linkRef.url.length > 30 ? '...' : '');
            }
            default:
                return '引用';
        }
    };
    
    // 分离链接引用和其他引用
    const linkRefs = references.filter(ref => ref.type === ReferenceType.LINK);
    const otherRefs = references.filter(ref => ref.type !== ReferenceType.LINK);

    return (
        <div className="space-y-2 mb-2">
            {/* 链接引用显示为预览卡片 */}
            {linkRefs.map((ref) => (
                <LinkPreview
                    key={ref.id}
                    linkRef={ref as LinkReference}
                    onRemove={() => onRemove(ref.id)}
                />
            ))}

            {/* 其他引用显示为标签 */}
            {otherRefs.map((ref) => (
                <div
                    key={ref.id}
                    className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                    <div className="flex items-center gap-2 mb-1">
                        {getIcon(ref.type)}
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                            {getLabel(ref)}
                        </span>
                        {ref.type === ReferenceType.TEXT && (ref as TextReference).fileName && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {(ref as TextReference).fileName}
                            </span>
                        )}
                        <button
                            onClick={() => onRemove(ref.id)}
                            className="ml-auto hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded p-0.5"
                            title="移除引用"
                        >
                            <XMarkIcon className="w-3 h-3" />
                        </button>
                    </div>
                    {/* 文本引用显示折叠内容 */}
                    {ref.type === ReferenceType.TEXT && (
                        <CollapsibleReference reference={ref} />
                    )}
                </div>
            ))}
        </div>
    );
};
