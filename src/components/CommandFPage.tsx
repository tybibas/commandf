import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Database, Upload, Presentation, Table2, MessageSquare, Wand2, Loader2,
  Search, GitCompare, Quote, Layers,
} from 'lucide-react';
import { useToast, ToastContainer } from './Toast';
import { supabase } from '../lib/supabase';
import { useClientStrategy } from '../contexts/ActionistStrategyContext';

import {
  COMMANDF_URL, type Message, type Session, type ModelOption, type Briefing, type SourcesStatus,
  fetchModels, fetchSessions, fetchBriefing, fetchHistory, sendChatStream, deleteSession,
  fetchSourcesStatus, startSync, fetchSyncStatus, connectDriveUrl, currentAuth, NotSignedInError,
  uploadDocument, uploadDocumentStatus, EndpointPendingError, optimizePrompt, StreamAbortedError,
} from './commandf/api';
import { useDictation } from '../hooks/useDictation';
import MicButton from './commandf/MicButton';
import {
  readSessionsCache, writeSessionsCache,
  readBriefingCache, writeBriefingCache,
  readDraft, writeDraft, readActiveSession, writeActiveSession,
} from './commandf/sessionsCache';
import { timeAgo } from './commandf/util';
import Composer from './commandf/Composer';
import Conversation from './commandf/Conversation';
import type { ThinkingStep } from './commandf/ThinkingIndicator';
import Landing, { type QuickAction, type ExampleCard } from './commandf/Landing';
import Sidebar from './commandf/Sidebar';
import DeckSurface from './commandf/DeckSurface';
import DeckStudio from './commandf/DeckStudio';
import SurveySurface from './commandf/SurveySurface';
import KnowledgePanel from './commandf/KnowledgePanel';
import CommandPalette, { type PaletteCommand } from './commandf/CommandPalette';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

let _msgKeySeq = 0;
/** Stamp a stable React key onto a message at insertion time. */
const mkMsg = (m: Omit<Message, '_key'>): Message => ({ ...m, _key: `m-${++_msgKeySeq}` });
/** Stamp stable keys on a batch of messages (e.g. loaded history). */
const tagMsgs = (msgs: Message[]): Message[] => msgs.map((m) => m._key ? m : mkMsg(m));

// Curated quick-start prompts (no backing data — intentionally authored).
// The three landing cards teach the three retrieval jobs a consultant runs
// against the firm's memory: find a precedent, compare engagements, pull a
// specific figure. Deck-building is the separate plum pill (a mode switch),
// so it is intentionally not one of these cards.
const PROMPT_PRECEDENT = 'Have we advised on an insurance brokerage roll-up before?';
const PROMPT_COMPARE = 'Compare our Acrisure and K2 Insurance work on buy-and-build strategy';
const PROMPT_FIGURE = 'What synergy assumptions did we use in past roll-up models?';
const PROMPT_PROOF = 'Have we delivered comparable results for an agency client before?';
const PROMPT_POSITIONING = 'Compare how we positioned our two most recent client pitches';
const PROMPT_ICP = 'What ICP and proof points did we lead with for a new client pitch?';
// "Build a deck from these sources" already exists in SourceCard/SourceList
// (per-message affordance) — this pre-fills the composer to invite a follow-on
// comparison after an answer with sources lands.
const PROMPT_COMPARE_SOURCES = 'Compare the engagements cited above side by side: what patterns repeat?';

