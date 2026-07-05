# Command F — Design System (v2 "Partner's Instrument")

**Status:** PROPOSED — pending operator approval. Once approved, this file is the single
source of truth for every visual decision in this repo. Any agent styling a surface consumes
tokens from here; hardcoding a value that exists as a token is a review-blocking defect.

**Rationale & evidence:** every decision here is grounded in
`QuantiFire IDE V3/.agents/design/REFERENCE_BOARD.md` (research reports + ~45 screenshots).
Short form: Command F is built by and for Actionist; the app wears the same paper, ink,
plum, and orange as the decks it produces and the site of the firm that uses it.

**House rules inherited from the brand (binding on all UI copy):**
- Sentence case everywhere. Never ALL-CAPS labels, never Title Case.
- No em dashes in any UI string.
- One orange per view. Orange never fills a large surface.

---

## 1. Primitive tokens

Raw values. Components never reference these directly — they exist to be aliased by the
semantic layer.

```css
:root {
  /* ── Brand primitives (Actionist) ─────────────────────────────── */
  --plum-900: #251729;      /* raisin — darkest brand value (site CSS --color-raisin) */
  --plum-700: #2F1D34;      /* PLUM — the brand spine (site + deck, identical hex) */
  --plum-500: #52345B;      /* violet — secondary purple (site --color-violet) */
  --plum-rule: #5E4265;     /* deck title-rule plum */
  --orange-500: #EB5E28;    /* deck accent orange — THE accent */
  --orange-700: #A8430F;    /* orange-ink: text-safe orange. VERIFY ≥4.5:1 on paper-50 in Wave 0 */
  --blue-500: #2C5985;      /* deck structural blue — "sourced" (light theme) */
  --blue-400: #32759A;      /* secondary blue (light); dark theme uses #4090BA — 5.32:1 on dark-800 */
  --green-500: #3D7D69;     /* ADJUSTED from #40826D — verified 4.76:1 on paper-50 */
  /* dark theme overrides: --color-verified: #52A086 (6.05:1 on dark-800); --color-success: #52A086 */

  /* ── Paper ramp (warm, from deck canvas + site grey) ──────────── */
  --paper-0:  #FFFFFF;
  --paper-50: #FEFDFA;      /* deck canvas */
  --paper-100: #F7F4F3;     /* site --color-grey */
  --paper-200: #EFEBE4;     /* derived tertiary (hover/pressed) */
  --paper-300: #E2DDD4;     /* tearsheet divider */

  /* ── Ink ramp (warm gray, AA-derived) ─────────────────────────── */
  --ink-900: #282828;       /* deck INK — primary text */
  --ink-700: #595959;       /* deck SUBHDR — secondary text */
  --ink-500: #6E6960;       /* muted floor: MUST be verified ≥4.5:1 on paper-200 in Wave 0 */
  --ink-300: #A49B8A;       /* decorative only — never for text */

  /* ── Dark ramp (plum-tinted near-black) ───────────────────────── */
  --dark-900: #0B0A0E;      /* canvas (subtle plum cast vs current #0A0C10) */
  --dark-800: #121017;      /* sidebar / secondary */
  --dark-700: #1C1923;      /* tertiary / hover */
  --dark-600: #191622;      /* elevated */
  --dark-ink-100: #EAE8EC;  /* primary text on dark */
  --dark-ink-300: #A8A4B0;  /* secondary */
  --dark-ink-500: #8D8899;  /* muted: MUST verify ≥4.5:1 on dark-800 in Wave 0 */
  --orange-400: #F0764A;    /* orange lifted for dark surfaces */

  /* ── Type primitives ──────────────────────────────────────────── */
  --font-display: "DM Sans", "TWK Lausanne", system-ui, sans-serif;
      /* Lausanne-character light display. Upgrade path: licensed TWK Lausanne = swap here only. */
  --font-body: "IBM Plex Sans", -apple-system, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  /* Load via Google Fonts: DM Sans 300/400/500; IBM Plex Sans 400/500/600;
     IBM Plex Mono 400/500. REMOVE: Inter, Outfit, Newsreader, Geist (config ghost). */

  /* ── Shape ─────────────────────────────────────────────────────── */
  --radius-control: 6px;    /* inputs, chips, small buttons */
  --radius-surface: 10px;   /* panels, menus, cards-in-cards */
  --radius-card: 16px;      /* top-level cards: composer, deck builder (absorbs rounded-2xl) */
  --radius-pill: 9999px;    /* primary CTAs (site treatment), status pills */
  --radius-image: 14px;     /* media / slide thumbnails (site rounded-photo treatment) */

  /* ── Motion (v2 retained; v1 vars deleted) ────────────────────── */
  --motion-duration-fast: 120ms;
  --motion-duration-base: 180ms;
  --motion-duration-slow: 240ms;
  --motion-ease-out: cubic-bezier(0.32, 0.72, 0, 1);
  --motion-ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Type scale (Tailwind `fontSize`)

| Token | Size / line | Face | Use |
|---|---|---|---|
| `text-micro` | 12/16 | mono preferred | timestamps, counts. **Floor raised from 11px.** |
| `text-caption` | 13/18 | body or mono | chips, badges, labels. **Raised from 12px.** |
| `text-body-sm` | 14/20 | body | dense rails (sidebar items), tertiary prose |
| `text-body` | **16/24** | body | primary prose, chat messages. **Raised from 14px.** |
| `text-base` | 16/24 | body | composer input (alias of body) |
| `text-lg` | 18/26 | body | section headings |
| `text-xl` | 24/32 | display 400 | surface titles ("Build a deck") |
| `text-2xl` | 32/40 | display 300 | greeting |
| `text-display` | 40/48 | display 300 | login wordmark, empty-state ledes |

Rules: no arbitrary `text-[Npx]`; no Tailwind default `text-sm`/`text-xs` (use the scale);
display sizes always weight 300–400, never bold (Lausanne character: `h1..h5 { font-weight: 400 }`
on actionistconsulting.com). Data/numbers always `--font-mono` with `tabular-nums`.

---

## 2. Semantic tokens

What components actually consume. Light values shown; `.theme-quantifire` (dark) overrides in
parentheses.

```css
/* Surfaces */
--color-bg-primary:   var(--paper-50);    /* (dark-900) page canvas */
--color-bg-secondary: var(--paper-100);   /* (dark-800) sidebar, composer rest */
--color-bg-tertiary:  var(--paper-200);   /* (dark-700) hover / pressed */
--color-bg-elevated:  var(--paper-0);     /* (dark-600) floating cards, menus */

