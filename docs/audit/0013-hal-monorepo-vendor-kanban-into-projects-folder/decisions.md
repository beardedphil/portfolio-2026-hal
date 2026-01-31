# Decisions: 0013 - Embrace monorepo: vendor kanban into projects/kanban

## Convert submodule to regular files (no history preservation)

We deinited the submodule, removed it from the index, deleted the `.git` gitlink in `projects/kanban`, removed `.git/modules/projects/kanban`, and added `projects/kanban` as normal tracked files. Git history from the original kanban repo is not preserved in HAL (ticket allows "snapshot import").

## Remove predev entirely

Kanban was the only submodule. After vendoring, there are no submodules, so the `predev` script that ran `git submodule sync --recursive && git submodule update --init --recursive` was removed. `npm run dev` now runs only `dev` (concurrently HAL + kanban). No submodule init step; one-command startup unchanged from a user perspective.

## Delete .gitmodules

`.gitmodules` only referenced `projects/kanban`. After removing that submodule, the file was deleted. If HAL adds submodules later (e.g. project-1), a new `.gitmodules` can be added.

## Docs: monorepo, not superrepo

Documentation now describes HAL as a monorepo with kanban and hal-agents as normal directories. Submodule-sync rule was rewritten so it no longer instructs updating submodule pointers; it explains that there are no submodules and that kanban is vendored.

## .env and secrets

Root `.gitignore` and `projects/kanban/.gitignore` already list `.env`. No change needed; kanban `.env` is not committed.
