# Ticket

- **ID**: `0022`
- **Title**: Harden agent branching (feature branches only) and isolate repo writes for concurrent agents
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0011`
- **Category**: Process

## Goal (one sentence)

Make agent-driven repo writes safe under concurrency by enforcing feature-branch-only workflows and preventing any automated write path (especially `sync-tickets` after `create_ticket`) from modifying a shared `main` working tree.

## Background / problem

We are moving to a model where **multiple agents may operate in tandem** on the same repo checkout.

Today, at least one automated write path exists:
- `0011` creates a ticket in Supabase and then runs `sync-tickets` so a Markdown file is written under `docs/tickets/`.

If that write happens while the repo is on `main` (or while other agents have uncommitted work), it can:
- pollute `main` with unexpected changes
- collide with another agent’s changes
- cause “mystery” untracked files and broken commits

We already have policy rules encouraging feature branches, but we need **hard enforcement + isolation**.

## Human-verifiable deliverable (UI-only)

A human can trigger an agent-driven write (e.g. “create ticket”) while multiple agents are running, and confirm via Diagnostics that:
- the write was performed on an isolated feature branch/worktree (not `main`)
- only the intended files were created/committed
- no unrelated repo files were touched

## Acceptance criteria (UI-only)

- [ ] When the user triggers an agent-driven write action (start with `0011` ticket creation):
  - [ ] HAL does **not** modify the user’s current `main` working tree.
  - [ ] HAL performs the repo write in an **isolated workspace** (feature branch or worktree) and records the branch name in Diagnostics.
- [ ] Branch enforcement:
  - [ ] If the system detects it is on `main` and needs to write files, it automatically creates/checks out a feature branch named `ticket/<id>-<slug>` (or equivalent) **before** writing.
  - [ ] If it cannot create a branch (git missing, permissions, etc.), it fails safely and shows an in-app error (no silent partial writes).
- [ ] Minimal staging discipline (automation):
  - [ ] Only files created/modified by the action are staged/committed (no `git add .` / no unrelated files).
  - [ ] Diagnostics shows the exact paths staged/committed for the action.
- [ ] Commit/push policy:
  - [ ] Automated writes result in a commit that includes the ticket ID in the subject.
  - [ ] The feature branch is pushed so the work is not stranded locally.
- [ ] Safety smoke:
  - [ ] A second agent can have unrelated uncommitted changes in their own workspace; triggering ticket creation does not touch those files.

## Constraints

- Verification must require **no external tools** (no terminal, no devtools, no console).
- Prefer conservative isolation (worktrees) over clever in-place mutation of the user’s working tree.
- Do not leak secrets in Diagnostics; redact URLs/keys/tokens as needed.

## Non-goals

- Full multi-agent scheduling/locking system.
- Building a generalized git server; focus on hardening the existing automated write paths.

## Implementation notes (optional)

- Candidate minimal scope:
  - Harden the `0011` pipeline (create ticket → sync to repo) so that the sync write happens inside a dedicated worktree/branch and is committed/pushed automatically.
- Consider adding a reusable “repo write runner” utility that:
  - checks current branch
  - creates `ticket/<id>-<slug>` branch if needed
  - runs the write operation
  - stages explicit paths only
  - commits with ticket ID
  - pushes
  - returns a structured result consumed by Diagnostics

## Audit artifacts required (implementation agent)

Create `docs/audit/0022-harden-agent-branching-and-isolate-writes/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

