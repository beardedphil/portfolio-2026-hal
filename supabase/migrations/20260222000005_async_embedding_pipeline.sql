-- Ticket 0782: Async Embedding Pipeline with Distilled Knowledge Atoms
--
-- Goal:
-- - Add chunk_hash column to artifact_chunks for deduplication
-- - Create embedding_jobs table for async job queue
-- - Enable automatic embedding of distilled knowledge atoms

-- Add chunk_hash column to artifact_chunks for deduplication
alter table public.artifact_chunks
  add column if not exists chunk_hash text;

-- Create index on chunk_hash for fast lookups
create index if not exists artifact_chunks_hash_idx
  on public.artifact_chunks (chunk_hash)
  where chunk_hash is not null;

-- Create embedding_jobs table for async job queue
create table if not exists public.embedding_jobs (
  job_id uuid primary key default gen_random_uuid(),
  
  -- Link to artifact
  artifact_id uuid not null references public.agent_artifacts(artifact_id) on delete cascade,
  
  -- Job status
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  
  -- Job metadata
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Error information (if failed)
  error_message text,
  error_details jsonb,
  
  -- Job statistics
  chunks_processed integer default 0,
  chunks_skipped integer default 0,
  chunks_failed integer default 0
);

-- Indexes for efficient queries
create index if not exists embedding_jobs_artifact_idx
  on public.embedding_jobs (artifact_id);

create index if not exists embedding_jobs_status_idx
  on public.embedding_jobs (status, created_at);

create index if not exists embedding_jobs_created_idx
  on public.embedding_jobs (created_at desc);

-- Enable row-level security
alter table public.embedding_jobs enable row level security;

-- Policy: allow all operations (matches agent_artifacts policy)
drop policy if exists "Allow all operations on embedding_jobs" on public.embedding_jobs;
create policy "Allow all operations on embedding_jobs"
  on public.embedding_jobs
  for all
  using (true)
  with check (true);
