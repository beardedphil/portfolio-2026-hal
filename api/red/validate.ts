import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'

// Import validator (we'll need to compile this or use a shared implementation)
// For now, we'll inline a simplified version or use a Node-compatible approach
// Since this is a Vercel serverless function, we can't directly import from projects/kanban
// We'll need to either:
// 1. Move the validator to a shared location
// 2. Duplicate the logic here
// 3. Use a build step to bundle it

// For now, let's create a server-side compatible version
interface ValidationFailure {
  type: 'count' | 'presence' | 'placeholder' | 'vagueness'
  field: string
  message: string
  expected?: number | string
  found?: number | string
  itemIndex?: number
  itemValue?: string
}

interface ValidationResult {
  pass: boolean
  failures: ValidationFailure[]
  validatedAt: string
}

interface RedDocument {
  version?: string
  functionalRequirements?: string[]
  edgeCases?: string[]
  nonFunctionalRequirements?: string | string[]
  outOfScope?: string | string[]
  assumptions?: string | string[]
  [key: string]: unknown
}

const MIN_FUNCTIONAL_REQUIREMENTS = 5
const MIN_EDGE_CASES = 8
const MIN_ITEM_LENGTH = 20

const VAGUE_PATTERNS = [
  /handle\s+errors?/i,
  /make\s+it\s+robust/i,
  /optimize\s+performance/i,
  /ensure\s+quality/i,
  /be\s+user\s+friendly/i,
  /should\s+work\s+well/i,
  /be\s+efficient/i,
  /be\s+fast/i,
  /be\s+secure/i,
  /be\s+reliable/i,
]

const PLACEHOLDER_PATTERNS = [
  /^TBD$/i,
  /^TODO$/i,
  /^TBD\s*$/i,
  /^TODO\s*$/i,
  /^TBD\s*[:\-]/i,
  /^TODO\s*[:\-]/i,
  /\[TBD\]/i,
  /\[TODO\]/i,
  /\bTBD\b/i,
  /\bTODO\b/i,
]

function normalizeToArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  return value
}

function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text))
}

function isVague(text: string): boolean {
  if (text.trim().length < MIN_ITEM_LENGTH) return true
  return VAGUE_PATTERNS.some(pattern => pattern.test(text))
}

