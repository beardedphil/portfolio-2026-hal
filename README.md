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

**Blocking** line limit gate that enforces a 250-line limit on source code files. This check:

- **Fails** (exits non-zero) when:
  - A non-allowlisted file exceeds 250 lines, OR
  - An allowlisted file exceeds its recorded baseline in `.line-limit-allowlist.json`
- **Passes** when all files comply with their limits

The allowlist (`.line-limit-allowlist.json`) stores current offenders and their baselines, allowing the codebase to gradually reduce file sizes without blocking existing large files.

**How it works:**
- Files in `.line-limit-allowlist.json` are allowed to exceed 250 lines up to their recorded baseline
- New files or files not in the allowlist must stay under 250 lines
- Allowlisted files cannot grow beyond their baseline

**Updating the allowlist:**
When you refactor a file to reduce its line count:
1. Run `npm run report:lines` to see current line counts
2. Edit `.line-limit-allowlist.json` to update the baseline (or remove the entry if it's now under 250 lines)
3. Commit the updated allowlist with your refactor

**Removing entries:**
Once a file is refactored to under 250 lines, remove its entry from `.line-limit-allowlist.json`. The check will then enforce the 250-line limit on that file going forward.

**Integration:**
This check runs automatically as part of `npm run build:hal` to catch regressions in CI/CD.

