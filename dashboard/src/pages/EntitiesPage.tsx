import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Users, Bot, AppWindow, Play, Trash2, ExternalLink,
  ChevronLeft, ChevronRight, Key, CheckCircle, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { api } from '../lib/api.ts';
import { formatRelativeTime } from '../lib/utils.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import type { LucideIcon } from 'lucide-react';

const PAGE_SIZE = 50;

type EntityType = 'user' | 'agent' | 'app' | 'run';

const tabConfig: Array<{ type: EntityType; labelKey: string; icon: LucideIcon }> = [
  { type: 'user', labelKey: 'entities.tab_users', icon: Users },
  { type: 'agent', labelKey: 'entities.tab_agents', icon: Bot },
  { type: 'app', labelKey: 'entities.tab_apps', icon: AppWindow },
  { type: 'run', labelKey: 'entities.tab_runs', icon: Play },
];

interface EntityItem {
  id: string;
  memory_count: number;
  last_updated: string;
}

export default function EntitiesPage() {
  const { t } = useTranslation();
  const { hasMaintenanceKey, setMaintenanceKey } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<EntityType>('user');
  const [offset, setOffset] = useState(0);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EntityItem | null>(null);
  const [agentUserId, setAgentUserId] = useState('');

  // If no maintenance key, show modal first time
  const ensureKey = useCallback((): boolean => {
    if (hasMaintenanceKey) return true;
    setShowKeyModal(true);
    return false;
  }, [hasMaintenanceKey]);

  const handleTabChange = (tab: EntityType) => {
    setActiveTab(tab);
    setOffset(0);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['entities', activeTab, offset],
    queryFn: () => api.getEntitiesByType(activeTab, PAGE_SIZE, offset),
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

  const handleDelete = (entity: EntityItem) => {
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

  const handleKeySubmit = () => {
    if (keyInput.trim()) {
      setMaintenanceKey(keyInput.trim());
      setKeyInput('');
      setShowKeyModal(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t('entities.title')}
        </h1>

        {/* Key status */}
        <div className="flex items-center gap-2">
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
          <Button variant="ghost" size="sm" icon={Key} onClick={() => setShowKeyModal(true)}>
            {t('entities.set_key')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-0 rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {tabConfig.map(({ type, labelKey, icon: Icon }) => (
          <button
            key={type}
            onClick={() => handleTabChange(type)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer flex-1 justify-center"
            style={{
              backgroundColor: activeTab === type ? 'var(--color-bg-hover)' : 'var(--color-bg-secondary)',
              color: activeTab === type ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            <Icon size={15} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      {!hasMaintenanceKey && (
        <Card>
          <div className="flex flex-col items-center gap-4 py-8">
            <Key size={32} style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('maintenance.maintenance_key_required')}
            </p>
            <Button variant="primary" size="sm" icon={Key} onClick={() => setShowKeyModal(true)}>
              {t('entities.set_key')}
            </Button>
          </div>
        </Card>
      )}

      {hasMaintenanceKey && isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
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
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  >
                    <td
                      className="px-4 py-3 font-mono text-xs"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {entity.id}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {entity.memory_count ?? '-'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>
                      {entity.last_updated ? formatRelativeTime(entity.last_updated) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/?${activeTab}_id=${entity.id}`}
                          className="flex items-center gap-1 text-xs font-medium transition-colors"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          <ExternalLink size={12} />
                          {t('entities.view_memories')}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={() => handleDelete(entity)}
                        />
                      </div>
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
        <Modal onClose={() => setShowKeyModal(false)}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            {t('entities.enter_key')}
          </h3>
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
        <Modal onClose={() => { setDeleteTarget(null); setAgentUserId(''); }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
            {t('common.confirm')}
          </h3>
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

/* Reusable modal overlay */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[400px] rounded-xl p-5"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
        }}
      >
        {children}
      </div>
    </>
  );
}
