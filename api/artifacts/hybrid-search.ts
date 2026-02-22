/**
 * API endpoint for hybrid retrieval: combines vector similarity with metadata filters.
 * Used for Context Bundle and RED generation to select relevant artifacts.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { performHybridSearch, type HybridSearchOptions, type HybridSearchResult } from './hybrid-search-internal.js'

// Re-export types for external use
export type { HybridSearchOptions, HybridSearchResult }

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as HybridSearchOptions

    const {
      supabaseUrl: bodySupabaseUrl,
      supabaseAnonKey: bodySupabaseAnonKey,
      openaiApiKey: bodyOpenaiApiKey,
    } = body

    // Parse credentials
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials({
      supabaseUrl: bodySupabaseUrl,
      supabaseAnonKey: bodySupabaseAnonKey,
    })

    const openaiApiKey =
      bodyOpenaiApiKey?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      undefined

    // Call internal function
    const result = await performHybridSearch({
      ...body,
      supabaseUrl,
      supabaseAnonKey,
      openaiApiKey,
    })

    const statusCode = result.success ? 200 : result.error?.includes('required') ? 400 : 500
    return json(res, statusCode, result)
  } catch (err) {
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      artifacts: [],
      retrievalMetadata: {
        pinnedIncluded: false,
        totalConsidered: 0,
        totalSelected: 0,
      },
    })
  }
}
