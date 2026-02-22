import type { ServerResponse } from 'http'
import { appendProgress, json } from '../_shared.js'

/** Handle project-manager agent launch (OpenAI, async/streamed). */
export async function handleProjectManagerLaunch(
  supabase: any,
  res: ServerResponse,
  repoFullName: string,
  message: string,
  conversationId: string,
  projectId: string,
  defaultBranch: string,
  images: Array<{ dataUrl: string; filename: string; mimeType: string }> | undefined
): Promise<boolean> {
  const openaiModel =
    process.env.OPENAI_PM_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.2'
  const initialProgress = appendProgress([], `Launching project-manager run for ${repoFullName}`)
  const { data: runRow, error: runInsErr } = await supabase
    .from('hal_agent_runs')
    .insert({
      agent_type: 'project-manager',
      repo_full_name: repoFullName,
      ticket_pk: null,
      ticket_number: null,
      display_id: null,
      provider: 'openai',
      model: openaiModel,
      status: 'created',
      current_stage: 'preparing',
      progress: initialProgress,
      input_json: {
        message,
        conversationId: conversationId || null,
        projectId: projectId || null,
        defaultBranch,
        images: images ?? null,
      },
    })
    .select('run_id')
    .maybeSingle()
  if (runInsErr || !runRow?.run_id) {
    json(res, 500, { error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` })
    return false
  }
  json(res, 200, { runId: runRow.run_id, status: 'created', provider: 'openai' })
  return true
}
