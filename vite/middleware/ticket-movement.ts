import path from 'path'
import { spawn } from 'child_process'
import { updateTicketFrontmatter } from './agent-helpers'

/** Move ticket to a new kanban column */
export async function moveTicketToColumn(
  supabase: any,
  ticketId: string,
  bodyMd: string,
  targetColumnId: string,
  repoRoot: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ success: boolean; error?: string; updatedBodyMd?: string }> {
  try {
    // Get max position in target column
    const { data: inColumn, error: fetchErr } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('kanban_column_id', targetColumnId)
      .order('kanban_position', { ascending: false })
      .limit(1)
    
    if (fetchErr) {
      return { success: false, error: fetchErr.message }
    }
    
    const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
    const movedAt = new Date().toISOString()
    
    // Update body_md frontmatter
    const updatedBodyMd = updateTicketFrontmatter(bodyMd, targetColumnId, nextPosition, movedAt)
    
    const { error: updateErr } = await supabase
      .from('tickets')
      .update({
        kanban_column_id: targetColumnId,
        kanban_position: nextPosition,
        kanban_moved_at: movedAt,
        body_md: updatedBodyMd,
      })
      .eq('id', ticketId)
    
    if (updateErr) {
      return { success: false, error: updateErr.message }
    }
    
    // Run sync-tickets to propagate change to docs (non-blocking)
    const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
    spawn('node', [syncScriptPath], {
      cwd: repoRoot,
      env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
      stdio: ['ignore', 'ignore', 'ignore'],
    }).on('error', () => {
      // Sync failure is non-blocking; DB is updated
    })
    
    return { success: true, updatedBodyMd }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
