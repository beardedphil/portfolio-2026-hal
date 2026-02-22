import type { IncomingMessage, ServerResponse } from 'http'
import crypto from 'node:crypto'

/**
 * Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen.
 */
export function slugFromTitle(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'ticket'
}

/**
 * Extracts a prefix hint from repository full name for ticket display IDs.
 * Looks for tokens 2-6 characters long, preferring shorter tokens from the end.
 */
export function repoHintPrefix(repoFullName: string): string {
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)

  // Search backwards for a suitable token
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (!/[a-z]/.test(token)) continue
    if (token.length >= 2 && token.length <= 6) {
      return token.toUpperCase()
    }
  }

  // Fallback: extract first 4 letters
  const letters = repo.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return letters.slice(0, 4) || 'PRJ'
}

/**
 * Checks if an error is a PostgreSQL unique constraint violation.
 */
export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

/**
 * Generates a deterministic hash for a suggestion to enable idempotency checks.
 * Uses SHA256 and returns first 16 characters for readability.
 */
export function hashSuggestion(reviewId: string, suggestionText: string): string {
  const combined = `${reviewId}:${suggestionText}`
  const hash = crypto.createHash('sha256').update(combined).digest('hex')
  return hash.substring(0, 16)
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCorsHeaders(res)

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
    // Deprecated (2026-02): This endpoint created tickets automatically from Process Review suggestions.
    // The intended flow is now:
    // 1) run Process Review to generate suggestions
    // 2) show suggestions in a UI modal
    // 3) only create tickets after the user explicitly clicks "Implement"
    //
    // Ticket creation should happen via `/api/tickets/create` (single-suggestion mode) from the Implement action.
    json(res, 410, {
      success: false,
      error:
        'Deprecated: /api/process-review/create-tickets has been removed. Create Process Review tickets only via explicit UI "Implement" using /api/tickets/create.',
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
