import {
  PanelLeftClose, PanelLeft, Plus, Database, MessageSquare, Trash2,
} from 'lucide-react';
import { timeAgo } from './util';
import type { Session } from './api';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  sessions: Session[];
  activeSessionId: string | null;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenKnowledge: () => void;
  docCount: number;
  contextLabel: string;
  account?: React.ReactNode;
}

export default function Sidebar({
  collapsed, onToggle, onNewChat, sessions, activeSessionId,
  onOpenSession, onDeleteSession, onOpenKnowledge, docCount, contextLabel, account,
}: SidebarProps) {
  return (
    <aside
      className={`shrink-0 flex flex-col h-full bg-bg-secondary hairline-r overflow-hidden transition-[width] ${MOTION} ${collapsed ? 'w-14' : 'w-[264px]'}`}
      aria-label="Command F navigation"
    >
      {/* ── Header: wordmark + collapse toggle ─────────────────────────── */}
      <div className={`flex items-center h-14 shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <span className="font-serif text-[15px] leading-none text-text-primary tracking-tight select-none">
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
      <div className={`shrink-0 ${collapsed ? 'px-2' : 'px-3'} pb-2`}>
        <button
          type="button"
          onClick={onNewChat}
          title={collapsed ? 'New chat' : undefined}
          aria-label="New chat"
          className={`w-full inline-flex items-center rounded-control border border-border-light bg-bg-primary text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} ${collapsed ? 'justify-center h-9' : 'gap-2.5 px-3 h-9 text-body font-medium'}`}
        >
          <Plus className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      {/* ── Knowledge base ─────────────────────────────────────────────── */}
      <div className={`shrink-0 ${collapsed ? 'px-2' : 'px-3'} pb-2`}>
        <button
          type="button"
          onClick={onOpenKnowledge}
          title={collapsed ? `Knowledge base · ${docCount}` : undefined}
          aria-label="Open knowledge base"
          className={`w-full inline-flex items-center rounded-control text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} ${collapsed ? 'justify-center h-9' : 'gap-2.5 px-3 h-9'}`}
        >
          <Database className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-body truncate">Knowledge base</span>
              {docCount > 0 && (
                <span className="shrink-0 font-num text-micro tabular-nums text-text-muted">{docCount.toLocaleString()}</span>
              )}
            </>
          )}
        </button>
      </div>

      {/* ── Recent sessions ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!collapsed && (
          <p className="eyebrow text-text-muted px-4 pt-2 pb-1.5 shrink-0">Recent</p>
        )}
        <nav
          className={`flex-1 min-h-0 overflow-y-auto scrollbar-thin ${collapsed ? 'px-2' : 'px-2'}`}
          aria-label="Recent conversations"
        >
          {sessions.length === 0 ? (
            !collapsed && <p className="px-2 py-2 text-caption text-text-muted">No conversations yet</p>
          ) : (
            sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <div key={s.id} className="group/row relative">
                  <button
                    type="button"
                    onClick={() => onOpenSession(s.id)}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? s.title : undefined}
                    className={`w-full flex items-center rounded-control transition-colors ${MOTION} ${FOCUS} ${collapsed ? 'justify-center h-9' : 'gap-2.5 pl-3 pr-8 h-11 text-left'} ${active ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    {!collapsed && (
                      <span className="flex-1 min-w-0 flex flex-col leading-tight">
                        <span className="truncate text-body">{s.title || 'Untitled'}</span>
                        <span className="truncate text-micro text-text-muted mt-0.5">{timeAgo(s.updated_at)}</span>
                      </span>
                    )}
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
      </div>

      {/* ── Footer: context + account (pinned) ─────────────────────────── */}
      <div className={`shrink-0 hairline-t ${collapsed ? 'px-2 py-2' : 'px-4 py-3'} space-y-2`}>
        {!collapsed && contextLabel && (
          <p className="text-caption text-text-muted truncate" title={contextLabel}>{contextLabel}</p>
        )}
        {account}
      </div>
    </aside>
  );
}
