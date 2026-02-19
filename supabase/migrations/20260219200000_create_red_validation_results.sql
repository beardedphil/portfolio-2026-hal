-- Ticket HAL-0758: Create table to store RED validation results
--
-- Goal:
-- - Store validation results alongside RED versions
-- - Track validation timestamp and status
-- - Store failure details for display

-- Create hal_red_validation_results table
create table if not exists hal_red_validation_results (
  validation_id uuid primary key default gen_random_uuid(),
  red_id uuid not null,
  repo_full_name text not null,
  ticket_pk uuid not null,
  version integer not null,
  pass boolean not null,
  failures jsonb not null default '[]'::jsonb,
  validated_at timestamptz not null default now(),
  
  -- Foreign key to RED document
  constraint hal_red_validation_results_red_fk foreign key (red_id) references hal_red_documents(red_id) on delete cascade,
  
  -- Ensure one validation result per RED version (latest validation overwrites previous)
  constraint hal_red_validation_results_red_unique unique (red_id)
);

-- Indexes for common queries
create index if not exists idx_hal_red_validation_results_red_id on hal_red_validation_results(red_id);
create index if not exists idx_hal_red_validation_results_ticket_pk on hal_red_validation_results(ticket_pk);
create index if not exists idx_hal_red_validation_results_validated_at on hal_red_validation_results(validated_at desc);

-- Enable RLS (Row Level Security)
alter table hal_red_validation_results enable row level security;

-- Policy: Allow anon users to read validation results
create policy "Allow anon read red validation results"
  on hal_red_validation_results
  for select
  using (true);

-- Policy: Allow anon users to insert/update validation results
create policy "Allow anon insert/update red validation results"
  on hal_red_validation_results
  for all
  with check (true);

-- Note: Service role key bypasses RLS, so server APIs using service role can perform all operations.
