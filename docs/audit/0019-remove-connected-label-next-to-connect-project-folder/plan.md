# Plan: 0019 - Remove redundant "Connected" label next to Connect Project Folder

## Goal

Remove the redundant "Connected" label next to the **Connect Project Folder** control to reduce UI clutter while keeping connection state clear elsewhere in the UI.

## Analysis

### Current State

- In `src/App.tsx`, the kanban header has:
  - When not connected: "Connect Project Folder" button
  - When connected: project name + "Disconnect" button
  - A `<span className="kanban-status">` that shows "Loading..." or "Connected" (based on `kanbanLoaded`)

When a project folder is connected, the user already sees the project name and Disconnect button. The "Connected" text in `kanban-status` is redundant.

### Required Change

- When `connectedProject` is set, do **not** render the `kanban-status` span (so the redundant "Connected" label is not shown).
- When not connected, keep rendering the span as before ("Loading..." / "Connected" for iframe load state), so the UI is unchanged when not connected.
- Connection state remains clear via:
  - Diagnostics "Connected project:" row
  - Project name + Disconnect in the header when connected

## Implementation

1. **Single change in `src/App.tsx`**: Wrap the existing `kanban-status` span in a condition `{!connectedProject && (...)}` so it only renders when no project is connected.

## Files to Change

- `src/App.tsx` (one conditional wrapper)

## Non-goals (per ticket)

- No redesign of connect/disconnect UI
- No changes to project connection logic or persistence
