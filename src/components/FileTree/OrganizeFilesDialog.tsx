import React, { useState, useEffect } from 'react';
import Modal from '../Common/Modal';
import { SparklesIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { fileService, FileClassification, FileMoveResult } from '../../services/fileService';
import { useFileStore } from '../../stores/fileStore';
import { toast } from '../Common/Toast';

interface OrganizeFilesDialogProps {
  filePaths: string[];
  onClose: () => void;
  onComplete: () => void;
}

const OrganizeFilesDialog: React.FC<OrganizeFilesDialogProps> = ({
  filePaths,
  onClose,
  onComplete,
}) => {
  const { currentWorkspace } = useFileStore();
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifications, setClassifications] = useState<FileClassification[]>([]);
  const [results, setResults] = useState<FileMoveResult[]>([]);
  const [step, setStep] = useState<'preview' | 'organizing' | 'complete'>('preview');

  // 加载分类预览
  useEffect(() => {
    const loadClassifications = async () => {
      if (!currentWorkspace || filePaths.length === 0) return;

      setIsClassifying(true);
      try {
        const classifications = await fileService.classifyFiles(filePaths, currentWorkspace);
        setClassifications(classifications);
      } catch (error) {
        console.error('分类文件失败:', error);
        toast.error(`分类文件失败: ${error instanceof Error ? error.message : String(error)}`);
        onClose();
      } finally {
        setIsClassifying(false);
      }
    };

    loadClassifications();
  }, [filePaths, currentWorkspace, onClose]);

  const handleOrganize = async () => {
    if (!currentWorkspace) return;

    setStep('organizing');

    try {
      const results = await fileService.organizeFiles(filePaths, currentWorkspace);
      setResults(results);
      setStep('complete');
    } catch (error) {
      console.error('整理文件失败:', error);
      toast.error(`整理文件失败: ${error instanceof Error ? error.message : String(error)}`);
      onClose();
    }
  };

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path;
  };

  // 按分类分组
  const groupedByCategory = classifications.reduce((acc, classification) => {
    const category = classification.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(classification);
    return acc;
  }, {} as Record<string, FileClassification[]>);

  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <SparklesIcon className="w-6 h-6 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            AI 智能分类整理
          </h3>
        </div>

        {step === 'preview' && (
          <>
            {isClassifying ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">正在分析文件内容...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  已分析 {filePaths.length} 个文件，建议分类如下：
                </p>

                <div className="space-y-4 mb-6">
                  {Object.entries(groupedByCategory).map(([category, files]) => (
                    <div
                      key={category}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    >
                      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        📁 {category} ({files.length} 个文件)
                      </div>
                      <div className="space-y-1">
                        {files.map((classification) => (
                          <div
                            key={classification.file_path}
                            className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between"
                          >
                            <span className="truncate flex-1">{getFileName(classification.file_path)}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-500 ml-2">
                              {Math.round(classification.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                      {files[0]?.reason && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                          {files[0].reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleOrganize}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    开始整理
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'organizing' && (
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">正在整理文件...</p>
          </div>
        )}

        {step === 'complete' && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  整理完成
                </h4>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {results.map((result) => (
                  <div
                    key={result.file_path}
                    className={`flex items-center gap-2 text-sm p-2 rounded ${
                      result.success
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <XCircleIcon className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{getFileName(result.file_path)}</span>
                    <span className="text-xs">{result.message}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                完成
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default OrganizeFilesDialog;

