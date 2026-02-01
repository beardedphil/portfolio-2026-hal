# Worklog

- Read existing QA agent instructions in `.cursor/rules/qa-audit-report.mdc`
- Added "Cloud QA workflow context" section explaining the cloud QA scenario and when to use `main`
- Enhanced "Which branch to use (decision rule)" section with explicit 5-step process for verifying from `main`:
  - Step 1: Pull latest `main`
  - Step 2: Perform QA on `main`
  - Step 3: Record in qa-report.md that verification was against `main`
  - Step 4: Commit qa-report to `main` (no merge needed)
  - Step 5: Move ticket to Human in the Loop
- Updated "If you are verifying from `main`" section to include:
  - Explicit instruction to record verification context in the ticket (update ticket body with qa-report link and note about `main` verification)
  - Clear note about avoiding redundant merges (change already on `main`)
  - Step-by-step process for moving ticket to Human in the Loop (DB-first)
- Added important note about recording verification context in both qa-report.md and ticket artifacts/links
- Created all required audit artifacts
