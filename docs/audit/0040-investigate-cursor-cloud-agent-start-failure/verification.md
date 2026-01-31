# Verification: Ticket 0040 (UI-only)

## Verification method

**UI-only verification** (no terminal, devtools, or console required for the human verifier).

- The human starts a **Cursor cloud agent** for this repo using the normal UI flow (Cursor UI or HAL, whichever is used to start cloud agents).
- The agent must reach a **“running/connected”** state with **no immediate failure**.
- If the cloud agent still fails to start, the **actionable root cause** is documented in `docs/process/cloud-agent-and-branch-rules.md` and in this audit (decisions.md); the verifier can use that doc to diagnose and act.

## Pre-verification setup

1. Ensure this repo is the one used for the cloud agent (correct workspace/folder).
2. Ensure the latest rules are present (branch `ticket/0040-investigate-cursor-cloud-agent-start-failure` merged to main, or this branch checked out): `.cursor/rules/cloud-and-restricted-agent-workflow.mdc` exists and no-edits-on-main, done-means-pushed, change-ownership-and-staging-discipline reference it.

## Test: Start cloud agent (success path)

### Steps

1. Open Cursor (or the UI used to start cloud agents for this repo).
2. Start a **cloud agent** for this repo/workspace using the normal flow (e.g. Background Agent / cloud agent start).
3. Observe whether the agent reaches a “running” or “connected” state.

### Expected results

- [ ] The cloud agent **starts** and reaches a running/connected state (no immediate failure message).
- [ ] The agent can proceed with work (e.g. respond to a simple task or ticket); if the workspace allows branch creation and push, it follows the normal branch/push flow; if not, it follows the restricted workflow and reports a change summary.

### Result: PASS / FAIL

**Notes:**

---

## If the cloud agent fails to start

- **In-app/visible**: If Cursor shows an error when starting the agent, that message is the visible failure. Our repo cannot inject text into Cursor’s UI.
- **Actionable root cause**: If the failure is due to branch/push rules, the root cause is documented in:
  - **docs/process/cloud-agent-and-branch-rules.md** (root cause, fix, what to do if the agent still fails).
  - **docs/audit/0040-investigate-cursor-cloud-agent-start-failure/decisions.md** (root cause tied to specific rules).
- **Action**: Sync or merge the latest rules (cloud-and-restricted-agent-workflow.mdc and updated branch rules); ensure the workspace has this repo’s `.cursor/rules` present. If the failure is different (e.g. auth, network), use Cursor’s error message and support channels.

## Summary

| Check | Status |
|-------|--------|
| Cloud agent starts and reaches running/connected state | ⬜ |
| If failure: actionable root cause in docs/process and audit | ⬜ |

**Overall result**: PASS / FAIL

**Verified by**: _________________  
**Date**: _________________  
**Branch**: ticket/0040-investigate-cursor-cloud-agent-start-failure (or main after merge)
