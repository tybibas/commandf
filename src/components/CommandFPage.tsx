import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Database, Upload, Presentation, Table2, Search, GitCompare, MessageSquare, Wand2, Loader2,
} from 'lucide-react';
import { useToast, ToastContainer } from './Toast';
import { useClientStrategy } from '../contexts/ClientStrategyContext';

import {
  COMMANDF_URL, type Message, type Session, type ModelOption, type Briefing, type SourcesStatus,
  fetchModels, fetchSessions, fetchBriefing, fetchHistory, sendChatStream, deleteSession,
  fetchSourcesStatus, startSync, fetchSyncStatus, connectDriveUrl, currentToken, currentUserId, NotSignedInError,
  uploadDocument, uploadDocumentStatus, EndpointPendingError, optimizePrompt,
} from './commandf/api';
import { useDictation } from '../hooks/useDictation';
import MicButton from './commandf/MicButton';
import {
  readSessionsCache, writeSessionsCache,
  readDraft, writeDraft, readActiveSession, writeActiveSession,
} from './commandf/sessionsCache';
import { timeAgo } from './commandf/util';
import Composer from './commandf/Composer';
import Conversation from './commandf/Conversation';
import type { ThinkingStep } from './commandf/ThinkingIndicator';
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
const PROMPT_COMPARE = 'Compare how we framed the repositioning at Stonepoint with the redesign at Cardinal.';

type Surface = 'home' | 'chat' | 'deck' | 'survey';

function greetingForNow(): string {
  // Anchor to Pacific time regardless of the viewer's local zone, so the
  // greeting matches the firm's working day (PT). Intl handles PDT/PST.
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false,
  }).format(new Date());
  const h = parseInt(hourStr, 10) % 24; // some ICU builds render midnight as "24"
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Structured account props replace the opaque `headerExtra` ReactNode.
 * The account bar is owned by Sidebar and adapts to the collapsed state. */
