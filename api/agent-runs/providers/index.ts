import type { AdvanceRunParams, AdvanceRunResult, HalProvider, HalAgentRunRow } from './types.js'
import { openaiProvider } from './openai.js'
import { cursorProvider } from './cursor.js'

const providers = [openaiProvider, cursorProvider]

function pickProviderName(run: HalAgentRunRow): HalProvider {
  const explicit = String(run.provider ?? '').trim().toLowerCase()
  if (explicit === 'openai' || explicit === 'cursor') return explicit as HalProvider
  // Default mapping (plan): PM + ProcessReview => OpenAI; Implementation + QA => Cursor.
  if (run.agent_type === 'project-manager' || run.agent_type === 'process-review') return 'openai'
  return 'cursor'
}

export async function advanceRunWithProvider(params: AdvanceRunParams): Promise<AdvanceRunResult> {
  const name = pickProviderName(params.run)
  const provider = providers.find((p) => p.name === name)
  if (!provider) return { ok: false, error: `No provider registered for "${name}".` }
  if (!provider.canHandle(params.run.agent_type)) {
    return { ok: false, error: `Provider "${name}" cannot handle agentType "${params.run.agent_type}".` }
  }
  return provider.advance(params)
}

