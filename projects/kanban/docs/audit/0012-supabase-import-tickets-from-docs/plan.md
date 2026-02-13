# Plan (0012-supabase-import-tickets-from-docs)

## Goal
Allow importing all local `docs/tickets/*.md` into Supabase from within the app, with a preview and a repeatable (idempotent) upsert.

## Deliverable (UI-only)
In the running app, a human can connect to Supabase, connect to a project folder, preview which tickets will be created/updated/skipped, run the import, and then see the tickets listed from Supabase.

## Acceptance criteria (summary)
- In **Supabase Ticket Store** mode, an **Import from Docs** section exists.
- Import section requires Supabase Connected and Docs project folder Connected; otherwise show clear message what to connect first.
- **Preview import**: scans `docs/tickets/*.md`, shows totals (Found N, Will create X, Will update Y, Will skip Z, Will fail W) and a scrollable per-file list with action and reason.
- **Import**: idempotent upsert into Supabase `tickets` using 4-digit `id` as PK; stores id, filename, title, body_md, kanban fields; shows progress and summary in-app.
- After import, Supabase ticket list shows imported tickets; re-running import with no file changes yields 0 creates, 0 updates, non-zero skips (no duplication).
- On write failure: clear in-app error and Debug panel records last import error.

## Steps

1. **Types and helpers**
   - Add `ParsedDocTicket`, `DocFileResult`, `ImportPlanItem`, `ImportPreviewResult`.
   - `extractTicketId(filename)`: first 4 digits from filename; invalid → null.
   - `extractTitleFromContent(content, filename)`: `- **Title**: ...` or filename without `.md`.
   - `scanDocsTickets(root)`: read docs/tickets/*.md from root, parse id/title/body_md/kanban; return array of parsed or fail per file.
   - `buildImportPlan(scanResults, existingRows)`: create/update/skip/fail per file; skip when body_md unchanged.

2. **State**
   - `importPreview`, `importInProgress`, `importSummary`, `importProgressText`, `supabaseLastImportError`.

3. **Refetch and handlers**
   - `refetchSupabaseTickets()`: create client from url/key, select tickets, set state (for use after import).
   - `handlePreviewImport`: require root + Supabase connected; fetch existing tickets, scan docs, build plan, set importPreview; set last import error on failure.
   - `handleRunImport`: require root + Supabase connected; fetch existing, scan, build plan; for each create/update upsert; show progress; on error set supabaseLastImportError; on success refetch and set importSummary.

4. **Import from Docs UI (Supabase mode)**
   - Section "Import from Docs". If Supabase not connected: "Connect Supabase first (Project URL + Anon key, then Connect)."
   - If Docs folder not connected: "Connect project folder first (switch to Docs tab and use Connect project folder)."
   - When both connected: Preview import button, Import button; when importing show progress text; when done show summary; show import error if any; when preview exists show totals and scrollable list of filename + action + reason.

5. **Debug panel**
   - In Ticket Store (Supabase) section add "Last import error".

6. **Styles**
   - `.import-from-docs`, `.import-actions`, `.import-preview`, `.import-totals`, `.import-preview-list`, `.import-preview-item`, etc., with scrollable list.

7. **Audit**
   - Create docs/audit/0012-supabase-import-tickets-from-docs/ with plan, worklog, changed-files, decisions, verification.

## Data mapping
- **id**: first 4 digits from filename; invalid → fail.
- **filename**: the filename.
- **title**: `- **Title**: ...` or filename without `.md`.
- **body_md**: full markdown file text (including frontmatter).
- **kanban_column_id / kanban_position / kanban_moved_at**: from frontmatter `kanbanColumnId`, `kanbanPosition`, `kanbanMovedAt` if present.

## Out of scope
- Export from Supabase back to docs; multi-project; auth beyond import.
