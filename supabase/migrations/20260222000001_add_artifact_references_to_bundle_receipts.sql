-- Ticket HAL-0751: Add artifact references to bundle receipts
--
-- Goal:
-- - Store artifact ids and versions used to build the bundle
-- - Store exact selected snippets included (verbatim) with pointers to source artifact/version
-- - Enable deterministic receipt with full provenance

-- Add artifact_references column to bundle_receipts table
alter table bundle_receipts
  add column if not exists artifact_references jsonb;

-- artifact_references structure:
-- [
--   {
--     "artifact_id": "uuid",
--     "artifact_title": "string",
--     "artifact_version": "timestamp (created_at)",
--     "snippets": [
--       {
--         "content": "verbatim snippet text",
--         "source_artifact_id": "uuid",
--         "source_artifact_version": "timestamp",
--         "pointer": "description of where this snippet came from (e.g., 'summary', 'hard_facts[0]', 'keywords[2]')"
--       }
--     ]
--   }
-- ]

-- Add index for querying by artifact references
create index if not exists idx_bundle_receipts_artifact_references
  on bundle_receipts using gin (artifact_references);

-- Add comment for documentation
comment on column bundle_receipts.artifact_references is 
  'Array of artifact references with ids, versions, and exact snippets included in the bundle';
