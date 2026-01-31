# Worklog: Ticket 0040

## Session 1: Investigation and rule design

### Investigation

- Read ticket 0040 and implementation notes (hypothesis: cloud agents blocked by branch/push rules).
- Read no-edits-on-main.mdc, done-means-pushed.mdc, change-ownership-and-staging-discipline.mdc: all require create/checkout feature branch before any file edit and push before “done”.
- Confirmed: in a workspace where `git checkout -b` or `git push` fails, the agent has no allowed path—either refuses to edit (on main) or fails on first git step. That matches “cloud agent cannot start” or immediate failure.
- Searched codebase: no in-repo code starts Cursor cloud agents; HAL app does not launch cloud agents. Failure is rule-side, not app-side.

### Design

- Added new rule **cloud-and-restricted-agent-workflow.mdc**: defines restricted environment (branch creation or push failed/unavailable); allows edits on current HEAD; requires change summary and explicit “not pushed, user must create branch and push”; forbids claiming “done” or “ready for QA” in restricted env.
- Updated no-edits-on-main, done-means-pushed, change-ownership-and-staging-discipline to reference the restricted workflow when branch creation or checkout fails.
- Added docs/process/cloud-agent-and-branch-rules.md: root cause, fix, and actionable steps if the agent still fails.

### Implementation

- Created branch `ticket/0040-investigate-cursor-cloud-agent-start-failure`.
- Created `.cursor/rules/cloud-and-restricted-agent-workflow.mdc`.
- Updated `.cursor/rules/no-edits-on-main.mdc` (escape to restricted workflow when branch creation/checkout fails).
- Updated `.cursor/rules/done-means-pushed.mdc` (escape to restricted workflow; do not claim done in restricted env).
- Updated `.cursor/rules/change-ownership-and-staging-discipline.mdc` (GATE and first-action escape to restricted workflow).
- Created `docs/process/cloud-agent-and-branch-rules.md`.
- Created audit folder and plan.md, worklog.md, changed-files.md, decisions.md, verification.md, pm-review.md.
- Added in-app pointer: Diagnostics panel row in src/App.tsx pointing to docs/process/cloud-agent-and-branch-rules.md for “Cloud agent not starting?” (actionable root cause visible in HAL UI).

## Summary

Root cause: branch/push rules blocked cloud agents in workspaces where git branch creation or push fails. Fix: restricted-environment escape hatch so the agent can proceed and report a change summary; preserved no-edits-on-main when branch can be created, traceable work, and user-verifiable criteria.
