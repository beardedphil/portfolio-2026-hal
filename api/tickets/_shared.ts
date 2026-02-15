/**
 * Shared utilities for ticket/kanban endpoints.
 * Extracted from create.ts and move.ts to reduce duplication and keep files under 250 lines.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { generateTicketLookupAttempts } from './_resolveTicketRef.js'

/**
 * Reads and parses JSON body from an HTTP request.
 * Returns empty object if body is empty.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

/**
 * Sends a JSON response with the specified status code.
 */
export function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen.
 * Returns 'ticket' if the result would be empty.
 */
export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
}

/**
 * Generates a repository hint prefix from a repository full name.
 * Extracts a short uppercase identifier (2-6 characters) from the repository name.
 * Falls back to first 4 letters or 'PRJ' if no suitable token is found.
 * Examples:
 *   "beardedphil/portfolio-2026-hal" -> "HAL"
 *   "user/my-project" -> "PROJ"
 */
export function repoHintPrefix(repoFullName: string): string {
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (!/[a-z]/.test(t)) continue
    if (t.length >= 2 && t.length <= 6) return t.toUpperCase()
  }

  const letters = repo.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters.slice(0, 4) || 'PRJ').toUpperCase()
}

/**
 * Checks if an error is a unique constraint violation.
 * Handles both PostgreSQL error codes (23505) and error messages.
 */
export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

/**
 * Parses Supabase credentials from request body or environment variables.
 */
export function parseSupabaseCredentials(body: {
  supabaseUrl?: string
  supabaseAnonKey?: string
}): { supabaseUrl?: string; supabaseAnonKey?: string } {
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
  return { supabaseUrl, supabaseAnonKey }
}

/**
 * Fetches a ticket by PK or ID using multiple lookup strategies.
 * Handles different ticket ID formats: numeric id, display_id, etc.
 * Uses the resolution helper to generate lookup attempts in the correct order.
 */
export async function fetchTicketByPkOrId(
  supabase: any,
  ticketPk?: string,
  ticketId?: string
): Promise<{ data: any; error: any } | null> {
  // Fast path: if ticketPk is provided, use it directly
  if (ticketPk) {
    return await supabase
      .from('tickets')
      .select('pk, repo_full_name, kanban_column_id, kanban_position')
      .eq('pk', ticketPk)
      .maybeSingle()
  }

  if (!ticketId) return null

  // Generate lookup attempts using the pure helper
  const attempts = generateTicketLookupAttempts(ticketId)

  // Try each lookup attempt in order until one succeeds
  for (const attempt of attempts) {
    let query = supabase
      .from('tickets')
      .select('pk, repo_full_name, kanban_column_id, kanban_position')

    if (attempt.strategy.type === 'id') {
      query = query.eq('id', attempt.strategy.value)
    } else if (attempt.strategy.type === 'display_id') {
      query = query.eq('display_id', attempt.strategy.value)
    }

    const ticketFetch = await query.maybeSingle()

    // If we found a ticket (no error and data exists), return it
    if (ticketFetch && !ticketFetch.error && ticketFetch.data) {
      return ticketFetch
    }

    // If there was an error (not just "not found"), return the error
    if (ticketFetch && ticketFetch.error) {
      return ticketFetch
    }

    // Otherwise, continue to next attempt
  }

  // If all attempts failed, return null (no ticket found)
  return null
}
