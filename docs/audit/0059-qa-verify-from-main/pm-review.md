# PM Review Template (Likelihood of Success + Failure Modes)

## Summary (1–3 bullets)

- Updated QA agent instructions (`.cursor/rules/qa-audit-report.mdc`) to explicitly handle cloud QA workflow where QA verifies from `main` branch
- Added "Cloud QA workflow context" section and enhanced decision rule with step-by-step guidance
- Updated post-verification workflow to include recording verification context in ticket and avoid redundant merges

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Changes are straightforward documentation updates to existing rule file
- All acceptance criteria are explicitly addressed in the updated instructions
- Format and structure follow existing patterns in the file
- No code changes required, only documentation

## What to verify (UI-only)

- Open HAL UI's agent rules view and navigate to QA agent instructions
- Verify "Cloud QA workflow context" section is present and explains the scenario
- Verify "Which branch to use (decision rule)" includes explicit 5-step process for `main` workflow
- Verify "If you are verifying from `main`" section includes instructions to record verification context in ticket
- Verify all acceptance criteria are met (see verification.md for detailed checklist)

## Potential failures (ranked)

1. **Instructions not visible in HAL UI** — QA agent cannot find the updated instructions, likely cause: HAL UI not reading from `.cursor/rules/` correctly, confirm by checking if other rule files are visible
2. **Unclear step-by-step guidance** — QA agent still attempts to check out feature branch, likely cause: decision rule not explicit enough, confirm by reading "Which branch to use" section and checking for "Do **not** attempt to locate, check out, or use the feature branch"
3. **Missing ticket update step** — QA agent doesn't record verification context in ticket, likely cause: instruction not prominent enough, confirm by checking "If you are verifying from `main`" → Step 2

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None — all changes are documented and verification steps are clear

## Follow-ups (optional)

- None — implementation is complete and ready for QA verification
