import React, { useState, useRef, useEffect } from 'react';

interface PanelResizerProps {
  onResize: (deltaX: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  direction: 'horizontal' | 'vertical';
  className?: string;
}

const PanelResizer: React.FC<PanelResizerProps> = ({
  onResize,
  onResizeStart,
  onResizeEnd,
  direction,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      // 计算相对于起始位置的累计变化
      const totalDelta = deltaX;
      onResize(totalDelta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (onResizeEnd) {
        onResizeEnd();
      }
    };

    // 禁用文本选择
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    if (onResizeStart) {
      onResizeStart();
    }
  };

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`
        ${isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize'}
        relative z-10 flex-shrink-0
        ${className}
      `}
      onMouseDown={handleMouseDown}
      style={{
        userSelect: 'none',
        width: isHorizontal ? '4px' : '100%',
        height: isHorizontal ? '100%' : '4px',
      }}
      role="separator"
      aria-orientation={direction}
      aria-label="调整面板大小"
    >
      {/* 可视化的拖动区域 */}
      <div
        className={`
          absolute inset-0
          bg-transparent hover:bg-blue-500 dark:hover:bg-blue-600
          transition-colors duration-150
          ${isDragging ? 'bg-blue-500 dark:bg-blue-600' : ''}
        `}
        style={{
          width: isHorizontal ? '4px' : '100%',
          height: isHorizontal ? '100%' : '4px',
        }}
      />
      {/* 扩大可点击区域 */}
      <div
        className="absolute inset-0"
        style={{
          width: isHorizontal ? '8px' : '100%',
          height: isHorizontal ? '100%' : '8px',
          marginLeft: isHorizontal ? '-2px' : '0',
          marginTop: isHorizontal ? '0' : '-2px',
        }}
      />
    </div>
  );
};

export default PanelResizer;

