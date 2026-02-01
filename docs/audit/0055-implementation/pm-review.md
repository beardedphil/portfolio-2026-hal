# PM Review Template (Likelihood of Success + Failure Modes)

Create `docs/audit/<task-id>-<short-title>/pm-review.md` after an implementation agent completes.

## Summary (1–3 bullets)

- Updated Implementation agent rules to require adding "Artifacts" section to ticket body when marking ready for QA
- Updated QA agent rules to require adding/updating "Artifacts" section to include qa-report.md when QA is complete
- Specified minimum artifact list and clarified link format requirements

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Changes are straightforward rule updates with clear requirements
- Both Implementation and QA workflows are well-documented in existing rules
- The requirement is self-contained and doesn't depend on external systems

## What to verify (UI-only)

- Open a ticket that has been worked by an Implementation agent and verify it contains an "Artifacts" section with links to all required audit files
- Open a ticket that has been QA'd and verify the "Artifacts" section includes qa-report.md
- Verify that artifact links/paths are clickable in the Kanban UI

## Potential failures (ranked)

1. **Agents forget to add Artifacts section** — Ticket body missing "Artifacts" section, links not visible in Kanban UI — Confirm by checking ticket body in Supabase/Kanban UI; verify rules are being followed
2. **Incorrect artifact paths** — Links in Artifacts section don't match actual file locations — Verify paths match canonical folder naming (`<task-id>-<short-title-kebab>`) and files exist at those paths
3. **Missing qa-report.md link** — QA completes but qa-report.md not added to Artifacts section — Check QA workflow in `qa-audit-report.mdc`; verify QA agents are updating the section

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - None — all required artifacts are present

## Follow-ups (optional)

- Monitor first few tickets after this change to ensure agents are following the new requirement
- Consider adding validation in the sync script or PM agent to check for Artifacts section presence
