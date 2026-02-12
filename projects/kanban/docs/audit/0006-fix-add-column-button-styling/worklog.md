# Worklog (0006-fix-add-column-button-styling)

## 1. Cause
- Add column button in App.tsx is a single `<button type="button" className="add-column-btn">Add column</button>` — no nested buttons.
- Regression likely from browser default focus outline or tap-highlight (orange/amber) appearing inside the dark (#333) button.

## 2. CSS fix
- In `src/index.css`: added `.add-column-btn:focus { outline: none; -webkit-tap-highlight-color: transparent; }` to remove default focus ring and tap highlight.
- Added `.add-column-btn:focus-visible { outline: 2px solid rgba(255,255,255,0.8); outline-offset: 2px; }` for a single, consistent keyboard focus indicator.

## 3. Verification
- Confirmed Add column button renders as one dark button; no DOM changes in App.tsx. Other buttons (Debug toggle, Create, Cancel, Remove) unchanged.

## Commit and push
- Commit: `3f96a69`
- `git status -sb` (after push): `## main...origin/main`
