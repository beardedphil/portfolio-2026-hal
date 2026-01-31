# Plan (0004-hal-chat-per-agent-history-and-standup-option)

## Goal

- Switching the chat dropdown switches transcript per agent.
- “Standup (all agents)” is a dropdown option with its own shared transcript.

## Approach

- Add a `ChatTarget` union: `project-manager | implementation-agent | standup`.
- Store messages per target: `Record<ChatTarget, Message[]>`.
- Render transcript from `conversations[selectedChatTarget]`.
- Remove Standup button; treat Standup behavior as the “standup” chat target:
  - user message goes into standup transcript
  - placeholder standup messages are appended to standup transcript
- Update diagnostics to show `selectedChatTarget`.

## Files

- `src/App.tsx`
- `src/index.css`
- `docs/tickets/0004-...`
- `docs/audit/0004-.../*`
