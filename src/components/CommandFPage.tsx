import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Database, Upload, Presentation, Table2, PenLine, Search, GitCompare, MessageSquare,
} from 'lucide-react';
import { useToast, ToastContainer } from './Toast';
import { useClientStrategy } from '../contexts/ClientStrategyContext';

import {
  COMMANDF_URL, type Message, type Session, type ModelOption, type Briefing, type SourcesStatus,
  fetchModels, fetchSessions, fetchBriefing, fetchHistory, sendChat, deleteSession,
  fetchSourcesStatus, startSync, fetchSyncStatus, connectDriveUrl, currentToken, currentUserId, NotSignedInError,
} from './commandf/api';
import { readSessionsCache, writeSessionsCache } from './commandf/sessionsCache';
import { timeAgo } from './commandf/util';
import Composer from './commandf/Composer';
import Conversation from './commandf/Conversation';
import Landing, { type QuickAction } from './commandf/Landing';
import Sidebar from './commandf/Sidebar';
import DeckSurface from './commandf/DeckSurface';
import SurveySurface from './commandf/SurveySurface';
import KnowledgePanel from './commandf/KnowledgePanel';
import CommandPalette, { type PaletteCommand } from './commandf/CommandPalette';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

// Curated quick-start prompts (no backing data — intentionally authored).
const PROMPT_ICP = 'Summarise our ICP and positioning for a new client pitch';
const PROMPT_PROOF = 'What proof points and case studies can I cite for an agency lead?';
const PROMPT_SIMILAR = 'Which engagements are most similar to a mid-market roll-up?';
const PROMPT_VOICE = 'Draft the opening of an outreach note in our voice';
const PROMPT_COMPARE = 'Compare how we framed the repositioning at Stonepoint with the redesign at Cardinal.';

type Surface = 'home' | 'chat' | 'deck' | 'survey';

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** `headerExtra` is the sign-out control; in the new IA it lives at the bottom
 * of the sidebar (the account slot), not in a top header. */
