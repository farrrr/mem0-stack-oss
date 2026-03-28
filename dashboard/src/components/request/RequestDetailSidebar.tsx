import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  X, AlertTriangle, ChevronUp, ChevronDown, Copy, Check,
  User, Bot, Play, AppWindow,
  Plus, RefreshCw, Minus, Search, List,
  MessageSquare, GitFork, Users, Filter, FileJson, Brain,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/utils.ts';
import Badge from '../ui/Badge.tsx';

interface RequestDetailSidebarProps {
  requestId: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

interface RequestData {
  request_type?: string;
  user_id?: string;
  run_id?: string;
  latency_ms?: number;
  status_code?: number;
  created_at?: string;
  req_payload?: { user_id?: string; agent_id?: string; run_id?: string; app_id?: string; messages?: Array<{ role?: string; content?: string }>; query?: string; [key: string]: unknown };
  event_summary?: Record<string, unknown> | string | null;
  memory_actions?: Array<{ event?: string; memory?: string; previous_memory?: string; id?: string; [key: string]: unknown }>;
  retrieved_memories?: Array<{ memory?: string; score?: number; id?: string; [key: string]: unknown }>;
  error_msg?: string;
}

type TabKey = 'payload' | 'actions';

const typeColors: Record<string, 'green' | 'blue' | 'purple' | 'orange'> = {
  ADD: 'green',
  SEARCH: 'blue',
  RECALL: 'purple',
  GET_ALL: 'orange',
};

const actionEventColors: Record<string, 'green' | 'blue' | 'red'> = {
  ADD: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
};

const actionEventIcons: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  ADD: Plus,
  UPDATE: RefreshCw,
  DELETE: Minus,
};

