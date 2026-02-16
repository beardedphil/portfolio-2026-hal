# Portfolio 2026 — HAL (Super Project)

This repo assembles the portfolio projects. **Edit agents code only here** so there is a single source of truth.

## Projects

- `projects/kanban` — Project 0 (kanban board), **git submodule**
- `projects/hal-agents` — PM/agents (hal-agents), **normal directory** — edit here only; HAL always uses this copy

See [docs/process/single-source-agents.md](docs/process/single-source-agents.md) for why hal-agents is in-repo and how to optionally sync to an external repo.

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

