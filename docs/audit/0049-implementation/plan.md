# Plan: Ensure All Newly Created Tickets Have Title with ID Prefix

## Approach
1. **Update PM agent create_ticket tool**: Change the title formatting from `"${id} - ${title}"` to `"${id} — ${title}"` (using em dash instead of regular dash).
2. **Update ticket template**: Modify `docs/templates/ticket.template.md` to demonstrate the "NNNN —" title prefix convention in the Title field example.
3. **Update PM agent system instructions**: Add guidance that the tool automatically prefixes titles with "NNNN —" format, so agents should not include the ID in the title parameter.
4. **Update create_ticket tool description**: Clarify that the tool automatically formats the title with the ID prefix using em dash.

## File Touchpoints
- `projects/hal-agents/src/agents/projectManager.ts`: Update title formatting (line 511), update system instructions, update tool description
- `docs/templates/ticket.template.md`: Update Title field to show "NNNN —" format example
