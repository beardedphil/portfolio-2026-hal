# Changed files: 0013 - Embrace monorepo: vendor kanban into projects/kanban

## Deleted

- `.gitmodules` — no submodules remain

## Modified

- `package.json` — removed `predev` script
- `docs/process/single-source-agents.md` — Kanban section: now part of monorepo, not submodule
- `docs/process/pm-handoff.md` — superrepo → monorepo; kanban vendored
- `.cursor/rules/submodule-sync.mdc` — rewritten for monorepo (no submodules)

## Added (tracked by HAL)

- `projects/kanban/` — all files formerly in the kanban submodule are now regular tracked files (same content; no longer a git submodule reference)

## Git metadata

- Submodule `projects/kanban` removed from index and from `.git/modules/projects/kanban`
- `projects/kanban/.git` (gitlink file) removed so the directory is a normal folder
