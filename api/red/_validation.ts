/**
 * RED validation utilities.
 * Enforces minimum quality gates and produces deterministic, user-visible failure reasons.
 */

// Configuration constants
const MIN_FUNCTIONAL_REQUIREMENTS = 5
const MIN_EDGE_CASES = 8
const MIN_STRING_LENGTH = 20 // Minimum characters for non-vague items

// Generic phrases that indicate vagueness (case-insensitive)
const VAGUE_PHRASES = [
  'handle errors',
  'make it robust',
  'optimize performance',
  'make it work',
  'ensure quality',
  'improve user experience',
  'add validation',
  'fix bugs',
  'make it better',
]

// Placeholder patterns (case-insensitive)
const PLACEHOLDER_PATTERNS = ['TBD', 'TODO', 'FIXME', 'XXX', 'HACK', 'PLACEHOLDER']

export interface ValidationFailure {
  type: 'count' | 'presence' | 'placeholder' | 'vagueness'
  field: string
  message: string
  expected?: number | string
  found?: number | string
  item?: string // For placeholder/vagueness failures, the offending item
}

export interface ValidationResult {
  pass: boolean
  failures: ValidationFailure[]
  validatedAt: string // ISO timestamp
}

/**
 * Validates a RED JSON document.
 * Returns deterministic results: same input → same output (including ordering).
 */
export function validateRed(redJson: unknown): ValidationResult {
  const failures: ValidationFailure[] = []
  const validatedAt = new Date().toISOString()

  if (!redJson || typeof redJson !== 'object') {
    return {
      pass: false,
      failures: [
        {
          type: 'presence',
          field: 'RED JSON',
          message: 'RED JSON is missing or invalid',
        },
      ],
      validatedAt,
    }
  }

  const red = redJson as Record<string, unknown>

  // Check minimum counts
  const functionalReqs = getArrayField(red, 'functionalRequirements') || getArrayField(red, 'functional_requirements')
  const functionalCount = functionalReqs?.length || 0
  if (functionalCount < MIN_FUNCTIONAL_REQUIREMENTS) {
    failures.push({
      type: 'count',
      field: 'Functional Requirements',
      message: `Functional Requirements: expected ≥ ${MIN_FUNCTIONAL_REQUIREMENTS}, found ${functionalCount}`,
      expected: MIN_FUNCTIONAL_REQUIREMENTS,
      found: functionalCount,
    })
  }

  const edgeCases = getArrayField(red, 'edgeCases') || getArrayField(red, 'edge_cases')
  const edgeCasesCount = edgeCases?.length || 0
  if (edgeCasesCount < MIN_EDGE_CASES) {
    failures.push({
      type: 'count',
      field: 'Edge Cases',
      message: `Edge Cases: expected ≥ ${MIN_EDGE_CASES}, found ${edgeCasesCount}`,
      expected: MIN_EDGE_CASES,
      found: edgeCasesCount,
    })
  }

  // Check presence (non-empty) of required sections
  const nonFunctionalReqs = getStringField(red, 'nonFunctionalRequirements') || getStringField(red, 'non_functional_requirements')
  if (!nonFunctionalReqs || nonFunctionalReqs.trim().length === 0) {
    failures.push({
      type: 'presence',
      field: 'Non-Functional Requirements',
      message: 'Non-Functional Requirements is missing or empty',
    })
  }

  const outOfScope = getStringField(red, 'outOfScope') || getStringField(red, 'out_of_scope')
  if (!outOfScope || outOfScope.trim().length === 0) {
    failures.push({
      type: 'presence',
      field: 'Out of Scope',
      message: 'Out of Scope is missing or empty',
    })
  }

  const assumptions = getStringField(red, 'assumptions') || getArrayField(red, 'assumptions')
  if (!assumptions || (typeof assumptions === 'string' && assumptions.trim().length === 0) || (Array.isArray(assumptions) && assumptions.length === 0)) {
    failures.push({
      type: 'presence',
      field: 'Assumptions',
      message: 'Assumptions is missing or empty',
    })
  }

  // Check for unresolved placeholders in all string fields
  const placeholderFailures = checkPlaceholders(red)
  failures.push(...placeholderFailures)

  // Check for vague/low-signal items
  const vaguenessFailures = checkVagueness(red, functionalReqs, edgeCases)
  failures.push(...vaguenessFailures)

  // Sort failures deterministically by type, then field, then message
  failures.sort((a, b) => {
    const typeOrder = { count: 0, presence: 1, placeholder: 2, vagueness: 3 }
    const typeDiff = (typeOrder[a.type] || 999) - (typeOrder[b.type] || 999)
    if (typeDiff !== 0) return typeDiff
    const fieldDiff = a.field.localeCompare(b.field)
    if (fieldDiff !== 0) return fieldDiff
    return a.message.localeCompare(b.message)
  })

  return {
    pass: failures.length === 0,
    failures,
    validatedAt,
  }
}

