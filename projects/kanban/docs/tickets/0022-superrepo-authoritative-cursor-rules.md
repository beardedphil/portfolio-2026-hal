# Ticket

- **ID**: 0022
- **Title**: Make `.cursor/rules` authoritative in HAL superrepo (stub in kanban repo)
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P1

## Linkage (for tracking)

- **Fixes**: N/A
- **Category**: Process

## Goal (one sentence)

Remove duplicated Cursor agent rules from this repo and replace them with a stub that points to the HAL superrepo’s authoritative rules.

## Human-verifiable deliverable (UI-only)

- In the file explorer, this repo’s `.cursor/rules/` contains only `SUPERREPO_RULES_ONLY.mdc`.

## Acceptance criteria (UI-only)

- [ ] `.cursor/rules/` contains only `SUPERREPO_RULES_ONLY.mdc`.
- [ ] `docs/process/pm-handoff.md` explains that global rules live in `portfolio-2026-hal/.cursor/rules/`.

## Constraints

- Do not change application code.
- Keep the repo clean (no accidental generated files).

## Non-goals

- Updating `hal-template/` contents.

## Audit artifacts required (implementation agent)

Create `docs/audit/0022-superrepo-authoritative-cursor-rules/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

