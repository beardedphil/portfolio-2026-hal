/**
 * Conversation summarization for context packs.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { ConversationTurn } from './types.js'

/**
 * Summarize older conversation turns using the external LLM (OpenAI).
 * HAL is encouraged to use this whenever building a bounded context pack from long
 * history: the LLM produces a short summary so the main PM turn receives summary + recent
 * messages instead of unbounded transcript.
 * Used when full history is in DB and we send summary + last N to the PM model.
 */
export async function summarizeForContext(
  messages: ConversationTurn[],
  openaiApiKey: string,
  openaiModel: string
): Promise<string> {
  if (messages.length === 0) return ''
  const openai = createOpenAI({ apiKey: openaiApiKey })
  const model = openai.responses(openaiModel)
  const transcript = messages.map((t) => `${t.role}: ${t.content}`).join('\n\n')
  const prompt = `Summarize this conversation in 2-4 sentences. Preserve key decisions, topics, and context so the next turn can continue naturally.\n\nConversation:\n\n${transcript}`
  const result = await generateText({ model, prompt })
  return (result.text ?? '').trim() || '(No summary generated)'
}
