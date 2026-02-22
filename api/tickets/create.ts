import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, repoHintPrefix, parseSupabaseCredentials } from './_shared.js'
import {
  generateSingleSuggestionBody,
  generateMultipleSuggestionsBody,
  checkIdempotency,
  getNextTicketNumber,
  createTicketWithRetry,
} from './_create-helpers.js'
import { computeSuggestionHash } from './_processReviewIdempotency.js'

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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      sourceTicketId?: string
      sourceTicketPk?: string
      suggestions?: string[]
      suggestion?: string // Single suggestion for one-ticket-per-suggestion mode (0167)
      reviewId?: string // Process Review run ID for idempotency (0167)
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const sourceTicketPk = typeof body.sourceTicketPk === 'string' ? body.sourceTicketPk.trim() : undefined
    const sourceTicketId = typeof body.sourceTicketId === 'string' ? body.sourceTicketId.trim() : undefined
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId.trim() : undefined
    // Support both single suggestion (new) and array of suggestions (legacy)
    const singleSuggestion = typeof body.suggestion === 'string' ? body.suggestion.trim() : undefined
    const suggestions = singleSuggestion 
      ? [singleSuggestion] 
      : Array.isArray(body.suggestions) 
        ? body.suggestions.filter((s) => typeof s === 'string' && s.trim()) 
        : []

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if ((!sourceTicketPk && !sourceTicketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'sourceTicketPk (preferred) or sourceTicketId, and Supabase credentials are required.',
      })
      return
    }

    if (suggestions.length === 0) {
      json(res, 400, {
        success: false,
        error: 'At least one suggestion is required to create a ticket.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch source ticket to get repo info
    const sourceTicketQuery = sourceTicketPk
      ? await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('pk', sourceTicketPk).maybeSingle()
      : await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('id', sourceTicketId!).maybeSingle()

    if (sourceTicketQuery.error || !sourceTicketQuery.data) {
      json(res, 200, {
        success: false,
        error: `Source ticket not found: ${sourceTicketQuery.error?.message || 'Unknown error'}`,
      })
      return
    }

    const sourceTicket = sourceTicketQuery.data
    const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
    const prefix = repoHintPrefix(repoFullName)
    const sourceRef = sourceTicket.display_id || sourceTicket.id

    // Idempotency check: if single suggestion is provided, check if ticket with same suggestion already exists (0167, 0172)
    const existingTicket = await checkIdempotency(supabase, singleSuggestion, repoFullName, sourceRef)
    if (existingTicket) {
      json(res, 200, {
        success: true,
        ticketId: existingTicket.display_id || existingTicket.id,
        id: existingTicket.id,
        pk: existingTicket.pk,
        duplicate: true,
      })
      return
    }

    // Determine next ticket number (repo-scoped)
    const startNum = await getNextTicketNumber(supabase, repoFullName)

    // Generate ticket content from suggestions
    // Support both single suggestion field (new) and single-item array (backward compatibility) (0167)
    const isSingleSuggestion = singleSuggestion !== undefined || suggestions.length === 1
    const actualSuggestion = singleSuggestion || (suggestions.length === 1 ? suggestions[0] : '')
    // Normalize suggestion text (trim) to ensure consistent hashing with idempotency check (0172)
    const normalizedSuggestion = actualSuggestion.trim()
    const suggestionText = isSingleSuggestion ? normalizedSuggestion : suggestions.map((s) => `- ${s}`).join('\n')
    
    // Generate suggestion hash for idempotency tracking (0167, 0172)
    // Always generate hash for single suggestions to enable duplicate detection
    // Use normalized (trimmed) suggestion to match idempotency check
    const suggestionHash = isSingleSuggestion && normalizedSuggestion
      ? computeSuggestionHash(normalizedSuggestion)
      : null
    // Always include hash in body when available (for idempotency), reviewId is optional
    const idempotencySection = suggestionHash
      ? (reviewId 
          ? `- **Process Review ID**: ${reviewId}
- **Suggestion Hash**: ${suggestionHash}`
          : `- **Suggestion Hash**: ${suggestionHash}`)
      : ''
    
    let title: string
    let bodyMd: string
    
    if (isSingleSuggestion && actualSuggestion) {
      // One ticket per suggestion: use the suggestion as the main goal (0167)
      title = actualSuggestion.length > 100 ? `${actualSuggestion.slice(0, 97)}...` : actualSuggestion
      bodyMd = generateSingleSuggestionBody(sourceRef, actualSuggestion, idempotencySection)
    } else {
      // Multiple suggestions: create one ticket with all (legacy behavior)
      title = `Improve agent instructions based on ${sourceRef} Process Review`
      bodyMd = generateMultipleSuggestionsBody(sourceRef, suggestionText, idempotencySection)
    }

    // Try to create ticket with retries for ID collisions
    const result = await createTicketWithRetry(supabase, startNum, prefix, title, bodyMd, repoFullName)
    if (result) {
      json(res, 200, {
        success: true,
        ticketId: result.displayId,
        id: result.id,
        pk: result.pk,
      })
      return
    }

    // If creation failed after retries, re-check idempotency in case another request succeeded (0811)
    // This handles race conditions where multiple requests try to create the same ticket simultaneously
    if (isSingleSuggestion && normalizedSuggestion) {
      const existingTicket = await checkIdempotency(supabase, normalizedSuggestion, repoFullName, sourceRef)
      if (existingTicket) {
        json(res, 200, {
          success: true,
          ticketId: existingTicket.display_id || existingTicket.id,
          id: existingTicket.id,
          pk: existingTicket.pk,
          duplicate: true,
        })
        return
      }
    }

    json(res, 200, {
      success: false,
      error: 'Could not create ticket after 10 attempts (ID collision).',
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
