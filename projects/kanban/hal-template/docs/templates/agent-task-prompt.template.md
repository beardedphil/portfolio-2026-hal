# Agent Task Prompt Template (Workspace Standard)

Copy this template into `docs/audit/<task-id>-<short-title>/prompt.md` and fill it in.

---
## Role

You are an implementation agent.

---
## Goal (one sentence)

<what we want to achieve>

---
## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.
- Create all required audit artifacts (see below).

---
## Deliverable (human-verifiable)

<Describe exactly what a non-technical human will see/click in the UI.>

---
## Acceptance Criteria (checklist)

- [ ] <AC 1>
- [ ] <AC 2>
- [ ] <AC 3>

---
## Non-Goals (explicitly out of scope)

- <non-goal 1>
- <non-goal 2>

---
## Technical Requirements

- Tech stack: React + Vite + TypeScript
- Keep changes minimal and readable.

---
## Audit Artifacts (required)

Create `docs/audit/<task-id>-<short-title>/` containing:
- `prompt.md` (paste the finalized prompt used)
- `plan.md` (3–10 bullets: approach and file touchpoints)
- `worklog.md` (ordered, timestamped-ish notes)
- `changed-files.md` (created/modified/deleted + purpose)
- `decisions.md` (assumptions/trade-offs + why)
- `verification.md` (UI-only verification steps; include screenshot filenames if used)

---
## Notes / Context (optional)

<links, constraints, or background>
