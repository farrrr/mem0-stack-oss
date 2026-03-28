import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Wrench, Key, CheckCircle, AlertCircle, TrendingDown, Copy, Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { api } from '../lib/api.ts';
import { DEFAULT_USER_ID } from '../lib/constants.ts';
import { truncate } from '../lib/utils.ts';
import Card from '../components/ui/Card.tsx';
import Badge from '../components/ui/Badge.tsx';
import Button from '../components/ui/Button.tsx';
import Modal from '../components/ui/Modal.tsx';

export default function MaintenancePage() {
  const { t } = useTranslation();
  const { hasMaintenanceKey, setMaintenanceKey } = useAuth();
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const ensureKey = useCallback((): boolean => {
    if (hasMaintenanceKey) return true;
    setShowKeyModal(true);
    return false;
  }, [hasMaintenanceKey]);

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
          {t('maintenance.title')}
        </h1>
      </div>

      {/* Key status bar */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2">
          {hasMaintenanceKey ? (
            <>
              <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
              <span className="text-sm" style={{ color: 'var(--color-success)' }}>
                {t('maintenance.key_status_stored')}
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={16} style={{ color: 'var(--color-warning)' }} />
              <span className="text-sm" style={{ color: 'var(--color-warning)' }}>
                {t('maintenance.key_status_missing')}
              </span>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" icon={Key} onClick={() => setShowKeyModal(true)}>
          {t('maintenance.set_key')}
        </Button>
      </div>

      {/* Decay Card */}
      <DecaySection ensureKey={ensureKey} />

      {/* Dedup Card */}
      <DedupSection ensureKey={ensureKey} />

      {/* Cleanup Card */}
      <CleanupSection ensureKey={ensureKey} />

      {/* Key Modal */}
      {showKeyModal && (
        <Modal onClose={() => setShowKeyModal(false)} title={t('maintenance.enter_key')}>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t('maintenance.key_placeholder')}
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
    </div>
  );
}

/* ====== Decay Section ====== */

interface DecayResult {
  id: string;
  memory: string;
  current_score: number;
  new_score: number;
}

function DecaySection({ ensureKey }: { ensureKey: () => boolean }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [lambda, setLambda] = useState(0.01);
  const [previewResults, setPreviewResults] = useState<DecayResult[] | null>(null);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const previewMutation = useMutation({
    mutationFn: () => api.decay(userId, true, lambda),
    onSuccess: (data) => {
      const results = (data as Record<string, unknown>)?.results ?? data;
      setPreviewResults(Array.isArray(results) ? results as DecayResult[] : []);
      setHasPreviewed(true);
      setSuccessMsg('');
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => api.decay(userId, false, lambda),
    onSuccess: (data) => {
      const results = (data as Record<string, unknown>)?.results ?? data;
      const count = Array.isArray(results) ? results.length : 0;
      setSuccessMsg(t('maintenance.execute_success', { count }));
      setPreviewResults(null);
      setHasPreviewed(false);
      setShowConfirm(false);
    },
  });

  const handlePreview = () => {
    if (!ensureKey()) return;
    if (!userId.trim()) return;
    previewMutation.mutate();
  };

  const handleExecute = () => {
    if (!ensureKey()) return;
    setShowConfirm(true);
  };

  return (
    <Card title={t('maintenance.decay')}>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {t('maintenance.decay_desc')}
      </p>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setHasPreviewed(false); setPreviewResults(null); }}
            placeholder={t('maintenance.user_id')}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium shrink-0 w-20" style={{ color: 'var(--color-text-muted)' }}>
            {t('maintenance.lambda')}: {lambda.toFixed(3)}
          </label>
          <input
            type="range"
            min={0.001}
            max={0.1}
            step={0.001}
            value={lambda}
            onChange={(e) => { setLambda(parseFloat(e.target.value)); setHasPreviewed(false); }}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={TrendingDown}
            onClick={handlePreview}
            loading={previewMutation.isPending}
            disabled={!userId.trim()}
          >
            {t('maintenance.dry_run')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Wrench}
            onClick={handleExecute}
            disabled={!hasPreviewed}
            loading={executeMutation.isPending}
          >
            {t('maintenance.execute')}
          </Button>
        </div>
      </div>

      {successMsg && (
        <div
          className="rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
            color: 'var(--color-success)',
            border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
          }}
        >
          {successMsg}
        </div>
      )}

      {previewMutation.error && (
        <div
          className="rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {previewMutation.error.message}
        </div>
      )}

      {previewResults && previewResults.length > 0 && (
        <ResultTable>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <Th>ID</Th>
              <Th>{t('maintenance.memory')}</Th>
              <Th>{t('maintenance.current_score')}</Th>
              <Th>{t('maintenance.new_score')}</Th>
            </tr>
          </thead>
          <tbody>
            {previewResults.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <Td mono>{truncate(r.id, 12)}</Td>
                <Td>{truncate(r.memory || '', 40)}</Td>
                <Td>{typeof r.current_score === 'number' ? r.current_score.toFixed(3) : '-'}</Td>
                <Td>{typeof r.new_score === 'number' ? r.new_score.toFixed(3) : '-'}</Td>
              </tr>
            ))}
          </tbody>
        </ResultTable>
      )}

      {previewResults && previewResults.length === 0 && (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
          {t('maintenance.no_results')}
        </p>
      )}

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} title={t('common.confirm')}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            {t('maintenance.execute_confirm', { count: previewResults?.length ?? 0 })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => executeMutation.mutate()}
              loading={executeMutation.isPending}
            >
              {t('maintenance.execute')}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ====== Dedup Section ====== */

