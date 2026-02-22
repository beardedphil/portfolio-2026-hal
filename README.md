# Portfolio 2026 — HAL (Super Project)

This repo assembles the portfolio projects. **Edit agents code only here** so there is a single source of truth.

## Projects

- `projects/kanban` — Project 0 (kanban board), **git submodule**
- `projects/hal-agents` — PM/agents (hal-agents), **normal directory** — edit here only; HAL always uses this copy

See [docs/process/single-source-agents.md](docs/process/single-source-agents.md) for why hal-agents is in-repo and how to optionally sync to an external repo.

## New project setup

**[New Project Setup Guide](docs/NEW_PROJECT_SETUP.md)** — Step-by-step walkthrough for setting up a new HAL project with Vercel and Supabase. Covers manual setup, in-app Bootstrap, and the New HAL project wizard.

## Scripts

### `npm run report:lines`

Reports source code files exceeding 250 lines, sorted by line count (descending). Targets source directories (`src/`, `api/`, `agents/`, `scripts/`, `projects/*/src`) and excludes generated/vendor output (`dist/`, `build/`, `node_modules/`). Exits with code 0 (non-blocking).

Example output:
```
Found 35 source file(s) exceeding 250 lines:

Lines | Path
------|------------------------------------------------------------
 5498 | projects/kanban/src/App.tsx
 5051 | src/App.tsx
 ...
```

### `npm run check:lines`

**Advisory** line limit check: lists source files over 250 lines. It does **not** block the build (exits 0). Target is 250 lines per file; refactor long files when convenient. Runs as part of `npm run build:hal` for visibility. Use `npm run report:lines` for a full report.

### `npm run test:coverage`

Runs the test suite with coverage reporting and enforces a **minimum 25% line coverage threshold**. The build will fail if coverage drops below this threshold.

**Coverage threshold enforcement:**
- **Minimum line coverage:** 25%
- **Enforced in:** `vitest.config.ts` (thresholds configuration)
- **CI enforcement:** The CI workflow (`.github/workflows/ci.yml`) runs `npm run test:coverage` and will fail the build if coverage is below 25%
- **Local testing:** Run `npm run test:coverage` to check coverage locally. The command will fail if coverage is below the threshold.

**Coverage reporters:**
- Text summary (console output)
- JSON summary (`coverage/coverage-summary.json`)
- Coverage details are also published to `public/coverage-details.json` via the `update-metrics` workflow

**To run tests without coverage:** Use `npm test` (or `npm test -- --run` for single run mode).

