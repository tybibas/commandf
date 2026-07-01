# Backend follow-ups (frontend is wired to these; needs backend confirmation/build)

Ordered by how much the frontend already assumes them.

1. **Confirm `/chat` auto-creates sessions.** The UI uses create-on-first-message
   (ChatGPT model): first `/chat` omits `session_id`, backend creates + returns it. If a
   prior `POST /sessions` is actually required, tell us — we'll add the pre-create call.
2. **Survey compendium contract.** The integration guide only defined `POST /generate`
   (deck) + `POST /upload`. Survey currently posts `/survey-compendium`. Decide: is Survey a
   `deliverable_type` under the unified `POST /generate`, or its own endpoint? We'll align.
3. **Cross-engagement synthesis (new LLM field — frontend ready to render).** When retrieved
   sources converge, return an optional `synthesis?: string` (one or two lines, e.g. "Cardinal
   Mutual and Stonepoint both sequence quick wins before structural change") alongside
   `sources[]` in the `/chat` response. The frontend already groups sources by document; a
   short synthesis line above the grouped cards is the natural home. Keep it grounded in the
   retrieved passages (cite the doc numbers).
4. **Reuse-suggestion field (optional, elevates the "actionable source" UX).** The source
   reuse menu (Use as template / Draft from this / Compare) currently composes a generic prompt
   client-side. If `/chat` can return a per-source `reuse_hint?: string` ("This framework maps
   to any member-owned insurer repositioning"), we'll surface it as the smart suggestion.
5. **Deck result fields.** `GET /generate/{job_id}` on done should include `download_url`
   (.pptx) and, ideally, `preview_urls[]` (slide PNGs) + `title`/`slide_count` — the result
   panel already renders a download button + a thumbnail rail from these.
