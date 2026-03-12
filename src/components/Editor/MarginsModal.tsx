import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import Modal from '../Common/Modal';

interface MarginsModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

function getCurrentMargins(editor: Editor | null): { vertical: number; horizontal: number } {
  // 优先从 PaginationPlus 扩展的 options 读取（真实边距值），其次从 DOM 的 CSS 变量读取
  const ext = editor?.extensionManager?.extensions?.find((e: { name: string }) => e.name === 'PaginationPlus');
  const opts = (ext as { options?: { marginTop?: number; marginBottom?: number; marginLeft?: number; marginRight?: number } })?.options;
  if (opts && typeof opts.marginTop === 'number' && typeof opts.marginLeft === 'number') {
    return {
      vertical: Math.round((opts.marginTop + (opts.marginBottom ?? opts.marginTop)) / 2),
      horizontal: Math.round((opts.marginLeft + (opts.marginRight ?? opts.marginLeft)) / 2),
    };
  }
  const dom = editor?.view?.dom;
  if (!dom) return { vertical: 95, horizontal: 76 };
  const s = getComputedStyle(dom);
  const top = parseInt(s.getPropertyValue('--rm-margin-top'), 10) || 95;
  const bottom = parseInt(s.getPropertyValue('--rm-margin-bottom'), 10) || 95;
  const left = parseInt(s.getPropertyValue('--rm-margin-left'), 10) || 76;
  const right = parseInt(s.getPropertyValue('--rm-margin-right'), 10) || 76;
  return {
    vertical: Math.round((top + bottom) / 2),
    horizontal: Math.round((left + right) / 2),
  };
}

const MarginsModal: React.FC<MarginsModalProps> = ({ isOpen, onClose, editor }) => {
  const current = getCurrentMargins(editor);
  const [vertical, setVertical] = useState(current.vertical);
  const [horizontal, setHorizontal] = useState(current.horizontal);

  useEffect(() => {
    if (isOpen && editor) {
      const m = getCurrentMargins(editor);
      setVertical(m.vertical);
      setHorizontal(m.horizontal);
    }
  }, [isOpen, editor]);

  const handleApply = () => {
    const v = Math.max(0, Math.min(200, Number(vertical) || 0));
    const h = Math.max(0, Math.min(200, Number(horizontal) || 0));
    editor?.chain().focus().updateMargins({ top: v, bottom: v, left: h, right: h }).run();
    editor?.view?.dispatch(editor.state.tr);
    setVertical(v);
    setHorizontal(h);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="页边距">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">设置页边距（单位：像素），上下相同、左右相同</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="margins-vertical" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">上下边距</label>
            <input
              id="margins-vertical"
              type="number"
              min={0}
              max={200}
              value={vertical}
              onChange={(e) => setVertical(Number(e.target.value) || 0)}
              title="上下边距"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>
          <div>
            <label htmlFor="margins-horizontal" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">左右边距</label>
            <input
              id="margins-horizontal"
              type="number"
              min={0}
              max={200}
              value={horizontal}
              onChange={(e) => setHorizontal(Number(e.target.value) || 0)}
              title="左右边距"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            应用
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MarginsModal;
