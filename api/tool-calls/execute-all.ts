import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
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

// Lock file for idempotency: only one execution at a time
const LOCK_FILE = join(process.cwd(), '.hal-tool-call-execution.lock')
const LOCK_TIMEOUT_MS = 60_000 // 60 seconds max execution time

function acquireLock(): boolean {
  try {
    if (existsSync(LOCK_FILE)) {
      // Check if lock is stale (older than timeout)
      const lockContent = readFileSync(LOCK_FILE, 'utf8')
      const lockData = JSON.parse(lockContent) as { timestamp: number; processId?: number }
      const age = Date.now() - lockData.timestamp
      if (age > LOCK_TIMEOUT_MS) {
        // Stale lock, remove it
        try {
          writeFileSync(LOCK_FILE, JSON.stringify({ timestamp: Date.now(), processId: process.pid }), 'utf8')
          return true
        } catch {
          return false
        }
      }
      return false // Lock is active
    }
    // No lock, create one
    writeFileSync(LOCK_FILE, JSON.stringify({ timestamp: Date.now(), processId: process.pid }), 'utf8')
    return true
  } catch {
    return false
  }
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockContent = readFileSync(LOCK_FILE, 'utf8')
      if (!lockContent.trim()) {
        unlinkSync(LOCK_FILE)
        return
      }
      const lockData = JSON.parse(lockContent) as { processId?: number }
      // Only release if we own the lock
      if (!lockData.processId || lockData.processId === process.pid) {
        unlinkSync(LOCK_FILE) // Delete lock file
      }
    }
  } catch {
    // Ignore errors when releasing lock
  }
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

  // Acquire lock for idempotency
  if (!acquireLock()) {
    json(res, 200, {
      success: true,
      executed: 0,
      message: 'Another execution is in progress. Please wait.',
      locked: true,
    })
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
      // Queue file doesn't exist or is invalid
      releaseLock()
      json(res, 200, {
        success: true,
        executed: 0,
        message: 'No tool calls found in queue',
      })
      return
    }

    if (queue.length === 0) {
      releaseLock()
      json(res, 200, {
        success: true,
        executed: 0,
        message: 'No pending tool calls',
      })
      return
    }

    // Execute all tool calls
    const halApiUrl = process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'
    let executed = 0
    const errors: string[] = []
    const executedIndices = new Set<number>()
    const executedToolCalls: Array<{ tool: string; params: Record<string, unknown>; result: { success: boolean; result?: unknown; error?: string } }> = [] // 0107: Return executed tool calls for Tools Agent logging

    // Process all tool calls
    for (let i = 0; i < queue.length; i++) {
      const toolCall = queue[i]
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
          executedIndices.add(i)
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

    // Remove executed tool calls from queue
    const remainingQueue = queue.filter((_, index) => !executedIndices.has(index))

    // Write updated queue back to file
    try {
      writeFileSync(queuePath, JSON.stringify(remainingQueue, null, 2), 'utf8')
    } catch (err) {
      console.error('Failed to update tool call queue file:', err)
    }

    releaseLock()

    // Store executions for Tools Agent chat logging (0107)
    if (executedToolCalls.length > 0) {
      addExecutions(executedToolCalls)
    }

    json(res, 200, {
      success: true,
      executed,
      total: queue.length,
      remaining: remainingQueue.length,
      errors: errors.length > 0 ? errors : undefined,
      executedToolCalls, // 0107: Return executed tool calls for Tools Agent logging
    })
  } catch (err) {
    releaseLock()
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