// --- Reuse formatLatency from RequestsPage ---
function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '-';
  const val = Number(ms);
  if (val < 1000) return `${Math.round(val)}ms`;
  if (val < 60000) return `${(val / 1000).toFixed(1)}s`;
  const mins = Math.floor(val / 60000);
  const secs = Math.round((val % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// --- Event Pills (reused from RequestsPage pattern) ---
function EventPill({ icon: Icon, count, color }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  count: number;
  color: 'success' | 'accent' | 'danger' | 'purple' | 'warning';
}) {
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

function EventBadges({ requestType, eventSummary }: {
  requestType: string;
  eventSummary: Record<string, unknown> | string | null | undefined;
}) {
  const summary = typeof eventSummary === 'object' && eventSummary !== null
    ? eventSummary
    : null;
  if (!summary) return null;

  switch (requestType) {
    case 'ADD': {
      const count = summary.count as number | undefined;
      if (count == null || count === 0) return null;
      const addCount = (summary.ADD as number) || 0;
      const updateCount = (summary.UPDATE as number) || 0;
      const deleteCount = (summary.DELETE as number) || 0;
      const hasBreakdown = 'ADD' in summary || 'UPDATE' in summary || 'DELETE' in summary;
      if (!hasBreakdown) {
        return <EventPill icon={Plus} count={count} color="success" />;
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
      if (hits == null) return null;
      return <EventPill icon={Search} count={hits} color="purple" />;
    }
    case 'GET_ALL': {
      const returned = summary.returned as number | undefined;
      const total = summary.total as number | undefined;
      if (returned == null) return null;
      return (
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
      );
    }
    default:
      return null;
  }
}

// --- Copy button ---
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-0.5 rounded transition-colors cursor-pointer"
      style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}
      title={t('requests.copy_id')}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// --- Status badge ---
function StatusBadge({ code }: { code: number }) {
  const color = code >= 200 && code < 300 ? 'green' : code >= 400 ? 'red' : 'yellow';
  return <Badge label={String(code)} color={color} />;
}

/** JSON with syntax highlighting using React elements (safe, no innerHTML). */
function JsonHighlight({ data }: { data: unknown }) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const tokenRe = /("(?:[^"\\]|\\.)*")\s*(:)|("(?:[^"\\]|\\.)*")|([-+]?\d+\.?\d*(?:[eE][-+]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([^"0-9tfn]+)/g;
  const parts: Array<{ text: string; color?: string }> = [];
  let m;
  while ((m = tokenRe.exec(json)) !== null) {
    if (m[1] && m[2]) { parts.push({ text: m[1], color: 'var(--color-purple)' }); parts.push({ text: ':' }); }
    else if (m[3]) { parts.push({ text: m[3], color: 'var(--color-success)' }); }
    else if (m[4]) { parts.push({ text: m[4], color: 'var(--color-warning)' }); }
    else if (m[5]) { parts.push({ text: m[5], color: 'var(--color-accent)' }); }
    else if (m[6]) { parts.push({ text: m[6], color: 'var(--color-text-muted)' }); }
    else if (m[7]) { parts.push({ text: m[7] }); }
  }
  return (
    <pre className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
      {parts.map((p, i) => <span key={i} style={{ color: p.color ?? 'var(--color-text-secondary)' }}>{p.text}</span>)}
    </pre>
  );
}

// --- Expandable text ---
function ExpandableText({ text, maxLength = 200 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {expanded ? text : `${text.slice(0, maxLength)}...`}
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-[11px] font-medium cursor-pointer"
        style={{ color: 'var(--color-accent)' }}
      >
        {expanded ? t('requests.show_less') : t('requests.show_more')}
      </button>
    </span>
  );
}

export default function RequestDetailSidebar({ requestId, onClose, onPrev, onNext }: RequestDetailSidebarProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('payload');

  const { data, isLoading, error } = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => api.getRequest(requestId) as Promise<RequestData>,
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className="fixed top-0 right-0 h-full w-[720px] z-50 overflow-y-auto flex flex-col"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-5 py-3"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center justify-between">
            {/* Left: Event + type badge + pills */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--color-text-primary)' }}>
                {t('requests.event')}
              </span>
              {data?.request_type && (
                <Badge label={data.request_type} color={typeColors[data.request_type] ?? 'blue'} />
              )}
              {data && (
                <EventBadges requestType={data.request_type ?? ''} eventSummary={data.event_summary} />
              )}
            </div>

            {/* Right: nav arrows + close */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onPrev}
                disabled={!onPrev}
                className="p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={onNext}
                disabled={!onNext}
                className="p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <ChevronDown size={16} />
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-lg transition-colors cursor-pointer ml-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <TabButton
              active={activeTab === 'payload'}
              onClick={() => setActiveTab('payload')}
              label={t('requests.request_payload')}
            />
            <TabButton
              active={activeTab === 'actions'}
              onClick={() => setActiveTab('actions')}
              label={t('requests.memory_actions_tab')}
            />
          </div>
        </div>

        {/* Error banner */}
        {data?.error_msg && (
          <div
            className="flex items-start gap-2 px-5 py-3 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
              color: 'var(--color-danger)',
              borderBottom: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)',
            }}
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{data.error_msg}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 p-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('common.loading')}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
                {t('common.error')}
              </span>
            </div>
          )}

          {data && (
            <RequestContent data={data} t={t} activeTab={activeTab} requestId={requestId} />
          )}
        </div>
      </div>
    </>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-xs font-medium transition-colors cursor-pointer relative"
      style={{
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
      }}
    >
      {label}
      {active && (
        <span
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      )}
    </button>
  );
}

function RequestContent({ data, t, activeTab, requestId }: {
  data: RequestData;
  t: TFunction;
  activeTab: TabKey;
  requestId: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Tab content */}
      {activeTab === 'payload' && <PayloadTab data={data} t={t} requestId={requestId} />}
      {activeTab === 'actions' && <ActionsTab data={data} t={t} />}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded-lg"
      style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
    >
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}

