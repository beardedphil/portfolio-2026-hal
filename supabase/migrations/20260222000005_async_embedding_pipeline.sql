-- Ticket 0782: Async embedding pipeline with chunk hash deduplication
--
-- Goal:
-- - Create embedding_jobs table to track async embedding jobs
-- - Add chunk_hash column to artifact_chunks for deduplication
-- - Create indexes for efficient job processing and hash lookups

-- Add chunk_hash column to artifact_chunks for deduplication
alter table public.artifact_chunks
  add column if not exists chunk_hash text;

-- Create index for hash lookups (for deduplication)
create index if not exists artifact_chunks_hash_idx
  on public.artifact_chunks (chunk_hash)
  where chunk_hash is not null;

-- Create embedding_jobs table
create table if not exists public.embedding_jobs (
  job_id uuid primary key default gen_random_uuid(),
  
  -- Link to artifact
  artifact_id uuid not null references public.agent_artifacts(artifact_id) on delete cascade,
  
  -- Job status
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  
  -- Job metadata
  chunk_hash text, -- Hash of the chunk being embedded (for deduplication)
  chunk_text text, -- The text chunk to embed (distilled atom)
  chunk_index integer, -- Index of chunk within artifact
  atom_type text, -- Type of distilled atom: 'summary', 'hard_fact', 'keyword'
  
  -- Error tracking
  error_message text,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Foreign key constraint
  constraint embedding_jobs_artifact_fk foreign key (artifact_id) references public.agent_artifacts (artifact_id) on delete cascade
);

-- Indexes for efficient job processing
create index if not exists embedding_jobs_status_idx
  on public.embedding_jobs (status, created_at)
  where status in ('queued', 'processing');

create index if not exists embedding_jobs_artifact_idx
  on public.embedding_jobs (artifact_id, created_at);

create index if not exists embedding_jobs_hash_idx
  on public.embedding_jobs (chunk_hash)
  where chunk_hash is not null;

-- Enable row-level security
alter table public.embedding_jobs enable row level security;

-- Policy: allow all operations (matches agent_artifacts policy)
drop policy if exists "Allow all operations on embedding_jobs" on public.embedding_jobs;
create policy "Allow all operations on embedding_jobs"
  on public.embedding_jobs
  for all
  using (true)
  with check (true);
