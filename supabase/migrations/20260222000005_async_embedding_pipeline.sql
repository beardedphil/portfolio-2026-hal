-- Ticket 0782: Async Embedding Pipeline for Distilled Knowledge Atoms
--
-- Goal:
-- - Add chunk_hash column to artifact_chunks for deduplication
-- - Create embedding_jobs queue table for async processing
-- - Enable idempotent re-runs by skipping chunks with existing hashes

-- Add chunk_hash column to artifact_chunks for deduplication
alter table public.artifact_chunks
  add column if not exists chunk_hash text;

-- Create index on chunk_hash for fast lookups
create index if not exists artifact_chunks_hash_idx
  on public.artifact_chunks (chunk_hash)
  where chunk_hash is not null;

-- Add unique constraint on (artifact_id, chunk_hash) for upsert support
-- This allows idempotent chunk insertion
create unique index if not exists artifact_chunks_artifact_hash_unique
  on public.artifact_chunks (artifact_id, chunk_hash)
  where chunk_hash is not null;

-- Create embedding_jobs queue table
create table if not exists public.embedding_jobs (
  job_id uuid primary key default gen_random_uuid(),
  
  -- Link to artifact
  artifact_id uuid not null references public.agent_artifacts(artifact_id) on delete cascade,
  
  -- Job metadata
  chunk_text text not null,
  chunk_hash text not null,
  chunk_index integer not null default 0,
  
  -- Job status
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  
  -- Error tracking
  error_message text,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Unique constraint: one job per artifact+hash combination
  constraint embedding_jobs_artifact_hash_unique unique (artifact_id, chunk_hash)
);

-- Indexes for efficient queue processing
create index if not exists embedding_jobs_status_idx
  on public.embedding_jobs (status, created_at)
  where status in ('queued', 'processing');

create index if not exists embedding_jobs_artifact_idx
  on public.embedding_jobs (artifact_id);

create index if not exists embedding_jobs_hash_idx
  on public.embedding_jobs (chunk_hash);

-- Enable row-level security
alter table public.embedding_jobs enable row level security;

-- Policy: allow all operations (matches agent_artifacts policy)
drop policy if exists "Allow all operations on embedding_jobs" on public.embedding_jobs;
create policy "Allow all operations on embedding_jobs"
  on public.embedding_jobs
  for all
  using (true)
  with check (true);
