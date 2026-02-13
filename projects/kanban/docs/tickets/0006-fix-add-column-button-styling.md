## Ticket

- **ID**: `0006`
- **Title**: Fix Add Column button styling regression
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Goal (one sentence)

Restore the Add Column button so it renders as a single, clean button (no nested/orange button styling artifacts).

## Human-verifiable deliverable (UI-only)

In the running app, the **Add column** button appears as one button with consistent styling (no bright orange background/border appearing “inside” the black button).

## Acceptance criteria (UI-only)

- [ ] On page load, the **Add column** button appears as a single button (no nested-looking orange background/border inside it).
- [ ] Hovering the **Add column** button still looks intentional and consistent (no double borders).
- [ ] Clicking **Add column** still opens the add-column form and does not introduce any new styling glitches.
- [ ] No other button styles regress (at minimum: Debug toggle, Create, Cancel, Remove).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- No new features.
- No restyling/polish beyond fixing the regression.

## Implementation notes (optional)

- Suspected cause: CSS selector collision or nested interactive element (e.g., a `button` inside a `button`, or a link/button mix) introduced by a recent ticket.
- Fix should ensure the DOM is valid (no nested buttons) and styles are applied to the intended element only.

## Audit artifacts required (implementation agent)

Create `docs/audit/0006-fix-add-column-button-styling/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
