# Decisions (0020-supabase-persisted-columns-model)

## kanban_columns schema
- **Decision:** Table with `id` (text PK), `title` (text not null), `position` (int not null), `created_at`, `updated_at` (timestamptz). SQL constant in app for setup.
- **Rationale:** Ticket acceptance criteria. Minimal fields; `position` for ordering.

## Default columns seed
- **Decision:** When `kanban_columns` is empty, insert Unassigned, To-do, Doing, Done with ids `col-unassigned`, `col-todo`, `col-doing`, `col-done` (positions 0–3).
- **Rationale:** Backward compatibility with existing tickets that reference these IDs.

## Add column visible in Supabase mode
- **Decision:** Remove `!supabaseBoardActive` gate; Add column always shown (reverts 0019’s “hide in Supabase mode”).
- **Rationale:** Ticket 0020 enables Add column in Supabase mode; 0020 fixes 0019.

## Unknown kanban_column_id handling
- **Decision:** Tickets with `kanban_column_id` not in `kanban_columns` are shown in the first column; their IDs are tracked and shown in Debug as “Tickets with unknown column (moved to first)”.
- **Rationale:** Ticket: “minimal guard so unknown values don’t silently fall back without a visible error.”

## Column remove in Supabase mode
- **Decision:** Hide Remove for all Supabase columns (`hideRemove={ticketStoreConnected || supabaseBoardActive}`).
- **Rationale:** Ticket: “Column editing UI (rename/delete) unless required for persistence correctness.” Delete is out of scope.

## Initialization log
- **Decision:** Use state `supabaseColumnsJustInitialized` + useEffect to add “Initialized default columns” to action log when we seed.
- **Rationale:** Avoids forward-reference of `addLog` in `connectSupabase`; ticket requires UI-verifiable init.
