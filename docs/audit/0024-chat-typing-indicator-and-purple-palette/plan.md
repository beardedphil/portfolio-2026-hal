# Plan: 0024 - Chat typing indicator + purple color palette

## Goal

Add an animated typing/thinking indicator in chat when an agent is expected to respond, and update the HAL app color palette to a purple-based, pleasant theme.

## Analysis

### Current State

- **Chat flow**: User sends message; for PM, async fetch to `/api/pm/respond`; for implementation-agent, 500ms stub delay; for standup, simulated responses at 100/300/600/900ms. No visual feedback while waiting.
- **Styling**: `index.css` uses blue (#1976d2) for primary actions, grays for surfaces, and varied accent colors. No purple theme.

### Required Changes

1. **Typing indicator**
   - Add `agentTypingTarget: ChatTarget | null` state to track which chat is waiting for a response.
   - Set when a request starts (PM: start of async; implementation-agent: before setTimeout; standup: before first setTimeout).
   - Clear when the reply is added (PM: success, error, or catch; implementation-agent: in setTimeout; standup: in last setTimeout).
   - Render a typing bubble in the transcript when `agentTypingTarget === selectedChatTarget`, styled as a message-row with "Thinking" and animated dots (bouncing, subtle).
   - Use `aria-live="polite"` for accessibility.

2. **Purple palette**
   - Define CSS variables: `--hal-primary`, `--hal-primary-hover`, `--hal-accent`, `--hal-bg`, `--hal-surface`, `--hal-surface-alt`, `--hal-border`, `--hal-border-muted`, `--hal-text`, `--hal-text-muted`, `--hal-header-bg`, `--hal-header-text`, `--hal-header-subtitle`, `--hal-chat-bg`, `--hal-typing-bg`, `--hal-typing-border`, `--hal-status-ok`, `--hal-status-error`.
   - Apply variables to header, chat region, buttons, inputs, messages, diagnostics.
   - Keep semantic colors (warning/error) readable; use variables where consistent.

## Implementation

1. **App.tsx**
   - Add `agentTypingTarget` state.
   - Set/clear in `handleSend` for all three chat targets.
   - Update transcript empty condition: show "No messages yet" only when `activeMessages.length === 0 && !agentTypingTarget`.
   - Add typing bubble JSX in transcript (after messages, when `agentTypingTarget === selectedChatTarget`).
   - Include `agentTypingTarget` in auto-scroll effect.

2. **index.css**
   - Add `:root` block with purple variables.
   - Add `.message-typing` and `.typing-bubble`, `.typing-dots`, `.typing-dot` with `@keyframes typing-bounce` animation.
   - Replace hardcoded colors with variables throughout.

## Files to Change

- `src/App.tsx` — state, handleSend logic, transcript JSX
- `src/index.css` — CSS variables, typing styles, palette application

## Non-goals (per ticket)

- Kanban board colors (HAL shell only)
- Customizable themes or user-pickable colors
- Typing indicators for agents beyond "when waiting for response"
