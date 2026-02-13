import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

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
      ticketPk?: string
      ticketId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if ((!ticketPk && !ticketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId, and Supabase credentials are required.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch ticket and artifacts
    const ticketQuery = ticketPk
      ? await supabase.from('tickets').select('pk, id, display_id, title, body_md, repo_full_name').eq('pk', ticketPk).maybeSingle()
      : await supabase.from('tickets').select('pk, id, display_id, title, body_md, repo_full_name').eq('id', ticketId!).maybeSingle()

    if (ticketQuery.error || !ticketQuery.data) {
      json(res, 200, {
        success: false,
        error: `Ticket not found: ${ticketQuery.error?.message || 'Unknown error'}`,
      })
      return
    }

    const ticket = ticketQuery.data

    // Fetch all artifacts for this ticket
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
      .eq('ticket_pk', ticket.pk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
      })
      return
    }

    if (!artifacts || artifacts.length === 0) {
      // Store failure in database
      try {
        await supabase
          .from('process_reviews')
          .insert({
            ticket_pk: ticket.pk,
            ticket_id: ticket.id,
            suggestions: [],
            status: 'failed',
            error_message: 'No artifacts found for this ticket. Process review requires artifacts to analyze.',
          })
      } catch (storageError) {
        console.error('Error storing process review failure:', storageError)
      }
      
      json(res, 200, {
        success: true,
        suggestions: [],
        error: 'No artifacts found for this ticket. Process review requires artifacts to analyze.',
      })
      return
    }

    // Prepare artifact summaries for the LLM
    const artifactSummaries = artifacts.map((a) => {
      const bodyPreview = (a.body_md || '').slice(0, 500)
      return `- ${a.title || a.agent_type} (${a.agent_type}): ${bodyPreview}${bodyPreview.length >= 500 ? '...' : ''}`
    }).join('\n')

    // Use OpenAI to generate suggestions
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      // Store failure in database
      try {
        await supabase
          .from('process_reviews')
          .insert({
            ticket_pk: ticket.pk,
            ticket_id: ticket.id,
            suggestions: [],
            status: 'failed',
            error_message: 'OPENAI_API_KEY not configured. Process review requires OpenAI API access.',
          })
      } catch (storageError) {
        console.error('Error storing process review failure:', storageError)
      }
      
      json(res, 200, {
        success: false,
        error: 'OPENAI_API_KEY not configured. Process review requires OpenAI API access.',
      })
      return
    }

    const openai = createOpenAI({ apiKey: openaiApiKey })

    const prompt = `You are a process review agent analyzing ticket artifacts to suggest improvements to agent instructions.

Ticket: ${ticket.display_id || ticket.id} — ${ticket.title}

Artifacts found:
${artifactSummaries}

Review the artifacts above and suggest specific, actionable improvements to agent instructions (rules, templates, or process documentation) that would help prevent issues or improve outcomes for similar tickets in the future.

Format your response as a JSON array of objects, where each object has "text" and "justification" fields:
- "text": The suggestion itself (specific and actionable, focused on improving agent instructions/rules)
- "justification": A short explanation (1-2 sentences) of why this suggestion would help

Example format:
[
  {
    "text": "Add a rule requiring agents to verify file paths exist before attempting to read them",
    "justification": "This would prevent file-not-found errors that cause agent failures and require manual intervention."
  },
  {
    "text": "Update the ticket template to include a 'Dependencies' section",
    "justification": "This would help agents understand prerequisite work and avoid blocking issues during implementation."
  },
  {
    "text": "Clarify in the branching rules that feature branches must be created before any file edits",
    "justification": "This would prevent accidental commits to main and ensure proper code review workflow."
  }
]

Provide 3-5 suggestions. If no meaningful improvements are apparent, return an empty array [].`

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxTokens: 1500,
    })

    // Parse structured suggestions from JSON response
    let suggestions: Array<{ text: string; justification: string }> = []
    try {
      const responseText = result.text.trim()
      // Try to extract JSON from the response (may be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      const jsonText = jsonMatch ? jsonMatch[0] : responseText
      const parsed = JSON.parse(jsonText)
      
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .filter((item) => item && typeof item.text === 'string' && typeof item.justification === 'string')
          .map((item) => ({
            text: item.text.trim(),
            justification: item.justification.trim(),
          }))
      }
    } catch (parseError) {
      // Fallback: if JSON parsing fails, try to parse as bullet list and create suggestions without justifications
      const responseText = result.text.trim()
      const lines = responseText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => {
          if (!line) return false
          return /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)
        })
        .map((line) => line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim())
        .filter((line) => line.length > 0)
      
      if (lines.length > 0) {
        suggestions = lines.map((text) => ({
          text,
          justification: 'Justification not available (parsing error).',
        }))
      } else {
        suggestions = [{
          text: responseText || 'No specific suggestions generated.',
          justification: 'Justification not available (parsing error).',
        }]
      }
    }

    // Store review results in database
    let reviewId: string | null = null
    try {
      const { data: reviewData, error: reviewError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          ticket_id: ticket.id,
          suggestions: suggestions,
          status: 'success',
          error_message: null,
        })
        .select('id')
        .single()

      if (reviewError) {
        console.error('Failed to store process review:', reviewError)
        // Continue even if storage fails - we still return the suggestions
      } else {
        reviewId = reviewData?.id || null
      }
    } catch (storageError) {
      console.error('Error storing process review:', storageError)
      // Continue even if storage fails
    }

    json(res, 200, {
      success: true,
      suggestions: suggestions.map((s) => ({ text: s.text, justification: s.justification })),
      reviewId,
    })
  } catch (err) {
    // Note: We can't store errors in the database here because we don't have access to the request body
    // (it's already been consumed). Errors are logged and returned to the client.
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
