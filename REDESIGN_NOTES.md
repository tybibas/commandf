# Command F — UI Redesign Notes

A bolder-but-clean reskin toward a **light, warm-minimal** identity for busy consultants:
zero learning curve, instantly familiar (feels like the AI tools they use daily), calm and
premium. Functionality, props, handlers, and data flow are unchanged — this is visual only.

## Shared design system (frozen first, in `src/index.css` + `tailwind.config.js`)

- **Warm canvas** — pure white replaced with a warm off-white (`#FAF9F5` / `#F4F2EC` / `#EBE8DF`,
  elevated surfaces near-white). Warm-ink text and hairlines, warm-tinted focus ring, float
  elevation, and Intent-Radar heat ramp. *Distilled from Claude's cream canvas.*
- **Editorial serif** — added a `--font-serif` / `font-serif` token (**Newsreader**) used **only**
  for the wordmark and the landing greeting; everything else stays Inter. The one memorable,
  "consulting/editorial, not another chatbot" move. *Distilled from Claude ("Evening, Ty") + Harvey
  wordmark.*
- Dark `.theme-quantifire` left in parity (inherits the serif token).
- Discipline kept: neutral-ink primary actions, **gold reserved** for "operator decision required,"
  restrained motion via existing `--motion-*` tokens, WCAG focus rings.

## By surface — what changed and which reference each move was distilled from

**Team A — core query loop**
- `commandf/Landing.tsx` — greeting is now the editorial **serif** headline; soft-elevated tactile
  mode chips; quiet hairline-divided example rows with numeral indices. *Claude greeting + Perplexity chips.*
