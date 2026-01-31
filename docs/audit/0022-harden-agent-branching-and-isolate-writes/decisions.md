# Decisions: 0022 - Harden agent branching and isolate repo writes

## Worktree vs in-place branch

**Decision**: Use a dedicated git worktree for the feature branch so the user's current branch and working tree are never modified.

**Rationale**: Ticket requires "HAL does not modify the user's current main working tree" and "prefer conservative isolation (worktrees)". An in-place checkout would change the user's branch; a worktree keeps their checkout untouched while we do sync + commit + push in an isolated directory.

## PROJECT_ROOT in sync-tickets

**Decision**: sync-tickets.js uses `process.env.PROJECT_ROOT` when set, otherwise script-relative project root.

**Rationale**: sync-tickets is written to use a single project root (script dir parent). When the runner invokes it, we need writes to go to the worktree; passing PROJECT_ROOT avoids forking sync-tickets logic and keeps a single code path.

## Runner as separate script

**Decision**: Repo write logic lives in scripts/repo-write-runner.js, invoked via spawn from vite.config.ts with args and env.

**Rationale**: Keeps vite.config.ts focused on HTTP/PM flow; runner receives explicit repoRoot, ticketId, filename, filePath and env for Supabase; stdout JSON is easy to parse and pass to Diagnostics. No need to share TypeScript types across config and runner.

## Staging only the ticket file

**Decision**: Runner runs `git add -- <filePathRelative>` for the single ticket file only.

**Rationale**: Acceptance criteria require "only files created/modified by the action are staged/committed (no git add .)". The create_ticket flow creates one new ticket; we stage only that path.

## Base ref for new branch

**Decision**: Create branch from `main`; if main does not exist, use `origin/main`.

**Rationale**: Feature branches are typically created from main. Some repos use main, others might only have origin/main after clone; fallback keeps runner working in both cases.

## Worktree cleanup on failure

**Decision**: On any runner failure (sync, add, commit, push), we still remove the worktree before exiting.

**Rationale**: Prevents leftover .hal-agent-write-<id> directories from blocking the next run. Error is captured in repoWriteError for Diagnostics so the user can see what failed without inspecting the worktree.
