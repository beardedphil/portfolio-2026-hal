/**
 * API endpoint to validate a RED document against quality gates.
 * Returns deterministic validation results with ordered failure messages.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

// Configuration constants
const MIN_FUNCTIONAL_REQUIREMENTS = 5
const MIN_EDGE_CASES = 8
const MIN_ITEM_LENGTH = 20 // Minimum characters for a valid item
const PLACEHOLDER_PATTERNS = [
  /^TBD$/i,
  /^TODO$/i,
  /^TBD\s*[:.]/i,
  /^TODO\s*[:.]/i,
  /\bTBD\b/i,
  /\bTODO\b/i,
]
const VAGUE_PATTERNS = [
  /^handle\s+errors?$/i,
  /^make\s+it\s+robust$/i,
  /^optimize\s+performance$/i,
  /^handle\s+edge\s+cases?$/i,
  /^ensure\s+quality$/i,
  /^make\s+it\s+scalable$/i,
  /^improve\s+performance$/i,
]

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

interface ValidationFailure {
  type: 'count' | 'presence' | 'placeholder' | 'vagueness'
  field: string
  message: string
  expected?: number | string
  found?: number | string
  item?: string
}

interface ValidationResult {
  pass: boolean
  failures: ValidationFailure[]
  validatedAt: string
}

/**
 * Validates a RED JSON document against quality gates.
 * Returns deterministic results with ordered failure messages.
 */
