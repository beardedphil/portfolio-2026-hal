# Ticket

- **ID**: `0004`
- **Title**: Fix PM agent runtime error (`stepCountIs`) and sync HAL submodule to real repo
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: Build

## Goal (one sentence)

Make the Project Manager agent load and respond in HAL by fixing the runtime import error in `portfolio-2026-hal-agents`, then update HAL’s `projects/hal-agents` submodule pointer to the real repo’s latest `main`.

## Human-verifiable deliverable (UI-only)

A human can run `npm run dev` in HAL, select **Agent: Project Manager**, send `ping`, and see a non-stub PM reply (and Diagnostics shows an outbound request JSON instead of the “not implemented” stub).

## Acceptance criteria (UI-only)

- [ ] In HAL, sending a PM message no longer yields the fallback stub `"[PM Agent] ... not yet implemented"` and instead returns a real PM response.
- [ ] HAL no longer logs an SSR import error about `ai` / `stepCountIs` when evaluating `@hal-agents/agents/projectManager`.
- [ ] The PM agent’s tool loop limit is implemented using the supported AI SDK option (e.g. `maxSteps`) so it is compatible with the installed `ai` package version.
- [ ] HAL’s `projects/hal-agents` submodule is updated to the latest commit from the real `portfolio-2026-hal-agents` repo and pushed (so HAL matches source-of-truth).
- [ ] No new tickets are introduced in the HAL submodule copy of `projects/hal-agents` as part of this work.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- The real repo `D:/Cursor Projects/portfolio-2026-hal-agents` is the source of truth; HAL’s `projects/hal-agents` must track it via submodule updates.
- Preserve the current behavior of showing prompt/debug info in HAL Diagnostics (do not remove).

## Non-goals

- Adding write-capable tools (file edits, git commit/push) to the PM agent.
- Expanding kanban tooling beyond current scope.

## Implementation notes (optional)

- Current failure observed in HAL dev server logs:
  - “The requested module `ai` does not provide an export named `stepCountIs`”.
- Fix likely needed in `src/agents/projectManager.ts`:
  - Remove `stepCountIs` import.
  - Replace `stopWhen: stepCountIs(...)` with `maxSteps: <N>` (AI SDK supports `maxSteps`).
- After merging to `portfolio-2026-hal-agents/main`, update the HAL superrepo submodule pointer for `projects/hal-agents` to that commit and push HAL `main` (or follow HAL’s submodule update process).

## Audit artifacts required (implementation agent)

Create `docs/audit/0004-fix-pm-agent-stepcountis-and-sync-hal-submodule/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

