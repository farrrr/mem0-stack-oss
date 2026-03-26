import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import Button from './Button.tsx';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-danger) 15%, transparent)',
          color: 'var(--color-danger)',
        }}
      >
        <AlertTriangle size={24} />
      </div>
      <div className="text-center">
        <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
          {message || t('common.error')}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
