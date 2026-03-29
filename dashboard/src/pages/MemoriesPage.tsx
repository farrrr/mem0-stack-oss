import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, List, Clock, ChevronLeft, ChevronRight,
  RefreshCw, Trash2, X, User,
} from 'lucide-react';
import { api } from '../lib/api';
import { DEFAULT_USER_ID } from '../lib/constants';
import { useDebounce } from '../hooks/useDebounce';
import { formatRelativeTime } from '../lib/utils';
import type { Memory } from '../lib/types';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import MemoryDetailSidebar from '../components/memory/MemoryDetailSidebar';
import MemoryTimelineView from '../components/memory/MemoryTimelineView';

const LIMIT = 35;
const DATE_RANGE_OPTIONS = ['all', '1d', '7d', '30d'] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

/** Count extra entities (agent_id, run_id, app_id) on a memory. */
function getEntityInfo(mem: Memory): { userId: string; extraCount: number } {
  const userId = mem.user_id || '-';
  let extraCount = 0;
  if (mem.agent_id) extraCount++;
  if (mem.run_id) extraCount++;
  if (mem.app_id) extraCount++;
  return { userId, extraCount };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function MemoriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Filters — initialize from URL params if present
  const [userId, setUserId] = useState(searchParams.get('user_id') || DEFAULT_USER_ID);
  const [agentId, _setAgentId] = useState(searchParams.get('agent_id') || '');
  const [runId, _setRunId] = useState(searchParams.get('run_id') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [dateRange, setDateRange] = useState<string>('all');
  const [searchText, setSearchText] = useState(searchParams.get('search') || '');
  const [offset, setOffset] = useState(0);

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail sidebar
  const [detailMemory, setDetailMemory] = useState<Memory | null>(null);

  // Bulk action state
  const [bulkLoading, setBulkLoading] = useState(false);

  const debouncedSearch = useDebounce(searchText, 300);

  // Taxonomy query for category dropdown
  const { data: taxonomyData } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => api.getTaxonomy(),
    staleTime: 60_000,
  });

  const categories = taxonomyData?.categories || [];

  // Build query params
  const queryParams: Record<string, string | number | undefined> = {
    limit: LIMIT,
    offset,
    user_id: userId || undefined,
    agent_id: agentId || undefined,
    run_id: runId || undefined,
    category: category || undefined,
    date_range: dateRange === 'all' ? undefined : dateRange,
    search: debouncedSearch || undefined,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['memories', queryParams],
    queryFn: () => api.getMemories(queryParams),
    staleTime: 30_000,
  });

  const memories = (data?.memories || []) as Memory[];
  const total = data?.total || 0;

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === memories.length ? new Set() : new Set(memories.map((m) => m.id))
    );
  }, [memories]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Sidebar navigation
  const detailIndex = detailMemory ? memories.findIndex((m) => m.id === detailMemory.id) : -1;
  const handlePrev = detailIndex > 0 ? () => setDetailMemory(memories[detailIndex - 1]) : undefined;
  const handleNext = detailIndex >= 0 && detailIndex < memories.length - 1
    ? () => setDetailMemory(memories[detailIndex + 1])
    : undefined;

  // Bulk actions
  const handleBulkReclassify = async () => {
    if (!window.confirm(t('memories.bulk_reclassify_confirm', { count: selected.size }))) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => api.reclassify(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        alert(t('memories.bulk_partial_failure', { failed, total: ids.length }));
      }
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(t('memories.bulk_delete_confirm', { count: selected.size }))) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => api.deleteMemory(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        alert(t('memories.bulk_partial_failure', { failed, total: ids.length }));
      }
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBulkLoading(false);
    }
  };

  // Pagination
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + LIMIT, total);
  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;

  const handleFilterChange = () => {
    setOffset(0);
    clearSelection();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t('memories.title')}
        </h1>
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{
              backgroundColor: viewMode === 'list' ? 'var(--color-bg-hover)' : 'transparent',
              color: viewMode === 'list' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
            onClick={() => setViewMode('list')}
            title={t('memories.view_list')}
          >
            <List size={18} />
          </button>
          <button
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{
              backgroundColor: viewMode === 'timeline' ? 'var(--color-bg-hover)' : 'transparent',
              color: viewMode === 'timeline' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
            onClick={() => setViewMode('timeline')}
            title={t('memories.view_timeline')}
          >
            <Clock size={18} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl"
        style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        {/* User ID */}
        <input
          type="text"
          placeholder={t('memories.filter_user_id')}
          className="px-3 py-1.5 rounded-lg text-sm w-40"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
          value={userId}
          onChange={(e) => { setUserId(e.target.value); handleFilterChange(); }}
        />

        {/* Category */}
        <select
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
          value={category}
          onChange={(e) => { setCategory(e.target.value); handleFilterChange(); }}
        >
          <option value="">{t('memories.filter_category')}</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Date range pills */}
        <div className="flex items-center gap-1">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: dateRange === opt ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                color: dateRange === opt ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${dateRange === opt ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
              onClick={() => { setDateRange(opt); handleFilterChange(); }}
            >
              {t(`memories.date_${opt}`)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            placeholder={t('memories.search_placeholder')}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); handleFilterChange(); }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{t('common.error')}</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
          </div>
        )}

        {!isLoading && !error && memories.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_results')}</p>
          </div>
        )}

        {!isLoading && !error && memories.length > 0 && viewMode === 'list' && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.size === memories.length && memories.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th
                    className="text-left text-xs font-medium px-3 py-2.5 w-28"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('requests.time')}
                  </th>
                  <th
                    className="text-left text-xs font-medium px-3 py-2.5 w-36"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('requests.entities')}
                  </th>
                  <th
                    className="text-left text-xs font-medium px-3 py-2.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('memories.memory_content')}
                  </th>
                  <th
                    className="text-left text-xs font-medium px-3 py-2.5 w-36"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('memories.categories')}
                  </th>
                  <th
                    className="text-left text-xs font-medium px-3 py-2.5 w-16"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('memories.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {memories.map((mem) => {
                  const { userId: entityUserId, extraCount } = getEntityInfo(mem);
                  const firstCategory = mem.category?.[0];
                  const extraCategories = (mem.category?.length || 0) - 1;

                  return (
                    <tr
                      key={mem.id}
                      className="transition-colors cursor-pointer"
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        backgroundColor: selected.has(mem.id) ? 'var(--color-bg-hover)' : 'var(--color-bg-primary)',
                      }}
                      onClick={() => setDetailMemory(mem)}
                      onMouseEnter={(e) => {
                        if (!selected.has(mem.id)) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected.has(mem.id)) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-primary)';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(mem.id)}
                          onChange={() => toggleSelect(mem.id)}
                          className="cursor-pointer"
                        />
                      </td>

                      {/* Time */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {mem.created_at ? formatRelativeTime(mem.created_at) : '-'}
                        </span>
                      </td>

                      {/* Entities */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <User size={12} style={{ color: 'var(--color-text-muted)' }} />
                          <span className="text-xs font-mono truncate max-w-[100px]" style={{ color: 'var(--color-text-secondary)' }}>
                            {entityUserId}
                          </span>
                          {extraCount > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                                color: 'var(--color-accent)',
                              }}
                            >
                              +{extraCount}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Memory Content */}
                      <td className="px-3 py-2.5">
                        <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                          {truncate(mem.memory, 100)}
                        </span>
                      </td>

                      {/* Categories */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {firstCategory && (
                            <Badge label={firstCategory} color="blue" />
                          )}
                          {extraCategories > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                                color: 'var(--color-accent)',
                              }}
                            >
                              +{extraCategories}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1 rounded transition-colors cursor-pointer"
                          style={{ color: 'var(--color-text-muted)' }}
                          title={t('common.delete')}
                          onClick={async () => {
                            if (!window.confirm(t('memories.delete_confirm'))) return;
                            await api.deleteMemory(mem.id);
                            queryClient.invalidateQueries({ queryKey: ['memories'] });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !error && memories.length > 0 && viewMode === 'timeline' && (
          <MemoryTimelineView
            memories={memories}
            onSelect={setDetailMemory}
            selectedId={detailMemory?.id}
          />
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div
          className="flex items-center justify-between mt-4 pt-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('memories.page_info', { from, to, total })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronLeft}
              disabled={!hasPrev}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              {t('memories.prev_page')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronRight}
              disabled={!hasNext}
              onClick={() => setOffset(offset + LIMIT)}
            >
              {t('memories.next_page')}
            </Button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {t('memories.selected', { count: selected.size })}
          </span>
          <div className="w-px h-5" style={{ backgroundColor: 'var(--color-border)' }} />
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={bulkLoading}
            onClick={handleBulkReclassify}
          >
            {t('memories.bulk_reclassify')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            loading={bulkLoading}
            onClick={handleBulkDelete}
          >
            {t('memories.bulk_delete')}
          </Button>
          <button
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={clearSelection}
            title={t('memories.clear_selection')}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Detail sidebar */}
      {detailMemory && (
        <MemoryDetailSidebar
          memory={detailMemory}
          onClose={() => setDetailMemory(null)}
          onDeleted={() => setDetailMemory(null)}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </div>
  );
}
