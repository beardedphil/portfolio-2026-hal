import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunnerModule } from './runner-loading.js'

/**
 * Updates working memory after PM agent responds (0173: PM working memory).
 * This is a non-fatal operation - failures are logged but don't affect the response.
 */
export async function updateWorkingMemoryAfterResponse(
  supabase: SupabaseClient,
  projectId: string,
  runnerModule: RunnerModule,
  openaiKey: string,
  openaiModel: string
): Promise<void> {
  if (typeof runnerModule.generateWorkingMemory !== 'function') {
    return
  }

  try {
    const { data: allMessages } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', projectId)
      .eq('agent', 'project-manager')
      .order('sequence', { ascending: true })

    if (!allMessages || allMessages.length === 0) {
      return
    }

    const messages = allMessages.map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))

    const { data: existingMemory } = await supabase
      .from('hal_pm_working_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('agent', 'project-manager')
      .maybeSingle()

    const maxSequence = Math.max(...allMessages.map((m: any) => m.sequence ?? 0))
    const shouldUpdate = !existingMemory || (existingMemory.last_sequence ?? 0) < maxSequence

    if (!shouldUpdate) {
      return
    }

    const newMemory = (await runnerModule.generateWorkingMemory(
      messages,
      existingMemory,
      openaiKey,
      openaiModel
    )) as {
      summary: string
      goals: string[]
      requirements: string[]
      constraints: string[]
      decisions: string[]
      assumptions: string[]
      open_questions: string[]
      glossary: string[]
      stakeholders: string[]
    }

    await supabase.from('hal_pm_working_memory').upsert(
      {
        project_id: projectId,
        agent: 'project-manager',
        summary: newMemory.summary,
        goals: newMemory.goals,
        requirements: newMemory.requirements,
        constraints: newMemory.constraints,
        decisions: newMemory.decisions,
        assumptions: newMemory.assumptions,
        open_questions: newMemory.open_questions,
        glossary: newMemory.glossary,
        stakeholders: newMemory.stakeholders,
        last_sequence: maxSequence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent' }
    )
  } catch (memoryUpdateErr) {
    // Working memory update failed, but don't fail the response (graceful degradation)
    console.warn('[PM] Failed to update working memory:', memoryUpdateErr)
  }
}
