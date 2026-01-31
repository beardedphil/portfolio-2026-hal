# Ticket

- **ID**: `0024`
- **Title**: Chat typing indicator + purple color palette
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P2

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: CSS / State / Other

## Ready for verification (implementation agent fills when work is pushed)

- **Branch**: `ticket/0024-chat-typing-indicator-and-purple-palette` — QA (or the user) checks out this branch to verify, then merges to `main`.

## Goal (one sentence)

Add an animated “typing” / “thinking” indicator in chat when the PM (or any agent) is expected to respond, and update the HAL app color palette to a purple-based, pleasant theme.

## Human-verifiable deliverable (UI-only)

- When the user sends a message and an agent (e.g. PM) is expected to respond, a **typing/thinking bubble** appears in the chat transcript (e.g. “Thinking…” or “Typing…” with a subtle animation—dots, pulse, or similar) until the agent’s reply appears.
- The **overall HAL app** uses a **purple-leaning color palette** that feels pleasant and consistent (header, chat area, buttons, accents, backgrounds as appropriate).

## Acceptance criteria (UI-only)

- [ ] After sending a message to the PM (or any agent that triggers a response), an animated typing/thinking indicator appears in the chat (e.g. bubble with dots or pulse) until the reply is shown.
- [ ] The indicator is clearly associated with “the agent is working on a response” (standard “typing” vibe).
- [ ] The indicator disappears when the agent’s reply is added to the transcript.
- [ ] The HAL app uses a purple-based color palette (header, chat region, primary actions, accents) that is consistent and easy on the eye.
- [ ] No external tools required to verify (in-app only).

## Constraints

- Keep scope minimal: typing indicator + palette update only; no change to agent logic or APIs.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Animation should be subtle and not distracting.

## Non-goals

- Changing kanban board colors (HAL shell only for this ticket, unless you want to align later).
- Customizable themes or user-pickable colors (single purple palette is enough).
- Typing indicators for other agents beyond “when we’re waiting for a response” (PM or whichever agent is active).

## Implementation notes (optional)

- Typing indicator: show when a request to the agent is in flight (e.g. after Send, before reply is received). Could be a small message-row with an animated bubble (three dots bouncing, or a pulse). Remove/hide when the reply message is added.
- Purple palette: define CSS variables (e.g. `--hal-primary`, `--hal-accent`, `--hal-bg`, `--hal-surface`) with purple hues; apply to header, chat container, buttons, borders. User’s favorite color is purple—lean into that for accents and primary actions.

## Audit artifacts required (implementation agent)

Create `docs/audit/0024-chat-typing-indicator-and-purple-palette/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`
