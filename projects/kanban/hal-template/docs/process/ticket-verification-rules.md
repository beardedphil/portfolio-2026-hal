# Ticket Verification Rules (Initial)

This document defines how we decide a ticket is **properly completed**.
We will expand these rules as we learn.

## Definition of Done (DoD) — for every ticket

- **Ticket exists**: `docs/tickets/<id>-<short-title>.md`
- **Ticket is committed**: the ticket file exists in git history on the branch being verified (not only on someone’s disk).
- **Audit folder exists**: `docs/audit/<id>-<short-title>/`
- **Work is committed + pushed**:
  - the implementation agent has committed all changes and pushed them to the remote before declaring “ready for verification”
  - all commits for the ticket include the ticket ID in the commit subject (e.g. `feat(0010): ...`)
  - the agent’s completion message includes `git status -sb` output showing the branch is not ahead/behind and the working tree is clean
- **Repo cleanliness**:
  - no untracked files may remain from the task (unless explicitly ignored and documented as a generated artifact)
- **Required audit artifacts exist**:
  - `plan.md`
  - `worklog.md`
  - `changed-files.md`
  - `decisions.md`
  - `verification.md`
- **UI-only verification steps**:
  - `verification.md` must be written so a non-technical human can follow it
  - no devtools / console / logs required for verification
- **No “handoff chores”**:
  - a ticket cannot be considered “ready for verification” if the agent tells the user/PM to perform git steps (commit/push) or to update audit artifacts
  - the only allowed prerequisites are “open the app” (and, if unavoidable, starting the dev server)
- **Acceptance criteria satisfied**:
  - each checkbox in the ticket maps to one or more explicit steps in `verification.md`
  - verification includes clear **pass/fail observations**
- **In-app diagnostics updated as needed**:
  - if something can fail, the app should provide enough in-app visibility to understand “what happened” without the console

## PM review checklist (quick)

- **Scope discipline**: change matches ticket; no extra features slipped in
- **No unrequested UI changes**: styling/behavior outside the ticket did not change unless explicitly documented in `decisions.md`
- **Traceability**: `changed-files.md` matches what actually changed
- **Risk notes**: `decisions.md` lists meaningful assumptions/trade-offs

## Where to put new verification rules

Add new rules here as additional sections. If a rule needs enforcing at agent-time, we can later mirror it into `.cursor/rules/`.
