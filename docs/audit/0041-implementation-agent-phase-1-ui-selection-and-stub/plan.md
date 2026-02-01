# Plan (0041-implementation-agent-phase-1-ui-selection-and-stub)

## Goal

Allow a user to select "Implementation Agent" from the agent dropdown and see a clear in-app "not implemented yet" status.

## Approach

- Change the dropdown option label from "Implementation Agent (stub)" to "Implementation Agent".
- Add an explicit "Active: {agent}" indicator in the chat header so the selection is visibly confirmed.
- When Implementation Agent is selected, show an on-screen status banner above the transcript explaining:
  - The agent is a stub and not wired to the Cursor API.
  - A short "what to do next" hint (e.g., "Implementation Agent will be enabled in a later ticket").
- Keep the existing stub response when the user sends a message; align its text with the banner message.
- Add CSS for the new banner and active agent indicator.

## Files

- `src/App.tsx`
- `src/index.css`
- `docs/audit/0041-implementation-agent-phase-1-ui-selection-and-stub/*`
