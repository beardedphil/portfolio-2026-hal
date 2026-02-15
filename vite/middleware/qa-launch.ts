import { humanReadableCursorError } from '../helpers'
import { buildQAPrompt } from './qa-helpers'

/** Launch QA agent with retry logic for branch not found */
export async function launchQAAgent(
  auth: string,
  repoUrl: string,
  refForApi: string,
  promptText: string,
  branchName: string,
  bodyMd: string,
  ticketId: string,
  repoRoot: string
): Promise<{ agentId: string; usedMain: boolean }> {
  // POST /v0/agents to launch cloud agent with QA ruleset
  let launchRes = await fetch('https://api.cursor.com/v0/agents', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: { text: promptText },
      source: { repository: repoUrl, ref: refForApi },
      target: { branchName: 'main' },
    }),
  })

  let launchText = await launchRes.text()
  // If feature branch does not exist (e.g. already merged and deleted), retry with main
  if (!launchRes.ok && launchRes.status === 400 && refForApi !== 'main') {
    const branchNotFound =
      /branch\s+.*\s+does not exist/i.test(launchText) || /does not exist.*branch/i.test(launchText)
    if (branchNotFound) {
      // Rebuild prompt for main branch
      const promptTextOnMain = buildQAPrompt(bodyMd, ticketId, branchName, 'main', repoRoot)
      launchRes = await fetch('https://api.cursor.com/v0/agents', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: { text: promptTextOnMain },
          source: { repository: repoUrl, ref: 'main' },
          target: { branchName: 'main' },
        }),
      })
      launchText = await launchRes.text()
      if (launchRes.ok) {
        const launchData = JSON.parse(launchText) as { id?: string }
        if (launchData.id) {
          return { agentId: launchData.id, usedMain: true }
        }
      }
    }
  }

  if (!launchRes.ok) {
    let errDetail: string
    try {
      const p = JSON.parse(launchText) as { message?: string; error?: string }
      errDetail = p.message ?? p.error ?? launchText
    } catch {
      errDetail = launchText
    }
    throw new Error(humanReadableCursorError(launchRes.status, errDetail))
  }

  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    throw new Error('Invalid response from Cursor API when launching agent.')
  }

  const agentId = launchData.id
  if (!agentId) {
    throw new Error('Cursor API did not return an agent ID.')
  }

  return { agentId, usedMain: refForApi === 'main' }
}
