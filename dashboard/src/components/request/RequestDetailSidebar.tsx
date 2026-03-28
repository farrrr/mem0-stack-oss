import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { X, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/utils.ts';
import Badge from '../ui/Badge.tsx';

interface RequestDetailSidebarProps {
  requestId: string;
  onClose: () => void;
}

interface RequestData {
  request_type?: string;
  user_id?: string;
  run_id?: string;
  latency_ms?: number;
  status_code?: number;
  created_at?: string;
  req_payload?: unknown;
  event_summary?: Record<string, unknown> | string | null;
  memory_actions?: Record<string, unknown>[];
  retrieved_memories?: Record<string, unknown>[];
  error_msg?: string;
}

const typeColors: Record<string, 'green' | 'blue' | 'purple'> = {
  ADD: 'green',
  SEARCH: 'blue',
  RECALL: 'purple',
};

export default function RequestDetailSidebar({ requestId, onClose }: RequestDetailSidebarProps) {
  const { t } = useTranslation();

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
        className="fixed top-0 right-0 h-full w-[440px] z-50 overflow-y-auto flex flex-col"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('requests.detail')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

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

          {data && <RequestContent data={data} t={t} />}
        </div>
      </div>
    </>
  );
}

function RequestContent({ data, t }: { data: RequestData; t: TFunction }) {
  const payloadStr = data.req_payload != null
    ? (typeof data.req_payload === 'string'
        ? data.req_payload
        : JSON.stringify(data.req_payload, null, 2))
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Metadata fields */}
      <div className="flex flex-col gap-3">
        <DetailRow label={t('requests.request_type')}>
          <Badge
            label={data.request_type ?? ''}
            color={typeColors[data.request_type ?? ''] ?? 'blue'}
          />
        </DetailRow>
        <DetailRow label={t('requests.user')}>
          <span className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {data.user_id ?? '-'}
          </span>
        </DetailRow>
        <DetailRow label={t('requests.run_id')}>
          <span className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {data.run_id ?? '-'}
          </span>
        </DetailRow>
        <DetailRow label={t('requests.latency_ms')}>
          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {data.latency_ms != null ? `${data.latency_ms.toFixed(0)} ms` : '-'}
          </span>
        </DetailRow>
        <DetailRow label={t('requests.status_code')}>
          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {data.status_code != null ? String(data.status_code) : '-'}
          </span>
        </DetailRow>
        <DetailRow label={t('requests.created_at')}>
          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {data.created_at ? formatDateTime(data.created_at) : '-'}
          </span>
        </DetailRow>
      </div>

      {/* Request payload */}
      {payloadStr != null && (
        <Section title={t('requests.payload')}>
          <pre
            className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {payloadStr}
          </pre>
        </Section>
      )}

      {/* Event summary */}
      {data.event_summary != null && (
        <Section title={t('requests.event_summary')}>
          <pre
            className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {typeof data.event_summary === 'object'
              ? JSON.stringify(data.event_summary, null, 2)
              : data.event_summary}
          </pre>
        </Section>
      )}

      {/* Memory actions */}
      {data.memory_actions != null && data.memory_actions.length > 0 && (
        <Section title={t('requests.memory_actions')}>
          <div className="flex flex-col gap-2">
            {data.memory_actions.map((action, i) => (
              <div
                key={i}
                className="text-xs p-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(action, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Retrieved memories */}
      {data.retrieved_memories != null && data.retrieved_memories.length > 0 && (
        <Section title={t('requests.retrieved_memories')}>
          <div className="flex flex-col gap-2">
            {data.retrieved_memories.map((mem, i) => (
              <div
                key={i}
                className="text-xs p-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(mem, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Error message */}
      {data.error_msg != null && (
        <Section title={t('requests.error_msg')}>
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
              color: 'var(--color-danger)',
              border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)',
            }}
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{data.error_msg}</span>
          </div>
        </Section>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
