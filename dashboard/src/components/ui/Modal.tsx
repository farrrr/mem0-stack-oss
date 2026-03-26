import { useEffect, useCallback } from 'react';

interface ModalProps {
  open?: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Shared modal overlay component.
 * Supports Escape key, backdrop click, and accessibility attributes.
 */
export default function Modal({ open = true, onClose, title, children }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />
      {/* Dialog */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[400px] rounded-xl p-5"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h3>
        )}
        {children}
      </div>
    </>
  );
}
