# Plan: QA completion message format requirement (0064)

## Approach

- Update `.cursor/rules/qa-audit-report.mdc` to add a mandatory completion message format requirement
- Add a new section "Completion message format requirement" that specifies:
  - Format: `QA RESULT: <PASS|FAIL> — <ticket-id>`
  - Examples for both PASS and FAIL outcomes
  - Placement requirement (final summary message)
  - Rationale (HAL needs to parse outcomes)
- Update all workflow sections that mention "give your summary to the user" to reference the format requirement
- Update the FAIL verdict section to also require the format

## File touchpoints

- `.cursor/rules/qa-audit-report.mdc` — Add completion message format requirement section and update workflow references
