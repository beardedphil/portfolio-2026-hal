# Worklog: 0027 - Chat UI: make user vs assistant messages clearly distinguishable

## Session 1

### Analysis

- Read ticket 0027: user vs assistant messages must be clearly distinguishable (alignment, bubble/background, label).
- Reviewed `src/App.tsx` message rendering and `src/index.css` message/typing styles.
- Reviewed ticket 0024 (chat typing, purple palette) for consistency.

### Implementation

#### App.tsx

- Added `getMessageAuthorLabel(agent)`: returns "You" for user, "HAL" for project-manager/implementation-agent, "System" for system.
- Restructured message markup: each message wrapped in `message-row message-row-${agent}`; inner `message` div contains `message-header` (author + time) and content.
- Updated typing indicator: wrapped in `message-row-typing`, added "HAL" in `message-header`, inner structure matches assistant.

#### index.css

- Added `.message-row`: flex container; `.message-row-user` = `justify-content: flex-end`; `.message-row-project-manager`, `-implementation-agent`, `-typing` = `flex-start`; `.message-row-system` = `center`.
- Message bubble: max-width 90%, border-radius 10px, padding.
- User: purple gradient background (#7c5ee8 → #6b4ce6), white text, primary border; author/time/content/JSON overrides for contrast.
- Assistant: neutral surface, border, primary-colored author label.
- System: centered, surface-alt background, muted text.
- Typing: matches assistant (surface, border, primary author).
- `.message-json`: surface-alt background, border, preserved overflow-x for code blocks.
- Responsive: `max-width: 95%` for messages on narrow screens.

### Verification

- `npm run build` succeeds.
- No TypeScript or lint errors.
