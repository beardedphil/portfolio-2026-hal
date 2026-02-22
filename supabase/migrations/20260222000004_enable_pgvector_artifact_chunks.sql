-- Ticket 0781: Enable pgvector and create artifact_chunks table for semantic search
--
-- Goal:
-- - Enable pgvector extension for vector similarity search
-- - Create artifact_chunks table to store text chunks with embeddings
-- - Create HNSW index for efficient vector similarity search
-- - Link chunks to artifacts via artifact_id

-- Enable pgvector extension (safe: only creates if not exists)
create extension if not exists vector;

-- Create artifact_chunks table
create table if not exists public.artifact_chunks (
  chunk_id uuid primary key default gen_random_uuid(),
  
  -- Link to artifact
  artifact_id uuid not null references public.agent_artifacts(artifact_id) on delete cascade,
  
  -- Chunk content
  chunk_text text not null,
  
  -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
  embedding vector(1536),
  
  -- Metadata
  chunk_index integer not null default 0, -- Order of chunk within artifact
  created_at timestamptz not null default now(),
  
  -- Foreign key constraint already defined above
  constraint artifact_chunks_artifact_fk foreign key (artifact_id) references public.agent_artifacts (artifact_id) on delete cascade
);

-- Indexes for efficient queries
create index if not exists artifact_chunks_artifact_idx
  on public.artifact_chunks (artifact_id, chunk_index);

-- HNSW index for vector similarity search (using cosine distance)
-- m=16, ef_construction=64 are good defaults for most use cases
create index if not exists artifact_chunks_embedding_idx
  on public.artifact_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Enable row-level security
alter table public.artifact_chunks enable row level security;

-- Policy: allow all operations (matches agent_artifacts policy)
drop policy if exists "Allow all operations on artifact_chunks" on public.artifact_chunks;
create policy "Allow all operations on artifact_chunks"
  on public.artifact_chunks
  for all
  using (true)
  with check (true);
