# Decisions: 0027 - Chat UI: make user vs assistant messages clearly distinguishable

## D1: "You" vs "HAL" labels

- **Decision**: User messages show "You"; assistant messages (project-manager, implementation-agent) show "HAL"; system shows "System".
- **Why**: Ticket explicitly suggests "You" vs "HAL". Single "HAL" label unifies all agent responses; users understand they're chatting with HAL regardless of which agent tab is selected.

## D2: User bubble: accent gradient

- **Decision**: User messages use a purple gradient bubble (#7c5ee8 → #6b4ce6) with white text.
- **Why**: High contrast, immediately distinguishable from assistant; aligns with HAL purple palette from ticket 0024.

## D3: Assistant bubble: neutral surface

- **Decision**: Assistant messages use white/surface background with border; author label in primary color.
- **Why**: Neutral treatment per implementation notes; avoids competing with user accent; primary author label provides clear authorship cue.

## D4: Message-row + inner message structure

- **Decision**: Outer `message-row` controls alignment (flex); inner `message` is the visual bubble.
- **Why**: Clean separation of layout vs presentation; supports right/left/center without duplicating bubble styles.

## D5: Typing indicator matches assistant

- **Decision**: Typing indicator uses `message-row-typing`, left-aligned, "HAL" label, same bubble style as assistant.
- **Why**: Ticket says typing should "visually match the assistant side"; user expects the next message to be from HAL.

## D6: Code blocks retain distinct background

- **Decision**: `.message-json` (and inline code in future) uses surface-alt background, border, overflow-x for scroll.
- **Why**: Ticket requires code blocks remain readable; distinct background aids scanning.

## Unrequested changes

- None.
