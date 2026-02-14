# Instructions Used for ticket <ticket-id>

## Basic Instructions (Always Loaded)

List all basic instructions that were automatically loaded:

- `agent-instructions` - Entry point explaining HAL API endpoints
- `conversation-protocol` - Conversation protocol rules
- `agent-supabase-api-paradigm` - How to send tool calls to HAL API
- `agent-runs-terminal-commands` - Agents run terminal commands themselves
- `no-edits-on-main` - No edits allowed on main branch

## Situational Instructions (Requested On-Demand)

List any situational instructions that were requested via `get_instruction_set` tool:

- `auditability-and-traceability` - Requested when checking existing artifacts
- `done-means-pushed` - Requested when preparing completion checklist
- (Add more as needed)

## Instruction Usage Summary

- **Total instructions loaded:** X (Y basic + Z situational)
- **Instructions used appropriately:** Yes/No
- **Any instructions that should have been requested but weren't:** (if applicable)
