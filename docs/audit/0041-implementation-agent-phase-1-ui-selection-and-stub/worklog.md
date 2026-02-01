# Worklog (0041-implementation-agent-phase-1-ui-selection-and-stub)

- Changed CHAT_OPTIONS label from "Implementation Agent (stub)" to "Implementation Agent".
- Added "Active: {label}" indicator in the chat header so the selected agent is visibly confirmed.
- Added agent-stub-banner that appears when Implementation Agent is selected, showing:
  - "Implementation Agent — not yet connected"
  - "This agent is currently a stub and is not wired to the Cursor API. Implementation Agent will be enabled in a later ticket."
- Updated the stub response message when sending to Implementation Agent to align with the banner (mention Cursor API, include hint).
- Updated Standup placeholder message from "Implementation Agent (stub)" to "Implementation Agent".
- Added CSS for `.active-agent-label`, `.agent-stub-banner`, `.agent-stub-title`, `.agent-stub-hint`.
- Verified build passes (`npm run build`).
