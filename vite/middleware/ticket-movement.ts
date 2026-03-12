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
    // Get current ticket to check source column (HAL-0791)
    const { data: currentTicket, error: currentTicketErr } = await supabase
      .from('tickets')
      .select('kanban_column_id, kanban_position')
      .eq('id', ticketId)
      .single()
    
    if (currentTicketErr) {
      return { success: false, error: currentTicketErr.message }
    }
    
    const currentColumnId = currentTicket?.kanban_column_id
    
    // HAL-0791: When moving from QA or HITL to To-do due to failure, position at top (position 0)
    const isFailureMoveToTodo = 
      (currentColumnId === 'col-qa' || currentColumnId === 'col-human-in-the-loop') &&
      targetColumnId === 'col-todo'
    
    let nextPosition: number
    if (isFailureMoveToTodo) {
      // Get all tickets in target column to shift them down
      const { data: ticketsInColumn, error: fetchErr } = await supabase
        .from('tickets')
        .select('pk, kanban_position')
        .eq('kanban_column_id', targetColumnId)
        .order('kanban_position', { ascending: true })
      
      if (fetchErr) {
        return { success: false, error: fetchErr.message }
      }
      
      // Shift all tickets in To-do column down by 1 to make room at position 0
      const ticketsList = ticketsInColumn || []
      for (const t of ticketsList) {
        await supabase
          .from('tickets')
          .update({ kanban_position: ((t.kanban_position ?? -1) + 1) } as any)
          .eq('pk', (t as any).pk)
      }
      
      nextPosition = 0
    } else {
      // Get max position in target column (default behavior: append to bottom)
      const { data: inColumn, error: fetchErr } = await supabase
        .from('tickets')
        .select('kanban_position')
        .eq('kanban_column_id', targetColumnId)
        .order('kanban_position', { ascending: false })
        .limit(1)
      
      if (fetchErr) {
        return { success: false, error: fetchErr.message }
      }
      
      nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
    }
    
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
