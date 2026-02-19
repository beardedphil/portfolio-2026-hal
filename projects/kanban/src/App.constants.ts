/**
 * Constants extracted from App.tsx for better organization
 */

import type { Card, Column } from './lib/columnTypes'

export const SUPABASE_CONFIG_KEY = 'supabase-ticketstore-config'
export const CONNECTED_REPO_KEY = 'hal-connected-repo'
/** Polling interval when Supabase board is active (0013); 10s */
export const SUPABASE_POLL_INTERVAL_MS = 10_000
/** Safety polling interval when realtime is connected (0703); 60s - low-frequency fallback */
export const SUPABASE_SAFETY_POLL_INTERVAL_MS = 60_000
/** Delay before refetch after a move so DB write is visible; avoids stale read overwriting last moves (0144) */
export const REFETCH_AFTER_MOVE_MS = 2000 // Increased from 1500ms to give backend more time to persist
/** Delay before reverting optimistic update on move failure (0790); gives slow HAL API moves time to succeed */
export const ROLLBACK_AFTER_FAILURE_MS = 10000 // 10 seconds - configurable delay before reverting failed moves
/** BroadcastChannel name for cross-tab communication (0703) */
export const KANBAN_BROADCAST_CHANNEL = 'hal-kanban-sync'

export const _SUPABASE_SETUP_SQL = `create table if not exists public.tickets (
  id text primary key,
  filename text not null,
  title text not null,
  body_md text not null,
  kanban_column_id text null,
  kanban_position int null,
  kanban_moved_at timestamptz null,
  updated_at timestamptz not null default now()
);`

/** ticket_attachments table (0092): stores file attachments for tickets */
export const _SUPABASE_TICKET_ATTACHMENTS_SETUP_SQL = `create table if not exists public.ticket_attachments (
  pk uuid primary key default gen_random_uuid(),
  ticket_pk text not null,
  ticket_id text not null,
  filename text not null,
  mime_type text not null,
  data_url text not null,
  file_size int,
  created_at timestamptz not null default now(),
  constraint fk_ticket foreign key (ticket_id) references public.tickets(id) on delete cascade
);`

/** kanban_columns table (0020); run in Supabase SQL editor if missing */
export const _SUPABASE_KANBAN_COLUMNS_SETUP_SQL = `create table if not exists public.kanban_columns (
  id text primary key,
  title text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);`

/** Default columns to seed when kanban_columns is empty (0020); backward-compatible IDs */
export const DEFAULT_KANBAN_COLUMNS_SEED = [
  { id: 'col-unassigned', title: 'Unassigned', position: 0 },
  { id: 'col-todo', title: 'To-do', position: 1 },
  { id: 'col-doing', title: 'Doing', position: 2 },
  { id: 'col-qa', title: 'Ready for QA', position: 3 },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', position: 4 },
  { id: 'col-process-review', title: 'Process Review', position: 5 },
  { id: 'col-done', title: 'Done', position: 6 },
  { id: 'col-wont-implement', title: 'Will Not Implement', position: 7 },
] as const

export const DEFAULT_COLUMNS: Column[] = [
  { id: 'col-unassigned', title: 'Unassigned', cardIds: [] },
  { id: 'col-todo', title: 'To-do', cardIds: ['c-1', 'c-2', 'c-3'] },
  { id: 'col-doing', title: 'Doing', cardIds: ['c-4', 'c-5', 'c-6'] },
  { id: 'col-qa', title: 'Ready for QA', cardIds: [] },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: [] },
  { id: 'col-process-review', title: 'Process Review', cardIds: [] },
  { id: 'col-done', title: 'Done', cardIds: ['c-7', 'c-8', 'c-9'] },
  { id: 'col-wont-implement', title: 'Will Not Implement', cardIds: [] },
]

export const EMPTY_KANBAN_COLUMNS: Column[] = [
  { id: 'col-unassigned', title: 'Unassigned', cardIds: [] },
  { id: 'col-todo', title: 'To-do', cardIds: [] },
  { id: 'col-doing', title: 'Doing', cardIds: [] },
  { id: 'col-qa', title: 'Ready for QA', cardIds: [] },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: [] },
  { id: 'col-process-review', title: 'Process Review', cardIds: [] },
  { id: 'col-done', title: 'Done', cardIds: [] },
  { id: 'col-wont-implement', title: 'Will Not Implement', cardIds: [] },
]

export const INITIAL_CARDS: Record<string, Card> = {
  'c-1': { id: 'c-1', title: 'Card A' },
  'c-2': { id: 'c-2', title: 'Card B' },
  'c-3': { id: 'c-3', title: 'Card C' },
  'c-4': { id: 'c-4', title: 'Card D' },
  'c-5': { id: 'c-5', title: 'Card E' },
  'c-6': { id: 'c-6', title: 'Card F' },
  'c-7': { id: 'c-7', title: 'Card G' },
  'c-8': { id: 'c-8', title: 'Card H' },
  'c-9': { id: 'c-9', title: 'Card I' },
}
