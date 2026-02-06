# PM Review: 0095-implementation

## Implementation summary

- Enhanced `create_ticket` tool to auto-fix formatting issues (convert bullets to checkboxes in Acceptance criteria)
- Updated PM agent system instructions to handle "Prepare top ticket" workflow with automatic move to To Do
- Enhanced UI confirmation messages to show explicit Ready-to-start status and auto-fix notifications
- Improved error messages to guide users on next steps

## Likelihood of success: 85%

The implementation addresses all acceptance criteria. Auto-fix handles common formatting issues, and the PM agent workflow ensures tickets are moved to To Do when ready. Error messages provide clear guidance.

## Potential failures and diagnosis

1. **Auto-fix doesn't work for all formatting issues** — Likely cause: Regex pattern doesn't match all bullet formats. **Diagnosis**: Check Diagnostics > Tool Calls > create_ticket output for `autoFixed` flag. If ticket has bullets but `autoFixed` is false, check the Acceptance criteria section format.

2. **"Prepare top ticket" doesn't move ticket to To Do** — Likely cause: PM agent doesn't follow the new instruction or ticket cannot be made ready. **Diagnosis**: Check PM chat for error messages. If ticket is ready but not moved, check Diagnostics > Tool Calls for `kanban_move_ticket_to_todo` call.

3. **Tickets with missing content show confusing error messages** — Likely cause: Error message doesn't clearly distinguish between fixable formatting issues and missing content. **Diagnosis**: Check PM chat message when creating a ticket with missing content. Should clearly state what is missing and guide user to fix it.

4. **Auto-fix updates ticket but move fails** — Likely cause: Database update succeeds but move operation fails. **Diagnosis**: Check PM chat message for move error. Should show "Ready-to-start" status but indicate move failure with clear next steps.

5. **UI doesn't show auto-fix notification** — Likely cause: `autoFixed` flag not properly extracted or displayed. **Diagnosis**: Check Diagnostics > Tool Calls > create_ticket output for `autoFixed` field. Check `src/App.tsx` message formatting logic.
