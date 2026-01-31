# Changed files: 0022 - Harden agent branching and isolate repo writes

## New

- `scripts/repo-write-runner.js` — Repo write runner: worktree, sync, stage, commit, push, cleanup; outputs JSON for Diagnostics.
- `docs/audit/0022-harden-agent-branching-and-isolate-writes/plan.md`
- `docs/audit/0022-harden-agent-branching-and-isolate-writes/worklog.md`
- `docs/audit/0022-harden-agent-branching-and-isolate-writes/changed-files.md`
- `docs/audit/0022-harden-agent-branching-and-isolate-writes/decisions.md`
- `docs/audit/0022-harden-agent-branching-and-isolate-writes/verification.md`
- `docs/audit/0022-harden-agent-branching-and-isolate-writes/pm-review.md`

## Modified

- `scripts/sync-tickets.js` — PROJECT_ROOT env support so runner can target worktree.
- `vite.config.ts` — After create_ticket, call repo-write-runner instead of sync-tickets; extend ticketCreationResult (branch, stagedPaths, repoWriteError).
- `src/App.tsx` — TicketCreationResult type extended; Diagnostics shows branch and staged paths; user message mentions branch / repo write error.
- `.gitignore` — Added `.hal-agent-write*/`.
