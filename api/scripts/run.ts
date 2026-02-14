/**
 * API endpoint to run scripts server-side (where Vercel env vars are available)
 * POST /api/scripts/run
 * Body: { scriptName: string, args?: string[] }
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

// Whitelist of allowed scripts for security
const ALLOWED_SCRIPTS: Record<string, { path: string; description: string }> = {
  'migrate-instructions': {
    path: 'scripts/migrate-instructions-to-supabase.js',
    description: 'Migrate instruction files from .cursor/rules/ to Supabase',
  },
}

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
      scriptName?: string
      args?: string[]
    }

    const scriptName = typeof body.scriptName === 'string' ? body.scriptName.trim() : undefined
    const args = Array.isArray(body.args) ? body.args : []

    if (!scriptName) {
      json(res, 400, {
        success: false,
        error: 'scriptName is required',
      })
      return
    }

    if (!ALLOWED_SCRIPTS[scriptName]) {
      json(res, 400, {
        success: false,
        error: `Script "${scriptName}" is not allowed. Allowed scripts: ${Object.keys(ALLOWED_SCRIPTS).join(', ')}`,
      })
      return
    }

    const script = ALLOWED_SCRIPTS[scriptName]
    // Use path.resolve to get absolute path - on Vercel, process.cwd() is /var/task
    const scriptPath = path.resolve(process.cwd(), script.path)

    console.log(`[API] Running script: ${scriptName}`)
    console.log(`[API] Script path: ${scriptPath}`)
    console.log(`[API] CWD: ${process.cwd()}`)

    // Check if file exists
    const fs = await import('fs')
    if (!fs.existsSync(scriptPath)) {
      json(res, 500, {
        success: false,
        error: `Script file not found: ${scriptPath}. Current directory: ${process.cwd()}`,
      })
      return
    }

    // Run the script
    const { stdout, stderr } = await execAsync(`node "${scriptPath}" ${args.join(' ')}`, {
      cwd: process.cwd(),
      env: process.env, // Pass through all environment variables (including Vercel's)
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large output
    })

    json(res, 200, {
      success: true,
      scriptName,
      description: script.description,
      stdout: stdout || '',
      stderr: stderr || '',
      output: stdout || stderr || 'Script completed with no output',
    })
  } catch (error) {
    console.error('[API] Script execution error:', error)
    json(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
