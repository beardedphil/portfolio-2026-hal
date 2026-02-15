/**
 * Shared HTTP utilities for artifact insertion endpoints.
 * Extracted from insert-implementation.ts and insert-qa.ts to reduce duplication.
 */

import type { IncomingMessage, ServerResponse } from 'http'

/**
 * Reads and parses JSON body from HTTP request.
 * Handles errors gracefully with detailed logging.
 */
export async function readJsonBody(req: IncomingMessage, endpointName: string): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch (parseError) {
    console.error(`[${endpointName}] JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    console.error(`[${endpointName}] Raw body length: ${raw.length}, first 500 chars: ${raw.substring(0, 500)}`)
    throw new Error(`Failed to parse request body as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
  }
}

/**
 * Sends JSON response with specified status code.
 */
export function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Sets CORS headers for cross-origin requests.
 */
export function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * Handles OPTIONS request for CORS preflight.
 */
export function handleOptionsRequest(res: ServerResponse) {
  res.statusCode = 204
  res.end()
}
