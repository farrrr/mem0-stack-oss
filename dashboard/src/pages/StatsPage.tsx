import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Brain, Plus, Search as SearchIcon, Star, BarChart3 } from 'lucide-react';
import { api } from '../lib/api.ts';
import { DEFAULT_USER_ID } from '../lib/constants.ts';
import PageHeader from '../components/ui/PageHeader.tsx';
import StatCard from '../components/ui/StatCard.tsx';
import Card from '../components/ui/Card.tsx';
import LoadingState from '../components/ui/LoadingState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';

interface StatsData {
  total_memories: number;
  category_counts: Record<string, number>;
  avg_importance_score: number;
  recent_7d: {
    add_count: number;
    search_count: number;
    recall_count: number;
  };
  expired_count: number;
  low_importance_count: number;
}

export default function StatsPage() {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [activeUserId, setActiveUserId] = useState(DEFAULT_USER_ID);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stats', activeUserId],
    queryFn: () => api.getStats(activeUserId) as unknown as Promise<StatsData>,
    enabled: activeUserId.length > 0,
    staleTime: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userId.trim()) {
      setActiveUserId(userId.trim());
    }
  };

  const categoryEntries = data?.category_counts
    ? Object.entries(data.category_counts).sort(([, a], [, b]) => b - a)
    : [];
  const maxCategoryCount = categoryEntries.length > 0
    ? Math.max(...categoryEntries.map(([, v]) => v))
    : 0;

  return (
    <div>
      <PageHeader title={t('stats.title')} />

      {/* User ID Input */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={t('stats.user_id_placeholder')}
            className="flex-1 max-w-sm rounded-lg px-3.5 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-accent)';
            }}
          >
            {t('search.results')}
          </button>
        </div>
      </form>

      {/* No user ID yet */}
      {!activeUserId && (
        <EmptyState
          icon={BarChart3}
          title={t('stats.no_data')}
        />
      )}

      {/* Loading */}
      {activeUserId && isLoading && (
        <LoadingState message={t('common.loading')} />
      )}

      {/* Error */}
      {activeUserId && isError && (
        <ErrorState
          message={(error as Error)?.message || t('common.error')}
          onRetry={() => { void refetch(); }}
        />
      )}

      {/* Data */}
      {data && (
        <div className="flex flex-col gap-6">
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('stats.total_memories')}
              value={data.total_memories}
              icon={Brain}
              color="var(--color-accent)"
            />
            <StatCard
              label={t('stats.seven_day_additions')}
              value={data.recent_7d.add_count}
              icon={Plus}
              color="var(--color-success)"
            />
            <StatCard
              label={t('stats.seven_day_searches')}
              value={data.recent_7d.search_count}
              icon={SearchIcon}
              color="var(--color-info)"
            />
            <StatCard
              label={t('stats.avg_importance')}
              value={data.avg_importance_score?.toFixed(2) ?? '0'}
              icon={Star}
              color="var(--color-warning)"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Distribution */}
            <Card title={t('stats.category_distribution')}>
              {categoryEntries.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t('stats.no_data')}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {categoryEntries.map(([category, count]) => (
                    <div key={category} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {category}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {count}
                        </span>
                      </div>
                      <div
                        className="h-2 rounded-full w-full"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                      >
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${maxCategoryCount > 0 ? (count / maxCategoryCount) * 100 : 0}%`,
                            backgroundColor: 'var(--color-accent)',
                            minWidth: count > 0 ? '4px' : '0',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Recent Activity */}
            <Card title={t('stats.recent_activity')}>
              <div className="flex flex-col gap-4">
                <ActivityRow
                  label={t('stats.add_count')}
                  value={data.recent_7d.add_count}
                  color="var(--color-success)"
                />
                <ActivityRow
                  label={t('stats.search_count')}
                  value={data.recent_7d.search_count}
                  color="var(--color-info)"
                />
                <ActivityRow
                  label={t('stats.recall_count')}
                  value={data.recent_7d.recall_count}
                  color="var(--color-warning)"
                />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
      </div>
      <span className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {value}
      </span>
    </div>
  );
}
