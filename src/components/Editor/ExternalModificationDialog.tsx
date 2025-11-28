import React from 'react';
import Modal from '../Common/Modal';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ExternalModificationDialogProps {
  filePath: string;
  onContinueOverwrite: () => void;
  onLoadChanges: () => void;
  onCompare?: () => void;
  onCancel?: () => void;
}

const ExternalModificationDialog: React.FC<ExternalModificationDialogProps> = ({
  filePath,
  onContinueOverwrite,
  onLoadChanges,
  onCompare,
  onCancel,
}) => {
  const fileName = filePath.split('/').pop() || filePath;

  return (
    <Modal isOpen={true} onClose={onCancel || (() => {})}>
      <div className="p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            文件已被外部修改
          </h3>
        </div>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          文件 <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{fileName}</span> 已被外部程序修改。
        </p>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          请选择操作：
        </p>
        
        <div className="flex flex-col gap-2">
          <button
            onClick={onContinueOverwrite}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            继续覆盖（保持当前编辑内容）
          </button>
          
          <button
            onClick={onLoadChanges}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            加载更改（放弃当前编辑，加载外部修改）
          </button>
          
          {onCompare && (
            <button
              onClick={onCompare}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              比较差异（查看具体差异）
            </button>
          )}
          
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ExternalModificationDialog;

