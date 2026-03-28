import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Brain, Plus, Search as SearchIcon, GitBranch,
  Clock, LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { api } from '../lib/api.ts';
import { DEFAULT_USER_ID } from '../lib/constants.ts';
import { formatRelativeTime, truncate } from '../lib/utils.ts';
import StatCard from '../components/ui/StatCard.tsx';
import Card from '../components/ui/Card.tsx';
import Badge from '../components/ui/Badge.tsx';
import LoadingState from '../components/ui/LoadingState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

interface DayStat {
  date: string;
  add: number;
  search: number;
  recall: number;
}

interface RequestItem {
  id: string;
  request_type: string;
  user_id: string;
  latency_ms: number;
  status_code: number;
  event_summary: Record<string, unknown> | string | null;
  created_at: string;
}

interface EntityItem {
  id: string;
  memory_count: number;
  last_updated: string;
}

const DATE_RANGE_OPTIONS = ['all', '1d', '7d', '30d'] as const;

const typeColors: Record<string, 'green' | 'blue' | 'purple'> = {
  ADD: 'green',
  SEARCH: 'blue',
  RECALL: 'purple',
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { t } = useTranslation();
  const { hasMaintenanceKey } = useAuth();
  const [dateRange, setDateRange] = useState<string>('7d');

  const daysMap: Record<string, number> = { all: 365, '1d': 1, '7d': 7, '30d': 30 };
  const days = daysMap[dateRange] || 7;

  // Stats query
  const { data: statsData, isLoading: statsLoading, isError: statsError, error: statsErr, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats', DEFAULT_USER_ID],
    queryFn: async () => {
      const raw = await api.getStats(DEFAULT_USER_ID);
      const data = raw as unknown as StatsData;
      // Runtime guard: ensure recent_7d exists with fallback
      if (!data?.recent_7d) {
        return {
          ...data,
          total_memories: data?.total_memories ?? 0,
          category_counts: data?.category_counts ?? {},
          avg_importance_score: data?.avg_importance_score ?? 0,
          recent_7d: { add_count: 0, search_count: 0, recall_count: 0 },
          expired_count: data?.expired_count ?? 0,
          low_importance_count: data?.low_importance_count ?? 0,
        } satisfies StatsData;
      }
      return data;
    },
    staleTime: 60_000,
  });

  // Daily stats for chart
  const { data: dailyData } = useQuery({
    queryKey: ['daily-stats', days],
    queryFn: () => api.getDailyStats(days),
    staleTime: 60_000,
  });

  const dailyStats = (dailyData?.stats ?? []) as DayStat[];

  // Recent requests
  const { data: recentReqData } = useQuery({
    queryKey: ['dashboard-recent-requests'],
    queryFn: () => api.getRequests({ limit: 10, offset: 0 }),
    staleTime: 30_000,
  });

  const recentRequests = (recentReqData?.items ?? []) as RequestItem[];

  // Entity users (for entity overview) — requires maintenance key
  const { data: entityData } = useQuery({
    queryKey: ['dashboard-entity-users'],
    queryFn: () => api.getEntitiesByType('user', 10, 0),
    staleTime: 60_000,
    enabled: hasMaintenanceKey,
  });

  const entityUsers = (entityData?.entities ?? []) as EntityItem[];
  const entityTotal = entityData?.total ?? 0;

  // Entity agents count — requires maintenance key
  const { data: agentData } = useQuery({
    queryKey: ['dashboard-entity-agents'],
    queryFn: () => api.getEntitiesByType('agent', 1, 0),
    staleTime: 60_000,
    enabled: hasMaintenanceKey,
  });

  const agentTotal = agentData?.total ?? 0;

  // Category data from stats
  const categoryEntries = statsData?.category_counts
    ? Object.entries(statsData.category_counts).sort(([, a], [, b]) => b - a)
    : [];
  const maxCategoryCount = categoryEntries.length > 0
    ? Math.max(...categoryEntries.map(([, v]) => v))
    : 0;

  // Category colors cycling through accent palette
  const categoryColors = [
    'var(--color-accent)',
    'var(--color-purple)',
    'var(--color-success)',
    'var(--color-warning)',
    'var(--color-info)',
    'var(--color-orange)',
    'var(--color-danger)',
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header + Date Range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}
          >
            <LayoutDashboard size={18} />
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('dashboard.title')}
          </h1>
        </div>

        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setDateRange(opt)}
              className="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: dateRange === opt ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: dateRange === opt ? '#fff' : 'var(--color-text-muted)',
                borderRight: '1px solid var(--color-border)',
              }}
            >
              {t(`dashboard.date_${opt}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {statsLoading && <LoadingState message={t('common.loading')} />}

      {/* Error state */}
      {statsError && (
        <ErrorState
          message={(statsErr as Error)?.message || t('common.error')}
          onRetry={() => refetchStats()}
        />
      )}

      {/* Main content */}
      {statsData && (
        <>
          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('dashboard.total_memories')}
              value={statsData.total_memories}
              icon={Brain}
              color="var(--color-accent)"
            />
            <StatCard
              label={t('dashboard.total_users')}
              value={hasMaintenanceKey ? entityTotal : '--'}
              icon={GitBranch}
              color="var(--color-purple)"
            />
            <StatCard
              label={`${t('dashboard.add_events')} (7d)`}
              value={statsData.recent_7d.add_count}
              icon={Plus}
              color="var(--color-success)"
            />
            <StatCard
              label={`${t('dashboard.recall_events')} (7d)`}
              value={statsData.recent_7d.recall_count}
              icon={SearchIcon}
              color="var(--color-info)"
            />
          </div>

          {/* Middle Row: Chart + Category Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Requests Trend */}
            <Card title={t('dashboard.requests_trend')}>
              <DailyActivityChart stats={dailyStats} />
            </Card>

            {/* Category Distribution */}
            <Card title={t('dashboard.category_distribution')}>
              {categoryEntries.length === 0 ? (
                <EmptyState
                  icon={Brain}
                  title={t('dashboard.no_categories')}
                />
              ) : (
                <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto pr-1">
                  {categoryEntries.map(([category, count], idx) => (
                    <div key={category} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {category}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
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
                            backgroundColor: categoryColors[idx % categoryColors.length],
                            minWidth: count > 0 ? '4px' : '0',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Bottom Row: Entity Overview + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Entity Overview */}
            <Card title={t('dashboard.entity_overview')}>
              <div className="flex flex-col gap-1">
                {/* Summary stats */}
                <div className="flex items-center justify-between py-2 mb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {t('dashboard.total_users')}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {hasMaintenanceKey ? entityTotal : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 mb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {t('dashboard.total_agents')}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {hasMaintenanceKey ? agentTotal : '--'}
                  </span>
                </div>

                {/* User list */}
                {entityUsers.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    {t('dashboard.no_entities')}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
                    {entityUsers.map((entity) => (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between px-2 py-2 rounded-lg"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                      >
                        <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                          {truncate(entity.id, 24)}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {entity.memory_count} {t('dashboard.memories_suffix')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Recent Activity */}
            <Card title={t('dashboard.recent_activity')}>
              {recentRequests.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title={t('dashboard.no_recent')}
                />
              ) : (
                <div className="flex flex-col gap-0.5 max-h-[320px] overflow-y-auto">
                  {recentRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between px-2 py-2 rounded-lg transition-colors"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge
                          label={req.request_type}
                          color={typeColors[req.request_type] || 'blue'}
                        />
                        <span className="text-xs font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
                          {truncate(req.user_id || '-', 16)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {req.latency_ms != null && (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {Number(req.latency_ms).toFixed(0)}ms
                          </span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {formatRelativeTime(req.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ====== SVG Daily Activity Bar Chart (reused pattern from RequestsPage) ====== */

const CHART_HEIGHT = 160;
const BAR_GAP = 2;

function DailyActivityChart({ stats }: { stats: DayStat[] }) {
  const { t } = useTranslation();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; stat: DayStat } | null>(null);

  if (stats.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('dashboard.no_chart_data')}
        </span>
      </div>
    );
  }

  const maxTotal = Math.max(
    1,
    ...stats.map((s) => (s.add || 0) + (s.search || 0) + (s.recall || 0))
  );

  const chartWidth = stats.length * 20;
  const barWidth = 20 - BAR_GAP;

  return (
    <div className="relative">
      <svg
        width="100%"
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT + 30}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {stats.map((stat, i) => {
          const addH = ((stat.add || 0) / maxTotal) * CHART_HEIGHT;
          const searchH = ((stat.search || 0) / maxTotal) * CHART_HEIGHT;
          const recallH = ((stat.recall || 0) / maxTotal) * CHART_HEIGHT;
          const x = i * 20;

          const recallY = CHART_HEIGHT - recallH;
          const searchY = recallY - searchH;
          const addY = searchY - addH;

          const dateLabel = stat.date?.slice(5) || '';

          return (
            <g
              key={stat.date}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget.closest('svg') as SVGSVGElement)?.getBoundingClientRect();
                if (rect) {
                  const scaleX = rect.width / chartWidth;
                  setTooltip({
                    x: x * scaleX + (barWidth * scaleX) / 2,
                    y: 0,
                    stat,
                  });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              className="cursor-pointer"
            >
              <rect x={x} y={0} width={20} height={CHART_HEIGHT} fill="transparent" />
              {addH > 0 && (
                <rect x={x + BAR_GAP / 2} y={addY} width={barWidth} height={addH} rx={2} fill="var(--color-success)" opacity={0.85} />
              )}
              {searchH > 0 && (
                <rect x={x + BAR_GAP / 2} y={searchY} width={barWidth} height={searchH} rx={2} fill="var(--color-accent)" opacity={0.85} />
              )}
              {recallH > 0 && (
                <rect x={x + BAR_GAP / 2} y={recallY} width={barWidth} height={recallH} rx={2} fill="var(--color-purple)" opacity={0.85} />
              )}
              {i % 5 === 0 && (
                <text x={x + barWidth / 2 + BAR_GAP / 2} y={CHART_HEIGHT + 16} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">
                  {dateLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <LegendItem color="var(--color-success)" label="ADD" />
        <LegendItem color="var(--color-accent)" label="SEARCH" />
        <LegendItem color="var(--color-purple)" label="RECALL" />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none rounded-lg px-3 py-2 text-xs z-10"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          <div className="font-semibold mb-1">{tooltip.stat.date}</div>
          <div style={{ color: 'var(--color-success)' }}>ADD: {tooltip.stat.add || 0}</div>
          <div style={{ color: 'var(--color-accent)' }}>SEARCH: {tooltip.stat.search || 0}</div>
          <div style={{ color: 'var(--color-purple)' }}>RECALL: {tooltip.stat.recall || 0}</div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
    </div>
  );
}
