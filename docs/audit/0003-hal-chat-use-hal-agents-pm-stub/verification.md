# Verification: 0003-hal-chat-use-hal-agents-pm-stub (UI-only)

## Prerequisites

1. From HAL repo root:
   ```bash
   npm install
   npm run dev
   ```
2. (Optional) Start kanban for full UI: `cd projects/kanban && npm run dev -- --port 5174`
3. Open http://localhost:5173

## Verification Checklist

### PM from hal-agents

- [ ] Agent dropdown includes **Project Manager** and **Implementation Agent (stub)**.
- [ ] Select **Project Manager**, type any message (e.g. "What should I do next?"), click Send.
- [ ] Reply in transcript clearly indicates hal-agents, e.g. starts with `[PM@hal-agents]` and is different from the old inline stub text ("This is a stub response. Real agent infrastructure is not implemented yet.").
- [ ] Select **Implementation Agent (stub)**, send a message: reply is the existing inline stub (unchanged).

### Standup-style PM reply

- [ ] With **Project Manager** selected, send a message containing "standup" or "status".
- [ ] Reply includes `[PM@hal-agents]` and a short standup-style summary (e.g. backlog, blockers, prioritization).

### Diagnostics

- [ ] Expand **Diagnostics** at the bottom of the chat column.
- [ ] With **Project Manager** selected: **PM implementation source** shows `hal-agents`.
- [ ] With **Implementation Agent (stub)** selected: **PM implementation source** shows `inline`.
- [ ] **Selected agent** reflects current dropdown value.
- [ ] **Last agent error** shows "none" when PM replies successfully; if PM threw (e.g. simulate by breaking the module), the error message appears there and in the transcript.

### No regressions

- [ ] Standup (all agents) button still produces placeholder updates from both agents.
- [ ] Kanban column (if running) still loads and shows board.

## Verification Status

- [ ] All acceptance criteria verified
- [ ] Verified by: _______________
- [ ] Date: _______________
