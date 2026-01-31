# Worklog: 0013 - Embrace monorepo: vendor kanban into projects/kanban

## Summary

- Deinited and removed the `projects/kanban` git submodule; converted it to regular tracked files under `projects/kanban/`.
- Removed `.gitmodules` (kanban was the only submodule).
- Removed the `predev` script from `package.json` so `npm run dev` no longer runs submodule sync/init.
- Updated docs: single-source-agents.md (Kanban section), pm-handoff.md, submodule-sync.mdc (monorepo, no submodules).
- Root and `projects/kanban/.gitignore` already include `.env`; no secrets committed.

## Changes

### Git

- `git submodule deinit -f projects/kanban`
- `git rm --cached projects/kanban`
- Deleted `projects/kanban/.git` (file)
- Removed `.git/modules/projects/kanban`
- Deleted `.gitmodules`
- `git add .gitmodules projects/kanban` (staged deletion of .gitmodules and added all kanban files)

### package.json

- Removed `predev` script (`git submodule sync --recursive && git submodule update --init --recursive`)

### docs/process/single-source-agents.md

- Kanban section: "remains a submodule" → "is part of the HAL monorepo (0013): normal directory, not a git submodule"

### docs/process/pm-handoff.md

- "superrepo; kanban logic lives in the kanban submodule" → "monorepo; kanban lives under projects/kanban (vendored, not a submodule)"

### .cursor/rules/submodule-sync.mdc

- Rewritten for monorepo: kanban and hal-agents are normal directories; no submodules in HAL after 0013; no submodule sync needed.
