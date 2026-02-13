-- Ticket 0134: Process Review results storage
--
-- Goal:
-- - Store Process Review results (suggestions, justifications, status, timestamp)
-- - Link reviews to tickets via ticket_pk
-- - Support one review per ticket (latest review is the current one)
-- - Enable UI to display last-run status and suggestions with justifications

create extension if not exists pgcrypto;

create table if not exists public.process_reviews (
  review_id uuid primary key default gen_random_uuid(),
  
  -- Link to ticket
  ticket_pk uuid not null,
  repo_full_name text not null,
  
  -- Review results: structured suggestions with justifications
  suggestions jsonb not null default '[]'::jsonb,
  -- Format: [{"text": "suggestion text", "justification": "why this helps"}]
  
  -- Status: success | failed
  status text not null default 'success',
  
  -- Error message (if status is 'failed')
  error_message text,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint process_reviews_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade
);

-- Indexes for efficient queries
create index if not exists process_reviews_ticket_idx
  on public.process_reviews (ticket_pk, created_at desc);

create index if not exists process_reviews_repo_idx
  on public.process_reviews (repo_full_name, created_at desc);

-- Auto-update updated_at timestamp
create or replace function public.process_reviews_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists process_reviews_touch on public.process_reviews;
create trigger process_reviews_touch
before update on public.process_reviews
for each row execute function public.process_reviews_touch_updated_at();

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.process_reviews enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on process_reviews" on public.process_reviews;
create policy "Allow all operations on process_reviews"
  on public.process_reviews
  for all
  using (true)
  with check (true);
