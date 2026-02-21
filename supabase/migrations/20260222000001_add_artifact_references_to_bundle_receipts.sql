-- Ticket HAL-0751: Add artifact references and selected snippets to bundle receipts
--
-- Goal:
-- - Store artifact ids and versions (created_at timestamps) used in bundle
-- - Store exact selected snippets (verbatim) with pointers to source artifact/version
-- - Enable deterministic receipt creation with full provenance

-- Add artifact_references column to bundle_receipts
-- Format: Array of { artifact_id, artifact_title, created_at (version identifier) }
alter table bundle_receipts
  add column if not exists artifact_references jsonb default '[]'::jsonb;

-- Add selected_snippets column to bundle_receipts
-- Format: Array of { artifact_id, snippet_text (verbatim), snippet_start, snippet_end, artifact_title }
alter table bundle_receipts
  add column if not exists selected_snippets jsonb default '[]'::jsonb;

-- Add comment for documentation
comment on column bundle_receipts.artifact_references is 'Array of artifact references used in bundle: [{ artifact_id, artifact_title, created_at }]';
comment on column bundle_receipts.selected_snippets is 'Array of exact snippets included (verbatim) with pointers: [{ artifact_id, snippet_text, snippet_start, snippet_end, artifact_title }]';
