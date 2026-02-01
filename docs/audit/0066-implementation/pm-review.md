# PM Review: Prevent PM agent from creating/updating tickets with unresolved placeholders (0066)

## Likelihood of success: 95%

The implementation is straightforward: add validation checks before database operations and display results in Diagnostics. The placeholder detection logic already exists (`PLACEHOLDER_RE`), and we're reusing it.

## Potential failures (ranked by likelihood)

1. **Placeholder pattern doesn't match all cases** — Some placeholder formats not caught by `PLACEHOLDER_RE` (e.g., `<placeholder with special chars>`)
   - **Likelihood**: Low (pattern is `/<[A-Za-z0-9\s\-_]+>/g` which should catch most cases)
   - **How to diagnose**: Check Diagnostics > Ticket readiness evaluation for false negatives. If ticket with placeholders is created, check tool call output for detected placeholders.

2. **Normalization introduces placeholders** — `normalizeTitleLineInBody` somehow creates placeholders
   - **Likelihood**: Very low (normalization only modifies Title line, doesn't touch other content)
   - **How to diagnose**: Check Diagnostics > Tool Calls > create_ticket/update_ticket_body Output. If placeholders appear after normalization, check normalizeTitleLineInBody implementation.

3. **Diagnostics UI doesn't show readiness evaluation** — Section not rendering or not extracting data correctly
   - **Likelihood**: Low (straightforward React component)
   - **How to diagnose**: Check Diagnostics panel for "Ticket readiness evaluation" section. If missing, check browser console for React errors. Verify tool calls contain readiness data.

4. **Error message not shown in chat** — Fallback reply logic doesn't trigger or model overrides it
   - **Likelihood**: Low (fallback logic checks for validation failures first)
   - **How to diagnose**: If validation fails but no error in chat, check Diagnostics > Tool Calls for create_ticket/update_ticket_body output. Verify fallback reply logic is executing.

5. **False positives** — Valid content incorrectly flagged as placeholders (e.g., code examples with angle brackets)
   - **Likelihood**: Low (pattern requires angle brackets with alphanumeric content)
   - **How to diagnose**: If valid ticket is rejected, check Diagnostics > Ticket readiness evaluation for detected placeholders. Verify they are actually placeholders, not code examples.

## In-app diagnostics

- **Diagnostics > Ticket readiness evaluation**: Shows pass/fail status, detected placeholders (if rejected), or missing items (if not ready)
- **Diagnostics > Tool Calls**: Shows full tool call input/output including error messages and detected placeholders
- **Chat reply**: Shows error message with detected placeholders when validation fails