/* Text */
--color-text-primary:   var(--ink-900);   /* (dark-ink-100) */
--color-text-secondary: var(--ink-700);   /* (dark-ink-300) */
--color-text-muted:     var(--ink-500);   /* (dark-ink-500) — AA on its worst surface */

/* Structure / identity */
--color-structure:      var(--plum-700);  /* (plum-500) primary buttons, active/selected, wordmark */
--color-structure-ink:  #FFFFFF;          /* text on structure fills */
--color-accent:         var(--orange-500);/* (orange-400) send active, live dot, active-session pill */
--color-accent-ink:     var(--orange-700);/* (orange-400) orange as TEXT, AA-verified */
--color-accent-soft:    rgba(235,94,40,0.10);  /* chip/badge tint */

/* Evidence semantics (the differentiator) */
--color-source:         var(--blue-500);  /* (blue-400) citations, source cards, corpus links */
--color-source-soft:    rgba(44,89,133,0.08);
--color-verified:       var(--green-500); /* verified / live / grounded states */

/* Feedback */
--color-error: #C63D2F;  --color-success: var(--green-500);  --color-warning: var(--orange-700);

/* Lines & focus */
--color-border:        rgba(40,40,40,0.12);   /* (rgba(234,232,236,0.12)) */
--color-border-light:  rgba(40,40,40,0.07);
--color-border-hover:  rgba(40,40,40,0.18);
--color-border-strong: rgba(40,40,40,0.26);
--color-focus-ring:    rgba(47,29,52,0.45);   /* plum-tinted focus */

/* Elevation: hairline-first. shadow-float ONLY on truly floating surfaces
   (menus, palette, toasts, drag ghosts). Panels separate by border + tone. */
