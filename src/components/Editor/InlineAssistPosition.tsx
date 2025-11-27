import React, { useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';

interface InlineAssistPositionProps {
    editor: Editor | null;
    children: React.ReactNode;
}

/**
 * 智能定位 Inline Assist 对话框，确保不会被编辑器边界遮挡
 */
export const InlineAssistPosition: React.FC<InlineAssistPositionProps> = ({ editor, children }) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!editor || !containerRef.current) return;

        const updatePosition = () => {
            try {
                const { from } = editor.state.selection;
                const coords = editor.view.coordsAtPos(from);
                const editorElement = editor.view.dom;
                const editorRect = editorElement.getBoundingClientRect();
                const containerRect = containerRef.current?.getBoundingClientRect();
                
                if (!containerRect) return;

                // ⚠️ 关键修复：动态获取对话框的实际宽度和高度
                const dialogWidth = containerRect.width || 500; // 使用实际宽度
                const dialogHeight = containerRect.height || 100; // 使用实际高度

                // 选中文本的位置（相对于编辑器）
                const relativeTop = coords.top - editorRect.top;
                const relativeLeft = coords.left - editorRect.left;

                // 计算最佳位置
                let top = relativeTop + 30; // 默认在选中文本下方 30px
                let left = relativeLeft;

                // 如果下方空间不足（考虑对话框的实际高度），显示在上方
                const spaceBelow = editorRect.height - relativeTop;
                const spaceAbove = relativeTop;
                
                if (spaceBelow < dialogHeight + 50) {
                    // 下方空间不足，尝试显示在上方
                    if (spaceAbove > dialogHeight + 50) {
                        top = relativeTop - dialogHeight - 10;
                    } else {
                        // 上下空间都不足，选择空间更大的一侧
                        if (spaceAbove > spaceBelow) {
                            top = Math.max(10, relativeTop - dialogHeight - 10);
                        } else {
                            top = Math.min(editorRect.height - dialogHeight - 10, relativeTop + 30);
                        }
                    }
                }

                // ⚠️ 关键修复：智能计算左右位置，确保不被遮挡
                // 优先尝试以选中文本为中心
                left = relativeLeft - dialogWidth / 2;
                
                // 如果左侧超出边界，向右调整
                if (left < 10) {
                    left = 10;
                }
                
                // 如果右侧超出边界，向左调整
                if (left + dialogWidth > editorRect.width - 10) {
                    left = editorRect.width - dialogWidth - 10;
                }
                
                // 如果调整后左侧还是超出，说明对话框太宽，居中显示
                if (left < 10) {
                    left = (editorRect.width - dialogWidth) / 2;
                    // 确保居中后不超出边界
                    if (left < 10) left = 10;
                    if (left + dialogWidth > editorRect.width - 10) {
                        left = editorRect.width - dialogWidth - 10;
                    }
                }

                // 确保不超出上边界
                if (top < 10) {
                    top = 10;
                }

                // 确保不超出下边界（使用实际高度）
                if (top + dialogHeight > editorRect.height - 10) {
                    top = Math.max(10, editorRect.height - dialogHeight - 10);
                }

                setPosition({ top, left });
            } catch (error) {
                console.error('计算位置失败:', error);
                // 回退到居中位置
                setPosition({ top: 20, left: 0 });
            }
        };

        // 初始定位
        updatePosition();

        // 使用 ResizeObserver 监听对话框内容高度变化
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(updatePosition);
        });
        
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        // 监听滚动和窗口大小变化
        const handleUpdate = () => {
            requestAnimationFrame(updatePosition);
        };

        editor.view.dom.addEventListener('scroll', handleUpdate, { passive: true });
        window.addEventListener('resize', handleUpdate);

        return () => {
            resizeObserver.disconnect();
            editor.view.dom.removeEventListener('scroll', handleUpdate);
            window.removeEventListener('resize', handleUpdate);
        };
    }, [editor]);

    return (
        <div
            ref={containerRef}
            className="absolute z-50"
            style={{
                top: `${position.top}px`,
                left: position.left === 0 ? '50%' : `${position.left}px`,
                transform: position.left === 0 ? 'translateX(-50%)' : 'none',
            }}
        >
            {children}
        </div>
    );
};

