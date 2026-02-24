import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { pathToFileURL } from 'url'
import { appendRunEvent } from '../runEvents.js'
import type { AdvanceRunParams, AdvanceRunResult, HalAgentRunRow, RunProvider } from './types.js'

let lastAgentsBuildAtMs = 0
let agentsBuildOk = false

function isVercelRuntime(): boolean {
  return (process.env.VERCEL || '').trim() === '1' || (process.env.VERCEL || '').trim().length > 0
}

/**
 * In local/dev, keep agents/dist in sync with agents/src so the PM agent toolset
 * (create_ticket, update_ticket_body, etc.) doesn't silently regress due to stale builds.
 *
 * In Vercel/serverless runtime, do NOT attempt to spawn builds at request time.
 */
function maybeRebuildAgentsDist(repoRoot: string): void {
  const disabled = (process.env.HAL_DISABLE_AGENT_AUTO_REBUILD || '').trim() === '1'
  if (disabled) return

  // Never rebuild in Vercel/serverless runtime (build should have happened at build time).
  if (isVercelRuntime()) return

  // Throttle rebuild checks to keep PM responses snappy.
  const now = Date.now()
  if (agentsBuildOk && now - lastAgentsBuildAtMs < 15_000) return

  const srcPath = path.resolve(repoRoot, 'agents/src/agents/projectManager.ts')
  const distPath = path.resolve(repoRoot, 'agents/dist/agents/projectManager.js')

  let needsBuild = false
  try {
    const distStat = fs.statSync(distPath)
    const srcStat = fs.statSync(srcPath)
    // If src is newer than dist, rebuild.
    if (srcStat.mtimeMs > distStat.mtimeMs) needsBuild = true
  } catch {
    // Missing src or dist (or stat failure) — attempt rebuild; errors handled below.
    needsBuild = true
  }

  if (!needsBuild) {
    agentsBuildOk = true
    lastAgentsBuildAtMs = now
    return
  }

  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath) {
    // Can't reliably run npm if not under npm; just skip.
    console.warn('[agent-runs/openai] npm_execpath missing; skipping auto rebuild of agents/dist.')
    return
  }

  const r = spawnSync(process.execPath, [npmExecPath, 'run', 'build:agents'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  agentsBuildOk = r.status === 0
  lastAgentsBuildAtMs = now
  if (!agentsBuildOk) {
    console.warn('[agent-runs/openai] build:agents failed; continuing with existing agents/dist (may be stale).')
  }
}

function capText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated]`
}

function parseSuggestionsFromText(input: string): Array<{ text: string; justification: string }> {
  const text = String(input ?? '').trim()
  if (!text) return []

  const tryParseArray = (candidate: string): Array<{ text: string; justification: string }> | null => {
    const s = candidate.trim()
    if (!s) return null
    try {
      const parsed = JSON.parse(s) as unknown
      if (!Array.isArray(parsed)) return null
      return (parsed as any[])
        .filter((item) => item && typeof item === 'object')
        .filter((item) => typeof (item as any).text === 'string' && typeof (item as any).justification === 'string')
        .map((item) => ({
          text: String((item as any).text).trim(),
          justification: String((item as any).justification).trim(),
        }))
        .filter((s) => s.text.length > 0 && s.justification.length > 0)
    } catch {
      return null
    }
  }

  const direct = tryParseArray(text)
  if (direct) return direct

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    const fromFence = tryParseArray(fenced[1])
    if (fromFence) return fromFence
  }

  const start = text.indexOf('[')
  if (start === -1) return []
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') depth--
    if (depth === 0) {
      const slice = text.slice(start, i + 1)
      const fromSlice = tryParseArray(slice)
      return fromSlice ?? []
    }
  }
  return []
}

async function storeProcessReviewResult(
  supabase: SupabaseClient,
  run: HalAgentRunRow,
  suggestions: Array<{ text: string; justification: string }>,
  status: 'success' | 'failed',
  errorMessage: string | null
): Promise<void> {
  try {
    if (!run.ticket_pk) return
    await supabase.from('process_reviews').insert({
      ticket_pk: run.ticket_pk,
      repo_full_name: run.repo_full_name,
      suggestions,
      status,
      error_message: errorMessage,
    })
  } catch (e) {
    console.warn('[agent-runs/openai] failed to store process_review:', e instanceof Error ? e.message : e)
  }
}

async function fetchTicketAndArtifacts(supabase: SupabaseClient, run: HalAgentRunRow) {
  if (!run.ticket_pk) return { ok: false as const, error: 'ticket_pk is required for process-review runs.' }

  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('pk, id, display_id, title, body_md, repo_full_name')
    .eq('pk', run.ticket_pk)
    .maybeSingle()
  if (ticketErr || !ticket?.pk) return { ok: false as const, error: `Ticket not found: ${ticketErr?.message ?? 'unknown'}` }

  const { data: artifacts, error: artifactsError } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
    .eq('ticket_pk', run.ticket_pk)
    .order('created_at', { ascending: false })
  if (artifactsError) return { ok: false as const, error: `Failed to fetch artifacts: ${artifactsError.message}` }

  return { ok: true as const, ticket, artifacts: artifacts ?? [] }
}

async function advanceProcessReviewOpenAI({ supabase, run, budgetMs }: AdvanceRunParams): Promise<AdvanceRunResult> {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiApiKey) return { ok: false, error: 'OPENAI_API_KEY not configured.' }

  const modelFromEnv =
    process.env.OPENAI_PROCESS_REVIEW_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.2'
  const model = (run.model && String(run.model).trim()) || modelFromEnv

  const openai = createOpenAI({ apiKey: openaiApiKey })

  const fetched = await fetchTicketAndArtifacts(supabase, run)
  if (!fetched.ok) {
    await storeProcessReviewResult(supabase, run, [], 'failed', fetched.error)
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: fetched.error, finished_at: new Date().toISOString() })
      .eq('run_id', run.run_id)
    await appendRunEvent(supabase, run.run_id, 'error', { message: fetched.error })
    return { ok: true, done: true }
  }

  const { ticket, artifacts } = fetched
  if (!artifacts.length) {
    const msg = 'No artifacts found for this ticket. Process review requires artifacts to analyze.'
    await storeProcessReviewResult(supabase, run, [], 'failed', msg)
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
      .eq('run_id', run.run_id)
    await appendRunEvent(supabase, run.run_id, 'error', { message: msg })
    return { ok: true, done: true }
  }

  // Stage: running
  await supabase
    .from('hal_agent_runs')
    .update({
      provider: 'openai',
      model,
      status: 'running',
      current_stage: 'reviewing',
    })
    .eq('run_id', run.run_id)
  await appendRunEvent(supabase, run.run_id, 'stage', { stage: 'reviewing' })

  const artifactSummaries = artifacts
    .map((a: any) => {
      const bodyPreview = String(a.body_md || '').slice(0, 500)
      return `- ${a.title || a.agent_type} (${a.agent_type}): ${bodyPreview}${bodyPreview.length >= 500 ? '...' : ''}`
    })
    .join('\n')

  const prompt = `You are a process review agent analyzing ticket artifacts to suggest improvements to agent instructions.

