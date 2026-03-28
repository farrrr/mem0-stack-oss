import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, RefreshCw, Trash2, ChevronUp, ChevronDown,
  Copy, Check, User, Bot, Play, AppWindow,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import type { Memory } from '../../lib/types';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SourceMessage {
  role?: string;
  content?: string;
  [key: string]: unknown;
}

interface HistoryEntry {
  id?: string;
  old_memory?: string;
  new_memory?: string;
  memory?: string;
  event?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface MemoryDetailSidebarProps {
  memory: Memory;
  onClose: () => void;
  onDeleted?: () => void;
  onReclassified?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

type TabKey = 'details' | 'source_updates';

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */
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

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className="px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer"
      style={{
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>
      {title}
    </h3>
  );
}

/* ------------------------------------------------------------------ */
/*  Entity Card                                                        */
/* ------------------------------------------------------------------ */
function EntityCard({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </div>
        <div className="text-xs font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
          {value}
        </div>
      </div>
      <CopyButton text={value} />
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
  const [metadataOpen, setMetadataOpen] = useState(false);

  const entities: { icon: React.ComponentType<{ size?: number }>; label: string; value: string }[] = [];
  if (memory.user_id) entities.push({ icon: User, label: t('memories.user_id'), value: memory.user_id });
  if (memory.run_id) entities.push({ icon: Play, label: t('memories.run_id'), value: memory.run_id });
  if (memory.agent_id) entities.push({ icon: Bot, label: t('memories.agent_id'), value: memory.agent_id });
  if (memory.app_id) entities.push({ icon: AppWindow, label: t('memories.app_id'), value: memory.app_id });

  // Metadata items for the collapsible section
  const hasMetadata = memory.subcategory || (memory.tags && memory.tags.length > 0)
    || memory.importance_score !== undefined || memory.classified_by;

  return (
    <div className="flex flex-col gap-5 px-5 py-4">
      {/* ID row */}
      <div>
        <SectionHeader title="ID" />
        <div className="flex items-center gap-2">
          <code
            className="text-xs font-mono px-2 py-1.5 rounded-md flex-1 truncate"
            style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
          >
            {memory.id}
          </code>
          <CopyButton text={memory.id} />
        </div>
      </div>

      {/* Memory text */}
      <div>
        <SectionHeader title={t('memories.memory_text')} />
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-text-primary)', lineHeight: '1.7' }}
        >
          {memory.memory}
        </p>
      </div>

      {/* Category badges */}
      {memory.category && memory.category.length > 0 && (
        <div>
          <SectionHeader title={t('memories.category')} />
          <div className="flex flex-wrap gap-1.5">
            {memory.category.map((cat) => (
              <Badge key={cat} label={cat} color="blue" />
            ))}
          </div>
        </div>
      )}

      {/* Created / Updated — two columns */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <SectionHeader title={t('memories.created_at')} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {memory.created_at ? formatDateTime(memory.created_at) : '-'}
          </span>
        </div>
        <div>
          <SectionHeader title={t('memories.updated_at')} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {memory.updated_at ? formatDateTime(memory.updated_at) : '-'}
          </span>
        </div>
      </div>

      {/* Entities */}
      {entities.length > 0 && (
        <div>
          <SectionHeader title={t('requests.entities')} />
          <div className="flex flex-col gap-2">
            {entities.map((ent) => (
              <EntityCard key={ent.label} icon={ent.icon} label={ent.label} value={ent.value} />
            ))}
          </div>
        </div>
      )}

      {/* Metadata (collapsible) */}
      {hasMetadata && (
        <div>
          <button
            className="flex items-center gap-1.5 cursor-pointer w-full"
            onClick={() => setMetadataOpen(!metadataOpen)}
          >
            <ChevronRight
              size={14}
              style={{
                color: 'var(--color-text-muted)',
                transform: metadataOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 150ms ease',
              }}
            />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              {t('memories.metadata')}
            </span>
          </button>

          {metadataOpen && (
            <div className="mt-3 flex flex-col gap-3 pl-5">
              {memory.subcategory && (
                <MetadataItem label={t('memories.subcategory')} value={memory.subcategory} />
              )}
              {memory.tags && memory.tags.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    {t('memories.tags')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {memory.importance_score !== undefined && (
                <MetadataItem label={t('memories.importance_score')} value={memory.importance_score.toFixed(2)} />
              )}
              {memory.classified_by && (
                <MetadataItem label={t('memories.classified_by')} value={memory.classified_by} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div>
        <SectionHeader title={t('memories.actions')} />
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

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source & Updates Tab                                                */
/* ------------------------------------------------------------------ */
function SourceUpdatesTab({ memoryId }: { memoryId: string }) {
  const { t } = useTranslation();

  const { data: sourceData, isLoading: sourceLoading } = useQuery({
    queryKey: ['memory-source', memoryId],
    queryFn: () => api.getMemorySource(memoryId),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['memory-history', memoryId],
    queryFn: () => api.getMemoryHistory(memoryId),
  });

  // Parse source messages
  const allMessages: SourceMessage[] = [];
  for (const entry of (sourceData?.results || [])) {
    const msgs = (entry as Record<string, unknown>).messages;
    if (Array.isArray(msgs)) {
      allMessages.push(...(msgs as SourceMessage[]));
    }
  }

  const historyEntries = (historyData?.results || []) as HistoryEntry[];

  return (
    <div className="flex flex-col gap-6 px-5 py-4">
      {/* Source section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title={t('memories.source')} />
          {allMessages.length > 3 && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Scroll to see more
            </span>
          )}
        </div>

        {sourceLoading && (
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</div>
        )}

        {!sourceLoading && allMessages.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_source')}</div>
        )}

        {allMessages.length > 0 && (
          <div className="max-h-[320px] overflow-y-auto flex flex-col gap-2.5 pr-1">
            {allMessages.map((msg, i) => (
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
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Changelog section */}
      <div>
        <SectionHeader title={t('memories.changelog')} />

        {historyLoading && (
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</div>
        )}

        {!historyLoading && historyEntries.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_history')}</div>
        )}

        {historyEntries.length > 0 && (
          <div className="flex flex-col gap-0">
            {/* Reverse to show newest first, add version numbers */}
            {[...historyEntries].reverse().map((entry, i) => {
              const versionNum = historyEntries.length - i;
              const memoryText = entry.new_memory || entry.memory || entry.old_memory || '';
              const entryId = entry.id || '';

              return (
                <div key={entry.id || i} className="flex gap-3 relative">
                  {/* Timeline line */}
                  {i < historyEntries.length - 1 && (
                    <div
                      className="absolute left-[13px] top-[28px] bottom-0 w-px"
                      style={{ backgroundColor: 'var(--color-border)' }}
                    />
                  )}

                  {/* Version circle */}
                  <div
                    className="w-[27px] h-[27px] rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold z-10"
                    style={{
                      backgroundColor: i === 0
                        ? 'var(--color-accent)'
                        : 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
                      color: i === 0 ? '#fff' : 'var(--color-accent)',
                    }}
                  >
                    V{versionNum}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-4">
                    {/* Memory ID */}
                    {entryId && (
                      <div className="flex items-center gap-1 mb-1">
                        <span
                          className="text-[10px] font-mono truncate"
                          style={{ color: 'var(--color-text-muted)', maxWidth: '200px' }}
                        >
                          {entryId}
                        </span>
                        <CopyButton text={entryId} />
                      </div>
                    )}

                    {/* Memory text */}
                    <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--color-text-primary)' }}>
                      {memoryText}
                    </p>

                    {/* Timestamp */}
                    {entry.created_at && (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {t('memories.updated_at')}: {formatDateTime(entry.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Sidebar                                                       */
/* ------------------------------------------------------------------ */
export default function MemoryDetailSidebar({
  memory, onClose, onDeleted, onReclassified, onPrev, onNext,
}: MemoryDetailSidebarProps) {
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
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {t('memories.detail')}
            </span>

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
              active={activeTab === 'details'}
              onClick={() => setActiveTab('details')}
              label={t('memories.details_tab')}
            />
            <TabButton
              active={activeTab === 'source_updates'}
              onClick={() => setActiveTab('source_updates')}
              label={t('memories.source_updates_tab')}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' && (
            <DetailsTab
              memory={memory}
              onDelete={handleDelete}
              onReclassify={handleReclassify}
              isDeleting={isDeleting}
              isReclassifying={isReclassifying}
            />
          )}
          {activeTab === 'source_updates' && <SourceUpdatesTab memoryId={memory.id} />}
        </div>
      </div>
    </>
  );
}
