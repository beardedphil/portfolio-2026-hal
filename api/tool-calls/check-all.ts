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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
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
        count: 0,
      })
      return
    }

    json(res, 200, {
      success: true,
      hasPendingToolCalls: queue.length > 0,
      count: queue.length,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
