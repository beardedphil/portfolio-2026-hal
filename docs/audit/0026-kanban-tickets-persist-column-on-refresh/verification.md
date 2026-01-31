# Verification: 0026 - Kanban tickets persist column on refresh

## UI-Only Verification Checklist

### Pre-requisites

- Kanban (or HAL with Kanban) running; project folder connected so Supabase board is active.
- Several tickets on the board.

### Test: Move tickets then refresh

1. Move two or three tickets to different columns (e.g. To-do → Doing, Doing → Done).
2. Refresh the page (F5).
3. **Pass:** All tickets remain in the columns where they were placed; none appear back in the previous column.

### Test: Reorder within column then refresh

1. Reorder a ticket within the same column (e.g. move it up or down in To-do).
2. Refresh the page (F5).
3. **Pass:** The ticket stays in the new position within that column.

### Test: Quick successive moves then refresh

1. Move ticket A to a column, then immediately move ticket B to another column, then refresh.
2. **Pass:** Both A and B remain in their new columns after refresh.
