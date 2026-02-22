-- Ticket HAL-0786: Encrypt all stored provider OAuth tokens and Supabase service keys at rest
--
-- Goal:
-- - Create encrypted_secrets table to store OAuth tokens and Supabase keys
-- - Ensure secrets are encrypted before being written to the database
-- - Enable transparent decryption on server-side reads
-- - Support migration of existing plaintext secrets (if any)

-- Create encrypted_secrets table
create table if not exists public.encrypted_secrets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Secret type: 'oauth_github_access_token', 'oauth_github_refresh_token', 'supabase_service_role_key', etc.
  secret_type text not null,
  
  -- Encrypted secret value (base64-encoded encrypted data)
  encrypted_value text not null,
  
  -- Optional: user/session identifier (for OAuth tokens tied to a session)
  -- For OAuth tokens, this could be a session ID or user identifier
  -- For Supabase keys, this could be a project identifier
  identifier text null,
  
  -- Metadata (JSONB) for additional context (e.g., token expiry, scope, etc.)
  metadata jsonb null,
  
  -- Unique constraint: one secret per type + identifier combination
  constraint encrypted_secrets_type_identifier_unique unique (secret_type, identifier)
);

-- Create index for lookups by type and identifier
create index if not exists encrypted_secrets_type_identifier_idx 
  on public.encrypted_secrets (secret_type, identifier);

-- Create index for lookups by type only
create index if not exists encrypted_secrets_type_idx 
  on public.encrypted_secrets (secret_type);

-- Enable RLS
alter table public.encrypted_secrets enable row level security;

-- Policy: Block all anon access (secrets should only be accessible via server APIs with service role)
create policy "Block all anon access to encrypted_secrets"
  on public.encrypted_secrets
  for all
  using (false)
  with check (false);

-- Note: Service role key bypasses RLS, so server APIs using service role
-- can perform all operations (insert, select, update, delete) on encrypted_secrets.

-- Function to update updated_at timestamp
create or replace function update_encrypted_secrets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update updated_at
create trigger update_encrypted_secrets_updated_at
  before update on public.encrypted_secrets
  for each row
  execute function update_encrypted_secrets_updated_at();
