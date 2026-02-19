-- Ticket HAL-0769: Enforce RLS on tickets table to block anon writes to kanban fields
--
-- Goal:
-- - Enable RLS on tickets table
-- - Allow anon users to read tickets (for browsing)
-- - Block anon users from writing kanban fields (kanban_column_id, kanban_position, kanban_moved_at)
-- - Allow service role (server APIs) to perform all operations
--
-- This ensures that:
-- - UI remains read-only for writes (must use server API)
-- - Server APIs (using service role) can still update tickets
-- - Users see clear errors when direct writes are attempted

-- Enable RLS on tickets table
alter table public.tickets enable row level security;

-- Policy: Allow anon users to read all tickets (for browsing)
create policy "Allow anon read tickets"
  on public.tickets
  for select
  using (true);

-- Policy: Allow anon users to update tickets, but NOT kanban fields
-- This policy allows updates to other fields (like body_md) but blocks kanban fields
create policy "Allow anon update tickets (no kanban fields)"
  on public.tickets
  for update
  using (true)
  with check (
    -- Allow update if kanban fields are NOT being changed
    -- Check that NEW values for kanban fields match OLD values
    (NEW.kanban_column_id IS NOT DISTINCT FROM OLD.kanban_column_id) AND
    (NEW.kanban_position IS NOT DISTINCT FROM OLD.kanban_position) AND
    (NEW.kanban_moved_at IS NOT DISTINCT FROM OLD.kanban_moved_at)
  );

-- Policy: Allow anon users to insert tickets (for ticket creation)
create policy "Allow anon insert tickets"
  on public.tickets
  for insert
  with check (true);

-- Note: Service role key bypasses RLS, so server APIs using service role
-- can perform all operations including updating kanban fields.
