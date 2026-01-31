# Ticket

- **ID**: 0005
- **Title**: Global `.cursor/rules` single source of truth (HAL superrepo)
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P1

## Linkage (for tracking)

- **Fixes**: N/A
- **Category**: Process

## Goal (one sentence)

Make `portfolio-2026-hal/.cursor/rules/` the **only** authoritative ruleset for HAL-style work, preventing drift across repos/submodules.

## Human-verifiable deliverable (UI-only)

- In the file explorer:
  - `portfolio-2026-hal/.cursor/rules/` contains the full ruleset.
  - `projects/kanban/.cursor/rules/` and `projects/project-1/.cursor/rules/` contain only a stub rule telling you to open the HAL superrepo root for authoritative rules.

## Acceptance criteria (UI-only)

- [ ] HAL superrepo has the full ruleset at `.cursor/rules/`.
- [ ] The kanban repo (`portfolio-2026-basic-kanban`) no longer contains a full copy of `.cursor/rules/*.mdc` (only a stub rule remains).
- [ ] The agents repo (`portfolio-2026-hal-agents`) no longer contains a full copy of `.cursor/rules/*.mdc` (only a stub rule remains).
- [ ] HAL submodule pointers are updated so `projects/kanban` and `projects/project-1` reflect the stub-rule changes.

## Constraints

- Avoid breaking Cursor rule loading: rules must still apply when opening the workspace at `portfolio-2026-hal/`.
- Keep the change auditable (ticket + audit artifacts + clean repos).

## Non-goals

- Reworking the `hal-template/` scaffold in this ticket (can be a follow-up).
- Changing any app runtime behavior.

## Implementation notes (optional)

- This is intentionally a **superrepo-first** workflow: the workspace root must be `portfolio-2026-hal/` so rules are loaded once.
- To avoid ticket-ID collisions in commits across repos, create local tickets in each source repo that reference this HAL ticket.

## Audit artifacts required (implementation agent)

Create `docs/audit/0005-global-cursor-rules-ssot/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

