/**
 * API endpoint to validate a RED document and return deterministic validation results.
 * Enforces minimum quality gates:
 * - Functional Requirements ≥ 5
 * - Edge Cases ≥ 8
 * - Non-Functional Requirements present (non-empty)
 * - Out of Scope present (non-empty)
 * - Assumptions present (non-empty)
 * - No unresolved placeholders (TBD, TODO)
 * - No vague/low-signal items
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

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

// Configuration constants
const MIN_FUNCTIONAL_REQUIREMENTS = 5
const MIN_EDGE_CASES = 8
const MIN_ITEM_LENGTH = 20 // Minimum characters for an item to be considered non-vague

// Generic phrases that indicate vagueness (case-insensitive)
const VAGUE_PHRASES = [
  'handle errors',
  'make it robust',
  'optimize performance',
  'improve efficiency',
  'better user experience',
  'good performance',
  'fast response',
  'scalable solution',
  'clean code',
  'best practices',
]

// Placeholder patterns (case-insensitive)
const PLACEHOLDER_PATTERNS = [
  /^TBD$/i,
  /^TODO$/i,
  /^TBD\s*:?/i,
  /^TODO\s*:?/i,
  /<TBD>/i,
  /<TODO>/i,
  /\[TBD\]/i,
  /\[TODO\]/i,
]

interface ValidationFailure {
  category: string
  message: string
  field?: string
  item?: string
  expected?: number | string
  found?: number | string
}

/**
 * Validates a RED JSON document and returns deterministic results.
 */
