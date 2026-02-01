# Plan: 0045 - Remove redundant "Active: {active_agent}" label

## Objective

Remove redundant UI text that restates the currently selected agent. The agent dropdown already communicates the active agent; the separate "Active: …" label is unnecessary.

## Approach

1. Remove the `<span className="active-agent-label">` element from the chat header in `App.tsx`
2. Remove the orphaned `.active-agent-label` CSS from `index.css`
3. Ensure no blank gap remains where the label previously appeared (removing the element suffices; layout flows naturally)

## Scope

- **In scope**: Remove the label and its styles
- **Out of scope**: Redesigning the dropdown, changing persistence, other status labels

## Files to Change

1. `src/App.tsx` - Remove the active-agent-label span
2. `src/index.css` - Remove `.agent-selector .active-agent-label` CSS block
