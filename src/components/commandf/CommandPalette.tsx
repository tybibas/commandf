import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft, type LucideIcon } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;                 // right-aligned muted hint, e.g. "Deck" or a timeAgo
  group?: string;                // section label, e.g. "Actions" / "Recent"
  // Typed to LucideIcon (not a hand-narrowed ComponentType) — every icon in
  // this app is a lucide icon, and a narrower alias mismatches lucide's
  // ref-forwarding signature (same fix as Landing.tsx's QuickAction/ExampleCard).
  icon?: LucideIcon;
  keywords?: string;             // extra search terms
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  placeholder?: string;
}

const UNGROUPED = '__ungrouped__';

/**
 * CommandPalette — a keyboard-first command menu (the Linear / Raycast / ⌘K idiom,
 * adapted calm + Claude-like). Controlled via `open`; the lead owns the ⌘K listener
 * and wiring. Dim scrim + a near-white elevated card in the top third, hairline
 * border and soft float shadow. Filters by label + keywords, groups results under
 * quiet sentence-case group headers, and drives fully from the keyboard: arrows wrap the
 * highlight, Enter runs, Escape closes. Focus is trapped and restored on close.
 */
export default function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = 'Search commands and answers',
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Filter by label + keywords (case-insensitive substring), preserving input order.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Group in first-seen order, holding each group's members in input order.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PaletteCommand[]>();
    for (const c of results) {
      const key = c.group ?? UNGROUPED;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(c);
    }
    return order.map((key) => ({ key, items: map.get(key)! }));
  }, [results]);

  // Reset the query + highlight each time the palette opens.
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  // Capture the prior focus, autofocus the input, restore focus on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      const target = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (target && typeof target.focus === 'function') {
        window.setTimeout(() => target.focus(), 0);
      }
    };
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const runAt = useCallback((i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    cmd.run();
    onClose();
  }, [results, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // Trap focus: only the input is tabbable, so hold focus here.
      e.preventDefault();
    }
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Flat index across groups so the highlight maps to the filtered `results` order.
  let flatIndex = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-text-primary/40 motion-safe:transition-opacity motion-safe:duration-fast motion-safe:ease-out-expo"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex min-h-full items-start justify-center px-4 pt-[18vh] pb-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full max-w-[560px] overflow-hidden rounded-surface border border-border-light bg-bg-elevated shadow-float motion-safe:animate-slide-up"
        >
          {/* Search field */}
          <div className="flex items-center gap-2.5 border-b border-border-light px-4">
            <Search className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Command palette"
              placeholder={placeholder}
              className="h-12 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted outline-none"
            />
          </div>

          {/* Results */}
          <div ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto scrollbar-thin p-1.5">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-caption text-text-muted">No matches</p>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="mb-1 last:mb-0">
                  {g.key !== UNGROUPED && (
                    <p className="text-caption text-text-muted px-3 pb-1 pt-2">{g.key}</p>
                  )}
                  {g.items.map((cmd) => {
                    flatIndex += 1;
                    const i = flatIndex;
                    const selected = i === active;
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(i)}
                        onClick={() => runAt(i)}
                        className={`relative flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left transition-colors duration-fast ease-out-expo ${
                          selected ? 'bg-bg-tertiary' : 'hover:bg-bg-secondary'
                        }`}
                      >
                        {selected && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-structure" aria-hidden />
                        )}
                        {Icon && (
                          <Icon className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                        )}
                        <span className="flex-1 min-w-0 truncate text-body text-text-primary">{cmd.label}</span>
                        {cmd.hint && (
                          <span className="shrink-0 font-mono text-micro text-text-muted tabular-nums">{cmd.hint}</span>
                        )}
                        {selected && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
