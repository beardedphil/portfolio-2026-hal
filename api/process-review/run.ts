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
      const errorMsg = `Failed to fetch artifacts: ${artifactsError.message}`
      
      // Store the error in database
      const { error: storeError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          repo_full_name: ticket.repo_full_name,
          suggestions: [],
          status: 'failed',
          error_message: errorMsg,
        })
      
      if (storeError) {
        console.error('Failed to store process review error:', storeError)
      }
      
      json(res, 200, {
        success: false,
        error: errorMsg,
      })
      return
    }

    if (!artifacts || artifacts.length === 0) {
      const noArtifactsSuggestion = [{
        text: 'No artifacts found for this ticket. Process review requires artifacts to analyze.',
        justification: '',
      }]
      
      // Store the result even when no artifacts found
      const { error: storeError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          repo_full_name: ticket.repo_full_name,
          suggestions: noArtifactsSuggestion,
          status: 'completed',
        })
      
      if (storeError) {
        console.error('Failed to store process review results:', storeError)
      }
      
      json(res, 200, {
        success: true,
        suggestions: noArtifactsSuggestion,
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
      
      // Store the error in database
      const { error: storeError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          repo_full_name: ticket.repo_full_name,
          suggestions: [],
          status: 'failed',
          error_message: errorMsg,
        })
      
      if (storeError) {
        console.error('Failed to store process review error:', storeError)
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

Format your response as a JSON array of objects, where each object has:
- "text": the suggestion text (specific and actionable)
- "justification": a brief explanation of why this improvement would help (1-2 sentences)

Example format:
[
  {
    "text": "Add a rule requiring agents to verify file paths exist before attempting to read them",
    "justification": "This would prevent file-not-found errors that occurred in this ticket when the agent tried to read a non-existent file."
  },
  {
    "text": "Update the ticket template to include a 'Dependencies' section",
    "justification": "This ticket had implicit dependencies that weren't documented, leading to confusion about prerequisites."
  }
]

Provide 3-5 suggestions. If no meaningful improvements are apparent, return an empty array [].`

    let suggestions: Array<{ text: string; justification: string }> = []
    
    try {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        prompt,
        maxTokens: 1500,
      })

      // Parse suggestions from JSON response
      const responseText = result.text.trim()
      
      try {
        // Try to parse as JSON first
        const jsonMatch = responseText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) {
            suggestions = parsed.map((item) => ({
              text: typeof item.text === 'string' ? item.text : String(item.text || ''),
              justification: typeof item.justification === 'string' ? item.justification : String(item.justification || ''),
            }))
          }
        }
      } catch (parseError) {
        // Fallback: parse as bullet list (legacy format)
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
        
        suggestions = lines.map((text) => ({
          text,
          justification: '',
        }))
      }

      // If no suggestions parsed, use the full response as a single suggestion
      if (suggestions.length === 0) {
        suggestions.push({
          text: responseText || 'No specific suggestions generated.',
          justification: '',
        })
      }

      // Store results in database
      const { error: storeError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          repo_full_name: ticket.repo_full_name,
          suggestions: suggestions,
          status: 'completed',
        })

      if (storeError) {
        console.error('Failed to store process review results:', storeError)
        // Continue anyway - results are still returned to the client
      }
    } catch (llmError) {
      const errorMsg = llmError instanceof Error ? llmError.message : String(llmError)
      
      // Store the error in database
      const { error: storeError } = await supabase
        .from('process_reviews')
        .insert({
          ticket_pk: ticket.pk,
          repo_full_name: ticket.repo_full_name,
          suggestions: [],
          status: 'failed',
          error_message: errorMsg,
        })
      
      if (storeError) {
        console.error('Failed to store process review error:', storeError)
      }
      
      json(res, 200, {
        success: false,
        error: errorMsg,
      })
      return
    }

    json(res, 200, {
      success: true,
      suggestions,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    json(res, 500, {
      success: false,
      error: errorMessage,
    })
  }
}
