import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {total > 0 ? `${start}-${end} / ${total}` : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => canPrev && onChange(page - 1)}
          disabled={!canPrev}
          className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => {
            if (canPrev) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs px-2" style={{ color: 'var(--color-text-secondary)' }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => canNext && onChange(page + 1)}
          disabled={!canNext}
          className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => {
            if (canNext) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
