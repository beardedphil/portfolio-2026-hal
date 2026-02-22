/**
 * Internal hybrid retrieval logic (shared between API endpoint and builder).
 * Combines vector similarity with metadata filters.
 */

import { createClient } from '@supabase/supabase-js'

export interface HybridSearchOptions {
  query?: string // Text query for vector similarity (optional)
  repoFullName?: string // Filter by repository
  includePinned?: boolean // Include pinned artifacts
  recencyDays?: number // Filter by recency (e.g., 30 for last 30 days)
  limit?: number // Maximum number of results
  ticketPk?: string // Filter by ticket (optional)
  deterministic?: boolean // Use deterministic ordering (for same inputs → same results)
  supabaseUrl?: string
  supabaseAnonKey?: string
  openaiApiKey?: string
}

export interface HybridSearchResult {
  success: boolean
  artifacts: Array<{
    artifact_id: string
    title: string
    similarity?: number // Vector similarity score (if query provided)
    created_at: string
  }>
  retrievalMetadata: {
    repoFilter?: string
    pinnedIncluded: boolean
    recencyWindow?: string // e.g., "last 30 days"
    totalConsidered: number
    totalSelected: number
  }
  error?: string
}

/**
 * Generate embedding using OpenAI's embedding API
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }

  return data.data[0]?.embedding || []
}

/**
 * Perform hybrid search (internal function, can be called directly).
 */
