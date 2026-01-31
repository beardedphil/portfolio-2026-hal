# Decisions: 0024 - Chat typing indicator + purple color palette

## D1: Single typing state per app

- **Decision**: Use `agentTypingTarget: ChatTarget | null` — only one chat can show typing at a time.
- **Why**: User sends to one target at a time; when switching tabs, the typing indicator appears only in the active target’s transcript. Keeps logic simple.

## D2: Clear typing on all reply paths

- **Decision**: Call `setAgentTypingTarget(null)` on every path that adds a reply (success, error, invalid JSON, catch).
- **Why**: Indicator must disappear as soon as the agent’s reply is shown. Avoids stale typing state.

## D3: Typing indicator as message-like row

- **Decision**: Render the typing bubble as a div with `message message-typing` inside the transcript, after messages.
- **Why**: Feels like a natural part of the conversation; auto-scroll works; accessible with `aria-live="polite"`.

## D4: "Thinking" label with animated dots

- **Decision**: Use "Thinking" + three bouncing dots (not "Typing…").
- **Why**: Ticket allows either; "Thinking" fits agents (PM, implementation-agent) better. Dots are a familiar, subtle pattern.

## D5: Purple palette via CSS variables

- **Decision**: Define `--hal-*` variables in `:root` and apply throughout.
- **Why**: Single source of truth; easy to adjust later; consistent purple theme without changing kanban (per ticket non-goal).

## D6: Keep semantic status colors

- **Decision**: Use `--hal-status-ok` (green) and `--hal-status-error` (red) for diagnostics; leave connect-error (warning) as-is.
- **Why**: Semantic colors aid usability; palette stays purple for surfaces and accents.

## Unrequested changes

- None.
