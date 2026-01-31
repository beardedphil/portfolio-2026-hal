# PM Review (0006-hal-chat-openai-responses-api)

## Summary (1–3 bullets)

- Project Manager chat now calls OpenAI Responses API via a server proxy (`POST /api/openai/responses`); the exact raw JSON response is shown in the transcript.
- Diagnostics show “Last OpenAI HTTP status” and “Last OpenAI error” so failures are explainable in-app.
- `.env.example` documents OPENAI_API_KEY and OPENAI_MODEL (server-only).

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Small, well-scoped change: one new endpoint, one agent path switched from stub to API, diagnostics extended.
- Misconfiguration (missing key/model) returns 503 with clear body; client surfaces it in chat and diagnostics.

## What to verify (UI-only)

- With Project Manager selected, sending a message yields a reply that is visibly a JSON blob (starts with `{`, has top-level keys).
- With API misconfigured (missing OPENAI_API_KEY or OPENAI_MODEL), chat shows a clear error and Diagnostics show last status/error.
- Last OpenAI HTTP status and Last OpenAI error appear in Diagnostics after at least one PM request.

## Potential failures (ranked)

1. **Env not loaded in Vite server** — middleware would get undefined key/model and return 503; user would see “not configured” in chat. Confirm by checking Diagnostics and .env presence.
2. **OpenAI returns 4xx/5xx** — we forward status and body; client should show error in chat and set openaiLastError. Verify by using an invalid key and checking Diagnostics.
3. **JSON too large or layout broken** — long responses might need scroll; `.message-json` uses overflow-x auto. Minor UX.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
