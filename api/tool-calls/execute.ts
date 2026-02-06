import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { addExecutions } from './recent-executions.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined

    if (!ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketId is required',
      })
      return
    }

    // Read tool call queue file
    const queuePath = join(process.cwd(), '.hal-tool-call-queue.json')
    let queue: Array<{ tool: string; params: Record<string, unknown> }> = []
    
    try {
      const queueContent = readFileSync(queuePath, 'utf8')
      queue = JSON.parse(queueContent) as Array<{ tool: string; params: Record<string, unknown> }>
    } catch {
      // Queue file doesn't exist or is invalid
      json(res, 200, {
        success: true,
        executed: 0,
        message: 'No tool calls found in queue',
      })
      return
    }

    // Filter tool calls for this ticket
    // Normalize ticket IDs: remove "HAL-" prefix if present for comparison
    const normalizeTicketId = (id: string): string => {
      return id.replace(/^HAL-?/i, '').trim()
    }
    const normalizedTicketId = normalizeTicketId(ticketId)
    
    const ticketToolCalls = queue.filter(
      (toolCall) => 
        toolCall.params && 
        typeof toolCall.params === 'object' &&
        'ticketId' in toolCall.params &&
        normalizeTicketId(String(toolCall.params.ticketId)) === normalizedTicketId
    )

    if (ticketToolCalls.length === 0) {
      json(res, 200, {
        success: true,
        executed: 0,
        message: 'No pending tool calls for this ticket',
      })
      return
    }

    // Separate move_ticket_column calls from other tool calls
    const moveCalls = ticketToolCalls.filter(tc => tc.tool === 'move_ticket_column')
    const otherCalls = ticketToolCalls.filter(tc => tc.tool !== 'move_ticket_column')

    // Execute non-move tool calls first
    const halApiUrl = process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'
    let executed = 0
    const errors: string[] = []
    const executedTools = new Set<string>()
    const executedToolCalls: Array<{ tool: string; params: Record<string, unknown>; result: { success: boolean; result?: unknown; error?: string } }> = [] // 0107: Return executed tool calls for Tools Agent logging

    for (const toolCall of otherCalls) {
      try {
        const toolResponse = await fetch(`${halApiUrl}/api/agent-tools/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: toolCall.tool,
            params: toolCall.params,
          }),
        })
        const toolResult = (await toolResponse.json()) as { success?: boolean; error?: string; [key: string]: unknown }
        if (!toolResult.success) {
          errors.push(`Tool call ${toolCall.tool} failed: ${toolResult.error || 'Unknown error'}`)
          executedToolCalls.push({
            tool: toolCall.tool,
            params: toolCall.params,
            result: { success: false, error: toolResult.error || 'Unknown error' },
          })
        } else {
          executed++
          executedTools.add(toolCall.tool)
          executedToolCalls.push({
            tool: toolCall.tool,
            params: toolCall.params,
            result: { success: true, result: toolResult },
          })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        errors.push(`Failed to execute tool call ${toolCall.tool}: ${errorMsg}`)
        executedToolCalls.push({
          tool: toolCall.tool,
          params: toolCall.params,
          result: { success: false, error: errorMsg },
        })
      }
    }

    // Determine next column based on executed tool calls
    let nextColumnId: string | null = null
    if (executedTools.has('insert_qa_artifact')) {
      // QA artifact inserted → move to Human in the Loop
      nextColumnId = 'col-human-in-the-loop'
    } else if (executedTools.has('insert_implementation_artifact')) {
      // Implementation artifacts inserted → move to QA
      nextColumnId = 'col-qa'
    }

    // If we determined a next column and there's no existing move call, execute it
    if (nextColumnId && moveCalls.length === 0) {
      try {
        // Get current ticket column from Supabase to avoid unnecessary moves
        const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()
        
        if (supabaseUrl && supabaseAnonKey) {
          const supabase = createClient(supabaseUrl, supabaseAnonKey)
          const ticketNumber = parseInt(normalizedTicketId, 10)
          
          if (Number.isFinite(ticketNumber)) {
            // Find ticket by ticket_number or id
            const { data: ticket } = await supabase
              .from('tickets')
              .select('kanban_column_id')
              .or(`ticket_number.eq.${ticketNumber},id.eq.${normalizedTicketId}`)
              .maybeSingle()
            
            // Only move if not already in target column
            if (ticket && (ticket as { kanban_column_id?: string }).kanban_column_id !== nextColumnId) {
              const moveResponse = await fetch(`${halApiUrl}/api/agent-tools/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tool: 'move_ticket_column',
                  params: {
                    ticketId: normalizedTicketId,
                    columnId: nextColumnId,
                  },
                }),
              })
              const moveResult = (await moveResponse.json()) as { success?: boolean; error?: string; [key: string]: unknown }
              if (moveResult.success) {
                executed++
                executedTools.add('move_ticket_column')
                executedToolCalls.push({
                  tool: 'move_ticket_column',
                  params: { ticketId: normalizedTicketId, columnId: nextColumnId },
                  result: { success: true, result: moveResult },
                })
              } else {
                errors.push(`Failed to move ticket to ${nextColumnId}: ${moveResult.error || 'Unknown error'}`)
                executedToolCalls.push({
                  tool: 'move_ticket_column',
                  params: { ticketId: normalizedTicketId, columnId: nextColumnId },
                  result: { success: false, error: moveResult.error || 'Unknown error' },
                })
              }
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to determine/execute ticket move: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (moveCalls.length > 0) {
      // Execute existing move calls
      for (const toolCall of moveCalls) {
        try {
          const toolResponse = await fetch(`${halApiUrl}/api/agent-tools/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool: toolCall.tool,
              params: toolCall.params,
            }),
          })
          const toolResult = (await toolResponse.json()) as { success?: boolean; error?: string; [key: string]: unknown }
          if (!toolResult.success) {
            errors.push(`Tool call ${toolCall.tool} failed: ${toolResult.error || 'Unknown error'}`)
            executedToolCalls.push({
              tool: toolCall.tool,
              params: toolCall.params,
              result: { success: false, error: toolResult.error || 'Unknown error' },
            })
          } else {
            executed++
            executedTools.add(toolCall.tool)
            executedToolCalls.push({
              tool: toolCall.tool,
              params: toolCall.params,
              result: { success: true, result: toolResult },
            })
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          errors.push(`Failed to execute tool call ${toolCall.tool}: ${errorMsg}`)
          executedToolCalls.push({
            tool: toolCall.tool,
            params: toolCall.params,
            result: { success: false, error: errorMsg },
          })
        }
      }
    }

    // Remove executed tool calls from queue
    const remainingQueue = queue.filter(
      (toolCall) => 
        !toolCall.params || 
        typeof toolCall.params !== 'object' ||
        !('ticketId' in toolCall.params) ||
        normalizeTicketId(String(toolCall.params.ticketId)) !== normalizedTicketId
    )

    // Write updated queue back to file
    try {
      writeFileSync(queuePath, JSON.stringify(remainingQueue, null, 2), 'utf8')
    } catch (err) {
      console.error('Failed to update tool call queue file:', err)
    }

    // Store executions for Tools Agent chat logging (0107)
    if (executedToolCalls.length > 0) {
      addExecutions(executedToolCalls)
    }

    json(res, 200, {
      success: true,
      executed,
      total: ticketToolCalls.length,
      errors: errors.length > 0 ? errors : undefined,
      executedToolCalls, // 0107: Return executed tool calls for Tools Agent logging
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
