## Ticket

- **ID**: `0010`
- **Title**: Kanban ↔ Docs tickets v1 — drag tickets into columns and write YAML frontmatter
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Let a human drag a docs-backed ticket into a kanban column and persist its column + position + moved timestamp into the ticket file via YAML frontmatter.

## Human-verifiable deliverable (UI-only)

After connecting to a project folder, a human can drag a ticket from the Tickets (Docs) list into To-do/Doing/Done; the ticket appears in that column and the app shows an in-app “Saved” confirmation indicating the underlying file was updated.

## File format (required)

Persist kanban metadata as **YAML frontmatter** at the top of the ticket file:

```yaml
---
kanbanColumnId: col-todo | col-doing | col-done
kanbanPosition: <integer>   # 0-based position within the column
kanbanMovedAt: <ISO-8601 timestamp>
---
```

Rules:
- If the ticket already has frontmatter, **merge/update** these keys without destroying other keys.
- If the ticket has no frontmatter, **add** it above the existing content.
- Use UTC ISO timestamps (e.g. `2026-01-30T18:22:11.123Z`).

## Acceptance criteria (UI-only)

- [ ] After connecting, the UI shows **both**:
  - the existing Kanban columns (To-do/Doing/Done), and
  - the Tickets (Docs) list.
- [ ] Dragging a ticket from the Tickets list into **To-do**:
  - shows the ticket as a card inside To-do immediately after drop, and
  - shows an in-app status like **Saved** (or “Saved to file”) for that ticket.
- [ ] Drag the same ticket from **To-do → Doing**:
  - card moves to Doing and stays there,
  - the app shows Saved again,
  - the Debug panel shows `kanbanColumnId` updated to `col-doing` and `kanbanMovedAt` updated (newer timestamp).
- [ ] Reorder two tickets within the same column:
  - order persists after drop,
  - Debug panel shows each ticket’s `kanbanPosition` reflecting the new order (0, 1, ...),
  - Saved confirmation occurs for the affected tickets.
- [ ] On page refresh + reconnect to the same folder:
  - tickets automatically appear in the column indicated by their frontmatter,
  - within each column, tickets are ordered by `kanbanPosition`.
- [ ] If the app does not have write permission (or write fails):
  - the UI shows a clear in-app error (no console),
  - the card does **not** silently appear in the new column (or it appears with a clear **Unsaved** state—pick one and document it),
  - Debug panel records the last write error.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- No silent fallbacks: file read/write failures must be visible in-app.
- Follow scope discipline: no styling changes beyond what’s needed for DnD usability (document any unrequested changes).

## Non-goals

- No editing ticket body content from the UI yet (metadata-only writes are sufficient).
- No git commits from the UI yet.
- No cross-repo multi-project management yet.

## Implementation notes (optional)

- Use File System Access API with `showDirectoryPicker({ mode: 'readwrite' })` when the user chooses to enable writing.
- Consider a small “Ticket Store adapter” helper to keep file IO out of UI components.
- Keep parsing/writing simple and deterministic; add a Debug section that shows, for the selected ticket:
  - file path
  - parsed frontmatter values
  - last write time/status

## Audit artifacts required (implementation agent)

Create `docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
