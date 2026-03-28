import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw, User, Filter, ChevronDown, Plus, Minus, Search, List } from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatRelativeTime, truncate } from '../lib/utils.ts';
import Card from '../components/ui/Card.tsx';
import Badge from '../components/ui/Badge.tsx';
import Button from '../components/ui/Button.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import RequestDetailSidebar from '../components/request/RequestDetailSidebar.tsx';

const PAGE_SIZE = 50;

const REQUEST_TYPES = ['', 'ADD', 'SEARCH', 'RECALL', 'GET_ALL'] as const;

const typeColors: Record<string, 'green' | 'blue' | 'purple' | 'orange'> = {
  ADD: 'green',
  SEARCH: 'blue',
  RECALL: 'purple',
  GET_ALL: 'orange',
};

type DateRange = '' | '1' | '7' | '30';
const DATE_RANGES: { key: DateRange; labelKey: string }[] = [
  { key: '', labelKey: 'requests.date_all' },
  { key: '1', labelKey: 'requests.date_1d' },
  { key: '7', labelKey: 'requests.date_7d' },
  { key: '30', labelKey: 'requests.date_30d' },
];

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
  req_payload: Record<string, unknown> | string | null;
  created_at: string;
}

// --- Helper: format latency ---
function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '-';
  const val = Number(ms);
  if (val < 1000) return `${Math.round(val)}ms`;
  if (val < 60000) return `${(val / 1000).toFixed(1)}s`;
  const mins = Math.floor(val / 60000);
  const secs = Math.round((val % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// --- Helper: count extra entities from req_payload ---
function getEntityInfo(req: RequestItem): { userId: string; extraCount: number; extras: Record<string, string> } {
  const payload = typeof req.req_payload === 'object' && req.req_payload !== null
    ? req.req_payload
    : {};
  const userId = (payload.user_id as string) || req.user_id || '-';
  const extras: Record<string, string> = {};
  for (const key of ['agent_id', 'run_id', 'app_id'] as const) {
    const val = payload[key];
    if (val != null && val !== '') {
      extras[key] = String(val);
    }
  }
  return { userId, extraCount: Object.keys(extras).length, extras };
}

// --- Event Badges component (icon-based, matching mem0 platform style) ---
function EventBadges({ requestType, eventSummary }: { requestType: string; eventSummary: Record<string, unknown> | string | null }) {
  const summary = typeof eventSummary === 'object' && eventSummary !== null
    ? eventSummary
    : null;
  if (!summary) return <span style={{ color: 'var(--color-text-muted)' }}>-</span>;

  switch (requestType) {
    case 'ADD': {
      const count = summary.count as number | undefined;
      if (count == null || count === 0) return null;
      const addCount = (summary.ADD as number) || 0;
      const updateCount = (summary.UPDATE as number) || 0;
      const deleteCount = (summary.DELETE as number) || 0;
      // If no breakdown keys, show total count as ADD
      const hasBreakdown = 'ADD' in summary || 'UPDATE' in summary || 'DELETE' in summary;
      if (!hasBreakdown) {
        return (
          <div className="flex items-center gap-1.5">
            <EventPill icon={Plus} count={count} color="success" />
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1.5">
          {addCount > 0 && <EventPill icon={Plus} count={addCount} color="success" />}
          {updateCount > 0 && <EventPill icon={RefreshCw} count={updateCount} color="accent" />}
          {deleteCount > 0 && <EventPill icon={Minus} count={deleteCount} color="danger" />}
        </div>
      );
    }
    case 'SEARCH':
    case 'RECALL': {
      const hits = summary.hits as number | undefined;
      if (hits == null) return <span style={{ color: 'var(--color-text-muted)' }}>-</span>;
      return (
        <div className="flex items-center gap-1.5">
          <EventPill icon={Search} count={hits} color="purple" />
        </div>
      );
    }
    case 'GET_ALL': {
      const returned = summary.returned as number | undefined;
      const total = summary.total as number | undefined;
      if (returned == null) return <span style={{ color: 'var(--color-text-muted)' }}>-</span>;
      return (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
              color: 'var(--color-warning)',
            }}
          >
            <List size={11} strokeWidth={2.5} />
            {total != null ? `${returned} / ${total}` : returned}
          </span>
        </div>
      );
    }
    default:
      return <span style={{ color: 'var(--color-text-muted)' }}>-</span>;
  }
}

function EventPill({ icon: Icon, count, color }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; count: number; color: 'success' | 'accent' | 'danger' | 'purple' }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, var(--color-${color}) 15%, transparent)`,
        color: `var(--color-${color})`,
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {count}
    </span>
  );
}

export default function RequestsPage() {
  const { t } = useTranslation();
  const [requestType, setRequestType] = useState<string>('');
  const [hasResults, setHasResults] = useState(false);
  const [userId, setUserId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const days = dateRange === '' ? undefined : Number(dateRange);

  // Daily stats
  const { data: dailyData } = useQuery({
    queryKey: ['daily-stats', days],
    queryFn: () => api.getDailyStats(days ?? 30),
    staleTime: 60_000,
  });

  const dailyStats = (dailyData?.stats ?? []) as DayStat[];

  // Requests list
  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
    if (requestType) params.request_type = requestType;
    if (hasResults) params.has_results = 'true';
    if (userId.trim()) params.user_id = userId.trim();
    if (days != null) params.days = days;
    return params;
  }, [requestType, hasResults, userId, offset, days]);

  const { data: reqData, isLoading, error, refetch } = useQuery({
    queryKey: ['requests', requestType, hasResults, userId, offset, days],
    queryFn: () => api.getRequests(buildParams()),
    staleTime: 30_000,
  });

  const requests = (reqData?.items ?? []) as RequestItem[];
  const total = reqData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const resetOffset = () => setOffset(0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header row: title + date range */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t('requests.title')}
        </h1>
        <ToggleGroup
          options={DATE_RANGES.map((d) => ({ value: d.key, label: t(d.labelKey) }))}
          value={dateRange}
          onChange={(v) => { setDateRange(v as DateRange); resetOffset(); }}
        />
      </div>

      {/* Daily Activity Chart */}
      <Card title={t('requests.daily_activity')}>
        <DailyActivityChart stats={dailyStats} />
      </Card>

      {/* Type filter row + has results toggle + filters button + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ToggleGroup
            options={REQUEST_TYPES.map((typ) => ({
              value: typ,
              label: typ === '' ? t('requests.type_overview') : typ,
            }))}
            value={requestType}
            onChange={(v) => { setRequestType(v); resetOffset(); }}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Has Results toggle */}
          <button
            onClick={() => { setHasResults(!hasResults); resetOffset(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: hasResults ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'var(--color-bg-tertiary)',
              color: hasResults ? 'var(--color-accent)' : 'var(--color-text-muted)',
              border: hasResults ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid var(--color-border)',
            }}
          >
            {t('requests.filter_has_results')}
          </button>

          {/* Filters dropdown */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: userId.trim() ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'var(--color-bg-tertiary)',
              color: userId.trim() ? 'var(--color-accent)' : 'var(--color-text-muted)',
              border: userId.trim() ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid var(--color-border)',
            }}
          >
            <Filter size={12} />
            {t('requests.filters')}
            <ChevronDown size={12} style={{ transform: showFilters ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
          </button>

          {/* Refresh */}
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()}>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Collapsible filter panel */}
      {showFilters && (
        <div
          className="rounded-lg p-3 flex items-center gap-3"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            {t('requests.filter_user_id')}
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); resetOffset(); }}
            placeholder={t('requests.filter_user_id')}
            className="rounded-lg px-3 py-1.5 text-sm outline-none flex-1 max-w-xs"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>
      )}

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
                    t('requests.entities'),
                    t('requests.event'),
                    t('requests.latency'),
                    t('requests.status'),
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
                {requests.map((req) => {
                  const entity = getEntityInfo(req);
                  return (
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User size={12} style={{ color: 'var(--color-text-muted)' }} />
                          <span
                            className="font-mono text-xs"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {truncate(entity.userId, 16)}
                          </span>
                          {entity.extraCount > 0 && (
                            <EntityBadge count={entity.extraCount} extras={entity.extras} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <EventBadges requestType={req.request_type} eventSummary={req.event_summary} />
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {formatLatency(req.latency_ms)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge code={req.status_code} />
                      </td>
                    </tr>
                  );
                })}
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
          onPrev={(() => {
            const idx = requests.findIndex((r) => r.id === selectedId);
            if (idx > 0) return () => setSelectedId(requests[idx - 1].id);
            return undefined;
          })()}
          onNext={(() => {
            const idx = requests.findIndex((r) => r.id === selectedId);
            if (idx >= 0 && idx < requests.length - 1) return () => setSelectedId(requests[idx + 1].id);
            return undefined;
          })()}
        />
      )}
    </div>
  );
}

// --- Toggle button group component ---
function ToggleGroup({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--color-border)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: active
                ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                : 'var(--color-bg-tertiary)',
              color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Entity +N badge with tooltip ---
function EntityBadge({ count, extras }: { count: number; extras: Record<string, string> }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold cursor-default"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-info) 20%, transparent)',
          color: 'var(--color-info)',
        }}
      >
        +{count}
      </span>
      {showTooltip && (
        <div
          className="absolute left-0 top-full mt-1 z-20 rounded-lg px-3 py-2 text-xs whitespace-nowrap"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {Object.entries(extras).map(([key, val]) => (
            <div key={key} className="flex gap-2">
              <span className="font-medium" style={{ color: 'var(--color-text-muted)' }}>{key}:</span>
              <span className="font-mono">{truncate(val, 30)}</span>
            </div>
          ))}
        </div>
      )}
    </span>
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
