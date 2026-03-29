import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Bot, AppWindow, Play, Trash2, RefreshCw,
  ChevronLeft, ChevronRight, Key, CheckCircle, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { api } from '../lib/api.ts';
import { formatRelativeTime } from '../lib/utils.ts';
import Button from '../components/ui/Button.tsx';
import Modal from '../components/ui/Modal.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import type { LucideIcon } from 'lucide-react';

const PAGE_SIZE = 50;

type EntityType = 'user' | 'agent' | 'app' | 'run';

const ENTITY_TYPES: EntityType[] = ['user', 'run', 'agent', 'app'];

const entityConfig: Record<EntityType, { labelKey: string; icon: LucideIcon; paramKey: string }> = {
  user: { labelKey: 'entities.tab_users', icon: Users, paramKey: 'user_id' },
  run: { labelKey: 'entities.tab_runs', icon: Play, paramKey: 'run_id' },
  agent: { labelKey: 'entities.tab_agents', icon: Bot, paramKey: 'agent_id' },
  app: { labelKey: 'entities.tab_apps', icon: AppWindow, paramKey: 'app_id' },
};

type DateRange = '' | '1' | '7' | '30';
const DATE_RANGES: { key: DateRange; labelKey: string }[] = [
  { key: '', labelKey: 'entities.date_all' },
  { key: '1', labelKey: 'entities.date_1d' },
  { key: '7', labelKey: 'entities.date_7d' },
  { key: '30', labelKey: 'entities.date_30d' },
];

interface EntityItem {
  id: string;
  memory_count: number;
  updated_at: string;
}

export default function EntitiesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasMaintenanceKey, setMaintenanceKey } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<EntityType>('user');
  const [dateRange, setDateRange] = useState<DateRange>('');
  const [offset, setOffset] = useState(0);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EntityItem | null>(null);
  const [agentUserId, setAgentUserId] = useState('');

  const days = dateRange === '' ? undefined : Number(dateRange);

  const ensureKey = useCallback((): boolean => {
    if (hasMaintenanceKey) return true;
    setShowKeyModal(true);
    return false;
  }, [hasMaintenanceKey]);

  const resetOffset = () => setOffset(0);

  const handleTabChange = (tab: EntityType) => {
    setActiveTab(tab);
    resetOffset();
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['entities', activeTab, offset, days],
    queryFn: () => api.getEntitiesByType(activeTab, PAGE_SIZE, offset, days),
    enabled: hasMaintenanceKey,
    staleTime: 30_000,
  });

  const entities = (data?.entities ?? []) as EntityItem[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const deleteMutation = useMutation({
    mutationFn: (target: { type: EntityType; id: string; userId?: string }) =>
      api.deleteEntity(target.type, target.id, true, target.userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      setDeleteTarget(null);
      setAgentUserId('');
    },
  });

  const handleDelete = (e: React.MouseEvent, entity: EntityItem) => {
    e.stopPropagation();
    if (!ensureKey()) return;
    setDeleteTarget(entity);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({
      type: activeTab,
      id: deleteTarget.id,
      userId: activeTab === 'agent' ? agentUserId : undefined,
    });
  };

  const handleRowClick = (entity: EntityItem) => {
    const paramKey = entityConfig[activeTab].paramKey;
    navigate(`/memories?${paramKey}=${encodeURIComponent(entity.id)}`);
  };

  const handleKeySubmit = () => {
    if (keyInput.trim()) {
      setMaintenanceKey(keyInput.trim());
      setKeyInput('');
      setShowKeyModal(false);
    }
  };

  const ActiveIcon = entityConfig[activeTab].icon;

  return (
    <div className="flex flex-col gap-6">
      {/* Header row: title + date range */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t('entities.title')}
        </h1>
        <div className="flex items-center gap-3">
          {/* Key status */}
          {hasMaintenanceKey ? (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-success)' }}>
              <CheckCircle size={14} />
              {t('entities.key_status_stored')}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-warning)' }}>
              <AlertCircle size={14} />
              {t('entities.key_status_missing')}
            </div>
          )}
          <ToggleGroup
            options={DATE_RANGES.map((d) => ({ value: d.key, label: t(d.labelKey) }))}
            value={dateRange}
            onChange={(v) => { setDateRange(v as DateRange); resetOffset(); }}
          />
        </div>
      </div>

      {/* Entity type toggle + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ToggleGroup
          options={ENTITY_TYPES.map((typ) => ({
            value: typ,
            label: t(entityConfig[typ].labelKey),
          }))}
          value={activeTab}
          onChange={(v) => handleTabChange(v as EntityType)}
        />

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Key} onClick={() => setShowKeyModal(true)}>
            {t('entities.set_key')}
          </Button>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()}>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {!hasMaintenanceKey && (
        <div
          className="rounded-xl p-12 flex flex-col items-center gap-4"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Key size={32} style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('maintenance.maintenance_key_required')}
          </p>
          <Button variant="primary" size="sm" icon={Key} onClick={() => setShowKeyModal(true)}>
            {t('entities.set_key')}
          </Button>
        </div>
      )}

      {hasMaintenanceKey && isLoading && (
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

      {hasMaintenanceKey && error && (
        <div className="flex flex-col items-center gap-3 py-12">
          <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {t('common.error')}
          </span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {hasMaintenanceKey && !isLoading && !error && entities.length === 0 && (
        <EmptyState icon={Users} title={t('entities.no_results')} />
      )}

      {hasMaintenanceKey && !isLoading && !error && entities.length > 0 && (
        <>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                  {[
                    t('entities.entity_id'),
                    t('entities.memory_count'),
                    t('entities.last_updated'),
                    t('entities.actions'),
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
                {entities.map((entity) => (
                  <tr
                    key={entity.id}
                    className="cursor-pointer transition-colors"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                    onClick={() => handleRowClick(entity)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ActiveIcon size={14} style={{ color: 'var(--color-text-muted)' }} />
                        <span
                          className="font-mono text-xs font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {entity.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {entity.memory_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>
                      {entity.updated_at ? formatRelativeTime(entity.updated_at) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={(e) => handleDelete(e, entity)}
                      />
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

      {/* Maintenance Key Modal */}
      {showKeyModal && (
        <Modal onClose={() => setShowKeyModal(false)} title={t('entities.enter_key')}>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t('entities.key_placeholder')}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleKeySubmit(); }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowKeyModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleKeySubmit} disabled={!keyInput.trim()}>
              {t('common.confirm')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <Modal onClose={() => { setDeleteTarget(null); setAgentUserId(''); }} title={t('common.confirm')}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            {t('entities.delete_confirm')}
          </p>

          {activeTab === 'agent' && (
            <div className="mb-4">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
                {t('entities.delete_agent_confirm')}
              </label>
              <input
                type="text"
                value={agentUserId}
                onChange={(e) => setAgentUserId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
                autoFocus
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDeleteTarget(null); setAgentUserId(''); }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmDelete}
              loading={deleteMutation.isPending}
              disabled={activeTab === 'agent' && !agentUserId.trim()}
            >
              {t('common.delete')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- Toggle button group (same pattern as RequestsPage) ---
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
