import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, RefreshCw, Trash2, ThumbsUp, ThumbsDown, AlertTriangle,
  MessageSquare, User, Bot,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { Memory } from '../../lib/types';
import Button from '../ui/Button';

interface SourceMessage {
  role?: string;
  content?: string;
  [key: string]: unknown;
}

interface HistoryEntry {
  id?: string;
  old_memory?: string;
  new_memory?: string;
  event?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface FeedbackEntry {
  id?: string;
  user_id?: string;
  feedback?: string;
  reason?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface MemoryDetailSidebarProps {
  memory: Memory;
  onClose: () => void;
  onDeleted?: () => void;
  onReclassified?: () => void;
}

type TabKey = 'details' | 'source' | 'history' | 'feedback';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const { t } = useTranslation();
  if (!confidence) return null;

  const colorMap: Record<string, { bg: string; text: string }> = {
    high: { bg: 'var(--color-success)', text: 'var(--color-bg-primary)' },
    medium: { bg: 'var(--color-warning)', text: 'var(--color-text-primary)' },
    low: { bg: 'var(--color-danger)', text: 'var(--color-bg-primary)' },
  };
  const colors = colorMap[confidence] || { bg: 'var(--color-bg-tertiary)', text: 'var(--color-text-primary)' };
  const labelKey = `memories.confidence_${confidence}` as const;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {t(labelKey)}
    </span>
  );
}

function CategoryBadges({ category }: { category?: string[] }) {
  if (!category || category.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {category.map((cat) => (
        <span
          key={cat}
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {cat}
        </span>
      ))}
    </div>
  );
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
    >
      {tag}
    </span>
  );
}

function MetadataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className="text-xs font-medium w-28 shrink-0" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <div className="text-sm flex-1 min-w-0" style={{ color: 'var(--color-text-primary)' }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Details Tab                                                        */
/* ------------------------------------------------------------------ */
function DetailsTab({ memory, onDelete, onReclassify, isDeleting, isReclassifying }: {
  memory: Memory;
  onDelete: () => void;
  onReclassify: () => void;
  isDeleting: boolean;
  isReclassifying: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {/* Full memory text */}
      <div>
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {t('memories.memory_text')}
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {memory.memory}
        </p>
      </div>

      {/* Metadata */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('memories.metadata')}
        </div>
        <div>
          <MetadataRow label={t('memories.category')}>
            <CategoryBadges category={memory.category} />
          </MetadataRow>
          {memory.subcategory && (
            <MetadataRow label={t('memories.subcategory')}>
              {memory.subcategory}
            </MetadataRow>
          )}
          {memory.tags && memory.tags.length > 0 && (
            <MetadataRow label={t('memories.tags')}>
              <div className="flex flex-wrap gap-1">
                {memory.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
              </div>
            </MetadataRow>
          )}
          <MetadataRow label={t('memories.confidence')}>
            <ConfidenceBadge confidence={memory.confidence} />
          </MetadataRow>
          {memory.importance_score !== undefined && (
            <MetadataRow label={t('memories.importance_score')}>
              {memory.importance_score.toFixed(2)}
            </MetadataRow>
          )}
          {memory.classified_by && (
            <MetadataRow label={t('memories.classified_by')}>
              {memory.classified_by}
            </MetadataRow>
          )}
          {memory.user_id && (
            <MetadataRow label={t('memories.user_id')}>
              <span className="font-mono text-xs">{memory.user_id}</span>
            </MetadataRow>
          )}
          {memory.agent_id && (
            <MetadataRow label={t('memories.agent_id')}>
              <span className="font-mono text-xs">{memory.agent_id}</span>
            </MetadataRow>
          )}
          {memory.run_id && (
            <MetadataRow label={t('memories.run_id')}>
              <span className="font-mono text-xs">{memory.run_id}</span>
            </MetadataRow>
          )}
          <MetadataRow label={t('memories.created_at')}>
            {formatDate(memory.created_at)}
          </MetadataRow>
          <MetadataRow label={t('memories.updated_at')}>
            {formatDate(memory.updated_at)}
          </MetadataRow>
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('memories.actions')}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={isReclassifying}
            onClick={onReclassify}
          >
            {t('memories.reclassify')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            loading={isDeleting}
            onClick={onDelete}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Tab                                                          */
/* ------------------------------------------------------------------ */
function SourceTab({ memoryId }: { memoryId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['memory-source', memoryId],
    queryFn: () => api.getMemorySource(memoryId),
  });

  if (isLoading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</div>;
  }
  if (error) {
    return <div className="text-sm" style={{ color: 'var(--color-danger)' }}>{t('common.error')}</div>;
  }

  const allMessages: SourceMessage[] = [];
  for (const entry of (data?.results || [])) {
    const msgs = (entry as Record<string, unknown>).messages;
    if (Array.isArray(msgs)) {
      allMessages.push(...(msgs as SourceMessage[]));
    }
  }
  const messages = allMessages;
  if (messages.length === 0) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_source')}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, i) => (
        <div
          key={i}
          className="rounded-lg p-3"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            {msg.role === 'user' ? (
              <User size={14} style={{ color: 'var(--color-accent)' }} />
            ) : (
              <Bot size={14} style={{ color: 'var(--color-success)' }} />
            )}
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-success)',
                color: '#fff',
              }}
            >
              {msg.role || 'unknown'}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>
            {msg.content || ''}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  History Tab                                                        */
/* ------------------------------------------------------------------ */
function HistoryTab({ memoryId }: { memoryId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['memory-history', memoryId],
    queryFn: () => api.getMemoryHistory(memoryId),
  });

  if (isLoading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</div>;
  }
  if (error) {
    return <div className="text-sm" style={{ color: 'var(--color-danger)' }}>{t('common.error')}</div>;
  }

  const entries = (data?.results || []) as HistoryEntry[];
  if (entries.length === 0) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_history')}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, i) => (
        <div
          key={entry.id || i}
          className="rounded-lg p-3"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--color-info)', color: '#fff' }}
            >
              {entry.event || 'update'}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {formatDate(entry.created_at)}
            </span>
          </div>
          {entry.old_memory && (
            <div className="mb-1">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Old: </span>
              <span className="text-sm line-through" style={{ color: 'var(--color-text-secondary)' }}>
                {entry.old_memory}
              </span>
            </div>
          )}
          {entry.new_memory && (
            <div>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>New: </span>
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {entry.new_memory}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feedback Tab                                                       */
/* ------------------------------------------------------------------ */
function FeedbackTab({ memoryId, userId }: { memoryId: string; userId?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [feedbackType, setFeedbackType] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['memory-feedback', memoryId],
    queryFn: () => api.getFeedback(memoryId),
  });

  const handleSubmit = async () => {
    if (!feedbackType) return;
    setSubmitting(true);
    try {
      await api.submitFeedback(memoryId, userId || '', feedbackType, reason || undefined);
      setFeedbackType('');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['memory-feedback', memoryId] });
    } finally {
      setSubmitting(false);
    }
  };

  const feedbacks = (data?.feedbacks || []) as FeedbackEntry[];

  return (
    <div className="flex flex-col gap-4">
      {/* Submit form */}
      <div
        className="rounded-lg p-3"
        style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
      >
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('feedback.submit')}
        </div>
        <div className="flex gap-2 mb-2">
          <button
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: feedbackType === 'positive' ? 'var(--color-success)' : 'var(--color-bg-hover)',
              color: feedbackType === 'positive' ? '#fff' : 'var(--color-text-secondary)',
            }}
            onClick={() => setFeedbackType('positive')}
          >
            <ThumbsUp size={12} />
            {t('feedback.positive')}
          </button>
          <button
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: feedbackType === 'negative' ? 'var(--color-warning)' : 'var(--color-bg-hover)',
              color: feedbackType === 'negative' ? '#fff' : 'var(--color-text-secondary)',
            }}
            onClick={() => setFeedbackType('negative')}
          >
            <ThumbsDown size={12} />
            {t('feedback.negative')}
          </button>
          <button
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: feedbackType === 'very_negative' ? 'var(--color-danger)' : 'var(--color-bg-hover)',
              color: feedbackType === 'very_negative' ? '#fff' : 'var(--color-text-secondary)',
            }}
            onClick={() => setFeedbackType('very_negative')}
          >
            <AlertTriangle size={12} />
            {t('feedback.very_negative')}
          </button>
        </div>
        <textarea
          className="w-full rounded-lg px-3 py-2 text-sm resize-none"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
          rows={2}
          placeholder={t('feedback.reason_placeholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            icon={MessageSquare}
            loading={submitting}
            disabled={!feedbackType}
            onClick={handleSubmit}
          >
            {t('feedback.submit')}
          </Button>
        </div>
      </div>

      {/* Existing feedbacks */}
      {isLoading && (
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</div>
      )}
      {error && (
        <div className="text-sm" style={{ color: 'var(--color-danger)' }}>{t('common.error')}</div>
      )}
      {!isLoading && feedbacks.length === 0 && (
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_feedback')}</div>
      )}
      {feedbacks.map((fb, i) => {
        const fbColorMap: Record<string, string> = {
          positive: 'var(--color-success)',
          negative: 'var(--color-warning)',
          very_negative: 'var(--color-danger)',
        };
        return (
          <div
            key={fb.id || i}
            className="rounded-lg p-3"
            style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: fbColorMap[fb.feedback || ''] || 'var(--color-bg-hover)',
                  color: '#fff',
                }}
              >
                {fb.feedback}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {formatDate(fb.created_at)}
              </span>
            </div>
            {fb.reason && (
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{fb.reason}</p>
            )}
            {fb.user_id && (
              <p className="text-xs mt-1 font-mono" style={{ color: 'var(--color-text-muted)' }}>{fb.user_id}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Sidebar                                                       */
/* ------------------------------------------------------------------ */
export default function MemoryDetailSidebar({ memory, onClose, onDeleted, onReclassified }: MemoryDetailSidebarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(t('memories.delete_confirm'))) return;
    setIsDeleting(true);
    try {
      await api.deleteMemory(memory.id);
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      onDeleted?.();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReclassify = async () => {
    setIsReclassifying(true);
    try {
      await api.reclassify(memory.id);
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      onReclassified?.();
    } finally {
      setIsReclassifying(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details', label: t('memories.details_tab') },
    { key: 'source', label: t('memories.source_tab') },
    { key: 'history', label: t('memories.history_tab') },
    { key: 'feedback', label: t('memories.feedback_tab') },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <div
        className="fixed top-0 right-0 h-full w-[440px] z-50 flex flex-col shadow-xl"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderLeft: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('memories.detail')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex shrink-0 px-5 gap-1"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className="px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer"
              style={{
                color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'details' && (
            <DetailsTab
              memory={memory}
              onDelete={handleDelete}
              onReclassify={handleReclassify}
              isDeleting={isDeleting}
              isReclassifying={isReclassifying}
            />
          )}
          {activeTab === 'source' && <SourceTab memoryId={memory.id} />}
          {activeTab === 'history' && <HistoryTab memoryId={memory.id} />}
          {activeTab === 'feedback' && <FeedbackTab memoryId={memory.id} userId={memory.user_id} />}
        </div>
      </div>
    </>
  );
}
