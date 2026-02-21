-- Add budget information to bundle_receipts table
-- Stores role-based character budget used when generating the bundle

alter table bundle_receipts
  add column if not exists budget jsonb; -- { "characterCount": 12345, "hardLimit": 200000, "role": "implementation-agent", "displayName": "Implementation Agent" }

-- Add comment
comment on column bundle_receipts.budget is 'Role-based character budget information: characterCount (actual), hardLimit (maximum), role, displayName';
