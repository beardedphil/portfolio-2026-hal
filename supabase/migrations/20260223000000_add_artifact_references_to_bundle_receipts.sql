-- Ticket HAL-0751: Add artifact references and selected snippets to bundle_receipts
--
-- Goal:
-- - Store artifact IDs and versions used to build the bundle
-- - Store exact selected snippets (verbatim) with pointers to source artifact/version
-- - Enable deterministic receipt with full provenance

-- Add artifact_references column to bundle_receipts
-- Format: Array of { artifact_id, artifact_title, version, created_at }
alter table bundle_receipts
  add column if not exists artifact_references jsonb;

-- Add selected_snippets column to bundle_receipts
-- Format: Array of { artifact_id, artifact_version, snippet_text, snippet_start_line?, snippet_end_line? }
alter table bundle_receipts
  add column if not exists selected_snippets jsonb;

-- Add comment to document the structure
comment on column bundle_receipts.artifact_references is 
  'Array of artifact references: [{ artifact_id, artifact_title, version, created_at }]';

comment on column bundle_receipts.selected_snippets is 
  'Array of selected snippets with pointers: [{ artifact_id, artifact_version, snippet_text, snippet_start_line?, snippet_end_line? }]';
