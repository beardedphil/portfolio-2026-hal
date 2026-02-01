# Changed Files: Supabase-only ticket storage (0065)

## Modified

- `projects/kanban/src/App.tsx`
  - Removed all file system mode state and handlers
  - Updated to Supabase-only mode for ticket loading, detail modal, drag-and-drop
  - Updated diagnostics UI to show Supabase-only mode and connection errors

- `vite.config.ts`
  - Removed docs/tickets fallbacks in implementation agent ticket fetching
  - Removed docs/tickets fallbacks in QA agent ticket fetching
  - Updated error messages to require Supabase connection

- `projects/hal-agents/src/agents/projectManager.ts`
  - Removed docs/tickets fallback from `fetch_ticket_content` tool
  - Updated tool description to indicate Supabase-only mode

- `scripts/sync-tickets.js`
  - Removed DB→Docs writes (no longer writing to docs/tickets/*.md)
  - Made docs/tickets check optional (migration-only mode)
  - Updated comments to indicate migration-only purpose
