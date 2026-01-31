# Plan

## Goal

Prevent Cursor rule drift by making the HAL superrepo the only authoritative ruleset, and leaving a stub rules file in this repo.

## Steps

- Replace `.cursor/rules/*.mdc` with `.cursor/rules/SUPERREPO_RULES_ONLY.mdc`.
- Update `docs/process/pm-handoff.md` to document the intended workflow.
- Create/commit ticket + audit artifacts for traceability.

