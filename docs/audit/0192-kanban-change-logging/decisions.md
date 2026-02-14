# Decisions (0192-kanban-change-logging)

## Storage Location: Ticket Body vs Artifact

- **Decision:** Primary storage in ticket body "Kanban Change Log" section, with artifact as fallback
- **Reason:** Ticket body is immediately visible in ticket UI when viewing ticket details, making it most human-verifiable. Artifact fallback ensures logging still works if body update fails.

## Log Format: Structured Markdown

- **Decision:** Use structured markdown format with explicit fields (timestamp, agent type, ticket ID, from→to column, old→new position, reason)
- **Reason:** Structured format is copy/pasteable, human-readable, and includes all required information for auditability. Markdown format is consistent with other ticket documentation.

## Failure Handling: Do Not Perform Move If Logging Fails

- **Decision:** If logging fails completely (both body update and artifact creation fail), do not perform the move unless it's part of a critical workflow
- **Reason:** Auditability is a core requirement. If we cannot log the change, we should not perform it. Exception for critical workflows (e.g., moving to "Human in the Loop" after QA) ensures workflow doesn't block, but requires follow-up ticket to manually add log entry.

## Examples: Three Concrete Scenarios

- **Decision:** Include three examples: column move, position reorder, and bulk reorder
- **Reason:** Covers all common scenarios agents will encounter. Examples are copy/pasteable templates that agents can adapt.

## Integration with Existing Workflows

- **Decision:** Document integration points with Agent Supabase API Paradigm, Code Citation Requirements, and State Management Change Documentation
- **Reason:** Ensures consistency across all agent workflows and documentation requirements.
