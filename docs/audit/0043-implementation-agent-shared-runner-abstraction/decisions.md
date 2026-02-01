# Decisions: 0043 - Abstract shared "agent runner" logic for reuse by Implementation Agent

## D1: Runner lives in hal-agents, not in the app

**Decision**: The `AgentRunner` interface and `getSharedRunner()` live in `projects/hal-agents/src/agents/runner.ts`.

**Rationale**: The ticket targets "the Project Manager agent and its tool wiring" in hal-agents. The runner is the execution layer for agents; keeping it in hal-agents allows the Implementation Agent to use the same abstraction from the same package. The app (and vite) only consume the runner.

## D2: Single entry point for the PM endpoint (runner.js)

**Decision**: The vite PM respond middleware imports only `runner.js`, which exports `getSharedRunner` and `summarizeForContext`.

**Rationale**: Reduces coupling: the app does not need to know about projectManager.js. Runner re-exports what the endpoint needs (summarizeForContext). Future agents (e.g. Implementation Agent) can be exposed via the same or another runner from the same module.

## D3: Label "v2 (shared)" for human verification

**Decision**: Use the literal label `v2 (shared)` so a human can confirm in Diagnostics that the shared runner/abstraction is active.

**Rationale**: Ticket deliverable: "Diagnostics UI includes a visible line indicating which 'runner' implementation is being used (e.g. 'Agent runner: v2 (shared)')". A fixed, recognizable string avoids confusion and matches the ticket example.

## D4: Agent runner row only when Project Manager is selected

**Decision**: Show the "Agent runner:" row in Diagnostics only when the selected chat target is "project-manager".

**Rationale**: The runner is currently only used for PM. Implementation Agent does not use it yet; showing "—" or a stale value for other agents would be misleading. When Implementation Agent is wired to a runner, we can extend the UI (e.g. show runner per agent or a single line when relevant).

## D5: check-unassigned still uses projectManager.js directly

**Decision**: The check-unassigned endpoint continues to import `projectManager.js` for `checkUnassignedTickets`.

**Rationale**: The runner abstraction is for "run agent (message → reply)". checkUnassignedTickets is a separate helper, not an agent run. Moving it into the runner would broaden scope without benefit for this ticket.