export function CommandFPage({ headerExtra }: { headerExtra?: React.ReactNode } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string>('');
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [sourcesStatus, setSourcesStatus] = useState<SourcesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [deckSeed, setDeckSeed] = useState('');
  const [surface, setSurface] = useState<Surface>('home');
  const [focusKey, setFocusKey] = useState(0);

  const { activeContext } = useClientStrategy();
  const isActionist = activeContext === 'actionist';
  const contextLabel = isActionist ? 'Actionist Consulting' : 'Operator workspace';

  const toast = useToast();
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable user id for keying the local sessions cache (avoids stale closures).
  const userIdRef = useRef<string | null>(null);

  const notConfigured = !COMMANDF_URL;

  const loadBriefing = useCallback(async (cc: string) => {
    const b = await fetchBriefing(cc);
    if (b) setBriefing(b);
  }, []);

  // Refetch the authoritative list and reconcile the local cache. On failure we
  // keep whatever is on screen (optimistic/cached) rather than blanking it.
  const loadSessions = useCallback(async () => {
    const fresh = await fetchSessions().catch(() => null);
    if (fresh) { setSessions(fresh); writeSessionsCache(userIdRef.current, fresh); }
  }, []);

  const loadSidecar = useCallback(async () => {
    if (notConfigured) { setLoading(false); return; }
    if (!(await currentToken())) {
      toast.error('Not signed in — please re-authenticate.');
      setLoading(false);
      return;
    }
    // Seed the sidebar from the per-user cache immediately (zero-flash), then
    // revalidate against the server below (stale-while-revalidate).
    const uid = await currentUserId();
    userIdRef.current = uid;
    const cached = readSessionsCache(uid);
    if (cached.length) setSessions(cached);
    try {
      const [m] = await Promise.all([
        fetchModels().catch(() => []),
        loadSessions(),
        loadBriefing(''),
        fetchSourcesStatus().then(setSourcesStatus).catch(() => {}),
      ]);
      setModels(m);
      setModel((prev) => prev || (m[0]?.id ?? ''));
    } catch (e: any) {
      if (e instanceof NotSignedInError) toast.error(e.message);
      else toast.error(e?.message || 'Failed to load Command F.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notConfigured]);

  useEffect(() => { loadSidecar(); }, [loadSidecar]);

  useEffect(() => () => {
    if (syncPollRef.current !== null) clearInterval(syncPollRef.current);
  }, []);

  // Drive OAuth round-trip result (query param set by the backend redirect).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('command_f');
    if (p === 'drive_connected') {
      toast.success('Google Drive connected.');
      fetchSourcesStatus().then(setSourcesStatus).catch(() => {});
      loadBriefing('');
    }
    if (p === 'drive_error') toast.error('Google Drive connection failed. Try again.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the "+" menu on Escape.
  useEffect(() => {
    if (!showPlus) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPlus(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [showPlus]);

  // ⌘K / Ctrl+K opens the command palette (jump to a thread, new chat, tools).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openSession = async (sid: string) => {
    setSessionId(sid); setSurface('chat');
    try { setMessages(await fetchHistory(sid)); }
    catch (e: any) { toast.error(e?.message || 'Could not load conversation.'); }
  };

  const newChat = () => { setSessionId(null); setMessages([]); setSurface('home'); setFocusKey((k) => k + 1); };

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending || notConfigured) return;
    setInput('');
    setSurface('chat');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const data = await sendChat(msg, model, sessionId);
      if (data.session_id && !sessionId) {
        // New thread — optimistically insert it at the top of the rail so it
        // appears instantly (title = first message), then reconcile with server.
        setSessionId(data.session_id);
        setSessions((prev) => [
          { id: data.session_id!, title: msg.slice(0, 60), updated_at: new Date().toISOString() },
          ...prev.filter((s) => s.id !== data.session_id),
        ]);
        loadSessions();
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, sources: data.sources || [] }]);
    } catch (e: any) {
      const m = e instanceof NotSignedInError ? e.message : (e?.message || 'Something went wrong.');
      toast.error(m);
      setMessages((prev) => [...prev, { role: 'assistant', content: m, error: true }]);
    } finally {
      setSending(false);
    }
  };

  const onDeleteSession = async (sid: string) => {
    // Optimistic remove — drop it from the rail immediately; restore on failure.
    const prev = sessions;
    const next = sessions.filter((s) => s.id !== sid);
    setSessions(next);
    writeSessionsCache(userIdRef.current, next);
    if (sid === sessionId) newChat();
    try {
      await deleteSession(sid);
    } catch {
      setSessions(prev);
      writeSessionsCache(userIdRef.current, prev);
      toast.error('Could not delete conversation.');
    }
  };

  const onConnectDrive = async () => {
    try { window.location.href = await connectDriveUrl(); }
    catch (e: any) { toast.error(e?.message || 'Not signed in.'); }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      await startSync();
      toast.success('Re-indexing started…');
      const deadline = Date.now() + 240_000;
      syncPollRef.current = setInterval(async () => {
        const s = await fetchSyncStatus();
        const timedOut = Date.now() > deadline;
        if (timedOut || (s && (s.status === 'complete' || s.status === 'error'))) {
          if (syncPollRef.current) clearInterval(syncPollRef.current);
          syncPollRef.current = null;
          setSyncing(false);
          if (!timedOut && s?.status === 'complete') { toast.success('Re-index complete.'); loadBriefing(''); }
          else if (!timedOut) toast.error(s?.message || 'Re-index failed.');
        }
      }, 3000);
    } catch (e: any) {
      setSyncing(false);
      toast.error(e?.message || 'Re-index failed.');
    }
  };

  const selectPrompt = useCallback((text: string) => {
    setInput(text);
    setSurface('home');
    setFocusKey((k) => k + 1);
  }, []);

  // Reuse-a-source: prefill the composer in place (keep the current surface so a
  // reuse action from a chat answer fills the follow-up box, not a jump home).
  const prefillComposer = useCallback((text: string) => {
    setInput(text);
    setFocusKey((k) => k + 1);
  }, []);

  // Source → deck handoff: open the deck surface seeded with the question that
  // produced these sources, so "build a deck from these" starts grounded.
  const buildDeckFromChat = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    setDeckSeed(lastUser?.content ?? '');
    setSurface('deck');
  }, [messages]);

  if (notConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <span className="font-serif text-[24px] tracking-[-0.015em] text-text-primary leading-none block mb-3">Command F</span>
          <h2 className="text-lg font-medium text-text-primary mb-1">Not configured</h2>
          <p className="text-body text-text-secondary">
            Set <code className="font-mono text-caption">VITE_MODAL_COMMANDF_URL</code> in the dashboard environment to enable it.
          </p>
        </div>
      </div>
    );
  }

  const docs = briefing?.knowledge?.doc_count ?? 0;
  const lastSync = briefing?.knowledge?.last_sync_at;

  const logoSrc = isActionist ? '/actionist-logo.svg' : undefined;

  const paletteCommands: PaletteCommand[] = [
    { id: 'new', label: 'New chat', group: 'Actions', icon: Plus, keywords: 'start reset thread', run: newChat },
    { id: 'knowledge', label: 'Open knowledge base', group: 'Actions', icon: Database, hint: docs ? docs.toLocaleString() : undefined, keywords: 'documents sources upload drive', run: () => setShowKnowledge(true) },
    { id: 'deck', label: 'Build a deck', group: 'Actions', icon: Presentation, hint: 'PPTX', keywords: 'presentation slides pptx', run: () => setSurface('deck') },
    { id: 'survey', label: 'Survey compendium', group: 'Actions', icon: Table2, hint: 'XLSX', keywords: 'spreadsheet xlsx', run: () => setSurface('survey') },
    ...sessions.slice(0, 8).map((s): PaletteCommand => ({
      id: `s-${s.id}`, label: s.title || 'Untitled', group: 'Recent', icon: MessageSquare,
      hint: timeAgo(s.updated_at), run: () => openSession(s.id),
    })),
  ];

  const quickActions: QuickAction[] = [
    { label: 'Draft in our voice', icon: PenLine, onClick: () => selectPrompt(PROMPT_VOICE) },
    { label: 'Find a precedent', icon: Search, onClick: () => selectPrompt(isActionist ? PROMPT_SIMILAR : PROMPT_PROOF) },
    { label: 'Compare engagements', icon: GitCompare, onClick: () => selectPrompt(isActionist ? PROMPT_COMPARE : PROMPT_ICP) },
    { label: 'Build a deck', icon: Presentation, onClick: () => setSurface('deck') },
  ];

  const plusItems = [
    { label: 'Upload a file', icon: Upload, onClick: () => { setShowKnowledge(true); setShowPlus(false); } },
    { label: 'Build a deck', icon: Presentation, onClick: () => { setSurface('deck'); setShowPlus(false); } },
    { label: 'Survey compendium', icon: Table2, onClick: () => { setSurface('survey'); setShowPlus(false); } },
  ];

  // Injected into the composer's control row (left): the "+" creation menu and a
  // Knowledge scope chip — distilled from ChatGPT ("+") and Harvey (Sources/Vault).
  const leadingControls = (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPlus((v) => !v)}
          aria-label="Add"
          aria-expanded={showPlus}
          className={`w-8 h-8 flex items-center justify-center rounded-full border border-border-light text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </button>
        {showPlus && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowPlus(false)} aria-hidden />
            <div className="absolute bottom-full mb-2 left-0 z-20 w-56 rounded-surface border border-border-light bg-bg-elevated shadow-float py-1 animate-fade-in">
              {plusItems.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-body text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors ${FOCUS}`}
                >
                  <Icon className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowKnowledge(true)}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-pill border border-border-light text-caption text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors ${MOTION} ${FOCUS}`}
        title="Search scope — the firm's knowledge base"
      >
        <Database className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
        Knowledge
        {docs > 0 && <span className="font-num text-micro text-text-muted tabular-nums">{docs.toLocaleString()}</span>}
      </button>
    </div>
  );

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSubmit={() => sendMessage(input)}
      sending={sending}
      focusKey={focusKey}
      placeholder={surface === 'chat' ? 'Ask a follow-up…' : "Ask the firm's memory…"}
      models={models}
      model={model}
      onModelChange={setModel}
      leadingControls={leadingControls}
    />
  );

  return (
    <div className="flex-1 flex min-h-0 h-full bg-bg-primary">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onNewChat={newChat}
        sessions={sessions}
        activeSessionId={sessionId}
        onOpenSession={openSession}
        onDeleteSession={onDeleteSession}
        onOpenKnowledge={() => setShowKnowledge(true)}
        docCount={docs}
        contextLabel={contextLabel}
        logoSrc={logoSrc}
        account={headerExtra}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {surface === 'deck' ? (
          <DeckSurface onBack={() => setSurface('home')} clientSlug={activeContext} sessionId={sessionId} initialBrief={deckSeed} />
        ) : surface === 'survey' ? (
          <SurveySurface onBack={() => setSurface('home')} />
        ) : surface === 'chat' ? (
          <>
            <Conversation messages={messages} sending={sending} onReuse={prefillComposer} onBuildDeck={buildDeckFromChat} />
            <div className="px-6 pb-6 pt-3 shrink-0">
              <div className="max-w-2xl mx-auto">{composer}</div>
            </div>
          </>
        ) : (
          <Landing
            loading={loading}
            greeting={greetingForNow()}
            contextLabel={contextLabel}
            logoSrc={logoSrc}
            composer={composer}
            quickActions={quickActions}
            docCount={docs}
            lastSync={lastSync ? timeAgo(lastSync) : undefined}
          />
        )}
      </div>

      <KnowledgePanel
        open={showKnowledge}
        onClose={() => setShowKnowledge(false)}
        briefing={briefing}
        sourcesStatus={sourcesStatus}
        syncing={syncing}
        onConnectDrive={onConnectDrive}
        onReindex={runSync}
      />

      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        commands={paletteCommands}
      />
    </div>
  );
}

export default CommandFPage;
