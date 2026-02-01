# PM Review: 0049 - Ensure All Newly Created Tickets Have Title with ID Prefix

## Summary (1–3 bullets)

- Updated PM agent's create_ticket tool to format titles with em dash prefix ("NNNN — Title")
- Updated ticket template to demonstrate the title format convention
- Updated PM agent system instructions and tool descriptions to clarify automatic title prefixing

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Simple change to title formatting logic (single line change)
- Template update is straightforward documentation
- System instructions update ensures PM agent follows the convention
- Potential issue: PM agent might still include ID in title parameter, but tool description now clarifies this

## What to verify (UI-only)

- Create a new ticket via PM agent chat and verify the ticket card in kanban shows title starting with "NNNN —"
- Check the synced markdown file in `docs/tickets/` to confirm Title line matches the format
- Verify template file shows the format example

## Potential failures (ranked)

1. **PM agent includes ID in title parameter** — Title would show as "0050 — 0050 — Title" (duplicate ID), **likely cause**: PM agent didn't read tool description, **how to confirm**: Check Diagnostics for create_ticket tool call input, verify title parameter doesn't include ID
2. **Em dash character encoding issue** — Title shows as "0050 ? Title" or garbled, **likely cause**: Character encoding mismatch between tool and UI, **how to confirm**: Check ticket in Supabase directly, verify character is U+2014 (em dash)
3. **Template not followed by PM agent** — New tickets don't have prefix, **likely cause**: PM agent ignores template or system instructions, **how to confirm**: Check create_ticket tool calls in Diagnostics, verify title formatting in tool output

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None

## Follow-ups (optional)

- Monitor first few tickets created after this change to ensure format is consistent
- Consider adding validation to reject titles that already include ID prefix
