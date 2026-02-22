import type { ServerResponse } from 'http'
import type { TicketData } from './types.js'
import { appendProgress, json } from '../_shared.js'

/** Handle process-review agent launch (OpenAI, async/streamed). */
export async function handleProcessReviewLaunch(
  supabase: any,
  res: ServerResponse,
  repoFullName: string,
  ticketNumber: number,
  ticketData: TicketData
): Promise<boolean> {
  const openaiModel =
    process.env.OPENAI_PROCESS_REVIEW_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.2'
  const initialProgress = appendProgress([], `Launching process-review run for ${ticketData.displayId}`)
  const { data: runRow, error: runInsErr } = await supabase
    .from('hal_agent_runs')
    .insert({
      agent_type: 'process-review',
      repo_full_name: repoFullName,
      ticket_pk: ticketData.pk,
      ticket_number: ticketNumber,
      display_id: ticketData.displayId,
      provider: 'openai',
      model: openaiModel,
      status: 'created',
      current_stage: 'preparing',
      progress: initialProgress,
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
