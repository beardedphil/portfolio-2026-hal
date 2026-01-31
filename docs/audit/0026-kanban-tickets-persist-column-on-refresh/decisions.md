# Decisions: 0026 - Kanban tickets persist column on refresh

- **Optimistic update + delayed refetch:** We could have tried “refetch after a short delay” without optimistic update, but then the UI would not update until after the delay. Optimistic update gives instant feedback; delayed refetch (1.5s) avoids overwriting with a stale read while still syncing with the server. The existing 10s poll continues to reconcile state.

- **1.5s delay:** Chosen so typical DB write visibility is reached before we refetch. No change to polling interval.

- **Refetch on failure:** If the Supabase update fails, we immediately refetch so the board matches server state and the user sees the reverted position rather than a stuck optimistic state.
