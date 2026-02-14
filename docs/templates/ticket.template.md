# Ticket Template (Workspace Standard)

## Ticket template (copy/paste)

**Copy the template below and paste it into your ticket. Replace all placeholders with concrete content before moving a ticket out of Unassigned.**

### Required sections (in order)

1. **Goal (one sentence)** — One sentence describing what we want to achieve
2. **Human-verifiable deliverable (UI-only)** — Describe exactly what a non-technical human will see/click in the UI
3. **Acceptance criteria (UI-only)** — Use `- [ ]` checkbox format (at least 3 items). **All AC must be UI-verifiable** — no "run command", "check logs", or "verify DB row". A human must be able to verify by clicking/seeing something in the app UI.
4. **Constraints** — Technical or process constraints
5. **Non-goals** — Explicitly out of scope

### ⚠️ Critical warnings

- **No placeholders allowed**: Remove all angle-bracket placeholders (e.g. `<...>`, `<AC 1>`, `<task-id>`, `<what we want to achieve>`) before moving a ticket out of Unassigned. Placeholders like `TBD` or `(auto-assigned)` are also not allowed.
- **UI-verifiable only**: Acceptance criteria must be verifiable in the app UI. Do not include criteria that require terminal commands, devtools, logs, or database inspection.

### Template (copy/paste this)

```markdown
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
```

### Example (filled-in)

```markdown
## Goal (one sentence)

Add a dark mode toggle button to the settings page that persists the user's preference.

## Human-verifiable deliverable (UI-only)

A non-technical user opens the app, navigates to Settings, sees a "Dark mode" toggle switch, clicks it, and observes the entire app UI changes from light to dark theme. The preference persists after page refresh.

## Acceptance criteria (UI-only)

- [ ] Settings page displays a "Dark mode" toggle switch that is clearly visible and clickable
- [ ] Clicking the toggle immediately changes the app theme from light to dark (or vice versa) with a smooth transition
- [ ] The selected theme preference persists after page refresh (the toggle state matches the current theme on reload)

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Theme customization beyond light/dark (no color pickers or advanced theming)
- Per-component theme overrides (global theme only)
```

---

## Full ticket structure (for reference)

When creating a complete ticket file at `docs/tickets/<task-id>-<short-title>.md`, use this full structure:

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
