-- Migration: Create process_reviews table (0134)
-- Stores Process Review results with timestamp and status

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

-- Index for fast lookups by ticket
create index if not exists idx_process_reviews_ticket_pk on public.process_reviews(ticket_pk);
create index if not exists idx_process_reviews_created_at on public.process_reviews(created_at desc);

-- Enable RLS (Row Level Security)
alter table public.process_reviews enable row level security;

-- Policy: Allow all operations (adjust as needed for your security requirements)
create policy "Allow all operations on process_reviews" on public.process_reviews
  for all
  using (true)
  with check (true);
