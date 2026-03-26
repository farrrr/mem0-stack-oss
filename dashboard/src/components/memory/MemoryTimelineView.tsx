import { useTranslation } from 'react-i18next';

interface Memory {
  id: string;
  memory: string;
  category?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface MemoryTimelineViewProps {
  memories: Memory[];
  onSelect: (memory: Memory) => void;
  selectedId?: string;
}

function formatDateKey(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export default function MemoryTimelineView({ memories, onSelect, selectedId }: MemoryTimelineViewProps) {
  const { t } = useTranslation();

  // Group memories by date
  const grouped: Record<string, Memory[]> = {};
  for (const mem of memories) {
    const key = formatDateKey(mem.created_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(mem);
  }

  if (memories.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('memories.no_results')}</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div
        className="absolute left-2.5 top-0 bottom-0 w-px"
        style={{ backgroundColor: 'var(--color-border)' }}
      />

      {Object.entries(grouped).map(([dateKey, mems]) => (
        <div key={dateKey} className="mb-6">
          {/* Date separator */}
          <div className="flex items-center gap-2 mb-3 relative">
            <div
              className="absolute -left-3.5 w-3 h-3 rounded-full"
              style={{ backgroundColor: 'var(--color-accent)', border: '2px solid var(--color-bg-primary)' }}
            />
            <span className="text-xs font-semibold ml-2" style={{ color: 'var(--color-text-muted)' }}>
              {dateKey}
            </span>
          </div>

          {/* Memory cards */}
          <div className="flex flex-col gap-2 ml-2">
            {mems.map((mem) => (
              <button
                key={mem.id}
                onClick={() => onSelect(mem)}
                className="text-left rounded-lg p-3 transition-colors cursor-pointer w-full"
                style={{
                  backgroundColor: mem.id === selectedId ? 'var(--color-bg-hover)' : 'var(--color-bg-secondary)',
                  border: `1px solid ${mem.id === selectedId ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--color-text-primary)' }}>
                    {truncate(mem.memory, 100)}
                  </p>
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    {formatTime(mem.created_at)}
                  </span>
                </div>
                {mem.category && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-2"
                    style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                  >
                    {mem.category}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
