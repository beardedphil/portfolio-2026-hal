# Title
PM: Clean up Unassigned tickets so they pass Definition of Ready

## Owner
PM

## Type
Process

## Priority
P0

## Linkage
- Related: `docs/process/ready-to-start-checklist.md`
- Affected tickets (initial list): 0025, 0027, 0029, 0030, 0031, 0032, 0033, 0034, 0035

## Goal (one sentence)
Ensure every ticket currently in **Unassigned** meets the Definition of Ready so it can be moved to **To Do** without missing sections or unresolved placeholders.

## Human-verifiable deliverable (UI-only)
In the embedded Kanban UI, a PM can open **Unassigned**, select each listed ticket, and verify the ticket body shows a filled **Goal**, **Human-verifiable deliverable**, **Acceptance criteria (checkboxes)**, **Constraints**, and **Non-goals**, with **no** angle-bracket template placeholders; then the PM can move the ticket to **To Do**.

## Acceptance criteria (UI-only)
- [ ] For each targeted Unassigned ticket, the ticket body contains a non-placeholder **Goal (one sentence)**.
- [ ] For each targeted Unassigned ticket, the ticket body contains a non-placeholder **Human-verifiable deliverable (UI-only)**.
- [ ] For each targeted Unassigned ticket, the ticket body contains an **Acceptance criteria (UI-only)** section with at least one checkbox item.
- [ ] For each targeted Unassigned ticket, the ticket body contains non-empty **Constraints** and **Non-goals** sections (at least 1 bullet/line each).
- [ ] No targeted ticket body contains unresolved angle-bracket placeholders (e.g. `<task-id>`, `<short-title>`, `<AC 1>`, `<feature>`).
- [ ] After cleanup, each targeted ticket can be moved from **Unassigned** to **To Do** (passes the PM “ready” gate).

## Constraints
- PM-only work: this ticket is editorial/process cleanup of ticket text/metadata; no application code changes.
- Do not change intended scope of each ticket; only clarify wording enough to be implementable/verifiable.
- If a ticket is obsolete/duplicate, mark it clearly (e.g. link to superseding ticket) rather than silently deleting.

## Non-goals
- Implementing any of the features described by the cleaned-up tickets.
- Reprioritizing the backlog beyond what is necessary to make tickets ready.

## Implementation notes
- Use the checklist in `docs/process/ready-to-start-checklist.md` as the source of truth.
- For each ticket, remove any template placeholders and fill missing sections.
- Keep Acceptance Criteria strictly **UI-only** and human-verifiable.

## Audit artifacts
- Record a short before/after note in each edited ticket’s history (e.g. “PM cleanup for DoR”).
- If the repo uses audit folders for PM process work, create `docs/audit/<new-ticket-id>-<slug>/worklog.md` capturing which tickets were edited and why.