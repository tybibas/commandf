// Dev-only render-harness fixtures. Not imported by the production entry
// (index.html → src/standalone/main.tsx). Used by mock.html → src/mock/main.tsx
// to exercise every surface through the REAL api.ts contract with a stubbed
// fetch + Supabase session, so screenshots reflect the real components.

import type { Briefing, Session, ModelOption, Source, ChatResponse, DeckOutline } from '../components/commandf/api';

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
  { n: 1, file_id: 'doc-cardinal', file_name: 'Cardinal Mutual — Engagement Retrospective.pdf', content: 'The repositioning hinged on reframing the mutual’s member-first mandate as a growth thesis rather than a constraint, which opened the mid-market segment.', similarity: 0.91, chunk_index: 12 },
  // Second passage from the SAME document — exercises group-by-document + "N passages".
  { n: 4, file_id: 'doc-cardinal', file_name: 'Cardinal Mutual — Engagement Retrospective.pdf', content: 'Sequencing mattered: three quick operational wins in the first 45 days bought the credibility to propose the harder structural change without board resistance.', similarity: 0.84, chunk_index: 27 },
  { n: 2, file_id: 'doc-proof', file_name: 'Proof Points & Case Studies Library.docx', content: 'Across five engagements the single most reusable lever was sequencing quick operational wins before the structural change, buying credibility for the harder moves.', similarity: 0.87, chunk_index: 3 },
  { n: 3, file_id: 'doc-stonepoint', file_name: 'Stonepoint Repositioning — Board Deck.pptx', content: 'Board alignment was reached by tying every workstream to one North-Star metric, cutting the reporting surface from nine dashboards to one.', similarity: 0.82, chunk_index: 8 },
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

// Stage-1 outline — what /generate-deck/outline returns synchronously.
const OUTLINE_SOURCES = [
  { n: 1, file: 'Cardinal Mutual — Engagement Retrospective.pdf', link: '#', snippet: 'Member-first mandate reframed as a growth thesis.' },
  { n: 2, file: 'Proof Points & Case Studies Library.docx', link: '#', snippet: 'Sequencing quick wins before structural change.' },
  { n: 3, file: 'Stonepoint Repositioning — Board Deck.pptx', link: '#', snippet: 'One North-Star metric, nine dashboards to one.' },
];
export const MOCK_OUTLINE: DeckOutline = {
  deliverable_type: 'board_update',
  governing_thought: 'The value-creation plan is on track: quick wins are banked, one structural decision remains, and two risks need the board’s eyes.',
  organizing_construct: 'executive_summary',
  lines_of_argument: [
    'Quick operational wins landed on schedule',
    'The structural decision is now de-risked and ready',
    'Two tracked risks need a board call',
  ],
  slides: [
    { slide_template: 'exec_summary', lede: 'Where the plan stands, and the one decision we need today', must_show: 'Status + the ask', evidence_ns: [1], sources: [OUTLINE_SOURCES[0]] },
    { slide_template: 'status_dashboard', lede: 'Quick wins are banked — 45-day operational targets all met', must_show: 'Operational KPIs vs plan', evidence_ns: [2], sources: [OUTLINE_SOURCES[1]] },
    { slide_template: 'scored_table', lede: 'The structural change is now de-risked and ready to authorize', must_show: 'Options scored', evidence_ns: [1, 2], sources: [OUTLINE_SOURCES[0], OUTLINE_SOURCES[1]] },
    { slide_template: 'matrix_2x2', lede: 'Two risks we are tracking — and the mitigation on each', must_show: 'Risk / likelihood / mitigation', evidence_ns: [3], sources: [OUTLINE_SOURCES[2]] },
    { slide_template: 'next_steps', lede: 'What we need from the board today, and what comes next', must_show: 'Decisions + owners + dates', evidence_ns: [], sources: [] },
  ],
  sources_pool: OUTLINE_SOURCES,
  plan: { note: 'raw emit_plan echoed back as approved_plan' },
};

export const MOCK_DECK_STATUS = {
  status: 'complete' as const,
  slide_count: 5,
  title: 'Q3 SteerCo Update — Value Creation Plan',
  download_url: 'https://mock.local/generate-deck/mock-job/download',
  placeholders: ['[PLACEHOLDER: confirm Q3 loss-ratio figure with the deal team]'],
};

export const MOCK_UPLOAD_STATUS = { status: 'complete' as const, chunks_indexed: 87 };
