# Verification (0006-hal-chat-openai-responses-api)

All checks are done in the browser (no devtools/console required). Start the dev server as setup.

## Prerequisites

1. From HAL repo root:
   - `npm install`
   - Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and `OPENAI_MODEL` for success path.
   - `npm run dev`
2. Open `http://localhost:5173`.

## Steps

### 1) Project Manager returns raw JSON (success path)

- **Action:** Select **Agent: Project Manager**, type a message (e.g. `hello`), click **Send**.
- **Pass:** A PM reply appears that is visibly a **JSON blob** (starts with `{`, has top-level keys such as `id`, `object`, `output`, etc.). The reply is copyable (e.g. select and copy from the message).
- **Pass:** User’s message was sent exactly as typed (no visible prefix/rewrite).

### 2) Misconfiguration shows clear error in app

- **Setup:** In `.env`, remove or comment out `OPENAI_API_KEY` or `OPENAI_MODEL`. Restart dev server.
- **Action:** Select **Project Manager**, type any message, click **Send**.
- **Pass:** The chat shows a clear error message (e.g. “OpenAI API is not configured” or similar).
- **Action:** Open **Diagnostics**.
- **Pass:** “Last OpenAI HTTP status” shows a value (e.g. 503); “Last OpenAI error” shows a string (or “none” if only status indicates failure).

### 3) Diagnostics show OpenAI status and error

- **Action:** After at least one Project Manager request (success or failure), expand **Diagnostics**.
- **Pass:** “Last OpenAI HTTP status” shows the last response status (e.g. `200` or `503`) or “no request yet” if no PM request has been sent this session.
- **Pass:** “Last OpenAI error” shows the last error string or “none”.

### 4) No secrets in client

- **Check:** Search the built bundle (or rely on env): `OPENAI_API_KEY` and raw key must not appear in client code. (Using non-`VITE_` env vars keeps them server-only in Vite.)

### 5) .env.example documents OpenAI vars

- **Check:** `.env.example` contains `OPENAI_API_KEY` and `OPENAI_MODEL` with a short comment that they are server-only / not prefixed with `VITE_`.
