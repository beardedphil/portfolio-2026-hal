# Ticket

- **ID**: `0008`
- **Title**: HAL dev: sync/init submodules automatically before `npm run dev`
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Ensure HAL’s `npm run dev` automatically initializes and synchronizes required git submodules before starting dev servers, so the workspace reliably launches from a fresh clone.

## Human-verifiable deliverable (UI-only)

A human can run `npm run dev` and then open HAL in the browser and see the main kanban section load (no “localhost refused to connect”), without manually running any git submodule commands first.

## Acceptance criteria (UI-only)

- [ ] From a fresh clone state (or any state where submodules are not initialized), running **only** `npm run dev` results in a working HAL UI where the kanban area loads (iframe content appears).
- [ ] If submodules cannot be initialized (e.g. git missing, network unavailable, or permission denied), the failure mode is clear and immediate (dev startup fails with a clear message rather than half-starting and leaving the iframe broken).
- [ ] The approach does **not** silently modify tracked state beyond checking out the submodule commits pinned by the superrepo (avoid surprising “dirty working tree” after starting dev).

## Constraints

- Keep this task as small as possible.
- Must work on Windows.
- Avoid relying on additional global tooling beyond git + npm.
- Prefer a solution that runs automatically as part of `npm run dev` (e.g. an npm `predev` hook or equivalent).

## Non-goals

- Automatically pulling *newer* submodule commits from remotes (“always latest remote”) if doing so would modify the superrepo state or require committing/pushing updated submodule pointers.
- Installing submodule dependencies automatically (nice-to-have; can be a follow-up if needed).

## Implementation notes (optional)

- Suggested approach:
  - Add `predev` script that runs something like:
    - `git submodule sync --recursive`
    - `git submodule update --init --recursive`
  - Keep it to pinned commits so the dev command does not unexpectedly change what the repo points at.
  - If the command fails, exit non-zero so `npm run dev` fails immediately.

## Audit artifacts required (implementation agent)

Create `docs/audit/0008-hal-dev-predev-sync-submodules/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

