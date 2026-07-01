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
