# Verification (0008-hal-dev-predev-sync-submodules)

All checks are done in the browser and terminal (UI-only where possible).

## Prerequisites

- HAL repo with submodules either uninitialized (e.g. fresh clone) or already initialized.
- Git and npm available; network for submodule clone if needed.

## Steps

### 1) Fresh clone / uninitialized submodules — single command works

- **Setup:** State where submodules are not initialized (e.g. clone without `--recurse-submodules`, or remove `projects/kanban` and `projects/project-1` and reset .git/modules if needed for a clean test).
- **Action:** Run **only** `npm run dev` from HAL repo root. Do not run any git submodule commands first.
- **Pass:** predev runs (sync + update --init), then dev servers start. Open http://localhost:5173 in browser.
- **Pass:** HAL UI loads; kanban area (iframe) loads — no "localhost refused to connect". Kanban content is visible.

### 2) Submodule init failure — clear and immediate

- **Setup:** Simulate failure (e.g. disconnect network, or temporarily make git unavailable, or use a repo with invalid submodule URL).
- **Action:** Run `npm run dev`.
- **Pass:** Dev startup fails with a clear message (e.g. git error or network error). No half-started servers; user sees the failure immediately.

### 3) No unexpected dirty working tree

- **Setup:** Clean working tree; submodules already initialized at pinned commits.
- **Action:** Run `npm run dev`, then stop it. Run `git status`.
- **Pass:** No new modified or untracked files in the superrepo or in submodule working trees beyond what might already exist. predev only checks out pinned commits, does not pull or update refs.

### 4) Already-initialized submodules — dev still works

- **Action:** With submodules already initialized, run `npm run dev`.
- **Pass:** predev completes quickly (sync/update no-op or fast); dev servers start; HAL and kanban load in browser as before.
