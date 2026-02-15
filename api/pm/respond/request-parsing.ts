import type { IncomingMessage } from 'http'
import type { RequestBody } from './types.js'

/**
 * Reads and parses JSON body from HTTP request.
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
 * Validates HTTP method. Returns true if method is POST, false otherwise.
 */
export function validateMethod(method: string | undefined): method is 'POST' {
  return method === 'POST'
}

/**
 * Parses and validates request body, extracting and normalizing fields.
 */
export function parseRequestBody(body: unknown): RequestBody {
  const parsed = body as {
    message?: string
    conversationHistory?: unknown
    previous_response_id?: string
    projectId?: string
    conversationId?: string
    repoFullName?: string
    supabaseUrl?: string
    supabaseAnonKey?: string
    images?: unknown
  }

  return {
    message: parsed.message ?? '',
    conversationHistory: Array.isArray(parsed.conversationHistory)
      ? parsed.conversationHistory
      : undefined,
    previous_response_id:
      typeof parsed.previous_response_id === 'string'
        ? parsed.previous_response_id
        : undefined,
    projectId:
      typeof parsed.projectId === 'string' ? parsed.projectId.trim() || undefined : undefined,
    conversationId:
      typeof parsed.conversationId === 'string'
        ? parsed.conversationId.trim() || undefined
        : undefined,
    repoFullName:
      typeof parsed.repoFullName === 'string' ? parsed.repoFullName.trim() || undefined : undefined,
    supabaseUrl:
      typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() || undefined : undefined,
    supabaseAnonKey:
      typeof parsed.supabaseAnonKey === 'string'
        ? parsed.supabaseAnonKey.trim() || undefined
        : undefined,
    images: Array.isArray(parsed.images) ? parsed.images : undefined,
  }
}

/**
 * Validates that message is present or images are provided.
 * Returns error message if validation fails, undefined otherwise.
 */
export function validateMessageOrImages(
  message: string,
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
): string | undefined {
  const hasImages = Array.isArray(images) && images.length > 0
  if (!message.trim() && !hasImages) {
    return 'Message is required (or attach an image)'
  }
  return undefined
}