export async function performHybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult> {
  const {
    query,
    repoFullName,
    includePinned = false,
    recencyDays,
    limit = 20,
    ticketPk,
    deterministic = true,
    supabaseUrl,
    supabaseAnonKey,
    openaiApiKey,
  } = options

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: 'Supabase credentials required',
      artifacts: [],
      retrievalMetadata: {
        pinnedIncluded: includePinned,
        totalConsidered: 0,
        totalSelected: 0,
      },
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Build metadata filter query
  let metadataQuery = supabase.from('agent_artifacts').select('artifact_id, title, created_at, ticket_pk, repo_full_name')

  // Apply metadata filters
  if (repoFullName) {
    metadataQuery = metadataQuery.eq('repo_full_name', repoFullName)
  }

  if (ticketPk) {
    metadataQuery = metadataQuery.eq('ticket_pk', ticketPk)
  }

  // Recency filter
  if (recencyDays && recencyDays > 0) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - recencyDays)
    metadataQuery = metadataQuery.gte('created_at', cutoffDate.toISOString())
  }

  // Execute metadata query to get candidate artifacts
  const { data: candidateArtifacts, error: metadataError } = await metadataQuery

  if (metadataError) {
    return {
      success: false,
      error: `Metadata filter failed: ${metadataError.message}`,
      artifacts: [],
      retrievalMetadata: {
        repoFilter: repoFullName,
        pinnedIncluded: includePinned,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : undefined,
        totalConsidered: 0,
        totalSelected: 0,
      },
    }
  }

  const candidates = (candidateArtifacts || []) as Array<{
    artifact_id: string
    title: string
    created_at: string
    ticket_pk: string
    repo_full_name: string
  }>

  const totalConsidered = candidates.length

  // If no query provided, return candidates sorted by recency (or deterministically)
  if (!query || !openaiApiKey) {
    // Sort deterministically if requested, otherwise by recency
    const sorted = deterministic
      ? [...candidates].sort((a, b) => {
          // Deterministic sort: by artifact_id (stable)
          return a.artifact_id.localeCompare(b.artifact_id)
        })
      : [...candidates].sort((a, b) => {
          // Recency sort: newest first
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

    const selected = sorted.slice(0, limit)

    return {
      success: true,
      artifacts: selected.map((a) => ({
        artifact_id: a.artifact_id,
        title: a.title,
        created_at: a.created_at,
      })),
      retrievalMetadata: {
        repoFilter: repoFullName,
        pinnedIncluded: includePinned,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : undefined,
        totalConsidered,
        totalSelected: selected.length,
      },
    }
  }

  // Generate query embedding for vector similarity
  let queryEmbedding: number[]
  try {
    queryEmbedding = await generateEmbedding(query, openaiApiKey)
  } catch (err) {
    return {
      success: false,
      error: `Failed to generate embedding: ${err instanceof Error ? err.message : String(err)}`,
      artifacts: [],
      retrievalMetadata: {
        repoFilter: repoFullName,
        pinnedIncluded: includePinned,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : undefined,
        totalConsidered,
        totalSelected: 0,
      },
    }
  }

  // Get artifact IDs from candidates
  const candidateArtifactIds = candidates.map((c) => c.artifact_id)

  if (candidateArtifactIds.length === 0) {
    return {
      success: true,
      artifacts: [],
      retrievalMetadata: {
        repoFilter: repoFullName,
        pinnedIncluded: includePinned,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : undefined,
        totalConsidered: 0,
        totalSelected: 0,
      },
    }
  }

  // Get chunks for candidate artifacts
  const { data: chunks, error: chunksError } = await supabase
    .from('artifact_chunks')
    .select('chunk_id, artifact_id, chunk_text, embedding')
    .in('artifact_id', candidateArtifactIds)
    .not('embedding', 'is', null)

  if (chunksError) {
    return {
      success: false,
      error: `Failed to fetch chunks: ${chunksError.message}`,
      artifacts: [],
      retrievalMetadata: {
        repoFilter: repoFullName,
        pinnedIncluded: includePinned,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : undefined,
        totalConsidered,
        totalSelected: 0,
      },
    }
  }

  // Calculate similarity for each chunk
  const chunksWithSimilarity = (chunks || [])
    .map((chunk: any) => {
      const embedding = chunk.embedding as number[]
      if (!embedding || embedding.length !== queryEmbedding.length) return null

      // Cosine similarity: dot product / (||a|| * ||b||)
      let dotProduct = 0
      let normA = 0
      let normB = 0
      for (let i = 0; i < embedding.length; i++) {
        dotProduct += embedding[i] * queryEmbedding[i]
        normA += embedding[i] * embedding[i]
        normB += queryEmbedding[i] * queryEmbedding[i]
      }
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))

      return {
        chunk_id: chunk.chunk_id,
        artifact_id: chunk.artifact_id,
        similarity,
      }
    })
    .filter((r: any) => r !== null) as Array<{
    chunk_id: string
    artifact_id: string
    similarity: number
  }>

  // Group by artifact_id and take max similarity per artifact
  const artifactSimilarities = new Map<string, number>()
  for (const chunk of chunksWithSimilarity) {
    const current = artifactSimilarities.get(chunk.artifact_id) || 0
    artifactSimilarities.set(chunk.artifact_id, Math.max(current, chunk.similarity))
  }

  // Combine with candidate artifacts and sort by similarity
  const artifactsWithSimilarity = candidates
    .map((artifact) => ({
      artifact_id: artifact.artifact_id,
      title: artifact.title,
      created_at: artifact.created_at,
      similarity: artifactSimilarities.get(artifact.artifact_id) || 0,
    }))
    .filter((a) => a.similarity > 0) // Only include artifacts with some similarity
    .sort((a, b) => {
      if (deterministic) {
        // Deterministic: sort by similarity (desc), then by artifact_id (asc) for stability
        if (Math.abs(a.similarity - b.similarity) < 0.0001) {
          return a.artifact_id.localeCompare(b.artifact_id)
        }
        return b.similarity - a.similarity
      } else {
        // Non-deterministic: sort by similarity only
        return b.similarity - a.similarity
      }
    })
    .slice(0, limit)

  return {
    success: true,
    artifacts: artifactsWithSimilarity.map((a) => ({
      artifact_id: a.artifact_id,
      title: a.title,
      similarity: Math.round(a.similarity * 100) / 100, // Round to 2 decimal places
      created_at: a.created_at,
    })),
    retrievalMetadata: {
      repoFilter: repoFullName,
      pinnedIncluded: includePinned,
      recencyWindow: recencyDays ? `last ${recencyDays} days` : undefined,
      totalConsidered,
      totalSelected: artifactsWithSimilarity.length,
    },
  }
}
