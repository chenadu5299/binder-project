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
                // 获取选中区域（如果有选中文本，使用选中区域的结束位置；否则使用光标位置）
                const { from, to } = editor.state.selection;
                const hasSelection = from !== to;
                
                // 如果有选中文本，使用选中区域的中心位置；否则使用光标位置
                const positionForCoords = hasSelection ? (from + to) / 2 : from;
                const coords = editor.view.coordsAtPos(positionForCoords);
                
                // 获取编辑器 DOM 元素
                const editorElement = editor.view.dom;
                const editorRect = editorElement.getBoundingClientRect();
                
                // 获取对话框容器的父容器（应该是 relative 定位的容器）
                const parentContainer = containerRef.current?.parentElement;
                if (!parentContainer) return;
                
                const parentRect = parentContainer.getBoundingClientRect();
                
                const containerRect = containerRef.current?.getBoundingClientRect();
                if (!containerRect) return;

                // 动态获取对话框的实际宽度和高度
                const dialogWidth = containerRect.width;
                const dialogHeight = containerRect.height;

                // 计算选中位置相对于父容器的坐标
                // coords 是相对于视口的，需要转换为相对于父容器的
                const relativeTop = coords.top - parentRect.top;
                const relativeLeft = coords.left - parentRect.left;

                // 父容器的可视区域尺寸
                const containerViewportWidth = parentRect.width;
                const containerViewportHeight = parentRect.height;

                // 计算可用空间
                const spaceBelow = containerViewportHeight - relativeTop;
                const spaceAbove = relativeTop;
                const spaceRight = containerViewportWidth - relativeLeft;
                const spaceLeft = relativeLeft;

                // ========== 垂直定位 ==========
                let top: number;
                
                // 优先显示在下方
                if (spaceBelow >= dialogHeight + EDGE_MARGIN) {
                    // 下方空间充足，显示在下方
                    top = relativeTop + 30; // 选中文本下方 30px
                } else if (spaceAbove >= dialogHeight + EDGE_MARGIN) {
                    // 下方空间不足，但上方空间充足，显示在上方
                    top = relativeTop - dialogHeight - 10;
                } else {
                    // 上下空间都不足，选择空间更大的一侧，并确保不超出边界
                    if (spaceAbove > spaceBelow) {
                        // 上方空间更大，显示在上方，但确保不超出上边界
                        top = Math.max(EDGE_MARGIN, relativeTop - dialogHeight - 10);
                    } else {
                        // 下方空间更大，显示在下方，但确保不超出下边界
                        top = Math.min(
                            containerViewportHeight - dialogHeight - EDGE_MARGIN,
                            relativeTop + 30
                        );
                    }
                }

                // 最终边界检查：确保不超出上下边界
                if (top < EDGE_MARGIN) {
                    top = EDGE_MARGIN;
                }
                if (top + dialogHeight > containerViewportHeight - EDGE_MARGIN) {
                    top = Math.max(EDGE_MARGIN, containerViewportHeight - dialogHeight - EDGE_MARGIN);
                }

                // ========== 水平定位 ==========
                let left: number;
                
                // 优先尝试以选中文本为中心
                const centerLeft = relativeLeft - dialogWidth / 2;
                
                // 检查左右空间
                if (centerLeft >= EDGE_MARGIN && centerLeft + dialogWidth <= containerViewportWidth - EDGE_MARGIN) {
                    // 居中显示不超出边界，使用居中位置
                    left = centerLeft;
                } else {
                    // 居中会超出边界，需要调整
                    if (centerLeft < EDGE_MARGIN) {
                        // 左侧超出，向右对齐到左边界
                        left = EDGE_MARGIN;
                    } else {
                        // 右侧超出，向左对齐到右边界
                        left = containerViewportWidth - dialogWidth - EDGE_MARGIN;
                    }
                    
                    // 如果对话框太宽，即使对齐到边界也会超出，则强制居中并限制宽度
                    if (left + dialogWidth > containerViewportWidth - EDGE_MARGIN) {
                        left = Math.max(EDGE_MARGIN, (containerViewportWidth - dialogWidth) / 2);
                    }
                    if (left < EDGE_MARGIN) {
                        left = EDGE_MARGIN;
                    }
                }

                // 最终边界检查：确保不超出左右边界
                if (left < EDGE_MARGIN) {
                    left = EDGE_MARGIN;
                }
                if (left + dialogWidth > containerViewportWidth - EDGE_MARGIN) {
                    left = containerViewportWidth - dialogWidth - EDGE_MARGIN;
                    // 如果对话框太宽，至少保证左边界对齐
                    if (left < EDGE_MARGIN) {
                        left = EDGE_MARGIN;
                    }
                }

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
