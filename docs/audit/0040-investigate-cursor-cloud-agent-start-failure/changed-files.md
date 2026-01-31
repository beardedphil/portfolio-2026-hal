# Changed Files: Ticket 0040

## Created

| File | Purpose |
|------|---------|
| `.cursor/rules/cloud-and-restricted-agent-workflow.mdc` | New rule: allow cloud/restricted agents to proceed when branch creation or push fails; require change summary and do not claim “done” in restricted env. |
| `docs/process/cloud-agent-and-branch-rules.md` | Process doc: root cause (branch/push rules), fix (restricted workflow), and actionable steps if the agent still fails. |
| `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/plan.md` | Audit plan. |
| `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/worklog.md` | Audit worklog. |
| `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/changed-files.md` | This file. |
| `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/decisions.md` | Design decisions. |
| `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/verification.md` | UI-only verification steps. |
| `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/pm-review.md` | PM review: likelihood of success, failure modes, in-app verification. |

## Modified

| File | Purpose |
|------|---------|
| `.cursor/rules/no-edits-on-main.mdc` | Add escape to cloud-and-restricted-agent-workflow when branch creation or checkout fails. |
| `.cursor/rules/done-means-pushed.mdc` | Add escape to restricted workflow when branch creation/checkout fails; do not claim done in restricted env. |
| `.cursor/rules/change-ownership-and-staging-discipline.mdc` | GATE and first-action: add escape to restricted workflow when branch creation or checkout fails. |
| `src/App.tsx` | Add Diagnostics row “Cloud agent: Not starting? See docs/process/cloud-agent-and-branch-rules.md” for in-app visible actionable root cause (0040). |
