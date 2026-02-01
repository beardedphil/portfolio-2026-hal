# PM Review: 0043 - Abstract shared "agent runner" logic for reuse by Implementation Agent

## Status: Pending Review

## Implementation Summary

Refactored Project Manager agent execution into a reusable runner abstraction:

- **hal-agents**: New `runner.ts` with `AgentRunner` interface, `SHARED_RUNNER_LABEL = 'v2 (shared)'`, and `getSharedRunner()` that wraps `runPmAgent`. Re-exports `summarizeForContext`.
- **vite**: PM respond endpoint now loads `runner.js`, calls `runner.run(message, config)`, and includes `agentRunner: runner.label` in the response.
- **App**: Diagnostics panel shows a new row "Agent runner:" with value "v2 (shared)" (or "—" before first request) when Project Manager is selected.

PM behavior is unchanged; the same code path runs via the shared runner.

## Files Changed

1. `projects/hal-agents/src/agents/runner.ts` (new)
2. `vite.config.ts` – PM endpoint uses runner, response includes agentRunner
3. `src/App.tsx` – types, state, and Diagnostics row for Agent runner

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Project Manager still produces responses in chat UI | Implemented (same runPmAgent via runner.run) |
| In-app diagnostics shows visible indicator that shared runner is active | Implemented ("Agent runner: v2 (shared)") |
| No new buttons/toggles; verify via normal PM + diagnostics line | Implemented |

## Verification

See `verification.md`. Human tester should:
1. Send a message to Project Manager and confirm a reply appears
2. Open Diagnostics and confirm "Agent runner: v2 (shared)" is visible when PM is selected
3. Confirm no new UI controls were added

## Notes for PM

- Implementation Agent is not wired to the runner in this ticket; only structural plumbing and PM path refactor
- check-unassigned endpoint still imports projectManager.js directly (unchanged)
- Runner interface is ready for future "Cursor App" vs "Cursor API" backends
