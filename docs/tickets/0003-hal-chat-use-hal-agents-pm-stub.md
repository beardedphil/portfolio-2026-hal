# Ticket

- **ID**: `0003`
- **Title**: HAL chat: use `portfolio-2026-hal-agents` Project Manager stub for replies
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Replace HAL’s inline PM chat stub with a call into the `portfolio-2026-hal-agents` Project Manager module so the response comes from the agents repo.

## Human-verifiable deliverable (UI-only)

In the HAL app chat UI, selecting **Project Manager** and sending a message produces a reply that clearly indicates it came from **hal-agents** (e.g. `[PM@hal-agents] ...`), and diagnostics shows the PM implementation source.

## Acceptance criteria (UI-only)

- [ ] HAL uses the `projects/project-1` submodule (repo: `portfolio-2026-hal-agents`) as the source of PM agent logic.
- [ ] When the user sends a message with agent = **Project Manager**, HAL calls the PM module function from hal-agents and displays the returned `replyText`.
- [ ] The reply is visibly different from the old inline stub and includes a clear signature like `[PM@hal-agents]`.
- [ ] The “Implementation Agent (stub)” option can remain as the existing inline stub (out of scope to move it).
- [ ] HAL in-app diagnostics shows:
  - selected agent
  - PM implementation source = `hal-agents` (not “inline”)
  - last agent error (if any)

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- No real LLM calls yet; deterministic responses only.
- Keep the integration minimal (direct import from submodule is fine).

## Non-goals

- Building an HTTP agent server
- Standup aggregation via hal-agents (can stay stubbed)

## Implementation notes (optional)

- If TypeScript/Vite cannot import TS directly from the submodule due to module resolution, create a tiny wrapper module inside HAL that imports from the submodule path, and document any Vite/TS config changes.

## Audit artifacts required (implementation agent)

Create `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
