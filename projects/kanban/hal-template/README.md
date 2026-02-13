# HAL Project Scaffold Template

This folder is the **reusable scaffold** for new HAL projects.

## What it contains

- `.cursor/rules/` — workspace agent rules (copied into each new project repo)
- `docs/` — tickets, audit artifacts, and templates
- `scripts/sync-tickets.js` — sync `docs/tickets/*.md` ↔ Supabase `tickets` table
- `.env.example` — required env keys for Supabase (frontend + scripts)
- `.gitignore` — ignores `.env` and common build artifacts
- `package.json` — provides `npm run sync-tickets`

## Versioning

See `VERSION`. When we learn new process rules or templates, we bump the version and update this scaffold.
