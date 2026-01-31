# PM review: 0013 - Embrace monorepo: vendor kanban into projects/kanban

## Summary

- Kanban is no longer a git submodule; it lives under `projects/kanban` as regular tracked files.
- `predev` was removed; `npm run dev` starts HAL and kanban without any submodule init.
- Docs updated so contributors understand the monorepo layout.

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**

- Standard conversion (deinit, rm --cached, remove .git link, add files) was followed.
- Dev script unchanged except removal of predev; ports and commands stable.
- `.env` already in .gitignore; no secrets committed.

## What to verify (UI-only)

- `projects/kanban` is a normal directory; `git submodule status` is empty.
- Run `npm run dev` from HAL root; kanban board loads in the left pane.
- Docs say kanban is part of the monorepo.

## Potential failures (ranked)

1. **Kanban dev fails (missing node_modules)** — `npm run dev:kanban` may fail if `projects/kanban/node_modules` was not installed. User runs `npm install` in `projects/kanban` once. Same as before for a fresh clone of the submodule; no change in behavior.
2. **Stale .git or modules left behind** — If `projects/kanban/.git` or `.git/modules/projects/kanban` remained, the folder might still behave like a submodule. Verify with `git submodule status` and absence of `.git` file in `projects/kanban`.
3. **predev removal breaks something** — If another process expected predev to run, it would no longer run. HAL has no other submodules; predev was only for kanban init. No impact.

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review
- **Traceability**: Verification steps map to acceptance criteria (normal folder, no submodule, dev works, docs updated).

## Follow-ups (optional)

- Optional: add a brief note in root README that kanban and hal-agents are in-repo (monorepo).
- Optional: one-time `npm install` in `projects/kanban` from root script for fresh clones (non-goal in 0013).
