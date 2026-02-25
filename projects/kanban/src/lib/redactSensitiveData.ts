/**
 * Redacts sensitive information from objects to prevent secrets/tokens from being displayed in the UI.
 * This function recursively processes objects and replaces sensitive values with '[REDACTED]'.
 */

const SENSITIVE_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'password',
  'key',
  'api_key',
  'private_key',
  'client_secret',
  'auth_token',
  'authorization',
  'credential',
  'credentials',
  'auth',
  'session',
  'cookie',
]

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /key/i,
  /credential/i,
  /auth/i,
  /session/i,
]

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase()
  
  // Check exact matches
  if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
    return true
  }
  
  // Check pattern matches
  if (SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))) {
    return true
  }
  
  return false
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }
  
  // Check if value looks like a token/secret (long alphanumeric strings)
  if (value.length > 20 && /^[a-zA-Z0-9_-]+$/.test(value)) {
    return true
  }
  
  // Check if value looks like a JWT (three parts separated by dots)
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return true
  }
  
  return false
}

export function redactSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item))
  }
  
  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {}
    
    for (const [key, value] of Object.entries(obj)) {
      // Redact if key is sensitive
      if (isSensitiveKey(key)) {
        redacted[key] = '[REDACTED]'
        continue
      }
      
      // Redact if value looks sensitive
      if (isSensitiveValue(value)) {
        redacted[key] = '[REDACTED]'
        continue
      }
      
      // Recursively process nested objects
      if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitiveData(value)
      } else {
        redacted[key] = value
      }
    }
    
    return redacted
  }
  
  // For primitive values, check if they look sensitive
  if (isSensitiveValue(obj)) {
    return '[REDACTED]'
  }
  
  return obj
}
