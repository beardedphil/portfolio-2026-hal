# Verification (0007-hal-dev-script-start-kanban-and-hal)

All checks are done in the browser and terminal (UI-only where possible).

## Prerequisites

1. From HAL repo root:
   - Ensure kanban submodule is initialized: `git submodule update --init` (if needed)
   - `npm install`
   - `npm run dev`
2. Open `http://localhost:5173` in a browser.

## Steps

### 1) Single command starts both services

- **Action:** Run **only** `npm run dev` from HAL repo root. No other dev servers started manually.
- **Pass:** Terminal shows two labeled processes (hal, kanban) with output from both.
- **Pass:** HAL UI loads at http://localhost:5173; kanban iframe loads (no "localhost refused to connect").

### 2) Kanban board loads

- **Action:** After `npm run dev` is running, open http://localhost:5173.
- **Pass:** Left column shows the Kanban board (iframe content loads).
- **Pass:** Right column shows the Chat UI and is usable.

### 3) Port conflict fails clearly

- **Setup:** Start another process on port 5173 or 5174 (e.g. another `vite` on that port).
- **Action:** Run `npm run dev`.
- **Pass:** The dev process fails with a clear message (e.g. port already in use), rather than silently switching to a different port.

### 4) Loading hint updated

- **Action:** If kanban fails to load (e.g. stop kanban process only), the loading overlay appears.
- **Pass:** The hint says to run `npm run dev` from the repo root (not "cd projects/kanban && npm run dev").

### 5) No secrets in client

- **Check:** No new secrets or API keys introduced in the client bundle. This change only affects dev scripts and config.
