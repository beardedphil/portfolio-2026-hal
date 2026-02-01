# PM Review: QA completion message format requirement (0064)

## Summary

- Added mandatory completion message format requirement to QA agent rules
- Format: `QA RESULT: <PASS|FAIL> — <ticket-id>`
- Updated all QA workflow sections to reference the format requirement

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Simple rule addition with clear format specification
- All workflow paths updated consistently
- Format is human-verifiable and easy to parse
- No code changes required (rules-only change)

## What to verify (UI-only)

- Open `.cursor/rules/qa-audit-report.mdc` and confirm "Completion message format requirement" section exists
- Verify format examples are present and clear
- Check that all workflow summary steps reference the format requirement

## Potential failures (ranked)

1. **QA agents don't follow the format** — QA chat completion messages don't contain `QA RESULT: PASS — <id>` or `QA RESULT: FAIL — <id>`
   - **What you'd see:** QA completion messages in chat don't match the required format
   - **Likely cause:** QA agent didn't read or follow the updated rules
   - **How to confirm:** Check QA chat transcript for completion message; should contain literal format string

2. **Format inconsistency** — Different QA agents use slightly different formats (e.g., different separators, spacing)
   - **What you'd see:** Some QA messages have `QA RESULT: PASS — 0056` while others have `QA RESULT:PASS-0056` or similar variations
   - **Likely cause:** Format specification not explicit enough about exact spacing/separators
   - **How to confirm:** Compare multiple QA completion messages; format should be identical

3. **Format in wrong location** — Format appears in intermediate messages instead of final summary
   - **What you'd see:** `QA RESULT: PASS — 0056` appears early in QA chat, not in final message
   - **Likely cause:** QA agent didn't read placement requirement carefully
   - **How to confirm:** Check QA chat transcript; format should be in the last message from QA agent

## Audit completeness check

- **Artifacts present**: ✅ plan / ✅ worklog / ✅ changed-files / ✅ decisions / ✅ verification / ✅ pm-review
- **Traceability gaps**: None

## Follow-ups (optional)

- Monitor first few QA runs to confirm agents follow the format
- Consider adding format validation in HAL if needed (future ticket)
