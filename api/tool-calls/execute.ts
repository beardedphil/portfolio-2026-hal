import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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

    // Execute tool calls
    const halApiUrl = process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'
    let executed = 0
    const errors: string[] = []

    for (const toolCall of ticketToolCalls) {
      try {
        const toolResponse = await fetch(`${halApiUrl}/api/agent-tools/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: toolCall.tool,
            params: toolCall.params,
          }),
        })
        const toolResult = await toolResponse.json()
        if (!toolResult.success) {
          errors.push(`Tool call ${toolCall.tool} failed: ${toolResult.error || 'Unknown error'}`)
        } else {
          executed++
        }
      } catch (err) {
        errors.push(`Failed to execute tool call ${toolCall.tool}: ${err instanceof Error ? err.message : String(err)}`)
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

    json(res, 200, {
      success: true,
      executed,
      total: ticketToolCalls.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
