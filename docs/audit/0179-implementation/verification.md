# Verification for ticket 0179

## UI-only verification steps

1. **Open the ticket template file**:
   - Navigate to `docs/templates/ticket.template.md` in the repository
   - Verify the file exists and is readable

2. **Verify "Ticket template (copy/paste)" section exists**:
   - Look for the heading "## Ticket template (copy/paste)" at the top of the file
   - Verify it appears before the template content

3. **Verify required sections are listed**:
   - Check that "Required sections (in order)" lists all 5 required sections:
     - Goal
     - Human-verifiable deliverable
     - Acceptance criteria
     - Constraints
     - Non-goals

4. **Verify critical requirements section**:
   - Check that "Critical requirements" section exists
   - Verify it includes:
     - Checkbox format requirement (`- [ ]`)
     - UI-verifiability requirement with examples of what NOT to include
     - No placeholders warning

5. **Verify template section exists**:
   - Check that "## Template (copy/paste)" section exists
   - Verify it contains a markdown code block with the template structure
   - Verify all 5 required sections are present in the template

6. **Verify example section exists**:
   - Check that "## Example (filled-in)" section exists
   - Verify it contains a markdown code block with a filled-in example
   - Verify the example includes:
     - A proper Goal (one sentence)
     - A proper Human-verifiable deliverable (UI-focused)
     - At least 3 Acceptance criteria items using `- [ ]` checkboxes
     - Proper Constraints
     - Proper Non-goals

7. **Verify example AC items are UI-verifiable**:
   - Check each Acceptance criteria item in the example
   - Verify they describe things a human can see/click in the UI (not "code compiles", "tests pass", "check logs", etc.)

8. **Verify template is referenced in process docs**:
   - Navigate to `docs/process/ready-to-start-checklist.md`
   - Verify it references `docs/templates/ticket.template.md`
   - This confirms agents will see the template

## Expected results

- ✅ Template file exists at `docs/templates/ticket.template.md`
- ✅ "Ticket template (copy/paste)" section is visible at the top
- ✅ All 5 required sections are listed and present in template
- ✅ Critical requirements section includes checkbox format, UI-verifiability, and placeholder warnings
- ✅ Example section includes at least 3 checkbox AC items that are UI-verifiable
- ✅ Template is referenced in `docs/process/ready-to-start-checklist.md`
