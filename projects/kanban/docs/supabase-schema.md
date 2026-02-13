# Supabase Schema (0020)

Run these in the Supabase SQL editor when setting up a new project.

## tickets (0011)

```sql
create table if not exists public.tickets (
  id text primary key,
  filename text not null,
  title text not null,
  body_md text not null,
  kanban_column_id text null,
  kanban_position int null,
  kanban_moved_at timestamptz null,
  updated_at timestamptz not null default now()
);
```

## kanban_columns (0020)

```sql
create table if not exists public.kanban_columns (
  id text primary key,
  title text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

When `kanban_columns` is empty, the app initializes it with: Unassigned, To-do, Doing, Done (positions 0–3).

## process_reviews (0134)

```sql
create table if not exists public.process_reviews (
  id uuid primary key default gen_random_uuid(),
  ticket_pk text not null,
  ticket_id text,
  suggestions jsonb not null default '[]'::jsonb,
  status text not null, -- 'success' or 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_ticket foreign key (ticket_pk) references public.tickets(pk) on delete cascade
);

create index if not exists idx_process_reviews_ticket_pk on public.process_reviews(ticket_pk);
create index if not exists idx_process_reviews_created_at on public.process_reviews(created_at desc);

alter table public.process_reviews enable row level security;

create policy "Allow all operations on process_reviews" on public.process_reviews
  for all
  using (true)
  with check (true);
```

Stores Process Review results with timestamp and status for each ticket review.
