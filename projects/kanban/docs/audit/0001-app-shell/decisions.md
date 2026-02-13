# Decisions (0001-app-shell)

## Scaffold in place
- **Decision:** Create Vite + React + TS files manually in repo root instead of `npm create vite` in a subfolder.
- **Reason:** `npm create vite .` cancelled in non-empty directory; manual creation avoided overwriting `.cursor` and `docs`.

## Dependency versions
- **Decision:** Use React 18.3.x and Vite 6.x (not latest React 19 / Vite 7).
- **Reason:** Broader compatibility and stable typings; sufficient for the required features.

## Debug toggle as button
- **Decision:** Use a single button for the Debug toggle (label "Debug ON" / "Debug OFF") instead of a switch component.
- **Reason:** No UI library; a native button is minimal and meets "button or switch" in the prompt.

## Action log scope
- **Decision:** Keep last 20 action log entries; each entry has id, message, and timestamp.
- **Reason:** "Most recent UI actions" satisfied without unbounded growth; IDs via `Date.now()` for uniqueness.

## Error section
- **Decision:** Add React state `runtimeError` and a section that shows it or "No errors."; no error boundary or global handler yet.
- **Reason:** Prompt allows "ok if empty for now"; UI and state are in place for future wiring.

## Styling
- **Decision:** One global CSS file (`src/index.css`), no Tailwind or component CSS files.
- **Reason:** "Minimal but readable" and smallest footprint.
