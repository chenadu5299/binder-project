/**
 * 辅助续写悬浮卡：展示 ai_autocomplete 返回的建议，Tab/Shift+Tab 切换，Enter 应用，Esc 关闭
 */
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';

const GAP = 8;
const RIGHT_SPACE_THRESHOLD = 320;
const BOTTOM_SPACE_THRESHOLD = 200;

function getEditorBounds(editor: Editor): { left: number; right: number; top: number; bottom: number } {
  let el: HTMLElement | null = editor.view.dom;
  while (el) {
    if (el.classList?.contains('editor-zoom-scroll')) {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
    el = el.parentElement;
  }
  const r = editor.view.dom.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}

export interface AutoCompletePopoverProps {
  suggestions: string[];
  selectedIndex: number;
  position: number | null;
  editor: Editor | null;
  onSelect: (index: number) => void;
  onApply: (index?: number) => void;
  onClose: () => void;
}

export const AutoCompletePopover: React.FC<AutoCompletePopoverProps> = ({
  suggestions,
  selectedIndex,
  position,
  editor,
  onSelect,
  onApply,
  onClose,
}) => {
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor?.view || position == null) return;

    const rect = editor.view.coordsAtPos(position);
    const bounds = getEditorBounds(editor);

    const cursorLeft = rect.left;
    const cursorTop = rect.top;
    const cursorBottom = rect.bottom;

    const spaceRight = bounds.right - cursorLeft;
    const spaceBelow = bounds.bottom - cursorBottom;

    const style: { top?: number; bottom?: number; left?: number; right?: number } = {};

    // 下方空间不足 → 改为光标上方
    if (spaceBelow < BOTTOM_SPACE_THRESHOLD) {
      style.bottom = window.innerHeight - cursorTop + GAP;
    } else {
      style.top = cursorBottom + GAP;
    }

    // 右侧空间不足 → 贴右
    if (spaceRight < RIGHT_SPACE_THRESHOLD) {
      style.right = window.innerWidth - bounds.right + GAP;
    } else {
      style.left = cursorLeft;
    }

    setCoords(style);
  }, [editor, position]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = e.shiftKey
          ? (selectedIndex - 1 + suggestions.length) % suggestions.length
          : (selectedIndex + 1) % suggestions.length;
        onSelect(next);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onApply();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [selectedIndex, suggestions.length, onSelect, onApply, onClose]);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, [onClose]);

  if (suggestions.length === 0) return null;

  const content = (
    <div
      ref={containerRef}
      className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 min-w-[200px] max-w-[400px] max-h-[240px] overflow-y-auto"
      style={{ ...coords }}
    >
      {suggestions.map((s, i) => (
        <div
          key={i}
          role="button"
          tabIndex={0}
          className={`px-4 py-2 cursor-pointer text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 ${
            i === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''
          }`}
          onClick={() => onApply(i)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply(i);
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );

  return createPortal(content, document.body);
};
