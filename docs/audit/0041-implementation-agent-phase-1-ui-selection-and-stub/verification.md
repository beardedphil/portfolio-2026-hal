# Verification (0041-implementation-agent-phase-1-ui-selection-and-stub)

All checks are done in the browser (no devtools/console required). Starting the dev server is acceptable as setup.

## Prerequisites

1. From HAL repo root:
   - `npm install`
   - `npm run dev`
2. Open `http://localhost:5173`.
3. Connect a project folder (e.g., select a folder with `.env` containing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) so the agent dropdown is enabled.

## Steps

### 1) Dropdown shows Implementation Agent

- **Action:** Open the agent dropdown.
- **Pass:** The dropdown includes an option labeled **Implementation Agent** alongside Project Manager and Standup (all agents).

### 2) Selecting Implementation Agent visibly changes active agent indicator

- **Action:** Select **Implementation Agent** from the dropdown.
- **Pass:** The "Active: Implementation Agent" label in the header updates to match the selection.
- **Pass:** The transcript switches to the Implementation Agent conversation (separate from Project Manager).

### 3) On-screen stub status message when Implementation Agent selected

- **Action:** With **Implementation Agent** selected, look at the chat area.
- **Pass:** A visible banner appears above the transcript stating the agent is a stub and is not wired to the Cursor API.
- **Pass:** The message includes a "what to do next" hint (e.g., "Implementation Agent will be enabled in a later ticket").
- **Pass:** No terminal commands are referenced in the message.

### 4) Stub response when sending a message (deterministic)

- **Action:** With **Implementation Agent** selected, type any message and click Send.
- **Pass:** A stub reply appears in the transcript with consistent text about the agent not being wired to the Cursor API and being enabled in a later ticket.
