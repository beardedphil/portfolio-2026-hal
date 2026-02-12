# Decisions (0006-fix-add-column-button-styling)

## Fix via CSS only
- **Decision:** Fix the regression by overriding focus and tap-highlight styles on `.add-column-btn` in CSS; no DOM or JSX changes.
- **Reason:** App.tsx already has a single `<button className="add-column-btn">` with no nested buttons. The "nested-looking orange" is from browser default focus outline or tap-highlight, not invalid markup.

## Remove default focus outline
- **Decision:** Use `.add-column-btn:focus { outline: none; -webkit-tap-highlight-color: transparent; }` to remove the default focus ring and tap highlight.
- **Reason:** Eliminates the orange/secondary box that appears inside the black button; keeps the button as one visual unit.

## Keep keyboard focus visible
- **Decision:** Use `.add-column-btn:focus-visible` with `outline: 2px solid rgba(255,255,255,0.8); outline-offset: 2px` for keyboard focus.
- **Reason:** Accessibility: keyboard users still get a clear focus indicator that is consistent with the button (white outline, no nested look).

## No changes to other buttons
- **Decision:** Do not change Debug toggle, Create, Cancel, or Remove button styles.
- **Reason:** Ticket: "No other button styles regress"; scope is Add column button only.