export function CommandFPage({
  userName,
  userEmail,
  planLabel,
  onSignOut,
}: {
  userName?: string;
  userEmail?: string;
  planLabel?: string;
  onSignOut?: () => void;
} = {}) {
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
  const [pinnedFileIds, setPinnedFileIds] = useState<string[]>([]);  // source-pinning for deck build
  const [steps, setSteps] = useState<ThinkingStep[]>([]);  // live agent progress
  const [surface, setSurface] = useState<Surface>('home');
  const [focusKey, setFocusKey] = useState(0);

  const { activeContext } = useClientStrategy();
  const isActionist = activeContext === 'actionist';
  const contextLabel = isActionist ? 'Actionist Consulting' : 'Operator workspace';

  const toast = useToast();
  // Drag-and-drop a document into the chat → route it to the live upload→index
  // path so it becomes searchable (grounded), the way Claude/ChatGPT accept files.
  const [dragDepth, setDragDepth] = useState(0);
  const DROP_ACCEPT = /\.(pdf|docx|pptx)$/i;
  const dropUpload = async (f: File) => {
    if (!DROP_ACCEPT.test(f.name)) { toast.error('Drop a PDF, DOCX, or PPTX.'); return; }
    const id = toast.loading(`Indexing ${f.name}…`);
    try {
      const { file_id } = await uploadDocument(f);
      const deadline = Date.now() + 3 * 60_000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const s = await uploadDocumentStatus(file_id);
        if (s.status === 'complete') {
          const n = typeof s.chunks_indexed === 'number' ? s.chunks_indexed : null;
          toast.updateToast(id, n != null ? `Added ${f.name} — ${n.toLocaleString()} passage${n === 1 ? '' : 's'} indexed. Ask me about it.` : `Added ${f.name} — indexed. Ask me about it.`, 'success');
          return;
        }
        if (s.status === 'error') { toast.updateToast(id, s.error || 'Indexing failed.', 'error'); return; }
        if (Date.now() > deadline) { toast.updateToast(id, `${f.name} is still indexing — it'll be searchable shortly.`, 'success'); return; }
        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (e: any) {
      toast.updateToast(id, e instanceof EndpointPendingError ? 'Upload is momentarily unavailable — try the knowledge panel.' : (e?.message || 'Upload failed.'), 'error');
    }
  };
  // Voice dictation feeds the composer live; "Optimize" rewrites the notes in place.
  const [optimizing, setOptimizing] = useState(false);
  const dictBaseRef = useRef('');
  const dictation = useDictation({ onTranscript: (t) => setInput(dictBaseRef.current + t) });
  const handleMic = () => {
    if (dictation.isListening) { dictation.stop(); return; }
    dictBaseRef.current = input.trim() ? input.replace(/\s*$/, '') + ' ' : '';
    dictation.start();
  };
  const optimize = async () => {
    const text = input.trim();
    if (!text || optimizing || dictation.isListening) return;
    setOptimizing(true);
    try {
      const { optimized } = await optimizePrompt(text);
      if (optimized && optimized.trim()) { setInput(optimized.trim()); setFocusKey((k) => k + 1); }
    } catch {
      toast.error('Could not optimize your prompt — try again.');
    } finally {
      setOptimizing(false);
    }
  };

  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable user id for keying the local sessions cache (avoids stale closures).
  const userIdRef = useRef<string | null>(null);
  // Restore the draft/active-thread exactly once, after the uid is known.
  const didRestoreRef = useRef(false);

  // Persist the composer draft and the active thread so a tab close / reload /
  // minimize never loses progress. Writes are keyed by the signed-in operator.
  useEffect(() => { writeDraft(userIdRef.current, input); }, [input]);
  useEffect(() => { writeActiveSession(userIdRef.current, sessionId); }, [sessionId]);

  const notConfigured = !COMMANDF_URL;

  const loadBriefing = useCallback(async (cc: string) => {
    // The briefing includes the corpus count, whose RPC can time out under heavy
    // DB write load. fetchBriefing swallows that to null; retry once after a short
    // backoff so a transient timeout self-heals (the KB count fills in) without
    // the user having to reload. Never throws.
    let b = await fetchBriefing(cc);
    if (!b) {
      await new Promise((r) => setTimeout(r, 4000));
      b = await fetchBriefing(cc);
    }
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
    // Restore the unsent composer draft and the last open thread (survives tab
    // close / reload). Guarded so it runs once and never clobbers live typing.
    if (!didRestoreRef.current) {
      didRestoreRef.current = true;
      const draft = readDraft(uid);
      if (draft) setInput((cur) => cur || draft);
      const lastSid = readActiveSession(uid);
      if (lastSid) {
        setSessionId(lastSid);
        setSurface('chat');
        fetchHistory(lastSid)
          .then((h) => setMessages(h))
          .catch(() => { setSessionId(null); setSurface('home'); writeActiveSession(uid, null); });
      }
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

  // Stop dictation on Escape.
  useEffect(() => {
    if (!dictation.isListening) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') dictation.stop(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [dictation.isListening, dictation.stop]);

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
    setSteps([]);
    try {
      // Streaming: live step-progress feeds the thinking indicator. Resolves with
      // the final answer even if a proxy buffers the events (steps just arrive at
      // the end). No auto-retry on error — that would double-charge the query.
      const data = await sendChatStream(msg, model, sessionId, (evt) =>
        setSteps((prev) => [...prev, {
          phase: evt.phase, step: evt.step, label: evt.label, tool: evt.tool, count: evt.count,
        } as ThinkingStep]));
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
      setSteps([]);
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
  const buildDeckFromChat = useCallback((fileIds: string[]) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    setDeckSeed(lastUser?.content ?? '');
    setPinnedFileIds(fileIds || []);  // source-pinning: ground the deck in the shown docs
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

  // Lead with the tool's most distinctive capability (build a deck grounded in
  // past work), then the two highest-value ways to interrogate the firm's memory.
  // "Draft in our voice" was dropped from the lead row — it's an outreach/PulsePoint
  // pattern, not an Actionist lead function, and a grounded memo is reachable by
  // prompt or the deck's pov_memo type when actually needed.
  const quickActions: QuickAction[] = [
    { label: 'Build a deck', icon: Presentation, onClick: () => setSurface('deck') },
    { label: 'Find a precedent', icon: Search, onClick: () => selectPrompt(isActionist ? PROMPT_SIMILAR : PROMPT_PROOF) },
    { label: 'Compare engagements', icon: GitCompare, onClick: () => selectPrompt(isActionist ? PROMPT_COMPARE : PROMPT_ICP) },
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
      <MicButton isListening={dictation.isListening} supported={dictation.supported} error={dictation.error} onClick={handleMic} />
      <button
        type="button"
        onClick={optimize}
        disabled={!input.trim() || optimizing || dictation.isListening}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-pill border border-border-light text-caption text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors ${MOTION} ${FOCUS} disabled:opacity-40 disabled:pointer-events-none`}
        title="Clean up my prompt — restructure your notes into a sharp, well-formed prompt before sending"
      >
        {optimizing
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" aria-hidden />
          : <Wand2 className="w-3.5 h-3.5 text-brand-ink" strokeWidth={1.75} aria-hidden />}
        {optimizing ? 'Optimizing…' : 'Optimize'}
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
        userName={userName}
        userEmail={userEmail}
        planLabel={planLabel}
        onSignOut={onSignOut}
      />

      <div
        className="relative flex-1 flex flex-col min-h-0"
        onDragEnter={(e) => { if ((surface === 'home' || surface === 'chat') && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragDepth((d) => d + 1); } }}
        onDragOver={(e) => { if (dragDepth > 0) e.preventDefault(); }}
        onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
        onDrop={(e) => { if (dragDepth > 0) { e.preventDefault(); setDragDepth(0); const f = e.dataTransfer.files?.[0]; if (f) dropUpload(f); } }}
      >
        {dragDepth > 0 && (surface === 'home' || surface === 'chat') && (
          <div className="absolute inset-3 z-30 rounded-2xl border-2 border-dashed border-brand/60 bg-bg-primary/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none animate-fade-in">
            <Upload className="w-8 h-8 text-brand-ink mb-2" strokeWidth={1.5} aria-hidden />
            <p className="text-body font-medium text-text-primary">Drop to add to your knowledge base</p>
            <p className="text-caption text-text-muted mt-1">PDF, DOCX, or PPTX — indexed and searchable in chat</p>
          </div>
        )}
        {surface === 'deck' ? (
          <DeckSurface onBack={() => setSurface('home')} clientSlug={activeContext} sessionId={sessionId} initialBrief={deckSeed} initialFileIds={pinnedFileIds} onOpenSurvey={() => setSurface('survey')} />
        ) : surface === 'survey' ? (
          <SurveySurface onBack={() => setSurface('home')} />
        ) : surface === 'chat' ? (
          <>
            <Conversation messages={messages} sending={sending} steps={sending ? steps : undefined} onReuse={prefillComposer} onBuildDeck={buildDeckFromChat} />
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
