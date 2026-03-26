import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2
        size={24}
        className="animate-spin"
        style={{ color: 'var(--color-accent)' }}
      />
      {message && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
