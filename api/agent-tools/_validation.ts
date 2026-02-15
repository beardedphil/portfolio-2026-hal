import { hasSubstantiveContent, hasSubstantiveQAContent } from '../artifacts/_validation.js'

export interface ValidationResult {
  valid: boolean
  reason?: string
  validation_failed?: boolean
}

/**
 * Validates artifact content for implementation artifacts.
 * Returns validation result with clear error message if validation fails.
 */
export function validateImplementationArtifactContent(
  body_md: string,
  title: string
): ValidationResult {
  const validation = hasSubstantiveContent(body_md, title)
  if (!validation.valid) {
    return {
      valid: false,
      reason: validation.reason || 'Artifact body must contain substantive content, not just a title or placeholder text.',
      validation_failed: true,
    }
  }
  return { valid: true }
}

/**
 * Validates artifact content for QA artifacts.
 * Returns validation result with clear error message if validation fails.
 */
export function validateQaArtifactContent(
  body_md: string,
  title: string
): ValidationResult {
  const validation = hasSubstantiveQAContent(body_md, title)
  if (!validation.valid) {
    return {
      valid: false,
      reason: validation.reason || 'Artifact body must contain substantive QA report content, not just a title or placeholder text.',
      validation_failed: true,
    }
  }
  return { valid: true }
}
