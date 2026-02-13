# Plan (0006-fix-add-column-button-styling)

## Goal
Restore the Add Column button so it renders as a single, clean button with no nested-looking orange background/border artifacts.

## Steps

1. **Identify cause**
   - Suspected: browser default focus outline (often orange/amber) or tap-highlight creating a "nested" look inside the dark button.
   - Confirm DOM: Add column is a single `<button className="add-column-btn">` with no nested buttons (already valid in App.tsx).

2. **Override focus/tap styles**
   - In `index.css`, add `.add-column-btn:focus { outline: none; -webkit-tap-highlight-color: transparent; }` to remove default focus ring and tap highlight.
   - Add `.add-column-btn:focus-visible { outline: 2px solid rgba(255,255,255,0.8); outline-offset: 2px; }` so keyboard focus still has a single, consistent indicator.

3. **Verify**
   - No nested buttons; no other button styles regress (Debug toggle, Create, Cancel, Remove).
   - Add column button appears as one button on load, hover, and click; add-column form still opens.

4. **Audit artifacts**
   - Create `docs/audit/0006-fix-add-column-button-styling/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- New features; restyling beyond fixing the regression.
