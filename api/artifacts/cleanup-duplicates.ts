import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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
 * Extract artifact type from title
 */
function extractArtifactTypeFromTitle(title: string): string | null {
  const normalized = (title || '').toLowerCase().trim()
  
  if (normalized.startsWith('plan for ticket')) return 'plan'
  if (normalized.startsWith('worklog for ticket')) return 'worklog'
  if (normalized.startsWith('changed files for ticket')) return 'changed-files'
  if (normalized.startsWith('decisions for ticket')) return 'decisions'
  if (normalized.startsWith('verification for ticket')) return 'verification'
  if (normalized.startsWith('pm review for ticket')) return 'pm-review'
  if (normalized.startsWith('qa report for ticket')) return 'qa-report'
  
  return null
}

/**
 * Create canonical title
 */
function createCanonicalTitle(artifactType: string, displayId: string): string {
  const titleMap: Record<string, string> = {
    'plan': `Plan for ticket ${displayId}`,
    'worklog': `Worklog for ticket ${displayId}`,
    'changed-files': `Changed Files for ticket ${displayId}`,
    'decisions': `Decisions for ticket ${displayId}`,
    'verification': `Verification for ticket ${displayId}`,
    'pm-review': `PM Review for ticket ${displayId}`,
    'qa-report': `QA report for ticket ${displayId}`,
  }
  
  return titleMap[artifactType] || `Artifact for ticket ${displayId}`
}

/**
 * Check if artifact has substantive content
 */
function hasSubstantiveContent(bodyMd: string | null | undefined): boolean {
  if (!bodyMd || bodyMd.trim().length === 0) return false
  
  const withoutHeadings = bodyMd
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*+]\s+.*$/gm, '')
    .replace(/^\d+\.\s+.*$/gm, '')
    .trim()
  
  if (withoutHeadings.length === 0) return false
  if (withoutHeadings.length < 30) return false
  
  return true
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
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
      ticketId?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined

    if (!ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketId is required.',
      })
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 500, {
        success: false,
        error: 'Supabase credentials not configured on server.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const ticketNumber = parseInt(ticketId, 10)
    if (!Number.isFinite(ticketNumber)) {
      json(res, 400, {
        success: false,
        error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
      })
      return
    }

    // Find ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk, ticket_number, display_id, repo_full_name')
      .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
      .maybeSingle()

    if (ticketError || !ticket) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId} not found.`,
      })
      return
    }

    const ticketPk = ticket.pk
    const displayId = ticket.display_id || ticketId

    // Fetch all artifacts
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
      })
      return
    }

    if (!artifacts || artifacts.length === 0) {
      json(res, 200, {
        success: true,
        deleted: 0,
        updated: 0,
        message: 'No artifacts found.',
      })
      return
    }

    // Group by canonical type
    const byType = new Map<string, Array<{ artifact_id: string; title: string; body_md?: string; created_at: string; agent_type: string }>>()
    for (const artifact of artifacts) {
      const type = extractArtifactTypeFromTitle(artifact.title || '')
      if (!type) continue
      
      if (!byType.has(type)) {
        byType.set(type, [])
      }
      byType.get(type)!.push(artifact)
    }

    let totalDeleted = 0
    let totalUpdated = 0

    // Process each type
    for (const [type, typeArtifacts] of byType.entries()) {
      if (typeArtifacts.length <= 1) {
        // No duplicates, but update title if needed
        const artifact = typeArtifacts[0]
        const canonicalTitle = createCanonicalTitle(type, displayId)
        
        if (artifact.title !== canonicalTitle) {
          const { error: updateError } = await supabase
            .from('agent_artifacts')
            .update({ title: canonicalTitle })
            .eq('artifact_id', artifact.artifact_id)
          
          if (!updateError) {
            totalUpdated++
          }
        }
        continue
      }

      // Find best artifact to keep
      const withContent = typeArtifacts.filter(a => hasSubstantiveContent(a.body_md))
      let keepArtifact = null
      
      if (withContent.length > 0) {
        keepArtifact = withContent[0] // Already sorted by created_at descending
      } else if (typeArtifacts.length > 0) {
        keepArtifact = typeArtifacts[0]
      }

      if (!keepArtifact) continue

      const canonicalTitle = createCanonicalTitle(type, displayId)
      const duplicateIds = typeArtifacts
        .filter(a => a.artifact_id !== keepArtifact!.artifact_id)
        .map(a => a.artifact_id)

      // Delete duplicates
      if (duplicateIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('agent_artifacts')
          .delete()
          .in('artifact_id', duplicateIds)

        if (!deleteError) {
          totalDeleted += duplicateIds.length
        }
      }

      // Update kept artifact title
      if (keepArtifact.title !== canonicalTitle) {
        const { error: updateError } = await supabase
          .from('agent_artifacts')
          .update({ title: canonicalTitle })
          .eq('artifact_id', keepArtifact.artifact_id)

        if (!updateError) {
          totalUpdated++
        }
      }
    }

    json(res, 200, {
      success: true,
      deleted: totalDeleted,
      updated: totalUpdated,
      message: `Cleaned up ${totalDeleted} duplicate(s) and updated ${totalUpdated} title(s).`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
