import type { ReactNode, MouseEventHandler } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--color-accent)', color: '#fff' },
  secondary: { backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' },
  danger: { backgroundColor: 'var(--color-danger)', color: '#fff' },
  ghost: { backgroundColor: 'transparent', color: 'var(--color-text-secondary)' },
};

const variantHoverStyles: Record<string, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--color-accent-hover)' },
  secondary: { backgroundColor: 'var(--color-bg-hover)' },
  danger: { opacity: 0.9 },
  ghost: { backgroundColor: 'var(--color-bg-hover)' },
};

const sizeClasses: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  onClick,
  children,
  className = '',
  type = 'button',
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors cursor-pointer ${sizeClasses[size]} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      style={variantStyles[variant]}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          Object.assign(e.currentTarget.style, variantHoverStyles[variant]);
        }
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, variantStyles[variant]);
      }}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 14 : 16} />
      ) : null}
      {children}
    </button>
  );
}
