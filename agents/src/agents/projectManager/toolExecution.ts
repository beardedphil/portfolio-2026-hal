/**
 * Tool execution and streaming logic for the PM agent.
 * Extracted from projectManager.ts to improve maintainability.
 */

import { streamText } from 'ai'
import type { ToolCallRecord } from '../projectManager.js'
import { generateFallbackReply } from './replyGeneration.js'
import { redact } from '../../utils/redact.js'

export interface ToolExecutionConfig {
  model: any
  systemInstructions: string
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  tools: Record<string, any>
  maxToolIterations: number
  previousResponseId?: string | null
  abortSignal?: AbortSignal
  onTextDelta?: (delta: string) => void | Promise<void>
  capturedRequest: object | null
  isAbortError: (err: unknown) => boolean
}

export interface ToolExecutionResult {
  reply: string
  toolCalls: ToolCallRecord[]
  outboundRequest: object
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool'
}

export async function executeTools(config: ToolExecutionConfig): Promise<ToolExecutionResult> {
  const { toolCalls } = config
  const providerOptions =
    config.previousResponseId != null && config.previousResponseId !== ''
      ? { openai: { previousResponseId: config.previousResponseId } }
      : undefined

  try {
    const result = await streamText({
      model: config.model,
      system: config.systemInstructions,
      prompt: config.prompt as any, // Type assertion: AI SDK supports array format for vision models
      tools: config.tools,
      maxSteps: config.maxToolIterations,
      ...(providerOptions && { providerOptions }),
      ...(config.abortSignal && { abortSignal: config.abortSignal }),
    })

    let reply = ''
    let emitBuf = ''
    let lastEmitAt = 0
    const canEmit = typeof config.onTextDelta === 'function'

    for await (const delta of result.textStream) {
      reply += delta
      if (!canEmit) continue
      emitBuf += delta
      const now = Date.now()
      if (emitBuf.length >= 220 || now - lastEmitAt >= 250) {
        const chunk = emitBuf
        emitBuf = ''
        lastEmitAt = now
        await config.onTextDelta!(chunk)
      }
    }
    if (canEmit && emitBuf) {
      await config.onTextDelta!(emitBuf)
    }

    // If the model returned no text but create_ticket succeeded, provide a fallback so the user sees a clear outcome (0011/0020)
    // Also handle placeholder validation failures (0066)
    if (!reply.trim()) {
      reply = generateFallbackReply(toolCalls)
    }
    const outboundRequest = config.capturedRequest
      ? (redact(config.capturedRequest) as object)
      : {}
    const responseId =
      result.providerMetadata && typeof result.providerMetadata === 'object' && result.providerMetadata !== null
        ? (result.providerMetadata as { openai?: { responseId?: string } }).openai?.responseId
        : undefined

    return {
      reply,
      toolCalls,
      outboundRequest,
      ...(responseId != null && { responseId }),
    }
  } catch (err) {
    // Important: `runPmAgent` is often executed under a time budget enforced by an AbortSignal.
    // In that case we MUST let the abort propagate (throw) so the caller can treat it as
    // "continue in the next work slice" rather than a hard failure.
    if (config.isAbortError(err)) {
      throw err
    }

    return {
      reply: '',
      toolCalls,
      outboundRequest: config.capturedRequest ? (redact(config.capturedRequest) as object) : {},
      error: err instanceof Error ? err.message : String(err),
      errorPhase: 'openai',
    }
  }
}
