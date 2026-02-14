# Plan (0192-kanban-change-logging)

## Goal

Create a documented agent workflow that requires agents to log every Kanban move and reorder they perform, making all Kanban changes auditable and human-verifiable.

## Approach

1. **Create workflow rule document** in `.cursor/rules/kanban-change-logging.mdc`
   - Define mandatory logging requirement for all Kanban changes
   - Specify exact log format with all required fields (timestamp, agent type, ticket ID, from→to column, old→new position, reason)
   - Define where log is stored (ticket body section as primary, artifact as fallback)
   - Define fallback behavior when logging fails
   - Include concrete examples of correctly logged moves

2. **Document storage location** - Log entries stored in ticket body "Kanban Change Log" section (visible in ticket UI) or as artifact if body update fails

3. **Define failure handling** - If logging fails completely, document in worklog and create follow-up ticket

4. **Include verification steps** - Human can verify by opening ticket and viewing "Kanban Change Log" section

## File Touchpoints

- `.cursor/rules/kanban-change-logging.mdc` - New workflow rule document (created)
- `docs/audit/0192-kanban-change-logging/` - Audit artifacts folder (created)

## Acceptance Criteria Mapping

- ✅ Clear rule/process step exists: Documented in `.cursor/rules/kanban-change-logging.mdc` under "When Logging Is Required"
- ✅ Log format specified: Documented in "Log Format (Copy/Paste Template)" section with exact format
- ✅ Workflow states where log is stored: Documented in "Where to Store the Log" section (ticket body primary, artifact fallback)
- ✅ Workflow defines what to do when logging fails: Documented in "What to Do When Logging Fails Completely" section
- ✅ Documentation includes concrete example: Three examples provided (column move, position reorder, bulk reorder)
