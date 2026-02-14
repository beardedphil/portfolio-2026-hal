# Ticket Template (Workspace Standard)

Create a new file at `docs/tickets/<task-id>-<short-title>.md` using this template.

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

## UI verification checklist (required when the ticket affects UI)

**Note:** This checklist is **required for UI-impacting tickets** and **skippable for non-UI tickets** (e.g., backend-only, documentation, build/config changes).

- [ ] I can see the relevant UI element(s) without using devtools/console.
- [ ] Primary interaction works (click/type/submit) and produces the expected on-screen change.
- [ ] Empty/loading/error state is visible and not broken (if applicable to this UI).
- [ ] No obvious broken layout: element isn't off-screen/overlapped/behind an overlay unintentionally.
- [ ] A quick refresh/reload does not break the UI behavior (if applicable).

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
