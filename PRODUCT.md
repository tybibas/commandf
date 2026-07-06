# Command F — Product Context

**What it is:** a RAG chat + AI deck-builder used by Actionist, a strategy consultancy.
"Perplexity meets an AI PowerPoint studio for consultants." It answers questions grounded in
the firm's own document corpus (40k+ chunks of past decks and documents, per-slide citable)
and builds partner-grade PowerPoint decks in the firm's house style.

**Who uses it:** Actionist consultants and partners — often live, in front of managing
partners and clients. The bar is a professional instrument, not a consumer toy: calm,
precise, unmistakably of-the-firm.

**Register:** product (design serves the tool). Two sanctioned brand moments: the landing
greeting and the deck-generation ritual.

**Surfaces (current):** chat with token streaming (`CommandFPage.tsx`, `Conversation.tsx`,
`Composer.tsx`), sessions sidebar (`Sidebar.tsx`), deck builder (`DeckSurface.tsx`,
`DeckOutline.tsx`, `generationUI.tsx`), file upload, login, command palette (⌘K), knowledge
panel.

**Surfaces (committed roadmap — design for them now):** morph-mode Deck Studio
(`DeckStudio.tsx`/`DeckChat.tsx`/`DeckCanvas.tsx`/`SlideThumb.tsx`: persistent two-pane chat +
slide canvas with filmstrip), Decks rail in the sidebar (persistent re-editable deck
sessions), whiteboard-photo intake → storyboard approval. See
`QuantiFire IDE V3/.agents/COMMANDF_V2_SCOPE_2026-07-05.md` §C.

**Design invariants:**
1. Calm and simple — one elevated composer on a quiet paper canvas; no chrome creep.
2. Zero functional regressions: streaming, session persistence, deck build → outline → edit →
   download must keep working through any visual change.
3. Family resemblance with the decks the product generates (paper `#FEFDFA`, ink `#282828`,
   blue `#2C5985`) and with actionistconsulting.com (plum `#2F1D34`, orange, warm grey).
4. All styling through the token system in `DESIGN.md`; no hardcoded values in components.
5. Development and visual verification run against the mock harness (`src/mock/`) — never a
   paid backend call for a styling task.

**Voice:** sentence case everywhere; no em dashes; declarative, brief, no jargon.
