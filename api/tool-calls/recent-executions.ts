import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
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

// File to store recent tool call executions (0107)
const EXECUTIONS_FILE = join(process.cwd(), '.hal-tool-call-executions.json')

interface ToolCallExecution {
  tool: string
  params: Record<string, unknown>
  result: { success: boolean; result?: unknown; error?: string }
  timestamp: number
  id: string // Unique ID for this execution
}

// Read recent executions from file
function readExecutions(): ToolCallExecution[] {
  try {
    if (!existsSync(EXECUTIONS_FILE)) {
      return []
    }
    const content = readFileSync(EXECUTIONS_FILE, 'utf8')
    return JSON.parse(content) as ToolCallExecution[]
  } catch {
    return []
  }
}

// Write executions to file (keep last 1000)
function writeExecutions(executions: ToolCallExecution[]): void {
  try {
    // Keep only the last 1000 executions
    const recent = executions.slice(-1000)
    writeFileSync(EXECUTIONS_FILE, JSON.stringify(recent, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to write tool call executions:', err)
  }
}

// Add executions to the file (called by execute-all endpoint)
export function addExecutions(newExecutions: Array<{ tool: string; params: Record<string, unknown>; result: { success: boolean; result?: unknown; error?: string } }>): void {
  const executions = readExecutions()
  const timestamp = Date.now()
  const newEntries: ToolCallExecution[] = newExecutions.map((exec, idx) => ({
    ...exec,
    timestamp: timestamp + idx, // Slight offset to maintain order
    id: `${timestamp}-${idx}-${Math.random().toString(36).substring(7)}`,
  }))
  executions.push(...newEntries)
  writeExecutions(executions)
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

  if (req.method === 'GET') {
    // Return recent executions since a given timestamp
    try {
      const url = new URL(req.url || '', 'http://localhost')
      const sinceParam = url.searchParams.get('since')
      const since = sinceParam ? parseInt(sinceParam, 10) : 0

      const executions = readExecutions()
      const recent = executions.filter((exec) => exec.timestamp > since)

      json(res, 200, {
        success: true,
        executions: recent,
        latestTimestamp: executions.length > 0 ? executions[executions.length - 1]?.timestamp : 0,
      })
      return
    } catch (err) {
      json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
  }

  if (req.method === 'POST') {
    // Mark executions as logged (remove them from the file)
    try {
      const body = (await readJsonBody(req)) as {
        loggedIds?: string[]
      }

      const loggedIds = Array.isArray(body.loggedIds) ? body.loggedIds : []
      if (loggedIds.length === 0) {
        json(res, 200, { success: true, removed: 0 })
        return
      }

      const executions = readExecutions()
      const remaining = executions.filter((exec) => !loggedIds.includes(exec.id))
      writeExecutions(remaining)

      json(res, 200, {
        success: true,
        removed: executions.length - remaining.length,
      })
      return
    } catch (err) {
      json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
  }

  res.statusCode = 405
  res.end('Method Not Allowed')
}
