/**
 * RED (Requirements Engineering Document) Validator
 * 
 * Validates RED JSON documents according to quality gates:
 * - Minimum counts: Functional Requirements ≥ 5, Edge Cases ≥ 8
 * - Required presence: Non-Functional Requirements, Out of Scope, Assumptions
 * - No unresolved placeholders (TBD, TODO)
 * - No vague/low-signal items (heuristics)
 */

export interface RedDocument {
  version?: string
  functionalRequirements?: string[]
  edgeCases?: string[]
  nonFunctionalRequirements?: string | string[]
  outOfScope?: string | string[]
  assumptions?: string | string[]
  [key: string]: unknown // Allow other fields
}

export interface ValidationFailure {
  type: 'count' | 'presence' | 'placeholder' | 'vagueness'
  field: string
  message: string
  expected?: number | string
  found?: number | string
  itemIndex?: number // For array items
  itemValue?: string // For array items
}

export interface ValidationResult {
  pass: boolean
  failures: ValidationFailure[]
  validatedAt: string
}

// Configuration constants
const MIN_FUNCTIONAL_REQUIREMENTS = 5
const MIN_EDGE_CASES = 8
const MIN_ITEM_LENGTH = 20 // Minimum characters for an item to be considered non-vague
const VAGUE_PATTERNS = [
  /handle\s+errors?/i,
  /make\s+it\s+robust/i,
  /optimize\s+performance/i,
  /ensure\s+quality/i,
  /be\s+user\s+friendly/i,
  /should\s+work\s+well/i,
  /be\s+efficient/i,
  /be\s+fast/i,
  /be\s+secure/i,
  /be\s+reliable/i,
]

const PLACEHOLDER_PATTERNS = [
  /^TBD$/i,
  /^TODO$/i,
  /^TBD\s*$/i,
  /^TODO\s*$/i,
  /^TBD\s*[:\-]/i,
  /^TODO\s*[:\-]/i,
  /\[TBD\]/i,
  /\[TODO\]/i,
  /\bTBD\b/i,
  /\bTODO\b/i,
]

/**
 * Normalize array or string to array
 */
function normalizeToArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  return value
}

/**
 * Check if a string contains unresolved placeholders
 */
function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Check if a string is vague (too short or matches vague patterns)
 */
function isVague(text: string): boolean {
  if (text.trim().length < MIN_ITEM_LENGTH) return true
  return VAGUE_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Validate RED document
 */
export function validateRed(red: RedDocument): ValidationResult {
  const failures: ValidationFailure[] = []
  
  // Normalize arrays
  const functionalRequirements = normalizeToArray(red.functionalRequirements)
  const edgeCases = normalizeToArray(red.edgeCases)
  const nonFunctionalRequirements = normalizeToArray(red.nonFunctionalRequirements)
  const outOfScope = normalizeToArray(red.outOfScope)
  const assumptions = normalizeToArray(red.assumptions)
  
  // 1. Check minimum counts
  if (functionalRequirements.length < MIN_FUNCTIONAL_REQUIREMENTS) {
    failures.push({
      type: 'count',
      field: 'functionalRequirements',
      message: `Functional Requirements: expected ≥ ${MIN_FUNCTIONAL_REQUIREMENTS}, found ${functionalRequirements.length}`,
      expected: MIN_FUNCTIONAL_REQUIREMENTS,
      found: functionalRequirements.length,
    })
  }
  
  if (edgeCases.length < MIN_EDGE_CASES) {
    failures.push({
      type: 'count',
      field: 'edgeCases',
      message: `Edge Cases: expected ≥ ${MIN_EDGE_CASES}, found ${edgeCases.length}`,
      expected: MIN_EDGE_CASES,
      found: edgeCases.length,
    })
  }
  
  // 2. Check presence (non-empty)
  if (nonFunctionalRequirements.length === 0 || nonFunctionalRequirements.every(item => !item.trim())) {
    failures.push({
      type: 'presence',
      field: 'nonFunctionalRequirements',
      message: 'Non-Functional Requirements: required but missing or empty',
      expected: 'non-empty',
      found: 'empty',
    })
  }
  
  if (outOfScope.length === 0 || outOfScope.every(item => !item.trim())) {
    failures.push({
      type: 'presence',
      field: 'outOfScope',
      message: 'Out of Scope: required but missing or empty',
      expected: 'non-empty',
      found: 'empty',
    })
  }
  
  if (assumptions.length === 0 || assumptions.every(item => !item.trim())) {
    failures.push({
      type: 'presence',
      field: 'assumptions',
      message: 'Assumptions: required but missing or empty',
      expected: 'non-empty',
      found: 'empty',
    })
  }
  
  // 3. Check for placeholders in all fields
  const allFields: Array<{ name: string; items: string[] }> = [
    { name: 'functionalRequirements', items: functionalRequirements },
    { name: 'edgeCases', items: edgeCases },
    { name: 'nonFunctionalRequirements', items: nonFunctionalRequirements },
    { name: 'outOfScope', items: outOfScope },
    { name: 'assumptions', items: assumptions },
  ]
  
  for (const { name, items } of allFields) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (hasPlaceholder(item)) {
        failures.push({
          type: 'placeholder',
          field: name,
          message: `${name}: contains unresolved placeholder (TBD/TODO)`,
          itemIndex: i,
          itemValue: item.substring(0, 100), // Truncate for display
        })
      }
    }
  }
  
  // 4. Check for vague items (only in arrays that have content)
  for (const { name, items } of allFields) {
    if (items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (isVague(item)) {
          failures.push({
            type: 'vagueness',
            field: name,
            message: `${name}: item is too vague or too short (minimum ${MIN_ITEM_LENGTH} characters, avoid generic phrases)`,
            itemIndex: i,
            itemValue: item.substring(0, 100), // Truncate for display
          })
        }
      }
    }
  }
  
  // Sort failures deterministically: by type, then by field, then by index
  failures.sort((a, b) => {
    const typeOrder = { count: 0, presence: 1, placeholder: 2, vagueness: 3 }
    const typeDiff = (typeOrder[a.type] ?? 999) - (typeOrder[b.type] ?? 999)
    if (typeDiff !== 0) return typeDiff
    
    const fieldDiff = a.field.localeCompare(b.field)
    if (fieldDiff !== 0) return fieldDiff
    
    const indexA = a.itemIndex ?? -1
    const indexB = b.itemIndex ?? -1
    return indexA - indexB
  })
  
  return {
    pass: failures.length === 0,
    failures,
    validatedAt: new Date().toISOString(),
  }
}

/**
 * Parse RED JSON from string
 */
export function parseRedJson(jsonString: string): { red: RedDocument | null; error: string | null } {
  try {
    const parsed = JSON.parse(jsonString)
    if (typeof parsed !== 'object' || parsed === null) {
      return { red: null, error: 'RED document must be a JSON object' }
    }
    return { red: parsed as RedDocument, error: null }
  } catch (err) {
    return { red: null, error: err instanceof Error ? err.message : 'Invalid JSON' }
  }
}
