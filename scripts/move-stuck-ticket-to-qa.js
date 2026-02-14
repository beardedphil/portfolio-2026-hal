#!/usr/bin/env node
/**
 * Script to find and move tickets stuck in Active Work (col-doing) to QA (col-qa).
 * 
 * Usage:
 *   node scripts/move-stuck-ticket-to-qa.js [ticketId]
 * 
 * If ticketId is provided, moves that specific ticket.
 * Otherwise, lists all tickets in col-doing and moves them all to QA.
 * 
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// Load Supabase credentials from environment or .env
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment')
  console.error('Or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function moveTicketToQa(ticketPk, ticketId, displayId) {
  try {
    // Get current QA column position
    const { data: inColumn, error: fetchError } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('kanban_column_id', 'col-qa')
      .order('kanban_position', { ascending: false })
      .limit(1)
    
    if (fetchError) {
      console.error(`Failed to fetch QA column position: ${fetchError.message}`)
      return false
    }
    
    const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
    const movedAt = new Date().toISOString()
    
    // Move ticket to QA
    const { error: updateError } = await supabase
      .from('tickets')
      .update({ kanban_column_id: 'col-qa', kanban_position: nextPosition, kanban_moved_at: movedAt })
      .eq('pk', ticketPk)
    
    if (updateError) {
      console.error(`Failed to move ticket ${displayId || ticketId}: ${updateError.message}`)
      return false
    }
    
    // Verify the move
    const { data: verifyTicket, error: verifyError } = await supabase
      .from('tickets')
      .select('kanban_column_id')
      .eq('pk', ticketPk)
      .maybeSingle()
    
    if (verifyError) {
      console.error(`Failed to verify move: ${verifyError.message}`)
      return false
    }
    
    if (verifyTicket?.kanban_column_id === 'col-qa') {
      console.log(`✅ Successfully moved ticket ${displayId || ticketId} to QA`)
      return true
    } else {
      console.error(`❌ Verification failed: ticket is in column ${verifyTicket?.kanban_column_id || 'unknown'}`)
      return false
    }
  } catch (err) {
    console.error(`Error moving ticket: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

async function main() {
  const ticketIdArg = process.argv[2]
  
  if (ticketIdArg) {
    // Move specific ticket
    const ticketNumber = parseInt(ticketIdArg.replace(/^HAL-?/i, ''), 10)
    if (isNaN(ticketNumber)) {
      console.error(`Invalid ticket ID: ${ticketIdArg}`)
      process.exit(1)
    }
    
    // Find ticket by id or display_id
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('pk, id, display_id, title, kanban_column_id')
      .or(`id.eq.${ticketNumber},display_id.ilike.%${ticketIdArg}%`)
      .limit(10)
    
    if (error) {
      console.error(`Failed to find ticket: ${error.message}`)
      process.exit(1)
    }
    
    if (!tickets || tickets.length === 0) {
      console.error(`Ticket ${ticketIdArg} not found`)
      process.exit(1)
    }
    
    const ticket = tickets[0]
    if (ticket.kanban_column_id !== 'col-doing') {
      console.log(`Ticket ${ticket.display_id || ticket.id} is in column ${ticket.kanban_column_id || 'unknown'}, not col-doing`)
      console.log('Skipping move.')
      process.exit(0)
    }
    
    await moveTicketToQa(ticket.pk, ticket.id, ticket.display_id)
  } else {
    // List all tickets in col-doing
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('pk, id, display_id, title, kanban_column_id, kanban_moved_at')
      .eq('kanban_column_id', 'col-doing')
      .order('kanban_moved_at', { ascending: false })
    
    if (error) {
      console.error(`Failed to fetch tickets: ${error.message}`)
      process.exit(1)
    }
    
    if (!tickets || tickets.length === 0) {
      console.log('No tickets found in Active Work (col-doing)')
      process.exit(0)
    }
    
    console.log(`Found ${tickets.length} ticket(s) in Active Work (col-doing):\n`)
    for (const ticket of tickets) {
      console.log(`  - ${ticket.display_id || ticket.id}: ${ticket.title || '(no title)'}`)
      console.log(`    PK: ${ticket.pk}`)
      console.log(`    Moved at: ${ticket.kanban_moved_at || 'unknown'}`)
      console.log()
    }
    
    console.log('Moving all tickets to QA...\n')
    let successCount = 0
    for (const ticket of tickets) {
      if (await moveTicketToQa(ticket.pk, ticket.id, ticket.display_id)) {
        successCount++
      }
    }
    
    console.log(`\n✅ Moved ${successCount}/${tickets.length} ticket(s) to QA`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
