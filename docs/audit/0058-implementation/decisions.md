# Decisions

- **Tool output format**: The tool returns a structured object with `success`, `column_id`, `tickets` array, and `count`. The PM agent formats this into a readable list in the chat reply.
- **Column ID parameter**: Using the same column IDs as the Kanban board (e.g., "col-qa", "col-todo") to ensure consistency.
- **Fallback formatter**: Added a fallback reply formatter similar to other tools, but the model should naturally generate a formatted reply since it needs to present the list to the user.
- **Tool availability**: Tool is only available when Supabase credentials are provided (same pattern as other Supabase tools like `create_ticket`, `fetch_ticket_content`).
