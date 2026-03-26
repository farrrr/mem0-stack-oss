import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, AlertCircle } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/api';
import type { Memory, SearchResult } from '../lib/types';
import Button from '../components/ui/Button';
import MemoryDetailSidebar from '../components/memory/MemoryDetailSidebar';

const LIMIT_OPTIONS = [5, 10, 25] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function getScoreColor(score: number): string {
  if (score > 0.8) return 'var(--color-success)';
  if (score > 0.5) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

/* ------------------------------------------------------------------ */
/*  Skeleton card                                                      */
/* ------------------------------------------------------------------ */
function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-4 animate-pulse"
      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="h-4 rounded w-3/4 mb-3" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
      <div className="h-3 rounded w-full mb-2" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
      <div className="h-3 rounded w-1/2" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function SearchPage() {
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [limit, setLimit] = useState<number>(10);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [detailMemory, setDetailMemory] = useState<Memory | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (debouncedQuery.length < 3) {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const doSearch = async () => {
      setIsSearching(true);
      setError(null);

      try {
        const data = await api.search(debouncedQuery, userId, limit, controller.signal);
        const searchResults = (Array.isArray(data) ? data : (data as Record<string, unknown>).results || []) as SearchResult[];
        setResults(searchResults);
        setHasSearched(true);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : t('common.error'));
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    };

    doSearch();

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, userId, limit, t]);

  const handleRetry = () => {
    setError(null);
    // Force re-trigger by clearing and re-setting query
    const q = query;
    setQuery('');
    requestAnimationFrame(() => setQuery(q));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <h1 className="text-2xl font-semibold mb-5" style={{ color: 'var(--color-text-primary)' }}>
        {t('search.title')}
      </h1>

      {/* Search input */}
      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--color-text-muted)' }}
        />
        <input
          type="text"
          placeholder={t('search.placeholder')}
          className="w-full pl-11 pr-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Options row */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder={t('search.user_id')}
          className="px-3 py-1.5 rounded-lg text-sm w-48"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('search.limit')}:</span>
          <div className="flex items-center gap-1">
            {LIMIT_OPTIONS.map((opt) => (
              <button
                key={opt}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: limit === opt ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  color: limit === opt ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${limit === opt ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
                onClick={() => setLimit(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {isSearching && (
          <span className="text-xs ml-auto" style={{ color: 'var(--color-accent)' }}>
            {t('search.searching')}
          </span>
        )}

        {hasSearched && !isSearching && !error && (
          <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
            {t('search.result_count', { count: results.length })}
          </span>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Initial state */}
        {!hasSearched && !isSearching && !error && query.length === 0 && (
          <EmptyState message={t('search.empty_state')} />
        )}

        {/* Min chars hint */}
        {!hasSearched && !isSearching && !error && query.length > 0 && query.length < 3 && (
          <EmptyState message={t('search.min_chars')} />
        )}

        {/* Loading skeletons */}
        {isSearching && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle size={24} style={{ color: 'var(--color-danger)' }} />
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            <Button variant="secondary" size="sm" onClick={handleRetry}>{t('common.retry')}</Button>
          </div>
        )}

        {/* No results */}
        {hasSearched && !isSearching && !error && results.length === 0 && (
          <EmptyState message={t('search.no_results')} />
        )}

        {/* Result cards */}
        {!isSearching && !error && results.length > 0 && (
          <div className="flex flex-col gap-3">
            {results.map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                onClick={() => setDetailMemory(result as Memory)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail sidebar */}
      {detailMemory && (
        <MemoryDetailSidebar
          memory={detailMemory}
          onClose={() => setDetailMemory(null)}
          onDeleted={() => setDetailMemory(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
    </div>
  );
}

function ResultCard({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const { t } = useTranslation();
  const score = result.score ?? 0;

  return (
    <button
      className="text-left rounded-xl p-4 transition-colors cursor-pointer w-full"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'; }}
    >
      {/* Memory text */}
      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-primary)' }}>
        {result.memory}
      </p>

      {/* Score bar */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs shrink-0 w-12" style={{ color: 'var(--color-text-muted)' }}>
          {t('search.score')}
        </span>
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(score * 100, 100)}%`,
              backgroundColor: getScoreColor(score),
            }}
          />
        </div>
        <span className="text-xs font-mono shrink-0 w-12 text-right" style={{ color: 'var(--color-text-secondary)' }}>
          {score.toFixed(3)}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2">
        {result.category && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {result.category}
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {formatDate(result.created_at)}
        </span>
      </div>
    </button>
  );
}
