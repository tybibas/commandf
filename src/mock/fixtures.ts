// Dev-only render-harness fixtures. Not imported by the production entry
// (index.html → src/standalone/main.tsx). Used by mock.html → src/mock/main.tsx
// to exercise every surface through the REAL api.ts contract with a stubbed
// fetch + Supabase session, so screenshots reflect the real components.

import type {
  Briefing, Session, ModelOption, Source, ChatResponse, DeckOutline,
  StudioSession, DeckStreamEvent, CostSummary, CaseStudyCandidate,
} from '../components/commandf/api';

const now = 1750000000000; // fixed epoch (no Date.now in fixtures → deterministic)
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

// Mirrors the live backend /models roster (llm.py AVAILABLE_MODELS): Claude-only
// today, Haiku the default. No Opus is served — the old mock's "Opus" was stale.
export const MOCK_MODELS: ModelOption[] = [
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', description: 'Fast, default', cost: '$' },
  { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', description: 'Balanced', cost: '$$' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', description: 'Most capable', cost: '$$$' },
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
  { role: 'user', content: 'Build a one-page proposal for a PE firm prospect covering due diligence services. The proposal should:\n- Lead with a past engagement where we conducted due diligence for a PE firm on a toy company acquisition or portfolio company\n- Summarize the results we delivered in that engagement\n- Explain why those results and our approach make us the right choice for this prospect\n\nSearch our document corpus for relevant past PE due diligence work, especially toy/consumer goods sector cases, and pull language, findings, and methodology that can anchor this proposal.', sources: [] },
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

// ── Deck Studio (C-2) mock substrate ─────────────────────────────────────────
// A data-URI SVG stand-in for a rendered slide PNG. `<img>` loads bypass the
// stubbed window.fetch, so the canvas/filmstrip need directly-loadable sources.
// The `rev` is stamped visibly so a re-fetched (edited) slide is verifiably
// different — this is how the dirty-slide re-render is confirmed at $0.
const SLIDE_TITLES = [
  'Executive summary', 'Status dashboard', 'Options, scored',
  'Risks we are tracking', 'What we need today',
];
export function mockSlidePreview(index: number, rev: number): string {
  const t = SLIDE_TITLES[index] ?? `Slide ${index + 1}`;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>" +
    "<rect width='640' height='360' fill='#FEFDFA'/>" +
    "<rect x='0' y='0' width='640' height='6' fill='#2F1D34'/>" +
    `<text x='40' y='74' font-family='DM Sans, sans-serif' font-size='30' fill='#282828'>${t}</text>` +
    "<rect x='40' y='104' width='420' height='3' fill='#EB5E28'/>" +
    "<rect x='40' y='150' width='560' height='14' rx='3' fill='#EFEBE4'/>" +
    "<rect x='40' y='182' width='520' height='14' rx='3' fill='#EFEBE4'/>" +
    "<rect x='40' y='214' width='480' height='14' rx='3' fill='#EFEBE4'/>" +
    `<text x='40' y='332' font-family='IBM Plex Mono, monospace' font-size='13' fill='#A49B8A'>S${index + 1} · rev ${rev}</text>` +
    '</svg>';
  // `btoa` only round-trips Latin-1 correctly; the caption's middle-dot (·,
  // U+00B7) becomes a lone byte that is invalid UTF-8 once the browser decodes
  // this as `image/svg+xml` XML — the SVG then fails to parse SILENTLY
  // (naturalWidth 0, no console error, no network event). encodeURIComponent
  // + unescape re-expresses the string as a byte sequence btoa can encode
  // losslessly, so the decoded bytes are valid UTF-8 again.
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
export const MOCK_SLIDE_IDS = ['s_ov01', 's_st02', 's_sc03', 's_rk04', 's_ns05'];
const MOCK_DECK_PREVIEWS = MOCK_SLIDE_IDS.map((_, i) => mockSlidePreview(i, 1));

export const MOCK_DECK_STATUS = {
  status: 'complete' as const,
  slide_count: 5,
  title: 'Q3 SteerCo Update — Value Creation Plan',
  download_url: 'https://mock.local/generate-deck/mock-job/download',
  preview_urls: MOCK_DECK_PREVIEWS,
  deck_rev: 1,
  placeholders: ['[PLACEHOLDER: confirm Q3 loss-ratio figure with the deal team]'],
};

// Studio session (§4) — build-format options + category-grounding provenance.
export const MOCK_STUDIO_SESSION: StudioSession = {
  deck_rev: 1,
  slide_order: MOCK_SLIDE_IDS,
  build_format_options: [
    { format: 'proposal', target_category: 'proposal', label: 'Proposal' },
    { format: 'engagement_recap', target_category: 'client_deliverable', label: 'Engagement recap' },
    { format: 'pov_memo', target_category: 'client_deliverable', label: 'POV memo' },
  ],
  active_format: 'engagement_recap',
  active_target_category: 'client_deliverable',
  grounding: {
    target_category: 'client_deliverable',
    content_pool: {
      n_chunks: 12, n_files: 9, category_matched_files: 4,
      top_similarity: 0.71, similarity_floor: 0.2,
    },
    style_exemplars: {
      filter_deliverable_type: 'engagement_recap',
      n_matched: 3,
      fell_back_unfiltered: false,
      exemplars: [
        {
          deck_name: 'Cardinal Mutual — Engagement Retrospective',
          deliverable_type: 'engagement_recap', service_line: 'ValueCreation',
          density: 'high', uses_harvey_balls: true,
          chart_types: ['bar', 'waterfall'], frameworks: ['2x2'],
          archetype_sequence: ['exec_summary', 'status_dashboard', 'scored_table', 'next_steps'],
          png_prefix: 'cardinal', n_slides: 11,
        },
        {
          deck_name: 'Stonepoint Repositioning — Board Deck',
          deliverable_type: 'engagement_recap', service_line: 'Repositioning',
          density: 'medium', uses_harvey_balls: false,
          chart_types: ['line'], frameworks: ['matrix_2x2'],
          archetype_sequence: ['exec_summary', 'kpi', 'matrix_2x2', 'next_steps'],
          png_prefix: 'stonepoint', n_slides: 9,
        },
      ],
    },
  },
  chat_turns: [],
};

// A canned edit-op batch stream (§3.1 SSE lines) — user asked to tighten the
// objectives and turn the risk chart into a donut. Two slides go dirty (0 and 3);
// the terminal batch_done bumps deck_rev to 2 so re-fetched previews render "rev 2".
export const MOCK_DECK_EDIT_STREAM: DeckStreamEvent[] = [
  { event: 'batch_start', batch_id: 'eb_mock_01', planned: 3, summary: 'Tightening the summary and reworking the risk chart' },
  { event: 'assistant_delta', text: 'On it — ' },
  { event: 'assistant_delta', text: 'tightening the executive summary ' },
  { event: 'assistant_delta', text: 'and switching the risk chart to a donut.' },
  { event: 'phase', label: 'Rewriting the executive summary', state: 'active' },
  {
    event: 'op', index: 0, status: 'applied',
    op: {
      op_id: 'op_a1', batch_id: 'eb_mock_01', type: 'rewrite_body',
      target: { slide_id: 's_ov01', element_id: 'body' },
      summary: 'Tightened the executive summary to three lines',
      reversible: true, affects_slides: ['s_ov01'],
    },
  },
  { event: 'slide_dirty', slide_ids: ['s_ov01'], slide_indices: [1] },
  {
    event: 'op', index: 1, status: 'applied',
    op: {
      op_id: 'op_a2', batch_id: 'eb_mock_01', type: 'edit_bullet',
      target: { slide_id: 's_ov01', element_id: 'b_lead' },
      summary: 'Sharpened the opening bullet to name the single decision',
      reversible: true, affects_slides: ['s_ov01'],
    },
  },
  { event: 'phase', label: 'Reworking the risk chart', state: 'active' },
  {
    event: 'op', index: 2, status: 'applied',
    op: {
      op_id: 'op_a3', batch_id: 'eb_mock_01', type: 'change_chart_type',
      target: { slide_id: 's_rk04', element_id: 'chart' },
      summary: 'Changed the risk chart to a donut',
      reversible: true, affects_slides: ['s_rk04'],
    },
  },
  { event: 'slide_dirty', slide_ids: ['s_rk04'], slide_indices: [4] },
  { event: 'batch_done', batch_id: 'eb_mock_01', deck_rev: 2, applied: 3, failed: 0, slide_order: MOCK_SLIDE_IDS },
];

// A forward batch where one op FAILS (status:'failed' + error) — exercises the
// failed op card. The chart op fails; only slide 1 goes dirty; applied 2, failed 1.
export const MOCK_DECK_EDIT_STREAM_FAIL: DeckStreamEvent[] = [
  { event: 'batch_start', batch_id: 'eb_mock_02', planned: 2, summary: 'Tightening the summary and reworking the risk chart' },
  { event: 'assistant_delta', text: 'Tightened the summary. ' },
  { event: 'assistant_delta', text: "The chart change didn't apply." },
  { event: 'phase', label: 'Rewriting the executive summary', state: 'active' },
  {
    event: 'op', index: 0, status: 'applied',
    op: {
      op_id: 'op_b1', batch_id: 'eb_mock_02', type: 'rewrite_body',
      target: { slide_id: 's_ov01', element_id: 'body' },
      summary: 'Tightened the executive summary to three lines',
      reversible: true, affects_slides: ['s_ov01'],
    },
  },
  { event: 'slide_dirty', slide_ids: ['s_ov01'], slide_indices: [1] },
  {
    event: 'op', index: 1, status: 'failed',
    error: 'The risk chart has no numeric series to convert to a donut.',
    op: {
      op_id: 'op_b2', batch_id: 'eb_mock_02', type: 'change_chart_type',
      target: { slide_id: 's_rk04', element_id: 'chart' },
      summary: 'Change the risk chart to a donut',
      reversible: false, affects_slides: ['s_rk04'],
    },
  },
  { event: 'batch_done', batch_id: 'eb_mock_02', deck_rev: 2, applied: 1, failed: 1, slide_order: MOCK_SLIDE_IDS },
];

// Undo of eb_mock_01 — the backend streams the INVERSE ops back (same shape). The
// deck_rev still advances (monotonic; bumps on undo too, §3.4); slides 1 & 4 re-render.
export const MOCK_DECK_UNDO_STREAM: DeckStreamEvent[] = [
  { event: 'batch_start', batch_id: 'eb_mock_01_undo', planned: 3, summary: 'Reverting 3 changes' },
  {
    event: 'op', index: 0, status: 'applied',
    op: {
      op_id: 'op_a3i', batch_id: 'eb_mock_01_undo', type: 'change_chart_type',
      target: { slide_id: 's_rk04', element_id: 'chart' },
      summary: 'Reverted the risk chart to its bar form',
      reversible: true, affects_slides: ['s_rk04'],
    },
  },
  {
    event: 'op', index: 1, status: 'applied',
    op: {
      op_id: 'op_a2i', batch_id: 'eb_mock_01_undo', type: 'edit_bullet',
      target: { slide_id: 's_ov01', element_id: 'b_lead' },
      summary: 'Restored the original opening bullet',
      reversible: true, affects_slides: ['s_ov01'],
    },
  },
  {
    event: 'op', index: 2, status: 'applied',
    op: {
      op_id: 'op_a1i', batch_id: 'eb_mock_01_undo', type: 'rewrite_body',
      target: { slide_id: 's_ov01', element_id: 'body' },
      summary: 'Restored the original executive summary',
      reversible: true, affects_slides: ['s_ov01'],
    },
  },
  { event: 'slide_dirty', slide_ids: ['s_ov01', 's_rk04'], slide_indices: [1, 4] },
  { event: 'batch_done', batch_id: 'eb_mock_01_undo', deck_rev: 3, applied: 3, failed: 0, slide_order: MOCK_SLIDE_IDS },
];

// Per-op undo of a DEPENDENT op — the backend can't isolate it and emits a
// recoverable error; the UI must fall back to offering a whole-group undo.
export const MOCK_DECK_UNDO_DEP_ERROR: DeckStreamEvent[] = [
  { event: 'batch_start', batch_id: 'eb_mock_01_undo', planned: 1, summary: 'Undoing one change' },
  {
    event: 'error', recoverable: true,
    message: "This change can't be undone on its own because a later change builds on it. Undo the whole group instead?",
  },
];

export const MOCK_UPLOAD_STATUS = { status: 'complete' as const, chunks_indexed: 87 };

// Spend ledger summary — REAL commandf_query_costs values captured 2026-07-06
// (so the Spend tab renders accurate figures in the harness).
export const MOCK_COST_SUMMARY: CostSummary = {
  currency: 'usd',
  since: '2026-07-01T21:15:12Z',
  updated_at: '2026-07-06T13:26:12Z',
  row_count: 69,
  totals: { all_time: 8.5149, anthropic: 2.6806, embedding: 5.8343, last_24h: 0.2577, last_7d: 8.5149 },
  by_model: [
    { model: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', rows: 51, usd: 2.4047, input_tokens: 1528936, output_tokens: 53612, cache_read_tokens: 1126157, cache_write_tokens: 305519 },
    { model: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', rows: 4, usd: 0.2760, input_tokens: 34497, output_tokens: 6536, cache_read_tokens: 9548, cache_write_tokens: 19096 },
    { model: null, label: 'Embeddings', rows: 14, usd: 5.8342, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
  ],
  daily: [
    { date: '2026-07-01', usd: 0.3726, anthropic_usd: 0.3725 },
    { date: '2026-07-02', usd: 1.5370, anthropic_usd: 1.5370 },
    { date: '2026-07-03', usd: 6.3474, anthropic_usd: 0.5132 },
    { date: '2026-07-04', usd: 0.0002, anthropic_usd: 0.0002 },
    { date: '2026-07-05', usd: 0.0002, anthropic_usd: 0.0002 },
    { date: '2026-07-06', usd: 0.2575, anthropic_usd: 0.2575 },
  ],
};

// Case-study candidates (POST /proposal-case-study-candidates) — real, indexed
// engagements the semantic search would match against a proposal request, so
// the accept/reject picker in DeckSurface has something real to render.
export const MOCK_CASE_STUDY_CANDIDATES: CaseStudyCandidate[] = [
  {
    deck_ref: 'https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view',
    title: 'Meridian Mutual — commercial diligence on a specialty-insurance target',
    snippet: 'Ten-week workstream assessing underwriting discipline and reserve adequacy ahead of a bolt-on acquisition, closing with a go/no-go recommendation to the investment committee.',
    similarity: 0.87,
    why_matched: 'Same specialty-insurance diligence scope and target-size range as this brief.',
  },
  {
    deck_ref: 'https://drive.google.com/file/d/2b3c4d5e6f7g8h9i0j1k/view',
    title: 'Harbor Point — cost-to-serve teardown for a distribution business',
    snippet: 'Mapped fulfillment cost by channel and customer tier, identifying a recoverable margin pool the client used to reprice its smallest accounts.',
    similarity: 0.74,
    why_matched: 'Distribution-sector cost-to-serve work with a similar margin thesis.',
  },
  {
    deck_ref: 'https://drive.google.com/file/d/3c4d5e6f7g8h9i0j1k2l/view',
    title: 'Cross River Holdings — post-merger integration PMO',
    snippet: 'Stood up a 100-day integration plan across finance, ops, and go-to-market for a mid-market roll-up, with a steering rhythm that carried past close.',
    similarity: 0.61,
    why_matched: 'PMO stand-up pattern relevant if this proposal scopes an integration phase.',
  },
];
