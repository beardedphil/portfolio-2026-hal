# Plan: 0022 - Harden agent branching and isolate repo writes

## Goal

Make agent-driven repo writes safe under concurrency by enforcing feature-branch-only workflows and preventing any automated write path (especially sync-tickets after create_ticket) from modifying a shared main working tree.

## Analysis

### Current State

- 0011: After create_ticket succeeds, vite middleware runs sync-tickets in the repo root (cwd: repoRoot). That writes directly to docs/tickets/ in the user's working tree.
- If the user (or another agent) is on main or has uncommitted changes, those writes pollute main or collide with other work.

### Approach

1. **Isolated workspace**: Run the write (sync-tickets) inside a dedicated git worktree for a feature branch `ticket/<id>-<slug>`, so the user's current branch and working tree are never touched.
2. **Repo write runner** (scripts/repo-write-runner.js):
   - Check repo is git and git is available.
   - Create branch `ticket/<id>-<slug>` from main (or origin/main) in a new worktree at `.hal-agent-write-<id>`.
   - Run sync-tickets with PROJECT_ROOT set to the worktree path so files are written only in the worktree.
   - Stage only the ticket file path (no `git add .`).
   - Commit with subject "Add ticket <id> (<slug>)".
   - Push the branch.
   - Remove the worktree.
   - Return structured result (success, branch, stagedPaths, error) for Diagnostics.
3. **sync-tickets.js**: Respect PROJECT_ROOT env so when run from the runner, it uses the worktree as project root.
4. **vite.config.ts**: After create_ticket succeeds, invoke repo-write-runner instead of sync-tickets directly; pass ticket id, filename, filePath; extend ticketCreationResult with branch, stagedPaths, repoWriteError.
5. **App.tsx**: Extend TicketCreationResult type and Diagnostics to show branch (isolated write), staged paths, and repo write error.
6. **.gitignore**: Add `.hal-agent-write*/` so worktree directories are ignored.

## Implementation Steps

1. Add PROJECT_ROOT support to scripts/sync-tickets.js.
2. Create scripts/repo-write-runner.js (worktree add, sync with PROJECT_ROOT, stage single path, commit, push, worktree remove).
3. In vite.config.ts: replace direct sync-tickets spawn with repo-write-runner spawn; extend ticketCreationResult.
4. In App.tsx: extend types and Diagnostics (branch, staged paths, repo write error); update user-facing message when ticket created on branch.
5. Add .hal-agent-write*/ to .gitignore.
6. Create audit artifacts (plan, worklog, changed-files, decisions, verification, pm-review).
