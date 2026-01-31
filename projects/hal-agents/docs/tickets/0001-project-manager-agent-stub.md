# Ticket

- **ID**: `0001`
- **Title**: Project Manager agent v0 (stub) — deterministic reply function
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Create a minimal Project Manager (PM) agent module in `portfolio-2026-hal-agents` that can produce a deterministic “dummy” response to a user message.

## Human-verifiable deliverable (UI-only)

In the HAL app chat UI, when the user selects **Project Manager** and sends a message, the response clearly indicates it came from the **hal-agents PM module** (not the inline HAL stub).

## Acceptance criteria (UI-only)

- [ ] This repo contains a minimal agent module at `src/agents/projectManager.ts` exporting a function:
  - `respond({ message, context }) -> { replyText, meta }`
  - Response is deterministic (no network calls) and includes a clear signature like `[PM@hal-agents]`.
- [ ] The function supports at least two cases:
  - “standup” / “status” message → returns a short standup-style summary
  - any other text → returns an acknowledgement + a small checklist prompt
- [ ] The module is designed to be called by HAL (no server required in this slice).
- [ ] In-app diagnostics in HAL (or the chat transcript itself) makes it obvious the PM response came from `portfolio-2026-hal-agents`.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Do not add real LLM or network calls yet.
- Add minimal types/interfaces so the API can evolve.

## Non-goals

- HTTP server / REST API
- Long-term conversation memory
- Tool-use permissions and sandboxing

## Implementation notes (optional)

- Keep this repo framework-agnostic (pure TypeScript module).
- HAL will import/call it in a separate ticket in the HAL repo.

## Audit artifacts required (implementation agent)

Create `docs/audit/0001-project-manager-agent-stub/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only, via HAL)
