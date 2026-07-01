import { useCallback, useEffect, useRef, useState } from 'react';
import {
  History, Plus, Trash2, Database,
} from 'lucide-react';
import { useToast, ToastContainer } from './Toast';
import { useClientStrategy } from '../contexts/ClientStrategyContext';

import {
  COMMANDF_URL, type Message, type Session, type ModelOption, type Briefing, type SourcesStatus,
  fetchModels, fetchSessions, fetchBriefing, fetchHistory, sendChat, deleteSession,
  fetchSourcesStatus, startSync, fetchSyncStatus, connectDriveUrl, currentToken, NotSignedInError,
} from './commandf/api';
import { timeAgo } from './commandf/util';
import Composer from './commandf/Composer';
import Conversation from './commandf/Conversation';
import Landing, { type LandingMode } from './commandf/Landing';
import DeckSurface from './commandf/DeckSurface';
import SurveySurface from './commandf/SurveySurface';
import KnowledgePanel from './commandf/KnowledgePanel';
import Sheet from './ui/Sheet';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const GHOST_BTN = `border border-border-light text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`;

// Curated prompt suggestions (no backing data — intentionally authored).
const SUGGESTED_OPERATOR = [
  'Summarise our ICP and positioning for a new client pitch',
  'What proof points and case studies can I cite for an agency lead?',
  'Which engagements are most similar to a mid-market roll-up?',
  'Draft the opening of an outreach note in our voice',
];
const SUGGESTED_ACTIONIST = [
  'Walk me through the full Brightwater and Meridian story, from due diligence through value creation.',
  'What is the single most reusable lesson across our last five engagements?',
  'Based on our Cardinal Mutual work, draft the opening of an outreach note to a new insurer CFO.',
  'Compare how we framed the repositioning at Stonepoint with the redesign at Cardinal.',
];

type Surface = 'home' | 'chat' | 'deck' | 'survey';

