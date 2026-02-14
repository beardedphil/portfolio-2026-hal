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

export interface PeerReviewIssue {
  type: 'missing-section' | 'invalid-format' | 'placeholder' | 'empty-section'
  section?: string
  message: string
  /** Line number or section identifier for navigation */
  location?: string
}

export interface PeerReviewResult {
  pass: boolean
  issues: PeerReviewIssue[]
  checklistResults: {
    goal: boolean
    deliverable: boolean
    acceptanceCriteria: boolean
    constraints: boolean
    nonGoals: boolean
    noPlaceholders: boolean
  }
}

/**
 * Comprehensive peer review evaluation against Definition of Ready.
 * Checks for all required sections, proper formatting, and no placeholders.
 */
export function evaluatePeerReview(bodyMd: string): PeerReviewResult {
  const body = bodyMd.trim()
  const issues: PeerReviewIssue[] = []
  const checklistResults = {
    goal: false,
    deliverable: false,
    acceptanceCriteria: false,
    constraints: false,
    nonGoals: false,
    noPlaceholders: true,
  }

  // Check for Goal section
  const goalMatch = body.match(/^##\s+Goal\s*\(one\s+sentence\)/im)
  if (!goalMatch) {
    issues.push({
      type: 'missing-section',
      section: 'Goal (one sentence)',
      message: 'Missing required section: "Goal (one sentence)"',
      location: 'Goal',
    })
  } else {
    // Check if Goal section has content (not just placeholder)
    const goalSectionMatch = body.match(/^##\s+Goal\s*\(one\s+sentence\)\s*\n\n(.+?)(?=\n##|$)/ims)
    if (goalSectionMatch) {
      const goalContent = goalSectionMatch[1].trim()
      const hasPlaceholder = /<[^>]+>/.test(goalContent) || /TBD|TODO|fill\s+in/i.test(goalContent)
      if (!goalContent || goalContent.length < 10 || hasPlaceholder) {
        issues.push({
          type: 'empty-section',
          section: 'Goal (one sentence)',
          message: 'Goal section is empty or contains placeholders',
          location: 'Goal',
        })
      } else {
        checklistResults.goal = true
      }
    } else {
      checklistResults.goal = true
    }
  }

  // Check for Human-verifiable deliverable section
  const deliverableMatch = body.match(/^##\s+Human-verifiable\s+deliverable\s*\(UI-only\)/im)
  if (!deliverableMatch) {
    issues.push({
      type: 'missing-section',
      section: 'Human-verifiable deliverable (UI-only)',
      message: 'Missing required section: "Human-verifiable deliverable (UI-only)"',
      location: 'Human-verifiable deliverable',
    })
  } else {
    const deliverableSectionMatch = body.match(/^##\s+Human-verifiable\s+deliverable\s*\(UI-only\)\s*\n\n(.+?)(?=\n##|$)/ims)
    if (deliverableSectionMatch) {
      const deliverableContent = deliverableSectionMatch[1].trim()
      const hasPlaceholder = /<[^>]+>/.test(deliverableContent) || /TBD|TODO|fill\s+in|Describe\s+exactly/i.test(deliverableContent)
      if (!deliverableContent || deliverableContent.length < 20 || hasPlaceholder) {
        issues.push({
          type: 'empty-section',
          section: 'Human-verifiable deliverable (UI-only)',
          message: 'Human-verifiable deliverable section is empty or contains placeholders',
          location: 'Human-verifiable deliverable',
        })
      } else {
        checklistResults.deliverable = true
      }
    } else {
      checklistResults.deliverable = true
    }
  }

  // Check for Acceptance criteria section with checkboxes
  const acceptanceCriteriaMatch = body.match(/^##\s+Acceptance\s+criteria\s*\(UI-only\)/im)
  if (!acceptanceCriteriaMatch) {
    issues.push({
      type: 'missing-section',
      section: 'Acceptance criteria (UI-only)',
      message: 'Missing required section: "Acceptance criteria (UI-only)"',
      location: 'Acceptance criteria',
    })
  } else {
    const acSectionMatch = body.match(/^##\s+Acceptance\s+criteria\s*\(UI-only\)\s*\n\n(.+?)(?=\n##|$)/ims)
    if (acSectionMatch) {
      const acContent = acSectionMatch[1]
      // Check for checkbox format (- [ ])
      const checkboxLines = acContent.match(/^-\s+\[\s*\]/gm)
      const plainBulletLines = acContent.match(/^-\s+(?!\[)/gm)
      
      if (!checkboxLines || checkboxLines.length === 0) {
        if (plainBulletLines && plainBulletLines.length > 0) {
          issues.push({
            type: 'invalid-format',
            section: 'Acceptance criteria (UI-only)',
            message: 'Acceptance criteria must use checkbox format (- [ ]), not plain bullets (-)',
            location: 'Acceptance criteria',
          })
        } else {
          issues.push({
            type: 'empty-section',
            section: 'Acceptance criteria (UI-only)',
            message: 'Acceptance criteria section is empty or has no items',
            location: 'Acceptance criteria',
          })
        }
      } else {
        // Check for placeholders in acceptance criteria
        const hasPlaceholder = /<[^>]+>/.test(acContent) || /TBD|TODO|fill\s+in|<AC\s+\d+>/i.test(acContent)
        if (hasPlaceholder) {
          issues.push({
            type: 'placeholder',
            section: 'Acceptance criteria (UI-only)',
            message: 'Acceptance criteria contains unresolved placeholders',
            location: 'Acceptance criteria',
          })
        } else {
          checklistResults.acceptanceCriteria = true
        }
      }
    } else {
      checklistResults.acceptanceCriteria = true
    }
  }

  // Check for Constraints section
  const constraintsMatch = body.match(/^##\s+Constraints\s*\n/im)
  if (!constraintsMatch) {
    issues.push({
      type: 'missing-section',
      section: 'Constraints',
      message: 'Missing required section: "Constraints"',
      location: 'Constraints',
    })
  } else {
    const constraintsSectionMatch = body.match(/^##\s+Constraints\s*\n\n(.+?)(?=\n##|$)/ims)
    if (constraintsSectionMatch) {
      const constraintsContent = constraintsSectionMatch[1].trim()
      const hasPlaceholder = /<[^>]+>/.test(constraintsContent) || /TBD|TODO|fill\s+in/i.test(constraintsContent)
      if (!constraintsContent || constraintsContent.length < 5 || hasPlaceholder) {
        issues.push({
          type: 'empty-section',
          section: 'Constraints',
          message: 'Constraints section is empty or contains placeholders',
          location: 'Constraints',
        })
      } else {
        checklistResults.constraints = true
      }
    } else {
      checklistResults.constraints = true
    }
  }

  // Check for Non-goals section
  const nonGoalsMatch = body.match(/^##\s+Non-goals\s*\n/im)
  if (!nonGoalsMatch) {
    issues.push({
      type: 'missing-section',
      section: 'Non-goals',
      message: 'Missing required section: "Non-goals"',
      location: 'Non-goals',
    })
  } else {
    const nonGoalsSectionMatch = body.match(/^##\s+Non-goals\s*\n\n(.+?)(?=\n##|$)/ims)
    if (nonGoalsSectionMatch) {
      const nonGoalsContent = nonGoalsSectionMatch[1].trim()
      const hasPlaceholder = /<[^>]+>/.test(nonGoalsContent) || /TBD|TODO|fill\s+in/i.test(nonGoalsContent)
      if (!nonGoalsContent || nonGoalsContent.length < 5 || hasPlaceholder) {
        issues.push({
          type: 'empty-section',
          section: 'Non-goals',
          message: 'Non-goals section is empty or contains placeholders',
          location: 'Non-goals',
        })
      } else {
        checklistResults.nonGoals = true
      }
    } else {
      checklistResults.nonGoals = true
    }
  }

  // Check for unresolved placeholders throughout the document
  const placeholderPattern = /<[A-Za-z0-9\s\-_]+>/g
  const placeholders = body.match(placeholderPattern) ?? []
  const textPlaceholders = body.match(/\b(TBD|TODO|fill\s+in\s+later|auto-assigned|\(fill\s+in\s+later\))\b/gi) ?? []
  
  if (placeholders.length > 0 || textPlaceholders.length > 0) {
    const uniquePlaceholders = [...new Set([...placeholders, ...textPlaceholders])]
    issues.push({
      type: 'placeholder',
      message: `Unresolved placeholders found: ${uniquePlaceholders.slice(0, 5).join(', ')}${uniquePlaceholders.length > 5 ? '...' : ''}`,
      location: 'Document',
    })
    checklistResults.noPlaceholders = false
  }

  const pass = issues.length === 0

  return {
    pass,
    issues,
    checklistResults,
  }
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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      ticketPk?: string
      bodyMd?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const bodyMd = typeof body.bodyMd === 'string' ? body.bodyMd : undefined

    // Use credentials from request body if provided, otherwise fall back to server environment variables
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

    let ticketBodyMd = bodyMd

    // If bodyMd not provided, fetch from Supabase
    if (!ticketBodyMd && (ticketId || ticketPk)) {
      if (!supabaseUrl || !supabaseAnonKey) {
        json(res, 400, {
          success: false,
          error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
        })
        return
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const fetch = ticketPk
        ? await supabase.from('tickets').select('body_md').eq('pk', ticketPk).maybeSingle()
        : await supabase.from('tickets').select('body_md').eq('id', ticketId!).maybeSingle()

      if (fetch.error) {
        json(res, 200, { success: false, error: `Supabase fetch failed: ${fetch.error.message}` })
        return
      }

      if (!fetch.data) {
        json(res, 200, { success: false, error: `Ticket ${ticketId || ticketPk} not found.` })
        return
      }

      ticketBodyMd = fetch.data.body_md || ''
    }

    if (!ticketBodyMd) {
      json(res, 400, {
        success: false,
        error: 'Ticket body_md is required (provide bodyMd in request body or ticketId/ticketPk to fetch from Supabase).',
      })
      return
    }

    const result = evaluatePeerReview(ticketBodyMd)

    json(res, 200, {
      success: true,
      ...result,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}
