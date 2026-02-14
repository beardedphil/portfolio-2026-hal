# Instructions Used (0192-kanban-change-logging)

## Rules and Instructions Referenced

### Workspace Rules (`.cursor/rules/`)

1. **`.cursor/rules/agent-instructions.mdc`**
   - Loaded basic instructions from Supabase before starting work
   - Instructions include mandatory workflows, artifact requirements, and procedures

2. **`.cursor/rules/code-citation-requirements.mdc`**
   - When referencing code locations, must cite specific file paths and line numbers
   - Applied when documenting integration points with existing workflows

3. **`.cursor/rules/state-management-change-documentation.mdc`**
   - State management changes must be documented in PM Review artifact
   - This ticket does not involve state management changes (documentation only)

4. **`.cursor/rules/code-location-citations.mdc`**
   - Code location citations must be human-verifiable
   - Applied when documenting where workflow rule is stored (`.cursor/rules/kanban-change-logging.mdc`)

### Supabase Instructions (Loaded via HAL API)

1. **Agent Supabase API Paradigm**
   - All agents must use HAL API endpoints for ticket operations
   - Workflow document references `/api/tickets/update` and `/api/artifacts/insert-implementation` endpoints

2. **Agent Runs Terminal Commands**
   - Agents must run terminal commands themselves
   - Applied when creating audit artifacts folder

### Templates

1. **`docs/templates/ticket.template.md`**
   - Ticket structure and format
   - Not directly used (this is a process documentation ticket)

2. **`docs/templates/pm-review.template.md`**
   - PM review format and structure
   - Used when creating `pm-review.md` artifact

### Process Documentation

1. **`docs/process/ticket-verification-rules.md`**
   - Definition of Done requirements
   - All required artifacts must be created

2. **`docs/process/hal-tool-call-contract.mdc`**
   - HAL API endpoint documentation
   - Referenced when documenting how agents should store log entries

## Integration Points

The workflow document integrates with:

- **Agent Supabase API Paradigm**: Uses HAL API endpoints for ticket body updates and artifact creation
- **Code Citation Requirements**: When agents document moves in worklogs, they must cite specific code locations
- **State Management Change Documentation**: Kanban moves are state changes that must be documented (this workflow ensures they are logged)
