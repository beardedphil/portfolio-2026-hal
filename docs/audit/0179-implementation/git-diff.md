# Git Diff for ticket 0179

## Changes to docs/templates/ticket.template.md

```diff
diff --git a/docs/templates/ticket.template.md b/docs/templates/ticket.template.md
index bedca31..1798e96 100644
--- a/docs/templates/ticket.template.md
+++ b/docs/templates/ticket.template.md
@@ -1,37 +1,72 @@
 # Ticket Template (Workspace Standard)
 
-Create a new file at `docs/tickets/<task-id>-<short-title>.md` using this template.
+## Ticket template (copy/paste)
 
-## Ticket
+**Copy and paste the template below to create a new ticket.** Replace all placeholders with concrete content before moving the ticket out of Unassigned.
 
-- **ID**: `<task-id>`
-- **Title**: `<task-id> — <short title>` (ID prefix is automatically enforced; do not include manually)
-- **Owner**: Implementation agent
-- **Type**: Feature / Bug / Chore
-- **Priority**: P0 / P1 / P2
+### Required sections (in order)
 
-## Linkage (for tracking)
+1. **Goal** — One sentence describing what we want to achieve
+2. **Human-verifiable deliverable** — What a non-technical human will see/click in the UI
+3. **Acceptance criteria** — Checkbox list (`- [ ]`) of UI-verifiable items
+4. **Constraints** — Technical or process limitations
+5. **Non-goals** — Explicitly out of scope
 
-- **Fixes**: `<ticket-id>` (required for bugfix tickets)
-- **Category**: DnD / State / CSS / Build / Process / Other (required for bugfix tickets)
+### Critical requirements
 
-## Human in the Loop
+- **Acceptance criteria MUST use checkbox format** (`- [ ]`) — not plain bullets (`-`)
+- **Acceptance criteria MUST be UI-verifiable** — a human can confirm by looking at the UI or running a manual test (no "code compiles", "tests pass", "check logs", "verify DB row")
+- **NO placeholders allowed** — Remove all angle-bracket placeholders (`<...>`, `<AC 1>`, etc.) and text placeholders (`TBD`, `(auto-assigned)`, etc.) before moving ticket out of Unassigned
 
-- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.
+---
 
-## Goal (one sentence)
+## Template (copy/paste)
 
-<what we want to achieve>
+```markdown
+## Goal
 
-## Human-verifiable deliverable (UI-only)
+[One sentence describing what we want to achieve]
 
-<Describe exactly what a non-technical human will see/click in the UI.>
+## Human-verifiable deliverable
 
-## Acceptance criteria (UI-only)
+[Describe exactly what a non-technical human will see/click in the UI. This must be something visible in the user interface, not a code change or backend modification.]
 
-- [ ] <AC 1>
-- [ ] <AC 2>
-- [ ] <AC 3>
+## Acceptance criteria
+
+- [ ] [First UI-verifiable item that a human can confirm by looking at the UI]
+- [ ] [Second UI-verifiable item that a human can confirm by looking at the UI]
+- [ ] [Third UI-verifiable item that a human can confirm by looking at the UI]
+
+## Constraints
+
+- [Technical or process limitation 1]
+- [Technical or process limitation 2]
+
+## Non-goals
+
+- [Explicitly out of scope item 1]
+- [Explicitly out of scope item 2]
+```
+
+---
+
+## Example (filled-in)
+
+```markdown
+## Goal
+
+Add an export button to the Settings page that downloads user data as a CSV file.
+
+## Human-verifiable deliverable
+
+A new button labeled "Export Data" appears in the Settings page header. Clicking the button downloads a CSV file named "data-export.csv" and shows a success toast message.
+
+## Acceptance criteria
+
+- [ ] A new button labeled "Export Data" appears in the Settings page header
+- [ ] Clicking the button opens a file download dialog
+- [ ] The downloaded file is named "data-export.csv" and contains all user data
+- [ ] A success toast message appears after download completes: "Data exported successfully"
 
 ## Constraints
 
@@ -41,11 +76,32 @@ Create a new file at `docs/tickets/<task-id>-<short-title>.md` using this templa
 
 ## Non-goals
 
-- <explicitly out of scope>
+- Import functionality (only export is in scope)
+- Data filtering or selection (export all data)
+- Multiple file format options (CSV only)
+```
+
+---
+
+## Additional ticket metadata (optional)
+
+When creating tickets via PM agent or manually, you may also include:
+
+- **ID**: `<task-id>` (auto-assigned by system)
+- **Title**: `<task-id> — <short title>` (ID prefix is automatically enforced; do not include manually)
+- **Owner**: Implementation agent
+- **Type**: Feature / Bug / Chore
+- **Priority**: P0 / P1 / P2
+- **Fixes**: `<ticket-id>` (required for bugfix tickets)
+- **Category**: DnD / State / CSS / Build / Process / Other (required for bugfix tickets)
+
+## Human in the Loop
+
+After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.
 
 ## Implementation notes (optional)
 
-- <hints, suspected cause, suggested approach>
+- [Hints, suspected cause, suggested approach]
```
