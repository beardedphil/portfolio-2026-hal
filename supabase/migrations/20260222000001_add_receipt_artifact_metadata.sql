-- Ticket HAL-0751: Add artifact metadata and selected snippets to bundle_receipts
--
-- Adds fields to store:
-- - artifact_ids: Array of artifact IDs used in the bundle
-- - artifact_versions: Map of artifact_id -> version number
-- - selected_snippets: Array of verbatim snippets with pointers to source artifact/version

-- Add new columns to bundle_receipts
alter table bundle_receipts
  add column if not exists artifact_ids text[] default '{}',
  add column if not exists artifact_versions jsonb default '{}',
  add column if not exists selected_snippets jsonb default '[]';

-- Add comment explaining the new fields
comment on column bundle_receipts.artifact_ids is 'Array of artifact IDs (UUIDs) used to build this bundle';
comment on column bundle_receipts.artifact_versions is 'JSON object mapping artifact_id to version number: { "artifact_id": version, ... }';
comment on column bundle_receipts.selected_snippets is 'Array of selected snippets with pointers: [{ "artifact_id": "...", "artifact_version": 1, "snippet": "verbatim text...", "start_line": 10, "end_line": 20 }]';

-- Create index for artifact_ids lookups
create index if not exists idx_bundle_receipts_artifact_ids on bundle_receipts using gin(artifact_ids);
