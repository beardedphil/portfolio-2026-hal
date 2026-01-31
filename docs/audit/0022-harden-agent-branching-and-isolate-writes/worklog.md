# Worklog: 0022 - Harden agent branching and isolate repo writes

## Summary

- **sync-tickets.js**: Added PROJECT_ROOT env support so the script can write to an isolated worktree when invoked by repo-write-runner.
- **repo-write-runner.js**: New script that creates a worktree for branch `ticket/<id>-<slug>`, runs sync-tickets with PROJECT_ROOT=worktree, stages only the ticket file, commits with ticket ID in subject, pushes, and removes the worktree. Outputs JSON result (success, branch, stagedPaths, error) to stdout.
- **vite.config.ts**: After create_ticket succeeds, spawn repo-write-runner instead of sync-tickets; parse runner JSON output; extend ticketCreationResult with branch, stagedPaths, repoWriteError.
- **App.tsx**: Extended TicketCreationResult with branch, stagedPaths, repoWriteError; Diagnostics shows branch (isolated write) and paths staged/committed; user message on success mentions branch, on failure shows repo write error.
- **.gitignore**: Added `.hal-agent-write*/` so worktree directories are not tracked.
- **Audit**: Created docs/audit/0022-harden-agent-branching-and-isolate-writes/ (plan, worklog, changed-files, decisions, verification, pm-review).

## Decisions

- Use worktree (not in-place branch switch) so the user's main working tree is never modified.
- Runner is a separate Node script invoked via spawn so env and args are explicit; output is JSON for Diagnostics.
- Base ref for new branch: main, fallback to origin/main.
- Only the single ticket file path is staged (minimal staging discipline).
- Commit subject format: "Add ticket <id> (<slug>)" so ticket ID is visible in history.
- On any runner failure, worktree is removed so the next run does not hit "path already exists"; error is returned in ticketCreationResult.repoWriteError and syncError for Diagnostics.
