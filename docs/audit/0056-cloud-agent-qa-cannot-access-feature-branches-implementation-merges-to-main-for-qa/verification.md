# Verification

## Human-verifiable checks

A human can open the following files and verify the changes:

1. **`.cursor/rules/done-means-pushed.mdc`**:
   - Open the file and search for "Cloud QA branch access limitation"
   - Verify the section describes:
     - Scenario: Implementation cloud agent can create/push feature branch, but QA cloud agent cannot access non-`main` branches
     - Required steps: merge feature branch to `main`, push `main`, update ticket body with branch name, merge note, and audit artifact links
   - Verify the old "Do not merge to main" section is removed
   - Verify "Sequence: push first, then summarize" section includes merge-to-main step
   - Verify "Before you reply: the gate" section includes merge-to-main step

2. **`.cursor/rules/qa-audit-report.mdc`**:
   - Open the file and search for "QA on main"
   - Verify the section explains:
     - For tickets marked "Merged to main for QA", QA reviews on `main`
     - QA still produces qa-report.md
     - Workflow differences for merged vs non-merged tickets
   - Verify "QA completion" section handles both workflows

## Acceptance criteria verification

- [x] Implementation Agent rules explicitly describe the scenario: **Implementation cloud agent can create/push a feature branch, but the separate QA cloud agent cannot access non-`main` branches**.
  - Verified in `.cursor/rules/done-means-pushed.mdc` under "Cloud QA branch access limitation" section
- [x] Implementation Agent rules instruct: when the implementation agent believes work is ready for QA, it must **merge the feature branch into `main`** (with a commit message that includes the ticket ID) so QA can access the changes.
  - Verified in `.cursor/rules/done-means-pushed.mdc` step 2 of "When ready for QA"
- [x] The rules require the implementation agent to update the ticket body with: (a) the feature branch name used, (b) a note that the changes were merged to `main` due to cloud QA branch access limits, and (c) links/paths to all required audit artifacts.
  - Verified in `.cursor/rules/done-means-pushed.mdc` step 4 of "When ready for QA"
- [x] The QA Agent rules are updated to state that for tickets marked "Merged to main for QA", QA reviews/tests on `main` and still produces `docs/audit/0056-cloud-agent-qa-cannot-access-feature-branches-implementation-merges-to-main-for-qa/qa-report.md`.
  - Verified in `.cursor/rules/qa-audit-report.mdc` under "QA on main" section
