-- Ticket HAL-0751: Add artifact references to bundle receipts
--
-- Goal:
-- - Store artifact IDs and versions (created_at) used in bundle
-- - Store exact selected snippets (verbatim) with pointers to source artifact/version
-- - Enable deterministic receipt display with full provenance

-- Add artifact_references column to bundle_receipts
alter table bundle_receipts
  add column if not exists artifact_references jsonb;

-- artifact_references structure:
-- [
--   {
--     "artifact_id": "uuid",
--     "artifact_title": "string",
--     "artifact_version": "timestamptz (created_at)",
--     "snippet": "verbatim text from artifact body_md",
--     "snippet_start": 0,  // optional: character offset in original artifact
--     "snippet_end": 100   // optional: character offset in original artifact
--   },
--   ...
-- ]

-- Add index for querying by artifact_id
create index if not exists idx_bundle_receipts_artifact_references
  on bundle_receipts using gin (artifact_references jsonb_path_ops);

-- Add index for content_checksum to support deterministic receipt lookup
create index if not exists idx_bundle_receipts_content_checksum
  on bundle_receipts(content_checksum);
