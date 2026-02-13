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
      const emptySuggestion = [{
        text: 'No artifacts found for this ticket. Process review requires artifacts to analyze.',
        justification: 'Process review cannot generate suggestions without artifacts to analyze.',
      }]

      // Store review result in database (even for empty case)
      try {
        const { error: insertError } = await supabase
          .from('process_reviews')
          .insert({
            ticket_pk: ticket.pk,
            ticket_id: ticket.id,
            suggestions: emptySuggestion,
            status: 'success',
            error_message: null,
          })

        if (insertError) {
          console.error('Failed to store process review result:', insertError)
        }
      } catch (storageErr) {
        console.error('Error storing process review result:', storageErr)
      }

      json(res, 200, {
        success: true,
        suggestions: emptySuggestion,
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
      const errorMsg = 'OPENAI_API_KEY not configured. Process review requires OpenAI API access.'

      // Store failed review result in database
      try {
        const { error: insertError } = await supabase
          .from('process_reviews')
          .insert({
            ticket_pk: ticket.pk,
            ticket_id: ticket.id,
            suggestions: [],
            status: 'failed',
            error_message: errorMsg,
          })

        if (insertError) {
          console.error('Failed to store process review result:', insertError)
        }
      } catch (storageErr) {
        console.error('Error storing process review result:', storageErr)
      }

      json(res, 200, {
        success: false,
        error: errorMsg,
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
- "text": The suggestion itself (specific and actionable)
- "justification": A short explanation (1-2 sentences) of why this suggestion would help

Example format:
[
  {
    "text": "Add a rule requiring agents to verify file paths exist before attempting to read them",
    "justification": "This would prevent file not found errors that occurred in this ticket when the agent tried to read a non-existent file."
  },
  {
    "text": "Update the ticket template to include a 'Dependencies' section",
    "justification": "The artifacts show confusion about task dependencies, which could be avoided with explicit dependency tracking."
  }
]

Provide 3-5 suggestions. If no meaningful improvements are apparent, respond with: [{"text": "No significant improvements identified.", "justification": "The artifacts show no clear patterns that would benefit from instruction changes."}]`

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxTokens: 1000,
    })

    // Parse suggestions from the response
    const responseText = result.text.trim()
    let suggestions: Array<{ text: string; justification: string }> = []

    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(responseText)
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .filter((item) => item && typeof item.text === 'string')
          .map((item) => ({
            text: item.text,
            justification: typeof item.justification === 'string' ? item.justification : 'No justification provided.',
          }))
      } else if (parsed && typeof parsed.text === 'string') {
        // Single object instead of array
        suggestions = [{
          text: parsed.text,
          justification: typeof parsed.justification === 'string' ? parsed.justification : 'No justification provided.',
        }]
      }
    } catch {
      // Fallback: parse as bulleted list (legacy format)
      const lines = responseText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => {
          if (!line) return false
          return /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)
        })
        .map((line) => {
          return line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim()
        })
        .filter((line) => line.length > 0)

      suggestions = lines.map((line) => ({
        text: line,
        justification: 'No justification provided.',
      }))
    }

    // If no suggestions parsed, use the full response as a single suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        text: responseText || 'No specific suggestions generated.',
        justification: 'No justification provided.',
      })
    }

    // Store review result in database
    try {
      const { error: insertError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          ticket_id: ticket.id,
          suggestions: suggestions,
          status: 'success',
          error_message: null,
        })

      if (insertError) {
        console.error('Failed to store process review result:', insertError)
        // Non-blocking: continue even if storage fails
      }
    } catch (storageErr) {
      console.error('Error storing process review result:', storageErr)
      // Non-blocking: continue even if storage fails
    }

    json(res, 200, {
      success: true,
      suggestions,
    })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      // Try to store failed review result in database (if we have ticket info)
      // Note: body may not be defined if error occurred before readJsonBody
      let storedError = false
      if (ticketPk || ticketId) {
        try {
          let body: unknown
          try {
            body = await readJsonBody(req)
          } catch {
            // If we can't read body, use env vars only
            body = {}
          }

          const supabaseUrl =
            (typeof (body as { supabaseUrl?: string })?.supabaseUrl === 'string' ? (body as { supabaseUrl: string }).supabaseUrl.trim() : undefined) ||
            process.env.SUPABASE_URL?.trim() ||
            process.env.VITE_SUPABASE_URL?.trim() ||
            undefined
          const supabaseAnonKey =
            (typeof (body as { supabaseAnonKey?: string })?.supabaseAnonKey === 'string' ? (body as { supabaseAnonKey: string }).supabaseAnonKey.trim() : undefined) ||
            process.env.SUPABASE_ANON_KEY?.trim() ||
            process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
            undefined

          if (supabaseUrl && supabaseAnonKey) {
            const supabase = createClient(supabaseUrl, supabaseAnonKey)
            const ticketQuery = ticketPk
              ? await supabase.from('tickets').select('pk, id').eq('pk', ticketPk).maybeSingle()
              : await supabase.from('tickets').select('pk, id').eq('id', ticketId!).maybeSingle()

            if (ticketQuery.data) {
              await supabase
                .from('process_reviews')
                .insert({
                  ticket_pk: ticketQuery.data.pk,
                  ticket_id: ticketQuery.data.id,
                  suggestions: [],
                  status: 'failed',
                  error_message: errorMsg,
                })
              storedError = true
            }
          }
        } catch (storageErr) {
          // Non-blocking: ignore storage errors in error handler
          console.error('Error storing failed process review result:', storageErr)
        }
      }

      json(res, 500, {
        success: false,
        error: errorMsg,
      })
    }
  }
}