function validateRed(red: RedDocument): ValidationResult {
  const failures: ValidationFailure[] = []
  
  const functionalRequirements = normalizeToArray(red.functionalRequirements)
  const edgeCases = normalizeToArray(red.edgeCases)
  const nonFunctionalRequirements = normalizeToArray(red.nonFunctionalRequirements)
  const outOfScope = normalizeToArray(red.outOfScope)
  const assumptions = normalizeToArray(red.assumptions)
  
  if (functionalRequirements.length < MIN_FUNCTIONAL_REQUIREMENTS) {
    failures.push({
      type: 'count',
      field: 'functionalRequirements',
      message: `Functional Requirements: expected ≥ ${MIN_FUNCTIONAL_REQUIREMENTS}, found ${functionalRequirements.length}`,
      expected: MIN_FUNCTIONAL_REQUIREMENTS,
      found: functionalRequirements.length,
    })
  }
  
  if (edgeCases.length < MIN_EDGE_CASES) {
    failures.push({
      type: 'count',
      field: 'edgeCases',
      message: `Edge Cases: expected ≥ ${MIN_EDGE_CASES}, found ${edgeCases.length}`,
      expected: MIN_EDGE_CASES,
      found: edgeCases.length,
    })
  }
  
  if (nonFunctionalRequirements.length === 0 || nonFunctionalRequirements.every(item => !item.trim())) {
    failures.push({
      type: 'presence',
      field: 'nonFunctionalRequirements',
      message: 'Non-Functional Requirements: required but missing or empty',
      expected: 'non-empty',
      found: 'empty',
    })
  }
  
  if (outOfScope.length === 0 || outOfScope.every(item => !item.trim())) {
    failures.push({
      type: 'presence',
      field: 'outOfScope',
      message: 'Out of Scope: required but missing or empty',
      expected: 'non-empty',
      found: 'empty',
    })
  }
  
  if (assumptions.length === 0 || assumptions.every(item => !item.trim())) {
    failures.push({
      type: 'presence',
      field: 'assumptions',
      message: 'Assumptions: required but missing or empty',
      expected: 'non-empty',
      found: 'empty',
    })
  }
  
  const allFields: Array<{ name: string; items: string[] }> = [
    { name: 'functionalRequirements', items: functionalRequirements },
    { name: 'edgeCases', items: edgeCases },
    { name: 'nonFunctionalRequirements', items: nonFunctionalRequirements },
    { name: 'outOfScope', items: outOfScope },
    { name: 'assumptions', items: assumptions },
  ]
  
  for (const { name, items } of allFields) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (hasPlaceholder(item)) {
        failures.push({
          type: 'placeholder',
          field: name,
          message: `${name}: contains unresolved placeholder (TBD/TODO)`,
          itemIndex: i,
          itemValue: item.substring(0, 100),
        })
      }
    }
  }
  
  for (const { name, items } of allFields) {
    if (items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (isVague(item)) {
          failures.push({
            type: 'vagueness',
            field: name,
            message: `${name}: item is too vague or too short (minimum ${MIN_ITEM_LENGTH} characters, avoid generic phrases)`,
            itemIndex: i,
            itemValue: item.substring(0, 100),
          })
        }
      }
    }
  }
  
  failures.sort((a, b) => {
    const typeOrder = { count: 0, presence: 1, placeholder: 2, vagueness: 3 }
    const typeDiff = (typeOrder[a.type] ?? 999) - (typeOrder[b.type] ?? 999)
    if (typeDiff !== 0) return typeDiff
    
    const fieldDiff = a.field.localeCompare(b.field)
    if (fieldDiff !== 0) return fieldDiff
    
    const indexA = a.itemIndex ?? -1
    const indexB = b.itemIndex ?? -1
    return indexA - indexB
  })
  
  return {
    pass: failures.length === 0,
    failures,
    validatedAt: new Date().toISOString(),
  }
}

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
      redDocument?: RedDocument
      redVersion?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = body.ticketPk
    const ticketId = body.ticketId
    const redDocument = body.redDocument
    const redVersion = body.redVersion || 'v0'

    if (!ticketPk && !ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk or ticketId is required',
      })
      return
    }

    if (!redDocument) {
      json(res, 400, {
        success: false,
        error: 'redDocument is required',
      })
      return
    }

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch ticket to get PK and repo
    let ticketPkValue: string
    let repoFullName: string

    if (ticketPk) {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, repo_full_name')
        .eq('pk', ticketPk)
        .maybeSingle()

      if (ticketError || !ticket) {
        json(res, 400, {
          success: false,
          error: `Ticket not found: ${ticketPk}`,
        })
        return
      }

      ticketPkValue = ticket.pk
      repoFullName = ticket.repo_full_name
    } else {
      // Try to find by ticketId (similar to tickets/get.ts logic)
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, repo_full_name')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketError || !ticket) {
        json(res, 400, {
          success: false,
          error: `Ticket not found: ${ticketId}`,
        })
        return
      }

      ticketPkValue = ticket.pk
      repoFullName = ticket.repo_full_name
    }

    // Validate RED document
    const validationResult = validateRed(redDocument)

    // Store validation result
    const { data: storedResult, error: storeError } = await supabase
      .from('red_validation_results')
      .insert({
        ticket_pk: ticketPkValue,
        repo_full_name: repoFullName,
        red_version: redVersion,
        pass: validationResult.pass,
        failures: validationResult.failures,
        red_document: redDocument,
        validated_at: validationResult.validatedAt,
      })
      .select()
      .single()

    if (storeError) {
      json(res, 500, {
        success: false,
        error: `Failed to store validation result: ${storeError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      validation: validationResult,
      validationId: storedResult.validation_id,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
