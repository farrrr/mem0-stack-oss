import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      {title && (
        <h3
          className="text-sm font-semibold mb-4"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
