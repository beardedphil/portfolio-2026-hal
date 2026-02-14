# Ticket Template (Workspace Standard)

## Ticket template (copy/paste)

Copy and paste the template below to create tickets that consistently pass Definition of Ready. **Remove all placeholders** (e.g. `<...>`, "TBD", "(auto-assigned)") before moving a ticket out of Unassigned.

```markdown
## Goal (one sentence)

<Brief description of what we want to achieve>

## Human-verifiable deliverable (UI-only)

<Describe exactly what a non-technical human will see/click in the UI. Must be verifiable without terminal, devtools, or console.>

## Acceptance criteria (UI-only)

**IMPORTANT:** All acceptance criteria must be **UI-verifiable**. Do not include criteria that require running commands, checking logs, or verifying database rows. Each item should be something a human can verify by looking at or interacting with the UI.

- [ ] <Example: User can see a new button labeled "Save" in the top toolbar>
- [ ] <Example: Clicking the button shows a success message in the UI>
- [ ] <Example: The button is disabled when no changes are pending>

## Constraints

<Any technical or process constraints that apply to this ticket>

## Non-goals

<Explicitly state what is out of scope for this ticket>
```

**Placeholder warning:** Before moving a ticket from Unassigned to To Do, ensure all placeholders (angle brackets like `<...>`, "TBD", "(auto-assigned)", etc.) are replaced with concrete values. Tickets with unresolved placeholders will fail the Definition of Ready check.

---

Create a new file at `docs/tickets/<task-id>-<short-title>.md` using the detailed template below.

## Ticket

- **ID**: `<task-id>`
- **Title**: `<task-id> — <short title>` (ID prefix is automatically enforced; do not include manually)
- **Owner**: Implementation agent
- **Type**: Feature / Bug / Chore
- **Priority**: P0 / P1 / P2

## Linkage (for tracking)

- **Fixes**: `<ticket-id>` (required for bugfix tickets)
- **Category**: DnD / State / CSS / Build / Process / Other (required for bugfix tickets)

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.

## Goal (one sentence)

<what we want to achieve>

## Human-verifiable deliverable (UI-only)

<Describe exactly what a non-technical human will see/click in the UI.>

## Acceptance criteria (UI-only)

- [ ] <AC 1>
- [ ] <AC 2>
- [ ] <AC 3>

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- <explicitly out of scope>

## Implementation notes (optional)

- <hints, suspected cause, suggested approach>

## Audit artifacts required (implementation agent)

Create `docs/audit/<task-id>-<short-title>/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