function validateRedDocument(redJson: unknown): ValidationResult {
  const failures: ValidationFailure[] = []
  
  if (!redJson || typeof redJson !== 'object') {
    return {
      pass: false,
      failures: [{
        type: 'presence',
        field: 'red_json',
        message: 'RED JSON must be a valid object',
      }],
      validatedAt: new Date().toISOString(),
    }
  }
  
  const red = redJson as Record<string, unknown>
  
  // Helper to get array field
  const getArray = (field: string): string[] => {
    const value = red[field]
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
  }
  
  // Helper to get string field
  const getString = (field: string): string => {
    const value = red[field]
    return typeof value === 'string' ? value.trim() : ''
  }
  
  // Helper to check if string is empty
  const isEmpty = (str: string): boolean => !str || str.trim().length === 0
  
  // Helper to check for placeholders
  const hasPlaceholder = (text: string): boolean => {
    return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text))
  }
  
  // Helper to check for vague patterns
  const isVague = (text: string): boolean => {
    const trimmed = text.trim()
    if (trimmed.length < MIN_ITEM_LENGTH) return true
    return VAGUE_PATTERNS.some(pattern => pattern.test(trimmed))
  }
  
  // Helper to validate array items for placeholders and vagueness
  const validateArrayItems = (field: string, items: string[], minCount: number | null = null): void => {
    if (minCount !== null && items.length < minCount) {
      failures.push({
        type: 'count',
        field,
        message: `${field}: expected ≥ ${minCount}, found ${items.length}`,
        expected: minCount,
        found: items.length,
      })
    }
    
    // Check each item for placeholders and vagueness
    items.forEach((item, index) => {
      if (hasPlaceholder(item)) {
        failures.push({
          type: 'placeholder',
          field: `${field}[${index}]`,
          message: `${field}[${index}]: contains unresolved placeholder (TBD/TODO)`,
          item,
        })
      } else if (isVague(item)) {
        failures.push({
          type: 'vagueness',
          field: `${field}[${index}]`,
          message: `${field}[${index}]: item is too vague or too short (minimum ${MIN_ITEM_LENGTH} characters, avoid generic phrases)`,
          item,
        })
      }
    })
  }
  
  // Validate Functional Requirements (≥ 5)
  const functionalRequirements = getArray('functionalRequirements')
  validateArrayItems('Functional Requirements', functionalRequirements, MIN_FUNCTIONAL_REQUIREMENTS)
  
  // Validate Edge Cases (≥ 8)
  const edgeCases = getArray('edgeCases')
  validateArrayItems('Edge Cases', edgeCases, MIN_EDGE_CASES)
  
  // Validate Non-Functional Requirements (presence, non-empty)
  const nonFunctionalRequirements = getString('nonFunctionalRequirements')
  if (isEmpty(nonFunctionalRequirements)) {
    failures.push({
      type: 'presence',
      field: 'Non-Functional Requirements',
      message: 'Non-Functional Requirements: field is missing or empty',
    })
  } else {
    if (hasPlaceholder(nonFunctionalRequirements)) {
      failures.push({
        type: 'placeholder',
        field: 'Non-Functional Requirements',
        message: 'Non-Functional Requirements: contains unresolved placeholder (TBD/TODO)',
        item: nonFunctionalRequirements,
      })
    } else if (isVague(nonFunctionalRequirements)) {
      failures.push({
        type: 'vagueness',
        field: 'Non-Functional Requirements',
        message: `Non-Functional Requirements: content is too vague or too short (minimum ${MIN_ITEM_LENGTH} characters, avoid generic phrases)`,
        item: nonFunctionalRequirements,
      })
    }
  }
  
  // Validate Out of Scope (presence, non-empty)
  const outOfScope = getString('outOfScope')
  if (isEmpty(outOfScope)) {
    failures.push({
      type: 'presence',
      field: 'Out of Scope',
      message: 'Out of Scope: field is missing or empty',
    })
  } else {
    if (hasPlaceholder(outOfScope)) {
      failures.push({
        type: 'placeholder',
        field: 'Out of Scope',
        message: 'Out of Scope: contains unresolved placeholder (TBD/TODO)',
        item: outOfScope,
      })
    } else if (isVague(outOfScope)) {
      failures.push({
        type: 'vagueness',
        field: 'Out of Scope',
        message: `Out of Scope: content is too vague or too short (minimum ${MIN_ITEM_LENGTH} characters, avoid generic phrases)`,
        item: outOfScope,
      })
    }
  }
  
  // Validate Assumptions (presence, non-empty)
  const assumptions = getString('assumptions')
  if (isEmpty(assumptions)) {
    failures.push({
      type: 'presence',
      field: 'Assumptions',
      message: 'Assumptions: field is missing or empty',
    })
  } else {
    if (hasPlaceholder(assumptions)) {
      failures.push({
        type: 'placeholder',
        field: 'Assumptions',
        message: 'Assumptions: contains unresolved placeholder (TBD/TODO)',
        item: assumptions,
      })
    } else if (isVague(assumptions)) {
      failures.push({
        type: 'vagueness',
        field: 'Assumptions',
        message: `Assumptions: content is too vague or too short (minimum ${MIN_ITEM_LENGTH} characters, avoid generic phrases)`,
        item: assumptions,
      })
    }
  }
  
  // Sort failures deterministically by type, then field
  // Order: count, presence, placeholder, vagueness
  const typeOrder: Record<string, number> = {
    count: 0,
    presence: 1,
    placeholder: 2,
    vagueness: 3,
  }
  
  failures.sort((a, b) => {
    const typeDiff = (typeOrder[a.type] ?? 999) - (typeOrder[b.type] ?? 999)
    if (typeDiff !== 0) return typeDiff
    return a.field.localeCompare(b.field)
  })
  
  return {
    pass: failures.length === 0,
    failures,
    validatedAt: new Date().toISOString(),
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

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // If we have ticketId but not ticketPk, fetch ticket to get ticketPk and repoFullName
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
      // Fetch repo_full_name if we have ticketPk but not repoFullName
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

    // If version is provided, fetch RED document from database
    let redDocumentToValidate: unknown = redJson
    let redVersion: number | undefined = version

    if (version !== undefined && resolvedTicketPk && resolvedRepoFullName) {
      const { data: redData, error: redError } = await supabase
        .from('hal_red_documents')
        .select('red_json, version')
        .eq('repo_full_name', resolvedRepoFullName)
        .eq('ticket_pk', resolvedTicketPk)
        .eq('version', version)
        .maybeSingle()

      if (redError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch RED document: ${redError.message}`,
        })
        return
      }

      if (!redData) {
        json(res, 200, {
          success: false,
          error: `RED version ${version} not found for this ticket.`,
        })
        return
      }

      redDocumentToValidate = redData.red_json
      redVersion = redData.version as number
    } else if (!redJson) {
      json(res, 400, {
        success: false,
        error: 'Either redJson or version (with ticketPk/ticketId and repoFullName) must be provided.',
      })
      return
    }

    // Perform validation
    const validationResult = validateRedDocument(redDocumentToValidate)

    // If we have a version and ticket info, update the validation status in the database
    if (redVersion !== undefined && resolvedTicketPk && resolvedRepoFullName) {
      const validationStatus = validationResult.pass ? 'valid' : 'invalid'
      
      // Update validation_status, validation_result, and validated_at
      const { error: updateError } = await supabase
        .from('hal_red_documents')
        .update({
          validation_status: validationStatus,
          validation_result: validationResult,
          validated_at: validationResult.validatedAt,
        })
        .eq('repo_full_name', resolvedRepoFullName)
        .eq('ticket_pk', resolvedTicketPk)
        .eq('version', redVersion)

      if (updateError) {
        json(res, 200, {
          success: false,
          error: `Failed to update validation result: ${updateError.message}`,
        })
        return
      }
    }

    json(res, 200, {
      success: true,
      validation: validationResult,
      ...(redVersion !== undefined ? { version: redVersion } : {}),
      ...(resolvedTicketPk ? { ticket_pk: resolvedTicketPk } : {}),
      ...(resolvedRepoFullName ? { repo_full_name: resolvedRepoFullName } : {}),
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}
