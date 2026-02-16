/**
 * Response handling for PM agent - legacy respond function.
 */

const SIGNATURE = '[PM@hal-agents]'

export type RespondContext = {
  [key: string]: unknown
}

export type RespondInput = {
  message: string
  context?: RespondContext
}

export type RespondMeta = {
  source: 'hal-agents'
  case: 'standup' | 'default'
}

export type RespondOutput = {
  replyText: string
  meta: RespondMeta
}

const STANDUP_TRIGGERS = ['standup', 'status']

function isStandupOrStatus(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return STANDUP_TRIGGERS.some((t) => normalized.includes(t))
}

export function respond(input: RespondInput): RespondOutput {
  const { message } = input
  if (isStandupOrStatus(message)) {
    return {
      replyText: `${SIGNATURE} Standup summary:
• Reviewed ticket backlog
• No blockers identified
• Ready to assist with prioritization`,
      meta: { source: 'hal-agents', case: 'standup' },
    }
  }
  return {
    replyText: `${SIGNATURE} Message received. Here's a quick checklist to move forward:
• [ ] Clarify scope if needed
• [ ] Confirm priority with stakeholder
• [ ] Break down into tasks when ready`,
    meta: { source: 'hal-agents', case: 'default' },
  }
}
