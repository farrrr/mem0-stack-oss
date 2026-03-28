import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatRelativeTime, truncate } from '../lib/utils.ts';
import Card from '../components/ui/Card.tsx';
import Badge from '../components/ui/Badge.tsx';
import Button from '../components/ui/Button.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import RequestDetailSidebar from '../components/request/RequestDetailSidebar.tsx';

const PAGE_SIZE = 50;

const typeColors: Record<string, 'green' | 'blue' | 'purple'> = {
  ADD: 'green',
  SEARCH: 'blue',
  RECALL: 'purple',
};

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

export default function RequestsPage() {
  const { t } = useTranslation();
  const [requestType, setRequestType] = useState('');
  const [hasResults, setHasResults] = useState(false);
  const [userId, setUserId] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Daily stats
  const { data: dailyData } = useQuery({
    queryKey: ['daily-stats'],
    queryFn: () => api.getDailyStats(30),
    staleTime: 60_000,
  });

  const dailyStats = (dailyData?.stats ?? []) as DayStat[];

  // Requests list
  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
    if (requestType) params.request_type = requestType;
    if (hasResults) params.has_results = 'true';
    if (userId.trim()) params.user_id = userId.trim();
    return params;
  }, [requestType, hasResults, userId, offset]);

  const { data: reqData, isLoading, error, refetch } = useQuery({
    queryKey: ['requests', requestType, hasResults, userId, offset],
    queryFn: () => api.getRequests(buildParams()),
    staleTime: 30_000,
  });

  const requests = (reqData?.items ?? []) as RequestItem[];
  const total = reqData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const handleFilterChange = () => {
    setOffset(0);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {t('requests.title')}
      </h1>

      {/* Daily Activity Chart */}
      <Card title={t('requests.daily_activity')}>
        <DailyActivityChart stats={dailyStats} />
      </Card>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={requestType}
          onChange={(e) => { setRequestType(e.target.value); handleFilterChange(); }}
          className="rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <option value="">{t('requests.filter_all')}</option>
          <option value="ADD">ADD</option>
          <option value="SEARCH">SEARCH</option>
          <option value="RECALL">RECALL</option>
        </select>

        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <input
            type="checkbox"
            checked={hasResults}
            onChange={(e) => { setHasResults(e.target.checked); handleFilterChange(); }}
            className="rounded cursor-pointer"
          />
          {t('requests.filter_has_results')}
        </label>

        <input
          type="text"
          value={userId}
          onChange={(e) => { setUserId(e.target.value); handleFilterChange(); }}
          placeholder={t('requests.filter_user_id')}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
        />
      </div>

      {/* Request table */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg animate-pulse"
              style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-3 py-12">
          <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {t('common.error')}
          </span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!isLoading && !error && requests.length === 0 && (
        <EmptyState icon={ScrollText} title={t('requests.no_results')} />
      )}

      {!isLoading && !error && requests.length > 0 && (
        <>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                  {[
                    t('requests.time'),
                    t('requests.type'),
                    t('requests.user'),
                    t('requests.latency'),
                    t('requests.status'),
                    t('requests.summary'),
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="cursor-pointer transition-colors"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                    onClick={() => setSelectedId(req.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>
                      {formatRelativeTime(req.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={req.request_type} color={typeColors[req.request_type] || 'blue'} />
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {truncate(req.user_id || '-', 20)}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {req.latency_ms != null ? `${Number(req.latency_ms).toFixed(0)} ms` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge code={req.status_code} />
                    </td>
                    <td
                      className="px-4 py-3 max-w-[300px]"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {truncate(typeof req.event_summary === 'object' ? JSON.stringify(req.event_summary) : (req.event_summary || '-'), 60)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('common.total', { count: total })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronLeft}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('common.previous')}
              </Button>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronRight}
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Detail sidebar */}
      {selectedId && (
        <RequestDetailSidebar
          requestId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ code }: { code: number }) {
  const color = code >= 200 && code < 300 ? 'green' : code >= 400 ? 'red' : 'yellow';
  return <Badge label={String(code)} color={color} />;
}

/* ====== SVG Daily Activity Bar Chart ====== */

const CHART_HEIGHT = 160;
const BAR_GAP = 2;

function DailyActivityChart({ stats }: { stats: DayStat[] }) {
  const { t } = useTranslation();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; stat: DayStat } | null>(null);

  if (stats.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('requests.no_results')}
        </span>
      </div>
    );
  }

  // Calculate max for Y axis
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

          // Stack: recall on bottom, search in middle, add on top
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
              {/* Invisible hit area */}
              <rect x={x} y={0} width={20} height={CHART_HEIGHT} fill="transparent" />

              {/* ADD bar (green) */}
              {addH > 0 && (
                <rect
                  x={x + BAR_GAP / 2}
                  y={addY}
                  width={barWidth}
                  height={addH}
                  rx={2}
                  fill="var(--color-success)"
                  opacity={0.85}
                />
              )}
              {/* SEARCH bar (blue) */}
              {searchH > 0 && (
                <rect
                  x={x + BAR_GAP / 2}
                  y={searchY}
                  width={barWidth}
                  height={searchH}
                  rx={2}
                  fill="var(--color-accent)"
                  opacity={0.85}
                />
              )}
              {/* RECALL bar (purple) */}
              {recallH > 0 && (
                <rect
                  x={x + BAR_GAP / 2}
                  y={recallY}
                  width={barWidth}
                  height={recallH}
                  rx={2}
                  fill="var(--color-purple)"
                  opacity={0.85}
                />
              )}

              {/* X axis label (every 5th) */}
              {i % 5 === 0 && (
                <text
                  x={x + barWidth / 2 + BAR_GAP / 2}
                  y={CHART_HEIGHT + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--color-text-muted)"
                >
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
