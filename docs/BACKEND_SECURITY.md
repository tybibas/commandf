# Backend Hardening — wiring ACTIONIST_ANTHROPIC_API_KEY (advisory for the backend agent)

**Audience:** the backend agent (Modal FastAPI). **Frontend has no role here** except: hold no
secret, call only the authenticated backend, handle 401/403/429 gracefully. It is a dumb client.

## The one load-bearing fact
Vite **inlines every `VITE_`-prefixed var into the public client bundle at build time** (Vite's own
docs warn: "do not put API keys in `VITE_*`"). A key in the frontend is world-readable the moment it
ships. Therefore: **the Anthropic key lives ONLY in a Modal secret, used server-side; the browser
never sees it or calls api.anthropic.com.** Frontend → your authenticated backend → Anthropic.

## The three that matter most
1. **Key is server-side, in a Modal secret, never in the Vite bundle.** (Architectural — get it wrong and nothing else matters.)
2. **Every proxy route is JWT-verified + operator-allowlist-gated**, so it isn't an open relay anyone can spend from.
3. **Per-user + global rate limits and spend caps** bound the blast radius when a token leaks or misbehaves.

## P0 — key secrecy & abuse prevention (before any real traffic)
- **No `VITE_`-prefixed secret.** Grep frontend + `.env*` for `ANTHROPIC` / `sk-ant` → zero hits. In CI, after build: `grep -ri "sk-ant" dist/ && echo LEAK` must be empty. Only value the frontend may hold is the (auth-gated) backend base URL.
- **Key in a Modal secret**, injected server-side: `@app.function(secrets=[modal.Secret.from_name("actionist-anthropic")])`; `anthropic.Anthropic()` reads it from env. Never hardcode, log, or return it in an error. **Separate keys per env**; scope the key to a dedicated Anthropic **workspace** with its own spend + rate limits.
- **Every protected route verifies the JWT** (signature + `exp`/`iss`/`aud`, reject `alg:none`) → 401, and checks the caller against the **operator allowlist** → 403. One shared dependency (default-deny), plus a test that hits every route unauthenticated and asserts 401/403. Restrict CORS `allow_origins` to your exact frontend origin.
- **Rate-limit per-user AND globally, server-side** (client limits are cosmetic). Token bucket (matches Anthropic's own model). Modal containers are ephemeral/scaled → use a **shared store** (Modal `Dict`/Redis) keyed by user-id + a global key. Return 429 + `Retry-After`. (Frontend handles 429 with backoff — see below.)

## P1 — cost & injection hardening (before launch)
- **Prompt caching** (`cache_control: ephemeral`) on the stable system prompt / retrieved context; keep volatile content (question, timestamps, UUIDs) *after* the last breakpoint. Cache reads ≈0.1× input price and don't count toward ITPM. Verify via `usage.cache_read_input_tokens` > 0.
- **Model routing:** Haiku 4.5 for classify/short, Sonnet 4.6 for standard RAG, Opus 4.8 only for hard synthesis. (Switching models invalidates the cache — route at conversation start.)
- **Hard `max_tokens` caps + token budgets + passage truncation** (uncapped RAG context is the #1 silent cost driver — top-K + per-passage cap; `count_tokens` to budget input).
- **Per-user + global monthly spend caps with alerting** (50/80/100%); set the Anthropic workspace spend limit as a hard backstop.
- **Stream** Anthropic → FastAPI (SSE) → frontend, so a user can stop early (stop paying) and to avoid timeouts. Batch offline work via the Message Batches API (50% cheaper, separate pool).
- **Treat retrieved doc content as untrusted** (prompt-injection): keep system/operator instructions in the system channel, wrap passages as delimited *data to analyze, not commands*; validate output; **escape** any model output rendered as HTML (no unsanitized `dangerouslySetInnerHTML`).
- **Secret hygiene:** never log the key; `.gitignore` `.env*`; CI secret-scanning (gitleaks / push protection) to block `sk-ant-…`; scan git history once and rotate if ever committed. (This project has a prior `VITE_`-leak incident — don't repeat it.)

## P2 — operational maturity
- Structured logging **without secrets/PII** (operator id, model, `usage`, computed $, latency, `stop_reason`, Anthropic `_request_id`) → per-user + global cost dashboard.
- Anomaly detection + spend alerts; surface Anthropic `anthropic-ratelimit-*-remaining` / `retry-after` headers into metrics.
- Rotation policy (quarterly + 1-hour SLA on suspected exposure): mint → update Modal secret → redeploy → revoke old.
- Misconfig sweep: don't expose `/docs`/`/openapi.json` or verbose tracebacks in prod; confirm no unauthenticated paid Modal endpoint (prior incident); HTTPS end-to-end.

## Frontend's entire responsibility (implemented in this repo)
Hold no secret; call only the authenticated backend; handle **401** → bounce to login, **403** → "not authorized", **429** → read `Retry-After`, back off, disable submit while in-flight, never hammer-retry. Never render an empty `{}` or blank panel on error.
