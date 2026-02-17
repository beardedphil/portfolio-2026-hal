import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'
import { createClient } from '@supabase/supabase-js'
import { getOrigin } from '../_lib/github/config.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      message?: string
      conversationId?: string
      projectId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      repoFullName?: string
      defaultBranch?: string
      images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : undefined
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined
    const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined
    const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'
    const images = Array.isArray(body.images) ? body.images : undefined

    if (!message) {
      json(res, 400, { error: 'message is required.' })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, { error: 'supabaseUrl and supabaseAnonKey are required.' })
      return
    }

    // Check OpenAI configuration
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
    const openaiModel = process.env.OPENAI_MODEL?.trim()

    if (!openaiApiKey || !openaiModel) {
      json(res, 503, {
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in .env to enable the Project Manager chat.',
      })
      return
    }

    // Load runPmAgent from agents package
    const repoRoot = process.cwd()
    const distPath = path.resolve(repoRoot, 'agents/dist/agents/projectManager.js')

    let pmModule: { runPmAgent?: (message: string, config: unknown) => Promise<unknown> } | null = null
    try {
      pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
    } catch (err) {
      json(res, 503, {
        error: 'PM agent runner not available (missing dist). Ensure build runs `npm run build:agents` before deployment.',
      })
      return
    }

    if (typeof pmModule.runPmAgent !== 'function') {
      json(res, 503, {
        error: 'runPmAgent function not available in PM agent module.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch conversation history if conversationId and projectId are provided
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    let conversationContextPack: string | undefined
    let workingMemoryText: string | undefined

    if (conversationId && projectId) {
      // Fetch messages from database
      const { data: rows, error: messagesError } = await supabase
        .from('hal_conversation_messages')
        .select('role, content, sequence')
        .eq('project_id', projectId)
        .eq('agent', conversationId)
        .order('sequence', { ascending: true })

      if (!messagesError && rows) {
        conversationHistory = rows.map((r: any) => ({
          role: r.role as 'user' | 'assistant',
          content: r.content ?? '',
        }))
      }

      // Fetch working memory
      const { data: workingMemory } = await supabase
        .from('hal_pm_working_memory')
        .select('*')
        .eq('project_id', projectId)
        .eq('agent', conversationId)
        .maybeSingle()

      if (workingMemory) {
        const parts: string[] = []
        if (workingMemory.summary) parts.push(`Summary: ${workingMemory.summary}`)
        if (workingMemory.goals?.length) parts.push(`Goals: ${workingMemory.goals.join(', ')}`)
        if (workingMemory.requirements?.length) parts.push(`Requirements: ${workingMemory.requirements.join(', ')}`)
        if (workingMemory.constraints?.length) parts.push(`Constraints: ${workingMemory.constraints.join(', ')}`)
        if (workingMemory.decisions?.length) parts.push(`Decisions: ${workingMemory.decisions.join(', ')}`)
        if (workingMemory.assumptions?.length) parts.push(`Assumptions: ${workingMemory.assumptions.join(', ')}`)
        if (workingMemory.open_questions?.length) parts.push(`Open Questions: ${workingMemory.open_questions.join(', ')}`)
        if (workingMemory.glossary?.length) parts.push(`Glossary: ${workingMemory.glossary.join('; ')}`)
        if (workingMemory.stakeholders?.length) parts.push(`Stakeholders: ${workingMemory.stakeholders.join(', ')}`)
        workingMemoryText = parts.join('\n')
      }
    }

    // Build conversation context pack if we have history
    if (conversationHistory.length > 0) {
      const recentTurns = conversationHistory.slice(-10) // Last 10 turns
      const contextParts: string[] = ['## Conversation so far']
      for (const turn of recentTurns) {
        contextParts.push(`**${turn.role === 'user' ? 'User' : 'Assistant'}:** ${turn.content}`)
      }
      conversationContextPack = contextParts.join('\n\n')
    }

    const halApiBaseUrl = getOrigin(req)

    // Note: GitHub API helpers are optional - if not provided, PM agent will use local file system access
    // TODO: Add GitHub API helpers if user has GitHub session token (for reading files from connected repo)

    // Build config for runPmAgent
    const config = {
      repoRoot,
      openaiApiKey,
      openaiModel,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      conversationContextPack,
      workingMemoryText,
      supabaseUrl,
      supabaseAnonKey,
      projectId,
      repoFullName,
      images,
    }

    // Call runPmAgent
    const result = (await pmModule.runPmAgent(message, config)) as {
      reply?: string
      toolCalls?: unknown[]
      outboundRequest?: object
      responseId?: string
      error?: string
      errorPhase?: string
      promptText?: string
    }

    if (result.error) {
      json(res, 500, {
        error: result.error,
        errorPhase: result.errorPhase,
      })
      return
    }

    // Save assistant reply to database if conversationId and projectId are provided
    if (conversationId && projectId && result.reply) {
      try {
        const { data: maxRow } = await supabase
          .from('hal_conversation_messages')
          .select('sequence')
          .eq('project_id', projectId)
          .eq('agent', conversationId)
          .order('sequence', { ascending: false })
          .limit(1)
          .maybeSingle()
        const nextSeq = ((maxRow?.sequence ?? -1) as number) + 1
        await supabase.from('hal_conversation_messages').insert({
          project_id: projectId,
          agent: conversationId,
          role: 'assistant',
          content: result.reply,
          sequence: nextSeq,
        })
      } catch (err) {
        // Non-fatal - log but don't fail the request
        console.warn('[pm/respond] Failed to save assistant message:', err instanceof Error ? err.message : err)
      }
    }

    json(res, 200, {
      reply: result.reply ?? '',
      toolCalls: result.toolCalls ?? [],
      outboundRequest: result.outboundRequest ?? {},
      responseId: result.responseId,
      promptText: result.promptText,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[pm/respond] Error:', message)
    json(res, 500, {
      error: message,
    })
  }
}
