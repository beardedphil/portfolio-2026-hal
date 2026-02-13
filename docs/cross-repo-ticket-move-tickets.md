# Cross-Repo Ticket Move - Tickets to Create

## Overview
This document lists the tickets that need to be created in the kanban and hal-agents repositories to implement cross-repo ticket moves.

## Ticket 1: Kanban Repo - UI Button

**Repository**: `portfolio-2026-basic-kanban`  
**Title**: Add UI button to move tickets to another repo's To-do column

### Goal (one sentence)
Add a button in the ticket details UI that allows users to move a ticket to the To-do column of another repository the user has access to.

### Human-verifiable deliverable (UI-only)
In the HAL UI, when viewing any ticket's details, there is a button (e.g., "Move to another repo's To-do") that opens a dialog or dropdown showing available repositories. When a user selects a target repository and confirms, the ticket is moved to that repository's To-do column, and a confirmation message is displayed.

### Acceptance criteria (UI-only)
- [ ] A button is visible in the ticket details UI for moving tickets to another repo
- [ ] Clicking the button shows a list of available repositories the user has access to
- [ ] Selecting a target repository and confirming moves the ticket to that repo's To-do column
- [ ] A success confirmation message is displayed after the move
- [ ] If the move fails, an error message is shown with clear guidance
- [ ] The button is accessible and works for tickets in any column

### Constraints
- Must use the existing move ticket API endpoint (extend if needed)
- Must respect user's repository access permissions
- UI-only verification (no terminal/devtools required)
- Error states must be clearly communicated in-app

### Non-goals
- Changing the underlying ticket data structure
- Adding new API endpoints (extend existing move endpoint if possible)
- Modifying PM agent behavior (separate ticket)

### Implementation notes
- Extend `/api/tickets/move` to accept optional `targetRepoFullName` parameter
- Add UI component in ticket details view (likely in `src/App.tsx` where ticket details are rendered)
- Fetch available repos from user's GitHub access or from Supabase tickets table
- Use existing `handleKanbanMoveTicket` function or create similar for cross-repo moves

---

## Ticket 2: Hal-Agents Repo - PM Agent Tool

**Repository**: `portfolio-2026-hal-agents`  
**Title**: Add PM agent tool to move tickets to another repo's To-do column

### Goal (one sentence)
Add a PM agent tool that allows moving tickets to the To-do column of another repository the user has access to.

### Human-verifiable deliverable (UI-only)
In the HAL UI, when chatting with the PM agent, users can ask to move a ticket to another repo's To-do column (e.g., "move ticket 0012 to the kanban repo's To-do"). The PM agent successfully moves the ticket and confirms the action in chat.

### Acceptance criteria (UI-only)
- [ ] PM agent has a tool (e.g., `kanban_move_ticket_to_other_repo_todo`) that accepts ticket ID and target repo
- [ ] PM agent can list available repositories when asked
- [ ] PM agent successfully moves tickets to target repo's To-do column when requested
- [ ] PM agent confirms the move in chat with clear messaging
- [ ] PM agent handles errors gracefully and explains them to the user
- [ ] Tool works for tickets in any column (not just Unassigned)

### Constraints
- Must use existing Supabase ticket structure
- Must respect repository scoping (repo_full_name field)
- Tool should validate target repo exists and user has access
- UI-only verification (no terminal/devtools required)

### Non-goals
- Changing ticket data model
- Adding new Supabase tables
- Modifying UI components (separate ticket)

### Implementation notes
- Add new tool in `projectManager.ts` similar to `kanban_move_ticket_to_todo`
- Tool should accept `ticket_id` and `target_repo_full_name` parameters
- Use existing move API endpoint (extend if needed to support target repo)
- Add tool description to PM system instructions
- Consider adding a tool to list available repos for the user

---

## How to Create These Tickets

1. **For Kanban repo ticket**: 
   - Connect to the kanban repo in HAL
   - Use PM agent: "Create a ticket: [paste ticket 1 content]"

2. **For Hal-Agents repo ticket**:
   - Connect to the hal-agents repo in HAL  
   - Use PM agent: "Create a ticket: [paste ticket 2 content]"

Or use the HAL API directly with the appropriate `projectId` (repo_full_name) set to the target repository.