/**
 * Gets an array field from an object, trying multiple possible key names.
 */
function getArrayField(obj: Record<string, unknown>, ...keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = obj[key]
    if (Array.isArray(value)) {
      return value
    }
  }
  return null
}

/**
 * Gets a string field from an object, trying multiple possible key names.
 */
function getStringField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string') {
      return value
    }
  }
  return null
}

/**
 * Checks for unresolved placeholders anywhere in the RED document.
 * Returns failures for each placeholder found.
 */
function checkPlaceholders(red: Record<string, unknown>): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  const checked = new Set<string>() // Track checked paths to avoid duplicates

  function checkValue(value: unknown, path: string): void {
    if (value === null || value === undefined) return

    if (typeof value === 'string') {
      const upper = value.toUpperCase()
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (upper.includes(pattern)) {
          const key = `${path}:${pattern}`
          if (!checked.has(key)) {
            checked.add(key)
            failures.push({
              type: 'placeholder',
              field: path,
              message: `Unresolved placeholder "${pattern}" found in ${path}`,
              item: value,
            })
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        checkValue(item, `${path}[${index}]`)
      })
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([key, val]) => {
        checkValue(val, path ? `${path}.${key}` : key)
      })
    }
  }

  Object.entries(red).forEach(([key, value]) => {
    checkValue(value, key)
  })

  return failures
}

/**
 * Checks for vague/low-signal items using heuristics.
 * Returns failures for items that are too short or contain only generic phrases.
 */
function checkVagueness(
  red: Record<string, unknown>,
  functionalReqs: unknown[] | null,
  edgeCases: unknown[] | null
): ValidationFailure[] {
  const failures: ValidationFailure[] = []

  // Check functional requirements
  if (functionalReqs) {
    functionalReqs.forEach((req, index) => {
      const reqStr = typeof req === 'string' ? req : String(req)
      const trimmed = reqStr.trim()

      // Check minimum length
      if (trimmed.length < MIN_STRING_LENGTH) {
        failures.push({
          type: 'vagueness',
          field: 'Functional Requirements',
          message: `Functional Requirements[${index}]: too short (${trimmed.length} chars, minimum ${MIN_STRING_LENGTH})`,
          expected: MIN_STRING_LENGTH,
          found: trimmed.length,
          item: trimmed,
        })
        return
      }

      // Check for generic phrases
      const upper = trimmed.toUpperCase()
      const hasOnlyGenericPhrases = VAGUE_PHRASES.some((phrase) => {
        const phraseUpper = phrase.toUpperCase()
        // Check if the requirement is essentially just the generic phrase
        return upper === phraseUpper || upper.startsWith(phraseUpper + ' ') || upper === phraseUpper + '.'
      })

      if (hasOnlyGenericPhrases) {
        failures.push({
          type: 'vagueness',
          field: 'Functional Requirements',
          message: `Functional Requirements[${index}]: contains only generic phrase without specifics`,
          item: trimmed,
        })
      }
    })
  }

  // Check edge cases
  if (edgeCases) {
    edgeCases.forEach((ec, index) => {
      const ecStr = typeof ec === 'string' ? ec : String(ec)
      const trimmed = ecStr.trim()

      // Check minimum length
      if (trimmed.length < MIN_STRING_LENGTH) {
        failures.push({
          type: 'vagueness',
          field: 'Edge Cases',
          message: `Edge Cases[${index}]: too short (${trimmed.length} chars, minimum ${MIN_STRING_LENGTH})`,
          expected: MIN_STRING_LENGTH,
          found: trimmed.length,
          item: trimmed,
        })
        return
      }

      // Check for generic phrases
      const upper = trimmed.toUpperCase()
      const hasOnlyGenericPhrases = VAGUE_PHRASES.some((phrase) => {
        const phraseUpper = phrase.toUpperCase()
        return upper === phraseUpper || upper.startsWith(phraseUpper + ' ') || upper === phraseUpper + '.'
      })

      if (hasOnlyGenericPhrases) {
        failures.push({
          type: 'vagueness',
          field: 'Edge Cases',
          message: `Edge Cases[${index}]: contains only generic phrase without specifics`,
          item: trimmed,
        })
      }
    })
  }

  return failures
}
