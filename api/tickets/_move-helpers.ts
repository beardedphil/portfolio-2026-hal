import { createClient } from '@supabase/supabase-js'

export async function resolveColumnId(
  supabase: ReturnType<typeof createClient>,
  columnId: string | undefined,
  columnName: string | undefined
): Promise<{ id: string } | null> {
  if (columnId) return { id: columnId }
  if (!columnName) return null

  const { data: columns, error: colErr } = await supabase.from('kanban_columns').select('id, title')
  if (colErr) return null

  const normalizedName = columnName.toLowerCase().trim()
  const matchedColumn = (columns || []).find((col: any) => {
    const normalizedTitle = (col.title || '').toLowerCase().trim()
    return (
      normalizedTitle === normalizedName ||
      (normalizedName === 'todo' && (normalizedTitle === 'to-do' || normalizedTitle === 'todo')) ||
      (normalizedName === 'to do' && (normalizedTitle === 'to-do' || normalizedTitle === 'todo')) ||
      (normalizedName === 'qa' && normalizedTitle.includes('qa')) ||
      (normalizedName === 'ready for qa' && normalizedTitle.includes('qa')) ||
      (normalizedName === 'human in the loop' && normalizedTitle.includes('human'))
    )
  })

  return matchedColumn ? { id: matchedColumn.id } : null
}

export async function lookupTicket(
  supabase: ReturnType<typeof createClient>,
  ticketId: string | undefined,
  ticketPk: string | undefined
): Promise<{ data: any; error: any } | null> {
  if (ticketPk) {
    return await supabase
      .from('tickets')
      .select('pk, repo_full_name, kanban_column_id, kanban_position')
      .eq('pk', ticketPk)
      .maybeSingle()
  }

  if (!ticketId) return null

  // Strategy 1: Try by id field as-is (e.g., "172")
  let ticketFetch = await supabase
    .from('tickets')
    .select('pk, repo_full_name, kanban_column_id, kanban_position')
    .eq('id', ticketId)
    .maybeSingle()

  // Strategy 2: If not found, try by display_id (e.g., "HAL-0172")
  if (ticketFetch && (ticketFetch.error || !ticketFetch.data)) {
    ticketFetch = await supabase
      .from('tickets')
      .select('pk, repo_full_name, kanban_column_id, kanban_position')
      .eq('display_id', ticketId)
      .maybeSingle()
  }

  // Strategy 3: If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id
  if (ticketFetch && (ticketFetch.error || !ticketFetch.data) && /^[A-Z]+-/.test(ticketId)) {
    const numericPart = ticketId.replace(/^[A-Z]+-/, '')
    const idValue = numericPart.replace(/^0+/, '') || numericPart
    if (idValue !== ticketId) {
      ticketFetch = await supabase
        .from('tickets')
        .select('pk, repo_full_name, kanban_column_id, kanban_position')
        .eq('id', idValue)
        .maybeSingle()
    }
  }

  // Strategy 4: If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
  if (ticketFetch && (ticketFetch.error || !ticketFetch.data) && /^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
    const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
    if (withoutLeadingZeros !== ticketId) {
      ticketFetch = await supabase
        .from('tickets')
        .select('pk, repo_full_name, kanban_column_id, kanban_position')
        .eq('id', withoutLeadingZeros)
        .maybeSingle()
    }
  }

  return ticketFetch
}

export async function calculateTargetPosition(
  supabase: ReturnType<typeof createClient>,
  columnId: string,
  repoFullName: string,
  currentTicketPk: string,
  currentColumnId: string,
  position: string | number | undefined | null
): Promise<{ position: number; needsShift: boolean }> {
  const ticketsInColumnQuery = repoFullName
    ? supabase
        .from('tickets')
        .select('pk, kanban_position')
        .eq('kanban_column_id', columnId)
        .eq('repo_full_name', repoFullName)
        .order('kanban_position', { ascending: true })
    : supabase
        .from('tickets')
        .select('pk, kanban_position')
        .eq('kanban_column_id', columnId)
        .order('kanban_position', { ascending: true })

  const { data: ticketsInColumn } = await ticketsInColumnQuery
  const isMovingToSameColumn = currentColumnId === columnId
  const ticketsList = (ticketsInColumn || []).filter((t: any) => t.pk !== currentTicketPk)
  const maxPosition = ticketsList.length > 0 ? Math.max(...ticketsList.map((t: any) => t.kanban_position ?? -1)) : -1

  if (position === undefined || position === null || position === 'bottom' || position === '') {
    return { position: maxPosition + 1, needsShift: false }
  }

  if (position === 'top' || position === 0) {
    // Shift all tickets in column down by 1
    for (const t of ticketsList) {
      await supabase
        .from('tickets')
        .update({ kanban_position: ((t.kanban_position ?? -1) + 1) })
        .eq('pk', t.pk)
    }
    return { position: 0, needsShift: false }
  }

  if (typeof position === 'number' && position >= 0) {
    const targetIndex = Math.floor(position)
    if (targetIndex > ticketsList.length) {
      return { position: maxPosition + 1, needsShift: false }
    }
    // Shift tickets at/after target position down by 1
    for (const t of ticketsList.slice(targetIndex)) {
      await supabase
        .from('tickets')
        .update({ kanban_position: ((t.kanban_position ?? -1) + 1) })
        .eq('pk', t.pk)
    }
    return { position: targetIndex, needsShift: false }
  }

  throw new Error(`Invalid position: ${position}. Must be "top", "bottom", or a non-negative number.`)
}
