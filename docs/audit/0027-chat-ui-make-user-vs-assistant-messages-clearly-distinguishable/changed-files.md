# Changed files: 0027 - Chat UI: make user vs assistant messages clearly distinguishable

## Modified

- `src/App.tsx`
  - Added `getMessageAuthorLabel(agent)` returning "You" | "HAL" | "System".
  - Message markup: wrap in `message-row message-row-${agent}`; inner `message` div with `message-header` (author + time) and content.
  - Typing indicator: wrap in `message-row message-row-typing`, add "HAL" in `message-header`.

- `src/index.css`
  - Added `.message-row` with alignment variants (user=flex-end, assistant/typing=flex-start, system=center).
  - Restyled `.message` as bubble with max-width, `message-header`, `message-author`, `message-time`.
  - User: purple gradient bubble, white text, high contrast.
  - Assistant: neutral bubble, primary author label.
  - System: centered, muted.
  - Typing: matches assistant, left-aligned.
  - `.message-json`: distinct background for code blocks, preserved overflow-x.
  - Responsive: 95% max-width for messages on narrow screens.

## Created

- `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/plan.md`
- `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/worklog.md`
- `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/changed-files.md`
- `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/decisions.md`
- `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/verification.md`
- `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/pm-review.md`
