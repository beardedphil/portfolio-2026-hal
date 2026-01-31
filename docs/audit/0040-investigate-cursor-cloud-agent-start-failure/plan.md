# Plan: 0040 - Investigate Cursor cloud agent start failure

## Goal

Identify and remove the blocker preventing Cursor cloud agents from starting/working in this repo while keeping no-edits-on-main, traceable work, and user-verifiable acceptance criteria.

## Analysis

### Hypothesis (from ticket)

Cloud agents run in an isolated workspace that may not allow `git checkout -b` or may not have authenticated push; our rules instruct agents to create branches and push before any edit and before claiming done. That can cause the agent to refuse to act (or fail on the first git step).

### Approach

1. **Root cause**: Rules no-edits-on-main, done-means-pushed, and change-ownership-and-staging-discipline all require (a) create/checkout feature branch before any file edit, (b) push before “done”. In a workspace where branch creation or push fails, the agent has no allowed path—hence “agent cannot start” or immediate failure.
2. **Fix**: Add a dedicated rule **cloud-and-restricted-agent-workflow.mdc** that defines a “restricted environment” (branch creation or push failed/unavailable) and allows the agent to proceed on current HEAD, make edits, and report a change summary so the user can create the branch and push elsewhere. Do not claim “done” or “ready for QA” in that case.
3. **Cross-references**: Update no-edits-on-main, done-means-pushed, and change-ownership-and-staging-discipline to reference the restricted workflow when branch creation or checkout fails.
4. **Documentation**: Add docs/process/cloud-agent-and-branch-rules.md with root cause and actionable guidance if the agent still fails. Create audit folder with plan, worklog, changed-files, decisions, verification (UI-only).

## Implementation steps

1. Create `.cursor/rules/cloud-and-restricted-agent-workflow.mdc` (definition of restricted env, allowed behavior, summary requirement).
2. Update `.cursor/rules/no-edits-on-main.mdc`: add escape to restricted workflow when branch creation/checkout fails.
3. Update `.cursor/rules/done-means-pushed.mdc`: add escape to restricted workflow; do not claim done in restricted env.
4. Update `.cursor/rules/change-ownership-and-staging-discipline.mdc`: add escape to restricted workflow in “first action” and GATE.
5. Add `docs/process/cloud-agent-and-branch-rules.md` (root cause, fix, what to do if agent still fails).
6. Create audit artifacts: plan.md, worklog.md, changed-files.md, decisions.md, verification.md.

## Non-goals

- Changing Cursor’s cloud agent UI or error display (out of repo scope).
- Redesigning the full branching/audit process beyond unblocking cloud agents.
