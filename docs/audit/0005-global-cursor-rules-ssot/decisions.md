# Decisions

## Make HAL superrepo the only authoritative ruleset

**Decision:** Treat `portfolio-2026-hal/.cursor/rules/` as the single source of truth for global agent rules.

**Why:**
- Prevents drift and “rules copy” divergence across projects.
- Matches how Cursor applies rules (workspace-root oriented).

## Stub rules in submodule repos instead of full copies

**Decision:** Replace `.cursor/rules/*.mdc` in source repos with a single stub rule that points to the HAL superrepo rules.

**Why:**
- Removes the second copy that causes drift.
- Forces the intended workflow: open the HAL superrepo as the workspace root.

## Cross-repo ticketing to avoid ID collisions

**Decision:** Track the submodule-repo changes with local tickets in those repos (rather than using HAL `0005` in their commit subjects).

**Why:**
- Ticket IDs are only unique within a repo.
- `portfolio-2026-basic-kanban` already has a `0005` ticket; using `docs(0005)` there would be ambiguous.

## Unrequested changes (required)

- None.

