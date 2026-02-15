import { humanReadableCursorError } from '../helpers'

/** Poll Cursor agent status until finished or failed */
export async function pollAgentStatus(
  agentId: string,
  auth: string,
  writeStage: (stage: object) => void,
  onFinished: (summary: string, prUrl?: string) => Promise<void>
): Promise<void> {
  const pollInterval = 4000
  let lastStatus = 'CREATING'
  writeStage({ stage: 'polling', cursorStatus: lastStatus })

  for (;;) {
    await new Promise((r) => setTimeout(r, pollInterval))
    const statusRes = await fetch(`https://api.cursor.com/v0/agents/${agentId}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    const statusText = await statusRes.text()
    if (!statusRes.ok) {
      writeStage({ stage: 'failed', error: humanReadableCursorError(statusRes.status, statusText), status: 'poll-failed' })
      return
    }
    let statusData: { status?: string; summary?: string; target?: { prUrl?: string } }
    try {
      statusData = JSON.parse(statusText) as typeof statusData
    } catch {
      writeStage({ stage: 'failed', error: 'Invalid response when polling agent status.', status: 'poll-failed' })
      return
    }
    lastStatus = statusData.status ?? lastStatus
    writeStage({ stage: 'polling', cursorStatus: lastStatus })

    if (lastStatus === 'FINISHED') {
      const summary = statusData.summary ?? 'Agent completed.'
      const prUrl = statusData.target?.prUrl
      await onFinished(summary, prUrl)
      return
    }

    if (lastStatus === 'FAILED' || lastStatus === 'CANCELLED' || lastStatus === 'ERROR') {
      const errMsg = statusData.summary ?? `Agent ended with status ${lastStatus}.`
      writeStage({ stage: 'failed', error: errMsg, status: lastStatus.toLowerCase() })
      return
    }
  }
}
