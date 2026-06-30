import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SheetProps {
  /** Controls whether the sheet is rendered + animated in. */
  open: boolean;
  /** Called when the user dismisses via Escape, backdrop click, or programmatic close. */
  onClose: () => void;
  /** Optional title rendered in the sheet header row. */
  title?: React.ReactNode;
  /** Pixel width of the panel. Defaults to 480. */
  width?: number;
  /** Optional ARIA label when no title is rendered. */
  ariaLabel?: string;
  /** Optional class for the inner panel surface. */
  className?: string;
  /** Sticky footer content (action row, Kbd chips, etc.). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Sheet — right-side slide-over panel.
 *
 * Hairline left border, charcoal surface, no shadow. 180ms ease-out-expo translateX.
 * Backdrop is a low-opacity wash of the canvas with a subtle blur — never an overlay
 * scrim. Escape and backdrop click dismiss. Focus moves to the panel on open and
 * returns to the previously focused element on close.
 *
 * Renders into a portal on document.body. Mounts only while `open` is true (after a
 * one-frame paint of the closed state so the enter transition runs).
 */
const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(function Sheet(
  {
    open,
    onClose,
    title,
    width = 480,
    ariaLabel,
    className = '',
    footer,
    children,
  },
  ref,
) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Expose the panel ref to forwarded ref.
  useLayoutEffect(() => {
    if (typeof ref === 'function') ref(panelRef.current);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = panelRef.current;
  });

  // Mount / unmount with one-frame delay so the enter transition can run.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Restore focus to the previously focused element on close.
  useEffect(() => {
    if (!open && previouslyFocusedRef.current) {
      const target = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      // Defer to next tick so React has unmounted the panel.
      window.setTimeout(() => {
        if (target && typeof target.focus === 'function') target.focus();
      }, 0);
    }
  }, [open]);

  // Focus the panel on open (minimal focus trap — keeps Tab inside the panel via
  // standard browser behavior, but ensures initial focus lands inside the sheet).
  useEffect(() => {
    if (visible && panelRef.current) {
      panelRef.current.focus();
    }
  }, [visible]);

  // Escape-to-close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!mounted) return null;
  if (typeof document === 'undefined') return null;

  // Backdrop: theme-invariant scrim per locked recipe (bg-text-primary/40, no blur).
  // text-primary inverts between light/dark so the scrim reads in both themes.
  const backdropCls = [
    'fixed inset-0 z-[60] bg-text-primary/40',
    'transition-opacity ease-out-expo',
    visible ? 'opacity-100' : 'opacity-0',
  ].join(' ');

  const panelCls = [
    'absolute top-0 right-0 h-full flex flex-col outline-none',
    'bg-bg-elevated border-l border-border-light',
    'transition-transform ease-out-expo',
    visible ? 'translate-x-0' : 'translate-x-full',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={backdropCls}
      style={{ transitionDuration: '180ms' }}
      onMouseDown={handleBackdropClick}
      aria-hidden={!visible}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : ariaLabel}
        tabIndex={-1}
        className={panelCls}
        style={{ width, transitionDuration: '180ms' }}
      >
        {title !== undefined && (
          <header className="flex items-center justify-between px-5 h-12 border-b border-border-light shrink-0">
            <div className="text-[15px] font-medium text-text-primary truncate">{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="inline-flex items-center justify-center w-7 h-7 rounded-control text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors duration-fast ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </header>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer !== undefined && (
          <footer className="border-t border-border-light px-5 py-3 shrink-0 bg-bg-elevated">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
});

export { Sheet };
export default Sheet;
