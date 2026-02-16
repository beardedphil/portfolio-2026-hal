/**
 * Project Manager agent — context pack, read-only tools, OpenAI Responses API.
 * Module: portfolio-2026-hal-agents (no server required).
 * 
 * This file re-exports all PM agent functionality from modular sub-files.
 */

// Re-export types
export type {
  ConversationTurn,
  PmAgentConfig,
  ToolCallRecord,
  PmAgentResult,
  RespondContext,
  RespondInput,
  RespondMeta,
  RespondOutput,
  WorkingMemory,
} from './projectManager/types.js'

// Re-export functions
export { checkUnassignedTickets } from './projectManager/checkUnassigned.js'
export type { CheckUnassignedResult } from './projectManager/checkUnassigned.js'

export { respond } from './projectManager/respond.js'

export { buildContextPack } from './projectManager/contextPack.js'

export { runPmAgent } from './projectManager/runPmAgent.js'

export { summarizeForContext } from './projectManager/summarize.js'

export { generateWorkingMemory } from './projectManager/workingMemory.js'

// Re-export for backward compatibility
export type { ReadyCheckResult } from '../lib/projectManagerHelpers.js'
export { evaluateTicketReady } from '../lib/projectManagerHelpers.js'