--elevation-float: 0 4px 16px rgba(37,23,41,0.10), 0 1px 3px rgba(37,23,41,0.06);
```

Migration notes: `--color-accent-primary` (#2A2724) → `--color-structure`; `--color-brand`
(#EF8E07 amber) → `--color-accent`; `--color-brand-ink` → `--color-accent-ink`;
`--color-brand-soft` → `--color-accent-soft`. Keep old names as deprecated aliases for one
wave, then delete. Delete: v1 motion vars, `shadow-dark-*`, `shadow-gold*` (rework the
decision-required pulse on `--color-accent` if still needed).

---

## 3. Component tokens & specs

### Button
| Variant | Shape | Fill / text | States |
|---|---|---|---|
| Primary | pill | structure / structure-ink | hover: structure-hover (plum-900 light / plum-700 dark, one step darker than rest); active: scale-[0.98]; focus: focus-ring; disabled: opacity-40 |
| Secondary | control 6px | transparent + border / text-primary | hover: bg-tertiary |
| Send (composer) | full circle | accent / white when ready; bg-tertiary/text-muted at rest | keep existing 3-state transition, recolored |
| Destructive | control | transparent / error, border on hover | confirm-on-second-click pattern |

Primary CTAs may include an inline `→` (site convention). Max one primary per view region.

### Chat bubbles (`Conversation.tsx` — reused by Deck Studio chat)
- Assistant: no card chrome on paper; `text-body` 16px, max-width ~72ch.
- User: bg-secondary, radius-surface.
- Streaming: caret in accent; stop button always visible while streaming; auto-scroll freeze
  on user scroll (table stakes — research_web_references.md §6).

### Citation / source card (new, the differentiator)
- Chip inline: mono `text-caption`, source-soft bg, source text, radius-control.
- Card: bg-elevated, border-light, radius-surface; left block = document/slide thumbnail
  (radius-image); title `text-body-sm` 500; meta in mono micro; hover: border-hover + lift
  `translateY(-1px)`. "Verified" tick in `--color-verified`.

### Sidebar (`Sidebar.tsx` — will host the Decks rail)
- bg-secondary; width 264 / 56 collapsed.
- Wordmark: display 400, text-primary.
- Session item: `text-body-sm`; active = accent 3px left pill + bg-tertiary; collapsed mode
  must still show the active indicator (audit issue D).
- Deck items (future): 40px slide thumbnail (radius 6px inner) + title — visual history
  (corpus §10).
- Group labels: sentence case ("Recent", "Decks"), `text-caption`, text-muted. No ALL-CAPS.

### Composer (`Composer.tsx`)
- Card: bg-secondary → elevated on focus; **radius-card**; border-light → border-strong.
- Input: `text-base` 16px. Placeholder: text-muted (now AA).
- Keep the rest→focus→ready choreography exactly; only tokens change.

### Deck studio hooks (§C Phases 2–4 — tokens ready before the surfaces exist)
- `--studio-canvas-bg`: paper-100 (light) / dark-800 — the slide floats on it.
- Slide canvas: always `--paper-50` + `--elevation-float` at 1px hairline — a real deck page.
- `SlideThumb`: radius-image, border-light; selected = 2px structure border; generating =
  shimmer on paper-200; error = error border.
- Filmstrip: 88px row, gap 8px, thumbs materialize left-to-right as slides complete
  (the generation ritual — corpus §4, web refs §13).
- Chat-to-canvas seam: chat column animates 100% → 380px (duration-slow, ease-spring),
  canvas fades/slides in +16px. Reduced-motion: instant swap.
- Whiteboard intake: dashed border-strong drop zone, radius-card; storyboard approval reuses
  `DeckOutline.tsx` verbatim (§C Phase 4).

### Command palette / menus
- bg-elevated, radius-surface, shadow-float (allowed: floating).
- Active item: bg-tertiary + 2px structure left inset (replaces the low-contrast amber tint,
  audit `09_command_palette.png`).

### States (every surface ships all four)
- Loading: skeleton shimmer matching final layout on paper-200 (no lone spinners for
  generation — the AI narrates progress; corpus §3).
- Empty: display-face lede + one-line body + one primary action. The chat canvas while
  waiting shows a "working" narration line, never a void (audit issue B).
- Error: inline in-thread for recoverable errors; toast only for transient/global. Never both
  for the same failure (audit issue A).
- Focus: 2px focus-ring outline, offset 2px, on every interactive element.

---

## 4. Accessibility contract (review-blocking)
1. Every text/background pairing ≥4.5:1 (normal) / ≥3:1 (≥18px or 14px bold). The Wave-0
   acceptance test computes ratios for every semantic pairing in both themes and fails the
   wave on any miss.
2. No text below 12px. No opacity modifiers on text tokens (`/80` etc.).
3. Hit targets ≥32px; focus visible on all interactives; reduced-motion collapse retained.
4. Sentence case; no em dashes; mono + tabular-nums for all numerics.

---

### Wave 0 contrast verification (computed by `scripts/check-contrast.mjs` — 45/45 PASS)

| Pairing | Foreground | Background | Ratio | Result |
|---|---|---|---|---|
| LIGHT: text-primary on bg-primary (paper-50) | `#282828` | `#FEFDFA` | 14.49:1 | PASS |
| LIGHT: text-primary on bg-secondary (paper-100) | `#282828` | `#F7F4F3` | 13.47:1 | PASS |
| LIGHT: text-primary on bg-tertiary (paper-200) | `#282828` | `#EFEBE4` | 12.41:1 | PASS |
| LIGHT: text-primary on bg-elevated (paper-0) | `#282828` | `#FFFFFF` | 14.74:1 | PASS |
| LIGHT: text-secondary on bg-primary | `#595959` | `#FEFDFA` | 6.89:1 | PASS |
| LIGHT: text-secondary on bg-secondary | `#595959` | `#F7F4F3` | 6.40:1 | PASS |
| LIGHT: text-secondary on bg-tertiary | `#595959` | `#EFEBE4` | 5.90:1 | PASS |
| LIGHT: text-secondary on bg-elevated | `#595959` | `#FFFFFF` | 7.00:1 | PASS |
| LIGHT: text-muted on bg-primary | `#6E6960` | `#FEFDFA` | 5.36:1 | PASS |
| LIGHT: text-muted on bg-secondary | `#6E6960` | `#F7F4F3` | 4.98:1 | PASS |
| LIGHT: text-muted on bg-tertiary (worst surface) | `#6E6960` | `#EFEBE4` | 4.59:1 | PASS |
| LIGHT: text-muted on bg-elevated | `#6E6960` | `#FFFFFF` | 5.45:1 | PASS |
| LIGHT: accent-ink on bg-primary | `#A8430F` | `#FEFDFA` | 5.94:1 | PASS |
| LIGHT: accent-ink on bg-secondary | `#A8430F` | `#F7F4F3` | 5.52:1 | PASS |
| LIGHT: accent-ink on bg-elevated | `#A8430F` | `#FFFFFF` | 6.04:1 | PASS |
| LIGHT: structure-ink on structure (plum-700) | `#FFFFFF` | `#2F1D34` | 15.60:1 | PASS |
| LIGHT: source on bg-primary | `#2C5985` | `#FEFDFA` | 7.18:1 | PASS |
| LIGHT: source on bg-elevated | `#2C5985` | `#FFFFFF` | 7.31:1 | PASS |
| LIGHT: error on bg-primary | `#C63D2F` | `#FEFDFA` | 5.02:1 | PASS |
| LIGHT: error on bg-elevated | `#C63D2F` | `#FFFFFF` | 5.11:1 | PASS |
| LIGHT: success on bg-primary | `#3D7D69` | `#FEFDFA` | 4.76:1 | PASS |
| LIGHT: success on bg-elevated | `#3D7D69` | `#FFFFFF` | 4.84:1 | PASS |
| LIGHT: warning on bg-primary | `#A8430F` | `#FEFDFA` | 5.94:1 | PASS |
| DARK: text-primary on bg-primary (dark-900) | `#EAE8EC` | `#0B0A0E` | 16.21:1 | PASS |
| DARK: text-primary on bg-secondary (dark-800) | `#EAE8EC` | `#121017` | 15.51:1 | PASS |
| DARK: text-primary on bg-tertiary (dark-700) | `#EAE8EC` | `#1C1923` | 14.23:1 | PASS |
| DARK: text-primary on bg-elevated (dark-600) | `#EAE8EC` | `#191622` | 14.63:1 | PASS |
| DARK: text-secondary on bg-primary | `#A8A4B0` | `#0B0A0E` | 8.08:1 | PASS |
| DARK: text-secondary on bg-secondary | `#A8A4B0` | `#121017` | 7.73:1 | PASS |
| DARK: text-secondary on bg-tertiary | `#A8A4B0` | `#1C1923` | 7.09:1 | PASS |
| DARK: text-secondary on bg-elevated | `#A8A4B0` | `#191622` | 7.29:1 | PASS |
| DARK: text-muted on bg-primary | `#8D8899` | `#0B0A0E` | 5.75:1 | PASS |
| DARK: text-muted on bg-secondary (dark-800, worst) | `#8D8899` | `#121017` | 5.50:1 | PASS |
| DARK: text-muted on bg-tertiary | `#8D8899` | `#1C1923` | 5.04:1 | PASS |
| DARK: text-muted on bg-elevated | `#8D8899` | `#191622` | 5.19:1 | PASS |
| DARK: accent-ink (orange-400) on bg-primary | `#F0764A` | `#0B0A0E` | 6.95:1 | PASS |
| DARK: accent-ink (orange-400) on bg-secondary | `#F0764A` | `#121017` | 6.65:1 | PASS |
| DARK: accent-ink (orange-400) on bg-elevated | `#F0764A` | `#191622` | 6.27:1 | PASS |
| DARK: structure-ink on structure (plum-500) | `#FFFFFF` | `#52345B` | 10.49:1 | PASS |
| DARK: source on bg-primary | `#4090BA` | `#0B0A0E` | 5.56:1 | PASS |
| DARK: source on bg-secondary | `#4090BA` | `#121017` | 5.32:1 | PASS |
| DARK: error on bg-primary | `#E05748` | `#0B0A0E` | 5.29:1 | PASS |
| DARK: error on bg-secondary | `#E05748` | `#121017` | 5.06:1 | PASS |
| DARK: success on bg-primary | `#52A086` | `#0B0A0E` | 6.33:1 | PASS |
| DARK: success on bg-secondary | `#52A086` | `#121017` | 6.05:1 | PASS |
