/**
 * Redacts sensitive values from objects for diagnostics.
 * Removes OpenAI API keys, JWT tokens, Supabase URLs, and values for known secret key names.
 */

const OPENAI_KEY_PATTERN = /sk-[a-zA-Z0-9_-]{20,}/g
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g
const SUPABASE_URL_PATTERN =
  /https:\/\/([a-zA-Z0-9-]+\.)?supabase\.co(\/[a-zA-Z0-9_-]*)*/gi

/** Keys whose values should always be redacted (API keys, .env secrets, etc.). */
const SENSITIVE_KEYS = /^(api[_-]?key|apikey|authorization|secret|password|token|supabase[_-]?(anon|service)[_-]?key)$/i

const REDACTED = '[REDACTED]'

function redactString(value: string): string {
  return value
    .replace(OPENAI_KEY_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(SUPABASE_URL_PATTERN, REDACTED)
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && typeof value === 'string' && SENSITIVE_KEYS.test(key)) {
    return REDACTED
  }
  if (typeof value === 'string') {
    return redactString(value)
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k)
    }
    return out
  }
  return value
}

/**
 * Redacts sensitive values (API keys, JWTs, Supabase URLs) from an object.
 * Returns a deep copy with sensitive values replaced by [REDACTED].
 */
export function redact(obj: unknown): unknown {
  return redactValue(obj, undefined)
}
