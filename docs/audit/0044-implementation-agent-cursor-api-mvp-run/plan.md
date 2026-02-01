# Plan: 0044 - Implementation Agent Cursor API MVP Run

## Objective

Enable the Implementation Agent to make a minimal end-to-end call via Cursor API and present progress/success/failure in the UI, with no external tools required for verification.

## Approach

1. Add backend proxy endpoint `POST /api/implementation-agent/run` that:
   - Checks `CURSOR_API_KEY` or `VITE_CURSOR_API_KEY` in `.env`
   - If not configured: return 503 with clear error (no request attempted)
   - If configured: call Cursor API `GET /v0/me` (API Key Info) for minimal end-to-end verification
   - Return success with displayable content or failure with human-readable error

2. Wire Implementation Agent chat handler in `App.tsx`:
   - If Cursor API not configured (client check): show error message immediately, do not call backend
   - If configured: show status timeline (Preparing → Sending → Waiting → Completed/Failed)
   - Display returned content or error in chat thread

3. Add status timeline UI during run, with 500ms display of final state before message appears

## Scope

- **In scope**: Backend proxy, Implementation Agent handler, status timeline UI, error states
- **Out of scope**: Full agent workflow (branch creation, diffs, commits), retries/queueing, multiple models

## Files to Change

1. `.env.example` - Add `CURSOR_API_KEY` (server-only), document both keys
2. `vite.config.ts` - Add `implementation-agent-endpoint` plugin
3. `src/App.tsx` - Replace stub with real Cursor API flow, status timeline, banner update
4. `src/index.css` - Add `.impl-agent-status-timeline` styles

## Risk Assessment

- Low risk: MVP scope, single API call (GET /v0/me), no secrets in UI
- Backend uses Basic auth; key never sent to frontend
