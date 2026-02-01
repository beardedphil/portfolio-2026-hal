# Decisions (0042-cursor-api-config-status-panel)

## Decision 1: Follow Supabase status panel pattern
**Decision:** Implement the Cursor API config status panel using the exact same pattern as the existing Supabase status panel.

**Reason:** Consistency with existing codebase patterns makes the code easier to maintain and understand. The Supabase status panel already provides a good template for displaying configuration status.

**Alternatives considered:** Creating a new pattern, but this would add unnecessary complexity.

---

## Decision 2: Status values: "Not Configured" vs "Disconnected"
**Decision:** Use "Not Configured" when env vars are missing, "Disconnected" when env vars are present but not connected.

**Reason:** This matches the ticket requirements and provides clear distinction between missing configuration and configured but not connected state.

**Alternatives considered:** Using only "Disconnected" for both cases, but this would be less informative.

---

## Decision 3: Display-only implementation (no actual API calls)
**Decision:** Implement only the status display without actual Cursor API connection logic.

**Reason:** The ticket explicitly states this is a non-goal ("Actual Cursor API integration/functionality"). The status panel is meant to show configuration status, not to establish connections.

**Alternatives considered:** Implementing connection logic, but this is out of scope for this ticket.

---

## Decision 4: Environment variable names
**Decision:** Use `VITE_CURSOR_API_URL` and `VITE_CURSOR_API_KEY` following the Vite convention.

**Reason:** Consistent with existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pattern. Vite requires the `VITE_` prefix for env vars exposed to the frontend.

**Alternatives considered:** Using different naming, but this would break consistency.

---

## Decision 5: Last check time tracking
**Decision:** Track last check time using `useState` and update it via `useEffect` when env vars change.

**Reason:** Simple and effective way to show when the configuration was last evaluated. Updates automatically when env vars change, providing useful feedback.

**Alternatives considered:** Not tracking last check time, but this reduces visibility into when the status was last evaluated.
