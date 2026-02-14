# Instructions Used for ticket <ticket-id>

## Stage 1: Global Bootstrap (All Agents)

List the global bootstrap instructions loaded first for all agents:

- `agent-instructions` - Entry point with HAL loading flow
- (Add any other all-agent bootstrap instructions loaded from Supabase)

## Stage 2: Full Agent Instruction Set

Record when the full instruction set for the active agent was requested:

- `get_instruction_set({ agentType: "<agent-type>" })` - Requested full core set for agent
- Loaded basic/core instructions: `<list topic IDs>`
- Additional available topics returned: `<list topic IDs>`

## Stage 3: Topic-Specific Loads (On-Demand)

List topic-specific requests made after the full agent instruction set:

- `get_instruction_set({ topicId: "auditability-and-traceability" })` - Reason: artifact verification workflow
- `get_instruction_set({ topicId: "done-means-pushed" })` - Reason: completion workflow
- (Add more as needed)

## Instruction Usage Summary

- **Total instructions loaded:** X (Y basic + Z situational)
- **Loading order followed:** Yes/No (Global bootstrap -> Agent set -> Topic-specific)
- **Any missing instruction requests:** (if applicable)
