# Decisions: 0040 - Cursor cloud agent start failure

## Root cause (tied to specific rule/assumption)

**Decision**: The blocker is our **branch and push rules**, not git or Cursor itself.

**Assumption**: no-edits-on-main, done-means-pushed, and change-ownership-and-staging-discipline all require (1) create/checkout a feature branch **before any file edit**, and (2) push before claiming “done” or “ready for QA.” In Cursor **cloud agent** workspaces, `git checkout -b` or `git push` may fail (read-only git, no credentials, ephemeral clone). The agent then has no allowed path: it must not edit on main, and it cannot create a branch, so it either refuses to act or fails on the first git step. That appears as “cloud agent cannot start” or immediate failure.

**Rationale**: Ticket hypothesis and rule text match; no in-repo code starts cloud agents; failure is rule-side.

## New rule vs modifying existing rules only

**Decision**: Add a dedicated rule **cloud-and-restricted-agent-workflow.mdc** and reference it from the existing branch rules, rather than inlining the escape hatch in each rule.

**Rationale**: Keeps the escape hatch in one place; existing rules stay focused on “branch first, push before done” and only reference the restricted workflow when branch creation or checkout fails. Easier to maintain and to document.

## Definition of “restricted environment”

**Decision**: Restricted environment = (1) branch creation or checkout failed, or (2) push failed, or (3) workspace explicitly described as cloud/ephemeral/read-only. Agent should **try** the normal flow first; only switch to the restricted workflow when branch creation or push fails or is known unavailable.

**Rationale**: Avoids relaxing the branch requirement when the agent simply did not try. Ensures cloud agents that can create branches (e.g. some Cursor setups) still follow the normal flow.

## Allowing edits on main in restricted env

**Decision**: In a restricted environment, the agent **may** make edits on the current HEAD (including `main`) so that the agent can still deliver value.

**Rationale**: Otherwise the agent would still refuse to act when on main and unable to create a branch. The ticket goal is to “remove the blocker” so cloud agents can start and work; allowing edits on current HEAD in this narrow case achieves that. Traceability is preserved by requiring a change summary and explicit “user must create branch and push.”

## Not claiming “done” in restricted env

**Decision**: In a restricted environment, the agent must **not** claim “done,” “ready for verification,” or “ready for QA.” It must report a change summary and state that the user must create the branch and push (or use the platform’s PR flow).

**Rationale**: Preserves “done means pushed” for normal environments; QA cannot review unpushed work. The agent still completes the task and documents changes so the user can finish the flow elsewhere.

## In-app failure message (acceptance criteria)

**Decision**: We do **not** add new HAL UI to display “cloud agent failed to start.” The primary deliverable is fixing the rules so the agent does not fail. The **documented root cause** and **actionable steps** live in docs/process/cloud-agent-and-branch-rules.md and in the audit. If Cursor’s UI shows an error when starting a cloud agent, the user can use that doc for the actionable root cause.

**Rationale**: Cloud agent startup is triggered by Cursor’s UI, not by our app; we cannot control Cursor’s error display. Our fix is rule-side. The ticket requires “documented root cause tied to a specific rule/assumption” and “actionable root cause”; the process doc and audit satisfy that.

## Preserved constraints

**Decision**: Updated rules still preserve (1) no edits on main when the agent **can** create a feature branch, (2) traceable work via change summary and recommended branch name, (3) user-verifiable UI acceptance criteria unchanged.

**Rationale**: Ticket constraints and non-goals require keeping branching discipline and auditability; the escape hatch applies only when branch creation or push is not possible.
