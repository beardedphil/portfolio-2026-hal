import type { PmAgentResponse } from './types.js'

/**
 * Validates OpenAI configuration from environment variables.
 * Returns the key and model if both are present, or an error response if missing.
 */
export function validateOpenAiConfig(): {
  valid: boolean
  key?: string
  model?: string
  errorResponse?: PmAgentResponse
} {
  const key = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_MODEL?.trim()

  if (!key || !model) {
    return {
      valid: false,
      errorResponse: {
        reply: '',
        toolCalls: [],
        outboundRequest: null,
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
        errorPhase: 'openai',
      },
    }
  }

  return {
    valid: true,
    key,
    model,
  }
}
