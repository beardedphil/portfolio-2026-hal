# Plan

- Add `list_tickets_by_column` tool to PM agent that queries Supabase for tickets in a given Kanban column
- Tool should accept `column_id` parameter (e.g., "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop")
- Tool should return ticket ID, title, and column for each ticket
- Update PM agent system instructions to mention the new tool and when to use it
- Add fallback reply formatter for when the model doesn't generate a reply but the tool succeeds
- Ensure tool output is visible in-app (part of PM agent's chat reply)