/** `headerExtra` lets a host (e.g. the standalone app) add controls — like a
 * sign-out — to the right of the header. Omitted by the dashboard. */
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
  const [showSessions, setShowSessions] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [surface, setSurface] = useState<Surface>('home');
  const [focusKey, setFocusKey] = useState(0);

  const { activeContext } = useClientStrategy();
  const isActionist = activeContext === 'actionist';
  const SUGGESTED = isActionist ? SUGGESTED_ACTIONIST : SUGGESTED_OPERATOR;

  const toast = useToast();
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const notConfigured = !COMMANDF_URL;

  const loadBriefing = useCallback(async (cc: string) => {
    const b = await fetchBriefing(cc);
    if (b) setBriefing(b);
  }, []);

  const loadSessions = useCallback(async () => {
    setSessions(await fetchSessions().catch(() => []));
  }, []);

  const loadSidecar = useCallback(async () => {
    if (notConfigured) { setLoading(false); return; }
    // Surface the not-signed-in state explicitly — the per-call catches below
    // would otherwise swallow it and leave an unexplained empty Command F.
    if (!(await currentToken())) {
      toast.error('Not signed in — please re-authenticate.');
      setLoading(false);
      return;
    }
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

  // Clean up sync poll on unmount.
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

  // Close drawers on Escape.
  useEffect(() => {
    if (!showSessions) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSessions(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [showSessions]);

  const openSession = async (sid: string) => {
    setSessionId(sid); setShowSessions(false); setSurface('chat');
    try { setMessages(await fetchHistory(sid)); }
    catch (e: any) { toast.error(e?.message || 'Could not load conversation.'); }
  };

  const newChat = () => { setSessionId(null); setMessages([]); setShowSessions(false); setSurface('home'); };

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending || notConfigured) return;
    setInput('');
    setSurface('chat');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const data = await sendChat(msg, model, sessionId);
      if (data.session_id && !sessionId) { setSessionId(data.session_id); loadSessions(); }
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
    try { await deleteSession(sid); } catch { /* ignore */ }
    if (sid === sessionId) newChat();
    loadSessions();
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
    setFocusKey((k) => k + 1);
  }, []);

  const onMode = (mode: LandingMode) => {
    if (mode === 'ask') { setFocusKey((k) => k + 1); return; }
    if (mode === 'deck') setSurface('deck');
    if (mode === 'survey') setSurface('survey');
  };

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

  // On the home surface the hero already shows the doc/sync stat — show only the
  // product name in the header subtitle to avoid duplication. On chat/deck/survey
  // (where the hero is gone) show the full stat line.
  const headerSubtitle = surface === 'home'
    ? 'Institutional memory'
    : `Institutional memory · ${docs.toLocaleString()} doc${docs === 1 ? '' : 's'} indexed · synced ${timeAgo(briefing?.knowledge?.last_sync_at)}`;

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSubmit={() => sendMessage(input)}
      sending={sending}
      focusKey={focusKey}
      placeholder={surface === 'chat' ? 'Ask a follow-up…' : "Ask the firm's memory…"}
    />
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header — h-11 (44px), flat bg, minimal chrome */}
      <header className="h-11 px-4 hairline-b bg-bg-primary flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2.5 min-w-0">
            {/* Wordmark — editorial serif, distilled from the Harvey / Claude wordmarks */}
            <span className="font-serif text-[16px] tracking-[-0.01em] text-text-primary leading-none whitespace-nowrap">Command F</span>
            <span className="hidden sm:block h-3 w-px bg-border-light shrink-0" aria-hidden />
            <span className="text-[12px] text-text-muted truncate hidden sm:block">{headerSubtitle}</span>
          </div>
        </div>
        {/* Controls — one aligned cluster; icon-only below md, icon + label at md+ */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowKnowledge(true)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-control text-body ${GHOST_BTN}`}
          >
            <Database className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
            <span className="hidden md:inline">Knowledge</span>
          </button>
          <button
            onClick={() => setShowSessions((s) => !s)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-control text-body ${GHOST_BTN}`}
          >
            <History className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
            <span className="hidden md:inline">History</span>
          </button>
          {surface === 'chat' && (
            <button
              onClick={newChat}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-control text-body ${GHOST_BTN}`}
            >
              <Plus className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
              <span className="hidden md:inline">New</span>
            </button>
          )}
          {/* Model select — embrace native; no appearance-none, no manual chevron */}
          {models.length > 0 && (surface === 'home' || surface === 'chat') && (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Chat model"
              className={`ml-1 text-body h-7 bg-transparent border border-border-light hover:bg-bg-tertiary rounded-control px-2 text-text-secondary outline-none transition-colors ${MOTION} ${FOCUS}`}
            >
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          {headerExtra && <div className="ml-1 flex items-center">{headerExtra}</div>}
        </div>
      </header>

      {/* Session history — overlay Sheet, not inline push */}
      <Sheet
        open={showSessions}
        onClose={() => setShowSessions(false)}
        title="Recent conversations"
        width={420}
      >
        {sessions.length === 0 ? (
          <div className="px-5 pt-6 text-center">
            <p className="text-body text-text-secondary">No conversations yet</p>
            <p className="text-caption text-text-muted mt-1">Your recent threads will appear here.</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2 py-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 pl-2.5 pr-1.5 py-2 rounded-control transition-colors ${MOTION} ${s.id === sessionId ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary/60'}`}
              >
                <button
                  onClick={() => openSession(s.id)}
                  className={`flex flex-1 flex-col min-w-0 text-left rounded-control ${FOCUS}`}
                >
                  <span className="truncate text-body leading-tight">{s.title || 'Untitled'}</span>
                  <span className="text-micro text-text-muted mt-0.5">{timeAgo(s.updated_at)}</span>
                </button>
                <button
                  onClick={() => onDeleteSession(s.id)}
                  className={`opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity ${MOTION} ${FOCUS} rounded-control shrink-0`}
                  aria-label="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* Body */}
      {surface === 'deck' ? (
        <DeckSurface onBack={() => setSurface('home')} clientSlug={activeContext} sessionId={sessionId} />
      ) : surface === 'survey' ? (
        <SurveySurface onBack={() => setSurface('home')} />
      ) : surface === 'chat' ? (
        <>
          <Conversation messages={messages} sending={sending} />
          {/* pt-3 pb-6: tighter gap to transcript, generous breathing room below — intentional asymmetry */}
          <div className="px-6 pb-6 pt-3 shrink-0">
            <div className="max-w-2xl mx-auto">{composer}</div>
          </div>
        </>
      ) : (
        <Landing
          loading={loading}
          briefing={briefing}
          composer={composer}
          suggestions={SUGGESTED}
          onSelectPrompt={selectPrompt}
          onMode={onMode}
        />
      )}

      <KnowledgePanel
        open={showKnowledge}
        onClose={() => setShowKnowledge(false)}
        briefing={briefing}
        sourcesStatus={sourcesStatus}
        syncing={syncing}
        onConnectDrive={onConnectDrive}
        onReindex={runSync}
      />
    </div>
  );
}

export default CommandFPage;
