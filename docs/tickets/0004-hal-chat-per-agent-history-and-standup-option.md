# Ticket

- **ID**: `0004`
- **Title**: HAL chat: per-agent chat history + Standup as dropdown option
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

In HAL, switching the chat agent switches the transcript to that agent’s conversation, and “Standup (all agents)” is an agent dropdown option (not a button) with its own shared transcript.

## Human-verifiable deliverable (UI-only)

A human can:
- chat with Project Manager, then switch to Implementation Agent and see a different chat history,
- switch back to Project Manager and see the earlier PM messages still there,
- choose “Standup (all agents)” from the dropdown and see a shared transcript for standup messages.

## Acceptance criteria (UI-only)

- [ ] The Agent dropdown includes:
  - Project Manager
  - Implementation Agent (stub)
  - Standup (all agents)
- [ ] Each agent has its own transcript:
  - sending a message to Project Manager does not appear in Implementation Agent’s transcript (and vice versa).
- [ ] “Standup (all agents)” uses a shared transcript:
  - standup transcript includes messages from multiple agents
  - standup messages do not appear in individual agent transcripts.
- [ ] The standalone “Standup (all agents)” button is removed (standup is chosen via dropdown).
- [ ] In-app diagnostics exposes:
  - selected chat target (PM / Implementation / Standup)
  - last agent error (if any)

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- No persistence required (in-memory state is fine for now).
- No devtools/console required for verification.

## Non-goals

- Persisting chat history to disk/db
- Standup aggregation via real agent infra (placeholders are fine)

## Audit artifacts required (implementation agent)

Create `docs/audit/0004-hal-chat-per-agent-history-and-standup-option/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`
