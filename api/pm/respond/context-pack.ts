import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunnerModule } from './runner-loading.js'
import {
  getWorkingMemory,
  updateWorkingMemoryIfNeeded,
  formatWorkingMemoryForPrompt,
} from '../working-memory.js'

const RECENT_MAX_CHARS = 12_000

export type ContextPackResult = {
  conversationContextPack?: string
  workingMemoryText?: string
  recentImagesFromDb: Array<{ dataUrl: string; filename: string; mimeType: string }>
  conversationHistory?: undefined // Set to undefined when using DB context
}

/**
 * Builds conversation context pack from Supabase messages.
 * Returns context pack, working memory text, and recent images.
 */
export async function buildContextPack(
  supabase: SupabaseClient,
  projectId: string,
  conversationId: string | undefined,
  runnerModule: RunnerModule,
  openaiKey: string,
  openaiModel: string
): Promise<ContextPackResult> {
  const agentFilter = conversationId || 'project-manager'
  const recentImagesFromDb: Array<{ dataUrl: string; filename: string; mimeType: string }> = []

  const { data: rows } = await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence, images')
    .eq('project_id', projectId)
    .eq('agent', agentFilter)
    .order('sequence', { ascending: true })

  const messages = (rows ?? []).map((r: any) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content ?? '',
    sequence: r.sequence ?? 0,
    images: r.images || null,
  }))

  // Collect recent messages and images
  const recentFromEnd: typeof messages = []
  let recentLen = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = messages[i]
    const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
    if (recentLen + lineLen > RECENT_MAX_CHARS && recentFromEnd.length > 0) break
    recentFromEnd.unshift(t)
    recentLen += lineLen
    // Collect images from recent messages (0157: persist images to DB)
    if (t.images && Array.isArray(t.images)) {
      for (const img of t.images) {
        if (img && typeof img === 'object' && img.dataUrl && img.filename && img.mimeType) {
          if (!recentImagesFromDb.some((existing) => existing.dataUrl === img.dataUrl)) {
            recentImagesFromDb.push({
              dataUrl: img.dataUrl,
              filename: img.filename,
              mimeType: img.mimeType,
            })
          }
        }
      }
    }
  }

  // Update working memory if needed (0173: PM working memory)
  if (messages.length > 0) {
    try {
      await updateWorkingMemoryIfNeeded(
        supabase,
        projectId,
        agentFilter,
        messages,
        openaiKey,
        openaiModel,
        false
      )
    } catch (wmError) {
      console.error('[PM] Failed to update working memory:', wmError)
    }
  }

  // Get working memory for prompt inclusion
  let workingMemoryText: string | undefined
  try {
    const workingMemory = await getWorkingMemory(supabase, projectId, agentFilter)
    if (workingMemory) {
      workingMemoryText = formatWorkingMemoryForPrompt(workingMemory)
    }
  } catch (wmError) {
    console.error('[PM] Failed to load working memory:', wmError)
  }

  // Build context pack with summary if needed
  let conversationContextPack: string | undefined
  const olderCount = messages.length - recentFromEnd.length

  if (olderCount > 0) {
    const older = messages.slice(0, olderCount)
    const { data: summaryRow } = await supabase
      .from('hal_conversation_summaries')
      .select('summary_text, through_sequence')
      .eq('project_id', projectId)
      .eq('agent', agentFilter)
      .maybeSingle()

    const needNewSummary = !summaryRow || (summaryRow.through_sequence ?? 0) < olderCount
    let summaryText: string

    if (needNewSummary && typeof runnerModule.summarizeForContext === 'function') {
      summaryText = await runnerModule.summarizeForContext(older, openaiKey, openaiModel)
      await supabase.from('hal_conversation_summaries').upsert(
        {
          project_id: projectId,
          agent: agentFilter,
          summary_text: summaryText,
          through_sequence: olderCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,agent' }
      )
    } else if (summaryRow?.summary_text) {
      summaryText = summaryRow.summary_text
    } else {
      summaryText = `(${older.length} older messages)`
    }

    const contextParts: string[] = []
    if (workingMemoryText) {
      contextParts.push(workingMemoryText)
    }
    contextParts.push(
      `Summary of earlier conversation:\n\n${summaryText}\n\nRecent conversation (within ${RECENT_MAX_CHARS.toLocaleString()} characters):\n\n${recentFromEnd
        .map((t) => `**${t.role}**: ${t.content}`)
        .join('\n\n')}`
    )
    conversationContextPack = contextParts.join('\n\n')
  } else if (messages.length > 0) {
    const contextParts: string[] = []
    if (workingMemoryText) {
      contextParts.push(workingMemoryText)
    }
    contextParts.push(messages.map((t) => `**${t.role}**: ${t.content}`).join('\n\n'))
    conversationContextPack = contextParts.join('\n\n')
  } else if (workingMemoryText) {
    conversationContextPack = workingMemoryText
  }

  // Prepend working memory to context pack if available (0173)
  if (workingMemoryText && conversationContextPack) {
    conversationContextPack = workingMemoryText + '\n\n' + conversationContextPack
  }

  return {
    conversationContextPack,
    workingMemoryText,
    recentImagesFromDb,
    conversationHistory: undefined, // Use DB-derived context instead
  }
}
