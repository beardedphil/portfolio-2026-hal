import path from 'path'
import { spawn } from 'child_process'
import { updateTicketFrontmatter } from './agent-helpers'
import { insertAgentArtifact } from '../artifact-helpers'

/** Handle implementation agent completion - move ticket to QA and insert artifact */
export async function handleImplementationCompletion(
  supabase: any,
  ticketId: string,
  bodyMd: string,
  summary: string,
  prUrl: string | undefined,
  repoRoot: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<void> {
  // Get ticket to retrieve pk and repo_full_name for artifact (0082)
  const { data: ticketData } = await supabase
    .from('tickets')
    .select('pk, repo_full_name')
    .eq('id', ticketId)
    .single()
  
  const { data: inColumn } = await supabase
    .from('tickets')
    .select('kanban_position')
    .eq('kanban_column_id', 'col-qa')
    .order('kanban_position', { ascending: false })
    .limit(1)
  const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
  const movedAt = new Date().toISOString()
  const updatedBodyMd = updateTicketFrontmatter(bodyMd, 'col-qa', nextPosition, movedAt)

  await supabase
    .from('tickets')
    .update({
      kanban_column_id: 'col-qa',
      kanban_position: nextPosition,
      kanban_moved_at: movedAt,
      body_md: updatedBodyMd,
    })
    .eq('id', ticketId)

  // Insert Implementation artifact (0082) - create completion report directly in Supabase
  if (ticketData?.pk && ticketData?.repo_full_name) {
    // Build completion report from agent summary and PR info
    let artifactBody = summary
    if (prUrl) {
      artifactBody += `\n\nPull request: ${prUrl}`
    }
    artifactBody += `\n\nTicket ${ticketId} implementation completed and moved to QA.`
    
    await insertAgentArtifact(
      supabaseUrl,
      supabaseAnonKey,
      ticketData.pk,
      ticketData.repo_full_name,
      'implementation',
      `Implementation report for ticket ${ticketId}`,
      artifactBody
    )
  }

  const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
  spawn('node', [syncScriptPath], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
    stdio: ['ignore', 'ignore', 'ignore'],
  }).on('error', () => {})
}
