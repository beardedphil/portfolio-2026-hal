/**
 * Context pack builder for PM agent - builds the context pack for the LLM.
 *
 * This module provides the main entry point for building context packs used by
 * the Project Manager agent. It exports the buildContextPack function which
 * assembles all necessary context including instructions, conversation history,
 * working memory, and configuration details.
 *
 * IMPORTANT: Agents must be API-only. Do not access Supabase directly here.
 */

import { buildContextPack as buildContextPackImpl, type PmAgentConfig } from './contextBuilding.js'

/**
 * Validates that required configuration fields are present.
 *
 * @param config - The PM agent configuration to validate
 * @throws {Error} If required fields are missing
 */
function validateConfig(config: PmAgentConfig): void {
  if (!config.repoRoot || typeof config.repoRoot !== 'string') {
    throw new Error('repoRoot is required and must be a string')
  }
  if (!config.openaiApiKey || typeof config.openaiApiKey !== 'string') {
    throw new Error('openaiApiKey is required and must be a string')
  }
  if (!config.openaiModel || typeof config.openaiModel !== 'string') {
    throw new Error('openaiModel is required and must be a string')
  }
}

/**
 * Validates that the user message is provided and non-empty.
 *
 * @param userMessage - The user message to validate
 * @throws {Error} If the message is missing or empty
 */
function validateUserMessage(userMessage: string): void {
  if (typeof userMessage !== 'string') {
    throw new Error('userMessage must be a string')
  }
  if (userMessage.trim().length === 0) {
    throw new Error('userMessage cannot be empty')
  }
}

/**
 * Builds a context pack for the PM agent.
 *
 * This function assembles all necessary context for the Project Manager agent,
 * including:
 * - Input summary (repo info, tools available, etc.)
 * - Instructions (local or from Supabase)
 * - Working memory (if provided)
 * - Conversation history (if provided)
 * - User message
 * - Git status
 *
 * @param config - Configuration for the PM agent
 * @param userMessage - The user's message to respond to
 * @returns A formatted context pack string ready for the LLM
 * @throws {Error} If configuration or user message is invalid
 *
 * @example
 * ```ts
 * const contextPack = await buildContextPack({
 *   repoRoot: '/path/to/repo',
 *   openaiApiKey: 'sk-...',
 *   openaiModel: 'gpt-4',
 *   conversationHistory: [...],
 * }, 'What tickets need attention?')
 * ```
 */
export async function buildContextPack(
  config: PmAgentConfig,
  userMessage: string
): Promise<string> {
  validateConfig(config)
  validateUserMessage(userMessage)

  return buildContextPackImpl(config, userMessage)
}

// Re-export types for convenience
export type { PmAgentConfig } from './contextBuilding.js'

