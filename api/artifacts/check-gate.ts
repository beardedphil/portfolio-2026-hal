import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import {
  getMissingRequiredImplementationArtifacts,
  hasMissingArtifactExplanation,
  extractArtifactTypeFromTitle,
  type ArtifactRowForCheck,
} from '../artifacts/_shared.js'

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
 * Returns true if body_md is substantive (matches Kanban/QA rules: length > 50, no placeholders).
 */
function isSubstantiveBody(body_md: string | null | undefined): boolean {
  if (body_md == null) return false
  const trimmed = body_md.trim()
  if (trimmed.length <= 50) return false
  if (trimmed.includes('(none)')) return false
  if (trimmed.includes('(No files changed')) return false
  return true
}

/**
 * Checks for blank/non-substantive required artifacts.
 * Returns array of artifact types that are present but blank.
 */
function getBlankRequiredArtifacts(artifacts: ArtifactRowForCheck[]): string[] {
  const blankTypes: string[] = []
  const requiredTypes = ['plan', 'worklog', 'changed-files', 'decisions', 'verification', 'pm-review', 'git-diff', 'instructions-used']
  
  for (const type of requiredTypes) {
    const artifact = artifacts.find((a) => {
      if (a.agent_type !== 'implementation') return false
      const extracted = extractArtifactTypeFromTitle(a.title || '')
      return extracted === type
    })
    
    if (artifact && !isSubstantiveBody(artifact.body_md)) {
      blankTypes.push(type)
    }
  }
  
  return blankTypes
}

/**
 * Checks for duplicate artifacts of the same type.
 * Returns array of artifact types that have duplicates.
 */
function getDuplicateArtifactTypes(artifacts: ArtifactRowForCheck[]): string[] {
  const typeCounts = new Map<string, number>()
  const requiredTypes = ['plan', 'worklog', 'changed-files', 'decisions', 'verification', 'pm-review', 'git-diff', 'instructions-used']
  
  for (const artifact of artifacts) {
    if (artifact.agent_type !== 'implementation') continue
    const extracted = extractArtifactTypeFromTitle(artifact.title || '')
    if (extracted && requiredTypes.includes(extracted)) {
      typeCounts.set(extracted, (typeCounts.get(extracted) || 0) + 1)
    }
  }
  
  const duplicates: string[] = []
  for (const [type, count] of typeCounts.entries()) {
    if (count > 1) {
      duplicates.push(type)
    }
  }
  
  return duplicates
}

/**
 * Checks if QA report is malformed (present but invalid).
 * Returns true if QA report exists but is malformed.
 */
function hasMalformedQaReport(artifacts: ArtifactRowForCheck[]): boolean {
  const qaReport = artifacts.find((a) => {
    if (a.agent_type !== 'qa') return false
    const extracted = extractArtifactTypeFromTitle(a.title || '')
    return extracted === 'qa-report'
  })
  
  if (!qaReport) return false
  
  // QA report exists but is blank/non-substantive
  return !isSubstantiveBody(qaReport.body_md)
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
    json(res, 405, {
      success: false,
      error: 'Method Not Allowed',
    })
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Resolve ticket PK if only ticketId provided
    let resolvedTicketPk: string | null = null
    
    if (ticketPk) {
      resolvedTicketPk = ticketPk
    } else if (ticketId) {
      // Try multiple lookup strategies (same as move.ts)
      let ticketFetch: { data: any; error: any } | null = null
      
      ticketFetch = await supabase.from('tickets').select('pk').eq('id', ticketId).maybeSingle()
      
      if (ticketFetch && (ticketFetch.error || !ticketFetch.data)) {
        ticketFetch = await supabase.from('tickets').select('pk').eq('display_id', ticketId).maybeSingle()
      }
      
      if (ticketFetch && (ticketFetch.error || !ticketFetch.data) && /^[A-Z]+-/.test(ticketId)) {
        const numericPart = ticketId.replace(/^[A-Z]+-/, '')
        const idValue = numericPart.replace(/^0+/, '') || numericPart
        if (idValue !== ticketId) {
          ticketFetch = await supabase.from('tickets').select('pk').eq('id', idValue).maybeSingle()
        }
      }
      
      if (ticketFetch && (ticketFetch.error || !ticketFetch.data) && /^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
        const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
        if (withoutLeadingZeros !== ticketId) {
          ticketFetch = await supabase.from('tickets').select('pk').eq('id', withoutLeadingZeros).maybeSingle()
        }
      }

      if (ticketFetch && !ticketFetch.error && ticketFetch.data) {
        resolvedTicketPk = ticketFetch.data.pk
      }
    }

    if (!resolvedTicketPk) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    // Fetch all artifacts
    const { data: artifactRows, error: artErr } = await supabase
      .from('agent_artifacts')
      .select('title, agent_type, body_md')
      .eq('ticket_pk', resolvedTicketPk)

    if (artErr) {
      json(res, 200, {
        success: false,
        error: `Failed to check artifacts: ${artErr.message}.`,
      })
      return
    }

    const artifactsForCheck: ArtifactRowForCheck[] = (artifactRows || []).map((r: any) => ({
      title: r.title,
      agent_type: r.agent_type,
      body_md: r.body_md,
    }))

    // Filter to implementation artifacts for missing check
    const implementationArtifacts = artifactsForCheck.filter((a) => a.agent_type === 'implementation')
    const missingArtifacts = getMissingRequiredImplementationArtifacts(implementationArtifacts)
    const blankArtifacts = getBlankRequiredArtifacts(implementationArtifacts)
    const duplicateArtifacts = getDuplicateArtifactTypes(implementationArtifacts)
    const hasMalformedQa = hasMalformedQaReport(artifactsForCheck)
    const hasExplanation = hasMissingArtifactExplanation(artifactsForCheck)

    // Determine gate result
    // Pass if: only missing artifacts exist AND explanation exists
    // Fail if: other issues exist OR missing artifacts without explanation
    const hasOtherFailures = blankArtifacts.length > 0 || duplicateArtifacts.length > 0 || hasMalformedQa
    const hasOnlyMissingArtifacts = missingArtifacts.length > 0 && !hasOtherFailures

    const passed = hasOnlyMissingArtifacts && hasExplanation
    const reason = passed
      ? 'Allowed due to Missing Artifact Explanation'
      : hasOnlyMissingArtifacts && !hasExplanation
      ? 'Missing required implementation artifacts. Add a "Missing Artifact Explanation" artifact to explain why they are missing.'
      : hasOtherFailures
      ? `Gate failed due to: ${[
          blankArtifacts.length > 0 ? `blank artifacts (${blankArtifacts.join(', ')})` : null,
          duplicateArtifacts.length > 0 ? `duplicate artifacts (${duplicateArtifacts.join(', ')})` : null,
          hasMalformedQa ? 'malformed QA report' : null,
        ]
          .filter(Boolean)
          .join(', ')}`
      : missingArtifacts.length > 0
      ? `Missing required implementation artifacts: ${missingArtifacts.join(', ')}`
      : 'All required artifacts are present and valid.'

    json(res, 200, {
      success: true,
      passed,
      reason,
      missingArtifacts,
      blankArtifacts,
      duplicateArtifacts,
      hasMalformedQa,
      hasExplanation,
    })
  } catch (err) {
    console.error('[api/artifacts/check-gate] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    json(res, 500, {
      success: false,
      error: errorMessage,
    })
  }
}
