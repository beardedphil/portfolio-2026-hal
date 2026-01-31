# Verification (no external tools)

## HAL superrepo is authoritative

1. Open the workspace at the **HAL superrepo root**: `portfolio-2026-hal/`.
2. In the file explorer, confirm `.cursor/rules/` contains the full ruleset.

## Submodule repos use stub rules only

1. In the same workspace, browse to:
   - `projects/kanban/.cursor/rules/`
   - `projects/hal-agents/.cursor/rules/`
2. Confirm each contains only `SUPERREPO_RULES_ONLY.mdc` (no full ruleset copies).

## Submodule pointers updated

1. In the HAL superrepo workspace, confirm `projects/kanban` and `projects/hal-agents` reflect the latest commits that introduced the stub rule (you should see the stub file present).

