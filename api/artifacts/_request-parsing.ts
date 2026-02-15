/**
 * Shared request parsing and validation utilities for artifact endpoints.
 */

export interface ParsedArtifactRequest {
  ticketId?: string
  artifactType?: string
  title?: string
  body_md?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
}

/**
 * Parses and validates artifact request body.
 */
export function parseArtifactRequest(body: unknown): ParsedArtifactRequest {
  const parsed = body as {
    ticketId?: string
    artifactType?: string
    title?: string
    body_md?: string | null
    supabaseUrl?: string
    supabaseAnonKey?: string
  }

  return {
    ticketId: typeof parsed.ticketId === 'string' ? parsed.ticketId.trim() : undefined,
    artifactType: typeof parsed.artifactType === 'string' ? parsed.artifactType.trim() : undefined,
    title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
    body_md: typeof parsed.body_md === 'string' 
      ? parsed.body_md 
      : (parsed.body_md !== undefined && parsed.body_md !== null ? String(parsed.body_md) : undefined),
    supabaseUrl: typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined,
    supabaseAnonKey: typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : undefined,
  }
}

/**
 * Validates that required fields are present.
 */
export function validateRequiredFields(
  parsed: ParsedArtifactRequest,
  requireArtifactType: boolean
): { valid: boolean; error?: string } {
  if (!parsed.ticketId) {
    return { valid: false, error: 'ticketId is required.' }
  }
  
  if (requireArtifactType && !parsed.artifactType) {
    return { valid: false, error: 'artifactType is required.' }
  }
  
  if (!parsed.title) {
    return { valid: false, error: 'title is required.' }
  }
  
  if (!parsed.body_md) {
    // body_md is present, validate it's a non-empty string
    if (typeof parsed.body_md !== 'string' || parsed.body_md.length === 0) {
      return { 
        valid: false, 
        error: 'body_md must be a non-empty string. Received invalid or empty body_md.' 
      }
    }
  } else {
    return { valid: false, error: 'body_md is required.' }
  }
  
  return { valid: true }
}

/**
 * Gets Supabase credentials from request or environment variables.
 */
export function getSupabaseCredentials(parsed: ParsedArtifactRequest): {
  supabaseUrl?: string
  supabaseAnonKey?: string
} {
  const supabaseUrl =
    parsed.supabaseUrl ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    parsed.supabaseAnonKey ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined

  return { supabaseUrl, supabaseAnonKey }
}

/**
 * Validates Supabase credentials are present.
 */
export function validateSupabaseCredentials(
  supabaseUrl?: string,
  supabaseAnonKey?: string
): { valid: boolean; error?: string } {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      valid: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }
  return { valid: true }
}
