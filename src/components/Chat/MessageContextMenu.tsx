import React, { useEffect, useRef } from 'react';
import {
    ClipboardDocumentIcon,
    ArrowPathIcon,
    BookmarkIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { ChatMessage } from '../../stores/chatStore';
import { useReferenceStore } from '../../stores/referenceStore';
import { ReferenceType, TextReference } from '../../types/reference';

interface MessageContextMenuProps {
    message: ChatMessage;
    position: { x: number; y: number };
    onClose: () => void;
    onCopy?: () => void;
    onRegenerate?: () => void;
    onDelete?: () => void;
    tabId: string;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
    message,
    position,
    onClose,
    onCopy,
    onRegenerate,
    onDelete,
    tabId,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const { addReference } = useReferenceStore();

    // 关闭菜单当点击外部或按 Esc 键
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // 确保菜单位置在视口内
    useEffect(() => {
        if (!menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let { x, y } = position;

        // 水平方向调整
        if (x + rect.width > viewportWidth) {
            x = viewportWidth - rect.width - 10;
        }
        if (x < 0) {
            x = 10;
        }

        // 垂直方向调整
        if (y + rect.height > viewportHeight) {
            y = viewportHeight - rect.height - 10;
        }
        if (y < 0) {
            y = 10;
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }, [position]);

    const handleCopy = () => {
        if (onCopy) {
            onCopy();
        } else {
            navigator.clipboard.writeText(message.content).catch(console.error);
        }
        onClose();
    };

    const handleRegenerate = () => {
        if (onRegenerate) {
            onRegenerate();
        }
        onClose();
    };

    const handleReference = () => {
        // 添加文本引用（addReference 会自动生成 id 和 createdAt）
        const textRef: TextReference = {
            id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: ReferenceType.TEXT,
            content: message.content,
            sourceFile: undefined,
            createdAt: Date.now(),
        };

        addReference(tabId, textRef);
        onClose();
    };

    const handleDelete = () => {
        if (confirm('确定要删除这条消息吗？')) {
            if (onDelete) {
                onDelete();
            }
        }
        onClose();
    };

    const menuItems = [
        {
            label: '复制',
            icon: ClipboardDocumentIcon,
            action: handleCopy,
            show: true,
        },
        {
            label: '重新生成',
            icon: ArrowPathIcon,
            action: handleRegenerate,
            show: message.role === 'assistant' && !message.isLoading,
        },
        {
            label: '引用此段',
            icon: BookmarkIcon,
            action: handleReference,
            show: message.content && message.content.trim().length > 0,
        },
        {
            label: '删除',
            icon: TrashIcon,
            action: handleDelete,
            show: true,
            danger: true,
        },
    ].filter(item => item.show);

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: position.x, top: position.y }}
        >
            {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.label}
                        onClick={item.action}
                        className={`
                            w-full px-4 py-2 text-sm text-left flex items-center gap-2
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            transition-colors
                            ${item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}
                        `}
                    >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

