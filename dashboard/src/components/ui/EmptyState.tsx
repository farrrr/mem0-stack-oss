import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import Button from './Button.tsx';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-muted)',
        }}
      >
        <Icon size={24} />
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
        {description && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
