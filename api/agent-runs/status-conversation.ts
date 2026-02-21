/**
 * Conversation text extraction and parsing functions
 */

import { isPlaceholderSummary } from './status-helpers.js'

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p
        if (p && typeof p === 'object') {
          const anyP = p as any
          return (
            (typeof anyP.text === 'string' ? anyP.text : '') ||
            (typeof anyP.content === 'string' ? anyP.content : '') ||
            (typeof anyP.value === 'string' ? anyP.value : '')
          )
        }
        return ''
      })
      .filter(Boolean)
      .join('')
  }
  if (content && typeof content === 'object') {
    const anyC = content as any
    if (typeof anyC.text === 'string') return anyC.text
    if (typeof anyC.content === 'string') return anyC.content
    if (typeof anyC.value === 'string') return anyC.value
  }
  return ''
}

function getMessagesFromConversation(conv: any): any[] {
  if (Array.isArray(conv?.messages)) return conv.messages
  if (Array.isArray(conv?.conversation?.messages)) return conv.conversation.messages
  return []
}

export function getLastAssistantMessage(conversationText: string): string | null {
  try {
    const conv = JSON.parse(conversationText) as any
    const messages = getMessagesFromConversation(conv)

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m?.role === 'assistant' && String(extractTextFromContent(m?.content ?? '')).trim())
    const content = extractTextFromContent(lastAssistant?.content ?? '').trim()
    return content ? content : null
  } catch {
    return null
  }
}

export async function fetchConversationText(cursorAgentId: string, auth: string): Promise<string | null> {
  try {
    const convRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}/conversation`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    const text = await convRes.text()
    return convRes.ok && text ? text : null
  } catch (e) {
    console.warn('[agent-runs] conversation fetch failed:', e instanceof Error ? e.message : e)
    return null
  }
}

export function needsConversationFetch(agentType: string, summary: string | null): boolean {
  return (
    agentType === 'process-review' ||
    agentType === 'project-manager' ||
    agentType === 'qa' ||
    agentType === 'implementation' ||
    isPlaceholderSummary(summary)
  )
}
