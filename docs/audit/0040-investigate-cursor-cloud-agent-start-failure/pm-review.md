# PM Review: 0040 - Investigate Cursor cloud agent start failure

## Summary (1–3 bullets)

- Added cloud-and-restricted-agent-workflow.mdc so agents can proceed when branch creation or push fails (e.g. cloud workspace).
- Updated no-edits-on-main, done-means-pushed, change-ownership-and-staging-discipline to reference the restricted workflow when branch creation/checkout fails.
- Documented root cause in docs/process/cloud-agent-and-branch-rules.md; added in-app pointer in HAL Diagnostics (Cloud agent: Not starting? See doc).

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Root cause is rule-side (branch/push required before any edit); the escape hatch allows cloud agents to proceed and report a change summary.
- Cursor cloud agent startup is controlled by Cursor’s UI; we cannot force success if Cursor or the workspace blocks for other reasons (auth, network).
- Verification is human-led: start cloud agent and confirm it reaches running/connected state; if it fails, the in-app Diagnostics line and process doc give the actionable root cause.

## What to verify (UI-only)

- Start a Cursor cloud agent for this repo; it reaches a “running/connected” state with no immediate failure.
- If the agent fails: open HAL at http://localhost:5173, expand Diagnostics; see “Cloud agent: Not starting? See docs/process/cloud-agent-and-branch-rules.md for root cause and fix.”

## Potential failures (ranked)

1. **Cloud agent still fails to start** — Cursor shows an error when starting the agent. Likely cause: workspace missing updated rules, or a different failure (auth/network). Confirm using: ensure branch ticket/0040-investigate-cursor-cloud-agent-start-failure (or main after merge) is checked out and .cursor/rules/cloud-and-restricted-agent-workflow.mdc exists; read docs/process/cloud-agent-and-branch-rules.md for actionable steps.
2. **Agent starts but refuses to edit** — Agent says it cannot edit on main and does not try/follow restricted workflow. Likely cause: rule order or agent not reading cloud-and-restricted-agent-workflow.mdc. Confirm using: check that no-edits-on-main and done-means-pushed reference cloud-and-restricted-agent-workflow.mdc when branch creation fails.
3. **HAL Diagnostics line not visible** — User expands Diagnostics but does not see “Cloud agent” help line. Likely cause: old build or wrong branch. Confirm using: ensure src/App.tsx contains “Cloud agent” diag-help block and dev server was restarted.

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review.
- **Traceability gaps**: None.

## Follow-ups (optional)

- If Cursor adds an env var or API to detect cloud vs local agent, consider tightening “restricted environment” detection in the rule.
