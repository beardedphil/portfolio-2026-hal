# Decisions: Dark Mode Implementation (0078)

## Design decisions

1. **Theme storage**
   - Used localStorage with key `hal-theme` to persist theme preference
   - Default to 'light' if no stored preference exists

2. **CSS variable approach**
   - Used CSS custom properties (variables) for all colors
   - Applied dark theme via `[data-theme="dark"]` selector on document root
   - This allows easy theme switching without JavaScript manipulation of individual elements

3. **Theme application timing**
   - Added script in `index.html` to apply theme before React renders
   - This prevents a flash of light theme when dark theme is selected
   - React then applies theme on mount to ensure consistency

4. **Kanban iframe communication**
   - Used postMessage to send theme changes to Kanban iframe
   - Kanban listens for `HAL_THEME_CHANGE` messages and applies theme
   - Theme is sent both when theme changes and when iframe loads

5. **Theme toggle UI**
   - Placed toggle button in HAL header for easy access
   - Button shows icon (🌙/☀️) and text (Dark/Light) for clarity
   - Button uses header styling with semi-transparent background

6. **Diagnostics display**
   - Shows current theme and source (default vs saved)
   - Helps with debugging theme issues

## No unrequested changes

All changes are directly related to implementing dark mode as specified in the ticket.
