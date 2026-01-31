# Decisions: 0030 - Ticket list: add Delete button and sync deletion to filesystem

## Delete via API, then sync

Deletion flow: user clicks Delete → confirm → kanban calls POST /api/tickets/delete → server deletes from Supabase → server runs sync-tickets → sync removes local file. Same pattern as create_ticket + sync after creation.

## Sync script deletes orphaned local files

For ticket IDs that exist in docs but not in Supabase (e.g. after a delete), sync-tickets.js now removes the local markdown file. Scoped to docs/tickets/ only; no unrelated files deleted.

## Confirmation required

Window.confirm before deletion to prevent accidental deletes. Ticket requires explicit user confirmation.

## HAL API base URL

Kanban runs on port 5174, HAL on 5173. Kanban calls http://localhost:5173/api/tickets/delete. Configurable via VITE_HAL_API_URL for different environments.

## CORS for cross-origin delete

tickets-delete endpoint sets Access-Control-Allow-Origin: * so the kanban iframe (5174) can call the HAL server (5173).
