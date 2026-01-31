# PM Review (0008-hal-dev-predev-sync-submodules)

## Summary (1–3 bullets)

- Added `predev` script that runs `git submodule sync --recursive && git submodule update --init --recursive` before `npm run dev`.
- From a fresh clone, running only `npm run dev` now initializes submodules and starts servers; kanban iframe loads without manual git submodule commands.
- Failures (git missing, network, permissions) cause dev to fail immediately with a clear message; no half-started state.

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**

- Minimal change: one script; no new dependencies; uses only git + npm.
- npm predev lifecycle is standard and works on Windows.
- Addresses the main failure mode called out in 0007's pm-review (submodule not initialized).

## What to verify (UI-only)

- From uninitialized submodule state, run only `npm run dev`; HAL and kanban load in browser (kanban iframe shows content).
- When submodule init cannot succeed, `npm run dev` fails with a clear error and does not leave servers half-running.
- After running dev, `git status` shows no unexpected dirty state (only pinned commits checked out).

## Potential failures (ranked)

1. **Windows shell and `&&`** — npm on Windows may use cmd or PowerShell; `&&` is supported in both for chaining. If a user has an unusual shell config, could theoretically differ; low likelihood.
2. **Git not in PATH** — If git is not installed or not in PATH, predev fails with "git is not recognized" (or similar). Failure is clear and immediate as required.
3. **Submodule deps not installed** — predev only inits/updates submodules; it does not run `npm install` in submodule dirs. If projects/kanban has no node_modules, dev:kanban will still fail with a clear error (same as before). Ticket explicitly leaves "installing submodule dependencies" as non-goal / follow-up.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None.

## Follow-ups (optional)

- Optional: add `npm install` in projects/kanban (and project-1 if needed) from root predev or a post-submodule hook if we want true one-command fresh clone to run (currently user may need one-time `npm install` in submodules).
