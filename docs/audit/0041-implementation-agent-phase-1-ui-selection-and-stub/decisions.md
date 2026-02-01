# Decisions (0041-implementation-agent-phase-1-ui-selection-and-stub)

## Dropdown label: "Implementation Agent" (no "(stub)")

- **Decision:** Use the clean label "Implementation Agent" in the dropdown; the stub status is shown in the on-screen banner when selected.
- **Why:** The ticket specifies "option labeled **Implementation Agent**" and the stub explanation belongs in the visible status message, not in the dropdown.

## Active agent indicator in header

- **Decision:** Add "Active: {agent label}" in the chat header so humans can confirm the selection took when switching agents.
- **Why:** The ticket requires "visibly changes the conversation's active agent indicator"; the dropdown changes, but an explicit label makes verification unambiguous.

## Banner placement: above transcript when Implementation Agent selected

- **Decision:** Show the stub status banner between the chat header and the transcript, visible whenever Implementation Agent is selected.
- **Why:** The ticket requires an "on-screen message" (not console) visible when the agent is selected; a banner satisfies this without requiring the user to send a message or open Diagnostics.
