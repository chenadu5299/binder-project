import { Editor } from '@tiptap/react';

/**
 * 获取编辑器中的位置坐标
 * 
 * @param editor TipTap 编辑器实例
 * @param position 文档位置（字符偏移）
 * @returns 相对于视口的坐标，如果无法获取则返回 null
 */
export function getEditorPosition(editor: Editor | null, position: number): { x: number; y: number } | null {
  if (!editor) {
    return null;
  }

  try {
    // 获取位置对应的坐标（相对于视口）
    const coords = editor.view.coordsAtPos(position);
    
    return {
      x: coords.left,
      y: coords.top,
    };
  } catch (error) {
    console.error('[编辑器位置] 获取坐标失败:', error);
    return null;
  }
}

/**
 * 获取编辑器选中区域的坐标
 * 
 * @param editor TipTap 编辑器实例
 * @returns 选中区域的坐标信息，如果无法获取则返回 null
 */
export function getEditorSelectionPosition(editor: Editor | null): {
  start: { x: number; y: number };
  end: { x: number; y: number };
  center: { x: number; y: number };
} | null {
  if (!editor) {
    return null;
  }

  try {
    const { from, to } = editor.state.selection;
    
    const startCoords = editor.view.coordsAtPos(from);
    const endCoords = editor.view.coordsAtPos(to);
    
    return {
      start: {
        x: startCoords.left,
        y: startCoords.top,
      },
      end: {
        x: endCoords.right,
        y: endCoords.bottom,
      },
      center: {
        x: (startCoords.left + endCoords.right) / 2,
        y: (startCoords.top + endCoords.bottom) / 2,
      },
    };
  } catch (error) {
    console.error('[编辑器位置] 获取选中区域坐标失败:', error);
    return null;
  }
}

/**
 * 调整位置以确保不超出视口
 * 
 * @param position 原始位置（相对于视口）
 * @param elementWidth 元素宽度
 * @param elementHeight 元素高度
 * @param margin 边距（默认10px）
 * @returns 调整后的位置
 */
export function adjustPositionToViewport(
  position: { x: number; y: number },
  elementWidth: number,
  elementHeight: number,
  margin: number = 10
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = position.x;
  let adjustedY = position.y + 20; // 默认在位置下方20px

  // 检查右边界
  if (adjustedX + elementWidth > viewportWidth - margin) {
    adjustedX = viewportWidth - elementWidth - margin;
  }

  // 检查左边界
  if (adjustedX < margin) {
    adjustedX = margin;
  }

  // 检查下边界（如果下方空间不足，显示在上方）
  if (adjustedY + elementHeight > viewportHeight - margin) {
    adjustedY = position.y - elementHeight - 10;
  }

  // 检查上边界
  if (adjustedY < margin) {
    adjustedY = margin;
  }

  return { x: adjustedX, y: adjustedY };
}

