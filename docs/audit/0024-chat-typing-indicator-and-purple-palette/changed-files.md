# Changed files: 0024 - Chat typing indicator + purple color palette

## Modified

- `src/App.tsx`
  - Added `agentTypingTarget: ChatTarget | null` state.
  - In `handleSend`: set `agentTypingTarget` when starting PM / implementation-agent / standup request; clear when reply is added (all paths).
  - Updated transcript: empty state condition `activeMessages.length === 0 && !agentTypingTarget`; render typing bubble when `agentTypingTarget === selectedChatTarget`.
  - Included `agentTypingTarget`, `selectedChatTarget` in auto-scroll effect.

- `src/index.css`
  - Added `:root` block with purple palette CSS variables (`--hal-primary`, `--hal-accent`, `--hal-bg`, `--hal-surface`, etc.).
  - Added `.message-typing`, `.typing-bubble`, `.typing-label`, `.typing-dots`, `.typing-dot` and `@keyframes typing-bounce` for typing indicator.
  - Replaced hardcoded colors throughout with variables (header, kanban, chat, messages, composer, diagnostics).

## Created

- `docs/audit/0024-chat-typing-indicator-and-purple-palette/plan.md`
- `docs/audit/0024-chat-typing-indicator-and-purple-palette/worklog.md`
- `docs/audit/0024-chat-typing-indicator-and-purple-palette/changed-files.md`
- `docs/audit/0024-chat-typing-indicator-and-purple-palette/decisions.md`
- `docs/audit/0024-chat-typing-indicator-and-purple-palette/verification.md`
- `docs/audit/0024-chat-typing-indicator-and-purple-palette/pm-review.md`
