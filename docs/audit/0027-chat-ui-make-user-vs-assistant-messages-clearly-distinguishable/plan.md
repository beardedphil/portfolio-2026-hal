# Plan: 0027 - Chat UI: make user vs assistant messages clearly distinguishable

## Goal

Make it immediately obvious which chat messages were sent by the user vs the assistant.

## Analysis

### Current State

- Messages use `message-${agent}` classes (user, project-manager, implementation-agent, system).
- All messages are left-aligned; styling differences are subtle (border color, background tint).
- No explicit author label; user must infer from content or context.
- Typing indicator exists but has no author context.

### Required Changes

1. **Alignment**
   - User messages: right-aligned.
   - Assistant messages (project-manager, implementation-agent): left-aligned.
   - System messages: centered.

2. **Visual treatment**
   - User: accent color bubble (purple gradient), high contrast.
   - Assistant: neutral bubble (white/light surface, border).
   - Explicit author label per message: "You" vs "HAL" (or agent name).

3. **Author indicator**
   - Add `message-author` header with "You", "HAL", or "System".
   - Typing indicator: "HAL" label, left-aligned, match assistant style.

4. **Accessibility & robustness**
   - Sufficient contrast for both message types.
   - Code blocks / preformatted text remain readable with distinct background.
   - Layout works in narrow widths (responsive).

## Implementation

1. **App.tsx**
   - Add `getMessageAuthorLabel(agent)` → "You" | "HAL" | "System".
   - Wrap each message in `message-row message-row-${agent}` for alignment.
   - Add `message-header` with `message-author` and `message-time`.
   - Wrap content in inner `message` div (bubble).
   - Update typing indicator: wrap in `message-row-typing`, add "HAL" header.

2. **index.css**
   - `.message-row`: flex container; user = `justify-content: flex-end`, assistant/typing = `flex-start`, system = `center`.
   - `.message`: max-width 90% (95% on narrow screens), border-radius, padding.
   - User bubble: purple gradient, white text, high contrast.
   - Assistant bubble: neutral surface, primary-colored author label.
   - `.message-json`: distinct background for code, horizontal scroll preserved.
   - Typing: match assistant styling, left-aligned.

## Files to Change

- `src/App.tsx` — author label helper, message structure, typing structure
- `src/index.css` — message-row, alignment, bubble styles, contrast

## Non-goals (per ticket)

- Full theming system.
- Chat backend / agent logic changes.
- New chat features (reactions, editing, threads).
