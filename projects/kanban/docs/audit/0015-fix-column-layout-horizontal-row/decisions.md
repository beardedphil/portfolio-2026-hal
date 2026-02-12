# Decisions (0015-fix-column-layout-horizontal-row)

## CSS-only fix in `.columns-row`
- **Decision:** Fix layout by changing only `.columns-row` in `src/index.css`: `flex-direction: row`, `flex-wrap: nowrap`, `overflow-x: auto`. No changes to `#root`, `.columns-section`, or App.tsx.
- **Rationale:** Ticket: "Keep this task as small as possible" and implementation notes point to the columns container. Root cause was `flex-wrap: wrap` allowing columns to wrap to the next line; disabling wrap and adding horizontal overflow restores one row with scroll on narrow viewports.

## No change to `#root` max-width
- **Decision:** Leave `#root` at `max-width: 640px`. The columns row scrolls horizontally within that width when needed.
- **Rationale:** Ticket: "No unrelated styling/polish beyond restoring the intended layout." Horizontal scroll on the row satisfies "board can scroll horizontally" without widening the whole page.
