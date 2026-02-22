/**
 * API endpoint to generate a RED document using hybrid retrieval.
 * Uses hybrid retrieval to find relevant artifacts, then generates and stores a RED document.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { hybridSearch } from '../artifacts/hybrid-search.js'
import { fetchTicketByPkOrId } from '../tickets/_shared.js'

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

/**
 * Generates a RED document JSON structure from ticket and artifacts.
 */
function generateRedDocument(
  ticket: { title: string; body_md: string; id: string },
  artifacts: Array<{ artifact_id: string; title: string; snippet: string }>
): unknown {
  // Parse ticket body to extract sections
  const bodyLines = ticket.body_md.split('\n')
  const sections: Record<string, string> = {}
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of bodyLines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim()
      }
      currentSection = line.substring(3).trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim()
  }

  // Extract acceptance criteria
  const acceptanceCriteria: string[] = []
  const acSection = sections['Acceptance criteria (UI-only)'] || sections['Acceptance criteria']
  if (acSection) {
    const acLines = acSection.split('\n')
    for (const line of acLines) {
      const match = line.match(/^-\s*\[\s*\]\s*(.+)$/)
      if (match) {
        acceptanceCriteria.push(match[1].trim())
      }
    }
  }

  // Build RED document structure
  const redDocument = {
    title: ticket.title,
    description: sections['Goal (one sentence)'] || sections['Goal'] || ticket.title,
    'Human-verifiable deliverable (UI-only)': sections['Human-verifiable deliverable (UI-only)'] || sections['Human-verifiable deliverable'] || '',
    acceptance_criteria: acceptanceCriteria,
    constraints: sections['Constraints'] || sections['Constraints (UI-only)'] || '',
    'Non-goals': sections['Non-goals'] || '',
    relevant_artifacts: artifacts.map((a) => ({
      artifact_id: a.artifact_id,
      title: a.title,
      snippet: a.snippet.substring(0, 500), // Limit snippet length
    })),
    generated_at: new Date().toISOString(),
    ticket_id: ticket.id,
  }

  return redDocument
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
    const body = (await readJsonBody(req)) as {
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      supabaseServiceRoleKey?: string
      // Hybrid retrieval options
      useHybridRetrieval?: boolean
      retrievalQuery?: string
      recencyDays?: number | null
      includePinned?: boolean
      openaiApiKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
    }

    if (!supabaseUrl || !supabaseKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch ticket
    const ticket = await fetchTicketByPkOrId(supabase, ticketPk, ticketId)
    if (!ticket) {
      return json(res, 400, {
        success: false,
        error: `Ticket not found: ${ticketPk || ticketId}`,
      })
    }

    const resolvedTicketPk = ticket.pk
    const resolvedRepoFullName = repoFullName || ticket.repo_full_name

    if (!resolvedRepoFullName) {
      return json(res, 400, {
        success: false,
        error: 'repoFullName is required (provide in request body or ensure ticket has repo_full_name).',
      })
    }

    // Use hybrid retrieval to find relevant artifacts
    const useHybridRetrieval = body.useHybridRetrieval !== false // Default to true
    let retrievalMetadata: {
      repoFilter: string
      recencyWindow: string | null
      pinnedIncluded: boolean
      itemsConsidered: number
      itemsSelected: number
    } | null = null

    let selectedArtifacts: Array<{ artifact_id: string; title: string; snippet: string }> = []

    if (useHybridRetrieval) {
      const retrievalQuery = body.retrievalQuery || ticket.title || ticket.body_md?.substring(0, 200) || ''
      const recencyDays = body.recencyDays ?? null
      const includePinned = body.includePinned || false
      // Use server-side OpenAI API key from environment
      const openaiApiKey = body.openaiApiKey || process.env.OPENAI_API_KEY

      if (!openaiApiKey) {
        return json(res, 400, {
          success: false,
          error: 'openaiApiKey is required for hybrid retrieval (set OPENAI_API_KEY in server environment).',
        })
      }

      // Perform hybrid search
      const searchResult = await hybridSearch({
        query: retrievalQuery,
        repoFullName: resolvedRepoFullName,
        limit: 20,
        recencyDays,
        includePinned,
        supabaseUrl,
        supabaseAnonKey: supabaseKey,
        openaiApiKey,
        deterministic: true,
      })

      if (!searchResult.success) {
        return json(res, 200, {
          success: false,
          error: searchResult.error || 'Hybrid retrieval failed',
          retrievalMetadata: searchResult.retrievalMetadata,
        })
      }

      retrievalMetadata = searchResult.retrievalMetadata
      selectedArtifacts = searchResult.results.map((r) => ({
        artifact_id: r.artifact_id,
        title: r.title,
        snippet: r.snippet,
      }))
    }

    // Generate RED document
    const redJson = generateRedDocument(ticket, selectedArtifacts)

    // Store RED document using the insert endpoint logic
    // Get the next version number
    const { data: existingVersions, error: versionError } = await supabase
      .from('hal_red_documents')
      .select('version')
      .eq('repo_full_name', resolvedRepoFullName)
      .eq('ticket_pk', resolvedTicketPk)
      .order('version', { ascending: false })
      .limit(1)

    if (versionError) {
      return json(res, 200, {
        success: false,
        error: `Failed to fetch existing versions: ${versionError.message}`,
      })
    }

    const nextVersion = existingVersions && existingVersions.length > 0
      ? (existingVersions[0].version as number) + 1
      : 1

    // Generate checksum
    const { generateRedChecksum } = await import('./_checksum.js')
    const contentChecksum = generateRedChecksum(redJson)

    // Insert new RED version
    const { data: insertedRed, error: insertError } = await supabase
      .from('hal_red_documents')
      .insert({
        repo_full_name: resolvedRepoFullName,
        ticket_pk: resolvedTicketPk,
        version: nextVersion,
        red_json: redJson,
        content_checksum: contentChecksum,
        validation_status: 'pending',
        created_by: null,
        artifact_id: null,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505' || insertError.message?.includes('unique constraint')) {
        return json(res, 200, {
          success: false,
          error: `Version ${nextVersion} already exists for this ticket.`,
        })
      }

      return json(res, 200, {
        success: false,
        error: `Failed to insert RED: ${insertError.message}`,
      })
    }

    return json(res, 200, {
      success: true,
      red_document: insertedRed,
      retrievalMetadata,
      ticket_pk: resolvedTicketPk,
      repo_full_name: resolvedRepoFullName,
    })
  } catch (err) {
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
