# Plan: Smooth and responsive chat↔kanban resizer (0076)

## Goal
Make the chat↔kanban draggable resizer smooth and responsive so it tracks the pointer correctly.

## Approach

1. **Improve drag handler with requestAnimationFrame**
   - Replace direct state updates in mousemove handler with requestAnimationFrame loop
   - Store mouse position in ref for immediate updates
   - Use animation frame to update width state smoothly

2. **Add diagnostics display**
   - Add chat width (px) and percentage to Diagnostics panel
   - Add resizer dragging status indicator
   - Calculate percentage dynamically from container width

3. **Add inline width display during drag**
   - Show width percentage overlay on divider while dragging
   - Position overlay centered on divider
   - Style with primary color for visibility

4. **Ensure smooth tracking**
   - Use passive event listeners for mousemove
   - Cancel animation frame on cleanup
   - Ensure width updates continuously during drag

## File touchpoints

- `src/App.tsx`: Update resizer drag handler, add diagnostics, add inline display
- `src/index.css`: Add styles for inline width display overlay
