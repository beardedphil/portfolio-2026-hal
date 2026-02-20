import { appendRunEvent } from '../runEvents.js'
import { getCursorApiKey, humanReadableCursorError } from '../_shared.js'
import type { AdvanceRunParams, AdvanceRunResult, RunProvider } from './types.js'

const MAX_RUN_SUMMARY_CHARS = 20_000

function capText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated]`
}

function isPlaceholderSummary(summary: string | null | undefined): boolean {
  const s = String(summary ?? '').trim()
  if (!s) return true
  return s === 'Completed.' || s === 'Done.' || s === 'Complete.' || s === 'Finished.'
}

function getLastAssistantMessage(conversationText: string): string | null {
  try {
    const conv = JSON.parse(conversationText) as any
    const messages: any[] =
      (Array.isArray(conv?.messages) && conv.messages) ||
      (Array.isArray(conv?.conversation?.messages) && conv.conversation.messages) ||
      []

    const toText = (content: unknown): string => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .map((p) => {
            if (typeof p === 'string') return p
            if (p && typeof p === 'object') {
              const anyP = p as any
              return (
                (typeof anyP.text === 'string' ? anyP.text : '') ||
                (typeof anyP.content === 'string' ? anyP.content : '') ||
                (typeof anyP.value === 'string' ? anyP.value : '')
              )
            }
            return ''
          })
          .filter(Boolean)
          .join('')
      }
      if (content && typeof content === 'object') {
        const anyC = content as any
        if (typeof anyC.text === 'string') return anyC.text
        if (typeof anyC.content === 'string') return anyC.content
        if (typeof anyC.value === 'string') return anyC.value
      }
      return ''
    }

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m?.role === 'assistant' && String(toText(m?.content ?? '')).trim())
    const content = toText(lastAssistant?.content ?? '').trim()
    return content ? content : null
  } catch {
    return null
  }
}

async function advanceCursorOnce({ supabase, run }: AdvanceRunParams): Promise<AdvanceRunResult> {
  const runId = run.run_id
  const cursorAgentId = run.cursor_agent_id
  if (!cursorAgentId) return { ok: true, done: true }

  const cursorKey = getCursorApiKey()
  const auth = Buffer.from(`${cursorKey}:`).toString('base64')

  const statusRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })
  const statusText = await statusRes.text()
  if (!statusRes.ok) {
    const msg = humanReadableCursorError(statusRes.status, statusText)
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
      .eq('run_id', runId)
    await appendRunEvent(supabase, runId, 'error', { message: msg })
    return { ok: true, done: true }
  }

  let statusData: { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } }
  try {
    statusData = JSON.parse(statusText) as typeof statusData
  } catch {
    const msg = 'Invalid response when polling agent status.'
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
      .eq('run_id', runId)
    await appendRunEvent(supabase, runId, 'error', { message: msg })
    return { ok: true, done: true }
  }

  const cursorStatus = statusData.status ?? run.cursor_status ?? 'RUNNING'
  await supabase.from('hal_agent_runs').update({ cursor_status: cursorStatus, provider: 'cursor' }).eq('run_id', runId)
  await appendRunEvent(supabase, runId, 'progress', { message: `Status: ${cursorStatus}` })

  if (cursorStatus === 'FINISHED') {
    let summary = statusData.summary ?? run.summary ?? null
    let prUrl: string | null = (statusData.target?.prUrl ?? statusData.target?.pr_url ?? (run.pr_url as any) ?? null) as any

    // If summary is empty/placeholder, fetch conversation and extract last assistant message.
    if (isPlaceholderSummary(summary)) {
      try {
        const convRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}/conversation`, {
          method: 'GET',
          headers: { Authorization: `Basic ${auth}` },
        })
        const text = await convRes.text()
        if (convRes.ok && text) {
          const lastAssistant = getLastAssistantMessage(text)
          if (lastAssistant) summary = lastAssistant
        }
      } catch {
        // ignore
      }
    }
    if (isPlaceholderSummary(summary)) summary = 'Completed.'
    summary = capText(String(summary ?? '').trim() || 'Completed.', MAX_RUN_SUMMARY_CHARS)

    await supabase
      .from('hal_agent_runs')
      .update({
        provider: 'cursor',
        provider_run_id: cursorAgentId,
        status: 'completed',
        current_stage: 'completed',
        summary,
        ...(prUrl ? { pr_url: prUrl } : {}),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)

    await appendRunEvent(supabase, runId, 'done', { summary, prUrl })
    return { ok: true, done: true }
  }

  if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
    const msg = statusData.summary ?? `Agent ended with status ${cursorStatus}.`
    await supabase
      .from('hal_agent_runs')
      .update({
        provider: 'cursor',
        provider_run_id: cursorAgentId,
        status: 'failed',
        current_stage: 'failed',
        error: msg,
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
    await appendRunEvent(supabase, runId, 'error', { message: msg })
    return { ok: true, done: true }
  }

  // Still running
  await supabase
    .from('hal_agent_runs')
    .update({ provider: 'cursor', provider_run_id: cursorAgentId, status: 'polling' })
    .eq('run_id', runId)
  return { ok: true, done: false }
}

export const cursorProvider: RunProvider = {
  name: 'cursor',
  canHandle: (agentType) =>
    agentType === 'implementation' || agentType === 'qa' || agentType === 'project-manager' || agentType === 'process-review',
  advance: async (params) => advanceCursorOnce(params),
}

