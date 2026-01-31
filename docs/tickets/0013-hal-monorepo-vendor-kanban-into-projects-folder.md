# Ticket

- **ID**: `0013`
- **Title**: Embrace monorepo: move kanban into `portfolio-2026-hal/projects/kanban` (remove submodule)
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: Build

## Goal (one sentence)

Stop treating kanban as a separate repo/submodule and instead vendor it into the HAL monorepo under `projects/kanban`, so local dev and integration are simpler and more reliable.

## Human-verifiable deliverable (UI-only)

A human can:
- open the HAL repo and see `projects/kanban/` as a normal folder (not a git submodule), and
- run the existing one-command startup (`npm run dev` from HAL root) and see the kanban board load in the left pane (no “localhost refused to connect”).

## Acceptance criteria (UI-only)

- [ ] `projects/kanban/` is no longer a git submodule:
  - [ ] `.gitmodules` no longer references `projects/kanban`
  - [ ] `git submodule status` no longer lists `projects/kanban`
  - [ ] The kanban code lives as regular files tracked by the HAL repo under `projects/kanban/`.
- [ ] `npm run dev` from HAL root still starts HAL + kanban and the kanban iframe loads (no manual start steps required).
- [ ] `npm run dev` does not require `git submodule update` for kanban anymore:
  - [ ] Update/replace `predev` so it no longer fails due to missing kanban submodule (project-1 submodule can remain for now).
- [ ] No unexpected repo drift:
  - [ ] HAL working tree is clean after the change and dev boot (no stray generated config files).
- [ ] Documentation is updated so new contributors understand kanban is now part of the monorepo (brief note is enough).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Prefer minimal disruption: keep ports and dev scripts stable (`5173` HAL, `5174` kanban).
- Do not accidentally commit secrets from kanban `.env` files or local configs.

## Non-goals

- Preserving kanban git history inside HAL (we can accept a “snapshot import”).
- Perfectly deduplicating dependencies across projects (nice-to-have later).
- Migrating `projects/project-1` (PM agents repo) into monorepo in this ticket.

## Implementation notes (optional)

- Expected steps (high-level):
  - Deinit/remove the `projects/kanban` submodule reference from HAL (`.gitmodules`, git metadata).
  - Copy the contents of the current kanban repo into `projects/kanban/` as normal tracked files.
  - Ensure the existing `npm --prefix projects/kanban run dev -- --port 5174 --strictPort` still works.
  - Update `predev` submodule sync/init behavior so it only handles remaining submodules (e.g. `projects/project-1`) or becomes a no-op if none.
  - Update any docs mentioning kanban as a separate repo/submodule.

## Audit artifacts required (implementation agent)

Create `docs/audit/0013-hal-monorepo-vendor-kanban-into-projects-folder/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

