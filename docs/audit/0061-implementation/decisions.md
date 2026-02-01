# Decisions: Auto-move tickets on agent completion (0061)

## Design decisions

### Ticket ID extraction
- **Decision**: Extract ticket ID from both the initial message and completion message as fallback
- **Rationale**: Ensures we can still move tickets even if state is lost or message format varies
- **Pattern**: Use regex to match "Implement ticket XXXX" or "QA ticket XXXX", with fallback to any 4-digit number

### Auto-move timing
- **Decision**: Trigger auto-move when `stage === 'completed'` is received from the agent stream
- **Rationale**: This is the earliest reliable signal that work is complete, before the final message is displayed
- **Note**: Backend also moves tickets, but frontend auto-move provides redundancy and better error visibility

### QA Agent verdict detection
- **Decision**: Check for PASS verdict via multiple signals: `data.verdict === 'PASS'`, `data.success === true`, or text patterns like "pass", "ok.*merge", "verified.*main"
- **Rationale**: QA agent may report PASS in different formats; multiple checks increase reliability
- **Fallback**: Only move to Human in the Loop if verdict is clearly PASS; otherwise skip auto-move

### Diagnostics display
- **Decision**: Show last 10 diagnostic entries in Diagnostics panel, only visible when viewing Implementation/QA agent
- **Rationale**: Keeps diagnostics relevant and prevents overwhelming the UI
- **Format**: Timestamp + message, color-coded by type (error/info)

### Error handling
- **Decision**: Log all auto-move errors to in-app diagnostics, don't throw or block UI
- **Rationale**: Auto-move is a convenience feature; failures should be visible but not disruptive
- **User impact**: If auto-move fails, user can still manually move tickets; diagnostics explain why it failed

### Sync-tickets
- **Decision**: Rely on Kanban board polling to reflect column changes; don't call sync-tickets from frontend
- **Rationale**: Backend already handles sync when tickets are moved via agent endpoints; frontend move is a fallback
- **Note**: Kanban board polls Supabase every ~10 seconds, so changes will appear after a short delay
