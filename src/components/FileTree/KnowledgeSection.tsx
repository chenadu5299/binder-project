import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, ShieldCheckIcon, TrashIcon } from '@heroicons/react/24/outline';
import { knowledgeService } from '../../services/knowledge/knowledgeService';
import { useFileStore } from '../../stores/fileStore';
import { toast } from '../Common/Toast';
import type {
  KnowledgeAccessPolicy,
  KnowledgeAssetKind,
  KnowledgeEntryListItem,
  KnowledgeSourceStatus,
  KnowledgeSyncMode,
  KnowledgeVerificationStatus,
  KnowledgeVisibilityScope,
} from '../../types/knowledge';

interface KnowledgeSectionProps {
  isExpanded: boolean;
}

function verificationLabel(status: KnowledgeVerificationStatus): string {
  switch (status) {
    case 'verified':
      return '已验证';
    case 'needs_review':
      return '待复核';
    default:
      return '未验证';
  }
}

function assetKindLabel(assetKind: KnowledgeAssetKind): string {
  return assetKind === 'structure_asset' ? '结构参考' : '普通知识';
}

function citationLabel(status?: string | null): string {
  switch (status) {
    case 'superseded':
      return '旧版本';
    case 'deleted':
      return '已删除';
    case 'unavailable':
      return '不可用';
    default:
      return '当前版本';
  }
}

function policyLabel(policy: KnowledgeAccessPolicy): string {
  switch (policy) {
    case 'blocked':
      return '阻断自动消费';
    case 'explicit_only':
      return '仅显式引用';
    default:
      return '工作区自动可用';
  }
}

function syncLabel(syncMode: KnowledgeSyncMode): string {
  switch (syncMode) {
    case 'none':
      return 'none';
    case 'follow_source':
      return 'follow';
    case 'external_scheduled':
      return 'scheduled';
    default:
      return 'snapshot';
  }
}

function visibilityLabel(scope: KnowledgeVisibilityScope): string {
  return scope === 'explicit_only' ? '仅显式可见' : '工作区可见';
}

function sourceStatusLabel(status: KnowledgeSourceStatus): string {
  switch (status) {
    case 'missing':
      return '源文件失配';
    case 'unreadable':
      return '源文件不可读';
    default:
      return '源文件正常';
  }
}

function deriveRiskFlags(item: KnowledgeEntryListItem): string[] {
  const flags: string[] = [];
  if (item.entry.verificationStatus === 'needs_review') {
    flags.push('verification_needs_review');
  } else if (item.entry.verificationStatus === 'unverified') {
    flags.push('verification_unverified');
  }
  if (item.entry.accessPolicy === 'explicit_only') {
    flags.push('access_explicit_only');
  } else if (item.entry.accessPolicy === 'blocked') {
    flags.push('access_blocked');
  }
  if (item.citation?.status === 'superseded') {
    flags.push('citation_superseded');
  } else if (item.citation?.status === 'deleted') {
    flags.push('citation_deleted');
  } else if (item.citation?.status === 'unavailable') {
    flags.push('citation_unavailable');
  }
  if (item.entry.sourceStatus === 'missing') {
    flags.push('source_missing');
  } else if (item.entry.sourceStatus === 'unreadable') {
    flags.push('source_unreadable');
  }
  return flags;
}

const badgeClassName =
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium';

