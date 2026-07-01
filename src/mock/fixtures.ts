// Dev-only render-harness fixtures. Not imported by the production entry
// (index.html → src/standalone/main.tsx). Used by mock.html → src/mock/main.tsx
// to exercise every surface through the REAL api.ts contract with a stubbed
// fetch + Supabase session, so screenshots reflect the real components.

import type { Briefing, Session, ModelOption, Source, ChatResponse } from '../components/commandf/api';

const now = 1750000000000; // fixed epoch (no Date.now in fixtures → deterministic)
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

export const MOCK_MODELS: ModelOption[] = [
  { id: 'sonnet', name: 'Claude Sonnet' },
  { id: 'opus', name: 'Claude Opus' },
];

export const MOCK_SESSIONS: Session[] = [
  { id: 's1', title: 'Cardinal Mutual repositioning — reusable lessons', updated_at: hoursAgo(2) },
  { id: 's2', title: 'Brightwater diligence through value creation', updated_at: hoursAgo(27) },
  { id: 's3', title: 'Outreach opener in our voice, insurer CFO', updated_at: hoursAgo(52) },
  { id: 's4', title: 'Stonepoint vs Cardinal framing comparison', updated_at: hoursAgo(96) },
];

export const MOCK_BRIEFING: Briefing = {
  client_context: null,
  clients: [{ slug: 'actionist', name: 'Actionist' }],
  signals: { pending: 0, active: 0, total: 0, by_event: [], by_client: [] },
  outreach: { pipeline: 0, sent: 0 },
  engine_recs: { pending: 0 },
  knowledge: {
    doc_count: 1284,
    chunk_count: 41902,
    drive_connected: true,
    last_sync_at: hoursAgo(6),
    last_sync_status: 'complete',
    files: [
      { file_name: 'Cardinal Mutual — Engagement Retrospective.pdf', chunks: 214, modified: hoursAgo(30) },
      { file_name: 'Brightwater / Meridian — Value Creation Plan.docx', chunks: 168, modified: hoursAgo(48) },
      { file_name: 'Stonepoint Repositioning — Board Deck.pptx', chunks: 96, modified: hoursAgo(72) },
      { file_name: 'Firm Positioning & ICP — 2026.pdf', chunks: 52, modified: hoursAgo(120) },
      { file_name: 'Proof Points & Case Studies Library.docx', chunks: 141, modified: hoursAgo(144) },
    ],
  },
};

export const MOCK_SOURCES: Source[] = [
  { n: 1, file_name: 'Cardinal Mutual — Engagement Retrospective.pdf', snippet: 'The repositioning hinged on reframing the mutual’s member-first mandate as a growth thesis rather than a constraint, which unlocked the mid-market segment.', similarity: 0.91 },
  { n: 2, file_name: 'Proof Points & Case Studies Library.docx', snippet: 'Across five engagements the single most reusable lever was sequencing quick operational wins before the structural change, buying credibility for the harder moves.', similarity: 0.87 },
  { n: 3, file_name: 'Stonepoint Repositioning — Board Deck.pptx', snippet: 'Board alignment was reached by tying every workstream to one North-Star metric, cutting the reporting surface from nine dashboards to one.', similarity: 0.82 },
];

const MOCK_ANSWER_MD = `Across the Cardinal Mutual and Stonepoint work, the pattern that repeats is **sequencing credibility before structure**.

- **Reframe the mandate as a growth thesis.** At Cardinal Mutual, the member-first mandate was repositioned from a constraint into the reason the mid-market segment was winnable [1].
- **Bank quick operational wins first.** The most reusable lever across five engagements was landing visible operational wins early, which bought the political capital for the structural change [2].
- **Collapse the reporting surface to one North-Star metric.** Board alignment at Stonepoint came from tying every workstream to a single metric, replacing nine dashboards with one [3].

If you want, I can draft the opening of an outreach note that leads with the Cardinal Mutual lesson.`;

export const MOCK_CHAT_RESPONSE: ChatResponse = {
  response: MOCK_ANSWER_MD,
  sources: MOCK_SOURCES,
  model_used: 'sonnet',
  session_id: 'mock-session',
};

export const MOCK_HISTORY = [
  { role: 'user', content: 'What is the single most reusable lesson across our last five engagements?', sources: [] },
  { role: 'assistant', content: MOCK_ANSWER_MD, sources: MOCK_SOURCES },
];
