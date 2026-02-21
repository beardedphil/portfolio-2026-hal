/**
 * Process review suggestion parsing and handling
 */

import { getLastAssistantMessage } from './status-conversation.js'
import type { AgentType } from './status-helpers.js'

function parseSuggestionsArray(candidate: string): Array<{ text: string; justification: string }> | null {
  const s = candidate.trim()
  if (!s) return null
  try {
    const parsed = JSON.parse(s) as unknown
    if (!Array.isArray(parsed)) return null
    const suggestions = (parsed as any[])
      .filter((item) => item && typeof item === 'object')
      .filter((item) => typeof (item as any).text === 'string' && typeof (item as any).justification === 'string')
      .map((item) => ({
        text: String((item as any).text).trim(),
        justification: String((item as any).justification).trim(),
      }))
      .filter((s) => s.text.length > 0 && s.justification.length > 0)
    return suggestions.length > 0 ? suggestions : null
  } catch {
    return null
  }
}

function extractJsonArrayFromText(text: string): string | null {
  const start = text.indexOf('[')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

export function parseProcessReviewSuggestionsFromText(
  input: string
): Array<{ text: string; justification: string }> | null {
  const text = String(input ?? '').trim()
  if (!text) return null

  const direct = parseSuggestionsArray(text)
  if (direct) return direct

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    const fromFence = parseSuggestionsArray(fenced[1])
    if (fromFence) return fromFence
  }

  const extracted = extractJsonArrayFromText(text)
  if (extracted) {
    return parseSuggestionsArray(extracted)
  }
  return null
}

async function loadSuggestionsFromDatabase(
  supabase: any,
  ticketPk: string
): Promise<Array<{ text: string; justification: string }> | null> {
  try {
    const { data: existingReview } = await supabase
      .from('process_reviews')
      .select('suggestions, status')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingReview && existingReview.status === 'success' && existingReview.suggestions && Array.isArray(existingReview.suggestions) && existingReview.suggestions.length > 0) {
      const dbSuggestions = existingReview.suggestions
        .map((s: string | { text: string; justification?: string }) => {
          if (typeof s === 'string') {
            return { text: s, justification: 'No justification provided.' }
          } else if (s && typeof s === 'object' && typeof s.text === 'string') {
            return {
              text: s.text,
              justification: s.justification || 'No justification provided.',
            }
          }
          return null
        })
        .filter((s): s is { text: string; justification: string } => s !== null)

      if (dbSuggestions.length > 0) {
        return dbSuggestions
      }
    }
  } catch (e) {
    console.warn('[agent-runs] process-review database fallback failed:', e instanceof Error ? e.message : e)
  }
  return null
}

export async function handleProcessReviewSuggestions(
  supabase: any,
  agentType: AgentType,
  ticketPk: string | null,
  summary: string | null,
  conversationText: string | null,
  repoFullName: string
): Promise<Array<{ text: string; justification: string }> | null> {
  if (agentType !== 'process-review' || !ticketPk) return null

  const fromSummary = parseProcessReviewSuggestionsFromText(summary ?? '')
  const fromConversation = conversationText
    ? parseProcessReviewSuggestionsFromText(getLastAssistantMessage(conversationText) ?? '')
    : null
  const suggestions = fromSummary ?? fromConversation ?? []

  if (suggestions.length > 0 || fromSummary != null || fromConversation != null) {
    try {
      await supabase.from('process_reviews').insert({
        ticket_pk: ticketPk,
        repo_full_name: repoFullName,
        suggestions: suggestions,
        status: 'success',
        error_message: null,
      })
      return suggestions
    } catch (e) {
      console.warn('[agent-runs] process-review conversation fetch/parse failed:', e instanceof Error ? e.message : e)
    }
  }

  return await loadSuggestionsFromDatabase(supabase, ticketPk)
}
