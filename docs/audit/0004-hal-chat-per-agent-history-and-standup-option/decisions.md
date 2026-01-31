# Decisions (0004-hal-chat-per-agent-history-and-standup-option)

## Standup is a chat target

- **Decision:** Treat “Standup (all agents)” as a third chat target in the dropdown, with its own shared transcript.
- **Why:** Matches the requirement that standup is a conversation involving all agents and should not be a standalone button.

## No persistence yet

- **Decision:** Keep transcripts in memory (React state) only.
- **Why:** Ticket scope; persistence can come later.

