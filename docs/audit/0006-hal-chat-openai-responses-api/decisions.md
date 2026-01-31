# Decisions (0006-hal-chat-openai-responses-api)

## Server proxy via Vite middleware

- **Decision:** Implement the OpenAI proxy as a Vite dev server middleware plugin in `vite.config.ts`, not a separate Node server.
- **Why:** Ticket allows “Vite dev server middleware”; keeps a single dev process and avoids extra tooling.

## Raw JSON only

- **Decision:** Display the full OpenAI response object as formatted JSON in the chat (no extraction of “assistant text”).
- **Why:** Ticket explicitly requires “exact raw JSON” and “no filtering, summarizing, or extracting.”

## User input sent as-is

- **Decision:** Client sends `{ input: content }` where `content` is the user’s message exactly as typed; no system prompt or rewriting in the client.
- **Why:** Acceptance criteria require “user’s input text is sent to OpenAI exactly as typed.”

## Diagnostics for failures

- **Decision:** Add “Last OpenAI HTTP status” (or “no request yet”) and “Last OpenAI error” in the in-app Diagnostics panel.
- **Why:** Ticket requires failures to be explainable from inside the app without devtools/terminal.

## Env vars server-only

- **Decision:** Use `OPENAI_API_KEY` and `OPENAI_MODEL` without `VITE_` prefix so they are never exposed to the client bundle.
- **Why:** Ticket requires API key must not be present in client code; Vite only injects `VITE_*` into the client.
