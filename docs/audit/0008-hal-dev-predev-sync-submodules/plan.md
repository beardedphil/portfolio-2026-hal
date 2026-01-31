# Plan (0008-hal-dev-predev-sync-submodules)

## Goal

Ensure HAL's `npm run dev` automatically initializes and synchronizes required git submodules before starting dev servers, so the workspace reliably launches from a fresh clone without manually running git submodule commands.

## Approach

- Add an npm `predev` script that runs before `dev` (npm lifecycle). The script will:
  1. `git submodule sync --recursive` — sync submodule URLs/config from .gitmodules.
  2. `git submodule update --init --recursive` — initialize and checkout submodules at the commits pinned by the superrepo.
- Use `&&` so if either command fails, the script exits non-zero and `npm run dev` fails immediately (no half-started servers).
- No `--remote` or fetching newer refs; only pinned commits are checked out, so no unexpected dirty working tree.

## Files

- `package.json` — add `predev` script.
- `docs/audit/0008-hal-dev-predev-sync-submodules/*` — plan, worklog, changed-files, decisions, verification, pm-review.
