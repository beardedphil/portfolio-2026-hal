# Cloud Agents and Branch Rules

## Root cause (ticket 0040)

Cursor **cloud agents** run in workspaces where:

- **Branch creation** (`git checkout -b`) may fail (read-only git, ephemeral clone, or no ref write).
- **Push** may be unavailable (no credentials, no network to origin).

Our rules (no-edits-on-main, done-means-pushed, change-ownership-and-staging-discipline) required agents to **create a feature branch before any file edit** and **push before claiming done**. In a cloud workspace where those operations fail, the agent would either refuse to make edits (and appear to “not start” or do nothing useful) or hit a hard failure on the first git step.

## Fix

We added **cloud-and-restricted-agent-workflow.mdc** and updated the branch rules to:

1. **Try the normal flow first**: create/checkout the feature branch, then edit and push.
2. **If branch creation or push fails**: the agent may proceed on the current HEAD, make edits, and at the end report a **change summary** and state that the user must create the branch and push from a machine with git write and push access (or use the platform’s PR flow).
3. The agent must **not** claim “done” or “ready for QA” when in a restricted environment; it must clearly state that work is not pushed.

This keeps:

- **No edits on main** when the agent *can* create a feature branch.
- **Traceable work** via change summary and recommended branch name.
- **User-verifiable** acceptance criteria unchanged.

## If the cloud agent still fails to start

1. **Check Cursor’s UI** for any error message when starting the cloud agent (e.g. auth, workspace, or policy errors).
2. **Confirm the rule set**: this repo’s `.cursor/rules` include `cloud-and-restricted-agent-workflow.mdc` and the updated no-edits-on-main, done-means-pushed, and change-ownership-and-staging-discipline rules. If the workspace is an older clone or missing rules, sync the repo.
3. **Actionable root cause**: If the failure is due to branch/push requirements, the cause is “branch creation or push failed in this workspace.” The fix is either (a) use the restricted workflow (agent proceeds and reports a change summary) or (b) run the agent in an environment where git can create branches and push (e.g. local clone with credentials).
4. **Documentation**: This file and the audit at `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/` document the root cause and the fix.
