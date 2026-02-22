/**
 * Redacts secrets and sensitive values from objects before storing in audit logs.
 * This ensures audit log entries never display raw secrets/tokens.
 */

export function redactSecrets(obj: unknown, maxDepth = 10): unknown {
  if (maxDepth <= 0) return '[max depth reached]'
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'string') {
    // Redact common secret patterns
    if (
      obj.length > 20 && // Likely a token/secret if long
      (obj.match(/^[A-Za-z0-9_-]{20,}$/) || // Base64-like or token-like
        obj.includes('Bearer ') ||
        obj.includes('token') ||
        obj.includes('key') ||
        obj.includes('secret') ||
        obj.includes('password') ||
        obj.includes('api_key'))
    ) {
      return '[redacted]'
    }
    return obj
  }

  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, maxDepth - 1))
  }

  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    // Redact fields that commonly contain secrets
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('access_token') ||
      lowerKey.includes('refresh_token') ||
      lowerKey === 'auth' ||
      lowerKey === 'authorization'
    ) {
      redacted[key] = '[redacted]'
    } else {
      redacted[key] = redactSecrets(value, maxDepth - 1)
    }
  }

  return redacted
}
