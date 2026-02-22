/**
 * Hybrid retrieval: combines vector similarity search with metadata filters
 * for Context Bundle and RED generation.
 * 
 * Filters:
 * - repo_full_name match
 * - recency window (optional, in days)
 * - pinned inclusion (optional, future enhancement)
 * 
 * Returns deterministic results (same inputs = same results).
 */

import { createClient } from '@supabase/supabase-js'

export interface HybridSearchOptions {
  query: string
  repoFullName: string
  limit?: number
  recencyDays?: number | null // null = no recency filter
  includePinned?: boolean // Future: filter by pinned status
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  deterministic?: boolean // If true, ensures same inputs = same results
}

export interface HybridSearchResult {
  success: boolean
  results: Array<{
    artifact_id: string
    ticket_pk: string | null
    title: string
    similarity: number
    snippet: string
  }>
  retrievalMetadata: {
    repoFilter: string
    recencyWindow: string | null // e.g., "last 30 days"
    pinnedIncluded: boolean
    itemsConsidered: number
    itemsSelected: number
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
 * Performs hybrid retrieval combining vector similarity with metadata filters.
 */
export async function hybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult> {
  const {
    query,
    repoFullName,
    limit = 10,
    recencyDays = null,
    includePinned = false,
    supabaseUrl,
    supabaseAnonKey,
    openaiApiKey,
    deterministic = true,
  } = options

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, openaiApiKey)

    // Build metadata filter query
    let metadataQuery = supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, repo_full_name, title, body_md, created_at')
      .eq('repo_full_name', repoFullName)

    // Apply recency filter if specified
    if (recencyDays !== null && recencyDays > 0) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - recencyDays)
      metadataQuery = metadataQuery.gte('created_at', cutoffDate.toISOString())
    }

    // Future: Apply pinned filter when pinned field exists
    // if (includePinned) {
    //   metadataQuery = metadataQuery.eq('pinned', true)
    // }

    // Get all artifacts matching metadata filters
    const { data: metadataFilteredArtifacts, error: metadataError } = await metadataQuery

    if (metadataError) {
      return {
        success: false,
        results: [],
        retrievalMetadata: {
          repoFilter: repoFullName,
          recencyWindow: recencyDays ? `last ${recencyDays} days` : null,
          pinnedIncluded: includePinned,
          itemsConsidered: 0,
          itemsSelected: 0,
        },
        error: `Failed to apply metadata filters: ${metadataError.message}`,
      }
    }

    const itemsConsidered = metadataFilteredArtifacts?.length || 0

    if (itemsConsidered === 0) {
      return {
        success: true,
        results: [],
        retrievalMetadata: {
          repoFilter: repoFullName,
          recencyWindow: recencyDays ? `last ${recencyDays} days` : null,
          pinnedIncluded: includePinned,
          itemsConsidered: 0,
          itemsSelected: 0,
        },
      }
    }

    // Get artifact IDs that match metadata filters
    const artifactIds = (metadataFilteredArtifacts || []).map((a: any) => a.artifact_id)

    // Perform vector similarity search on chunks from these artifacts
    // First, try RPC call if available
    let chunksWithSimilarity: Array<{
      chunk_id: string
      artifact_id: string
      chunk_text: string
      similarity: number
    }> = []

    const { data: searchResults, error: searchError } = await supabase.rpc('search_artifact_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit * 3, // Get more to filter by metadata
    })

    if (searchError) {
      // Fallback: manual vector search
      const { data: chunks, error: chunksError } = await supabase
        .from('artifact_chunks')
        .select('chunk_id, artifact_id, chunk_text, embedding')
        .in('artifact_id', artifactIds)
        .not('embedding', 'is', null)
        .limit(limit * 5) // Get more to calculate similarity

      if (chunksError) {
        return {
          success: false,
          results: [],
          retrievalMetadata: {
            repoFilter: repoFullName,
            recencyWindow: recencyDays ? `last ${recencyDays} days` : null,
            pinnedIncluded: includePinned,
            itemsConsidered,
            itemsSelected: 0,
          },
          error: `Vector search failed: ${chunksError.message}`,
        }
      }

      // Calculate cosine similarity manually
      chunksWithSimilarity = (chunks || [])
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
            chunk_text: chunk.chunk_text,
            similarity,
          }
        })
        .filter((r: any) => r !== null && r.similarity >= 0.5)
        .sort((a: any, b: any) => b.similarity - a.similarity)
    } else {
      // Filter RPC results by artifact IDs that match metadata
      chunksWithSimilarity = (searchResults || [])
        .filter((r: any) => artifactIds.includes(r.artifact_id))
        .map((r: any) => ({
          chunk_id: r.chunk_id,
          artifact_id: r.artifact_id,
          chunk_text: r.chunk_text || '',
          similarity: typeof r.similarity === 'number' ? r.similarity : 0,
        }))
        .filter((r) => r.similarity >= 0.5)
        .sort((a, b) => b.similarity - a.similarity)
    }

    // Group by artifact_id and take best chunk per artifact
    const artifactMap = new Map<string, typeof chunksWithSimilarity[0]>()
    for (const chunk of chunksWithSimilarity) {
      const existing = artifactMap.get(chunk.artifact_id)
      if (!existing || chunk.similarity > existing.similarity) {
        artifactMap.set(chunk.artifact_id, chunk)
      }
    }

    // Get top N artifacts by similarity
    const topArtifacts = Array.from(artifactMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    // Fetch artifact details
    const topArtifactIds = topArtifacts.map((a) => a.artifact_id)
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, title, body_md')
      .in('artifact_id', topArtifactIds)

    if (artifactsError) {
      return {
        success: false,
        results: [],
        retrievalMetadata: {
          repoFilter: repoFullName,
          recencyWindow: recencyDays ? `last ${recencyDays} days` : null,
          pinnedIncluded: includePinned,
          itemsConsidered,
          itemsSelected: 0,
        },
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
      }
    }

    const artifactMapDetails = new Map((artifacts || []).map((a: any) => [a.artifact_id, a]))
    const chunkMap = new Map(topArtifacts.map((a) => [a.artifact_id, a]))

    // Build results with deterministic ordering
    const results = topArtifactIds
      .map((artifactId) => {
        const artifact = artifactMapDetails.get(artifactId)
        const chunk = chunkMap.get(artifactId)
        if (!artifact || !chunk) return null

        return {
          artifact_id: artifactId,
          ticket_pk: artifact.ticket_pk || null,
          title: artifact.title || 'Unknown',
          similarity: Math.round(chunk.similarity * 100) / 100, // Round to 2 decimal places
          snippet: chunk.chunk_text.substring(0, 200) + (chunk.chunk_text.length > 200 ? '...' : ''),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // If deterministic, ensure stable ordering by artifact_id
    if (deterministic) {
      results.sort((a, b) => {
        if (a.similarity !== b.similarity) {
          return b.similarity - a.similarity // Higher similarity first
        }
        return a.artifact_id.localeCompare(b.artifact_id) // Stable tie-breaker
      })
    }

    return {
      success: true,
      results,
      retrievalMetadata: {
        repoFilter: repoFullName,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : null,
        pinnedIncluded: includePinned,
        itemsConsidered,
        itemsSelected: results.length,
      },
    }
  } catch (err) {
    return {
      success: false,
      results: [],
      retrievalMetadata: {
        repoFilter: repoFullName,
        recencyWindow: recencyDays ? `last ${recencyDays} days` : null,
        pinnedIncluded: includePinned,
        itemsConsidered: 0,
        itemsSelected: 0,
      },
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
