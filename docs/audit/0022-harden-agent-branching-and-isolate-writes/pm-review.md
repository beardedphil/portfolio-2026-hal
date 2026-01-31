# PM review: 0022 - Harden agent branching and isolate repo writes

## Deliverable

- Agent-driven repo writes (ticket creation → sync to repo) no longer touch the user's main working tree. Writes happen in an isolated worktree on a feature branch `ticket/<id>-<slug>`, with only the ticket file staged, committed (subject includes ticket ID), and pushed. Diagnostics shows branch name and staged paths; failures surface in-app.

## Acceptance criteria

- [x] When the user triggers an agent-driven write (ticket creation): HAL does not modify the user's current main working tree; HAL performs the write in an isolated workspace (feature branch/worktree) and records the branch name in Diagnostics.
- [x] Branch enforcement: If the system needs to write files, it creates/checks out a feature branch `ticket/<id>-<slug>` in a worktree before writing; if it cannot (e.g. git missing), it fails safely and shows an in-app error.
- [x] Minimal staging: Only files created/modified by the action are staged/committed; Diagnostics shows the exact paths staged/committed.
- [x] Commit/push: Automated writes result in a commit with ticket ID in the subject; the feature branch is pushed.
- [x] Safety: A second agent's unrelated uncommitted changes in their workspace are not touched (writes occur in a separate worktree).

## Constraints

- Verification is UI-only (no terminal/devtools required for normal verification).
- Conservative isolation via worktrees; no in-place mutation of the user's working tree.
- No secrets in Diagnostics (branch/paths only; errors are redacted where needed).

## Non-goals

- Full multi-agent scheduling/locking.
- Generalized git server; scope is hardening the existing create_ticket → sync write path.
