/**
 * Diff 卡片：路径栏、标题栏、diff 效果区、操作按钮
 * 已接受时缩小模式：路径+标题+展开；展开后 diff 区+已接受
 * 点击标题栏可定位到文档中的 diff 位置
 */

import React, { useState } from 'react';
import { CheckIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import type { DiffEntry } from '../../stores/diffStore';
import { ExecutionPanel } from '../Debug/ExecutionPanel';

interface DiffCardProps {
  diff: DiffEntry;
  /** 文件绝对路径 */
  filePath: string;
  /** 工作区路径，用于显示相对路径 */
  workspacePath?: string | null;
  /** 修改起始行号（1-based） */
  lineStart?: number;
  /** 修改结束行号（1-based） */
  lineEnd?: number;
  onAccept: () => void;
  onReject: () => void;
  /** 点击标题栏定位：打开文件并滚动到 diff 位置 */
  onLocate?: () => void;
  disabled?: boolean;
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

const DIFF_EXPIRE_HINTS: Record<string, string> = {
  document_revision_mismatch: '文档版本与生成该建议时的快照不一致',
  document_revision_advanced: '文档已编辑，该建议基于旧版本',
  content_snapshot_mismatch: '当前文档内容与生成建议时的正文不一致（已非同一版 L）',
  block_order_snapshot_mismatch: '块 ID 顺序或结构与生成建议时不一致（结构已漂移）',
  original_text_mismatch: '当前正文与建议中的原文不一致',
  pm_range_invalid: '编辑器中的定位范围无效',
  block_resolve_failed: '无法在编辑器中解析到对应块',
  apply_replace_failed: '应用替换失败',
};

const EXECUTION_CODE_HINTS: Record<string, string> = {
  E_ROUTE_MISMATCH: '路由不匹配',
  E_TARGET_NOT_READY: '目标未就绪',
  E_RANGE_UNRESOLVABLE: '范围不可解析',
  E_ORIGINALTEXT_MISMATCH: '原文校验失败',
  E_PARTIAL_OVERLAP: '非法部分重叠',
  E_BASELINE_MISMATCH: 'baseline 不匹配',
  E_APPLY_FAILED: '应用失败',
  E_REFRESH_FAILED: '刷新失败',
  E_BLOCKTREE_NODE_MISSING: 'BlockTree 节点缺失',
  E_BLOCKTREE_STALE: 'BlockTree 过期',
  E_BLOCKTREE_BUILD_FAILED: 'BlockTree 构建失败',
};

function isExecutionDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.localStorage.getItem('binder.debug.execution_panel') === '1' ||
    window.localStorage.getItem('binder.debug.execution') === '1'
  );
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

export const DiffCard: React.FC<DiffCardProps> = ({
  diff,
  filePath,
  workspacePath = null,
  lineStart,
  lineEnd,
  onAccept,
  onReject,
  onLocate,
  disabled = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isExpired = diff.status === 'expired';
  const isAccepted = diff.status === 'accepted';
  const showExecutionDebug = isExecutionDebugEnabled();

  const relativePath = getRelativePathDisplay(filePath, workspacePath);
  const fileName = getFileName(filePath);
  const lineRangeStr =
    lineStart != null && lineEnd != null
      ? lineStart === lineEnd
        ? `第${lineStart}行`
        : `第${lineStart}-${lineEnd}行`
      : '';

  const titleText = lineRangeStr ? `${fileName} ${lineRangeStr}` : fileName;

  // diff_type 标签（§7.4）
  const diffTypeBadge =
    diff.diffType === 'block_level' ? (
      <span
        className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium"
        style={{ background: '#FEF3C7', color: '#92400E' }}
        title="精确定位失败，已替换整块"
      >
        块级替换
      </span>
    ) : diff.diffType === 'document_level' ? (
      <span
        className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium"
        style={{ background: '#DBEAFE', color: '#1E40AF' }}
      >
        全文重写
      </span>
    ) : null;

  // block_level 副文案（单独一行）
  const blockLevelHint =
    diff.diffType === 'block_level' ? (
      <div className="text-[9px] px-2 py-0.5 border-b border-gray-100 dark:border-gray-800" style={{ color: '#B45309' }}>
        精确定位失败，已替换整块
      </div>
    ) : null;

  // 路径栏：小字、紧凑
  const pathBar = (
    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate px-2 py-0.5 leading-tight">
      {relativePath}
    </div>
  );

  const sourceHint =
    diff.sourceLabel != null && diff.sourceLabel !== '' ? (
      <div className="text-[9px] text-gray-400 dark:text-gray-500 px-2 py-0.5 border-b border-gray-100 dark:border-gray-800">
        {diff.sourceLabel}
        {diff.messageId != null ? ` · ${diff.messageId.slice(-8)}` : ''}
      </div>
    ) : diff.messageId != null ? (
      <div className="text-[9px] text-gray-400 dark:text-gray-500 px-2 py-0.5 border-b border-gray-100 dark:border-gray-800">
        消息 {diff.messageId.slice(-8)}
      </div>
    ) : null;

  // 标题栏：单行，尾部截断，可点击定位
  const titleBar = (
    <div
      className={`flex items-center gap-2 px-2 py-1 text-xs font-medium border-b border-gray-100 dark:border-gray-700 ${
        onLocate ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : ''
      }`}
      onClick={onLocate}
      title={onLocate ? '点击定位到修改位置' : ''}
    >
      <span className="truncate flex-1 min-w-0">{titleText}</span>
      {diffTypeBadge}
      {isAccepted && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="flex-shrink-0 p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-400"
          title={expanded ? '收起' : '展开'}
        >
          {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );

  // Diff 效果区
  const diffArea = (
    <div className="flex flex-col gap-1.5 px-2 py-2">
      {diff.originalText && (
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: isExpired ? '#CCCCCC' : '#FCEBEB',
            color: isExpired ? '#666' : '#A32D2D',
            textDecoration: 'line-through',
          }}
        >
          {diff.originalText}
        </div>
      )}
      {diff.newText && (
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: isExpired ? '#E5E5E5' : 'rgba(34, 197, 94, 0.15)',
            color: isExpired ? '#666' : '#15803d',
          }}
        >
          {diff.newText}
        </div>
      )}
    </div>
  );

  // 操作区
  const actionArea = (
    <div className="flex items-center gap-2 px-2 pb-2">
      {!isExpired && !isAccepted && (
        <>
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
        </>
      )}
      {isAccepted && expanded && (
        <span className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default">
          <CheckIcon className="w-3.5 h-3.5" />
          已接受
        </span>
      )}
      {isExpired && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {diff.expireReason
              ? DIFF_EXPIRE_HINTS[diff.expireReason] ?? '已过期，无法应用'
              : '已过期：原文已被编辑，无法应用'}
          </span>
          {showExecutionDebug && diff.executionExposure && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 break-all">
              [{diff.executionExposure.phase}] {diff.executionExposure.code}
              {EXECUTION_CODE_HINTS[diff.executionExposure.code]
                ? ` · ${EXECUTION_CODE_HINTS[diff.executionExposure.code]}`
                : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`rounded-lg border overflow-hidden ${
          isExpired
            ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 border-l-4'
        }`}
        style={!isExpired && !isAccepted ? { borderLeftColor: '#A32D2D' } : undefined}
      >
        {pathBar}
        {sourceHint}
        {titleBar}
        {blockLevelHint}
        {/* 已接受且未展开：不显示 diff 区和操作区 */}
        {(!isAccepted || expanded) && (
          <>
            {diffArea}
            {actionArea}
          </>
        )}
      </div>
      <ExecutionPanel />
    </>
  );
};
