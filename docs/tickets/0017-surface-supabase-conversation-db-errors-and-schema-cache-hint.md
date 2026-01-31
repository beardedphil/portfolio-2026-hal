# Ticket

- **ID**: `0017`
- **Title**: Surface Supabase conversation DB errors (including schema-cache “table missing”) in-app
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0014`
- **Category**: State

## Goal (one sentence)

Make Supabase conversation DB failures diagnosable in the HAL UI by showing the real Supabase error for inserts/loads and providing a human-actionable hint when PostgREST reports a schema-cache “table missing” error.

## Background / diagnosis

We have observed this Supabase error in-app:

- `DB: Could not find the table 'public.hal_conversation_messages' in the schema cache`

This typically means one of:
- The app is pointed at a different Supabase project than the one where the SQL was run (wrong `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
- The table exists but PostgREST’s schema cache has not refreshed yet (transient after DDL).
- The table exists in a non-exposed schema (or not `public`).

Today, initial DB load errors are often swallowed (fallback to local storage) without preserving the DB error string, so the user can’t tell which case it is.

## Human-verifiable deliverable (UI-only)

A human can connect a project with missing conversation tables and immediately see (in Diagnostics) **the actual Supabase error** plus a short hint for what to do next (create tables / wait / reload schema cache / check URL-key pairing), without using devtools/console.

## Acceptance criteria (UI-only)

- [ ] On “Connect Project Folder”, if the Supabase select fails, Diagnostics shows a **DB error message** (not just a generic fallback).
  - [ ] Example: if the select fails because `created_at` column is missing, show that exact error.
  - [ ] Example: if the select fails due to RLS/policy, show the policy error text.
- [ ] When an insert fails (sending a PM message), Diagnostics shows the Supabase insert error (already partially present) and retains it until the next successful DB operation clears it.
- [ ] If the error string matches the schema-cache missing-table shape (contains “schema cache” and `public.hal_conversation_messages`), the UI shows a short actionable hint:
  - [ ] “Confirm you ran the SQL in the same Supabase project as your connected folder’s `.env`.”
  - [ ] “If you just created the table, wait a minute and reconnect (or refresh).”
- [ ] No secrets are displayed in Diagnostics (URLs/keys must remain redacted per existing redaction rules, if any).

## Constraints

- Keep this ticket minimal: focus on **diagnostics + preserving the real Supabase error**.
- Verification must require **no external tools** (no terminal, no devtools, no console).

## Non-goals

- Building an in-app SQL runner or doing DB admin actions from the UI.
- Implementing auth / RLS policy management UI.

## Audit artifacts required (implementation agent)

Create `docs/audit/0017-surface-supabase-conversation-db-errors-and-schema-cache-hint/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

