# Verification: 0001-project-manager-agent-stub (UI-only)

## Prerequisites

1. **This repo (portfolio-2026-hal-agents)**  
   Ensure `src/agents/projectManager.ts` exists and `package.json` has `main` and `exports` for the PM module.

2. **HAL app**  
   - HAL repo with submodule `projects/hal-agents` (this repo) initialized and updated.  
   - From HAL root: `npm install` (so `portfolio-2026-hal-agents` is linked from `projects/hal-agents`).  
   - Optional: start kanban on port 5174 if you want the full HAL UI (`cd projects/kanban && npm run dev -- --port 5174`).  
   - From HAL root: `npm run dev`.  
   - Open http://localhost:5173.

## Verification Checklist

### PM module in this repo

- [ ] File `src/agents/projectManager.ts` exists and exports `respond`.
- [ ] Reply text includes the signature `[PM@hal-agents]`.
- [ ] Sending a message containing “standup” or “status” (e.g. “status?”) yields a standup-style summary (bullets).
- [ ] Sending any other message (e.g. “hello”) yields an acknowledgement and a short checklist (bullets).

### In HAL chat UI

- [ ] Agent dropdown includes **Project Manager**.
- [ ] Select **Project Manager**, type a message (e.g. “hello”), send.
- [ ] The reply in the transcript starts with or clearly contains `[PM@hal-agents]` and is not the old inline stub text (“This is a stub response. Real agent infrastructure…”).
- [ ] Open the in-app **Diagnostics** panel: **PM implementation source** shows `hal-agents` when Project Manager is selected.
- [ ] Send a message containing “standup” or “status”: reply is the standup-style summary with `[PM@hal-agents]`.

### No DevTools required

- [ ] All checks above can be done in the browser; no console or devtools needed.
- [ ] If the PM call fails, **Last agent error** in diagnostics shows an error (and the transcript may show an error message).

## Verification Status

- [ ] All acceptance criteria verified
- [ ] Verified by: _______________
- [ ] Date: _______________
