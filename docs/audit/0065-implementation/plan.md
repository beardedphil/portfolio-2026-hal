# Plan: Supabase-only ticket storage (0065)

## Approach

1. **Remove file system mode from Kanban App.tsx**
   - Remove all `ticketStore*` state variables
   - Remove file system connection handlers (`_handleConnectProject`, `refreshTicketStore`)
   - Remove file system ticket loading logic
   - Update `columnsForDisplay` and `cardsForDisplay` to only use Supabase
   - Update detail modal to only fetch from Supabase (remove docs/tickets fallback)
   - Update drag-and-drop handlers to only work with Supabase
   - Remove file system mode UI buttons and debug sections

2. **Update vite.config.ts implementation/QA agents**
   - Remove fallback to `docs/tickets` in ticket fetching
   - Require Supabase connection for ticket access
   - Update error messages to indicate Supabase-only mode

3. **Update projectManager.ts**
   - Remove fallback to `docs/tickets` from `fetch_ticket_content` tool
   - Update tool description to indicate Supabase-only

4. **Update sync-tickets.js**
   - Remove DB→Docs writes (no longer writing to `docs/tickets/*.md`)
   - Make `docs/tickets` check optional (migration-only mode)
   - Update comments to indicate migration-only purpose

5. **Update diagnostics UI**
   - Show "Supabase-only" mode indicator
   - Show clear error if Supabase not configured
   - Remove file system mode debug sections

6. **Update rules/docs (if needed)**
   - Note that `docs/tickets/*.md` is no longer used by the app
   - Update references to reflect Supabase-only mode

## File touchpoints

- `projects/kanban/src/App.tsx` - Remove file system mode, update to Supabase-only
- `vite.config.ts` - Remove docs/tickets fallbacks in implementation/QA agents
- `projects/hal-agents/src/agents/projectManager.ts` - Remove docs/tickets fallback
- `scripts/sync-tickets.js` - Remove DB→Docs writes, mark as migration-only
