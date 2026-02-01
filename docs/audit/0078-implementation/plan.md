# Plan: Dark Mode Implementation (0078)

## Approach

1. **Theme state management**
   - Add `Theme` type ('light' | 'dark')
   - Initialize theme from localStorage or default to 'light'
   - Persist theme changes to localStorage

2. **CSS variables for dark mode**
   - Add dark theme CSS variables to `src/index.css` using `[data-theme="dark"]` selector
   - Update Kanban CSS to use CSS variables for dark mode support
   - Ensure all color values use CSS variables

3. **Theme toggle UI**
   - Add theme toggle button in HAL header
   - Button shows current theme and allows switching
   - Update button text/icon based on current theme

4. **Theme persistence and application**
   - Apply theme to document root on mount and changes
   - Add script in `index.html` to apply theme before React renders (prevent flash)
   - Send theme to Kanban iframe via postMessage when theme changes or iframe loads

5. **Diagnostics**
   - Add theme and themeSource to DiagnosticsInfo type
   - Display theme info in Diagnostics panel showing current theme and source (default vs saved)

## File touchpoints

- `src/App.tsx` - Theme state, toggle handler, diagnostics, iframe messaging
- `src/index.css` - Dark mode CSS variables
- `index.html` - Initial theme application script
- `projects/kanban/src/App.tsx` - Theme message listener
- `projects/kanban/src/index.css` - Dark mode CSS variables and variable usage
