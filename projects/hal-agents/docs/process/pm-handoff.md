# PM Handoff Notes (Process + Gotchas)

This file is for future PM agents working in this repo (`portfolio-2026-hal-agents`).

## Role boundaries

- PM agent work: write tickets, run `npm run sync-tickets` after editing `docs/tickets/`, review artifacts, and update global rules in the HAL superrepo.
- Implementation agents: implement agent code, create audit artifacts, and handle feature branches + merges.

## Global rules single source of truth

- This repo is intended to be used as a submodule inside `portfolio-2026-hal/`.
- Authoritative global agent rules live at: `portfolio-2026-hal/.cursor/rules/`.
- This repo’s `.cursor/rules/` is intentionally a stub (to prevent drift).

## Common gotchas we hit

- **Repo naming mismatch**: folder name may differ from repo/package name. Prefer naming the repo/package `portfolio-2026-hal-agents` in `package.json` and docs, even if the local folder is still `portfolio-2026-hal-agents`.
- **sync-tickets dependencies**: `npm run sync-tickets` requires dependencies installed (`npm install`) and uses Supabase credentials from `.env`.

## HAL integration

- HAL consumes agent modules from this repo via the submodule in `portfolio-2026-hal/projects/hal-agents`.
- Keep the agent API deterministic and framework-agnostic (pure TS) early; HAL can import/call functions directly.