interface DedupResult {
  keep_id: string;
  keep_memory: string;
  delete_id: string;
  delete_memory: string;
  similarity: number;
}

function DedupSection({ ensureKey }: { ensureKey: () => boolean }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [threshold, setThreshold] = useState(0.95);
  const [previewResults, setPreviewResults] = useState<DedupResult[] | null>(null);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const previewMutation = useMutation({
    mutationFn: () => api.dedup(userId, true, threshold),
    onSuccess: (data) => {
      const results = (data as Record<string, unknown>)?.results ?? data;
      setPreviewResults(Array.isArray(results) ? results as DedupResult[] : []);
      setHasPreviewed(true);
      setSuccessMsg('');
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => api.dedup(userId, false, threshold),
    onSuccess: (data) => {
      const results = (data as Record<string, unknown>)?.results ?? data;
      const count = Array.isArray(results) ? results.length : 0;
      setSuccessMsg(t('maintenance.execute_success', { count }));
      setPreviewResults(null);
      setHasPreviewed(false);
      setShowConfirm(false);
    },
  });

  const handlePreview = () => {
    if (!ensureKey()) return;
    if (!userId.trim()) return;
    previewMutation.mutate();
  };

  const handleExecute = () => {
    if (!ensureKey()) return;
    setShowConfirm(true);
  };

  return (
    <Card title={t('maintenance.dedup')}>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {t('maintenance.dedup_desc')}
      </p>

      <div className="flex flex-col gap-3 mb-4">
        <input
          type="text"
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setHasPreviewed(false); setPreviewResults(null); }}
          placeholder={t('maintenance.user_id')}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
        />

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium shrink-0 w-28" style={{ color: 'var(--color-text-muted)' }}>
            {t('maintenance.threshold')}: {threshold.toFixed(2)}
          </label>
          <input
            type="range"
            min={0.80}
            max={1.00}
            step={0.01}
            value={threshold}
            onChange={(e) => { setThreshold(parseFloat(e.target.value)); setHasPreviewed(false); }}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Copy}
            onClick={handlePreview}
            loading={previewMutation.isPending}
            disabled={!userId.trim()}
          >
            {t('maintenance.dry_run')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Wrench}
            onClick={handleExecute}
            disabled={!hasPreviewed}
            loading={executeMutation.isPending}
          >
            {t('maintenance.execute')}
          </Button>
        </div>
      </div>

      {successMsg && (
        <div
          className="rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
            color: 'var(--color-success)',
            border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
          }}
        >
          {successMsg}
        </div>
      )}

      {previewMutation.error && (
        <div
          className="rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {previewMutation.error.message}
        </div>
      )}

      {previewResults && previewResults.length > 0 && (
        <ResultTable>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <Th>{t('maintenance.keep')}</Th>
              <Th>{t('maintenance.delete_memory')}</Th>
              <Th>{t('maintenance.similarity')}</Th>
            </tr>
          </thead>
          <tbody>
            {previewResults.map((r) => (
              <tr key={`${r.keep_id}-${r.delete_id}`} style={{ borderTop: '1px solid var(--color-border)' }}>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {truncate(r.keep_id || '', 12)}
                    </span>
                    <span>{truncate(r.keep_memory || '', 40)}</span>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {truncate(r.delete_id || '', 12)}
                    </span>
                    <span>{truncate(r.delete_memory || '', 40)}</span>
                  </div>
                </Td>
                <Td>{typeof r.similarity === 'number' ? r.similarity.toFixed(3) : '-'}</Td>
              </tr>
            ))}
          </tbody>
        </ResultTable>
      )}

      {previewResults && previewResults.length === 0 && (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
          {t('maintenance.no_results')}
        </p>
      )}

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} title={t('common.confirm')}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            {t('maintenance.execute_confirm', { count: previewResults?.length ?? 0 })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => executeMutation.mutate()}
              loading={executeMutation.isPending}
            >
              {t('maintenance.execute')}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ====== Cleanup Section ====== */

