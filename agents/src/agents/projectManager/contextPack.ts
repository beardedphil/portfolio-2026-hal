/**
 * Legacy context-pack entry point kept for backward compatibility.
 *
 * This module provides a stable entry point for building context packs
 * for the Project Manager agent. It re-exports the core functionality
 * from contextBuilding.ts while maintaining backward compatibility.
 *
 * IMPORTANT: Agents must be API-only. Do not access Supabase directly here.
 *
 * @module contextPack
 */

// Re-export the main function for backward compatibility
export { buildContextPack } from './contextBuilding.js'

// Re-export types for better type safety and developer experience
export type { PmAgentConfig, ConversationTurn } from './contextBuilding.js'

// Re-export constants that may be useful for consumers
export {
  CONVERSATION_RECENT_MAX_CHARS,
  USE_MINIMAL_BOOTSTRAP,
  PM_LOCAL_RULES,
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
} from './contextBuilding.js'

