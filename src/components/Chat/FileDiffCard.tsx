/**
 * 用于 update_file 返回的 FileDiffEntry：未打开文件或 resolve 未完成时的逐条 diff 卡片
 * 结构与 DiffCard 一致：路径栏、标题栏、diff 区、接受/拒绝
 * 全部接受/拒绝由 DiffAllActionsBar 统一处理
 */

import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { FileDiffEntry } from '../../stores/diffStore';
import { AgentShadowStateSummary } from './AgentShadowStateSummary';
import { buildContentLabel } from '../../utils/contentLabel';

interface FileDiffCardProps {
  entry: FileDiffEntry;
  chatTabId?: string;
  filePath: string;
  workspacePath?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onLocate?: () => void;
  /** Phase C：打开文档后再次尝试 resolve */
  onRetryResolve?: () => void;
  disabled?: boolean;
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function getRelativePathDisplay(filePath: string, workspacePath: string | null): string {
  if (!workspacePath) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  const ws = workspacePath.replace(/\\/g, '/');
  if (normalized.startsWith(ws + '/')) {
    return normalized.slice(ws.length + 1);
  }
  return filePath;
}

export const FileDiffCard: React.FC<FileDiffCardProps> = ({
  entry,
  chatTabId,
  filePath,
  workspacePath = null,
  onAccept,
  onReject,
  onLocate,
  onRetryResolve,
  disabled = false,
}) => {
  const relativePath = getRelativePathDisplay(filePath, workspacePath);
  const titleText = buildContentLabel(entry.original_text || entry.new_text, getFileName(filePath));

  const pathBar = (
    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate px-2 py-0.5 leading-tight">
      {relativePath}
    </div>
  );

  const titleBar = (
    <div
      className={`flex items-center justify-between gap-2 px-2 py-1 text-xs font-medium truncate border-b border-gray-100 dark:border-gray-700 ${
        onLocate ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : ''
      }`}
      onClick={onLocate}
      title={onLocate ? '点击定位到修改位置' : ''}
    >
      <span className="truncate flex-1 min-w-0">{titleText}</span>
    </div>
  );

  const unmappedHint =
    entry.resolveUnmapped === true ? (
      <div className="px-2 py-1.5 text-[10px] leading-snug bg-amber-50 dark:bg-amber-900/25 text-amber-900 dark:text-amber-100 border-b border-amber-100 dark:border-amber-800/50">
        未能映射到编辑器中的删除线位置（段落/文本与磁盘切片不一致）。仍可「接受」直接写盘；打开文件后也可尝试重新解析。
        {onRetryResolve ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetryResolve();
            }}
            className="ml-2 text-amber-800 dark:text-amber-200 underline font-medium"
          >
            重新解析
          </button>
        ) : null}
      </div>
    ) : null;

  const diffArea = (
    <div className="flex flex-col gap-1.5 px-2 py-2">
      {entry.original_text && (
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: '#FCEBEB',
            color: '#A32D2D',
            textDecoration: 'line-through',
          }}
        >
          {entry.original_text}
        </div>
      )}
      {entry.new_text && (
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            color: '#15803d',
          }}
        >
          {entry.new_text}
        </div>
      )}
    </div>
  );

  const actionArea = (
    <div className="flex items-center gap-2 px-2 pb-2">
      <button
        onClick={onAccept}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CheckIcon className="w-3.5 h-3.5" />
        接受
      </button>
      <button
        onClick={onReject}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
        拒绝
      </button>
    </div>
  );

  return (
    <div className="rounded-lg border overflow-hidden border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 border-l-4" style={{ borderLeftColor: '#A32D2D' }}>
      {pathBar}
      {entry.messageId != null && (
        <div className="text-[9px] text-gray-400 dark:text-gray-500 px-2 py-0.5 border-b border-gray-100 dark:border-gray-700">
          来源消息 · {entry.messageId.slice(-8)}
        </div>
      )}
      {chatTabId && (
        <div className="px-2 py-1 border-b border-gray-100 dark:border-gray-700">
          <AgentShadowStateSummary chatTabId={chatTabId} compact />
        </div>
      )}
      {titleBar}
      {unmappedHint}
      {diffArea}
      {actionArea}
    </div>
  );
};
