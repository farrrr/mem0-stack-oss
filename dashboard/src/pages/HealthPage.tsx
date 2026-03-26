import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { api } from '../lib/api.ts';
import PageHeader from '../components/ui/PageHeader.tsx';
import Card from '../components/ui/Card.tsx';
import LoadingState from '../components/ui/LoadingState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';

interface HealthResult {
  status: string;
  responseTime: number;
  checkedAt: Date;
}

export default function HealthPage() {
  const { t } = useTranslation();
  const lastResult = useRef<HealthResult | null>(null);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<HealthResult> => {
      const start = performance.now();
      const result = await api.health();
      const responseTime = Math.round(performance.now() - start);
      return {
        status: result.status,
        responseTime,
        checkedAt: new Date(),
      };
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  if (data) {
    lastResult.current = data;
  }

  const isHealthy = data?.status === 'ok';
  const displayData = data || lastResult.current;

  return (
    <div>
      <PageHeader
        title={t('health.title')}
        subtitle={t('health.auto_refresh')}
      />

      {isLoading && !displayData && (
        <LoadingState message={t('health.checking')} />
      )}

      {isError && !displayData && (
        <ErrorState
          message={(error as Error)?.message || t('common.error')}
          onRetry={() => { void refetch(); }}
        />
      )}

      {displayData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Status Card */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <Activity size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {t('health.status')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: isHealthy ? 'var(--color-success)' : 'var(--color-danger)',
                  boxShadow: `0 0 8px ${isHealthy ? 'var(--color-success)' : 'var(--color-danger)'}`,
                }}
              />
              <span
                className="text-lg font-semibold"
                style={{ color: isHealthy ? 'var(--color-success)' : 'var(--color-danger)' }}
              >
                {isHealthy ? t('health.ok') : t('health.error')}
              </span>
              {isLoading && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t('health.checking')}
                </span>
              )}
            </div>
          </Card>

          {/* Response Time Card */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {t('health.response_time')}
              </span>
            </div>
            <span
              className="text-2xl font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {displayData.responseTime}
              <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>
                ms
              </span>
            </span>
          </Card>

          {/* Last Checked Card */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {t('health.last_check')}
              </span>
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {dataUpdatedAt
                ? new Date(dataUpdatedAt).toLocaleTimeString()
                : displayData.checkedAt.toLocaleTimeString()}
            </span>
          </Card>
        </div>
      )}
    </div>
  );
}
