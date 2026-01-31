## Ticket

- **Title**: Chat UI: make user vs assistant messages clearly distinguishable
- **Branch**: `ticket-0027-chat-ui-distinguish-messages`
- **Owner**: Implementation agent
- **Type**: UX
- **Priority**: P1
- **Linkage**: Impacts HAL chat UI (likely `src/` components). Related to any existing chat styling/palette work (e.g. ticket 0024).

## Goal (one sentence)

Make it immediately obvious which chat messages were sent by the user vs the assistant.

## Human-verifiable deliverable (UI-only)

In the HAL chat UI, user and assistant messages have clearly different visual treatments (at minimum: alignment + bubble/background + label), so a non-technical user can tell authorship at a glance without reading content.

## Acceptance criteria (UI-only)

- [ ] Open HAL and view any chat history: **user** messages are visually distinct from **assistant** messages (different alignment and styling).
- [ ] Each message shows an explicit author indicator (e.g., “You” vs “HAL”) or an avatar/icon that unambiguously conveys authorship.
- [ ] The distinction remains clear in these states:
  - [ ] short one-line messages
  - [ ] long multi-paragraph messages
  - [ ] code blocks / preformatted text
- [ ] Basic accessibility check: contrast is sufficient to read both message types (no “low-contrast gray on gray” bubbles).
- [ ] No regressions: the chat remains readable in the app’s current theme/palette and does not break layout in narrow widths.

## Constraints

- Keep scope limited to **presentation** (styling + small structural markup changes) unless a small data/model change is required to correctly identify authors.
- Verification must be **UI-only** (no devtools/console).
- Prefer changes that are consistent with the app’s existing design language (spacing, typography, palette).

## Non-goals

- Building a full theming system.
- Rewriting chat backend / agent logic.
- Adding new chat features (reactions, editing, threads), unless necessary for the visual distinction.

## Implementation notes (optional)

- Consider a classic chat layout:
  - User messages right-aligned, one accent color bubble.
  - Assistant messages left-aligned, neutral bubble.
  - Optional subtle header per message group (“You”, “HAL”).
- Ensure code blocks remain readable: keep monospace background distinct and allow horizontal scroll.
- If there is already a “typing” indicator component, ensure it visually matches the assistant side.

## History
- PM cleanup for DoR (0036).

## Audit artifacts required (implementation agent)

Create `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only; include screenshot filenames if used)
- `pm-review.md` (use `docs/templates/pm-review.template.md`)