function validateRed(redJson: unknown): { pass: boolean; failures: ValidationFailure[] } {
  const failures: ValidationFailure[] = []

  if (!redJson || typeof redJson !== 'object') {
    return {
      pass: false,
      failures: [{ category: 'Structure', message: 'RED JSON must be an object' }],
    }
  }

  const red = redJson as Record<string, unknown>

  // Helper to get array field
  const getArray = (field: string): string[] => {
    const value = red[field]
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string')
    }
    return []
  }

  // Helper to get string field
  const getString = (field: string): string => {
    const value = red[field]
    return typeof value === 'string' ? value.trim() : ''
  }

  // 1. Validate Functional Requirements count (≥ 5)
  const functionalRequirements = getArray('functionalRequirements')
  if (functionalRequirements.length < MIN_FUNCTIONAL_REQUIREMENTS) {
    failures.push({
      category: 'Minimum Count',
      message: `Functional Requirements: expected ≥ ${MIN_FUNCTIONAL_REQUIREMENTS}, found ${functionalRequirements.length}`,
      field: 'functionalRequirements',
      expected: `≥ ${MIN_FUNCTIONAL_REQUIREMENTS}`,
      found: functionalRequirements.length,
    })
  }

  // 2. Validate Edge Cases count (≥ 8)
  const edgeCases = getArray('edgeCases')
  if (edgeCases.length < MIN_EDGE_CASES) {
    failures.push({
      category: 'Minimum Count',
      message: `Edge Cases: expected ≥ ${MIN_EDGE_CASES}, found ${edgeCases.length}`,
      field: 'edgeCases',
      expected: `≥ ${MIN_EDGE_CASES}`,
      found: edgeCases.length,
    })
  }

  // 3. Validate Non-Functional Requirements presence
  const nonFunctionalRequirements = getString('nonFunctionalRequirements')
  if (!nonFunctionalRequirements) {
    failures.push({
      category: 'Required Field',
      message: 'Non-Functional Requirements: field is missing or empty',
      field: 'nonFunctionalRequirements',
    })
  }

  // 4. Validate Out of Scope presence
  const outOfScope = getString('outOfScope')
  if (!outOfScope) {
    failures.push({
      category: 'Required Field',
      message: 'Out of Scope: field is missing or empty',
      field: 'outOfScope',
    })
  }

  // 5. Validate Assumptions presence
  const assumptions = getString('assumptions')
  if (!assumptions) {
    failures.push({
      category: 'Required Field',
      message: 'Assumptions: field is missing or empty',
      field: 'assumptions',
    })
  }

  // 6. Check for unresolved placeholders in all text fields
  const checkPlaceholders = (text: string, fieldName: string): void => {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(text)) {
        failures.push({
          category: 'Placeholder',
          message: `${fieldName}: contains unresolved placeholder (TBD/TODO)`,
          field: fieldName,
        })
        return // Only report once per field
      }
    }
  }

  // Check placeholders in string fields
  if (nonFunctionalRequirements) {
    checkPlaceholders(nonFunctionalRequirements, 'nonFunctionalRequirements')
  }
  if (outOfScope) {
    checkPlaceholders(outOfScope, 'outOfScope')
  }
  if (assumptions) {
    checkPlaceholders(assumptions, 'assumptions')
  }

  // Check placeholders in array items
  functionalRequirements.forEach((item, index) => {
    checkPlaceholders(item, `functionalRequirements[${index}]`)
  })
  edgeCases.forEach((item, index) => {
    checkPlaceholders(item, `edgeCases[${index}]`)
  })

  // 7. Check for vague/low-signal items
  const checkVagueness = (item: string, fieldName: string, index?: number): void => {
    const trimmed = item.trim()
    
    // Heuristic 1: Minimum length check
    if (trimmed.length < MIN_ITEM_LENGTH) {
      failures.push({
        category: 'Vagueness',
        message: `${fieldName}${index !== undefined ? `[${index}]` : ''}: item is too short (${trimmed.length} characters, minimum ${MIN_ITEM_LENGTH})`,
        field: fieldName,
        item: trimmed,
        expected: `≥ ${MIN_ITEM_LENGTH} characters`,
        found: `${trimmed.length} characters`,
      })
      return
    }

    // Heuristic 2: Generic phrase check
    const lowerItem = trimmed.toLowerCase()
    for (const phrase of VAGUE_PHRASES) {
      if (lowerItem.includes(phrase.toLowerCase())) {
        // Check if it's just the phrase without specifics
        const withoutPhrase = lowerItem.replace(phrase.toLowerCase(), '').trim()
        if (withoutPhrase.length < 10) {
          // If removing the vague phrase leaves very little, it's too vague
          failures.push({
            category: 'Vagueness',
            message: `${fieldName}${index !== undefined ? `[${index}]` : ''}: contains generic phrase "${phrase}" without specifics`,
            field: fieldName,
            item: trimmed,
          })
          return
        }
      }
    }
  }

  // Check vagueness in array items
  functionalRequirements.forEach((item, index) => {
    checkVagueness(item, 'functionalRequirements', index)
  })
  edgeCases.forEach((item, index) => {
    checkVagueness(item, 'edgeCases', index)
  })

  // Sort failures deterministically by category, then by field, then by message
  failures.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category)
    }
    if (a.field !== b.field) {
      const aField = a.field || ''
      const bField = b.field || ''
      return aField.localeCompare(bField)
    }
    return a.message.localeCompare(b.message)
  })

  return {
    pass: failures.length === 0,
    failures,
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
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      version?: number
      redJson?: unknown
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const version = typeof body.version === 'number' ? body.version : undefined
    const redJson = body.redJson

    // If redJson is not provided, fetch it from the database
    let redJsonToValidate: unknown = redJson

    if (!redJsonToValidate) {
      if (!ticketPk && !ticketId) {
        json(res, 400, {
          success: false,
          error: 'Either redJson must be provided, or ticketPk/ticketId and version must be provided to fetch RED from database.',
        })
        return
      }

      if (version === undefined) {
        json(res, 400, {
          success: false,
          error: 'version is required when redJson is not provided.',
        })
        return
      }

      const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

      if (!supabaseUrl || !supabaseKey) {
        json(res, 400, {
          success: false,
          error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
        })
        return
      }

      const supabase = createClient(supabaseUrl, supabaseKey)

      // Resolve ticketPk and repoFullName if needed
      let resolvedTicketPk: string | undefined = ticketPk
      let resolvedRepoFullName: string | undefined = repoFullName

      if (!resolvedTicketPk && ticketId) {
        const { data: ticket, error: ticketError } = await supabase
          .from('tickets')
          .select('pk, repo_full_name')
          .eq('id', ticketId)
          .maybeSingle()

        if (ticketError) {
          json(res, 200, {
            success: false,
            error: `Failed to fetch ticket: ${ticketError.message}`,
          })
          return
        }

        if (!ticket) {
          json(res, 200, {
            success: false,
            error: `Ticket ${ticketId} not found.`,
          })
          return
        }

        resolvedTicketPk = ticket.pk
        resolvedRepoFullName = ticket.repo_full_name
      } else if (resolvedTicketPk && !resolvedRepoFullName) {
        const { data: ticket, error: ticketError } = await supabase
          .from('tickets')
          .select('repo_full_name')
          .eq('pk', resolvedTicketPk)
          .maybeSingle()

        if (ticketError) {
          json(res, 200, {
            success: false,
            error: `Failed to fetch ticket: ${ticketError.message}`,
          })
          return
        }

        if (ticket) {
          resolvedRepoFullName = ticket.repo_full_name
        }
      }

      if (!resolvedTicketPk || !resolvedRepoFullName) {
        json(res, 400, {
          success: false,
          error: 'Could not resolve ticket_pk and repo_full_name. Please provide ticketPk and repoFullName, or ticketId.',
        })
        return
      }

      // Fetch RED document
      const { data: redDocument, error: redError } = await supabase
        .from('hal_red_documents')
        .select('red_json')
        .eq('repo_full_name', resolvedRepoFullName)
        .eq('ticket_pk', resolvedTicketPk)
        .eq('version', version)
        .maybeSingle()

      if (redError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch RED: ${redError.message}`,
        })
        return
      }

      if (!redDocument) {
        json(res, 200, {
          success: false,
          error: `RED version ${version} not found for this ticket.`,
        })
        return
      }

      redJsonToValidate = redDocument.red_json
    }

    // Validate the RED JSON
    const validationResult = validateRed(redJsonToValidate)
    const validatedAt = new Date().toISOString()

    // If ticketPk and version are provided, store validation results in the database
    if (ticketPk && version && repoFullName) {
      const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Resolve ticketPk and repoFullName if needed
        let resolvedTicketPk: string | undefined = ticketPk
        let resolvedRepoFullName: string | undefined = repoFullName

        if (!resolvedTicketPk && ticketId) {
          const { data: ticket } = await supabase
            .from('tickets')
            .select('pk, repo_full_name')
            .eq('id', ticketId)
            .maybeSingle()

          if (ticket) {
            resolvedTicketPk = ticket.pk
            resolvedRepoFullName = ticket.repo_full_name
          }
        } else if (resolvedTicketPk && !resolvedRepoFullName) {
          const { data: ticket } = await supabase
            .from('tickets')
            .select('repo_full_name')
            .eq('pk', resolvedTicketPk)
            .maybeSingle()

          if (ticket) {
            resolvedRepoFullName = ticket.repo_full_name
          }
        }

        if (resolvedTicketPk && resolvedRepoFullName) {
          // Fetch the RED document to get red_id
          const { data: redDocument, error: redError } = await supabase
            .from('hal_red_documents')
            .select('red_id')
            .eq('repo_full_name', resolvedRepoFullName)
            .eq('ticket_pk', resolvedTicketPk)
            .eq('version', version)
            .maybeSingle()

          if (!redError && redDocument) {
            // Store or update validation result (upsert)
            const { error: validationError } = await supabase
              .from('hal_red_validation_results')
              .upsert(
                {
                  red_id: redDocument.red_id,
                  repo_full_name: resolvedRepoFullName,
                  ticket_pk: resolvedTicketPk,
                  version,
                  pass: validationResult.pass,
                  failures: validationResult.failures,
                  validated_at: validatedAt,
                },
                {
                  onConflict: 'red_id',
                }
              )

            if (validationError) {
              console.warn('Failed to store validation result:', validationError)
              // Continue anyway - validation result is still returned to the client
            }
          }
        }
      }
    }

    json(res, 200, {
      success: true,
      pass: validationResult.pass,
      failures: validationResult.failures,
      validatedAt,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}
