# Verification: QA completion message format requirement (0064)

## Code review

- ✅ `.cursor/rules/qa-audit-report.mdc` contains new "Completion message format requirement" section
- ✅ Format specification includes: `QA RESULT: <PASS|FAIL> — <ticket-id>`
- ✅ Examples provided for both PASS and FAIL outcomes
- ✅ All three workflow sections (feature branch, main branch, FAIL verdict) reference the format requirement
- ✅ Rationale documented (HAL needs to parse outcomes, human-verifiable)

## Human-verifiable steps

1. **Open** `.cursor/rules/qa-audit-report.mdc`
2. **Search** for "Completion message format requirement"
3. **Verify** the section exists and contains:
   - Format specification: `QA RESULT: <PASS|FAIL> — <ticket-id>`
   - Examples: `QA RESULT: PASS — 0056` and `QA RESULT: FAIL — 0056`
   - Placement requirement (final summary message)
   - Rationale about HAL parsing and human-verifiability
4. **Search** for "give your summary to the user"
5. **Verify** all three occurrences reference the format requirement
6. **Search** for "If verdict is FAIL"
7. **Verify** the FAIL section also references the format requirement

## Expected outcome

- QA agents following these rules will include `QA RESULT: PASS — <ticket-id>` or `QA RESULT: FAIL — <ticket-id>` in their final completion messages
- The format is easy to spot in chat transcripts
- HAL can reliably parse the outcome using simple text matching
