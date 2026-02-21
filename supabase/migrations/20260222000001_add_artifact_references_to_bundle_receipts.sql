-- Ticket HAL-0751: Add artifact references and snippets to bundle_receipts
--
-- Goal:
-- - Store artifact ids and versions used to build the bundle
-- - Store exact selected snippets (verbatim) with pointers to source artifact/version
-- - Enable deterministic receipt creation with full provenance

-- Add artifact_references column to bundle_receipts
-- Format: [{ "artifact_id": "...", "artifact_version": 1, "artifact_title": "..." }, ...]
alter table bundle_receipts
  add column if not exists artifact_references jsonb default '[]'::jsonb;

-- Add artifact_snippets column to bundle_receipts
-- Format: [{ "artifact_id": "...", "artifact_version": 1, "snippet": "...", "source_pointer": "..." }, ...]
alter table bundle_receipts
  add column if not exists artifact_snippets jsonb default '[]'::jsonb;

-- Add index for artifact_references queries
create index if not exists idx_bundle_receipts_artifact_references
  on bundle_receipts using gin (artifact_references);

-- Add index for artifact_snippets queries
create index if not exists idx_bundle_receipts_artifact_snippets
  on bundle_receipts using gin (artifact_snippets);

-- Add index for content_checksum to support idempotent receipt creation
create index if not exists idx_bundle_receipts_content_checksum
  on bundle_receipts(content_checksum);
