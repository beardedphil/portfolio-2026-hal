# Worklog (0021-fix-column-reorder-snapback)

## 1. Analysis
- Confirmed `columnsForDisplay` and `handleDragEnd` column branch both use same source: `ticketStoreConnected ? ticketColumns : columns` (Supabase mode skips column reorder).
- Two likely causes: (1) stale closure — `cols` read at callback run could be outdated; (2) drop target — when dropping over a column that has cards, collision may return a card id, so `cols.findIndex(c => c.id === effectiveOverId)` is -1 and reorder is skipped (snap-back).

## 2. Column reorder fix in handleDragEnd
- Resolved drop target to column id: `overColumnId = isColumnId(effectiveOverId) ? effectiveOverId : findColumnByCardId(String(effectiveOverId))?.id`. If `overColumnId == null`, log "Column reorder skipped: drop target could not be resolved to a column" and return.
- Replaced direct state update with functional update: `setCols((prev) => { const oldIndex = prev.findIndex(...); const newIndex = prev.findIndex(...); if (...) return prev; const next = arrayMove(prev, oldIndex, newIndex); addLog(...); return next; })`. Ensures update uses latest state and avoids stale closure overwriting.

## 3. Diagnostics
- Success path: existing log "Columns reordered: A,B,C -> B,A,C" kept.
- Skip path: new log "Column reorder skipped: drop target could not be resolved to a column" when over target cannot be resolved (in-app diagnostics per ticket).

## 4. Audit artifacts
- Created `docs/audit/0021-fix-column-reorder-snapback/` with plan.md, worklog.md, changed-files.md, decisions.md, verification.md.