type Surface = 'home' | 'chat' | 'deck' | 'survey' | 'deckstudio';

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
  // True when the last sessions-list fetch FAILED (error/timeout) — drives a
  // "couldn't load — retry" affordance in the sidebar instead of a silent empty.
  const [sessionsError, setSessionsError] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // True when opening a conversation failed (error/timeout); shows a retry in the
  // conversation surface rather than a blank/stale thread.
  const [historyError, setHistoryError] = useState(false);
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
  // Deck Studio (C-2): the last deck job handed off from DeckSurface's "Edit in
  // studio →". Kept even after leaving the studio surface so the command
  // palette can jump straight back in without re-opening the build panel.
  const [deckStudioSeed, setDeckStudioSeed] = useState<{
    jobId: string; seed: import('./commandf/api').JobStatus; approvedPlan: Record<string, unknown> | null;
  } | null>(null);
  const [steps, setSteps] = useState<ThinkingStep[]>([]);  // live agent progress
  // Accumulated text from delta SSE events — shown as a draft assistant bubble
  // while the synthesis turn streams. Cleared (replaced) on the done event so
  // the final citation-normalized text takes over. Empty string = no draft bubble.
  const [streamDraft, setStreamDraft] = useState('');
  const [surface, setSurface] = useState<Surface>('home');
  const [focusKey, setFocusKey] = useState(0);
  // AbortController for the in-flight sendChatStream call; null when idle.
  const streamCtrlRef = useRef<AbortController | null>(null);
  // Tracks component mount state; polling loops check this to stop on unmount.
  const mountedRef = useRef(true);

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
        if (!mountedRef.current) return;
        const s = await uploadDocumentStatus(file_id);
        if (!mountedRef.current) return;
        if (s.status === 'complete') {
          const n = typeof s.chunks_indexed === 'number' ? s.chunks_indexed : null;
          toast.updateToast(id, n != null ? `Added ${f.name}: ${n.toLocaleString()} passage${n === 1 ? '' : 's'} indexed. Ask me about it.` : `Added ${f.name}, now indexed. Ask me about it.`, 'success');
          return;
        }
        if (s.status === 'error') { toast.updateToast(id, s.error || 'Indexing failed.', 'error'); return; }
        if (Date.now() > deadline) { toast.updateToast(id, `${f.name} is still indexing. It'll be searchable shortly.`, 'success'); return; }
        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (e: any) {
      toast.updateToast(id, e instanceof EndpointPendingError ? 'Upload is momentarily unavailable. Try the knowledge panel.' : (e?.message || 'Upload failed.'), 'error');
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
      toast.error('Could not optimize your prompt. Try again.');
    } finally {
      setOptimizing(false);
    }
  };

  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable user id for keying the local sessions cache (avoids stale closures).
  const userIdRef = useRef<string | null>(null);
  // Latest session the user intends to view — read (not state) so in-flight
  // history fetches can detect they are stale without setState-updater reads.
  const activeSessionRef = useRef<string | null>(null);
  // Restore the draft/active-thread exactly once, after the uid is known.
  const didRestoreRef = useRef(false);

  // Flip mountedRef on unmount so polling loops in dropUpload can exit cleanly.
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Persist the composer draft and the active thread so a tab close / reload /
  // minimize never loses progress. Writes are keyed by the signed-in operator.
  useEffect(() => { writeDraft(userIdRef.current, input); }, [input]);
  useEffect(() => { writeActiveSession(userIdRef.current, sessionId); }, [sessionId]);

  const notConfigured = !COMMANDF_URL;

  const loadBriefing = useCallback(async (cc: string) => {
    // The briefing includes the corpus count, whose RPC can time out under heavy
    // DB write load (e.g. an index build). fetchBriefing swallows that to null;
    // retry with backoff so a transient bad window self-heals (the KB count
    // fills in) without the user having to reload. Never throws.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 5000));
      const b = await fetchBriefing(cc);
      if (b) {
        setBriefing(b);
        // Cache only the default view (cc === '') — a client-filtered briefing
        // must never overwrite the all-clients default that a fresh tab reads.
        if (cc === '') writeBriefingCache(userIdRef.current, b);
        return;
      }
    }
    // All attempts failed — leave briefing as-is; the KB panel already shows
    // its honest "Syncing…" state instead of a fake 0.
  }, []);

  // Refetch the authoritative list and reconcile the local cache. CRITICAL: only
  // a SUCCESSFUL response (ok:true) may overwrite the cache — a genuine empty
  // history clears it, but an error/timeout must NEVER wipe it (that was the
  // "all my chats disappeared" bug: a timeout returned [] and blanked the rail +
  // cache). On failure we keep whatever is on screen (cached/optimistic) and, if
  // there is nothing to show, raise a "couldn't load — retry" banner.
  const loadSessions = useCallback(async () => {
    const res = await fetchSessions();
    if (res.ok) {
      setSessions(res.data);
      writeSessionsCache(userIdRef.current, res.data);
      setSessionsError(false);
    } else {
      // Keep the current (cached) list on screen; only flag an error when we have
      // nothing cached to fall back to, so the sidebar can offer a retry instead
      // of an empty list that reads as "no conversations".
      setSessionsError(true);
    }
  }, []);

  const loadSidecar = useCallback(async () => {
    if (notConfigured) { setLoading(false); return; }
    // ONE local getSession() read for both token + uid (was two back-to-back).
    const { token, uid } = await currentAuth();
    if (!token) {
      toast.error('Not signed in. Please re-authenticate.');
      setLoading(false);
      return;
    }
    // Seed the sidebar from the per-user cache immediately (zero-flash), then
    // revalidate against the server below (stale-while-revalidate).
    userIdRef.current = uid;
    const cached = readSessionsCache(uid);
    if (cached.length) setSessions(cached);
    // Seed the briefing (KB doc count etc.) from the local cache so the
    // Knowledge panel shows real numbers instantly on a fresh tab / new profile,
    // before the live fetchBriefing response arrives (stale-while-revalidate).
    const cachedBriefing = readBriefingCache(uid);
    if (cachedBriefing) setBriefing(cachedBriefing);
    // Restore the unsent composer draft and the last open thread (survives tab
    // close / reload). Guarded so it runs once and never clobbers live typing.
    if (!didRestoreRef.current) {
      didRestoreRef.current = true;
      const draft = readDraft(uid);
      if (draft) setInput((cur) => cur || draft);
      const lastSid = readActiveSession(uid);
      if (lastSid) {
        activeSessionRef.current = lastSid;
        setSessionId(lastSid);
        setSurface('chat');
        setHistoryError(false);
        fetchHistory(lastSid)
          .then((h) => { if (activeSessionRef.current === lastSid) setMessages(tagMsgs(h)); })
          // On failure keep the thread open with a retry rather than silently
          // bouncing home (which reads as "the conversation vanished"). Only a
          // clean load with no messages stays; an error/timeout shows the banner.
          .catch(() => { setHistoryError(true); });
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

  // Re-fetch the sessions list on a genuine SIGN-IN so conversations reappear the
  // moment auth is (re)established — e.g. after the backend switched to keying
  // sessions on the stable auth `sub`. We ignore TOKEN_REFRESHED / same-user
  // re-notifications (they don't change WHOSE sessions we should show and would
  // just cause redundant fetches); we act only when the signed-in uid CHANGES.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event !== 'SIGNED_IN') return;
      const uid = sess?.user?.id ?? null;
      if (!uid || uid === userIdRef.current) return; // same user re-notified → no-op
      userIdRef.current = uid;
      const cached = readSessionsCache(uid);
      if (cached.length) setSessions(cached); // zero-flash from cache first
      loadSessions();                          // then revalidate against the server
    });
    return () => subscription.unsubscribe();
  }, [loadSessions]);

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
    activeSessionRef.current = sid;
    setSessionId(sid); setSurface('chat'); setHistoryError(false);
    try {
      const msgs = await fetchHistory(sid);
      // Staleness guard: discard results if the user switched to a different
      // session while this fetch was in-flight (fast A→B click).
      if (activeSessionRef.current === sid) setMessages(tagMsgs(msgs));
    } catch (e: any) {
      // Do NOT blank the thread on failure — leave what's there and surface a
      // retry. A timeout/error must never read as "this conversation is empty".
      if (activeSessionRef.current === sid) {
        setHistoryError(true);
        toast.error(e?.message || 'Could not load conversation.');
      }
    }
  };

  // Retry the current conversation load after a transient error/timeout.
  const retryHistory = useCallback(async () => {
    if (!sessionId) return;
    setHistoryError(false);
    try { setMessages(tagMsgs(await fetchHistory(sessionId))); }
    catch { setHistoryError(true); }
  }, [sessionId]);

  const newChat = () => { activeSessionRef.current = null; setSessionId(null); setMessages([]); setSurface('home'); setHistoryError(false); setFocusKey((k) => k + 1); };

  const cancelStream = () => {
    streamCtrlRef.current?.abort();
  };

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending || notConfigured) return;
    setInput('');
    setSurface('chat');
    setMessages((prev) => [...prev, mkMsg({ role: 'user', content: msg })]);
    setSending(true);
    setSteps([]);
    setStreamDraft('');
    const ctrl = new AbortController();
    streamCtrlRef.current = ctrl;
    try {
      // Streaming: live step-progress feeds the thinking indicator; delta events
      // stream the synthesis turn's text into a draft bubble. Resolves with the
      // final answer (citation-normalized); the draft is replaced by the final.
      // No auto-retry on error — that would double-charge the query.
      const data = await sendChatStream(
        msg, model, sessionId,
        (evt) => {
          // A new tool round started: any streamed text so far was that turn's
          // preamble, not the answer — clear the draft so it never lingers.
          setStreamDraft('');
          setSteps((prev) => [...prev, {
            phase: evt.phase, step: evt.step, label: evt.label, tool: evt.tool, count: evt.count,
          } as ThinkingStep]);
        },
        ctrl.signal,
        (text) => setStreamDraft((prev) => prev + text),
      );
      if (data.session_id && !sessionId) {
        // New thread — optimistically insert it at the top of the rail so it
        // appears instantly (title = first message), then reconcile with server.
        activeSessionRef.current = data.session_id;
        setSessionId(data.session_id);
        setSessions((prev) => [
          { id: data.session_id!, title: msg.slice(0, 60), updated_at: new Date().toISOString() },
          ...prev.filter((s) => s.id !== data.session_id),
        ]);
        loadSessions();
      }
      setMessages((prev) => [...prev, mkMsg({ role: 'assistant', content: data.response, sources: data.sources || [] })]);
    } catch (e: any) {
      if (e instanceof StreamAbortedError) {
        // Cancelled by user — brief toast only, no inline bubble.
        toast.error('Response cancelled.');
      } else if (e instanceof NotSignedInError) {
        // Auth error — toast only (no inline bubble, since the session is broken).
        toast.error(e.message);
      } else {
        // Stream failure — inline error bubble is the persistent surface; no toast.
        const m = e?.message || 'Something went wrong.';
        setMessages((prev) => [...prev, mkMsg({ role: 'assistant', content: m, error: true })]);
      }
    } finally {
      streamCtrlRef.current = null;
      setSending(false);
      setSteps([]);
      setStreamDraft('');
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

  // Deck → Deck Studio handoff (C-2): opens the split chat↔canvas editor seeded
  // with the just-built deck. Kept as its own callback (rather than inlining in
  // DeckSurface) so the palette can re-open the same seed later.
  const openDeckStudio = useCallback((args: {
    jobId: string; seed: import('./commandf/api').JobStatus; approvedPlan: Record<string, unknown> | null;
  }) => {
    setDeckStudioSeed(args);
    setSurface('deckstudio');
  }, []);

  // W6.3 — deterministic follow-up chip. Shown only once the LATEST assistant
  // turn has actually finished (not streaming) and carries real sources; hides
  // the instant the user starts typing or sends, so it never lingers stale.
  const lastMsg = messages[messages.length - 1];
  const showCompareChip = surface === 'chat' && !sending && !input.trim()
    && lastMsg?.role === 'assistant' && !lastMsg.error && (lastMsg.sources?.length ?? 0) > 0;

  if (notConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <span className="font-display text-xl font-light tracking-[-0.015em] text-text-primary leading-none block mb-3">Command F</span>
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
    ...(deckStudioSeed
      ? [{ id: 'deckstudio', label: 'Edit in deck studio', group: 'Actions', icon: Layers, keywords: 'edit ops chat canvas', run: () => setSurface('deckstudio') } as PaletteCommand]
      : []),
    ...sessions.slice(0, 8).map((s): PaletteCommand => ({
      id: `s-${s.id}`, label: s.title || 'Untitled', group: 'Recent', icon: MessageSquare,
      hint: timeAgo(s.updated_at), run: () => openSession(s.id),
    })),
  ];

  // "Build a deck" stays the one primary action (house rule: one primary per
  // view) — it launches the deck surface directly. The example cards below it
  // are a different kind of affordance: real questions that pre-fill the
  // composer, teaching what the firm's memory can answer (W6.1).
  const buildDeckAction: QuickAction = { label: 'Build a deck', icon: Presentation, onClick: () => setSurface('deck') };
  const exampleCards: ExampleCard[] = (isActionist
    ? [
        { capability: 'Find a precedent', question: PROMPT_PRECEDENT, icon: Search },
        { capability: 'Compare engagements', question: PROMPT_COMPARE, icon: GitCompare },
        { capability: 'Pull a figure', question: PROMPT_FIGURE, icon: Quote },
      ]
    : [
        { capability: 'Find a precedent', question: PROMPT_PROOF, icon: Search },
        { capability: 'Compare pitches', question: PROMPT_POSITIONING, icon: GitCompare },
        { capability: 'Pull positioning', question: PROMPT_ICP, icon: Quote },
      ]
  ).map((c) => ({ ...c, onClick: () => selectPrompt(c.question) }));

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
        title="Clean up my prompt: restructure your notes into a sharp, well-formed prompt before sending"
      >
        {optimizing
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" aria-hidden />
          : <Wand2 className="w-3.5 h-3.5 text-accent-ink" strokeWidth={1.75} aria-hidden />}
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
      onCancel={cancelStream}
      focusKey={focusKey}
      placeholder={surface === 'chat' ? 'Ask a follow-up…' : "Ask the firm's memory: how did we approach [topic] for [client]…"}
      rotatingPlaceholder={surface !== 'chat'}
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
        sessionsError={sessionsError}
        onRetrySessions={loadSessions}
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
          <div className="absolute inset-3 z-30 rounded-card border-2 border-dashed border-accent/60 bg-bg-primary/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none animate-fade-in">
            <Upload className="w-8 h-8 text-accent-ink mb-2" strokeWidth={1.5} aria-hidden />
            <p className="text-body font-medium text-text-primary">Drop to add to your knowledge base</p>
            <p className="text-caption text-text-muted mt-1">PDF, DOCX, or PPTX. Indexed and searchable in chat.</p>
          </div>
        )}
        {surface === 'deck' ? (
          <DeckSurface onBack={() => setSurface('home')} clientSlug={activeContext} sessionId={sessionId} initialBrief={deckSeed} initialFileIds={pinnedFileIds} onOpenSurvey={() => setSurface('survey')} onOpenStudio={openDeckStudio} />
        ) : surface === 'deckstudio' && deckStudioSeed ? (
          <DeckStudio
            onBack={() => setSurface('home')}
            jobId={deckStudioSeed.jobId}
            approvedPlan={deckStudioSeed.approvedPlan}
            seed={deckStudioSeed.seed}
            clientSlug={activeContext}
            sessionId={sessionId}
          />
        ) : surface === 'survey' ? (
          <SurveySurface onBack={() => setSurface('home')} />
        ) : surface === 'chat' ? (
          <>
            {historyError && (
              <div className="mx-6 mt-4 shrink-0 flex items-center justify-between gap-3 rounded-surface border border-border-light bg-bg-secondary px-4 py-2.5 text-caption text-text-secondary animate-fade-in">
                <span>Couldn't load this conversation. It may be a temporary connection issue.</span>
                <button
                  type="button"
                  onClick={retryHistory}
                  className={`shrink-0 inline-flex items-center h-7 px-2.5 rounded-pill border border-border-light text-caption text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
                >
                  Retry
                </button>
              </div>
            )}
            <Conversation messages={messages} sending={sending} steps={sending ? steps : undefined} streamDraft={streamDraft || undefined} onReuse={prefillComposer} onBuildDeck={buildDeckFromChat} />
            {showCompareChip && (
              <div className="px-6 pt-3 shrink-0">
                <div className="max-w-2xl mx-auto flex flex-wrap gap-2 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => prefillComposer(PROMPT_COMPARE_SOURCES)}
                    className={`rounded-pill border border-border-light bg-bg-elevated text-body-sm px-3.5 py-1.5 text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors ${MOTION} ${FOCUS}`}
                  >
                    Compare these engagements side by side
                  </button>
                </div>
              </div>
            )}
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
            buildDeckAction={buildDeckAction}
            exampleCards={exampleCards}
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
