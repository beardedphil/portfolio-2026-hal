# Plan (0006-hal-chat-openai-responses-api)

## Goal

In HAL chat, route “Project Manager” messages to OpenAI’s Responses API and display the exact raw JSON response in the transcript. User input is sent as typed; failures are explainable in-app; API key and model stay server-side.

## Approach

- Add a server proxy endpoint `POST /api/openai/responses` via Vite dev server middleware.
- Server reads `OPENAI_API_KEY` and `OPENAI_MODEL` from env; if missing, returns 503 with a clear error body.
- Server forwards client body `{ input: <userText> }` to `https://api.openai.com/v1/responses` with `model` and `input`; returns OpenAI response status and body unchanged.
- Client: when Agent = Project Manager, POST to `/api/openai/responses` with `{ input: content }` (user text exactly as typed). On success, display `JSON.stringify(responseJson, null, 2)` in the chat. On error, show error message in chat and set diagnostics (last HTTP status, last error).
- Diagnostics: add “Last OpenAI HTTP status” (or “no request yet”) and “Last OpenAI error”.
- Document `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env.example` (no `VITE_` prefix).
- Render JSON replies in a `<pre>` block for copyable, readable display.

## Files

- `vite.config.ts` — middleware plugin for `/api/openai/responses`
- `src/App.tsx` — Project Manager path uses fetch to proxy; raw JSON display; new diagnostics fields
- `src/index.css` — `.message-json` styling for pre block
- `.env.example` — OPENAI vars
- `docs/audit/0006-hal-chat-openai-responses-api/*`
