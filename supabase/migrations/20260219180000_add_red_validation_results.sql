-- Ticket HAL-0758: Add validation result storage to RED documents
--
-- Goal:
-- - Store validation results (pass/fail, failure messages) alongside RED documents
-- - Track when validation was last performed
-- - Allow updates to validation_status, validation_result, and validated_at fields

-- Add validation_result JSONB column to store detailed validation results
alter table hal_red_documents
  add column if not exists validation_result jsonb,
  add column if not exists validated_at timestamptz;

-- Create index for validated_at queries
create index if not exists idx_hal_red_documents_validated_at 
  on hal_red_documents(validated_at desc nulls last);

-- Update the immutability trigger to allow updates to validation fields only
create or replace function prevent_red_document_updates()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    -- Allow updates to validation-related fields only
    if (
      (old.validation_status is distinct from new.validation_status) or
      (old.validation_result is distinct from new.validation_result) or
      (old.validated_at is distinct from new.validated_at)
    ) and (
      -- Ensure no other fields are changed
      old.red_id = new.red_id and
      old.repo_full_name = new.repo_full_name and
      old.ticket_pk = new.ticket_pk and
      old.version = new.version and
      old.red_json = new.red_json and
      old.content_checksum = new.content_checksum and
      (old.created_by is not distinct from new.created_by) and
      (old.artifact_id is not distinct from new.artifact_id)
    ) then
      -- Allow the update (validation fields only)
      return new;
    else
      -- Block the update (other fields changed)
      raise exception 'RED documents are immutable. Cannot update existing version. Only validation_status, validation_result, and validated_at can be updated. Insert a new version instead.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
