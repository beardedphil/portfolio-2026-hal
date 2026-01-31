# Verification (0004-hal-chat-per-agent-history-and-standup-option)

All checks are done in the browser (no devtools/console required). Starting the dev server is acceptable as setup.

## Prerequisites

1. From HAL repo root:
   - `npm install`
   - `npm run dev`
2. Open `http://localhost:5173`.

## Steps

### 1) Per-agent history switches with dropdown

- **Action:** Select **Project Manager** and send `hello`.
- **Pass:** You see a PM reply (contains `[PM@hal-agents]`).
- **Action:** Switch dropdown to **Implementation Agent (stub)**.
- **Pass:** The transcript is different (does not show the PM conversation).
- **Action:** Send `hello`.
- **Pass:** You see the inline stub response.
- **Action:** Switch back to **Project Manager**.
- **Pass:** The earlier PM messages are still present.

### 2) Standup is a dropdown option and has its own shared transcript

- **Action:** Switch dropdown to **Standup (all agents)**.
- **Pass:** Transcript is separate from PM/Implementation transcripts.
- **Action:** Type any message and click Send.
- **Pass:** A standup sequence appears in the standup transcript (system start/end + messages from multiple agents).

### 3) No standup button

- **Check:** There is no “Standup (all agents)” button in the composer area.

### 4) Diagnostics shows chat target

- **Action:** Expand **Diagnostics**.
- **Pass:** “Chat target” matches your dropdown selection.

