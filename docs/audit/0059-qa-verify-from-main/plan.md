# Plan

- Read the current QA agent instructions in `.cursor/rules/qa-audit-report.mdc`
- Add a "Cloud QA workflow context" section explaining when QA verifies from `main` vs feature branches
- Enhance the "Which branch to use (decision rule)" section with explicit step-by-step guidance for the `main` workflow
- Update the "If you are verifying from `main`" section to include:
  - Explicit instruction to record verification context in the ticket (artifacts/links)
  - Clear note about avoiding redundant merges
  - Step-by-step process for moving ticket to Human in the Loop
- Ensure all acceptance criteria are met:
  - QA explicitly states it pulls/tests latest `main` when implementation merged for QA access
  - Clear decision rule: if ticket indicates "merged to main for QA access", QA must use `main`
  - QA records artifacts/links in ticket and notes verification was performed against `main`
  - Instructions describe post-verification workflow (move to Human in the Loop, avoid redundant merges)
- Create all required audit artifacts (plan, worklog, changed-files, decisions, verification, pm-review)
