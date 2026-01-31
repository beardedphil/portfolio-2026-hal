# Verification: 0002-hal-app-shell-kanban-left-chat-right

## Prerequisites

1. Navigate to kanban project and start dev server:
   ```bash
   cd projects/kanban
   npm install  # if not already done
   npm run dev -- --port 5174
   ```

2. In a separate terminal, start HAL:
   ```bash
   # From portfolio-2026-hal root
   npm install
   npm run dev
   ```

3. Open browser to http://localhost:5173

## Verification Checklist

### Layout (AC: two-column layout)
- [ ] App shows two-column layout
- [ ] Left column contains kanban board region
- [ ] Right column contains chat region

### Kanban Board (AC: renders Project 0 board)
- [ ] Kanban header shows "Kanban Board"
- [ ] Status indicator shows "Connected" when kanban app is running
- [ ] Kanban board columns are visible (Unassigned, To-do, Doing, Done)
- [ ] Kanban board is interactive (can drag cards, etc.)

### Chat UI (AC: agent selector, transcript, composer, standup)
- [ ] Agent dropdown is visible with options:
  - Project Manager
  - Implementation Agent (stub)
- [ ] Message transcript area is visible
- [ ] Message input field is present
- [ ] "Send" button is present
- [ ] "Standup (all agents)" button is present
- [ ] Typing a message and pressing Enter or clicking Send adds it to transcript
- [ ] Clicking "Standup (all agents)" produces placeholder updates from both agents

### Diagnostics (AC: in-app diagnostics panel)
- [ ] "Diagnostics" toggle button is visible at bottom of chat column
- [ ] Clicking toggle expands diagnostics panel
- [ ] Panel shows:
  - Kanban render mode: "iframe (fallback)"
  - Kanban URL: "http://localhost:5174"
  - Kanban loaded: true/false
  - Selected agent: current selection
  - Last error: none (or error message if kanban not running)

### No DevTools Required
- [ ] All above verifications possible in browser without console/devtools
- [ ] Errors are shown in diagnostics panel, not just console

## Screenshots

(Add screenshots during verification)

## Verification Status

- [ ] All acceptance criteria verified
- [ ] Verified by: _______________
- [ ] Date: _______________
