#!/usr/bin/env node
/**
 * Call HAL's cancel endpoint to stop all active Cursor cloud agents.
 * Uses HAL's environment (Supabase + Cursor API key) on the server.
 *
 *   npm run cancel-agents
 *   # Deployed HAL:
 *   HAL_API_URL=https://your-app.vercel.app npm run cancel-agents
 */
const baseUrl = process.env.HAL_API_URL || 'http://localhost:5173'
const url = `${baseUrl.replace(/\/$/, '')}/api/agent-runs/cancel?cancelAll=true`

async function main() {
  try {
    const res = await fetch(url, { method: 'GET' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('Cancel failed:', res.status, data.error || data)
      process.exit(1)
    }
    console.log(data.message || `Cancelled ${data.cancelled ?? 0} agent run(s).`)
    if (data.errors?.length) data.errors.forEach((e) => console.error(' ', e))
  } catch (err) {
    console.error('Request failed:', err.message)
    console.error('Make sure the HAL app is running (e.g. npm run dev) or set HAL_API_URL to your deployed URL.')
    process.exit(1)
  }
}

main()
