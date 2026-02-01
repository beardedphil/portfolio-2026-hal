# Decisions: 0044 - Implementation Agent Cursor API MVP Run

## Cursor API Endpoint Choice

**Decision**: Use `GET /v0/me` (API Key Info) for the minimal end-to-end call.

**Rationale**: The Cloud Agents API Launch endpoint requires a GitHub repository. For MVP "request → response → display" with no external dependencies, `/v0/me` is the smallest call that returns displayable, non-secret content (userEmail, apiKeyName). It proves connectivity and auth without needing repo configuration.

## Env Variable Split

**Decision**: Use `CURSOR_API_KEY` (server-only) for the proxy; `VITE_CURSOR_API_KEY` for client "configured" check. Document both in `.env.example` with same value.

**Rationale**: Server must not receive keys from the client. Client needs to know if configured to show appropriate UI and avoid unnecessary requests. Backend falls back to `VITE_CURSOR_API_KEY` if `CURSOR_API_KEY` not set for backward compatibility.

## Status Timeline Phases

**Decision**: Phases are Preparing → Sending → Waiting → Completed/Failed. No polling or streaming; single request/response.

**Rationale**: Ticket requires "on-screen status timeline" and "no external tools." A single fetch with phase updates satisfies both. Completed/Failed shown for 500ms before message appears so user sees final state.

## Error Display

**Decision**: Human-readable error messages only; no stack traces. Map HTTP 401/403/429/5xx to friendly text.

**Rationale**: Constraint: "All meaningful state changes and errors must be visible in an in-app diagnostics/status UI" and "Do not display secrets."