Ticket: ${ticket.display_id || ticket.id} — ${ticket.title}

Artifacts found:
${artifactSummaries}

Review the artifacts above and suggest specific, actionable improvements to agent instructions (rules, templates, or process documentation) that would help prevent issues or improve outcomes for similar tickets in the future.

Format your response as a JSON array of objects, where each object has "text" and "justification" fields:
- "text": The suggestion itself (specific and actionable, focused on improving agent instructions/rules)
- "justification": A short explanation (1-2 sentences) of why this suggestion would help

Provide 3-5 suggestions. If no meaningful improvements are apparent, return an empty array [].`

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), Math.max(1_000, budgetMs))

  let fullText = ''
  let buffer = ''
  let lastFlushAt = 0

  try {
    const result = await streamText({
      model: openai(model),
      prompt,
      maxTokens: 1500,
      abortSignal: abortController.signal,
    })

    for await (const delta of result.textStream) {
      fullText += delta
      buffer += delta
      const now = Date.now()
      if (buffer.length >= 400 || now - lastFlushAt >= 350) {
        const toWrite = buffer
        buffer = ''
        lastFlushAt = now
        await appendRunEvent(supabase, run.run_id, 'text_delta', { text: toWrite })
      }
    }
  } catch (e) {
    const isAbort = e instanceof Error && /aborted|abort/i.test(e.message)
    if (!isAbort) throw e
  } finally {
    clearTimeout(timeout)
  }

  if (buffer) await appendRunEvent(supabase, run.run_id, 'text_delta', { text: buffer })

  // If we aborted due to budget, persist partial output and allow another /work to continue later.
  if (abortController.signal.aborted) {
    await supabase
      .from('hal_agent_runs')
      .update({
        provider: 'openai',
        model,
        status: 'running',
        current_stage: 'reviewing',
        output_json: { ...(typeof run.output_json === 'object' && run.output_json ? (run.output_json as any) : {}), partial_text: capText(fullText, 50_000) },
      })
      .eq('run_id', run.run_id)
    await appendRunEvent(supabase, run.run_id, 'progress', { message: 'Time budget reached; continuing in next work slice.' })
    return { ok: true, done: false }
  }

  const suggestions = parseSuggestionsFromText(fullText)
  await storeProcessReviewResult(supabase, run, suggestions, 'success', null)

  const summary = capText(fullText.trim() || 'Completed.', 20_000)
  await supabase
    .from('hal_agent_runs')
    .update({
      provider: 'openai',
      model,
      status: 'completed',
      current_stage: 'completed',
      summary,
      output_json: { suggestions, text: summary },
      finished_at: new Date().toISOString(),
    })
    .eq('run_id', run.run_id)

  await appendRunEvent(supabase, run.run_id, 'done', { summary, suggestions })
  return { ok: true, done: true }
}

async function advanceProjectManagerOpenAI({ supabase, run, budgetMs }: AdvanceRunParams): Promise<AdvanceRunResult> {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiApiKey) return { ok: false, error: 'OPENAI_API_KEY not configured.' }

  // Fail fast: PM cannot create tickets without a valid repo (owner/repo). Avoids "Completed." with no work.
  const repoFullNameRaw = typeof run.repo_full_name === 'string' ? run.repo_full_name.trim() : ''
  if (!repoFullNameRaw || !repoFullNameRaw.includes('/')) {
    const msg =
      'No GitHub repository is connected for this run. Connect a GitHub repository in HAL and send your message again.'
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
      .eq('run_id', run.run_id)
    await appendRunEvent(supabase, run.run_id, 'error', { message: msg })
    return { ok: true, done: true }
  }

  const modelFromEnv =
    process.env.OPENAI_PM_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.2'
  const model = (run.model && String(run.model).trim()) || modelFromEnv

  const input = (run.input_json && typeof run.input_json === 'object' ? (run.input_json as any) : {}) as any
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message) return { ok: false, error: 'PM run missing input_json.message.' }

  const conversationId = typeof input.conversationId === 'string' ? input.conversationId.trim() : ''
  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : ''
  const images = Array.isArray(input.images) ? (input.images as any[]) : undefined

  const repoRoot = process.cwd()
  // Ensure agents/dist is present & fresh in local/dev (prevents "tools disabled" regressions).
  try {
    maybeRebuildAgentsDist(repoRoot)
  } catch (e) {
    console.warn('[agent-runs/openai] auto rebuild agents/dist threw:', e instanceof Error ? e.message : e)
  }
  const distPath = path.resolve(repoRoot, 'agents/dist/agents/projectManager.js')
  let pmModule: { runPmAgent?: (message: string, config: unknown) => Promise<any> } | null = null
  try {
    pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
  } catch (e) {
    return { ok: false, error: 'PM agent runner not available (missing agents/dist). Ensure build runs `npm run build:agents` before deployment.' }
  }
  if (!pmModule || typeof pmModule.runPmAgent !== 'function') {
    return { ok: false, error: 'runPmAgent function not available in PM agent module.' }
  }

  // Load conversation history + working memory from DB (optional).
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let conversationContextPack: string | undefined
  let workingMemoryText: string | undefined
  if (conversationId && projectId) {
    const { data: rows } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', projectId)
      .eq('agent', conversationId)
      .order('sequence', { ascending: true })
    if (rows) {
      conversationHistory = rows
        .map((r: any) => ({
          role: r.role as 'user' | 'assistant',
          content: String(r.content ?? ''),
        }))
        .filter((m) => m.role === 'user' || m.role === 'assistant')
    }

    const { data: workingMemory } = await supabase
      .from('hal_pm_working_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('agent', conversationId)
      .maybeSingle()
    if (workingMemory) {
      const parts: string[] = []
      if ((workingMemory as any).summary) parts.push(`Summary: ${(workingMemory as any).summary}`)
      if (Array.isArray((workingMemory as any).goals) && (workingMemory as any).goals.length)
        parts.push(`Goals: ${(workingMemory as any).goals.join(', ')}`)
      if (Array.isArray((workingMemory as any).requirements) && (workingMemory as any).requirements.length)
        parts.push(`Requirements: ${(workingMemory as any).requirements.join(', ')}`)
      if (Array.isArray((workingMemory as any).constraints) && (workingMemory as any).constraints.length)
        parts.push(`Constraints: ${(workingMemory as any).constraints.join(', ')}`)
      if (Array.isArray((workingMemory as any).decisions) && (workingMemory as any).decisions.length)
        parts.push(`Decisions: ${(workingMemory as any).decisions.join(', ')}`)
      if (Array.isArray((workingMemory as any).assumptions) && (workingMemory as any).assumptions.length)
        parts.push(`Assumptions: ${(workingMemory as any).assumptions.join(', ')}`)
      if (Array.isArray((workingMemory as any).open_questions) && (workingMemory as any).open_questions.length)
        parts.push(`Open Questions: ${(workingMemory as any).open_questions.join(', ')}`)
      if (Array.isArray((workingMemory as any).glossary) && (workingMemory as any).glossary.length)
        parts.push(`Glossary: ${(workingMemory as any).glossary.join('; ')}`)
      if (Array.isArray((workingMemory as any).stakeholders) && (workingMemory as any).stakeholders.length)
        parts.push(`Stakeholders: ${(workingMemory as any).stakeholders.join(', ')}`)
      workingMemoryText = parts.join('\n')
    }
  }

  if (conversationHistory.length > 0) {
    const recentTurns = conversationHistory.slice(-10)
    const contextParts: string[] = ['## Conversation so far']
    for (const turn of recentTurns) {
      contextParts.push(`**${turn.role === 'user' ? 'User' : 'Assistant'}:** ${turn.content}`)
    }
    conversationContextPack = contextParts.join('\n\n')
  }

  await supabase
    .from('hal_agent_runs')
    .update({ provider: 'openai', model, status: 'running', current_stage: 'responding' })
    .eq('run_id', run.run_id)
  await appendRunEvent(supabase, run.run_id, 'stage', { stage: 'responding' })

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), Math.max(1_000, budgetMs))

  let reply = ''
  const onTextDelta = async (delta: string) => {
    reply += delta
    await appendRunEvent(supabase, run.run_id, 'text_delta', { text: delta })
  }
  let lastProgress = ''
  const onProgress = async (message: string) => {
    const msg = String(message || '').trim()
    if (!msg) return
    if (msg === lastProgress) return
    lastProgress = msg
    await appendRunEvent(supabase, run.run_id, 'progress', { message: msg })
  }

  try {
    const result = await pmModule.runPmAgent(message, {
      repoRoot,
      openaiApiKey,
      openaiModel: model,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      conversationContextPack,
      workingMemoryText,
      projectId: projectId || undefined,
      repoFullName: repoFullNameRaw,
      images,
      onTextDelta,
      onProgress,
      abortSignal: abortController.signal,
    })

    if (result?.error) {
      const msg = String(result.error).slice(0, 500)
      await supabase
        .from('hal_agent_runs')
        .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
        .eq('run_id', run.run_id)
      await appendRunEvent(supabase, run.run_id, 'error', { message: msg, phase: result?.errorPhase ?? null })
      return { ok: true, done: true }
    }

    const finalReply = String(result?.reply ?? reply ?? '').trim()
    const toolCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : []
    // Avoid persisting "Completed." when nothing was produced — user sees no evidence of work (no ticket, no message).
    const fallbackSummary =
      toolCalls.length > 0
        ? 'The agent ran but produced no summary. Check that a GitHub repository is connected and try again.'
        : 'The agent did not produce a response. Try again or ensure a GitHub repository is connected in HAL.'
    const summary = capText(finalReply || fallbackSummary, 20_000)

    // Persist assistant reply to conversation (optional; UI also persists client-side).
    if (conversationId && projectId && summary) {
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
          content: summary,
          sequence: nextSeq,
        })
      } catch (e) {
        console.warn('[agent-runs/openai] failed to persist PM assistant message:', e instanceof Error ? e.message : e)
      }
    }

    await supabase
      .from('hal_agent_runs')
      .update({
        provider: 'openai',
        model,
        status: 'completed',
        current_stage: 'completed',
        summary,
        output_json: {
          reply: summary,
          toolCalls: Array.isArray(result?.toolCalls) ? result.toolCalls : [],
          responseId: result?.responseId ?? null,
        },
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', run.run_id)

    await appendRunEvent(supabase, run.run_id, 'done', { summary })
    return { ok: true, done: true }
  } catch (e) {
    const isAbort = e instanceof Error && /aborted|abort/i.test(e.message)
    if (isAbort) {
      // If we already produced a substantive reply, treat it as final and stop the run.
      // This prevents repeated time-slice retries from spamming stage/progress messages
      // after the user has already received a usable response.
      const trimmed = reply.trim()
      if (trimmed.length >= 300) {
        const summary = capText(trimmed, 20_000)
        await supabase
          .from('hal_agent_runs')
          .update({
            provider: 'openai',
            model,
            status: 'completed',
            current_stage: 'completed',
            summary,
            output_json: { reply: summary, partial: true },
            finished_at: new Date().toISOString(),
          })
          .eq('run_id', run.run_id)
        await appendRunEvent(supabase, run.run_id, 'done', { summary })
        return { ok: true, done: true }
      }

      await supabase
        .from('hal_agent_runs')
        .update({
          provider: 'openai',
          model,
          status: 'running',
          current_stage: 'responding',
          output_json: { partial_text: capText(reply, 50_000) },
        })
        .eq('run_id', run.run_id)
      await appendRunEvent(supabase, run.run_id, 'progress', { message: 'Time budget reached; continuing in next work slice.' })
      return { ok: true, done: false }
    }
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
      .eq('run_id', run.run_id)
    await appendRunEvent(supabase, run.run_id, 'error', { message: msg })
    return { ok: true, done: true }
  } finally {
    clearTimeout(timeout)
  }
}

export const openaiProvider: RunProvider = {
  name: 'openai',
  canHandle: (agentType) => agentType === 'process-review' || agentType === 'project-manager',
  advance: async (params) => {
    if (params.run.agent_type === 'process-review') return advanceProcessReviewOpenAI(params)
    if (params.run.agent_type === 'project-manager') return advanceProjectManagerOpenAI(params)
    return { ok: false, error: `OpenAI provider cannot handle agentType "${params.run.agent_type}".` }
  },
}

