#!/usr/bin/env node
/**
 * Tool Agent: DEPRECATED - This script is no longer used.
 * 
 * HAL now runs as an API-driven app. Tool calls are executed directly from agent messages
 * via the API, not through a queue/poller system.
 * 
 * This file is kept for reference but should not be executed.
 * 
 * @deprecated Removed in ticket 0112 - HAL is now API-driven only
 */

const { readFileSync, writeFileSync, existsSync, unlinkSync } = require('fs')
const { join } = require('path')

const POLL_INTERVAL_MS = 30_000 // 30 seconds
const LOCK_FILE = join(process.cwd(), '.hal-tool-call-execution.lock')
const LOCK_TIMEOUT_MS = 60_000 // 60 seconds max execution time
const QUEUE_FILE = join(process.cwd(), '.hal-tool-call-queue.json')

// DEPRECATED: Tool agent is disabled - HAL is now API-driven only
const halApiUrl = process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'
const enabled = false // Always disabled - tool agent removed in ticket 0112

function acquireLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      // Check if lock is stale (older than timeout)
      const lockContent = readFileSync(LOCK_FILE, 'utf8')
      if (!lockContent.trim()) {
        // Empty lock file, create new one
        writeFileSync(LOCK_FILE, JSON.stringify({ timestamp: Date.now(), processId: process.pid }), 'utf8')
        return true
      }
      const lockData = JSON.parse(lockContent)
      const age = Date.now() - lockData.timestamp
      if (age > LOCK_TIMEOUT_MS) {
        // Stale lock, remove it
        writeFileSync(LOCK_FILE, JSON.stringify({ timestamp: Date.now(), processId: process.pid }), 'utf8')
        return true
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

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockContent = readFileSync(LOCK_FILE, 'utf8')
      if (!lockContent.trim()) {
        unlinkSync(LOCK_FILE)
        return
      }
      const lockData = JSON.parse(lockContent)
      // Only release if we own the lock
      if (!lockData.processId || lockData.processId === process.pid) {
        unlinkSync(LOCK_FILE) // Delete lock file
      }
    }
  } catch {
    // Ignore errors when releasing lock
  }
}

async function executeAllToolCalls() {
  if (!acquireLock()) {
    console.log(`[Tool Agent] Another execution is in progress, skipping this poll.`)
    return
  }

  try {
    // Use the same endpoint as the frontend "Run tool calls" button (0107)
    // This ensures tool calls are logged to Tools Agent chat via the same code path
    const response = await fetch(`${halApiUrl}/api/tool-calls/execute-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    
    if (!response.ok) {
      console.error(`[Tool Agent] Failed to execute tool calls: ${response.status} ${response.statusText}`)
      releaseLock()
      return
    }
    
    const result = await response.json()
    
    if (result.success) {
      const executed = result.executed || 0
      const total = result.total || 0
      const remaining = result.remaining || 0
      const errors = result.errors || []
      
      if (executed > 0) {
        console.log(`[Tool Agent] Executed ${executed} tool call(s). ${remaining} remaining.`)
      }
      if (errors.length > 0) {
        console.error(`[Tool Agent] Errors:`, errors)
      }
      // Note: Tool calls are logged to Tools Agent chat by the execute-all endpoint
      // The frontend will pick up these logs when it polls or when the user opens the Tools Agent chat
    } else {
      console.error(`[Tool Agent] Tool call execution failed: ${result.error || 'Unknown error'}`)
    }
  } catch (err) {
    console.error('[Tool Agent] Error executing tool calls:', err)
  } finally {
    releaseLock()
  }
}

async function pollLoop() {
  if (!enabled) {
    console.log('[Tool Agent] DEPRECATED - Tool agent removed in ticket 0112. HAL is now API-driven only.')
    process.exit(0)
  }

  console.log(`[Tool Agent] Starting poll loop (every ${POLL_INTERVAL_MS / 1000}s). API: ${halApiUrl}`)
  
  // Initial execution
  await executeAllToolCalls()

  // Poll every 30 seconds
  const interval = setInterval(async () => {
    await executeAllToolCalls()
  }, POLL_INTERVAL_MS)

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n[Tool Agent] Stopping...')
    clearInterval(interval)
    releaseLock()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n[Tool Agent] Stopping...')
    clearInterval(interval)
    releaseLock()
    process.exit(0)
  })
}

// Start the poll loop
pollLoop().catch((err) => {
  console.error('[Tool Agent] Fatal error:', err)
  process.exit(1)
})
