import { useState, useRef, useEffect } from 'react';
import {
  PanelLeftClose, PanelLeft, Plus, Database, MessageSquare, Trash2, LogOut, ChevronUp,
} from 'lucide-react';
import { timeAgo } from './util';
import type { Session } from './api';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

// ── AccountBar ────────────────────────────────────────────────────────────────
// Renders a Claude-style profile row in the expanded state and a single
// centered avatar in the collapsed rail. Sign-out is always one click away.

interface AccountBarProps {
  collapsed: boolean;
  userName?: string;
  userEmail?: string;
  planLabel?: string;
  onSignOut: () => void;
}

function getInitial(name?: string, email?: string): string {
  return (name?.trim()[0] || email?.trim()[0] || '?').toUpperCase();
}

function AccountBar({ collapsed, userName, userEmail, planLabel, onSignOut }: AccountBarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const displayName = userName || userEmail?.split('@')[0] || 'Account';
  // Prefer email as subtitle (concrete identity signal); fall back to planLabel
  // or a generic string. Showing planLabel here is redundant when the workspace
  // logo already renders above the hairline in the sidebar footer.
  const subtitle = userEmail || planLabel || 'Signed in';
  const initial = getInitial(userName, userEmail);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  // Avatar element — shared between both states
  const avatar = (
    <span
      aria-hidden
      className="shrink-0 w-7 h-7 rounded-full bg-structure text-structure-ink flex items-center justify-center text-micro font-semibold leading-none select-none"
    >
      {initial}
    </span>
  );

  if (collapsed) {
    return (
      <div className="relative flex justify-center">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Account menu"
          title={`${displayName} — click for options`}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`inline-flex items-center justify-center w-9 h-9 rounded-control hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
        >
          {avatar}
        </button>

        {/* Collapsed mini-menu — floats to the right of the rail */}
        {open && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute bottom-0 left-full ml-2 z-50 w-52 rounded-surface bg-bg-elevated border border-border shadow-float py-1 animate-fade-in"
          >
            <div className="px-3 py-2 border-b border-border-light">
              <p className="text-body font-medium text-text-primary truncate">{displayName}</p>
              {userEmail && <p className="text-micro text-text-muted truncate mt-0.5">{userEmail}</p>}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSignOut(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-body text-text-secondary hover:text-error hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  // Expanded state — compact profile row
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-control hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} group`}
      >
        {avatar}
        <span className="flex-1 min-w-0 text-left">
          <span className="block truncate text-body font-medium text-text-primary leading-tight">{displayName}</span>
          <span className="block truncate text-micro text-text-muted leading-tight mt-0.5">{subtitle}</span>
        </span>
        <ChevronUp
          className={`shrink-0 w-3.5 h-3.5 text-text-muted transition-transform ${MOTION} ${open ? '' : 'rotate-180'}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {/* Expanded popover menu — floats above the trigger */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-surface bg-bg-elevated border border-border shadow-float py-1 animate-fade-in"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-body text-text-secondary hover:text-error hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── SidebarProps ──────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  sessions: Session[];
  /** True when the last sessions fetch FAILED (error/timeout). Drives a
   * "couldn't load — retry" affordance instead of a silent "no conversations". */
  sessionsError?: boolean;
  /** Re-fetch the sessions list (retry after a failure). */
  onRetrySessions?: () => void;
  activeSessionId: string | null;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenKnowledge: () => void;
  docCount: number;
  contextLabel: string;
  /** Workspace logo (e.g. the Actionist wordmark) shown in the footer. */
  logoSrc?: string;
  /** Structured account props — replaces the opaque `account` ReactNode. */
  userName?: string;
  userEmail?: string;
  /** Muted subtitle shown under the name (e.g. plan, workspace). */
  planLabel?: string;
  onSignOut?: () => void;
}

export default function Sidebar({
  collapsed, onToggle, onNewChat, sessions, sessionsError, onRetrySessions, activeSessionId,
  onOpenSession, onDeleteSession, onOpenKnowledge, docCount, contextLabel, logoSrc,
  userName, userEmail, planLabel, onSignOut,
}: SidebarProps) {
  return (
    <aside
      className={`shrink-0 flex flex-col h-full bg-bg-secondary hairline-r overflow-hidden transition-[width] ${MOTION} ${collapsed ? 'w-14' : 'w-[264px]'}`}
      aria-label="Command F navigation"
    >
      {/* ── Header: wordmark + collapse toggle ─────────────────────────── */}
      <div className={`flex items-center h-14 shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <span className="font-display font-normal text-xl text-text-primary select-none">
            Command&nbsp;F
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
        >
          {collapsed
            ? <PanelLeft className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden />
            : <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden />}
        </button>
      </div>

      {/* ── New chat ───────────────────────────────────────────────────── */}
      <div className={`shrink-0 ${collapsed ? 'px-2' : 'px-3'} pb-1.5`}>
        <button
          type="button"
          onClick={onNewChat}
          title={collapsed ? 'New chat' : undefined}
          aria-label="New chat"
          className={`w-full inline-flex items-center rounded-control border border-border bg-bg-primary text-text-primary hover:bg-bg-tertiary hover:border-border-hover transition-colors ${MOTION} ${FOCUS} ${collapsed ? 'justify-center h-9' : 'gap-2 px-3 h-9 text-body font-medium'}`}
        >
          <Plus className="w-[15px] h-[15px] shrink-0" strokeWidth={2.25} aria-hidden />
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      {/* ── Knowledge base ─────────────────────────────────────────────── */}
      <div className={`shrink-0 ${collapsed ? 'px-2' : 'px-3'} pb-1.5`}>
        <button
          type="button"
          onClick={onOpenKnowledge}
          title={collapsed ? `Knowledge base · ${docCount}` : undefined}
          aria-label="Open knowledge base"
          className={`w-full inline-flex items-center rounded-control text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} ${collapsed ? 'justify-center h-9' : 'gap-2.5 px-3 h-9'}`}
        >
          <Database className="w-[15px] h-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-body truncate">Knowledge base</span>
              {docCount > 0 && (
                <span className="shrink-0 font-mono text-micro tabular-nums text-text-secondary bg-bg-tertiary px-1.5 py-0.5 rounded-sm">{docCount.toLocaleString()}</span>
              )}
            </>
          )}
        </button>
      </div>

      {/* ── Recent sessions ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!collapsed && (
          <p className="text-caption text-text-muted px-4 pt-2 pb-1 shrink-0">Recent</p>
        )}
        <nav
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2"
          aria-label="Recent conversations"
        >
          {sessions.length === 0 ? (
            !collapsed && (
              sessionsError ? (
                // Load FAILED with nothing cached — offer a retry. NEVER present a
                // failure as "no conversations yet" (that reads as "all chats gone").
                <div className="px-2 py-2 animate-fade-in">
                  <p className="text-caption text-text-muted">Couldn't load your conversations.</p>
                  {onRetrySessions && (
                    <button
                      type="button"
                      onClick={onRetrySessions}
                      className={`mt-1.5 inline-flex items-center h-7 px-2.5 rounded-pill border border-border-light text-caption text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : (
                <p className="px-2 py-2 text-caption text-text-muted">No conversations yet</p>
              )
            )
          ) : (
            sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <div key={s.id} className="group/row relative">
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-accent" aria-hidden />
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenSession(s.id)}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? s.title : undefined}
                    className={`w-full flex items-center rounded-control transition-colors ${MOTION} ${FOCUS} ${collapsed ? 'justify-center h-9' : 'pl-3 pr-8 h-[42px] text-left'} ${active ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}
                  >
                    {collapsed
                      ? (
                        <span className={`relative inline-flex items-center justify-center w-7 h-7 rounded-control transition-colors ${active ? 'bg-bg-tertiary' : ''}`}>
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-accent -translate-x-1" aria-hidden />
                          )}
                          <MessageSquare className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden />
                        </span>
                      )
                      : (
                        <span className="flex-1 min-w-0 flex flex-col leading-tight">
                          <span className={`truncate text-body-sm ${active ? 'font-medium' : ''}`}>{s.title || 'Untitled'}</span>
                          <span className="truncate font-mono text-micro text-text-muted mt-0.5">{timeAgo(s.updated_at)}</span>
                        </span>
                      )
                    }
                  </button>
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                      aria-label={`Delete conversation: ${s.title || 'Untitled'}`}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-control text-text-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-error hover:bg-bg-primary transition ${MOTION} ${FOCUS}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </nav>
        {/* Showing a cached list but the last refresh FAILED — say so + offer a
            retry, so a stale rail is never mistaken for the live truth. */}
        {!collapsed && sessionsError && sessions.length > 0 && onRetrySessions && (
          <button
            type="button"
            onClick={onRetrySessions}
            className={`shrink-0 mx-2 mb-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-control text-micro text-text-muted hover:text-text-secondary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
            title="Couldn't refresh — showing your last-known list. Click to retry."
          >
            Couldn't refresh — retry
          </button>
        )}
      </div>

      {/* ── Footer: workspace identity (above hairline) ────────────────── */}
      {!collapsed && (logoSrc || contextLabel) && (
        <div className="shrink-0 px-4 pb-2 pt-1">
          {logoSrc
            ? <img src={logoSrc} alt={contextLabel} title={contextLabel} className="brand-logo h-4 w-auto opacity-75 select-none" />
            : <p className="text-caption text-text-muted truncate" title={contextLabel}>{contextLabel}</p>
          }
        </div>
      )}

      {/* ── Account tile (sole occupant below hairline) ─────────────────── */}
      {onSignOut && (
        <div className={`shrink-0 hairline-t ${collapsed ? 'px-2 py-2' : 'px-3 py-2'}`}>
          <AccountBar
            collapsed={collapsed}
            userName={userName}
            userEmail={userEmail}
            planLabel={planLabel}
            onSignOut={onSignOut}
          />
        </div>
      )}
    </aside>
  );
}
