-- Ticket HAL-0755: Create table for pinned artifacts in Context Bundles
--
-- Goal:
-- - Store user preferences for which artifacts should be pinned (always included) in context bundles
-- - Support per-ticket, per-role pinning
-- - Enable deterministic artifact selection with pinned boost

-- Create context_bundle_pins table
create table if not exists context_bundle_pins (
  pin_id uuid primary key default gen_random_uuid(),
  ticket_pk uuid not null,
  artifact_id uuid not null,
  role text, -- null means pinned for all roles, or specific role like 'implementation-agent'
  created_at timestamptz not null default now(),
  created_by text, -- Actor/agent identifier (e.g., 'user:uuid')
  
  -- Foreign key to tickets table
  constraint context_bundle_pins_ticket_fk foreign key (ticket_pk) references tickets(pk) on delete cascade,
  
  -- Foreign key to agent_artifacts table
  constraint context_bundle_pins_artifact_fk foreign key (artifact_id) references agent_artifacts(artifact_id) on delete cascade,
  
  -- Ensure one pin per artifact per ticket per role (or null role for all roles)
  constraint context_bundle_pins_ticket_artifact_role_key unique (ticket_pk, artifact_id, role)
);

-- Indexes for common queries
create index if not exists idx_context_bundle_pins_ticket on context_bundle_pins(ticket_pk);
create index if not exists idx_context_bundle_pins_artifact on context_bundle_pins(artifact_id);
create index if not exists idx_context_bundle_pins_role on context_bundle_pins(role);
create index if not exists idx_context_bundle_pins_ticket_role on context_bundle_pins(ticket_pk, role);

-- Enable RLS (Row Level Security)
alter table context_bundle_pins enable row level security;

-- Policy: Allow anon users to read pins (for browsing)
create policy "Allow anon read context bundle pins"
  on context_bundle_pins
  for select
  using (true);

-- Policy: Allow anon users to insert pins (for creation)
create policy "Allow anon insert context bundle pins"
  on context_bundle_pins
  for insert
  with check (true);

-- Policy: Allow anon users to delete pins (for unpinning)
create policy "Allow anon delete context bundle pins"
  on context_bundle_pins
  for delete
  using (true);

-- Note: Updates are not needed (pins are created/deleted, not updated).
-- Service role key bypasses RLS, so server APIs using service role can perform all operations.
