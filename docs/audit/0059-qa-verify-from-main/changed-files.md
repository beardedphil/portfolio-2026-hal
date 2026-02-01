# Changed Files

- `.cursor/rules/qa-audit-report.mdc` — Updated QA agent instructions to explicitly handle cloud QA workflow where QA verifies from `main` branch instead of feature branches. Added:
  - "Cloud QA workflow context" section explaining the scenario
  - Enhanced "Which branch to use (decision rule)" with step-by-step guidance for `main` workflow
  - Updated "If you are verifying from `main`" section with explicit instructions to record verification context in ticket and avoid redundant merges
