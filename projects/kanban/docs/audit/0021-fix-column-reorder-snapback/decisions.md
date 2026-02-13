# Decisions (0021-fix-column-reorder-snapback)

## Resolve drop target to column id
- **Decision:** When reordering columns, resolve `effectiveOverId` to a column id: if it is already a column id use it; otherwise use `findColumnByCardId(String(effectiveOverId))?.id` (column containing the card).
- **Reason:** Dropping a column over another column’s body can yield a card id from collision detection; `cols.findIndex(c => c.id === effectiveOverId)` then returns -1, reorder is skipped, and the column snaps back. Resolving to the containing column fixes this.

## Functional state update for column reorder
- **Decision:** Use `setCols((prev) => { ... return arrayMove(prev, oldIndex, newIndex) })` instead of reading `cols` from closure and calling `setCols(next)`.
- **Reason:** Ticket implementation notes: “the render source-of-truth doesn’t update (or a subsequent state recompute overwrites it)”. Using the updater form ensures we apply the reorder to the latest state and avoids stale closure overwriting the new order.

## Skip log for unresolved drop target
- **Decision:** When `overColumnId` is null, call `addLog('Column reorder skipped: drop target could not be resolved to a column')` and return.
- **Reason:** Ticket acceptance criteria: “In-app diagnostics (Debug / Action Log) includes a clear entry confirming reorder (or a clear error if persistence fails).” A skip is not persistence failure but a resolution failure; logging it lets verification explain behavior from within the app.
