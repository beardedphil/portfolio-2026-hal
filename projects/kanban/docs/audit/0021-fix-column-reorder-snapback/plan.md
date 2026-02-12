# Plan (0021-fix-column-reorder-snapback)

## Goal
When a user drags a column to reorder it, the new order should persist in UI (no snap-back on drop).

## Steps

1. **Identify cause of snap-back**
   - Confirm source of truth: `columnsForDisplay` is `ticketStoreConnected ? ticketColumns : columns` (or Supabase); same list is updated in `handleDragEnd` via `setCols`. Snap-back can be: (a) stale closure so `setCols(next)` uses old `cols` and is overwritten by a later update, or (b) drop target resolved to wrong id (e.g. card id) so reorder is skipped and UI snaps back.

2. **Fix column reorder in handleDragEnd**
   - Resolve drop target to column id: when `active` is a column, `effectiveOverId` may be a card id (dropping over a column body). Resolve to column id via `isColumnId(effectiveOverId)` or `findColumnByCardId(effectiveOverId)?.id`.
   - Use functional state update: `setCols((prev) => { ... return arrayMove(prev, oldIndex, newIndex) })` so the update always uses the latest state and is not overwritten by stale closure.
   - Keep existing `addLog` for success; add log when reorder is skipped (e.g. "drop target could not be resolved to a column") for in-app diagnostics.

3. **Verification**
   - In a mode where column reordering is allowed (local columns or docs ticket store, not Supabase fixed columns), drag a column to a new position and drop; column stays in new position.
   - Smoke: card DnD still works.
   - Debug / Action Log shows reorder entry or clear skip message.

4. **Audit artifacts**
   - Create `docs/audit/0021-fix-column-reorder-snapback/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Full column order persistence (e.g. docs ticket store column order) — separate ticket 0020 for Supabase; this ticket is UI-only fix so order doesn’t snap back after drop.