// ============================================================
// PayloadTab - varies by request type
// ============================================================
function PayloadTab({ data, t, requestId }: { data: RequestData; t: TFunction; requestId: string }) {
  const payload = typeof data.req_payload === 'object' && data.req_payload !== null
    ? data.req_payload
    : {};

  // Extract entities from payload
  const entities: Array<{ key: string; label: string; value: string; icon: React.ComponentType<{ size?: number }> }> = [];
  if (payload.user_id) entities.push({ key: 'user_id', label: 'User', value: payload.user_id, icon: User });
  if (payload.agent_id) entities.push({ key: 'agent_id', label: 'Agent', value: payload.agent_id, icon: Bot });
  if (payload.run_id) entities.push({ key: 'run_id', label: 'Run', value: payload.run_id, icon: Play });
  if (payload.app_id) entities.push({ key: 'app_id', label: 'App', value: payload.app_id, icon: AppWindow });

  const requestType = data.request_type ?? '';

  return (
    <div className="flex flex-col gap-5">
      {/* Entities Involved */}
      {entities.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Users size={12} />
            {t('requests.entities_involved')}
          </h3>
          {entities.map((ent) => {
            const Icon = ent.icon;
            return (
              <div
                key={ent.key}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                <Icon size={14} />
                <span className="text-xs font-medium w-12" style={{ color: 'var(--color-text-muted)' }}>
                  {ent.label}
                </span>
                <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {ent.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Meta Info Grid */}
      <div className="flex flex-col gap-2">
        {/* ID row - full width */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
        >
          <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            ID
          </span>
          <span
            className="text-xs font-mono flex-1 truncate"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {requestId}
          </span>
          <CopyButton text={requestId} />
        </div>

        {/* Three-column row: Latency | Requested At | Status */}
        <div className="grid grid-cols-3 gap-2">
          <MetaCell label={t('requests.latency')} value={formatLatency(data.latency_ms)} />
          <MetaCell label={t('requests.created_at')} value={data.created_at ? formatDateTime(data.created_at) : '-'} />
          <div
            className="flex flex-col gap-1 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
          >
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {t('requests.status')}
            </span>
            {data.status_code != null ? (
              <StatusBadge code={data.status_code} />
            ) : (
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>-</span>
            )}
          </div>
        </div>

        {/* Graph + Rerank row */}
        <div className="flex gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
            style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
          >
            <GitFork size={13} style={{ color: 'var(--color-success)' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {t('requests.graph')}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>
              {t('requests.graph_enabled')}
            </span>
          </div>
          {(requestType === 'SEARCH' || requestType === 'RECALL') && (() => {
            const summary = typeof data.event_summary === 'object' && data.event_summary !== null ? data.event_summary : null;
            const rerank = summary?.rerank as boolean | undefined;
            return rerank != null ? (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Rerank</span>
                <span className="text-xs font-medium" style={{ color: rerank ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {rerank ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* Payload JSON */}
      <PayloadJsonSection data={data} t={t} requestType={requestType} payload={payload} />
    </div>
  );
}

// --- Payload JSON section (extracted from old PayloadTab) ---
function PayloadJsonSection({ data, t, requestType, payload }: {
  data: RequestData;
  t: TFunction;
  requestType: string;
  payload: NonNullable<RequestData['req_payload']>;
}) {
  if (data.req_payload == null) {
    return (
      <div className="py-6 text-center">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>
      </div>
    );
  }

  // For SEARCH/RECALL: show query, topK, then filters
  if (requestType === 'SEARCH' || requestType === 'RECALL') {
    const query = payload.query as string | undefined;
    const topK = (payload.limit ?? payload.top_k) as number | undefined;

    // Build filters: exclude query and messages (keep entity IDs and other params)
    const filterParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!['query', 'messages', 'limit', 'top_k'].includes(k) && v != null) {
        filterParams[k] = v;
      }
    }
    const hasFilters = Object.keys(filterParams).length > 0;

    return (
      <div className="flex flex-col gap-3">
        {/* Search query - prominent display */}
        {query && (
          <div
            className="p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Search size={13} style={{ color: 'var(--color-accent)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
                {t('requests.search_query')}
              </span>
            </div>
            <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {query}
            </span>
          </div>
        )}

        {/* TopK info */}
        {topK != null && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
          >
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Top K</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{topK}</span>
          </div>
        )}

        {/* Filters section */}
        {hasFilters && (
          <div className="flex flex-col gap-1.5">
            <h3
              className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Filter size={12} />
              Filters
            </h3>
            <JsonHighlight data={filterParams} />
          </div>
        )}
      </div>
    );
  }

  // For ADD: exclude messages array
  if (requestType === 'ADD') {
    const displayPayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k !== 'messages') displayPayload[k] = v;
    }
    return (
      <div className="flex flex-col gap-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <FileJson size={12} />
          {t('requests.request_payload')}
        </h3>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {t('requests.messages_excluded')}
        </p>
        <JsonHighlight data={displayPayload} />
      </div>
    );
  }

  // For GET_ALL and others: show filter params (exclude messages)
  const displayPayload2: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k !== 'messages') displayPayload2[k] = v;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t('requests.request_payload')}
      </h3>
      <JsonHighlight data={displayPayload2} />
    </div>
  );
}

// ============================================================
// ActionsTab - varies by request type
// ============================================================

type ActionFilter = 'ALL' | 'ADD' | 'UPDATE' | 'DELETE';

function ActionsTab({ data, t }: { data: RequestData; t: TFunction }) {
  const requestType = data.request_type ?? '';

  if (requestType === 'SEARCH' || requestType === 'RECALL') {
    return <SearchActionsTab data={data} t={t} />;
  }
  if (requestType === 'GET_ALL') {
    return <GetAllActionsTab data={data} t={t} />;
  }
  // ADD and others
  return <AddActionsTab data={data} t={t} />;
}

// --- ADD request: Source conversation + Memory actions ---
function AddActionsTab({ data, t }: { data: RequestData; t: TFunction }) {
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');

  // Extract messages from req_payload
  const messages = data.req_payload?.messages ?? [];
  const actions = data.memory_actions ?? [];

  // Compute counts for filter tabs
  const counts: Record<string, number> = { ALL: actions.length };
  for (const action of actions) {
    const evt = action.event ?? 'ADD';
    counts[evt] = (counts[evt] || 0) + 1;
  }

  // If no actions from memory_actions, try to reconstruct counts from event_summary
  const summary = typeof data.event_summary === 'object' && data.event_summary !== null
    ? data.event_summary
    : null;
  const hasActions = actions.length > 0;
  const summaryAddCount = (summary?.ADD as number) || 0;
  const summaryUpdateCount = (summary?.UPDATE as number) || 0;
  const summaryDeleteCount = (summary?.DELETE as number) || 0;
  const summaryTotalCount = (summary?.count as number) || 0;

  // Filtered actions
  const filteredActions = actionFilter === 'ALL'
    ? actions
    : actions.filter((a) => (a.event ?? 'ADD') === actionFilter);

  // Filter tabs to show
  const filterTabs: Array<{ key: ActionFilter; label: string; count: number }> = [];
  if (hasActions) {
    filterTabs.push({ key: 'ALL', label: t('requests.filter_all'), count: counts.ALL });
    if (counts.ADD) filterTabs.push({ key: 'ADD', label: 'ADD', count: counts.ADD });
    if (counts.UPDATE) filterTabs.push({ key: 'UPDATE', label: 'UPDATE', count: counts.UPDATE });
    if (counts.DELETE) filterTabs.push({ key: 'DELETE', label: 'DELETE', count: counts.DELETE });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Section A: Source conversation */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <MessageSquare size={12} className="inline mr-1.5 -mt-0.5" />
            {t('requests.source_conversation')}
          </h3>
        </div>
        {messages.length > 0 ? (
          <div
            className="flex flex-col gap-2 max-h-[300px] overflow-y-auto p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5">
                    {!isUser && <Bot size={12} style={{ color: 'var(--color-accent)' }} />}
                    <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                      {isUser ? t('requests.role_user') : t('requests.role_assistant')}
                    </span>
                    {isUser && <User size={12} style={{ color: 'var(--color-success)' }} />}
                  </div>
                  <div
                    className="rounded-lg px-3 py-2 max-w-[85%] text-xs leading-relaxed"
                    style={{
                      backgroundColor: isUser
                        ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                        : 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      border: `1px solid ${isUser
                        ? 'color-mix(in srgb, var(--color-accent) 25%, transparent)'
                        : 'var(--color-border)'}`,
                    }}
                  >
                    <ExpandableText text={msg.content ?? ''} maxLength={300} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="px-3 py-4 rounded-lg text-center"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('requests.source_not_available')}
            </span>
          </div>
        )}
      </div>

      {/* Section B: Memory actions */}
      <div className="flex flex-col gap-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Brain size={12} />
          {t('requests.memories_section')}
        </h3>

        {/* Filter tabs */}
        {filterTabs.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActionFilter(tab.key)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors"
                style={{
                  backgroundColor: actionFilter === tab.key
                    ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                    : 'var(--color-bg-tertiary)',
                  color: actionFilter === tab.key
                    ? 'var(--color-accent)'
                    : 'var(--color-text-muted)',
                  border: `1px solid ${actionFilter === tab.key
                    ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)'
                    : 'var(--color-border)'}`,
                }}
              >
                {tab.label} {tab.count}
              </button>
            ))}
          </div>
        )}

        {/* Action cards */}
        {hasActions ? (
          <div className="flex flex-col gap-2">
            {filteredActions.map((action, i) => {
              const eventType = action.event ?? 'ADD';
              const colorName = actionEventColors[eventType] ?? 'blue';
              const IconComp = actionEventIcons[eventType] ?? Plus;
              const cssColorVar = colorName === 'green' ? '--color-success'
                : colorName === 'blue' ? '--color-accent'
                : '--color-danger';

              return (
                <div
                  key={action.id ?? i}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Colored icon */}
                  <div
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(${cssColorVar}) 15%, transparent)`,
                      color: `var(${cssColorVar})`,
                    }}
                  >
                    <IconComp size={12} strokeWidth={2.5} />
                  </div>

                  {/* Memory text */}
                  <div className="flex-1 min-w-0">
                    {eventType === 'UPDATE' && action.previous_memory ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-start gap-2">
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                              color: 'var(--color-danger)',
                            }}
                          >OLD</span>
                          <span className="text-xs leading-relaxed line-through opacity-60" style={{ color: 'var(--color-text-secondary)' }}>
                            {action.previous_memory}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                              color: 'var(--color-success)',
                            }}
                          >NEW</span>
                          <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                            {action.memory ?? '-'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                        {action.memory ?? '-'}
                      </span>
                    )}
                  </div>

                  {/* Copy button */}
                  {action.memory && <CopyButton text={action.memory} />}
                </div>
              );
            })}
          </div>
        ) : summaryTotalCount > 0 ? (
          /* Fallback: show counts from event_summary */
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              {summaryAddCount > 0 && (
                <EventPill icon={Plus} count={summaryAddCount} color="success" />
              )}
              {summaryUpdateCount > 0 && (
                <EventPill icon={RefreshCw} count={summaryUpdateCount} color="accent" />
              )}
              {summaryDeleteCount > 0 && (
                <EventPill icon={Minus} count={summaryDeleteCount} color="danger" />
              )}
              {!summaryAddCount && !summaryUpdateCount && !summaryDeleteCount && (
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('requests.n_memories_processed', { count: summaryTotalCount })}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {t('requests.actions_detail_unavailable')}
            </p>
          </div>
        ) : (
          <EmptyTabState message={t('requests.no_memory_actions')} />
        )}
      </div>
    </div>
  );
}

// --- SEARCH/RECALL request: Retrieved memories ---
function SearchActionsTab({ data, t }: { data: RequestData; t: TFunction }) {
  const memories = data.retrieved_memories
    ? [...data.retrieved_memories].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : null;

  if (!memories || memories.length === 0) {
    return <EmptyTabState message={t('requests.no_retrieved_memories')} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Search size={12} />
        {t('requests.retrieved_memories')} ({memories.length})
      </h3>
      <div className="flex flex-col gap-2">
        {memories.map((mem, i) => (
          <div
            key={mem.id ?? i}
            className="flex items-start gap-3 p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* Score badge */}
            {mem.score != null && (
              <span
                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 mt-0.5"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-purple) 15%, transparent)',
                  color: 'var(--color-purple)',
                }}
              >
                {typeof mem.score === 'number' ? mem.score.toFixed(3) : mem.score}
              </span>
            )}
            {/* Memory text */}
            <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--color-text-primary)' }}>
              {mem.memory ?? JSON.stringify(mem, null, 2)}
            </span>
            {/* Copy */}
            {mem.memory && <CopyButton text={mem.memory} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- GET_ALL request: just show count ---
function GetAllActionsTab({ data, t }: { data: RequestData; t: TFunction }) {
  const summary = typeof data.event_summary === 'object' && data.event_summary !== null
    ? data.event_summary
    : null;
  const returned = (summary?.returned as number) ?? 0;
  const total = summary?.total as number | undefined;

  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <List size={28} style={{ color: 'var(--color-warning)' }} />
      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {total != null
          ? t('requests.n_of_total_returned', { count: returned, total })
          : t('requests.n_memories_returned', { count: returned })}
      </span>
    </div>
  );
}

function EmptyTabState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {message}
      </span>
    </div>
  );
}
