# Changed Files

## Modified

- `scripts/sync-tickets.js`
  - Added `normalizeTitleLineInBody` function to ensure Title line has format `<ID> — <title>`
  - Updated `serializeDocWithKanban` to normalize Title line when writing docs from DB
  - Updated docs→DB sync to normalize Title line before comparing/upserting

- `projects/hal-agents/src/agents/projectManager.ts`
  - Added `normalizeTitleLineInBody` function (same logic as sync-tickets.js)
  - Updated `create_ticket` tool to normalize Title line in body_md before inserting
  - Updated `update_ticket_body` tool to normalize Title line before updating

- `projects/kanban/src/App.tsx`
  - Added `normalizeTitleLineInBody` function with diagnostics support
  - Updated `extractTitleFromContent` to strip ID prefix when extracting title for display
  - Updated `refetchSupabaseTickets` to normalize all tickets on fetch, update DB if needed, and show diagnostics
  - Updated ticket detail modal to normalize Title line when opening a ticket (both Supabase and file system)

- `docs/templates/ticket.template.md`
  - Updated Title line format documentation to show ID prefix format
