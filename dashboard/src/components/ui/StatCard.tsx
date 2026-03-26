import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  trend?: { value: number; label: string };
}

export default function StatCard({ label, value, icon: Icon, color, trend }: StatCardProps) {
  const iconColor = color || 'var(--color-accent)';

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 15%, transparent)`, color: iconColor }}
        >
          <Icon size={16} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {value}
        </span>
        {trend && (
          <span
            className="text-xs font-medium flex items-center gap-0.5 pb-1"
            style={{ color: trend.value >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {trend.value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
