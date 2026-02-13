# Decisions (0012-supabase-import-tickets-from-docs)

## Import section in Supabase mode only
- **Decision:** The "Import from Docs" section appears only when Ticket Store mode is **Supabase**. It requires both Supabase connected and Docs project folder connected (same root as in Docs mode).
- **Rationale:** Ticket: "In **Supabase Ticket Store** mode, there is an **Import from Docs** section." Docs folder connection is shared (ticketStoreRootHandle); user can connect folder in Docs tab then switch to Supabase to run import.

## Two requirements: Supabase + Docs folder
- **Decision:** If Supabase is not connected, show "Connect Supabase first (Project URL + Anon key, then Connect)." If Docs folder is not connected, show "Connect project folder first (switch to Docs tab and use Connect project folder)."
- **Rationale:** Ticket: "The import section requires: Supabase Connected = true, Docs project folder Connected = true. If either is missing, the UI shows a clear in-app message telling the human what to connect first."

## Preview then Import (separate actions)
- **Decision:** Two buttons: "Preview import" (scan + show plan) and "Import" (scan + upsert + refetch). Import does not require running Preview first; it performs its own scan and plan internally.
- **Rationale:** Ticket: "Clicking **Preview import**" shows plan; "Clicking **Import**" performs upsert. Both use the same logic (scan, build plan); Import additionally runs upserts and refetches.

## Idempotent upsert; skip when unchanged
- **Decision:** For each file: if no row with that id → create; if row exists and `body_md` equals file content → skip; if row exists and content differs → update. Use Supabase `upsert(..., { onConflict: 'id' })` only for create/update rows.
- **Rationale:** Ticket: "do not overwrite unless the ticket is newer/different (use a simple content changed check)." Deterministic: compare body_md in DB to file text.

## Last import error in Debug
- **Decision:** New state `supabaseLastImportError`; set on any preview or import failure. Debug panel "Ticket Store (Supabase)" section shows "Last import error: ...".
- **Rationale:** Ticket: "If any write fails ... the Debug panel records the last import error."

## No destructive behavior
- **Decision:** Import never deletes DB rows. It only inserts (create) or updates (when content changed). Skip when unchanged.
- **Rationale:** Ticket: "No destructive behavior by default: do not delete DB rows; do not overwrite unless the ticket is newer/different."
