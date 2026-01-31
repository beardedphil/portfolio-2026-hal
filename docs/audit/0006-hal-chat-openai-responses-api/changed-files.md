# Changed files (0006-hal-chat-openai-responses-api)

## Modified

- `vite.config.ts`: Added `readJsonBody` helper and plugin `openai-responses-proxy` that handles `POST /api/openai/responses`, proxies to OpenAI Responses API, returns 503 when OPENAI_API_KEY or OPENAI_MODEL is missing.
- `src/App.tsx`: Project Manager messages now call `/api/openai/responses` instead of `pmRespond`; reply is raw JSON; added state `openaiLastStatus`, `openaiLastError`; diagnostics show “Last OpenAI HTTP status” and “Last OpenAI error”; JSON replies rendered in `<pre>`.
- `src/index.css`: Added `.message-json` for monospace, scrollable JSON display.
- `.env.example`: Added OPENAI_API_KEY and OPENAI_MODEL (server-only).

## Created

- `docs/audit/0006-hal-chat-openai-responses-api/plan.md`
- `docs/audit/0006-hal-chat-openai-responses-api/worklog.md`
- `docs/audit/0006-hal-chat-openai-responses-api/changed-files.md`
- `docs/audit/0006-hal-chat-openai-responses-api/decisions.md`
- `docs/audit/0006-hal-chat-openai-responses-api/verification.md`
- `docs/audit/0006-hal-chat-openai-responses-api/pm-review.md`
