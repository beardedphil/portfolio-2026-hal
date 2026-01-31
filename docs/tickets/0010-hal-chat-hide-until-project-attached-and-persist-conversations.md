# Ticket

- **ID**: `0010`
- **Title**: HAL chat: hide until project attached + persist conversations
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Only show the HAL chat UI after a project is attached, and persist the conversation history so multi-turn PM conversations survive reloads.

## Human-verifiable deliverable (UI-only)

A human can open HAL and will **not** see the Chat panel until they connect a project folder. After connecting, they can have a back-and-forth PM conversation, refresh the page, and see the conversation still there.

## Acceptance criteria (UI-only)

- [ ] When **no project is connected**, the Chat region is not shown (or is replaced with a clear “Connect a project to enable chat” placeholder); the user cannot send messages.
- [ ] When a project is connected, the Chat region appears and is usable.
- [ ] Chat history persists across refreshes for the connected project:
  - [ ] Send 2+ PM messages, refresh the page, and the PM transcript is still present.
  - [ ] Disconnect, connect a different project folder, and the transcript is different (conversations are scoped per project).
- [ ] Failures are explainable from inside the app (e.g. if persistence fails, show an in-app error in Diagnostics).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Persistence should be scoped to the connected project (at minimum by folder name; ideally by a stable identifier available in-app).
- Do not change PM agent behavior in this ticket beyond gating/persistence.

## Non-goals

- Server-side persistence (Supabase) for chat transcripts.
- Sharing conversation history across machines/users.
- Any ticket-creation or kanban mutation capabilities (separate tickets).

## Implementation notes (optional)

- Minimal approach is acceptable: persist `conversations` state to `localStorage` keyed by connected project identifier, restore on load/connect.
- If the app currently auto-connects or shows “Connected” without a folder, clarify what “attached project” means and ensure the gating follows that state.

## Audit artifacts required (implementation agent)

Create `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

