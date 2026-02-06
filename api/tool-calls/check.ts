import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync } from 'fs'
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
      // Queue file doesn't exist or is invalid, return empty
      json(res, 200, {
        success: true,
        hasPendingToolCalls: false,
        toolCalls: [],
      })
      return
    }

    // Filter tool calls for this ticket
    const ticketToolCalls = queue.filter(
      (toolCall) => 
        toolCall.params && 
        typeof toolCall.params === 'object' &&
        'ticketId' in toolCall.params &&
        String(toolCall.params.ticketId) === ticketId
    )

    json(res, 200, {
      success: true,
      hasPendingToolCalls: ticketToolCalls.length > 0,
      toolCalls: ticketToolCalls,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
