# Decisions: Smooth and responsive chat↔kanban resizer (0076)

## Design decisions

### requestAnimationFrame for smooth updates
- **Decision**: Use requestAnimationFrame loop instead of direct state updates in mousemove handler
- **Rationale**: requestAnimationFrame syncs with browser repaint cycle, ensuring smooth 60fps updates without jitter
- **Implementation**: Mouse position stored in ref for immediate updates, width state updated in animation frame
- **Trade-off**: Slightly more complex code, but significantly smoother visual experience

### Mouse position in ref vs state
- **Decision**: Store mouse position in `mouseXRef` ref, not state
- **Rationale**: Mouse position updates very frequently (potentially hundreds per second); using ref avoids unnecessary re-renders
- **Width state**: Still uses state because it needs to trigger re-renders for layout updates

### Inline display calculation
- **Decision**: Calculate percentage inline in render function during drag
- **Rationale**: Percentage needs to update in real-time; calculating in render ensures it's always current
- **Performance**: Acceptable because calculation is simple and only runs when dragging (diagnostics panel open)

### Diagnostics display location
- **Decision**: Add width diagnostics to existing Diagnostics panel, plus inline overlay on divider
- **Rationale**: Diagnostics panel provides detailed info for debugging; inline overlay provides immediate visual feedback during drag
- **User experience**: Both displays help verify smooth operation - diagnostics for detailed numbers, overlay for quick visual confirmation

### Event listener options
- **Decision**: Use `{ passive: true }` for mousemove listener
- **Rationale**: Passive listeners improve scroll performance; mousemove doesn't need to preventDefault
- **Note**: mouseup listener remains non-passive in case we need to prevent default behavior

### Animation frame cleanup
- **Decision**: Cancel animation frame in cleanup function and on mouseup
- **Rationale**: Prevents memory leaks and ensures animation stops immediately when drag ends
- **Safety**: Multiple cleanup points (mouseup handler, effect cleanup) ensure frame is always cancelled