- `commandf/Composer.tsx` — the signature object: single clean elevated container (removed the
  double-frame; the container's focus-within owns the focus affordance), calm circular ink send.
  Auto-grow / Enter-to-send / focusKey / MAX_COMPOSER_PX unchanged. *ChatGPT / Claude / Perplexity input bars.*
- `commandf/Conversation.tsx` — quiet right-aligned user bubble; full-measure assistant reading
  column with an eyebrow "Command F" attribution marker; roomier turn rhythm. *Claude reading column.*
- `commandf/SourceCard.tsx` — crisp numbered citation chips + elevated hairline-divided source
  cards with file-type tag and relevance. *Harvey Sources chips + Perplexity source cards.*
- `CommandFMarkdown.tsx` — serif memo-masthead H1 (echoes the greeting), tightened heading rhythm,
  warm serif pull-quote. Answers read like a polished consulting memo.

**Team B — shell, panels, generative modes, auth**
- `CommandFPage.tsx` — serif "Command F" wordmark, quiet subtitle, unified header control cluster,
  calm familiar history rows. *Harvey/Claude wordmark; ChatGPT/Claude history rail.*
- `ui/Sheet.tsx` — premium elevated slide-out (near-white surface, hairline, soft float).
- `commandf/KnowledgePanel.tsx` — already token-clean; left as-is (big tabular stat tiles, sources,
  upload, indexed files).
- `commandf/DeckSurface.tsx` · `SurveySurface.tsx` · `generationUI.tsx` — one radius system, token
  focus, and a calm "Working · step N of M" progress trace + polished result card. *Harvey / Perplexity "Completed N steps."*
- `components/Toast.tsx` — rebuilt onto tokens (elevated + hairline + float), calm dismiss.
- `standalone/CommandFLogin.tsx` · `SetPasswordScreen.tsx` · `standalone/StandaloneApp.tsx` — calm,
  centered, premium auth on the warm canvas with the serif wordmark; auth logic/fields untouched.

## Render verification

A dev-only mock harness (**not in the production bundle** — Vite only builds `index.html`) renders
the real surfaces with fixtures and no network/credentials:
- `mock.html` → `src/mock/main.tsx` stubs `window.fetch` (Command F endpoints) and the Supabase
  session, then mounts the **real** `CommandFPage`; `src/mock/HarnessRoot.tsx` also exposes the
  `login` / `setpassword` views; `src/mock/fixtures.ts` holds the seed data.
- Drive it: `npm run dev`, open `http://localhost:5199/mock.html?view=app` (add `&theme=dark` for
  the dark tenant; `?view=login`). To screenshot headlessly: `npm i -D playwright && npx playwright
  install chromium`, then a Playwright script that types a query, opens panels, and switches modes.

Every surface was screenshotted in both themes and compared to the references; `npx tsc --noEmit`
and `npm run build` are clean.

---

## IA rethink v2 — left rail + composer command-center

Restructured the information architecture (not a recolor). Where things live now:
- **New chat / Recent history / account** → persistent **left sidebar** (collapsible 264↔56px).
  *ChatGPT + Claude + Perplexity + Harvey rails.*
- **Model selector** → **inline in the composer** control row. *Claude "Opus 4.8" + Perplexity "Model".*
- **Attachments / Build-a-deck / Survey** → behind the composer **"+"** menu. *ChatGPT "+" + Harvey Files.*
- **Knowledge base** → sidebar nav item + a **Knowledge scope chip** inside the composer. *Harvey Sources/Vault.*
- **Top header** → removed; canvas is a calm centered hero: workspace chip + time-aware **serif greeting**
  ("Good evening") + quick-action chips. *Claude "Evening, Ty".*

New surface: `src/components/commandf/Sidebar.tsx`. Rebuilt: `Composer.tsx` (command card + inline
model popover), `Landing.tsx` (Claude hero), `CommandFPage.tsx` (rail layout, "+" menu, control
relocation). All functionality preserved (send, sessions, model, knowledge upload/reindex/drive,
deck/survey, sign-out). tsc + build clean; render-verified in both themes.

---

## Backend wiring pass (frontend ↔ FastAPI contracts)

Aligned the API client + surfaces to the backend integration guide, and added the per-user
threads UX (research-backed). Wired against contracts + verified on the mock harness; **live
/chat verification deferred** (spends Anthropic credits; needs auth + the vector index).

Contract fixes (`src/components/commandf/api.ts` + consumers):
- Deck gen path → `POST /generate` + `GET /generate/{job_id}` (was `/generate-deck…`); `JobStatus`
  accepts `done` as well as `complete` (`useJob.ts`) + a `progress` line; `DeckSurface` pending label updated.
- `Source` shape extended (`content`, `file_path`, `chunk_index`); `SourceCard` reads `content ?? snippet`.
- `uploadDocument` returns `chunks_added`; `KnowledgePanel` shows "Added — N passages indexed".

Per-user threads (React 18, no new deps — manual optimistic + localStorage SWR-style cache):
- **Instant sidebar:** seed the rail from a per-user localStorage cache (`sessionsCache.ts`, keyed by
  JWT `sub`) on mount, then revalidate against `GET /sessions` (zero-flash). *ChatGPT/Claude pattern.*
- **New chat = create-on-first-message** (implicit; no orphan empty threads). On the first `/chat`
  response the new thread is optimistically inserted at the top of the rail (title = first message),
  then reconciled with the server.
- **Optimistic delete** with rollback-on-error + toast; cache updated in lockstep.
- On not-signed-in, the cache is per-user-keyed so a different operator never sees another's list.

Backend guidance produced (not implemented here — backend's job): `docs/BACKEND_SECURITY.md` —
API-key secrecy (never in the Vite bundle), JWT+allowlist gating, per-user/global rate limits,
prompt-caching/model-routing/token-budget cost controls, prompt-injection defense. The key stays
server-side in Modal secrets; the frontend holds no secret and handles 401/403/429 gracefully.

---

## Frontier iteration — actionable sources + flagship deck

Source intelligence (`SourceCard.tsx`, `util.ts`, wired via `Conversation.tsx`/`CommandFPage.tsx`):
- **Overlap dedupe:** retrieved passages are grouped by document (`groupSources` — by file_id → file_name → link). The panel reads "N documents", and a document that contributed multiple passages shows a quiet "N passages" expander (with chunk_index) instead of repeating the same file. *Removes RAG's visual noise.*
- **Actionable reuse:** each document card has a muted "⋯" menu — **Use as template / Draft from this / Compare to current** — that composes an editable, framework-reuse prompt (`reusePrompt`) referencing the parsed deliverable, and drops it into the composer in place (`onReuse` → `prefillComposer`, current surface preserved). A citation becomes a next move. *The suggestion text gets smarter once the backend can generate it; the affordance ships now.*

Deck generation (`DeckSurface.tsx`, `generationUI.tsx`):
- Refined flow (eyebrow labels, roomier brief), the deliverable types as one **segmented control**, live backend `progress` piped into RunningPanel (authoritative when present, canned phases as fallback), a stronger result state (full-width **Download .pptx** primary + slide-thumbnail rail), and an honest, premium **pending/preview** state for the not-yet-live endpoint.
