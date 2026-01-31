# PM Review (0007-hal-dev-script-start-kanban-and-hal)

## Summary (1–3 bullets)

- `npm run dev` now starts both HAL (port 5173) and Kanban (port 5174) in parallel via `concurrently`.
- Fixed ports with `--strictPort` ensure port conflicts fail immediately rather than silently breaking the iframe embed.
- Loading overlay hint updated to direct users to run `npm run dev` from repo root.

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**

- Small, well-scoped change: add concurrently, three scripts, update hint.
- Kanban submodule already exists at `projects/kanban` with a standard `dev` script.
- strictPort gives clear failure when ports are unavailable.

## What to verify (UI-only)

- Running `npm run dev` from HAL repo root is sufficient; no manual start of kanban required.
- Kanban iframe loads (no "localhost refused to connect").
- Chat area is usable.
- If ports are in use, dev fails with a clear message.

## Potential failures (ranked)

1. **Kanban submodule not initialized** — `npm run dev:kanban` would fail with "ENOENT projects/kanban/package.json". User must run `git submodule update --init`. Consider documenting in README.
2. **Windows quoting** — concurrently uses standard npm script syntax; should work on Windows. If issues arise, may need to adjust quote style.
3. **Kanban deps not installed** — If user clones fresh, `projects/kanban` may need `npm install` before first run. The `npm --prefix projects/kanban run dev` will fail with a clear error if node_modules is missing.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
