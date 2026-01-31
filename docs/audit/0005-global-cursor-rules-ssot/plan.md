# Plan

## Goal

Make `portfolio-2026-hal/.cursor/rules/` the single source of truth for global agent rules across HAL-style repos and prevent drift across submodules.

## Approach

- Keep the full ruleset only in the HAL superrepo: `portfolio-2026-hal/.cursor/rules/`.
- Replace the duplicated `.cursor/rules/*.mdc` in the source repos (`portfolio-2026-basic-kanban`, `portfolio-2026-hal-agents`) with a single stub rule that points back to the HAL superrepo rules.
- Update HAL’s `submodule-sync.mdc` to document this as intentional and required.
- Update HAL submodule pointers to pick up the stub-rule commits.

## Out of scope

- Updating any application behavior.
- Modifying `hal-template/` contents (follow-up ticket).

