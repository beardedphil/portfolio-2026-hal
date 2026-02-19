/**
 * Legacy PM agent entry point kept for backward compatibility.
 *
 * IMPORTANT: Agents must be API-only. This module intentionally re-exports the
 * endpoint-only PM agent runner from `../projectManager.ts`.
 */

export { runPmAgent } from '../projectManager.js'