const KnowledgeSection: React.FC<KnowledgeSectionProps> = ({ isExpanded }) => {
  const { currentWorkspace } = useFileStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<KnowledgeEntryListItem[]>([]);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null);
  const [knowledgeBaseName, setKnowledgeBaseName] = useState('Binder Knowledge Base');
  const [knowledgeBaseDescription, setKnowledgeBaseDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    if (!isExpanded || !currentWorkspace) {
      setItems([]);
      setKnowledgeBaseId(null);
      setKnowledgeBaseDescription(null);
      setLoadFailed(false);
      return;
    }

    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await knowledgeService.listEntries(currentWorkspace, {
        query: searchQuery.trim() || null,
        limit: 50,
      });
      setKnowledgeBaseId(response.knowledgeBase.id);
      setKnowledgeBaseName(response.knowledgeBase.name);
      setKnowledgeBaseDescription(response.knowledgeBase.description ?? null);
      setItems(response.items);
    } catch (error) {
      console.error('加载知识库条目失败:', error);
      setItems([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, isExpanded, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      await loadEntries();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadEntries]);

  useEffect(() => {
    const handleKnowledgeChanged = () => {
      void loadEntries();
    };

    window.addEventListener('binder-knowledge-changed', handleKnowledgeChanged);
    return () => {
      window.removeEventListener('binder-knowledge-changed', handleKnowledgeChanged);
    };
  }, [loadEntries]);

  const emptyText = useMemo(() => {
    if (!currentWorkspace) return '请先打开工作区';
    if (loading) return '正在加载知识库...';
    if (loadFailed) return '知识库加载失败';
    if (searchQuery.trim()) return '没有匹配的知识条目';
    return '暂无知识库内容';
  }, [currentWorkspace, loading, loadFailed, searchQuery]);

  const runEntryAction = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      if (!currentWorkspace) return;
      setBusyKey(key);
      try {
        await action();
        await loadEntries();
        window.dispatchEvent(new CustomEvent('binder-knowledge-changed'));
      } catch (error) {
        console.error('知识库操作失败:', error);
        toast.error(`知识库操作失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusyKey(null);
      }
    },
    [currentWorkspace, loadEntries],
  );

  if (!isExpanded) {
    return null;
  }

  const baseDragPayload = JSON.stringify({
    type: 'kb',
    kbId: knowledgeBaseId,
    entryId: null,
    documentId: null,
    entryTitle: knowledgeBaseName,
    preview: knowledgeBaseDescription,
    assetKind: 'standard',
  });

  return (
    <div className="p-3 space-y-3">
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索知识库..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>

      {knowledgeBaseId && (
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/binder-reference-kb', baseDragPayload);
            event.dataTransfer.setData('text/plain', `@${knowledgeBaseName}`);
            event.dataTransfer.effectAllowed = 'copy';
          }}
          className="w-full rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-3 text-left dark:border-blue-900/70 dark:bg-blue-950/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                {knowledgeBaseName}
              </div>
              <div className="mt-1 text-xs text-blue-700 dark:text-blue-300 line-clamp-2">
                {knowledgeBaseDescription || '拖拽后将以整个知识库范围创建显式引用'}
              </div>
            </div>
            <span className={`${badgeClassName} bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200`}>
              @知识库
            </span>
          </div>
        </button>
      )}

      {items.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
          {emptyText}
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            拖拽条目到聊天输入框即可创建显式知识引用
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isStructureAsset = item.entry.assetKind === 'structure_asset';
            const previewText = isStructureAsset
              ? item.structureMetadata?.sectionOutlineSummary || item.preview || item.entry.sourceRef || '结构参考摘要'
              : item.preview || item.entry.sourceRef || '无预览内容';
            const dragPayload = JSON.stringify({
              type: 'kb',
              kbId: knowledgeBaseId,
              entryId: item.entry.id,
              documentId: item.activeDocumentId ?? null,
              entryTitle: item.entry.title,
              preview: previewText,
              assetKind: item.entry.assetKind,
            });
            const risks = deriveRiskFlags(item);
            const isBusy = busyKey?.startsWith(item.entry.id) ?? false;
            const canRefreshFromSource =
              item.entry.sourceType === 'workspace_snapshot' &&
              !!item.entry.sourceRef &&
              item.entry.sourceStatus === 'ready' &&
              item.entry.deletionStatus !== 'deleted';
            const hasSourceMismatch =
              item.entry.sourceType === 'workspace_snapshot' &&
              item.entry.sourceStatus !== 'ready';

            return (
              <div
                key={item.entry.id}
                className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/binder-reference-kb', dragPayload);
                    event.dataTransfer.setData('text/plain', `@${item.entry.title}`);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {item.entry.title}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {previewText}
                      </div>
                    </div>
                    <span className={`${badgeClassName} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`}>
                      {isStructureAsset ? '拖拽结构参考' : '拖拽引用'}
                    </span>
                  </div>
                </button>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`${badgeClassName} ${isStructureAsset ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'}`}>
                    {assetKindLabel(item.entry.assetKind)}
                  </span>
                  <span className={`${badgeClassName} bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300`}>
                    {verificationLabel(item.entry.verificationStatus)}
                  </span>
                  {!isStructureAsset && (
                    <span className={`${badgeClassName} bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`}>
                      {citationLabel(item.citation?.status)}
                    </span>
                  )}
                  <span className={`${badgeClassName} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`}>
                    {policyLabel(item.entry.accessPolicy)}
                  </span>
                  <span className={`${badgeClassName} bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300`}>
                    {visibilityLabel(item.entry.visibilityScope)}
                  </span>
                  <span className={`${badgeClassName} bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200`}>
                    sync:{syncLabel(item.entry.syncMode)}
                  </span>
                  {item.entry.sourceType === 'workspace_snapshot' && (
                    <span
                      className={`${badgeClassName} ${
                        item.entry.sourceStatus === 'ready'
                          ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                      }`}
                    >
                      {sourceStatusLabel(item.entry.sourceStatus)}
                    </span>
                  )}
                </div>

                {risks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {risks.map((flag) => (
                      <span
                        key={flag}
                        className={`${badgeClassName} bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300`}
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                {hasSourceMismatch && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
                    <div className="font-medium">workspace snapshot 源文件已失配</div>
                    <div className="mt-1 break-all">
                      {item.entry.sourceStatusMessage || item.entry.sourceRef || '源路径不可用'}
                    </div>
                    <div className="mt-2">
                      你可以从新路径替换版本，或者直接清理这个条目。当前仍保持 snapshot 语义，不会自动同步。
                    </div>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    验证状态
                    <select
                      value={item.entry.verificationStatus}
                      disabled={isBusy}
                      onChange={(e) =>
                        runEntryAction(`${item.entry.id}:verification`, () =>
                          knowledgeService.updateVerification(currentWorkspace!, {
                            entryId: item.entry.id,
                            verificationStatus: e.target.value as KnowledgeVerificationStatus,
                          }),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="unverified">unverified</option>
                      <option value="verified">verified</option>
                      <option value="needs_review">needs_review</option>
                    </select>
                  </label>

                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    自动消费策略
                    <select
                      value={item.entry.accessPolicy}
                      disabled={isBusy}
                      onChange={(e) =>
                        runEntryAction(`${item.entry.id}:policy`, () =>
                          knowledgeService.updateEntryPolicy(currentWorkspace!, {
                            entryId: item.entry.id,
                            accessPolicy: e.target.value as KnowledgeAccessPolicy,
                          }),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="workspace_auto">workspace_auto</option>
                      <option value="explicit_only">explicit_only</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </label>

                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    可见性
                    <select
                      value={item.entry.visibilityScope}
                      disabled={isBusy}
                      onChange={(e) =>
                        runEntryAction(`${item.entry.id}:visibility`, () =>
                          knowledgeService.updateEntryPolicy(currentWorkspace!, {
                            entryId: item.entry.id,
                            visibilityScope: e.target.value as KnowledgeVisibilityScope,
                          }),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="workspace">workspace</option>
                      <option value="explicit_only">explicit_only</option>
                    </select>
                  </label>

                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    sync_mode
                    <select
                      value={item.entry.syncMode}
                      disabled={isBusy}
                      onChange={(e) =>
                        runEntryAction(`${item.entry.id}:sync`, () =>
                          knowledgeService.updateEntryPolicy(currentWorkspace!, {
                            entryId: item.entry.id,
                            syncMode: e.target.value as KnowledgeSyncMode,
                          }),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="snapshot">snapshot</option>
                      <option value="none">none</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {hasSourceMismatch && (
                    <button
                      type="button"
                      disabled={isBusy || !currentWorkspace}
                      onClick={() => {
                        const nextSourcePath = window.prompt(
                          '请输入新的 workspace 相对路径，用它替换当前知识版本',
                          item.entry.sourceRef ?? '',
                        );
                        if (!nextSourcePath || !nextSourcePath.trim()) {
                          return;
                        }
                        void runEntryAction(`${item.entry.id}:replace-new-source`, () =>
                          knowledgeService.replaceDocument(currentWorkspace!, {
                            entryId: item.entry.id,
                            sourcePath: nextSourcePath.trim(),
                            sourceRef: nextSourcePath.trim(),
                          }),
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" />
                      从新路径替换
                    </button>
                  )}
                  {canRefreshFromSource && (
                    <button
                      type="button"
                      disabled={isBusy || !currentWorkspace}
                      onClick={() =>
                        runEntryAction(`${item.entry.id}:replace-source`, () =>
                          knowledgeService.replaceDocument(currentWorkspace!, {
                            entryId: item.entry.id,
                            sourcePath: item.entry.sourceRef ?? null,
                            sourceRef: item.entry.sourceRef ?? null,
                          }),
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" />
                      从源文件替换
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isBusy || !currentWorkspace}
                    onClick={() =>
                      runEntryAction(`${item.entry.id}:rebuild`, () =>
                        knowledgeService.rebuildEntry(currentWorkspace!, {
                          entryId: item.entry.id,
                          documentId: item.activeDocumentId ?? null,
                        }),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    rebuild
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !currentWorkspace}
                    onClick={() =>
                      runEntryAction(`${item.entry.id}:retry`, () =>
                        knowledgeService.retryEntry(currentWorkspace!, {
                          entryId: item.entry.id,
                        }),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                    retry
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !currentWorkspace}
                    onClick={() => {
                      if (!confirm(`确定删除知识条目 "${item.entry.title}" 吗？`)) {
                        return;
                      }
                      void runEntryAction(`${item.entry.id}:delete`, () =>
                        knowledgeService.deleteEntry(currentWorkspace!, {
                          entryId: item.entry.id,
                        }),
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    delete
                  </button>
                  {isBusy && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      正在更新...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KnowledgeSection;
