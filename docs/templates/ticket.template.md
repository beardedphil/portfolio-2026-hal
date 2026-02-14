# Ticket Template (Workspace Standard)

## Ticket template (copy/paste)

**Copy and paste the template below to create a new ticket.** Replace all placeholders with concrete content before moving the ticket out of Unassigned.

### Required sections (in order)

1. **Goal** — One sentence describing what we want to achieve
2. **Human-verifiable deliverable** — What a non-technical human will see/click in the UI
3. **Acceptance criteria** — Checkbox list (`- [ ]`) of UI-verifiable items
4. **Constraints** — Technical or process limitations
5. **Non-goals** — Explicitly out of scope

### Critical requirements

- **Acceptance criteria MUST use checkbox format** (`- [ ]`) — not plain bullets (`-`)
- **Acceptance criteria MUST be UI-verifiable** — a human can confirm by looking at the UI or running a manual test (no "code compiles", "tests pass", "check logs", "verify DB row")
- **NO placeholders allowed** — Remove all angle-bracket placeholders (`<...>`, `<AC 1>`, etc.) and text placeholders (`TBD`, `(auto-assigned)`, etc.) before moving ticket out of Unassigned

---

## Template (copy/paste)

```markdown
## Goal

[One sentence describing what we want to achieve]

## Human-verifiable deliverable

[Describe exactly what a non-technical human will see/click in the UI. This must be something visible in the user interface, not a code change or backend modification.]

## Acceptance criteria

- [ ] [First UI-verifiable item that a human can confirm by looking at the UI]
- [ ] [Second UI-verifiable item that a human can confirm by looking at the UI]
- [ ] [Third UI-verifiable item that a human can confirm by looking at the UI]

## Constraints

- [Technical or process limitation 1]
- [Technical or process limitation 2]

## Non-goals

- [Explicitly out of scope item 1]
- [Explicitly out of scope item 2]
```

---

## Example (filled-in)

```markdown
## Goal

Add an export button to the Settings page that downloads user data as a CSV file.

## Human-verifiable deliverable

A new button labeled "Export Data" appears in the Settings page header. Clicking the button downloads a CSV file named "data-export.csv" and shows a success toast message.

## Acceptance criteria

- [ ] A new button labeled "Export Data" appears in the Settings page header
- [ ] Clicking the button opens a file download dialog
- [ ] The downloaded file is named "data-export.csv" and contains all user data
- [ ] A success toast message appears after download completes: "Data exported successfully"

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Import functionality (only export is in scope)
- Data filtering or selection (export all data)
- Multiple file format options (CSV only)
```

---

## Additional ticket metadata (optional)

When creating tickets via PM agent or manually, you may also include:

- **ID**: `<task-id>` (auto-assigned by system)
- **Title**: `<task-id> — <short title>` (ID prefix is automatically enforced; do not include manually)
- **Owner**: Implementation agent
- **Type**: Feature / Bug / Chore
- **Priority**: P0 / P1 / P2
- **Fixes**: `<ticket-id>` (required for bugfix tickets)
- **Category**: DnD / State / CSS / Build / Process / Other (required for bugfix tickets)

## Human in the Loop

After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.

## Implementation notes (optional)

- [Hints, suspected cause, suggested approach]

## Audit artifacts required (implementation agent)

Create `docs/audit/<task-id>-<short-title>/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