interface CleanupResult {
  id: string;
  memory: string;
  reason: string;
}

function CleanupSection({ ensureKey }: { ensureKey: () => boolean }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [importanceThreshold, setImportanceThreshold] = useState(0.1);
  const [previewResults, setPreviewResults] = useState<CleanupResult[] | null>(null);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const previewMutation = useMutation({
    mutationFn: () => api.cleanupExpired(userId, true),
    onSuccess: (data) => {
      const results = (data as Record<string, unknown>)?.results ?? data;
      setPreviewResults(Array.isArray(results) ? results as CleanupResult[] : []);
      setHasPreviewed(true);
      setSuccessMsg('');
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => api.cleanupExpired(userId, false),
    onSuccess: (data) => {
      const results = (data as Record<string, unknown>)?.results ?? data;
      const count = Array.isArray(results) ? results.length : 0;
      setSuccessMsg(t('maintenance.execute_success', { count }));
      setPreviewResults(null);
      setHasPreviewed(false);
      setShowConfirm(false);
    },
  });

  const handlePreview = () => {
    if (!ensureKey()) return;
    if (!userId.trim()) return;
    previewMutation.mutate();
  };

  const handleExecute = () => {
    if (!ensureKey()) return;
    setShowConfirm(true);
  };

  const reasonColor = (reason: string): 'yellow' | 'orange' => {
    return reason === 'expired' ? 'yellow' : 'orange';
  };

  const reasonLabel = (reason: string): string => {
    return reason === 'expired' ? t('maintenance.expired') : t('maintenance.low_importance');
  };

  return (
    <Card title={t('maintenance.cleanup')}>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {t('maintenance.cleanup_desc')}
      </p>

      <div className="flex flex-col gap-3 mb-4">
        <input
          type="text"
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setHasPreviewed(false); setPreviewResults(null); }}
          placeholder={t('maintenance.user_id')}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
        />

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium shrink-0 w-36" style={{ color: 'var(--color-text-muted)' }}>
            {t('maintenance.importance_threshold')}: {importanceThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            min={0.0}
            max={0.5}
            step={0.01}
            value={importanceThreshold}
            onChange={(e) => { setImportanceThreshold(parseFloat(e.target.value)); setHasPreviewed(false); }}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Trash2}
            onClick={handlePreview}
            loading={previewMutation.isPending}
            disabled={!userId.trim()}
          >
            {t('maintenance.dry_run')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Wrench}
            onClick={handleExecute}
            disabled={!hasPreviewed}
            loading={executeMutation.isPending}
          >
            {t('maintenance.execute')}
          </Button>
        </div>
      </div>

      {successMsg && (
        <div
          className="rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
            color: 'var(--color-success)',
            border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
          }}
        >
          {successMsg}
        </div>
      )}

      {previewMutation.error && (
        <div
          className="rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {previewMutation.error.message}
        </div>
      )}

      {previewResults && previewResults.length > 0 && (
        <ResultTable>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <Th>ID</Th>
              <Th>{t('maintenance.memory')}</Th>
              <Th>{t('maintenance.reason')}</Th>
            </tr>
          </thead>
          <tbody>
            {previewResults.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <Td mono>{truncate(r.id, 12)}</Td>
                <Td>{truncate(r.memory || '', 50)}</Td>
                <Td>
                  <Badge label={reasonLabel(r.reason)} color={reasonColor(r.reason)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </ResultTable>
      )}

      {previewResults && previewResults.length === 0 && (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
          {t('maintenance.no_results')}
        </p>
      )}

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} title={t('common.confirm')}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            {t('maintenance.execute_confirm', { count: previewResults?.length ?? 0 })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => executeMutation.mutate()}
              loading={executeMutation.isPending}
            >
              {t('maintenance.execute')}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ====== Shared UI Helpers ====== */

function ResultTable({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden overflow-x-auto"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left px-3 py-2.5 text-xs font-semibold"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      className={`px-3 py-2.5 ${mono ? 'font-mono' : ''}`}
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {children}
    </td>
  );
}
