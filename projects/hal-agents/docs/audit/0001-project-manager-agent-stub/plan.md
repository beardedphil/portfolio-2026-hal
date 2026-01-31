# Implementation Plan: 0001-project-manager-agent-stub

## Goal

Create a minimal Project Manager (PM) agent module in this repo (portfolio-2026-hal-agents) that produces a deterministic “dummy” response to a user message, with no server or network calls.

## Approach

### 1. Agent Module

- Add `src/agents/projectManager.ts` exporting a single function: `respond({ message, context }) -> { replyText, meta }`.
- Use minimal types: `RespondInput`, `RespondOutput`, `RespondMeta`, `RespondContext` so the API can evolve.
- Response must include a clear signature `[PM@hal-agents]` so the chat transcript makes the source obvious.

### 2. Two Response Cases

- **Standup/status**: If the message (case-insensitive) contains “standup” or “status”, return a short standup-style summary (bullet list).
- **Default**: For any other text, return an acknowledgement plus a small checklist prompt (bullets with placeholders).

### 3. Consumability

- Add `tsconfig.json` so the repo is valid TypeScript.
- Add `main`, `types`, and `exports` in `package.json` so HAL (or any consumer) can import the module from this package (e.g. `import { respond } from 'portfolio-2026-hal-agents'`).
- No build step required in this slice; consumer (e.g. Vite) can compile the TS.

### 4. Verification

- Human-verifiable via HAL: when the user selects **Project Manager** and sends a message in the HAL app, the reply must clearly show it came from the hal-agents PM module (signature in reply text; diagnostics can show “PM implementation source: hal-agents”). HAL integration is done in the HAL repo (ticket 0003 or as part of verification for this ticket).

## Tasks

1. Create `src/agents/projectManager.ts` with `respond()`, types, and two branches (standup vs default).
2. Add `tsconfig.json` for strict TS.
3. Update `package.json` with `main`, `types`, `exports` for the PM entry point.
4. Create audit artifacts: plan, worklog, changed-files, decisions, verification.

## Success Criteria

- This repo contains `src/agents/projectManager.ts` exporting `respond()` with signature `[PM@hal-agents]`.
- Standup/status messages get standup-style summary; other messages get acknowledgement + checklist.
- Module is importable by HAL (no server). In HAL chat, PM replies show hal-agents signature and diagnostics show PM source.
