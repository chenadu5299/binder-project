import React, { useState, useEffect, useRef } from 'react';

interface InputDialogProps {
  title: string;
  message: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const InputDialog: React.FC<InputDialogProps> = ({
  title,
  message,
  defaultValue = '',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 自动聚焦输入框
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[InputDialog] handleSubmit 被调用:', { value, trimmed: value.trim(), onConfirm: typeof onConfirm });
    if (value.trim()) {
      console.log('[InputDialog] 调用 onConfirm:', value.trim(), 'onConfirm 类型:', typeof onConfirm, 'onConfirm:', onConfirm);
      try {
        const result = onConfirm(value.trim());
        console.log('[InputDialog] ✅ onConfirm 调用完成，返回值:', result);
        // 如果返回 Promise，等待完成
        if (result && typeof result.then === 'function') {
          result.then(() => {
            console.log('[InputDialog] ✅ onConfirm Promise 完成');
          }).catch((error: any) => {
            console.error('[InputDialog] ❌ onConfirm Promise 失败:', error);
          });
        }
      } catch (error) {
        console.error('[InputDialog] ❌ onConfirm 调用失败:', error);
      }
    } else {
      console.warn('[InputDialog] 值为空，不调用 onConfirm');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{message}</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="请输入名称"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InputDialog;

