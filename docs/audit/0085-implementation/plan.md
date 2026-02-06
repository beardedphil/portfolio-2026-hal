# Plan: Human-in-the-Loop Validation Section (0085)

## Goal
Add a Human-in-the-Loop (HITL) validation section to ticket detail pages so a human can record validation steps/notes and move the ticket to Done (pass) or back to To Do (fail).

## Approach
1. **Create HumanValidationSection component**
   - Multiline input for "Steps to validate"
   - Multiline input for "Notes"
   - Pass and Fail buttons
   - Show only when ticket is in `col-human-in-the-loop` column

2. **Integrate into TicketDetailModal**
   - Pass ticket's `kanban_column_id` to modal
   - Conditionally render validation section based on column ID
   - Add state management for validation inputs

3. **Implement Pass handler**
   - Move ticket from `col-human-in-the-loop` to `col-done`
   - Use `updateSupabaseTicketKanban` to update column and position
   - Refresh ticket list after move

4. **Implement Fail handler**
   - Move ticket from `col-human-in-the-loop` to `col-todo`
   - Prepend human feedback to ticket `body_md` in Supabase
   - Format feedback with timestamp and clear labeling
   - Refresh ticket list after move

5. **Style validation section**
   - Distinct visual design (blue border, light background)
   - Responsive layout for inputs and buttons
   - Disabled state during processing

6. **Visual emphasis for human feedback**
   - When human feedback exists in ticket body, style it prominently
   - Use yellow/amber background with border
   - Ensure it appears near top of ticket content

## File touchpoints
- `projects/kanban/src/App.tsx` - Add component, integrate into modal, add handlers
- `projects/kanban/src/index.css` - Add styles for validation section and human feedback
