# Decisions: Agent-artifacts system (0082)

## Design decisions

### Database schema
- **Decision**: Store artifacts in separate `agent_artifacts` table with foreign key to tickets
- **Rationale**: Keeps artifacts separate from ticket body, allows multiple artifacts per ticket, enables efficient querying
- **Cascade delete**: Artifacts are deleted when ticket is deleted (via foreign key constraint)

### Agent type enum
- **Decision**: Support four agent types: 'implementation', 'qa', 'human-in-the-loop', 'other'
- **Rationale**: Covers current agent types and provides extensibility for future agents
- **Display names**: Use helper function to map agent types to human-readable names

### Artifact grouping
- **Decision**: Group artifacts by agent type and show only the most recent per type
- **Rationale**: Prevents UI clutter while still showing all agent types that have completed work
- **Future**: Could add "Show all" option to view historical artifacts if needed

### Artifact body content
- **Decision**: Implementation Agent includes summary, PR URL, and worklog; QA Agent uses qa-report.md content
- **Rationale**: Provides comprehensive information while keeping artifacts readable
- **Fallback**: If worklog or qa-report.md not available, use summary only

### UI placement
- **Decision**: Place artifacts section below ticket body in ticket detail modal
- **Rationale**: Keeps artifacts visible but doesn't interfere with primary ticket content
- **Empty state**: Show helpful message when no artifacts exist

### Report viewer
- **Decision**: Use separate modal for viewing artifact reports (reuses ticket detail modal pattern)
- **Rationale**: Provides focused view of report content, maintains consistency with existing UI patterns
- **Navigation**: Close via X button, Escape key, or backdrop click

### Error handling
- **Decision**: Log artifact insertion errors to console but don't block agent completion
- **Rationale**: Artifact insertion is supplementary; failures shouldn't prevent agents from completing work
- **User impact**: If insertion fails, agents still complete but artifacts won't appear in UI
