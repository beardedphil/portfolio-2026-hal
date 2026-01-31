# Decisions: 0023 - PM create_ticket retry on ID/filename collision

## Handle collisions at creation time

**Decision**: Retry logic lives inside the create_ticket tool in hal-agents, not in sync-tickets or elsewhere.

**Rationale**: Ticket specifies "prefer handling collisions at creation time (inside the create_ticket tool)". Renumbering during sync would require updating existing DB rows and references and risks surprising changes.

## Do not re-fetch IDs on retry

**Decision**: Fetch existing ticket IDs once; then use a linear sequence (startNum, startNum+1, …) for each attempt without querying again.

**Rationale**: Re-querying max(id) on each retry would still race with concurrent inserters. Advancing the candidate id by attempt index avoids that and is deterministic.

## Collision detection

**Decision**: Treat insert error as collision when Postgres code is `23505` (unique_violation) or when the error message contains "duplicate key" or "unique constraint".

**Rationale**: Supabase/Postgrest returns Postgres SQLSTATE in error.code; 23505 is the standard code for unique_violation. Message fallback improves robustness across client versions.

## Cap and diagnostics

**Decision**: Cap at 10 retries; on exhaustion return a clear error. On success after retry, include `retried: true` and `attempts: N` in the tool output and in ticketCreationResult so Diagnostics can show that a retry occurred and the final chosen ID.

**Rationale**: Ticket requires "diagnostics for the retried request indicates a retry occurred (bounded info is fine), including the final chosen ID". No secrets in Diagnostics (id, attempts only).
