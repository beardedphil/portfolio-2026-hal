# PM Review: Dark Mode Implementation (0078)

## Likelihood of success: 95%

The implementation follows standard patterns for theme switching and should work reliably. The main risk is ensuring all UI elements are properly styled for dark mode.

## Potential failures and diagnosis

1. **Theme not persisting after refresh**
   - **Likelihood**: Low (5%)
   - **Diagnosis**: Check Diagnostics panel → Theme row should show "saved" as source. If it shows "default", localStorage may be disabled or blocked.
   - **In-app check**: Open Diagnostics, verify theme source shows "saved" after switching themes

2. **Kanban iframe not switching themes**
   - **Likelihood**: Medium (15%)
   - **Diagnosis**: Check if Kanban iframe is loaded (Diagnostics → Kanban loaded: true). Verify postMessage is being sent (browser DevTools → Network → WS or Console).
   - **In-app check**: Switch theme and verify Kanban board colors change. If not, check browser console for postMessage errors.

3. **Flash of light theme on page load (dark mode selected)**
   - **Likelihood**: Low (5%)
   - **Diagnosis**: Check if script in index.html is executing before React renders. Verify theme is applied to document root immediately.
   - **In-app check**: Hard refresh (Cmd+Shift+R) and watch for flash. Should be minimal or none.

4. **Some UI elements not styled for dark mode**
   - **Likelihood**: Medium (10%)
   - **Diagnosis**: Check if specific elements use hardcoded colors instead of CSS variables. Look for elements that don't change when switching themes.
   - **In-app check**: Switch themes and visually inspect all UI elements. All should change colors appropriately.

5. **Theme toggle button not visible or not working**
   - **Likelihood**: Low (3%)
   - **Diagnosis**: Check if button is rendered in header. Verify click handler is attached. Check browser console for errors.
   - **In-app check**: Button should be visible in header. Click should immediately switch themes.

## Verification priority

1. Theme toggle works and is visible
2. Theme persists after refresh
3. Kanban switches themes correctly
4. Diagnostics show correct theme info
5. No UI elements are unreadable in dark mode
