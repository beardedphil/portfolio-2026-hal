# Plan: 0013 - Embrace monorepo: vendor kanban into projects/kanban

## Goal

Stop treating kanban as a git submodule and vendor it into the HAL monorepo under `projects/kanban`, so local dev and integration are simpler and no submodule sync is required.

## Analysis

### Current State

- `.gitmodules` listed `projects/kanban` → `portfolio-2026-basic-kanban`.
- `projects/kanban` was a git submodule (its own `.git` file pointing to `.git/modules/projects/kanban`).
- `predev` ran `git submodule sync --recursive && git submodule update --init --recursive` before `npm run dev`.
- Docs (single-source-agents, submodule-sync, pm-handoff) referred to kanban as a submodule.

### Approach

1. **Deinit and remove submodule reference**: `git submodule deinit -f projects/kanban`, `git rm --cached projects/kanban`, remove `projects/kanban/.git` (file), remove `.git/modules/projects/kanban`.
2. **Remove .gitmodules**: Kanban was the only submodule; delete `.gitmodules`.
3. **Add kanban as regular files**: `git add projects/kanban` so all kanban files are tracked by HAL.
4. **Update predev**: Remove `predev` script so `npm run dev` no longer runs submodule init (no submodules remain).
5. **Docs**: Update single-source-agents.md, submodule-sync.mdc, pm-handoff.md so contributors know kanban is part of the monorepo.
6. **Secrets**: Root and `projects/kanban/.gitignore` already list `.env`; no change needed.

## Implementation Steps

1. Run `git submodule deinit -f projects/kanban`.
2. Run `git rm --cached projects/kanban`.
3. Delete `projects/kanban/.git` (the gitlink file).
4. Remove `.git/modules/projects/kanban`.
5. Delete `.gitmodules`.
6. Run `git add .gitmodules projects/kanban`.
7. In `package.json`, remove the `predev` script.
8. Update `docs/process/single-source-agents.md` (Kanban section).
9. Update `docs/process/pm-handoff.md` (superrepo → monorepo, kanban vendored).
10. Rewrite `.cursor/rules/submodule-sync.mdc` for monorepo (no submodules).
11. Create audit artifacts: plan, worklog, changed-files, decisions, verification, pm-review.
