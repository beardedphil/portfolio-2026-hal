/**
 * Shared request parsing and Supabase credential handling.
 * Extracted from insert-implementation.ts and insert-qa.ts to reduce duplication.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ParsedRequestBody {
  ticketId?: string
  artifactType?: string
  title?: string
  body_md?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
}

/**
 * Parses and validates request body fields.
 * Converts body_md to string if needed and trims all string fields.
 */
export function parseRequestBody(body: unknown): ParsedRequestBody {
  const parsed = body as ParsedRequestBody
  
  return {
    ticketId: typeof parsed.ticketId === 'string' ? parsed.ticketId.trim() : undefined,
    artifactType: typeof parsed.artifactType === 'string' ? parsed.artifactType.trim() : undefined,
    title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
    body_md: typeof parsed.body_md === 'string' 
      ? parsed.body_md 
      : (parsed.body_md !== undefined && parsed.body_md !== null 
          ? String(parsed.body_md) 
          : undefined),
    supabaseUrl: typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined,
    supabaseAnonKey: typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : undefined,
  }
}

/**
 * Gets Supabase credentials from request body or environment variables.
 * Returns both URL and anon key, or undefined if not available.
 */
export function getSupabaseCredentials(body: ParsedRequestBody): { url: string; anonKey: string } | undefined {
  const supabaseUrl =
    body.supabaseUrl ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    body.supabaseAnonKey ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined

  if (!supabaseUrl || !supabaseAnonKey) {
    return undefined
  }

  return { url: supabaseUrl, anonKey: supabaseAnonKey }
}

/**
 * Creates Supabase client from credentials.
 */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey)
}

/**
 * Validates that body_md is a non-empty string.
 * Logs detailed error information for debugging.
 */
export function validateBodyMd(body_md: unknown, endpointName: string): { valid: boolean; error?: string } {
  if (body_md === undefined || (typeof body_md !== 'string' || body_md.length === 0)) {
    const preview = typeof body_md === 'string' ? body_md.substring(0, 100) : 'null/undefined'
    console.error(`[${endpointName}] Invalid body_md: type=${typeof body_md}, value=${preview}`)
    return {
      valid: false,
      error: 'body_md must be a non-empty string. Received invalid or empty body_md.',
    }
  }
  return { valid: true }
}
