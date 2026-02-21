/**
 * Legacy context-pack entry point kept for backward compatibility.
 *
 * IMPORTANT: Agents must be API-only. Do not access Supabase directly here.
 */

export {
  buildContextPack,
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  CONVERSATION_RECENT_MAX_CHARS,
  USE_MINIMAL_BOOTSTRAP,
  PM_LOCAL_RULES,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding.js'

