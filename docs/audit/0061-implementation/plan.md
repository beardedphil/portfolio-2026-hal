# Plan: Auto-move tickets on agent completion (0061)

## Goal
When a cloud agent reports that work is complete, HAL automatically moves the corresponding Kanban ticket to the correct next column.

## Approach

1. **Extract ticket ID from agent messages**
   - When Implementation Agent starts: extract ticket ID from "Implement ticket XXXX" pattern
   - When QA Agent starts: extract ticket ID from "QA ticket XXXX" pattern
   - Store ticket ID in state for each agent

2. **Create auto-move function**
   - Function to move tickets via Supabase API to target column
   - Calculate next position in target column
   - Handle errors and log to in-app diagnostics

3. **Trigger auto-move on completion**
   - Implementation Agent completion → move to `col-qa` (QA column)
   - QA Agent completion with PASS verdict → move to `col-human-in-the-loop`
   - Extract ticket ID from completion message if not stored

4. **In-app diagnostics**
   - Add diagnostics state for auto-move entries (errors and info)
   - Display diagnostics in Diagnostics panel when viewing Implementation/QA agent
   - Show human-readable error messages when auto-move fails

## File touchpoints

- `src/App.tsx`: Add state, auto-move logic, completion handlers, diagnostics UI
- `src/index.css`: Add styles for auto-move diagnostics entries
