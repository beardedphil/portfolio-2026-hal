# PM Review: 0044 - Implementation Agent Cursor API MVP Run

## Summary

Implementation Agent is now wired to Cursor API (MVP). A minimal end-to-end call (`GET /v0/me`) runs via backend proxy when the user sends a message with Implementation Agent selected. The UI shows a status timeline (Preparing → Sending → Waiting → Completed/Failed) and displays the result in the chat thread. All verification is in-app; no console or external tools required.

## Deliverables

- Backend: `POST /api/implementation-agent/run` proxy to Cursor API
- Frontend: Status timeline, success/failure display, config check before request
- Env: `CURSOR_API_KEY` (server) + `VITE_CURSOR_API_KEY` (client status) documented

## Human Verification

At http://localhost:5173, with a project connected:

1. **Not configured**: Send message → immediate error, no request
2. **Configured + valid key**: Send message → timeline → success message in chat
3. **Configured + invalid key**: Send message → timeline → failure message with readable error

## Non-goals (unchanged)

- Full Implementation Agent workflow (branches, diffs, commits, push)
- Retries, queueing, rate-limit handling
- Multiple models/providers
