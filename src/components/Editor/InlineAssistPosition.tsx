import React, { useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';

interface InlineAssistPositionProps {
    editor: Editor | null;
    children: React.ReactNode;
}

/**
 * 智能定位 Inline Assist 对话框，确保不会被编辑器边界遮挡
 * 优化：
 * 1. 确保对话框始终锚定在编辑区边缘内
 * 2. 初始位置基于选中区域
 * 3. 处理内容变多的情况
 */
export const InlineAssistPosition: React.FC<InlineAssistPositionProps> = ({ editor, children }) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!editor || !containerRef.current) return;

        const EDGE_MARGIN = 16; // 边缘边距，确保对话框不贴边

        const updatePosition = () => {
            try {
                const { from, to } = editor.state.selection;
                const GAP = 12; // 窗口与光标的间距，确保不遮盖

                // 选区底部：用 to 的 coords；光标上方：用 from 的 coords
                const coordsBottom = editor.view.coordsAtPos(to);
                const coordsCursor = editor.view.coordsAtPos(from);

                const parentContainer = containerRef.current?.parentElement;
                if (!parentContainer) return;

                const parentRect = parentContainer.getBoundingClientRect();
                const containerRect = containerRef.current?.getBoundingClientRect();
                if (!containerRect) return;

                const dialogWidth = containerRect.width;
                const dialogHeight = containerRect.height;
                const containerViewportWidth = parentRect.width;
                const containerViewportHeight = parentRect.height;

                // 选区底部 / 光标相对于父容器的坐标
                const selectionBottom = coordsBottom.bottom - parentRect.top;
                const cursorTop = coordsCursor.top - parentRect.top;

                // ========== 水平定位：始终左右居中 ==========
                const left = Math.max(EDGE_MARGIN, Math.min(
                    containerViewportWidth - dialogWidth - EDGE_MARGIN,
                    (containerViewportWidth - dialogWidth) / 2
                ));

                // ========== 垂直定位：始终在选区下方；底部不足时改光标上方 ==========
                const spaceBelowSelection = containerViewportHeight - selectionBottom - EDGE_MARGIN;
                const spaceAboveCursor = cursorTop - EDGE_MARGIN;

                let top: number;
                if (spaceBelowSelection >= dialogHeight + GAP) {
                    // 选区下方空间充足：窗口在选区下方
                    top = selectionBottom + GAP;
                } else if (spaceAboveCursor >= dialogHeight + GAP) {
                    // 选区下方不足、光标上方充足：改为光标上方
                    top = cursorTop - GAP - dialogHeight;
                } else {
                    // 上下都不足：选空间更大的一侧
                    if (spaceAboveCursor >= spaceBelowSelection) {
                        top = Math.max(EDGE_MARGIN, cursorTop - GAP - dialogHeight);
                    } else {
                        top = Math.min(containerViewportHeight - dialogHeight - EDGE_MARGIN, selectionBottom + GAP);
                    }
                }

                top = Math.max(EDGE_MARGIN, Math.min(containerViewportHeight - dialogHeight - EDGE_MARGIN, top));

                setPosition({ top, left });
            } catch (error) {
                console.error('计算位置失败:', error);
                // 回退到居中位置
                const parentContainer = containerRef.current?.parentElement;
                if (parentContainer) {
                    const parentRect = parentContainer.getBoundingClientRect();
                    setPosition({ 
                        top: EDGE_MARGIN, 
                        left: Math.max(EDGE_MARGIN, (parentRect.width - 500) / 2) 
                    });
                }
            }
        };

        // 防抖更新函数
        const debouncedUpdate = () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
            updateTimeoutRef.current = setTimeout(() => {
                requestAnimationFrame(updatePosition);
            }, 10);
        };

        // 初始定位（延迟一帧，确保容器已渲染）
        requestAnimationFrame(() => {
            updatePosition();
        });

        // 使用 ResizeObserver 监听对话框内容尺寸变化
        const resizeObserver = new ResizeObserver(() => {
            debouncedUpdate();
        });
        
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        // 监听滚动和窗口大小变化
        const handleUpdate = () => {
            debouncedUpdate();
        };

        // 监听父容器的滚动
        const parentContainer = containerRef.current?.parentElement;
        if (parentContainer) {
            parentContainer.addEventListener('scroll', handleUpdate, { passive: true });
        }
        
        // 监听编辑器滚动（查找滚动容器）
        let scrollContainer: HTMLElement | null = editor.view.dom.parentElement;
        while (scrollContainer) {
            const style = window.getComputedStyle(scrollContainer);
            if (style.overflow === 'auto' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflowY === 'scroll') {
                scrollContainer.addEventListener('scroll', handleUpdate, { passive: true });
                break;
            }
            scrollContainer = scrollContainer.parentElement;
        }
        
        window.addEventListener('resize', handleUpdate);

        // 监听编辑器内容变化（内容变多时对话框可能变大）
        const handleEditorUpdate = () => {
            debouncedUpdate();
        };
        editor.on('update', handleEditorUpdate);
        editor.on('selectionUpdate', handleEditorUpdate);

        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
            resizeObserver.disconnect();
            
            // 清理父容器滚动监听
            if (parentContainer) {
                parentContainer.removeEventListener('scroll', handleUpdate);
            }
            
            // 清理滚动监听
            let cleanupScrollContainer: HTMLElement | null = editor.view.dom.parentElement;
            while (cleanupScrollContainer) {
                const style = window.getComputedStyle(cleanupScrollContainer);
                if (style.overflow === 'auto' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflowY === 'scroll') {
                    cleanupScrollContainer.removeEventListener('scroll', handleUpdate);
                    break;
                }
                cleanupScrollContainer = cleanupScrollContainer.parentElement;
            }
            
            window.removeEventListener('resize', handleUpdate);
            editor.off('update', handleEditorUpdate);
            editor.off('selectionUpdate', handleEditorUpdate);
        };
    }, [editor]);

    return (
        <div
            ref={containerRef}
            className="absolute z-50"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
            }}
        >
            {children}
        </div>
    );
};
