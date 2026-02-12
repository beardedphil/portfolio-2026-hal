# Decisions (0016-widen-board-remove-columns-heading)

## Widen by removing #root max-width
- **Decision:** Remove `max-width: 640px` and `margin: 0 auto` from `#root` in `src/index.css`. Do not introduce a separate wrapper or class for "board only" width.
- **Rationale:** Ticket: "The page content is no longer constrained to a narrow middle strip; the board uses most of the viewport width." Implementation notes point to `#root { max-width: 640px; margin: 0 auto; }`. Simplest change is to remove the constraint so the whole app (including board) uses full width; existing `padding: 2rem` provides reasonable margins.

## Remove "Columns" heading only
- **Decision:** Remove the `<h2>Columns</h2>` element from the board section. Keep `<section className="columns-section" aria-label="Columns">` so the section remains labeled for accessibility.
- **Rationale:** Ticket: "The 'Columns' heading/title is removed from the UI (the board still renders columns and cards normally)." No redesign; only remove the redundant visible title.

## Remove .columns-section h2 CSS
- **Decision:** Delete the `.columns-section h2 { font-size: 1.1rem; margin: ... }` rule from `src/index.css` after removing the heading.
- **Rationale:** Dead code cleanup; no other h2 in that section.
