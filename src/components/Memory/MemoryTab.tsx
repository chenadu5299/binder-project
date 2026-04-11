import React, { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon, XMarkIcon, ArrowPathIcon, NoSymbolIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/chatStore';
import { memoryService, MemorySearchResult } from '../../services/memoryService';

// ── 分层配置 ────────────────────────────────────────────────────────────────

const LAYER_CONFIG: Record<string, { label: string; color: string }> = {
  tab: { label: '标签记忆', color: 'text-blue-600 dark:text-blue-400' },
  content: { label: '项目内容', color: 'text-green-600 dark:text-green-400' },
  workspace_long_term: { label: '工作区长期', color: 'text-purple-600 dark:text-purple-400' },
  user: { label: '用户偏好', color: 'text-orange-600 dark:text-orange-400' },
};

const FRESHNESS_BADGE: Record<string, { label: string; cls: string }> = {
  fresh: { label: '新鲜', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  stale: { label: '旧', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  expired: { label: '已过期', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  superseded: { label: '已超越', cls: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' },
};

// P2: 时间范围过滤选项
type TimeRange = 'all' | '7d' | '30d';
const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  all: '全部',
  '7d': '7天',
  '30d': '30天',
};

// ── 单条记忆卡片 ─────────────────────────────────────────────────────────────

const MemoryCard: React.FC<{
  result: MemorySearchResult;
  workspacePath: string;
  onExpired: (id: string) => void;
}> = ({ result, workspacePath, onExpired }) => {
  const { item } = result;
  const freshness = FRESHNESS_BADGE[item.freshnessStatus] ?? FRESHNESS_BADGE.fresh;
  const [expanded, setExpanded] = useState(false);
  const [expiring, setExpiring] = useState(false);

  const isAlreadyExpired = item.freshnessStatus === 'expired' || item.freshnessStatus === 'superseded';
  const isUserMemory = item.layer === 'user';

  const sourceName = item.sourceRef
    ? item.sourceRef.split('/').pop() ?? item.sourceRef
    : '';

  const handleExpire = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAlreadyExpired || expiring) return;
    setExpiring(true);
    try {
      await memoryService.expireMemoryItem(item.id, workspacePath);
      onExpired(item.id);
    } catch (err) {
      console.warn('[MemoryTab] expire failed:', err);
    } finally {
      setExpiring(false);
    }
  };

  return (
    <div
      className={`p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors cursor-pointer ${isAlreadyExpired ? 'opacity-50' : ''}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {item.entityType}
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {item.entityName}
            </span>
            {isUserMemory && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
                跨工作区
              </span>
            )}
          </div>
          <p className={`text-sm text-gray-600 dark:text-gray-300 mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
            {item.summary || item.content}
          </p>
          {expanded && item.summary && item.content !== item.summary && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.content}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            {!isAlreadyExpired && (
              <button
                onClick={handleExpire}
                disabled={expiring}
                title="屏蔽此记忆"
                className="p-0.5 text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
              >
                <NoSymbolIcon className="w-3 h-3" />
              </button>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${freshness.cls}`}>
              {freshness.label}
            </span>
          </div>
          {item.accessCount > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              ×{item.accessCount}
            </span>
          )}
        </div>
      </div>
      {expanded && sourceName && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 truncate">
          来源: {sourceName}
        </p>
      )}
    </div>
  );
};

// ── 分层分组 ─────────────────────────────────────────────────────────────────

const LayerGroup: React.FC<{
  layer: string;
  items: MemorySearchResult[];
  workspacePath: string;
  onExpired: (id: string) => void;
  onLayerExpired: (layer: string) => void;
}> = ({ layer, items, workspacePath, onExpired, onLayerExpired }) => {
  const [open, setOpen] = useState(true);
  const [clearing, setClearing] = useState(false);
  const cfg = LAYER_CONFIG[layer] ?? { label: layer, color: 'text-gray-500' };

  const handleClearLayer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clearing || items.length === 0) return;
    setClearing(true);
    try {
      await memoryService.expireMemoryLayer(layer, workspacePath);
      onLayerExpired(layer);
    } catch (err) {
      console.warn('[MemoryTab] expire layer failed:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 w-full mb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">({items.length})</span>
          <span className="text-gray-400 text-xs ml-auto">{open ? '▲' : '▼'}</span>
        </button>
        {/* P2: 批量清空此分组 */}
        {items.length > 0 && (
          <button
            onClick={handleClearLayer}
            disabled={clearing}
            title={`清空${cfg.label}`}
            className="p-0.5 text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 transition-colors shrink-0"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          {items.map(r => (
            <MemoryCard
              key={r.item.id}
              result={r}
              workspacePath={workspacePath}
              onExpired={onExpired}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── 主组件 ───────────────────────────────────────────────────────────────────

const MemoryTab: React.FC = () => {
  const { currentWorkspace } = useFileStore();
  const { activeTabId: activeChatTabId } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // P2: 时间范围过滤
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const activeTabId = activeChatTabId ?? undefined;

  // P2: 单项屏蔽 — 乐观移除
  const handleItemExpired = useCallback((id: string) => {
    setResults(prev => prev.filter(r => r.item.id !== id));
  }, []);

  // P2: 按 layer 批量清空 — 乐观移除整个分组
  const handleLayerExpired = useCallback((layer: string) => {
    setResults(prev => prev.filter(r => r.item.layer !== layer));
  }, []);

  const load = useCallback(async (query: string) => {
    if (!currentWorkspace) return;
    setIsLoading(true);
    setTimedOut(false);
    try {
      const resp = await memoryService.searchMemories({
        query: query || ' ',
        tabId: activeTabId,
        workspacePath: currentWorkspace,
        limit: 50,
      });
      setResults(resp.items);
      setTimedOut(resp.timedOut);
    } catch (e) {
      console.warn('[MemoryTab] search failed:', e);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, activeTabId]);

  // 初始加载 & 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => load(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, load]);

  if (!currentWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
        请先选择工作区
      </div>
    );
  }

  // P2: 时间范围过滤
  const now = Date.now() / 1000; // 秒
  const filteredResults = results.filter(r => {
    if (timeRange === 'all') return true;
    const days = timeRange === '7d' ? 7 : 30;
    const cutoff = now - days * 86400;
    return r.item.updatedAt >= cutoff;
  });

  // 按 layer 分组
  const byLayer: Record<string, MemorySearchResult[]> = {};
  const layerOrder = ['tab', 'content', 'workspace_long_term', 'user'];
  for (const r of filteredResults) {
    const l = r.item.layer;
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(r);
  }
  const sortedLayers = [
    ...layerOrder.filter(l => byLayer[l]),
    ...Object.keys(byLayer).filter(l => !layerOrder.includes(l)),
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* 标题栏 + 搜索 */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">记忆库</h3>
          <button
            onClick={() => load(searchQuery)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="刷新"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索记忆..."
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* P2: 时间范围过滤 */}
        <div className="flex gap-1">
          {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                timeRange === range
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {TIME_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && results.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
            {searchQuery
              ? '未找到匹配的记忆'
              : timeRange !== 'all'
                ? `${TIME_RANGE_LABELS[timeRange]}内无记忆`
                : '记忆库为空，对话后自动生成记忆'}
          </div>
        ) : (
          <>
            {timedOut && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">
                检索超时，显示部分结果
              </p>
            )}
            {sortedLayers.map(layer => (
              <LayerGroup
                key={layer}
                layer={layer}
                items={byLayer[layer]}
                workspacePath={currentWorkspace}
                onExpired={handleItemExpired}
                onLayerExpired={handleLayerExpired}
              />
            ))}
          </>
        )}
      </div>

      {/* 状态栏 */}
      {results.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
          <span>
            {filteredResults.length < results.length
              ? `${filteredResults.length} / ${results.length} 条`
              : `共 ${results.length} 条记忆`}
          </span>
          {timeRange !== 'all' && filteredResults.length < results.length && (
            <button
              onClick={() => setTimeRange('all')}
              className="text-blue-500 hover:text-blue-600 text-[11px]"
            >
              显示全部
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoryTab;
